<!--
@module app:views/features/application/application-function-management/ui/blueprint-data-space/NodeDataSpaceBinding
职责：蓝图节点的主数据空间绑定：展示 conid 并从正式数据空间目录选择场景。
边界：只写 conid 编辑覆盖并通知宿主；保存与回读核验由蓝图页数据空间页签负责。
AI用途：调整数据空间绑定选择时定位本组件。
-->
<template>
  <div>
    <RendererDivider content-position="left" content="数据空间" />
    <RendererForm v-if="blueprintBindingReady && access('conid').read" v-bind="blueprintContainerProps" :auto-columns="false" :show-data-view-meta="false" context-data-member="currentRow" class="scene-binding-control">
        <FieldSelect v-bind="blueprintFieldProps" data-member="currentRow" data-field="conid"
          label="绑定场景" :option-data-view-key="catalogViewKey" option-value-field="rowid" option-label-field="Name"
          :readonly="true" :clearable="false" />
        <RendererButton :label="state.blueprintDraft.dataSpace?.scenarioId ? '更换场景' : '选择场景'"
          :disabled="!canChooseScene" @click="openScenePicker" />
    </RendererForm>
    <DisplayAlert v-else title="当前查询没有返回 conid 字段或读取权限" alert-type="error" />
    <DisplayAlert v-if="catalogError" :description="catalogError" alert-type="error" />
    <RendererDialog v-if="catalogOpen" :model-value="true" :data-view-key="catalogViewKey"
      title="选择数据空间" width="min(980px, 94vw)" :close-disabled="catalogLoading"
      @update:model-value="closeScenePicker">
      <DisplayAlert v-if="catalogLoading" description="正在读取数据空间目录…" alert-type="info" />
      <DisplayAlert v-if="catalogError" :description="catalogError" alert-type="error" />
      <template v-if="catalogViewReady">
        <RendererFilter :data-view-key="catalogViewKey" :auto-query="false" :children="catalogFilterFields" />
        <RendererTable :data-view-key="catalogViewKey" :children="catalogFields" :highlight-current-row="true" />
      </template>
      <template #footer>
        <RendererButton label="取消" :disabled="catalogLoading" @click="closeScenePicker(false)" />
        <RendererButton label="确定" :disabled="catalogLoading || !catalogView?.currentRow" @click="chooseScene" />
      </template>
    </RendererDialog>
  </div>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {buildDataViewKey, RequestState, type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import * as SparkComponent from '@spark-appworks/spark-component'
import type { DevState } from '../blueprint-state/useDevState'
import {getSystemScenarioResource} from '@/registries/system-scenario-registry'
const {DisplayAlert, FieldSelect, RendererForm, RendererButton, RendererDialog, RendererFilter, RendererTable, RendererDivider} = SparkComponent
const CATALOG_SCENARIO_ID = getSystemScenarioResource('dataSpaceCatalog').scenarioId
const catalogViewKey = buildDataViewKey('Base_DataSet', 'catalog', CATALOG_SCENARIO_ID)
const blueprintComponentBinding = computed(()=>{
  const owner=props.state.blueprintWorkspaceDataView.value
  return owner?.projectId===props.state.projectId?owner.standardComponentBinding:undefined
})
const blueprintViewKey = computed(()=>blueprintComponentBinding.value?.dataViewKey??'')
const blueprintContainerProps = computed(()=>blueprintViewKey.value?{dataViewKey:blueprintViewKey.value}: {})
const blueprintFieldProps = computed(()=>blueprintViewKey.value?{dataViewKey:blueprintViewKey.value}: {})
const blueprintBindingReady = computed(()=>Boolean(blueprintViewKey.value))
const props = defineProps<{state:DevState}>()
/** sceneChosen: the conid edit overlay was staged with this formal scenario id; hosts may save it explicitly. */
const emit = defineEmits<{sceneChosen:[scenarioId:string]}>()
const access=(field:string)=>props.state.blueprintNodeFieldAccess(field)
const catalogOpen = ref(false), catalogLoading = ref(false), catalogError = ref('')
const catalogReady = ref(false)
const catalogView = shallowRef<DataView>()
type PickerTarget = {nodeId:string; projectId:string; runtime:PageRuntime; view:DataView; revision:number}
const pickerTarget = shallowRef<PickerTarget>()
let pickerRevision = 0
const canChooseScene = computed(()=>access('conid').read && access('conid').write && !props.state.pageDataDirty.value)
const catalogViewReady = computed(()=>catalogReady.value && catalogView.value?.requestState === RequestState.Loaded && !catalogView.value.loadingError)
const catalogFilterFields = [
  {type:'r-text',props:{field:'Name',label:'名称或场景 ID',placeholder:'搜索名称或场景 ID',
    filterAlternatives:[{field:'Name',operator:'contains'},{field:'rowid',operator:'eq'}]}},
]
const catalogFields = [
  {type:'r-text',props:{field:'Name',label:'数据空间名称',width:260,readonly:true}},
  {type:'r-text',props:{field:'rowid',label:'场景 ID',width:300,readonly:true}},
]
function isPickerTargetCurrent(target:PickerTarget):boolean {
  return pickerTarget.value===target && pickerRevision===target.revision
    && props.state.projectId===target.projectId && props.state.selectedNode.value?.nodeId===target.nodeId
    && props.state.blueprintDraft.nodeId===target.nodeId && props.state.blueprintPageRuntime.value===target.runtime
}
function closeScenePicker(value=false):void {
  if(value)return
  if(catalogLoading.value)return
  pickerRevision++
  pickerTarget.value=undefined
  catalogOpen.value=false
  catalogReady.value=false
  catalogView.value=undefined
}
async function waitForCatalogRequest(view:DataView):Promise<void> {
  if(view.requestState!==RequestState.Loading && view.requestState!==RequestState.Preparing)return
  await new Promise<void>(resolve=>{
    const changed=():void=>{
      if(view.requestState===RequestState.Loading || view.requestState===RequestState.Preparing)return
      view.events.off('requestStateChanged',changed)
      resolve()
    }
    view.events.on('requestStateChanged',changed)
    changed()
  })
}
async function openScenePicker():Promise<void> {
  if(!canChooseScene.value || catalogLoading.value)return
  const nodeId=props.state.selectedNode.value?.nodeId
  const runtime=props.state.blueprintPageRuntime.value
  const projectId=props.state.projectId
  if(!nodeId || !runtime?.isLoaded || props.state.blueprintDraft.nodeId!==nodeId){catalogError.value='蓝图节点与运行实例尚未就绪';return}
  const view=runtime.resolveView(catalogViewKey)
  if(!view || view.tableName!=='Base_DataSet' || view.viewId!=='catalog' || view.dataSet?.scenarioId!==CATALOG_SCENARIO_ID){
    catalogOpen.value=true;catalogReady.value=false;catalogView.value=undefined;catalogError.value=`正式数据空间目录视图不存在或身份不匹配：${catalogViewKey}`;return
  }
  const target:PickerTarget={nodeId,projectId,runtime,view,revision:++pickerRevision}
  pickerTarget.value=target;catalogView.value=view;catalogReady.value=view.requestState===RequestState.Loaded && !view.loadingError;catalogOpen.value=true;catalogError.value=''
  if(catalogReady.value)return
  catalogLoading.value=true
  try{
    if(view.requestState===RequestState.Loading || view.requestState===RequestState.Preparing) await waitForCatalogRequest(view)
    else {
      await view.refresh()
    }
    if(!isPickerTargetCurrent(target)){closeScenePicker();return}
    if(view.loadingError)throw view.loadingError
    if(view.requestState!==RequestState.Loaded)throw new Error('数据空间目录查询未完成')
    catalogReady.value=true
  }catch(error){if(isPickerTargetCurrent(target))catalogError.value=error instanceof Error?error.message:String(error)}
  finally{if(isPickerTargetCurrent(target))catalogLoading.value=false}
}
function chooseScene():void {
  const target=pickerTarget.value,view=catalogView.value
  if(!target || !view || !isPickerTargetCurrent(target)){catalogError.value='数据空间候选已因节点或项目切换失效';return}
  if(!canChooseScene.value || view.requestState!==RequestState.Loaded || view.loadingError){catalogError.value='当前 conid 编辑权限或目录查询状态不允许选择';return}
  const row=view.currentRow
  if(!row){catalogError.value='请先在数据空间目录中选择一行';return}
  const rowid=String(row['rowid']??'').trim()
  const candidate=view.rows.find(item=>String(item['rowid']??'').trim()===rowid)
  if(!candidate || !rowid){catalogError.value='选择项缺少当前目录中的正式场景 ID';return}
  if(view.fieldAccess(candidate,'rowid').read!=='visible' || view.fieldAccess(candidate,'Name').read!=='visible'){
    catalogError.value='当前查询未授权读取该场景的 ID 和名称';return
  }
  const name=String(candidate['Name']??'').trim()
  if(!name){catalogError.value='数据空间目录项缺少可读取的名称';return}
  // The blueprint draft proxy writes only the conid-backed DataView edit overlay.
  props.state.blueprintDraft.dataSpace={scenarioId:rowid,models:[]}
  closeScenePicker()
  emit('sceneChosen',rowid)
}
watch(()=>[props.state.projectId,props.state.selectedNode.value?.nodeId,props.state.blueprintPageRuntime.value?.instanceId],()=>{
  if(catalogOpen.value){pickerRevision++;catalogLoading.value=false;catalogError.value='';catalogOpen.value=false;catalogReady.value=false;catalogView.value=undefined;pickerTarget.value=undefined}
})
onBeforeUnmount(()=>{pickerRevision++;pickerTarget.value=undefined})
</script>
