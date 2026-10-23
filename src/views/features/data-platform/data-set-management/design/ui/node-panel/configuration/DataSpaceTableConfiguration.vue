<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/configuration/DataSpaceTableConfiguration
职责：通过标准组件维护DataTable的字段计算定义或API及crudConfig，复用同一绑定与保存链。
边界：配置属于绑定定义DataView；查询、编辑、取消、保存由SPARK data承担。
AI用途：模型数据处理工作区，保留旧模型目标原值，不将目标名转换为URL。
-->
<template>
  <section :aria-label="columnsSection ? '模型字段配置工作区' : '数据处理工作区'">
    <p v-if="error || state.error" role="alert">{{ error || state.error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="busy" role="status">正在处理…</p>
    <p v-if="readbackFailure && !error" role="alert">工作区回读未完成：{{ readbackFailure }}</p>
    <RendererButton v-if="readbackFailure" :data-view-key="bindingKey" data-action="reload-table-directory"
      label="重读工作区目录" :disabled="busy || disabled" @click="retryReadback" />
    <template v-if="ready">
      <p v-if="columnsSection">本地计算字段由同一模型的多个数据视图共用。公式用于当前行字段计算，可引用ctx；计算顺序与下方顺序一致。远程模型的旧子表聚合公式已停止本地统计并保留原文，须确认后端查询及结果绑定后再显式调整。计算结果不提交为业务数据。</p>
      <p v-else>数据处理配置属于当前模型，同一模型的多个数据视图共用。查询条件、排序、分页与树参数在各数据视图中设置。</p>
      <RendererTable v-if="bindingCount > 1" :data-view-key="bindingKey" :auto-columns="false" :show-pagination="false"
        :show-data-view-meta="false" highlight-current-row :on-row-click="selectBinding">
        <FieldText field="tableName" label="模型绑定" readonly />
      </RendererTable>
      <RendererButton v-if="!bindingCount" :data-view-key="bindingKey" data-action="create-table-api-binding" label="建立模型绑定"
        :disabled="blocked" @click="createBinding" />
      <template v-else-if="columnsSection">
        <RendererButton v-if="!hasColumns" :data-view-key="bindingKey" data-action="initialize-table-columns" label="配置本地计算字段"
          :disabled="blocked" @click="initializeColumns" />
        <RendererForm v-else :key="selectedKey ?? ''" :data-view-key="bindingKey" context-data-member="currentRow" :auto-columns="false"
          :show-data-view-meta="false" :grid-columns="1">
          <FieldJson :data-view-key="bindingKey" field="configuration" label="模型字段扩展" value-format="native" :value-path="['columns']"
            mode="rows" :children="columnChildren" reorderable :readonly="blocked" :on-editing-change="value => rowEditing = value" />
        </RendererForm>
        <p>新增计算字段填写名称、标题、类型和公式。已有正式字段的校验记录保留，类型和标题仍由数据资源提供；未显示的校验属性保持原值。</p>
      </template>
      <template v-else>
        <RendererForm v-if="controlKey" :data-view-key="controlKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
          <FieldRadio field="operation" label="操作类型" :options="operations" :readonly="blocked || editing" />
        </RendererForm>
        <RendererForm :key="selectedKey ?? ''" :data-view-key="bindingKey" context-data-member="currentRow" :auto-columns="false"
          :show-data-view-meta="false" :grid-columns="1" :form-props="{labelPosition: 'top'}">
          <FieldJson field="configuration" label="操作接口" value-format="native" mode="form" :schema="apiSchema" :readonly="blocked" :on-editing-change="value => apiEditing = value" />
          <FieldJson field="configuration" label="通用运行策略" value-format="native" mode="form" :schema="strategySchema" :readonly="blocked" :on-editing-change="value => strategyEditing = value" />
        </RendererForm>
        <p>未配置时使用 SPARK data 默认接口与策略。此正式模型适配使用 POST；批量保存的各操作须使用相同端点和超时。</p>
      </template>
      <RendererSection v-if="!columnsSection" title="原配置记录" collapsible :default-collapsed="true" lazy :data-view-key="modelKey">
        <p>以下是原数据库记录中的目标模型名称，保留只读；它们不作为原生 DataTable 的接口地址执行。</p>
        <RendererForm :data-view-key="modelKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="3">
          <FieldText field="addApi" label="原新增目标" readonly />
          <FieldText field="updateApi" label="原编辑目标" readonly />
          <FieldText field="deleteApi" label="原删除目标" readonly />
        </RendererForm>
      </RendererSection>
      <div class="actions">
        <RendererButton v-if="!workspaceActions" :data-view-key="bindingKey" :data-action="columnsSection ? 'save-table-columns' : 'save-table-api'"
          :label="`保存${title}`" button-type="primary" :disabled="!canSave" @click="save" />
        <RendererButton :data-view-key="bindingKey" :data-action="columnsSection ? 'discard-table-columns' : 'discard-table-api'" :label="`取消${title}修改`" :disabled="blocked || editing || !pending" @click="discard" />
        <RendererButton v-if="state.file && state.file.saveStatus !== 'idle'" :data-view-key="bindingKey" :label="`核验${title}提交`"
          :disabled="busy || disabled" @click="save" />
      </div>
    </template>
    <RendererButton v-else-if="!busy" :data-view-key="bindingKey" :label="`重读${title}`" :disabled="disabled" @click="load" />
  </section>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {buildDataViewKey, RequestState, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererForm, RendererTable, RendererSection, FieldText, FieldRadio, FieldJson, type RTableProps} from '@spark-appworks/spark-component'
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import type {DataSpaceTableConfigurationProps} from './DataSpaceTableConfiguration.props'

const props = defineProps<DataSpaceTableConfigurationProps>()
const columnsSection = props.section === 'columns'
const title = columnsSection ? '字段配置' : '数据处理'
const emit = defineEmits<{changed: []; pending: [value: boolean]}>()
const dataSet = props.session.metadataDataSet
const source = dataSet.getView('DataTableBindingDefinition', 'default')!
if (!source) throw new Error('正式元数据空间缺少模型绑定定义视图')
const bindings = source.createQueryView('tableConfiguration:' + crypto.randomUUID())
const bindingKey = buildDataViewKey(bindings.tableName, bindings.viewId, dataSet.scenarioId)
const modelKey = buildDataViewKey('Base_DataModel', 'default', dataSet.scenarioId)
const controlTable = columnsSection ? undefined : dataSet.addTable('DataProcessControl_' + crypto.randomUUID().replaceAll('-', ''),
  [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'operation', type: 'string'}])
if (controlTable) controlTable.resourceType = 'static-data'
const controls = controlTable?.getOrCreateView('default')
if (controls) {
  controls.commitMode = 'staged'
  controls.replaceRows([{id: 'operation', operation: 'list'}]); controls.setCurrentRowById('operation')
}
const controlKey = controls ? buildDataViewKey(controls.tableName, controls.viewId, dataSet.scenarioId) : undefined
const operations = [{value: 'list', label: '查询'}, {value: 'create', label: '新增'}, {value: 'update', label: '编辑'}, {value: 'delete', label: '删除'}]
const busy = ref(false), ready = ref(false), tick = ref(0), error = ref(''), message = ref(''), rowEditing = ref(false)
const apiEditing = ref(false), strategyEditing = ref(false)
const editing = computed(() => rowEditing.value || apiEditing.value || strategyEditing.value)
let active = true
let loadedRevision: number | undefined, needsReadback = false
const describeError = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const state = computed(() => {
  tick.value; props.revision
  try {return {file: props.session.viewState, error: ''}} catch (cause) {return {file: null, error: describeError(cause)}}
})
const pending = computed(() => {tick.value; return bindings.hasEditingChanges() || bindings.dirtyTracking.hasPendingChanges()})
const readbackViews = [bindings, source, dataSet.getView('DataViewDefinition', 'default')].filter(view => view !== undefined)
const readbackFailure = computed(() => {
  tick.value
  const failed = readbackViews.find(view => view.requestState === RequestState.Failed)
  return failed ? failed.loadingError?.message ?? '查询未完成' : ''
})
const blocked = computed(() => busy.value || props.disabled || !!state.value.error || !!state.value.file && state.value.file.saveStatus !== 'idle')
const bindingCount = computed(() => {tick.value; return bindings.rows.length})
const selectedKey = computed(() => {tick.value; return bindings.currentRow ? bindings.getPkKey(bindings.currentRow) : undefined})
const hasColumns = computed(() => {
  tick.value
  const config = selectedKey.value === undefined ? undefined : bindings.getEditingRow(selectedKey.value)?.['configuration']
  return isRecord(config) && Object.hasOwn(config, 'columns')
})
const columnChildren: SparkNode[] = [
  {type: 'r-text', props: {field: 'name', label: '名称'}},
  {type: 'r-text', props: {field: 'label', label: '标题'}},
  {type: 'r-text', props: {field: 'type', label: '类型'}},
  {type: 'r-textarea', props: {field: 'computeExpression', label: '计算表达式', autosize: {minRows: 2, maxRows: 6}}},
]
function initializeColumns(): void {
  const key = selectedKey.value
  if (blocked.value || key === undefined || hasColumns.value) return
  const config = bindings.getEditingRow(key)?.['configuration']
  if (!isRecord(config)) return
  try {bindings.updateEditingValue(key, 'configuration', {...config, columns: []}); changed()}
  catch (cause) {error.value = describeError(cause)}
}
const operation = computed(() => {tick.value; return String(controls?.getEditingRow('operation')?.['operation'] ?? 'list')})
const apiSchema = computed<JsonSchemaObject>(() => ({type: 'object', properties: {api: {type: 'object', title: '操作端点', properties: {
  [operation.value]: {type: 'object', title: operations.find(item => item.value === operation.value)?.label ?? operation.value, properties: {
    url: {type: 'string', title: '接口地址', description: '同源绝对路径，例如 /api/DataOperation/GetData；移除该操作配置恢复默认接口。'},
    method: {type: 'string', title: '请求方法', enum: ['POST']},
    headers: {title: '附加请求头', description: 'JSON对象；不覆盖身份、权限及查询上下文。'},
    params: {title: '固定参数', description: 'JSON对象；运行查询和提交参数由 SPARK data 生成。'},
  }},
}}}}))
const strategySchema: JsonSchemaObject = {type: 'object', properties: {crudConfig: {type: 'object', title: '调用策略', properties: {
  timeout: {type: 'integer', title: '超时（毫秒）', minimum: 1},
  retryCount: {type: 'integer', title: '自动重试次数', enum: [0], description: '写入不自动重试；未知结果沿原提交核验。'},
  validateData: {title: '提交校验', enum: [true], description: '保持数据校验，不能以配置跳过权限或校验。'},
}}}}
function changed(): void {if (active) {tick.value++; emit('changed')}}
const events = ['editingChanged', 'rowsChanged', 'requestStateChanged', 'currentRowChanged', 'mutatingChanged'] as const
for (const event of events) bindings.events.on(event, changed)
for (const view of readbackViews) view.events.on('requestStateChanged', changed)
const offMutations = dataSet.onAnyViewChange({mutatingChanged: changed})
controls?.events.on('rowsChanged', changed)
controls?.events.on('editingChanged', changed)
controls?.events.on('editingFieldChanged', changed)
watch(() => busy.value || pending.value || editing.value || !!state.value.file && state.value.file.saveStatus !== 'idle', value => emit('pending', value), {immediate: true, flush: 'sync'})

function modelIdentity(): {modelId: string; modelName: string} {
  const models = dataSet.getView('Base_DataModel', 'default'), row = models?.rows.find(row => models.getPkKey(row) === props.modelId)
  if (!models || !row || row['dataSetId'] !== props.session.targetId || typeof row['Name'] !== 'string' || !row['Name']
    || ['rowid', 'dataSetId', 'Name'].some(field => models.fieldAccess(row, field).read !== 'visible')) throw new Error('模型身份不可用，请重新打开')
  return {modelId: props.modelId, modelName: row['Name']}
}
async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value || props.disabled) return
  busy.value = true; error.value = ''; message.value = ''
  try {await action()} catch (cause) {if (active) error.value = describeError(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
async function load(): Promise<void> {
  if (pending.value) return
  await run(async () => {
    if (needsReadback) {await readback(); return}
    const identity = modelIdentity()
    const selected = selectedKey.value
    bindings.configure({queryContext: {dataSpaceId: props.session.targetId}, commitMode: 'staged', queryConfig: {allPages: true, maxRows: 50000},
      filterExpression: {field: 'dataModelId', operator: 'eq', value: identity.modelId}, fieldProjection: []})
    const result = await bindings.loadFromServer({singleFlight: false})
    if (!result.success) throw new Error(result.message ?? '模型绑定读取失败')
    if (!active) return
    if (bindings.rows.some(row => row['dataModelId'] !== identity.modelId || row['dataModelName'] !== identity.modelName
      || ['dataModelId', 'dataModelName'].some(field => bindings.fieldAccess(row, field).read !== 'visible'))) {
      throw new Error('模型绑定身份不匹配或名称已被占用，请在数据视图工作区核对绑定')
    }
    if (!bindings.rows.length) {
      const available = await bindings.loadFromServer({filter: {field: 'tableName', operator: 'eq', value: identity.modelName}, singleFlight: false})
      if (!available.success) throw new Error(available.message ?? '模型绑定名称读取失败')
      if (!active) return
      if (bindings.rows.length) throw new Error('模型绑定身份不匹配或名称已被占用，请在数据视图工作区核对绑定')
    }
    selectCurrent(selected)
    loadedRevision = state.value.file?.revision
    ready.value = true
  })
}
function selectCurrent(key: string | number | undefined): void {
  const row = bindings.rows.find(row => bindings.getPkKey(row) === key) ?? bindings.rows[0]
  if (row) bindings.setCurrentRowById(bindings.getPkKey(row)!)
}
async function readback(): Promise<void> {
  const selected = selectedKey.value
  for (const view of readbackViews) {
    const result = await view.requestRefresh()
    if (!result.success) throw new Error(`保存已确认，工作区回读未完成：${result.message ?? '查询失败'}`)
  }
  if (!active) return
  selectCurrent(selected)
  loadedRevision = state.value.file?.revision
  needsReadback = false; ready.value = true
  message.value = readbackViews.some(view => view.refreshPending) ? `${title}已保存，目录将在当前修改或操作结束后更新` : `${title}已保存并回读确认`
}
async function retryReadback(): Promise<void> {return run(readback)}
const selectBinding: NonNullable<RTableProps['onRowClick']> = (...args) => {if (blocked.value || editing.value) args[3].cancel = true}
async function createBinding(): Promise<void> {
  if (blocked.value || bindingCount.value) return
  try {
    const identity = modelIdentity()
    await bindings.addRow({dataSetId: props.session.targetId, tableName: identity.modelName, resourceType: 'database', configuration: {modelBinding: identity}})
    const row = bindings.rows.find(row => row['tableName'] === identity.modelName)
    if (!row) throw new Error('模型绑定新增未接纳')
    const key = bindings.getPkKey(row)
    if (key !== undefined) bindings.setCurrentRowById(key)
    changed()
  } catch (cause) {error.value = describeError(cause)}
}
const canSave = computed(() => !blocked.value && pending.value && !editing.value)
async function save(): Promise<void> {
  if (!pending.value || editing.value) return
  await run(async () => {
    modelIdentity()
    const saved = await dataSet.saveChanges({views: [{tableName: bindings.tableName, viewId: bindings.viewId}]})
    if (!saved.success) throw new Error(saved.message ?? `${title}保存未确认`)
    if (!active) return
    needsReadback = true; ready.value = false
    await readback()
  })
}
function discard(): void {
  if (blocked.value || editing.value) return
  try {bindings.discardPendingChanges(); error.value = ''; message.value = `已取消${title}修改，未提交`; changed()}
  catch (cause) {error.value = describeError(cause)}
}
defineExpose({save, canSave, busy, interactionLocked: editing})
watch([() => props.disabled, busy, pending, editing, () => state.value.file?.revision,
  () => state.value.file?.dirty, () => {tick.value; return bindings.dataTable?.viewList.some(view => view.mutating)}], () => {
  if (!blocked.value && !pending.value && !editing.value && !error.value
    && !state.value.file?.dirty && !bindings.dataTable?.viewList.some(view => view.mutating)
    && (!ready.value || loadedRevision !== state.value.file?.revision)) void load()
}, {immediate: true})
onBeforeUnmount(() => {
  active = false
  offMutations()
  for (const event of events) bindings.events.off(event, changed)
  for (const view of readbackViews) view.events.off('requestStateChanged', changed)
  controls?.events.off('rowsChanged', changed); controls?.events.off('editingChanged', changed); controls?.events.off('editingFieldChanged', changed)
  if (!dataSet.destroyed) {bindings.dataTable?.destroyView(bindings.viewId); if (controlTable) dataSet.removeTable(controlTable.tableName)}
  emit('pending', false)
})
</script>
<style scoped>
.actions {display:flex; flex-wrap:wrap; gap:.5rem; margin:.75rem 0}
[role="alert"] {color:var(--el-color-danger)}
</style>
