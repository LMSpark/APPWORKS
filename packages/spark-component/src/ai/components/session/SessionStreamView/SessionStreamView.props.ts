/**
 * @module @spark-appworks/spark-component:ai/components/session/SessionStreamView/SessionStreamView.props
 * 职责：维护 @spark-appworks/spark-component 中 ai/components/SessionStreamView.props 的模块能力，围绕 SessionStreamViewProps 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/components/SessionStreamView.props 的声明、导出和使用边界时，从本模块开始。
 */
import type { StreamDisplayEntry } from '../../../types'

/** Session Stream View Props 的属性契约。 */
export type SessionStreamViewProps = Readonly<{
  /** 流式显示条目数组：每条包含文本增量、推理过程或工具调用结果。 */
  entries: readonly StreamDisplayEntry[]
  /** AI 是否正在流式输出文本增量。 */
  isStreaming: boolean
  /** AI 是否正在输出推理过程（如 chain-of-thought）。 */
  isReasoning: boolean
  /** 无条目时的占位提示文本。 */
  emptyText?: string
}>
