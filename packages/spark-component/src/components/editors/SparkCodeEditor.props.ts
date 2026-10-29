/**
 * @module @spark-appworks/spark-component:components/editors/SparkCodeEditor.props
 * 职责：声明通用代码编辑器的语言与呈现属性。
 * 边界：不负责数据绑定；字段级绑定由 FieldCodeEditor 承接。
 * AI用途：需要在可复用字段容器中编辑代码文本时，查看此输入表面属性；页面数据必须经 FieldCodeEditor 绑定。
 */
import type { SparkNodeProps } from '../shared-types'

/** SparkCodeEditor 受控编辑器属性。 */
export type SparkCodeEditorProps = SparkNodeProps & {
  /** 编辑器内容；单独使用时通过 update:modelValue 输出。 */
  modelValue?: string
  /** 当前支持JavaScript和CSS语法。 */
  language?: 'javascript' | 'css'
  /** 禁止输入。 */
  readOnly?: boolean
  /** 编辑器高度。 */
  height?: number | string
  /** Tab缩进空格数。 */
  tabSize?: number
  /** 是否自动换行。 */
  lineWrapping?: boolean
}
