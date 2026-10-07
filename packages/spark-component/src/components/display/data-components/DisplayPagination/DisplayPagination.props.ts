/**
 * @module @spark-appworks/spark-component:components/display/data-components/DisplayPagination/DisplayPagination.props
 * 职责：定义 DisplayPagination（r-pagination）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 display/data-display 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 display pagination 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../shared-types'

/** RPagination Props 的属性契约。 */
export type RPaginationProps = SparkNodeProps & {
  /** 总条数 */
  total?: number
    /** 每页条数 */
    pageSize?: number
    /** 当前页 */
    currentPage?: number
    /** 每页条数选项 */
    pageSizes?: number[]
    /** 页码按钮数量 */
    pagerCount?: number
    /** 布局模板 */
    layout?: string
    /** 是否显示背景 */
    background?: boolean
    /** 是否小尺寸 */
    small?: boolean
    /** 单页时是否隐藏 */
    hideOnSinglePage?: boolean}
