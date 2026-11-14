<!--
@module app:views/features/integration/api-management/ui/interface-list/interface-invoke-panel
职责：按原“调用输出”页签填写结果过滤并调用接口，展示本接口最近一次调用结果。
边界：调用经InterfaceCallRequest命令资源提交；结果过滤写当前接口resultPath编辑覆盖，由接口“保存”持久；结果未知只可放弃，不重发。
-->
<template>
  <div class="interface-invoke">
    <div class="interface-invoke__bar">
      <RendererForm :data-view-key="INTERFACE_KEYS.interfaces" :children="filterField" :grid-columns="1" label-width="0" :show-data-view-meta="false" />
      <RendererButton label="调用" button-type="primary" :disabled="workspace.locked || pendingCreate || unknown" @click="invoke" />
      <RendererButton v-if="unknown" label="放弃未知结果" :disabled="workspace.locked" @click="abandon" />
    </div>
    <DisplayAlert v-if="unknown" alert-type="warning" :closable="false" title="上次调用结果未知，不会重新发送；如需再次调用请先放弃该结果" />
    <RendererForm v-if="hasResult" :data-view-key="INTERFACE_KEYS.calls" :children="resultField" :grid-columns="1" label-position="top" :show-data-view-meta="false" />
    <DisplayEmpty v-else :description="pendingCreate ? '请先保存新建接口，再调用' : '点击调用查看接口返回结果'" />
  </div>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import type {SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkComponent, RendererForm, RendererButton, DisplayAlert, DisplayEmpty} from '@spark-appworks/spark-component'
import {INTERFACE_KEYS, abandonInterfaceCall, invokeApi, type InterfaceWorkspace} from './interface-list-workspace'
const props = defineProps<{workspace: InterfaceWorkspace; pendingCreate: boolean}>()
const {sparkConsume} = useSparkComponent({type: 'interface-invoke-panel'})
const runtime = sparkConsume(PAGE_RUNTIME)
const resolve = (key: string) => {
  const view = runtime?.resolveView(key)
  if (!view) throw new Error(`调用输出缺少场景视图 ${key}`)
  return view
}
const filterField: SparkNode[] = [{type: 'r-text', props: {field: 'resultPath', label: '', placeholder: '请输入结果过滤'}}]
const resultField: SparkNode[] = [{type: 'r-json', props: {field: 'result', label: '调用结果', mode: 'tree', readonly: true, height: 420}}]
const unknown = computed(() => {props.workspace.revision; return resolve(INTERFACE_KEYS.calls).hasUnconfirmedSave})
const hasResult = computed(() => {
  props.workspace.revision
  const calls = resolve(INTERFACE_KEYS.calls), interfaces = resolve(INTERFACE_KEYS.interfaces), row = interfaces.currentRow
  const id = row ? interfaces.getPkKey(row) : undefined
  return id !== undefined && calls.currentRow?.['interfaceId'] === id && !calls.hasUnconfirmedSave
})
function invoke(): Promise<void> {
  return props.workspace.run(() => invokeApi({calls: resolve(INTERFACE_KEYS.calls), interfaces: resolve(INTERFACE_KEYS.interfaces)}))
}
function abandon(): Promise<void> {
  return props.workspace.run(() => abandonInterfaceCall(resolve(INTERFACE_KEYS.calls)))
}
</script>
<style scoped>
.interface-invoke {display: grid; gap: 12px;}
.interface-invoke__bar {display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: start;}
</style>
