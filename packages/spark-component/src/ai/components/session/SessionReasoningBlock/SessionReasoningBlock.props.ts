/**
 * @module @spark-appworks/spark-component:ai/components/session/SessionReasoningBlock/SessionReasoningBlock.props
 * 职责：维护 @spark-appworks/spark-component 中 ai/components/SessionReasoningBlock.props 的模块能力，围绕 SessionReasoningBlockProps 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/components/SessionReasoningBlock.props 的声明、导出和使用边界时，从本模块开始。
 */
/** Session Reasoning Block Props 的属性契约。 */
export type SessionReasoningBlockProps = Readonly<{
  /** AI 推理过程的原始文本内容，在折叠区域中展示。 */
  text: string
  /** 推理是否已完成并折叠；true 时显示"推理过程（已完成）"，默认 false。 */
  collapsed?: boolean
  /** 推理是否正在进行中；true 时强制展开折叠面板并显示"正在推理..."，默认 false。 */
  isActive?: boolean
}>
