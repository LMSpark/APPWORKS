<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-transform-rule-dialog
职责：在原规则DataView固定单记录上编排编辑、取消及精确保存。
边界：不复制规则草稿、不创建查询或保存owner；未知结果沿原DataSet捕获核验。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" :title="created ? '新增增强规则' : '编辑增强规则'" :width="720" :append-to-body="true" :close-disabled="busy || unconfirmed" @update:model-value="cancel">
    <p role="status">预览出错策略仅影响安全预览；正式导入任意规则失败都会整批回滚。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="foreignRecovery" role="status">同一视图另有未确认提交，请关闭并保留本窗口草稿后核验原提交。</p>
    <p v-if="!current" role="status">原记录已变化，本次编辑会话已失效。</p>
    <RendererForm :data-view-key="dataViewKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="rule_name" label="规则名称" :readonly="locked" />
      <FieldSelect field="rule_type" label="规则类型" :options="typeOptions" :filterable="true" :readonly="locked || pendingInputs" :on-change="changeType" />
      <FieldNumber field="sort_order" label="执行顺序" :readonly="locked" />
      <FieldSelect v-if="sourceRequired" field="source_field" label="来源字段" :option-data-view-key="fieldOptionsKey" :filterable="true" :allow-create="true" :readonly="locked" />
      <FieldSelect v-if="targetRequired" field="target_field" label="目标字段" :option-data-view-key="fieldOptionsKey" :filterable="true" :allow-create="true" :readonly="locked" />
      <FieldSelect field="on_error" label="预览出错" :options="errorOptions" :readonly="locked" />
      <FieldCheckbox field="enabled" label="是否启用" :true-value="1" :false-value="0" :null-checked="true" :readonly="locked" />
      <FieldJson v-if="schema" field="config_json" label="规则配置" mode="form" :schema="schema" :readonly="locked" :on-editing-change="value => pending('config', value)" />
      <FieldJson v-if="kind === 'UNPIVOT'" field="config_json" label="拆解列" mode="rows" :value-path="['columns']" :children="unpivotColumns" :reorderable="true" :readonly="locked" :on-editing-change="value => pending('columns', value)" />
      <FieldJson v-if="!['DEDUPLICATE','PIVOT'].includes(kind)" field="condition_json" label="执行条件" mode="text" :readonly="locked" :on-editing-change="value => pending('condition', value)" />
    </RendererForm>
    <template #footer>
      <RendererButton :label="foreignRecovery || recoveryEnded ? '关闭并保留草稿' : confirmedCreation ? '关闭' : !unconfirmed && hasStaged && !created ? '关闭并保留待提交修改' : '取消'" :disabled="busy || unconfirmed" @click="cancel" />
      <RendererButton :label="permissionsPending ? '回读已保存规则权限' : unconfirmed ? '核验原保存结果' : recoveryEnded ? '原提交已结束，请重新选择' : '保存'" button-type="primary" :disabled="busy || pendingInputs || foreignRecovery || !permissionsPending && (recoveryEnded || !current && !unconfirmed)" @click="save" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import type {SparkNode} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import * as Components from '@spark-appworks/spark-component'
import {EXCEL_TRANSFORM_RULE_TYPES,EXCEL_TRANSFORM_ERROR_POLICIES,createExcelTransformConfig,excelTransformEnumValue} from '@/lowcode/resources/semi-structured/excel-import/transform/definition'
import {excelTransformFormSchema} from '@/lowcode/resources/semi-structured/excel-import/transform/forms'

const {RendererDialog,RendererForm,RendererButton,FieldText,FieldSelect,FieldNumber,FieldCheckbox,FieldJson,PAGE_RUNTIME,useSparkComponent,useDataViewRecordEditing}=Components
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
const unpivotColumns:SparkNode[]=[{type:'r-select',props:{field:'sourceField',label:'来源字段',optionDataViewKey:props.fieldOptionsKey,filterable:true,allowCreate:true}},{type:'r-json',props:{field:'key',label:'键值',valueFormat:'native'}}]
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
</script>
