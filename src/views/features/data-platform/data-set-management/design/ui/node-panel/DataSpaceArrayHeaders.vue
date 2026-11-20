<!--
@module app:views/features/data-platform/data-set-management/design/ui/node-panel/DataSpaceArrayHeaders
职责：原生数组表头窗口的标准组件编排，新建与已有数组共用。
边界：只编辑传入定义视图，正式模型与字段提交由既有owner负责。
AI用途：字段名、标题、排序与主键的确认和取消。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="draft.key" title="数据字段编辑" width="min(820px, calc(100vw - 32px))"
    :grid-columns="1" append-to-body :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false">
    <RendererForm :data-view-key="draft.key" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" label-width="0px">
      <FieldJson field="headerDraft" label="" mode="rows" :height="400" :children="children" :readonly="busy" :on-editing-change="value=>editing=value" />
    </RendererForm>
    <p v-if="error" role="alert">{{ error }}</p>
    <template #footer><RendererToolbar :data-view-key="draft.key" justify="end" :children="footer" /></template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, ref} from 'vue'
import {FieldJson, RendererDialog, RendererForm, RendererToolbar} from '@spark-appworks/spark-component'
import type {SparkNode} from '@spark-appworks/spark-data'
import type {DataSpaceArrayHeadersProps} from './data-space-array-headers.props'
const props=defineProps<DataSpaceArrayHeadersProps>()
const emit=defineEmits<{closed:[confirmed:boolean]}>()
const editing=ref(false),busy=ref(false),error=ref('')
const children:SparkNode[]=[
  {type:'r-text',props:{field:'name',label:'列头',minWidth:180,maxlength:100}},
  {type:'r-text',props:{field:'label',label:'描述',minWidth:180,maxlength:200}},
  {type:'r-number',props:{field:'order',label:'排序',width:120,min:0,step:1,controlsPosition:'right'}},
  {type:'r-checkbox',props:{field:'primary',label:'主键',width:90,valueAlign:'center'}},
]
const footer=computed<SparkNode[]>(()=>[
  {type:'r-button',props:{label:'取消','data-action':'cancel-array-headers',disabled:editing.value||busy.value,onClick:cancel}},
  {type:'r-button',props:{label:'保存',buttonType:'primary','data-action':'save-array-headers',disabled:editing.value||busy.value,onClick:save}},
])
function cancel():void{if(editing.value||busy.value)return;props.draft.cancelHeaders();emit('closed',false)}
async function save():Promise<void>{
  if(editing.value||busy.value)return
  busy.value=true;error.value=''
  try{props.draft.applyHeaders();await props.onConfirm?.(props.draft.definition());emit('closed',true)}
  catch(cause){error.value=String(cause);if(!props.draft.view.getEditingRow('array')?.['headerDraft'])props.draft.beginHeaders()}
  finally{busy.value=false}
}
</script>
