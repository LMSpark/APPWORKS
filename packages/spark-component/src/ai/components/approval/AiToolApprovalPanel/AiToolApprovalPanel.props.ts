/**
 * @module @spark-appworks/spark-component:ai/components/approval/AiToolApprovalPanel/AiToolApprovalPanel.props
 * 职责：维护 @spark-appworks/spark-component 中 ai/components/AiToolApprovalPanel.props 的模块能力，围绕 AiToolApprovalPanelProps 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/components/AiToolApprovalPanel.props 的声明、导出和使用边界时，从本模块开始。
 */
import type { ToolApprovalDisplayItem } from '../../../types'

/** Ai Tool Approval Panel Props 的属性契约。 */
export type AiToolApprovalPanelProps = Readonly<{
  /** 当前等待用户审批的工具调用列表；用户 allow/reject/abort 后由消费方从数组中移除对应项 */
  pending: readonly ToolApprovalDisplayItem[]
  /** 无待审批项时的占位文案，未设置时使用组件默认文案 */
  emptyText?: string
}>
