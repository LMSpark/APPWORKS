/**
 * @module @spark-appworks/spark-utils:error-utils
 * 职责：提供框架无关的 error utils 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * 通用错误工具函数
 *
 * 提供类型安全的错误处理辅助方法，消除全项目中的
 * `error instanceof Error ? error.message : String(error)` 重复模式。
 */

/**
 * 从 unknown 类型的错误中安全提取消息字符串。
 *
 * @param error - catch 块捕获的未知值
 * @returns 错误消息字符串
 *
 * @example
 * ```ts
 * try { ... } catch (e: unknown) {
 *   logger.error(toErrorMessage(e))
 * }
 * ```
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

/**
 * 将 unknown 类型的值归一化为 Error 实例。
 *
 * @param error - catch 块捕获的未知值
 * @returns Error 实例（如果 error 已是 Error 则直接返回，否则包装为 Error）
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(toErrorMessage(error))
}
