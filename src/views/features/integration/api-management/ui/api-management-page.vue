<!--
@module app:views/features/integration/api-management/ui/api-management-page
职责：外部服务商目录与基础定义维护，保留原导航和业务路径。
边界：经标准场景入口装配；标准组件绑定DataView，校验、权限、保存及重读均由SPARK data承接，页面只转发事件。
AI用途：目录选择经查询级联驱动definition视图，新建使用空结果的create视图。
-->
<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="loading">正在读取外部服务目录…</p>
  <p v-if="ready && unresolvedModifier" role="status">部分修改人在当前可读用户目录中未解析，保留原始标识。</p>
  <RendererTable v-if="ready" :data-view-key="key('default')" :children="catalogFields" :toolbar="toolbar" :filter="{}" :on-row-click="choose" />
  <RendererDialog v-if="ready && editing" :data-view-key="key(editing)" :model-value="true" :close-disabled="busy || dirty" title="服务商基础信息设计" width="min(700px, 94vw)" @update:model-value="close">
    <p v-if="editorError" role="alert">{{ editorError }}</p>
    <RendererForm :data-view-key="key(editing)" :children="definitionFields" label-width="120px" grid-min-width="460px" :show-data-view-meta="false" />
    <RendererButton :data-view-key="key(editing)" label="保存基础信息" button-type="primary" :disabled="busy || unconfirmed" @click="save" />
    <RendererButton :data-view-key="key(editing)" :label="unconfirmed ? '重读核验（放弃本地修改）' : '放弃修改并重读'" :disabled="busy" @click="reload" />
    <RendererButton :data-view-key="key(editing)" label="放弃修改并关闭" :disabled="busy || unconfirmed" @click="cancel" />
  </RendererDialog>
  <ApiConfigPage v-if="configProviderId" :provider-id="configProviderId" @close="configProviderId = ''" />
  <ApiInterfaceListPage v-if="interfaceProviderId" :provider-id="interfaceProviderId" @close="interfaceProviderId = ''" />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererForm, RendererDialog, RendererButton, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {parseApplicationPath} from '@/services/application-scope'
import ApiConfigPage from './api-config-page.vue'
import ApiInterfaceListPage from './api-interface-list-page.vue'

type EditView = 'definition' | 'create'
const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'api-management-page'})
const ready = ref(false), loading = ref(true), error = ref(''), editorError = ref(''), busy = ref(false), revision = ref(0)
const editing = ref<EditView | ''>('')
const configProviderId = ref(''), interfaceProviderId = ref('')
let dataSet: DataSet | undefined, runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, active = true, generation = 0
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const projectId = computed(() => parseApplicationPath(route.path)?.projectId ?? '')
const key = (viewId: string, table = 'Base_InterfaceProvider') => buildDataViewKey(table, viewId, scenarioId.value)
const view = (viewId: string): DataView | undefined => {revision.value; return dataSet?.getView('Base_InterfaceProvider', viewId)}
const editView = computed(() => editing.value ? view(editing.value) : undefined)
const dirty = computed(() => {const current = editView.value; return !!current && (current.hasEditingChanges() || current.dirtyTracking.hasPendingChanges())})
const unconfirmed = computed(() => editView.value?.hasUnconfirmedSave === true)
const selected = computed(() => {const values = view('default')?.getSelectedValues() ?? []; return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''})
const unresolvedModifier = computed(() => {
  revision.value
  const users = dataSet?.getView('Base_UserInfo', 'default'), providers = view('default')
  if (!users || !providers) return false
  const ids = new Set(users.rows.filter(row => users.fieldAccess(row, 'ROWID').read === 'visible'
    && users.fieldAccess(row, 'UserName').read === 'visible').map(row => row['ROWID']))
  return providers.rows.some(row => providers.fieldAccess(row, 'updateuser').read === 'visible'
    && row['updateuser'] !== undefined && row['updateuser'] !== null && row['updateuser'] !== '' && !ids.has(row['updateuser']))
})
const catalogFields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'Name', label: '服务提供商名称', width: 220}},
  {type: 'r-text', props: {field: 'BaseURL', label: 'API 基础 URL', width: 320}},
  {type: 'r-select', props: {field: 'updateuser', label: '修改人', width: 160, optionDataViewKey: key('default', 'Base_UserInfo')}},
  {type: 'r-text', props: {field: 'updatetime', label: '修改时间', width: 180}},
])
const definitionFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'Name', label: '服务提供商名称'}},
  {type: 'r-text', props: {field: 'BaseURL', label: 'API 基础 URL'}},
]
const toolbar = computed<RToolbarProps>(() => {
  const blocked = !!configProviderId.value || !!interfaceProviderId.value || !!editing.value || busy.value
  return {wrap: true, children: [
    {type: 'r-button', props: {label: '新增服务商', permAction: 'create', disabled: blocked, onClick: () => open('create')}},
    {type: 'r-button', props: {label: '编辑基础信息', disabled: blocked || !selected.value, onClick: () => open('definition')}},
    {type: 'r-button', props: {label: '请求方案设计', disabled: blocked || !selected.value, onClick: () => {configProviderId.value = selected.value}}},
    {type: 'r-button', props: {label: '接口方案设计', disabled: blocked || !selected.value, onClick: () => {interfaceProviderId.value = selected.value}}},
    {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
  ]}
})
useSystemPageDirtySource({get isDirty() {return busy.value || dirty.value || unconfirmed.value}})
function choose(row: DataRow): void {view('default')?.setSelectedRows([row])}
async function act(action: () => Promise<unknown>): Promise<boolean> {
  if (busy.value) return false
  busy.value = true; editorError.value = ''
  try {await action(); return true}
  catch (cause) {editorError.value = cause instanceof Error ? cause.message : String(cause); return false}
  finally {busy.value = false; revision.value++}
}
async function open(target: EditView): Promise<void> {
  editing.value = target
  if (target === 'create') await act(async () => {
    const create = view('create')!
    await create.discardAndReload()
    create.setCurrentRow(await create.addRow({}))
  })
}
async function save(): Promise<void> {
  const target = editing.value
  if (!target || !dataSet) return
  const current = dataSet
  await act(async () => {
    const result = await current.saveChanges({views: [{tableName: 'Base_InterfaceProvider', viewId: target}]})
    if (!result.success) throw new Error(result.message ?? '服务商保存未完整确认')
  })
}
async function reload(): Promise<void> {const target = editing.value; if (target && dataSet) {const current = dataSet; await act(() => current.discardAndReload({views: [{tableName: 'Base_InterfaceProvider', viewId: target}]}))}}
// 目录刷新会重置选中并清空definition级联结果，因此只在对话框关闭后刷新。
function finish(): void {editing.value = ''; void view('default')?.requestRefresh()}
function close(): void {if (!busy.value && !dirty.value && !unconfirmed.value) finish()}
function cancel(): void {if (!busy.value && !unconfirmed.value) {editView.value?.discardPendingChanges(); revision.value++; finish()}}
watch([scenarioId, projectId], async ([scenario, project]) => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''; editing.value = ''; busy.value = false
  configProviderId.value = ''; interfaceProviderId.value = ''
  unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; dataSet = undefined
  try {
    const current = new PageRuntime({pageId: 'api-management-page', scenarioIds: [scenario],
      loadScenario: id => loadLowcodeRuntimeScenario({projectId: project, scenarioId: id})})
    runtime = current; await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    dataSet = current.getDataSet(scenario)!
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: changed, currentRowChanged: changed, rowsChanged: changed, editingChanged: changed,
      editingFieldChanged: changed, editingDiscarded: changed, requestStateChanged: changed})
    dataSet.triggerAutoLoad()
    sparkProvide(PAGE_RUNTIME, current); ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
function changed(): void {revision.value++}
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>
