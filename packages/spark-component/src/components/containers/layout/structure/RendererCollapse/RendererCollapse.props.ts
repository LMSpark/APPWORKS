/**
 * @module @spark-appworks/spark-component:components/containers/layout/structure/RendererCollapse/RendererCollapse.props
 * 职责：定义 RendererCollapse（r-collapse）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer collapse 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'
import type { RToolbarProps } from '../../action/RendererToolbar/RendererToolbar.types'

// 这里不再为 JS 基础类型保留导出别名，折叠面板值直接使用原生联合类型。

/** RCollapse Props 的属性契约。 */
export type RCollapseProps = SparkNodeProps & {
  /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 当前展开的面板 */
    modelValue?: string | number | Array<string | number>
    /** 展开/折叠切换回调 */
    onChange?: (value: string | number | Array<string | number>) => void}
