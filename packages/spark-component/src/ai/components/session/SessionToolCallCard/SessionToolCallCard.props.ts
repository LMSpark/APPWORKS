/**
 * @module @spark-appworks/spark-component:ai/components/session/SessionToolCallCard/SessionToolCallCard.props
 * 职责：维护 @spark-appworks/spark-component 中 ai/components/SessionToolCallCard.props 的模块能力，围绕 SessionToolCallCardProps 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/components/SessionToolCallCard.props 的声明、导出和使用边界时，从本模块开始。
 */
import type { ToolCallDisplayItem } from '../../../types'

/** Session Tool Call Card Props 的属性契约。 */
export type SessionToolCallCardProps = Readonly<{
  /** 当前要展示的工具调用条目，包含工具名、参数预览、调用状态、耗时等渲染所需的投影数据 */
  toolCall: ToolCallDisplayItem
}>
