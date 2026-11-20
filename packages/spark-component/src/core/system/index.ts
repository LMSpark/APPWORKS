/**
 * @module @spark-appworks/spark-component:system/index
 * 职责：汇总导出 system 的组件、props、types 和 zero-code 能力。
 * 边界：只维护目录级公开表面，不实现具体渲染逻辑，也不创建新的运行时状态。
 * AI用途：判断某个组件能力是否应对外暴露或被注册表扫描时，用本模块确认导出入口。
 */
/**
 * system 层入口。
 *
 * 聚合 Spark 命名空间、Vue 插件与组件注册表。
 */

export { Spark } from './spark.js'
export type {
  SparkSystem,
} from './spark.js'

