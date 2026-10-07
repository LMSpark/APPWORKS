/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererDetail/types
 * 职责：集中定义 RendererDetail（r-detail）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 table-level/data-view-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer detail 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { BaseContainerApi } from '../../support/crud/base-container-api.js'

/** Renderer Detail Api 的语义模型。 */
export type RendererDetailApi = BaseContainerApi & {
  /** 读取当前详情行完整数据对象；无当前行时返回空对象 */
  getDetailData(): Record<string, unknown>
  /** 按字段名读取当前详情行单个字段值；字段不存在时返回 undefined */
  getFieldValue(field: string): unknown}
