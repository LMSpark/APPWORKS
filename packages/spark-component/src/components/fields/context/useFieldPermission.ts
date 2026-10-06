/**
 * @module @spark-appworks/spark-component:components/fields/context/useFieldPermission
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/context/useFieldPermission 的字段权限投影。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/context/useFieldPermission 的声明、导出和使用边界时，从本模块开始。
 */
import { computed, getCurrentInstance } from 'vue'
import { FieldVisibility } from '@spark-appworks/spark-data'
import type { DataColumn } from '@spark-appworks/spark-data'
import type { DataRow } from '@spark-appworks/spark-data'
import { PAGE_SERVICE } from '../../internal'
import { usePermission } from '../../../permission/index.js'
import type { SparkFieldSemanticProps } from '../../shared-types.js'
import { useSparkConsume } from '../../internal'
import { columnToFormRules } from '../columnFormRules'
import type { FormItemRule } from '../columnFormRules'
import { useActiveFieldRow } from './useActiveFieldRow'
import { writeDataViewEditingValue } from './dataViewEditing'
import type { FieldComposableProps } from './field-composable-props'

/** Field Permission Props 的属性契约。 */
export type FieldPermissionProps<TValue> = FieldComposableProps<Omit<Pick<SparkFieldSemanticProps, 'field' | 'label' | 'modelValue' | 'value'>, 'modelValue' | 'value'>> & {
    /** model Value 字段。 */
modelValue?: TValue | undefined
        /** 当前值。 */
value?: TValue | undefined}

/** Use Field Permission Options 的调用配置。 */
type UseFieldPermissionOptions<TValue> = {
    /** 组件属性集合。 */
props: FieldPermissionProps<TValue>
    /** 类型标识。 */
type: string
    /** fallback Value 字段。 */
fallbackValue: TValue
    /** format Display 回调。 */
formatDisplay?: (value: unknown) => string
  /**
   * 运行时类型校正函数。
   *
   * `sourceFieldValue` 从行数据中读取的原始值类型不可控（DataSet 行数据是 `unknown`），
   * 此函数在赋给 `fieldValue` 之前统一做类型校正，避免非预期类型（如 boolean false）
   * 流入 el-input / el-input-number 等的 :model-value，从而消除 Vue runtime prop 警告。
   *
   * 注意：仅对来自行数据的值应用；`props.modelValue` 显式传入时直接使用（调用方负责类型正确性）。
   */
  coerce: (rawValue: unknown) => TValue}

export function useFieldPermission<TValue>(options: UseFieldPermissionOptions<TValue>) {
  const { props, fallbackValue, formatDisplay } = options
  const { sparkConsume } = useSparkConsume()
  const instance = getCurrentInstance()

  const fieldName = computed(() => props.field ?? '')
  const displayLabel = computed(() => props.label ?? fieldName.value)
  const { contextData, dataSource, activeRow, activeSelectedRows } = useActiveFieldRow()
  const pageService = sparkConsume(PAGE_SERVICE)
  const perm = usePermission()

  const boundColumn = computed<DataColumn | null>(() => {
    if (!fieldName.value || !dataSource?.columns) return null
    return dataSource.columns.find(c => c.name === fieldName.value) ?? null
  })

  const validationRules = computed<FormItemRule[]>(() => {
    const column = boundColumn.value
    if (!column) return []
    const rules = columnToFormRules(column)
    if (perm.subtreeFieldPolicy !== 'unrestricted'
      && dataSource?.fieldAccess(currentRow.value, fieldName.value).required === true
      && !rules.some(rule => rule.required === true)) {
      rules.push({ required: true, message: `${displayLabel.value}为必填字段`, trigger: 'blur' })
    }
    return rules
  })

  const currentRow = computed<DataRow | null>(() =>
    perm.subtreeFieldPolicy === 'unrestricted' ? contextData : activeRow.value,
  )
  const selectedRows = computed<DataRow[]>(() => activeSelectedRows.value)

  function hasRawProp(...keys: string[]): boolean {
    const rawProps = instance?.vnode.props
    if (rawProps === null || rawProps === undefined) return false
    return keys.some(key => Object.prototype.hasOwnProperty.call(rawProps, key))
  }

  const hasExplicitModelValue = computed(() => hasRawProp('modelValue', 'model-value'))
  const hasExplicitValue = computed(() => hasRawProp('value'))

  const sourceFieldValue = computed<TValue>(() => {
    if (hasExplicitModelValue.value && props.modelValue !== undefined) return props.modelValue
    if (hasExplicitValue.value && props.value !== undefined) return props.value
    const row = currentRow.value
    if (row !== null && fieldName.value && fieldName.value in row) {
      return options.coerce(row[fieldName.value])
    }
    return fallbackValue
  })

  const currentFieldState = computed(() =>
    perm.resolveFieldState(fieldName.value, currentRow.value)
  )

  const permissionMode = computed(() => perm.permissionMode)

  const isCurrentFieldReadable = computed(() => {
    return currentFieldState.value?.readable ?? true
  })

  const isCurrentFieldHidden = computed(() => {
    return currentFieldState.value?.visibility === FieldVisibility.Hidden
  })

  const isCurrentFieldEditable = computed(() => {
    return currentFieldState.value?.editable ?? false
  })

  const shouldSuppressReadableValueWhenWritable = computed(() => {
    const state = currentFieldState.value
    if (!state?.editable) return false
    return state.visibility !== FieldVisibility.Visible
  })

  const fieldValue = computed<TValue>(() => {
    if (shouldSuppressReadableValueWhenWritable.value) return fallbackValue
    return sourceFieldValue.value
  })
  const currentRawValue = computed(() => fieldValue.value)
  const currentRawStringValue = computed(() => String(currentRawValue.value ?? ''))

  const shouldRenderCurrentField = computed(() => {
    const state = currentFieldState.value
    if (!state) return true
    return state.readable || state.editable
  })

  function formatValue(value: unknown): string {
    return formatDisplay ? formatDisplay(value) : String(value ?? '')
  }

  const currentDisplayValue = computed(() => {
    if (shouldSuppressReadableValueWhenWritable.value) return ''
    const state = currentFieldState.value
    if (state?.visibility === FieldVisibility.Hidden) return ''
    if (state?.visibility === FieldVisibility.Masked) return state.displayValue ?? '••••'
    return formatValue(sourceFieldValue.value)
  })

  function isTableCellHidden(row: DataRow): boolean {
    return perm.resolveFieldState(fieldName.value, row)?.visibility === FieldVisibility.Hidden
  }

  function getRowRawValue(row: DataRow): unknown {
    if (!fieldName.value) return fallbackValue
    return row[fieldName.value]
  }

  function getRowRawStringValue(row: DataRow): string {
    return String(getRowRawValue(row) ?? '')
  }

  function getTableCellDisplayValue(row: DataRow): string {
    if (!fieldName.value) return formatValue(fallbackValue)
    const state = perm.resolveFieldState(fieldName.value, row)
    if (state?.visibility === FieldVisibility.Hidden) return ''
    if (state?.visibility === FieldVisibility.Masked) return state.displayValue ?? '••••'
    return formatValue(getRowRawValue(row))
  }

  function syncValue(value: TValue): void {
    if (!isCurrentFieldEditable.value) return
    const row = currentRow.value
    if (row !== null && fieldName.value) {
      if (perm.subtreeFieldPolicy !== 'unrestricted' && writeDataViewEditingValue({
        source: dataSource,
        row,
        field: fieldName.value,
        value,
      })) return
      row[fieldName.value] = value
    }
  }

  return {
    permissionMode,
    fieldName,
    displayLabel,
    boundColumn,
    contextData,
    dataSource,
    pageService,
    currentRow,
    selectedRows,
    isCurrentFieldReadable,
    fieldValue,
    currentRawValue,
    currentRawStringValue,
    isCurrentFieldHidden,
    isCurrentFieldEditable,
    shouldRenderCurrentField,
    currentDisplayValue,
    isTableCellHidden,
    getRowRawValue,
    getRowRawStringValue,
    getTableCellDisplayValue,
    syncValue,
    validationRules,
  }
}
