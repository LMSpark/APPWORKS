<!--
@module app:views/features/integration/api-management/ui/api-interface-list-page
职责：按原“接口列表”对话框恢复左侧接口目录与右侧“接口编辑/调用输出/输出内容”工作区。
边界：经标准场景入口装配，providerId作为场景输入；子定义由查询级联限定，规则、当前行锁定与保存均由SPARK data承接；调用经命令资源提交。
-->
<template>
  <RendererSection v-if="!ready" :grid-columns="1" :bordered="false" :status="loading ? '正在读取接口方案…' : ''" :error="error" />
  <RendererButton v-if="!loading && !ready" label="关闭接口方案" @click="emit('close')" />
  <RendererDialog v-if="ready" :data-view-key="INTERFACE_KEYS.interfaces" :model-value="true" :title="`${providerName || '当前提供商'} - 接口列表`" :width="1480" :close-disabled="busy" @update:model-value="close">
    <div class="interface-list">
      <RendererList class="interface-list__sidebar" :data-view-key="INTERFACE_KEYS.interfaces" :children="listItem" :toolbar="listToolbar" :highlight-current="true" :show-pagination="false" empty-text="当前提供商暂无接口，可先新建接口" :on-item-click="choose" />
      <RendererSection :grid-columns="1" :bordered="false" :title="selected ? `${providerName || '当前提供商'} / ${selectedName || '接口配置'}` : ''" :status="status" :error="error" :retryable="unconfirmed" retry-text="重读核验（放弃本地修改）" @retry="reload">
        <template v-if="selected" #header-actions>
          <RendererButton label="保存" button-type="primary" :disabled="locked || !interfacePending" @click="saveApi" />
        </template>
        <RendererTabs v-if="selected" v-model="tab" :data-view-key="INTERFACE_KEYS.interfaces">
          <RendererTabPane name="edit" label="接口编辑" :index="0" :data-view-key="INTERFACE_KEYS.interfaces">
            <InterfaceEditPanel :key="String(selectedId)" :workspace="workspace" :pending-create="pendingCreate" />
          </RendererTabPane>
          <RendererTabPane name="invoke" label="调用输出" :index="1" :lazy="true" :data-view-key="INTERFACE_KEYS.calls">
            <InterfaceInvokePanel :workspace="workspace" :pending-create="pendingCreate" />
          </RendererTabPane>
          <RendererTabPane name="output" label="输出内容" :index="2" :lazy="true" :data-view-key="INTERFACE_KEYS.outputs">
            <InterfaceOutputPanel :workspace="workspace" :pending-create="pendingCreate" @bind="openBinding" />
          </RendererTabPane>
        </RendererTabs>
        <DisplayEmpty v-else description="请选择左侧接口，或先新建接口" />
      </RendererSection>
    </div>
    <ParameterBindingDialog v-if="bindingWindow" :key="bindingWindow.epoch" :parameters-key="INTERFACE_KEYS.bindings" :interface-key="INTERFACE_KEYS.interfaces" :interface-id="bindingWindow.interfaceId" :output-key="INTERFACE_KEYS.outputs" :output-id="bindingWindow.outputId" @close="closeBinding" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount} from 'vue'
import {useRoute} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import type {DataSet, DataRow, DataView, DataViewEditingFieldChangeEvent, SparkNode} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import * as SparkComponent from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import type {ApiInterfaceListPageProps} from './api-interface-list-page.props'
import {INTERFACE_KEYS, INTERFACE_SCENARIO_ID as scenarioId, syncPathParameters, type InterfaceWorkspace} from './interface-list/interface-list-workspace'
import InterfaceEditPanel from './interface-list/interface-edit-panel.vue'
import InterfaceInvokePanel from './interface-list/interface-invoke-panel.vue'
import InterfaceOutputPanel from './interface-list/interface-output-panel.vue'
import ParameterBindingDialog from './public-parameter-binding/api-public-parameter-binding-dialog.vue'
type RToolbarProps = SparkComponent.RToolbarProps
const {PAGE_RUNTIME, useSparkComponent, RendererSection, RendererDialog, RendererList, RendererButton, RendererTabs, RendererTabPane, DisplayEmpty} = SparkComponent
const writable = ['Base_DataServiceInterface', '_Base_ParamList', 'Base_InterfaceApi_Headers', 'Base_TblField'] as const
const props = defineProps<ApiInterfaceListPageProps>()
const emit = defineEmits<{close: []}>()
const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'api-interface-list-page'})
const session = new NativePageRuntimeSession({
  provide: () => undefined,
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const ready = ref(false), loading = ref(true), busy = ref(false), error = ref(''), revision = ref(0), tab = ref<string | number>('edit')
const bindingWindow = ref<{interfaceId: string | number; outputId: string | number; epoch: number}>()
let bindingEpoch = 0
let dataSet: DataSet | undefined, unsubscribe: (() => void) | undefined, active = true, generation = 0
const view = (table: string, viewId = 'default'): DataView | undefined => {revision.value; return dataSet?.getView(table, viewId)}
const views = computed(() => [...writable.map(table => view(table)), view('Base_Interface_PublicParam', 'outputBinding')].flatMap(item => item ?? []))
const dirty = computed(() => views.value.some(item => item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges()))
const unconfirmed = computed(() => [...views.value, view('InterfaceCallRequest')].some(item => item?.hasUnconfirmedSave === true))
const locked = computed(() => busy.value || unconfirmed.value)
const selected = computed(() => view('Base_DataServiceInterface')?.currentRow ?? null)
const selectedId = computed(() => {const interfaces = view('Base_DataServiceInterface'), row = selected.value; return row && interfaces ? interfaces.getPkKey(row) : undefined})
const selectedName = computed(() => {
  const interfaces = view('Base_DataServiceInterface'), row = selected.value, id = selectedId.value
  if (!interfaces || !row || id === undefined || interfaces.fieldAccess(row, 'Name').read !== 'visible') return ''
  return String(interfaces.getEditingRow(id)?.['Name'] ?? '')
})
const pendingCreate = computed(() => {const id = selectedId.value; return id !== undefined && view('Base_DataServiceInterface')?.dirtyTracking.isPendingCreate(id) === true})
const interfacePending = computed(() => {const interfaces = view('Base_DataServiceInterface'); return !!interfaces && (interfaces.hasEditingChanges() || interfaces.dirtyTracking.hasPendingChanges())})
const status = computed(() => unconfirmed.value ? '保存结果尚未确认，请重读核验后再继续' : '')
const workspace = computed<InterfaceWorkspace>(() => ({locked: locked.value, revision: revision.value, run: act}))
const listItem: SparkNode[] = [{type: 'r-text-display', props: {field: 'Name', placeholder: '未命名接口'}}]
const listToolbar = computed<RToolbarProps>(() => {
  const interfaces = view('Base_DataServiceInterface'), row = selected.value, id = selectedId.value
  const removable = !!interfaces && !!row && id !== undefined && (interfaces.dirtyTracking.isPendingCreate(id) || interfaces.deleteActionState(row) === 'enabled')
  return {gap: 8, children: [
    {type: 'r-button', props: {label: '新建', buttonType: 'primary', permAction: 'create', disabled: locked.value || interfaces?.addActionState() !== 'enabled', onClick: create}},
    {type: 'r-button', props: {label: '删除', disabled: locked.value || !removable, onClick: removeApi}},
  ]}
})
useSystemPageDirtySource({get isDirty() {return loading.value || busy.value || dirty.value || unconfirmed.value || !!bindingWindow.value}})
function changed(): void {revision.value++}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
async function act(action: () => unknown): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {await action()} catch (cause) {error.value = failure(cause)}
  finally {busy.value = false; changed()}
}
function requireView(table: string, viewId = 'default'): DataView {
  const target = view(table, viewId)
  if (!target) throw new Error(`接口列表缺少场景视图 ${table}@${viewId}`)
  return target
}
function choose(row: DataRow): void {
  if (bindingWindow.value || row === selected.value) return
  void act(() => {const interfaces = requireView('Base_DataServiceInterface'); interfaces.setCurrentRow(row); interfaces.setSelectedRows([row])})
}
function create(): Promise<void> {
  return act(async () => {
    const interfaces = requireView('Base_DataServiceInterface'), row = await interfaces.addRow({Name: '新建接口'})
    interfaces.setCurrentRow(row); interfaces.setSelectedRows([row]); tab.value = 'edit'
  })
}
async function removeApi(): Promise<void> {
  const interfaces = view('Base_DataServiceInterface'), row = selected.value, id = selectedId.value
  if (!interfaces || !row || id === undefined || locked.value) return
  const name = selectedName.value
  if (!interfaces.dirtyTracking.isPendingCreate(id)) {
    let blocked = ''
    await act(async () => {
      const children = (['_Base_ParamList', 'Base_InterfaceApi_Headers', 'Base_TblField'] as const).map(table => requireView(table))
      const bindings = requireView('Base_Interface_PublicParam', 'outputBinding')
      if ([interfaces, ...children, bindings].some(item => item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges())) throw new Error('请先保存或取消当前接口的修改，再删除接口')
      for (const item of [...children, bindings]) {await item.refresh(); if (item.loadingError) throw item.loadingError}
      if (interfaces.currentRow !== row) throw new Error('当前接口已切换，未删除')
      const [parameters, headers, outputs] = children.map(item => item.rows.length)
      const publics = bindings.rows.filter(binding => binding['interfaceId'] === id).length
      const parts = [['输入参数', parameters], ['请求头', headers], ['输出字段', outputs], ['公共参数', publics]].filter(([, count]) => !!count).map(([label, count]) => `${label} ${count} 个`)
      if (parts.length) blocked = `接口“${name}”仍有${parts.join('、')}，请先删除后再删除接口`
    })
    if (error.value) return
    if (blocked) {error.value = blocked; return}
  }
  const confirmed = await ElMessageBox.confirm(`确定要删除接口“${name}”吗？`, '删除确认', {type: 'warning'}).then(() => true, () => false)
  if (!confirmed || interfaces.currentRow !== row) return
  await act(async () => {
    const created = interfaces.dirtyTracking.isPendingCreate(id)
    await interfaces.removeRow(id)
    if (created) return
    const result = await dataSet?.saveChanges({views: [{tableName: interfaces.tableName, viewId: interfaces.viewId, ids: [id]}]})
    if (!result?.success) throw new Error(result?.error?.message ?? result?.message ?? '删除结果未确认，请重读核验')
    ElMessage.success('删除成功')
  })
}
function saveApi(): Promise<void> {
  return act(async () => {
    const interfaces = requireView('Base_DataServiceInterface'), id = selectedId.value
    if (id !== undefined && !String(interfaces.getEditingRow(id)?.['RequestType'] ?? '')) {ElMessage.warning('请选择参数类型'); return}
    const result = await dataSet?.saveChanges({views: [{tableName: interfaces.tableName, viewId: interfaces.viewId}]})
    if (!result?.success) throw new Error(result?.error?.message ?? result?.message ?? '接口保存结果未确认，请重读核验')
    ElMessage.success('保存成功')
  })
}
/** 原页联动：请求地址变化同步路径参数；参数类型在Body/FormData间切换时清空不兼容的请求体。均写当前行编辑覆盖。 */
function follow(event: DataViewEditingFieldChangeEvent): void {
  const interfaces = view('Base_DataServiceInterface'), current = interfaces?.getEditingRow(event.rowId)
  if (!interfaces || !current) return
  try {
    if (event.field === 'LinkUrl') {
      const before = String(current['PathStr'] ?? ''), next = syncPathParameters(String(event.nextValue ?? ''), before)
      if (next !== before) interfaces.updateEditingValue(event.rowId, 'PathStr', next)
    }
    if (event.field === 'RequestType') {
      const body = String(current['BodyParamJsonStr'] ?? '').trim()
      let rows: boolean | undefined
      try {rows = body ? Array.isArray(JSON.parse(body)) : undefined} catch {rows = undefined}
      if (rows !== undefined && rows !== (event.nextValue === 'FormData')) interfaces.updateEditingValue(event.rowId, 'BodyParamJsonStr', '')
    }
  } catch (cause) {error.value = failure(cause)}
}
async function openBinding(output: DataRow): Promise<void> {
  if (locked.value || bindingWindow.value) return
  const parent = view('Base_DataServiceInterface'), outputs = view('Base_TblField'), parameters = view('Base_Interface_PublicParam', 'outputBinding'), owner = session.runtime
  const iface = parent?.currentRow, interfaceId = iface ? parent?.getPkKey(iface) : undefined, outputId = outputs?.getPkKey(output)
  if (!parent || !outputs || !parameters || !iface || interfaceId === undefined || outputId === undefined) return
  outputs.setCurrentRow(output)
  const context = JSON.stringify([parent.queryContext, outputs.queryContext])
  const assertSource = () => {
    if (owner !== session.runtime || parent.currentRow !== iface || outputs.currentRow !== output || JSON.stringify([parent.queryContext, outputs.queryContext]) !== context
      || parent.hasEditingChanges(interfaceId) || parent.dirtyTracking.hasPendingChanges(interfaceId) || outputs.hasEditingChanges(outputId) || outputs.dirtyTracking.hasPendingChanges(outputId)) throw new Error('请先保存原接口和输出定义，再设置公共参数')
  }
  await act(async () => {
    assertSource()
    if (!parameters.hasEditingChanges() && !parameters.dirtyTracking.hasPendingChanges()) {await parameters.refresh(); if (parameters.loadingError) throw parameters.loadingError}
    assertSource(); parameters.setSelectedRows([]); bindingWindow.value = {interfaceId, outputId, epoch: ++bindingEpoch}
  })
}
async function closeBinding(result: SparkComponent.DataViewRecordEditingFinish): Promise<void> {
  bindingWindow.value = undefined
  if (result !== 'saved') return
  const catalog = view('Base_Interface_PublicParam'), owner = session.runtime
  if (!catalog) return
  try {
    if (catalog.hasEditingChanges() || catalog.dirtyTracking.hasPendingChanges() || catalog.hasUnconfirmedSave) throw new Error('目录有原修改')
    await catalog.refresh(); if (catalog.loadingError) throw catalog.loadingError
  } catch {if (active && session.runtime === owner) error.value = '绑定已保存，公共参数目录待刷新；不会重新提交原绑定'}
}
async function reload(): Promise<void> {
  const target = dataSet, calls = view('InterfaceCallRequest')
  if (!target || bindingWindow.value) return
  await act(() => target.discardAndReload({views: [...views.value, ...(calls ? [calls] : [])].map(item => ({tableName: item.tableName, viewId: item.viewId}))}))
}
async function close(): Promise<void> {
  if (busy.value || bindingWindow.value) return
  if (dirty.value || unconfirmed.value) {
    const confirmed = await ElMessageBox.confirm('存在未保存的修改，关闭将放弃这些修改。', '关闭确认', {type: 'warning'}).then(() => true, () => false)
    if (!confirmed || busy.value) return
    if (unconfirmed.value) {error.value = '保存结果尚未确认，请先重读核验'; return}
    for (const item of views.value) item.discardPendingChanges()
  }
  emit('close')
}
async function loadProvider(providerId: string): Promise<void> {
  if (session.runtime && (busy.value || dirty.value || unconfirmed.value || bindingWindow.value)) {error.value = '请先处理当前服务商的原修改或未确认提交，再切换服务商'; return}
  const own = ++generation; ready.value = false; loading.value = true; busy.value = false; error.value = ''; tab.value = 'edit'
  bindingWindow.value = undefined
  unsubscribe?.(); dataSet = undefined; session.dispose()
  try {
    const projectId = parseApplicationPathScope(route.path)?.projectId ?? ''
    const current = session.acquire({pageId: 'api-interface-list-page', scenarioIds: [scenarioId, DATA_SPACE_DESIGN_FORM_KEY], deferredScenarioIds: [DATA_SPACE_DESIGN_FORM_KEY], targetId: providerId, scenarioInputs: {[scenarioId]: {providerId}},
      loadScenario: id => loadLowcodeRuntimeScenario({projectId, scenarioId: id, getPage: () => current})})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    const loaded = current.getDataSet(scenarioId), calls = loaded?.getView('InterfaceCallRequest', 'default')
    if (!loaded || !calls) throw new Error('接口列表缺少正式场景视图')
    await calls.refresh()
    if (!active || own !== generation || !session.isCurrent(current)) return
    dataSet = loaded
    unsubscribe = loaded.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed, selectedRowsChanged: changed, editingChanged: changed, editingDiscarded: changed, requestStateChanged: changed,
      editingFieldChanged: (table, viewId, event) => {if (table === 'Base_DataServiceInterface' && viewId === 'default') follow(event); changed()}})
    loaded.triggerAutoLoad()
    sparkProvide(PAGE_RUNTIME, current); ready.value = true; changed()
  } catch (cause) {if (active && own === generation) error.value = failure(cause)}
  finally {if (active && own === generation) loading.value = false}
}
watch(() => props.providerId, loadProvider, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>
<style scoped>
.interface-list {display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 16px; align-items: start; min-height: 560px;}
.interface-list__sidebar {border-right: 1px solid var(--el-border-color-lighter); padding-right: 12px;}
@media (max-width: 900px) {.interface-list {grid-template-columns: minmax(0, 1fr);} .interface-list__sidebar {border-right: 0; padding-right: 0;}}
</style>
