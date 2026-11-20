/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/index
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 knowledge 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/knowledge/index 这一段如何生成、加载或投影时，用本模块定位职责。
 */
export {
  ClassModelKnowledgeService,
} from './class-model-knowledge-service'

export {
  DtsBundleClassModelKnowledgeService,
  createDtsBundleClassModelKnowledgeProvider,
} from './dts-bundle-class-model-knowledge-service'

export {
  WorkerClassModelKnowledgeProvider,
  createWorkerDtsClassModelKnowledgeProvider,
} from './worker-knowledge-client'

export {
  createClassModelKnowledgeWorkerApi,
  exposeClassModelKnowledgeWorker,
} from './worker-knowledge-handler'

export type {
  ClassModelKnowledgeServiceOptions,
  ClassModelAttributeGuideInput,
  ClassModelKnowledgeProvider,
  ClassModelKnowledgeQueryInput,
  ClassModelMethodGuideInput,
  ClassModelModelGuideInput,
} from './class-model-knowledge-service'

export type {
  CreateDtsBundleClassModelKnowledgeProviderOptions,
  DtsBundleClassModelKnowledgeRefreshFunction,
  DtsBundleClassModelKnowledgeRefreshInput,
  DtsBundleClassModelKnowledgeRefreshPolicy,
  DtsBundleClassModelKnowledgeServiceOptions,
} from './dts-bundle-class-model-knowledge-service'

export type {
  CreateWorkerDtsClassModelKnowledgeProviderOptions,
} from './worker-knowledge-client'

export type {
  CreateClassModelKnowledgeWorkerApiOptions,
} from './worker-knowledge-handler'

export type {
  ClassModelKnowledgeWorkerApi,
  ClassModelKnowledgeWorkerInitInput,
  ClassModelKnowledgeWorkerRefreshInput,
} from './worker-knowledge-api'

export {
  renderAttributeGuide,
  renderMethodGuide,
  renderModelGuide,
} from './projection'

export type {
  AttributeGuide,
  AttributeGuideRenderInput,
  MethodGuide,
  MethodGuideRenderInput,
  ModelGuide,
  ModelGuideRenderInput,
} from './projection'
