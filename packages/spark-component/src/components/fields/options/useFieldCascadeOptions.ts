import {computed, onScopeDispose, shallowRef, watch} from 'vue'
import type {DataViewFieldCascade, DataViewFieldCascadeState} from '@spark-appworks/spark-data'
import type {useActiveFieldRow} from '../context/useActiveFieldRow'

const idle: DataViewFieldCascadeState = {status: 'idle', options: [], valueStatus: 'unverified'}

/** 组件消费目标值绑定的独立结果；查询和子值策略仍由DataSet执行，切换绑定释放旧订阅。 */
export function useFieldCascadeOptions(binding: ReturnType<typeof useActiveFieldRow>) {
  const {dataSource, contextData, fieldName, fieldMember} = binding
  const dataSet = computed(() => dataSource.value?.dataSet)
  const revision = shallowRef(0), configuration = shallowRef(0)
  const state = shallowRef<DataViewFieldCascadeState>(idle)
  let generation = 0, disposed = false
  const definition = computed(() => {
    revision.value
    const source = dataSource.value
    return fieldMember.value ? dataSet.value?.viewCascades?.find((entry): entry is DataViewFieldCascade => entry.kind === 'field'
      && entry.tableName === source?.tableName && entry.viewId === source.viewId && entry.targetField === fieldName.value) : undefined
  })
  const bound = computed(() => {
    revision.value
    const source = dataSource.value, current = source?.currentRow, row = contextData.value
    return !dataSet.value?.destroyed && !source?.destroyed && current !== null && current !== undefined
      && (row === null || row === current || source?.getPkKey(row) !== undefined && source.getPkKey(row) === source.getPkKey(current))
  })
  const view = computed(() => {
    const spec = definition.value
    return spec ? dataSet.value?.getView(spec.optionsView.tableName, spec.optionsView.viewId) : undefined
  })
  watch(dataSet, (ds, _, cleanup) => {
    generation++; state.value = idle; configuration.value++
    if (!ds) return
    const signal = () => {revision.value++}
    const unsubscribeValues = ds.onAnyViewChange({
      currentRowChanged: signal, selectedRowsChanged: signal, rowsChanged: signal,
      editingFieldChanged: signal, editingDiscarded: signal, requestStateChanged: signal,
      cleared: signal, configChanged: () => {configuration.value++; signal()},
    })
    const unsubscribeState = ds.onFieldCascadeChange((address, next) => {
      const spec = definition.value
      if (spec?.tableName === address.tableName && address.viewId === spec.viewId && address.field === spec.targetField) {
        state.value = bound.value ? next : idle
      }
    })
    cleanup(() => {unsubscribeValues(); unsubscribeState()})
  }, {immediate: true, flush: 'sync'})
  onScopeDispose(() => {disposed = true; generation++})
  watch([definition, revision, bound], () => {
    const spec = definition.value, ds = dataSet.value, captured = generation
    if (!spec || !ds || !bound.value) {state.value = idle; return}
    const address = {tableName: spec.tableName, viewId: spec.viewId, field: spec.targetField}
    state.value = ds.getFieldCascadeState(address)
    if (state.value.status !== 'idle') return
    void ds.refreshFieldCascade(address).catch((error: unknown) => {
      if (!disposed && captured === generation && definition.value === spec) state.value = {status: 'error', options: [], valueStatus: 'unverified',
        error: error instanceof Error ? error.message : String(error)}
    })
  }, {immediate: true})
  return {definition, state, view, bound, configuration}
}
