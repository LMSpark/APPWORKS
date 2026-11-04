<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-query-configuration
职责：原查询模型的字段、来源入参与Filter绑定；草稿及保存归原DataView和宿主。
-->
<template>
  <RendererForm :data-view-key="modelKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
    <FieldText field="Name" label="模型名称" :readonly="true" />
    <FieldText field="MetaName" label="来源资源" :readonly="true" />
    <FieldText field="Type" label="资源类型" :readonly="true" />
    <FieldText field="description" label="模型说明" :readonly="disabled" />
  </RendererForm>
  <p v-if="presentation.error" role="alert">{{ presentation.error }}</p>
  <p v-for="message in presentation.diagnostics" :key="message" role="status">{{ message }}</p>
  <p v-if="addOperation" role="status">新增操作不使用过滤条件；已有条件不参与执行。</p>
  <template v-if="!addOperation && sourceType && !['接口','视图'].includes(sourceType)">
    <h3>{{ operation ? '数据条件' : '查询条件' }}</h3>
    <RendererFilterExpression :data-view-key="modelKey" field="Filter" format="spark-json" display="inline"
      :columns="presentation.columns" :input-parameter-data-view-key="inputs.dataViewKey" :function-context="operationContext"
      :readonly="disabled || !!presentation.error" :on-editing-change="value=>emit('pendingChange','filter',value)" />
  </template>
  <h3>{{ operation ? '操作输入字段' : '字段与来源参数' }}</h3>
  <WorkflowComputedFieldEditor v-if="!operation" :data-set="dataSet" :workflow-id="workflowId" :node-id="nodeId" :revision="revision" :disabled="disabled"
    :input-parameter-data-view-key="inputs.dataViewKey" @pending-change="value=>emit('pendingChange','computed',value)" />
  <RendererTable :data-view-key="fieldsKey" :children="children" :highlight-current-row="true" />
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,shallowRef,watch} from 'vue'
import {buildDataViewKey,DataViewFilter,type DataSet,type DataRow,type SparkNode} from '@spark-appworks/spark-data'
import {RendererForm,RendererTable,RendererFilterExpression,FieldText} from '@spark-appworks/spark-component'
import {WorkflowQueryInputs,workflowOperationFunctionContext} from '@/lowcode/resources/structured-config/workflow-definition/query-inputs'
import WorkflowComputedFieldEditor from './workflow-computed-field-editor.vue'
const props=defineProps<{dataSet:DataSet;workflowId:string;nodeId:string;revision:number;disabled:boolean;operation?:boolean}>()
const emit=defineEmits<{pendingChange:[key:string,value:boolean]}>()
const inputs=new WorkflowQueryInputs(props.dataSet,props.workflowId,props.nodeId)
const presentation=shallowRef(inputs.refresh())
const operationContext=computed(()=>props.operation?workflowOperationFunctionContext({inputParams:presentation.value.inputs}):DataViewFilter.editorContext({inputParams:presentation.value.inputs}))
watch(()=>props.revision,()=>{presentation.value=inputs.refresh()})
const modelKey=buildDataViewKey('Base_DataModel','default',props.dataSet.scenarioId)
const fieldsKey=buildDataViewKey('Base_DataModel_Field','default',props.dataSet.scenarioId)
const addOperation=computed(()=>{
 props.revision
 const view=props.dataSet.getView('Base_WorkflowNodeDefinition'),row=view?.rows.find(item=>view.getPkKey(item)===props.nodeId)
 return props.operation&&row&&view?.fieldAccess(row,'node_type').read==='visible'&&row['node_type']==='add'
})
const sourceType=computed(()=>{
  props.revision
  const view=props.dataSet.getView('Base_DataModel'),row=view?.rows[0]
  return row&&view?.fieldAccess(row,'Type').read==='visible'&&typeof row['Type']==='string'?row['Type']:''
})
function readonly(row:Readonly<DataRow>,primary=false):boolean{
  const view=props.dataSet.getView('Base_DataModel_Field')
  return props.disabled||!view||view.fieldAccess(row,'type').read!=='visible'||row['type']!=='dataModel'
    ||primary&&(view.fieldAccess(row,'IsPKey').read!=='visible'||Number(row['IsPKey'])===1)
}
function valueReadonly(row:Readonly<DataRow>):boolean{
  const view=props.dataSet.getView('Base_DataModel_Field')
  return props.disabled||!!presentation.value.error||!view||view.fieldAccess(row,'type').read!=='visible'||!['dataModel','inputParams'].includes(String(row['type']))
}
let dialogs=0
function dialogChanged(value:boolean):void{dialogs=Math.max(0,dialogs+(value?1:-1));emit('pendingChange','functions',dialogs>0)}
const children=computed<SparkNode[]>(()=>[
  {type:'r-text',props:{field:'Name',label:'字段名称',readonly:true}},
  ...props.operation?[]:[{type:'r-text',props:{field:'AsName',label:'输出名称',showCellControl:true,cellReadonly:(row:Readonly<DataRow>)=>readonly(row)}},
  {type:'r-checkbox',props:{field:'IsOutput',label:'输出',trueValue:1,falseValue:0,cellReadonly:(row:Readonly<DataRow>)=>readonly(row,true)}}],
  ...Object.entries({type:'分类',FieldType:'字段类型',description:'字段说明'}).map(([field,label])=>({type:'r-text',props:{field,label,showCellControl:field==='description',cellReadonly:()=>field!=='description'||props.disabled}})),
  {type:'r-value-function',props:{field:'ValueFun',label:'值函数 / 来源入参',inputParameterDataViewKey:inputs.dataViewKey,functionContext:operationContext.value,onDialogVisibleChange:dialogChanged,
    cellReadonly:valueReadonly}},
  ...props.operation?[]:[{type:'r-select',props:{field:'OrderType',label:'排序方向',showCellControl:true,cellReadonly:(row:Readonly<DataRow>)=>readonly(row),options:[{label:'不排序',value:''},{label:'升序',value:'ascending'},{label:'降序',value:'descending'}]}},
  ...Object.entries({Order:'排序顺序',Group:'分组标记'}).map(([field,label])=>({type:'r-number',props:{field,label,showCellControl:true,step:1,precision:0,cellReadonly:(row:Readonly<DataRow>)=>readonly(row)}}))],
])
onBeforeUnmount(()=>{inputs.dispose();emit('pendingChange','filter',false);emit('pendingChange','functions',false)})
</script>
