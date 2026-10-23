<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/data-set-design-node-panel
职责：按正式字段权限维护当前模型的描述、主键、业务标志和来源输入映射；请求方案由所属DataView维护。
边界：复用元数据会话、DataView编辑和保存；注册名使用独立预览/保存流程，不作为普通字段直接提交。
AI用途：模型节点的配置编辑、取消、保存回读与未知结果核验入口。
-->
<template>
  <section aria-label="模型配置编辑">
    <h3 v-if="!workspaceActions">模型配置</h3>
    <p v-if="error || state.error" role="alert">{{ error || state.error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="state.data?.warning" role="status">{{ state.data.warning }}</p>
    <div v-if="view && !view.destroyed" class="request-layout">
    <div class="request-sections">
      <RendererSection v-for="group in groups" :key="group.title" :data-view-key="dataViewKey" data-member="currentRow"
        :title="group.title" :bordered="false" :grid-columns="1" :collapsible="group.advanced === true" :default-collapsed="group.advanced === true" class="request-section">
      <div class="model-properties" :class="group.style">
      <div v-for="field in group.fields" :key="field.name" :data-model-field="field.name" :class="{'request-wide': !['IsBusinessMain', 'IsBusiness', 'parentField', 'hasChildField', 'selfType', 'topValue'].includes(field.name)}">
        <p v-if="!field.readable">此字段不可读</p>
        <RendererForm v-else :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1"
          label-width="max-content" :form-props="{disabled: blocked || !field.writable, labelPosition: 'left'}">
          <FieldCheckbox v-if="['IsBusiness', 'IsBusinessMain'].includes(field.name) && !field.unknown" :field="field.name" :label="field.label"
            :true-value="1" :false-value="0" />
          <FieldSelect v-else-if="field.name === 'PrimaryKeyFields'" :field="field.name" :label="field.label" :clearable="false" placeholder="未设置" />
          <FieldSelect v-else-if="field.kind === 'select'" :field="field.name" :label="field.label" :clearable="false" placeholder="未设置"
            :options="field.name === 'IsBusiness' || field.name === 'IsBusinessMain' ? field.options : [{label: '未设置', value: ''}, ...field.options]" />
          <FieldText v-else :field="field.name" :label="field.label" />
        </RendererForm>
        <p v-if="field.name === 'PrimaryKeyFields' && field.readable && primaryState.valueStatus === 'invalid'" role="alert">{{ field.value }}（主键引用失效，原配置保留）</p>
        <p v-if="field.name === 'PrimaryKeyFields' && field.readable && primaryState.error" role="alert">{{ primaryState.error }}</p>
        <p v-if="field.unknown || field.warning" role="status">{{ field.warning || '当前配置不在已确认选项中；未修改时保留原值。' }}</p>
      </div>
      </div>
      <template v-if="group.title === '模型属性' && sourceMode">
        <p v-if="sourceLoading" role="status">正在读取来源输入参数…</p>
        <template v-else-if="sourceError || sourceState.error">
          <p role="alert">{{ sourceError || sourceState.error }}</p>
          <RendererButton :data-view-key="sourceInputKey" label="重新读取来源输入参数" :disabled="sourceState.pending" @click="loadSourceInputs" />
        </template>
        <RendererTable v-else-if="sourceReady" :data-view-key="sourceInputKey" :auto-columns="false" :show-pagination="false" :show-data-view-meta="false" :max-height="240" class="request-source-inputs">
          <FieldText field="Name" label="名称" :min-width="120" readonly />
          <FieldText field="description" label="描述" :min-width="160" readonly />
          <FieldText field="FieldType" label="类型" :width="92" readonly />
          <FieldValueFunction field="ValueFun" label="值函数" :min-width="220" :function-context="sourceFunctionContext"
            :cell-readonly="sourceCellReadonly" :on-dialog-visible-change="sourceDialogChanged" />
        </RendererTable>
        <p v-if="sourceState.warning" role="status">{{ sourceState.warning }}</p>
      </template>
      </RendererSection>
    </div>
    <RendererSection :data-view-key="inputFieldsKey" title="模型输入参数" :bordered="false" :grid-columns="1" class="request-section request-side">
      <p v-if="inputFieldsLoading" role="status">正在读取模型输入参数…</p>
      <template v-else-if="!inputFieldsReady && (inputDefinition.status === 'unloaded' || inputDefinition.status === 'loading' || inputDefinition.status === 'failed')">
        <p :role="inputDefinition.status === 'failed' || inputFieldsError ? 'alert' : 'status'">{{ inputFieldsError || inputDefinition.error || '模型关系配置尚未读取，上游字段候选暂不可用。' }}</p>
        <RendererButton :data-view-key="inputFieldsKey" data-action="load-input-definition" label="读取模型输入参数" :disabled="busy || disabled" @click="loadInputFields" />
      </template>
      <p v-else-if="inputDefinition.status === 'absent'" role="status">尚无视图配置，模型输入参数将在配置后读取。</p>
      <template v-else-if="inputFieldsError">
        <p role="alert">{{ inputFieldsError }}</p>
        <RendererButton :data-view-key="inputFieldsKey" label="重新读取模型输入参数" @click="loadInputFields" />
      </template>
      <RendererTable v-else :data-view-key="inputFieldsKey" :auto-columns="false" :show-pagination="false" :show-data-view-meta="false" :max-height="520" class="request-input-fields">
        <FieldText field="Name" label="名称" :min-width="180" readonly />
        <FieldText field="description" label="描述" :min-width="220" readonly />
      </RendererTable>
    </RendererSection>
    </div>
    <p v-if="(state.status !== 'idle' || sourceState.status !== 'idle')" role="alert">提交尚未完全确认，请先核验；不会自动重复写入。</p>
    <p v-if="owner.requiresWorkspaceRecovery()" role="alert">原批次还包含字段或来源参数；模型页核验不会处理联合提交。请进入“3 字段呈现”页签，使用“重新核验字段配置”完成全批次核验与回读。</p>
    <div class="actions">
      <RendererButton v-if="!workspaceActions" button-type="primary" data-action="save-model" :disabled="blocked || !(state.pending || sourceState.pending) || dialogOpen" @click="save" label="保存模型配置" />
      <RendererButton data-action="cancel-model" :disabled="busy || disabled || state.status !== 'idle' || !(state.pending || sourceState.pending) || dialogOpen" @click="discard" label="放弃本地修改" />
      <RendererButton v-if="state.status !== 'idle' || state.error || sourceState.status !== 'idle'" data-action="verify-model" :disabled="busy || disabled || dialogOpen" @click="verify" :label="owner.requiresWorkspaceRecovery() ? '查看联合批次核验入口' : owner.hasInvalidReceipt() ? '读取并采用当前正式结果' : state.pending || sourceState.pending ? '放弃本地修改并核验' : '重新核验模型'" />
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {FieldText, FieldValueFunction, FieldSelect, FieldCheckbox, RendererSection, RendererTable, RendererForm, RendererButton} from '@spark-appworks/spark-component'
import {buildDataViewKey, DataViewFilter, RequestState, type DataRow} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceSourceInputEdit} from '@/lowcode/data-space/model-source/source-input/lowcode-data-space-source-input-session'
import type {DataSpaceModelEditorProps} from './data-set-design-node-panel.props'

const props = defineProps<DataSpaceModelEditorProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]}>()
const busy = ref(false)
const tick = ref(0)
const error = ref('')
const message = ref('')
let active = true
const owner = computed(() => {props.revision; tick.value; return props.session.getModelEdit(props.modelId)})
const dataSet = props.session.metadataDataSet
const dataViewKey = buildDataViewKey('Base_DataModel', 'default', dataSet.scenarioId)
const inputFieldsKey = buildDataViewKey('Base_DataModel_Field', 'modelInputFields', dataSet.scenarioId)
const inputFieldsLoading = ref(false), inputFieldsError = ref('')
let inputFieldsGeneration = 0
const inputFieldsReady = computed(() => {
  props.revision; tick.value
  const input = dataSet.getView('Base_DataModel_Field', 'modelInputFields')
  const ids = input?.queryContext['modelIds']
  return !!input && !input.destroyed && !input.loadingError && input.queryContext['dataSpaceId'] === props.session.targetId
    && input.queryContext['modelId'] === props.modelId && Array.isArray(ids)
    && (!ids.length || input.requestState === RequestState.Loaded) && input.total === input.rows.length
})
const inputDefinition = computed(() => {
  props.revision; tick.value
  try {
    const status = props.session.definitionStatus
    return {status, definition: status === 'ready' ? props.session.definitionDataSet : null, error: props.session.definitionError?.message ?? ''}
  } catch (cause) {return {status: 'failed' as const, definition: null, error: describe(cause)}}
})
async function loadInputFields(): Promise<void> {
  const own = ++inputFieldsGeneration
  inputFieldsLoading.value = true; inputFieldsError.value = ''
  try {await props.session.loadModelInputFields(props.modelId)}
  catch (cause) {if (active && own === inputFieldsGeneration) inputFieldsError.value = describe(cause)}
  finally {if (active && own === inputFieldsGeneration) {inputFieldsLoading.value = false; changed()}}
}
watch([() => props.modelId, () => inputDefinition.value.definition, () => inputDefinition.value.status], ([modelId], previous) => {
  inputFieldsGeneration++; inputFieldsLoading.value = false; inputFieldsError.value = ''
  if (inputDefinition.value.status !== 'absent' && (modelId !== previous[0] || inputDefinition.value.status === 'ready') && !inputFieldsReady.value) void loadInputFields()
}, {immediate: true})
const view = computed(() => dataSet.getView('Base_DataModel', 'default'))
const sourceView = dataSet.getView('Base_DataModel_Field', 'sourceInputFields')
const sourceInputKey = buildDataViewKey('Base_DataModel_Field', 'sourceInputFields', dataSet.scenarioId)
const sourceLoading = ref(false), sourceReady = ref(false), sourceError = ref(''), sourceDialogs = ref(0)
let sourceGeneration = 0
const sourceMode = computed(() => {
  props.revision; tick.value
  const row = view.value?.rows.find(item => item['rowid'] === props.modelId)
  return !!row && view.value?.fieldAccess(row, 'Type').read === 'visible' && ['接口', '视图'].includes(String(row['Type']))
})
function sourceOwners() {return props.session.getModelSourceInputs(props.modelId)}
const sourceState = computed(() => {
  props.revision; tick.value; sourceReady.value
  try {
    const owners = sourceOwners(), states = owners.map(item => item.getState())
    return {pending: states.some(item => item.pending), status: states.find(item => item.status !== 'idle')?.status ?? 'idle',
      inputParams: owners[0]?.read().inputParams ?? [], warning: owners[0]?.read().parameterWarning ?? '', error: ''}
  } catch (cause) {
    const pending = props.session.hasPendingSourceInputs() || sourceView?.hasEditingChanges() === true || sourceView?.dirtyTracking.hasPendingChanges() === true
    return {pending, status: pending ? 'readback' : 'idle', inputParams: [], warning: '', error: String(cause)}
  }
})
// 只在正式参数目录实际改变时更新函数上下文，打开弹窗不会因页面revision变化而自关闭。
const sourceParameters = computed(() => JSON.stringify(sourceState.value.inputParams))
const sourceFunctionContext = computed(() => {
  const context = DataViewFilter.editorContext({inputParams: JSON.parse(sourceParameters.value)})
  return {...context, definitions: (context.definitions ?? []).map(item => ({...item, enabled: () => ['GetInputParam', 'GetConstValue'].includes(item.type)}))}
})
function sourceCellReadonly(row: Readonly<DataRow>): boolean {
  if (blocked.value || sourceLoading.value || sourceState.value.status !== 'idle' || typeof row['rowid'] !== 'string') return true
  try {return !props.session.getSourceInput(row['rowid'], 'sourceInputFields').read().writable} catch {return true}
}
function sourceDialogChanged(visible: boolean): void {sourceDialogs.value = Math.max(0, sourceDialogs.value + (visible ? 1 : -1))}
async function loadSourceInputs(): Promise<void> {
  const own = ++sourceGeneration
  sourceLoading.value = true; sourceReady.value = false; sourceError.value = ''
  try {await props.session.loadSourceInputFields(props.modelId); if (active && own === sourceGeneration) {sourceOwners(); sourceReady.value = true; tick.value++}}
  catch (cause) {if (active && own === sourceGeneration) sourceError.value = String(cause)}
  finally {if (active && own === sourceGeneration) sourceLoading.value = false}
}
watch(() => [props.modelId, sourceMode.value], () => {
  sourceGeneration++; sourceReady.value = false; sourceError.value = ''
  if (sourceMode.value) void loadSourceInputs()
}, {immediate: true})
const sourceInvalidated = computed(() => {props.revision; return sourceReady.value && sourceView?.requestState === RequestState.Idle})
// 同类型来源变更只使原视图失效；命令解锁后重读当前参数，不依赖模型ID或类型改变。
watch([sourceInvalidated, () => props.disabled], () => {
  if (active && sourceMode.value && sourceInvalidated.value && !props.disabled && !sourceLoading.value) void loadSourceInputs()
})
const candidates = dataSet.addTable(`ModelParentFields_${crypto.randomUUID().replaceAll('-', '')}`,
  ['id', 'dataSpaceId', 'modelId', 'name', 'label', 'purpose'].map(name => ({name, type: 'string', isPrimaryKey: name === 'id'})))
candidates.resourceType = 'static-data'
const candidateViews = [{viewId: 'primary', field: 'PrimaryKeyFields'}]
for (const {viewId, field} of candidateViews) {
  candidates.getOrCreateView(viewId).configure({valueField: 'name', labelField: 'label', queryContext: {dataSpaceId: '', modelId: ''},
  filterExpression: {logic: 'and', filters: [
    {field: 'dataSpaceId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'dataSpaceId'}},
    {field: 'modelId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'modelId'}},
    {field: 'purpose', operator: 'eq', value: viewId},
  ]}})
  dataSet.addCascade({kind: 'field', cascadeId: `${candidates.tableName}_${viewId}`, tableName: 'Base_DataModel', viewId: 'default', targetField: field,
  valueFormat: 'native', valuePolicy: {mode: 'retain'}, parents: [
    {tableName: 'Base_DataModel', viewId: 'default', field: 'dataSetId', parameter: 'dataSpaceId'},
    {tableName: 'Base_DataModel', viewId: 'default', field: 'rowid', parameter: 'modelId'},
  ], optionsView: {tableName: candidates.tableName, viewId}})
}
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const state = computed(() => {
  props.revision; tick.value
  try {return {...owner.value.getState(), data: owner.value.read(), error: ''}}
  catch (cause) {
    const status = (() => {try {return owner.value.getState()} catch {return {status: 'idle', pending: false}}})()
    return {...status, data: null, error: describe(cause)}
  }
})
const groups = computed(() => [
  {title: '模型属性', names: ['IsBusinessMain', 'IsBusiness', 'description', 'PrimaryKeyFields'], style: 'request-main', advanced: false},
].map(group => ({...group, fields: group.names.flatMap(name => state.value.data?.fields.filter(field => field.name === name) ?? [])})))
const blocked = computed(() => busy.value || props.disabled || state.value.status !== 'idle' || !!state.value.error)
watch(() => [props.modelId, props.revision], () => {
  if (!state.value.error && view.value && !view.value.destroyed && view.value.currentRow?.['rowid'] !== props.modelId) view.value.setCurrentRowById(props.modelId)
}, {immediate: true, flush: 'sync'})
watch(() => JSON.stringify([props.modelId, state.value.error, state.value.data?.warning, state.value.data?.columns]), () => {
  if (dataSet.destroyed) return
  const columns = !state.value.data || state.value.data.warning ? undefined : state.value.data.columns
  candidates.rows = columns ? candidateViews.flatMap(({viewId}) => ['', ...columns.filter(column => viewId !== 'primary'
    || !['计算字段', '引用'].includes(column.type) && !['lingma_sys_ent', '_pk'].includes(column.name.toLowerCase())).map(column => column.name)]
    .map(name => ({id: JSON.stringify([props.modelId, viewId, name]), dataSpaceId: props.session.targetId, modelId: props.modelId,
      name, purpose: viewId, label: name || (viewId === 'primary' ? '无主键（只读）' : '未设置')}))) : []
  for (const {viewId} of candidateViews) {
    const options = candidates.getOrCreateView(viewId)
    options.replaceRows([])
    options.configure({queryContext: {dataSpaceId: '', modelId: ''}})
  }
}, {immediate: true})
const unsubscribeCascade = dataSet.onFieldCascadeChange(address => {
  if (active && address.tableName === 'Base_DataModel' && address.viewId === 'default' && candidateViews.some(item => item.field === address.field)) tick.value++
})
const primaryState = computed(() => {
  tick.value
  return dataSet.getFieldCascadeState({tableName: 'Base_DataModel', viewId: 'default', field: 'PrimaryKeyFields'})
})
function edited(): void {if (active) {error.value = ''; message.value = ''; changed()}}
view.value?.events.on('editingFieldChanged', edited)
sourceView?.events.on('editingFieldChanged', edited)
watch(() => busy.value || sourceDialogs.value > 0 || sourceState.value.pending || sourceState.value.status !== 'idle' || state.value.pending || state.value.status !== 'idle', value => emit('pending', value), {immediate: true, flush: 'sync'})
function changed(): void {tick.value++; emit('changed')}
async function run(action: 'save' | 'verify'): Promise<void> {
  if (busy.value || props.disabled || sourceDialogs.value > 0) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    if (action === 'save') await owner.value.save([], sourceOwners())
    else {
      const inputs = sourceOwners()
      if (owner.value.hasRecoveryCapture()) await owner.value.reload(true)
      else await owner.value.prepareReload(owner.value.getState().pending)()
      const reloadInputs = LowcodeDataSpaceSourceInputEdit.prepareReloadBatch(inputs, inputs.some(item => item.getState().pending))
      await reloadInputs()
    }
    if (active) message.value = action === 'save' ? '模型配置已保存并回读；重新打开可重建目标定义' : '已读取当前模型配置；未重复提交'
  } catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
function save(): Promise<void> {return run('save')}
const dialogOpen = computed(() => sourceDialogs.value > 0)
const canSave = computed(() => !blocked.value && sourceState.value.status === 'idle' && (state.value.pending || sourceState.value.pending) && !dialogOpen.value)
defineExpose({save, canSave, busy, dialogOpen})
function verify(): Promise<void> {return run('verify')}
function discard(): void {
  if (busy.value || props.disabled || dialogOpen.value || state.value.status !== 'idle' || sourceState.value.status !== 'idle') return
  try {owner.value.discard(); sourceOwners().forEach(item => item.discard()); error.value = ''; message.value = '已放弃未提交的模型配置'; changed()} catch (cause) {error.value = describe(cause)}
}
onBeforeUnmount(() => {
  active = false; inputFieldsGeneration++; sourceGeneration++; sourceView?.events.off('editingFieldChanged', edited); unsubscribeCascade(); view.value?.events.off('editingFieldChanged', edited); emit('pending', false)
  if (dataSet.destroyed) return
  for (const {viewId} of candidateViews) dataSet.removeCascade({cascadeId: `${candidates.tableName}_${viewId}`})
  dataSet.removeTable(candidates.tableName)
})
</script>
<style scoped>
.request-layout {display:grid; grid-template-columns:minmax(0,.95fr) minmax(360px,1.05fr); gap:28px; align-items:start;}
.request-layout > * {min-width:0;}
.request-source-inputs {margin-top:14px;}
.request-sections {display:flex; flex-direction:column; gap:22px;}
.request-section :deep(.renderer-section-header) {padding-bottom:12px; border-bottom:1px solid var(--el-border-color-light); margin-bottom:14px;}
.request-section :deep(.renderer-section-title) {font-weight:700;}
.model-properties {display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px 24px;}
.request-wide {grid-column:1 / -1;}
.request-card {padding:16px 18px; border:1px solid var(--el-border-color-light); border-radius:12px;}
.model-properties :deep(.el-form-item) {margin-bottom:0;}
.model-properties :deep(.el-radio-group) {display:flex; flex-wrap:wrap; gap:8px 22px;}
.model-properties :deep(.el-radio) {margin-right:0;}
.request-main [data-model-field="IsBusinessMain"] :deep(.el-checkbox__label),
.request-main [data-model-field="IsBusiness"] :deep(.el-checkbox__label) {display:none;}
.model-properties :deep(.el-form-item__label) {white-space:nowrap;}
pre {white-space:pre-wrap; overflow-wrap:anywhere; width:100%;}
.actions {display:flex; gap:.5rem; flex-wrap:wrap; margin:1rem 0;}
[role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
@media (max-width:760px) {.model-properties {grid-template-columns:1fr;}}
@media (max-width:1100px) {.request-layout {grid-template-columns:1fr;}}
</style>
