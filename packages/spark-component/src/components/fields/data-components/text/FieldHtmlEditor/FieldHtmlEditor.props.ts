/**
 * @module @spark-appworks/spark-component:components/fields/data-components/text/FieldHtmlEditor/FieldHtmlEditor.props
 * 职责：定义 FieldHtmlEditor（r-html-editor）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field html editor 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkMultilineFieldProps, SparkNodeProps } from '../../../../shared-types'
import type { RichTextImageUploadState } from '../../composables/state/useHtmlEditorState'

/** RHtml Editor Props 的属性契约。 */
export type RHtmlEditorProps = SparkNodeProps & SparkMultilineFieldProps<string> & {
  /** 宿主图片上传器：接收用户选择的原生图片 File，返回已持久化且可经富文本安全策略的图片地址；缺省时不显示图片按钮。 */
  imageUploader?: (file: File) => Promise<string>
  /** 图片上传进行数与最近错误变化时通知宿主（如上传中或失败时阻止保存）。 */
  onImageUploadState?: (state: RichTextImageUploadState) => void
}
