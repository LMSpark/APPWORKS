<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-transform-rule-dialog
职责：在原规则DataView固定单记录上编排编辑、取消及精确保存。
边界：不复制规则草稿、不创建查询或保存owner；未知结果沿原DataSet捕获核验。
-->
<template>
  <slot />
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {isRecord} from '@spark-appworks/spark-utils'
import * as Components from '@spark-appworks/spark-component'
import {EXCEL_TRANSFORM_RULE_TYPES,EXCEL_TRANSFORM_ERROR_POLICIES,createExcelTransformConfig,excelTransformEnumValue} from '@/lowcode/resources/semi-structured/excel-import/transform/definition'
import {excelTransformFormSchema} from '@/lowcode/resources/semi-structured/excel-import/transform/forms'

const {PAGE_RUNTIME,useSparkComponent,useDataViewRecordEditing}=Components
const props=withDefaults(defineProps<{dataViewKey:string;recordId:string|number;fieldOptionsKey:string;created?:boolean}>(),{created:false})
const emit=defineEmits<{close:[]}>()
const {sparkConsume}=useSparkComponent({type:'excel-import-transform-rule-dialog'})
const editable=['rule_name','rule_type','source_field','target_field','sort_order','enabled','on_error','condition_json','config_json']
const inputs=ref(new Set<string>()),businessError=ref('')
const editing=useDataViewRecordEditing({mode:'edit',runtime:()=>sparkConsume(PAGE_RUNTIME),dataViewKey:()=>props.dataViewKey,recordId:()=>props.recordId,editableFields:editable,created:()=>props.created,pendingInputs:()=>inputs.value.size>0,onFinish:()=>emit('close')})
const {view,recordId:openedId,originalRow:original,busy,current,ownUnconfirmed:unconfirmed,foreignRecovery,recoveryEnded,permissionsPending,hasStaged,locked,confirmedCreation,cancel}=editing
const error=computed(()=>businessError.value||editing.error.value)
const row=computed(()=>editing.row.value??original)
const kind=computed(()=>excelTransformEnumValue(row.value['rule_type']))
const sourceRequired=computed(()=>['TRIM','REPLACE','CONVERT','EXPLODE','LOOKUP'].includes(kind.value))
const targetRequired=computed(()=>['TRIM','REPLACE','CONVERT','EXPLODE','LOOKUP','COMPUTE','DEFAULT','OVERRIDE'].includes(kind.value))
const pendingInputs=computed(()=>inputs.value.size>0)
const typeOptions=EXCEL_TRANSFORM_RULE_TYPES.map(value=>({value,label:value}))
const errorOptions=EXCEL_TRANSFORM_ERROR_POLICIES.map(value=>({value,label:value}))
const schema=computed(()=>{
 if(!EXCEL_TRANSFORM_RULE_TYPES.some(type=>type===kind.value))return undefined
 const result=excelTransformFormSchema({ruleType:kind.value,fieldOptionsKey:props.fieldOptionsKey})
 if(kind.value==='UNPIVOT')return {...result,properties:Object.fromEntries(Object.entries(result.properties??{}).filter(([name])=>name!=='columns'))}
 return result
})
function pending(name:string,value:boolean):void{if(value)inputs.value.add(name);else inputs.value.delete(name)}
function assertCurrent():void{if(!current.value)throw Error('原规则编辑身份已失效，请关闭后重新打开')}
function message(cause:unknown):void{businessError.value=cause instanceof Error?cause.message:String(cause)}
async function save():Promise<void>{businessError.value='';await editing.save()}
function changeType(next:unknown,previous:unknown,control:unknown):void{
 if(!isRecord(control)||!('cancel' in control))throw Error('缺少类型切换控制')
 control['cancel']=true
 if(excelTransformEnumValue(next)===excelTransformEnumValue(previous))return
 try{
  assertCurrent();if(locked.value||pendingInputs.value)throw Error('请先处理当前输入')
  if(typeof next!=='string')throw Error('规则类型无效')
  const config=createExcelTransformConfig(next)
  if(['PIVOT','UNPIVOT'].includes(next)&&['PIVOT','UNPIVOT'].includes(excelTransformEnumValue(previous))){
   const old:unknown=JSON.parse(String(row.value['config_json']||'{}'))
   if(isRecord(old)&&['EXPORT','BOTH'].includes(excelTransformEnumValue(old['executionScope'])))config['executionScope']=old['executionScope']
  }
  const patch:Record<string,unknown>={rule_type:next,config_json:JSON.stringify(config)}
  if(!['TRIM','REPLACE','CONVERT','EXPLODE','LOOKUP'].includes(next))patch['source_field']=''
  if(!['TRIM','REPLACE','CONVERT','EXPLODE','LOOKUP','COMPUTE','DEFAULT','OVERRIDE'].includes(next))patch['target_field']=''
  if(['DEDUPLICATE','PIVOT'].includes(next))patch['condition_json']=''
  for(const field of Object.keys(patch))if(view.fieldAccess(original,field).write!=='allowed')throw Error(`当前字段不可修改：${field}`)
  const own=view.createEditingCheckpoint(openedId,Object.keys(patch))
  try{for(const [field,value]of Object.entries(patch))view.updateEditingValue(openedId,field,value)}catch(cause){own.restore();throw cause}finally{own.release()}
  businessError.value=''
 }catch(cause){message(cause)}
}
defineExpose({
  state:()=>({
    id:props.recordId,created:props.created,fieldOptionsKey:props.fieldOptionsKey,error:error.value,kind:kind.value,
    busy:busy.value,current:current.value,unconfirmed:unconfirmed.value,foreign:foreignRecovery.value,
    ended:recoveryEnded.value,permissionsPending:permissionsPending.value,hasStaged:hasStaged.value,
    locked:locked.value,confirmedCreation:confirmedCreation.value,pendingInputs:pendingInputs.value,
    source:sourceRequired.value,target:targetRequired.value,schema:schema.value,typeOptions,errorOptions,
  }),
  save,cancel,changeType,pending,
})
</script>
