/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererSteps/RendererSteps.props
 * 职责：定义 RendererSteps（r-steps）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer steps 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../shared-types'
import type { RToolbarProps } from '../RendererToolbar.types'
import type { SparkNode } from '@spark-appworks/spark-data'

/** RSteps Props 的属性契约。 */
export type RStepsProps = SparkNodeProps & {
  /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 当前步骤 */
    modelValue?: string | number
    /** 步骤切换回调（value 为当前 step 的 value） */
    onStepChange?: (value: string | number, step: SparkNode, index: number) => void}
