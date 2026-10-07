/**
 * @module @spark-appworks/spark-component:ai/components/SparkAgentPanel/SparkAgentPanel.props
 * 职责：定义 SparkAgentPanel 组合壳 props。
 * 边界：只描述现有 AI trace UI 与 AG-UI timeline 投影的组合输入。
 * AI用途：接入 AG-UI 事件展示时，用本模块确认组件输入契约。
 */
import type {
  SessionDiagnosticsData,
  SparkAgentTimelineEvent,
  StreamDisplayEntry,
} from '../../types'

/** SparkAgentPanel 的组合输入，复用既有 trace UI，并可选展示 AG-UI timeline 摘要。 */
export type SparkAgentPanelProps = Readonly<{
  /** 流式展示条目列表（由外部 AI runtime 传入）。 */
  entries: readonly StreamDisplayEntry[]
  /** 是否正在接收流式文本增量。 */
  isStreaming: boolean
  /** 是否正在接收推理文本。 */
  isReasoning: boolean
  /** 会话诊断数据投影（永远有值，含空摘要）。 */
  diagnostics: SessionDiagnosticsData
  /** AG-UI timeline 事件列表（可选）。 */
  timelineEvents?: readonly SparkAgentTimelineEvent[]
  /** 是否展示 AG-UI timeline 摘要面板。 */
  showTimeline?: boolean
  /** 面板高度 CSS 值。 */
  height?: string
  /** 无 live entries 且诊断为空时的占位文本。 */
  emptyText?: string
  /** timeline 面板无事件时的占位文本。 */
  timelineEmptyText?: string
}>
