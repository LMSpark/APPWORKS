<!--
@module app:views/features/data-platform/data-set-management/design/views/query-plan/DataSpaceQueryPlan
职责：以标准JSON字段和过滤组件编排原queryConfig子计划及具体父结果来源。
边界：不查询业务行、不保存、不建立节点草稿；所有修改属于原DataViewDefinition行。
AI用途：查询计划目录、逐层行编辑与字段/过滤设置；外层负责原DataSet保存和取消。
-->
<template>
  <RendererSection :data-view-key="dataViewKey" data-member="currentRow" title="查询来源与子计划" :grid-columns="1" data-query-plan>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererForm v-if="definition && query" :data-view-key="dataViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
      <p>{{ derived ? '当前视图消费具体父视图的直接子结果，不另发独立查询。' : '当前视图独立查询；子计划使用同一空间已绑定的正式模型。' }}</p>
      <RendererButton :disabled="locked" :label="derived ? '改为独立查询' : '改为父结果来源'" data-action="switch-query-source"
        @click="switchOpen = true" />
      <template v-if="derived">
        <p>子模型：{{ modelName }}。来源必须声明此模型的直接子计划；保存时由正式查询链校验。</p>
        <FieldJson field="queryConfig" value-format="native" mode="form" :value-path="['parentResult']" :schema="parentSchema"
          :readonly="disabled" :on-editing-change="value => pending(value, 'parent')" />
      </template>
      <template v-else>
        <p v-if="!supportsChildren">先在输出类型选择Join、Navigation或HierarchyData，再建立子计划。</p>
        <RendererButton v-if="query['children'] === undefined" data-action="initialize-query-children" label="建立子计划列表"
          :disabled="locked || !supportsChildren" @click="structure('children')" />
        <template v-else>
          <RendererButton :disabled="locked" label="移除整个子计划" data-action="remove-query-children" @click="structure('remove')" />
          <FieldJson :data-view-key="dataViewKey" data-member="currentRow" field="queryConfig" value-format="native" mode="outline"
            :value-path="['children']" outline-children-field="children" :children="outlineFields" :selected-path="selected"
            :on-selected-path-change="select" :height="220" />
          <div class="plan-actions">
            <RendererButton :disabled="locked" label="根子计划列表" data-action="query-plan-root" @click="select(null)" />
            <RendererButton v-if="selected" :disabled="locked" label="返回上一级子列表" @click="select(selected.length > 1 ? selected.slice(0, -2) : null)" />
          </div>
          <template v-if="node">
            <h4>{{ node['modelName'] }} · 输出字段与过滤</h4>
            <p v-if="fieldsError" role="alert">{{ fieldsError }}</p>
            <FieldJson field="queryConfig" value-format="native" mode="form" :value-path="nodePath" :schema="fieldsSchema"
              :readonly="disabled || !!fieldsError || pendingOther('fields')" :on-editing-change="value => pending(value, 'fields')" />
            <RendererFilterExpression v-if="!fieldsError" field="queryConfig" :value-path="[...nodePath, 'filter']" :columns="columns"
              display="dialog" display-mode="inline" :function-context="nodeFunctions" :disabled="disabled || pendingOther('filter')"
              :on-editing-change="value => pending(value, 'filter')" />
            <RendererButton :disabled="locked" data-action="clear-query-node" label="移除本节点字段、过滤与下级配置" @click="structure('clear')" />
          </template>
          <p>返回上一级子列表，在行编辑器确认模型名称。已有字段、过滤或下级时，须先显式移除，不能将旧配置静默套给新模型。</p>
          <RendererButton v-if="node && node['children'] === undefined" :disabled="locked" label="建立下级子计划列表" data-action="initialize-nested-children" @click="structure('children')" />
          <FieldJson v-if="Array.isArray(level)" :key="JSON.stringify(levelPath)" :data-view-key="dataViewKey" data-member="currentRow"
            field="queryConfig" value-format="native" mode="rows" :value-path="levelPath" :children="rowFields" :row-adapter="adapter"
            reorderable :readonly="disabled || pendingOther('rows')" :on-editing-change="value => pending(value, 'rows')" :max-height="300" />
        </template>
      </template>
    </RendererForm>
    <RendererDialog v-model="switchOpen" :data-view-key="dataViewKey" title="确认切换查询来源" width="620px" :grid-columns="1" destroy-on-close>
      <p v-if="derived">仅移除parentResult，保留其余原配置。取消未提交修改可恢复原父来源。</p>
      <template v-else>
        <p>切换将移除这些冲突配置：{{ conflicts.join('、') || '无' }}；显式设置无分页。其他配置保留，整个修改仍可取消。</p>
        <p v-if="independent.length" role="alert">请先在原配置区域移除独立设置：{{ independent.join('、') }}。</p>
      </template>
      <RendererButton label="取消" @click="switchOpen = false" />
      <RendererButton data-action="confirm-query-source" label="确认切换" :disabled="disabled || !derived && !!independent.length" @click="switchSource" />
    </RendererDialog>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {buildDataViewKey, DataViewFilter, DataViewOptionCatalog, type DataColumn, type DataViewFilterFunctionContext, type SparkNodeChildren} from '@spark-appworks/spark-data'
import {asJsonValue, getValueAtJsonPath, isJsonObject, type JsonPath, type JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {FieldJson, RendererButton, RendererDialog, RendererFilterExpression, RendererForm, RendererSection} from '@spark-appworks/spark-component'
import type {DataSpaceViewEditorProps} from '../DataSpaceViewEditor.props'
const props = defineProps<Pick<DataSpaceViewEditorProps, 'session' | 'rowKey' | 'revision' | 'disabled'> & {dataViewKey: string; modelName: string; functionContext?: DataViewFilterFunctionContext}>()
const emit = defineEmits<{changed: []; pending: [value: boolean]}>()
const initialSession = props.session, ds = initialSession.metadataDataSet, source = ds.getView('DataViewDefinition')!, bindings = ds.getView('DataTableBindingDefinition')!
const models = new DataViewOptionCatalog(ds), parents = new DataViewOptionCatalog(ds)
const tick = ref(0), error = ref(''), selected = ref<JsonPath | null>(null), edits = ref(new Map<string, boolean>()), switchOpen = ref(false)
const outputColumns = shallowRef<readonly DataColumn[]>([]), columns = shallowRef<readonly DataColumn[]>([]), functions = shallowRef<DataViewFilterFunctionContext>({}), fieldsError = ref('')
let active = true, attempt = 0
const refresh = () => {tick.value++}
for (const view of [source, bindings]) for (const event of ['rowsChanged', 'editingChanged', 'currentRowChanged'] as const) view.events.on(event, refresh)
onBeforeUnmount(() => {active = false; attempt++; models.dispose(); parents.dispose(); emit('pending', false)
  for (const view of [source, bindings]) for (const event of ['rowsChanged', 'editingChanged', 'currentRowChanged'] as const) view.events.off(event, refresh)})
const definition = computed(() => {props.revision; tick.value
  if (props.session !== initialSession || props.rowKey === undefined || source.destroyed || source.getPkKey(source.currentRow ?? {}) !== props.rowKey) return undefined
  if (['dataSetId', 'dataModelName', 'queryConfig'].some(field => source.fieldAccess(source.currentRow, field).read !== 'visible')) return undefined
  const row = source.getEditingRow(props.rowKey)
  return row?.['dataSetId'] === props.session.targetId && row['dataModelName'] === props.modelName ? row : undefined
})
const query = computed<Record<string, unknown> | null | undefined>(() => definition.value && (definition.value['queryConfig'] === undefined ? {} : isRecord(definition.value['queryConfig']) ? definition.value['queryConfig'] : null))
const derived = computed(() => isRecord(query.value?.['parentResult']))
const supportsChildren = computed(() => ['Join', 'Navigation', 'HierarchyData'].includes(String(query.value?.['outputType'])))
const nodePath = computed<JsonPath>(() => ['children', ...(selected.value ?? [])])
function at(path: JsonPath): Record<string, unknown> | undefined {try {const root = asJsonValue(query.value); if (!isJsonObject(root)) return undefined; const value = getValueAtJsonPath(root, path); return isJsonObject(value) ? value : undefined} catch {return undefined}}
const node = computed(() => selected.value ? at(nodePath.value) : undefined)
const levelPath = computed<JsonPath>(() => selected.value ? [...nodePath.value, 'children'] : ['children'])
const level = computed(() => selected.value ? node.value?.['children'] : query.value?.['children'])
const locked = computed(() => !!props.disabled || switchOpen.value || [...edits.value.values()].some(Boolean))
function pendingOther(key: string) {return [...edits.value].some(([name, value]) => name !== key && value)}
function pending(value: boolean, key: string) {const before = edits.value.get(key); edits.value = new Map(edits.value).set(key, value)
  if (key === 'rows' && before && !value) selected.value = null}
watch(() => locked.value && !props.disabled, value => emit('pending', value))
watch(() => [props.rowKey, props.session], () => {selected.value = null; edits.value.clear(); switchOpen.value = false; attempt++})
function select(path: JsonPath | null) {if (!locked.value) selected.value = path ? [...path] : null}
const outlineFields: SparkNodeChildren = [{type: 'r-text', props: {field: 'modelName', label: '正式模型'}}]
const rowFields: SparkNodeChildren = [{type: 'r-select', props: {field: 'modelName', label: '正式模型', required: true, clearable: false, filterable: true, optionDataViewKey: models.dataViewKey}}]
const adapter = {
  read: (original: Readonly<Record<string, unknown>>) => ({modelName: original['modelName'] ?? ''}),
  write: (value: Readonly<Record<string, unknown>>, original: Readonly<Record<string, unknown>> | undefined) => {
    const name = value['modelName']
    if (typeof name !== 'string' || !name.trim()) throw Error('请选择正式模型')
    if (!original || name !== original['modelName']) {
      if (original && (original['filter'] !== undefined || original['fields'] !== undefined && (!Array.isArray(original['fields']) || original['fields'].length)
        || original['children'] !== undefined && (!Array.isArray(original['children']) || original['children'].length))) throw Error('请先显式移除旧字段、过滤与下级配置，再切换模型')
      if (!models.view.rows.some(row => row['value'] === name)) throw Error('模型候选已失效，请重新选择')
      const ancestors = [props.modelName]
      for (let end = 2; end <= nodePath.value.length && selected.value; end += 2) {const model = at(nodePath.value.slice(0, end))?.['modelName']; if (typeof model === 'string') ancestors.push(model)}
      if (ancestors.includes(name) || Array.isArray(level.value) && level.value.some(item => isRecord(item) && item['modelName'] === name)) throw Error('当前层不能重复或循环引用模型')
    }
    return {...original, modelName: name}
  },
}
const parentSchema = computed<JsonSchemaObject>(() => ({type: 'object', properties: {dataViewKey: {type: 'string', title: '具体父视图', 'x-optionDataViewKey': parents.dataViewKey}}}))
const nodeFunctions = computed(() => DataViewFilter.editorContext({...functions.value, inputParams: props.functionContext?.inputParams ?? []}))
const fieldsSchema = computed<JsonSchemaObject>(() => ({type: 'object', properties: {fields: {title: '输出字段', type: 'array', items: {type: 'string', oneOf: outputColumns.value.map(column => ({const: column.name, title: column.label || column.name}))}}}}))
const conflictNames = ['outputType', 'tree', 'allPages', 'distinct', 'maxRows', 'fields', 'children', 'filterLookups', 'sourceInputMode', 'cacheType']
const conflicts = computed(() => conflictNames.filter(key => query.value?.[key] !== undefined))
const independent = computed(() => ['filterExpression', 'sortExpression', 'treeConfig'].filter(key => definition.value?.[key] !== undefined)
  .concat(['queryContext', 'aggregates'].filter(key => {const value = definition.value?.[key]; return isRecord(value) && Object.keys(value).length > 0})))
function write(next: Record<string, unknown>) {
  if (props.disabled || !definition.value || props.rowKey === undefined) throw Error('查询定义编辑目标已失效')
  props.session.viewState
  if (source.fieldAccess(source.currentRow, 'queryConfig').write !== 'allowed') throw Error('查询配置字段不可写')
  source.updateEditingValue(props.rowKey, 'queryConfig', next); error.value = ''; refresh(); emit('changed')
}
function structure(action: 'children' | 'clear' | 'remove') {
  if (locked.value || !query.value) return
  try {const next = structuredClone(query.value), root = asJsonValue(next)
    if (!isJsonObject(root)) throw Error('查询配置不是有效JSON对象')
    if (action === 'remove') {delete root['children']; write(root); selected.value = null; return}
    const target = selected.value ? getValueAtJsonPath(root, nodePath.value) : root
    if (!isRecord(target)) throw Error('所选节点已失效')
    if (action === 'children') {if (target['children'] !== undefined) throw Error('子计划列表已经存在'); target['children'] = []}
    else for (const key of ['fields', 'filter', 'children']) delete target[key]
    write(root)
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function switchSource() {
  if (props.disabled || !query.value || !derived.value && independent.value.length) return
  try {const next = {...query.value}
    if (derived.value) delete next['parentResult']
    else {for (const key of conflictNames) delete next[key]; next['pagination'] = 'none'; next['parentResult'] = {dataViewKey: '', childModelName: props.modelName}}
    write(next); selected.value = null; switchOpen.value = false
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
watch(() => [tick.value, props.revision, props.rowKey], () => {
  const readable = (view: typeof source, row: Record<string, unknown>, keys: string[]) => keys.every(key => view.fieldAccess(row, key).read === 'visible')
  models.replace(bindings.rows.flatMap(row => readable(bindings, row, ['dataModelName', 'dataModelId', 'tableName']) && typeof row['dataModelName'] === 'string' ? [{value: row['dataModelName'], label: row['dataModelName']}] : []))
  parents.replace(source.rows.flatMap(row => {
    if (!readable(source, row, ['dataSetId', 'dataModelName', 'viewId']) || row['dataSetId'] !== props.session.targetId || typeof row['dataModelName'] !== 'string' || typeof row['viewId'] !== 'string' || source.getPkKey(row) === props.rowKey) return []
    return [{value: buildDataViewKey(row['dataModelName'], row['viewId'], props.session.targetId), label: `${row['dataModelName']} @ ${row['viewId']}`}]
  }))
}, {immediate: true})
watch(() => JSON.stringify([props.rowKey, node.value?.['modelName'], selected.value]), async () => {
  const current = ++attempt, session = props.session, path = JSON.stringify(nodePath.value)
  columns.value = []; outputColumns.value = []; functions.value = {}; fieldsError.value = ''
  if (!node.value) return
  fieldsError.value = '正在读取所选正式模型字段…'
  try {const matches = bindings.rows.filter(row => row['dataModelName'] === node.value?.['modelName'])
    if (matches.length !== 1) throw Error('模型必须具有唯一的正式视图绑定')
    const row = matches[0]!, selection = {modelId: String(row['dataModelId']), modelName: String(row['dataModelName']), tableName: String(row['tableName'])}
    const catalog = await session.loadQueryPlanFields(selection)
    if (!active || current !== attempt || session !== props.session || path !== JSON.stringify(nodePath.value)) return
    columns.value = catalog.filterColumns; outputColumns.value = catalog.outputColumns; functions.value = catalog.context; fieldsError.value = ''
  } catch (cause) {if (active && current === attempt) fieldsError.value = cause instanceof Error ? cause.message : String(cause)}
})
</script>
<style scoped>.plan-actions{display:flex;gap:8px;flex-wrap:wrap}</style>
