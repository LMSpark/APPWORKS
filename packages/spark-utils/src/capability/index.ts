/**
 * @module @spark-appworks/spark-utils:capability/index
 * 职责：提供框架无关的 index 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * Spark 能力系统 —— 统一导出入口。
 *
 * 包含两个层次：
 * - core     框架无关的类型定义与原语函数（defineCapability / sparkProvide 等）
 * - helpers  纯能力树遍历工具（sparkFindNearestProvider 等）
 *
 * 注：运行时上下文锚点（WeakMap owner / pageRoot）已迁移至 spark-component。
 */

export {
  CapabilityKey,
  consumeSparkCapability,
  createSparkCapabilityConsumer,
  createSparkCapabilityContext,
  defineCapability,
  getSparkCapabilityProvider,
  sparkConsume,
  sparkProvide,
  sparkRemove,
} from './core.js'

export type {
  CapabilityContext,
  CapabilityName,
  CapabilityReader,
  CapabilityTypeMap,
  SparkCapabilityConsumer,
} from './core.js'

export {
  sparkConsumeFromProvider,
  sparkFindNearestProvider,
  sparkFindNearestProviderByKeys,
} from './helpers.js'
