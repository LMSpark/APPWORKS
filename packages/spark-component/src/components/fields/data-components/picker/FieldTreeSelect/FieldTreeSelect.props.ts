/**
 * @module @spark-appworks/spark-component:components/fields/data-components/picker/FieldTreeSelect/FieldTreeSelect.props
 * 职责：定义 FieldTreeSelect（r-tree-select）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field tree select 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkHierarchicalOptionFieldProps, SparkNodeProps } from '../../../../shared-types'

// 这里不再为 JS 基础类型保留导出别名，树选值直接使用原生联合类型。

/** RTree Select Props 的属性契约。 */
export type RTreeSelectProps = SparkNodeProps & SparkHierarchicalOptionFieldProps<string | number | boolean | Array<string | number | boolean>> & {
  /** 初次渲染时是否默认展开全部节点。 */
    defaultExpandAll?: boolean
    /** 是否在节点展开后再渲染其子节点。 */
    renderAfterExpand?: boolean}
