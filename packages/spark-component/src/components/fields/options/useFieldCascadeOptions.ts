import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import type { DataViewFieldCascade, DataViewFieldCascadeState } from '@spark-appworks/spark-data'
import { DATA_ROW, DATA_SOURCE, useSparkConsume } from '../../internal'

type FieldCascadeProps = {field?: string | undefined}
const idle: DataViewFieldCascadeState = {status: 'idle', options: [], valueStatus: 'unverified'}

/** 组件消费目标值绑定的独立结果；查询和子值策略仍由 DataSet 执行。 */
export function useFieldCascadeOptions(props: FieldCascadeProps) {
  const {sparkConsume} = useSparkConsume()
  const source = sparkConsume(DATA_SOURCE)
  const row = sparkConsume(DATA_ROW)
  const dataSet = source?.dataSet
  const revision = shallowRef(0)
  const configuration = shallowRef(0)
  const state = shallowRef<DataViewFieldCascadeState>(idle)
  let disposed = false
  const definition = computed(() => {
    revision.value
    return dataSet?.viewCascades?.find((entry): entry is DataViewFieldCascade => entry.kind === 'field'
      && entry.tableName === source?.tableName && entry.viewId === source.viewId && entry.targetField === props.field)
  })
  const bound = computed(() => {
    revision.value
    const current = source?.currentRow
    return !dataSet?.destroyed && !source?.destroyed && current !== null && current !== undefined
      && (row === null || source?.getPkKey(row) === source?.getPkKey(current))
  })
  const view = computed(() => {
    const spec = definition.value
    return spec ? dataSet?.getView(spec.optionsView.tableName, spec.optionsView.viewId) : undefined
  })
  if (dataSet) {
    const signal = () => { revision.value++ }
    const unsubscribeValues = dataSet.onAnyViewChange({
      currentRowChanged: signal, selectedRowsChanged: signal, rowsChanged: signal,
      editingFieldChanged: signal, editingDiscarded: signal, requestStateChanged: signal,
      cleared: signal, configChanged: () => { configuration.value++; signal() },
    })
    const unsubscribeState = dataSet.onFieldCascadeChange((address, next) => {
      const spec = definition.value
      if (spec?.tableName === address.tableName && address.viewId === spec.viewId && address.field === spec.targetField) {
        state.value = bound.value ? next : idle
      }
    })
    onScopeDispose(() => { disposed = true; unsubscribeValues(); unsubscribeState() })
  }
  watch([definition, revision], () => {
    const spec = definition.value
    if (!spec || !dataSet || !bound.value) { state.value = idle; return }
    const address = {tableName: spec.tableName, viewId: spec.viewId, field: spec.targetField}
    state.value = dataSet.getFieldCascadeState(address)
    if (state.value.status !== 'idle') return
    void dataSet.refreshFieldCascade(address).catch((error: unknown) => {
      if (!disposed && definition.value === spec) state.value = {status: 'error', options: [], valueStatus: 'unverified',
        error: error instanceof Error ? error.message : String(error)}
    })
  }, {immediate: true})
  return {definition, state, view, bound, configuration}
}
