/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererList/types
 * 职责：集中定义 RendererList（r-list）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 table-level/data-view-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer list 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { DataRow } from '@spark-appworks/spark-data'
import type { BaseContainerApi } from '../../support/crud/base-container-api.js'

/** Renderer List Api 的语义模型。 */
export type RendererListApi = BaseContainerApi & {
  /** 读取列表当前所有行数据（快照副本） */
  getRows(): DataRow[]
  /** 返回列表当前行数，等效 getRows().length 但避免数组拷贝 */
  getItemCount(): number}
