/**
 * @module @spark-appworks/spark-ai:agent/tool-runtime/index
 * 职责：支撑 AI Agent 运行链路中的 tool-runtime 能力，围绕 模块入口、副作用注册或内部组合逻辑 定义业务会话、工具循环、传输或脚本执行契约。
 * 边界：只处理 agent 层协议和运行编排，不承载具体页面业务规则，也不绕过 Host 注入的工具与审批。
 * AI用途：排查会话、工具调用、SSE 传输或 native script 链路时，用本模块理解 agent/tool-runtime/index 的位置。
 */
export {
  AiAgentToolCheck,
  AiAgentToolResult,
} from './tool-runtime-types'

export type {
  AiAgentRuntimeHostContext,
  AiAgentToolCheckLevel,
  AiAgentToolResultOptions,
  AiAgentToolRuntime,
  AiAgentToolRuntimeInspectFinding,
  AiAgentToolRuntimeInspectReport,
  AiAgentToolRuntimeKnowledgeProjection,
  AiAgentToolSpec,
} from './tool-runtime-types'
