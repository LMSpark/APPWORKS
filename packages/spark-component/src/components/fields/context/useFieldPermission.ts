/**
 * @module @spark-appworks/spark-component:components/fields/context/useFieldPermission
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/context/useFieldPermission 的字段权限投影。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/context/useFieldPermission 的声明、导出和使用边界时，从本模块开始。
 */
import { computed, getCurrentInstance } from 'vue'
import { useFormDisabled } from 'element-plus'
import { DataFieldMember, DataView, FieldVisibility } from '@spark-appworks/spark-data'
import type { DataFieldMemberFormat, DataFieldMemberPath } from '@spark-appworks/spark-data'
import type { DataColumn } from '@spark-appworks/spark-data'
import type { DataRow } from '@spark-appworks/spark-data'
import { PAGE_SERVICE } from '../../internal'
import { usePermission } from '../../../permission/index.js'
import type { SparkFieldMemberProps, SparkFieldSemanticProps } from '../../shared-types.js'
import { useSparkConsume } from '../../internal'
import { columnToFormRules } from '../columnFormRules'
import type { FormItemRule } from '../columnFormRules'
import { useActiveFieldRow } from './row/useActiveFieldRow'
import { writeDataViewEditingMember, writeDataViewEditingValue } from './dataViewEditing'
import type { FieldComposableProps } from './field-composable-props'
import { resolveReadableDisplayFallback } from './field-display-fallback'

/** Field Permission Props 的属性契约。 */
export type FieldPermissionProps<TValue> = FieldComposableProps<Omit<Pick<SparkFieldSemanticProps, 'field' | 'dataViewKey' | 'dataMember' | 'dataField' | 'label' | 'modelValue' | 'value' | 'readonly' | 'editOnDblclick'>, 'modelValue' | 'value'>> & {
    /** model Value 字段。 */
modelValue?: TValue | undefined
        /** 当前值。 */
value?: TValue | undefined
    /** 有序只读呈现回退字段，由本次绑定 DataView 对每个字段单独授权。 */
displayFallbackFields?: string[] | undefined}

/** Use Field Permission Options 的调用配置。 */
type UseFieldPermissionOptions<TValue> = {
  /** 选项字段共享的值绑定上下文。 */
  binding?: ReturnType<typeof useActiveFieldRow>
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
  coerce: (rawValue: unknown) => TValue
  /** 控件值写入数据字段前的显式格式转换，仍经过当前字段权限。 */
  toSourceValue?: (value: TValue) => unknown
  /** 绑定源字段内的 JSON 成员；读写只换算该成员，权限、编辑追踪与保存仍以源字段为准。 */
  member?: () => FieldMemberRef | undefined}

/** 源字段内 JSON 成员的定位。 */
export type FieldMemberRef = Readonly<{path: DataFieldMemberPath; format: DataFieldMemberFormat}>

type FieldMemberPropsSource = Readonly<{[K in keyof SparkFieldMemberProps]?: SparkFieldMemberProps[K] | undefined}>

/** 由声明 SparkFieldMemberProps 的组件属性得到成员定位；未配置 valuePath 时返回 undefined。 */
export function fieldMemberFromProps(props: FieldMemberPropsSource): () => FieldMemberRef | undefined {
  return () => props.valuePath?.length ? {path: props.valuePath, format: props.valueFormat ?? 'text'} : undefined
}

export function useFieldPermission<TValue>(options: UseFieldPermissionOptions<TValue>) {
  const { props, fallbackValue, formatDisplay } = options
  const { sparkConsume } = useSparkConsume()
  const instance = getCurrentInstance()

  const binding = options.binding ?? useActiveFieldRow(props)
  const {fieldName, contextData, dataSource, activeRow, activeSelectedRows} = binding
  const displayLabel = computed(() => props.label ?? fieldName.value)
  const pageService = sparkConsume(PAGE_SERVICE)
  const perm = usePermission({dataSource: () => dataSource.value, inheritFieldPolicy: () => !binding.explicit.value})
  const formDisabled = useFormDisabled()

  const boundColumn = computed<DataColumn | null>(() => {
    if (!fieldName.value || !dataSource.value?.columns) return null
    return dataSource.value.columns.find(c => c.name === fieldName.value) ?? null
  })

  const validationRules = computed<FormItemRule[]>(() => {
    const column = boundColumn.value
    if (!column) return []
    const rules = columnToFormRules(column)
    let required=false
    if (perm.subtreeFieldPolicy !== 'unrestricted') {
      try { required = dataSource.value?.fieldAccess(currentRow.value, fieldName.value).required === true }
      catch { required = false }
    }
    if (perm.subtreeFieldPolicy !== 'unrestricted'
      && required
      && !rules.some(rule => rule.required === true)) {
      rules.push({ required: true, message: `${displayLabel.value}为必填字段`, trigger: 'blur' })
    }
    return rules
  })

  const currentRow = computed<DataRow | null>(() =>
    perm.subtreeFieldPolicy === 'unrestricted' ? contextData.value : activeRow.value,
  )
  const selectedRows = computed<DataRow[]>(() => activeSelectedRows.value)

  function hasRawProp(...keys: string[]): boolean {
    const rawProps = instance?.vnode.props
    if (rawProps === null || rawProps === undefined) return false
    return keys.some(key => Object.prototype.hasOwnProperty.call(rawProps, key))
  }

  const hasExplicitModelValue = computed(() => hasRawProp('modelValue', 'model-value'))
  const hasExplicitValue = computed(() => hasRawProp('value'))
  const memberError = computed(() => hasExplicitModelValue.value && props.modelValue !== undefined
    || hasExplicitValue.value && props.value !== undefined ? null : binding.memberError.value)
  // 配置诊断独立于字段值呈现；不将停算字段提升为可读/可写，也不显示数字控件的默认0。
  const jsonMember = computed(() => {
    const member = options.member?.()
    return member && member.path.length > 0 ? member : undefined
  })
  function readJsonMember(raw: unknown): unknown {
    const member = jsonMember.value
    return member ? DataFieldMember.read(raw, member) : raw
  }
  const jsonMemberError = computed(() => {
    binding.revision.value
    const row = currentRow.value
    if (!jsonMember.value || row === null || !fieldName.value || !(fieldName.value in row)) return undefined
    try {readJsonMember(row[fieldName.value]); return undefined}
    catch (error) {return error instanceof Error ? error.message : String(error)}
  })
  const bindingError = computed(() => binding.fieldMember.value ? memberError.value?.message ?? jsonMemberError.value : undefined)

  const sourceFieldValue = computed<TValue>(() => {
    binding.revision.value
    if (hasExplicitModelValue.value && props.modelValue !== undefined) return props.modelValue
    if (hasExplicitValue.value && props.value !== undefined) return props.value
    if (memberError.value || jsonMemberError.value) return fallbackValue
    if (!binding.fieldMember.value) return options.coerce(binding.memberValue.value)
    const row = currentRow.value
    if (row !== null && fieldName.value && fieldName.value in row) {
      return options.coerce(readJsonMember(row[fieldName.value]))
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

  const isCurrentFieldMasked = computed(() => currentFieldState.value?.visibility === FieldVisibility.Masked)

  const isCurrentFieldHidden = computed(() => {
    return currentFieldState.value?.visibility === FieldVisibility.Hidden
  })

  const isCurrentFieldEditable = computed(() => {
    // 表单交互锁定只能收紧字段写入，不能替代或扩大本次查询的数据权限。
    return binding.fieldMember.value && !jsonMemberError.value && props.readonly !== true && !formDisabled.value && (currentFieldState.value?.editable ?? false)
  })

  const shouldSuppressReadableValueWhenWritable = computed(() => {
    const state = currentFieldState.value
    if (!state?.editable) return false
    return state.visibility !== FieldVisibility.Visible
  })

  const fieldValue = computed<TValue>(() => {
    const state = currentFieldState.value
    if (state && state.visibility !== FieldVisibility.Visible) return fallbackValue
    return sourceFieldValue.value
  })
  const currentRawValue = computed(() => fieldValue.value)
  const currentRawStringValue = computed(() => String(currentRawValue.value ?? ''))

  const shouldRenderCurrentField = computed(() => {
    if (binding.fieldMember.value && dataSource.value && !currentRow.value) return false
    const state = currentFieldState.value
    if (!state) return true
    return state.readable || state.editable
  })

  function formatValue(value: unknown): string {
    return formatDisplay ? formatDisplay(value) : String(value ?? '')
  }

  const currentDisplayValue = computed(() => {
    if (shouldSuppressReadableValueWhenWritable.value) return ''
    if (props.displayFallbackFields?.length && currentRow.value) {
      return getFallbackDisplayValue(currentRow.value)
    }
    const state = currentFieldState.value
    if (state?.visibility === FieldVisibility.Hidden) return ''
    if (state?.visibility === FieldVisibility.Masked) return state.displayValue ?? '••••'
    if (memberError.value) return memberError.value.message
    return formatValue(sourceFieldValue.value)
  })

  function isTableCellHidden(row: DataRow): boolean {
    return perm.resolveFieldState(fieldName.value, row)?.visibility === FieldVisibility.Hidden
  }

  function isTableCellMasked(row: DataRow): boolean {
    return perm.resolveFieldState(fieldName.value, row)?.visibility === FieldVisibility.Masked
  }

  function getRowRawValue(row: DataRow): unknown {
    if (!fieldName.value) return fallbackValue
    const resolved = perm.subtreeFieldPolicy === 'unrestricted' ? row : binding.resolveEditingRow(row)
    if (!jsonMember.value) return resolved?.[fieldName.value]
    try {return readJsonMember(resolved?.[fieldName.value])}
    catch {return undefined}
  }

  function getRowRawStringValue(row: DataRow): string {
    return String(getRowRawValue(row) ?? '')
  }

  function getTableCellDisplayValue(row: DataRow): string {
    if (props.displayFallbackFields?.length) return getFallbackDisplayValue(row)
    if (!fieldName.value) return formatValue(fallbackValue)
    const state = perm.resolveFieldState(fieldName.value, row)
    if (state?.visibility === FieldVisibility.Hidden) return ''
    if (state?.visibility === FieldVisibility.Masked) return state.displayValue ?? '••••'
    return formatValue(getRowRawValue(row))
  }

  function getFallbackDisplayValue(row: DataRow): string {
    const resolved = resolveReadableDisplayFallback({
      view: dataSource.value,
      row: binding.resolveEditingRow(row) ?? row,
      fields: [fieldName.value, ...(props.displayFallbackFields ?? [])],
    })
    return formatValue(resolved)
  }

  function writeField(field: string, value: unknown): void {
    if (!binding.fieldMember.value || props.readonly === true || formDisabled.value
      || !perm.resolveFieldState(field, currentRow.value)?.editable) return
    const row = currentRow.value
    if (!row || !field) return
    if (perm.subtreeFieldPolicy !== 'unrestricted') {
      writeDataViewEditingValue({source: dataSource.value, row, field, value})
      return
    }
    row[field] = value
  }

  function writeJsonMember(member: FieldMemberRef, value: unknown): void {
    const row = currentRow.value, field = fieldName.value
    if (!row || !field) return
    if (perm.subtreeFieldPolicy !== 'unrestricted') {
      if (!writeDataViewEditingMember({source: dataSource.value, row, field, path: member.path, format: member.format, value})) {
        throw new Error('FIELD_MEMBER_WRITE: JSON 成员只能写入带主键的原生 DataView 行')
      }
      return
    }
    row[field] = DataFieldMember.merge(row[field], {path: member.path, format: member.format, value})
  }

  function syncValue(value: TValue): void {
    if (!isCurrentFieldEditable.value) return
    const sourceValue = options.toSourceValue ? options.toSourceValue(value) : value
    const member = jsonMember.value
    if (member) writeJsonMember(member, sourceValue)
    else writeField(fieldName.value, sourceValue)
  }

  function captureWriteGuard(): () => boolean {
    const valid = binding.captureWriteGuard()
    return () => valid() && isCurrentFieldEditable.value
  }

  async function saveEditingRow(row: DataRow): Promise<void> {
    const view = dataSource.value
    if (!(view instanceof DataView) || !view.dataSet || !isCurrentFieldEditable.value) throw new Error('FIELD_ROW_SAVE: 当前字段没有可写的原生视图')
    const id = view.getPkKey(row), current = contextData.value
    if (id === undefined || !current || view.getPkKey(current) !== id) throw new Error('FIELD_ROW_SAVE: 单元格行身份已变化')
    const result = await view.dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
    if (!result.success) throw new Error(result.message ?? '单元格保存未确认，请通过原保存入口核验')
  }

  return {
    bindingError,
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
    isCurrentFieldMasked,
    isCurrentFieldEditable,
    shouldRenderCurrentField,
    currentDisplayValue,
    isTableCellHidden,
    isTableCellMasked,
    getRowRawValue,
    getRowRawStringValue,
    getTableCellDisplayValue,
    syncValue,
    validationRules,
    captureWriteGuard,
    saveEditingRow,
    captureBindingGuard: binding.captureWriteGuard,
    writeField,
  }
}
