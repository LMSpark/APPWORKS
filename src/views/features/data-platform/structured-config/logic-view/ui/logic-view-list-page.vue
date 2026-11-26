<!--
@module app:views/features/data-platform/structured-config/logic-view/ui/logic-view-list-page
-->
<template>
  <div>
    <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false" />
    <RendererSection v-else title="逻辑视图" :bordered="false" :status="loading ? '正在读取逻辑视图目录…' : ''" :error="error" />
    <template v-if="ready">
      <RendererDialog v-if="editing" :data-view-key="catalogKey" :model-value="true" :title="editing.create ? '新增逻辑视图' : '编辑逻辑视图'"
        width="min(700px, 94vw)" :close-disabled="busy || pending || unconfirmed" @update:model-value="closeEditor">
        <DisplayAlert v-if="!editing.create" alert-type="info" :closable="false" title="现有视图暂不支持重命名，可修改描述。" />
        <RendererForm :data-view-key="catalogKey" :children="editorFields" :grid-columns="1" label-width="110px" :show-data-view-meta="false" />
        <template #footer>
          <RendererButton :data-view-key="catalogKey" :label="unconfirmed ? '核验目录保存结果' : '保存目录'" :disabled="busy" @click="saveCatalog" />
          <RendererButton :data-view-key="catalogKey" label="取消" :disabled="busy || unconfirmed" @click="cancelEditor" />
        </template>
      </RendererDialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, isDataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {NativePageRuntimeSession, SYSTEM_PAGE_NAVIGATION_ID_QUERY, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {PageTool} from '@spark-appworks/spark-project-model'
import {LowcodeLogicView} from '@/platform-adapters/resources/structured-config/logic-view/resource'
import {buildApplicationPath, parseApplicationPathScope} from '@/services/application-scope'
import rule from './catalog-tool/rule.json?raw'
import script from './catalog-tool/script.js?raw'
import style from './catalog-tool/style.css?raw'

const {PAGE_RUNTIME, RendererSection, SparkPageRenderer, RendererDialog, RendererForm, RendererButton, DisplayAlert, useSparkComponent, consumeRequiredPageService} = SparkComponent
const route = useRoute()
const {sparkProvide, sparkRemove, sparkConsume} = useSparkComponent({type: 'logic-view-list-page'})
consumeRequiredPageService(sparkConsume, 'logic-view-list-page')
const session = new NativePageRuntimeSession({
  provide: () => undefined,
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const busy = ref(false), editing = ref<{id: string | number; create: boolean}>()
const pending = computed(() => {revision.value; return view.value?.hasEditingChanges() === true || view.value?.dirtyTracking.hasPendingChanges() === true})
const unconfirmed = computed(() => {revision.value; return view.value?.hasUnconfirmedSave === true})
useSystemPageDirtySource({get isDirty() {return busy.value || pending.value || unconfirmed.value}})
let unsubscribe: (() => void) | undefined, generation = 0, active = true
const selectionState = computed(() => {
  revision.value
  try {
    const values = view.value?.getSelectedValues() ?? []
    return {id: values.length === 1 && typeof values[0] === 'string' ? values[0] : '', error: ''}
  } catch {
    return {id: '', error: '当前查询无法读取所选视图身份'}
  }
})
const selected = computed(() => selectionState.value.id)
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeLogicView.catalogMetaName, 'default', scenarioId.value))
const designPath = '/features/data-platform/structured-config/logic-view/ui/logic-view-design-page'
const listLocked = computed(() => loading.value || busy.value || !!editing.value || pending.value || unconfirmed.value)
const runtime = computed(() => ready.value ? session.runtime : undefined)
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (!active || !session.isCurrent(current)) throw new Error('逻辑视图目录运行实例已失效')
  }
  return {runtime: current, assertCurrent, async invoke(command: string, input: unknown) {
    assertCurrent()
    if (command === 'logicView.catalog.connect') return {
      state: () => ({error: error.value || selectionState.value.error, locked: listLocked.value, selected: !!selected.value, editing: !!editing.value}),
    }
    if (listLocked.value) return undefined
    if (command === 'logicView.catalog.select' && isDataRow(input)) {
      const target = view.value
      const original = toRaw(input)
      if (target?.rows.includes(original)) {
        target.setCurrentRow(original)
        target.setSelectedRows([original])
      }
    }
    if (command === 'logicView.catalog.create') await createView()
    if (command === 'logicView.catalog.edit') editCatalog()
    if (command === 'logicView.catalog.design' && selected.value) return designTarget(selected.value)
    if (command === 'logicView.catalog.refresh') await refreshCatalog()
    return undefined
  }}
})
async function refreshCatalog(): Promise<void> {
  const target = view.value
  if (listLocked.value || !target) return
  try {await target.refresh()}
  catch (cause) {if (view.value === target) error.value = cause instanceof Error ? cause.message : String(cause)}
}
const editorFields = computed<SparkNode[]>(() => [
  {type: 'r-select', props: {field: 'sysid', label: '应用系统', readonly: !editing.value?.create, optionDataViewKey: buildDataViewKey('Base_AppSystemList', 'default', scenarioId.value)}},
  {type: 'r-text', props: {field: 'name', label: '视图名称', readonly: !editing.value?.create}},
  {type: 'r-text', props: {field: 'description', label: '描述'}},
])
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
  const target = view.value, edit = editing.value, current = session.runtime?.getDataSet(scenarioId.value), own = generation
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
function navigationNodeId(): string {
  const nodeId = route.meta['nodeId']
  return route.meta['systemPageIdentityState'] === 'resolved' && typeof nodeId === 'string' ? nodeId.trim() : ''
}
function designTarget(viewId: string) {
  const nodeId = navigationNodeId()
  if (!scenarioId.value || !nodeId) {
    error.value = '缺少导航绑定的数据空间ID'
    return
  }
  const scope = parseApplicationPathScope(route.path)
  const path = scope ? buildApplicationPath(scope, designPath) : designPath
  return {path, query: {viewId, [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: nodeId}}
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; busy.value = false; editing.value = undefined; error.value = ''
  unsubscribe?.(); view.value = undefined; session.dispose()
  try {
    if (!id) throw new Error('逻辑视图入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeLogicView.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    const tool = new PageTool({pageId: 'logic-view-list-page'})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    const current = session.acquire({tool, scenarioIds: [id], mainScenarioId: id, targetId: id,
      loadScenario: async () => dataSet})
    await current.load()
    const results=await Promise.allSettled(['Base_DataViewList','Base_UserInfo','Base_AppSystemList'].map(async name=>{const catalogView=dataSet.getView(name);if(!catalogView)throw Error('逻辑视图目录缺少正式视图');await catalogView.refresh();if(catalogView.loadingError)throw catalogView.loadingError}))
    const failure=results.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason
    if (!active || own !== generation || !session.isCurrent(current)) return
    view.value = dataSet.getView(LowcodeLogicView.catalogMetaName, 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++, rowsChanged: () => revision.value++, editingChanged: () => revision.value++, requestStateChanged: () => revision.value++})
    if (active && own === generation && session.isCurrent(current)) {sparkProvide(PAGE_RUNTIME, current); ready.value = true}
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>
