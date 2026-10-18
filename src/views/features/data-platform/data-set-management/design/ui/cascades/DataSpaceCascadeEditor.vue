<!--
@module app:views/features/data-platform/data-set-management/design/ui/cascades/DataSpaceCascadeEditor
职责：通过原元数据表维护值级联和查询级联，保存后由原运行链装配。
边界：不从模型关系推导级联；复用正式配置校验、文件保存和未知结果核验。
AI用途：为数据空间层次页面提供级联增改删、取消与重开闭环。
-->
<template>
  <section aria-label="数据级联编辑" class="cascade-editor">
    <p v-if="!row || isField">一个或多个输入值变化后重新查询子选项，再按明确策略约束子字段值。选中行输入提供主键值数组。</p>
    <p v-else>父视图的字段值或选中主键数组形成子视图的过滤条件；自动加载开关决定是否随输入变化查询。</p>
    <p v-if="error || state.error" role="alert">{{ error || state.error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="!state.file">请先在模型下建立数据视图绑定，再配置级联。</p>
    <p v-if="state.file?.saveStatus === 'unknown'" role="alert">文件提交结果未知，请先核验；不会自动重复写入。</p>
    <div class="actions">
      <RendererButton button-type="primary" data-action="save-cascades" :disabled="blocked || !dirty || !!newId || editingClear || incomplete" @click="save" label="保存级联配置" />
      <RendererButton data-action="discard-cascades" :disabled="blocked || !localDirty" @click="discard" label="取消未提交修改" />
      <RendererButton v-if="state.file?.saveStatus === 'unknown'" data-action="verify-cascades" :disabled="busy || disabled" @click="verify" label="核验文件提交" />
      <RendererButton v-if="localDirty || state.file?.dirty" data-action="preview-remote-cascades" :disabled="busy || disabled || state.file?.saveStatus === 'pending'" @click="previewRemote" label="查看远端并处理草稿" />
    </div>
    <div v-if="remote" class="remote">
      <p>确认后采用以下远端共享配置，取消本地未提交的级联修改。</p>
      <pre>{{ remote.text ?? '远端尚无配置' }}</pre>
      <RendererButton data-action="adopt-remote-cascades" :disabled="busy || disabled" @click="adoptRemote" label="确认采用已展示远端" />
      <RendererButton :disabled="busy" @click="remote = null" label="取消处理" />
    </div>
    <template v-if="row">
      <p>类型：{{ isField ? '字段值与子选项级联' : '视图查询级联' }}</p>
      <p v-if="row['sourceRelationId']">来源追踪：{{ row['sourceRelationId'] }}</p>
      <RendererForm v-if="view" :key="String(rowKey)" :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked || editingClear}">
        <FieldText field="cascadeId" label="级联标识" />
        <FieldSelect v-if="isField" field="valueFormat" label="子值格式" :clearable="false" :options="[{value: 'native', label: '原生值 / 主键数组'}, {value: 'selection-string', label: '已有选中值字符串'}]" />
      </RendererForm>
      <template v-if="isField">
        <DataSpaceBindingEditor label="子字段" :session="session" :revision="revision" :definition-view="view!" :definition-key="rowKey!" endpoint="target"
          field-mode="required" writable-field :disabled="blocked" @changed="changed" />
        <DataSpaceBindingEditor label="子选项来源" :session="session" :revision="revision" :definition-view="view!" :definition-key="rowKey!" endpoint="options"
          :disabled="blocked" @changed="changed" />
        <h3>父输入</h3>
        <div v-for="(_, index) in parents" :key="index" class="input-group">
          <DataSpaceBindingEditor :label="`父输入 ${index + 1}`" :session="session" :revision="revision" :definition-view="view!" :definition-key="rowKey!" endpoint="parent" :index="index"
            field-mode="optional" :disabled="blocked" @changed="changed" />
          <RendererButton :data-action="`remove-parent-${index}`" :disabled="blocked" @click="change('parents', parents.filter((_, position) => position !== index))" label="移除此输入" />
        </div>
        <RendererButton data-action="add-parent" :disabled="blocked" @click="change('parents', [...parents, {tableName: '', viewId: '', parameter: ''}])" label="添加父输入" />
        <RendererForm :data-view-key="controlViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked || editingClear}">
          <FieldSelect field="policyMode" label="子值更新策略" :clearable="false" :options="[{value: 'retain', label: '保留原值并标记有效性'}, {value: 'clear', label: '清空子值'}, {value: 'retain-valid', label: '保留有效值，清除失效值'}]" />
        </RendererForm>
        <div v-if="policy['mode'] !== 'retain'">
          <p>清空值：{{ JSON.stringify(policy['clearValue']) }}</p>
          <RendererButton data-action="edit-clear-value" :disabled="blocked || editingClear" @click="beginClear" label="设置清空值" />
          <template v-if="editingClear">
            <RendererForm :data-view-key="controlViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked}">
              <FieldJson :data-view-key="controlViewKey" data-member="currentRow" field="clearValue" label="清空值"
                value-format="native" :readonly="blocked" :height="240" />
            </RendererForm>
            <RendererButton data-action="apply-clear-value" :disabled="blocked" @click="applyClear" label="应用清空值" />
            <RendererButton data-action="cancel-clear-value" :disabled="busy" @click="editingClear = false" label="取消本项" />
          </template>
        </div>
      </template>
      <template v-else>
        <DataSpaceBindingEditor label="父查询视图" :session="session" :revision="revision" :definition-view="view!" :definition-key="rowKey!" endpoint="query-parent"
          :disabled="blocked" @changed="changed" />
        <DataSpaceBindingEditor label="子查询视图" :session="session" :revision="revision" :definition-view="view!" :definition-key="rowKey!" endpoint="query-child"
          :disabled="blocked" @changed="changed" />
        <div v-for="(_, index) in filters" :key="`${rowKey}:filter:${index}`" class="input-group">
          <DataSpaceBindingEditor :label="`查询输入 ${index + 1}`" :session="session" :revision="revision" fixed-view field-mode="optional"
            :definition-view="view!" :definition-key="rowKey!" endpoint="filter-source" :index="index" :disabled="blocked" @changed="changed" @pending="bindingPending" />
          <DataSpaceBindingEditor :label="`查询目标 ${index + 1}`" :session="session" :revision="revision" fixed-view field-mode="required"
            :definition-view="view!" :definition-key="rowKey!" endpoint="filter-target" :index="index" :disabled="blocked" @changed="changed" />
          <RendererButton :data-action="`remove-filter-${index}`" :disabled="blocked" @click="change('filterBindings', filters.filter((_, position) => position !== index))" label="移除此条件" />
        </div>
        <RendererButton data-action="add-filter" :disabled="blocked" @click="change('filterBindings', [...filters, {targetField: ''}])" label="添加过滤取值" />
        <h3>查询配置输入</h3>
        <p>同一父视图的多个字段可分别控制调用参数、每页条数及查询模式。其他父视图通过独立级联指向同一子视图，各目标属性只配置一次。</p>
        <div v-for="(_, index) in inputs" :key="`${rowKey}:input:${index}`" class="input-group">
          <DataSpaceBindingEditor :label="`查询参数 ${index + 1}`" :session="session" :revision="revision" fixed-view field-mode="optional"
            :definition-view="view!" :definition-key="rowKey!" endpoint="query-input" :index="index" :disabled="blocked" @changed="changed" @pending="bindingPending" />
          <RendererButton :data-action="`remove-query-input-${index}`" :disabled="blocked || incomplete" @click="removeOptional('inputBindings', inputs, index)" label="移除此参数" />
        </div>
        <RendererButton data-action="add-query-input" :disabled="blocked" @click="change('inputBindings', [...inputs, {target: ''}])" label="添加查询参数" />
        <h3>查询启用条件</h3>
        <p>全部条件满足才执行此级联；不满足时清空旧结果和选择，保留父输入。</p>
        <div v-for="(_, index) in conditions" :key="`${rowKey}:when:${index}`" class="input-group">
          <DataSpaceBindingEditor :label="`查询启用条件 ${index + 1}`" :session="session" :revision="revision" fixed-view field-mode="required"
            :definition-view="view!" :definition-key="rowKey!" endpoint="query-when" :index="index" :disabled="blocked" @changed="changed" @pending="bindingPending" />
          <RendererButton :data-action="`remove-query-when-${index}`" :disabled="blocked || incomplete" @click="removeOptional('when', conditions, index)" label="移除此启用条件" />
        </div>
        <RendererButton data-action="add-query-when" :disabled="blocked" @click="change('when', [...conditions, {field: '', equals: null}])" label="添加查询启用条件" />
        <div data-cascade-auto-load>
          <RendererForm :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked}">
            <FieldCheckbox field="autoLoad" label="自动加载子查询" />
          </RendererForm>
          <span v-if="row['autoLoad'] === undefined">未配置（默认加载）</span>
          <RendererButton data-action="clear-cascade-auto-load" :disabled="blocked || row['autoLoad'] === undefined" @click="change('autoLoad', undefined)" label="移除配置" />
        </div>
      </template>
      <RendererButton button-type="danger" data-action="remove-cascade" :disabled="blocked || editingClear" @click="remove" label="从草稿删除此级联" />
    </template>
    <div class="actions">
      <RendererForm :data-view-key="controlViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked || editingClear}">
        <FieldSelect field="newKind" label="新级联类型" :clearable="false" :options="[{value: 'field', label: '字段值与子选项级联'}, {value: 'query', label: '视图查询级联'}]" />
        <FieldText field="newId" label="新级联标识" />
      </RendererForm>
      <RendererButton data-action="add-cascade" :disabled="blocked || !newId || editingClear || incomplete" @click="add" label="新增级联草稿" />
    </div>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {FieldJson, FieldSelect, FieldCheckbox, FieldText, RendererButton, RendererForm} from '@spark-appworks/spark-component'
import {buildDataViewKey, type DataViewEditingFieldChangeEvent} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import DataSpaceBindingEditor from './binding/DataSpaceBindingEditor.vue'
import type {DataSpaceCascadeEditorProps} from './DataSpaceCascadeEditor.props'

const props = defineProps<DataSpaceCascadeEditorProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]; select: [key: string | number | undefined]}>()
const busy = ref(false), error = ref(''), message = ref(''), tick = ref(0), editingClear = ref(false)
const pendingBindings = ref(new Set<string>())
const incomplete = computed(() => pendingBindings.value.size > 0)
function bindingPending(id: string, value: boolean): void {if (value) pendingBindings.value.add(id); else pendingBindings.value.delete(id)}
const remote = ref<{text: string | null; revision: number} | null>(null)
let active = true
const text = (value: unknown) => typeof value === 'string' ? value : ''
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {}
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(isRecord) : []
const view = computed(() => props.session.metadataDataSet.getView('DataViewCascadeDefinition', 'default'))
const definitionViewKey = buildDataViewKey('DataViewCascadeDefinition', 'default', props.session.metadataDataSet.scenarioId)
const state = computed(() => {props.revision; tick.value
  try {return {file: props.session.viewState, error: ''}} catch (cause) {return {file: null, error: describe(cause)}}
})
const row = computed(() => {props.revision; tick.value
  const value = props.rowKey === undefined ? undefined : view.value?.getEditingRow(props.rowKey)
  return value?.['dataSetId'] === props.session.targetId ? value : undefined
})
const isField = computed(() => row.value?.['kind'] === 'field')
const parents = computed(() => records(row.value?.['parents']))
const policy = computed(() => record(row.value?.['valuePolicy'])), filters = computed(() => records(row.value?.['filterBindings']))
const inputs = computed(() => records(row.value?.['inputBindings'])), conditions = computed(() => records(row.value?.['when']))
const localDirty = computed(() => {props.revision; tick.value
  return !!newId.value || editingClear.value || incomplete.value || view.value?.hasEditingChanges() === true || view.value?.dirtyTracking.hasPendingChanges() === true
})
const dirty = computed(() => localDirty.value || state.value.file?.dirty === true)
const blocked = computed(() => busy.value || props.disabled === true || !state.value.file || state.value.file.saveStatus !== 'idle' || !!state.value.error)
const controlTable = props.session.metadataDataSet.addTable(`CascadeControls_${crypto.randomUUID().replaceAll('-', '')}`,
  ['id', 'newId', 'newKind', 'clearValue', 'policyMode'].map(name => ({name, type: name === 'clearValue' ? 'json' : 'string', isPrimaryKey: name === 'id'})))
controlTable.resourceType = 'static-data'
const controls = controlTable.getOrCreateView('default')
const controlViewKey = buildDataViewKey(controlTable.tableName, controls.viewId, props.session.metadataDataSet.scenarioId)
controls.commitMode = 'staged'
controls.replaceRows([{id: 'controls', newId: '', newKind: 'field'}]); controls.setCurrentRowById('controls')
const newId = computed(() => {tick.value; return text(controls.getEditingRow('controls')?.['newId'])})
const newKind = computed(() => {tick.value; return text(controls.getEditingRow('controls')?.['newKind'])})
watch(() => busy.value || dirty.value || state.value.file?.saveStatus === 'unknown', value => emit('pending', value), {immediate: true, flush: 'sync'})
let syncingControls = false
controls.events.on('editingFieldChanged', ({field, nextValue: value}) => {
  if (syncingControls || !active) return
  if (field === 'policyMode') change('valuePolicy', value === 'retain' ? {mode: value} : {mode: value, clearValue: policy.value['clearValue'] ?? null})
  else changed()
})
watch(() => [props.rowKey, props.revision, tick.value], () => {
  if (!active || controls.destroyed) return
  const key = props.rowKey
  if (key !== undefined && row.value && (!view.value?.currentRow || view.value.getPkKey(view.value.currentRow) !== key)) view.value?.setCurrentRowById(key)
  syncingControls = true
  try {
    const values = {policyMode: policy.value['mode']}
    for (const [field, value] of Object.entries(values)) if (controls.getEditingRow('controls')?.[field] !== value) controls.updateEditingValue('controls', field, value)
  } finally {syncingControls = false}
}, {immediate: true, flush: 'sync'})
const onDefinitionChange = (event: DataViewEditingFieldChangeEvent) => {
  if (!active) return
  if (event.field === 'cascadeId' && event.nextValue === '' && event.editingRow['kind'] !== 'field') {
    view.value?.updateEditingValue(event.rowId, 'cascadeId', undefined)
  }
  changed()
}
view.value?.events.on('editingFieldChanged', onDefinitionChange)
function changed(): void {tick.value++; emit('changed')}
function change(property: string, value: unknown): void {
  if (!active || blocked.value || !row.value || props.rowKey === undefined) return
  try {props.session.viewState; view.value?.updateEditingValue(props.rowKey, property, value); error.value = ''; message.value = ''; remote.value = null; changed()}
  catch (cause) {error.value = describe(cause)}
}
function removeOptional(property: string, values: Record<string, unknown>[], index: number): void {
  if (incomplete.value) return
  const next = values.filter((_, position) => position !== index)
  change(property, next.length ? next : undefined)
}
function beginClear(): void {controls.updateEditingValue('controls', 'clearValue', policy.value['clearValue']); editingClear.value = true}
function applyClear(): void {
  if (blocked.value || !editingClear.value) return
  try {
    const value = controls.getEditingRow('controls')?.['clearValue']
    const scalar = (item: unknown) => typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)
    if (value !== null && !scalar(value) && !(Array.isArray(value) && value.every(scalar))) throw new Error('清空值须为字符串、数字、布尔、null 或原生值数组')
    if (row.value?.['valueFormat'] === 'selection-string' && value !== null && typeof value !== 'string') throw new Error('选中值字符串格式只接受字符串或 null')
    change('valuePolicy', {...policy.value, clearValue: value}); editingClear.value = false
  } catch (cause) {error.value = describe(cause)}
}
async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value || props.disabled || !active) return
  busy.value = true; error.value = ''; message.value = ''
  try {await action()} catch (cause) {if (active) error.value = describe(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
function selectIdentity(id: unknown, previousKey?: string | number): void {
  const current = view.value
  const keys = current?.rows.flatMap(item => {
    const key = current.getPkKey(item)
    return key !== undefined && current.getEditingRow(key)?.['cascadeId'] === id ? [key] : []
  }) ?? []
  emit('select', previousKey !== undefined && keys.includes(previousKey) ? previousKey : keys[0])
}
async function save(): Promise<void> {
  if (blocked.value || newId.value || editingClear.value || incomplete.value) return
  const id = row.value?.['cascadeId'], key = props.rowKey
  return run(async () => {
    emit('select', undefined)
    try {const saved = await props.session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]}); if (!saved.success) throw new Error(saved.message)
      if (active) message.value = localDirty.value ? '本轮保存已确认，仍有修改待保存' : '级联配置已保存并回读确认'
    }
    finally {if (active) selectIdentity(id, key)}
  })
}
function discard(): void {
  if (blocked.value) return
  try {props.session.viewState; view.value?.discardPendingChanges(); controls.updateEditingValue('controls', 'newId', ''); editingClear.value = false; remote.value = null
    error.value = ''; message.value = '已取消未提交的级联修改'; changed(); emit('select', undefined)
  } catch (cause) {error.value = describe(cause)}
}
async function add(): Promise<void> {
  if (blocked.value || editingClear.value || incomplete.value) return
  return run(async () => {
    const id = newId.value
    if (!id.trim() || id.trim() !== id) throw new Error('级联标识不能为空或包含首尾空白')
    if (view.value?.rows.some(item => {const key = view.value?.getPkKey(item); return key !== undefined && view.value?.getEditingRow(key)?.['cascadeId'] === id})) throw new Error('级联标识已存在')
    const definition = newKind.value === 'field'
      ? {kind: 'field', tableName: '', viewId: '', targetField: '', parents: [], optionsView: {tableName: '', viewId: ''}, valueFormat: 'native', valuePolicy: {mode: 'retain'}}
      : {kind: 'query', parentTable: '', parentViewId: '', childTable: '', childViewId: '', filterBindings: []}
    await view.value?.addRow({dataSetId: props.session.targetId, cascadeId: id, ...definition})
    if (active) {controls.updateEditingValue('controls', 'newId', ''); selectIdentity(id)}
  })
}
async function remove(): Promise<void> {
  if (blocked.value || editingClear.value || props.rowKey === undefined) return
  const key = props.rowKey
  return run(async () => {emit('select', undefined); await view.value?.removeRow(key)})
}
async function verify(): Promise<void> {
  return run(async () => {const result = await props.session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]}); if (!result.success) throw new Error(result.message)
    if (active) {emit('select', undefined); message.value = localDirty.value ? '本轮保存已确认，仍有修改待保存' : '已核验并确认保存结果'}
  })
}
async function previewRemote(): Promise<void> {
  return run(async () => {const revision = props.session.viewState?.revision, value = await props.session.previewRemoteViews()
    if (active && revision !== undefined) remote.value = {text: value, revision}
  })
}
async function adoptRemote(): Promise<void> {
  const preview = remote.value
  if (!preview) return
  return run(async () => {
    if (props.session.viewState?.revision !== preview.revision) throw new Error('配置已变化，请重新查看远端')
    await props.session.adoptViews({expectedRevision: preview.revision, previewText: preview.text,
      discardViews: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})
    if (active) {remote.value = null; controls.updateEditingValue('controls', 'newId', ''); editingClear.value = false; emit('select', undefined)}
  })
}
onBeforeUnmount(() => {active = false; view.value?.events.off('editingFieldChanged', onDefinitionChange)
  if (!props.session.metadataDataSet.destroyed) props.session.metadataDataSet.removeTable(controlTable.tableName)
  emit('pending', false)})
</script>

<style scoped>
.cascade-editor {border-top:1px solid var(--el-border-color); padding-top:1rem;}
.actions {display:flex; gap:.5rem; flex-wrap:wrap; margin:1rem 0;}
.input-group,.remote {border:1px solid var(--el-border-color); padding:.75rem; margin:.75rem 0;}
pre {white-space:pre-wrap; overflow-wrap:anywhere; max-height:22rem; overflow:auto;}[role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
</style>
