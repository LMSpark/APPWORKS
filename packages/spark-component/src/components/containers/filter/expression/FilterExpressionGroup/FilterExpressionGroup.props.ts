/**
 * @module @spark-appworks/spark-component:components/containers/filter/expression/FilterExpressionGroup/FilterExpressionGroup.props
 * 职责：递归过滤分组的交互输入。边界：共享编辑器草稿与字段约束，不拥有查询；AI用途：可用此合同配置嵌套分组编辑。
 */
import type { DataViewFilterField } from '@spark-appworks/spark-data'
import type {
  FilterExpressionEditorDraft, FilterExpressionEditorGroup,
} from '../FilterExpressionEditor/FilterExpressionEditor.props'

/** 单个分组与共享草稿的递归渲染输入，深度和条件数限制由编辑器统一提供。 */
export type FilterExpressionGroupProps = {
  group: FilterExpressionEditorGroup
  draft: FilterExpressionEditorDraft
  fields: readonly DataViewFilterField[]
  depth: number
  maxDepth: number
  maxRules: number
  disabled?: boolean
}
