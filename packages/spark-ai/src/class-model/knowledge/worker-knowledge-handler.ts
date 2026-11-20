/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/worker-knowledge-handler
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 worker-knowledge-handler 能力，围绕 CreateClassModelKnowledgeWorkerApiOptions 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/knowledge/worker-knowledge-handler 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import { expose, type Endpoint } from 'comlink'
import {
  createDtsBundleClassModelKnowledgeProvider,
  type DtsBundleClassModelKnowledgeRefreshFunction,
  type DtsBundleClassModelKnowledgeRefreshPolicy,
  type DtsBundleClassModelKnowledgeService,
} from './dts-bundle-class-model-knowledge-service'
import type {
  ClassModelKnowledgeWorkerApi,
  ClassModelKnowledgeWorkerInitInput,
} from './worker-knowledge-api'

/** Create Class Model Knowledge Worker Api Options 的调用配置。 */
export type CreateClassModelKnowledgeWorkerApiOptions = Readonly<{
  /** 远程 JSON 获取函数，用于 Worker 内部拉取 manifest/shard；默认使用 fetch()。 */
  fetchJson?: (url: string) => Promise<unknown>
  /** 外部编译/刷新钩子，Worker 在 refresh 时调用以触发宿主侧重新生成知识包。 */
  refreshBundle?: DtsBundleClassModelKnowledgeRefreshFunction
  /** 知识包刷新策略：'never' 不自动刷新（默认），'before-first-load' 首次加载前刷新一次，'always' 每次查询前刷新。 */
  refreshPolicy?: DtsBundleClassModelKnowledgeRefreshPolicy
}>

/**
 * 创建 Worker 端 knowledge API。
 */
export function createClassModelKnowledgeWorkerApi(
  options: CreateClassModelKnowledgeWorkerApiOptions = {},
): ClassModelKnowledgeWorkerApi {
  const fetchJson = options.fetchJson ?? defaultFetchJson
  let statePromise: Promise<ClassModelKnowledgeWorkerState> | undefined

  return {
    async init(input) {
      statePromise = createWorkerStateFromInitInput(input, {
        fetchJson,
        ...(options.refreshBundle === undefined ? {} : { refreshBundle: options.refreshBundle }),
        ...(options.refreshPolicy === undefined ? {} : { refreshPolicy: options.refreshPolicy }),
      })
      await statePromise
      return { initialized: true }
    },

    async refresh(input) {
      await (await requireState()).baseProvider.refresh(input?.requestedClassName)
      return { refreshed: true }
    },

    async query(input) {
      return (await requireState()).baseProvider.query(input)
    },

    async modelGuide(input) {
      return (await requireState()).baseProvider.modelGuide(input)
    },

    async attributeGuide(input) {
      return (await requireState()).baseProvider.attributeGuide(input)
    },

    async methodGuide(input) {
      return (await requireState()).baseProvider.methodGuide(input)
    },
  }

  function requireState(): Promise<ClassModelKnowledgeWorkerState> {
    if (statePromise === undefined) {
      throw new Error('DtsTypeDeclarationModel knowledge worker has not been initialized.')
    }
    return statePromise
  }
}

export function exposeClassModelKnowledgeWorker(workerGlobal?: Endpoint): void {
  const api = createClassModelKnowledgeWorkerApi()
  if (workerGlobal === undefined) {
    expose(api)
    return
  }
  expose(api, workerGlobal)
}

class ClassModelKnowledgeWorkerState {
  public readonly baseProvider: DtsBundleClassModelKnowledgeService

  public constructor(options: Readonly<{
    baseProvider: DtsBundleClassModelKnowledgeService
  }>) {
    this.baseProvider = options.baseProvider
  }
}

async function createWorkerStateFromInitInput(
  input: ClassModelKnowledgeWorkerInitInput,
  options: Readonly<{
    fetchJson: (url: string) => Promise<unknown>
    refreshBundle?: DtsBundleClassModelKnowledgeRefreshFunction
    refreshPolicy?: DtsBundleClassModelKnowledgeRefreshPolicy
  }>,
): Promise<ClassModelKnowledgeWorkerState> {
  if (input.dtsClassModelManifestUrl.length === 0) {
    throw new Error('DTS class-model worker init requires dtsClassModelManifestUrl.')
  }
  if (input.rootClassName.length === 0) {
    throw new Error('DTS class-model worker init requires rootClassName.')
  }
  const provider = createDtsBundleClassModelKnowledgeProvider({
    dtsClassModelManifestUrl: input.dtsClassModelManifestUrl,
    rootClassName: input.rootClassName,
    fetchJson: options.fetchJson,
    ...(options.refreshBundle === undefined ? {} : { refreshBundle: options.refreshBundle }),
    ...(options.refreshPolicy === undefined ? {} : { refreshPolicy: options.refreshPolicy }),
  })
  await provider.init()
  return new ClassModelKnowledgeWorkerState({
    baseProvider: provider,
  })
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load DtsTypeDeclarationModel knowledge JSON: ${url} ${String(response.status)}`)
  }
  return response.json()
}
