<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page
-->
<template>
  <section class="structured-catalog-page">
    <header><h1>Excel 导入配置</h1><p>导入方案目录；Sheet 布局与转换规则在编辑器中维护。</p></header>
    <p v-if="loading" role="status">正在读取导入目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="creation?.phase === 'retained'" role="status">方案已保留；编码处理未标记完成，请核查正式结果。</p>
    <template v-if="ready">
      <RendererTable :data-view-key="catalogKey" :children="fields" :toolbar="toolbar" :actions="actions" :filter="filter" :stripe="true"
        :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
      <RendererDialog v-if="editingId !== undefined" :data-view-key="catalogKey" :model-value="true" :title="creating ? '新增方案' : '编辑方案'"
        :width="760" :destroy-on-close="true" :close-disabled="acting || pending || unconfirmed || creationSaved || templatePending" @update:model-value="closeEdit">
        <p v-if="unconfirmed" role="status">保存结果尚未确认，请核验原保存；不会重复提交。</p>
        <p v-else-if="creationSaved" role="status">方案已保存，请继续完成原方案的编码处理。</p>
        <RendererForm :key="editingId" :context-row-id="editingId" :data-view-key="catalogKey" :children="editorFields"
          :grid-columns="1" label-width="88px" :show-data-view-meta="false" />
        <RendererButton label="选择模板" :data-view-key="catalogKey" :disabled="acting || unconfirmed || templateDispatched || !pageService?.browseFiles" @click="chooseTemplate" />
        <p v-if="templateUpload" role="status">模板：{{ templateUpload.name }}；{{ templateUpload.phase === 'retained' ? '文件已保留，尚未发布' : templateUpload.phase === 'complete' ? '已保存' : templateDispatched ? '正在确认文件及方案路径' : '已选择，尚未上传' }}</p>
        <RendererButton v-if="templateUpload?.phase === 'selected'" label="取消选择" :data-view-key="catalogKey" :disabled="acting" @click="cancelTemplate" />
        <p v-if="templateUpload?.phase === 'retained'" role="status">未发布文件：{{ templateUpload.retainedPath }}</p>
        <RendererButton v-if="templateUpload?.phase === 'publication' && !templateUpload.unconfirmed" label="保留文件并结束" :data-view-key="catalogKey" :disabled="acting" @click="retainTemplate" />
        <RendererButton v-if="templateUpload && templateUpload.phase !== 'complete' && templateUpload.phase !== 'retained'" :label="templateUpload.unconfirmed ? '核验原模板结果' : '确认上传模板'" :data-view-key="catalogKey"
          :disabled="acting || pending || creationSaved || creating || (!templateUpload.unconfirmed && unconfirmed)" @click="uploadTemplate" />
        <template #footer>
          <RendererButton :label="unconfirmed ? '核验保存结果' : creationSaved ? '继续完成新增' : '保存方案'" :disabled="acting || templateDispatched" @click="saveEdit" />
          <RendererButton :label="templateUpload?.phase === 'complete' || templateUpload?.phase === 'retained' ? '关闭' : '取消修改'" :disabled="acting || unconfirmed || creationSaved || (templateDispatched && templateUpload?.phase !== 'upload')" @click="cancelEdit" />
          <RendererButton v-if="creationSaved" label="保留方案并结束" :disabled="acting || unconfirmed" @click="endCreation" />
        </template>
      </RendererDialog>
      <RendererDialog v-if="designTarget" :model-value="true" title="Excel 导入方案设计" :data-view-key="catalogKey"
        :width="1560" :destroy-on-close="true" :close-disabled="designPending" @update:model-value="closeDesign">
        <ExcelEditor ref="designPage" :scheme-rowid="designTarget" />
        <template #footer>
          <RendererButton v-if="designPage?.hasPending" label="放弃修改并关闭" :disabled="designPage?.busy || designPage?.unconfirmed" @click="discardDesign" />
          <RendererButton label="关闭" :disabled="designPending" @click="closeDesign(false)" />
        </template>
      </RendererDialog>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute} from 'vue-router'
import {buildDataViewKey,RequestState,type DataRow,type DataView,type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import type {RToolbarProps,RFilterProps} from '@spark-appworks/spark-component'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {startExcelSchemeCreation,saveExcelSchemeCreation,cancelExcelSchemeCreation,readExcelSchemeCreation,endExcelSchemeCreation} from '@/lowcode/resources/semi-structured/excel-import/catalog/creation'
import {selectExcelTemplate,cancelExcelTemplate,saveExcelTemplate,readExcelTemplate,retainExcelTemplate} from '@/lowcode/resources/semi-structured/excel-import/catalog/template'
import ExcelEditor from './excel-import-editor-page.vue'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'

const {PAGE_RUNTIME,PAGE_SERVICE,RendererTable,RendererDialog,RendererForm,RendererButton,useSparkComponent}=SparkComponent
const route = useRoute()
const designTarget = ref('')
const designPage = ref<{hasPending: boolean; busy: boolean; unconfirmed: boolean; discardChanges: () => boolean}>()
const designPending = computed(() => designPage.value?.hasPending === true || designPage.value?.busy === true)
const {sparkProvide, sparkRemove,sparkConsume} = useSparkComponent({type: 'excel-import-list-page'})
const session = new NativePageRuntimeSession({
  provide: () => undefined,
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const pageService=sparkConsume(PAGE_SERVICE)
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const editingId=ref<string|number>(),acting=ref(false)
const creation=computed(()=>{revision.value;const ds=view.value?.dataSet;return ds?readExcelSchemeCreation(ds):undefined})
const templateUpload=computed(()=>{revision.value;const ds=view.value?.dataSet;return ds?readExcelTemplate(ds):undefined})
const templateDispatched=computed(()=>!!templateUpload.value&&templateUpload.value.phase!=='selected'&&templateUpload.value.phase!=='complete'&&templateUpload.value.phase!=='retained')
const templatePending=computed(()=>!!templateUpload.value&&templateUpload.value.phase!=='complete'&&templateUpload.value.phase!=='retained')
const creating=computed(()=>creation.value!==undefined&&creation.value.phase!=='complete'&&creation.value.phase!=='retained')
const creationSaved=computed(()=>creating.value&&creation.value?.phase!=='input')
const pending=computed(()=>{revision.value;return view.value?.hasEditingChanges()===true||view.value?.dirtyTracking.hasPendingChanges()===true})
const unconfirmed=computed(()=>{revision.value;return view.value?.hasUnconfirmedSave===true||creation.value?.unconfirmed===true||templateUpload.value?.unconfirmed===true})
const querying=computed(()=>{revision.value;return loading.value||view.value?.requestState===RequestState.Loading||view.value?.requestState===RequestState.Preparing})
const locked=computed(()=>querying.value||acting.value||editingId.value!==undefined||pending.value||unconfirmed.value||!!designTarget.value)
useSystemPageDirtySource({get isDirty(){return acting.value||pending.value||unconfirmed.value||designPending.value||creating.value||templatePending.value}})
onBeforeRouteLeave(()=>!acting.value&&!pending.value&&!unconfirmed.value&&!designPending.value&&!creating.value&&!templatePending.value)
onBeforeRouteUpdate(()=>!acting.value&&!pending.value&&!unconfirmed.value&&!designPending.value&&!creating.value&&!templatePending.value)
let unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const row = view.value?.selectedRows[0]
  const id = row && view.value?.selectedRows.length === 1 ? view.value.getPkKey(row) : undefined
  return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeExcelImport.catalogMetaName, 'default', scenarioId.value))
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type:'r-button',props:{label:'新增方案',permAction:'create',disabled:locked.value,onClick:createScheme}},
  {type: 'r-button', props: {label: '打开设计', disabled: !selected.value || locked.value, onClick: () => openEditor()}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh',disabled:locked.value}},
]}))
const actions=computed<RToolbarProps>(()=>({children:[
  {type:'r-button',props:{label:'复制KEY',disabled:locked.value||!pageService?.copyText,onClick:copyKey}},
  {type:'r-button',props:{label:'设计',permAction:'edit',disabled:locked.value,onClick:(row:DataRow)=>openEditor(row)}},
  {type:'r-button',props:{label:'编辑',permAction:'edit',disabled:locked.value,onClick:editRow}},
]}))
const filter=computed<RFilterProps>(()=>({autoQuery:false,children:[
  {type:'r-text',props:{field:'coding',label:'方案编码',placeholder:'按编码搜索'}},
  {type:'r-text',props:{field:'solutionName',label:'方案名称',placeholder:'按名称搜索'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'coding', label: '方案编码', width: 180}},
  {type: 'r-text', props: {field: 'solutionName', label: '方案名称', width: 240}},
  {type: 'r-select', props: {field: 'dataSetId', label: '数据空间', width: 200,
    optionDataViewKey: buildDataViewKey('Base_DataSet', 'default', scenarioId.value)}},
  {type: 'r-text', props: {field: 'description', label: '描述', width: 300}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
  {type:'r-text',props:{field:'createtime',label:'创建时间',width:140}},
])
const editorFields=computed<SparkNode[]>(()=>[
  {type:'r-text',props:{field:'solutionName',label:'方案名称',maxlength:200,readonly:acting.value||unconfirmed.value||creationSaved.value||templateDispatched.value}},
  {type:'r-select',props:{field:'dataSetId',label:'数据空间',optionDataViewKey:buildDataViewKey('Base_DataSet','default',scenarioId.value),readonly:acting.value||unconfirmed.value||creationSaved.value||templateDispatched.value}},
  {type:'r-text',props:{field:'templatePath',label:'文件路径',readonly:true}},
  {type:'r-textarea',props:{field:'description',label:'备注',maxlength:500,showWordLimit:true,readonly:acting.value||unconfirmed.value||creationSaved.value||templateDispatched.value}},
])
async function createScheme():Promise<void>{
 const ds=view.value?.dataSet,own=generation;if(!ds||locked.value)return
 acting.value=true;error.value=''
 try{const id=await startExcelSchemeCreation(ds);if(active&&own===generation)editingId.value=id}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function choose(row:DataRow):void{if(!locked.value)view.value?.setSelectedRows([row])}
async function copyKey(row:DataRow):Promise<void>{
 const target=view.value,own=generation;if(!target||locked.value||!pageService?.copyText)return
 acting.value=true;error.value=''
 let requested=false
 try{
  if(target.fieldAccess(row,'rowid').read!=='visible'||typeof row['rowid']!=='string'||!row['rowid'])throw Error('方案KEY不可读')
  const check=target.captureReadRow(row,['rowid']),id=row['rowid'];check()
  requested=true;await pageService.copyText(id)
  if(active&&own===generation)pageService.showMessage(`已复制 KEY：${id}`,'success')
 }catch{if(active&&own===generation)error.value=requested?'复制失败，请手动复制':'方案KEY不可读或原查询已失效'}
 finally{if(active&&own===generation)acting.value=false}
}
function editRow(row:DataRow):void{
  const target=view.value,id=target?.getPkKey(row)
  if(!target||id===undefined||locked.value||target.editActionState(row)!=='enabled')return
  editingId.value=id;error.value=''
}
async function saveEdit():Promise<void>{
  const target=view.value,id=editingId.value,current=session.runtime?.getDataSet(scenarioId.value),own=generation
  if(!target||id===undefined||!current||acting.value)return
  acting.value=true;error.value=''
  try{
   if(creating.value){await saveExcelSchemeCreation(current);if(readExcelSchemeCreation(current)?.phase!=='complete')return;await target.refresh();if(target.loadingError)throw target.loadingError}
   else{const result=await current.saveChanges({views:[{tableName:target.tableName,viewId:target.viewId,ids:[id]}]});if(!result.success)throw Error(result.message??'方案保存未完整确认')}
   if(active&&own===generation&&!templatePending.value){cancelExcelTemplate(current);editingId.value=undefined}
  }
  catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function cancelEdit():void{if(acting.value||unconfirmed.value||creationSaved.value||templateDispatched.value&&templateUpload.value?.phase!=='upload'||editingId.value===undefined)return;try{const ds=view.value?.dataSet;if(ds)cancelExcelTemplate(ds);if(creating.value&&ds)cancelExcelSchemeCreation(ds);else view.value?.discardPendingChanges([editingId.value]);editingId.value=undefined;error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function chooseTemplate():Promise<void>{
 const ds=view.value?.dataSet,id=editingId.value,own=generation
 if(!ds||typeof id!=='string'||acting.value||unconfirmed.value||templateDispatched.value||!pageService?.browseFiles)return
 acting.value=true;error.value=''
 try{const files=await pageService.browseFiles({title:'选择Excel模板',accept:'.xls,.xlsx',multiple:false});if(active&&own===generation&&editingId.value===id&&files[0])selectExcelTemplate(ds,id,files[0].file)}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function cancelTemplate():void{const ds=view.value?.dataSet;if(!ds||acting.value)return;try{cancelExcelTemplate(ds);revision.value++;error.value=''}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function uploadTemplate():Promise<void>{
 const ds=view.value?.dataSet,own=generation;if(!ds||acting.value||pending.value||creating.value)return
 acting.value=true;error.value=''
 try{await saveExcelTemplate(ds);if(readExcelTemplate(ds)?.phase==='complete'){await view.value?.refresh();if(view.value?.loadingError)throw view.value.loadingError}}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
async function retainTemplate():Promise<void>{
 const ds=view.value?.dataSet,own=generation;if(!ds||acting.value||unconfirmed.value)return
 acting.value=true;error.value=''
 try{await retainExcelTemplate(ds)}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
async function endCreation():Promise<void>{
 const ds=view.value?.dataSet,own=generation;if(!ds||acting.value||unconfirmed.value)return
 acting.value=true;error.value=''
 try{await endExcelSchemeCreation(ds);if(active&&own===generation&&!templatePending.value){const ds=view.value?.dataSet;if(ds)cancelExcelTemplate(ds);editingId.value=undefined}}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function closeEdit(open:boolean):void{if(!open&&!acting.value&&!pending.value&&!unconfirmed.value&&!creating.value&&!templatePending.value){const ds=view.value?.dataSet;if(ds)cancelExcelTemplate(ds);editingId.value=undefined}}
function openEditor(row?:DataRow):void {
  if(locked.value)return
  const id=row&&view.value?view.value.getPkKey(row):selected.value
  if(typeof id==='string'&&id)designTarget.value=id
}
function closeDesign(open: boolean): void {
  if (!open && !designPending.value) designTarget.value = ''
}
function discardDesign(): void {
  if (designPage.value?.busy || designPage.value?.unconfirmed) return
  if (designPage.value?.discardChanges() === true) closeDesign(false)
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  editingId.value=undefined;acting.value=false;designTarget.value=''
  unsubscribe?.(); view.value = undefined
  session.dispose()
  try {
    if (!id) throw new Error('Excel 导入入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeExcelImport.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    const current = session.acquire({pageId: 'excel-import-list-page', scenarioIds: [id], targetId: id,
      loadScenario: async () => dataSet})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    view.value = dataSet.getView(LowcodeExcelImport.catalogMetaName, 'default')
    const changed=()=>revision.value++
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged:changed,rowsChanged:changed,editingChanged:changed,mutatingChanged:changed,requestStateChanged:changed})
    if (active && own === generation && session.isCurrent(current)) {sparkProvide(PAGE_RUNTIME, current); ready.value = true}
    dataSet.triggerAutoLoad()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
.structured-catalog-page header h1 { margin: 0; font-size: 1.25rem; }
</style>
