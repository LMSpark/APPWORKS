<!--
@module app:views/features/workflow/flow-runtime/detail/ui/flow-run-detail-step-table
职责：按需派生原步骤查询视图，标准表格消费原生过滤、请求状态及字段权限。
-->
<template>
  <RendererSection :error="error" :bordered="false" :grid-columns="1">
    <SparkComponentRenderer v-if="detailView" :config="tableConfig" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, useId, watch} from 'vue'
import {buildDataViewKey, parseDataViewKey, type DataView, type DataViewFilterTree, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererSection, SparkComponentRenderer, useSparkComponent} from '@spark-appworks/spark-component'

const props = defineProps<{rule: SparkNode; viewKey: string; receivedNodeId?: string; sentNodeId?: string; showVoided?: boolean}>()
const {sparkConsume} = useSparkComponent({type: 'flow-run-detail-step-table'})
const detailView = shallowRef<DataView>(), detailViewKey = ref(''), error = ref('')
const viewId = `step-detail-${useId()}`
let generation = 0
let stopObserving: (() => void) | undefined
const tableConfig = computed(() => ({
  ...props.rule,
  id: viewId,
  props: {...props.rule.props, dataViewKey: detailViewKey.value},
}))
function release(): void {
  stopObserving?.(); stopObserving = undefined
  const previous = detailView.value
  detailView.value = undefined; detailViewKey.value = ''
  if (previous && !previous.destroyed) previous.dataTable?.destroyView(previous.viewId)
}
watch(() => [sparkConsume(PAGE_RUNTIME), props.viewKey, props.receivedNodeId, props.sentNodeId, props.showVoided] as const, async ([runtime, key, received, sent, showVoided]) => {
  const own = ++generation
  release(); error.value = ''
  if (!key) return
  try {
    const descriptor = parseDataViewKey(key), source = runtime?.resolveView(key)
    if (!descriptor?.scope || !source || source.destroyed || source.dataSet?.scenarioId !== descriptor.scope) throw Error('步骤钻取缺少原完整视图绑定')
    const assertSource = source.captureReadResult()
    assertSource()
    const sourceChanged = () => {
      if (own !== generation) return
      try {assertSource()} catch (cause) {generation++; release(); error.value = cause instanceof Error ? cause.message : String(cause)}
    }
    source.events.on('configChanged', sourceChanged)
    source.events.on('requestStateChanged', sourceChanged)
    const sourceDisposing = () => {if (own === generation) {generation++; release(); error.value = '步骤来源视图已释放'}}
    source.events.on('disposing', sourceDisposing)
    stopObserving = () => {source.events.off('configChanged', sourceChanged); source.events.off('requestStateChanged', sourceChanged); source.events.off('disposing', sourceDisposing)}
    const view = source.createQueryView(viewId)
    detailView.value = view
    detailViewKey.value = buildDataViewKey(descriptor.tableName, view.viewId, descriptor.scope)
    const filters: DataViewFilterTree[] = []
    if (view.filterExpression) filters.push(view.filterExpression)
    if (received !== undefined) filters.push({field: 'ReceiveNodeModelId', operator: 'eq', value: received})
    if (sent !== undefined) filters.push({field: 'SendNodeModelId', operator: 'eq', value: sent})
    if (!showVoided) filters.push({field: 'StepState', operator: 'in', value: ['0', '1']})
    await view.executeFilter(filters.length ? {logic: 'and', filters} : undefined, true)
    if (own !== generation) return
    assertSource()
  } catch (cause) {
    if (own === generation) {release(); error.value = cause instanceof Error ? cause.message : String(cause)}
  }
}, {immediate: true})
onBeforeUnmount(() => {generation++; release()})
</script>
