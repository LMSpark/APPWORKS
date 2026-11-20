import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { readSourceModifiedAtIso } from '../../packages/spark-ai/src/class-model/class-model/bundle/class-model-emit-fs.ts'
import {
  readDtsManifestSnapshotEntry,
  readManifestFileEntry,
  resolveClassModelEmitPath,
  sourceFileFromEmitPath,
} from '../../packages/spark-ai/src/class-model/class-model/bundle/class-model-emit-path.ts'
import { dtsSourcePathToBundleRelativeJson } from '../../packages/spark-ai/src/class-model/class-model/bundle/dts-bundle-url.ts'

export const DTS_MANIFEST_SCHEMA_VERSION = 1

/**
 * 读取 .dts-manifest.json；旧版纯路径数组视为不可用（触发全量重建）。
 */
export function readDtsManifestSnapshot(manifestPath) {
  if (!existsSync(manifestPath)) return undefined
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (Array.isArray(raw)) return undefined
  if (raw?.schemaVersion !== DTS_MANIFEST_SCHEMA_VERSION || typeof raw.entries !== 'object') {
    return undefined
  }
  return raw
}

/**
 * 规划增量 bundle：对照 shard 是否存在 + 源文件 mtime，仅变化项进入投影落盘。
 */
export function planIncrementalBundleBuild(command) {
  const emitSourcePaths = [...command.emitSourcePaths].sort((left, right) => left.localeCompare(right))
  const emitSet = new Set(emitSourcePaths)

  if (
    command.forceFullRebuild === true
    || command.existingManifest?.files === undefined
    || command.existingDtsManifest === undefined
  ) {
    return createFullBuildPlan(emitSourcePaths, command.dtsFiles)
  }

  const changedSourcePaths = new Set()
  const unchangedSourcePaths = new Set()
  const removedSourcePaths = new Set()

  for (const sourcePath of emitSourcePaths) {
    if (isSourceShardUnchanged(command, sourcePath)) {
      unchangedSourcePaths.add(sourcePath)
    } else {
      changedSourcePaths.add(sourcePath)
    }
  }

  for (const sourcePath of Object.keys(command.existingManifest.files ?? {})) {
    if (!emitSet.has(resolveClassModelEmitPath(sourcePath))) removedSourcePaths.add(sourcePath)
  }

  const knownClassNamesBySourcePath = loadKnownClassNamesBySourcePath({
    outputDir: command.outputDir,
    manifest: command.existingManifest,
    unchangedSourcePaths,
  })

  let programRootFiles = command.dtsFiles
  if (changedSourcePaths.size > 0 && unchangedSourcePaths.size > 0) {
    programRootFiles = command.resolveProgramRootFiles([...changedSourcePaths])
  } else if (changedSourcePaths.size === 0) {
    programRootFiles = []
  }

  return {
    mode: 'incremental',
    emitSourcePaths,
    changedSourcePaths,
    unchangedSourcePaths,
    removedSourcePaths,
    programRootFiles,
    knownClassNamesBySourcePath,
  }
}

/**
 * 增量计划显示无需重编译时，可跳过内存 declaration emit。
 * config 独有路径（newConfigSourcePaths）不阻断跳过：稳定态下多为 tsconfig 推导幽灵项。
 */
export function canSkipDeclarationEmit(plan) {
  return plan?.mode === 'incremental'
    && plan.changedSourcePaths.size === 0
    && plan.removedSourcePaths.size === 0
}

/**
 * 稳定态以 manifest 键规划；config 中多出的路径仅在源文件可解析时视为 changed。
 */
export function resolveEmitSourcePathsForIncrementalPlan(command) {
  const configPaths = [...command.configEmitSourcePaths].sort((left, right) => left.localeCompare(right))
  const manifestPaths = uniqueSortedStrings(
    Object.keys(command.existingManifest?.files ?? {}).map(resolveClassModelEmitPath),
  )
  if (manifestPaths.length === 0) return configPaths
  return manifestPaths
}

/**
 * 将 tsconfig 与 manifest 漂移合并进增量计划（new/removed）。
 * config 独有路径记入 newConfigSourcePaths，不并入 changedSourcePaths，避免阻断 emit 跳过。
 */
export function augmentIncrementalPlanWithConfigDrift(plan, command) {
  if (plan === undefined || plan.mode !== 'incremental') return plan
  const configSet = new Set(command.configEmitSourcePaths)
  const manifestFiles = command.existingManifest?.files ?? {}
  const newConfigSourcePaths = new Set(plan.newConfigSourcePaths ?? [])

  for (const sourcePath of command.configEmitSourcePaths) {
    if (readManifestFileEntry(command.existingManifest, sourcePath) !== undefined) continue
    const snapshotEntry = readDtsManifestSnapshotEntry(command.existingDtsManifest, sourcePath)
    const sourceModifiedAt = readSourceModifiedAtIso({
      repoRoot: command.repoRoot,
      emitSourcePath: sourcePath,
      sourceFile: snapshotEntry?.sourceFile,
    })
    if (sourceModifiedAt === undefined) continue
    newConfigSourcePaths.add(sourcePath)
    plan.unchangedSourcePaths.delete(sourcePath)
  }

  for (const sourcePath of Object.keys(manifestFiles)) {
    if (!configSet.has(resolveClassModelEmitPath(sourcePath))) plan.removedSourcePaths.add(sourcePath)
  }

  plan.newConfigSourcePaths = newConfigSourcePaths
  const dirtySourcePaths = [...plan.changedSourcePaths, ...newConfigSourcePaths]
  if (dirtySourcePaths.length > 0 && plan.unchangedSourcePaths.size > 0) {
    plan.programRootFiles = command.resolveProgramRootFiles(dirtySourcePaths)
  } else if (plan.changedSourcePaths.size === 0 && newConfigSourcePaths.size === 0) {
    plan.programRootFiles = []
  }
  return plan
}

function createFullBuildPlan(emitSourcePaths, dtsFiles) {
  return {
    mode: 'full',
    emitSourcePaths,
    changedSourcePaths: new Set(emitSourcePaths),
    unchangedSourcePaths: new Set(),
    removedSourcePaths: new Set(),
    programRootFiles: dtsFiles,
    knownClassNamesBySourcePath: new Map(),
  }
}

function isSourceShardUnchanged(command, sourcePath) {
  const manifestEntry = readManifestFileEntry(command.existingManifest, sourcePath)
  const shardRelative = manifestEntry?.file ?? dtsSourcePathToBundleRelativeJson(sourceFileFromEmitPath(sourcePath))
  const shardPath = resolve(command.outputDir, shardRelative)
  if (!existsSync(shardPath)) return false

  const snapshotEntry = readDtsManifestSnapshotEntry(command.existingDtsManifest, sourcePath)
  const sourceModifiedAt = readSourceModifiedAtIso({
    repoRoot: command.repoRoot,
    emitSourcePath: sourcePath,
    sourceFile: manifestEntry?.module?.sourceFile ?? snapshotEntry?.sourceFile,
  })
  if (sourceModifiedAt === undefined) return false

  const recordedAt = snapshotEntry?.sourceModifiedAt ?? readShardSourceModifiedAt(shardPath)
  return recordedAt === sourceModifiedAt
}

function readShardSourceModifiedAt(shardPath) {
  try {
    const shard = JSON.parse(readFileSync(shardPath, 'utf8'))
    return typeof shard.generatedAt === 'string' ? shard.generatedAt : undefined
  } catch {
    return undefined
  }
}

function loadKnownClassNamesBySourcePath(command) {
  const known = new Map()
  for (const sourcePath of command.unchangedSourcePaths) {
    const entry = readManifestFileEntry(command.manifest, sourcePath)
    if (entry?.file === undefined) continue
    const shardPath = resolve(command.outputDir, entry.file)
    if (!existsSync(shardPath)) continue
    const shard = JSON.parse(readFileSync(shardPath, 'utf8'))
    const classNames = shard.module?.symbols ?? []
    known.set(sourcePath, new Set(classNames))
  }
  return known
}

/** 删除已从 emit 集移除的 shard 文件。 */
export function removeObsoleteBundleShards(command) {
  for (const sourcePath of command.removedSourcePaths) {
    const entry = readManifestFileEntry(command.existingManifest, sourcePath)
    if (entry?.file === undefined) continue
    const shardPath = resolve(command.outputDir, entry.file)
    if (existsSync(shardPath)) rmSync(shardPath, { force: true })
  }
}

/** 无投影变更、仅移除过时条目时重建 manifest / semantic-gaps。 */
export function finalizeBundleWithoutProjection(command) {
  const files = {}
  for (const [sourcePath, entry] of Object.entries(command.existingManifest.files ?? {})) {
    if (!command.removedSourcePaths.has(sourcePath)) files[sourcePath] = entry
  }
  const rebuilt = command.rebuildClassIndex(command.outputDir, files)
  const mergedManifest = {
    ...command.existingManifest,
    scannedFileCount: Object.keys(files).length,
    files: command.sortRecord(files),
    classIndex: command.sortRecord(rebuilt.classIndex),
    ...(rebuilt.duplicates.length === 0 ? {} : { duplicates: rebuilt.duplicates }),
  }
  const semanticReport = command.mergeSemanticGapReports({
    existing: command.existingSemanticReport,
    target: { gapCount: 0, notes: command.existingSemanticReport?.notes ?? [], gaps: [] },
    targetSourcePaths: command.removedSourcePaths,
    removeOnly: true,
  })
  return {
    manifest: mergedManifest,
    semanticReport,
    fileCount: Object.keys(files).length,
    modelCount: command.countModelsInManifest(command.outputDir, mergedManifest),
    semanticGapCount: semanticReport.gapCount,
  }
}

/** 由 manifest 写出带源文件 mtime 的 .dts-manifest.json。 */
export function writeDtsManifestSnapshot(command) {
  const entries = {}
  for (const [sourcePath, entry] of Object.entries(command.manifest.files ?? {})) {
    const sourceFile = entry.module?.sourceFile ?? sourceFileFromEmitPath(sourcePath)
    const sourceModifiedAt = readSourceModifiedAtIso({
      repoRoot: command.repoRoot,
      emitSourcePath: resolveClassModelEmitPath(sourcePath),
      sourceFile,
    })
    entries[sourcePath] = {
      sourceFile,
      shardFile: entry.file,
      ...(sourceModifiedAt === undefined ? {} : { sourceModifiedAt }),
    }
  }
  const snapshot = {
    schemaVersion: DTS_MANIFEST_SCHEMA_VERSION,
    entries,
  }
  command.writeFileSync(command.manifestPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
}

function uniqueSortedStrings(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}
