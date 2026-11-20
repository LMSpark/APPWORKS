<!--
@module app:views/features/integration/api-management/ui/public-parameter-binding/api-public-parameter-binding-dialog
职责：通过原命名视图选择公共参数，再固定原记录进入重绑或原pending处理。
边界：选择交给标准FieldSelect，保存交给固定记录子窗口，不提供候选数组或保存owner。
-->
<template>
  <RendererDialog v-bind="dialogRule.props" :model-value="true" :close-disabled="!!chosen" @update:model-value="close">
    <SparkComponentRenderer :config="selectorConfig" />
    <SparkComponentRenderer v-for="node in selectorActions" :key="nodeId(node) ?? node.type" :config="node" />
    <BindingRecord v-if="chosen" :preview-rule="previewRule" :key="chosen.epoch" :parameters-key="parametersKey" :record-id="chosen.id" :mode="chosen.mode" :interface-key="interfaceKey" :interface-id="interfaceId" :output-key="outputKey" :output-id="outputId" @finish="finished" />

  </RendererDialog>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {PAGE_RUNTIME,RendererDialog,SparkComponentRenderer,useSparkComponent,type DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
import BindingRecord from './api-public-parameter-binding-record.vue'
import {getSparkNodeChildren,nodeId,type SparkNode} from '@spark-appworks/spark-data'
const props=defineProps<{dialogRule:SparkNode;parametersKey:string;interfaceKey:string;interfaceId:string|number;outputKey:string;outputId:string|number}>()
const emit=defineEmits<{close:[result:DataViewRecordEditingFinish]}>()
const {sparkConsume}=useSparkComponent({type:'api-public-parameter-binding-dialog'})
const runtime=sparkConsume(PAGE_RUNTIME),resolved=runtime?.resolveView(props.parametersKey)
if(!resolved)throw Error('PARAMETER_BINDING_VIEW: 缺少原公共参数视图')
const view=resolved
const openedKey=props.parametersKey
const chosen=ref<{id:string|number;mode:'edit'|'pending';epoch:number}>(),error=ref('')
const rules=getSparkNodeChildren(props.dialogRule.children)
const selectorRule=rules.find(node=>nodeId(node)==='parameter-selector')
const previewRule=rules.find(node=>nodeId(node)==='api-interface-binding-preview')
const selectorField=getSparkNodeChildren(selectorRule?.children)[0]
if(!selectorRule||!selectorField||!previewRule)throw Error('公共参数弹窗配置不完整')
const selectorConfig=computed(()=>({
 ...selectorRule,
 children:[{...selectorField,props:{...selectorField.props,readonly:!!chosen.value}}],
}))
const selectorActions=computed(()=>rules.flatMap<SparkNode>(node=>{
 switch(nodeId(node)){
  case 'parameter-choose': return [{...node,props:{...node.props,disabled:!!chosen.value,onClick:choose}}]
  case 'parameter-selection-error': return error.value?[{...node,props:{...node.props,title:error.value}}]:[]
  case 'parameter-close': return chosen.value?[]:[{...node,props:{...node.props,onClick:close}}]
  default: return []
 }
}))
let epoch=0
function choose():void{
 if(chosen.value)return
 try{
  if(props.parametersKey!==openedKey||runtime?.resolveView(openedKey)!==view||view.destroyed)throw Error('原参数选择视图已变化，请关闭后重新打开')
  const row=view.selectedRows[0],id=row?view.getPkKey(row):undefined
  if(view.selectedRows.length!==1||id===undefined)throw Error('请选择一个原公共参数')
  if(view.hasUnconfirmedSave||view.hasEditingChanges(id))throw Error('参数有未确认提交或未保存输入，请先处理')
  chosen.value={id,mode:view.dirtyTracking.hasPendingChanges(id)?'pending':'edit',epoch:++epoch};error.value=''
 }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
function close():void{if(!chosen.value)emit('close','cancelled')}
function finished(result:DataViewRecordEditingFinish):void{chosen.value=undefined;if(result==='cancelled')view.setSelectedRows([]);if(result==='saved')emit('close',result)}
</script>
