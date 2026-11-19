<!--
@module app:views/features/integration/api-management/ui/api-interface-list-page
职责：按原“接口列表”对话框恢复左侧接口目录与右侧“接口编辑/调用输出/输出内容”工作区。
边界：经标准场景入口装配，providerId作为场景输入；子定义由查询级联限定，规则、当前行锁定与保存均由SPARK data承接；调用经命令资源提交。
-->
<template>
  <RendererSection v-if="!ready" :grid-columns="1" :bordered="false" :status="loading ? '正在读取接口方案…' : ''" :error="error" />
  <RendererButton v-if="!loading && !ready" label="关闭接口方案" @click="emit('close')" />
  <RendererDialog v-if="dialogRule" v-bind="dialogRule.props" :model-value="true"
    :title="`${providerName || '当前提供商'} - 接口列表`" :close-disabled="busy" @update:model-value="close">
    <SparkPageRenderer v-if="listRuntime && listHost" :page-runtime="listRuntime" :route-snapshot="routeSnapshot" :host="listHost" :auto-load="false" >
      <template #content="{children}">
        <div class="interface-list">
          <SparkComponentRenderer :config="region(children,'api-interface-sidebar')" />
          <RendererSection v-bind="region(children,'api-interface-workspace').props" :title="selected ? `${providerName || '当前提供商'} / ${selectedName || '接口配置'}` : ''" :status="status" :error="error" :retryable="definitionUnconfirmed && !busy">
            <template v-if="selected" #header-actions>
              <SparkComponentRenderer :config="region(children,'api-interface-save')" />
            </template>
            <RendererTabs v-if="selected" v-model="tab" v-bind="region(children,'api-interface-tabs').props">
              <RendererTabPane v-for="(pane, index) in getSparkNodeChildren(region(children,'api-interface-tabs').children)"
                :key="nodeId(pane) ?? index" :index="index" v-bind="pane.props">
                <template v-if="nodeId(pane) === 'api-interface-edit-tab'">
                  <SparkComponentRenderer :key="String(selectedId)" :config="region(children,'api-interface-edit')" />
                  <InterfaceJsonImportDialog v-if="importing" :key="importing.epoch" :target="importing.target" @close="importing=undefined" />
                </template>
                <SparkComponentRenderer v-else-if="nodeId(pane) === 'api-interface-invoke-tab'" :config="region(children,'api-interface-invocation')" />
                <SparkComponentRenderer v-else-if="nodeId(pane) === 'api-interface-output-tab'" :config="region(children,'api-interface-output')" />
              </RendererTabPane>
            </RendererTabs>
            <DisplayEmpty v-else description="请选择左侧接口，或先新建接口" />
          </RendererSection>
        </div>
      </template>
    </SparkPageRenderer>
    <ParameterBindingDialog v-if="bindingWindow" :key="bindingWindow.epoch" :parameters-key="INTERFACE_KEYS.bindings" :interface-key="INTERFACE_KEYS.interfaces" :interface-id="bindingWindow.interfaceId" :output-key="INTERFACE_KEYS.outputs" :output-id="bindingWindow.outputId" @close="closeBinding" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount} from 'vue'
import {useRoute} from 'vue-router'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {getSparkNodeChildren, nodeId, type DataSet, type DataRow, type DataView, type DataViewEditingFieldChangeEvent, type SparkNode} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import * as SparkComponent from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import type {ApiInterfaceListPageProps} from './api-interface-list-page.props'
import {INTERFACE_KEYS, INTERFACE_SCENARIO_ID as scenarioId, syncPathParameters, invokeApi, abandonInterfaceCall, outputFieldsOf} from './interface-list/interface-list-workspace'
import InterfaceJsonImportDialog from './interface-list/interface-json-import-dialog.vue'
import {PageTool} from '@spark-appworks/spark-project-model'
import rule from './interface-list/rule.json?raw'
import script from './interface-list/script.js?raw'
import style from './interface-list/style.css?raw'
import {featureTableToolbar,runFeatureTableAction,type FeatureTableAction} from '@/views/features/shared/table/feature-table-actions'
import ParameterBindingDialog from './public-parameter-binding/api-public-parameter-binding-dialog.vue'
const {PAGE_RUNTIME, useSparkComponent, RendererSection, RendererDialog, SparkPageRenderer, SparkComponentRenderer, RendererButton, RendererTabs, RendererTabPane, DisplayEmpty, consumeRequiredPageService} = SparkComponent
const writable = ['Base_DataServiceInterface', '_Base_ParamList', 'Base_InterfaceApi_Headers', 'Base_TblField'] as const
const props = defineProps<ApiInterfaceListPageProps>()
const emit = defineEmits<{close: []}>()
const route = useRoute()
const {sparkProvide, sparkRemove, sparkConsume} = useSparkComponent({type: 'api-interface-list-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'api-interface-list-page')
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
const definitionUnconfirmed = computed(() => views.value.some(item => item.hasUnconfirmedSave))
const callUnconfirmed = computed(() => view('InterfaceCallRequest')?.hasUnconfirmedSave === true)
const unconfirmed = computed(() => definitionUnconfirmed.value || callUnconfirmed.value)
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
const status = computed(() => definitionUnconfirmed.value ? '保存结果尚未确认，请核验原保存结果' :
  callUnconfirmed.value ? '上次外部调用结果尚未确认，请在调用输出中处理' : '')

function region(children:readonly SparkNode[],id:string):SparkNode {
  const node=children.find(child=>nodeId(child)===id)
  if(!node)throw new Error(`接口工作区缺少配置区域 ${id}`)
  return node
}
const requestTab=ref('params')
const importing=ref<{target:'json'|'form';epoch:number}>()
let importEpoch=0
watch(selectedId,()=>{requestTab.value='params';importing.value=undefined},{flush:'sync'})
function requestType():string {
  const id=selectedId.value
  return id===undefined?'':String(view('Base_DataServiceInterface')?.getEditingRow(id)?.['RequestType']??'')
}
function openImport():void {
  const target=requestTab.value
  if(target!=='json'&&target!=='form'){pageService.showMessage('当前页签暂不支持导入JSON','warning');return}
  if(requestType()!==(target==='json'?'Body':'FormData')){
    pageService.showMessage(`请先将参数类型选择为 ${target==='json'?'Body/Json':'Body/FormData'}`,'warning');return
  }
  importing.value={target,epoch:++importEpoch}
}
function requestToolbar(table:string,order:readonly FeatureTableAction[]){
  const target=requireView(table)
  return featureTableToolbar({view:target,order,locked:locked.value,addBlocked:pendingCreate.value,
    run:action=>act(async()=>{
      await runFeatureTableAction(target,action,pageService)
      if(action==='save'&&table==='_Base_ParamList')await requireView(table,'references').refresh()
    }),
  })
}
const listRuntime=computed(()=>ready.value?session.runtime:undefined)
const dialogRule=computed(()=>{
  const runtime=listRuntime.value
  return runtime ? region(runtime.tool.rule.children,'api-interface-dialog') : undefined
})
const routeSnapshot=computed(()=>{
  const {path,fullPath,name,params,query,hash}=route
  return {path,fullPath,name:name??null,params,query,hash}
})
const listHost=computed(()=>{
  const runtime=listRuntime.value
  if(!runtime)return undefined
  const assertCurrent=()=>{if(!active||!session.isCurrent(runtime))throw new Error('接口列表运行实例已失效')}
  return {runtime,assertCurrent,async invoke(command:string,input:unknown){
    assertCurrent()
    if(command==='interfaces.connect')return {
      invocation:()=>{
        const calls=view('InterfaceCallRequest'),unknown=calls?.hasUnconfirmedSave===true
        return {unknown,busy:busy.value,locked:locked.value,pending:pendingCreate.value,
          hasResult:selectedId.value!==undefined&&calls?.currentRow?.['interfaceId']===selectedId.value&&!unknown}
      },
      save:()=>({disabled:locked.value||!interfacePending.value}),
      edit:()=>({tab:requestTab.value,type:requestType(),locked:locked.value}),
      headersToolbar:()=>requestToolbar('Base_InterfaceApi_Headers',['add','remove','save','cancel']),
      parametersToolbar:()=>requestToolbar('_Base_ParamList',['add','remove','cancel','save']),
      output:()=>{
        const outputs=view('Base_TblField')
        return {locked:locked.value,unknown:callUnconfirmed.value,pendingCreate:pendingCreate.value,
          pending:!!outputs&&(outputs.hasEditingChanges()||outputs.dirtyTracking.hasPendingChanges())}
      },
      actions:()=>{
        const interfaces=view('Base_DataServiceInterface'),row=selected.value,id=selectedId.value
        const removable=!!interfaces&&!!row&&id!==undefined&&(interfaces.dirtyTracking.isPendingCreate(id)||interfaces.deleteActionState(row)==='enabled')
        return {createDisabled:locked.value||interfaces?.addActionState()!=='enabled',removeDisabled:locked.value||!removable}
      },
    }
    if(command==='interfaces.verifyDefinition'&&definitionUnconfirmed.value&&!busy.value){
      await verifyOriginalSaves()
      return undefined
    }
    if(command==='interfaces.saveDefinition'&&selected.value&&!locked.value&&interfacePending.value){
      await saveApi()
      return undefined
    }
    if(command==='interfaces.requestTab'&&(input==='params'||input==='json'||input==='form'||input==='header'))requestTab.value=input
    if(command==='interfaces.importJson'&&!locked.value)openImport()
    if(command==='interfaces.abandonCall'&&!busy.value&&callUnconfirmed.value){
      await act(()=>abandonInterfaceCall(requireView('InterfaceCallRequest')))
      return undefined
    }
    if(locked.value)return undefined
    if(command==='interfaces.invoke'&&!pendingCreate.value){
      await act(()=>invokeApi({calls:requireView('InterfaceCallRequest'),interfaces:requireView('Base_DataServiceInterface')}))
    }
    if(command==='interfaces.resetOutput'&&!pendingCreate.value)await resetOutputs()
    if(command==='interfaces.saveOutput')await act(()=>runFeatureTableAction(requireView('Base_TblField'),'save',pageService))
    if(command==='interfaces.bindOutput'){
      const outputs=view('Base_TblField')
      const row=outputs?.rows.find(item=>outputs.getPkKey(item)===input)
      if(row)await openBinding(row)
    }
    if(command==='interfaces.create')await create()
    if(command==='interfaces.remove')await removeApi()
    if(command==='interfaces.select'){
      const interfaces=view('Base_DataServiceInterface')
      const row=interfaces?.rows.find(item=>interfaces.getPkKey(item)===input)
      if(row)choose(row)
    }
    return undefined
  }}
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
  const confirmed = await pageService.showConfirm(`确定要删除接口“${name}”吗？`, '删除确认', {type: 'warning'})
  if (!confirmed || interfaces.currentRow !== row) return
  await act(async () => {
    const created = interfaces.dirtyTracking.isPendingCreate(id)
    await interfaces.removeRow(id)
    if (created) return
    const result = await dataSet?.saveChanges({views: [{tableName: interfaces.tableName, viewId: interfaces.viewId, ids: [id]}]})
    if (!result?.success) throw new Error(result?.error?.message ?? result?.message ?? '删除结果未确认，请重读核验')
    pageService.showMessage('删除成功', 'success')
  })
}
function saveApi(): Promise<void> {
  return act(async () => {
    const interfaces = requireView('Base_DataServiceInterface'), id = selectedId.value
    if (id !== undefined && !String(interfaces.getEditingRow(id)?.['RequestType'] ?? '')) {pageService.showMessage('请选择参数类型', 'warning'); return}
    const result = await dataSet?.saveChanges({views: [{tableName: interfaces.tableName, viewId: interfaces.viewId}]})
    if (!result?.success) throw new Error(result?.error?.message ?? result?.message ?? '接口保存结果未确认，请重读核验')
    pageService.showMessage('保存成功', 'success')
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
function resetOutputs(): Promise<void> {
  return act(async () => {
    const outputs = requireView('Base_TblField'), interfaces = requireView('Base_DataServiceInterface'), bindings = requireView('Base_Interface_PublicParam','outputBinding')
    if (outputs.hasEditingChanges() || outputs.dirtyTracking.hasPendingChanges()) throw new Error('请先保存或取消输出内容的修改')
    const owner = interfaces.currentRow, interfaceId = owner ? interfaces.getPkKey(owner) : undefined
    const fields = outputFieldsOf(await invokeApi({calls: requireView('InterfaceCallRequest'), interfaces}))
    if (interfaces.currentRow !== owner || interfaceId === undefined) throw new Error('当前接口已切换，未重新设置输出')
    const types = new Map(fields.map(field => [field.enname, field.DataType]))
    const current = [...outputs.rows], names = new Set(current.map(row => String(row['enname'] ?? '')))
    const removed = current.filter(row => !types.has(String(row['enname'] ?? '')))
    if (removed.length) {
      await bindings.refresh()
      if (bindings.loadingError) throw bindings.loadingError
      const bound = removed.map(row => String(row['enname'] ?? ''))
        .filter(name => bindings.rows.some(binding => binding['interfaceId'] === interfaceId && binding['outputfield'] === name))
      if (bound.length) throw new Error(`输出字段 ${bound.join('、')} 已设置公共参数，请先解除绑定再重新设置输出`)
    }
    for (const row of current) {
      const id = outputs.getPkKey(row), type = types.get(String(row['enname'] ?? ''))
      if (id !== undefined && type !== undefined && row['DataType'] !== type) outputs.updateEditingValue(id, 'DataType', type)
    }
    for (const row of removed) {
      const id = outputs.getPkKey(row)
      if (id !== undefined) await outputs.removeRow(id)
    }
    for (const field of fields) if (!names.has(field.enname)) await outputs.addRow({tblname: 'api_output_info', enname: field.enname, DataType: field.DataType, IsPKey: 0, Memo: ''})
    pageService.showMessage('输出内容已重置，保存后生效', 'success')
  })
}
async function verifyOriginalSaves(): Promise<void> {
  if (bindingWindow.value) return
  await act(async () => {
    for (const view of views.value.filter(item => item.hasUnconfirmedSave)) {
      const result=await view.saveChanges()
      if(!result.success)throw new Error(result.error?.message || result.message || '原保存结果尚未核定')
    }
  })
}
async function close(): Promise<void> {
  if (busy.value || bindingWindow.value) return
  if (dirty.value || unconfirmed.value) {
    const confirmed = await pageService.showConfirm('存在未保存的修改，关闭将放弃这些修改。', '关闭确认', {type: 'warning'})
    if (!confirmed || busy.value) return
    if (unconfirmed.value) {error.value = '仍有未确认的保存或调用结果，请先处理原操作'; return}
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
    const tool=new PageTool({pageId:'api-interface-list-page'})
    tool.hydrateFileText('rule.json',rule)
    tool.hydrateFileText('script.js',script)
    tool.hydrateFileText('style.css',style)
    tool.markLoaded()
    const current = session.acquire({tool, scenarioIds: [scenarioId, DATA_SPACE_DESIGN_FORM_KEY], deferredScenarioIds: [DATA_SPACE_DESIGN_FORM_KEY], targetId: providerId, scenarioInputs: {[scenarioId]: {providerId}},
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
@media (max-width: 900px) {.interface-list {grid-template-columns: minmax(0, 1fr);}}
</style>
