/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTable/RendererTable.props
 * 职责：定义 RendererTable（r-table）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 table-level/data-view-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer table 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { DataRow, DataView } from '@spark-appworks/spark-data'
import type {
  SparkInteractiveDataContainerProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { RToolbarProps } from '../../layout/action/RendererToolbar/RendererToolbar.types'
import type { RFilterProps } from '../../zones/RendererFilter.types'

/** 标准表格行的呈现上下文；仅用于样式，不提供编辑或查询入口。 */
export type TableRowClassContext = {
  /** 本次DataView结果中的行；按字段读取前仍须消费原DataView数据权限。 */
  row: Readonly<DataRow>
  /** 当前表格呈现顺序中的索引，从0开始，不作为记录身份。 */
  rowIndex: number
}

/**
 * r-table 组件公开属性接口。
 *
 * 页面只声明标准子组件 children；子组件依据父组件类型及数据上下文渲染。
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
    /**
     * 返回附加行样式类名，空字符串表示不附加；与标准选择样式合并。
     * 只改变呈现，不过滤DataView、不修改查询、当前行、选中集合或编辑草稿。
     * 函数须无副作用；涉及字段分类时由调用方检查绑定DataView的字段读取权限。
     */
    rowClassName?: (context: TableRowClassContext) => string
    /** 是否允许拖动列宽，默认 true。 */
    resizable?: boolean
    /** 设为true且没有显式children时，根据DataView字段生成r-text子组件；由子组件按表格父容器渲染。 */
    autoColumns?: boolean
    /** 是否显示分页器。默认 true；SelfRef或allPages完整集合查询不显示。 */
    showPagination?: boolean
    /** 表格主体最大高度；数值为像素，不包含工具栏和分页器。 */
    maxHeight?: number | string
    /** 分页器呈现；只配置可选每页条数及跳转框，当前页/每页条数和查询仍由绑定DataView管理。 */
    pagination?: {
      /** 可选每页条数，默认10/20/50/100。 */
      pageSizes?: number[]
      /** 是否显示直接跳页输入，默认true。 */
      showJumper?: boolean
    }
    /**
     * 结构化工具栏
     * 提示词模板：默认动作 append-row / refresh / delete-current；当表格开启多选（type=selection）时，使用 delete-selected 批量删除已选择行。
     */
    toolbar?: RToolbarProps
    /**
     * 统一过滤区，完整配置交给 r-filter，使用 DataView 的过滤合同。
     * 未配置时不显示；filter: {} 使用默认配置显示完整表达式编辑器，无需 children。
     * children 可补充绑定模型字段的常用筛选项；dataViewKey 默认沿用表格视图，显式指定时过滤该命名视图。
     */
    filter?: RFilterProps
    /**
     * 行动作复用 RToolbarProps，以 children 编排标准动作子组件。
     * 提示词模板：默认动作 message-row / delete-row。
     */
    actions?: RToolbarProps}
