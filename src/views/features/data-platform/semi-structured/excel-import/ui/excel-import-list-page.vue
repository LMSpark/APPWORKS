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
        :width="760" :destroy-on-close="true" :close-disabled="acting || pending || unconfirmed || creationSaved" @update:model-value="closeEdit">
        <p v-if="unconfirmed" role="status">保存结果尚未确认，请核验原保存；不会重复提交。</p>
        <p v-else-if="creationSaved" role="status">方案已保存，请继续完成原方案的编码处理。</p>
        <RendererForm :key="editingId" :context-row-id="editingId" :data-view-key="catalogKey" :children="editorFields"
          :grid-columns="1" label-width="88px" :show-data-view-meta="false" />
        <template #footer>
          <RendererButton :label="unconfirmed ? '核验保存结果' : creationSaved ? '继续完成新增' : '保存方案'" :disabled="acting" @click="saveEdit" />
          <RendererButton label="取消修改" :disabled="acting || unconfirmed || creationSaved" @click="cancelEdit" />
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
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME,RendererTable,RendererDialog,RendererForm,RendererButton,useSparkComponent,type RToolbarProps,type RFilterProps} from '@spark-appworks/spark-component'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {startExcelSchemeCreation,saveExcelSchemeCreation,cancelExcelSchemeCreation,readExcelSchemeCreation,endExcelSchemeCreation} from '@/lowcode/resources/semi-structured/excel-import/catalog/creation'
import ExcelEditor from './excel-import-editor-page.vue'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'

const route = useRoute()
const designTarget = ref('')
const designPage = ref<{hasPending: boolean; busy: boolean; unconfirmed: boolean; discardChanges: () => boolean}>()
const designPending = computed(() => designPage.value?.hasPending === true || designPage.value?.busy === true)
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'excel-import-list-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const editingId=ref<string|number>(),acting=ref(false)
const creation=computed(()=>{revision.value;const ds=view.value?.dataSet;return ds?readExcelSchemeCreation(ds):undefined})
const creating=computed(()=>creation.value!==undefined&&creation.value.phase!=='complete'&&creation.value.phase!=='retained')
const creationSaved=computed(()=>creating.value&&creation.value?.phase!=='input')
const pending=computed(()=>{revision.value;return view.value?.hasEditingChanges()===true||view.value?.dirtyTracking.hasPendingChanges()===true})
const unconfirmed=computed(()=>{revision.value;return view.value?.hasUnconfirmedSave===true||creation.value?.unconfirmed===true})
const querying=computed(()=>{revision.value;return loading.value||view.value?.requestState===RequestState.Loading||view.value?.requestState===RequestState.Preparing})
const locked=computed(()=>querying.value||acting.value||editingId.value!==undefined||pending.value||unconfirmed.value||!!designTarget.value)
useSystemPageDirtySource({get isDirty(){return acting.value||pending.value||unconfirmed.value||designPending.value||creating.value}})
onBeforeRouteLeave(()=>!acting.value&&!pending.value&&!unconfirmed.value&&!designPending.value&&!creating.value)
onBeforeRouteUpdate(()=>!acting.value&&!pending.value&&!unconfirmed.value&&!designPending.value&&!creating.value)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
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
  {type:'r-text',props:{field:'solutionName',label:'方案名称',maxlength:200,readonly:acting.value||unconfirmed.value||creationSaved.value}},
  {type:'r-select',props:{field:'dataSetId',label:'数据空间',optionDataViewKey:buildDataViewKey('Base_DataSet','default',scenarioId.value),readonly:acting.value||unconfirmed.value||creationSaved.value}},
  {type:'r-text',props:{field:'templatePath',label:'文件路径',readonly:true}},
  {type:'r-textarea',props:{field:'description',label:'备注',maxlength:500,showWordLimit:true,readonly:acting.value||unconfirmed.value||creationSaved.value}},
])
async function createScheme():Promise<void>{
 const ds=view.value?.dataSet,own=generation;if(!ds||locked.value)return
 acting.value=true;error.value=''
 try{const id=await startExcelSchemeCreation(ds);if(active&&own===generation)editingId.value=id}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function choose(row:DataRow):void{if(!locked.value)view.value?.setSelectedRows([row])}
function editRow(row:DataRow):void{
  const target=view.value,id=target?.getPkKey(row)
  if(!target||id===undefined||locked.value||target.editActionState(row)!=='enabled')return
  editingId.value=id;error.value=''
}
async function saveEdit():Promise<void>{
  const target=view.value,id=editingId.value,current=runtime?.getDataSet(scenarioId.value),own=generation
  if(!target||id===undefined||!current||acting.value)return
  acting.value=true;error.value=''
  try{
   if(creating.value){await saveExcelSchemeCreation(current);if(readExcelSchemeCreation(current)?.phase!=='complete')return;await target.refresh();if(target.loadingError)throw target.loadingError}
   else{const result=await current.saveChanges({views:[{tableName:target.tableName,viewId:target.viewId,ids:[id]}]});if(!result.success)throw Error(result.message??'方案保存未完整确认')}
   if(active&&own===generation)editingId.value=undefined
  }
  catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function cancelEdit():void{if(acting.value||unconfirmed.value||creationSaved.value||editingId.value===undefined)return;try{const ds=view.value?.dataSet;if(creating.value&&ds)cancelExcelSchemeCreation(ds);else view.value?.discardPendingChanges([editingId.value]);editingId.value=undefined;error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function endCreation():Promise<void>{
 const ds=view.value?.dataSet,own=generation;if(!ds||acting.value||unconfirmed.value)return
 acting.value=true;error.value=''
 try{await endExcelSchemeCreation(ds);if(active&&own===generation)editingId.value=undefined}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function closeEdit(open:boolean):void{if(!open&&!acting.value&&!pending.value&&!unconfirmed.value&&!creating.value)editingId.value=undefined}
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
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('Excel 导入入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeExcelImport.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    runtime = new PageRuntime({pageId: 'excel-import-list-page', scenarioIds: [id], loadScenario: async () => dataSet})
    await runtime.load()
    if (!active || own !== generation) {runtime.dispose(); return}
    view.value = dataSet.getView(LowcodeExcelImport.catalogMetaName, 'default')
    const changed=()=>revision.value++
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged:changed,rowsChanged:changed,editingChanged:changed,mutatingChanged:changed,requestStateChanged:changed})
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true; dataSet.triggerAutoLoad()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
.structured-catalog-page header h1 { margin: 0; font-size: 1.25rem; }
</style>
