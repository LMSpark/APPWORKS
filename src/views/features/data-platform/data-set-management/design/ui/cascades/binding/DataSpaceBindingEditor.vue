<!--
@module app:views/features/data-platform/data-set-management/design/ui/cascades/binding/DataSpaceBindingEditor
职责：将级联端点投影为配置DataView，由仓内字段组件读写并消费公共级联。
边界：定义草稿是唯一编辑来源；端点和候选随组件释放，不独立保存。
AI用途：复用模型、视图、字段和参数的原生组件绑定链。
-->
<template>
  <fieldset :aria-label="label" :disabled="disabled">
    <legend>{{ label }}</legend>
    <RendererForm :data-view-key="inputViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" grid-min-width="220px" :form-props="{disabled, labelPosition: 'top'}">
      <FieldSelect :data-view-key="inputViewKey" data-member="currentRow" v-if="!fixedView" data-field="tableName" label="模型绑定" :clearable="false" />
      <FieldSelect :data-view-key="inputViewKey" data-member="currentRow" v-if="!fixedView" data-field="viewId" label="数据视图" :clearable="false" />
      <FieldSelect :data-view-key="inputViewKey" data-member="currentRow" v-if="fieldMode !== 'none'" data-field="field" label="字段" :clearable="fieldMode === 'optional'"
        :placeholder="fieldMode === 'optional' ? '选中行主键值数组' : '请选择字段'" />
      <FieldText :data-view-key="inputViewKey" data-member="currentRow" v-if="endpoint === 'parent'" data-field="parameter" label="传入选项查询的参数" />
      <FieldSelect :data-view-key="inputViewKey" data-member="currentRow" v-if="endpoint === 'filter-source'" data-field="operator" label="过滤方式" :clearable="false"
        :options="[{value: '', label: '按值类型自动选择'}, {value: 'eq', label: '等于'}, {value: 'in', label: '属于集合'}, {value: 'contains', label: '文本包含'}]" />
      <template v-if="endpoint === 'query-input'">
        <FieldSelect :data-view-key="inputViewKey" data-member="currentRow" data-field="target" label="查询配置目标" :clearable="false" :options="queryTargets" />
        <FieldSelect :data-view-key="inputViewKey" data-member="currentRow" data-field="format" label="输入格式" :clearable="false" :options="[{value: '', label: '原生值'}, {value: 'json', label: 'JSON调用参数对象'}]" />
        <FieldSelect :data-view-key="inputViewKey" data-member="currentRow" data-field="conditionEnabled" label="输入参与条件" :clearable="false" :options="[{value: 'unset', label: '始终参与'}, {value: 'enabled', label: '父值满足条件时参与'}]" />
        <FieldSelect :data-view-key="inputViewKey" data-member="currentRow" v-if="conditionEnabled" data-field="conditionField" label="条件字段" :clearable="false" />
      </template>
      <FieldSelect :data-view-key="inputViewKey" data-member="currentRow" v-if="endpoint === 'filter-source' || endpoint === 'query-input'" data-field="omitEmpty" label="空值处理" :clearable="false"
        :options="[{value: 'unset', label: '未配置（保留空值）'}, {value: 'false', label: '保留空值'}, {value: 'true', label: '空文本/null时省略'}]" />
      <FieldJson :data-view-key="inputViewKey" data-member="currentRow" v-if="endpoint === 'query-when' || conditionEnabled"
        data-field="equalsValue" label="条件值" value-format="native" :readonly="disabled" :height="240" />
    </RendererForm>
    <p v-if="endpoint === 'query-input'">JSON格式仅用于调用参数。条件不满足时，此输入不参与子查询配置。</p>
    <p v-if="loadingFields" role="status">正在读取所选视图的字段…</p>
    <p v-for="message in invalidReferences" :key="message" role="alert">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="invalidDraft" data-action="discard-invalid-binding" :disabled="disabled" label="撤销本项未应用输入" @click="discardInvalid" />
  </fieldset>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {FieldJson, FieldSelect, FieldText, RendererButton, RendererForm} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {buildDataViewKey, DataViewQueryCascadeInputs, type DataRow, type DataViewCascadeInputBinding, type DataViewFilterTree} from '@spark-appworks/spark-data'
import type {DataSpaceBindingEditorProps} from './DataSpaceBindingEditor.props'

const props = withDefaults(defineProps<DataSpaceBindingEditorProps>(), {fieldMode: 'none'})
const emit = defineEmits<{changed: []; pending: [id: string, value: boolean]}>()
const error = ref(''), tick = ref(0)
const invalidDraft = ref(false)
const dataSet = props.session.metadataDataSet
const prefix = `CascadeBinding_${crypto.randomUUID().replaceAll('-', '')}`
const names = ['id', 'scope', 'tableName', 'viewId', 'field', 'parameter', 'label', 'target', 'operator', 'format', 'omitEmpty', 'conditionEnabled', 'conditionField', 'equalsValue']
const targetLabels: Record<DataViewCascadeInputBinding['target'], string> = {
  queryContext: '调用参数', pageSize: '每页条数', 'queryConfig.outputType': '查询模式', 'queryConfig.allPages': '读取完整集合',
  'queryConfig.maxRows': '完整集合上限', 'queryConfig.tree.keyField': '树节点字段', 'queryConfig.tree.parentField': '树父节点字段',
  'queryConfig.tree.nodeId': '查询节点值', 'queryConfig.tree.hasChildrenField': '是否有子节点字段', 'queryConfig.tree.mode': '树查询方向',
}
const queryTargets = DataViewQueryCascadeInputs.targets.map(value => ({value, label: targetLabels[value]}))
const input = dataSet.addTable(prefix, names.map(name => ({name, type: name === 'equalsValue' ? 'json' : 'string', isPrimaryKey: name === 'id'})))
input.resourceType = 'static-data'
const inputView = input.getOrCreateView('default')
const inputViewKey = buildDataViewKey(input.tableName, inputView.viewId, dataSet.scenarioId)
inputView.commitMode = 'staged'
const conditionEnabled = computed(() => {tick.value; return props.endpoint === 'query-input' && inputView.getEditingRow('input')?.['conditionEnabled'] === 'enabled'})
const candidates = ['tableName', 'viewId', 'field', ...props.endpoint === 'query-input' ? ['conditionField'] : []].map(field => {
  const owned = field === 'tableName' || field === 'viewId', cascadeId = `${prefix}_${field}`
  const table = owned ? dataSet.addTable(cascadeId, names.map(name => ({name, type: 'string', isPrimaryKey: name === 'id'})))
    : dataSet.getTable('DataViewFieldOption')
  if (!table) throw new Error('级联字段候选缺少正式DataViewFieldOption')
  if (owned) table.resourceType = 'static-data'
  const view = table.getOrCreateView(owned ? 'default' : cascadeId)
  const parents = field === 'tableName' ? ['scope'] : field === 'viewId' ? ['tableName'] : ['tableName', 'viewId']
  const filters: DataViewFilterTree[] = parents.map(name => ({field: name, operator: 'eq', value: {Type: 'GetInputParam', ParamName: name}}))
  if (!owned && props.writableField) filters.push({field: 'writableTarget', operator: 'eq', value: true})
  view.configure({valueField: owned ? field : 'name', labelField: 'label', queryContext: Object.fromEntries(parents.map(name => [name, ''])),
    filterExpression: {logic: 'and', filters}})
  dataSet.addCascade({kind: 'field', cascadeId, tableName: input.tableName, viewId: 'default', targetField: field,
    valueFormat: 'native', valuePolicy: {mode: 'retain'}, parents: parents.map(name => ({tableName: input.tableName, viewId: 'default', field: name, parameter: name})),
    optionsView: {tableName: table.tableName, viewId: view.viewId}})
  return {table, view, field, owned, cascadeId}
})
const record = (value: unknown): DataRow => isRecord(value) ? value : {}
const records = (value: unknown): DataRow[] => Array.isArray(value) ? value.filter(isRecord) : []
let syncing = false, active = true
function readEndpoint(): DataRow {
  const row = props.definitionView.getEditingRow(props.definitionKey) ?? {}
  if (props.endpoint === 'target') return {tableName: row['tableName'], viewId: row['viewId'], field: row['targetField']}
  if (props.endpoint === 'options') return record(row['optionsView'])
  if (props.endpoint === 'parent') return records(row['parents'])[props.index ?? -1] ?? {}
  const parent = ['query-parent', 'filter-source', 'query-input', 'query-when'].includes(props.endpoint)
  const filter = records(row['filterBindings'])[props.index ?? -1]
  const binding = records(row['inputBindings'])[props.index ?? -1]
  const condition = props.endpoint === 'query-when' ? records(row['when'])[props.index ?? -1] : record(binding?.['when'])
  return {tableName: row[parent ? 'parentTable' : 'childTable'], viewId: row[parent ? 'parentViewId' : 'childViewId'],
    field: props.endpoint === 'query-input' ? binding?.['sourceField'] : props.endpoint === 'query-when' ? condition?.['field'] : filter?.[parent ? 'sourceField' : 'targetField'],
    operator: filter?.['operator'] ?? '', target: binding?.['target'] ?? '', format: binding?.['format'] ?? '',
    omitEmpty: (props.endpoint === 'query-input' ? binding : filter)?.['omitEmpty'] === undefined ? 'unset' : String((props.endpoint === 'query-input' ? binding : filter)?.['omitEmpty']),
    conditionEnabled: binding?.['when'] === undefined ? 'unset' : 'enabled', conditionField: condition?.['field'] ?? '',
    equalsValue: condition?.['equals'] ?? null}
}
function syncEndpoint(): void {
  if (!active || inputView.destroyed || invalidDraft.value) return
  const next: DataRow = {id: 'input', scope: 'models', tableName: '', viewId: '', field: '', parameter: '', ...readEndpoint()}
  for (const key of ['tableName', 'viewId', 'field', 'parameter']) if (next[key] === undefined) next[key] = ''
  const current = inputView.getEditingRow('input')
  if (current && Object.entries(next).every(([field, value]) => Object.is(current[field], value))) return
  syncing = true
  try {inputView.discardEditingRows(); inputView.replaceRows([next]); inputView.setCurrentRowById('input')}
  finally {syncing = false; tick.value++}
}
function discardInvalid(): void {
  if (props.disabled || !active) return
  invalidDraft.value = false; error.value = ''; syncEndpoint(); emit('pending', prefix, false)
}
function writeEndpoint(): void {
  if (syncing || !active || props.disabled) return
  try {
    props.session.viewState
    const inputRow = inputView.getEditingRow('input') ?? {}, row = props.definitionView.getEditingRow(props.definitionKey)
    if (!row) throw new Error('所属级联定义不存在')
    const update = (field: string, value: unknown) => props.definitionView.updateEditingValue(props.definitionKey, field, value)
    const endpoint = {tableName: inputRow['tableName'], viewId: inputRow['viewId']}
    if (props.endpoint === 'target') {update('tableName', endpoint.tableName); update('viewId', endpoint.viewId); update('targetField', inputRow['field'])}
    else if (props.endpoint === 'options') update('optionsView', {...record(row['optionsView']), ...endpoint})
    else if (props.endpoint === 'parent') update('parents', records(row['parents']).map((item, index) => {
      if (index !== props.index) return item
      const next: DataRow = {...item, ...endpoint, parameter: inputRow['parameter']}
      if (inputRow['field']) next['field'] = inputRow['field']; else delete next['field']
      return next
    }))
    else if (props.endpoint === 'query-parent' || props.endpoint === 'query-child') {
      const side = props.endpoint === 'query-parent' ? 'parent' : 'child'
      update(`${side}Table`, endpoint.tableName); update(`${side}ViewId`, endpoint.viewId)
    } else if (props.endpoint === 'query-input' || props.endpoint === 'query-when') {
      const property = props.endpoint === 'query-input' ? 'inputBindings' : 'when'
      let equals: unknown
      if (props.endpoint === 'query-when' || inputRow['conditionEnabled'] === 'enabled') {
        equals = inputRow['equalsValue']
        if (!(equals === null || typeof equals === 'string' || typeof equals === 'boolean' || typeof equals === 'number' && Number.isFinite(equals))) throw new Error('条件值只接受字符串、数字、布尔或null')
      }
      update(property, records(row[property]).map((item, index) => {
        if (index !== props.index) return item
        if (property === 'when') return {...item, field: inputRow['field'], equals}
        const next: DataRow = {...item, target: inputRow['target']}
        for (const [property, field] of [['sourceField', 'field'], ['format', 'format']]) {
          if (inputRow[field!]) next[property!] = inputRow[field!]; else delete next[property!]
        }
        if (inputRow['omitEmpty'] === 'unset') delete next['omitEmpty']; else next['omitEmpty'] = inputRow['omitEmpty'] === 'true'
        if (inputRow['conditionEnabled'] === 'enabled') next['when'] = {field: inputRow['conditionField'], equals}; else delete next['when']
        return next
      }))
    } else update('filterBindings', records(row['filterBindings']).map((item, index) => {
      if (index !== props.index) return item
      const field = props.endpoint === 'filter-source' ? 'sourceField' : 'targetField'
      const next: DataRow = {...item, [field]: inputRow['field']}
      if (field === 'sourceField' && !inputRow['field']) delete next[field]
      if (props.endpoint === 'filter-source') {
        if (inputRow['operator']) next['operator'] = inputRow['operator']; else delete next['operator']
        if (inputRow['omitEmpty'] === 'unset') delete next['omitEmpty']; else next['omitEmpty'] = inputRow['omitEmpty'] === 'true'
      }
      return next
    }))
    error.value = ''; invalidDraft.value = false; emit('pending', prefix, false); tick.value++; emit('changed')
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause); invalidDraft.value = true; emit('pending', prefix, true); tick.value++}
}
inputView.events.on('editingFieldChanged', writeEndpoint)
function refreshCandidates(): void {
  if (!active || dataSet.destroyed) return
  try {
    const tables = props.session.viewState?.config['tables']
    const entries = isRecord(tables) ? Object.entries(tables) : []
    const modelRows: DataRow[] = [], viewRows: DataRow[] = []
    for (const [tableName, table] of entries) {
      modelRows.push({id: tableName, scope: 'models', tableName, label: isRecord(table) && isRecord(table['modelBinding']) ? `${String(table['modelBinding']['modelName'])}（${tableName}）` : tableName})
      if (!isRecord(table) || !isRecord(table['views'])) continue
      for (const viewId of Object.keys(table['views'])) {
        viewRows.push({id: JSON.stringify([tableName, viewId]), tableName, viewId, label: viewId})
      }
    }
    for (const candidate of candidates) if (candidate.owned) candidate.table.rows = candidate.field === 'tableName' ? modelRows : viewRows
    syncEndpoint()
    if (!invalidDraft.value) error.value = ''
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
const stopCascade = dataSet.onFieldCascadeChange(() => {tick.value++})
const loadingFields = ref(false)
let fieldGeneration = 0
watch(() => {
  tick.value
  const row = inputView.getEditingRow('input')
  return JSON.stringify([row?.['tableName'], row?.['viewId'], props.session.viewState?.revision])
}, async () => {
  const generation = ++fieldGeneration, row = inputView.getEditingRow('input')
  const tableName = row?.['tableName'], viewId = row?.['viewId']
  if (props.fieldMode === 'none' || typeof tableName !== 'string' || !tableName || typeof viewId !== 'string' || !viewId) {
    loadingFields.value = false; emit('pending', `${prefix}:fields`, false); return
  }
  loadingFields.value = true; emit('pending', `${prefix}:fields`, true)
  try {
    await props.session.loadCascadeFields(tableName, viewId)
    if (active && generation === fieldGeneration && !invalidDraft.value) error.value = ''
  } catch (cause) {
    if (active && generation === fieldGeneration) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (active && generation === fieldGeneration) {loadingFields.value = false; emit('pending', `${prefix}:fields`, false)}
  }
}, {immediate: true, flush: 'post'})
const invalidReferences = computed(() => {
  tick.value
  const row = inputView.getEditingRow('input') ?? {}
  return candidates.flatMap(({field}) => {
    if (field === 'field' && props.fieldMode === 'none') return []
    if (field === 'conditionField' && !conditionEnabled.value) return []
    const state = dataSet.getFieldCascadeState({tableName: prefix, viewId: 'default', field})
    return state.valueStatus === 'invalid' && row[field] ? [`${String(row[field])}（失效引用）`] : []
  })
})
watch(() => [props.revision, props.definitionKey, props.index, props.endpoint], syncEndpoint, {flush: 'post'})
watch(() => props.session.viewState?.revision, refreshCandidates, {flush: 'post'})
onMounted(refreshCandidates)
onBeforeUnmount(() => {
  emit('pending', prefix, false); emit('pending', `${prefix}:fields`, false)
  active = false; fieldGeneration++; stopCascade(); inputView.events.off('editingFieldChanged', writeEndpoint)
  if (dataSet.destroyed || !dataSet.getTable(prefix)) return
  for (const candidate of candidates) dataSet.removeCascade({cascadeId: candidate.cascadeId})
  for (const candidate of candidates) {
    if (candidate.owned) dataSet.removeTable(candidate.table.tableName)
    else candidate.table.destroyView(candidate.view.viewId)
  }
  dataSet.removeTable(prefix)
})
</script>

<style scoped>
fieldset {border:1px solid var(--el-border-color); margin:.75rem 0; min-width:0;}
[role="alert"] {color:var(--el-color-danger);}
</style>
