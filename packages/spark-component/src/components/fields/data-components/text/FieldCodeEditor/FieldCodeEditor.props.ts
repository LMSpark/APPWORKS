/**
 * @module @spark-appworks/spark-component:components/fields/data-components/text/FieldCodeEditor/FieldCodeEditor.props
 * 职责：声明绑定DataView字段的代码编辑器属性。
 * 边界：字段读取、写入及权限由标准字段链承接，编辑器只处理代码文本。
 * AI用途：编辑页面脚本或样式时，按正式DataView视图、currentRow成员和text字段配置此组件。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../../shared-types'

/** 标准代码字段组件属性。 */
export type RCodeEditorProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** JavaScript或CSS语法模式。 */
  language?: 'javascript' | 'css'
  /** 编辑器高度。 */
  height?: number | string
  /** Tab缩进空格数。 */
  tabSize?: number
  /** 是否自动换行。 */
  lineWrapping?: boolean
}
