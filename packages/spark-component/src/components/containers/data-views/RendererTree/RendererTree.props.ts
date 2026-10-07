/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTree/RendererTree.props
 * 职责：定义 RendererTree（r-tree）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 table-level/data-view-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer tree 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { DataView } from '@spark-appworks/spark-data'
import type {
  SparkCrudDataContainerProps,
  SparkNodeProps,
} from '../../../shared-types'
import type { RToolbarProps } from '../../layout/action/RendererToolbar/RendererToolbar.types'
import type { REditorProps } from '../../zones/RendererEditor.types'
import type { TreeEventHandler } from './zero-code'

/**
 * r-tree 组件公开属性接口。
 *
 * 命名规范：组件 type `r-tree` → 接口名 `RTreeProps`。
 */
export type RTreeProps = SparkNodeProps & SparkCrudDataContainerProps & {
  /** 显式收窄为树容器使用的 DataView 数据线。 */
    dataSource?: DataView
    /** 结构化工具栏 */
    toolbar?: RToolbarProps
    /** 结构化节点动作（toolbar 结构） */
    actions?: RToolbarProps
    /** 结构化编辑区 */
    editor?: REditorProps
    /** 节点主键字段名，默认取 treeConfig.idField */
    nodeKey?: string
    /** 当前选中节点 ID */
    currentKey?: string | number | null
    /** 初始化展开并定位到目标节点 ID */
    expandToKey?: string | number | null
    /** 初始化自动展开到指定层级（根节点为第 1 层） */
    expandLevel?: number
    /** 节点点击回调 */
    onNodeClick?: TreeEventHandler
    /** 节点展开回调 */
    onNodeExpand?: TreeEventHandler
    /** 节点折叠回调 */
    onNodeCollapse?: TreeEventHandler
    /** 透传给 el-tree 的显式属性 */
    treeProps?: Record<string, unknown>}
