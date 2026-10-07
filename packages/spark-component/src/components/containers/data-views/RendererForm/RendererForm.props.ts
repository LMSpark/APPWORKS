/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererForm/RendererForm.props
 * 职责：定义 RendererForm（r-form）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 table-level/data-view-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer form 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { DataMember, DataView } from '@spark-appworks/spark-data'
import type {
  SparkCrudDataContainerProps,
  SparkGridLayoutProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { RToolbarProps } from '../../layout/action/RendererToolbar/RendererToolbar.types'

/**
 * r-form 组件公开属性接口。
 *
 * 命名规范：组件 type `r-form` → 接口名 `RFormProps`。
 */
export type RFormProps = SparkNodeProps & SparkCrudDataContainerProps & SparkGridLayoutProps & {
  /** 显式收窄为表单容器使用的 DataView 数据线。 */
    dataSource?: DataView
    /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 上下文 DataView 成员，默认 currentRow。 */
    contextDataMember?: DataMember | `${DataMember}`
    /** 上下文成员内部业务字段或点路径。 */
    contextDataField?: string
    /** 没有显式 children 时，是否从 DataView.columns 自动生成字段。默认 true。 */
    autoColumns?: boolean
    /** 表单标签宽度 */
    labelWidth?: string
    /** 透传给 el-form 的显式属性 */
    formProps?: Record<string, unknown>}
