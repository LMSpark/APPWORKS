/**
 * @module @spark-appworks/spark-component:components/fields/data-components/file/FieldUpload/FieldUpload.props
 * 职责：定义 FieldUpload（r-upload）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field upload 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps, SparkUploadFieldProps } from '../../../../shared-types'

/** RUpload Props 的属性契约。 */
export type RUploadProps = SparkNodeProps & SparkUploadFieldProps & {
  /** 选择文件后是否立即开始上传。 */
    autoUpload?: boolean
    /** 是否展示已选择文件列表。 */
    showFileList?: boolean
    /** 允许上传的文件数量上限。 */
    limit?: number
    /** 上传列表展示样式。 */
    listType?: 'text' | 'picture' | 'picture-card'}
