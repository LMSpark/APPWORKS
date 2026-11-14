<!--
@module app:views/features/integration/api-management/ui/interface-list/interface-json-import-dialog
职责：按原“JSON输入”对话框整体替换当前接口的请求体：Body/Json直接替换；Body/FormData接受对象数组并规范为原四成员行。
边界：编辑当前接口行BodyParamJsonStr的编辑覆盖，取消恢复打开前的值；由接口“保存”统一提交，不另存草稿。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="INTERFACE_KEYS.interfaces" title="JSON输入" :width="720" :append-to-body="true" @update:model-value="cancel">
    <RendererForm :data-view-key="INTERFACE_KEYS.interfaces" :children="fields" :grid-columns="1" label-position="top" :show-data-view-meta="false" />
    <DisplayAlert v-if="error" alert-type="error" :closable="false" :title="error" />
    <template #footer>
      <RendererButton label="取消" @click="cancel" />
      <RendererButton label="保存" button-type="primary" @click="confirm" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {ref} from 'vue'
import type {SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkComponent, RendererDialog, RendererForm, RendererButton, DisplayAlert} from '@spark-appworks/spark-component'
import {INTERFACE_KEYS} from './interface-list-workspace'
const props = defineProps<{target: 'json' | 'form'}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'interface-json-import-dialog'})
const interfaces = sparkConsume(PAGE_RUNTIME)?.resolveView(INTERFACE_KEYS.interfaces)
const row = interfaces?.currentRow, id = row && interfaces ? interfaces.getPkKey(row) : undefined
if (!interfaces || id === undefined) throw new Error('JSON输入缺少当前接口')
const view = interfaces, rowId = id
const original = String(view.getEditingRow(rowId)?.['BodyParamJsonStr'] ?? '')
const error = ref('')
const fields: SparkNode[] = [{type: 'r-json', props: {field: 'BodyParamJsonStr', label: props.target === 'form' ? '请输入 JSON 数组' : '请输入 JSON', mode: 'text', height: 360}}]
const text = (value: unknown, fallback: string) => typeof value === 'string' ? value : value === undefined || value === null ? fallback : JSON.stringify(value)
function formRows(source: string): string {
  const parsed: unknown = JSON.parse(source)
  if (!Array.isArray(parsed)) throw new Error('Body/FormData 须输入 JSON 数组')
  const rows = parsed.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('JSON 数组成员必须是对象')
    const member = Object.fromEntries(Object.entries(item))
    return {fieldName: text(member['fieldName'] ?? member['name'], ''), fieldType: text(member['fieldType'] ?? member['type'], 'string'),
      defaultValue: text(member['defaultValue'] ?? member['value'], ''), valueFun: text(member['valueFun'], '')}
  })
  return rows.length ? JSON.stringify(rows) : ''
}
function confirm(): void {
  try {
    if (view.currentRow !== row) throw new Error('当前接口已切换，请关闭后重新导入')
    const source = String(view.getEditingRow(rowId)?.['BodyParamJsonStr'] ?? '')
    if (source.trim()) {
      if (props.target === 'form') view.updateEditingValue(rowId, 'BodyParamJsonStr', formRows(source))
      else JSON.parse(source)
    }
    emit('close')
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function cancel(): void {
  if (String(view.getEditingRow(rowId)?.['BodyParamJsonStr'] ?? '') !== original) view.updateEditingValue(rowId, 'BodyParamJsonStr', original)
  emit('close')
}
</script>
