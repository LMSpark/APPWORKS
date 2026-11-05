<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-execution-panel
职责：测试对话框直接绑定唯一命令DataView的输入、状态和输出。
边界：字段描述来自正式定义，测试值只在requests.input，不持有结果或业务行副本，不重放未知执行。
AI用途：宿主和节点设置调用open进入同一测试工作区，多个声明属于同一业务行。
-->
<template>
 <section>
  <p v-if="error && !visible" role="alert">{{ error }}</p>
  <RendererDialog v-model="visible" :title="title" :data-view-key="key" width="92vw" top="4vh" :append-to-body="true" :destroy-on-close="false" :close-disabled="working || draft || unknown || editing" :grid-columns="1" :auto-fullscreen-below="960">
   <p v-if="error" role="alert">{{ error }}</p>
   <p v-if="unknown" role="alert">执行结果未知，服务没有按请求核验接口；保留原请求，禁止重跑。</p>
   <RendererForm v-if="row" :data-view-key="key" :grid-columns="2" :auto-columns="false" :show-data-view-meta="false">
    <FieldText field="mode" label="测试方式" :readonly="true" /><FieldText field="nodeId" label="节点ID" :readonly="true" />
   </RendererForm>
   <div v-if="row" class="workflow-test-workspace">
    <section><h2>测试参数</h2>
     <p>每行表示一条业务记录。表触发测试的主键字段应包含在开始参数声明中。</p>
     <RendererButton v-if="draft" :label="jsonValues ? '使用字段控件' : '按JSON值编辑'" :disabled="working || unknown || editing" @click="jsonValues=!jsonValues" />
     <p v-if="!groups.length" role="status">无已声明的测试参数。</p>
     <RendererForm v-for="group in groups" :key="group.id" :data-view-key="key" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
      <FieldJson :data-view-key="key" field="input" :label="group.label" mode="rows" :value-path="group.path" :children="inputFields(group)" :readonly="disabled || working || !draft || unknown"
       :on-editing-change="value=>inputEditing(group.id,value)" />
     </RendererForm>
    </section>
    <section><h2>输出结果</h2>
     <RendererForm :data-view-key="key" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="outcome" label="已返回节点状态" :readonly="true" />
      <FieldText field="completeness" label="结果完整性" :readonly="true" />
      <FieldJson v-if="!draft" :data-view-key="key" field="result" label="执行回执" mode="tree" :height="420" :readonly="true" />
     </RendererForm>
    </section>
   </div>
   <RendererButton v-if="draft" label="执行测试" :disabled="disabled || working || editing || unknown" @click="run" />
   <RendererButton v-if="draft" label="取消测试输入" :disabled="working || unknown" @click="cancel" />
   <RendererButton label="关闭测试" :disabled="working || draft || unknown || editing" @click="visible=false" />
  </RendererDialog>
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef} from 'vue'
import {buildDataViewKey,RequestState,type DataSet,type DataView,type SparkNode} from '@spark-appworks/spark-data'
import {WorkflowExecutionResource} from '@spark-appworks/spark-lowcode-api'
import * as SparkComponent from '@spark-appworks/spark-component'
import {lowcodeApi,lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {WorkflowExecutionContext} from '@/lowcode/resources/structured-config/workflow-definition/execution-context'
import {workflowExecutionInputs,type WorkflowTestInputGroup} from '@/lowcode/resources/structured-config/workflow-definition/execution-inputs'
const {RendererDialog,RendererForm,RendererButton,FieldText,FieldJson}=SparkComponent
const props=defineProps<{
 /** 本次宿主元数据实例。 */
 dataSet:DataSet
 /** 正式工作流身份。 */
 workflowId:string
 /** 当前选中节点，单节点测试时捕获到原命令。 */
 nodeId?:string
 /** 原视图事件触发的呈现版本。 */
 revision:number
 /** 宿主交互锁定，不授予或替代权限。 */
 disabled:boolean
}>()
const emit=defineEmits<{
 /** 通知宿主未确认输入或执行在途。 */
 pendingChange:[key:string,value:boolean]
}>()
const working=ref(false),error=ref(''),visible=ref(false),groups=shallowRef<readonly WorkflowTestInputGroup[]>([]),definitionSignature=ref(''),editingGroups=ref(new Set<string>())
const ds=props.dataSet,workflowId=props.workflowId
const jsonValues=ref(false)
let inputContract:{mode:'node'|'workflow';nodeId:string;signature:string;sources:readonly {name:string;view:DataView;context:string}[]}|undefined
let active=true
function guard():void{
 if(!active||props.dataSet!==ds||props.workflowId!==workflowId)throw Error('工作流测试目标已变化')
 const definition=ds.getView('Base_WorkflowDefinition'),nodes=ds.getView('Base_WorkflowNodeDefinition'),edges=ds.getView('Base_WorkflowConnectors')
 if(!definition||!nodes||!edges||[definition,nodes,edges].some(view=>view.requestState!==RequestState.Loaded||view.loadingError||view.queryContext['workflowId']!==workflowId)
  ||definition.rows.length!==1||!definition.rows[0]||definition.getPkKey(definition.rows[0])!==workflowId)throw Error('工作流正式定义尚未读取或身份不符')
 for(const name of ['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors','Base_DataSet','Base_DataModel','Base_DataModel_Field','Base_DataModel_Relation']){
  for(const current of ds.getTable(name)?.viewList??[])if(current.hasUnconfirmedSave||current.hasEditingChanges()||current.dirtyTracking.hasPendingChanges())throw Error('请先保存或取消正式定义修改，再测试已保存版本')
 }
}
function executionGuard():void{
 guard()
 if(inputContract){
  for(const source of inputContract.sources)if(ds.getView(source.name)!==source.view||source.view.destroyed||JSON.stringify([source.view.queryContext,source.view.queryConfig,source.view.filterExpression])!==source.context)throw Error('测试参数查询上下文已变化，请取消本次输入并重新打开')
  const current=workflowExecutionInputs({dataSet:ds,workflowId,...inputContract});if(current.signature!==inputContract.signature)throw Error('测试参数声明已变化，请取消本次输入并重新打开')}
}
const context=new WorkflowExecutionContext(ds,workflowId,guard)
const resource=new WorkflowExecutionResource({dataSet:ds,http:lowcodeHttp,workflowId,readScope:()=>lowcodeApi.readRequestScope(),guard,graph:()=>{executionGuard();return context.capture()},
 prepare:async input=>{
  if(!inputContract||input.mode!==inputContract.mode||input.nodeId!==inputContract.nodeId)throw Error('测试命令身份与首轮输入不符，请取消本次输入并重新打开')
  const contract=inputContract
  executionGuard();await(input.mode==='workflow'?context.load(input.input):context.validateNode(input.nodeId,input.input))
  if(inputContract!==contract||input.mode!==contract.mode||input.nodeId!==contract.nodeId)throw Error('测试命令身份与首轮输入不符，请取消本次输入并重新打开')
  executionGuard()}})
const view=resource.requests,key=buildDataViewKey(view.tableName,view.viewId,ds.scenarioId)
const row=computed(()=>{props.revision;return view.currentRow})
const draft=computed(()=>{props.revision;return view.dirtyTracking.pendingCreateIds.size>0})
const unknown=computed(()=>{props.revision;return view.hasUnconfirmedSave})
const editing=computed(()=>editingGroups.value.size>0)
function requestValue(field:string):unknown{const current=row.value;return current&&view.fieldAccess(current,field).read==='visible'?current[field]:undefined}
const title=computed(()=>{
 if(requestValue('mode')!=='node')return '工作流运行测试'
 const id=requestValue('nodeId'),nodes=ds.getView('Base_WorkflowNodeDefinition'),node=nodes?.rows.find(item=>nodes.getPkKey(item)===id)
 const name=node&&nodes?.fieldAccess(node,'name').read==='visible'&&typeof node['name']==='string'?node['name']:''
 return `${name||'节点'}运行测试`
})
function inputFields(group:WorkflowTestInputGroup):SparkNode[]{
 return group.fields.map(field=>({type:jsonValues.value||/^(array|object|json)$/i.test(field.type)?'r-json':/^(int|integer|number|float|double|decimal|numeric|long|short|bigint)$/i.test(field.type)?'r-number':/^(bool|boolean|bit)$/i.test(field.type)?'r-checkbox':'r-text',props:{field:field.name,label:field.label,...jsonValues.value||/^(array|object|json)$/i.test(field.type)?{mode:'text',valueFormat:'native'}:{},.../^bit$/i.test(field.type)?{trueValue:1,falseValue:0}:{}}}))
}
function inputEditing(id:string,value:boolean):void{if(value)editingGroups.value.add(id);else editingGroups.value.delete(id);emit('pendingChange','input',editing.value)}
async function act(action:()=>Promise<void>):Promise<void>{
 if(working.value)return
 working.value=true;emit('pendingChange','running',true);error.value=''
 try{await action()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
 finally{working.value=false;emit('pendingChange','running',false)}
}
/** 创建一次原测试输入；显示窗口不执行，不替换已有草稿或未知请求。
 * @param mode 单节点或整流。
 */
async function open(mode:'node'|'workflow'):Promise<void>{
 if(draft.value||unknown.value){visible.value=true;return}
 if(props.disabled)return
 await act(async()=>{
  inputContract=undefined;guard();const nodeId=props.nodeId??''
  if(mode==='node'){
   const nodes=ds.getView('Base_WorkflowNodeDefinition'),node=nodes?.rows.find(item=>nodes.getPkKey(item)===nodeId)
   if(!node||nodes?.fieldAccess(node,'workflow_id').read!=='visible'||node['workflow_id']!==workflowId)throw Error('当前测试节点不属于此工作流')
  }else{
   const params=ds.getView('Base_DataSet');if(!params)throw Error('开始参数视图缺失')
   if(params.requestState!==RequestState.Loaded){await params.refresh();if(params.loadingError)throw params.loadingError}
  }
  guard();const presentation=workflowExecutionInputs({dataSet:ds,workflowId,mode,...mode==='node'?{nodeId}:{}})
  inputContract={mode,nodeId:mode==='node'?nodeId:'',signature:presentation.signature,sources:(mode==='node'?['Base_WorkflowNodeDefinition','Base_WorkflowConnectors']:['Base_DataSet']).map(name=>{const source=ds.getView(name);if(!source)throw Error('测试参数原视图缺失');return{name,view:source,context:JSON.stringify([source.queryContext,source.queryConfig,source.filterExpression])}})}
  await view.refresh();guard()
  if(workflowExecutionInputs({dataSet:ds,workflowId,mode,...mode==='node'?{nodeId}:{}}).signature!==presentation.signature)throw Error('测试参数声明已变化，请取消本次输入并重新打开')
  const created=await view.addRow({mode,nodeId:mode==='node'?nodeId:'',input:JSON.stringify(presentation.seed)})
  if(!('commandId'in created))throw Error('测试输入未进入原命令视图')
  view.setCurrentRow(created);groups.value=presentation.groups;definitionSignature.value=presentation.signature;visible.value=true
 })
}
async function run():Promise<void>{
 if(props.disabled||editing.value||unknown.value||!draft.value)return
 await act(async()=>{
  guard();const mode=requestValue('mode'),nodeId=requestValue('nodeId')
  if(mode!=='node'&&mode!=='workflow')throw Error('原测试方式不明确')
  const presentation=workflowExecutionInputs({dataSet:ds,workflowId,mode,...mode==='node'&&typeof nodeId==='string'?{nodeId}:{}})
  if(presentation.signature!==definitionSignature.value)throw Error('测试参数声明已变化，请取消本次输入并重新打开')
  const result=await ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]});if(!result.success)throw Error(result.message??'测试执行未确认')
 })
}
function cancel():void{if(working.value||unknown.value)return;view.discardPendingChanges();inputContract=undefined;editingGroups.value.clear();emit('pendingChange','input',false);error.value='';visible.value=false}
defineExpose({open})
onBeforeUnmount(()=>{active=false;context.dispose();emit('pendingChange','input',false);emit('pendingChange','running',false)})
</script>
<style scoped>
.workflow-test-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;min-width:0}
.workflow-test-workspace>section{min-width:0}
@media(max-width:1000px){.workflow-test-workspace{grid-template-columns:minmax(0,1fr)}}
</style>
