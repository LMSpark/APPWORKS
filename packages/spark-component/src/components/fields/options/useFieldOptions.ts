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
import { DataMember, DataViewSelectionValue, resolveDataViewMember } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'
import { useFieldCascadeOptions } from './useFieldCascadeOptions'
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
  'field' | 'options'
  | 'optionLabelField'
  | 'optionValueField'
  | 'optionDisabledField'
  | 'optionChildrenField'
  | 'optionDataViewKey'
  | 'optionDataMember'
  | 'optionDataField'
  | 'valueSeparator'
>> & {multiple?: boolean | undefined}

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
transferData: ComputedRef<FieldTransferOption[]>
  optionError: ComputedRef<string | undefined>
  optionsAvailable: ComputedRef<boolean>
  toControlValue: (value: unknown, multiple: boolean) => unknown
  toSourceValue: (value: unknown) => unknown
}

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
  const cascade = useFieldCascadeOptions(props)
  const resolvedOptionDataViewKey = computed(() => props.optionDataViewKey)
  const resolvedOptionDataMember = computed(() => props.optionDataMember ?? DataMember.Rows)
  const { sparkConsume } = useSparkConsume()
  const runtime = sparkConsume(PAGE_RUNTIME)

  const optionDataView = computed(() => {
    cascade.configuration.value
    const key = resolvedOptionDataViewKey.value
    const spec = cascade.definition.value
    if (spec) {
      const view = cascade.view.value
      if (!view) throw new Error('FIELD_CASCADE_OPTIONS: 选项视图不存在')
      if ((key !== undefined && runtime?.resolveView(key) !== view)
        || resolvedOptionDataMember.value !== DataMember.Rows || props.optionDataField !== undefined
        || (props.optionValueField !== undefined && props.optionValueField !== view.valueField)
        || (props.optionLabelField !== undefined && props.optionLabelField !== view.labelField)
        || (props.valueSeparator !== undefined && props.valueSeparator !== view.selectionDelimiter)) {
        throw new Error('FIELD_CASCADE_OPTIONS: 组件选项配置与数据空间定义冲突')
      }
      return view
    }
    if (key === undefined) return null
    if (!runtime) throw new Error('PAGE_RUNTIME_MISSING')
    const view = runtime.resolveView(key)
    if (!view) throw new Error(`DATA_VIEW_MISSING: ${key}`)
    return view
  })

  const optionConfig = computed(() => {
    cascade.configuration.value
    const view = optionDataView.value
    return {labelField: view?.labelField, valueField: view?.valueField, primaryKey: view?.primaryKey,
      treeConfig: view?.treeConfig, selectionDelimiter: view?.selectionDelimiter}
  })
  const optionLabelField = computed(() =>
    props.optionLabelField
    ?? optionConfig.value.labelField
    ?? optionConfig.value.treeConfig?.textField
    ?? 'label'
  )
  const optionValueField = computed(() =>
    props.optionValueField
    ?? (typeof optionConfig.value.valueField === 'string' ? optionConfig.value.valueField : undefined)
    ?? optionConfig.value.primaryKey
    ?? optionConfig.value.treeConfig?.idField
    ?? 'value'
  )
  const optionDisabledField = computed(() => props.optionDisabledField ?? 'disabled')
  const optionChildrenField = computed(() => props.optionChildrenField ?? 'children')
  const valueSeparator = computed(() => props.valueSeparator ?? optionConfig.value.selectionDelimiter ?? ',')

  const options = computed<FieldOption[]>(() => {
    const view = optionDataView.value
    if (view) {
      const source = cascade.definition.value
        ? buildOptionSourceFromView(view, {labelField: optionLabelField.value, childrenField: optionChildrenField.value,
            rows: cascade.bound.value && cascade.state.value.status === 'ready' ? cascade.state.value.options : []})
        : resolvedOptionDataMember.value === DataMember.Rows
        ? buildOptionSourceFromView(
            view,
            {labelField: optionLabelField.value, childrenField: optionChildrenField.value},
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
      const valueFields = view.valueField ?? view.primaryKey
      function encodeSelectionRow(row: unknown): unknown {
        if (!isRecord(row)) return row
        const token = DataViewSelectionValue.token(row, valueFields)
        if (token === undefined) throw new Error('FIELD_CASCADE_VALUE: 选项缺少序列化值')
        const children = row[optionFields.childrenField] ?? row['children'] ?? row['items'] ?? row['nodes']
        return {...row, [optionFields.valueField]: token,
          ...(Array.isArray(children) ? {[optionFields.childrenField]: children.map(encodeSelectionRow)} : {})}
      }
      const encode = cascade.definition.value !== undefined
        && (cascade.definition.value.valueFormat === 'selection-string' || Array.isArray(view.valueField))
      return rows
        .map(row => normalizeOption(encode ? encodeSelectionRow(row) : row, optionFields))
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
    if (cascade.definition.value?.valueFormat === 'native') {
      return normalizeMultiValue(Array.isArray(value) ? value : value === null || value === undefined ? [] : [value], valueSeparator.value)
    }
    return normalizeMultiValue(value, valueSeparator.value)
  }

  const optionsAvailable = computed(() => !cascade.definition.value
    || (cascade.bound.value && cascade.state.value.status === 'ready'))
  const optionError = computed(() => cascade.definition.value ? cascade.state.value.error : undefined)

  function toControlValue(value: unknown, multiple: boolean): unknown {
    if (cascade.definition.value?.valueFormat !== 'selection-string') return value
    if (value !== null && value !== undefined && typeof value !== 'string') throw new Error('FIELD_CASCADE_VALUE: 选中字符串格式不匹配')
    const tokens = DataViewSelectionValue.split(value, valueSeparator.value)
    return multiple ? tokens : (tokens[0] ?? '')
  }

  function toSourceValue(value: unknown): unknown {
    if (!cascade.definition.value) return value
    if (!optionsAvailable.value) throw new Error('FIELD_CASCADE_VALUE: 当前选项尚不可用')
    if (cascade.definition.value.valueFormat !== 'selection-string') return value
    const values: unknown[] = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]
    const tokens = values.map(item => {
      if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
        throw new Error('FIELD_CASCADE_VALUE: 选中字符串只接受标量选项值')
      }
      return String(item)
    })
    return DataViewSelectionValue.join(tokens, valueSeparator.value)
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
    optionError,
    optionsAvailable,
    toControlValue,
    toSourceValue,
  }
}

export function useOptionField<TValue>(options: UseOptionFieldOptions<TValue>) {
  const optionHelpers = useFieldOptions(options.props)
  const permissionHelpers = useFieldPermission<TValue>({
    props: options.props,
    type: options.type,
    fallbackValue: options.fallbackValue,
    coerce: value => options.coerce(optionHelpers.toControlValue(value,
      Array.isArray(options.fallbackValue) || options.props.multiple === true)),
    toSourceValue: optionHelpers.toSourceValue,
    formatDisplay: (value: unknown) => options.formatDisplay
      ? options.formatDisplay(value, optionHelpers)
      : optionHelpers.formatOptionValue(value),
  })

  return {
    ...optionHelpers,
    ...permissionHelpers,
    isCurrentFieldEditable: computed(() => permissionHelpers.isCurrentFieldEditable.value && optionHelpers.optionsAvailable.value),
  }
}
