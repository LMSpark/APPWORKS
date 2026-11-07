<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-execution-panel
职责：测试对话框直接绑定唯一命令DataView的输入、状态和输出。
边界：字段描述来自正式定义，测试值只在requests.input，不持有结果或业务行副本，不重放未知执行。
AI用途：宿主和节点设置调用open进入同一测试工作区，多个声明属于同一业务行。
-->
<template>
 <section>
  <p v-if="error && !visible" role="alert">{{ error }}</p>
  <RendererDialog v-model="visible" :title="title" :data-view-key="key" width="92vw" top="4vh" :append-to-body="true" :destroy-on-close="false" :close-disabled="running || draft || unknown || editing" :grid-columns="1" :auto-fullscreen-below="960">
   <p v-if="error" role="alert">{{ error }}</p>
   <p v-if="bindingError || blockedReason" role="alert">{{ bindingError || blockedReason }}</p>
   <p v-if="unknown" role="alert">执行结果未知，服务没有按请求核验接口；保留原请求，禁止重跑。</p>
   <RendererForm v-if="row" :key="`identity:${rowSession}`" v-bind="rowBinding" :data-view-key="key" :grid-columns="2" :auto-columns="false" :show-data-view-meta="false">
    <FieldText field="mode" label="测试方式" :readonly="true" /><FieldText field="nodeId" label="节点ID" :readonly="true" />
   </RendererForm>
   <RendererForm v-if="row && (!draft || !groups.length || bindingError)" :key="`raw:${rowSession}`" v-bind="rowBinding" :data-view-key="key" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
    <FieldJson field="input" label="测试输入原文" mode="tree" :readonly="true" />
   </RendererForm>
   <div v-if="row" class="workflow-test-workspace">
    <section><h2>测试参数</h2>
     <p>每行表示一条业务记录。表触发测试的主键字段应包含在开始参数声明中。</p>
     <RendererButton v-if="draft" :label="jsonValues ? '使用字段控件' : '按JSON值编辑'" :disabled="running || unknown || editing" @click="jsonValues=!jsonValues" />
     <p v-if="!groups.length" role="status">无已声明的测试参数。</p>
     <RendererForm v-for="group in groups" :key="`${group.id}:${rowSession}`" v-bind="rowBinding" :data-view-key="key" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
      <FieldJson :data-view-key="key" field="input" :label="group.label" mode="rows" :value-path="group.path" :children="inputFields(group)" :readonly="disabled || running || !draft || unknown || !!bindingError"
       :on-editing-change="value=>inputEditing(group.id,value)" />
     </RendererForm>
    </section>
    <section><h2>输出结果</h2>
     <RendererForm :key="`result:${rowSession}`" v-bind="rowBinding" :data-view-key="key" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="outcome" label="已返回节点状态" :readonly="true" />
      <FieldText field="completeness" label="结果完整性" :readonly="true" />
      <FieldJson v-if="!draft" :data-view-key="key" field="result" label="执行回执" mode="tree" :height="420" :readonly="true" />
     </RendererForm>
    </section>
   </div>
   <RendererButton v-if="draft" label="执行测试" :disabled="disabled || running || editing || unknown || !!bindingError || !!blockedReason" @click="run" />
   <RendererButton v-if="draft" label="取消测试输入" :disabled="running || unknown" @click="cancel" />
   <RendererButton v-if="row && !draft && !unknown" :label="requestedMode === 'node' ? '开始新的节点测试' : '开始新的整流测试'" :disabled="disabled || running || editing" @click="startNew(requestedMode)" />
   <RendererButton label="关闭测试" :disabled="running || draft || unknown || editing" @click="visible=false" />
  </RendererDialog>
 </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import {buildDataViewKey,type DataSet,type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {prepareWorkflowExecutionInput,readWorkflowExecutionPresentation} from '@/lowcode/resources/structured-config/workflow-definition/execution/runtime-bindings'
import type {WorkflowTestInputGroup} from '@/lowcode/resources/structured-config/workflow-definition/execution/execution-inputs'
const {RendererDialog,RendererForm,RendererButton,FieldText,FieldJson}=SparkComponent
const props=defineProps<{
 /** 本次宿主正式实例。 */
 dataSet:DataSet
 /** 宿主选定工作流。 */
 workflowId:string
 /** 本次节点测试的候选目标，执行目标以原命令捕获为准。 */
 nodeId?:string
 /** 原DataView事件的呈现修订。 */
 revision:number
 /** 宿主交互约束。 */
 disabled:boolean
}>()
const emit=defineEmits<{pendingChange:[key:string,value:boolean]}>()
const ds=props.dataSet,workflowId=props.workflowId,resolvedView=ds.getView('WorkflowExecution','default')
if(!resolvedView)throw Error('正式场景缺少WorkflowExecution命令视图')
const view=resolvedView
const key=buildDataViewKey(view.tableName,view.viewId,ds.scenarioId)
const working=ref(false),error=ref(''),visible=ref(false),groups=shallowRef<readonly WorkflowTestInputGroup[]>([]),editingGroups=ref(new Set<string>())
const jsonValues=ref(false),bindingError=ref(''),blockedReason=ref(''),requestedMode=ref<'node'|'workflow'>('workflow')
const row=computed(()=>{
 props.revision
 const ids=[...view.dirtyTracking.pendingCreateIds]
 if(ids.length===1){const id=ids[0];return view.rows.find(candidate=>view.getPkKey(candidate)===id)??null}
 return view.rows.length===1?view.rows[0]??null:null
})
const rowId=computed(()=>row.value?view.getPkKey(row.value):undefined)
const draft=computed(()=>{props.revision;return rowId.value!==undefined&&view.dirtyTracking.pendingCreateIds.has(rowId.value)})
const rowBinding=computed(()=>rowId.value===undefined?{}:{contextRowId:rowId.value})
const rowSession=computed(()=>`${rowId.value??'empty'}:${draft.value?'input':'receipt'}`)
const unknown=computed(()=>{props.revision;return view.hasUnconfirmedSave})
const running=computed(()=>{props.revision;return working.value||view.mutating})
const editing=computed(()=>editingGroups.value.size>0)
watch([()=>props.revision,rowId,draft,unknown],()=>{
 if(!draft.value||unknown.value||typeof rowId.value!=='string'){groups.value=[];bindingError.value='';blockedReason.value='';return}
 try{const presentation=readWorkflowExecutionPresentation(view,rowId.value);groups.value=presentation.groups;blockedReason.value=presentation.blockedReason??'';bindingError.value=''}
 catch(cause){groups.value=[];bindingError.value=cause instanceof Error?cause.message:String(cause)}
},{immediate:true})
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
function guardUI():void{if(props.dataSet!==ds||props.workflowId!==workflowId)throw Error('工作流测试目标已变化')}
async function act(action:()=>Promise<void>):Promise<void>{
 if(running.value)return
 working.value=true;emit('pendingChange','running',true);error.value=''
 try{await action()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
 finally{working.value=false;emit('pendingChange','running',false)}
}
async function startNew(mode:'node'|'workflow'):Promise<void>{
 if(props.disabled||running.value||draft.value||unknown.value)return
 await act(async()=>{
  guardUI()
  const presentation=await prepareWorkflowExecutionInput(view,{workflowId,mode,...mode==='node'?{nodeId:props.nodeId??''}:{}})
  groups.value=presentation.groups;blockedReason.value=presentation.blockedReason??'';bindingError.value='';visible.value=true
 })
}
/** 重开只显示原输入/回执；新的测试须单独明确开始，不刷新原命令。 */
async function open(mode:'node'|'workflow'):Promise<void>{
 requestedMode.value=mode
 if(row.value||unknown.value){visible.value=true;return}
 await startNew(mode)
}
async function run():Promise<void>{
 if(props.disabled||editing.value||unknown.value||!draft.value)return
 await act(async()=>{
  guardUI()
  if(bindingError.value||blockedReason.value)throw Error(bindingError.value||blockedReason.value)
  const id=rowId.value;if(typeof id!=='string')throw Error('原测试命令身份缺失')
  const result=await ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:[id]}]});if(!result.success)throw Error(result.message??'测试执行未确认')
 })
}
function cancel():void{
 if(running.value||unknown.value)return
 const id=rowId.value;if(id===undefined)return
 view.discardPendingChanges([id]);editingGroups.value.clear();emit('pendingChange','input',false);error.value='';visible.value=false
}
defineExpose({open})
onBeforeUnmount(()=>{emit('pendingChange','input',false);emit('pendingChange','running',false)})
</script>
<style scoped>
.workflow-test-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;min-width:0}
.workflow-test-workspace>section{min-width:0}
@media(max-width:1000px){.workflow-test-workspace{grid-template-columns:minmax(0,1fr)}}
</style>
