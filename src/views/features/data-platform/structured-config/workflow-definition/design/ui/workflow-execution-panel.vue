<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-execution-panel
职责：标准组件绑定原DataSet的测试命令输入与回执；不在页面发送HTTP或持有执行结果副本。
-->
<template>
 <section>
  <h2>运行测试</h2>
  <p>执行已保存的定义；节点可能修改业务数据。整流结果须核对预期节点，返回行可能被服务裁剪。</p>
  <RendererButton label="测试当前节点" :disabled="disabled || working || draft || !nodeId || unknown" @click="start('node')" />
  <RendererButton label="测试完整流程" :disabled="disabled || working || draft || unknown" @click="start('workflow')" />
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="unknown" role="alert">执行结果未知，服务没有按请求核验接口；保留原请求，禁止重跑。</p>
  <RendererForm v-if="row" :data-view-key="key" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
   <FieldText field="mode" label="测试方式" :readonly="true" />
   <FieldText field="nodeId" label="节点ID" :readonly="true" />
   <FieldJson field="input" label="测试输入（节点ID到行数组 / 整流业务行数组）" mode="text" :height="180"
    :readonly="disabled || working || !draft || unknown" :on-editing-change="inputEditing" />
   <FieldText field="outcome" label="已返回节点状态" :readonly="true" />
   <FieldText field="completeness" label="结果完整性" :readonly="true" />
   <FieldJson v-if="!draft" field="result" label="执行回执" mode="text" :height="260" :readonly="true" />
  </RendererForm>
  <RendererButton v-if="draft" label="执行测试" :disabled="disabled || working || editing || unknown" @click="run" />
  <RendererButton v-if="draft" label="取消测试输入" :disabled="working || unknown" @click="cancel" />
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref} from 'vue'
import {buildDataViewKey,RequestState,type DataSet} from '@spark-appworks/spark-data'
import {WorkflowExecutionResource} from '@spark-appworks/spark-lowcode-api'
import {RendererButton,RendererForm,FieldText,FieldJson} from '@spark-appworks/spark-component'
import {lowcodeApi,lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {WorkflowExecutionContext} from '@/lowcode/resources/structured-config/workflow-definition/execution-context'
const props=defineProps<{dataSet:DataSet;workflowId:string;nodeId?:string;revision:number;disabled:boolean}>()
const emit=defineEmits<{pendingChange:[key:string,value:boolean]}>()
const working=ref(false),editing=ref(false),error=ref('')
const ds=props.dataSet,workflowId=props.workflowId
let active=true
function guard():void{
 if(!active||props.dataSet!==ds||props.workflowId!==workflowId)throw Error('工作流测试目标已变化')
 const definition=ds.getView('Base_WorkflowDefinition'),nodes=ds.getView('Base_WorkflowNodeDefinition'),edges=ds.getView('Base_WorkflowConnectors')
 if(!definition||!nodes||!edges||[definition,nodes,edges].some(view=>view.requestState!==RequestState.Loaded||view.loadingError||view.queryContext['workflowId']!==workflowId)
  ||definition.rows.length!==1||!definition.rows[0]||definition.getPkKey(definition.rows[0])!==workflowId)throw Error('工作流正式定义尚未读取或身份不符')
 for(const name of ['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors','Base_DataSet','Base_DataModel','Base_DataModel_Field','Base_DataModel_Relation']){
  for(const view of ds.getTable(name)?.viewList??[])if(view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('请先保存或取消正式定义修改，再测试已保存版本')
 }
}
const context=new WorkflowExecutionContext(ds,workflowId,guard)
const resource=new WorkflowExecutionResource({dataSet:ds,http:lowcodeHttp,workflowId,readScope:()=>lowcodeApi.readRequestScope(),guard,graph:()=>context.capture(),
 prepare:input=>input.mode==='workflow'?context.load(input.input):context.validateNode(input.nodeId,input.input)})
const view=resource.requests,key=buildDataViewKey(view.tableName,view.viewId,ds.scenarioId)
const row=computed(()=>{props.revision;return view.currentRow})
const draft=computed(()=>{props.revision;return view.dirtyTracking.pendingCreateIds.size>0})
const unknown=computed(()=>{props.revision;return view.hasUnconfirmedSave})
function inputEditing(value:boolean):void{editing.value=value;emit('pendingChange','input',value)}
async function act(action:()=>Promise<void>):Promise<void>{
 if(working.value)return
 working.value=true;emit('pendingChange','running',true);error.value=''
 try{await action()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
 finally{working.value=false;emit('pendingChange','running',false)}
}
async function start(mode:'node'|'workflow'):Promise<void>{
 if(props.disabled||draft.value||unknown.value)return
 await act(async()=>{
  guard();const nodeId=props.nodeId??''
  if(mode==='node'){
   const nodes=ds.getView('Base_WorkflowNodeDefinition'),node=nodes?.rows.find(row=>nodes.getPkKey(row)===nodeId)
   if(!node||nodes?.fieldAccess(node,'workflow_id').read!=='visible'||node['workflow_id']!==workflowId)throw Error('当前测试节点不属于此工作流')
  }
  await view.refresh();const created=await view.addRow({mode,nodeId:mode==='node'?nodeId:'',input:mode==='node'?'{}':'[]'})
  if(!('commandId' in created))throw Error('测试输入未进入原命令视图')
  view.setCurrentRow(created)
 })
}
async function run():Promise<void>{
 if(props.disabled||editing.value||unknown.value)return
  await act(async()=>{
   const result=await ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]});if(!result.success)throw Error(result.message??'测试执行未确认')
  })
}
function cancel():void{if(working.value||unknown.value)return;view.discardPendingChanges();error.value=''}
onBeforeUnmount(()=>{active=false;context.dispose();emit('pendingChange','input',false);emit('pendingChange','running',false)})
</script>
