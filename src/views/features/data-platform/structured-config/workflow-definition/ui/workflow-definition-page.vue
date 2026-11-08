<!--
@module app:views/features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page
-->
<template>
  <section class="structured-catalog-page">
    <header><h1>数据工作流</h1><p>工作流目录（与 Agent Workflow 分离）。</p></header>
    <p v-if="loading" role="status">正在读取工作流目录…</p>
    <p v-if="error || selectionState.error" role="alert">{{ error || selectionState.error }}</p>
    <SparkComponent.RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :toolbar="toolbar"
      :stripe="true" :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
    <WorkflowTriggerTableDialog v-if="triggerOpen && editTarget" :workflow-id="editTarget" :data-view-key="editKey" :validate-target="validateTriggerTarget" @applied="revision++" @close="triggerOpen = false" />
    <SparkComponent.RendererDialog v-if="editTarget" :model-value="true" title="映射信息设置" :data-view-key="editKey" width="920px" :append-to-body="true" :destroy-on-close="true" :close-disabled="definitionPending" @update:model-value="closeDefinition">
      <p v-if="editBusy" role="status">正在处理工作流定义…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <SparkComponent.RendererForm v-if="editReady" :data-view-key="editKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
        <SparkComponent.FieldText field="name" label="名称" :readonly="definitionLocked" />
        <SparkComponent.FieldSelect field="status" label="状态" :option-data-view-key="statusKey" :readonly="definitionLocked" />
        <SparkComponent.FieldText field="workflow_key" label="编码" :readonly="true" />
        <SparkComponent.FieldText field="version" label="版本号" :readonly="definitionLocked" />
        <SparkComponent.FieldText field="sysid" label="所属应用ID" :readonly="true" />
        <SparkComponent.FieldRadio field="activeType" label="触发类型" :options="triggerTypes" :readonly="definitionLocked" />
        <SparkComponent.FieldText field="timeExp" label="时间表达式" placeholder="请输入时间表达式（Cron）" :readonly="definitionLocked" />
        <SparkComponent.FieldText field="tblName" label="触发表" :readonly="true" />
        <SparkComponent.RendererButton label="选择触发表" :disabled="definitionLocked || conditionEditing" @click="triggerOpen = true" />
        <SparkComponent.FieldCheckboxGroup field="tableOperate" label="操作方式" :options="triggerOperations" value-mode="separated-string" value-separator="," :readonly="definitionLocked" />
        <WorkflowTriggerCondition :workflow-id="editTarget" :data-view-key="editKey" :readonly="definitionLocked" @editing="value=>conditionEditing=value" />
        <SparkComponent.FieldTextarea field="description" label="描述" :readonly="definitionLocked" />
      </SparkComponent.RendererForm>
      <template #footer>
        <SparkComponent.RendererButton :label="definitionUnconfirmed ? '核验定义保存结果' : '保存定义'" :disabled="editBusy || !editReady" @click="saveDefinition" />
        <SparkComponent.RendererButton label="取消定义修改" :disabled="definitionLocked" @click="cancelDefinition" />
        <SparkComponent.RendererButton label="关闭定义" :disabled="definitionPending" @click="closeDefinition(false)" />
      </template>
    </SparkComponent.RendererDialog>
    <SparkComponent.RendererDialog v-if="designTarget" :model-value="true" title="数据工作流设计" :data-view-key="catalogKey"
      width="94vw" top="3vh" :append-to-body="true" :destroy-on-close="true" :close-disabled="designPending" @update:model-value="closeDesign">
      <WorkflowDesign ref="designPage" :rowid="designTarget" />
      <template #footer>
        <SparkComponent.RendererButton v-if="designPage?.hasPending" label="放弃修改并关闭" :disabled="designPage?.busy || designPage?.unconfirmed" @click="discardDesign" />
        <SparkComponent.RendererButton label="关闭" :disabled="designPending" @click="closeDesign(false)" />
      </template>
    </SparkComponent.RendererDialog>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute,onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import WorkflowTriggerTableDialog from './workflow-trigger-table-dialog.vue'
import WorkflowTriggerCondition from './workflow-trigger-condition.vue'
import WorkflowDesign from '../design/ui/workflow-design-page.vue'

const route = useRoute()
const designTarget=ref(''),designPage=ref<{hasPending:boolean;busy:boolean;unconfirmed:boolean;discardChanges:()=>boolean}>()
const designPending=computed(()=>designPage.value?.hasPending===true||designPage.value?.busy===true)
const {sparkProvide, sparkRemove} = SparkComponent.useSparkComponent({type: 'workflow-definition-page'})
const session = new NativePageRuntimeSession({
  provide: () => undefined,
  remove: () => sparkRemove(SparkComponent.PAGE_RUNTIME),
})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
const triggerOpen = ref(false)
const conditionEditing=ref(false)
const triggerTypes=[{label:'表',value:'table'},{label:'时间',value:'time'}]
const triggerOperations=[{label:'删除',value:'delete'},{label:'添加',value:'add'},{label:'编辑',value:'edit'}]
const editTarget=ref(''),editReady=ref(false),editBusy=ref(false)
const editor=()=>session.runtime?.getDataSet(scenarioId.value)?.getView(LowcodeWorkflowDefinition.catalogMetaName,'edit')
const definitionUnconfirmed=computed(()=>{revision.value;return editor()?.hasUnconfirmedSave===true})
const definitionLocked=computed(()=>editBusy.value||definitionUnconfirmed.value)
const definitionPending=computed(()=>{revision.value;const target=editor();return conditionEditing.value||editBusy.value||!!target&&(target.hasUnconfirmedSave||target.hasEditingChanges()||target.dirtyTracking.hasPendingChanges())})
let unsubscribe: (() => void) | undefined, generation = 0, active = true
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
const toolbar = computed<SparkComponent.RToolbarProps>(() => ({wrap: true, children: [
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
async function openTrigger():Promise<void>{if(conditionEditing.value){error.value='请先应用或取消触发条件编辑';return}await openDefinition();if(editReady.value)triggerOpen.value=true}
function validateTriggerTarget():void{
 const target=editor(),row=target?.currentRow
 if(conditionEditing.value||editBusy.value||!editReady.value||!row||target?.getPkKey(row)!==editTarget.value||target.queryContext['definitionId']!==editTarget.value||target.hasUnconfirmedSave)throw Error('工作流定义目标已变化或正在保存')
}
async function openDefinition():Promise<void>{
 if(!selected.value||editTarget.value||designTarget.value)return
 const id=selected.value,target=editor(),own=generation;if(!target)return
 editTarget.value=id;editReady.value=false;editBusy.value=true;error.value=''
 try{
  target.queryContext={...target.queryContext,definitionId:id}
  const status=session.runtime?.getDataSet(scenarioId.value)?.getView('workflowStatus');if(!status)throw Error('工作流状态视图缺失')
  await Promise.all([target.refresh(),status.refresh()]);if(target.loadingError)throw target.loadingError;if(status.loadingError)throw status.loadingError
  if(target.rows.length!==1||target.getPkKey(target.rows[0]!)!==id)throw Error('工作流定义不存在或身份不唯一')
  if(active&&own===generation)editReady.value=true
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)editBusy.value=false}
}
function closeDefinition(open:boolean):void{if(!open&&!definitionPending.value){triggerOpen.value=false;editTarget.value='';editReady.value=false}}
function cancelDefinition():void{if(definitionLocked.value)return;try{editor()?.discardPendingChanges([editTarget.value]);error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function saveDefinition():Promise<void>{
 if(conditionEditing.value){error.value='请先应用或取消触发条件编辑';return}
 const target=editor(),ds=session.runtime?.getDataSet(scenarioId.value),id=editTarget.value,own=generation
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
  unsubscribe?.(); view.value = undefined; session.dispose()
  try {
    if (!id) throw new Error('数据工作流入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeWorkflowDefinition.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    const current = session.acquire({pageId: 'workflow-definition-page', scenarioIds: [id], targetId: id,
      loadScenario: async () => dataSet})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    view.value = dataSet.getView(LowcodeWorkflowDefinition.catalogMetaName, 'default')
    const changed=()=>revision.value++
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged:changed,editingChanged:changed,rowsChanged:changed,requestStateChanged:changed,mutatingChanged:changed})
    if (active && own === generation && session.isCurrent(current)) {sparkProvide(SparkComponent.PAGE_RUNTIME, current); ready.value = true}
    dataSet.triggerAutoLoad()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>

<style scoped>
.structured-catalog-page { display: grid; gap: 16px; padding: 24px; }
.structured-catalog-page h1 { margin: 0; font-size: 1.25rem; }
</style>
