<!--
@module app:views/features/data-platform/semi-structured/json-data/ui/json-data-page
-->
<template>
 <RendererSection class="json-data-page" title="JSON 文件数据管理" :bordered="false" :grid-columns="1" :grid-gap="16"
  :status="loading ? '正在读取目录…' : ''" :error="document ? '' : error">
  <template v-if="ready" #header-actions>
   <RendererButton label="新增" button-type="primary" icon="Plus" :disabled="addBlocked" @click="createDocument()" />
   <RendererButton :label="catalogUnconfirmed ? '核验目录保存结果' : '保存'" icon="Check" :disabled="busy || !!document || !catalogPending" @click="saveCatalog" />
   <RendererButton label="取消" icon="Close" :disabled="busy || !!document || catalogUnconfirmed || !catalogPending" @click="cancelCatalog" />
   <RendererButton label="导入JSON" icon="Upload" :disabled="addBlocked || !pageService?.browseFiles" @click="importDocument" />
  </template>
  <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :actions="rowActions" :highlight-current-row="true" :on-row-click="choose"
   :stripe="true" :border="true" :show-row-index="true" :show-data-view-meta="false" :action-column="{label: '操作', width: 180, fixed: true}" />
  <RendererDialog v-if="document" :model-value="true" title="JSON 编辑" :data-view-key="contentKey" :width="1180" :close-disabled="busy || hasPending" :destroy-on-close="true" @update:model-value="closeDocument">
   <DisplayAlert v-if="documentLoading" alert-type="info" :closable="false" title="正在读取内容…" />
   <DisplayAlert v-if="error" alert-type="error" :closable="false" :title="error" />
   <DisplayAlert v-if="documentError" alert-type="error" :closable="false" :title="documentError" />
   <DisplayAlert v-if="unconfirmed" alert-type="warning" :closable="false" title="保存结果尚未确认，请通过原保存入口核验。" />
   <DisplayAlert v-if="creating && creationFileCommitted && !unconfirmed" alert-type="warning" :closable="false" title="文件已确认，目录尚未确认，请继续保存或核验。" />
   <RendererForm v-if="creating" :key="creating" :context-row-id="creating" :data-view-key="catalogKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
    <FieldText :data-view-key="catalogKey" field="name" label="名称" placeholder="请输入文件名称" :maxlength="200" :readonly="busy || catalogUnconfirmed" />
    <FieldText :data-view-key="catalogKey" field="description" label="摘要" placeholder="请输入摘要" :maxlength="500" :readonly="busy || catalogUnconfirmed" />
   </RendererForm>
   <RendererForm v-if="documentReady" :key="`${contentKey}:${contentSession}`" v-bind="contentRowBinding" :data-view-key="contentKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
    <FieldJson :data-view-key="contentKey" field="content" label="JSON 内容" mode="tree" :readonly="busy || unconfirmed || creationFileCommitted" :on-editing-change="value => inputPending=value" />
   </RendererForm>
   <template #footer>
    <RendererButton :label="creating && catalogUnconfirmed ? '核验目录保存结果' : unconfirmed ? '核验内容保存结果' : creating ? '创建JSON' : '保存内容'" :disabled="busy || inputPending || !documentReady" @click="saveContent" />
    <RendererButton :label="creating ? '取消新增' : '取消修改'" :disabled="busy || unconfirmed || creationFileCommitted || (!creating && !documentReady)" @click="cancelContent" />
    <RendererButton v-if="hasPending && !creating" label="放弃修改并关闭" :disabled="busy || unconfirmed" @click="discardAndClose" />
    <RendererButton label="关闭" :disabled="busy || hasPending" @click="closeDocument(false)" />
   </template>
  </RendererDialog>
 </RendererSection>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,toRaw,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute} from 'vue-router'
import {buildDataViewKey,RequestState,type DataRow,type DataSet,type DataView,type SparkNode} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeJsonData} from '@/lowcode/resources/semi-structured/json-data/resource'
const {PAGE_RUNTIME,RendererSection,RendererTable,RendererForm,RendererDialog,RendererButton,FieldJson,FieldText,DisplayAlert,useSparkComponent,consumeRequiredPageService}=SparkComponent
const route=useRoute(),{sparkProvide,sparkRemove,sparkConsume}=useSparkComponent({type:'json-data-page'})
const session=new NativePageRuntimeSession({
  provide:()=>undefined,
  remove:()=>sparkRemove(PAGE_RUNTIME),
})
const pageService=consumeRequiredPageService(sparkConsume,'json-data-page')
const scenarioId=computed(()=>typeof route.meta['blueprintScenarioId']==='string'?route.meta['blueprintScenarioId']:'')
const catalogKey=computed(()=>buildDataViewKey(LowcodeJsonData.catalogMetaName,'default',scenarioId.value))
const dataSet=shallowRef<DataSet>(),catalog=shallowRef<DataView>(),document=shallowRef<DataView>(),opening=ref(false),openingDocument=ref(false),ready=ref(false),acting=ref(false),inputPending=ref(false),error=ref(''),revision=ref(0)
const creating=ref('')
const importing=ref(false)
const contentSession=ref(0)
let off:(()=>void)|undefined,generation=0,documentGeneration=0,active=true
const selected=computed(()=>{revision.value;const rows=catalog.value?.selectedRows??[],row=rows[0];return rows.length===1&&row?String(catalog.value?.getPkKey(row)??''):''})
const contentKey=computed(()=>document.value?buildDataViewKey(document.value.tableName,document.value.viewId,scenarioId.value):'')
const contentRowBinding=computed(()=>{const id=document.value?.queryContext['jsonId'];return typeof id==='string'?{contextRowId:id}:{}})
const requestPending=(view:DataView|undefined)=>view?.requestState===RequestState.Preparing||view?.requestState===RequestState.Loading
const loading=computed(()=>{revision.value;return opening.value||requestPending(catalog.value)})
const documentLoading=computed(()=>{revision.value;return openingDocument.value||requestPending(document.value)})
const busy=computed(()=>importing.value||acting.value||loading.value||documentLoading.value)
const documentReady=computed(()=>{revision.value;const view=document.value;return view?.requestState===RequestState.Loaded&&!view.loadingError&&view.rows.length===1})
const documentError=computed(()=>{revision.value;return document.value?.loadingError?.message??''})
const unconfirmed=computed(()=>{revision.value;return document.value?.hasUnconfirmedSave===true})
const catalogUnconfirmed=computed(()=>{revision.value;return catalog.value?.hasUnconfirmedSave===true})
const creationFileCommitted=computed(()=>{revision.value;const view=document.value;return !!creating.value&&!!view&&(view.hasUnconfirmedSave||(view.rows.length===1&&!view.dirtyTracking.isPendingCreate(creating.value)))})
const catalogPending=computed(()=>{revision.value;return catalogUnconfirmed.value||catalog.value?.hasEditingChanges()===true||catalog.value?.dirtyTracking.hasPendingChanges()===true})
const hasPending=computed(()=>{revision.value;const view=document.value;return catalogPending.value|| inputPending.value||acting.value||unconfirmed.value||view?.hasEditingChanges()===true||view?.dirtyTracking.hasPendingChanges()===true})
useSystemPageDirtySource({get isDirty(){return busy.value||hasPending.value}})
onBeforeRouteLeave(()=>!hasPending.value&&!busy.value)
onBeforeRouteUpdate(()=>!hasPending.value&&!busy.value)
const cellLocked=computed(()=>busy.value||!!document.value||catalogUnconfirmed.value)
const fields=computed<SparkNode[]>(()=>[
 {type:'r-text',props:{field:'name',label:'名称',placeholder:'请输入文件名称',maxlength:200,showCellControl:true,readonly:cellLocked.value,minWidth:220,showOverflowTooltip:true}},
 {type:'r-text',props:{field:'description',label:'摘要',placeholder:'请输入摘要',maxlength:500,showCellControl:true,readonly:cellLocked.value,minWidth:260,showOverflowTooltip:true}},
 {type:'r-text',props:{field:'path',label:'文件地址',readonly:true,minWidth:280,showOverflowTooltip:true}},
 {type:'r-select',props:{field:'createuser',label:'创建人',readonly:true,width:140,optionDataViewKey:buildDataViewKey('Base_UserInfo','default',scenarioId.value)}},
 {type:'r-text',props:{field:'createtime',label:'创建时间',readonly:true,width:140}},
])
const addBlocked=computed(()=>busy.value||hasPending.value||!!document.value||catalog.value?.addActionState()!=='enabled')
const rowActions=computed<SparkComponent.RToolbarProps>(()=>({children:[
 {type:'r-button',props:{label:'编辑文件',link:true,buttonType:'primary',disabled:busy.value||hasPending.value,onClick:(row:unknown)=>editFile(row)}},
]}))
/** 行内“编辑文件”先按原目录选中该行，新增草稿须先保存目录再编辑文件内容。 */
function editFile(row:unknown):void{
 const view=catalog.value,original=view?.rows.find(item=>item===toRaw(row))
 if(!view||!original||busy.value||hasPending.value)return
 view.setSelectedRows([original]);void openContent()
}
async function saveCatalog():Promise<void>{
 if(busy.value||document.value||!dataSet.value||!catalog.value)return
 const current=dataSet.value,own=generation;acting.value=true;error.value=''
 try{const result=await current.saveChanges({views:[{tableName:LowcodeJsonData.catalogMetaName,viewId:'default'}]});if(!result.success)throw new Error(result.message??'目录保存未完整确认');pageService.showMessage('保存成功', 'success')}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function cancelCatalog():void{if(busy.value||document.value||catalogUnconfirmed.value)return;try{catalog.value?.discardPendingChanges();error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function closeDocument(open:boolean):void{
 if(open||busy.value||hasPending.value)return
 const view=document.value;document.value=undefined;documentGeneration++;inputPending.value=false
 if(view)view.dataTable?.destroyView(view.viewId)
}
function choose(row:DataRow):void{if(busy.value||hasPending.value)return;closeDocument(false);catalog.value?.setSelectedRows([row])}
async function importDocument():Promise<void>{
 if(busy.value||hasPending.value||document.value||!dataSet.value||catalog.value?.addActionState()!=='enabled'||!pageService?.browseFiles)return
 const current=dataSet.value,own=generation;importing.value=true;error.value=''
 try{
  const files=await pageService.browseFiles({title:'导入JSON',accept:'.json,application/json',multiple:false})
  if(!active||own!==generation||current!==dataSet.value||files.length===0)return
  if(files.length!==1)throw new Error('每次只能导入一个JSON文件')
  const file=files[0]!;const content=await file.file.text();parseJsonDocument(content)
  if(!active||own!==generation||current!==dataSet.value)return
  importing.value=false;await createDocument({name:file.file.name,content})
  if(active&&own===generation&&documentReady.value&&creating.value)await saveContent()
  if(active&&own===generation&&!creating.value&&document.value&&!hasPending.value)await refreshCatalog()
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)importing.value=false}
}
async function createDocument(initial?:Readonly<{name:string;content:string}>):Promise<void>{
 if(busy.value||hasPending.value||document.value||!dataSet.value||!catalog.value||catalog.value.addActionState()!=='enabled')return
 const current=dataSet.value,view=catalog.value,own=++documentGeneration;openingDocument.value=true;error.value=''
 try{
  await view.addRow({name:initial?.name??'',description:initial?.name??'',path:''})
  if(!active||own!==documentGeneration)return
  const row=view.dirtyTracking.pendingCreateRows[0];if(!row)throw new Error('JSON目录新增草稿缺失')
  creating.value=String(view.getPkKey(row));view.setCurrentRow(row);view.setSelectedRows([row])
  const file=LowcodeJsonData.openDocument(current,creating.value,{create:true});document.value=file;await file.refresh()
  if(!active||own!==documentGeneration||file.loadingError)return
  await file.addRow({content:initial?.content??'{}'})
  const fileRow=file.rows[0];if(fileRow)file.setCurrentRow(fileRow)
 }catch(cause){if(active&&own===documentGeneration){error.value=cause instanceof Error?cause.message:String(cause);if(!document.value&&creating.value){view.discardPendingChanges([creating.value]);creating.value=''}}}
 finally{if(active&&own===documentGeneration){openingDocument.value=false;revision.value++}}
}
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
 const view=document.value,current=dataSet.value,creatingId=creating.value,own=documentGeneration;acting.value=true;error.value=''
 try{
  if(creatingId&&!catalogUnconfirmed.value){const definition=catalog.value,draft=definition?.getEditingRow(creatingId);if(!definition||!draft)throw new Error('JSON目录新增草稿缺失');const invalid=definition.validator?.validate(draft).errors[0];if(invalid)throw new Error(invalid.message)}
  const result=await current.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]});if(!result.success)throw new Error(result.message??'保存未完整确认')
  if(!active||own!==documentGeneration||dataSet.value!==current)throw new Error('JSON创建所属页面实例已变化')
  contentSession.value++
  if(creatingId){const saved=await current.saveChanges({views:[{tableName:LowcodeJsonData.catalogMetaName,viewId:'default',ids:[creatingId]}]});if(!saved.success)throw new Error(saved.message??'目录保存未完整确认');if(active&&own===documentGeneration)creating.value=''}
  pageService.showMessage(creatingId?'保存成功':'文件保存成功', 'success')
 }
 catch(cause){if(active&&own===documentGeneration)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===documentGeneration){acting.value=false;revision.value++}}
}
function cancelContent():void{if(busy.value||unconfirmed.value||creationFileCommitted.value||(!creating.value&&!documentReady.value))return;try{document.value?.discardPendingChanges();contentSession.value++;if(creating.value){catalog.value?.discardPendingChanges([creating.value]);creating.value='';inputPending.value=false;closeDocument(false)}error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function discardAndClose():void{cancelContent();if(!hasPending.value)closeDocument(false)}
async function refreshCatalog():Promise<void>{if(busy.value||hasPending.value)return;closeDocument(false);try{await catalog.value?.refresh()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
watch(scenarioId,async id=>{
 const own=++generation;ready.value=false;opening.value=true;acting.value=false;openingDocument.value=false;importing.value=false;inputPending.value=false;error.value='';off?.();documentGeneration++;creating.value='';document.value=undefined;catalog.value=undefined;dataSet.value=undefined;session.dispose()
 try{
  if(!id)throw new Error('JSON数据入口缺少导航数据空间ID')
  const current=session.acquire({pageId:'json-data-page',scenarioIds:[id],targetId:id,loadScenario:()=>LowcodeJsonData.loadCatalog(id)})
  await current.load()
  if(!active||own!==generation||!session.isCurrent(current))return
  dataSet.value=current.getDataSet(id);catalog.value=dataSet.value?.getView(LowcodeJsonData.catalogMetaName)
  if(!dataSet.value||!catalog.value)throw new Error('JSON正式目录视图缺失')
  const changed=()=>revision.value++;off=dataSet.value.onAnyViewChange({rowsChanged:changed,selectedRowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed})
  if(active&&own===generation&&session.isCurrent(current)){sparkProvide(PAGE_RUNTIME,current);ready.value=true}
  dataSet.value.triggerAutoLoad()
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)opening.value=false}
},{immediate:true})
onBeforeUnmount(()=>{active=false;generation++;documentGeneration++;off?.();session.dispose()})
</script>
<style scoped>
.json-data-page{padding:8px}
</style>
