/**
 * @module @spark-appworks/spark-app:ai/index
 * 职责：提供应用壳层 ai 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 ai/index。
 */
export {
  createAiRunAdapter,
  formatAiRunError,
  noopTraceSink,
} from './ai-run-adapter'

export type {
  AiRunAdapterCommand,
  AiRunAdapterOptions,
  AiRunAdapterRunStatus,
  AiRunAdapterState,
  AiRunAbortHandler,
  AiRunBeforeFunctionCall,
  AiRunErrorFormatter,
  AiRunHost,
  AiRunListener,
  AiRunSnapshot,
  AiRunTimelineEvent,
  AiRunTraceSink,
} from './ai-run-adapter'

export {
  AiToolApprovalBridge,
  createAiToolApprovalBridge,
} from './tool-approval-bridge'

export type {
  AiToolApprovalBridgeListener,
  AiToolApprovalBridgeOptions,
  AiToolApprovalBridgeSnapshot,
  AiToolApprovalRequest,
  AiToolApprovalRequestIdFactory,
} from './tool-approval-bridge'
