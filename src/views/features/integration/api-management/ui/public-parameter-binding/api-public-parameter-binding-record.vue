<!--
@module app:views/features/integration/api-management/ui/public-parameter-binding/api-public-parameter-binding-record
职责：明确确认原公共参数四字段重绑，或处理其原生待提交修改。
边界：固定原rowid，复用原DataView及公共记录操作；不新增参数、不持有可编辑草稿。
-->
<template>
  <section>
    <RendererForm :data-view-key="parametersKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="paramName" label="公共参数" :readonly="true" />
      <FieldText field="desc" label="说明" :readonly="true" />
      <FieldText field="interfaceName" label="接口名称" :readonly="true" />
      <FieldText field="outputfield" label="输出字段" :readonly="true" />
      <FieldText field="accessPath" label="访问路径" :readonly="true" />
    </RendererForm>
    <template v-if="mode === 'edit'">
      <RendererForm :data-view-key="interfaceKey" :context-row-id="interfaceId" :auto-columns="false" :show-data-view-meta="false">
        <FieldText field="Name" label="拟绑定接口" :readonly="true" />
        <FieldText field="LinkUrl" label="拟访问路径" :readonly="true" />
      </RendererForm>
      <RendererForm :data-view-key="outputKey" :context-row-id="outputId" :auto-columns="false" :show-data-view-meta="false">
        <FieldText field="enname" label="拟输出字段" :readonly="true" />
      </RendererForm>
      <p>确认后只修改本条参数的接口、输出名称、接口名称和访问路径，保留参数名称及说明。</p>
    </template>
    <p v-else>仅处理所选参数的原待提交修改，不重新生成绑定或提交其他记录。</p>
    <p v-if="message || error" role="alert">{{ message || error }}</p>
    <RendererButton :label="hasStaged || foreignRecovery || recoveryEnded ? '关闭并保留参数修改' : '取消参数重绑'" :disabled="busy || ownUnconfirmed" @click="cancel" />
    <RendererButton v-if="mode === 'pending'" label="放弃原参数待提交修改" :disabled="busy || ownUnconfirmed || foreignRecovery || confirmedCreation" @click="discard" />
    <RendererButton :label="ownUnconfirmed ? '核验原参数重绑' : mode === 'pending' ? '继续保存原参数修改' : '确认替换原绑定'" button-type="primary"
      :disabled="busy || foreignRecovery || recoveryEnded || mode === 'edit' && hasStaged && !ownUnconfirmed" @click="confirm" />
  </section>
</template>
<script setup lang="ts">
import {ref,toRaw} from 'vue'
import * as Components from '@spark-appworks/spark-component'
const {PAGE_RUNTIME,RendererForm,FieldText,RendererButton,useSparkComponent,useDataViewRecordEditing}=Components
const props=defineProps<{parametersKey:string;recordId:string|number;mode:'edit'|'pending';interfaceKey:string;interfaceId:string|number;outputKey:string;outputId:string|number}>()
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
