<!--
@module app:views/features/integration/api-management/ui/public-parameter-binding/api-public-parameter-binding-record
职责：明确确认原公共参数四字段重绑，或处理其原生待提交修改。
边界：固定原rowid，复用原DataView及公共记录操作；不新增参数、不持有可编辑草稿。
-->
<template>
  <section>
    <SparkComponentRenderer v-for="node in recordNodes" :key="nodeId(node) ?? node.type" :config="node" />
  </section>
</template>
<script setup lang="ts">
import {computed,ref,toRaw} from 'vue'
import {getSparkNodeChildren,nodeId,type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
const {PAGE_RUNTIME,SparkComponentRenderer,useSparkComponent,useDataViewRecordEditing}=Components
const props=defineProps<{previewRule:SparkNode;parametersKey:string;recordId:string|number;mode:'edit'|'pending';interfaceKey:string;interfaceId:string|number;outputKey:string;outputId:string|number}>()
const emit=defineEmits<{'finish':[result:Components.DataViewRecordEditingFinish]}>()
const {sparkConsume}=useSparkComponent({type:'api-public-parameter-binding-record'})
const fields=['interfaceId','outputfield','interfaceName','accessPath']
const base={runtime:()=>sparkConsume(PAGE_RUNTIME),dataViewKey:()=>props.parametersKey,recordId:()=>props.recordId,onFinish:(result:Components.DataViewRecordEditingFinish)=>emit('finish',result)}
const editing=useDataViewRecordEditing(props.mode==='edit'?{...base,mode:'edit',editableFields:fields}:{...base,mode:'pending'})
const {view,recordId,originalRow,busy,error,ownUnconfirmed,foreignRecovery,recoveryEnded,hasStaged,confirmedCreation,cancel,discard}=editing
const page=sparkConsume(PAGE_RUNTIME),interfaceKey=props.interfaceKey,outputKey=props.outputKey,interfaceId=props.interfaceId,outputId=props.outputId
const inputInterfaces=page?.resolveView(interfaceKey),inputOutputs=page?.resolveView(outputKey)
const inputInterface=inputInterfaces?.rows.find(row=>inputInterfaces.getPkKey(row)===interfaceId),inputOutput=inputOutputs?.rows.find(row=>inputOutputs.getPkKey(row)===outputId)
if(!page||!inputInterfaces||!inputOutputs||!inputInterface||!inputOutput)throw Error('PARAMETER_BINDING_SOURCE: 缺少原正式接口或输出')
const runtime=page,interfaces=inputInterfaces,outputs=inputOutputs,iface=inputInterface,output=inputOutput
const context=JSON.stringify([interfaces.queryContext,outputs.queryContext])
const source=[iface['ProviderID'],iface['Name'],iface['LinkUrl'],output['tblid'],output['enname']]
const identity=[originalRow['providerId'],originalRow['paramName'],originalRow['desc']]
const message=ref('')
const recordNodes=computed(()=>getSparkNodeChildren(props.previewRule.children).flatMap(node=>{
 const withProps=(runtimeProps:Record<string,unknown>)=>[{...node,props:{...node.props,...runtimeProps}}]
 switch(nodeId(node)){
  case 'parameter-original': return withProps({contextRowId:recordId})
  case 'parameter-interface': return props.mode==='edit'?withProps({contextRowId:interfaceId}):[]
  case 'parameter-output': return props.mode==='edit'?withProps({contextRowId:outputId}):[]
  case 'parameter-edit-help': return props.mode==='edit'?[node]:[]
  case 'parameter-pending-help': return props.mode==='pending'?[node]:[]
  case 'parameter-error': return message.value||error.value?withProps({title:message.value||error.value}):[]
  case 'parameter-cancel': return withProps({
   ...(hasStaged.value||foreignRecovery.value||recoveryEnded.value?{label:'关闭并保留参数修改'}:{}),
   disabled:busy.value||ownUnconfirmed.value,onClick:cancel,
  })
  case 'parameter-discard': return props.mode==='pending'?withProps({
   disabled:busy.value||ownUnconfirmed.value||foreignRecovery.value||confirmedCreation.value,onClick:discard,
  }):[]
  case 'parameter-confirm': return withProps({
   ...(ownUnconfirmed.value?{label:'核验原参数重绑'}:props.mode==='pending'?{label:'继续保存原参数修改'}:{}),
   disabled:busy.value||foreignRecovery.value||recoveryEnded.value||props.mode==='edit'&&hasStaged.value&&!ownUnconfirmed.value,onClick:confirm,
  })
  default: return []
 }
}))

function assertReadable():void{
 for(const field of ['providerId','paramName',...fields])if(view.fieldAccess(originalRow,field).read!=='visible')throw Error(`当前参数字段不可读取：${field}`)
 for(const field of ['ProviderID','Name','LinkUrl'])if(interfaces.fieldAccess(iface,field).read!=='visible')throw Error(`当前接口字段不可读取：${field}`)
 for(const field of ['tblid','enname'])if(outputs.fieldAccess(output,field).read!=='visible')throw Error(`当前输出字段不可读取：${field}`)
}
function assertSource():void{
 if(props.interfaceKey!==interfaceKey||props.outputKey!==outputKey||props.interfaceId!==interfaceId||props.outputId!==outputId||runtime.resolveView(interfaceKey)!==interfaces||runtime.resolveView(outputKey)!==outputs
  ||interfaces.destroyed||outputs.destroyed||JSON.stringify([interfaces.queryContext,outputs.queryContext])!==context
  ||toRaw(interfaces.currentRow)!==toRaw(iface)||toRaw(outputs.currentRow)!==toRaw(output)
  ||!interfaces.rows.some(row=>toRaw(row)===toRaw(iface))||!outputs.rows.some(row=>toRaw(row)===toRaw(output))
  ||interfaces.hasEditingChanges(interfaceId)||interfaces.dirtyTracking.hasPendingChanges(interfaceId)||outputs.hasEditingChanges(outputId)||outputs.dirtyTracking.hasPendingChanges(outputId)
  ||[iface['ProviderID'],iface['Name'],iface['LinkUrl'],output['tblid'],output['enname']].some((value,index)=>!Object.is(value,source[index]))
  ||iface['ProviderID']!==originalRow['providerId']||output['tblid']!==interfaceId)throw Error('PARAMETER_BINDING_STALE: 原接口或输出已变化，请取消后重新选择')
}
async function confirm():Promise<void>{
 if(busy.value||foreignRecovery.value||recoveryEnded.value||props.mode==='edit'&&hasStaged.value&&!ownUnconfirmed.value)return
 message.value=''
 try{
  if(ownUnconfirmed.value||props.mode==='pending'){await editing.save();return}
  assertSource()
  assertReadable()
  if(!editing.current.value||view.dirtyTracking.hasPendingChanges(recordId)||Object.keys(view.getEditingPatch(recordId)??{}).some(field=>!fields.includes(field))
   ||[originalRow['providerId'],originalRow['paramName'],originalRow['desc']].some((value,index)=>!Object.is(value,identity[index])))throw Error('PARAMETER_BINDING_PENDING: 参数已有其他修改，请保留并先处理原修改')
  for(const field of fields)if(view.fieldAccess(originalRow,field).write!=='allowed')throw Error(`当前参数字段不可修改：${field}`)
  const checkpoint=view.createEditingCheckpoint(recordId,fields)
  try{for(const [field,value]of Object.entries({interfaceId,outputfield:output['enname'],interfaceName:iface['Name'],accessPath:iface['LinkUrl']}))view.updateEditingValue(recordId,field,value)}catch(cause){checkpoint.restore();throw cause}finally{checkpoint.release()}
  await editing.save()
 }catch(cause){message.value=cause instanceof Error?cause.message:String(cause)}
}
</script>
