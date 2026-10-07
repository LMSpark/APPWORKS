/**
 * @module @spark-appworks/spark-component:components/containers/layout/navigation/RendererTabs/types
 * 职责：集中定义 RendererTabs（r-tabs）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/layout-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer tabs 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
/** Renderer Tabs Api 的语义模型。 */
export type RendererTabsApi = {
  /** 获取当前激活标签页的 name；无激活时返回 undefined。 */
  getActiveTab(): string | number | undefined
  /** 切换到指定 name 的标签页。 */
  setActiveTab(name: string | number): void
  /** 获取所有标签页面板的 name 列表。 */
  getPaneNames(): Array<string | number>
  /** 获取标签页面板数量。 */
  getPaneCount(): number}
