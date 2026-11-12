<!--
@module app:views/features/application/application-function-management/ui/page-design/DevPreviewTab
职责：蓝图页“页面设计”的工具真实运行实例预览。
边界：不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解页面设计如何预览工具时，用本模块定位。
-->
<template>
  <div class="dev-preview-tab">
    <!-- 工具栏 -->
    <div class="preview-toolbar">
      <div class="preview-toolbar__left">
        <RendererForm v-if="previewInputView && previewInputViewKey" :key="previewInputScopeKey"
          :data-view-key="previewInputViewKey" :data-source="previewInputView" context-data-member="currentRow"
          :auto-columns="false" :grid-columns="2" :grid-gap="8" :show-data-view-meta="false" :show-aggregate-summary="false" :show-selection-summary="false">
          <FieldSwitch :data-view-key="previewInputViewKey" data-member="currentRow" data-field="livePreview"
            active-text="实时预览" inactive-text="手动" @update:model-value="notifyPreviewInputChanged('livePreview')" />
          <FieldSwitch :data-view-key="previewInputViewKey" data-member="currentRow" data-field="autoRefresh"
            active-text="切Tab刷新" inactive-text="—" @update:model-value="notifyPreviewInputChanged('autoRefresh')" />
        </RendererForm>
      </div>
      <div class="preview-toolbar__right">
        <RendererButton label="刷新预览" button-type="default" :loading="loading" :disabled="contextSuspended" @click="refresh" />
      </div>
    </div>

    <!-- 预览区域 -->
    <div class="preview-container">
      <template v-if="loading">
        <DisplayAlert title="正在加载预览…" alert-type="info" />
      </template>
      <template v-else-if="parseError && !previewRuntime">
        <div class="error-panel">
          <DisplayAlert title="解析失败" :description="parseError" alert-type="error" />
        </div>
      </template>
      <template v-else>
        <DisplayAlert v-if="parseError" title="预览未刷新" :description="parseError" alert-type="warning" />
        <SparkPageRenderer v-if="previewRuntime"
          :page-runtime="previewRuntime"
          :route-snapshot="routeSnapshot"
        />
        <DisplayEmpty v-else-if="!loading && !parseError" description="暂无可预览的内容，请先编辑页面配置" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import { buildDataViewKey, ensureDataSetStaticInputTable, parseDataViewKey } from '@spark-appworks/spark-data'
import type { DataSet, DataTable, DataView } from '@spark-appworks/spark-data'
import { DisplayAlert,DisplayEmpty,FieldSwitch,RendererButton,RendererForm,SparkPageRenderer,PAGE_RUNTIME,useSparkComponent } from '@spark-appworks/spark-component'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {PageTool, ScenarioDefinitionDocument, ScenarioViewConfig, type PageRuntime} from '@spark-appworks/spark-project-model'
import type { PageRoute } from '@spark-appworks/spark-component/runtime'
import { assembleLowcodeRuntimeScenario } from '@/lowcode/data-space/lowcode-data-space-runtime'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { buildApplicationPath, buildConfigPageNavigationPath } from '@/services/application-scope'
import type { DevState } from '../blueprint-state/useDevState'

const props = defineProps<{
  state: DevState
  /** 外部通知刷新（如切 Tab 时 ++） */
  refreshToken?: number
  registerPreviewGuard?: (guard: () => boolean) => () => void
}>()

const loading = ref(false)
const parseError = ref<string | null>(null)
const previewRuntime = shallowRef<PageRuntime | null>(null)
const routeSnapshot = shallowRef<PageRoute>({path:'',fullPath:'',name:null,params:{},query:{},hash:''})
const previewInputView = shallowRef<DataView>()
const previewInputViewKey = ref('')
const previewInputScopeKey = ref('')
const previewInputRevision = ref(0)
let previewInputDataSet: DataSet | undefined
let previewInputTableName: string | undefined
let previewInputTable: DataTable | undefined
let previewInputProvidedRuntime=false
const {sparkProvide,sparkRemove}=useSparkComponent({type:'blueprint-preview-tab'})
const previewSession=new NativePageRuntimeSession()
const livePreview = computed(() => {
  void previewInputRevision.value
  return readPreviewInput('livePreview', true)
})
const autoRefresh = computed(() => {
  void previewInputRevision.value
  return readPreviewInput('autoRefresh', true)
})
let generation = 0
let disposed = false
let contextSuspensions = 0
let notifyingPreviewChange = false
const contextSuspended = ref(false)
let releaseRuntimeSubscriptions: Array<() => void> = []
type PreviewInputScope = Readonly<{
  projectId: string
  workspace: DevState['editor']
  owner: NonNullable<DevState['blueprintWorkspaceDataView']['value']>
  ownerRuntime: PageRuntime
  pageId: string
  nodeId: string
  mainScenarioId?: string
}>
type PreviewTarget = PreviewInputScope & Readonly<{
  externalRevision: number
}>

function currentInputScope(): PreviewInputScope | undefined {
  const state=props.state,owner=state.blueprintWorkspaceDataView.value,runtime=state.blueprintPageRuntime.value
  const pageId=state.activePageId.value,selectedNode=state.selectedNode.value
  if(!owner||!runtime?.isLoaded||runtime.destroyed||owner.projectId!==state.projectId||owner.nodeId!==selectedNode?.nodeId
    ||!pageId||!selectedNode||state.project.getActivePage()?.pageId!==pageId||typeof owner.dataSet.scenarioId!=='string'
    ||runtime.getDataSet(owner.dataSet.scenarioId)!==owner.dataSet)return undefined
  const mainScenarioId=selectedNode.dataSpace?.scenarioId
  return {projectId:state.projectId,workspace:state.editor,owner,ownerRuntime:runtime,pageId,nodeId:selectedNode.nodeId,
    ...(mainScenarioId?{mainScenarioId}:{})}
}

function currentTarget(): PreviewTarget | undefined {
  const scope=currentInputScope()
  return scope?{...scope,externalRevision:props.state.externalDataViewRevision.value}:undefined
}

function sameTarget(left:PreviewTarget,right:PreviewTarget):boolean {
  return left.projectId===right.projectId&&left.workspace===right.workspace&&left.owner===right.owner
    &&left.ownerRuntime===right.ownerRuntime&&left.ownerRuntime.instanceId===right.ownerRuntime.instanceId
    &&left.pageId===right.pageId&&left.nodeId===right.nodeId&&left.mainScenarioId===right.mainScenarioId
    &&left.externalRevision===right.externalRevision
}

function assertTargetCurrent(target:PreviewTarget,expectedGeneration:number):void {
  const current=currentTarget()
  if(expectedGeneration!==generation||!current||!sameTarget(target,current)
    ||props.state.blueprintWorkspaceDataView.value!==target.owner
    ||props.state.blueprintPageRuntime.value!==target.ownerRuntime
    ||target.owner.nodeId!==target.nodeId||props.state.projectId!==target.projectId)
    throw new Error('PAGE_PREVIEW_STALE: 预览目标或编辑owner已改变')
}

function hasPendingPreview():boolean {
  const runtime=previewRuntime.value
  if (!runtime || runtime.destroyed) return false
  if (runtime.isDirty) return true
  return runtime.call.scenarioIds.some(id => {
    const dataSet=runtime.getDataSet(id)
    return dataSet!==undefined && Object.values(dataSet.tables).some(table =>
      Object.values(table.views).some(view => view.mutating || view.hasUnconfirmedSave))
  })
}

function notifyPreviewChange():void {
  notifyingPreviewChange=true
  try {props.state.notifyExternalDataViewChanged()}
  finally {notifyingPreviewChange=false}
}

function releasePreviewRuntime():void {
  for (const release of releaseRuntimeSubscriptions.splice(0)) release()
  previewRuntime.value=null
  previewSession.dispose()
}

function watchPreviewRuntime(runtime:PageRuntime):void {
  releaseRuntimeSubscriptions.push(runtime.onContentChange(notifyPreviewChange))
  for (const id of runtime.call.scenarioIds) {
    const dataSet=runtime.getDataSet(id)
    if (!dataSet) continue
    releaseRuntimeSubscriptions.push(dataSet.onAnyViewChange({
      rowsChanged:notifyPreviewChange,
      editingFieldChanged:notifyPreviewChange,
      editingChanged:notifyPreviewChange,
      editingDiscarded:notifyPreviewChange,
      mutatingChanged:notifyPreviewChange,
      requestCompleted:notifyPreviewChange,
    }))
  }
}

function releasePreviewInput():void {
  const dataSet=previewInputDataSet,tableName=previewInputTableName,table=previewInputTable,view=previewInputView.value
  if(dataSet&&!dataSet.destroyed&&tableName&&table&&view&&dataSet.getTable(tableName)===table
    &&dataSet.getView(tableName,'default')===view)dataSet.removeTable(tableName)
  if(previewInputProvidedRuntime){sparkRemove(PAGE_RUNTIME);previewInputProvidedRuntime=false}
  previewInputDataSet=undefined;previewInputTableName=undefined;previewInputTable=undefined
  previewInputView.value=undefined;previewInputViewKey.value='';previewInputScopeKey.value=''
  previewInputRevision.value++
}

function bindPreviewInput(target:PreviewInputScope):void {
  const dataSet=target.owner.dataSet
  const tableName=`DevPreviewInput${crypto.randomUUID().replaceAll('-','')}`
  if(dataSet.getTable(tableName))throw new Error('预览开关临时表名称冲突')
  ensureDataSetStaticInputTable(dataSet,tableName,[
    {name:'inputId',primary:true},
    {name:'livePreview',type:'boolean',defaultValue:true,label:'实时预览'},
    {name:'autoRefresh',type:'boolean',defaultValue:true,label:'切Tab刷新'},
  ])
  const table=dataSet.getTable(tableName),view=dataSet.getView(tableName,'default')
  if(!table||!view)throw new Error('预览开关 DataView 未装配')
  try {
    view.commitMode='staged'
    view.appendRow({inputId:'preview-options',livePreview:true,autoRefresh:true})
    view.setCurrentRowById('preview-options')
    const key=buildDataViewKey(tableName,'default',dataSet.scenarioId)
    if(target.ownerRuntime.resolveView(key)!==view)throw new Error('预览开关 DataView 不属于当前编辑运行时')
    previewInputDataSet=dataSet;previewInputTableName=tableName;previewInputTable=table
    previewInputView.value=view;previewInputViewKey.value=key
    previewInputScopeKey.value=`${target.ownerRuntime.instanceId}:${target.projectId}:${target.nodeId}:${target.pageId}:${key}`
    sparkProvide(PAGE_RUNTIME,target.ownerRuntime)
    previewInputProvidedRuntime=true
    previewInputRevision.value++
  } catch(error) {
    if(dataSet.getTable(tableName)===table)dataSet.removeTable(tableName)
    throw error
  }
}

function readPreviewInput(field:'livePreview'|'autoRefresh',fallback:boolean):boolean {
  const view=previewInputView.value
  if(!view||view.destroyed)return fallback
  const row=view.currentRow,id=row&&view.getPkKey(row)
  if(!row||id===undefined||id===null||view.fieldAccess(row,field).read!=='visible')return fallback
  const value=(view.getEditingRow(id)??row)[field]
  return typeof value==='boolean'?value:fallback
}

function notifyPreviewInputChanged(field:'livePreview'|'autoRefresh'):void {
  previewInputRevision.value++
  if(field!=='livePreview')return
  if(!livePreview.value){if(_liveTimer!==null){clearTimeout(_liveTimer);_liveTimer=null}}
  else scheduleLiveRefresh()
}

const inputScopeSources=[
  () => props.state.projectId,
  () => props.state.editor,
  () => props.state.blueprintWorkspaceDataView.value,
  () => props.state.blueprintPageRuntime.value,
  () => props.state.activePageId.value,
  () => props.state.selectedNode.value?.nodeId,
  () => props.state.selectedNode.value?.dataSpace?.scenarioId,
]
watch(inputScopeSources,()=>{
  releasePreviewInput()
  const target=currentInputScope()
  if(target)bindPreviewInput(target)
},{immediate:true,flush:'sync'})

const previewIdentitySources=[
  () => props.state.projectId,
  () => props.state.editor,
  () => props.state.blueprintWorkspaceDataView.value,
  () => props.state.blueprintPageRuntime.value,
  () => props.state.activePageId.value,
  () => props.state.selectedNode.value?.nodeId,
  () => props.state.selectedNode.value?.dataSpace?.scenarioId,
]
const previewConfigurationSources=[
  () => props.state.externalDataViewRevision.value,
  () => props.state.scenarioDefinitionRevision.value,
  () => props.state.scenarioDefinitionDocument.value?.getText(),
]
const unregisterPreviewGuard=props.registerPreviewGuard?.(hasPendingPreview)
const unregisterExternalSession=props.state.registerExternalDataViewSession({
  isDirty:hasPendingPreview,
  save:async()=>{throw new Error('预览业务修改必须在预览页面通过原数据视图提交或取消')},
  prepareContextChange:()=>{
    if (hasPendingPreview()) throw new Error('预览存在未保存业务数据或待核验写入')
    contextSuspensions++
    contextSuspended.value=true
    invalidatePendingPreview()
    releasePreviewRuntime()
    return ()=>{
      contextSuspensions--
      if (contextSuspensions===0) {
        contextSuspended.value=false
        if (!disposed && !previewRuntime.value && livePreview.value) scheduleLiveRefresh()
      }
    }
  },
})
async function refresh():Promise<void> {
  if(contextSuspended.value){parseError.value='工作区目标正在切换，暂不能刷新预览';return}
  if(hasPendingPreview()){previewRuntime.value?.markConfigPending();parseError.value='预览仍有未保存业务数据或待核验写入，请处理后刷新';return}
  if(_liveTimer!==null){clearTimeout(_liveTimer);_liveTimer=null}
  const target=currentTarget()
  if(!target){parseError.value='当前编辑工作区尚未就绪，无法创建预览';return}
  const current = ++generation
  releasePreviewRuntime()
  loading.value = true
  parseError.value = null
  let runtime:PageRuntime | undefined
  try {
    const {pageId,workspace,projectId,mainScenarioId} = target
    const active = props.state.project.getActivePage()
    if (!active || active.pageId !== pageId) throw new Error('请先选择一个配置页面')
    const fileViews=await Promise.all(props.state.pageFileNames.map(fileName=>props.state.loadPageToolFileDataView({pageId,fileName})))
    assertTargetCurrent(target,current)
    const tool = new PageTool({pageId})
    for(let index=0;index<props.state.pageFileNames.length;index++){
      const fileName=props.state.pageFileNames[index]!
      const view=fileViews[index]!,row=view.currentRow,id=row&&view.getPkKey(row),edited=id===null||id===undefined?row:view.getEditingRow(id)??row
      if(!edited||edited['pageId']!==pageId||edited['fileName']!==fileName||typeof edited['text']!=='string')throw new Error(`PAGE_PREVIEW_FILE: ${fileName} 的 DataView 行身份或文本无效`)
      if(view.hasUnconfirmedSave)throw new Error(`PAGE_PREVIEW_FILE_UNKNOWN: ${fileName} 的保存回执仍待核验`)
      tool.hydrateFileText(fileName,edited['text'])
    }
    tool.markLoaded()
    const ids = new Set<string>(mainScenarioId ? [mainScenarioId] : [])
    for(const binding of tool.getNodeTree().collectDataViewKeys()){
      const descriptor=parseDataViewKey(binding)
      if(!descriptor)throw new Error(`PAGE_PREVIEW_BINDING: 页面绑定无效 ${binding}`)
      const scenarioId=descriptor.scope??mainScenarioId
      if(!scenarioId)throw new Error(`PAGE_PREVIEW_BINDING: 局部绑定缺少主场景 ${binding}`)
      ids.add(scenarioId)
    }
    runtime=previewSession.acquire({tool,scenarioIds:[...ids],targetId:`${projectId}:${pageId}`,...(mainScenarioId ? {mainScenarioId} : {}),loadScenario:async scenarioId=>{
      assertTargetCurrent(target,current)
      const scope=lowcodeApi.readRequestScope()
      if(scope.headers['X-AppId']!==projectId)throw new Error('场景预览需要当前运行应用与编辑项目一致')
      const assertScope=():void=>{assertTargetCurrent(target,current);if(lowcodeApi.readRequestScope().token!==scope.token)throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景预览请求代次已失效')}
      const definitions=await workspace.loadScenarioDefinitions({scenarioId})
      assertScope()
      const document=await ScenarioDefinitionDocument.open(definitions,scenarioId)
      let config:ScenarioViewConfig
      try {assertScope();config=new ScenarioViewConfig(scenarioId,document.getText())} finally {document.dispose()}
      return assembleLowcodeRuntimeScenario({projectId,scenarioId,config,assertCurrent:assertScope,getPage:()=>runtime})
    }})
    await runtime.load()
    assertTargetCurrent(target,current)
    if(!previewSession.isCurrent(runtime))return
    runtime.materialize()
    const path=buildApplicationPath({projectId},buildConfigPageNavigationPath(target.nodeId))
    let fullPath=buildApplicationPath({projectId},buildConfigPageNavigationPath(target.nodeId,mainScenarioId))
    const query:PageRoute['query']={}
    if(mainScenarioId)query['scenarioId']=mainScenarioId
    const call=runtime.call
    const additionalIds=call.scenarioIds.filter(id=>id!==call.mainScenarioId)
    const firstAdditional=additionalIds[0]
    if(firstAdditional!==undefined){
      const parameters=new URLSearchParams()
      for(const id of additionalIds)parameters.append('additionalScenarioIds',id)
      fullPath+=`${mainScenarioId?'&':'?'}${parameters.toString()}`
      query['additionalScenarioIds']=additionalIds.length===1?firstAdditional:Object.freeze(additionalIds)
    }
    routeSnapshot.value=Object.freeze({path,fullPath,name:null,params:Object.freeze({projectId}),query:Object.freeze(query),hash:''})
    if(current===generation&&previewSession.isCurrent(runtime)){
      previewRuntime.value=runtime
      watchPreviewRuntime(runtime)
    }
  } catch(error) {
    if(runtime&&previewSession.isCurrent(runtime))previewSession.dispose()
    if(current===generation)parseError.value=error instanceof Error ? error.message : String(error)
  } finally { if(current===generation)loading.value=false }
}

// 外部 refreshToken 变化时触发刷新（切 Tab 驱动）
watch(() => props.refreshToken, () => {
  if (autoRefresh.value) void refresh()
},{flush:'sync'})

let _liveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleLiveRefresh() {
  if (!livePreview.value || contextSuspended.value || disposed) return
  if (_liveTimer !== null) clearTimeout(_liveTimer)
  _liveTimer = setTimeout(() => {
    _liveTimer = null
    if (loading.value) return // 正在手动刷新中，跳过
    void refresh()
  }, 500)
}

// 监听内存 PageNode 的可渲染输入，而不是监听通用 editor revision。
// 相同工具文本及场景视图不会因其它编辑事件重建运行实例。
function invalidatePendingPreview():void {
  generation++
  if(_liveTimer!==null){clearTimeout(_liveTimer);_liveTimer=null}
  loading.value=false
}

watch(previewIdentitySources,()=>{
  invalidatePendingPreview()
  if(hasPendingPreview()){parseError.value='预览仍有未保存业务数据或待核验写入，当前目标不能替换';return}
  releasePreviewRuntime()
  parseError.value=null
  if(livePreview.value)scheduleLiveRefresh()
},{flush:'sync'})

watch(previewConfigurationSources,()=>{
  if(notifyingPreviewChange)return
  invalidatePendingPreview()
  const current=previewRuntime.value
  if(hasPendingPreview()){current?.markConfigPending();parseError.value='预览仍有未保存业务数据或待核验写入，配置变化暂不能应用';return}
  if(livePreview.value)scheduleLiveRefresh()
},{flush:'sync'})
onBeforeUnmount(() => {
  disposed=true
  if (hasPendingPreview()) props.state.addStatus('预览仍有未处理业务修改或待核验写入，运行实例被强制释放', 'error')
  invalidatePendingPreview()
  releasePreviewInput()
  releasePreviewRuntime()
  unregisterPreviewGuard?.()
  notifyingPreviewChange=true
  try {unregisterExternalSession()}
  finally {notifyingPreviewChange=false}
})

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.dev-preview-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  background: var(--el-bg-color);
}
.preview-toolbar__left,
.preview-toolbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-top: 80px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.error-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
