<!--
@module app:views/features/data-platform/structured-config/logic-view/ui/logic-view-list-page
-->
<template>
  <section class="structured-catalog-page">
    <header><h1>逻辑视图</h1><p>先保存视图目录，再打开设计。</p></header>
    <p v-if="loading" role="status">正在读取逻辑视图目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :toolbar="toolbar" :filter="filter"
      :stripe="true" :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
    <RendererDialog v-if="ready && editing" :data-view-key="catalogKey" :model-value="true" :title="editing.create ? '新增逻辑视图' : '编辑逻辑视图'"
      width="min(700px, 94vw)" :close-disabled="busy || pending || unconfirmed" @update:model-value="closeEditor">
      <p v-if="!editing.create">现有视图暂不支持重命名，可修改描述。</p>
      <RendererForm :data-view-key="catalogKey" :children="editorFields" :grid-columns="1" label-width="110px" :show-data-view-meta="false" />
      <RendererButton :data-view-key="catalogKey" :label="unconfirmed ? '核验目录保存结果' : '保存目录'" :disabled="busy" @click="saveCatalog" />
      <RendererButton :data-view-key="catalogKey" label="取消" :disabled="busy || unconfirmed" @click="cancelEditor" />
    </RendererDialog>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererDialog, RendererForm, RendererButton, useSparkComponent, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {SYSTEM_PAGE_NAVIGATION_ID_QUERY, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {buildApplicationPath, parseApplicationPathScope} from '@/services/application-scope'

const route = useRoute()
const router = useRouter()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'logic-view-list-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const busy = ref(false), editing = ref<{id: string | number; create: boolean}>()
const pending = computed(() => {revision.value; return view.value?.hasEditingChanges() === true || view.value?.dirtyTracking.hasPendingChanges() === true})
const unconfirmed = computed(() => {revision.value; return view.value?.hasUnconfirmedSave === true})
useSystemPageDirtySource({get isDirty() {return busy.value || pending.value || unconfirmed.value}})
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const values = view.value?.getSelectedValues() ?? []
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeLogicView.catalogMetaName, 'default', scenarioId.value))
const designPath = '/features/data-platform/structured-config/logic-view/ui/logic-view-design-page'
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '新增视图', permAction: 'create', disabled: loading.value || busy.value || !!editing.value || pending.value, onClick: createView}},
  {type: 'r-button', props: {label: '编辑视图', disabled: !selected.value || loading.value || busy.value || !!editing.value || pending.value, onClick: editCatalog}},
  {type: 'r-button', props: {label: '打开设计', disabled: !selected.value || loading.value || busy.value || !!editing.value || pending.value || unconfirmed.value, onClick: openDesign}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh', disabled: busy.value || !!editing.value || pending.value || unconfirmed.value}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'name', label: '视图名称', width: 260}},
  {type: 'r-text', props: {field: 'description', label: '描述', width: 320}},
  {type: 'r-select', props: {field: 'sysid', label: '应用系统', optionDataViewKey: buildDataViewKey('Base_AppSystemList', 'default', scenarioId.value)}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
])
const filter = computed<RFilterProps>(() => ({autoFitMinWidth: '230px', children: [
  {type: 'r-text', props: {field: 'name', label: '视图名称', placeholder: '按名称筛选'}},
]}))
const editorFields = computed<SparkNode[]>(() => [
  {type: 'r-select', props: {field: 'sysid', label: '应用系统', readonly: !editing.value?.create, optionDataViewKey: buildDataViewKey('Base_AppSystemList', 'default', scenarioId.value)}},
  {type: 'r-text', props: {field: 'name', label: '视图名称', readonly: !editing.value?.create}},
  {type: 'r-text', props: {field: 'description', label: '描述'}},
])
function choose(row: DataRow): void {if (busy.value || editing.value || pending.value) return; view.value?.setCurrentRow(row); view.value?.setSelectedRows([row])}
async function createView(): Promise<void> {
  const target = view.value, own = generation
  if (!target || busy.value || editing.value || pending.value || unconfirmed.value) return
  busy.value = true; error.value = ''
  try {
    const row = await target.addRow({name: '', description: '', sysid: ''}), id = target.getPkKey(row)
    if (id === undefined) throw new Error('新增视图缺少正式身份')
    if (!active || own !== generation || view.value !== target) return
    editing.value = {id, create: true}; target.setCurrentRow(row); target.setSelectedRows([row])
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) {busy.value = false; revision.value++}}
}
function editCatalog(): void {
  const target = view.value, row = target?.rows.find(item => target.getPkKey(item) === selected.value)
  if (!target || !row || busy.value || editing.value || pending.value) return
  if (target.editActionState(row) !== 'enabled') {error.value = '当前查询不允许编辑此视图'; return}
  target.setCurrentRow(row); editing.value = {id: target.getPkKey(row)!, create: false}
}
async function saveCatalog(): Promise<void> {
  const target = view.value, edit = editing.value, current = runtime?.getDataSet(scenarioId.value), own = generation
  if (!target || !edit || !current || busy.value) return
  busy.value = true; error.value = ''
  try {
    const result = await current.saveChanges({views: [{tableName: target.tableName, viewId: target.viewId, ids: [edit.id]}]})
    if (!result.success) throw new Error(result.message ?? '目录保存未完整确认')
    if (active && own === generation && !target.hasUnconfirmedSave && !target.hasEditingChanges(edit.id) && !target.dirtyTracking.hasPendingChanges()) editing.value = undefined
  } catch (cause) {if (active && own ===generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) {busy.value = false; revision.value++}}
}
function cancelEditor(): void {
  if (busy.value || unconfirmed.value || !editing.value) return
  try {view.value?.discardPendingChanges([editing.value.id]); editing.value = undefined; error.value = ''; revision.value++}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function closeEditor(open: boolean): void {if (!open && !busy.value && !pending.value && !unconfirmed.value) editing.value = undefined}
async function openDesign(): Promise<void> {if (selected.value && !editing.value && !busy.value && !pending.value && !unconfirmed.value) await openDesignRoute(selected.value)}
function navigationNodeId(): string {
  const nodeId = route.meta['nodeId']
  return route.meta['systemPageIdentityState'] === 'resolved' && typeof nodeId === 'string' ? nodeId.trim() : ''
}
async function openDesignRoute(viewId: string): Promise<void> {
  const nodeId = navigationNodeId()
  if (!scenarioId.value || !nodeId) {
    error.value = '缺少导航绑定的数据空间ID'
    return
  }
  const scope = parseApplicationPathScope(route.path)
  const path = scope ? buildApplicationPath(scope, designPath) : designPath
  await router.push({path, query: {viewId, [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: nodeId}})
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; busy.value = false; editing.value = undefined; error.value = ''
  unsubscribe?.(); view.value = undefined; sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('逻辑视图入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeLogicView.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    runtime = new PageRuntime({pageId: 'logic-view-list-page', scenarioIds: [id], loadScenario: async () => dataSet})
    await runtime.load()
    const results=await Promise.allSettled(['Base_DataViewList','Base_UserInfo','Base_AppSystemList'].map(async name=>{const current=dataSet.getView(name);if(!current)throw Error('逻辑视图目录缺少正式视图');await current.refresh();if(current.loadingError)throw current.loadingError}))
    const failure=results.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason
    if (!active || own !== generation) {runtime.dispose(); return}
    view.value = dataSet.getView(LowcodeLogicView.catalogMetaName, 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++, rowsChanged: () => revision.value++, editingChanged: () => revision.value++, requestStateChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
.structured-catalog-page h1 { margin: 0; font-size: 1.25rem; }
</style>
