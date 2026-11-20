/**
 * @module @spark-appworks/spark-component:components/containers/layout/structure/RendererSection/types
 * 职责：集中定义 RendererSection（r-section）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/layout-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer section 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
/** Renderer Section Api 的语义模型。 */
export type RendererSectionApi = {
  /** 查询当前折叠状态；返回 true 表示 section 内容已收起。 */
  isCollapsed(): boolean
  /** 设置折叠状态；true 收起内容，false 展开内容。 */
  setCollapsed(value: boolean): void
  /** 切换折叠状态：展开则收起，收起则展开。 */
  toggle(): void}
