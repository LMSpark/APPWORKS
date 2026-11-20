/**
 * @module @spark-appworks/spark-utils:internal/index
 * 职责：提供框架无关基础设施 internal 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑 capability、HTTP、日志、脚本类型或历史快照。
 * 边界：保持底层工具包纯净，不依赖 Vue、spark-data 或应用壳层，也不承载业务配置。
 * AI用途：需要跨包复用基础能力或确认底层协议时，用本模块理解 internal/index。
 */
export {
  isRecord,
  isObject,
  isCallable,
  copyOwnEnumerableProperties,
  readProperty,
  readPrototypeProperty,
  readStringProperty,
  readNonEmptyStringProperty,
  readNumberProperty,
  readBooleanProperty,
  isStringArray,
  readStringArrayProperty,
} from './guards'
