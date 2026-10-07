/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTable/RendererTable.props
 * 职责：定义 RendererTable（r-table）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 table-level/data-view-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer table 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { DataView } from '@spark-appworks/spark-data'
import type {
  SparkInteractiveDataContainerProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { RToolbarProps } from '../../layout/action/RendererToolbar/RendererToolbar.types'
import type { RFilterProps } from '../../zones/RendererFilter.types'

/**
 * r-table 组件公开属性接口。
 *
 * 命名规范：组件 type `r-table` → 接口名 `RTableProps`。
 */
export type RTableProps = SparkNodeProps & SparkInteractiveDataContainerProps & {
  /** 显式收窄为表格容器使用的 DataView 数据线。 */
    dataSource?: DataView
    /** 是否显示纵向边框。默认 true（resizable 启用时强制开启）。 */
    border?: boolean
    /** 是否开启斑马纹。 */
    stripe?: boolean
    /** 是否高亮当前行。 */
    highlightCurrentRow?: boolean
    /** 行数据的 Key，用于树形表格。 */
    rowKey?: string
    /** 是否允许拖动列宽，默认 true。 */
    resizable?: boolean
    /** 没有显式 children 时，是否从 DataView.columns 自动生成列。默认 true。 */
    autoColumns?: boolean
    /** 是否显示分页器。默认 true。 */
    showPagination?: boolean
    /**
     * 结构化工具栏
     * 提示词模板：默认动作 append-row / refresh / delete-current；当表格开启多选（type=selection）时，使用 delete-selected 批量删除已选择行。
     */
    toolbar?: RToolbarProps
    /**
     * 结构化筛选区
     * 提示词模板：常用字段过滤 + range 过滤；优先复用列字段并保持字段名一致。
     */
    filter?: RFilterProps
    /**
     * 结构化行动作
     * 提示词模板：默认动作 message-row / delete-row。
     */
    actions?: RToolbarProps}
