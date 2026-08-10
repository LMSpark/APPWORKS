/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-class-model-bundle-loader
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 dts-class-model-bundle-loader 能力，围绕 DtsClassModelBundleLoaderOptions、DtsClassModelBundleLoader 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/dts-class-model-bundle-loader 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { JsonSchema } from '@spark-appworks/spark-json-document'
import type {
  AttributeMeta,
  DtsTypeDeclarationModel,
  ConstructorMeta,
  DtsTypeMeta,
  MethodMeta,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
} from './types'
import { resolveMethodReturnType, visitDtsTypeMeta } from './dts-type-meta-ops'
import type {
  DtsClassModelBundleComponentEntry,
  DtsClassModelBundleManifest,
  DtsFileProjectionDocument,
} from './dts-bundle-types'
import type { DtsClassModelSurfaceDocument } from './dts-surface-types'
import { CLASS_MODEL_EMIT_SOURCE } from './class-model-emit-path'
import { resolveDtsBundleRelativeUrl } from './dts-bundle-url'
import {
  readDtsClassModelBundleManifest,
  readDtsFileProjectionDocument,
} from './read-dts-class-model-bundle-json'
import { createRuntimeApiMetadataFromSurface } from './dts-surface-to-runtime-api'
import type { AiRuntimeApiMetadataJson } from '../metadata'

/** Dts Class Model Bundle Loader Options 的调用配置。 */
export type DtsClassModelBundleLoaderOptions = Readonly<{
  /** bundle manifest.json 的 URL，loader 从此文件发现所有 shard 路径。 */
  manifestUrl: string
  /** 自定义 JSON 获取函数；默认使用 fetch + JSON.parse，Node 环境需注入 fs-based 实现。 */
  fetchJson?: (url: string) => Promise<unknown>
}>

/** Component index query；所有字段是 AND 条件，单字段命中走 manifest 倒排索引。 */
export type DtsClassModelComponentQuery = Readonly<{
  /** 精确匹配 component.name，如 RendererTable。 */
  name?: string
  /** 精确匹配 component.type，如 r-table。 */
  type?: string
  /** 精确匹配 component.level，如 table-level / row-level / field-level。 */
  level?: ComponentClassModelLevel
  /** 精确匹配 component.layer，如 data-view-container / row-scope / data-field。 */
  layer?: ComponentClassModelLayer
  /** 精确匹配 component.directory，如 containers/data-views。 */
  directory?: string
}>

/** Dts Class Model Bundle Loader 的语义模型。 */
export class DtsClassModelBundleLoader {
  private manifestPromise: Promise<DtsClassModelBundleManifest> | undefined
  private readonly filePromises = new Map<string, Promise<DtsFileProjectionDocument>>()
  private readonly loadedModels = new Map<string, DtsTypeDeclarationModel>()
  private readonly loadedFilePaths = new Set<string>()
  private readonly fetchJson: (url: string) => Promise<unknown>

    /** 创建 Dts Class Model Bundle Loader 实例。 */
public constructor(private readonly options: DtsClassModelBundleLoaderOptions) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson
  }

    /** 执行 init 操作。 */
public async init(): Promise<DtsClassModelBundleManifest> {
    return await this.loadManifest()
  }

    /** 清空已加载 manifest/shard/model 缓存，下次查询重新读取 bundle。 */
public clearCache(): void {
    this.manifestPromise = undefined
    this.filePromises.clear()
    this.loadedModels.clear()
    this.loadedFilePaths.clear()
  }

    /** 重新读取 manifest，用于编译器更新 generated bundle 后刷新知识。 */
public async reload(): Promise<DtsClassModelBundleManifest> {
    this.clearCache()
    return await this.loadManifest()
  }

    /** ensure Class Name 名称。 */
public async ensureClassName(className: string): Promise<DtsTypeDeclarationModel> {
    const cached = this.loadedModels.get(className)
    if (cached !== undefined) return cached

    const manifest = await this.loadManifest()
    const entry = manifest.classIndex[className]
    if (entry === undefined) {
      throw new Error(`DTS class-model bundle has no className "${className}".`)
    }
    await this.ensureSourcePath(entry.sourcePath)
    const model = this.loadedModels.get(className)
    if (model === undefined) throw new Error(`DTS file did not provide className "${className}".`)
    return model
  }

    /** ensure Source Path 路径。 */
public async ensureSourcePath(sourcePath: string): Promise<DtsFileProjectionDocument> {
    const existing = this.filePromises.get(sourcePath)
    if (existing !== undefined) return await existing

    const manifest = await this.loadManifest()
    const entry = manifest.files[sourcePath]
    if (entry === undefined) {
      throw new Error(`DTS class-model bundle has no sourcePath "${sourcePath}".`)
    }
    const promise = this.loadFile(resolveDtsBundleRelativeUrl(this.options.manifestUrl, entry.file))
    this.filePromises.set(sourcePath, promise)
    const projection = await promise
    this.loadedFilePaths.add(sourcePath)
    for (const [className, model] of Object.entries(projection.models)) {
      if (!this.loadedModels.has(className)) this.loadedModels.set(className, model)
    }
    return projection
  }

    /** 执行 ensure Reachable Closure 操作。 */
  public async ensureReachableClosure(rootClassName: string): Promise<readonly string[]> {
    await this.ensureClassName(rootClassName)
    const manifest = await this.loadManifest()
    const visited = new Set<string>()
    const reachable: string[] = []
    const queue = [rootClassName]
    while (queue.length > 0) {
      const className = queue.shift()
      if (className === undefined || visited.has(className)) continue
      visited.add(className)
      reachable.push(className)
      const model = await this.ensureClassName(className)
      for (const linked of listLinkedClassNames(manifest, model)) {
        if (!visited.has(linked)) queue.push(linked)
      }
    }
    return reachable
  }

    /** 按 manifest componentIndex 查询组件模型，不扫全量 shard。 */
  public async listComponentIndexEntries(
    query: DtsClassModelComponentQuery = {},
  ): Promise<readonly DtsClassModelBundleComponentEntry[]> {
    const manifest = await this.loadManifest()
    return listManifestComponentEntries(manifest, query)
  }

    /** 按 componentIndex 命中结果加载对应 shard，并返回 className 列表。 */
  public async ensureComponentQuery(
    query: DtsClassModelComponentQuery,
  ): Promise<readonly string[]> {
    const entries = await this.listComponentIndexEntries(query)
    const sourcePaths = new Set(entries.map(entry => entry.sourcePath))
    for (const sourcePath of sourcePaths) await this.ensureSourcePath(sourcePath)
    return entries.map(entry => entry.className)
  }

    /**
     * 从已加载的 guide manifest 闭包构建 script 用 runtime API metadata。
     * guide 与 script 共用同一 shard 中的 paramsSchema / returnSchema。
     */
  public async buildRuntimeApiMetadata(rootClassName: string): Promise<AiRuntimeApiMetadataJson> {
    await this.ensureReachableClosure(rootClassName)
    return createRuntimeApiMetadataFromSurface(this.buildLoadedSurface(), rootClassName)
  }

    /** 执行 build Loaded Surface 操作。 */
public buildLoadedSurface(configPath = ''): DtsClassModelSurfaceDocument {
    const models: Record<string, DtsTypeDeclarationModel> = {}
    for (const [className, model] of this.loadedModels.entries()) models[className] = model
    const fileIndex: Record<string, readonly string[]> = {}
    for (const sourcePath of this.loadedFilePaths) fileIndex[sourcePath] = []
    return {
      schemaVersion: 1,
      source: CLASS_MODEL_EMIT_SOURCE,
      configPath,
      models,
      fileIndex,
    }
  }

  private async loadManifest(): Promise<DtsClassModelBundleManifest> {
    this.manifestPromise ??= this.fetchJson(this.options.manifestUrl).then(readDtsClassModelBundleManifest)
    return await this.manifestPromise
  }

  private async loadFile(url: string): Promise<DtsFileProjectionDocument> {
    return readDtsFileProjectionDocument(await this.fetchJson(url))
  }
}

function listLinkedClassNames(manifest: DtsClassModelBundleManifest, model: DtsTypeDeclarationModel): readonly string[] {
  const linked = new Set<string>()
  const constructorMeta = linkedConstructor(model)
  if (constructorMeta !== undefined) {
    collectFromTypeText(manifest, linked, constructorMeta.signatureText)
    for (const parameter of constructorMeta.parameters ?? []) {
      collectFromDtsType(manifest, linked, parameter.type)
    }
    if (constructorMeta.paramsSchema !== undefined) {
      for (const schema of Object.values(constructorMeta.paramsSchema.properties ?? {})) {
        collectFromSchema(manifest, linked, schema)
      }
    }
  }
  for (const attribute of linkedAttributes(model)) collectFromSchema(manifest, linked, attribute.schema ?? true)
  for (const method of linkedMethods(model)) {
    collectFromTypeText(manifest, linked, method.signatureText)
    for (const parameter of method.parameters ?? []) {
      collectFromDtsType(manifest, linked, parameter.type)
    }
    collectFromDtsType(manifest, linked, resolveMethodReturnType(method))
    collectFromSchema(manifest, linked, method.returnSchema)
    if (method.paramsSchema !== undefined) {
      for (const schema of Object.values(method.paramsSchema.properties ?? {})) {
        collectFromSchema(manifest, linked, schema)
      }
    }
  }
  return [...linked]
}

function listManifestComponentEntries(
  manifest: DtsClassModelBundleManifest,
  query: DtsClassModelComponentQuery,
): readonly DtsClassModelBundleComponentEntry[] {
  const componentIndex = manifest.componentIndex
  if (componentIndex === undefined) return []
  const classNames = candidateComponentClassNames(componentIndex, query)
  return classNames
    .map(className => componentIndex.entries[className])
    .filter((entry): entry is DtsClassModelBundleComponentEntry =>
      entry !== undefined && componentEntryMatchesQuery(entry, query)
    )
}

function candidateComponentClassNames(
  componentIndex: NonNullable<DtsClassModelBundleManifest['componentIndex']>,
  query: DtsClassModelComponentQuery,
): readonly string[] {
  const buckets: Array<readonly string[]> = []
  if (query.name !== undefined) buckets.push(componentIndex.byName[query.name] ?? [])
  if (query.type !== undefined) buckets.push(componentIndex.byType[query.type] ?? [])
  if (query.level !== undefined) buckets.push(componentIndex.byLevel[query.level] ?? [])
  if (query.layer !== undefined) buckets.push(componentIndex.byLayer[query.layer] ?? [])
  if (query.directory !== undefined) buckets.push(componentIndex.byDirectory[query.directory] ?? [])
  if (buckets.length === 0) return Object.keys(componentIndex.entries)
  return intersectClassNameBuckets(buckets)
}

function intersectClassNameBuckets(buckets: ReadonlyArray<readonly string[]>): readonly string[] {
  const [first, ...rest] = [...buckets].sort((left, right) => left.length - right.length)
  if (first === undefined) return []
  const remaining = rest.map(bucket => new Set(bucket))
  return first.filter(className => remaining.every(bucket => bucket.has(className)))
}

function componentEntryMatchesQuery(
  entry: DtsClassModelBundleComponentEntry,
  query: DtsClassModelComponentQuery,
): boolean {
  const component = entry.component
  return (query.name === undefined || component.name === query.name)
    && (query.type === undefined || component.type === query.type)
    && (query.level === undefined || component.level === query.level)
    && (query.layer === undefined || component.layer === query.layer)
    && (query.directory === undefined || component.directory === query.directory)
}

function collectFromDtsType(
  manifest: DtsClassModelBundleManifest,
  linked: Set<string>,
  typeMeta: DtsTypeMeta | undefined,
): void {
  visitDtsTypeMeta(typeMeta, (node) => {
    if (node.type !== 'reference' || node.refersToTypeParameter === true) return
    if (manifest.classIndex[node.name] !== undefined) {
      linked.add(node.name)
      return
    }
    collectFromTypeText(manifest, linked, node.name)
  })
}

function collectFromTypeText(
  manifest: DtsClassModelBundleManifest,
  linked: Set<string>,
  typeText: string | undefined,
): void {
  if (typeText === undefined) return
  for (const className of Object.keys(manifest.classIndex)) {
    if (containsTypeReference(typeText, className)) linked.add(className)
  }
}

function collectFromSchema(
  manifest: DtsClassModelBundleManifest,
  linked: Set<string>,
  schema: JsonSchema | undefined,
): void {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object') return
  if (typeof schema.$ref === 'string') collectFromTypeText(manifest, linked, schema.$ref)
  if (typeof schema.title === 'string') collectFromTypeText(manifest, linked, schema.title)
  if (schema.items !== undefined) collectFromSchema(manifest, linked, schema.items)
  for (const child of Object.values(schema.properties ?? {})) collectFromSchema(manifest, linked, child)
  for (const child of schema.anyOf ?? []) collectFromSchema(manifest, linked, child)
  for (const child of schema.oneOf ?? []) collectFromSchema(manifest, linked, child)
  for (const child of schema.allOf ?? []) collectFromSchema(manifest, linked, child)
}

function linkedConstructor(model: DtsTypeDeclarationModel): ConstructorMeta | undefined {
  return model.declarationKind === 'class' ? model.classDecl.constructorMeta : undefined
}

function linkedAttributes(model: DtsTypeDeclarationModel): readonly AttributeMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.attributes
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.attributes
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.attributes
  return model.enumDecl.members
}

function linkedMethods(model: DtsTypeDeclarationModel): readonly MethodMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.methods
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.methods
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.methods
  return []
}

function containsTypeReference(typeText: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'u').test(typeText)
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load DTS class-model JSON: ${url} ${String(response.status)}`)
  }
  return await response.json()
}
