<!--
@module app:views/features/data-platform/structured-config/logic-view/ui/logic-view-design-page
-->
<template>
  <section class="structured-editor-page">
    <header><h1>逻辑视图设计</h1><p v-if="viewId">视图 ID：{{ viewId }}</p></header>
    <p v-if="loading" role="status">正在读取设计…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <RendererTabs :data-view-key="catalogKey" :model-value="activeTab" @update:model-value="value => activeTab = String(value)">
        <RendererTabPane :index="0" name="basic" label="视图基本信息" :data-view-key="catalogKey">
          <RendererForm :data-view-key="catalogKey" :children="basicFields" :grid-columns="1" :show-data-view-meta="false" />
          <h2>视图参数</h2>
          <p v-if="!parametersReady" role="status">正在读取视图参数…</p>
          <template v-else>
          <RendererTable :data-view-key="parameterKey" :children="parameterFields" :toolbar="parameterToolbar" :show-pagination="false" :show-data-view-meta="false" />
          <RendererButton :data-view-key="parameterKey" label="核验参数保存结果" :disabled="busy || parameterState.mutating" @click="verifyParameters" />
          <RendererButton :data-view-key="parameterKey" label="取消参数修改" :disabled="busy || parameterState.mutating || parameterState.unknown" @click="cancelParameters" />
          </template>
        </RendererTabPane>
        <RendererTabPane :index="1" name="design" label="视图数据设计" :data-view-key="designKey">
          <template v-if="designView">
      <LogicViewNodeEditor :view-key="designKey" :view="designView" :parameter-view-key="parameterKey" :metadata="metadataReady ? runtime?.getDataSet(LowcodeLogicView.parameterScenarioId) : undefined" :disabled="busy || publicationState.pending || designView.hasUnconfirmedSave || completeEditing" @editing-change="nodeEditing=$event" />
      <details><summary>完整设计</summary><RendererForm :data-view-key="designKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <FieldJson field="designJson" label="完整设计" mode="tree" :height="360" :readonly="busy || publicationState.pending || nodeEditing" :on-editing-change="value=>completeEditing=value" />
      </RendererForm></details>
      <p v-if="publicationState.pending && publicationState.fileConfirmed" role="status">设计已确认保存，输出尚未完成。</p>
      <p v-else-if="publicationState.published" role="status">设计和输出已确认保存。</p>
      <p v-else-if="publicationState.finished" role="status">本次发布已结束；已确认的设计不会回滚。</p>
      <RendererButton :data-view-key="designKey" :label="publicationState.needsVerification ? '核验发布结果' : publicationState.pending && publicationState.fileConfirmed ? '继续保存输出' : '保存设计'" button-type="primary" :disabled="busy || nodeEditing || completeEditing || !publicationState.canSave && !publicationState.needsVerification" @click="save" />
      <RendererButton v-if="publicationState.canAcceptCurrent" :data-view-key="designKey" label="采用当前正式结果并结束发布" :disabled="busy" @click="acceptCurrent" />
      <RendererButton v-if="publicationState.canRetireNotAppliedOutputs" :data-view-key="designKey" label="放弃未生效的输出修改" :disabled="busy" @click="retireOutputs" />
      <RendererButton v-if="publicationState.pending && publicationState.canCancelBeforeDispatch" :data-view-key="designKey" label="取消未提交输出" :disabled="busy" @click="cancelOutputs" />
      <RendererButton :data-view-key="designKey" label="放弃修改并重读" :disabled="busy || designView?.hasUnconfirmedSave === true || publicationState.pending && !publicationState.canCancelBeforeDispatch" @click="reload" />
          </template>
          <template v-else><p role="alert">{{ designError }}</p><RendererButton :data-view-key="designKey" label="重试读取设计" :disabled="busy" @click="retryDesign" /></template>
        </RendererTabPane>
      </RendererTabs>
      <RendererDialog v-if="deleteId !== undefined" :data-view-key="parameterKey" :model-value="true" title="删除参数" :close-disabled="parameterBusy || parameterState.unknown" @update:model-value="open => {if (!open) cancelDelete()}">
        <p>确定删除选中的视图参数？</p>
        <RendererButton :data-view-key="parameterKey" :label="parameterState.unknown ? '核验删除结果' : '确认删除'" :disabled="parameterBusy" @click="confirmDelete" />
        <RendererButton :data-view-key="parameterKey" label="取消" :disabled="parameterBusy || parameterState.unknown" @click="cancelDelete" />
      </RendererDialog>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, triggerRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {FieldJson, RendererButton, RendererDialog, RendererForm, RendererTable, RendererTabs, RendererTabPane, type RToolbarProps} from '@spark-appworks/spark-component'
import LogicViewNodeEditor from './logic-view-node-editor.vue'
import {LOGIC_VIEW_DESIGN_INPUT, LOGIC_VIEW_DESIGN_VIEW} from '@/lowcode/resources/structured-config/logic-view/design-ops'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {LogicViewPublication} from '@/lowcode/resources/structured-config/logic-view/output/publication'
import {useStagedDesignPage} from '@/views/features/data-platform/shared/model/use-staged-design-page'

const route = useRoute()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const viewId = computed(() => typeof route.query['viewId'] === 'string' ? route.query['viewId'] : '')
const designKey = computed(() => buildDataViewKey(LOGIC_VIEW_DESIGN_VIEW, 'default', scenarioId.value))
const catalogKey = computed(() => buildDataViewKey(LowcodeLogicView.catalogMetaName, 'editorTarget', scenarioId.value))
const parameterKey = buildDataViewKey(LowcodeLogicView.parameterModelName, LowcodeLogicView.parameterViewId, LowcodeLogicView.parameterScenarioId)
const activeTab = ref('basic'), revision = ref(0), deleteId = ref<string | number>(), parameterBusy = ref(false)
const nodeEditing=ref(false),completeEditing=ref(false)
const publication=shallowRef<LogicViewPublication>()
const publicationState=computed(()=>{
 const command=publication.value
 return{pending:command?.pending===true,finished:command?.finished===true,published:command?.published===true,
  fileConfirmed:command?.fileConfirmed===true,needsVerification:command?.needsVerification===true,
  canAcceptCurrent:command?.canAcceptCurrent===true,canRetireNotAppliedOutputs:command?.canRetireNotAppliedOutputs===true,
  canCancelBeforeDispatch:command?.canCancelBeforeDispatch===true,canSave:!command?.pending||command.canSave}
})
useSystemPageDirtySource({get isDirty(){return nodeEditing.value||completeEditing.value||publication.value?.pending===true}})
const retainInput=()=>!(nodeEditing.value||completeEditing.value||publication.value?.pending)
onBeforeRouteUpdate(retainInput)
onBeforeRouteLeave(retainInput)
const {runtime, designView, designError, loading, ready, busy, error, saveChanges, refreshDesign} = useStagedDesignPage({
  pageId: 'logic-view-design-page',
  scenarioId,
  scopeId: viewId,
  scopeInputTable: LOGIC_VIEW_DESIGN_INPUT,
  scopeField: 'viewId',
  designViewTable: LOGIC_VIEW_DESIGN_VIEW,
  runtimeOptions: input => LowcodeLogicView.editorRuntimeOptions({scenarioId: input.scenarioId, viewId: input.scopeId}),
  prepareRuntime: page => LowcodeLogicView.prepareEditor(page),
  hasPendingIntent:()=>publication.value?.pending===true,
  missingScopeMessage: '缺少 viewId 参数',
})
const parametersReady=ref(false),metadataReady=ref(false)
watch([ready,runtime,activeTab],async()=>{
 const page=runtime.value
 if(!ready.value||!page){parametersReady.value=false;metadataReady.value=false;return}
 metadataReady.value=!!page.getDataSet(LowcodeLogicView.parameterScenarioId)
 if(activeTab.value==='basic'?parametersReady.value:!!page.getDataSet(LowcodeLogicView.parameterScenarioId))return
 parameterBusy.value=true
 try{
  if(activeTab.value==='basic'){await LowcodeLogicView.ensureParameters(page);if(runtime.value===page)parametersReady.value=true}
  else await page.ensureScenarioLoaded(LowcodeLogicView.parameterScenarioId)
  if(runtime.value===page)metadataReady.value=true
 }
 catch(cause){if(runtime.value===page)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(runtime.value===page)parameterBusy.value=false}
},{immediate:true})
const parameterView = computed(() => ready.value && parametersReady.value ? runtime.value?.resolveView(parameterKey) : undefined)
watch(runtime, () => {deleteId.value = undefined;publication.value?.dispose();publication.value=undefined})
onBeforeUnmount(()=>publication.value?.dispose())
watch(parameterView, (view, _, cleanup) => {
  if (!view) return
  const bump = () => {revision.value++}
  const events = ['editingChanged', 'rowsChanged', 'mutatingChanged', 'currentRowChanged', 'requestStateChanged'] as const
  for (const event of events) view.events.on(event, bump)
  cleanup(() => {for (const event of events) view.events.off(event, bump)})
})
const parameterState = computed(() => {
  revision.value
  const view = parameterView.value
  return {pending: !!view && (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()),
    unknown: view?.hasUnconfirmedSave === true, mutating: view?.mutating === true || parameterBusy.value}
})
const basicFields: SparkNode[] = [{type: 'r-text', props: {field: 'name', label: '名称', readonly: true}},
  {type: 'r-text', props: {field: 'description', label: '摘要', readonly: true}}]
const parameterFields: SparkNode[] = ['parname', 'pardesc', 'testvalue'].map((field, index) => ({type: 'r-text',
  props: {field, label: ['参数名', '中文名', '测试值'][index], editOnDblclick: true, saveOnCellExit: true}}))
const parameterToolbar = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '新增参数', action: 'append-row', setCurrentRowOnSuccess: true,
    appendPayload: {parname: '', pardesc: '', testvalue: ''}, disabled: busy.value || parameterState.value.pending || parameterState.value.unknown || parameterState.value.mutating}},
  {type: 'r-button', props: {label: '删除参数', permAction: 'delete', disabled: busy.value || parameterState.value.unknown || parameterState.value.mutating,
    onClick: () => {const view = parameterView.value, row = view?.currentRow; if (view && row) deleteId.value = view.getPkKey(row)}}},
]}))
async function runPublication(action:()=>Promise<void>|void):Promise<void>{
 if(busy.value||nodeEditing.value||completeEditing.value)return
 busy.value=true;error.value=''
 try{await action()}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
 finally{busy.value=false;triggerRef(publication)}
}
async function save(): Promise<void> {
 await runPublication(async()=>{
  if(!publication.value?.pending){
   const page=runtime.value,id=viewId.value,view=designView.value,scenario=scenarioId.value
   if(!page||!view)throw Error('原设计工作区尚未读取完成')
   publication.value?.dispose()
   publication.value=new LogicViewPublication({page,viewId:id,assertCurrent:()=>{
    if(runtime.value!==page||viewId.value!==id||scenarioId.value!==scenario||designView.value!==view)throw Error('原设计发布目标已变化')
   }})
  }
  if(publication.value.needsVerification)await publication.value.verify()
  else await publication.value.save()
 })
}
async function acceptCurrent():Promise<void>{await runPublication(()=>publication.value?.acceptCurrentAndRetire())}
async function retireOutputs():Promise<void>{await runPublication(()=>publication.value?.retireNotAppliedOutputs())}
async function cancelOutputs():Promise<void>{await runPublication(()=>publication.value?.cancelBeforeDispatch())}
async function reload(): Promise<void> {
 if(busy.value||nodeEditing.value||completeEditing.value)return
 try{
  if(publication.value&&!publication.value.finished)publication.value.cancelBeforeDispatch()
  publication.value?.dispose();publication.value=undefined
  await refreshDesign({discardChanges:true})
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause);triggerRef(publication)}
}
async function retryDesign(): Promise<void> {await refreshDesign()}
async function verifyParameters(): Promise<void> {await saveChanges({viewKey: parameterKey})}
function cancelParameters(): void {
  const view = parameterView.value
  if (!view || parameterState.value.mutating || view.hasUnconfirmedSave) return
  try {view.discardPendingChanges(); revision.value++}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function cancelDelete(): void {
  const view = parameterView.value, id = deleteId.value
  if (!view || id === undefined || parameterBusy.value || view.hasUnconfirmedSave) return
  try {if (view.dirtyTracking.pendingDeleteIds.has(id)) view.discardPendingChanges([id]); deleteId.value = undefined; revision.value++}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
async function confirmDelete(): Promise<void> {
  const view = parameterView.value, id = deleteId.value
  if (!view || id === undefined || parameterBusy.value) return
  parameterBusy.value = true
  try {
    if (!view.hasUnconfirmedSave && !view.dirtyTracking.pendingDeleteIds.has(id)) {
      const result = await view.removeRow(id)
      if (result === false || typeof result === 'object' && !result.success) throw new Error('参数删除未成功')
    }
    await saveChanges({viewKey: parameterKey, ids: [id]})
    if (!view.hasUnconfirmedSave && !view.dirtyTracking.pendingDeleteIds.has(id)) deleteId.value = undefined
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {parameterBusy.value = false; revision.value++}
}
</script>

<style scoped>
.structured-editor-page { display: grid; gap: 12px; padding: 24px; }
</style>
