<!--
@module app:views/features/data-platform/data-set-management/design/ui/edge-panel/data-set-design-edge-panel
职责：维护原生关系完整过滤表达式和值函数，通过关系元数据表保存并重开。
边界：旧关系在导入边界转换；数据逻辑由spark-data承载，持久化归原会话。
AI用途：为层次设计页提供关系增改删、取消和未知提交核验入口。
-->
<template>
  <section aria-label="模型关系编辑" class="relation-editor">
    <p>父模型与子模型之间的稳定关系，由完整过滤表达式和值函数定义。</p>
    <p v-if="error || state.error" role="alert">{{ error || state.error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="!state.file">尚无场景配置，请先在模型下建立数据视图绑定，再定义关系。</p>
    <p v-if="state.file?.saveStatus === 'unknown'" role="alert">文件提交结果未知，请先核验；不会自动重复写入。</p>
    <div class="actions">
      <RendererButton button-type="primary" data-action="save-relations" :disabled="blocked || !dirty || editingFilter || !!newId" @click="save" label="保存关系配置" />
      <RendererButton data-action="discard-relations" :disabled="blocked || !localDirty" @click="discard" label="取消未提交修改" />
      <RendererButton v-if="state.file?.saveStatus === 'unknown'" data-action="verify-relations" :disabled="busy || disabled" @click="verify" label="核验文件提交" />
      <RendererButton v-if="localDirty || state.file?.dirty" data-action="preview-remote-relations" :disabled="busy || disabled || state.file?.saveStatus === 'pending'" @click="previewRemote" label="查看远端并处理草稿" />
    </div>
    <div v-if="remote" class="remote">
      <p>确认后采用已展示的远端共享配置，取消本地未提交的关系修改。</p>
      <pre>{{ remote.text === null ? '远端尚无配置' : remote.text }}</pre>
      <RendererButton data-action="adopt-remote-relations" :disabled="busy || disabled" @click="adoptRemote" label="确认采用已展示远端" />
      <RendererButton :disabled="busy" @click="remote = null" label="取消处理" />
    </div>
    <template v-if="!state.error && row && view">
      <p v-if="source">此关系已按本仓结构编辑；来源标识只用于追踪。保存完整关系配置，保留旧数据库记录。</p>
      <RendererForm :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked || editingFilter}">
        <FieldText field="relationId" label="关系标识" :readonly="fromLayout" />
      </RendererForm>
      <RendererForm :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked}">
        <FieldText field="relationName" label="关系名称" />
      </RendererForm>
      <RendererButton :disabled="blocked || row['relationName'] === undefined" data-action="clear-relation-name" @click="change('relationName', undefined)" label="移除名称配置" />
      <RendererForm :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked || editingFilter}">
        <FieldSelect v-for="endpoint in endpoints" :key="endpoint.key" :field="endpoint.key" :label="endpoint.label" :readonly="fromLayout" :clearable="false" placeholder="请选择模型绑定" />
      </RendererForm>
      <p v-for="diagnostic in endpointDiagnostics" :key="diagnostic" role="alert">{{ diagnostic }}</p>
      <p v-if="catalog.error" role="alert">{{ catalog.error }}</p>
      <p v-if="catalogLoading" role="status">正在读取当前关系的模型字段…</p>
      <RendererButton v-if="catalog.error" :disabled="catalogLoading || blocked" @click="loadCatalog" label="重试关系字段目录" />
      <div class="filter" data-relation-filter>
        <h3>关系条件</h3>
        <RendererFilterExpression v-if="!catalogLoading && !repairEditing && !catalog.error && filterState.valid" :data-view-key="definitionViewKey"
          data-member="currentRow" field="filterExpression" :columns="catalog.columns" display="dialog" display-mode="box"
          :function-context="catalog.context" :disabled="blocked" :on-editing-change="filterEditingChanged" />
        <template v-else-if="!catalogLoading">
          <RendererButton v-if="!repairEditing" data-action="repair-relation-filter" :disabled="blocked" @click="beginRepair" label="修复关系表达式" />
          <template v-else>
            <p>当前定义无法提供完整字段目录，原表达式保留。修复后仍须通过完整装配校验。</p>
            <RendererForm :data-view-key="controlViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked}">
              <FieldJson field="filterText" label="待修复关系表达式" mode="text" :height="240" />
            </RendererForm>
            <RendererButton data-action="apply-relation-json" :disabled="blocked" @click="applyJson" label="应用修复" />
            <RendererButton data-action="cancel-relation-repair" :disabled="busy" @click="repairEditing = false" label="取消修复" />
          </template>
        </template>
        <p v-if="filterPending" role="status">请先应用或取消过滤编辑，再保存或切换关系。</p>
      </div>
      <div v-for="flag in flags" :key="flag.key" :data-relation-property="flag.key">
        <RendererForm :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1"
          :form-props="{disabled: blocked}">
          <FieldCheckbox :field="flag.key" :label="flag.label" />
        </RendererForm>
        <span v-if="row[flag.key] === undefined">未配置</span>
        <RendererButton :disabled="blocked || row[flag.key] === undefined" :data-clear-relation-property="flag.key" @click="change(flag.key, undefined)" label="移除配置" />
      </div>
      <p>级联更新和删除是结构声明；页面输入的值级联在独立配置中维护。</p>
      <RendererButton button-type="danger" data-action="remove-relation" :disabled="blocked || editingFilter" @click="remove" :label="orphan ? '从草稿移除失效来源引用' : '从草稿删除此关系'" />
    </template>
    <RendererForm v-if="!state.error && !controls.destroyed" :data-view-key="controlViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1"
      :form-props="{disabled: blocked || editingFilter}" class="create-relation">
      <FieldText field="newId" label="新关系标识" placeholder="新关系标识" />
      <RendererButton data-action="add-relation" :disabled="blocked || editingFilter || !newId" @click="add" label="新增关系草稿" />
    </RendererForm>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {FieldText, FieldJson, FieldSelect, FieldCheckbox, RendererButton, RendererForm, RendererFilterExpression, FilterExpressionEditorDraft} from '@spark-appworks/spark-component'
import {buildDataViewKey, DataViewFilter, type DataViewFilterTree} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import type {DataSpaceRelationEditorProps} from './data-set-design-edge-panel.props'

const props = defineProps<DataSpaceRelationEditorProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]; select: [key: string | number | undefined]}>()
const busy = ref(false), error = ref(''), message = ref(''), tick = ref(0), filterPending = ref(false), repairEditing = ref(false)
const editingFilter = computed(() => filterPending.value || repairEditing.value)
const remote = ref<{text: string | null; revision: number} | null>(null)
const endpoints = [{key: 'parentTable', label: '父模型绑定'}, {key: 'childTable', label: '子模型绑定'}]
const flags = [{key: 'cascadeUpdate', label: '级联更新声明'}, {key: 'cascadeDelete', label: '级联删除声明'}]
let active = true
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const text = (value: unknown) => typeof value === 'string' ? value : ''
const view = computed(() => props.session.metadataDataSet.getView('DataResourceRelationDefinition', 'default'))
const definitionViewKey = buildDataViewKey('DataResourceRelationDefinition', 'default', props.session.metadataDataSet.scenarioId)
const dataSet = props.session.metadataDataSet
const controlTable = dataSet.addTable(`RelationControls_${crypto.randomUUID().replaceAll('-', '')}`,
  ['id', 'newId', 'filterText'].map(name => ({name, type: 'string', isPrimaryKey: name === 'id'})))
controlTable.resourceType = 'static-data'
const controls = controlTable.getOrCreateView('default')
const controlViewKey = buildDataViewKey(controlTable.tableName, controls.viewId, props.session.metadataDataSet.scenarioId)
controls.commitMode = 'staged'
controls.replaceRows([{id: 'controls', newId: '', filterText: ''}])
controls.setCurrentRowById('controls')
const tableOptions = dataSet.addTable(`${controlTable.tableName}_tables`,
  ['id', 'dataSetId', 'tableName', 'label'].map(name => ({name, type: 'string', isPrimaryKey: name === 'id'})))
tableOptions.resourceType = 'static-data'
for (const endpoint of endpoints) {
  tableOptions.getOrCreateView(endpoint.key).configure({valueField: 'tableName', labelField: 'label', queryContext: {dataSetId: ''},
    filterExpression: {field: 'dataSetId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'dataSetId'}}})
  dataSet.addCascade({kind: 'field', cascadeId: `${tableOptions.tableName}_${endpoint.key}`,
    tableName: 'DataResourceRelationDefinition', viewId: 'default', targetField: endpoint.key,
    valueFormat: 'native', valuePolicy: {mode: 'retain'},
    parents: [{tableName: 'DataResourceRelationDefinition', viewId: 'default', field: 'dataSetId', parameter: 'dataSetId'}],
    optionsView: {tableName: tableOptions.tableName, viewId: endpoint.key}})
}
function controlText(field: string): string {tick.value; return controls.destroyed ? '' : text(controls.getEditingRow('controls')?.[field])}
function setControl(field: string, value: string): void {
  if (!controls.destroyed && controls.getEditingRow('controls')?.[field] !== value) controls.updateEditingValue('controls', field, value)
}
const newId = computed(() => controlText('newId'))
const filterText = computed(() => controlText('filterText'))
controls.events.on('editingFieldChanged', () => {if (active) changed()})
function definitionChanged(): void {
  if (!active) return
  error.value = ''; message.value = ''; remote.value = null; changed()
}
view.value?.events.on('editingFieldChanged', definitionChanged)
const stopCascade = dataSet.onFieldCascadeChange(address => {if (address.tableName === 'DataResourceRelationDefinition') tick.value++})
const state = computed(() => {
  props.revision; tick.value
  try {return {file: props.session.viewState, error: ''}} catch (cause) {return {file: null, error: describe(cause)}}
})
const row = computed(() => {
  props.revision; tick.value
  const value = props.rowKey === undefined ? undefined : view.value?.getEditingRow(props.rowKey)
  return value?.['dataSetId'] === props.session.targetId ? value : undefined
})
watch(() => [props.rowKey, props.revision], () => {
  if (!row.value || props.rowKey === undefined || state.value.error) return
  if (!view.value?.currentRow || view.value.getPkKey(view.value.currentRow) !== props.rowKey) view.value?.setCurrentRowById(props.rowKey)
}, {immediate: true, flush: 'sync'})
watch(() => JSON.stringify(state.value.file?.config['tables'] ?? {}), () => {
  if (dataSet.destroyed) return
  const tables = state.value.file?.config['tables']
  tableOptions.rows = isRecord(tables) ? Object.entries(tables).map(([name, table]) => ({id: name, dataSetId: props.session.targetId, tableName: name,
    label: isRecord(table) && isRecord(table['modelBinding']) ? `${text(table['modelBinding']['modelName'])}（${name}）` : name})) : []
}, {immediate: true})
const endpointDiagnostics = computed(() => {
  tick.value
  if (dataSet.destroyed) return []
  return endpoints.flatMap(endpoint => {
    const result = dataSet.getFieldCascadeState({tableName: 'DataResourceRelationDefinition', viewId: 'default', field: endpoint.key})
    return [result.valueStatus === 'invalid' ? `${endpoint.label} ${text(row.value?.[endpoint.key])}（引用已失效，原配置保留）` : '', result.error ?? ''].filter(Boolean)
  })
})
const source = computed(() => !!row.value && Object.hasOwn(row.value, 'sourceRelationId'))
const fromLayout = computed(() => {
  const layout = state.value.file?.config['layout'], id = row.value?.['relationId']
  return typeof id === 'string' && isRecord(layout) && isRecord(layout['unboundEdges']) && Object.hasOwn(layout['unboundEdges'], id)
})
const orphan = computed(() => source.value && row.value?.['relationId'] === undefined && row.value?.['filterExpression'] === undefined)
const localDirty = computed(() => {
  props.revision; tick.value
  return !!newId.value || editingFilter.value || view.value?.hasEditingChanges() === true || view.value?.dirtyTracking.hasPendingChanges() === true
})
const dirty = computed(() => localDirty.value || state.value.file?.dirty === true)
const blocked = computed(() => busy.value || props.disabled === true || !state.value.file || state.value.file.saveStatus !== 'idle' || !!state.value.error)
watch(() => busy.value || dirty.value || state.value.file?.saveStatus === 'unknown', value => emit('pending', value), {immediate: true, flush: 'sync'})
const filterState = computed(() => {
  if (row.value?.['filterExpression'] === undefined) return {valid: true, tree: undefined}
  const parsed = DataViewFilter.parse(row.value?.['filterExpression'])
  return parsed.ok ? {valid: parsed.value.validate({fields: FilterExpressionEditorDraft.fields(catalog.value.columns)}).length === 0,
    tree: parsed.value.toJSON()} : {valid: false, tree: undefined}
})
type RelationCatalog = Awaited<ReturnType<DataSpaceRelationEditorProps['session']['loadRelationFields']>>
const catalog = shallowRef<RelationCatalog & {error: string}>({columns: [], context: DataViewFilter.editorContext(), error: ''})
const catalogLoading = ref(false)
let catalogRevision = 0
async function loadCatalog(): Promise<void> {
  const revision = ++catalogRevision, key = props.rowKey
  catalog.value = {columns: [], context: DataViewFilter.editorContext(), error: ''}
  catalogLoading.value = false
  if (!active || key === undefined || !row.value) return
  catalogLoading.value = true
  try {
    const result = await props.session.loadRelationFields(key)
    if (active && revision === catalogRevision) catalog.value = {...result, error: ''}
  } catch (cause) {
    if (active && revision === catalogRevision) catalog.value = {...catalog.value, error: describe(cause)}
  } finally {if (active && revision === catalogRevision) catalogLoading.value = false}
}
watch([() => props.session, () => props.rowKey, () => row.value?.['parentTable'], () => row.value?.['childTable'],
  () => state.value.file?.text], loadCatalog, {immediate: true})
function changed(): void {tick.value++; emit('changed')}
function change(property: string, value: unknown): void {
  if (!active || blocked.value || !row.value || props.rowKey === undefined) return
  try {
    props.session.viewState
    view.value?.updateEditingValue(props.rowKey, property, value)
    error.value = ''; message.value = ''; remote.value = null; changed()
  } catch (cause) {error.value = describe(cause)}
}
function filterEditingChanged(value: boolean): void {if (active) filterPending.value = value}
function beginRepair(): void {setControl('filterText', JSON.stringify(row.value?.['filterExpression'], null, 2) ?? ''); repairEditing.value = true}
const applyFilter = computed(() => {
  const key = props.rowKey, parent = row.value?.['parentTable'], child = row.value?.['childTable']
  return (tree: DataViewFilterTree | undefined) => {
    if (repairEditing.value && key === props.rowKey && parent === row.value?.['parentTable'] && child === row.value?.['childTable']) change('filterExpression', tree)
  }
})
function applyJson(): void {
  const parsed = DataViewFilter.parse(filterText.value)
  if (!parsed.ok) {error.value = parsed.issues.map(issue => issue.message).join('；'); return}
  applyFilter.value(parsed.value.toJSON())
  if (!error.value) repairEditing.value = false
}
async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value || props.disabled || !active) return
  busy.value = true; error.value = ''; message.value = ''
  try {await action()} catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
function selectIdentity(id: unknown, sourceId?: unknown, previousKey?: string | number): void {
  const current = view.value
  const candidates = current?.rows.flatMap(item => {
    const key = current.getPkKey(item), draft = key === undefined ? undefined : current.getEditingRow(key)
    return draft?.['relationId'] === id && draft?.['sourceRelationId'] === sourceId && key !== undefined ? [key] : []
  }) ?? []
  emit('select', previousKey !== undefined && candidates.includes(previousKey) ? previousKey : candidates[0])
}
async function save(): Promise<void> {
  if (blocked.value || editingFilter.value || newId.value) return
  const id = row.value?.['relationId'], sourceId = row.value?.['sourceRelationId'], key = props.rowKey
  return run(async () => {
    // 提交期间保留集合入口；删除当前定义不能卸载接收回执的编辑器。
    emit('select', undefined)
    try {
      const saved = await dataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]}); if (!saved.success) throw new Error(saved.message)
      await props.session.loadGraphRelations()
      if (active) message.value = localDirty.value ? '本轮保存已确认，仍有修改待保存' : '关系配置已保存并回读确认'
    } finally {if (active) selectIdentity(id, sourceId, key)}
  })
}
function discard(): void {
  if (blocked.value) return
  try {
    props.session.viewState
    view.value?.discardPendingChanges(); setControl('newId', ''); setControl('filterText', ''); repairEditing.value = false; filterPending.value = false; remote.value = null
    message.value = '已取消未提交的关系修改'; error.value = ''; changed(); emit('select', undefined)
  } catch (cause) {error.value = describe(cause)}
}
async function add(): Promise<void> {
  if (blocked.value || editingFilter.value) return
  return run(async () => {
    const id = newId.value
    if (!id.trim() || id.trim() !== id) throw new Error('关系标识不能为空或包含首尾空白')
    if (view.value?.rows.some(item => item['relationId'] === id)) throw new Error('关系标识已存在')
    await view.value?.addRow({dataSetId: props.session.targetId, relationId: id, parentTable: '', childTable: ''})
    if (active) {setControl('newId', ''); selectIdentity(id)}
  })
}
async function remove(): Promise<void> {
  if (!active || blocked.value || editingFilter.value || props.rowKey === undefined) return
  const key = props.rowKey
  return run(async () => {emit('select', undefined); await view.value?.removeRow(key)})
}
/** 画布入口复用原生关系编辑域删除；不删除追踪的旧数据库记录。 */
defineExpose({remove})
async function verify(): Promise<void> {
  return run(async () => {
    const result = await dataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]}); if (!result.success) throw new Error(result.message)
    await props.session.loadGraphRelations()
    if (active) {emit('select', undefined); message.value = localDirty.value ? '本轮保存已确认，仍有修改待保存' : '已核验并确认保存结果'}
  })
}
async function previewRemote(): Promise<void> {
  return run(async () => {
    const revision = props.session.viewState?.revision, value = await props.session.previewRemoteViews()
    if (active && revision !== undefined) remote.value = {text: value, revision}
  })
}
async function adoptRemote(): Promise<void> {
  const preview = remote.value
  if (!preview) return
  return run(async () => {
    if (props.session.viewState?.revision !== preview.revision) throw new Error('配置已变化，请重新查看远端')
    await props.session.adoptViews({expectedRevision: preview.revision, previewText: preview.text,
      discardViews: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
    if (active) {remote.value = null; repairEditing.value = false; filterPending.value = false; setControl('newId', ''); setControl('filterText', ''); emit('select', undefined)}
  })
}
onBeforeUnmount(() => {
  active = false; stopCascade(); view.value?.events.off('editingFieldChanged', definitionChanged); emit('pending', false)
  if (dataSet.destroyed) return
  for (const endpoint of endpoints) dataSet.removeCascade({cascadeId: `${tableOptions.tableName}_${endpoint.key}`})
  dataSet.removeTable(tableOptions.tableName); dataSet.removeTable(controlTable.tableName)
})
</script>

<style scoped>
.relation-editor {border-top:1px solid var(--el-border-color); padding-top:1rem;}
.actions {display:flex; gap:.5rem; flex-wrap:wrap; margin:1rem 0;}.create-relation {margin-top:1rem;}
.filter,.remote {border:1px solid var(--el-border-color); padding:1rem; margin:1rem 0;}
pre {white-space:pre-wrap; overflow-wrap:anywhere; max-height:22rem; overflow:auto;}[role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
</style>
