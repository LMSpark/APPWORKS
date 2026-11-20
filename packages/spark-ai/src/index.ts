/**
 * @module @spark-appworks/spark-ai:index
 * 职责：维护 @spark-appworks/spark-ai 中 index 的 AI 运行时语义。
 * 边界：只服务 spark-ai 包内部的 Agent/ClassModel 能力，不直接耦合应用页面或 Vue 组件。
 * AI用途：定位 spark-ai 公共 API、运行时协议或知识索引字段时，用本模块作为语义入口。
 */
/**
 * @packageDocumentation
 *
 * SPARK AI root facade.
 *
 * Use the focused public entries for new code:
 * - `@spark-appworks/spark-ai/class-model`
 * - `@spark-appworks/spark-ai/agent`
 *
 * JSON Schema / 值类型 SSOT：`@spark-appworks/spark-json-document`（本包不再转发）。
 */

export {
  ClassModelRuntime,
} from './class-model'

export type {
  AiRuntimeApiMetadataJson,
  ClassModelDocument,
  ClassModelKnowledgeProvider,
} from './class-model'

export {
  DefaultAiAgentSessionStore,
  createAiAgentHost,
  startAiAgentRegistrationSession,
} from './agent'
