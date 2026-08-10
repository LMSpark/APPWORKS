/**
 * @module @spark-appworks/spark-ai:class-model/class-model/build-dts-class-model-bundle
 * 职责：把内存 emit 的 DTS 文件投影成 DtsTypeDeclarationModel JSON bundle，生成 manifest、per-file shard 和 semantic-gaps 日志。
 * 边界：只负责编译期索引生成和语义缺口报告，不在运行时解析业务数据，也不替代源文件 JSDoc。
 * AI用途：需要重建知识索引、定位 JSDoc 断链或验证模块/成员语义闭环时，用本模块作为编译入口。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'

import ts from 'typescript'

import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
  type DtsFileModuleSemanticMeta,
  type DtsClassModelSemanticGap,
  type DtsClassModelSemanticGapKind,
  type DtsClassModelSemanticGapReport,
  type DtsClassModelBundleManifest,
  type DtsClassModelBundleComponentEntry,
  type DtsClassModelBundleComponentIndex,
  type DtsFileProjectionBundleJson,
  type DtsFileProjectionDocument,
} from './dts-bundle-types'
import type { AttributeMeta, DtsTypeDeclarationModel, ConstructorMeta, MethodMeta, SourceProvenanceMeta, ComponentProfileMeta } from './types'
import type { JsonSchema, JsonSchemaObject } from '@spark-appworks/spark-json-document'
import { canRenderMethodSignatureFromTypeTree, resolveMethodReturnType } from './dts-type-meta-ops'
import {
  isClassModelEmitPath,
  sourceFileFromEmitPath,
  toClassModelEmitPath,
} from './class-model-emit-path'
import { normalizeRepoPath } from './dts-ast-utils'
import { projectDtsSourceFileProjection } from './project-from-declarations'
import { attachModelJsonSchemas } from './class-model-to-json-schema'
import { stripRedundantModelSchemas } from './class-model-schema-projection'
import { modelJsonSchemaRefForBundleFile } from './model-json-schema-ref'

/** Build Dts Class Model Bundle Progress Phase 的语义模型。 */
export type BuildDtsClassModelBundleProgressPhase =
  | 'read-files'
  | 'project-file'
  | 'write-semantic-gaps'
  | 'write-manifest'
  | 'done'

/** Build Dts Class Model Bundle Progress 的语义模型。 */
export type BuildDtsClassModelBundleProgress = Readonly<{
  /** 当前 bundle 构建阶段。 */
  phase: BuildDtsClassModelBundleProgressPhase
  /** 当前已处理文件序号（1-based）。 */
  current?: number
  /** 待处理文件总数。 */
  total?: number
  /** 当前正在投影的 emit 源路径。 */
  sourcePath?: string
}>

/** Build Dts Class Model Bundle Options 的调用配置。 */
export type BuildDtsClassModelBundleOptions = Readonly<{
  /** 仓库根目录，用于规范化相对路径。 */
  repoRoot: string
  /** 参与 bundle 闭包的 root .d.ts 绝对路径列表。 */
  rootFiles: readonly string[]
  /** bundle 输出目录（manifest、shard、semantic-gaps）。 */
  outputDir: string
  /** 可选 TypeScript CompilerHost，供测试或自定义读文件。 */
  compilerHost?: ts.CompilerHost
  /** true 时只投影 export 可见 symbol。 */
  exportedOnly?: boolean
  /** 进度回调，按 phase 与文件序号推送事件。 */
  onProgress?: (event: BuildDtsClassModelBundleProgress) => void
  /** 文件投影进度报告间隔（按文件数取模）；默认 50。 */
  progressInterval?: number
  /** 仅投影并落盘这些 emit 源路径；rootFiles 仍可包含依赖闭包供 import 正则寻址。 */
  projectOnlySourcePaths?: ReadonlySet<string>
  /** 未重投影 shard 的 className 索引，供 $ref 解析跨文件类型引用。 */
  knownProjectedClassNamesBySourcePath?: ReadonlyMap<string, ReadonlySet<string>>
}>

/** Build Dts Class Model Bundle Result 的返回结果。 */
export type BuildDtsClassModelBundleResult = Readonly<{
  /** 生成的 manifest 对象（未落盘前的内存快照）。 */
  manifest: DtsClassModelBundleManifest
  /** manifest.json 的绝对输出路径。 */
  manifestPath: string
  /** semantic-gaps.json 的绝对输出路径。 */
  semanticLogJsonPath: string
  /** 检测到的 JSDoc 语义缺口总数。 */
  semanticGapCount: number
  /** 实际写入的 shard 文件数。 */
  fileCount: number
  /** 投影出的 DtsTypeDeclarationModel 总数。 */
  modelCount: number
}>

type CreateSemanticGapCommand = Readonly<{
  kind: Exclude<DtsClassModelSemanticGapKind, 'module'>
  model: DtsTypeDeclarationModel
  provenance: SourceProvenanceMeta | undefined
  memberName?: string
}>

type ProjectedBundleFile = Readonly<{
  sourcePath: string
  projection: DtsFileProjectionDocument
  bundleFile: string
  outputPath: string
}>

type TypeReferenceTarget = Readonly<{
  targetName: string
  targetSourcePath: string
}>

type BundleSchemaRefContext = Readonly<{
  currentSourcePath: string
  currentBundleFile: string
  projectedClassNamesBySourcePath: ReadonlyMap<string, ReadonlySet<string>>
  schemaClassNamesBySourcePath: ReadonlyMap<string, ReadonlySet<string>>
  classNameSourceIndex: ReadonlyMap<string, string | undefined>
  typeReferenceIndex: ReadonlyMap<string, ReadonlyMap<string, TypeReferenceTarget>>
}>

import { dtsSourcePathToBundleRelativeJson } from './dts-bundle-url'

export function buildDtsClassModelBundle(
  options: BuildDtsClassModelBundleOptions,
): BuildDtsClassModelBundleResult {
  const repoRoot = resolve(options.repoRoot)
  const outputDir = resolve(options.outputDir)
  const rootFiles = options.rootFiles.filter(absolutePath => {
    const emitSourcePath = normalizeRepoPath(absolutePath, repoRoot)
    return isClassModelEmitPath(emitSourcePath)
  })
  const projectOnlySourcePaths = options.projectOnlySourcePaths === undefined
    ? undefined
    : new Set([...options.projectOnlySourcePaths].map(sourceFileFromEmitPath))
  const knownSourcePaths = new Set(rootFiles.map(absolutePath => sourceFileFromEmitPath(normalizeRepoPath(absolutePath, repoRoot))))
  const knownEmitSourcePaths = new Set(rootFiles.map(absolutePath => normalizeRepoPath(absolutePath, repoRoot)))
  const knownProjectedClassNamesBySourcePath = normalizeKnownProjectedClassNamesBySourcePath(
    options.knownProjectedClassNamesBySourcePath,
  )
  for (const sourcePath of knownProjectedClassNamesBySourcePath.keys()) {
    knownSourcePaths.add(sourcePath)
    knownEmitSourcePaths.add(toClassModelEmitPath(sourcePath))
  }
  const total = rootFiles.length
  const progressInterval = options.progressInterval ?? 50
  reportProgress(options, { phase: 'read-files', total })
  const files: Record<string, DtsClassModelBundleManifest['files'][string]> = {}
  const classIndex: Record<string, DtsClassModelBundleManifest['classIndex'][string]> = {}
  const componentIndex = createMutableComponentIndex()
  const duplicates: Array<{ className: string; keptFile: string; skippedFile: string }> = []
  const semanticGaps: DtsClassModelSemanticGap[] = []
  const projectedFiles: ProjectedBundleFile[] = []
  const typeReferenceIndex = new Map<string, ReadonlyMap<string, TypeReferenceTarget>>()
  let modelCount = 0
  let projectedCount = 0

  for (const [index, absolutePath] of rootFiles.entries()) {
    const emitSourcePath = normalizeRepoPath(absolutePath, repoRoot)
    const sourcePath = sourceFileFromEmitPath(emitSourcePath)
    if (projectOnlySourcePaths !== undefined && !projectOnlySourcePaths.has(sourcePath)) {
      continue
    }
    const sourceFile = readDtsSourceFile(absolutePath, options.compilerHost)
    const typeReferenceTargets = collectDtsTypeReferenceTargets({
      emitSourcePath,
      sourceFile,
      knownEmitSourcePaths,
    })
    if (typeReferenceTargets.size > 0) typeReferenceIndex.set(sourcePath, typeReferenceTargets)

    const projection = projectDtsSourceFileProjection({
      repoRoot,
      absolutePath,
      sourceFile,
      exportedOnly: options.exportedOnly ?? false,
    })
    const bundleFile = dtsSourcePathToBundleRelativeJson(sourcePath)
    const normalizedBundleFile = bundleFile.replace(/\\/g, '/')
    const outputPath = resolve(outputDir, bundleFile)
    projectedFiles.push({
      sourcePath,
      projection,
      bundleFile: normalizedBundleFile,
      outputPath,
    })
    projectedCount += 1

    files[sourcePath] = {
      file: normalizedBundleFile,
      module: projection.module,
    }
    modelCount += Object.keys(projection.models).length
    semanticGaps.push(...collectSemanticGaps(projection))

    for (const className of projection.symbols) {
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
        file: normalizedBundleFile,
      }
      const model = projection.models[className]
      if (model !== undefined) {
        addComponentIndexEntry(componentIndex, {
          className,
          sourcePath,
          file: normalizedBundleFile,
          component: componentProfileFromModel(model),
        })
      }
    }

    const current = index + 1
    if (shouldReportFileProgress(current, total, progressInterval)) {
      reportProgress(options, {
        phase: 'project-file',
        current,
        total,
        sourcePath,
      })
    }
  }

  const projectedClassNamesBySourcePath = new Map<string, ReadonlySet<string>>(
    knownProjectedClassNamesBySourcePath,
  )
  for (const projectedFile of projectedFiles) {
    projectedClassNamesBySourcePath.set(
      projectedFile.sourcePath,
      new Set(Object.keys(projectedFile.projection.models)),
    )
  }
  const classNameSourceIndex = buildClassNameSourceIndex(projectedClassNamesBySourcePath)
  const schemaClassNamesBySourcePath = buildSchemaClassNamesBySourcePath({
    outputDir,
    projectedFiles,
    knownSourcePaths: knownProjectedClassNamesBySourcePath.keys(),
  })
  for (const projectedFile of projectedFiles) {
    const compactProjection = compactDtsFileProjectionForBundle(projectedFile.projection, {
      currentSourcePath: projectedFile.sourcePath,
      currentBundleFile: projectedFile.bundleFile,
      projectedClassNamesBySourcePath,
      schemaClassNamesBySourcePath,
      classNameSourceIndex,
      typeReferenceIndex,
    })
    mkdirSync(dirname(projectedFile.outputPath), { recursive: true })
    writeFileSync(projectedFile.outputPath, `${JSON.stringify(compactProjection, null, 2)}\n`, 'utf8')
  }

  const semanticReport = createSemanticGapReport(semanticGaps)
  const semanticLogJsonPath = resolve(outputDir, 'semantic-gaps.json')
  reportProgress(options, { phase: 'write-semantic-gaps', total })
  writeFileSync(semanticLogJsonPath, `${JSON.stringify(semanticReport, null, 2)}\n`, 'utf8')

  const manifest: DtsClassModelBundleManifest = {
    schemaVersion: DTS_CLASS_MODEL_BUNDLE_VERSION,
    protocol: DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
    scannedFileCount: Object.keys(files).length,
    files: sortRecord(files),
    classIndex: sortRecord(classIndex),
    ...componentIndexProperty(componentIndex),
    ...(duplicates.length === 0 ? {} : { duplicates: sortDuplicateRecords(duplicates) }),
  }
  const manifestPath = resolve(outputDir, 'manifest.json')
  mkdirSync(outputDir, { recursive: true })
  reportProgress(options, { phase: 'write-manifest', total })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  reportProgress(options, { phase: 'done', total })

  return {
    manifest,
    manifestPath,
    semanticLogJsonPath,
    semanticGapCount: semanticReport.gapCount,
    fileCount: projectedCount,
    modelCount,
  }
}

export { dtsSourcePathToBundleRelativeJson, resolveDtsBundleRelativeUrl } from './dts-bundle-url'

function readDtsSourceFile(absolutePath: string, compilerHost: ts.CompilerHost | undefined): ts.SourceFile {
  const resolvedPath = resolve(absolutePath)
  const sourceFile = compilerHost?.getSourceFile(
    resolvedPath,
    ts.ScriptTarget.ES2022,
    undefined,
    true,
  )
  if (sourceFile !== undefined) return sourceFile
  const text = compilerHost?.readFile(resolvedPath) ?? readFileSync(resolvedPath, 'utf8')
  return ts.createSourceFile(resolvedPath, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
}

function normalizeKnownProjectedClassNamesBySourcePath(
  known: ReadonlyMap<string, ReadonlySet<string>> | undefined,
): ReadonlyMap<string, ReadonlySet<string>> {
  const normalized = new Map<string, ReadonlySet<string>>()
  for (const [sourcePath, classNames] of known ?? []) {
    normalized.set(sourceFileFromEmitPath(sourcePath), classNames)
  }
  return normalized
}

function collectDtsTypeReferenceTargets(command: {
  emitSourcePath: string
  sourceFile: ts.SourceFile
  knownEmitSourcePaths: ReadonlySet<string>
}): ReadonlyMap<string, TypeReferenceTarget> {
  const { emitSourcePath, sourceFile, knownEmitSourcePaths } = command
  const targets = new Map<string, TypeReferenceTarget>()
  const text = sourceFile.getFullText()
  for (const importMatch of text.matchAll(/import\s+(?:type\s+)?([^'"]+?)\s+from\s+['"]([^'"]+)['"]/gu)) {
    const bindingsText = importMatch[1]?.trim()
    const moduleSpecifier = importMatch[2]
    if (bindingsText === undefined || moduleSpecifier === undefined) continue
    const targetEmitSourcePath = resolveDtsModuleSpecifierSourcePath(emitSourcePath, moduleSpecifier, knownEmitSourcePaths)
    if (targetEmitSourcePath === undefined) continue
    const targetSourcePath = sourceFileFromEmitPath(targetEmitSourcePath)

    const namedBindings = /^\{(?<body>[\s\S]*)\}$/u.exec(bindingsText)
    if (namedBindings?.groups?.['body'] !== undefined) {
      for (const binding of namedBindings.groups['body'].split(',')) {
        const parsed = parseNamedImportBinding(binding)
        if (parsed === undefined) continue
        targets.set(parsed.localName, {
          targetName: parsed.importedName,
          targetSourcePath,
        })
      }
      continue
    }

    const namespaceBinding = /^\*\s+as\s+(?<name>[A-Za-z_$][\w$]*)$/u.exec(bindingsText)
    if (namespaceBinding?.groups?.['name'] !== undefined) {
      targets.set(`${namespaceBinding.groups['name']}.*`, {
        targetName: '*',
        targetSourcePath,
      })
      continue
    }

    const defaultBinding = /^(?<name>[A-Za-z_$][\w$]*)$/u.exec(bindingsText)
    if (defaultBinding?.groups?.['name'] !== undefined) {
      targets.set(defaultBinding.groups['name'], {
        targetName: defaultBinding.groups['name'],
        targetSourcePath,
      })
    }
  }
  return targets
}

function parseNamedImportBinding(binding: string): { importedName: string; localName: string } | undefined {
  const normalized = binding.trim().replace(/^type\s+/u, '')
  if (normalized.length === 0) return undefined
  const match = /^(?<imported>[A-Za-z_$][\w$]*)(?:\s+as\s+(?<local>[A-Za-z_$][\w$]*))?$/u.exec(normalized)
  const importedName = match?.groups?.['imported']
  if (importedName === undefined) return undefined
  return {
    importedName,
    localName: match?.groups?.['local'] ?? importedName,
  }
}

function resolveDtsModuleSpecifierSourcePath(
  currentSourcePath: string,
  moduleSpecifier: string,
  knownSourcePaths: ReadonlySet<string>,
): string | undefined {
  if (!moduleSpecifier.startsWith('.')) return undefined
  const base = posix.normalize(posix.join(posix.dirname(currentSourcePath), moduleSpecifier.replace(/\\/g, '/')))
  for (const candidate of dtsModuleSourcePathCandidates(base)) {
    if (knownSourcePaths.has(candidate)) return candidate
  }
  return undefined
}

function dtsModuleSourcePathCandidates(base: string): readonly string[] {
  if (/\.d\.[cm]?ts$/u.test(base)) return [base]
  if (base.endsWith(".vue")) return [`${base}.d.ts`]
  if (/\.[cm]?js$/u.test(base)) return [base.replace(/\.[cm]?js$/u, '.d.ts')]
  if (/\.[cm]?ts$/u.test(base)) return [base.replace(/\.[cm]?ts$/u, '.d.ts')]
  return [`${base}.d.ts`, `${base}/index.d.ts`]
}

function shouldReportFileProgress(current: number, total: number, interval: number): boolean {
  if (total === 0) return false
  if (current === total) return true
  if (interval <= 0) return false
  return current % interval === 0
}

function reportProgress(
  options: BuildDtsClassModelBundleOptions,
  event: BuildDtsClassModelBundleProgress,
): void {
  options.onProgress?.(event)
}

type MutableComponentIndex = {
  entries: Record<string, DtsClassModelBundleComponentEntry>
  byName: Record<string, string[]>
  byType: Record<string, string[]>
  byLevel: Record<string, string[]>
  byLayer: Record<string, string[]>
  byDirectory: Record<string, string[]>
}

type ComponentIndexEntryCommand = Readonly<{
  className: string
  sourcePath: string
  file: string
  component: ComponentProfileMeta | undefined
}>

function createMutableComponentIndex(): MutableComponentIndex {
  return {
    entries: {},
    byName: {},
    byType: {},
    byLevel: {},
    byLayer: {},
    byDirectory: {},
  }
}

function addComponentIndexEntry(
  index: MutableComponentIndex,
  command: ComponentIndexEntryCommand,
): void {
  const component = command.component
  if (component === undefined || Object.keys(component).length === 0) return
  index.entries[command.className] = {
    className: command.className,
    sourcePath: command.sourcePath,
    file: command.file,
    component,
  }
  addComponentIndexValue(index.byName, component.name, command.className)
  addComponentIndexValue(index.byType, component.type, command.className)
  addComponentIndexValue(index.byLevel, component.level, command.className)
  addComponentIndexValue(index.byLayer, component.layer, command.className)
  addComponentIndexValue(index.byDirectory, component.directory, command.className)
}

function addComponentIndexValue(
  bucket: Record<string, string[]>,
  key: string | undefined,
  className: string,
): void {
  if (key === undefined || key.length === 0) return
  bucket[key] ??= []
  bucket[key].push(className)
}

function componentIndexProperty(
  index: MutableComponentIndex,
): { componentIndex?: DtsClassModelBundleComponentIndex } {
  if (Object.keys(index.entries).length === 0) return {}
  return {
    componentIndex: {
      entries: sortRecord(index.entries),
      byName: sortComponentIndexBuckets(index.byName),
      byType: sortComponentIndexBuckets(index.byType),
      byLevel: sortComponentIndexBuckets(index.byLevel),
      byLayer: sortComponentIndexBuckets(index.byLayer),
      byDirectory: sortComponentIndexBuckets(index.byDirectory),
    },
  }
}

function sortComponentIndexBuckets(
  buckets: Record<string, string[]>,
): Record<string, readonly string[]> {
  const sorted: Record<string, readonly string[]> = {}
  for (const [key, values] of Object.entries(sortRecord(buckets))) {
    sorted[key] = [...new Set(values)].sort((left, right) => left.localeCompare(right))
  }
  return sorted
}

function compactDtsFileProjectionForBundle(
  projection: DtsFileProjectionDocument,
  refContext: BundleSchemaRefContext,
): DtsFileProjectionBundleJson {
  const models: Record<string, DtsTypeDeclarationModel> = {}
  for (const [className, model] of Object.entries(projection.models)) {
    models[className] = compactClassModelForBundle(model, refContext)
  }
  const modelsWithJsonSchema = attachModelJsonSchemas(models)
  const persistedModels: Record<string, unknown> = {}
  const schemaDefs: Record<string, JsonSchemaObject> = {}
  for (const [className, model] of Object.entries(modelsWithJsonSchema)) {
    const stripped = stripRedundantModelSchemas(model)
    const jsonSchema = compactPersistedJsonSchemaForBundle(stripped)
    if (jsonSchema !== undefined) schemaDefs[className] = jsonSchema
    persistedModels[className] = compactPersistedClassModelForBundle(stripped)
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    schemaVersion: DTS_FILE_PROJECTION_VERSION,
    module: projection.module,
    $defs: schemaDefs,
    ...(projection.generatedAt === undefined ? {} : { generatedAt: projection.generatedAt }),
    models: persistedModels,
  }
}

function compactPersistedClassModelForBundle(model: DtsTypeDeclarationModel): Record<string, unknown> {
  const component = componentProfileFromModel(model)
  return {
    name: model.name,
    jsdoc: model.jsdoc,
    declarationKind: model.declarationKind,
    ...(component === undefined ? {} : { component }),
    ...compactPersistedShapePayloadForBundle(model),
  }
}

function componentProfileFromModel(model: DtsTypeDeclarationModel): ComponentProfileMeta | undefined {
  const explicit = model.component
  if (explicit !== undefined && Object.keys(explicit).length > 0) return explicit
  const provenance = model.provenance
  if (provenance === undefined) return undefined
  const component: ComponentProfileMeta = {
    ...(provenance.componentName === undefined ? {} : { name: provenance.componentName }),
    ...(provenance.componentType === undefined ? {} : { type: provenance.componentType }),
    ...(provenance.componentLevel === undefined ? {} : { level: provenance.componentLevel }),
    ...(provenance.componentLayer === undefined ? {} : { layer: provenance.componentLayer }),
    ...(provenance.componentDirectory === undefined ? {} : { directory: provenance.componentDirectory }),
  }
  return Object.keys(component).length === 0 ? undefined : component
}

function compactPersistedShapePayloadForBundle(model: DtsTypeDeclarationModel): Record<string, unknown> {
  if (model.declarationKind === 'class') {
    const payload = model.classDecl
    const attributes = payload.members.attributes.map(compactPersistedAttributeMetaForBundle)
    const methods = payload.members.methods.map(compactPersistedMethodMetaForBundle)
    return {
      classDecl: {
        constructorMeta: compactPersistedConstructorMetaForBundle(payload.constructorMeta),
        ...(payload.declarationRelations === undefined ? {} : { declarationRelations: payload.declarationRelations }),
        members: {
          ...(attributes.length === 0 ? {} : { attributes }),
          ...(methods.length === 0 ? {} : { methods }),
        },
      },
    }
  }
  if (model.declarationKind === 'interface') {
    const payload = model.interfaceDecl
    const attributes = payload.members.attributes.map(compactPersistedAttributeMetaForBundle)
    const methods = payload.members.methods.map(compactPersistedMethodMetaForBundle)
    return {
      interfaceDecl: {
        ...(payload.declarationRelations === undefined ? {} : { declarationRelations: payload.declarationRelations }),
        members: {
          ...(attributes.length === 0 ? {} : { attributes }),
          ...(methods.length === 0 ? {} : { methods }),
        },
      },
    }
  }
  if (model.declarationKind === 'typeAlias') {
    const payload = model.typeAlias
    const attributes = payload.members.attributes.map(compactPersistedAttributeMetaForBundle)
    const methods = payload.members.methods.map(compactPersistedMethodMetaForBundle)
    return {
      typeAlias: {
        declarationTypeText: payload.declarationTypeText,
        ...(payload.declarationRelations === undefined ? {} : { declarationRelations: payload.declarationRelations }),
        members: {
          ...(attributes.length === 0 ? {} : { attributes }),
          ...(methods.length === 0 ? {} : { methods }),
        },
      },
    }
  }
  return {
    enumDecl: {
      members: model.enumDecl.members.map(compactPersistedAttributeMetaForBundle),
    },
  }
}

function compactPersistedJsonSchemaForBundle(model: DtsTypeDeclarationModel): JsonSchemaObject | undefined {
  if (model.jsonSchema === undefined) return undefined
  const jsonSchema: Record<string, unknown> = { ...model.jsonSchema }
  const description = jsonSchema['description']
  const modelDescription = model.jsdoc.trim()
  if (typeof description === 'string' && description === modelDescription) {
    delete jsonSchema['description']
  }
  return jsonSchema
}

function compactPersistedConstructorMetaForBundle(constructorMeta: ConstructorMeta): Record<string, unknown> {
  return {
    ...(constructorMeta.jsdoc.length === 0 ? {} : { jsdoc: constructorMeta.jsdoc }),
    ...(constructorMeta.signatureText === undefined ? {} : { signatureText: constructorMeta.signatureText }),
    ...(constructorMeta.parameterStyle === undefined || constructorMeta.parameterStyle === 'positional'
      ? {}
      : { parameterStyle: constructorMeta.parameterStyle }),
    parameters: constructorMeta.parameters ?? [],
  }
}

function compactPersistedAttributeMetaForBundle(attribute: AttributeMeta): Record<string, unknown> {
  return {
    name: attribute.name,
    ...(attribute.jsdoc.length === 0 ? {} : { jsdoc: attribute.jsdoc }),
    readable: attribute.readable,
    writable: attribute.writable,
  }
}

function compactPersistedMethodMetaForBundle(method: MethodMeta): Record<string, unknown> {
  return {
    name: method.name,
    ...(method.jsdoc.length === 0 ? {} : { jsdoc: method.jsdoc }),
    ...(method.parameterStyle === undefined || method.parameterStyle === 'positional' ? {} : { parameterStyle: method.parameterStyle }),
    parameters: method.parameters ?? [],
    ...(method.type === undefined ? {} : { type: method.type }),
    ...(method.signatureText === undefined ? {} : { signatureText: method.signatureText }),
    ...(method.takesContext === undefined ? {} : { takesContext: method.takesContext }),
  }
}

function compactClassModelForBundle(model: DtsTypeDeclarationModel, refContext: BundleSchemaRefContext): DtsTypeDeclarationModel {
  if (model.declarationKind === 'class') {
    return {
      ...model,
      classDecl: {
        ...model.classDecl,
        constructorMeta: compactConstructorMetaForBundle(model.classDecl.constructorMeta, refContext),
        members: {
          attributes: model.classDecl.members.attributes.map(attribute => compactAttributeMetaForBundle(attribute, refContext)),
          methods: model.classDecl.members.methods.map(method => compactMethodMetaForBundle(method, refContext)),
        },
      },
    }
  }
  if (model.declarationKind === 'interface') {
    return {
      ...model,
      interfaceDecl: {
        ...model.interfaceDecl,
        members: {
          attributes: model.interfaceDecl.members.attributes.map(attribute => compactAttributeMetaForBundle(attribute, refContext)),
          methods: model.interfaceDecl.members.methods.map(method => compactMethodMetaForBundle(method, refContext)),
        },
      },
    }
  }
  if (model.declarationKind === 'typeAlias') {
    return {
      ...model,
      typeAlias: {
        ...model.typeAlias,
        members: {
          attributes: model.typeAlias.members.attributes.map(attribute => compactAttributeMetaForBundle(attribute, refContext)),
          methods: model.typeAlias.members.methods.map(method => compactMethodMetaForBundle(method, refContext)),
        },
      },
    }
  }
  return {
    ...model,
    enumDecl: {
      members: model.enumDecl.members.map(attribute => compactAttributeMetaForBundle(attribute, refContext)),
    },
  }
}

function compactConstructorMetaForBundle(
  constructorMeta: ConstructorMeta,
  refContext: BundleSchemaRefContext,
): ConstructorMeta {
  const signatureText = constructorMeta.signatureText?.trim()
  if (signatureText === undefined || signatureText.length === 0) {
    throw new Error('DTS constructor is missing signatureText')
  }
  if (constructorMeta.paramsSchema === undefined) {
    throw new Error(
      `DTS constructor is missing paramsSchema; Compiler API projection must emit executable schema before bundle write.`,
    )
  }
  const paramsSchema = referenceSchemaObjectForBundle(constructorMeta.paramsSchema, refContext)
  return {
    jsdoc: constructorMeta.jsdoc,
    signatureText,
    parameterStyle: constructorMeta.parameterStyle ?? 'positional',
    parameters: constructorMeta.parameters ?? [],
    paramsSchema,
  }
}

function compactAttributeMetaForBundle(
  attribute: AttributeMeta,
  refContext: BundleSchemaRefContext,
): AttributeMeta {
  return {
    name: attribute.name,
    jsdoc: attribute.jsdoc,
    schema: referenceRequiredSchemaForBundle(attribute.schema ?? true, refContext),
    readable: attribute.readable,
    writable: attribute.writable,
  }
}

function compactMethodMetaForBundle(method: MethodMeta, refContext: BundleSchemaRefContext): MethodMeta {
  const parameters = method.parameters ?? []
  const typeMeta = resolveMethodReturnType(method)
  if (typeMeta === undefined) {
    throw new Error(`DTS method is missing type: ${method.name}`)
  }
  if (method.paramsSchema === undefined) {
    throw new Error(
      `DTS method "${method.name}" is missing paramsSchema; Compiler API projection must emit executable schema before bundle write.`,
    )
  }
  const paramsSchema = referenceSchemaObjectForBundle(method.paramsSchema, refContext)
  const returnSchema = method.returnSchema === undefined
    ? undefined
    : referenceSchemaForBundle(method.returnSchema, refContext)
  const compact: MethodMeta = {
    name: method.name,
    jsdoc: method.jsdoc,
    parameterStyle: method.parameterStyle ?? 'positional',
    parameters,
    type: typeMeta,
    paramsSchema,
    ...(returnSchema === undefined ? {} : { returnSchema }),
    ...(method.takesContext === undefined ? {} : { takesContext: method.takesContext }),
  }
  if (canRenderMethodSignatureFromTypeTree(compact)) {
    return compact
  }
  const signatureText = method.signatureText?.trim()
  if (signatureText === undefined || signatureText.length === 0) {
    throw new Error(`DTS method is missing signatureText: ${method.name}`)
  }
  return { ...compact, signatureText }
}

function isJsonSchemaObject(schema: JsonSchema | undefined): schema is JsonSchemaObject {
  return schema !== undefined && schema !== true && schema !== false && typeof schema === 'object' && !Array.isArray(schema)
}

function referenceRequiredSchemaForBundle(
  schema: JsonSchema,
  refContext: BundleSchemaRefContext,
): JsonSchema {
  return referenceSchemaForBundle(schema, refContext) ?? true
}

function referenceSchemaObjectForBundle(
  schema: JsonSchemaObject,
  refContext: BundleSchemaRefContext,
): JsonSchemaObject {
  const referenced = referenceSchemaForBundle(schema, refContext)
  return isJsonSchemaObject(referenced) ? referenced : {}
}

function referenceSchemaForBundle(
  schema: JsonSchema | undefined,
  refContext: BundleSchemaRefContext,
): JsonSchema | undefined {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema
  }

  const directRef = directSchemaRefForBundle(schema, refContext)
  if (directRef !== undefined) return directRef

  const next: Record<string, unknown> = { ...schema }
  if (schema['items'] !== undefined) next['items'] = referenceSchemaForBundle(schema['items'], refContext)
  if (schema['properties'] !== undefined) {
    const properties: Record<string, JsonSchema> = {}
    for (const [name, child] of Object.entries(schema['properties'])) {
      const referenced = referenceSchemaForBundle(child, refContext)
      if (referenced !== undefined) properties[name] = referenced
    }
    next['properties'] = properties
  }
  if (schema['anyOf'] !== undefined) {
    next['anyOf'] = schema['anyOf'].map(child => referenceSchemaForBundle(child, refContext) ?? true)
  }
  if (schema['oneOf'] !== undefined) {
    next['oneOf'] = schema['oneOf'].map(child => referenceSchemaForBundle(child, refContext) ?? true)
  }
  if (schema['allOf'] !== undefined) {
    next['allOf'] = schema['allOf'].map(child => referenceSchemaForBundle(child, refContext) ?? true)
  }
  if (schema['not'] !== undefined) next['not'] = referenceSchemaForBundle(schema['not'], refContext)
  return next
}

function directSchemaRefForBundle(
  schema: JsonSchemaObject,
  refContext: BundleSchemaRefContext,
): JsonSchemaObject | undefined {
  if (!isTypeReferencePlaceholderSchema(schema)) return undefined
  const title = schema.title
  if (typeof title !== 'string') return undefined
  const dtsTarget = dtsTypeReferenceTargetForBundle(title, refContext)
  if (dtsTarget !== undefined) {
    return {
      $ref: modelJsonSchemaRefForBundleFile(
        refContext.currentBundleFile,
        dtsSourcePathToBundleRelativeJson(dtsTarget.targetSourcePath).replace(/\\/g, '/'),
        dtsTarget.targetName,
      ),
      ...(title === dtsTarget.targetName ? {} : { title }),
    }
  }
  return undefined
}

function dtsTypeReferenceTargetForBundle(
  title: string,
  refContext: BundleSchemaRefContext,
): TypeReferenceTarget | undefined {
  const sourceTargets = refContext.typeReferenceIndex.get(refContext.currentSourcePath)
  const direct = sourceTargets?.get(title)
  if (direct !== undefined && refTargetExists(direct, refContext)) return direct

  const parsed = parseDtsReferenceTitle(title)
  if (parsed === undefined) return undefined

  const imported = sourceTargets?.get(parsed.localName)
  if (imported !== undefined) {
    const target = {
      targetName: imported.targetName,
      targetSourcePath: imported.targetSourcePath,
    }
    return refTargetExists(target, refContext) ? target : undefined
  }

  if (parsed.namespaceName !== undefined) {
    const namespaceTarget = sourceTargets?.get(`${parsed.namespaceName}.*`)
    if (namespaceTarget !== undefined) {
      const target = {
        targetName: parsed.localName,
        targetSourcePath: namespaceTarget.targetSourcePath,
      }
      return refTargetExists(target, refContext) ? target : undefined
    }
  }

  const currentFileModels = refContext.projectedClassNamesBySourcePath.get(refContext.currentSourcePath)
  if (currentFileModels?.has(parsed.localName) === true) {
    const target = {
      targetName: parsed.localName,
      targetSourcePath: refContext.currentSourcePath,
    }
    return refTargetExists(target, refContext) ? target : undefined
  }

  const uniqueSourcePath = refContext.classNameSourceIndex.get(parsed.localName)
  if (uniqueSourcePath !== undefined) {
    const target = {
      targetName: parsed.localName,
      targetSourcePath: uniqueSourcePath,
    }
    return refTargetExists(target, refContext) ? target : undefined
  }
  return undefined
}

function buildClassNameSourceIndex(
  projectedClassNamesBySourcePath: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyMap<string, string | undefined> {
  const index = new Map<string, string | undefined>()
  for (const [sourcePath, classNames] of projectedClassNamesBySourcePath.entries()) {
    for (const className of classNames) {
      if (index.has(className)) {
        index.set(className, undefined)
      } else {
        index.set(className, sourcePath)
      }
    }
  }
  return index
}

function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  const sorted: Record<string, T> = {}
  for (const [key, value] of Object.entries(record).sort(([left], [right]) => left.localeCompare(right))) {
    sorted[key] = value
  }
  return sorted
}

function sortDuplicateRecords(
  duplicates: ReadonlyArray<{ className: string; keptFile: string; skippedFile: string }>,
): Array<{ className: string; keptFile: string; skippedFile: string }> {
  return [...duplicates].sort((left, right) => left.className.localeCompare(right.className)
    || left.keptFile.localeCompare(right.keptFile)
    || left.skippedFile.localeCompare(right.skippedFile))
}

function buildSchemaClassNamesBySourcePath(command: Readonly<{
  outputDir: string
  projectedFiles: readonly ProjectedBundleFile[]
  knownSourcePaths: Iterable<string>
}>): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, ReadonlySet<string>>()
  for (const sourcePath of command.knownSourcePaths) {
    const existing = readExistingShardSchemaClassNames(command.outputDir, sourcePath)
    if (existing.size > 0) index.set(sourcePath, existing)
  }
  for (const projectedFile of command.projectedFiles) {
    index.set(projectedFile.sourcePath, collectSchemaClassNames(projectedFile.projection.models))
  }
  return index
}

function collectSchemaClassNames(models: Readonly<Record<string, DtsTypeDeclarationModel>>): ReadonlySet<string> {
  const names = new Set<string>()
  const modelsWithSchema = attachModelJsonSchemas(models)
  for (const [className, model] of Object.entries(modelsWithSchema)) {
    if (model.jsonSchema !== undefined) names.add(className)
  }
  return names
}

function readExistingShardSchemaClassNames(outputDir: string, sourcePath: string): ReadonlySet<string> {
  const shardPath = resolve(outputDir, dtsSourcePathToBundleRelativeJson(sourcePath))
  try {
    const shard: unknown = JSON.parse(readFileSync(shardPath, 'utf8'))
    if (!isUnknownRecord(shard)) return new Set()
    const defs = shard['$defs']
    if (defs === null || typeof defs !== 'object' || Array.isArray(defs)) return new Set()
    return new Set(Object.keys(defs))
  } catch {
    return new Set()
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseDtsReferenceTitle(title: string): { namespaceName?: string; localName: string } | undefined {
  const match = /^(?:(?<namespace>[A-Za-z_$][\w$]*)\.)?(?<local>[A-Za-z_$][\w$]*)/u.exec(title.trim())
  const localName = match?.groups?.['local']
  if (localName === undefined || localName.length === 0) return undefined
  const namespaceName = match?.groups?.['namespace']
  return namespaceName === undefined
    ? { localName }
    : { namespaceName, localName }
}

function refTargetExists(
  target: TypeReferenceTarget,
  refContext: BundleSchemaRefContext,
): boolean {
  return refContext.schemaClassNamesBySourcePath.get(target.targetSourcePath)?.has(target.targetName) ?? false
}

function isTypeReferencePlaceholderSchema(schema: JsonSchemaObject): boolean {
  return schema.type === 'object'
    && typeof schema.title === 'string'
    && schema.properties === undefined
    && schema.items === undefined
    && schema.anyOf === undefined
    && schema.oneOf === undefined
    && schema.allOf === undefined
    && schema.not === undefined
    && schema.$ref === undefined
}

function collectSemanticGaps(projection: DtsFileProjectionDocument): readonly DtsClassModelSemanticGap[] {
  const gaps: DtsClassModelSemanticGap[] = []
  if (
    isMissingJsDoc(projection.module.jsdoc)
    || projection.module.jsdocSource === 'inferred'
    || isWeakModuleJsDoc(projection.module.jsdoc)
  ) {
    gaps.push(createModuleSemanticGap(projection.module))
  }
  for (const model of Object.values(projection.models)) {
    if (isMissingJsDoc(model.jsdoc)) {
      gaps.push(createSemanticGap({ kind: 'model', model, provenance: model.provenance }))
    }
    const constructorMeta = model.declarationKind === 'class' ? model.classDecl.constructorMeta : undefined
    if (constructorMeta !== undefined && isMissingJsDoc(constructorMeta.jsdoc)) {
      gaps.push(createSemanticGap({
        kind: 'constructor',
        model,
        provenance: constructorMeta.provenance,
        memberName: 'constructor',
      }))
    }
    for (const attribute of semanticGapAttributes(model)) {
      if (isMissingJsDoc(attribute.jsdoc)) {
        gaps.push(createSemanticGap({
          kind: 'attribute',
          model,
          provenance: attribute.provenance,
          memberName: attribute.name,
        }))
      }
    }
    for (const method of semanticGapMethods(model)) {
      if (isMissingJsDoc(method.jsdoc)) {
        gaps.push(createSemanticGap({
          kind: 'method',
          model,
          provenance: method.provenance,
          memberName: method.name,
        }))
      }
    }
  }
  return gaps
}

function semanticGapAttributes(model: DtsTypeDeclarationModel): readonly AttributeMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.attributes
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.attributes
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.attributes
  return model.enumDecl.members
}

function semanticGapMethods(model: DtsTypeDeclarationModel): readonly MethodMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.methods
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.methods
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.methods
  return []
}

function createModuleSemanticGap(module: DtsFileModuleSemanticMeta): DtsClassModelSemanticGap {
  return {
    kind: 'module',
    className: module.name,
    moduleName: module.name,
    reason: moduleSemanticGapReason(module),
    chainBreak: describeModuleSemanticGapChainBreak(module),
    fixHint: `在 ${module.sourceFile} 文件顶部补高质量模块级 JSDoc：说明职责、边界和 AI 选择该模块的用途，然后重新运行 generate:class-model-surface。`,
    declarationFile: module.sourcePath,
    declarationLine: 1,
    sourceFile: module.sourceFile,
    ...(module.componentName === undefined ? {} : { componentName: module.componentName }),
    ...(module.componentType === undefined ? {} : { componentType: module.componentType }),
    ...(module.componentLevel === undefined ? {} : { componentLevel: module.componentLevel }),
    ...(module.componentLayer === undefined ? {} : { componentLayer: module.componentLayer }),
    ...(module.componentDirectory === undefined ? {} : { componentDirectory: module.componentDirectory }),
  }
}

function createSemanticGap(command: CreateSemanticGapCommand): DtsClassModelSemanticGap {
  const { kind, model, provenance, memberName } = command
  const declarationFile = provenance?.file ?? ''
  const declarationLine = provenance?.line ?? 1
  const sourceFile = sourceFileFromEmitPath(declarationFile)
  return {
    kind,
    className: model.name,
    ...(memberName === undefined ? {} : { memberName }),
    reason: 'missing-jsdoc',
    chainBreak: describeSemanticGapChainBreak(kind, model, memberName),
    fixHint: `在 ${sourceFile} 的对应声明前补 JSDoc，然后重新运行 generate:class-model-surface。`,
    declarationFile,
    declarationLine,
    sourceFile,
    ...(provenance?.componentName === undefined ? {} : { componentName: provenance.componentName }),
    ...(provenance?.componentType === undefined ? {} : { componentType: provenance.componentType }),
    ...(provenance?.componentLevel === undefined ? {} : { componentLevel: provenance.componentLevel }),
    ...(provenance?.componentLayer === undefined ? {} : { componentLayer: provenance.componentLayer }),
    ...(provenance?.componentDirectory === undefined ? {} : { componentDirectory: provenance.componentDirectory }),
    ...(provenance?.declarationKind === undefined ? {} : { declarationKind: provenance.declarationKind }),
  }
}

function isMissingJsDoc(jsdoc: string): boolean {
  return jsdoc.trim().length === 0
}

function isWeakModuleJsDoc(jsdoc: string): boolean {
  const normalized = jsdoc.trim()
  if (normalized.length === 0) return false
  if (!hasModuleSemanticSections(normalized)) return true
  return /^@module\s+[^\n]+\n(?:@spark-appworks\/[^\s]+|app|workspace) 的 [^\n]+ 模块。\n导出 DtsTypeDeclarationModel symbol:/u.test(normalized)
    || /^@module\s+[^\n]+\n[^\n]+ 模块，属于 SPARK component [^\n]+。\n组件目录:/u.test(normalized)
    || /^@module\s+[^\n]+\n[^\n]+\n该 DTS shard 当前不导出 DtsTypeDeclarationModel symbol。$/u.test(normalized)
}

function hasModuleSemanticSections(jsdoc: string): boolean {
  return /^@module\s+\S+/u.test(jsdoc.trim())
    && jsdoc.includes('职责：')
    && jsdoc.includes('边界：')
    && jsdoc.includes('AI用途：')
}

function moduleSemanticGapReason(module: DtsFileModuleSemanticMeta): DtsClassModelSemanticGap['reason'] {
  if (module.jsdocSource === 'inferred') return 'inferred-module-jsdoc'
  if (isWeakModuleJsDoc(module.jsdoc)) return 'weak-module-jsdoc'
  return 'missing-jsdoc'
}

function describeModuleSemanticGapChainBreak(module: DtsFileModuleSemanticMeta): string {
  if (module.jsdocSource === 'inferred') {
    return `${module.name} 的模块级语义链断开：文件入口没有 JSDoc；当前只能使用路径、组件目录和导出 symbol 推导。`
  }
  if (isWeakModuleJsDoc(module.jsdoc)) {
    return `${module.name} 的模块级语义链过弱：当前说明只复述包名、路径、组件目录或 symbol 列表，没有表达职责、边界和使用场景。`
  }
  return `${module.name} 的模块级语义链断开：文件入口没有 JSDoc。`
}

function describeSemanticGapChainBreak(
  kind: DtsClassModelSemanticGapKind,
  model: DtsTypeDeclarationModel,
  memberName: string | undefined,
): string {
  if (kind === 'model') {
    return `${model.name} 的模型语义链在首次声明处断开：声明没有 JSDoc。`
  }
  if (kind === 'constructor') {
    return `${model.name}.constructor 的构造语义链断开：构造签名没有 JSDoc。`
  }
  return `${model.name}.${memberName ?? '<unknown>'} 的成员语义链断开：${kind} 声明没有 JSDoc。`
}

function createSemanticGapReport(
  gaps: readonly DtsClassModelSemanticGap[],
): DtsClassModelSemanticGapReport {
  const sorted = [...gaps].sort(compareSemanticGaps)
  return {
    gapCount: sorted.length,
    notes: [
      '.d.ts 是类型关系真源；declarationRelations 保留 extends / alias / intersection / union 等直接声明边。',
      'module 是单个 DTS shard 的入口语义；必须来自源文件头 JSDoc（职责/边界/AI用途），路径推导只作定位日志。',
      'model、constructor、attribute、method 都会记录 JSDoc 缺口；CI 门禁仅阻断 module/model/constructor。',
    ],
    gaps: sorted,
  }
}

function compareSemanticGaps(left: DtsClassModelSemanticGap, right: DtsClassModelSemanticGap): number {
  return left.declarationFile.localeCompare(right.declarationFile)
    || left.declarationLine - right.declarationLine
    || left.className.localeCompare(right.className)
    || left.kind.localeCompare(right.kind)
    || (left.memberName ?? '').localeCompare(right.memberName ?? '')
}
