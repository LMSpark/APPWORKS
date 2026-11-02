<!--
@module app:views/features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page
-->
<template>
  <section class="structured-catalog-page">
    <header><h1>数据工作流</h1><p>工作流目录（与 Agent Workflow 分离）。</p></header>
    <p v-if="loading" role="status">正在读取工作流目录…</p>
    <p v-if="error || selectionState.error" role="alert">{{ error || selectionState.error }}</p>
    <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :toolbar="toolbar"
      :stripe="true" :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
    <WorkflowTriggerTableDialog v-if="triggerOpen && editTarget" :workflow-id="editTarget" :data-view-key="editKey" :validate-target="validateTriggerTarget" @applied="revision++" @close="triggerOpen = false" />
    <RendererDialog v-if="editTarget" :model-value="true" title="映射信息设置" :data-view-key="editKey" width="920px" :append-to-body="true" :destroy-on-close="true" :close-disabled="definitionPending" @update:model-value="closeDefinition">
      <p v-if="editBusy" role="status">正在处理工作流定义…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <RendererForm v-if="editReady" :data-view-key="editKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
        <FieldText field="name" label="名称" :readonly="definitionLocked" />
        <FieldSelect field="status" label="状态" :option-data-view-key="statusKey" :readonly="definitionLocked" />
        <FieldText field="workflow_key" label="编码" :readonly="true" />
        <FieldText field="version" label="版本号" :readonly="definitionLocked" />
        <FieldText field="sysid" label="所属应用ID" :readonly="true" />
        <FieldRadio field="activeType" label="触发类型" :options="triggerTypes" :readonly="definitionLocked" />
        <FieldText field="timeExp" label="时间表达式" placeholder="请输入时间表达式（Cron）" :readonly="definitionLocked" />
        <FieldText field="tblName" label="触发表" :readonly="true" />
        <RendererButton label="选择触发表" :disabled="definitionLocked" @click="triggerOpen = true" />
        <FieldCheckboxGroup field="tableOperate" label="操作方式" :options="triggerOperations" value-mode="separated-string" value-separator="," :readonly="definitionLocked" />
        <FieldTextarea field="filter" label="条件原文" :readonly="true" />
        <FieldTextarea field="description" label="描述" :readonly="definitionLocked" />
      </RendererForm>
      <template #footer>
        <RendererButton :label="definitionUnconfirmed ? '核验定义保存结果' : '保存定义'" :disabled="editBusy || !editReady" @click="saveDefinition" />
        <RendererButton label="取消定义修改" :disabled="definitionLocked" @click="cancelDefinition" />
        <RendererButton label="关闭定义" :disabled="definitionPending" @click="closeDefinition(false)" />
      </template>
    </RendererDialog>
    <RendererDialog v-if="designTarget" :model-value="true" title="数据工作流设计" :data-view-key="catalogKey"
      width="94vw" top="3vh" :append-to-body="true" :destroy-on-close="true" :close-disabled="designPending" @update:model-value="closeDesign">
      <WorkflowDesign ref="designPage" :rowid="designTarget" />
      <template #footer>
        <RendererButton v-if="designPage?.hasPending" label="放弃修改并关闭" :disabled="designPage?.busy || designPage?.unconfirmed" @click="discardDesign" />
        <RendererButton label="关闭" :disabled="designPending" @click="closeDesign(false)" />
      </template>
    </RendererDialog>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute,onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererDialog, RendererButton, RendererForm, FieldText, FieldSelect, FieldRadio, FieldCheckboxGroup, FieldTextarea, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import WorkflowTriggerTableDialog from './workflow-trigger-table-dialog.vue'
import WorkflowDesign from '../design/ui/workflow-design-page.vue'

const route = useRoute()
const designTarget=ref(''),designPage=ref<{hasPending:boolean;busy:boolean;unconfirmed:boolean;discardChanges:()=>boolean}>()
const designPending=computed(()=>designPage.value?.hasPending===true||designPage.value?.busy===true)
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'workflow-definition-page'})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const triggerOpen = ref(false)
const triggerTypes=[{label:'表',value:'table'},{label:'时间',value:'time'}]
const triggerOperations=[{label:'删除',value:'delete'},{label:'添加',value:'add'},{label:'编辑',value:'edit'}]
const editTarget=ref(''),editReady=ref(false),editBusy=ref(false)
const editor=()=>runtime?.getDataSet(scenarioId.value)?.getView(LowcodeWorkflowDefinition.catalogMetaName,'edit')
const definitionUnconfirmed=computed(()=>{revision.value;return editor()?.hasUnconfirmedSave===true})
const definitionLocked=computed(()=>editBusy.value||definitionUnconfirmed.value)
const definitionPending=computed(()=>{revision.value;const target=editor();return editBusy.value||!!target&&(target.hasUnconfirmedSave||target.hasEditingChanges()||target.dirtyTracking.hasPendingChanges())})
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true
const selectionState = computed(() => {
  revision.value
  try{const values = view.value?.getSelectedValues() ?? [];return{id:values.length===1&&typeof values[0]==='string'?values[0]:'',error:''}}
  catch(cause){return{id:'',error:cause instanceof Error?cause.message:String(cause)}}
})
const selected=computed(()=>selectionState.value.id)
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeWorkflowDefinition.catalogMetaName, 'default', scenarioId.value))
const editKey=computed(()=>buildDataViewKey(LowcodeWorkflowDefinition.catalogMetaName,'edit',scenarioId.value))
const statusKey=computed(()=>buildDataViewKey('workflowStatus','default',scenarioId.value))
useSystemPageDirtySource({get isDirty(){return designPending.value||definitionPending.value}})
onBeforeRouteLeave(()=>!designPending.value&&!definitionPending.value)
onBeforeRouteUpdate(()=>!designPending.value&&!definitionPending.value)
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {label: '新增工作流', permAction: 'create', disabled: loading.value, onClick: createFlow}},
  {type: 'r-button', props: {label: '打开设计', disabled: !selected.value || loading.value, onClick: openDesign}},
  {type: 'r-button', props: {label:'编辑定义',disabled:!selected.value||loading.value||!!editTarget.value,onClick:openDefinition}},
  {type: 'r-button', props: {label: '触发表…', disabled: !selected.value || loading.value, onClick: openTrigger}},
  {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
]}))
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'name', label: '工作流名称', width: 260}},
  {type: 'r-text', props: {field: 'workflow_key', label: '工作流编码', width: 180}},
  {type: 'r-text', props: {field: 'description', label: '描述', width: 320}},
  {type: 'r-select', props: {field: 'status', label: '状态', width: 120,
    optionDataViewKey: buildDataViewKey('workflowStatus', 'default', scenarioId.value)}},
])
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
function createFlow(): void {error.value='暂不能创建工作流：业务编码生成能力尚未确认。'}
function openDesign(): void {if(selected.value&&!designTarget.value&&!editTarget.value)designTarget.value=selected.value}
async function openTrigger():Promise<void>{await openDefinition();if(editReady.value)triggerOpen.value=true}
function validateTriggerTarget():void{
 const target=editor(),row=target?.currentRow
 if(editBusy.value||!editReady.value||!row||target?.getPkKey(row)!==editTarget.value||target.queryContext['definitionId']!==editTarget.value||target.hasUnconfirmedSave)throw Error('工作流定义目标已变化或正在保存')
}
async function openDefinition():Promise<void>{
 if(!selected.value||editTarget.value||designTarget.value)return
 const id=selected.value,target=editor(),own=generation;if(!target)return
 editTarget.value=id;editReady.value=false;editBusy.value=true;error.value=''
 try{
  target.queryContext={...target.queryContext,definitionId:id}
  const status=runtime?.getDataSet(scenarioId.value)?.getView('workflowStatus');if(!status)throw Error('工作流状态视图缺失')
  await Promise.all([target.refresh(),status.refresh()]);if(target.loadingError)throw target.loadingError;if(status.loadingError)throw status.loadingError
  if(target.rows.length!==1||target.getPkKey(target.rows[0]!)!==id)throw Error('工作流定义不存在或身份不唯一')
  if(active&&own===generation)editReady.value=true
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)editBusy.value=false}
}
function closeDefinition(open:boolean):void{if(!open&&!definitionPending.value){triggerOpen.value=false;editTarget.value='';editReady.value=false}}
function cancelDefinition():void{if(definitionLocked.value)return;try{editor()?.discardPendingChanges([editTarget.value]);error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function saveDefinition():Promise<void>{
 const target=editor(),ds=runtime?.getDataSet(scenarioId.value),id=editTarget.value,own=generation
 if(editBusy.value||!editReady.value||!target||!ds)return
 if(target.queryContext['definitionId']!==id||target.rows.length!==1||target.getPkKey(target.rows[0]!)!==id){error.value='工作流定义编辑目标已变化';return}
 editBusy.value=true;error.value=''
 let saved=false
 try{const result=await ds.saveChanges({views:[{tableName:target.tableName,viewId:target.viewId,ids:[id]}]});if(!result.success)throw Error(result.message??'定义保存未确认');saved=true;await view.value?.refresh();if(view.value?.loadingError)throw view.value.loadingError}
 catch(cause){if(active&&own===generation)error.value=(saved?'定义保存已确认，目录刷新失败：':'')+(cause instanceof Error?cause.message:String(cause))}
 finally{if(active&&own===generation){editBusy.value=false;revision.value++}}
}
function closeDesign(open:boolean):void{if(!open&&!designPending.value)designTarget.value=''}
function discardDesign():void{if(designPage.value?.busy||designPage.value?.unconfirmed)return;if(designPage.value?.discardChanges()===true)closeDesign(false)}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  unsubscribe?.(); view.value = undefined; sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    if (!id) throw new Error('数据工作流入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeWorkflowDefinition.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    runtime = new PageRuntime({pageId: 'workflow-definition-page', scenarioIds: [id], loadScenario: async () => dataSet})
    await runtime.load()
    if (!active || own !== generation) {runtime.dispose(); return}
    view.value = dataSet.getView(LowcodeWorkflowDefinition.catalogMetaName, 'default')
    const changed=()=>revision.value++
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged:changed,editingChanged:changed,rowsChanged:changed,requestStateChanged:changed,mutatingChanged:changed})
    sparkProvide(PAGE_RUNTIME, runtime); ready.value = true; dataSet.triggerAutoLoad()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
.structured-catalog-page h1 { margin: 0; font-size: 1.25rem; }
</style>
