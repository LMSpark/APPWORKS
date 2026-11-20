/**
 * @module @spark-appworks/spark-component:components/fields/non-data-components/TreeNodeSummary.props
 * 职责：定义 TreeNodeSummary（r-tree-node-summary）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/field-support 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 tree node summary 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RTree Node Summary Props 的属性契约。 */
export type RTreeNodeSummaryProps = SparkNodeProps & {
  /** 名称字段名 */
    nameField?: string
    /** 类型字段名 */
    typeField?: string
    /** 状态字段名 */
    statusField?: string
    /** 负责人字段名 */
    ownerField?: string
    /** 元信息字段名 */
    metaField?: string
    /** 扩展字段名 */
    extraField?: string
    /** 是否展示类型 */
    showType?: boolean
    /** 是否展示状态 */
    showStatus?: boolean
    /** 是否展示负责人 */
    showOwner?: boolean
    /** 是否展示元信息 */
    showMeta?: boolean
    /** 是否展示扩展信息 */
    showExtra?: boolean}
