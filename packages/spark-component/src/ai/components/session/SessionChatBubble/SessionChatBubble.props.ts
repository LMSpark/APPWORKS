/**
 * @module @spark-appworks/spark-component:ai/components/session/SessionChatBubble/SessionChatBubble.props
 * 职责：维护 @spark-appworks/spark-component 中 ai/components/SessionChatBubble.props 的模块能力，围绕 SessionChatBubbleProps 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/components/SessionChatBubble.props 的声明、导出和使用边界时，从本模块开始。
 */
/** Session Chat Bubble Props 的属性契约。 */
export type SessionChatBubbleProps = Readonly<{
  /** 消息角色：user=用户输入，assistant=AI 回复，system=系统通知，error=错误展示。 */
  role: 'user' | 'assistant' | 'system' | 'error'
  /** 消息正文内容。 */
  content: string
  /** 消息发送时间的 Unix 毫秒时间戳。 */
  timestamp?: number
  /** 是否正在流式输出中（显示打字动画）。 */
  isTyping?: boolean
}>
