/**
 * @module @spark-appworks/spark-component:components/fields/data-components/value/FieldValueFunction/FieldValueFunction.props
 * 职责：声明绑定JSON文本或原生对象字段的值函数编辑合同。
 * 边界：只编辑定义，不执行函数或保存；候选由完整视图键定位。
 * AI用途：在表单、表格或详情中以同一字段子组件维护值函数。
 */
import type {DataRow, DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import type {SparkNodeProps, SparkFieldSemanticProps} from '../../../../shared-types'

/** r-value-function读写原DataView字段；默认JSON文本，native显式保存原生值，旧值在确认编辑前保持原样。 */
export type RValueFunctionProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 字段存储格式，默认text保持JSON文本；native读取原生对象并在确认时写回对象，清空写null。modelValue/update事件仍为编辑器JSON文本；打开、取消和未知原值不触发格式转换。 */
  valueFormat?: 'text' | 'native'
  /** 表格行的附加只读限制；只能收紧原字段权限，不能授予写入权限。 */
  cellReadonly?: (row: Readonly<DataRow>) => boolean
  /** 弹窗打开或关闭时通知宿主；切换绑定、失权及卸载也会通知关闭，不表示已保存。 */
  onDialogVisibleChange?: (visible: boolean) => void
  /** 函数编辑目录及上下文；候选更新保留未确认草稿，使旧回调失效，确认时按最新目录校验。不授予后端执行权限。 */
  functionContext?: DataViewFilterFunctionContext
  /** GetApiPublicParam候选所在完整视图键；值与标题使用该视图valueField/labelField并消费读取权限。查询回填更新候选；切换视图键关闭旧编辑会话。 */
  publicParameterDataViewKey?: string
  /** GetInputParam/GetObjectArray候选所在完整视图键；消费输入定义的valueField/labelField及读取权限，与functionContext.inputParams中的当前定义目录按原生值去重，视图项及其标题/禁用状态优先。声明目录不是视图权限或旧查询的回退；不授予函数执行权限。查询回填更新候选；切换视图键关闭旧编辑会话。 */
  inputParameterDataViewKey?: string
}
