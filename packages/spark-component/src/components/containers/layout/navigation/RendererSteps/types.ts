/**
 * @module @spark-appworks/spark-component:components/containers/layout/navigation/RendererSteps/types
 * 职责：集中定义 RendererSteps（r-steps）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/layout-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer steps 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
/** Renderer Steps Api 的语义模型。 */
export type RendererStepsApi = {
  /** 获取当前激活步骤的标识（name 或 index）。 */
  getActiveStep(): string | number | undefined
  /** 获取当前激活步骤的零基索引。 */
  getActiveStepIndex(): number
  /** 按索引切换到指定步骤。 */
  setActiveStep(index: number): void
  /** 前进到下一步骤。 */
  nextStep(): void
  /** 回退到上一步骤。 */
  prevStep(): void
  /** 获取步骤总数。 */
  getStepCount(): number
  /** 获取全部步骤的名称列表。 */
  getStepNames(): Array<string | number>
  /** 当前是否处于第一步。 */
  isFirstStep(): boolean
  /** 当前是否处于最后一步。 */
  isLastStep(): boolean
}
