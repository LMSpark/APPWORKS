/**
 * @module @spark-appworks/spark-component:components/fields/options/useFieldOptions
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/options/useFieldOptions 的字段选项解析合同。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/options/useFieldOptions 的声明、导出和使用边界时，从本模块开始。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { SparkOptionFieldProps } from '../../shared-types.js'
import { PAGE_RUNTIME, useSparkConsume } from '../../internal'
import { DataMember, resolveDataViewMember } from '@spark-appworks/spark-data'
import { useFieldPermission } from '../context/useFieldPermission'
import type { FieldPermissionProps } from '../context/useFieldPermission'
import type { FieldComposableProps } from '../context/field-composable-props'
import { buildOptionSourceFromView } from './option-source.js'
import {
  flattenOptions,
  normalizeMultiValue,
  normalizeOption,
  type FieldOption,
} from './option-normalization.js'

export type { FieldOption } from './option-normalization.js'

/** Field Transfer Option 的语义模型。 */
export type FieldTransferOption = {
    /** 定位键。 */
key: string | number
    /** 展示标签。 */
label: string
    /** 是否禁用。 */
disabled?: boolean}

/** Field Option Props 的属性契约。 */
type FieldOptionProps = FieldComposableProps<Pick<
  SparkOptionFieldProps,
  'options'
  | 'optionLabelField'
  | 'optionValueField'
  | 'optionDisabledField'
  | 'optionChildrenField'
  | 'optionDataViewKey'
  | 'optionDataMember'
  | 'optionDataField'
  | 'valueSeparator'
>>

/** Use Field Options Return 的语义模型。 */
type UseFieldOptionsReturn = {
    /** 调用配置项。 */
options: ComputedRef<FieldOption[]>
    /** flat Options 配置项。 */
flatOptions: ComputedRef<FieldOption[]>
    /** normalize Option Values 回调。 */
normalizeOptionValues: (value: unknown) => Array<string | number | boolean>
    /** find Option Label 回调。 */
findOptionLabel: (value: unknown) => string
    /** find Option Labels 回调。 */
findOptionLabels: (value: unknown) => string[]
    /** format Option Value 回调。 */
formatOptionValue: (value: unknown) => string
    /** format Cascader Value 回调。 */
formatCascaderValue: (value: unknown) => string
    /** transfer Data 字段。 */
transferData: ComputedRef<FieldTransferOption[]>}

/** Use Option Field Options 的调用配置。 */
type UseOptionFieldOptions<TValue> = {
    /** 组件属性集合。 */
props: FieldOptionProps & FieldPermissionProps<TValue>
    /** 类型标识。 */
type: string
    /** fallback Value 字段。 */
fallbackValue: TValue
    /** coerce 回调。 */
coerce: (rawValue: unknown) => TValue
    /** format Display 回调。 */
formatDisplay?: (value: unknown, helpers: UseFieldOptionsReturn) => string}

export function useFieldOptions(props: FieldOptionProps): UseFieldOptionsReturn {
  const resolvedOptionDataViewKey = computed(() => props.optionDataViewKey)
  const resolvedOptionDataMember = computed(() => props.optionDataMember ?? DataMember.Rows)
  const { sparkConsume } = useSparkConsume()
  const runtime = sparkConsume(PAGE_RUNTIME)

  const optionDataView = computed(() => {
    const key = resolvedOptionDataViewKey.value
    if (key === undefined) return null
    if (!runtime) throw new Error('PAGE_RUNTIME_MISSING')
    const view = runtime.resolveView(key)
    if (!view) throw new Error(`DATA_VIEW_MISSING: ${key}`)
    return view
  })

  const optionLabelField = computed(() =>
    props.optionLabelField
    ?? optionDataView.value?.labelField
    ?? optionDataView.value?.treeConfig?.textField
    ?? 'label'
  )
  const optionValueField = computed(() =>
    props.optionValueField
    ?? (typeof optionDataView.value?.valueField === 'string' ? optionDataView.value.valueField : undefined)
    ?? optionDataView.value?.primaryKey
    ?? optionDataView.value?.treeConfig?.idField
    ?? 'value'
  )
  const optionDisabledField = computed(() => props.optionDisabledField ?? 'disabled')
  const optionChildrenField = computed(() => props.optionChildrenField ?? 'children')
  const valueSeparator = computed(() => props.valueSeparator ?? optionDataView.value?.selectionDelimiter ?? ',')

  const options = computed<FieldOption[]>(() => {
    const view = optionDataView.value
    if (view) {
      const source = resolvedOptionDataMember.value === DataMember.Rows
        ? buildOptionSourceFromView(
            view,
            optionLabelField.value,
            optionChildrenField.value,
          )
        : resolveDataViewMember({
            dataViewKey: `${view.tableName}@${view.viewId}`,
            dataMember: resolvedOptionDataMember.value,
            dataField: props.optionDataField,
          }, view.dataSet)

      const rows = Array.isArray(source) ? source : []
      const optionFields = {
        labelField: optionLabelField.value,
        valueField: optionValueField.value,
        childrenField: optionChildrenField.value,
        disabledField: optionDisabledField.value,
      }
      return rows
        .map(row => normalizeOption(row, optionFields))
        .filter((item): item is FieldOption => item !== null)
    }
    const source = props.options ?? []
    if (!Array.isArray(source)) return []
    const optionFields = {
      labelField: optionLabelField.value,
      valueField: optionValueField.value,
      childrenField: optionChildrenField.value,
      disabledField: optionDisabledField.value,
    }
    return source
      .map(item => normalizeOption(item, optionFields))
      .filter((item): item is FieldOption => item !== null)
  })

  const flatOptions = computed(() => flattenOptions(options.value))

  function findOptionLabel(value: unknown): string {
    const match = flatOptions.value.find(option => String(option.value) === String(value))
    return match?.label ?? String(value ?? '')
  }

  function normalizeOptionValues(value: unknown): Array<string | number | boolean> {
    return normalizeMultiValue(value, valueSeparator.value)
  }

  function findOptionLabels(value: unknown): string[] {
    return normalizeOptionValues(value).map(findOptionLabel)
  }

  function formatOptionValue(value: unknown): string {
    const values = normalizeOptionValues(value)
    if (values.length === 0) return ''
    return values.map(findOptionLabel).join(' / ')
  }

  function formatCascaderValue(value: unknown): string {
    if (!Array.isArray(value) || value.length === 0) return ''

    if (value.every(item => Array.isArray(item))) {
      return value
        .map((item) => formatCascaderValue(item))
        .filter(Boolean)
        .join(' ; ')
    }

    return value
      .map(item => findOptionLabel(item))
      .filter(Boolean)
      .join(' / ')
  }

  function toTransferData(): FieldTransferOption[] {
    return flatOptions.value.map(option => {
      const transferOption: FieldTransferOption = {
        key: typeof option.value === 'boolean' ? String(option.value) : option.value,
        label: option.label,
      }
      if (option.disabled === true) {
        transferOption.disabled = true
      }
      return transferOption
    })
  }

  const transferData = computed(() => toTransferData())

  return {
    options,
    flatOptions,
    normalizeOptionValues,
    findOptionLabel,
    findOptionLabels,
    formatOptionValue,
    formatCascaderValue,
    transferData,
  }
}

export function useOptionField<TValue>(options: UseOptionFieldOptions<TValue>) {
  const optionHelpers = useFieldOptions(options.props)
  const permissionHelpers = useFieldPermission<TValue>({
    props: options.props,
    type: options.type,
    fallbackValue: options.fallbackValue,
    coerce: options.coerce,
    formatDisplay: (value: unknown) => options.formatDisplay
      ? options.formatDisplay(value, optionHelpers)
      : optionHelpers.formatOptionValue(value),
  })

  return {
    ...optionHelpers,
    ...permissionHelpers,
  }
}
