<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page
-->
<template>
  <SparkPageRenderer v-if="catalogToolRuntime && catalogHost" :page-runtime="catalogToolRuntime" :route-snapshot="routeSnapshot" :host="catalogHost" />
  <RendererSection v-else title="Excel 导入配置" :bordered="false"
    :status="loading ? '正在读取导入目录…' : ''" :error="error" />
  <template v-if="ready">
      <RendererDialog v-if="designTarget" :model-value="true" title="Excel 导入方案设计" :data-view-key="catalogKey"
        :width="1560" :destroy-on-close="true" :close-disabled="designPending" @update:model-value="closeDesign">
        <ExcelEditor ref="designPage" :scheme-rowid="designTarget" />
        <template #footer>
          <RendererButton v-if="designPage?.hasPending" label="放弃修改并关闭" :disabled="designPage?.busy || designPage?.unconfirmed" @click="discardDesign" />
          <RendererButton label="关闭" :disabled="designPending" @click="closeDesign(false)" />
        </template>
      </RendererDialog>
  </template>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute} from 'vue-router'
import {buildDataViewKey,RequestState,type DataRow,type DataView} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {APPLICATION_CATALOG_PROJECT_ID, resolveExecutionProjectId} from '@/services/application-scope'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {startExcelSchemeCreation,saveExcelSchemeCreation,cancelExcelSchemeCreation,readExcelSchemeCreation,endExcelSchemeCreation} from '@/lowcode/resources/semi-structured/excel-import/catalog/creation'
import {selectExcelTemplate,cancelExcelTemplate,saveExcelTemplate,readExcelTemplate,retainExcelTemplate} from '@/lowcode/resources/semi-structured/excel-import/catalog/template'
import ExcelEditor from './excel-import-editor-page.vue'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {PageTool,type PageRuntime} from '@spark-appworks/spark-project-model'
import rule from './rule.json?raw'
import script from './script.js?raw'
import style from './style.css?raw'

const {PAGE_RUNTIME,RendererSection,RendererDialog,RendererButton,SparkPageRenderer,useSparkComponent,consumeRequiredPageService}=SparkComponent
const route = useRoute()
const routeSnapshot=computed(()=>{
  const {path,fullPath,name,params,query,hash}=route
  return {path,fullPath,name:name??null,params,query,hash}
})
const catalogToolRuntime=shallowRef<PageRuntime>()
const designTarget = ref('')
const designPage = ref<{hasPending: boolean; busy: boolean; unconfirmed: boolean; discardChanges: () => boolean}>()
const designPending = computed(() => designPage.value?.hasPending === true || designPage.value?.busy === true)
const {sparkProvide, sparkRemove,sparkConsume} = useSparkComponent({type: 'excel-import-list-page'})
const session = new NativePageRuntimeSession({
  provide: () => undefined,
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const pageService=consumeRequiredPageService(sparkConsume,'excel-import-list-page')
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
const selected= computed(() => {
  revision.value
  const target=view.value
  return target?.selectedRows.length===1 ? target.selectedRows[0] : undefined
})
function designId(row:DataRow|undefined):string|undefined {
  const target=view.value
  if(!target||!row||target.editActionState(row)!=='enabled'||target.fieldAccess(row,'rowid').read!=='visible')return undefined
  const id=target.getPkKey(row)
  return typeof id==='string'&&id&&row['rowid']===id?id:undefined
}
const projectId = computed(() => resolveExecutionProjectId(route.path))
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeExcelImport.catalogMetaName, 'default', scenarioId.value))
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
 const target=view.value,ds=target?.dataSet,id=editingId.value,own=generation
 if(!target||!ds||typeof id!=='string'||acting.value||unconfirmed.value||templateDispatched.value||!pageService?.browseFiles)return
 acting.value=true;error.value=''
 try{
  const row=target.rows.find(candidate=>target.getPkKey(candidate)===id)
  if(!row)throw new Error('模板原方案已失效，请重新打开')
  const assertOriginal=target.dirtyTracking.isPendingCreate(id)
   ? ()=>{if(!target.rows.includes(row)||!target.dirtyTracking.isPendingCreate(id))throw new Error('模板原方案草稿已失效')}
   : target.captureReadRow(row,['templatePath'])
  assertOriginal()
  const files=await pageService.browseFiles({title:'选择Excel模板',accept:'.xls,.xlsx',multiple:false})
  if(!active||own!==generation||editingId.value!==id||files.length===0)return
  if(files.length!==1)throw new Error('每次只能选择一个 Excel 模板')
  assertOriginal()
  selectExcelTemplate(ds,id,files[0]!.file)
 }
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
  const source=row??selected.value,target=view.value,id=designId(source)
  if(!target||!source||!id)return
  try{target.captureReadRow(source,['rowid'])();designTarget.value=id}
  catch{error.value='方案身份不可读或原查询已失效'}
}
function closeDesign(open: boolean): void {
  if (!open && !designPending.value) designTarget.value = ''
}
function discardDesign(): void {
  if (designPage.value?.busy || designPage.value?.unconfirmed) return
  if (designPage.value?.discardChanges() === true) closeDesign(false)
}
function makeCatalogHost(runtime:PageRuntime,editable:boolean){
  const assertCurrent=()=>{if(!active||!session.isCurrent(runtime))throw new Error('Excel 目录运行实例已失效')}
  return {runtime,assertCurrent,async invoke(command:string,input:unknown){
    assertCurrent()
    if(command==='excel.catalog.connect')return {
      editable, locked:()=>locked.value, selected:()=>!!designId(selected.value), canCopy:()=>!!pageService?.copyText,
      error:()=>error.value,
      creationRetained:()=>creation.value?.phase==='retained',
      editState:()=>({
        id:editingId.value, creating:creating.value, acting:acting.value, pending:pending.value,
        unconfirmed:unconfirmed.value, creationSaved:creationSaved.value, templatePending:templatePending.value,
        templateDispatched:templateDispatched.value, canBrowse:!!pageService?.browseFiles,
        template:templateUpload.value,
      }),
    }
    if(editable&&editingId.value!==undefined){
      if(command==='excel.catalog.saveEdit'){await saveEdit();return}
      if(command==='excel.catalog.cancelEdit'){cancelEdit();return}
      if(command==='excel.catalog.closeEdit'){closeEdit(false);return}
      if(command==='excel.catalog.chooseTemplate'){await chooseTemplate();return}
      if(command==='excel.catalog.cancelTemplate'){cancelTemplate();return}
      if(command==='excel.catalog.uploadTemplate'){await uploadTemplate();return}
      if(command==='excel.catalog.retainTemplate'){await retainTemplate();return}
      if(command==='excel.catalog.endCreation'){await endCreation();return}
    }
    if(!editable||locked.value)return
    if(command==='excel.catalog.create'){await createScheme();return}
    if(command==='excel.catalog.openSelected'){openEditor();return}
    const target=view.value
    const row=target?.rows.find(record=>target.getPkKey(record)===input)
    if(!row)return
    if(command==='excel.catalog.select')choose(row)
    else if(command==='excel.catalog.copy')await copyKey(row)
    else if(command==='excel.catalog.design')openEditor(row)
    else if(command==='excel.catalog.edit')editRow(row)
    return undefined
  }}
}
const catalogHost=shallowRef<ReturnType<typeof makeCatalogHost>>()

watch([scenarioId, projectId], async ([id, project]) => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  editingId.value=undefined;acting.value=false;designTarget.value=''
  unsubscribe?.(); view.value = undefined
  catalogToolRuntime.value=undefined
  catalogHost.value=undefined
  session.dispose()
  try {
    if (!id) throw new Error('Excel 导入入口缺少导航绑定的数据空间ID')
    const targetId=project===undefined?id:`${project}:${id}`
    const inCatalog=project===APPLICATION_CATALOG_PROJECT_ID
    const tool=new PageTool({pageId:'excel-import-list-page'})
    tool.hydrateFileText('rule.json',rule)
    tool.hydrateFileText('script.js',script)
    tool.hydrateFileText('style.css',style)
    tool.markLoaded()
    const current=session.acquire({tool,scenarioIds:[id],targetId,
      loadScenario:scenario=>LowcodeExcelImport.loadCatalog(scenario,project)})
    if(inCatalog){
      catalogHost.value=makeCatalogHost(current,false)
      catalogToolRuntime.value=current
      return
    }
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    const dataSet=current.getDataSet(id)
    if(!dataSet)throw new Error('Excel 正式目录场景缺失')
    view.value = dataSet.getView(LowcodeExcelImport.catalogMetaName, 'default')
    const changed=()=>revision.value++
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged:changed,rowsChanged:changed,editingChanged:changed,mutatingChanged:changed,requestStateChanged:changed})
    if (active && own === generation && session.isCurrent(current)) {sparkProvide(PAGE_RUNTIME, current); catalogHost.value=makeCatalogHost(current,true); catalogToolRuntime.value=current; ready.value = true}
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>
