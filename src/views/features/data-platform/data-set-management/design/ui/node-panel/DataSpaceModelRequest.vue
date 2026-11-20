<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/DataSpaceModelRequest
职责：维护正式模型上的默认请求方案（输出类型、过滤、树参、缓存与完成配置），经原 Base_DataModel DataView 提交。
边界：命名视图的请求细项仍在 DataSpaceViewEditor；此处只编辑模型行上的请求默认值，不另建草稿真源。
-->
<template>
  <section aria-label="模型请求方案">
    <p>配置模型级默认请求语义；运行消费会结合各命名视图的 DataViewDefinition。来源入参映射仍在字段值函数中维护。</p>
    <p v-if="columnState.error" :role="columnState.pending ? 'status' : 'alert'">{{ columnState.error }}</p>
    <p v-if="error || state.error" role="alert">{{ error || state.error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div v-if="view && !view.destroyed" class="request-layout">
      <RendererSection v-for="group in groups" :key="group.title" :data-view-key="dataViewKey" data-member="currentRow"
        :title="group.title" :bordered="false" :grid-columns="1" :collapsible="group.advanced === true" :default-collapsed="group.advanced === true">
        <div class="model-properties" :class="group.style">
          <template v-for="field in group.fields" :key="field.name">
            <div v-if="field.name === 'Filter'" class="request-wide" data-model-field="Filter">
              <p v-if="!field.readable">过滤条件不可读</p>
              <template v-else>
                <h4>过滤条件</h4>
                <FilterExpressionEditor v-if="!columnState.error" :key="filterRevision" :model-value="filterTree"
                  :columns="filterColumns" :disabled="blocked || !field.writable" display="dialog" display-mode="box"
                  :function-context="filterFunctionContext" @update:model-value="applyFilter" />
                <RendererButton v-else :data-view-key="dataViewKey" label="重新加载字段候选" :disabled="blocked" @click="loadColumns" />
              </template>
            </div>
            <div v-else :data-model-field="field.name" :class="{'request-wide': field.name === 'RequestComplete' || field.name === 'OutputType'}">
              <p v-if="!field.readable">此字段不可读</p>
              <RendererForm v-else :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1"
                label-width="max-content" :form-props="{disabled: blocked || !field.writable, labelPosition: 'left'}">
                <FieldSelect v-if="field.kind === 'select' || field.options.length" :field="field.name" :label="field.label" :clearable="field.name !== 'OutputType'"
                  :options="field.name === 'parentField' || field.name === 'hasChildField' ? [{label: '未设置', value: ''}, ...field.options] : field.options" />
                <FieldText v-else :field="field.name" :label="field.label" />
              </RendererForm>
              <p v-if="field.unknown || field.warning" role="status">{{ field.warning || '当前配置不在已确认选项中；未修改时保留原值。' }}</p>
            </div>
          </template>
        </div>
      </RendererSection>
    </div>
    <p v-if="state.status !== 'idle'" role="alert">提交尚未完全确认，请先核验；不会自动重复写入。</p>
    <div v-if="!workspaceActions" class="actions">
      <RendererButton button-type="primary" data-action="save-model-request" :disabled="blocked || !state.pending" @click="save" label="保存请求方案" />
      <RendererButton data-action="cancel-model-request" :disabled="busy || disabled || state.status !== 'idle' || !state.pending" @click="discard" label="放弃本地修改" />
      <RendererButton v-if="state.status !== 'idle' || state.error" data-action="verify-model-request" :disabled="busy || disabled" @click="verify"
        :label="state.pending ? '放弃本地修改并核验' : '重新核验请求方案'" />
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {FieldText, FieldSelect, RendererSection, RendererForm, RendererButton, FilterExpressionEditor} from '@spark-appworks/spark-component'
import {buildDataViewKey, DataViewFilter, type DataViewFilterTree} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {DataSpaceModelEditorProps} from './data-set-design-node-panel.props'

const OUTPUT_TYPE_OPTIONS = [{label: 'Table', value: 'Table'}, {label: 'Join', value: 'Join'}, {label: 'Tree', value: 'Tree'}]

const props = defineProps<DataSpaceModelEditorProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]}>()
const busy = ref(false)
const tick = ref(0)
const error = ref('')
const message = ref('')
const filterRevision = ref(0)
const columnLoading = ref(false)
const columnError = ref('')
let active = true
const owner = computed(() => {props.revision; tick.value; return props.session.getModelEdit(props.modelId)})
const dataSet = props.session.metadataDataSet
const dataViewKey = buildDataViewKey('Base_DataModel', 'default', dataSet.scenarioId)
const view = computed(() => dataSet.getView('Base_DataModel', 'default'))
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const state = computed(() => {
  props.revision; tick.value
  try {return {...owner.value.getState(), data: owner.value.readRequestScheme(), error: ''}}
  catch (cause) {
    const status = (() => {try {return owner.value.getState()} catch {return {status: 'idle', pending: false}}})()
    return {...status, data: null, error: describe(cause)}
  }
})
const columnState = computed(() => {
  props.revision; tick.value
  if (columnLoading.value) return {pending: true, error: '正在读取字段候选…'}
  if (columnError.value) return {pending: false, error: columnError.value}
  const columns = state.value.data?.columns
  if (!columns?.length) return {pending: false, error: '尚未读取模型字段，无法编辑过滤条件'}
  return {pending: false, error: ''}
})
const filterColumns = computed(() => (state.value.data?.columns ?? []).filter(column => !column.isComputed && column.name !== '_pk'))
const filterFunctionContext = computed(() => DataViewFilter.editorContext({}))
const filterTree = computed((): DataViewFilterTree | undefined => {
  props.revision; tick.value
  const row = view.value?.getEditingRow(props.modelId) ?? view.value?.rows.find(item => view.value?.getPkKey(item) === props.modelId)
  const raw = row?.['Filter']
  return DataSpaceDesignApi.parseFilter(typeof raw === 'string' ? raw : '')?.toJSON()
})
function applyFilter(tree: DataViewFilterTree | undefined): void {
  const model = view.value
  if (!model || blocked.value) return
  try {
    let text = ''
    if (tree !== undefined) {
      const parsed = DataViewFilter.parse(tree)
      if (!parsed.ok) throw new Error(parsed.issues[0]?.message ?? '过滤条件无效')
      text = DataSpaceDesignApi.serializeFilter(parsed.value)
    }
    if (model.getEditingRow(props.modelId)?.['Filter'] !== text) model.updateEditingValue(props.modelId, 'Filter', text)
    changed()
  } catch (cause) {error.value = describe(cause)}
}
async function loadColumns(): Promise<void> {
  columnLoading.value = true; columnError.value = ''
  try {await props.session.loadModelFields(props.modelId); filterRevision.value++}
  catch (cause) {columnError.value = describe(cause)}
  finally {columnLoading.value = false; changed()}
}
const groups = computed(() => [
  {title: '默认请求', names: ['OutputType', 'Filter', 'cacheType', 'RequestComplete'] as const, style: 'request-main', advanced: false},
  {title: '树形输出', names: ['parentField', 'hasChildField', 'selfType', 'topValue'] as const, style: 'request-main', advanced: true},
].map(group => ({
  ...group,
  fields: group.names.flatMap(name => {
    const field = state.value.data?.fields.find(item => item.name === name)
    if (!field) return []
    if (name === 'OutputType') return [{...field, kind: 'select' as const, options: OUTPUT_TYPE_OPTIONS}]
    if (name === 'parentField' || name === 'hasChildField') return [{...field, kind: 'select' as const, options: field.options}]
    return [field]
  }),
})))
const blocked = computed(() => busy.value || props.disabled || state.value.status !== 'idle' || !!state.value.error)
watch(() => [props.modelId, props.revision], () => {
  if (!state.value.error && view.value && !view.value.destroyed && view.value.currentRow?.['rowid'] !== props.modelId) view.value.setCurrentRowById(props.modelId)
}, {immediate: true, flush: 'sync'})
watch(() => props.modelId, () => {void loadColumns()}, {immediate: true})
function edited(): void {if (active) {error.value = ''; message.value = ''; changed()}}
view.value?.events.on('editingFieldChanged', edited)
watch(() => busy.value || state.value.pending || state.value.status !== 'idle', value => emit('pending', value), {immediate: true, flush: 'sync'})
function changed(): void {tick.value++; emit('changed')}
async function run(action: 'save' | 'verify'): Promise<void> {
  if (busy.value || props.disabled) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    if (action === 'save') await owner.value.save()
    else {
      const reload = owner.value.prepareReload(owner.value.getState().pending)
      await reload()
    }
    if (active) message.value = action === 'save' ? '请求方案已保存并回读' : '已读取当前请求方案；未重复提交'
  } catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
function save(): Promise<void> {return run('save')}
const canSave = computed(() => !blocked.value && state.value.pending)
defineExpose({save, canSave, busy})
function verify(): Promise<void> {return run('verify')}
function discard(): void {
  if (busy.value || props.disabled || state.value.status !== 'idle') return
  try {owner.value.discard(); error.value = ''; message.value = '已放弃未提交的请求方案修改'; changed()} catch (cause) {error.value = describe(cause)}
}
onBeforeUnmount(() => {
  active = false
  view.value?.events.off('editingFieldChanged', edited)
  emit('pending', false)
})
</script>
<style scoped>
.request-layout {display:flex; flex-direction:column; gap:22px;}
.model-properties {display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px 24px;}
.request-wide {grid-column:1 / -1;}
.model-properties :deep(.el-form-item) {margin-bottom:0;}
.actions {display:flex; gap:.5rem; flex-wrap:wrap; margin:1rem 0;}
[role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
@media (max-width:760px) {.model-properties {grid-template-columns:1fr;}}
</style>
