/**
 * @module @spark-appworks/spark-component:components/fields/data-components/picker/FieldEntityPicker/FieldEntityPicker.props
 * 职责：定义 FieldEntityPicker（r-entity-picker）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field entity picker 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { PageSelectorOption } from '../../../../internal'
import type {
  SparkNodeProps,
  SparkOptionFieldProps,
  SparkPrimaryActionTextProps,
  SparkReadonlyActionTextProps,
} from '../../../../shared-types'

/** REntity Picker Props 的属性契约。 */
export type REntityPickerProps = SparkNodeProps & SparkOptionFieldProps<PageSelectorOption['value'] | Array<PageSelectorOption['value']> | string> & SparkPrimaryActionTextProps & SparkReadonlyActionTextProps & {
  /** 是否允许对实体候选项执行搜索。 */
    searchable?: boolean
    /** 实体类型名称，用于驱动选择器语义或远端查询。 */
    entityName?: string}
