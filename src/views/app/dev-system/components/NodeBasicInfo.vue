<!--
@module app:views/app/dev-system/components/NodeBasicInfo
职责：直接编辑正式kind及能力、导航、数据空间、原型四组草稿。
边界：节点身份只读，模型名称是后端只读依赖投影，不保留旧平铺字段。
AI用途：为选中节点配置四组领域信息并标记蓝图dirty。
-->
<template>
  <div>
    <template v-if="includes('capability')">
    <el-divider content-position="left">能力信息</el-divider>
    <el-form-item label="节点 ID"><el-input :model-value="state.blueprintDraft.nodeId" disabled /></el-form-item>
    <RendererForm v-if="access('name').read || access('memo').read" :data-view-key="blueprintViewKey" :auto-columns="false" :show-data-view-meta="false" :context-data-member="'currentRow'">
      <template #default>
        <el-form-item v-if="access('name').read" label="能力名称"><FieldText :data-view-key="blueprintViewKey" data-member="currentRow" data-field="name" :readonly="!access('name').write" @update:model-value="state.markBlueprintDirty" /></el-form-item>
        <el-form-item v-if="access('memo').read" label="功能描述"><FieldTextarea :data-view-key="blueprintViewKey" data-member="currentRow" data-field="memo" :autosize="{minRows:4,maxRows:12}" :readonly="!access('memo').write" @update:model-value="state.markBlueprintDirty" /></el-form-item>
      </template>
    </RendererForm>
    <el-form-item v-if="access('conType').read" label="业务种类"><el-select v-model="state.blueprintDraft.kind" :disabled="!access('conType').write" @change="state.markBlueprintDirty"><el-option v-for="option in kindOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item>
    </template>
    <template v-if="includes('navigation')">
    <el-form-item v-if="state.blueprintNodeFieldAccess('FunName').read" label="提供导航"><el-switch v-model="hasNavigation" :disabled="!state.blueprintNodeSectionWritable('navigation')" /></el-form-item>
    <template v-if="state.blueprintDraft.navigation">
      <el-divider content-position="left">导航信息</el-divider>
      <el-form-item v-if="access('FunName').read" label="菜单标题"><el-input v-model="state.blueprintDraft.navigation.title" :disabled="!access('FunName').write" @change="state.markBlueprintDirty" /></el-form-item>
      <el-form-item v-if="access('NavigationImageWxz').read" label="图标"><IconPicker v-if="access('NavigationImageWxz').write" :model-value="state.blueprintDraft.navigation.icon ?? ''" @update:model-value="state.blueprintDraft.navigation.icon = $event; state.markBlueprintDirty()" /><el-input v-else :model-value="state.blueprintDraft.navigation.icon ?? ''" disabled /></el-form-item>
      <el-form-item v-if="includes('navigation-target') && access('NavigationUrl').read" label="工具或页面目标"><el-input v-model="state.blueprintDraft.navigation.target" :disabled="!access('NavigationUrl').write" @change="state.markBlueprintDirty" /></el-form-item>
    </template>
    </template>
    <template v-if="includes('data-space')">
    <el-divider content-position="left">数据空间</el-divider>
    <el-form-item v-if="access('conid').read" label="绑定场景">
      <div class="scene-binding-control">
        <FieldSelect :data-view-key="blueprintViewKey" data-member="currentRow" data-field="conid"
          :option-data-view-key="catalogViewKey" option-value-field="rowid" option-label-field="Name"
          :readonly="true" :clearable="false" />
        <RendererButton :label="state.blueprintDraft.dataSpace?.scenarioId ? '更换场景' : '选择场景'"
          :disabled="!canChooseScene" @click="openScenePicker" />
      </div>
    </el-form-item>
    <el-form-item v-else label="绑定场景"><el-alert title="当前查询没有返回 conid 字段或读取权限" type="warning" :closable="false" /></el-form-item>
    <el-alert v-if="catalogError" :title="catalogError" type="error" :closable="false" />
    <RendererDialog v-if="catalogOpen" :model-value="true" :data-view-key="catalogViewKey"
      title="选择数据空间" width="min(980px, 94vw)" :close-disabled="catalogLoading"
      @update:model-value="closeScenePicker">
      <p v-if="catalogLoading" role="status">正在读取数据空间目录…</p>
      <p v-if="catalogError" role="alert">{{ catalogError }}</p>
      <template v-if="catalogViewReady">
        <RendererFilter :data-view-key="catalogViewKey" :auto-query="false" :children="catalogFilterFields" />
        <RendererTable :data-view-key="catalogViewKey" :children="catalogFields" :highlight-current-row="true" />
      </template>
      <template #footer>
        <RendererButton label="取消" :disabled="catalogLoading" @click="closeScenePicker(false)" />
        <RendererButton label="确定" :disabled="catalogLoading || !catalogView?.currentRow" @click="chooseScene" />
      </template>
    </RendererDialog>
    </template>
    <template v-if="includes('prototype')">
    <el-form-item v-if="access('htmlDesc').read" label="提供原型"><el-switch v-model="hasPrototype" :disabled="!access('htmlDesc').write" /></el-form-item>
    <el-form-item v-if="state.blueprintDraft.prototype && access('htmlDesc').read" label="原型描述"><el-input v-model="state.blueprintDraft.prototype.htmlDescription" :disabled="!access('htmlDesc').write" type="textarea" :rows="6" @change="state.markBlueprintDirty" /></el-form-item>
    </template>
  </div>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import { PROJECT_BLUEPRINT_NODE_KINDS } from '@spark-appworks/spark-utils'
import type { ProjectBlueprintNodeKind } from '@spark-appworks/spark-utils'
import {buildDataViewKey, RequestState, type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import type { DevState } from '../useDevState'
import IconPicker from '@/components/IconPicker.vue'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
const {FieldSelect, FieldText, FieldTextarea, RendererForm, RendererButton, RendererDialog, RendererFilter, RendererTable} = SparkComponent
const CATALOG_SCENARIO_ID = getBuiltinScenarioResource('dataSpaceCatalog').scenarioId
const catalogViewKey = buildDataViewKey('Base_DataSet', 'catalog', CATALOG_SCENARIO_ID)
const blueprintViewKey = buildDataViewKey('Base_NavigationInfo', 'default', LOWCODE_APPLICATION_CATALOG_FORM_KEY)
/** Selects blueprint domains for the shared DataView-backed editor; omitted means every section. */
type Section = 'capability' | 'navigation' | 'navigation-target' | 'data-space' | 'prototype'
const props = defineProps<{state:DevState;sections?:readonly Section[]}>()
const includes = (section: Section) => props.sections === undefined ? true : props.sections.includes(section)
const labels:Record<ProjectBlueprintNodeKind,string>={module:'模块',page:'页面',embedded:'嵌入内容',service:'服务',content:'内容'}
const kindOptions=PROJECT_BLUEPRINT_NODE_KINDS.map(value=>({value,label:labels[value]}))
const access=(field:string)=>props.state.blueprintNodeFieldAccess(field)
const hasNavigation = computed({get:()=>props.state.blueprintDraft.navigation !== undefined,set:(enabled:boolean)=>{if(enabled)props.state.blueprintDraft.navigation={title:props.state.blueprintDraft.capability.name??'',order:0,publishInMenu:true,showChildren:true,beginGroup:false};else delete props.state.blueprintDraft.navigation;props.state.markBlueprintDirty()}})
const hasPrototype = computed({get:()=>props.state.blueprintDraft.prototype !== undefined,set:(enabled:boolean)=>{if(enabled)props.state.blueprintDraft.prototype={htmlDescription:''};else delete props.state.blueprintDraft.prototype;props.state.markBlueprintDirty()}})
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
}
watch(()=>[props.state.projectId,props.state.selectedNode.value?.nodeId,props.state.blueprintPageRuntime.value?.instanceId],()=>{
  if(catalogOpen.value){pickerRevision++;catalogLoading.value=false;catalogError.value='';catalogOpen.value=false;catalogReady.value=false;catalogView.value=undefined;pickerTarget.value=undefined}
})
onBeforeUnmount(()=>{pickerRevision++;pickerTarget.value=undefined})
</script>
