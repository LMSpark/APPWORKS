/**
 * @module @spark-appworks/spark-component:components/fields/data-components/text/FieldAutocomplete/FieldAutocomplete.props
 * 职责：定义 FieldAutocomplete（r-autocomplete）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field autocomplete 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../../shared-types'

/** Fetch Suggestions Callback 的语义模型。 */
export type FetchSuggestionsCallback = {
  (suggestions: Array<Record<string, unknown>>): void}

/** RAutocomplete Props 的属性契约。 */
export type RAutocompleteProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 弹出建议面板前是否先基于当前焦点触发一次拉取。 */
    fetchSuggestions?: (queryString: string, cb: FetchSuggestionsCallback) => void
    /** 获得焦点时是否立即触发建议查询。 */
    triggerOnFocus?: boolean
    /** 是否默认高亮第一条候选项。 */
    highlightFirstItem?: boolean
    /** 建议项中作为展示值的字段名。 */
    valueKey?: string}
