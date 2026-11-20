/**
 * @module @spark-appworks/spark-utils:clone
 * 职责：提供框架无关基础设施 clone 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑 capability、HTTP、日志、脚本类型或历史快照。
 * 边界：保持底层工具包纯净，不依赖 Vue、spark-data 或应用壳层，也不承载业务配置。
 * AI用途：需要跨包复用基础能力或确认底层协议时，用本模块理解 clone。
 */
/**
 * 深克隆工具
 *
 * 基于原生 `structuredClone`，保留 `undefined`、`Date`、`Map`、`Set`、`ArrayBuffer` 等
 * 结构化克隆算法支持的所有类型。
 *
 * 不可克隆值（函数、Symbol 键、DOM 节点等）由 `structuredClone` 原生抛 `DataCloneError`，
 * 不做包装、不做退化。
 */

export function deepClone<T>(value: T): T {
  return structuredClone(value)
}
