<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page
-->
<template>
  <section class="workflow-design-page">
    <header><h1>数据工作流设计</h1></header>
    <p v-if="loading" role="status">正在读取工作流设计…</p>
    <p v-if="error || queryError" role="alert">{{ error || queryError }}</p>
    <p v-if="missing" role="alert">当前工作流不存在</p>
    <template v-if="ready && validTarget">
      <RendererForm :data-view-key="definitionKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
        <FieldText field="name" label="工作流名称" :readonly="true" />
        <FieldText field="workflow_key" label="工作流编码" :readonly="true" />
      </RendererForm>
      <p role="status">布局与节点配置分别保存。</p>
      <p v-if="unconfirmed" role="status">保存结果尚未确认，请使用原保存入口核验，勿重复创建。</p>
      <p v-if="layoutMissing" role="status">布局文件不存在；创建前画布位置仅供预览。</p>
      <p v-if="layoutError" role="alert">布局内容无效：{{ layoutError }}</p>
      <WorkflowExecutionPanel v-if="dataSet" :key="loadedTarget" :data-set="dataSet" :workflow-id="workflowId" :node-id="selectedKind === 'node' ? selectedQueryId : ''"
        :revision="revision" :disabled="locked" @pending-change="(key,value)=>pending('execution.'+key,value)" />
      <WorkflowQueryNodeCreate v-if="dataSet" :key="loadedTarget" ref="queryCreateApi" :data-set="dataSet" :workflow-id="workflowId"
        :disabled="locked || (hasPending && !pendingPart('create'))" :on-created="queryNodeCreated" @pending-change="value=>pending('create.query',value)" />
      <WorkflowQuerySourceEdit v-if="dataSet" :key="loadedTarget" ref="querySourceApi" :data-set="dataSet" :workflow-id="workflowId" :node-id="selectedQueryId" :revision="revision"
        :operation="isOperationNode" :eligible="selectedKind === 'node' && (isQueryNode || isOperationNode) && validModel && String(selectedNode?.['position_type']) === '1'" :disabled="locked || hasPending" :on-saved="queryNodeCreated" @pending-change="value=>pending('source.query',value)" />
      <WorkflowNodeRemove v-if="dataSet" :key="loadedTarget" ref="nodeRemoveApi" :data-set="dataSet" :workflow-id="workflowId"
        :node-id="selectedQueryId" :operation="isOperationNode" :eligible="selectedKind === 'node' && (isQueryNode || isOperationNode) && String(selectedNode?.['position_type']) === '1'" :data-view-key="nodesKey" :disabled="locked || hasPending" :on-removed="nodeRemoved" @pending-change="value=>pending('remove.node',value)" />
      <div>
        <RendererButton v-if="layoutMissing" label="创建布局" :data-view-key="layoutKey" perm-action="create" :disabled="locked" @click="createLayout" />
        <RendererButton v-if="layoutRow" label="自动对齐" :disabled="locked || !!layoutError" @click="graphApi?.arrange()" />
        <RendererButton v-if="layoutRow" :label="isUnconfirmed(layoutTable) ? '核验布局保存结果' : '保存布局'" :disabled="busy || pendingPart('layout')" @click="save(layoutTable)" />
        <RendererButton v-if="layoutRow" label="取消布局修改" :disabled="busy || unconfirmed" @click="cancel(layoutTable)" />
      </div>
      <RendererForm v-if="layoutRow && layoutError" :data-view-key="layoutKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
        <FieldJson field="content" label="布局原文" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('layout.content',value)" />
      </RendererForm>
      <div class="workflow-workspaces">
        <RendererGraph ref="graphApi" :data-view-key="nodesKey" :edge-data-view-key="edgesKey" label-field="name" description-field="description"
          node-caption-field="node_type" edge-source-field="sourceID" edge-target-field="targetID"
          :connectable-keys="connectableKeys" :on-connect="connectObjects"
          :disabled="locked" :on-select="selectObject" :node-positions="layoutProjection?.nodePositions ?? {}" :edge-paths="layoutProjection?.edgePaths ?? {}"
          :draggable-keys="layoutEditableKeys" :on-node-move="moveLayout" :on-arrange="arrangeLayout" background-pattern="dots" />
        <aside>
          <template v-if="selectedKind === 'node' && selectedNode">
            <section v-if="isStartNode">
              <h2>开始输入参数</h2>
              <p v-if="startParametersMissing && !loading" role="alert">当前流程缺少唯一的开始参数定义或开始节点</p>
              <RendererForm v-if="!startParametersMissing" :data-view-key="parametersKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
                <FieldJson :data-view-key="parametersKey" field="inputParams" label="输入参数" mode="rows" :children="parameterFields" :row-adapter="parameterAdapter" :readonly="locked" :on-editing-change="value=>pending('start.parameters',value)" />
              </RendererForm>
              <RendererButton :label="startUnconfirmed ? '核验开始参数保存结果' : '保存开始参数'" :disabled="busy || pendingPart('start') || startParametersMissing" @click="saveStartParameters" />
              <RendererButton label="取消开始参数修改" :disabled="busy || unconfirmed" @click="cancelStartParameters" />
            </section>
            <template v-else>
            <h2>节点配置</h2>
            <RendererForm :data-view-key="nodesKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
              <FieldText :data-view-key="nodesKey" field="name" label="节点名称" :readonly="locked" />
              <FieldText field="description" label="节点描述" :readonly="locked" />
              <FieldText field="node_type" label="节点类型" :readonly="true" />
              <FieldText field="dataOperateModId" label="数据模型" :readonly="true" />
              <FieldJson field="input_mapping" label="输入映射" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.input',value)" />
              <FieldJson field="output_mapping" label="输出映射" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.output',value)" />
              <FieldText field="node_config" label="查询模型ID" :readonly="true" />
              <FieldJson field="config" label="操作配置" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.operation',value)" />
            </RendererForm>
            <RendererButton :label="isUnconfirmed(nodesTable) ? '核验节点保存结果' : '保存节点'" :disabled="busy || pendingPart('nodes')" @click="save(nodesTable)" />
            <RendererButton label="取消节点修改" :disabled="busy || unconfirmed" @click="cancel(nodesTable)" />
            <p v-if="missingModel" role="alert">当前节点引用的模型不存在或不属于当前流程</p>
            <section v-if="validModel">
              <h2>模型配置</h2>
              <WorkflowQueryConfiguration v-if="(isQueryNode || isOperationNode) && dataSet && selectedQueryId" :key="selectedQueryId" :data-set="dataSet" :workflow-id="workflowId"
                :node-id="selectedQueryId" :revision="revision" :disabled="locked" :operation="isOperationNode" @pending-change="(key,value)=>pending('query.'+key,value)" />
              <template v-else>
              <RendererForm :data-view-key="modelKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
                <FieldText field="Name" label="模型名称" :readonly="true" />
                <FieldText field="MetaName" label="来源资源" :readonly="true" />
                <FieldText field="Type" label="资源类型" :readonly="true" />
                <FieldText field="description" label="模型说明" :readonly="locked" />
              </RendererForm>
              <RendererButton :label="isUnconfirmed(modelTable) ? '核验模型说明保存结果' : '保存模型说明'" :disabled="busy" @click="save(modelTable)" />
              <RendererButton label="取消模型说明修改" :disabled="busy || unconfirmed" @click="cancel(modelTable)" />
              <h3>字段与参数</h3>
              <RendererTable :data-view-key="fieldsKey" :children="modelFields" :highlight-current-row="true" />
              </template>
              <RendererButton :label="isQueryNode ? (isUnconfirmed(fieldsTable) || isUnconfirmed(nodesTable) || isUnconfirmed(modelTable) ? '核验查询配置保存结果' : '保存查询配置') : isOperationNode ? '保存操作配置' : '保存字段配置'" :disabled="busy || pendingPart('nodes') || pendingPart('query')" @click="saveFields" />
              <RendererButton :label="isQueryNode ? '取消查询配置修改' : isOperationNode ? '取消操作配置修改' : '取消字段配置修改'" :disabled="busy || unconfirmed" @click="cancelFields" />
              <h3>作为父模型的原服务关系</h3>
              <RendererTable :data-view-key="parentRelationsKey" :children="relationFields" />
              <h3>作为子模型的原服务关系</h3>
              <RendererTable :data-view-key="childRelationsKey" :children="relationFields" />
            </section>
            </template>
          </template>
          <template v-else-if="selectedKind === 'edge' && selectedEdge">
            <h2>连线配置</h2>
            <RendererForm :data-view-key="edgesKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
              <FieldText field="name" label="连线名称" :readonly="locked" />
              <FieldText field="description" label="连线描述" :readonly="locked" />
              <FieldText field="sourceID" label="来源节点" :readonly="true" />
              <FieldText field="targetID" label="目标节点" :readonly="true" />
              <FieldJson field="params" label="输入参数映射" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('edges.params',value)" />
            </RendererForm>
            <RendererButton :label="isUnconfirmed(edgesTable) ? '核验连线保存结果' : '保存连线'" :disabled="busy || pendingPart('edges')" @click="save(edgesTable)" />
            <RendererButton label="取消连线修改" :disabled="busy || unconfirmed" @click="cancel(edgesTable)" />
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
          <p v-else>请选择节点或连线后编辑</p>
        </aside>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute} from 'vue-router'
import {buildDataViewKey,RequestState,type DataRow,type DataSet,type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {WORKFLOW_LAYOUT_TABLE} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
import {WorkflowLayoutDocument} from '@/lowcode/resources/structured-config/workflow-definition/layout-document'
import {workflowStartParameterAdapter,saveWorkflowStartParameters} from '@/lowcode/resources/structured-config/workflow-definition/start-parameters'
import {WorkflowConnectorCondition} from '@/lowcode/resources/structured-config/workflow-definition/connector-condition'
import {WorkflowConnectors} from '@/lowcode/resources/structured-config/workflow-definition/connectors'
import {saveWorkflowOperationFields,cancelWorkflowOperationFields} from '@/lowcode/resources/structured-config/workflow-definition/operation-fields'
import {saveWorkflowQueryFields,cancelWorkflowQueryFields} from '@/lowcode/resources/structured-config/workflow-definition/query-fields'
import WorkflowQueryNodeCreate from './workflow-query-node-create.vue'
import WorkflowQuerySourceEdit from './workflow-query-source-edit.vue'
import WorkflowNodeRemove from './workflow-node-remove.vue'
import WorkflowQueryConfiguration from './workflow-query-configuration.vue'
import WorkflowExecutionPanel from './workflow-execution-panel.vue'
const {PAGE_RUNTIME,RendererForm,RendererTable,RendererGraph,RendererButton,RendererFilterExpression,FieldText,FieldJson,useSparkComponent}=SparkComponent
const props=defineProps<{rowid?:string}>(),route=useRoute()
const workflowId=computed(()=>props.rowid ?? (typeof route.query['workflowId']==='string'?route.query['workflowId']:''))
const scene=LowcodeWorkflowDefinition.designScenarioId,nodesTable='Base_WorkflowNodeDefinition',edgesTable='Base_WorkflowConnectors'
const nodesKey=buildDataViewKey(nodesTable,'default',scene),edgesKey=buildDataViewKey(edgesTable,'default',scene),definitionKey=buildDataViewKey('Base_WorkflowDefinition','default',scene)
const modelTable='Base_DataModel',fieldsTable='Base_DataModel_Field',relationsTable='Base_DataModel_Relation'
const modelKey=buildDataViewKey(modelTable,'default',scene),fieldsKey=buildDataViewKey(fieldsTable,'default',scene)
const parametersKey=buildDataViewKey('Base_DataSet','default',scene)
const conditionKey=buildDataViewKey(relationsTable,'connector',scene),conditionView=()=>dataSet.value?.getView(relationsTable,'connector')
const parentRelationsKey=buildDataViewKey(relationsTable,'asParent',scene),childRelationsKey=buildDataViewKey(relationsTable,'asChild',scene)
const layoutTable=WORKFLOW_LAYOUT_TABLE,layoutKey=buildDataViewKey(layoutTable,'default',scene),graphApi=ref<SparkComponent.RendererGraphApi>()
const queryCreateApi=ref<InstanceType<typeof WorkflowQueryNodeCreate>>()
const querySourceApi=ref<InstanceType<typeof WorkflowQuerySourceEdit>>()
const nodeRemoveApi=ref<InstanceType<typeof WorkflowNodeRemove>>()
const {sparkProvide,sparkRemove}=useSparkComponent({type:'workflow-design-page'})
const dataSet=shallowRef<DataSet>(),opening=ref(false),ready=ref(false),acting=ref(false),error=ref(''),revision=ref(0),selectedKind=ref<'node'|'edge'>(),inputs=ref(new Set<string>()),loadedTarget=ref('')
let runtime:PageRuntime|undefined,off:(()=>void)|undefined,generation=0,active=true
const view=(table:string)=>dataSet.value?.getView(table)
const views=computed(()=>{revision.value;return Object.values(dataSet.value?.tables??{}).flatMap(table=>table.viewList)})
const validTarget=computed(()=>{revision.value;return view('Base_WorkflowDefinition')?.rows.length===1})
const missing=computed(()=>ready.value&&!validTarget.value)
const loading=computed(()=>{revision.value;return opening.value||views.value.some(v=>v.requestState===RequestState.Preparing||v.requestState===RequestState.Loading)})
const busy=computed(()=>acting.value||loading.value||inputs.value.has('execution.running'))
const unconfirmed=computed(()=>{revision.value;return views.value.some(v=>v.hasUnconfirmedSave)})
const locked=computed(()=>busy.value||unconfirmed.value||inputs.value.has('remove.node')||inputs.value.has('source.query')||loadedTarget.value!==workflowId.value)
const hasPending=computed(()=>{revision.value;return acting.value||inputs.value.size>0||views.value.some(v=>v.hasUnconfirmedSave||v.hasEditingChanges()||v.dirtyTracking.hasPendingChanges())})
useSystemPageDirtySource({get isDirty(){return opening.value||hasPending.value}})
const selectedNode=computed(()=>{revision.value;return view(nodesTable)?.currentRow})
const selectedEdge=computed(()=>{revision.value;return view(edgesTable)?.currentRow})
const selectedEdgeId=computed(()=>{revision.value;const row=selectedEdge.value;return row?view(edgesTable)?.getPkKey(row):undefined})
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
const isStartNode=computed(()=>{revision.value;const node=selectedNode.value;return !!node&&view(nodesTable)?.fieldAccess(node,'position_type').read==='visible'&&String(node['position_type']).trim()==='0'})
const startView=()=>dataSet.value?.getView(nodesTable,'start')
const startParametersMissing=computed(()=>{revision.value;const params=view('Base_DataSet'),start=startView(),node=selectedNode.value;return !node||params?.rows.length!==1||params.getPkKey(params.rows[0]!)!==workflowId.value||start?.rows.length!==1||start.getPkKey(start.rows[0]!)!==view(nodesTable)?.getPkKey(node)})
const startUnconfirmed=computed(()=>{revision.value;return view('Base_DataSet')?.hasUnconfirmedSave===true||startView()?.hasUnconfirmedSave===true})
const parameterAdapter=computed(()=>workflowStartParameterAdapter(String(selectedNode.value?.['name']??'开始')))
const parameterFields:SparkNode[]=Object.entries({Name:'参数名称',FieldType:'数据类型',Value:'默认值',Description:'参数说明'}).map(([field,label])=>({type:'r-text',props:{field,label}}))
function nodeModelId(row:DataRow):string{
 const nodes=view(nodesTable);if(!nodes||nodes.fieldAccess(row,'node_type').read!=='visible')throw new Error('节点类型不可读')
 if(nodes.fieldAccess(row,'position_type').read!=='visible')throw new Error('节点位置类型不可读')
 const position=String(row['position_type']??'').trim()
 if(position!==''&&position!=='1')return ''
 const type=typeof row['node_type']==='string'?row['node_type'].trim().toLowerCase():''
 if(!['query','copy','add','edit','delete'].includes(type))return ''
 const field=type==='query'||type==='copy'?'node_config':'dataOperateModId'
 if(nodes.fieldAccess(row,field).read!=='visible')throw new Error('节点模型身份不可读')
 const id=row[field];return typeof id==='string'?id.trim():''
}
const currentModelId=computed(()=>{revision.value;const row=selectedNode.value;if(!row)return '';try{return nodeModelId(row)}catch{return ''}})
const validModel=computed(()=>{revision.value;const model=view(modelTable),row=model?.rows[0];return !!row&&model?.getPkKey(row)===currentModelId.value&&currentModelId.value!==''})
const missingModel=computed(()=>{revision.value;const model=view(modelTable);return currentModelId.value!==''&&model?.requestState===RequestState.Loaded&&!model.loadingError&&!validModel.value})
const isQueryNode=computed(()=>{revision.value;const target=view(nodesTable),row=selectedNode.value;return !!row&&target?.fieldAccess(row,'node_type').read==='visible'&&row['node_type']==='query'})
const isOperationNode=computed(()=>{revision.value;const target=view(nodesTable),row=selectedNode.value;return !!row&&target?.fieldAccess(row,'node_type').read==='visible'&&['add','edit','delete'].includes(String(row['node_type']))})
const selectedQueryId=computed(()=>{revision.value;const row=selectedNode.value,id=row&&view(nodesTable)?.getPkKey(row);return typeof id==='string'?id:''})
const modelFields=computed<SparkNode[]>(()=>[
 {type:'r-text',props:{field:'Name',label:'字段名称',readonly:true}},
 {type:'r-text',props:{field:'AsName',label:'输出名称',readonly:true}},
 {type:'r-checkbox',props:{field:'IsOutput',label:'输出',trueValue:1,falseValue:0,readonly:true}},
 ...Object.entries({type:'分类',FieldType:'字段类型',description:'字段说明'}).map(([field,label])=>({type:'r-text',props:{field,label,showCellControl:field==='description',cellReadonly:()=>field!=='description'||locked.value}})),
 {type:'r-text',props:{field:'OrderType',label:'排序方向',readonly:true}},
 ...Object.entries({Order:'排序顺序',Group:'分组标记'}).map(([field,label])=>({type:'r-number',props:{field,label,readonly:true}})),
])
const relationFields:SparkNode[]=Object.entries({parentModId:'父模型',childModId:'子模型',depType:'原服务关系类型',filter:'原服务条件',description:'说明'}).map(([field,label])=>({type:'r-text',props:{field,label,readonly:true}}))
const layoutRow=computed(()=>{revision.value;return view(layoutTable)?.rows[0]})
const layoutMissing=computed(()=>{revision.value;const target=view(layoutTable);return target?.requestState===RequestState.Loaded&&!target.loadingError&&target.rows.length===0})
const layoutState=computed(()=>{
 revision.value;const target=view(layoutTable),row=layoutRow.value
 if(!target||!row)return {projection:undefined,error:''}
 if(target.fieldAccess(row,'content').read!=='visible')return {projection:undefined,error:'当前布局内容不可读'}
 const id=target.getPkKey(row),text=(id===undefined?undefined:target.getEditingRow(id)?.['content'])??row['content']
 try{if(typeof text!=='string')throw new Error('布局正文不是文本');return {projection:WorkflowLayoutDocument.read(text),error:''}}
 catch(cause){return {projection:undefined,error:cause instanceof Error?cause.message:String(cause)}}
})
const layoutProjection=computed(()=>layoutState.value.projection),layoutError=computed(()=>layoutState.value.error)
const layoutEditableKeys=computed(()=>{
 revision.value;const target=view(layoutTable),row=layoutRow.value,nodes=view(nodesTable)
 if(locked.value||!target||!row||!nodes||!layoutProjection.value||target.fieldAccess(row,'content').write!=='allowed')return []
 return nodes.rows.flatMap(node=>{const id=nodes.getPkKey(node);return (typeof id==='string'||typeof id==='number')&&nodes.fieldAccess(node,nodes.primaryKey).read==='visible'?[id]:[]})
})
const queryError=computed(()=>{revision.value;return views.value.find(v=>v.loadingError)?.loadingError?.message??''})
function pending(id:string,value:boolean):void{if(value)inputs.value.add(id);else inputs.value.delete(id)}
function pendingPart(prefix:string):boolean{return [...inputs.value].some(id=>id.startsWith(prefix+'.'))}
function validateJson(value:unknown):void{if(typeof value!=='string')throw new Error('配置必须是JSON文本');if(value.trim())parseJsonDocument(value)}
function isUnconfirmed(table:string):boolean{revision.value;return view(table)?.hasUnconfirmedSave===true}
const connectableKeys=computed(()=>{
 revision.value;const nodes=view(nodesTable),edges=view(edgesTable)
 if(locked.value||hasPending.value||!nodes||edges?.addActionState()!=='enabled')return []
 return nodes.rows.flatMap(row=>{const id=nodes.getPkKey(row);return id!==undefined&&nodes.fieldAccess(row,'rowid').read==='visible'&&nodes.fieldAccess(row,'workflow_id').read==='visible'&&row['workflow_id']===workflowId.value?[id]:[]})
})
async function connectObjects(edge:Readonly<{source:string|number;target:string|number}>):Promise<void>{
 const ds=dataSet.value,own=generation;if(!ds||locked.value||hasPending.value)return
 acting.value=true;error.value=''
 try{await WorkflowConnectors.add(ds,workflowId.value,edge);if(active&&own===generation)selectedKind.value='edge'}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function selectObject(event:SparkComponent.GraphSelection):void{
 if(locked.value||hasPending.value){event.control.cancel=true;return}
 const target=view(event.kind==='node'?nodesTable:edgesTable),row=target?.rows.find(row=>target.getPkKey(row)===event.id)
 if(!row){event.control.cancel=true;return}
 target?.setCurrentRow(row);selectedKind.value=event.kind;revision.value++
 if(event.kind==='node'){if(isStartNode.value)void loadStartParameters();else void loadNodeModel(row)}
 else void loadCondition()
}
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
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function cancelCondition():void{if(busy.value||unconfirmed.value)return;try{conditionView()?.discardPendingChanges();error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
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
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function cancelStartParameters():void{if(busy.value||unconfirmed.value)return;try{view('Base_DataSet')?.discardPendingChanges();startView()?.discardPendingChanges();error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function loadNodeModel(row:DataRow):Promise<void>{
 const model=view(modelTable),own=generation;if(!model)return
 try{const modelId=nodeModelId(row);if(!modelId)return;model.queryContext={...model.queryContext,modelId};await model.refresh();if(model.loadingError)throw model.loadingError}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
}
async function queryNodeCreated(id:string):Promise<void>{
 const nodes=view(nodesTable),row=nodes?.rows.find(row=>nodes.getPkKey(row)===id)
 if(!nodes||!row)throw Error('已创建节点未返回当前工作流')
 nodes.setCurrentRow(row);selectedKind.value='node';revision.value++
 await loadNodeModel(row)
}
async function nodeRemoved():Promise<void>{
 const ds=dataSet.value,own=generation;if(!ds)throw Error('工作流实例已失效')
 for(const table of [nodesTable,edgesTable,layoutTable]){const target=ds.getView(table);if(!target)throw Error('工作流视图已失效');await target.refresh();if(!active||own!==generation||ds!==dataSet.value)throw Error('工作流实例已变化');if(target.loadingError)throw target.loadingError}
 selectedKind.value=undefined;revision.value++
}
onBeforeRouteLeave(()=>!hasPending.value)
onBeforeRouteUpdate(()=>!hasPending.value)
defineExpose({hasPending,busy,unconfirmed,discardChanges:discardAll})
watch(workflowId,async id=>{
 if(hasPending.value){error.value='请先保存或取消当前工作流修改';return}
 const own=++generation;off?.();sparkRemove(PAGE_RUNTIME);runtime?.dispose();runtime=undefined;dataSet.value=undefined;ready.value=false;opening.value=true;selectedKind.value=undefined;error.value='';inputs.value.clear()
 try{
  if(!id.trim())throw new Error('缺少 workflowId 参数')
  const page=new PageRuntime({pageId:'workflow-design-page',scenarioIds:[scene],scenarioInputs:{[scene]:{workflowId:id}},loadScenario:()=>LowcodeWorkflowDefinition.loadEditor(scene)})
  runtime=page;await page.load();if(!active||own!==generation){page.dispose();return}
  dataSet.value=page.getDataSet(scene);const ds=dataSet.value,definition=view('Base_WorkflowDefinition')
  if(!ds||!definition||!view(nodesTable)||!view(edgesTable)||!view(layoutTable))throw new Error('工作流正式设计视图缺失')
  const changed=()=>revision.value++
  off=ds.onAnyViewChange({rowsChanged:changed,currentRowChanged:changed,selectedRowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed})
  await definition.refresh();if(definition.loadingError)throw definition.loadingError
  if(!active||own!==generation)return
  if(definition.rows.length>1)throw new Error('工作流身份不唯一')
  loadedTarget.value=id
  if(definition.rows.length===1){sparkProvide(PAGE_RUNTIME,page);await Promise.all([view(nodesTable)!.refresh(),view(edgesTable)!.refresh(),view(layoutTable)!.refresh()])}
  if(active&&own===generation)ready.value=true
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)opening.value=false}
},{immediate:true})
async function save(table:string):Promise<void>{
 if(busy.value||loadedTarget.value!==workflowId.value)return
 const target=view(table),ds=dataSet.value,own=generation;if(!target||!ds)return
 acting.value=true;error.value=''
 try{const id=target.currentRow&&target.getPkKey(target.currentRow)
  const result=table===edgesTable&&typeof id==='string'?await WorkflowConnectors.save(ds,workflowId.value,id):await ds.saveChanges({views:[{tableName:table,viewId:'default'}]})
  if(!result.success)throw new Error(result.message??'保存未完整确认')
  if(table===edgesTable&&active&&own===generation)await loadCondition()
 }
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
async function saveFields():Promise<void>{
 if(!isQueryNode.value&&!isOperationNode.value){await save(fieldsTable);return}
 const ds=dataSet.value,id=selectedNode.value&&view(nodesTable)?.getPkKey(selectedNode.value),own=generation
 if(busy.value||!ds||typeof id!=='string'||loadedTarget.value!==workflowId.value)return
 acting.value=true;error.value=''
 try{const result=await (isOperationNode.value?saveWorkflowOperationFields:saveWorkflowQueryFields)(ds,workflowId.value,id);if(!result?.success)throw Error(result?.message??'查询字段保存未完整确认')}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
async function cancelFields():Promise<void>{
 if(!isQueryNode.value&&!isOperationNode.value){cancel(fieldsTable);return}
 const ds=dataSet.value,id=selectedNode.value&&view(nodesTable)?.getPkKey(selectedNode.value),own=generation
 if(busy.value||unconfirmed.value||!ds||typeof id!=='string')return
 acting.value=true;error.value=''
 try{await (isOperationNode.value?cancelWorkflowOperationFields:cancelWorkflowQueryFields)(ds,workflowId.value,id)}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
async function createLayout():Promise<void>{
 if(locked.value||!layoutMissing.value)return
 const target=view(layoutTable),nodes=view(nodesTable),edges=view(edgesTable);if(!target||!nodes||!edges)return
 try{
  const keys=nodes.rows.map(row=>{const id=nodes.getPkKey(row);if((typeof id!=='string'&&typeof id!=='number')||nodes.fieldAccess(row,nodes.primaryKey).read!=='visible')throw new Error('布局节点身份不可读');return id})
  const links=edges.rows.map(row=>{
   const id=edges.getPkKey(row),source=row['sourceID'],target=row['targetID']
   if((typeof id!=='string'&&typeof id!=='number')||edges.fieldAccess(row,edges.primaryKey).read!=='visible'||edges.fieldAccess(row,'sourceID').read!=='visible'||edges.fieldAccess(row,'targetID').read!=='visible'||(typeof source!=='string'&&typeof source!=='number')||(typeof target!=='string'&&typeof target!=='number'))throw new Error('布局连线身份或端点不可读')
   return {id,source,target}
  })
  const content=JSON.stringify({nodes:SparkComponent.GraphLayout.positions(keys,links),edges:links.map(edge=>({id:edge.id,sourceNodeId:edge.source,targetNodeId:edge.target}))})
  target.setCurrentRow(await target.addRow({content}));error.value='';revision.value++
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
function writeLayout(nodes:ReadonlyArray<Readonly<{id:string|number;x:number;y:number}>>,edges:SparkComponent.GraphNodeMove['edges']):void{
 const target=view(layoutTable),row=layoutRow.value,edgeView=view(edgesTable);if(!target||!row||!edgeView||locked.value||!layoutProjection.value)throw new Error('当前布局不可修改')
 if(nodes.some(node=>!layoutEditableKeys.value.includes(node.id))||edges.some(edge=>!edgeView.rows.some(row=>edgeView.getPkKey(row)===edge.id)))throw new Error('布局修改对象不属于当前工作流')
 const id=target.getPkKey(row);if(id===undefined)throw new Error('布局身份缺失')
 const originalContent=target.getEditingRow(id)?.['content']??row['content'];if(typeof originalContent!=='string')throw new Error('布局正文不是文本')
 let content=originalContent
 for(const [index,node] of nodes.entries())content=WorkflowLayoutDocument.move(content,{...node,edges:index===0?edges:[]})
 target.updateEditingValue(id,'content',content);revision.value++
}
function moveLayout(event:SparkComponent.GraphNodeMove):void{try{writeLayout([event],event.edges);error.value=''}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function arrangeLayout(event:SparkComponent.GraphArrange):void{try{writeLayout(event.nodes,event.edges);error.value=''}catch(cause){event.control.cancel=true;error.value=cause instanceof Error?cause.message:String(cause)}}
function cancel(table:string):void{if(busy.value||unconfirmed.value)return;try{view(table)?.discardPendingChanges();error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function discardAll():boolean{if(busy.value||unconfirmed.value)return false;try{if(querySourceApi.value&&!querySourceApi.value.discardChanges())return false;if(nodeRemoveApi.value&&!nodeRemoveApi.value.discardChanges())return false;if(queryCreateApi.value&&!queryCreateApi.value.discardChanges())return false;for(const target of views.value)if(target.hasEditingChanges()||target.dirtyTracking.hasPendingChanges()||inputs.value.size>0)target.discardPendingChanges();revision.value++;return !hasPending.value}catch(cause){error.value=cause instanceof Error?cause.message:String(cause);return false}}
onBeforeUnmount(()=>{active=false;generation++;off?.();sparkRemove(PAGE_RUNTIME);runtime?.dispose()})
</script>
<style scoped>
.workflow-design-page{display:grid;gap:12px;padding:24px}
.workflow-workspaces{display:grid;grid-template-columns:minmax(0,1fr) 380px;min-height:560px;gap:20px}
.workflow-workspaces aside{min-width:0}
</style>
