/**
 * @module @spark-appworks/spark-component:components/fields/data-components/text/FieldText/FieldText.props
 * 职责：定义 FieldText（r-text）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field text 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../../shared-types'
import type {DataRow, DataViewFilterOperator} from '@spark-appworks/spark-data'

/** RText Props 的属性契约。 */
export type RTextProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 常用筛选中将同一去首尾空白文本用于这些字段的OR条件；完整表达式仍存入绑定DataView。字段必须存在，不能与范围或字段引用筛选混用。 */
  filterAlternatives?: Array<{field: string; operator: DataViewFilterOperator}>
  /** 只读呈现的纯格式化函数；只接收已获准读取的字段值，隐藏/脱敏不调用，不修改输入及存储值。辅助目录的读取权限由格式化函数继续核对。 */
  displayFormatter?: (value: unknown) => string
  /** 表格中直接显示逐行文本输入，默认false沿用文本/双击编辑。优先于editOnDblclick；绑定原DataView单元格，不移动当前行或改变存储值。 */
  showCellControl?: boolean
  /** 常驻单元格的附加只读限制；只能收窄原DataView权限，不能授予写入权限。 */
  cellReadonly?: (row: Readonly<DataRow>) => boolean
  /** 表单文本输入框最大字符数；仅限制用户输入，不截断已有值，不替代模型校验。省略时不限制。 */
  maxlength?: number
  /** 只读呈现时空字符串/null/undefined的显示文字，默认空；不写入字段，不替换隐藏或脱敏结果，输入控件仍编辑原值。 */
  emptyText?: string
  /** 表单输入按密码遮盖并提供显示切换，默认false；只影响输入呈现，不改变存储值，也不替代字段读取权限或脱敏。 */
  showPassword?: boolean
}
