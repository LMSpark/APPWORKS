<!--
@module app:views/features/data-platform/data-set-management/design/source-input/DataSpaceSourceInputEditor
职责：在当前来源参数节点维护ValueFun，展示保存、取消和未知结果的核验入口。
边界：标准值函数字段绑定元数据视图，不复制数据草稿或执行独立查询；只提交当前参数。
AI用途：为原生数据空间页接入显式GetInputParam迁移和JSON常量配置，保留原文和生命周期保护。
-->
<template>
  <section aria-label="来源入参编辑">
    <p>配置来源参数如何取值；空间参数需明确选择，原有系统值不会自动转换。</p>
    <p v-if="state.error || error" role="alert">{{ error || state.error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="state.data">
      <p v-if="state.data.parameterWarning" role="status">{{ state.data.parameterWarning }}</p>
      <p v-if="legacySource" role="alert">旧来源入参原文已保留。引用空间参数须明确选择参数名称，再保存；系统值不会按同名参数自动转换。</p>
      <pre v-if="legacySource" data-legacy-source-input>{{ state.data.value }}</pre>
      <RendererForm :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <FieldValueFunction :data-view-key="dataViewKey" data-member="currentRow" field="ValueFun" label="值函数"
          :function-context="functionContext" :readonly="blocked || !state.data.writable" :on-dialog-visible-change="value => dialogOpen = value" />
      </RendererForm>
    </template>
    <p v-if="state.status !== 'idle'" role="alert">提交尚未完全确认，请先重新核验；不会自动重放写入。</p>
    <div class="actions">
      <RendererButton button-type="primary" data-action="save-source-input" :disabled="blocked || !state.data?.writable || !state.pending || dialogOpen" @click="save" label="保存来源入参" />
      <RendererButton data-action="cancel-source-input" :disabled="blocked || !state.pending || dialogOpen" @click="discard" label="放弃本地修改" />
      <RendererButton v-if="state.status !== 'idle' || state.error" data-action="verify-source-input" :disabled="busy || disabled || dialogOpen" @click="verify" :label="state.pending ? '放弃本地修改并核验' : '重新核验来源入参'" />
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {RendererButton, RendererForm, FieldValueFunction} from '@spark-appworks/spark-component'
import {buildDataViewKey, DataViewFilter} from '@spark-appworks/spark-data'
import type {DataSpaceSourceInputEditorProps} from './DataSpaceSourceInputEditor.props'

const props = defineProps<DataSpaceSourceInputEditorProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]}>()
const busy = ref(false)
const dialogOpen = ref(false)
const tick = ref(0)
const error = ref('')
const message = ref('')
let active = true
const view = props.session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
const dataViewKey = buildDataViewKey(view.tableName, view.viewId, props.session.metadataDataSet.scenarioId)
const owner = computed(() => props.session.getSourceInput(props.fieldId))
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const state = computed(() => {
  props.revision; tick.value
  try {return {...owner.value.getState(), data: owner.value.read(), error: ''}}
  catch (cause) {
    const status = (() => {try {return owner.value.getState()} catch {return {status: 'idle', pending: false}}})()
    return {...status, data: null, error: describe(cause)}
  }
})
const blocked = computed(() => busy.value || props.disabled || state.value.status !== 'idle' || !!state.value.error)
const legacySource = computed(() => {
  try {return JSON.parse(state.value.data?.value ?? '')?.Type === 'SystemData'} catch {return false}
})
const parameterKey = computed(() => JSON.stringify(state.value.data?.inputParams ?? []))
const functionContext = computed(() => {
  const context = DataViewFilter.editorContext({inputParams: JSON.parse(parameterKey.value)})
  return {...context, definitions: (context.definitions ?? []).map(item => ({...item,
    ...(item.type === 'GetInputParam' ? {label: '空间参数'} : {}), enabled: () => ['GetInputParam', 'GetConstValue'].includes(item.type)}))}
})
watch(() => [props.fieldId, props.revision], () => {
  if (!state.value.error && view.currentRow?.['rowid'] !== props.fieldId) view.setCurrentRowById(props.fieldId)
}, {immediate: true, flush: 'sync'})
view.events.on('editingFieldChanged', changed)
watch(() => busy.value || dialogOpen.value || state.value.pending || state.value.status !== 'idle', value => emit('pending', value), {immediate: true, flush: 'sync'})
function changed(): void {tick.value++; emit('changed')}
async function run(action: 'save' | 'verify'): Promise<void> {
  if (busy.value || props.disabled || dialogOpen.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    if (action === 'save') await owner.value.save()
    else await owner.value.reload(owner.value.getState().pending)
    if (active) message.value = action === 'save'
      ? `本次来源入参已保存${owner.value.getState().pending ? '；仍有后续修改待保存' : ''}`
      : '已重新读取来源入参；未重复提交'
  } catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
function save(): Promise<void> {return run('save')}
function verify(): Promise<void> {return run('verify')}
function discard(): void {
  if (blocked.value || dialogOpen.value) return
  try {owner.value.discard(); error.value = ''; message.value = '已放弃未提交的来源入参修改'; changed()} catch (cause) {error.value = describe(cause)}
}
onBeforeUnmount(() => {active = false; view.events.off('editingFieldChanged', changed); emit('pending', false)})
</script>
<style scoped>
section {border-top:1px solid var(--el-border-color); margin-top:1rem; padding-top:1rem;}
.actions {display:flex; flex-wrap:wrap; gap:.5rem; margin-top:1rem;}
[role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
</style>
