/**
 * @module @spark-appworks/spark-component:ai/components/diagnostics/AiSessionTracePanel/AiSessionTracePanel.props
 * 职责：维护 @spark-appworks/spark-component 中 ai/components/AiSessionTracePanel.props 的模块能力，围绕 AiSessionTracePanelProps 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/components/AiSessionTracePanel.props 的声明、导出和使用边界时，从本模块开始。
 */
import type { StreamDisplayEntry, SessionDiagnosticsData } from '../../../types'

/**
 * AiSessionTracePanel 根组件 Props。
 */
export type AiSessionTracePanelProps = Readonly<{
  /** 外部 AI runtime 传入的 live 流展示条目。 */
  entries: readonly StreamDisplayEntry[]
  /** 是否正在接收流式增量。 */
  isStreaming: boolean
  /** 是否正在接收推理文本。 */
  isReasoning: boolean
  /** 外部诊断投影（永远有值，含空摘要）。 */
  diagnostics: SessionDiagnosticsData
  /** 面板高度 CSS 值，默认 '100%'。 */
  height?: string
  /** 无 live entries 且诊断投影为空时的占位文本。 */
  emptyText?: string
}>
