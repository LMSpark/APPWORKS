<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/node-panel/workflow-design-node-panel
职责：原节点DataView上的配置呈现与业务命令触发。
边界：复用宿主实例、公共保存及原领域命令，不创建第二份节点/字段草稿或数据查询实现。
AI用途：节点对话框承接同一节点身份，来源和字段操作不因页签切换重建。
-->
<template>
<section class="workflow-node-panel"><p v-if="error" role="alert">{{ error }}</p>
      <WorkflowQueryNodeCreate v-if="dataSet" :key="loadedTarget" ref="queryCreateApi" :data-set="dataSet" :workflow-id="workflowId" :node-id="selectedQueryId"
        :eligible="selectedKind === 'node' && (isQueryNode || isOperationNode) && String(selectedNode?.['position_type']) === '1'"
        :disabled="locked || pendingPart('nodes') || (hasPending && !nodeDraftOnly && !pendingPart('create'))" :on-created="queryNodeCreated" @pending-change="value=>pending('create.query',value)" />
      <WorkflowQuerySourceEdit v-if="dataSet" :key="loadedTarget" ref="querySourceApi" :data-set="dataSet" :workflow-id="workflowId" :node-id="selectedQueryId" :revision="revision"
        :operation="isOperationNode" :eligible="selectedKind === 'node' && (isQueryNode || isOperationNode) && validModel && String(selectedNode?.['position_type']) === '1'" :disabled="locked || hasPending" :on-saved="queryNodeCreated" @pending-change="value=>pending('source.query',value)" />
      <WorkflowCopyTarget v-if="dataSet" :key="loadedTarget" ref="copyTargetApi" :data-set="dataSet" :workflow-id="workflowId" :node-id="selectedQueryId"
        :eligible="selectedKind === 'node' && isCopyNode && String(selectedNode?.['position_type']) === '1'" :disabled="locked || hasPending" @pending-change="value=>pending('target.copy',value)" />
      <WorkflowMergeSources v-if="dataSet" :key="loadedTarget" ref="mergeSourceApi" :data-set="dataSet" :workflow-id="workflowId" :node-id="selectedQueryId" :parent-path="mergePath"
        :eligible="selectedKind === 'node' && isMergeNode" :disabled="locked || pendingPart('nodes')" @pending-change="value=>pending('nodes.mergeSources',value)" @changed="path=>mergePath=path" />
      <WorkflowNodeRemove v-if="dataSet" :key="loadedTarget" ref="nodeRemoveApi" :data-set="dataSet" :workflow-id="workflowId"
        :node-id="selectedQueryId" :operation="isOperationNode" :copy="isCopyNode" :merge="isMergeNode" :eligible="selectedKind === 'node' && (isQueryNode || isOperationNode || isMergeNode) && String(selectedNode?.['position_type']) === '1'" :data-view-key="nodesKey" :disabled="locked || hasPending" :on-removed="nodeRemoved" @pending-change="value=>pending('remove.node',value)" />
          <template v-if="selectedKind === 'node' && selectedNode">
            <section v-if="isStartNode">
              <h2>开始输入参数</h2>
              <p role="status">已有输入参数需通过“保存开始参数”确认并同步为开始输出。</p>
              <p v-if="startParametersMissing && !loading" role="alert">当前流程缺少唯一的开始参数定义或开始节点</p>
              <RendererForm v-if="!startParametersMissing" :data-view-key="parametersKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
                <FieldJson :data-view-key="parametersKey" field="inputParams" label="输入参数" mode="rows" :children="parameterFields" :row-adapter="parameterAdapter" :readonly="locked" :on-editing-change="value=>pending('start.parameters',value)" />
              </RendererForm>
              <RendererButton :label="startUnconfirmed ? '核验开始参数保存结果' : '保存开始参数'" :disabled="busy || pendingPart('start') || startParametersMissing" @click="saveStartParameters" />
              <RendererButton label="取消开始参数修改" :disabled="busy || unconfirmed" @click="cancelStartParameters" />
            </section>
            <section v-else-if="isEndNode"><h2>结束节点</h2><p>此节点标记流程结束，不能添加下游连线。</p></section>

 <template v-else>
  <RendererButton label="测试当前节点" :disabled="locked || hasPending" @click="emit('test')" />
  <RendererForm :data-view-key="nodesKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
   <FieldText :data-view-key="nodesKey" field="name" label="节点名称" :readonly="locked" />
   <FieldText field="description" label="节点描述" :readonly="locked" />
   <FieldSelect v-if="nodeTypeEditable" field="node_type" label="操作类型" :options="nodeTypes" :clearable="false" :readonly="locked" />
   <FieldText v-else field="node_type" label="节点类型" :readonly="true" />
  </RendererForm>
  <RendererButton :label="isUnconfirmed(nodesTable) ? '核验节点保存结果' : '保存节点'" :disabled="busy || pendingPart('nodes')" @click="save(nodesTable)" />
  <RendererButton label="取消节点修改" :disabled="busy || unconfirmed || boundaryPending" @click="cancel(nodesTable)" />
  <p v-if="missingModel" role="alert">当前节点引用的模型不存在或不属于当前流程</p>
  <p v-if="modelBindingIssue" role="alert">{{ modelBindingIssue }}</p>
  <RendererTabs v-model="activeTab" :data-view-key="nodesKey">
   <RendererTabPane v-if="isMergeNode" name="model" label="合并节点" :index="0" :data-view-key="nodesKey">
    <RendererForm :data-view-key="nodesKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
                   <FieldJson v-if="isMergeNode" field="input_mapping" label="合并输入层级" mode="outline" outline-id-field="rowid" outline-parent-field="pid"
                :children="mergeInputFields" :readonly="true" :selected-path="mergePath" :on-selected-path-change="selectMergePath" />
              <template v-if="isMergeNode && mergePath">
                <p v-if="mergeJoin.error" role="alert">{{ mergeJoin.error }}</p>
                <template v-if="mergeJoin.state && !mergeJoin.state.root">
                  <FieldJson field="input_mapping" label="合并连接类型" mode="form" :value-path="mergePath" :schema="mergeJoinSchema"
                    :readonly="locked || pendingPart('nodes.mergeFields') || pendingPart('nodes.mergeJoinFilter') || pendingPart('nodes.mergeSources')" :on-editing-change="value=>pending('nodes.mergeJoinType',value)" />
                  <RendererFilterExpression field="input_mapping" :value-path="[...mergePath,'JoinFilter']" value-format="text" format="spark-object" display="inline"
                    :columns="mergeJoin.state.columns" :function-context="mergeJoin.state.functionContext"
                    :readonly="locked || pendingPart('nodes.mergeFields') || pendingPart('nodes.mergeJoinType') || pendingPart('nodes.mergeSources')" :on-editing-change="value=>pending('nodes.mergeJoinFilter',value)" />
                </template>
                <FieldJson field="input_mapping" label="合并来源字段" mode="rows" :value-path="[...mergePath,'Fields']" :children="mergeFields"
                  :row-operations="mergeFieldOperations" :readonly="locked || pendingPart('nodes.mergeJoinFilter') || pendingPart('nodes.mergeJoinType') || pendingPart('nodes.mergeSources')" :on-editing-change="value=>pending('nodes.mergeFields',value)" />
                <RendererButton label="返回输入列表" :disabled="pendingPart('nodes')" @click="selectMergePath(null)" />
              </template>

    </RendererForm>
   </RendererTabPane>
   <WorkflowQueryConfiguration v-else-if="validModel && (isQueryNode || isCopyNode || isOperationNode)" :key="selectedQueryId" :data-set="dataSet" :workflow-id="workflowId" :node-id="selectedQueryId" :revision="revision" :disabled="locked" :operation="isOperationNode" @pending-change="(key,value)=>pending('query.'+key,value)">
    <template #model-actions>
     <RendererButton :label="isUnconfirmed(fieldsTable) || isUnconfirmed(nodesTable) || isUnconfirmed(modelTable) ? '核验查询配置保存结果' : isOperationNode ? '保存操作配置' : '保存查询配置'" :disabled="busy || pendingPart('nodes') || pendingPart('query')" @click="saveFields" />
     <RendererButton :label="isOperationNode ? '取消操作配置修改' : '取消查询配置修改'" :disabled="busy || unconfirmed" @click="cancelFields" />
     <h3>作为父模型的原服务关系</h3><RendererTable :data-view-key="parentRelationsKey" :children="relationFields" />
     <h3>作为子模型的原服务关系</h3><RendererTable :data-view-key="childRelationsKey" :children="relationFields" />
    </template>
    <template #condition-extra>
     <RendererForm :data-view-key="nodesKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
      <FieldJson field="config" :label="isCopyNode ? '迁移目标配置' : '查询请求配置'" mode="text" :readonly="locked || isCopyNode" :on-change="validateNodeConfig" :on-editing-change="value=>pending('nodes.operation',value)" />
     </RendererForm>
    </template>
   </WorkflowQueryConfiguration>
   <RendererTabPane v-else name="model" :label="isOperationNode ? '数据处理' : '模型参数'" :index="0" :data-view-key="nodesKey"><p>请选择模型后配置字段及参数。</p></RendererTabPane>
   <RendererTabPane name="output" label="节点输出模型" :index="2" :data-view-key="nodesKey">
    <RendererButton v-if="isMergeNode" label="生成输出模型" :data-view-key="nodesKey" perm-action="edit" :disabled="locked || pendingPart('nodes')" @click="generateMergeOutput" />
    <RendererButton v-else-if="isOperationNode && validModel" label="生成输出模型" :data-view-key="nodesKey" perm-action="edit" :disabled="locked || hasPending" @click="generateOperationOutput" />
    <FieldJson field="output_mapping" :label="isMergeNode ? '合并输出模型' : '节点输出模型'" mode="outline" outline-id-field="rowid" outline-parent-field="pid" :children="mergeOutputFields" :readonly="true" />
   </RendererTabPane>
  </RendererTabs>
 </template>
 </template>
</section>
</template>
<script setup lang="ts">

import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {buildDataViewKey,RequestState,type DataSet,type DataRow,type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {parseJsonDocument,type JsonPath,type JsonSchemaObject} from '@spark-appworks/spark-json-document'

import {workflowStartParameterAdapter,saveWorkflowStartParameters} from '@/lowcode/resources/structured-config/workflow-definition/start-parameters'
import {saveWorkflowOperationFields,cancelWorkflowOperationFields} from '@/lowcode/resources/structured-config/workflow-definition/operation-fields'
import {saveWorkflowQueryFields,cancelWorkflowQueryFields} from '@/lowcode/resources/structured-config/workflow-definition/query-fields'
import {workflowCopyTargetConfig} from '@/lowcode/resources/structured-config/workflow-definition/copy-target'
import {workflowMergeInputPresentation,generateWorkflowMergeOutput,validateWorkflowMergeNodeChanges} from '@/lowcode/resources/structured-config/workflow-definition/merge-inputs'
import {workflowNodeTypeEditable,validateWorkflowNodeTypeChanges} from '@/lowcode/resources/structured-config/workflow-definition/node-definition'
import {generateWorkflowOperationOutput,validateWorkflowOperationOutputChanges} from '@/lowcode/resources/structured-config/workflow-definition/operation-output-edit'
import WorkflowQueryNodeCreate from '../workflow-query-node-create.vue'
import WorkflowCopyTarget from '../workflow-copy-target.vue'
import WorkflowMergeSources from '../workflow-merge-sources.vue'
import WorkflowQuerySourceEdit from '../workflow-query-source-edit.vue'
import WorkflowNodeRemove from '../workflow-node-remove.vue'
import WorkflowQueryConfiguration from '../workflow-query-configuration.vue'

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
 /** 本次配置的原节点主键，必须等于原视图当前行。 */
 nodeId:string
 /** 原DataView及控件是否存在待处理修改。 */
 hasPending:boolean
 /** 是否有未结束的边界补齐命令。 */
 boundaryPending:boolean
 /** 原删除命令确认后通知宿主刷新图并结束配置。 */
 onRemoved:()=>Promise<void>
}>()
const emit=defineEmits<{
 /** 通知宿主本控件是否有未确认编辑或在途操作。 */
 pendingChange:[key:string,value:boolean]
 /** 原DataView变化后请求宿主刷新呈现。 */
 changed:[]
 /** 请求宿主在同一实例打开当前节点测试。 */
 test:[]
 /** 本次新建已取消，关闭配置窗口。 */
 dismiss:[]
}>()
const {RendererForm,RendererTable,RendererTabs,RendererTabPane,RendererButton,RendererFilterExpression,FieldText,FieldSelect,FieldJson}=SparkComponent
const dataSet=computed(()=>props.dataSet),workflowId=computed(()=>props.workflowId),loadedTarget=computed(()=>props.workflowId),revision=computed(()=>props.revision)
const scopeDataSet=props.dataSet,scopeWorkflow=props.workflowId
const scene=scopeDataSet.scenarioId,nodesTable='Base_WorkflowNodeDefinition'
const nodesKey=buildDataViewKey(nodesTable,'default',scene)
const activeTab=ref('model')
watch(()=>props.nodeId,()=>{activeTab.value='model'})
const acting=ref(false),error=ref('');let active=true,generation=0
const view=(table:string)=>dataSet.value.getView(table)
const selectedNode=computed(()=>{revision.value;return view(nodesTable)?.currentRow})
const selectedQueryId=computed(()=>props.nodeId),selectedKind=computed(()=>props.nodeId?'node':undefined)
const views=computed(()=>{revision.value;return Object.values(dataSet.value.tables).flatMap(table=>table.viewList)})
const loading=computed(()=>props.busy)
const busy=computed(()=>props.busy||acting.value),unconfirmed=computed(()=>props.unconfirmed),hasPending=computed(()=>props.hasPending)
const locked=computed(()=>props.disabled||acting.value||!selectedNode.value||view(nodesTable)?.getPkKey(selectedNode.value)!==props.nodeId)
const isStartNode=computed(()=>{revision.value;const row=selectedNode.value;return !!row&&view(nodesTable)?.fieldAccess(row,'position_type').read==='visible'&&String(row['position_type'])==='0'})
const isEndNode=computed(()=>{revision.value;const row=selectedNode.value;return !!row&&view(nodesTable)?.fieldAccess(row,'position_type').read==='visible'&&String(row['position_type'])==='2'})
function pending(key:string,value:boolean):void{emit('pendingChange',key,value)}
function pendingPart(prefix:string):boolean{return [...props.pendingKeys].some(key=>key.startsWith(prefix+'.'))}
function validateJson(value:unknown):void{if(typeof value!=='string')throw Error('配置必须是JSON文本');if(value.trim())parseJsonDocument(value)}
function isUnconfirmed(table:string):boolean{return view(table)?.hasUnconfirmedSave===true}
function assertScope():void{if(!active||props.dataSet!==scopeDataSet||props.workflowId!==scopeWorkflow||scopeDataSet.destroyed||!selectedNode.value||view(nodesTable)?.getPkKey(selectedNode.value)!==props.nodeId)throw Error('原节点配置目标已变化')}
watch(acting,value=>emit('pendingChange','object.running',value),{flush:'sync'})

const modelTable='Base_DataModel',fieldsTable='Base_DataModel_Field',relationsTable='Base_DataModel_Relation'
const parametersKey=buildDataViewKey('Base_DataSet','default',scene)
const parentRelationsKey=buildDataViewKey(relationsTable,'asParent',scene),childRelationsKey=buildDataViewKey(relationsTable,'asChild',scene)
const queryCreateApi=ref<InstanceType<typeof WorkflowQueryNodeCreate>>()
const copyTargetApi=ref<InstanceType<typeof WorkflowCopyTarget>>()
const mergeSourceApi=ref<InstanceType<typeof WorkflowMergeSources>>()
const querySourceApi=ref<InstanceType<typeof WorkflowQuerySourceEdit>>()
const nodeRemoveApi=ref<InstanceType<typeof WorkflowNodeRemove>>()
const startView=()=>dataSet.value?.getView(nodesTable,'start')
const startParametersMissing=computed(()=>{revision.value;const params=view('Base_DataSet'),start=startView(),node=selectedNode.value;return !node||params?.rows.length!==1||params.getPkKey(params.rows[0]!)!==workflowId.value||start?.rows.length!==1||start.getPkKey(start.rows[0]!)!==view(nodesTable)?.getPkKey(node)})
const startUnconfirmed=computed(()=>{revision.value;return view('Base_DataSet')?.hasUnconfirmedSave===true||startView()?.hasUnconfirmedSave===true})
const parameterAdapter=computed(()=>workflowStartParameterAdapter(String(selectedNode.value?.['name']??'开始')))
const parameterFields:SparkNode[]=Object.entries({Name:'参数名称',FieldType:'数据类型',Value:'默认值',Description:'参数说明'}).map(([field,label])=>({type:'r-text',props:{field,label}}))
const mergeInputFields:SparkNode[]=Object.entries({Name:'输入节点',JoinType:'连接类型'}).map(([field,label])=>({type:'r-text',props:{field,label}}))
const mergeOutputFields:SparkNode[]=Object.entries({Name:'字段名称',FieldType:'字段类型',Description:'字段说明'}).map(([field,label])=>({type:'r-text',props:{field,label,readonly:true}}))
const mergePath=ref<JsonPath|null>(null),mergeFieldOperations:Array<'edit'>=['edit']
const mergeJoinSchema:JsonSchemaObject={type:'object',required:['JoinType'],properties:{JoinType:{type:'string',title:'连接类型','x-control':'radio',oneOf:[
 {const:'LEFT',title:'左连接'},{const:'RIGHT',title:'右连接'},{const:'INNER',title:'内连接'},{const:'FULL',title:'全连接'},
]}}}
const mergeJoin=computed(()=>{
 revision.value;const ds=dataSet.value,path=mergePath.value
 if(!ds||!path)return {state:undefined,error:''}
 try{return{state:workflowMergeInputPresentation({dataSet:ds,workflowId:workflowId.value,nodeId:selectedQueryId.value,path}),error:''}}
 catch(cause){return{state:undefined,error:cause instanceof Error?cause.message:String(cause)}}
})
const mergeFields:SparkNode[]=[
 ...Object.entries({Name:'字段名称',FieldType:'字段类型'}).map(([field,label])=>({type:'r-text',props:{field,label,readonly:true}})),
 {type:'r-text',props:{field:'AsName',label:'输出名称'}},
 {type:'r-checkbox',props:{field:'IsOutput',label:'输出',trueValue:1,falseValue:0}},
 {type:'r-text',props:{field:'Description',label:'字段说明'}},
]
function selectMergePath(path:JsonPath|null):void{if(path===null||!pendingPart('nodes'))mergePath.value=path===null?null:[...path]}
function nodeModelId(row:DataRow):string{
 const nodes=view(nodesTable);if(!nodes||nodes.fieldAccess(row,'node_type').read!=='visible')throw new Error('节点类型不可读')
 if(nodes.fieldAccess(row,'position_type').read!=='visible')throw new Error('节点位置类型不可读')
 const key=nodes.getPkKey(row);if(key===undefined)throw Error('节点身份缺失')
 const effective=nodes.getEditingRow(key)??row,position=String(effective['position_type']??'').trim()
 if(position!=='1')return ''
 const type=typeof effective['node_type']==='string'?effective['node_type']:''
 if(!['query','copy','add','edit','delete'].includes(type))return ''
 const field=type==='query'||type==='copy'?'node_config':'dataOperateModId'
 for(const key of ['node_config','dataOperateModId'])if(nodes.fieldAccess(row,key).read!=='visible')throw new Error('节点模型身份不可读')
 const other=field==='node_config'?'dataOperateModId':'node_config'
 if(effective[other]!==undefined&&effective[other]!==null&&effective[other]!=='')throw Error('节点存在混合模型绑定，请核查正式配置')
 const id=effective[field];if(id===null||id===undefined||id==='')return ''
 if(typeof id!=='string'||id!==id.trim())throw Error('节点模型身份无效')
 return id
}
const modelBindingIssue=computed(()=>{revision.value;const row=selectedNode.value;if(!row)return '';try{nodeModelId(row);return ''}catch(cause){return cause instanceof Error?cause.message:String(cause)}})
const currentModelId=computed(()=>{revision.value;const row=selectedNode.value;if(!row)return '';try{return nodeModelId(row)}catch{return ''}})
const validModel=computed(()=>{revision.value;const model=view(modelTable),row=model?.rows[0];return !!row&&model?.getPkKey(row)===currentModelId.value&&currentModelId.value!==''})
const missingModel=computed(()=>{revision.value;const model=view(modelTable);return currentModelId.value!==''&&model?.requestState===RequestState.Loaded&&!model.loadingError&&!validModel.value})
const selectedType=computed(()=>{revision.value;const target=view(nodesTable),row=selectedNode.value,key=row&&target?.getPkKey(row);return row&&key!==undefined&&key!==null&&target?.fieldAccess(row,'node_type').read==='visible'?(target.getEditingRow(key)??row)['node_type']:undefined})
const isQueryNode=computed(()=>['query','copy'].includes(String(selectedType.value)))
const isCopyNode=computed(()=>selectedType.value==='copy')
const isMergeNode=computed(()=>selectedType.value==='merge')
const isOperationNode=computed(()=>['add','edit','delete'].includes(String(selectedType.value)))
const nodeTypes=Object.entries({query:'查询',copy:'迁移',add:'新增',edit:'编辑',delete:'删除',merge:'合并'}).map(([value,label])=>({value,label}))
const nodeTypeEditable=computed(()=>{
 revision.value;const ds=dataSet.value,id=selectedQueryId.value
 if(!ds||!id)return false
 try{return workflowNodeTypeEditable({dataSet:ds,workflowId:workflowId.value,nodeId:id})}catch{return false}
})
const nodeDraftOnly=computed(()=>{
 revision.value;const nodes=view(nodesTable),id=selectedNode.value&&nodes?.getPkKey(selectedNode.value)
 if(!nodes||id===undefined)return false
 return views.value.every(target=>target===nodes?!target.rows.some(row=>{const key=target.getPkKey(row);return key!==id&&(target.hasEditingChanges(key)||target.dirtyTracking.hasPendingChanges(key))}):!target.hasEditingChanges()&&!target.dirtyTracking.hasPendingChanges())
})
watch([selectedQueryId,loadedTarget],()=>{mergePath.value=null},{flush:'sync'})
const relationFields:SparkNode[]=Object.entries({parentModId:'父模型',childModId:'子模型',depType:'原服务关系类型',filter:'原服务条件',description:'说明'}).map(([field,label])=>({type:'r-text',props:{field,label,readonly:true}}))
function validateNodeConfig(value:unknown):void{validateJson(value);if(isCopyNode.value&&typeof value==='string'&&value.trim())workflowCopyTargetConfig(value)}
async function loadStartParameters():Promise<void>{
 const params=view('Base_DataSet'),start=startView(),own=generation
 try{if(!params||!start)throw Error('开始参数正式视图缺失');await Promise.all([params.refresh(),start.refresh()]);if(params.loadingError)throw params.loadingError;if(start.loadingError)throw start.loadingError}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
}
async function saveStartParameters():Promise<void>{
 if(busy.value||pendingPart('start')||loadedTarget.value!==workflowId.value||!dataSet.value||!isStartNode.value)return
 const own=generation;acting.value=true;error.value=''
 try{
  const result=await saveWorkflowStartParameters(dataSet.value,workflowId.value);if(!result.success)throw Error(result.message??'开始参数保存未完整确认')
  const targets=[view('Base_DataSet'),startView()],nodes=view(nodesTable)
  if(targets.every(target=>target&&!target.hasUnconfirmedSave&&!target.hasEditingChanges()&&!target.dirtyTracking.hasPendingChanges())&&nodes&&!nodes.hasEditingChanges()&&!nodes.dirtyTracking.hasPendingChanges()){
   const selectedId=nodes.currentRow?nodes.getPkKey(nodes.currentRow):undefined
   await nodes.refresh();if(nodes.loadingError)throw nodes.loadingError
   if(active&&own===generation&&selectedId!==undefined)nodes.setCurrentRow(nodes.rows.find(row=>nodes.getPkKey(row)===selectedId)??null)
  }
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;emit('changed')}}
}
function cancelStartParameters():void{if(busy.value||unconfirmed.value)return;try{view('Base_DataSet')?.discardPendingChanges();startView()?.discardPendingChanges();error.value='';emit('changed')}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function loadNodeModel(row:DataRow):Promise<void>{
 const model=view(modelTable),own=generation;if(!model)return
 try{const modelId=nodeModelId(row);if(!modelId)return;model.queryContext={...model.queryContext,modelId};await model.refresh();if(model.loadingError)throw model.loadingError}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
}
async function queryNodeCreated(id:string):Promise<void>{
 const nodes=view(nodesTable),row=nodes?.rows.find(row=>nodes.getPkKey(row)===id)
 if(!nodes||!row)throw Error('已创建节点未返回当前工作流')
 nodes.setCurrentRow(row);emit('changed')
 await loadNodeModel(row)
}
async function generateMergeOutput():Promise<void>{
 const ds=dataSet.value,id=selectedQueryId.value,own=generation
 if(locked.value||pendingPart('nodes')||!ds||!isMergeNode.value||!id||loadedTarget.value!==workflowId.value)return
 acting.value=true;error.value=''
 try{await generateWorkflowMergeOutput({dataSet:ds,workflowId:workflowId.value,nodeId:id})}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;emit('changed')}}
}
async function generateOperationOutput():Promise<void>{
 const ds=dataSet.value,id=selectedQueryId.value,own=generation
 if(locked.value||hasPending.value||!ds||!isOperationNode.value||!id||loadedTarget.value!==workflowId.value)return
 acting.value=true;error.value=''
 try{await generateWorkflowOperationOutput({dataSet:ds,workflowId:workflowId.value,nodeId:id,assertCurrent:()=>{assertScope();if(!props.visible||props.nodeId!==id||selectedQueryId.value!==id||generation!==own)throw Error('原操作输出窗口已变化')}})}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;emit('changed')}}
}
async function saveFields():Promise<void>{
 if(!isQueryNode.value&&!isCopyNode.value&&!isOperationNode.value){await save(fieldsTable);return}
 const ds=dataSet.value,id=selectedNode.value&&view(nodesTable)?.getPkKey(selectedNode.value),own=generation
 if(busy.value||!ds||typeof id!=='string'||loadedTarget.value!==workflowId.value)return
 acting.value=true;error.value=''
 try{const result=await (isOperationNode.value?saveWorkflowOperationFields:saveWorkflowQueryFields)(ds,workflowId.value,id);if(!result?.success)throw Error(result?.message??'查询字段保存未完整确认')}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;emit('changed')}}
}
async function cancelFields():Promise<void>{
 if(!isQueryNode.value&&!isCopyNode.value&&!isOperationNode.value){cancel(fieldsTable);return}
 const ds=dataSet.value,id=selectedNode.value&&view(nodesTable)?.getPkKey(selectedNode.value),own=generation
 if(busy.value||unconfirmed.value||!ds||typeof id!=='string')return
 acting.value=true;error.value=''
 try{await (isOperationNode.value?cancelWorkflowOperationFields:cancelWorkflowQueryFields)(ds,workflowId.value,id)}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;emit('changed')}}
}
async function save(table:string):Promise<void>{
 if(busy.value)return
 const ds=dataSet.value,target=view(table),own=generation,id=target?.currentRow&&target.getPkKey(target.currentRow)
 if(!target||typeof id!=='string')return
 acting.value=true;error.value=''
 try{assertScope();if(table===nodesTable){if(props.boundaryPending)throw Error('请先保存或取消边界补齐');await validateWorkflowNodeTypeChanges({dataSet:ds,workflowId:workflowId.value,nodeIds:[id]});await validateWorkflowMergeNodeChanges({dataSet:ds,workflowId:workflowId.value,nodeIds:[id]});await validateWorkflowOperationOutputChanges({dataSet:ds,workflowId:workflowId.value,nodeIds:[id]})}
  assertScope();const result=await ds.saveChanges({views:[{tableName:table,viewId:target.viewId,ids:[id]}]});if(!result.success)throw Error(result.message??'保存未完整确认')
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;emit('changed')}}
}
function cancel(table:string):void{
 if(busy.value||unconfirmed.value)return
 try{assertScope();const target=view(table),id=target?.currentRow&&target.getPkKey(target.currentRow);if(!target||id===undefined||id===null)return
  const creating=table===nodesTable&&target.dirtyTracking.isPendingCreate(id);target.discardPendingChanges([id]);error.value='';emit('changed');if(creating)emit('dismiss')
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
async function nodeRemoved():Promise<void>{await props.onRemoved()}
/** 显式放弃整页时仅协调既有子命令，不能越过未知提交守卫。 */
function discardChanges():boolean{try{for(const api of [mergeSourceApi.value,copyTargetApi.value,querySourceApi.value,nodeRemoveApi.value,queryCreateApi.value])if(api&&!api.discardChanges())return false;return !acting.value}catch(cause){error.value=cause instanceof Error?cause.message:String(cause);return false}}
watch([()=>props.nodeId,()=>props.visible],async([id,visible])=>{
 if(!visible||!id)return
 const row=view(nodesTable)?.currentRow;if(!row||view(nodesTable)?.getPkKey(row)!==id)return
 if(isStartNode.value)await loadStartParameters();else await loadNodeModel(row)
},{immediate:true})
defineExpose({discardChanges})
onBeforeUnmount(()=>{active=false;generation++;emit('pendingChange','object.running',false)})

</script>
