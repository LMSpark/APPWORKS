/**
 * @module @spark-appworks/spark-component:components/containers/layout/structure/RendererCollapse/types
 * 职责：集中定义 RendererCollapse（r-collapse）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/layout-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer collapse 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
/** Renderer Collapse Api 的语义模型。 */
export type RendererCollapseApi = {
  /** 获取当前展开的面板项（单个或数组）。 */
  getExpandedItems(): string | number | Array<string | number> | undefined
  /** 设置展开的面板项。 */
  setExpandedItems(value: string | number | Array<string | number>): void
  /** 展开全部面板项。 */
  expandAll(): void
  /** 折叠全部面板项。 */
  collapseAll(): void
  /** 切换指定面板项的展开/折叠状态。 */
  toggleItem(name: string | number): void
  /** 查询指定面板项是否处于展开状态。 */
  isItemExpanded(name: string | number): boolean
}
