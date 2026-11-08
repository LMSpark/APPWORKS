<!--
@module app:views/features/integration/api-management/ui/api-interface-list-page
职责：按原接口目录/定义工作区恢复方案设计。
边界：经标准场景入口装配，providerId作为场景输入；子定义由查询级联限定，规则、当前行锁定与保存均由SPARK data承接，页面只转发事件。
AI用途：原页面结构与输入语义保留，不查询凭据、不维护调用数据、不发送HTTP。
-->
<template>
  <p v-if="loading">正在读取接口方案…</p>
  <p v-if="error && !ready" role="alert">{{ error }}</p>
  <RendererDialog v-if="ready" :data-view-key="mainKey" :model-value="true" title="接口方案设计" width="min(1400px, 96vw)" :close-disabled="busy || dirty || outputSession" @update:model-value="close">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="openedProvider !== providerId" role="status">当前仍在处理服务商 {{ openedProvider }} 的原方案。</p>
    <RendererButton v-if="openedProvider !== providerId" label="切换到所选服务商" :disabled="busy || dirty || unconfirmed || outputSession" @click="loadProvider(providerId)" />
    <RendererSection :data-view-key="mainKey" :grid-columns="1" :bordered="false" body-class="interface-workspace">
      <RendererTable :data-view-key="mainKey" :children="listFields" :toolbar="toolbar" :show-pagination="false" :show-data-view-meta="false" :on-row-click="choose" />
      <RendererSection :data-view-key="mainKey" :grid-columns="1" :bordered="false">
        <template v-if="selected">
          <RendererTabs v-model="tab" :data-view-key="mainKey">
            <RendererTabPane name="definition" label="接口定义" :index="0" :data-view-key="mainKey">
              <p>路径中的 {参数名} 由调用输入替换；查询参数与请求体定义保存后供调用使用。</p>
              <p v-if="hasLegacy" role="status">保留了历史请求配置。此处维护后端实际使用的定义，旧配置不会自动转换。</p>
              <RendererForm :data-view-key="mainKey" :children="definitionFields" grid-min-width="330px" label-width="110px" :show-data-view-meta="false" />
              <RendererForm :data-view-key="mainKey" :children="jsonFields" :grid-columns="1" label-position="top" :show-data-view-meta="false" />
              <RendererButton :data-view-key="mainKey" label="保存接口定义" button-type="primary" :disabled="locked" @click="save('Base_DataServiceInterface')" />
            </RendererTabPane>
            <RendererTabPane name="parameters" label="输入定义" :index="1" :lazy="true" :data-view-key="parameterKey">
              <p>维护参数名称、类型和标题。参数值在独立调用页面提供；已有参数名称创建后不能修改。</p>
              <RendererTable :data-view-key="parameterKey" :children="parameterList" :toolbar="parameterToolbar" :on-row-click="(row: DataRow) => point('_Base_ParamList', row)" />
              <RendererForm v-if="current('_Base_ParamList')" :data-view-key="parameterKey" :children="parameterFields" :grid-columns="1" label-width="110px" :show-data-view-meta="false" />
              <RendererButton :data-view-key="parameterKey" label="保存输入定义" :disabled="locked" @click="save('_Base_ParamList')" />
            </RendererTabPane>
            <RendererTabPane name="headers" label="接口头部" :index="2" :lazy="true" :data-view-key="headerKey">
              <RendererTable :data-view-key="headerKey" :children="headerList" :toolbar="headerToolbar" :on-row-click="(row: DataRow) => point('Base_InterfaceApi_Headers', row)" />
              <RendererForm v-if="current('Base_InterfaceApi_Headers')" :data-view-key="headerKey" :children="headerFields" :grid-columns="1" label-width="110px" :show-data-view-meta="false" />
              <RendererButton :data-view-key="headerKey" label="保存接口头部" :disabled="locked" @click="save('Base_InterfaceApi_Headers')" />
            </RendererTabPane>
            <RendererTabPane name="outputs" label="输出定义" :index="3" :lazy="true" :data-view-key="outputKey">
              <p>输出定义由原数据视图维护；所属名称保留正式值。</p>
              <RendererButton :data-view-key="outputKey" label="新增输出" perm-action="create" :disabled="locked || outputSession" @click="addOutput" />
              <RendererButton label="编辑当前输出" :disabled="locked || outputSession || !current('Base_TblField')" @click="editOutput" />
              <RendererButton label="删除当前输出" :disabled="locked || outputSession || !current('Base_TblField')" @click="operateOutput('delete')" />
              <RendererButton label="处理当前输出待提交修改" :disabled="locked || outputSession || !current('Base_TblField')" @click="operateOutput('pending')" />
              <RendererButton label="设置公共参数" :disabled="locked || outputSession || !current('Base_TblField')" @click="openBinding" />
              <RendererTable :data-view-key="outputKey" :children="outputFields" :on-row-click="(row: DataRow) => point('Base_TblField', row)" />
              <OutputEditDialog v-if="outputEditing" :key="outputEditing.epoch" :data-view-key="outputKey" :record-id="outputEditing.id" :created="outputEditing.created" :type-options-key="key('ParamType')" @close="outputEditing=undefined" />
              <OutputOperationDialog v-if="outputAction" :key="outputAction.epoch" :data-view-key="outputKey" :record-id="outputAction.id" :mode="outputAction.mode" @close="outputAction=undefined" />
              <ParameterBindingDialog v-if="bindingWindow" :key="bindingWindow.epoch" :parameters-key="bindingKey" :interface-key="mainKey" :interface-id="bindingWindow.interfaceId" :output-key="outputKey" :output-id="bindingWindow.outputId" @close="closeBinding" />
            </RendererTabPane>
          </RendererTabs>
        </template>
        <p v-else>从左侧选择接口，或新增接口定义。</p>
      </RendererSection>
    </RendererSection>
    <RendererButton :data-view-key="mainKey" :label="unconfirmed ? '重读核验（放弃本地修改）' : '放弃修改并重读'" :disabled="busy" @click="reload" />
    <RendererButton :data-view-key="mainKey" label="放弃修改并关闭" :disabled="locked" @click="cancel" />
  </RendererDialog>
  <RendererButton v-if="!loading && !ready" label="关闭接口方案" @click="emit('close')" />
</template>
<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount} from 'vue'
import {useRoute} from 'vue-router'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataSet, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import * as SparkComponent from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import type {ApiInterfaceListPageProps} from './api-interface-list-page.props'
import OutputEditDialog from './api-output-edit-dialog.vue'
import OutputOperationDialog from './api-output-operation-dialog.vue'
import ParameterBindingDialog from './public-parameter-binding/api-public-parameter-binding-dialog.vue'
type RToolbarProps = SparkComponent.RToolbarProps
const {PAGE_RUNTIME, useSparkComponent, RendererSection, RendererDialog, RendererTable, RendererForm, RendererButton, RendererTabs, RendererTabPane} = SparkComponent
const scenarioId = 'EC84BD89BDBDF46B1FE5132DD53836E5'
const writable = ['Base_DataServiceInterface', '_Base_ParamList', 'Base_InterfaceApi_Headers', 'Base_TblField'] as const
const props = defineProps<ApiInterfaceListPageProps>()
const emit = defineEmits<{close: []}>()
const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'api-interface-list-page'})
const session = new NativePageRuntimeSession({
  provide: () => undefined,
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const ready = ref(false), loading = ref(true), busy = ref(false), error = ref(''), revision = ref(0), tab = ref<string | number>('definition')
const outputEditing=ref<{id:string|number;epoch:number;created:boolean}>()
const outputAction=ref<{id:string|number;epoch:number;mode:'pending'|'delete'}>()
const bindingWindow=ref<{interfaceId:string|number;outputId:string|number;epoch:number}>()
const outputSession=computed(()=>!!outputEditing.value||!!outputAction.value||!!bindingWindow.value)
const openedProvider=ref('')
let outputEpoch=0
let dataSet: DataSet | undefined, unsubscribe: (() => void) | undefined, active = true, generation = 0
const key = (name: string, view = 'default') => buildDataViewKey(name, view, scenarioId)
const mainKey = key('Base_DataServiceInterface'), parameterKey = key('_Base_ParamList'), headerKey = key('Base_InterfaceApi_Headers'), outputKey = key('Base_TblField')
const bindingKey=key('Base_Interface_PublicParam','outputBinding')
const view = (table: string): DataView | undefined => {revision.value; return dataSet?.getView(table, 'default')}
const current = (table: string) => view(table)?.currentRow ?? null
const views = computed(() => {const parameters=dataSet?.getView('Base_Interface_PublicParam','outputBinding');return [...writable.flatMap(table => view(table) ?? []),...(parameters?[parameters]:[])]})
const dirty = computed(() => views.value.some(item => item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges()))
const unconfirmed = computed(() => views.value.some(item => item.hasUnconfirmedSave))
const locked = computed(() => busy.value || unconfirmed.value)
const selected = computed(() => current('Base_DataServiceInterface'))
const hasLegacy = computed(() => !!selected.value?.['RequestType'] || !!selected.value?.['PathStr'])
const listFields: SparkNode[] = [{type: 'r-text', props: {field: 'Name', label: '接口名称'}}, {type: 'r-text', props: {field: 'LinkUrl', label: '路径'}}]
const parameterList: SparkNode[] = [{type: 'r-text', props: {field: 'parname', label: '参数名称'}}, {type: 'r-text', props: {field: 'pardesc', label: '参数标题'}}, {type: 'r-select', props: {field: 'parzdtype', label: '参数类型', optionDataViewKey: key('ParamType')}}]
const headerList: SparkNode[] = [{type: 'r-text', props: {field: 'ParamName', label: '头部名称'}}, {type: 'r-text', props: {field: 'ParamDesc', label: '头部说明'}}]
const outputFields: SparkNode[] = [{type: 'r-text', props: {field: 'enname', label: '输出名称', readonly: true}}, {type: 'r-text', props: {field: 'cnname', label: '输出标题', readonly: true}}, {type: 'r-select', props: {field: 'DataType', label: '数据类型', optionDataViewKey: key('ParamType'), readonly: true}}]
const definitionFields: SparkNode[] = [
  ...[['Name', '接口名称'], ['LinkUrl', '接口路径'], ['resultPath', '结果路径'], ['Desc', '接口说明']].map(([field, label]) => ({type: 'r-text', props: {field, label}})),
  ...[['request', '请求方法', 'request'], ['paramType', '请求体类型', '接口参数类型'], ['ContentType', '内容类型', 'ContentType']].map(([field, label, table]) => ({type: 'r-select', props: {field, label, optionDataViewKey: key(table!)}})),
  {type: 'r-select', props: {field: 'AccountName', label: '调用账号', clearable: true, optionDataViewKey: key('Base_InterfaceProvider_Account')}},
  {type: 'r-number', props: {field: 'requiresAuth', label: '使用认证头', min: 0, max: 1, step: 1, precision: 0}},
]
const jsonFields: SparkNode[] = [['GetParamStr', '查询参数方案'], ['FormDataParam', 'FormData 请求体方案'], ['BodyParamJsonStr', 'JSON 请求体方案']]
  .map(([field, label]) => ({type: 'r-json', props: {field, label, height: 210}}))
const parameterFields: SparkNode[] = [{type: 'r-text', props: {field: 'parname', label: '参数名称'}},
  {type: 'r-text', props: {field: 'pardesc', label: '参数标题'}},
  {type: 'r-select', props: {field: 'parzdtype', label: '参数类型', optionDataViewKey: key('ParamType')}}]
const headerFields: SparkNode[] = [
  ...[['ParamName', '头部名称'], ['ParamDesc', '头部说明']].map(([field, label]) => ({type: 'r-text', props: {field, label}})),
  {type: 'r-value-function', props: {field: 'ValueFun', label: '头部取值', inputParameterDataViewKey: key('_Base_ParamList', 'references'), publicParameterDataViewKey: key('Base_Interface_PublicParam'), functionContext: {capabilities: ['huoshan']}}},
]
const addButton = (table: string, label: string) => ({type: 'r-button', props: {label, permAction: 'create',
  disabled: locked.value || view(table)?.addActionState() !== 'enabled', onClick: () => add(table)}})
const toolbar = computed<RToolbarProps>(() => ({children: [addButton('Base_DataServiceInterface', '新增接口')]}))
const parameterToolbar = computed<RToolbarProps>(() => ({children: [addButton('_Base_ParamList', '新增输入定义')]}))
const headerToolbar = computed<RToolbarProps>(() => {
  const headers = view('Base_InterfaceApi_Headers'), row = current('Base_InterfaceApi_Headers')
  return {children: [addButton('Base_InterfaceApi_Headers', '新增接口头部'),
    {type: 'r-button', props: {label: '移除当前头部', disabled: locked.value || !row || !headers
      || !headers.dirtyTracking.isPendingCreate(headers.getPkKey(row)!) && headers.deleteActionState(row) !== 'enabled', onClick: removeHeader}}]}
})
useSystemPageDirtySource({get isDirty() {return loading.value || busy.value || dirty.value || unconfirmed.value || outputSession.value}})
function changed(): void {revision.value++}
async function act(action: () => Promise<unknown> | unknown): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {await action()} catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {busy.value = false; changed()}
}
function choose(row: DataRow): void {
  if(outputSession.value)return
  const interfaces = view('Base_DataServiceInterface')
  if (interfaces) void act(() => {interfaces.setCurrentRow(row); interfaces.setSelectedRows([row])})
}
function editOutput():void{
  if(locked.value||outputSession.value)return
  const outputs=view('Base_TblField'),row=outputs?.currentRow,id=row?outputs?.getPkKey(row):undefined
  if(!outputs||!row||id===undefined)return
  if(outputs.dirtyTracking.hasPendingChanges(id)){error.value='请先处理原输出待提交修改';return}
  if(outputs.editActionState(row)!=='enabled'){error.value='当前输出不可编辑';return}
  outputEditing.value={id,epoch:++outputEpoch,created:false}
}
function operateOutput(mode:'pending'|'delete'):void{
  if(locked.value||outputSession.value)return
  const outputs=view('Base_TblField'),row=outputs?.currentRow,id=row?outputs?.getPkKey(row):undefined
  if(!outputs||!row||id===undefined)return
  if(outputs.hasEditingChanges(id)){error.value='请先处理原输出编辑输入';return}
  if(mode==='pending'?!outputs.dirtyTracking.hasPendingChanges(id):outputs.dirtyTracking.hasPendingChanges(id)||outputs.deleteActionState(row)!=='enabled'){error.value='当前输出不满足该操作的前置条件';return}
  outputAction.value={id,mode,epoch:++outputEpoch}
}
async function addOutput():Promise<void>{
  if(locked.value||outputSession.value)return
  const outputs=view('Base_TblField'),parent=selected.value,owner=session.runtime
  if(!outputs||!parent||outputs.addActionState()!=='enabled')return
  await act(async()=>{
    const row=await outputs.addRow({}),id=outputs.getPkKey(row)
    if(!active||owner!==session.runtime||selected.value!==parent)return
    if(id===undefined)throw Error('新增输出未返回原生身份')
    outputEditing.value={id,created:true,epoch:++outputEpoch}
  })
}
async function openBinding():Promise<void>{
  if(locked.value||outputSession.value)return
  const parent=view('Base_DataServiceInterface'),outputs=view('Base_TblField'),parameters=dataSet?.getView('Base_Interface_PublicParam','outputBinding'),owner=session.runtime
  const iface=parent?.currentRow,output=outputs?.currentRow,interfaceId=iface?parent?.getPkKey(iface):undefined,outputId=output?outputs?.getPkKey(output):undefined
  if(!parent||!outputs||!parameters||!iface||!output||interfaceId===undefined||outputId===undefined)return
  const context=JSON.stringify([parent.queryContext,outputs.queryContext])
  const assertSource=()=>{if(owner!==session.runtime||parent.currentRow!==iface||outputs.currentRow!==output||JSON.stringify([parent.queryContext,outputs.queryContext])!==context||parent.hasEditingChanges(interfaceId)||parent.dirtyTracking.hasPendingChanges(interfaceId)||outputs.hasEditingChanges(outputId)||outputs.dirtyTracking.hasPendingChanges(outputId))throw Error('请先保存原接口和输出定义，再设置公共参数')}
  await act(async()=>{
    assertSource()
    if(!parameters.hasEditingChanges()&&!parameters.dirtyTracking.hasPendingChanges()){await parameters.refresh();if(parameters.loadingError)throw parameters.loadingError}
    assertSource();parameters.setSelectedRows([]);bindingWindow.value={interfaceId,outputId,epoch:++outputEpoch}
  })
}
async function closeBinding(result:SparkComponent.DataViewRecordEditingFinish):Promise<void>{
  bindingWindow.value=undefined
  if(result!=='saved')return
  const catalog=dataSet?.getView('Base_Interface_PublicParam'),owner=session.runtime
  if(!catalog)return
  try{
    if(catalog.hasEditingChanges()||catalog.dirtyTracking.hasPendingChanges()||catalog.hasUnconfirmedSave)throw Error('目录有原修改')
    await catalog.refresh();if(catalog.loadingError)throw catalog.loadingError
  }catch{if(active&&session.runtime===owner)error.value='绑定已保存，公共参数目录待刷新；不会重新提交原绑定'}
}
function point(table: string, row: DataRow): void {if (!busy.value) view(table)?.setCurrentRow(row)}
async function add(table: string): Promise<void> {
  const target = view(table)
  if (target) await act(async () => {
    const row = await target.addRow({})
    target.setCurrentRow(row)
    if (table === 'Base_DataServiceInterface') target.setSelectedRows([row])
  })
}
async function removeHeader(): Promise<void> {
  const headers = view('Base_InterfaceApi_Headers'), row = current('Base_InterfaceApi_Headers')
  if (headers && row) await act(() => headers.removeRow(headers.getPkKey(row)!))
}
async function save(tableName: string): Promise<void> {
  const target = dataSet
  if (target) await act(async () => {
    const result = await target.saveChanges({views: [{tableName, viewId: 'default'}]})
    if (!result.success) throw new Error(result.message ?? '接口方案保存未完整确认')
    if (tableName === '_Base_ParamList') await target.getView(tableName, 'references')?.refresh()
  })
}
async function reload(): Promise<void> {if(outputSession.value)return;const target = dataSet; if (target) await act(() => target.discardAndReload({views: views.value.map(item => ({tableName:item.tableName,viewId:item.viewId}))}))}
function close(): void {if (!outputSession.value && !busy.value && !dirty.value && !unconfirmed.value) emit('close')}
function cancel(): void {if (!outputSession.value && !locked.value) {for (const item of views.value) item.discardPendingChanges(); emit('close')}}
async function loadProvider(providerId:string):Promise<void>{
  if(session.runtime&&(busy.value||dirty.value||unconfirmed.value||outputSession.value)){error.value='请先处理当前服务商的原修改或未确认提交，再切换服务商';return}
  const own = ++generation; ready.value = false; loading.value = true; busy.value = false; error.value = ''; tab.value = 'definition'
  openedProvider.value=providerId
  outputEditing.value=undefined
  outputAction.value=undefined
  bindingWindow.value=undefined
  unsubscribe?.(); dataSet = undefined; session.dispose()
  try {
    const projectId = parseApplicationPathScope(route.path)?.projectId ?? ''
    const current = session.acquire({pageId: 'api-interface-list-page', scenarioIds: [scenarioId,DATA_SPACE_DESIGN_FORM_KEY], deferredScenarioIds:[DATA_SPACE_DESIGN_FORM_KEY], targetId: providerId, scenarioInputs: {[scenarioId]: {providerId}},
      loadScenario: id => loadLowcodeRuntimeScenario({projectId, scenarioId: id,getPage:()=>current})})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    dataSet = current.getDataSet(scenarioId)!
    unsubscribe = dataSet.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed, selectedRowsChanged: changed, editingChanged: changed, editingFieldChanged: changed, editingDiscarded: changed, requestStateChanged: changed})
    dataSet.triggerAutoLoad()
    if (active && own === generation && session.isCurrent(current)) {sparkProvide(PAGE_RUNTIME, current); ready.value = true; changed()}
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}
watch(() => props.providerId, loadProvider, {immediate:true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>
<style scoped>
:deep(.interface-workspace) {grid-template-columns: minmax(220px, 1fr) minmax(0, 3fr) !important; align-items: start; gap: 20px;}
@media (max-width: 850px) {:deep(.interface-workspace) {grid-template-columns: minmax(0, 1fr) !important;}}
</style>
