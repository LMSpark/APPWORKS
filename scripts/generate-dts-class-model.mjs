#!/usr/bin/env node
// 一气呵成生成 DTS ClassModel 产物：
// 1. TypeScript + Volar 在内存中生成 .d.ts
// 2. 每个声明投影按原生源路径生成 .ts.json / .vue.json shard（guide SSOT，生产 guide + script 共用）
// 3. 写入 generated/dts-class-model/manifest.json
// 4. 写入缺 JSDoc 语义补充报告 semantic-gaps.json
// 5. 默认全量：每次重建 DTS ClassModel bundle；需要临时增量时显式传 --incremental

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

import { buildDtsClassModelBundle } from '../packages/spark-ai/src/class-model/class-model/bundle/build-dts-class-model-bundle.ts'
import {
  CLASS_MODEL_EMIT_PREFIX,
  CLASS_MODEL_EMIT_TSCONFIG,
  isClassModelEmitPath,
  normalizeBundleManifestSourcePathSet,
  readManifestFileEntry,
  resolveClassModelEmitPath,
  sourceFileFromEmitPath,
  toClassModelEmitPath,
} from '../packages/spark-ai/src/class-model/class-model/bundle/class-model-emit-path.ts'
import {
  augmentIncrementalPlanWithConfigDrift,
  canSkipDeclarationEmit,
  finalizeBundleWithoutProjection,
  planIncrementalBundleBuild,
  readDtsManifestSnapshot,
  removeObsoleteBundleShards,
  resolveEmitSourcePathsForIncrementalPlan,
  writeDtsManifestSnapshot,
} from './lib/class-model-incremental-build.mjs'
import { buildDebugBreak } from './lib/build-debug.mjs'

const require = createRequire(import.meta.url)
const vueTscRequire = createRequire(require.resolve('vue-tsc'))

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const outputDir = resolve(repoRoot, 'generated/dts-class-model')
const dtsManifestPath = resolve(outputDir, '.dts-manifest.json')
const cliOptions = parseCliOptions(process.argv.slice(2))
const checkDiagnostics = cliOptions.checkDiagnostics
const emitBackend = cliOptions.emitBackend
const targetedBuildRequested = cliOptions.models.length > 0 || cliOptions.sources.length > 0
const targetedSeed = targetedBuildRequested
  ? readTargetedBuildSeed({
      repoRoot,
      outputDir,
      models: cliOptions.models,
      sources: cliOptions.sources,
    })
  : undefined
const timings = createTimings()

buildDebugBreak('class-model-generate:start', {
  emitBackend,
  targetedBuildRequested,
  forceFullRebuild: cliOptions.forceFullRebuild,
})

const classModelEmitConfigPath = resolve(repoRoot, CLASS_MODEL_EMIT_TSCONFIG)
const existingManifestPath = resolve(outputDir, 'manifest.json')
const existingSemanticJsonPath = resolve(outputDir, 'semantic-gaps.json')
const existingManifest = existsSync(existingManifestPath) ? readJsonFile(existingManifestPath) : undefined
const existingSemanticReport = existsSync(existingSemanticJsonPath) ? readJsonFile(existingSemanticJsonPath) : undefined
const existingDtsManifest = readDtsManifestSnapshot(dtsManifestPath)

const emitSourcePathsFromConfig = listClassModelEmitSourcePathsFromConfig({
  repoRoot,
  configPath: classModelEmitConfigPath,
})
const emitSourcePathsForPrePlan = resolveEmitSourcePathsForIncrementalPlan({
  configEmitSourcePaths: emitSourcePathsFromConfig,
  existingManifest,
})
const preEmitIncrementalPlan = targetedBuildRequested || cliOptions.forceFullRebuild
  ? undefined
  : augmentIncrementalPlanWithConfigDrift(
      planIncrementalBundleBuild({
        repoRoot,
        outputDir,
        emitSourcePaths: emitSourcePathsForPrePlan,
        dtsFiles: emitSourcePathsForPrePlan.map(sourcePath => resolve(repoRoot, sourcePath)),
        existingManifest,
        existingDtsManifest,
        forceFullRebuild: false,
        resolveProgramRootFiles: () => [],
      }),
      {
        repoRoot,
        configEmitSourcePaths: emitSourcePathsFromConfig,
        existingManifest,
        existingDtsManifest,
        resolveProgramRootFiles: changedSourcePaths => collectDtsDependencyClosure({
          repoRoot,
          dtsFiles: changedSourcePaths.map(sourcePath => resolve(repoRoot, sourcePath)),
          compilerHost: undefined,
          targetSourcePaths: changedSourcePaths,
        }),
      },
    )
const skipDeclarationEmit = canSkipDeclarationEmit(preEmitIncrementalPlan)
if (preEmitIncrementalPlan !== undefined) {
  console.log([
    'Pre-emit incremental plan:',
    `mode=${preEmitIncrementalPlan.mode}`,
    `unchanged=${String(preEmitIncrementalPlan.unchangedSourcePaths.size)}`,
    `changed=${String(preEmitIncrementalPlan.changedSourcePaths.size)}`,
    `newConfig=${String(preEmitIncrementalPlan.newConfigSourcePaths?.size ?? 0)}`,
    `removed=${String(preEmitIncrementalPlan.removedSourcePaths.size)}`,
    `skipEmit=${String(skipDeclarationEmit)}`,
  ].join(' '))
  if (cliOptions.planOnly) {
    if (preEmitIncrementalPlan.changedSourcePaths.size > 0) {
      console.log(`Changed: ${[...preEmitIncrementalPlan.changedSourcePaths].join(', ')}`)
    }
    if ((preEmitIncrementalPlan.newConfigSourcePaths?.size ?? 0) > 0) {
      console.log(`New config only: ${[...preEmitIncrementalPlan.newConfigSourcePaths].join(', ')}`)
    }
    if (preEmitIncrementalPlan.removedSourcePaths.size > 0) {
      console.log(`Removed: ${[...preEmitIncrementalPlan.removedSourcePaths].join(', ')}`)
    }
    process.exit(0)
  }
}

let dtsFiles
let declarationCompilerHost
let declarationEmit

if (skipDeclarationEmit) {
  console.log('Skipping declaration emit; all ClassModel shards match source mtime.')
  declarationEmit = { files: new Map(), emitSkipped: true }
  dtsFiles = []
  declarationCompilerHost = undefined
} else {
  console.log(targetedSeed === undefined
    ? `Emitting ClassModel surface in memory (${emitBackend})...`
    : `Emitting targeted ClassModel surface in memory (${emitBackend}): ${targetedSeed.sourceFiles.map(fileName => relative(repoRoot, fileName)).join(', ')}`)
  declarationEmit = emitDeclarationsToMemory({
    repoRoot,
    configPath: classModelEmitConfigPath,
    checkDiagnostics,
    backend: emitBackend,
    ...(targetedSeed === undefined ? {} : { sourceRootFiles: targetedSeed.sourceFiles }),
    onEvent: event => {
      const line = renderDeclarationEmitEvent(event)
      if (line.length > 0) console.log(line)
    },
  })
  dtsFiles = [...declarationEmit.files.keys()].sort((left, right) => left.localeCompare(right))
  declarationCompilerHost = createInMemoryDeclarationCompilerHost(declarationEmit.files)

  if (dtsFiles.length === 0) {
    throw new Error('No in-memory ClassModel emit outputs were produced.')
  }
}
console.log(`Collected DTS files: ${String(dtsFiles.length)}`)
buildDebugBreak('class-model-generate:after-memory-emit', {
  dtsFileCount: dtsFiles.length,
  emitSkipped: declarationEmit.emitSkipped === true,
})

const targetedBuild = targetedBuildRequested
  ? prepareTargetedBuild({
      repoRoot,
      outputDir,
      dtsFiles,
      compilerHost: declarationCompilerHost,
      models: cliOptions.models,
      sources: cliOptions.sources,
      seed: targetedSeed,
      useEmittedDtsClosure: targetedSeed !== undefined,
    })
  : undefined
const emitSourcePaths = skipDeclarationEmit
  ? emitSourcePathsFromConfig
  : dtsFiles.map(fileName => normalizeRepoPath(fileName, repoRoot))

const incrementalPlan = skipDeclarationEmit
  ? preEmitIncrementalPlan
  : targetedBuild === undefined
    ? planIncrementalBundleBuild({
        repoRoot,
        outputDir,
        emitSourcePaths,
        dtsFiles,
        compilerHost: declarationCompilerHost,
        existingManifest,
        existingDtsManifest,
        forceFullRebuild: cliOptions.forceFullRebuild,
        resolveProgramRootFiles: changedSourcePaths => collectDtsDependencyClosure({
          repoRoot,
          dtsFiles,
          compilerHost: declarationCompilerHost,
          targetSourcePaths: changedSourcePaths,
        }),
      })
    : undefined
const buildRootFiles = targetedBuild?.rootFiles ?? incrementalPlan?.programRootFiles ?? dtsFiles
const buildOutputDir = targetedBuild?.tempOutputDir ?? outputDir
if (targetedBuild !== undefined) {
  console.log([
    'Targeted ClassModel compile:',
    targetedBuild.models.length === 0 ? undefined : `models=${targetedBuild.models.join(',')}`,
    targetedBuild.sources.length === 0 ? undefined : `sources=${targetedBuild.sources.join(',')}`,
    `root DTS=${String(targetedBuild.targetSourcePaths.length)}`,
    `closure DTS=${String(targetedBuild.rootFiles.length)}`,
  ].filter(Boolean).join(' '))
} else if (incrementalPlan?.mode === 'incremental') {
  console.log([
    'Incremental ClassModel compile:',
    `unchanged=${String(incrementalPlan.unchangedSourcePaths.size)}`,
    `changed=${String(incrementalPlan.changedSourcePaths.size)}`,
    `removed=${String(incrementalPlan.removedSourcePaths.size)}`,
    `program DTS=${String(buildRootFiles.length)}`,
  ].join(' '))
}

buildDebugBreak('class-model-generate:after-incremental-plan', {
  mode: incrementalPlan?.mode ?? (targetedBuild === undefined ? 'full' : 'targeted'),
  buildRootFileCount: buildRootFiles.length,
})

timings.mark('collect-dts')
if (targetedBuild !== undefined) {
  removeTreeSync(buildOutputDir)
  mkdirSync(outputDir, { recursive: true })
} else if (incrementalPlan?.mode === 'full') {
  removeTreeSync(outputDir)
  mkdirSync(outputDir, { recursive: true })
} else {
  mkdirSync(outputDir, { recursive: true })
  removeObsoleteBundleShards({
    outputDir,
    existingManifest,
    removedSourcePaths: incrementalPlan.removedSourcePaths,
  })
}
timings.mark('prepare-output')

let publishedResult
if (
  targetedBuild === undefined
  && incrementalPlan !== undefined
  && incrementalPlan.changedSourcePaths.size === 0
) {
  if (incrementalPlan.removedSourcePaths.size === 0) {
    console.log('No ClassModel shards need reprojection.')
    publishedResult = {
      manifest: existingManifest,
      manifestPath: existingManifestPath,
      semanticLogJsonPath: existingSemanticJsonPath,
      semanticGapCount: existingSemanticReport?.gapCount ?? 0,
      fileCount: Object.keys(existingManifest?.files ?? {}).length,
      modelCount: countModelsInManifest(outputDir, existingManifest),
    }
  } else {
    console.log('No ClassModel shards need reprojection; refreshing manifest indexes only.')
    const finalized = finalizeBundleWithoutProjection({
      outputDir,
      existingManifest,
      existingSemanticReport,
      removedSourcePaths: incrementalPlan.removedSourcePaths,
      rebuildClassIndex: rebuildClassIndexFromBundleFiles,
      mergeSemanticGapReports,
      countModelsInManifest,
      sortRecord,
    })
    const manifestPath = existingManifestPath
    writeFileSync(manifestPath, `${JSON.stringify(finalized.manifest, null, 2)}\n`, 'utf8')
    writeFileSync(existingSemanticJsonPath, `${JSON.stringify(finalized.semanticReport, null, 2)}\n`, 'utf8')
    publishedResult = {
      manifest: finalized.manifest,
      manifestPath,
      semanticLogJsonPath: existingSemanticJsonPath,
      semanticGapCount: finalized.semanticGapCount,
      fileCount: finalized.fileCount,
      modelCount: finalized.modelCount,
    }
  }
} else {
  console.log('Building DTS ClassModel bundle...')
  buildDebugBreak('class-model-generate:before-build-bundle', {
    buildRootFileCount: buildRootFiles.length,
    outputDir: buildOutputDir,
  })
  const result = buildDtsClassModelBundle({
    repoRoot,
    rootFiles: buildRootFiles,
    outputDir: buildOutputDir,
    ...(declarationCompilerHost === undefined ? {} : { compilerHost: declarationCompilerHost }),
    exportedOnly: false,
    progressInterval: 50,
    ...(targetedBuild === undefined && incrementalPlan?.mode === 'incremental'
      ? {
          projectOnlySourcePaths: incrementalPlan.changedSourcePaths,
          knownProjectedClassNamesBySourcePath: incrementalPlan.knownClassNamesBySourcePath,
        }
      : {}),
    onProgress: event => {
      const line = renderProgress(event)
      if (line.length > 0) console.log(line)
    },
  })

  const expectedProjectedCount = targetedBuild === undefined && incrementalPlan !== undefined
    ? incrementalPlan.changedSourcePaths.size
    : buildRootFiles.length
  if (result.fileCount !== expectedProjectedCount) {
    throw new Error(`DTS JSON count mismatch: expected=${String(expectedProjectedCount)} json=${String(result.fileCount)}`)
  }
  publishedResult = targetedBuild === undefined && incrementalPlan?.mode === 'incremental'
    ? mergeChangedBundle({
        outputDir,
        existingManifest,
        existingSemanticReport,
        result,
        changedSourcePaths: incrementalPlan.changedSourcePaths,
      })
    : targetedBuild === undefined
      ? result
      : mergeTargetedBundle({
          repoRoot,
          outputDir,
          tempOutputDir: targetedBuild.tempOutputDir,
          result,
        })
}
if (targetedBuild !== undefined) {
  removeTreeSync(targetedBuild.tempOutputDir)
}
writeDtsManifestSnapshot({
  repoRoot,
  manifest: publishedResult.manifest,
  manifestPath: dtsManifestPath,
  writeFileSync,
})
removeTreeSync(resolve(outputDir, 'runtime'))
timings.mark('build-bundle')
buildDebugBreak('class-model-generate:complete', {
  fileCount: publishedResult.fileCount,
  modelCount: publishedResult.modelCount,
  semanticGapCount: publishedResult.semanticGapCount,
})

console.log(`DTS files: ${String(dtsFiles.length)}`)
if (targetedBuild !== undefined) {
  console.log(`Targeted per-file JSON: ${String(publishedResult.fileCount)}`)
}
console.log(`Wrote ${relative(repoRoot, publishedResult.manifestPath)}`)
console.log(`Per-file JSON: ${String(publishedResult.fileCount)}`)
console.log(`ClassModel symbols (incl. duplicates in files): ${String(publishedResult.modelCount)}`)
console.log(`classIndex entries: ${String(Object.keys(publishedResult.manifest.classIndex).length)}`)
console.log(`Semantic gaps: ${String(publishedResult.semanticGapCount)}`)
console.log(`Semantic gap JSON: ${relative(repoRoot, publishedResult.semanticLogJsonPath)}`)
if (publishedResult.manifest.duplicates !== undefined && publishedResult.manifest.duplicates.length > 0) {
  console.log(`Duplicate className skipped in classIndex: ${String(publishedResult.manifest.duplicates.length)}`)
}

timings.mark('cleanup')
console.log(renderTimings(timings))

function renderProgress(event) {
  if (event.phase === 'read-files') {
    return `Reading DTS source text for ${String(event.total ?? 0)} file(s)...`
  }
  if (event.phase === 'project-file') {
    return `Projected DTS file ${String(event.current ?? 0)}/${String(event.total ?? 0)}: ${event.sourcePath ?? ''}`
  }
  if (event.phase === 'write-semantic-gaps') {
    return 'Writing semantic gap logs...'
  }
  if (event.phase === 'write-manifest') {
    return 'Writing bundle manifest...'
  }
  if (event.phase === 'done') {
    return 'DTS ClassModel bundle complete.'
  }
  return ''
}

function renderDeclarationEmitEvent(event) {
  if (event.phase === 'timing') {
    return `  ${event.label}: ${formatSeconds(event.stepMs)}s (emit total ${formatSeconds(event.totalMs)}s)`
  }
  if (event.phase === 'vue-tsc-start') {
    return `Running vue-tsc with in-memory declaration write interception: ${relative(repoRoot, event.configPath)}`
  }
  if (event.phase === 'parse-config') {
    return `Parsing declaration tsconfig: ${relative(repoRoot, event.configPath)}`
  }
  if (event.phase === 'create-program') {
    return `Creating Vue-aware TypeScript Program: ${String(event.rootFileCount)} root file(s), ${String(event.vueFileCount)} Vue file(s).`
  }
  if (event.phase === 'program-ready') {
    return 'Vue-aware TypeScript Program ready.'
  }
  if (event.phase === 'diagnostics-start') {
    return 'Checking pre-emit diagnostics...'
  }
  if (event.phase === 'diagnostics-skipped') {
    return 'Skipping pre-emit diagnostics; emit diagnostics are still enforced.'
  }
  if (event.phase === 'diagnostics-done') {
    return `Pre-emit diagnostics passed: ${String(event.total)} diagnostic(s).`
  }
  if (event.phase === 'emit-start') {
    return 'Subscribing to declaration emit via writeFile callback...'
  }
  if (event.phase === 'emit-file' && shouldReportFileProgress(event.current, event.total, 50)) {
    return event.total === undefined
      ? `Captured declaration ${String(event.current)}: ${event.sourcePath}`
      : `Captured declaration ${String(event.current)}/${String(event.total)}: ${event.sourcePath}`
  }
  if (event.phase === 'emit-done') {
    return `Declaration emit complete: ${String(event.total)} in-memory DTS file(s).`
  }
  return ''
}

function shouldReportFileProgress(current, total, interval) {
  if (total === undefined) return true
  if (total === 0) return false
  if (current === total) return true
  if (interval <= 0) return false
  return current % interval === 0
}

function emitDeclarationsToMemory(options) {
  if (options.backend === 'vue-tsc') {
    return emitDeclarationsWithVueTscToMemory(options)
  }
  return emitDeclarationsWithCompilerApiToMemory(options)
}

function parseClassModelEmitProject(command) {
  const vueCore = require('@vue/language-core')
  const configPath = resolve(command.configPath)
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error !== undefined) {
    throw new Error(formatDiagnostics([configFile.error]))
  }

  const vueParsed = vueCore.createParsedCommandLine(ts, ts.sys, toPosixPath(configPath))
  const extraFileExtensions = vueCore.getAllExtensions(vueParsed.vueOptions).map(extension => ({
    extension,
    isMixedContent: true,
    scriptKind: ts.ScriptKind.Deferred,
  }))
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    command.repoRoot,
    undefined,
    configPath,
    undefined,
    extraFileExtensions,
  )
  if (parsed.errors.length > 0) {
    throw new Error(formatDiagnostics(parsed.errors))
  }

  const compilerOptions = {
    ...parsed.options,
    allowNonTsExtensions: true,
  }
  return { parsed, compilerOptions }
}

/** 从 tsconfig.class-model-emit.json 推导虚拟 emit 键，供 emit 前增量规划。 */
function listClassModelEmitSourcePathsFromConfig(command) {
  const { parsed } = parseClassModelEmitProject(command)
  const emitPaths = new Set()
  for (const absolutePath of parsed.fileNames) {
    const repoRelativePath = normalizeRepoPath(absolutePath, command.repoRoot)
    try {
      emitPaths.add(toClassModelEmitPath(repoRelativePath))
    } catch {
      // skip paths that cannot map to ClassModel emit virtual keys
    }
  }
  return [...emitPaths].sort((left, right) => left.localeCompare(right))
}

function emitDeclarationsWithVueTscToMemory(options) {
  if (options.sourceRootFiles !== undefined && options.sourceRootFiles.length > 0) {
    throw new Error('Targeted declaration emit supports --compiler-api-emit only; vue-tsc CLI interception has no per-source emit mode.')
  }
  const timings = createTimings()
  const configPath = resolve(options.configPath)
  const files = new Map()
  const nodeFs = require('node:fs')
  const fakeFdToPath = new Map()
  const fakeFdBuffers = new Map()
  let nextFakeFd = -1000
  const original = {
    argv: process.argv,
    exit: process.exit,
    openSync: nodeFs.openSync,
    writeSync: nodeFs.writeSync,
    closeSync: nodeFs.closeSync,
  }
  let exitCode = 0

  options.onEvent?.({ phase: 'vue-tsc-start', configPath })
  process.argv = [process.argv[0] ?? 'node', 'vue-tsc', '-p', configPath]
  process.exit = code => {
    exitCode = Number(code ?? 0)
    throw new Error(`process.exit(${String(exitCode)})`)
  }
  nodeFs.openSync = function openSyncPatched(fileName, flags) {
    if (isDeclarationOutput(fileName) && String(flags).includes('w')) {
      const fd = nextFakeFd--
      fakeFdToPath.set(fd, resolve(String(fileName)))
      fakeFdBuffers.set(fd, '')
      return fd
    }
    return Reflect.apply(original.openSync, this, arguments)
  }
  nodeFs.writeSync = function writeSyncPatched(fd, data, positionOrOffset, encodingOrLength) {
    if (fakeFdToPath.has(fd)) {
      const text = typeof data === 'string'
        ? data
        : Buffer.from(data).toString(typeof encodingOrLength === 'string' ? encodingOrLength : 'utf8')
      fakeFdBuffers.set(fd, `${fakeFdBuffers.get(fd) ?? ''}${text}`)
      return typeof data === 'string' ? data.length : data.byteLength
    }
    return Reflect.apply(original.writeSync, this, arguments)
  }
  nodeFs.closeSync = function closeSyncPatched(fd) {
    if (fakeFdToPath.has(fd)) {
      files.set(fakeFdToPath.get(fd), fakeFdBuffers.get(fd) ?? '')
      fakeFdToPath.delete(fd)
      fakeFdBuffers.delete(fd)
      return undefined
    }
    return Reflect.apply(original.closeSync, this, arguments)
  }

  try {
    require('vue-tsc').run()
  } catch (error) {
    if (!String(error?.message ?? '').startsWith('process.exit(')) throw error
  } finally {
    process.argv = original.argv
    process.exit = original.exit
    nodeFs.openSync = original.openSync
    nodeFs.writeSync = original.writeSync
    nodeFs.closeSync = original.closeSync
  }

  reportTiming(options, timings, 'vue-tsc-emit')
  if (exitCode !== 0) {
    throw new Error(`vue-tsc declaration emit failed with exit code ${String(exitCode)}`)
  }
  options.onEvent?.({ phase: 'emit-done', total: files.size, emitSkipped: false })
  return { files, emitSkipped: false }
}

function emitDeclarationsWithCompilerApiToMemory(options) {
  const timings = createTimings()
  const configPath = resolve(options.configPath)
  options.onEvent?.({ phase: 'parse-config', configPath })

  const { parsed, compilerOptions } = parseClassModelEmitProject({
    repoRoot: options.repoRoot,
    configPath,
  })
  reportTiming(options, timings, 'parse-config')

  const host = ts.createCompilerHost(compilerOptions, true)
  const files = new Map()
  const rootFileNames = options.sourceRootFiles?.map(fileName => resolve(fileName)) ?? parsed.fileNames

  const vueCore = require('@vue/language-core')
  const { proxyCreateProgram } = vueTscRequire('@volar/typescript/lib/node/proxyCreateProgram')
  const vueCreateProgram = proxyCreateProgram(ts, ts.createProgram, (tsObject, createProgramOptions) => {
    const vueOptions = vueCore.createParsedCommandLine(tsObject, tsObject.sys, toPosixPath(configPath)).vueOptions
    return {
      languagePlugins: [
        vueCore.createVueLanguagePlugin(tsObject, createProgramOptions.options, vueOptions, id => id),
      ],
    }
  })

  options.onEvent?.({
    phase: 'create-program',
    rootFileCount: rootFileNames.length,
    vueFileCount: rootFileNames.filter(fileName => fileName.endsWith('.vue')).length,
  })
  const program = vueCreateProgram({
    rootNames: rootFileNames,
    options: compilerOptions,
    host,
    ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
  })
  options.onEvent?.({ phase: 'program-ready' })
  reportTiming(options, timings, 'create-vue-program')

  if (options.checkDiagnostics === true) {
    options.onEvent?.({ phase: 'diagnostics-start' })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    if (diagnostics.length > 0) {
      throw new Error(formatDiagnostics(diagnostics))
    }
    options.onEvent?.({ phase: 'diagnostics-done', total: diagnostics.length })
    reportTiming(options, timings, 'pre-emit-diagnostics')
  } else {
    options.onEvent?.({ phase: 'diagnostics-skipped' })
  }

  options.onEvent?.({ phase: 'emit-start' })
  const writeFile = (fileName, text) => {
    if (!isDeclarationOutput(fileName)) return
    const absolutePath = resolve(fileName)
    files.set(absolutePath, text)
    options.onEvent?.({
      phase: 'emit-file',
      current: files.size,
      ...(options.sourceRootFiles === undefined ? { total: parsed.fileNames.length } : {}),
      sourcePath: toPosixPath(relative(options.repoRoot, absolutePath)),
    })
  }
  const emitResult = program.emit(undefined, writeFile, undefined, true)
  if (emitResult.diagnostics.length > 0) {
    throw new Error(formatDiagnostics(emitResult.diagnostics))
  }
  reportTiming(options, timings, 'emit-declarations')
  options.onEvent?.({ phase: 'emit-done', total: files.size, emitSkipped: emitResult.emitSkipped })
  return { files, emitSkipped: emitResult.emitSkipped }
}

function createInMemoryDeclarationCompilerHost(files) {
  const compilerOptions = {
    allowJs: false,
    declaration: true,
    emitDeclarationOnly: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  }
  const host = ts.createCompilerHost(compilerOptions, true)
  const originalFileExists = host.fileExists.bind(host)
  const originalReadFile = host.readFile.bind(host)
  const originalGetSourceFile = host.getSourceFile.bind(host)
  const fileByKey = new Map([...files.entries()].map(([fileName, text]) => [
    normalizeSourceFileKey(fileName),
    { fileName: resolve(fileName), text },
  ]))

  host.fileExists = fileName => fileByKey.has(normalizeSourceFileKey(fileName)) || originalFileExists(fileName)
  host.readFile = fileName => fileByKey.get(normalizeSourceFileKey(fileName))?.text ?? originalReadFile(fileName)
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const inMemoryFile = fileByKey.get(normalizeSourceFileKey(fileName))
    if (inMemoryFile !== undefined) {
      return ts.createSourceFile(
        inMemoryFile.fileName,
        inMemoryFile.text,
        languageVersionOrOptions,
        true,
        ts.ScriptKind.TS,
      )
    }
    return originalGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile)
  }

  return host
}

function removeTreeSync(targetPath) {
  if (!existsSync(targetPath)) return
  rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

function parseCliOptions(args) {
  const models = []
  const sources = []
  let emitBackend = 'compiler-api'
  let checkDiagnostics = false
let forceFullRebuild = true
  let planOnly = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--check-diagnostics') {
      checkDiagnostics = true
      continue
    }
    if (arg === '--full') {
      forceFullRebuild = true
      continue
    }
    if (arg === '--incremental') {
      forceFullRebuild = false
      continue
    }
    if (arg === '--plan-only') {
      planOnly = true
      continue
    }
    if (arg === '--vue-tsc-emit') {
      emitBackend = 'vue-tsc'
      continue
    }
    if (arg === '--compiler-api-emit') {
      emitBackend = 'compiler-api'
      continue
    }
    if (arg.startsWith('--emit-backend=')) {
      emitBackend = readEmitBackendValue(arg.slice('--emit-backend='.length))
      continue
    }
    if (arg === '--model' || arg === '--target-model') {
      const value = readRequiredArgValue(args, index, arg)
      models.push(...splitCsvArg(value))
      index += 1
      continue
    }
    if (arg.startsWith('--model=')) {
      models.push(...splitCsvArg(arg.slice('--model='.length)))
      continue
    }
    if (arg.startsWith('--target-model=')) {
      models.push(...splitCsvArg(arg.slice('--target-model='.length)))
      continue
    }
    if (arg === '--models') {
      const value = readRequiredArgValue(args, index, arg)
      models.push(...splitCsvArg(value))
      index += 1
      continue
    }
    if (arg.startsWith('--models=')) {
      models.push(...splitCsvArg(arg.slice('--models='.length)))
      continue
    }
    if (arg === '--source' || arg === '--file' || arg === '--target-source') {
      const value = readRequiredArgValue(args, index, arg)
      sources.push(...splitCsvArg(value))
      index += 1
      continue
    }
    if (arg.startsWith('--source=')) {
      sources.push(...splitCsvArg(arg.slice('--source='.length)))
      continue
    }
    if (arg.startsWith('--file=')) {
      sources.push(...splitCsvArg(arg.slice('--file='.length)))
      continue
    }
    if (arg.startsWith('--target-source=')) {
      sources.push(...splitCsvArg(arg.slice('--target-source='.length)))
      continue
    }
  }

  return {
    checkDiagnostics,
    emitBackend: readEmitBackendValue(emitBackend),
    forceFullRebuild,
    planOnly,
    models: uniqueStrings(models),
    sources: uniqueStrings(sources),
  }
}

function readRequiredArgValue(args, index, flag) {
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

function splitCsvArg(value) {
  return String(value)
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0)
}

function readEmitBackendValue(value) {
  if (value === 'vue-tsc' || value === 'compiler-api') return value
  throw new Error(`Unsupported --emit-backend value: ${value}`)
}

function prepareTargetedBuild(options) {
  const existingManifestPath = resolve(options.outputDir, 'manifest.json')
  if (!existsSync(existingManifestPath)) {
    throw new Error('Targeted ClassModel compile requires an existing generated/dts-class-model/manifest.json. Run a full generate once first.')
  }

  const existingManifest = readJsonFile(existingManifestPath)
  const dtsFileBySourcePath = createDtsFileBySourcePath(options.dtsFiles, options.repoRoot)
  const targetSourcePaths = new Set(options.seed?.targetSourcePaths ?? [])

  for (const modelName of options.models) {
    const manifestEntry = existingManifest.classIndex?.[modelName]
    const manifestEmitSourcePath = manifestEntry === undefined ? undefined : resolveClassModelEmitPath(manifestEntry.sourcePath)
    if (manifestEmitSourcePath !== undefined && dtsFileBySourcePath.has(manifestEmitSourcePath)) {
      targetSourcePaths.add(manifestEmitSourcePath)
      continue
    }

    const matches = findDtsSourcePathsBySymbolName({
      repoRoot: options.repoRoot,
      dtsFileBySourcePath,
      compilerHost: options.compilerHost,
      symbolName: modelName,
    })
    if (matches.length === 0) {
      throw new Error(`ClassModel target not found: ${modelName}`)
    }
    if (matches.length > 1) {
      throw new Error([
        `ClassModel target is ambiguous: ${modelName}`,
        ...matches.map(sourcePath => `- ${sourcePath}`),
        'Use --source to choose the declaration source explicitly.',
      ].join('\n'))
    }
    targetSourcePaths.add(matches[0])
  }

  for (const sourceInput of options.sources) {
    const sourcePath = normalizeDtsSourcePathInput(sourceInput, options.repoRoot)
    if (!dtsFileBySourcePath.has(sourcePath)) {
      throw new Error(`Target DTS source was not emitted: ${sourcePath}`)
    }
    targetSourcePaths.add(sourcePath)
  }

  if (targetSourcePaths.size === 0) {
    throw new Error('Targeted ClassModel compile requires at least one --model or --source value.')
  }

  const rootFiles = options.useEmittedDtsClosure === true
    ? options.dtsFiles
    : collectDtsDependencyClosure({
        repoRoot: options.repoRoot,
        dtsFiles: options.dtsFiles,
        compilerHost: options.compilerHost,
        targetSourcePaths: [...targetSourcePaths],
      })
  if (rootFiles.length === 0) {
    throw new Error('Targeted ClassModel compile resolved an empty DTS dependency closure.')
  }

  return {
    models: options.models,
    sources: options.sources,
    targetSourcePaths: [...targetSourcePaths],
    rootFiles,
    tempOutputDir: mkdtempSync(resolve(tmpdir(), 'spark-dts-class-model-target-')),
  }
}

function readTargetedBuildSeed(options) {
  const existingManifestPath = resolve(options.outputDir, 'manifest.json')
  if (!existsSync(existingManifestPath)) {
    throw new Error('Targeted ClassModel compile requires an existing generated/dts-class-model/manifest.json. Run a full generate once first.')
  }

  const existingManifest = readJsonFile(existingManifestPath)
  const targetSourcePaths = new Set()

  for (const modelName of options.models) {
    const manifestEntry = existingManifest.classIndex?.[modelName]
    if (manifestEntry === undefined) {
      throw new Error(`ClassModel target is not in the existing manifest: ${modelName}. Use --source for a new model, or run a full generate once.`)
    }
    targetSourcePaths.add(resolveClassModelEmitPath(manifestEntry.sourcePath))
  }

  for (const sourceInput of options.sources) {
    targetSourcePaths.add(normalizeDtsSourcePathInput(sourceInput, options.repoRoot))
  }

  const sourceFiles = []
  for (const sourcePath of targetSourcePaths) {
    const manifestFile = readManifestFileEntry(existingManifest, sourcePath)
    const sourceFile = resolveSourceFileForDtsSourcePath({
      repoRoot: options.repoRoot,
      sourcePath,
      manifestSourceFile: manifestFile?.module?.sourceFile,
    })
    sourceFiles.push(sourceFile)
  }

  return {
    targetSourcePaths: [...targetSourcePaths],
    sourceFiles: uniqueStrings(sourceFiles),
  }
}

function resolveSourceFileForDtsSourcePath(command) {
  const candidates = []
  if (typeof command.manifestSourceFile === 'string' && command.manifestSourceFile.length > 0) {
    candidates.push(resolve(command.repoRoot, command.manifestSourceFile))
  }
  const sourcePath = String(command.sourcePath).replace(/\\/g, '/')
  candidates.push(resolve(command.repoRoot, sourceFileFromEmitPath(sourcePath)))
  if (isClassModelEmitPath(sourcePath) && sourcePath.endsWith('.d.ts')) {
    const withoutSuffix = sourcePath.endsWith('.vue.d.ts')
      ? sourcePath.slice(CLASS_MODEL_EMIT_PREFIX.length, -'.d.ts'.length)
      : sourcePath.slice(CLASS_MODEL_EMIT_PREFIX.length, -'.d.ts'.length)
    candidates.push(resolve(command.repoRoot, withoutSuffix))
    candidates.push(resolve(command.repoRoot, `${withoutSuffix}.ts`))
    candidates.push(resolve(command.repoRoot, `${withoutSuffix}.tsx`))
    candidates.push(resolve(command.repoRoot, `${withoutSuffix}.mts`))
    candidates.push(resolve(command.repoRoot, `${withoutSuffix}.cts`))
  }
  const found = candidates.find(candidate => existsSync(candidate))
  if (found !== undefined) return found
  throw new Error([
    `Cannot resolve source file for DTS target: ${command.sourcePath}`,
    ...candidates.map(candidate => `- tried ${relative(command.repoRoot, candidate)}`),
  ].join('\n'))
}

function createDtsFileBySourcePath(dtsFiles, repoRoot) {
  return new Map(dtsFiles.map(fileName => [normalizeRepoPath(fileName, repoRoot), resolve(fileName)]))
}

function normalizeDtsSourcePathInput(input, repoRoot) {
  const raw = String(input).trim()
  if (raw.length === 0) throw new Error('Empty --source value.')

  let normalized = raw.replace(/\\/g, '/')
  normalized = normalized.replace(/^.*?generated\/dts-class-model\/runtime\/files\//u, '')
  normalized = normalized.replace(/^.*?generated\/dts-class-model\/files\//u, '')
  normalized = normalized.replace(/^generated\/dts-class-model\/runtime\/files\//u, '')
  normalized = normalized.replace(/^generated\/dts-class-model\/files\//u, '')
  normalized = normalized.replace(/^runtime\/files\//u, '')
  normalized = normalized.replace(/^files\//u, '')
  if (normalized.endsWith('.json')) normalized = normalized.slice(0, -'.json'.length)
  if (isClassModelEmitPath(normalized)) return normalized
  try {
    return toClassModelEmitPath(normalized)
  } catch {
    // Absolute paths and non-source spellings fall through to repo-relative normalization.
  }

  const absolutePath = isAbsolute(raw) ? resolve(raw) : resolve(repoRoot, raw)
  const repoPath = normalizeRepoPath(absolutePath, repoRoot)
  if (isClassModelEmitPath(repoPath)) return repoPath
  return toClassModelEmitPath(repoPath)
}

function collectDtsDependencyClosure(options) {
  const dtsFileBySourcePath = createDtsFileBySourcePath(options.dtsFiles, options.repoRoot)
  const rootNames = options.targetSourcePaths.map(sourcePath => {
    const fileName = dtsFileBySourcePath.get(sourcePath)
    if (fileName === undefined) throw new Error(`Missing target DTS file: ${sourcePath}`)
    return fileName
  })
  const compilerOptions = createDtsCompilerOptions()
  const host = options.compilerHost ?? ts.createCompilerHost(compilerOptions, true)
  const program = ts.createProgram({
    rootNames,
    options: compilerOptions,
    host,
  })
  const closureSourcePaths = new Set()
  for (const sourceFile of program.getSourceFiles()) {
    const sourcePath = normalizeRepoPath(sourceFile.fileName, options.repoRoot)
    if (dtsFileBySourcePath.has(sourcePath)) closureSourcePaths.add(sourcePath)
  }
  return options.dtsFiles.filter(fileName => closureSourcePaths.has(normalizeRepoPath(fileName, options.repoRoot)))
}

function findDtsSourcePathsBySymbolName(options) {
  const matches = []
  for (const [sourcePath, fileName] of options.dtsFileBySourcePath.entries()) {
    const text = readDtsText(fileName, options.compilerHost)
    if (dtsTextDeclaresSymbol(text, fileName, options.symbolName)) matches.push(sourcePath)
  }
  return matches.sort((left, right) => left.localeCompare(right))
}

function readDtsText(fileName, compilerHost) {
  const text = compilerHost?.readFile(fileName)
  if (text !== undefined) return text
  return readFileSync(fileName, 'utf8')
}

function dtsTextDeclaresSymbol(text, fileName, symbolName) {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let found = false
  const visit = node => {
    if (found) return
    if (declaresNamedSymbol(node, symbolName)) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function declaresNamedSymbol(node, symbolName) {
  if (
    ts.isClassDeclaration(node)
    || ts.isInterfaceDeclaration(node)
    || ts.isTypeAliasDeclaration(node)
    || ts.isEnumDeclaration(node)
  ) {
    return node.name?.text === symbolName
  }
  return false
}

function mergeChangedBundle(command) {
  const existingManifestPath = resolve(command.outputDir, 'manifest.json')
  const existingSemanticJsonPath = resolve(command.outputDir, 'semantic-gaps.json')
  const targetSourcePaths = normalizeBundleManifestSourcePathSet(command.changedSourcePaths)
  const mergedManifest = mergeBundleManifest({
    outputDir: command.outputDir,
    existingManifest: command.existingManifest,
    targetManifest: command.result.manifest,
    targetSourcePaths,
  })
  writeFileSync(existingManifestPath, `${JSON.stringify(mergedManifest, null, 2)}\n`, 'utf8')
  assertMergedBundleFilesExist(command.outputDir, mergedManifest.files)

  const semanticReport = mergeSemanticGapReports({
    existing: command.existingSemanticReport,
    target: readJsonFile(command.result.semanticLogJsonPath),
    targetSourcePaths,
  })
  const semanticLogJsonPath = resolve(command.outputDir, 'semantic-gaps.json')
  writeFileSync(semanticLogJsonPath, `${JSON.stringify(semanticReport, null, 2)}\n`, 'utf8')

  return {
    manifest: mergedManifest,
    manifestPath: existingManifestPath,
    semanticLogJsonPath,
    semanticGapCount: semanticReport.gapCount,
    fileCount: Object.keys(mergedManifest.files).length,
    modelCount: countModelsInManifest(command.outputDir, mergedManifest),
  }
}

function mergeTargetedBundle(command) {
  const existingManifestPath = resolve(command.outputDir, 'manifest.json')
  const existingSemanticJsonPath = resolve(command.outputDir, 'semantic-gaps.json')
  const existingManifest = readJsonFile(existingManifestPath)
  const existingSemanticReport = existsSync(existingSemanticJsonPath)
    ? readJsonFile(existingSemanticJsonPath)
    : undefined
  const targetManifest = command.result.manifest
  const targetSourcePaths = new Set(Object.keys(targetManifest.files))

  for (const entry of Object.values(targetManifest.files)) {
    copyBundleFile(command.tempOutputDir, command.outputDir, entry.file)
  }

  const mergedManifest = mergeBundleManifest({
    outputDir: command.outputDir,
    existingManifest,
    targetManifest,
    targetSourcePaths,
  })
  writeFileSync(existingManifestPath, `${JSON.stringify(mergedManifest, null, 2)}\n`, 'utf8')
  assertMergedBundleFilesExist(command.outputDir, mergedManifest.files)

  const semanticReport = mergeSemanticGapReports({
    existing: existingSemanticReport,
    target: readJsonFile(command.result.semanticLogJsonPath),
    targetSourcePaths,
  })
  const semanticLogJsonPath = resolve(command.outputDir, 'semantic-gaps.json')
  writeFileSync(semanticLogJsonPath, `${JSON.stringify(semanticReport, null, 2)}\n`, 'utf8')

  return {
    manifest: mergedManifest,
    manifestPath: existingManifestPath,
    semanticLogJsonPath,
    semanticGapCount: semanticReport.gapCount,
    fileCount: Object.keys(mergedManifest.files).length,
    modelCount: countModelsInManifest(command.outputDir, mergedManifest),
  }
}

function mergeBundleManifest(command) {
  const targetSourcePaths = normalizeBundleManifestSourcePathSet(command.targetSourcePaths)
  const files = {}
  for (const [sourcePath, entry] of Object.entries(command.existingManifest.files ?? {})) {
    if (!targetSourcePaths.has(sourceFileFromEmitPath(sourcePath))) files[sourcePath] = entry
  }
  Object.assign(files, command.targetManifest.files)
  const rebuiltIndex = rebuildClassIndexFromBundleFiles(command.outputDir, files)

  return {
    ...command.existingManifest,
    scannedFileCount: Object.keys(files).length,
    files: sortRecord(files),
    classIndex: sortRecord(rebuiltIndex.classIndex),
    ...(rebuiltIndex.duplicates.length === 0 ? {} : { duplicates: rebuiltIndex.duplicates }),
  }
}

function rebuildClassIndexFromBundleFiles(outputDir, files) {
  const classIndex = {}
  const duplicates = []
  const entries = Object.entries(files).sort(([left], [right]) => left.localeCompare(right))
  for (const [sourcePath, entry] of entries) {
    const shard = readJsonFile(resolve(outputDir, entry.file))
    for (const className of shard.module?.symbols ?? []) {
      const existing = classIndex[className]
      if (existing !== undefined) {
        duplicates.push({
          className,
          keptFile: existing.sourcePath,
          skippedFile: sourcePath,
        })
        continue
      }
      classIndex[className] = {
        sourcePath,
        file: entry.file,
      }
    }
  }
  return { classIndex, duplicates }
}

function writeDtsManifestFromBundleManifest(repoRoot, outputDir, manifest) {
  writeDtsManifestSnapshot({
    repoRoot,
    manifest,
    manifestPath: resolve(outputDir, '.dts-manifest.json'),
    writeFileSync,
  })
}

function mergeSemanticGapReports(command) {
  const targetSourcePaths = normalizeBundleManifestSourcePathSet(command.targetSourcePaths)
  const targetGaps = command.target.gaps ?? []
  const existingGaps = command.existing?.gaps ?? []
  const gaps = [
    ...existingGaps.filter(gap => !targetSourcePaths.has(sourceFileFromEmitPath(String(gap.declarationFile ?? '').replace(/\\/g, '/')))),
    ...targetGaps,
  ].sort(compareSemanticGaps)
  return {
    gapCount: gaps.length,
    notes: command.existing?.notes ?? command.target.notes ?? [],
    gaps,
  }
}

function compareSemanticGaps(left, right) {
  return [
    String(left.declarationFile ?? '').localeCompare(String(right.declarationFile ?? '')),
    Number(left.declarationLine ?? 0) - Number(right.declarationLine ?? 0),
    String(left.kind ?? '').localeCompare(String(right.kind ?? '')),
    String(left.className ?? '').localeCompare(String(right.className ?? '')),
    String(left.memberName ?? '').localeCompare(String(right.memberName ?? '')),
  ].find(value => value !== 0) ?? 0
}

function copyBundleFile(fromRoot, toRoot, relativeFile) {
  const fromPath = resolve(fromRoot, relativeFile)
  const toPath = resolve(toRoot, relativeFile)
  mkdirSync(dirname(toPath), { recursive: true })
  copyFileSync(fromPath, toPath)
}

function assertMergedBundleFilesExist(outputDir, files) {
  const missing = []
  for (const [sourcePath, entry] of Object.entries(files)) {
    if (!existsSync(resolve(outputDir, entry.file))) missing.push(sourcePath)
  }
  if (missing.length > 0) {
    throw new Error([
      `Merged DTS ClassModel bundle is missing ${String(missing.length)} shard file(s).`,
      ...missing.slice(0, 20).map(sourcePath => `- ${sourcePath}`),
    ].join('\n'))
  }
}

function countModelsInManifest(outputDir, manifest) {
  let total = 0
  for (const entry of Object.values(manifest.files ?? {})) {
    const shard = readJsonFile(resolve(outputDir, entry.file))
    total += Object.keys(shard.models ?? {}).length
  }
  return total
}

function readJsonFile(fileName) {
  return JSON.parse(readFileSync(fileName, 'utf8'))
}

function sortRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)))
}

function uniqueStrings(values) {
  return [...new Set(values)]
}

function isDeclarationOutput(fileName) {
  return /\.d\.[cm]?ts$/u.test(fileName)
}

function normalizeSourceFileKey(fileName) {
  const resolved = resolve(fileName)
  return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase()
}

function createDtsCompilerOptions() {
  return {
    allowJs: false,
    declaration: true,
    emitDeclarationOnly: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  }
}

function normalizeRepoPath(fileName, rootDir) {
  return relative(rootDir, resolve(fileName)).replace(/\\/g, '/')
}

function toPosixPath(fileName) {
  return fileName.replace(/\\/g, '/')
}

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => repoRoot,
    getCanonicalFileName: fileName => fileName,
    getNewLine: () => '\n',
  })
}

function reportTiming(options, timings, label) {
  const mark = timings.mark(label)
  options.onEvent?.({
    phase: 'timing',
    label,
    stepMs: mark.stepMs,
    totalMs: mark.totalMs,
  })
}

function createTimings() {
  return {
    start: process.hrtime.bigint(),
    last: process.hrtime.bigint(),
    marks: [],
    mark(label) {
      const now = process.hrtime.bigint()
      const mark = {
        label,
        stepMs: Number(now - this.last) / 1_000_000,
        totalMs: Number(now - this.start) / 1_000_000,
      }
      this.marks.push(mark)
      this.last = now
      return mark
    },
  }
}

function renderTimings(timer) {
  const lines = ['Timing:']
  for (const mark of timer.marks) {
    lines.push(`  ${mark.label}: ${formatSeconds(mark.stepMs)}s (total ${formatSeconds(mark.totalMs)}s)`)
  }
  return lines.join('\n')
}

function formatSeconds(ms) {
  return (ms / 1000).toFixed(3)
}
