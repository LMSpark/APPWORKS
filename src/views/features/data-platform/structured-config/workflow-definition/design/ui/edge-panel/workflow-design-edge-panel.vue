<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/edge-panel/workflow-design-edge-panel
职责：原连线及条件DataView的配置交互。
边界：使用原连接器/条件命令，按当前连线ID保存取消，不复制关系或条件数据。
AI用途：画布关系设置对话框复用同一工作流实例及正式连线身份。
-->
<template>
<section><p v-if="error" role="alert">{{ error }}</p>
          <template v-if="selectedKind === 'edge' && selectedEdge">
            <h2>连线配置</h2>
            <RendererForm :data-view-key="edgesKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
              <FieldText field="name" label="连线名称" :readonly="locked" />
              <FieldText field="description" label="连线描述" :readonly="locked" />
              <FieldText field="sourceID" label="来源节点" :readonly="true" />
              <FieldText field="targetID" label="目标节点" :readonly="true" />
              <FieldJson field="params" label="输入参数映射" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('edges.params',value)" />
            </RendererForm>
            <RendererButton :label="isUnconfirmed(edgesTable) ? '核验连线保存结果' : '保存连线'" :disabled="busy || pendingPart('edges')" @click="save()" />
            <RendererButton label="取消连线修改" :disabled="busy || unconfirmed" @click="cancel()" />
            <h3>连线条件</h3>
            <p v-if="conditionState.error" role="alert">{{ conditionState.error }}</p>
            <RendererButton v-if="conditionState.ready && !conditionState.row && !conditionUnconfirmed && !conditionDeleting" label="新增条件" :data-view-key="conditionKey" perm-action="create" :disabled="locked || !!conditionState.error" @click="changeCondition('add')" />
            <RendererFilterExpression v-if="conditionState.row && !conditionState.error" :data-view-key="conditionKey" field="filter" format="spark-json" display="inline" :columns="conditionState.columns" :function-context="conditionState.functionContext" :allowed-operators="conditionState.allowedOperators" :readonly="locked" :on-editing-change="value=>pending('condition.filter',value)" />
            <RendererForm v-if="conditionState.row && conditionState.error" :data-view-key="conditionKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
              <FieldJson field="filter" label="原条件" mode="text" :readonly="true" />
            </RendererForm>
            <RendererButton v-if="conditionState.row || conditionUnconfirmed || conditionDeleting" :label="conditionUnconfirmed ? '核验条件保存结果' : conditionDeleting ? '重试条件删除' : '保存条件'" :disabled="busy || pendingPart('condition') || (!!conditionState.error && !conditionUnconfirmed && !conditionDeleting)" @click="changeCondition('save')" />
            <RendererButton v-if="conditionState.ready" label="取消条件修改" :disabled="busy || unconfirmed" @click="cancelCondition" />
          </template>

</section>
</template>
<script setup lang="ts">

import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {buildDataViewKey,RequestState,type DataSet} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {WorkflowConnectorCondition} from '@/lowcode/resources/structured-config/workflow-definition/connector-condition'
import {WorkflowConnectors} from '@/lowcode/resources/structured-config/workflow-definition/connectors'
const props=defineProps<{
 /** 本次宿主提供的唯一元数据实例。 */
 dataSet:DataSet
 /** 被设计工作流正式身份，不是场景或工具身份。 */
 workflowId:string
 /** 配置窗口显隐；隐藏不重建或丢弃原命令。 */
 visible:boolean
 /** 宿主原视图事件触发的呈现版本。 */
 revision:number
 /** 宿主业务交互锁定，不替代数据权限。 */
 disabled:boolean
 /** 宿主当前请求或命令在途状态。 */
 busy:boolean
 /** 宿主原视图尚有未确认提交。 */
 unconfirmed:boolean
 /** 宿主收集的未确认控件编辑状态，只表示UI生命周期。 */
 pendingKeys:ReadonlySet<string>
 /** 当前原连接器主键，未选中时为空。 */
 edgeId:string|number|undefined
}>()
const emit=defineEmits<{
 /** 通知宿主本控件是否有未确认编辑或在途操作。 */
 pendingChange:[key:string,value:boolean]
 /** 原DataView变化后请求宿主刷新呈现。 */
 changed:[]
 /** 本次新建已取消，关闭配置窗口。 */
 dismiss:[]
}>()
const {RendererForm,RendererButton,RendererFilterExpression,FieldText,FieldJson}=SparkComponent
const scopeDataSet=props.dataSet,scopeWorkflow=props.workflowId,scene=scopeDataSet.scenarioId,edgesTable='Base_WorkflowConnectors',relationsTable='Base_DataModel_Relation',edgesKey=buildDataViewKey(edgesTable,'default',scene)
const dataSet=computed(()=>props.dataSet),workflowId=computed(()=>props.workflowId),loadedTarget=computed(()=>props.workflowId),revision=computed(()=>props.revision)
const view=(table:string)=>dataSet.value.getView(table),selectedEdge=computed(()=>{revision.value;return view(edgesTable)?.currentRow}),selectedEdgeId=computed(()=>props.edgeId),selectedKind=computed(()=>props.edgeId===undefined?undefined:'edge')
const acting=ref(false),error=ref('');let generation=0,active=true
const busy=computed(()=>props.busy||acting.value),unconfirmed=computed(()=>props.unconfirmed),locked=computed(()=>props.disabled||acting.value||!selectedEdge.value||view(edgesTable)?.getPkKey(selectedEdge.value)!==props.edgeId)
function pending(key:string,value:boolean):void{emit('pendingChange',key,value)}
function pendingPart(prefix:string):boolean{return [...props.pendingKeys].some(key=>key.startsWith(prefix+'.'))}
function validateJson(value:unknown):void{if(typeof value!=='string')throw Error('配置必须是JSON文本');if(value.trim())parseJsonDocument(value)}
function isUnconfirmed(table:string):boolean{return view(table)?.hasUnconfirmedSave===true}
function assertScope():void{if(!active||props.dataSet!==scopeDataSet||props.workflowId!==scopeWorkflow||scopeDataSet.destroyed||!selectedEdge.value||view(edgesTable)?.getPkKey(selectedEdge.value)!==props.edgeId)throw Error('原连线配置目标已变化')}
watch(acting,value=>emit('pendingChange','object.running',value),{flush:'sync'})

const conditionKey=buildDataViewKey(relationsTable,'connector',scene),conditionView=()=>dataSet.value?.getView(relationsTable,'connector')
const conditionUnconfirmed=computed(()=>{revision.value;return conditionView()?.hasUnconfirmedSave===true})
const conditionDeleting=computed(()=>{revision.value;return (conditionView()?.dirtyTracking.pendingDeleteIds.size??0)>0})
const conditionState=computed(()=>{
 revision.value
 const empty={ready:false,row:undefined,columns:[],functionContext:{},allowedOperators:undefined,error:''},ds=dataSet.value,id=selectedEdgeId.value
 if(id!==undefined&&view(edgesTable)?.dirtyTracking.isPendingCreate(id))return {...empty,error:'请先保存新连线，再维护连线条件'}
 if(selectedKind.value!=='edge'||!ds||id===undefined||conditionView()?.requestState!==RequestState.Loaded)return empty
 try{const state=WorkflowConnectorCondition.presentation(ds,workflowId.value,id);return{...state,ready:true,error:state.outputError}}
 catch(cause){return{...empty,error:cause instanceof Error?cause.message:String(cause)}}
})
async function loadCondition():Promise<void>{
 const ds=dataSet.value,id=selectedEdgeId.value,own=generation;if(!ds||id===undefined)return
 try{await WorkflowConnectorCondition.load(ds,workflowId.value,id)}catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
}
async function changeCondition(action:'add'|'save'):Promise<void>{
 const ds=dataSet.value,id=selectedEdgeId.value,own=generation
 if(!ds||id===undefined||busy.value||loadedTarget.value!==workflowId.value||pendingPart('condition'))return
 acting.value=true;error.value=''
 try{if(action==='add')await WorkflowConnectorCondition.add(ds,workflowId.value,id);else{const result=await WorkflowConnectorCondition.save(ds,workflowId.value,id);if(!result.success)throw Error(result.message??'条件保存未完整确认')}}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;emit('changed')}}
}
function cancelCondition():void{if(busy.value||unconfirmed.value)return;try{conditionView()?.discardPendingChanges();error.value='';emit('changed')}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function save():Promise<void>{
 if(busy.value)return
 const id=selectedEdgeId.value;if(typeof id!=='string')return
 acting.value=true;error.value=''
 try{assertScope();const result=await WorkflowConnectors.save(dataSet.value,workflowId.value,id);if(!result.success)throw Error(result.message??'连线保存未确认');await loadCondition()}
 catch(cause){if(active)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active){acting.value=false;emit('changed')}}
}
function cancel():void{
 if(busy.value||unconfirmed.value)return
 try{assertScope();const target=view(edgesTable),id=selectedEdgeId.value;if(!target||id===undefined)return;const creating=target.dirtyTracking.isPendingCreate(id);target.discardPendingChanges([id]);error.value='';emit('changed');if(creating)emit('dismiss')}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
watch([()=>props.edgeId,()=>props.visible],async([id,visible])=>{if(visible&&id!==undefined)await loadCondition()},{immediate:true})
onBeforeUnmount(()=>{active=false;generation++;emit('pendingChange','object.running',false)})

</script>
