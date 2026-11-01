<!--
@module app:views/features/data-platform/semi-structured/json-data/ui/json-data-page
-->
<template>
 <section class="json-data-page">
  <header><h1>JSON 数据</h1><p>管理JSON文档</p></header>
  <p v-if="loading" role="status">正在读取目录…</p>
  <p v-if="error || queryError" role="alert">{{ error || queryError }}</p>
  <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :toolbar="toolbar" :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
  <RendererDialog v-if="document" :model-value="true" title="JSON 内容编辑" :data-view-key="contentKey" :width="1100" :close-disabled="busy || hasPending" :destroy-on-close="true" @update:model-value="closeDocument">
   <p v-if="documentLoading" role="status">正在读取内容…</p>
   <p v-if="documentError" role="alert">{{ documentError }}</p>
   <p v-if="unconfirmed" role="status">保存结果尚未确认，请通过原保存入口核验。</p>
   <RendererForm v-if="documentReady" :data-view-key="contentKey" :auto-columns="false" :show-data-view-meta="false">
    <FieldJson :data-view-key="contentKey" field="content" label="JSON 内容" mode="tree" :readonly="busy || unconfirmed" :on-editing-change="value => inputPending=value" />
   </RendererForm>
   <template #footer>
    <RendererButton :label="unconfirmed ? '核验内容保存结果' : '保存内容'" :disabled="busy || inputPending || !documentReady" @click="saveContent" />
    <RendererButton label="取消修改" :disabled="busy || unconfirmed || !documentReady" @click="cancelContent" />
    <RendererButton v-if="hasPending" label="放弃修改并关闭" :disabled="busy || unconfirmed" @click="discardAndClose" />
    <RendererButton label="关闭" :disabled="busy || hasPending" @click="closeDocument(false)" />
   </template>
  </RendererDialog>
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute} from 'vue-router'
import {buildDataViewKey,RequestState,type DataRow,type DataSet,type DataView,type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeJsonData} from '@/lowcode/resources/semi-structured/json-data/resource'
const {PAGE_RUNTIME,RendererTable,RendererForm,RendererDialog,RendererButton,FieldJson,useSparkComponent}=SparkComponent
const route=useRoute(),{sparkProvide,sparkRemove}=useSparkComponent({type:'json-data-page'})
const scenarioId=computed(()=>typeof route.meta['blueprintScenarioId']==='string'?route.meta['blueprintScenarioId']:'')
const catalogKey=computed(()=>buildDataViewKey(LowcodeJsonData.catalogMetaName,'default',scenarioId.value))
const dataSet=shallowRef<DataSet>(),catalog=shallowRef<DataView>(),document=shallowRef<DataView>(),opening=ref(false),openingDocument=ref(false),ready=ref(false),acting=ref(false),inputPending=ref(false),error=ref(''),revision=ref(0)
let runtime:PageRuntime|undefined,off:(()=>void)|undefined,generation=0,documentGeneration=0,active=true
const selected=computed(()=>{revision.value;const rows=catalog.value?.selectedRows??[],row=rows[0];return rows.length===1&&row?String(catalog.value?.getPkKey(row)??''):''})
const contentKey=computed(()=>document.value?buildDataViewKey(document.value.tableName,document.value.viewId,scenarioId.value):'')
const requestPending=(view:DataView|undefined)=>view?.requestState===RequestState.Preparing||view?.requestState===RequestState.Loading
const loading=computed(()=>{revision.value;return opening.value||requestPending(catalog.value)})
const documentLoading=computed(()=>{revision.value;return openingDocument.value||requestPending(document.value)})
const busy=computed(()=>acting.value||loading.value||documentLoading.value)
const documentReady=computed(()=>{revision.value;const view=document.value;return view?.requestState===RequestState.Loaded&&!view.loadingError&&view.rows.length===1})
const documentError=computed(()=>{revision.value;return document.value?.loadingError?.message??''})
const queryError=computed(()=>{revision.value;return catalog.value?.loadingError?.message??''})
const unconfirmed=computed(()=>{revision.value;return document.value?.hasUnconfirmedSave===true})
const hasPending=computed(()=>{revision.value;const view=document.value;return inputPending.value||acting.value||unconfirmed.value||view?.hasEditingChanges()===true||view?.dirtyTracking.hasPendingChanges()===true})
useSystemPageDirtySource({get isDirty(){return busy.value||hasPending.value}})
onBeforeRouteLeave(()=>!hasPending.value&&!busy.value)
onBeforeRouteUpdate(()=>!hasPending.value&&!busy.value)
const fields=computed<SparkNode[]>(()=>[
 {type:'r-text',props:{field:'name',label:'名称',readonly:true,width:220}},
 {type:'r-text',props:{field:'description',label:'描述',readonly:true,width:300}},
 {type:'r-select',props:{field:'createuser',label:'创建人',readonly:true,optionDataViewKey:buildDataViewKey('Base_UserInfo','default',scenarioId.value)}},
 {type:'r-text',props:{field:'createtime',label:'创建时间',readonly:true}},
])
const toolbar=computed<SparkComponent.RToolbarProps>(()=>({children:[
 {type:'r-button',props:{label:'内容编辑',disabled:!selected.value||busy.value||hasPending.value,onClick:openContent}},
 {type:'r-button',props:{label:'刷新',disabled:busy.value||hasPending.value,onClick:refreshCatalog}},
]}))
function closeDocument(open:boolean):void{
 if(open||busy.value||hasPending.value)return
 const view=document.value;document.value=undefined;documentGeneration++;inputPending.value=false
 if(view)view.dataTable?.destroyView(view.viewId)
}
function choose(row:DataRow):void{if(busy.value||hasPending.value)return;closeDocument(false);catalog.value?.setSelectedRows([row])}
async function openContent():Promise<void>{
 if(busy.value||hasPending.value||!dataSet.value||!selected.value)return
 closeDocument(false);const own=++documentGeneration;openingDocument.value=true;error.value=''
 try{
  const view=LowcodeJsonData.openDocument(dataSet.value,selected.value);document.value=view;await view.refresh()
  if(!active||own!==documentGeneration){view.dataTable?.destroyView(view.viewId);return}
 }catch(cause){if(active&&own===documentGeneration)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===documentGeneration)openingDocument.value=false}
}
async function saveContent():Promise<void>{
 if(busy.value||inputPending.value||!documentReady.value||!dataSet.value||!document.value)return
 const view=document.value,own=documentGeneration;acting.value=true;error.value=''
 try{const result=await dataSet.value.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]});if(!result.success)throw new Error(result.message??'保存未完整确认')}
 catch(cause){if(active&&own===documentGeneration)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===documentGeneration){acting.value=false;revision.value++}}
}
function cancelContent():void{if(busy.value||unconfirmed.value||!documentReady.value)return;try{document.value?.discardPendingChanges();error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function discardAndClose():void{cancelContent();if(!hasPending.value)closeDocument(false)}
async function refreshCatalog():Promise<void>{if(busy.value||hasPending.value)return;closeDocument(false);try{await catalog.value?.refresh()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
watch(scenarioId,async id=>{
 const own=++generation;ready.value=false;opening.value=true;error.value='';off?.();documentGeneration++;document.value=undefined;catalog.value=undefined;dataSet.value=undefined;sparkRemove(PAGE_RUNTIME);runtime?.dispose();runtime=undefined
 try{
  if(!id)throw new Error('JSON数据入口缺少导航数据空间ID')
  const page=new PageRuntime({pageId:'json-data-page',scenarioIds:[id],loadScenario:()=>LowcodeJsonData.loadCatalog(id)});runtime=page;await page.load()
  if(!active||own!==generation){page.dispose();return}
  dataSet.value=page.getDataSet(id);catalog.value=dataSet.value?.getView(LowcodeJsonData.catalogMetaName)
  if(!dataSet.value||!catalog.value)throw new Error('JSON正式目录视图缺失')
  const changed=()=>revision.value++;off=dataSet.value.onAnyViewChange({rowsChanged:changed,selectedRowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed})
  sparkProvide(PAGE_RUNTIME,page);ready.value=true;dataSet.value.triggerAutoLoad()
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)opening.value=false}
},{immediate:true})
onBeforeUnmount(()=>{active=false;generation++;documentGeneration++;off?.();sparkRemove(PAGE_RUNTIME);runtime?.dispose()})
</script>
<style scoped>
.json-data-page{display:grid;gap:16px;padding:24px}
.json-data-page h1{margin:0;font-size:1.25rem}
</style>
