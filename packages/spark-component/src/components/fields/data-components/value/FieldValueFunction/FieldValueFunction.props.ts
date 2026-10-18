/**
 * @module @spark-appworks/spark-component:components/fields/data-components/value/FieldValueFunction/FieldValueFunction.props
 * 职责：声明绑定字符串字段的值函数编辑合同。
 * 边界：只编辑定义，不执行函数或保存；候选由完整视图键定位。
 * AI用途：在表单、表格或详情中以同一字段子组件维护值函数。
 */
import type {DataRow, DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import type {SparkNodeProps, SparkFieldSemanticProps} from '../../../../shared-types'

/** r-value-function读写原DataView的JSON字符串字段，旧文本在确认编辑前保持原样。 */
export type RValueFunctionProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 表格行的附加只读限制；只能收紧原字段权限，不能授予写入权限。 */
  cellReadonly?: (row: Readonly<DataRow>) => boolean
  /** 弹窗打开或关闭时通知宿主；切换绑定、失权及卸载也会通知关闭，不表示已保存。 */
  onDialogVisibleChange?: (visible: boolean) => void
  /** 函数编辑目录及上下文；候选更新保留未确认草稿，使旧回调失效，确认时按最新目录校验。不授予后端执行权限。 */
  functionContext?: DataViewFilterFunctionContext
  /** GetApiPublicParam候选所在完整视图键；值与标题使用该视图valueField/labelField并消费读取权限。查询回填更新候选；切换视图键关闭旧编辑会话。 */
  publicParameterDataViewKey?: string
  /** GetInputParam/GetObjectArray候选所在完整视图键；消费已保存输入定义的valueField/labelField及读取权限。查询回填更新候选；切换视图键关闭旧编辑会话。 */
  inputParameterDataViewKey?: string
}
