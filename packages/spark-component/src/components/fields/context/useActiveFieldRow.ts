/**
 * @module @spark-appworks/spark-component:components/fields/context/useActiveFieldRow
 * 职责：解析字段值绑定，保持视图、数据成员、行指针和编辑覆盖一致。
 * 边界：复用PageRuntime和DataView，不查询、不保存，不以父上下文替代失效的显式绑定。
 * AI用途：标准字段取值、权限及选项级联共用此上下文。
 */
import {computed, inject, onScopeDispose, readonly, shallowRef, toRaw, watch} from 'vue'
import {DataMember, resolveDataViewMember, type DataRow} from '@spark-appworks/spark-data'
import {DATA_ROW, DATA_SOURCE, PAGE_RUNTIME, useSparkConsume} from '../../internal'
import type {SparkFieldSemanticProps} from '../../shared-types'
import type {FieldComposableProps} from './field-composable-props'
import {resolveDataViewEditingRow} from './dataViewEditing'
import {useResolvedFieldContext} from './useResolvedFieldContext'
import {TABLE_FIELD_CELL} from './tableCellContext'
import {resolveReactiveRow} from '../../containers/support/scope/row-mirror-sync'

/** 字段值绑定属性；与选项来源绑定分别解析。 */
export type FieldValueBindingProps = FieldComposableProps<Pick<SparkFieldSemanticProps, 'dataViewKey' | 'dataMember' | 'dataField' | 'field' | 'editOnDblclick'>>

export function useActiveFieldRow(props: FieldValueBindingProps = {}) {
  const {sparkConsume} = useSparkConsume()
  const inheritedRow = sparkConsume(DATA_ROW), inheritedSource = sparkConsume(DATA_SOURCE)
  const runtime = sparkConsume(PAGE_RUNTIME)
  const revision = shallowRef(0)
  let generation = 0, disposed = false
  const cell = inject(TABLE_FIELD_CELL, undefined)
  const fieldContext = useResolvedFieldContext()
  const explicit = computed(() => props.dataViewKey !== undefined || props.dataMember !== undefined || props.dataField !== undefined
    || !!cell || props.editOnDblclick === true && fieldContext.value === 'table')
  const fieldName = computed(() => props.dataField ?? props.field ?? '')
  const member = computed(() => {
    const value = props.dataMember ?? DataMember.CurrentRow
    if (!Object.values(DataMember).some(candidate => candidate === value)) {
      throw new Error(`DATA_VIEW_MEMBER: 无效数据成员 ${value}`)
    }
    return value
  })
  const fieldMember = computed(() => member.value === DataMember.CurrentRow || member.value === DataMember.Value && fieldName.value !== '')
  const dataSource = computed(() => {
    if (props.dataViewKey === undefined) return inheritedSource
    if (!runtime) throw new Error('PAGE_RUNTIME_MISSING')
    const view = runtime.resolveView(props.dataViewKey)
    if (!view) throw new Error(`DATA_VIEW_MISSING: ${props.dataViewKey}`)
    return view
  })
  watch(dataSource, (view, _, cleanup) => {
    if (!view) return
    const bump = () => {revision.value++}
    const names = ['editingFieldChanged', 'editingChanged', 'rowsChanged', 'currentRowChanged', 'selectedRowsChanged',
      'cleared', 'requestStateChanged', 'summaryChanged', 'selectionSummaryChanged', 'mutatingChanged', 'configChanged'] as const
    const invalidateRows = () => {generation++}
    view.events.on('rowsChanged', invalidateRows)
    view.events.on('cleared', invalidateRows)
    for (const name of names) view.events.on(name, bump)
    cleanup(() => {
      for (const name of names) view.events.off(name, bump)
      view.events.off('rowsChanged', invalidateRows)
      view.events.off('cleared', invalidateRows)
    })
  }, {immediate: true, flush: 'sync'})
  const contextData = computed<DataRow | null>(() => {
    revision.value
    const source = dataSource.value
    if (source?.destroyed || source?.dataSet?.destroyed || !fieldMember.value) return null
    if (cell) {
      if (!source || toRaw(source) !== toRaw(cell.source())) return null
      const row = cell.row()
      return source.rows.find(candidate => toRaw(candidate) === toRaw(row)) ?? null
    }
    return explicit.value ? source?.currentRow ?? null : resolveReactiveRow(inheritedRow ?? source?.currentRow)
  })
  function resolveEditingRow(row: DataRow | null): DataRow | null {
    revision.value
    return resolveDataViewEditingRow(dataSource.value, row) ?? row
  }
  const activeRow = computed(() => resolveEditingRow(contextData.value))
  const activeSelectedRows = computed(() => {revision.value; return dataSource.value?.selectedRows.slice() ?? []})
  const memberError = computed(() => {
    revision.value
    return member.value === DataMember.AggregateResult || member.value === DataMember.SelectionAggregateResult
      ? dataSource.value?.aggregateError ?? null : fieldMember.value
        ? dataSource.value?.computedColumnError(fieldName.value) ?? null : null
  })
  const memberValue = computed(() => {
    revision.value
    const source = dataSource.value
    if (!source || source.destroyed || source.dataSet?.destroyed) return undefined
    return resolveDataViewMember({dataViewKey: `${source.tableName}@${source.viewId}`, dataMember: member.value,
      dataField: fieldName.value || undefined}, source.dataSet)
  })
  // 编辑覆盖每次读取可产生新对象；同一行连续编辑不换身份，行替换由rowsChanged单独失效。
  watch([dataSource, () => dataSource.value
    ? contextData.value ? dataSource.value.getPkKey(contextData.value) : undefined : contextData.value,
    fieldName, member, () => props.dataViewKey], () => {generation++}, {flush: 'sync'})
  onScopeDispose(() => {disposed = true; generation++})
  function captureWriteGuard(): () => boolean {
    const captured = generation
    return () => !disposed && captured === generation && !dataSource.value?.destroyed && !dataSource.value?.dataSet?.destroyed
  }
  // 集合引用未变时，状态/权限/分页仍可能改变；复杂只读呈现按该修订重新投影，不能仅观察数组身份。
  return {revision: readonly(revision), contextData, dataSource, activeRow, activeSelectedRows, fieldName, member, fieldMember, memberValue, memberError, explicit, captureWriteGuard, resolveEditingRow}
}
