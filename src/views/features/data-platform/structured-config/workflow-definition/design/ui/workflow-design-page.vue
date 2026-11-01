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
      <RendererForm :data-view-key="definitionKey" :auto-columns="false" :show-data-view-meta="false">
        <FieldText field="name" label="工作流名称" :readonly="true" />
        <FieldText field="workflow_key" label="工作流编码" :readonly="true" />
      </RendererForm>
      <p role="status">节点新增归属尚缺正式模型合同。布局与节点配置分别保存。</p>
      <p v-if="unconfirmed" role="status">保存结果尚未确认，请使用原保存入口核验，勿重复创建。</p>
      <p v-if="layoutMissing" role="status">布局文件不存在；创建前画布位置仅供预览。</p>
      <p v-if="layoutError" role="alert">布局内容无效：{{ layoutError }}</p>
      <div>
        <RendererButton v-if="layoutMissing" label="创建布局" :data-view-key="layoutKey" perm-action="create" :disabled="locked" @click="createLayout" />
        <RendererButton v-if="layoutRow" label="自动对齐" :disabled="locked || !!layoutError" @click="graphApi?.arrange()" />
        <RendererButton v-if="layoutRow" :label="isUnconfirmed(layoutTable) ? '核验布局保存结果' : '保存布局'" :disabled="busy || pendingPart('layout')" @click="save(layoutTable)" />
        <RendererButton v-if="layoutRow" label="取消布局修改" :disabled="busy || unconfirmed" @click="cancel(layoutTable)" />
      </div>
      <RendererForm v-if="layoutRow && layoutError" :data-view-key="layoutKey" :auto-columns="false" :show-data-view-meta="false">
        <FieldJson field="content" label="布局原文" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('layout.content',value)" />
      </RendererForm>
      <div class="workflow-workspaces">
        <RendererGraph ref="graphApi" :data-view-key="nodesKey" :edge-data-view-key="edgesKey" label-field="name" description-field="description"
          node-caption-field="node_type" edge-source-field="sourceID" edge-target-field="targetID"
          :disabled="locked" :on-select="selectObject" :node-positions="layoutProjection?.nodePositions ?? {}" :edge-paths="layoutProjection?.edgePaths ?? {}"
          :draggable-keys="layoutEditableKeys" :on-node-move="moveLayout" :on-arrange="arrangeLayout" background-pattern="dots" />
        <aside>
          <template v-if="selectedKind === 'node' && selectedNode">
            <h2>节点配置</h2>
            <RendererForm :data-view-key="nodesKey" :auto-columns="false" :show-data-view-meta="false">
              <FieldText :data-view-key="nodesKey" field="name" label="节点名称" :readonly="locked" />
              <FieldText field="description" label="节点描述" :readonly="locked" />
              <FieldText field="node_type" label="节点类型" :readonly="true" />
              <FieldText field="dataOperateModId" label="数据模型" :readonly="true" />
              <FieldJson field="input_mapping" label="输入映射" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.input',value)" />
              <FieldJson field="output_mapping" label="输出映射" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.output',value)" />
              <FieldJson field="node_config" label="节点配置" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.config',value)" />
              <FieldJson field="config" label="操作配置" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.operation',value)" />
            </RendererForm>
            <RendererButton :label="isUnconfirmed(nodesTable) ? '核验节点保存结果' : '保存节点'" :disabled="busy || pendingPart('nodes')" @click="save(nodesTable)" />
            <RendererButton label="取消节点修改" :disabled="busy || unconfirmed" @click="cancel(nodesTable)" />
          </template>
          <template v-else-if="selectedKind === 'edge' && selectedEdge">
            <h2>连线配置</h2>
            <RendererForm :data-view-key="edgesKey" :auto-columns="false" :show-data-view-meta="false">
              <FieldText field="name" label="连线名称" :readonly="locked" />
              <FieldText field="description" label="连线描述" :readonly="locked" />
              <FieldText field="sourceID" label="来源节点" :readonly="true" />
              <FieldText field="targetID" label="目标节点" :readonly="true" />
              <FieldJson field="params" label="输入参数映射" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('edges.params',value)" />
            </RendererForm>
            <RendererButton :label="isUnconfirmed(edgesTable) ? '核验连线保存结果' : '保存连线'" :disabled="busy || pendingPart('edges')" @click="save(edgesTable)" />
            <RendererButton label="取消连线修改" :disabled="busy || unconfirmed" @click="cancel(edgesTable)" />
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
import {buildDataViewKey,RequestState,type DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {WORKFLOW_LAYOUT_TABLE} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
import {WorkflowLayoutDocument} from '@/lowcode/resources/structured-config/workflow-definition/layout-document'
const {PAGE_RUNTIME,RendererForm,RendererGraph,RendererButton,FieldText,FieldJson,useSparkComponent}=SparkComponent
const props=defineProps<{rowid?:string}>(),route=useRoute()
const workflowId=computed(()=>props.rowid ?? (typeof route.query['workflowId']==='string'?route.query['workflowId']:''))
const scene=LowcodeWorkflowDefinition.designScenarioId,nodesTable='Base_WorkflowNodeDefinition',edgesTable='Base_WorkflowConnectors'
const nodesKey=buildDataViewKey(nodesTable,'default',scene),edgesKey=buildDataViewKey(edgesTable,'default',scene),definitionKey=buildDataViewKey('Base_WorkflowDefinition','default',scene)
const layoutTable=WORKFLOW_LAYOUT_TABLE,layoutKey=buildDataViewKey(layoutTable,'default',scene),graphApi=ref<SparkComponent.RendererGraphApi>()
const {sparkProvide,sparkRemove}=useSparkComponent({type:'workflow-design-page'})
const dataSet=shallowRef<DataSet>(),opening=ref(false),ready=ref(false),acting=ref(false),error=ref(''),revision=ref(0),selectedKind=ref<'node'|'edge'>(),inputs=ref(new Set<string>()),loadedTarget=ref('')
let runtime:PageRuntime|undefined,off:(()=>void)|undefined,generation=0,active=true
const view=(table:string)=>dataSet.value?.getView(table)
const views=computed(()=>Object.values(dataSet.value?.tables??{}).flatMap(table=>table.viewList))
const validTarget=computed(()=>{revision.value;return view('Base_WorkflowDefinition')?.rows.length===1})
const missing=computed(()=>ready.value&&!validTarget.value)
const loading=computed(()=>{revision.value;return opening.value||views.value.some(v=>v.requestState===RequestState.Preparing||v.requestState===RequestState.Loading)})
const busy=computed(()=>acting.value||loading.value)
const unconfirmed=computed(()=>{revision.value;return views.value.some(v=>v.hasUnconfirmedSave)})
const locked=computed(()=>busy.value||unconfirmed.value||loadedTarget.value!==workflowId.value)
const hasPending=computed(()=>{revision.value;return acting.value||inputs.value.size>0||views.value.some(v=>v.hasUnconfirmedSave||v.hasEditingChanges()||v.dirtyTracking.hasPendingChanges())})
useSystemPageDirtySource({get isDirty(){return opening.value||hasPending.value}})
const selectedNode=computed(()=>{revision.value;return view(nodesTable)?.currentRow})
const selectedEdge=computed(()=>{revision.value;return view(edgesTable)?.currentRow})
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
function selectObject(event:SparkComponent.GraphSelection):void{
 if(locked.value||hasPending.value){event.control.cancel=true;return}
 const target=view(event.kind==='node'?nodesTable:edgesTable),row=target?.rows.find(row=>target.getPkKey(row)===event.id)
 if(!row){event.control.cancel=true;return}
 target?.setCurrentRow(row);selectedKind.value=event.kind;revision.value++
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
 try{const result=await ds.saveChanges({views:[{tableName:table,viewId:'default'}]});if(!result.success)throw new Error(result.message??'保存未完整确认')}
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
function discardAll():boolean{if(busy.value||unconfirmed.value)return false;try{for(const target of views.value)if(target.hasEditingChanges()||target.dirtyTracking.hasPendingChanges()||inputs.value.size>0)target.discardPendingChanges();revision.value++;return !hasPending.value}catch(cause){error.value=cause instanceof Error?cause.message:String(cause);return false}}
onBeforeUnmount(()=>{active=false;generation++;off?.();sparkRemove(PAGE_RUNTIME);runtime?.dispose()})
</script>
<style scoped>
.workflow-design-page{display:grid;gap:12px;padding:24px}
.workflow-workspaces{display:grid;grid-template-columns:minmax(0,1fr) 380px;min-height:560px;gap:20px}
.workflow-workspaces aside{min-width:0}
</style>
