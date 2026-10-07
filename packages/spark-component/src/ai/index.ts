/**
 * @module @spark-appworks/spark-component:ai/index
 * 职责：维护 @spark-appworks/spark-component 中 ai/index 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/index 的声明、导出和使用边界时，从本模块开始。
 */
// ── 组件 ──
export { default as AiSessionTracePanel } from './components/diagnostics/AiSessionTracePanel/AiSessionTracePanel.vue'
export { default as AiToolApprovalCard } from './components/approval/AiToolApprovalCard/AiToolApprovalCard.vue'
export { default as AiToolApprovalPanel } from './components/approval/AiToolApprovalPanel/AiToolApprovalPanel.vue'
export { default as SparkAgentPanel } from './components/SparkAgentPanel/SparkAgentPanel.vue'

// ── composables ──

// ── 组件 Props 类型 ──
export type { AiSessionTracePanelProps } from './components/diagnostics/AiSessionTracePanel/AiSessionTracePanel.props'
export type { SessionStreamViewProps } from './components/session/SessionStreamView/SessionStreamView.props'
export type { SessionChatBubbleProps } from './components/session/SessionChatBubble/SessionChatBubble.props'
export type { SessionReasoningBlockProps } from './components/session/SessionReasoningBlock/SessionReasoningBlock.props'
export type { SessionToolCallCardProps } from './components/session/SessionToolCallCard/SessionToolCallCard.props'
export type { SessionDiagnosticsPanelProps } from './components/diagnostics/SessionDiagnosticsPanel/SessionDiagnosticsPanel.props'
export type { AiToolApprovalCardProps, AiToolApprovalCardEmits } from './components/approval/AiToolApprovalCard/AiToolApprovalCard.props'
export type { AiToolApprovalPanelProps } from './components/approval/AiToolApprovalPanel/AiToolApprovalPanel.props'
export type { SparkAgentPanelProps } from './components/SparkAgentPanel/SparkAgentPanel.props'

// ── composable 类型 ──

// ── 领域类型（SSOT） ──
export type {
  StreamDisplayEntry,
  ToolCallDisplayItem,
  ReasoningDisplayItem,
  SessionDiagnosticsData,
  SessionDiagnosticIssue,
  SparkAgentTimelineEvent,
  ToolApprovalDisplayItem,
} from './types'
