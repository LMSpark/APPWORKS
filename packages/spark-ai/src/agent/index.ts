/**
 * @module @spark-appworks/spark-ai:agent/index
 * 职责：作为 agent 域公共出口，按业务注册、会话、工具循环、transport 和运行时能力聚合导出。
 * 边界：只做稳定 API 汇总，不承载具体业务逻辑，也不引入 app 层或组件层依赖。
 * AI用途：寻找 agent 层公开能力或判断某个类型是否应对外暴露时，先从本模块确认导出边界。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * agent/index.ts — Agent 层公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【导出策略】按功能域分组：
 *   1. 业务类型与注册（scope-types / registration-types）
 *   2. 业务作用域工厂（business-scope）
 *   3. 业务会话（business-session）
 *   4. ClassModel runtime（metadata -> script context / script execution）
 *   5. 聊天 DTO（chat-types）
 *   6. 会话存储（session-types / default-session-store）
 *   7. APP turn 回调契约与事件类型（transport-types / app-sse-events）
 *   8. 工具循环（tool-loop-runner / turn-event-collector）
 *
 * 【设计原则】
 *   - class 用 export，type 用 export type（遵循 verbatimModuleSyntax）
 *   - 仅导出公共 API，内部实现细节不导出
 *   - 禁止 namespace 合并；公共类型从所属文件显式登记
 *
 * 【消费方】@spark-appworks/spark-ai（src/index.ts）、spark-project-model、spark-app
 * ═══════════════════════════════════════════════════════════════
 */

// ── 1. 业务类型与注册 ───────────────────────────────────────

export {
  AI_AGENT_HOST,
  AiAgentHost,
  createAiAgentHost,
} from './business/ai-host'

export type {
  AiAgentHostDryRunDiagnostic,
  AiAgentHostDryRunResult,
  AiAgentHostEnsureCommand,
  AiAgentHostEntryMap,
  AiAgentHostOrchestrationSummary,
  AiAgentHostRegistrationDescription,
  AiAgentHostRegistrationSummary,
  AiAgentHostRunResult,
  CreateAiAgentHostOptions,
} from './business/ai-host'

export {
  AGENT_WORKFLOW_DEFINITION_KIND,
  AGENT_WORKFLOW_DEFINITION_SCHEMA,
  AGENT_WORKFLOW_DEFINITION_VERSION,
  AGENT_WORKFLOW_GRAPH_NODE_TYPES,
  activateAgentWorkflowFromDefinition,
  activateAgentWorkflowDefinition,
  assertAgentWorkflowDefinition,
  createAgentWorkflowDefinitionValidation,
  dryRunAgentWorkflowDefinition,
  interpretAgentWorkflowDefinition,
  resolveAgentWorkflowActivation,
  validateAgentWorkflowDefinition,
} from './workflow'

export type {
  ActivateAgentWorkflowDefinitionCommand,
  AgentWorkflowActivation,
  AgentWorkflowBindings,
  AgentWorkflowDefinition,
  AgentWorkflowDefinitionKind,
  AgentWorkflowDefinitionSchema,
  AgentWorkflowDefinitionSource,
  AgentWorkflowDefinitionSparkMeta,
  AgentWorkflowDefinitionValidation,
  AgentWorkflowDefinitionValidationIssue,
  AgentWorkflowDefinitionValidationSeverity,
  AgentWorkflowDefinitionValidationStatus,
  AgentWorkflowDefinitionVersion,
  AgentWorkflowBody,
  AgentWorkflowBusinessNode,
  AgentWorkflowBusinessNodeData,
  AgentWorkflowCapability,
  AgentWorkflowGraph,
  AgentWorkflowGraphLine,
  AgentWorkflowGraphLineData,
  AgentWorkflowGraphNode,
  AgentWorkflowGraphNodeBase,
  AgentWorkflowGraphNodeType,
  AgentWorkflowJsonRecord,
  AgentWorkflowLineBranch,
  AgentWorkflowLineEndpoint,
  AgentWorkflowLineValidation,
  AgentWorkflowLlmWork,
  AgentWorkflowModelCompletion,
  AgentWorkflowModelCompletionReturnContract,
  AgentWorkflowModelContext,
  AgentWorkflowModelVia,
  AgentWorkflowInterpretedRegistration,
  AgentWorkflowNodeBeforeFunctionCall,
  AgentWorkflowNodeConditionalHint,
  AgentWorkflowNodeExecutableRef,
  AgentWorkflowNodeGateRule,
  AgentWorkflowNodeInputContract,
  AgentWorkflowNodeModelProjectionRef,
  AgentWorkflowNodeResolveInstance,
  AgentWorkflowNodeRuntimeBinding,
  AgentWorkflowNodeRuntimeRegistration,
  AgentWorkflowNodeSystemPrompt,
  AgentWorkflowNodeToolLoopNudge,
  AgentWorkflowNodeValidation,
  AgentWorkflowNodeValidationAction,
  AgentWorkflowNodePosition,
  AgentWorkflowOutputNode,
  AgentWorkflowOutputNodeData,
  AgentWorkflowDryRunCommand,
  AgentWorkflowDryRunResult,
  AgentWorkflowRuntimeBindings,
  AgentWorkflowRuntimeBinding,
  AgentWorkflowRuntimeGateCommand,
  AgentWorkflowRuntimeGateResult,
  AgentWorkflowRuntimeSystemPromptCommand,
  AgentWorkflowStartNode,
  AgentWorkflowStartNodeData,
  AgentWorkflowVariable,
  ResolveAgentWorkflowActivationCommand,
} from './workflow'

export {
  AiAgentRegistration,
} from './business/registration-types'

export {
  createSimpleInputContract,
} from './business/business-kit'

export {
  ClassModelAgentAdapter,
} from './business/class-model-agent-adapter'

export {
  AiAgentRuntimeContext,
  AiAgentScope,
  AiAgentTarget,
} from './business/scope-types'

export {
  AiAgentTask,
  createAiAgentTask,
} from './business/business-task'

export type {
  AiAgentRegistrationOptions,
  AiAgentToolLoopNudgeContext,
  AiAgentToolLoopNudgeReason,
} from './business/registration-types'

export type {
  EnrichFunctionCallFailureCommand,
} from './tool-loop/function-call-recovery-enricher'

export type {
  AiBusinessInputOptions,
  AiBusinessIdOptions,
  CreateSimpleInputContractOptions,
} from './business/business-kit'

export type {
  AiAgentInputContract,
  AiAgentOrchestrationPlan,
  AiAgentTaskChatOptions,
} from './business/business-task'

export type {
  AiAgentAfterFunctionCallOptions,
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentBeforeFunctionCallStatus,
  AiAgentLifecycleDirective,
  AiAgentLifecycleStatus,
} from './business/lifecycle-types'

export type {
  AiAgentAppendMessageOptions,
} from './business/scope-types'

export type {
  AiAgentOptions,
} from './business/host-options'

export {
  AiAgentToolCheck,
  AiAgentToolResult,
} from './tool-runtime'

export type {
  AiAgentRuntimeHostContext,
  AiAgentToolCheckLevel,
  AiAgentToolResultOptions,
  AiAgentToolRuntime,
  AiAgentToolRuntimeInspectFinding,
  AiAgentToolRuntimeInspectReport,
  AiAgentToolRuntimeKnowledgeProjection,
  AiAgentToolSpec,
} from './tool-runtime'

// ── 2. 业务作用域工厂 ───────────────────────────────────────

export {
  createAiAgentScope,
  toAiAgentRuntimeScope,
} from './business/business-scope'

// ── 3. 业务会话 ─────────────────────────────────────────────

export {
  AiAgentSession,
  createAiAgentSession,
  runAiAgent,
  startAiAgentRegistrationSession,
} from './business/business-session'

export type {
  AiAgentRunCommand,
  AiAgentRunResult,
} from './business/business-session'

// ── 4. ClassModel runtime ───────────────────────────────────

export {
  AiApiScriptActionFailure,
  createAiApiScriptContext,
  createAiNativeApiScriptContext,
  createAiNativeScriptContext,
  executeAiApiAction,
  executeAiNativeScript,
} from './native-runtime'

export type {
  AiApiScriptContextCommand,
  AiNativeRuntimeSchemaDefs,
  AiNativeScriptContextCommand,
  AiNativeScriptRunCommand,
  ExecuteAiApiActionCommand,
} from './native-runtime'

// ── 5. 聊天 DTO ─────────────────────────────────────────────

export type {
  AiAgentChatMessage,
  AiAgentChatRequest,
  AiAgentStreamEvent,
  AiAgentToolCallRecord,
  AiAgentTurnMeta,
} from './chat/chat-types'

// ── 6. 会话存储契约 ─────────────────────────────────────────

export {
  AiAgentSessionStore,
} from './session/session-types'

export type {
  AiAgentHistoryEntry,
  AiAgentHistoryEntryBase,
  AiAgentMessageHistoryEntry,
  AiAgentMessageRole,
  AiAgentSessionRecord,
  AiAgentSessionStatus,
  AiAgentStartSessionResult,
} from './session/session-types'

export type {
  AiAgentFunctionCallFailure,
  AiAgentFunctionCallHistoryEntry,
  AiAgentFunctionCallHistoryStatus,
  AiAgentFunctionCallResult,
  AiAgentMessageSource,
} from './session/session-types'

// ── 7. 内存会话存储实现 ─────────────────────────────────────

export {
  DefaultAiAgentSessionStore,
} from './session/default-session-store'

export type {
  DefaultAiAgentSessionStoreOptions,
} from './session/default-session-store'

export {
  createAiAgentSessionTranscript,
  previewAiAgentDiagnosticValue,
  summarizeAiAgentSessionRecord,
} from './session/session-diagnostics'

export type {
  AiAgentSessionSummary,
  AiAgentSessionTranscriptEntry,
  AiAgentSessionTranscriptOptions,
} from './session/session-diagnostics'

export {
  createAiAgentRunTrace,
} from './session/session-run-trace'

export type {
  AiAgentRunTrace,
  AiAgentRunTraceEntry,
  AiAgentRunTraceListener,
  AiAgentRunTraceOptions,
  AiAgentRunTraceReasoning,
  AiAgentRunTraceSnapshot,
  AiAgentRunTraceToolCall,
} from './session/session-run-trace'

// ── 8. APP turn 回调契约与类型 ──────────────────────────────

export {
  createAiAgentTransportTurn,
} from './transport/transport-turn'

export type {
  AiAgentAppendMessagesInput,
  AiAgentAppSseEventSource,
  AiAgentPrepareSessionInput,
  AiAgentStreamTurnInput,
  AiAgentStreamTurnResult,
  AiAgentTurnCallbacks,
  AiAgentTransportMessage,
  AiAgentTransportToolCall,
  AiAgentTransportToolSpec,
} from './transport/transport-types'

export type {
  AiAgentTransportTurn,
} from './transport/transport-turn'

export type {
  AiAgentAppSseEvent,
  AiAgentAppSseEventName,
} from './transport/app-sse-events'

// ── 9. 工具循环执行器 ───────────────────────────────────────

export {
  AiAgentToolLoopRunner,
} from './tool-loop/tool-loop-runner'

export {
  createTurnEventCollector,
} from './tool-loop/turn-event-collector'

export type {
  TurnEventCollector,
} from './tool-loop/turn-event-collector'

// ── 10. AG-UI 旁路协议适配 ─────────────────────────────────

export {
  sparkAgUi,
} from './ag-ui'

export type {
  AGUIEvent,
  RunAgentInput,
  SparkAgUiAdapter,
  SparkAgUiCustomEventName,
  SparkAgUiEventMetadata,
  SparkAgUiRunRef,
  SparkAgUiTextMessageRole,
} from './ag-ui'
