<!--
@module app:views/features/integration/api-management/ui/interface-list/interface-output-panel
职责：按原“输出内容”页签按调用结果重新设置输出字段，维护描述，并为输出设置公共参数。
边界：重新设置经调用命令取得结果后，在Base_TblField视图同名保留、类型更新、多余删除、缺少新增，由“保存”经staged提交；已绑定公共参数的字段拒绝移除。
-->
<template>
  <div class="interface-output">
    <div class="interface-output__bar">
      <RendererForm :data-view-key="INTERFACE_KEYS.interfaces" :children="filterField" :grid-columns="1" label-width="0" :show-data-view-meta="false" />
      <RendererButton label="重新设置输出" :disabled="workspace.locked || pendingCreate || unknown" @click="resetOutputs" />
      <RendererButton label="保存" button-type="primary" :disabled="workspace.locked || !pending" @click="save" />
    </div>
    <DisplayAlert v-if="unknown" alert-type="warning" :closable="false" title="上次调用结果未知，请在“调用输出”中放弃该结果后再重新设置" />
    <RendererTable :data-view-key="INTERFACE_KEYS.outputs" :children="columns" :actions="actions" :action-column="{label: '公共参数', width: 140}" :show-pagination="false" :show-data-view-meta="false" :max-height="460" />
  </div>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import type {DataRow, SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {runFeatureTableAction} from '@/views/features/shared/table/feature-table-actions'
import {INTERFACE_KEYS, invokeApi, outputFieldsOf, type InterfaceWorkspace} from './interface-list-workspace'
const {PAGE_RUNTIME, PAGE_SERVICE, useSparkComponent, RendererForm, RendererButton, RendererTable, DisplayAlert, consumeRequiredPageService} = SparkComponent
const props = defineProps<{workspace: InterfaceWorkspace; pendingCreate: boolean}>()
const emit = defineEmits<{bind: [row: DataRow]}>()
const {sparkConsume} = useSparkComponent({type: 'interface-output-panel'})
const pageService = consumeRequiredPageService(sparkConsume, 'interface-output-panel')
const runtime = sparkConsume(PAGE_RUNTIME)
const resolve = (key: string) => {
  const view = runtime?.resolveView(key)
  if (!view) throw new Error(`输出内容缺少场景视图 ${key}`)
  return view
}
const filterField: SparkNode[] = [{type: 'r-text', props: {field: 'resultPath', label: '', placeholder: '请输入结果过滤'}}]
const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'enname', label: '字段名', readonly: true}},
  {type: 'r-select', props: {field: 'DataType', label: '字段类型', optionDataViewKey: INTERFACE_KEYS.paramTypes, readonly: true}},
  {type: 'r-text', props: {field: 'Memo', label: '描述', showCellControl: true}},
]
const unknown = computed(() => {props.workspace.revision; return resolve(INTERFACE_KEYS.calls).hasUnconfirmedSave})
const pending = computed(() => {
  props.workspace.revision
  const outputs = resolve(INTERFACE_KEYS.outputs)
  return outputs.hasEditingChanges() || outputs.dirtyTracking.hasPendingChanges()
})
const actions = computed<SparkComponent.RToolbarProps>(() => ({children: [{type: 'r-button', props: {label: '设置公共参数', buttonType: 'primary', link: true,
  disabled: props.workspace.locked || pending.value, onClick: (row: DataRow) => emit('bind', row)}}]}))
function save(): Promise<void> {
  return props.workspace.run(() => runFeatureTableAction(resolve(INTERFACE_KEYS.outputs), 'save', pageService))
}
function resetOutputs(): Promise<void> {
  return props.workspace.run(async () => {
    const outputs = resolve(INTERFACE_KEYS.outputs), interfaces = resolve(INTERFACE_KEYS.interfaces), bindings = resolve(INTERFACE_KEYS.bindings)
    if (outputs.hasEditingChanges() || outputs.dirtyTracking.hasPendingChanges()) throw new Error('请先保存或取消输出内容的修改')
    const owner = interfaces.currentRow, interfaceId = owner ? interfaces.getPkKey(owner) : undefined
    const fields = outputFieldsOf(await invokeApi({calls: resolve(INTERFACE_KEYS.calls), interfaces}))
    if (interfaces.currentRow !== owner || interfaceId === undefined) throw new Error('当前接口已切换，未重新设置输出')
    const types = new Map(fields.map(field => [field.enname, field.DataType]))
    const current = [...outputs.rows], names = new Set(current.map(row => String(row['enname'] ?? '')))
    const removed = current.filter(row => !types.has(String(row['enname'] ?? '')))
    if (removed.length) {
      await bindings.refresh()
      if (bindings.loadingError) throw bindings.loadingError
      const bound = removed.map(row => String(row['enname'] ?? ''))
        .filter(name => bindings.rows.some(binding => binding['interfaceId'] === interfaceId && binding['outputfield'] === name))
      if (bound.length) throw new Error(`输出字段 ${bound.join('、')} 已设置公共参数，请先解除绑定再重新设置输出`)
    }
    for (const row of current) {
      const id = outputs.getPkKey(row), type = types.get(String(row['enname'] ?? ''))
      if (id !== undefined && type !== undefined && row['DataType'] !== type) outputs.updateEditingValue(id, 'DataType', type)
    }
    for (const row of removed) {
      const id = outputs.getPkKey(row)
      if (id !== undefined) await outputs.removeRow(id)
    }
    for (const field of fields) if (!names.has(field.enname)) await outputs.addRow({tblname: 'api_output_info', enname: field.enname, DataType: field.DataType, IsPKey: 0, Memo: ''})
    pageService.showMessage('输出内容已重置，保存后生效', 'success')
  })
}
</script>
<style scoped>
.interface-output {display: grid; gap: 12px;}
.interface-output__bar {display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: start;}
</style>
