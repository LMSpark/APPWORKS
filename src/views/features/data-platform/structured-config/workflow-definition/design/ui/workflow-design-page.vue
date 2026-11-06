<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page
职责：按本次工作流身份绑定正式定义、节点、连线和配置，编排同一DataView命令。
边界：标准组件读取/编辑原视图，不在页面重建查询、草稿、保存或后端合并逻辑。
AI用途：恢复工作流业务工作区时复用当前PageRuntime、标准字段与同一元数据DataSet。
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
      <p v-if="boundaryCompletion?.confirmed && boundaryCompletion.createdStart" role="status">开始节点已补齐；请选中开始节点，核对已有输入并保存开始参数以同步输出。</p>
      <p v-if="boundaries.error" role="alert">{{ boundaries.error }}</p>
      <p v-else-if="boundaries.missing.length" role="status">缺少{{ boundaries.missing.includes(0) ? '开始' : '' }}{{ boundaries.missing.length === 2 ? '和' : '' }}{{ boundaries.missing.includes(2) ? '结束' : '' }}节点，请补齐后保存。</p>
      <RendererButton v-if="boundaries.missing.length && !boundaryActive" label="补齐缺失边界" :data-view-key="nodesKey" perm-action="create" :disabled="locked || hasPending" @click="changeBoundaries('stage')" />
      <template v-if="boundaryActive">
        <RendererButton :label="boundaryCompletion?.submitted ? '核验边界保存结果' : '保存边界节点'" :disabled="busy" @click="changeBoundaries('save')" />
        <RendererButton v-if="boundaryCompletion?.canAcceptCurrent" label="读取并采用当前正式边界结果" :disabled="busy" @click="changeBoundaries('accept')" />
        <RendererButton v-if="boundaryCompletion?.canFinishCurrent" label="结束原边界意图，保留当前正式结果" :disabled="busy" @click="changeBoundaries('finish')" />
        <RendererButton v-if="boundaryCompletion?.canDiscardNotApplied" label="放弃未生效的边界补齐" :disabled="busy" @click="changeBoundaries('discard')" />
        <RendererButton label="取消边界补齐" :disabled="!boundaryCompletion?.canCancel" @click="changeBoundaries('cancel')" />
      </template>
      <RendererButton label="测试" :disabled="locked || hasPending" @click="executionApi?.open('workflow')" />
      <WorkflowExecutionPanel v-if="dataSet" ref="executionApi" :key="loadedTarget" :data-set="dataSet" :workflow-id="workflowId" :node-id="selectedKind === 'node' ? selectedQueryId : ''"
        :revision="revision" :disabled="locked" @pending-change="(key,value)=>pending('execution.'+key,value)" />
      <RendererButton label="新增节点" :data-view-key="nodesKey" action="append-row" :set-current-row-on-success="true"
        :append-payload="{workflow_id:workflowId,position_type:1,node_type:'query',node_config:'',dataOperateModId:'',name:'',description:'',input_mapping:'[]',output_mapping:'[]',config:''}"
        :disabled="locked || hasPending" />
      <div>
        <RendererButton v-if="layoutMissing" label="创建布局" :data-view-key="layoutKey" perm-action="create" :disabled="locked" @click="createLayout" />
        <RendererButton v-if="layoutRow" label="自动对齐" :disabled="locked || !!layoutError" @click="graphApi?.arrange()" />
        <RendererButton v-if="layoutRow" :label="isUnconfirmed(layoutTable) ? '核验布局保存结果' : '保存布局'" :disabled="busy || pendingPart('layout')" @click="save(layoutTable)" />
        <RendererButton v-if="layoutRow" label="取消布局修改" :disabled="busy || unconfirmed" @click="cancel(layoutTable)" />
      </div>
      <RendererForm v-if="layoutRow && layoutError" :data-view-key="layoutKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
        <FieldJson field="content" label="布局原文" mode="tree" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('layout.content',value)" />
      </RendererForm>
      <RendererButton label="配置所选对象" :disabled="locked || hasPending || !selectedKind" @click="openSelectedObject" />
      <div class="workflow-workspaces">
        <RendererGraph ref="graphApi" :data-view-key="nodesKey" :edge-data-view-key="edgesKey" label-field="name" description-field="description"
          node-caption-field="node_type" edge-source-field="sourceID" edge-target-field="targetID"
          :connectable-keys="connectableKeys" :on-connect="connectObjects" :viewport-controls="true"
          :disabled="locked" :on-select="selectObject" :node-positions="layoutProjection?.nodePositions ?? {}" :edge-paths="layoutProjection?.edgePaths ?? {}"
          :draggable-keys="layoutEditableKeys" :on-node-move="moveLayout" :on-arrange="arrangeLayout" background-pattern="dots" />

        <RendererDialog v-if="dataSet" v-model="objectVisible" :title="objectTitle" :data-view-key="selectedKind === 'edge' ? edgesKey : nodesKey"
          width="1280px" top="4vh" :append-to-body="true" :destroy-on-close="false" :close-disabled="busy || hasPending" :grid-columns="1" :auto-fullscreen-below="960">
          <WorkflowDesignNodePanel v-show="selectedKind === 'node'" :key="loadedTarget" ref="nodePanelApi" :data-set="dataSet" :workflow-id="workflowId" :node-id="selectedKind === 'node' ? selectedQueryId : ''" :visible="objectVisible && selectedKind === 'node'"
            :revision="revision" :disabled="locked" :busy="busy" :unconfirmed="unconfirmed" :has-pending="hasPending" :pending-keys="inputs" :boundary-pending="boundaryActive" :on-removed="nodeRemoved"
            @pending-change="pending" @changed="revision++" @test="executionApi?.open('node')" @dismiss="objectVisible=false" />
          <WorkflowDesignEdgePanel v-show="selectedKind === 'edge'" :key="loadedTarget" :data-set="dataSet" :workflow-id="workflowId" :edge-id="selectedKind === 'edge' ? selectedEdgeId : undefined" :visible="objectVisible && selectedKind === 'edge'"
            :revision="revision" :disabled="locked" :busy="busy" :unconfirmed="unconfirmed" :pending-keys="inputs" @pending-change="pending" @changed="revision++" @dismiss="objectVisible=false" />
          <RendererButton label="关闭配置" :disabled="busy || hasPending" @click="objectVisible=false" />
        </RendererDialog>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">

import {computed,onBeforeUnmount,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute} from 'vue-router'
import {buildDataViewKey,RequestState,type DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {WORKFLOW_LAYOUT_TABLE} from '@/lowcode/resources/structured-config/workflow-definition/layout/layout-resource'
import {WorkflowLayoutDocument} from '@/lowcode/resources/structured-config/workflow-definition/layout/layout-document'
import {WorkflowConnectors} from '@/lowcode/resources/structured-config/workflow-definition/connectors'
import {workflowBoundaryState,WorkflowBoundaryCompletion} from '@/lowcode/resources/structured-config/workflow-definition/boundaries'
import WorkflowExecutionPanel from './workflow-execution-panel.vue'
const {PAGE_RUNTIME,RendererForm,RendererGraph,RendererButton,RendererDialog,FieldText,FieldJson,useSparkComponent}=SparkComponent
import WorkflowDesignNodePanel from './node-panel/workflow-design-node-panel.vue'
import WorkflowDesignEdgePanel from './edge-panel/workflow-design-edge-panel.vue'
const nodePanelApi=ref<InstanceType<typeof WorkflowDesignNodePanel>>()
const executionApi=ref<InstanceType<typeof WorkflowExecutionPanel>>()
const objectVisible=ref(false)
const props=defineProps<{rowid?:string}>(),route=useRoute()
const workflowId=computed(()=>props.rowid ?? (typeof route.query['workflowId']==='string'?route.query['workflowId']:''))
const scene=LowcodeWorkflowDefinition.designScenarioId,nodesTable='Base_WorkflowNodeDefinition',edgesTable='Base_WorkflowConnectors'
const nodesKey=buildDataViewKey(nodesTable,'default',scene),edgesKey=buildDataViewKey(edgesTable,'default',scene),definitionKey=buildDataViewKey('Base_WorkflowDefinition','default',scene)
const layoutTable=WORKFLOW_LAYOUT_TABLE,layoutKey=buildDataViewKey(layoutTable,'default',scene),graphApi=ref<SparkComponent.RendererGraphApi>()
const boundaryCompletion=shallowRef<WorkflowBoundaryCompletion>()
const boundaryActive=computed(()=>{revision.value;return !!boundaryCompletion.value&&!boundaryCompletion.value.complete})
const {sparkProvide,sparkRemove}=useSparkComponent({type:'workflow-design-page'})
const dataSet=shallowRef<DataSet>(),opening=ref(false),ready=ref(false),acting=ref(false),error=ref(''),revision=ref(0),selectedKind=ref<'node'|'edge'>(),inputs=ref(new Set<string>()),loadedTarget=ref('')
let runtime:PageRuntime|undefined,off:(()=>void)|undefined,generation=0,active=true
const view=(table:string)=>dataSet.value?.getView(table)
const views=computed(()=>{revision.value;return Object.values(dataSet.value?.tables??{}).flatMap(table=>table.viewList)})
const validTarget=computed(()=>{revision.value;return view('Base_WorkflowDefinition')?.rows.length===1})
const missing=computed(()=>ready.value&&!validTarget.value)
const loading=computed(()=>{revision.value;return opening.value||views.value.some(v=>v.requestState===RequestState.Preparing||v.requestState===RequestState.Loading)})
const busy=computed(()=>acting.value||loading.value||(inputs.value.has('execution.running')||inputs.value.has('object.running')))
const unconfirmed=computed(()=>{revision.value;return views.value.some(v=>v.hasUnconfirmedSave)})
const locked=computed(()=>busy.value||unconfirmed.value||inputs.value.has('remove.node')||inputs.value.has('source.query')||loadedTarget.value!==workflowId.value)
const hasPending=computed(()=>{revision.value;return boundaryActive.value||acting.value||inputs.value.size>0||views.value.some(v=>v.hasUnconfirmedSave||v.hasEditingChanges()||v.dirtyTracking.hasPendingChanges())})
useSystemPageDirtySource({get isDirty(){return opening.value||hasPending.value}})
const selectedNode=computed(()=>{revision.value;return view(nodesTable)?.currentRow})
const selectedEdge=computed(()=>{revision.value;return view(edgesTable)?.currentRow})
const selectedEdgeId=computed(()=>{revision.value;const row=selectedEdge.value;return row?view(edgesTable)?.getPkKey(row):undefined})
const isStartNode=computed(()=>{revision.value;const node=selectedNode.value;return !!node&&view(nodesTable)?.fieldAccess(node,'position_type').read==='visible'&&String(node['position_type']).trim()==='0'})

const boundaries=computed(()=>{
 revision.value;const empty:{missing:readonly number[];error:string}={missing:[],error:''}
 if(!ready.value||!validTarget.value||!dataSet.value)return empty
 try{return{...workflowBoundaryState({dataSet:dataSet.value,workflowId:workflowId.value}),error:''}}
 catch(cause){return{...empty,error:cause instanceof Error?cause.message:String(cause)}}
})
const selectedQueryId=computed(()=>{revision.value;const row=selectedNode.value,id=row&&view(nodesTable)?.getPkKey(row);return typeof id==='string'?id:''})
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
 try{await WorkflowConnectors.add(ds,workflowId.value,edge);if(active&&own===generation){selectedKind.value='edge';objectVisible.value=true}}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
function selectObject(event:SparkComponent.GraphSelection):void{
 if(locked.value||hasPending.value){event.control.cancel=true;return}
 const target=view(event.kind==='node'?nodesTable:edgesTable),row=target?.rows.find(row=>target.getPkKey(row)===event.id)
 if(!row){event.control.cancel=true;return}
 target?.setCurrentRow(row);selectedKind.value=event.kind;revision.value++
 if(event.open)objectVisible.value=true
}

async function nodeRemoved():Promise<void>{
 const ds=dataSet.value,own=generation;if(!ds)throw Error('工作流实例已失效')
 for(const table of [nodesTable,edgesTable,layoutTable]){const target=ds.getView(table);if(!target)throw Error('工作流视图已失效');await target.refresh();if(!active||own!==generation||ds!==dataSet.value)throw Error('工作流实例已变化');if(target.loadingError)throw target.loadingError}
 selectedKind.value=undefined;objectVisible.value=false;revision.value++
}
onBeforeRouteLeave(()=>!hasPending.value)
onBeforeRouteUpdate(()=>!hasPending.value)
defineExpose({hasPending,busy,unconfirmed,discardChanges:discardAll})
watch(workflowId,async id=>{
 if(hasPending.value){error.value='请先保存或取消当前工作流修改';return}
 const own=++generation;off?.();sparkRemove(PAGE_RUNTIME);runtime?.dispose();runtime=undefined;dataSet.value=undefined;boundaryCompletion.value=undefined;ready.value=false;opening.value=true;selectedKind.value=undefined;objectVisible.value=false;error.value='';inputs.value.clear()
 try{
  if(!id.trim())throw new Error('缺少 workflowId 参数')
  const page=new PageRuntime({pageId:'workflow-design-page',scenarioIds:[scene],scenarioInputs:{[scene]:{workflowId:id}},loadScenario:()=>LowcodeWorkflowDefinition.loadEditor(scene)})
  runtime=page;await page.load();if(!active||own!==generation){page.dispose();return}
  dataSet.value=page.getDataSet(scene);const ds=dataSet.value,definition=view('Base_WorkflowDefinition')
  if(!ds||!definition||!view(nodesTable)||!view(edgesTable)||!view(layoutTable))throw new Error('工作流正式设计视图缺失')
  const changed=()=>{revision.value++;const nodes=ds.getView(nodesTable),row=nodes?.currentRow,key=row&&nodes?.getPkKey(row);if(key!==undefined&&key!==null&&nodes?.dirtyTracking.isPendingCreate(key)&&row&&nodes.fieldAccess(row,'position_type').read==='visible'&&String(row['position_type'])==='1'){selectedKind.value='node';objectVisible.value=true}}
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
async function changeBoundaries(action:'stage'|'save'|'cancel'|'discard'|'accept'|'finish'):Promise<void>{
 const ds=dataSet.value,own=generation
 if(busy.value||!ds||loadedTarget.value!==workflowId.value)return
 acting.value=true;error.value=''
 try{
  const input={dataSet:ds,workflowId:workflowId.value}
  if(action==='stage'){boundaryCompletion.value=WorkflowBoundaryCompletion.open(input);await boundaryCompletion.value.stage()}
  else if(action==='save')await boundaryCompletion.value?.save()
  else if(action==='accept')await boundaryCompletion.value?.acceptCurrent()
  else if(action==='finish')boundaryCompletion.value?.finishCurrent()
  else if(action==='discard')await boundaryCompletion.value?.discardNotApplied()
  else boundaryCompletion.value?.cancel()
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation){acting.value=false;revision.value++}}
}
async function save(table:string):Promise<void>{
 if(busy.value||loadedTarget.value!==workflowId.value)return
 const target=view(table),ds=dataSet.value,own=generation;if(!target||!ds)return
 acting.value=true;error.value=''
 try{const result=await ds.saveChanges({views:[{tableName:table,viewId:target.viewId}]});if(!result.success)throw Error(result.message??'保存未完整确认')}
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
function discardAll():boolean{
 if(busy.value||unconfirmed.value)return false
 try{if(boundaryActive.value){if(!boundaryCompletion.value?.canCancel)return false;boundaryCompletion.value.cancel()}
  if(nodePanelApi.value&&!nodePanelApi.value.discardChanges())return false
  for(const target of views.value)if(target.hasEditingChanges()||target.dirtyTracking.hasPendingChanges()||inputs.value.size>0)target.discardPendingChanges()
  revision.value++;return !hasPending.value
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause);return false}
}

onBeforeUnmount(()=>{active=false;generation++;off?.();sparkRemove(PAGE_RUNTIME);runtime?.dispose()})
const objectTitle=computed(()=>selectedKind.value==='edge'?'节点关系设置':isStartNode.value?'输入参数设置':'节点设置')
function openSelectedObject():void{if(!locked.value&&!hasPending.value&&selectedKind.value)objectVisible.value=true}

</script>
<style scoped>
.workflow-design-page{display:grid;gap:12px;padding:24px}
.workflow-workspaces{min-width:0;min-height:560px}
</style>
