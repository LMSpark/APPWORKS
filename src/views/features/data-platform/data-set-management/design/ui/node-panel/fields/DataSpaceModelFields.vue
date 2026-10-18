<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/fields/DataSpaceModelFields
职责：在模型工作区打开正式字段命名视图，表格与表单消费同一查询和编辑状态。
边界：原会话查询/保存，不复制目录行或权限，不维护第二份草稿。
AI用途：统一模型字段列表、输出及字段规则编辑、批量保存和核验。
-->
<template>
  <section aria-label="模型字段工作区">
    <p v-if="loading" role="status">正在读取当前模型字段…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error" label="重新读取模型字段" :disabled="loading || disabled || pending" @click="load" />
    <DataSpaceFieldEditor v-if="loadedOnce" ref="editor" :session="session" :field-id="firstId ?? ''" :field-ids="ids" view-id="modelFields" :workspace-model-id="workspaceActions ? modelId : undefined"
      :revision="revision" :disabled="disabled || loading || !ready" @changed="emit('changed')" @pending="pending = $event" @remove="emit('remove', $event)">
      <template v-if="$slots['model-name']" #model-name><slot name="model-name" /></template>
      <template v-if="$slots['model-actions']" #model-actions><slot name="model-actions" /></template>
      <template v-if="$slots['field-create']" #field-create><slot name="field-create" /></template>
    </DataSpaceFieldEditor>
    <p v-if="ready && !firstId">此模型尚无字段定义，可新增计算字段或从来源更新字段。</p>
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {RendererButton} from '@spark-appworks/spark-component'
import {RequestState} from '@spark-appworks/spark-data'
import type {DataSpaceModelFieldsProps} from './DataSpaceModelFields.props'
import DataSpaceFieldEditor from './DataSpaceFieldEditor.vue'

const props = defineProps<DataSpaceModelFieldsProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]; remove: [fieldId: string]}>()
const loading = ref(false), ready = ref(false), loadedOnce = ref(false), pending = ref(false), error = ref(''), tick = ref(0)
const editor = ref<InstanceType<typeof DataSpaceFieldEditor>>()
const canSave = computed(() => editor.value?.canSave === true)
const busy = computed(() => loading.value || editor.value?.busy === true)
const hasEditor = computed(() => !!editor.value && ready.value)
const interactionLocked = computed(() => loading.value || !ready.value || editor.value?.interactionLocked === true)
async function save(): Promise<void> {await editor.value?.save()}
defineExpose({save, canSave, busy, hasEditor, interactionLocked})
let active = true
const loadKey = computed(() => JSON.stringify([props.modelId, props.fieldIds]))
const invalidated = computed(() => {props.revision; return ready.value && props.session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')?.requestState === RequestState.Idle})
let requestedKey: string | undefined
const ids = computed(() => {
  props.revision; tick.value
  const view = props.session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')
  return ready.value && view ? [...new Set([...view.rows.flatMap(row => typeof row['rowid'] === 'string' ? [row['rowid']] : []),
    ...props.session.getUnresolvedFieldIds(props.modelId, 'modelFields')])] : []
})
const firstId = computed(() => ids.value[0])
async function load(): Promise<void> {
  if (!active || props.disabled || loading.value || pending.value) return
  requestedKey = loadKey.value
  loading.value = true; ready.value = false; error.value = ''
  try {
    await props.session.loadModelFields(props.modelId)
    if (active) {tick.value++; ready.value = true; loadedOnce.value = true; emit('changed')}
  } catch (cause) {if (active) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active) loading.value = false}
}
// 来源命令期间保留当前工作区，解锁后只重读已失效的当前模型字段。
watch([loadKey, invalidated, () => props.disabled, loading, pending], () => {
  if (loadKey.value !== requestedKey || invalidated.value) void load()
}, {immediate: true})
watch(() => loading.value || pending.value, value => emit('pending', value), {immediate: true, flush: 'sync'})
onBeforeUnmount(() => {active = false; emit('pending', false)})
</script>
