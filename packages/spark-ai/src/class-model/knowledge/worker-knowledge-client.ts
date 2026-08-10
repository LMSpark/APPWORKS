/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/worker-knowledge-client
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 worker-knowledge-client 能力，围绕 WorkerClassModelKnowledgeProvider 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/knowledge/worker-knowledge-client 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import { wrap, type Remote } from 'comlink'
import type { JsonValue } from '@spark-appworks/spark-json-document'
import type {
  ClassModelAttributeGuideInput,
  ClassModelKnowledgeProvider,
  ClassModelKnowledgeQueryInput,
  ClassModelMethodGuideInput,
  ClassModelModelGuideInput,
} from './class-model-knowledge-service'
import type {
  ClassModelKnowledgeWorkerApi,
  ClassModelKnowledgeWorkerInitInput,
} from './worker-knowledge-api'

/** Create Worker Dts Class Model Knowledge Provider Options 的调用配置。 */
export type CreateWorkerDtsClassModelKnowledgeProviderOptions =
  ClassModelKnowledgeWorkerInitInput & Readonly<{
    /** Worker 脚本的 URL，用于在主线程创建 Web Worker 实例；必须指向知识链路的 worker 入口文件。 */
    workerUrl: string | URL
    /** 传递给 Worker 构造函数的选项（如 type: 'module'），默认为 { type: 'module' }。 */
    workerInit?: WorkerOptions
    /** 自定义 Worker 创建函数，用于替代默认的 new Worker()；在非浏览器环境或需要拦截 Worker 生命周期时注入。 */
    createWorker?: (url: string | URL, options?: WorkerOptions) => Worker
  }>

export function createWorkerDtsClassModelKnowledgeProvider(
  options: CreateWorkerDtsClassModelKnowledgeProviderOptions,
): WorkerClassModelKnowledgeProvider {
  const worker = (options.createWorker ?? createBrowserWorker)(
    options.workerUrl,
    options.workerInit ?? DEFAULT_WORKER_OPTIONS,
  )
  return new WorkerClassModelKnowledgeProvider(worker, {
    dtsClassModelManifestUrl: normalizeRequiredText(
      options.dtsClassModelManifestUrl,
      'dtsClassModelManifestUrl',
    ),
    rootClassName: normalizeRequiredText(options.rootClassName, 'rootClassName'),
  })
}

/**
 * 主线程 knowledge provider。
 *
 * 成熟 Worker 通信由 Comlink 负责；主线程只传 metadata/catalog URL 和小查询参数。
 * 注意：本文件不得 import spark-json-document，也不得 import generated metadata JSON。
 */
export class WorkerClassModelKnowledgeProvider implements ClassModelKnowledgeProvider {
  private readonly api: Remote<ClassModelKnowledgeWorkerApi>
  private readonly initialized: Promise<{ initialized: true }>

    /** 创建 Worker Class Model Knowledge Provider 实例。 */
public constructor(worker: Worker, init: ClassModelKnowledgeWorkerInitInput) {
    this.api = wrap<ClassModelKnowledgeWorkerApi>(worker)
    this.initialized = this.api.init(init)
  }

    /** 查询参数。 */
public async query(input: ClassModelKnowledgeQueryInput): Promise<JsonValue> {
    await this.initialized
    return this.api.query(input)
  }

    /** 显式刷新 worker 内 knowledge bundle，并让 worker 重新加载 manifest。 */
public async refresh(requestedClassName?: string): Promise<void> {
    await this.initialized
    await this.api.refresh(requestedClassName === undefined ? {} : { requestedClassName })
  }

    /** 执行 model Guide 操作。 */
public async modelGuide(input: ClassModelModelGuideInput): Promise<string> {
    await this.initialized
    return this.api.modelGuide(input)
  }

    /** 执行 attribute Guide 操作。 */
public async attributeGuide(input: ClassModelAttributeGuideInput): Promise<string> {
    await this.initialized
    return this.api.attributeGuide(input)
  }

    /** 执行 method Guide 操作。 */
public async methodGuide(input: ClassModelMethodGuideInput): Promise<string> {
    await this.initialized
    return this.api.methodGuide(input)
  }
}

const DEFAULT_WORKER_OPTIONS: WorkerOptions = { type: 'module' }

function createBrowserWorker(url: string | URL, options?: WorkerOptions): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error('DTS DtsTypeDeclarationModel knowledge requires Web Worker on-demand loading.')
  }
  return new Worker(url, options)
}

function normalizeRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`DTS DtsTypeDeclarationModel worker knowledge requires ${field}.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`DTS DtsTypeDeclarationModel worker knowledge requires ${field}.`)
  }
  return trimmed
}
