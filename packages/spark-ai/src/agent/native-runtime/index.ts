/**
 * @module @spark-appworks/spark-ai:agent/native-runtime/index
 * 职责：支撑 AI Agent 运行链路中的 native-runtime 能力，围绕 模块入口、副作用注册或内部组合逻辑 定义业务会话、工具循环、传输或脚本执行契约。
 * 边界：只处理 agent 层协议和运行编排，不承载具体页面业务规则，也不绕过 Host 注入的工具与审批。
 * AI用途：排查会话、工具调用、SSE 传输或 native script 链路时，用本模块理解 agent/native-runtime/index 的位置。
 */
export {
  AiApiScriptActionFailure,
  createAiApiScriptContext,
  createAiApiScriptContext as createAiNativeApiScriptContext,
  executeAiApiAction,
} from './native-script-context'

export {
  createAiNativeScriptContext,
  executeAiNativeScript,
} from './native-script-runner'

export {
  createDtsNativeRuntimeApiMetadata,
  executeDtsNativeScript,
} from './dts-native-script-runner'

export type {
  AiApiScriptContextCommand,
  ExecuteAiApiActionCommand,
} from './native-script-context'

export type {
  AiNativeRuntimeSchemaDefs,
  AiNativeScriptContextCommand,
  AiNativeScriptRunCommand,
} from './native-script-runner'

export type {
  DtsNativeScriptRunCommand,
} from './dts-native-script-runner'
