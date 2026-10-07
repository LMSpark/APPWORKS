/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/dts-bundle-class-model-knowledge-service
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 dts-bundle-class-model-knowledge-service 能力，围绕 DtsBundleClassModelKnowledgeServiceOptions、DtsBundleClassModelKnowledgeService 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/knowledge/dts-bundle-class-model-knowledge-service 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { JsonValue } from '@spark-appworks/spark-json-document'
import { DtsClassModelBundleLoader, type DtsClassModelComponentQuery } from '../class-model/bundle/dts-class-model-bundle-loader'
import {
  ClassModelKnowledgeService,
  type ClassModelAttributeGuideInput,
  type ClassModelKnowledgeProvider,
  type ClassModelKnowledgeQueryInput,
  type ClassModelMethodGuideInput,
  type ClassModelModelGuideInput,
} from './class-model-knowledge-service'

/** Dts Bundle Class Model Knowledge Service Options 的调用配置。 */
export type DtsBundleClassModelKnowledgeRefreshInput = Readonly<{
  /** 知识闭包的根 className，决定可达模型范围。 */
  rootClassName: string
  /** 触发刷新的目标 className；按需增量编译时使用。 */
  requestedClassName?: string
}>

/** Dts Bundle Class Model Knowledge Refresh Policy 的刷新策略。 */
export type DtsBundleClassModelKnowledgeRefreshPolicy =
  | 'never'
  | 'before-first-load'
  | 'always'

/** Dts Bundle Class Model Knowledge Refresh Function 的刷新函数。 */
export type DtsBundleClassModelKnowledgeRefreshFunction = (
  input: DtsBundleClassModelKnowledgeRefreshInput,
) => Promise<void>

/** Dts Bundle Class Model Knowledge Service Options 的调用配置。 */
export type DtsBundleClassModelKnowledgeServiceOptions = Readonly<{
  /** bundle shard 加载器，负责 manifest 与按需拉取。 */
  loader: DtsClassModelBundleLoader
  /** 知识闭包的根 className。 */
  rootClassName: string
  /** 外部 bundle 刷新钩子，在 reload 前触发重新编译。 */
  refreshBundle?: DtsBundleClassModelKnowledgeRefreshFunction
  /** bundle 刷新策略：never / before-first-load / always。 */
  refreshPolicy?: DtsBundleClassModelKnowledgeRefreshPolicy
}>

/** Create Dts Bundle Class Model Knowledge Provider Options 的调用配置。 */
export type CreateDtsBundleClassModelKnowledgeProviderOptions = Readonly<{
  /** manifest.json 的 URL，loader 入口。 */
  dtsClassModelManifestUrl: string
  /** 知识闭包的根 className。 */
  rootClassName: string
  /** 自定义 JSON fetch；默认使用 fetch。 */
  fetchJson?: (url: string) => Promise<unknown>
  /** 外部 bundle 刷新钩子，在 reload 前触发重新编译。 */
  refreshBundle?: DtsBundleClassModelKnowledgeRefreshFunction
  /** bundle 刷新策略：never / before-first-load / always。 */
  refreshPolicy?: DtsBundleClassModelKnowledgeRefreshPolicy
}>

export function createDtsBundleClassModelKnowledgeProvider(
  options: CreateDtsBundleClassModelKnowledgeProviderOptions,
): DtsBundleClassModelKnowledgeService {
  const dtsClassModelManifestUrl = normalizeRequiredText(
    options.dtsClassModelManifestUrl,
    'dtsClassModelManifestUrl',
  )
  const rootClassName = normalizeRequiredText(options.rootClassName, 'rootClassName')
  const loader = new DtsClassModelBundleLoader({
    manifestUrl: dtsClassModelManifestUrl,
    ...(options.fetchJson === undefined ? {} : { fetchJson: options.fetchJson }),
  })
  return new DtsBundleClassModelKnowledgeService({
    loader,
    rootClassName,
    ...(options.refreshBundle === undefined ? {} : { refreshBundle: options.refreshBundle }),
    ...(options.refreshPolicy === undefined ? {} : { refreshPolicy: options.refreshPolicy }),
  })
}

/** Dts Bundle Class Model Knowledge Service 的语义模型。 */
export class DtsBundleClassModelKnowledgeService implements ClassModelKnowledgeProvider {
  private refreshPromise?: Promise<void>

    /** 创建 Dts Bundle Class Model Knowledge Service 实例。 */
public constructor(private readonly options: DtsBundleClassModelKnowledgeServiceOptions) {}

    /** 初始化 manifest，保持动态加载入口 fail-fast。 */
public async init(): Promise<void> {
    await this.refreshForInput(undefined)
    await this.options.loader.init()
  }

    /** 触发外部编译/刷新钩子，并重新读取 manifest/shard。 */
public async refresh(requestedClassName?: string): Promise<void> {
    const refreshBundle = this.options.refreshBundle
    if (refreshBundle !== undefined) {
      await refreshBundle({
        rootClassName: this.options.rootClassName,
        ...(requestedClassName === undefined ? {} : { requestedClassName }),
      })
    }
    await this.options.loader.reload()
  }

    /** 查询参数。 */
public async query(input: ClassModelKnowledgeQueryInput): Promise<JsonValue> {
    await this.loadForInput(input.kind)
    const componentQuery = componentQueryFromKnowledgeInput(input)
    if (componentQuery !== undefined) await this.options.loader.ensureComponentQuery(componentQuery)
    return this.delegate().query(input)
  }

    /** 执行 model Guide 操作。 */
public async modelGuide(input: ClassModelModelGuideInput): Promise<string> {
    await this.loadForInput(input.kind)
    return this.delegate().modelGuide(input)
  }

    /** 执行 attribute Guide 操作。 */
public async attributeGuide(input: ClassModelAttributeGuideInput): Promise<string> {
    await this.loadForInput(input.kind)
    return this.delegate().attributeGuide(input)
  }

    /** 执行 method Guide 操作。 */
public async methodGuide(input: ClassModelMethodGuideInput): Promise<string> {
    await this.loadForInput(input.kind)
    return this.delegate().methodGuide(input)
  }

  private async loadForInput(className: string | undefined): Promise<void> {
    await this.refreshForInput(className)
    await this.options.loader.ensureReachableClosure(this.options.rootClassName)
    if (className !== undefined) await this.options.loader.ensureClassName(className)
  }

  private async refreshForInput(className: string | undefined): Promise<void> {
    const policy = this.options.refreshPolicy ?? 'never'
    if (policy === 'never') return
    if (policy === 'before-first-load') {
      this.refreshPromise ??= this.refresh(className)
      await this.refreshPromise
      return
    }
    await this.refresh(className)
  }

  private delegate(): ClassModelKnowledgeService {
    return new ClassModelKnowledgeService({
      surface: this.options.loader.buildLoadedSurface(),
      rootClassName: this.options.rootClassName,
    })
  }
}

function normalizeRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`DTS DtsTypeDeclarationModel knowledge requires ${field}.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`DTS DtsTypeDeclarationModel knowledge requires ${field}.`)
  }
  return trimmed
}

function componentQueryFromKnowledgeInput(
  input: ClassModelKnowledgeQueryInput,
): DtsClassModelComponentQuery | undefined {
  const query: DtsClassModelComponentQuery = {
    ...(input.componentName === undefined ? {} : { name: input.componentName }),
    ...(input.componentType === undefined ? {} : { type: input.componentType }),
    ...(input.componentLevel === undefined ? {} : { level: input.componentLevel }),
    ...(input.componentLayer === undefined ? {} : { layer: input.componentLayer }),
    ...(input.componentDirectory === undefined ? {} : { directory: input.componentDirectory }),
  }
  return Object.keys(query).length === 0 ? undefined : query
}
