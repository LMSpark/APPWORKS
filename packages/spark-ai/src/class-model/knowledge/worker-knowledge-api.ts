/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/worker-knowledge-api
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 worker-knowledge-api 能力，围绕 ClassModelKnowledgeWorkerInitInput、ClassModelKnowledgeWorkerApi 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/knowledge/worker-knowledge-api 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { JsonValue } from '@spark-appworks/spark-json-document'
import type {
  ClassModelAttributeGuideInput,
  ClassModelKnowledgeQueryInput,
  ClassModelMethodGuideInput,
  ClassModelModelGuideInput,
} from './class-model-knowledge-service'

/** Class Model Knowledge Worker Init Input 的输入数据。 */
export type ClassModelKnowledgeWorkerInitInput = Readonly<{
  /** DtsTypeDeclarationModel bundle 分片 manifest.json。 */
  dtsClassModelManifestUrl: string
  /** 业务根 className；DTS 模型里 kind 与 className 同值。 */
  rootClassName: string
}>

/** Class Model Knowledge Worker Refresh Input 的输入数据。 */
export type ClassModelKnowledgeWorkerRefreshInput = Readonly<{
  /** 需要增量刷新的类名；省略时从 rootClassName 全量重建。 */
  requestedClassName?: string
}>

/** Class Model Knowledge Worker Api 的语义模型。 */
export type ClassModelKnowledgeWorkerApi = Readonly<{
  /** 一次性初始化：加载 manifest、创建知识提供者；必须先于其他方法调用。 */
  init(input: ClassModelKnowledgeWorkerInitInput): Promise<{ initialized: true }>
  /** 重新加载知识分片；可指定 className 做增量刷新，否则全量重建。 */
  refresh(input?: ClassModelKnowledgeWorkerRefreshInput): Promise<{ refreshed: true }>
  /** 结构化查询：返回类模型摘要、成员列表等 JSON 数据，供程序消费。 */
  query(input: ClassModelKnowledgeQueryInput): Promise<JsonValue>
  /** 渲染完整类声明的 .d.ts 风格文本，供 LLM 作为上下文知识。 */
  modelGuide(input: ClassModelModelGuideInput): Promise<string>
  /** 渲染单个属性的聚焦声明文本（含所属类头部），供 LLM 精确理解属性语义。 */
  attributeGuide(input: ClassModelAttributeGuideInput): Promise<string>
  /** 渲染单个方法的聚焦声明文本（含所属类头部和完整签名），供 LLM 精确理解方法语义。 */
  methodGuide(input: ClassModelMethodGuideInput): Promise<string>
}>
