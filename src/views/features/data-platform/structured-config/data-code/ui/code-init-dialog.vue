<!--
@module app:views/features/data-platform/structured-config/data-code/ui/code-init-dialog
职责：按参考初始化布局绑定当前运行空间的参数与初始化DataView。
边界：不持候选数组或业务草稿；保存/取消/日期切换交原资源与标准字段。
AI用途：编码设计宿主传完整主记录视图键，弹窗不接收第二份空间/设计身份。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="设置初始编码" :width="980" :append-to-body="true"
    :close-disabled="busy || dirty || unconfirmed" @update:model-value="close">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="unconfirmed" role="status">保存结果尚未确认，请通过原保存入口核验。</p>
    <p v-if="loading" role="status">正在读取编码初始值…</p>
    <template v-if="ready">
      <div class="code-init-toolbar">
        <RendererForm :data-view-key="inputsKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
          <FieldText field="range" label="序号区间：" :readonly="true" />
          <FieldDate v-if="date.visible" field="date" label="日期：" :date-type="date.dateType" :format="date.format" :value-format="date.valueFormat"
            :readonly="busy || dirty || unconfirmed" :on-change="beforeDateChange" />
        </RendererForm>
        <RendererButton :label="unconfirmed ? '核验保存结果' : '保存'" button-type="primary" :disabled="busy || !dirty && !unconfirmed" @click="save" />
      </div>
      <RendererTable class="code-init-table" :data-view-key="candidateKey" :children="fields" :show-pagination="false" :show-data-view-meta="false" :max-height="420" />
    </template>
    <template #footer>
      <RendererButton label="取消修改" :disabled="busy || unconfirmed || !dirty" @click="cancel" />
      <RendererButton label="放弃修改并关闭" :disabled="busy || unconfirmed" @click="discard" />
      <RendererButton label="确定" button-type="primary" :disabled="busy || dirty || unconfirmed" @click="close" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,shallowRef} from 'vue'
import {buildDataViewKey,parseDataViewKey,RequestState,type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME,FieldDate,FieldText,RendererButton,RendererDialog,RendererForm,RendererTable,useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import type {CodeInitializationWorkspace} from '@/lowcode/resources/structured-config/data-code/initialization-workspace'
import type {InitializationDate} from '@/lowcode/resources/structured-config/data-code/initialization-date'
const props=defineProps<{dataViewKey:string}>(),emit=defineEmits<{close:[]}>()
const {sparkConsume}=useSparkComponent({type:'code-init-dialog'}),runtime=sparkConsume(PAGE_RUNTIME),target=props.dataViewKey
const workspace=shallowRef<CodeInitializationWorkspace>(),loading=ref(true),acting=ref(false),ready=ref(false),error=ref(''),revision=ref(0)
const date=ref<InitializationDate>({visible:false,format:'',valueFormat:'',dateType:'date',value:''})
let active=true,unsubscribe:(()=>void)|undefined
const scope=parseDataViewKey(target)?.scope
const inputsKey=scope?buildDataViewKey('CodeInitializationInput','default',scope):'',candidateKey=scope?buildDataViewKey('CodeInitialization','default',scope):''
const busy=computed(()=>{revision.value;const view=workspace.value?.view;return loading.value||acting.value||view?.mutating===true||view?.requestState===RequestState.Loading||view?.requestState===RequestState.Preparing})
const dirty=computed(()=>{revision.value;const view=workspace.value?.view;return !!view&&(view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())})
const unconfirmed=computed(()=>{revision.value;return workspace.value?.view.hasUnconfirmedSave===true})
const fields=computed<SparkNode[]>(()=>[
  {type:'r-text',props:{field:'prefix',label:'前段编码',minWidth:320,readonly:true,showOverflowTooltip:true}},
  {type:'r-text',props:{field:'InitVal',label:'待使用顺序号',minWidth:260,showCellControl:true,readonly:busy.value||unconfirmed.value}},
])
function current():CodeInitializationWorkspace {
  const instance=workspace.value,main=runtime?.resolveView(target)
  if(!active||props.dataViewKey!==target||!instance||!main||main.dataSet!==instance.view.dataSet)throw new Error('编码初始化宿主目标已改变')
  return instance
}
async function run(command:(instance:CodeInitializationWorkspace)=>unknown):Promise<void>{
  if(busy.value)return
  acting.value=true;error.value=''
  try{await command(current())}catch(cause){if(active)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(active){acting.value=false;revision.value++}}
}
async function save():Promise<void>{await run(async instance=>{const result=await instance.save();if(!result.success)throw new Error(result.message??'初始化保存未完成')})}
async function cancel():Promise<void>{await run(instance=>instance.cancel())}
function close():void {if(busy.value)return;try{workspace.value?.assertClose();emit('close')}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function discard():Promise<void>{await cancel();if(!dirty.value&&!unconfirmed.value)close()}
function beforeDateChange(next:unknown,previous:unknown,control:unknown):void {
  if(Object.is(next,previous))return
  try{if(busy.value)throw new Error('初始化正在处理');current().beforeDateChange()}
  catch(cause){if(control!==null&&typeof control==='object'&&'cancel'in control)control.cancel=true;error.value=cause instanceof Error?cause.message:String(cause)}
}
onMounted(async()=>{
  try{
    const parsed=parseDataViewKey(target),main=runtime?.resolveView(target)
    if(!parsed?.scope||parsed.tableName!=='Base_CodeDesign'||!main?.dataSet||main.viewId!=='default'||main.dataSet.scenarioId!==parsed.scope)throw new Error('初始化缺少本次完整主视图绑定')
    const instance=LowcodeDataCode.initialization(main.dataSet);workspace.value=instance
    const changed=()=>revision.value++
    unsubscribe=main.dataSet.onAnyViewChange({rowsChanged:changed,requestStateChanged:changed,mutatingChanged:changed,editingChanged:table=>{
      changed();if(table===instance.inputs.tableName&&ready.value&&!loading.value&&!acting.value)void run(value=>value.reload())
    }})
    await instance.open();if(!active)return
    date.value=instance.date;ready.value=true
  }catch(cause){if(active)error.value=cause instanceof Error?cause.message:String(cause)}
  finally{if(active)loading.value=false}
})
onBeforeUnmount(()=>{active=false;unsubscribe?.()})
</script>
<style scoped>
.code-init-toolbar {display:flex;align-items:start;gap:16px;margin-bottom:16px;}
.code-init-toolbar :first-child {flex:1;}
.code-init-table {min-height:420px;}
</style>
