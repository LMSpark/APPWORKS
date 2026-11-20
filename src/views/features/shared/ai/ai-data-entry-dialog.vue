<!--
@module app:views/features/shared/ai/ai-data-entry-dialog
职责：以对话框承载标准AI批量新增组件；确认后的候选暂存在目标DataView，由本对话框经同一DataSet提交。
边界：目标是当前PageRuntime可解析的完整视图键；AI会话owner依附目标DataSet，不另建草稿或提交通道。
AI用途：功能页“AI添加”入口复用；可生成的字段由正式模型字段的AI操作设置与目标视图权限决定。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" :title="title" :width="width" :append-to-body="true"
    :close-disabled="closeBlocked" @update:model-value="close">
    <DisplayAlert v-if="error" alert-type="error" :closable="false" :show-icon="true" :title="error" />
    <SparkAiDataEntry v-if="host" :data-view-key="dataViewKey" :title="title" />
    <template #footer>
      <RendererButton label="放弃新增" :disabled="busy || !pending || unconfirmed" @click="discard" />
      <RendererButton label="关闭" :disabled="closeBlocked" @click="close" />
      <RendererButton :label="unconfirmed ? '重读核验' : '保存新增'" button-type="primary"
        :disabled="busy || !pending && !unconfirmed" @click="unconfirmed ? verify() : save()" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef} from 'vue'
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {AiDataEntryHost} from '@/lowcode/resources/shared/ai-data-entry-host'

const {AI_DATA_ENTRY_HOST, PAGE_RUNTIME, RendererDialog, RendererButton, DisplayAlert, SparkAiDataEntry, useSparkComponent} = Components
const props = withDefaults(defineProps<{dataViewKey: string; title?: string; width?: number}>(), {title: 'AI添加', width: 760})
const emit = defineEmits<{close: [saved: boolean]}>()
const {sparkConsume, sparkProvide} = useSparkComponent({type: 'ai-data-entry-dialog'})
const busy = ref(false), error = ref(''), revision = ref(0), saved = ref(false)
const host = shallowRef<AiDataEntryHost>()
let target: DataView | undefined, dataSet: DataSet | undefined
let unsubscribeHost: (() => void) | undefined, unsubscribeView: (() => void) | undefined

const changed = () => {revision.value++}
const pending = computed(() => {revision.value; return target?.dirtyTracking.hasPendingChanges() === true})
const unconfirmed = computed(() => {revision.value; return target?.hasUnconfirmedSave === true})
const closeBlocked = computed(() => {
  revision.value
  return busy.value || pending.value || unconfirmed.value || host.value?.isDirty === true || host.value?.blocksWorkspace === true
})

try {
  target = sparkConsume(PAGE_RUNTIME)?.resolveView(props.dataViewKey)
  dataSet = target?.dataTable?.dataSet
  if (!target || !dataSet) throw new Error(`AI添加目标视图不存在：${props.dataViewKey}`)
  if (target.dirtyTracking.hasPendingChanges() || target.hasEditingChanges()) throw new Error('目标列表仍有未保存修改，请先处理后再使用AI添加')
  const owner = new AiDataEntryHost({dataSet})
  host.value = owner
  unsubscribeHost = owner.subscribe(changed)
  unsubscribeView = dataSet.onAnyViewChange({rowsChanged: changed, editingChanged: changed, requestStateChanged: changed})
} catch (cause) {
  error.value = cause instanceof Error ? cause.message : String(cause)
}
sparkProvide(AI_DATA_ENTRY_HOST, {openSession: (view: DataView) => {
  if (!host.value) throw new Error('AI添加会话尚未就绪')
  return host.value.openSession(view)
}})

async function act(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {await action()} catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {busy.value = false; changed()}
}
function save(): Promise<void> {
  return act(async () => {
    if (!target || !dataSet) return
    const result = await dataSet.saveChanges({views: [{tableName: target.tableName, viewId: target.viewId}]})
    if (!result.success) throw new Error(result.message ?? 'AI新增结果未确认，请重读核验')
    saved.value = true
  })
}
function verify(): Promise<void> {
  return act(async () => {
    if (!target || !dataSet) return
    await dataSet.discardAndReload({views: [{tableName: target.tableName, viewId: target.viewId}]})
  })
}
function discard(): void {
  if (busy.value || !target || unconfirmed.value) return
  target.discardPendingChanges()
  changed()
}
function close(): void {
  if (closeBlocked.value) return
  try {host.value?.releaseClean()} catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause); return}
  emit('close', saved.value)
}
onBeforeUnmount(() => {unsubscribeHost?.(); unsubscribeView?.()})
</script>
