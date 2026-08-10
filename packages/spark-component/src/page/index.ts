/**
 * @module @spark-appworks/spark-component:page/index
 * 职责：汇总导出 page 的组件、props、types 和 zero-code 能力。
 * 边界：只维护目录级公开表面，不实现具体渲染逻辑，也不创建新的运行时状态。
 * AI用途：判断某个组件能力是否应对外暴露或被注册表扫描时，用本模块确认导出入口。
 */
/**
 * 页面编排层入口。
 *
 * 仅聚合页面渲染、页面数据集生命周期以及页面上下文类型。
 */

export { default as SparkPageRenderer } from './renderer/SparkPageRenderer.vue'
export { usePageDataSet } from './renderer/usePageDataSet.js'

export type {
  UsePageDataSetOptions,
  UsePageDataSetReturn,
} from './renderer/usePageDataSet.js'

export type {
  PageContext,
} from './context/types.js'
