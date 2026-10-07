/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererVirtualCard/types
 * 职责：集中定义 RendererVirtualCard（r-virtual-card）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 table-level/data-view-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer virtual card 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { DataRow } from '@spark-appworks/spark-data'
import type { BaseContainerApi } from '../../support/crud/base-container-api.js'

/** Renderer Virtual Card Api 的语义模型。 */
export type RendererVirtualCardApi = BaseContainerApi & {
  /** 获取当前虚拟卡片列表的全部行数据。 */
  getRows(): DataRow[]
  /** 获取已缓存的页码列表。 */
  getCachedPages(): number[]
  /** 获取正在加载中的页码列表。 */
  getPendingPages(): number[]
  /** 获取当前视口可见的页码列表。 */
  getVisiblePages(): number[]
  /** 获取当前页码。 */
  getCurrentPage(): number
  /** 获取总页数。 */
  getTotalPages(): number
  /** 获取滚动进度描述文本。 */
  getScrollProgress(): string
  /** 获取数据加载策略描述文本。 */
  getLoadPolicyText(): string
  /** 获取滚轮交互状态描述文本。 */
  getWheelStatusText(): string
  /** 滚动到指定页码。 */
  scrollToPage(page: number): Promise<void>
  /** 清空已缓存的分页数据。 */
  clearCache(): void
}
