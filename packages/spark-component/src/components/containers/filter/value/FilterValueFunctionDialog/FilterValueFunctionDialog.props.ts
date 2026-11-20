/**
 * @module @spark-appworks/spark-component:components/containers/filter/value/FilterValueFunctionDialog/FilterValueFunctionDialog.props
 * 职责：值函数弹框的输入合同。
 * 边界：可用函数由调用上下文提供，弹框不执行查询。
 * AI用途：为过滤条件接入值函数编辑时确认上下文与确认值的形状。
 */
import type { DataViewFilterFunctionContext, DataViewFilterValueFunction } from '@spark-appworks/spark-data'

/** 值函数编辑输入；可见状态由父级控制，原值与上下文用于恢复草稿和验证可用函数。 */
export type FilterValueFunctionDialogProps = {
  modelValue: boolean
  value?: DataViewFilterValueFunction | undefined
  context: DataViewFilterFunctionContext
}
