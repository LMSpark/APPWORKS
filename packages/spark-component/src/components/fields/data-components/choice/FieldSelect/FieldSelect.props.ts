/**
 * @module @spark-appworks/spark-component:components/fields/data-components/choice/FieldSelect/FieldSelect.props
 * 职责：定义 FieldSelect（r-select）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field select 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkFieldMemberProps, SparkNodeProps, SparkOptionFieldProps } from '../../../../shared-types'
import type {DataRow} from '@spark-appworks/spark-data'

/**
 * 单值选择字段的属性契约。下拉选项在展开时挂载，关闭后释放；标题读取当前同一选项源并严格匹配值类型。
 * 没有匹配选项时显示原值，不自动选中其他候选；选择、清空和取消沿原字段DataView处理。
 * dataMember=value且未指定dataField/field时，控件选择绑定视图的一条记录；选项值须为该视图主键。
 * 此模式读取选中主键数组中的单个值；选择/清空经DataView.setSelectedRows并同步移动当前行，供下游按字段取值的级联使用。
 * 不编辑记录或扩大字段权限；readonly和宿主禁用仍生效。
 * valuePath 时选择值写入源字段内的 JSON 成员，记录选择模式不适用。
 */
export type RSelectProps = SparkNodeProps & SparkOptionFieldProps<string | number> & SparkFieldMemberProps & {
  /** 直接绑定平面选项视图时修剪文本选项值并排除空白；默认false。须显式声明optionValueField，只用于字段值，不能用于记录选择或级联；原视图不变，修剪后值冲突会禁用选择并提示。 */
  optionValueTrim?: boolean
  /** 允许可搜索的普通文本字段输入候选外的非空字符串，默认false。仅写原字段，不新增或选择选项记录；记录选择及tabs不开放。远端选项须完成本次查询，禁用同值候选不能借输入放行；数据列和领域保存约束仍生效。 */
  allowCreate?: boolean
  /** 单值选择的呈现方式，默认select；tabs以横向页签展示同一选项和值，不承载面板或另建选择状态。 */
  presentation?: 'select' | 'tabs'
  /** 表格中直接显示逐行选择控件，默认false沿用文本/双击编辑。true时优先于editOnDblclick；绑定该单元格的原视图和行，不移动当前行指针。清空写入空字符串；写权限仍由DataView判定。 */
  showCellControl?: boolean
  /** 逐行额外只读限制，只能收窄DataView写权限；用于showCellControl的单元格。 */
  cellReadonly?: (row: Readonly<DataRow>) => boolean
}
