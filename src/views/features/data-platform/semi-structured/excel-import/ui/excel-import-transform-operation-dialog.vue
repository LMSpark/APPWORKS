<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-transform-operation-dialog
职责：展示原规则删除确认或明确处理待提交修改的入口。
边界：提交、原异常核验及取消由公共记录操作能力承接，不复制规则草稿。
-->
<template>
  <slot />
</template>
<script setup lang="ts">
import {PAGE_RUNTIME,useSparkComponent,useDataViewRecordEditing} from '@spark-appworks/spark-component'
const props=defineProps<{dataViewKey:string;recordId:string|number;mode:'pending'|'delete'}>()
const emit=defineEmits<{close:[]}>()
const {sparkConsume}=useSparkComponent({type:'excel-import-transform-operation-dialog'})
const {busy,error,ownUnconfirmed,foreignRecovery,recoveryEnded,permissionsPending,confirmedCreation,originalRow,save,cancel,discard}=useDataViewRecordEditing({mode:props.mode,runtime:()=>sparkConsume(PAGE_RUNTIME),dataViewKey:()=>props.dataViewKey,recordId:()=>props.recordId,onFinish:()=>emit('close')})
defineExpose({
  state:()=>({mode:props.mode,busy:busy.value,error:error.value,ownUnconfirmed:ownUnconfirmed.value,
    foreignRecovery:foreignRecovery.value,recoveryEnded:recoveryEnded.value,permissionsPending:permissionsPending.value,
    confirmedCreation:confirmedCreation.value,name:originalRow['rule_name']}),
  save,cancel,discard,
})
</script>
