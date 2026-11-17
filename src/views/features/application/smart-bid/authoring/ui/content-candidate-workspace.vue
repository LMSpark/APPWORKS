<!--
@module app:views/features/application/smart-bid/authoring/ui/content-candidate-workspace
职责：通过标准组件只读呈现已核候选的原修订及节点视图。
边界：只通过原候选绑定读取固定事实，不复制候选、不修改行或生成预演；原证明失效即撤下内容。
AI用途：正文宿主读取候选后传入同次绑定；采用须另完成完整比对、预演与权威提交。
-->
<template>
  <RendererSection title="候选内容" :error="state.error" :status="state.error ? '' : '待比对与预演'" :grid-columns="1">
    <RendererForm v-if="state.revisionKey && state.revisionRowId !== undefined" :data-view-key="state.revisionKey" :context-row-id="state.revisionRowId" :auto-columns="false" :children="revisionFields" />
    <RendererTree v-if="state.nodesKey" :data-view-key="state.nodesKey" node-key="nodeId" :tree-props="treeProps" :children="nodeFields" />
    <RendererSection v-else-if="!state.error" title="本候选尚无正文节点" />
    <RendererSection v-if="state.nodesKey" title="节点详情" :status="state.selectedNode ? '' : '选择节点查看原稿与数据引用'">
      <RendererForm v-if="state.selectedNode" :data-view-key="state.nodesKey" context-data-member="currentRow" :auto-columns="false" :children="detailFields" />
      <RendererButton v-for="reference in factReferences" :key="reference.name" :data-view-key="state.nodesKey" :label="`读取事实：${reference.name}`" :disabled="factLoading" :on-click="reference.read" />
    </RendererSection>
    <RendererSection v-if="factError" title="事实读取失败" :error="factError" />
    <RendererSection v-if="factState" title="固定事实原记录" status="本次用途许可待核">
      <RendererForm :data-view-key="factState.key" :context-row-id="factState.rowId" :auto-columns="false" :children="factFields" />
    </RendererSection>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,toRaw,watch} from 'vue'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME,RendererButton,RendererForm,RendererSection,RendererTree,useSparkComponent} from '@spark-appworks/spark-component'
import type {ContentCandidateBinding,ContentCandidateFactBinding} from '../model/content-candidate-reader'
import {isRecord} from '@spark-appworks/spark-utils'
import {validateContentReference} from '@/services/smart-bid/content-reference'

const props=defineProps<{runtime:PageRuntime;binding:ContentCandidateBinding}>()
const {sparkProvide,sparkRemove}=useSparkComponent({type:'content-candidate-workspace'})
const revision=ref(0)
const factLoading=ref(false)
const factFailure=shallowRef<{message:string;assertSelected:()=>void}>()
const factError=computed(()=>{
 revision.value
 try{factFailure.value?.assertSelected();return factFailure.value?.message??''}catch{return ''}
})
const fact=shallowRef<{binding:ContentCandidateFactBinding;assertSelected:()=>void}>()
let active=true
let unsubscribe:(()=>void)|undefined
const treeProps={defaultExpandAll:true,expandOnClickNode:false,draggable:false}
const revisionFields=[{type:'r-text',props:{field:'id',label:'候选修订',readonly:true}},
 {type:'r-text',props:{field:'baselineId',label:'编制基线',readonly:true}}]
const nodeFields=[{type:'r-text',props:{field:'nodeId',label:'内容标识',readonly:true}},
 {type:'r-text',props:{field:'payload',valuePath:['type'],valueFormat:'native',label:'类型',readonly:true}},
 {type:'r-text',props:{field:'payload',valuePath:['value'],valueFormat:'native',label:'原稿内容',readonly:true}}]
const detailFields=[{type:'r-text',props:{field:'payload',valuePath:['nodeId'],valueFormat:'native',label:'节点标识',readonly:true}},
 {type:'r-text',props:{field:'payload',valuePath:['parentId'],valueFormat:'native',label:'父节点',readonly:true}},
 {type:'r-text',props:{field:'payload',valuePath:['index'],valueFormat:'native',label:'同级顺序',readonly:true}},
 {type:'r-text',props:{field:'payload',valuePath:['type'],valueFormat:'native',label:'节点类型',readonly:true}},
 {type:'r-text',props:{field:'payload',valuePath:['value'],valueFormat:'native',label:'原稿正文',readonly:true}},
 {type:'r-json',props:{field:'payload',valuePath:['class'],valueFormat:'native',mode:'tree',label:'节点分类',readonly:true}},
 {type:'r-json',props:{field:'payload',valuePath:['data'],valueFormat:'native',mode:'tree',label:'节点数据',readonly:true}}]
const factFields=[...['key','version','kind','unit','status'].map(field=>({type:'r-text',props:{field,label:field,readonly:true}})),
 ...['value','sourceIds','claimId','scopeRef','decisionRefs','dependencyRefs','promiseTerms','sourceRecord'].map(field=>({type:'r-json',props:{field,valueFormat:'native',mode:'tree',label:field,readonly:true}}))]
const factReferences=computed(()=>{
 revision.value
 if(!state.value.nodesKey||state.value.error)return []
 const runtime=toRaw(props.runtime),binding=toRaw(props.binding),view=runtime.resolveView(state.value.nodesKey),row=view?.currentRow,payload=row?.['payload']
 if(!view||!row)return []
 if(!isRecord(payload)||!isRecord(payload['data']))return []
 const assertRow=view.captureReadRow(row,['id','nodeId','payload'])
 const assertOrigin=()=>{
  if(!active||toRaw(props.runtime)!==runtime||toRaw(props.binding)!==binding||view.currentRow!==row)throw Error('事实引用已失效')
  binding.assertCurrent();assertRow()
 }
 return Object.entries(payload['data']).flatMap(([name,value])=>isRecord(value)&&value['type']==='fact'
  &&typeof value['factId']==='string'&&validateContentReference(value).length===0?[{name,read:()=>readFact(String(value['factId']),assertOrigin)}]:[])
})
const factState=computed(()=>{
 revision.value
 try{
  if(!active||state.value.error||!fact.value)return null
  fact.value.assertSelected();fact.value.binding.assertCurrent()
  const key=fact.value.binding.factDataViewKey,view=toRaw(props.runtime).resolveView(key),row=view?.rows[0],rowId=row?view?.getPkKey(row):undefined
  return rowId===undefined?null:{key,rowId}
 }catch{return null}
})
async function readFact(factId:string,assertOrigin:()=>void):Promise<void>{
 if(factLoading.value)return
 try{assertOrigin()}catch{return}
 const binding=toRaw(props.binding),runtime=toRaw(props.runtime),key=state.value.nodesKey,view=key?runtime.resolveView(key):undefined,row=view?.currentRow
 if(!view||!row)return
 const assertRow=view.captureReadRow(row,['id','nodeId','payload'])
 const assertSelected=()=>{
  assertOrigin()
  if(!active||toRaw(props.binding)!==binding||toRaw(props.runtime)!==runtime||view.currentRow!==row)throw Error('事实读取上下文已变化')
  binding.assertCurrent();assertRow()
 }
 factLoading.value=true;factFailure.value=undefined;fact.value=undefined
 try{
  assertSelected()
  const result=await binding.readFixedFact({factId},assertSelected);assertSelected();result.assertCurrent()
  fact.value={binding:result,assertSelected}
 }catch(cause){if(active&&toRaw(props.binding)===binding&&toRaw(props.runtime)===runtime)factFailure.value={message:cause instanceof Error?cause.message:String(cause),assertSelected}}
 finally{factLoading.value=false}
}
const state=computed<{revisionKey?:string;revisionRowId?:string|number;nodesKey?:string;selectedNode?:boolean;error:string}>(()=>{
 revision.value
 try{
  const binding=toRaw(props.binding),runtime=toRaw(props.runtime)
  binding.assertCurrent()
  const keys=[binding.revisions.candidateDataViewKey,binding.snapshot.dataViewKey,...(binding.nodes.dataViewKey?[binding.nodes.dataViewKey]:[])]
  if(keys.some(key=>!runtime.resolveView(key)||runtime.resolveView(key)!==binding.runtime.resolveView(key)))throw Error('候选运行实例不匹配')
  const candidate=runtime.resolveView(binding.revisions.candidateDataViewKey),row=candidate?.rows[0]
  const revisionRowId=row?candidate?.getPkKey(row):undefined
  if(revisionRowId===undefined)throw Error('候选修订身份不可用')
  return {revisionKey:binding.revisions.candidateDataViewKey,revisionRowId,
   ...(binding.nodes.dataViewKey?{nodesKey:binding.nodes.dataViewKey,selectedNode:runtime.resolveView(binding.nodes.dataViewKey)?.currentRow!==null}:{}),error:''}
 }catch(cause){
  const message=cause instanceof Error?cause.message:String(cause)
  return {error:message==='候选运行实例不匹配'?message:'候选读取已失效，请重新读取'}
 }
})
watch(()=>[props.runtime,props.binding] as const,()=>{
 fact.value=undefined;factFailure.value=undefined
 unsubscribe?.();unsubscribe=undefined;sparkRemove(PAGE_RUNTIME)
 const runtime=toRaw(props.runtime)
 sparkProvide(PAGE_RUNTIME,runtime)
 const view=runtime.resolveView(props.binding.revisions.candidateDataViewKey)
 const changed=()=>{revision.value++}
 unsubscribe=view?.dataSet?.onAnyViewChange({currentRowChanged:changed,rowsChanged:changed,editingChanged:changed,requestStateChanged:changed,configChanged:changed,mutatingChanged:changed})
 revision.value++
},{immediate:true})
onBeforeUnmount(()=>{active=false;unsubscribe?.();sparkRemove(PAGE_RUNTIME)})
</script>
