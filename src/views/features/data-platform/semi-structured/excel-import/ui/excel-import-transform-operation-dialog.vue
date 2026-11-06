<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-transform-operation-dialog
职责：展示原规则删除确认或明确处理待提交修改的入口。
边界：提交、原异常核验及取消由公共记录操作能力承接，不复制规则草稿。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" :title="mode === 'delete' ? '删除增强规则' : '处理本条待提交修改'" :width="520" :append-to-body="true" :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <p>{{ mode === 'delete' ? '确认删除这条增强规则？' : '原视图保留了本条待提交修改。继续保存或明确放弃，只处理当前这条记录。' }}</p>
    <p>规则：{{ originalRow['rule_name'] }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template #footer>
      <RendererButton :label="foreignRecovery ? '关闭并保留草稿' : mode === 'delete' ? '取消删除规则' : '关闭'" :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton v-if="mode === 'pending'" label="放弃本条待提交修改" :disabled="busy || ownUnconfirmed || foreignRecovery || confirmedCreation" @click="discard" />
      <RendererButton :label="permissionsPending ? '回读已保存规则权限' : ownUnconfirmed ? mode === 'delete' ? '核验原删除结果' : '核验原保存结果' : recoveryEnded ? '原提交已结束，请重新选择' : mode === 'delete' ? '确认删除规则' : '继续保存本条修改'" button-type="primary" :disabled="busy || foreignRecovery || recoveryEnded && !permissionsPending" @click="save" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {PAGE_RUNTIME,RendererDialog,RendererButton,useSparkComponent,useDataViewRecordEditing} from '@spark-appworks/spark-component'
const props=defineProps<{dataViewKey:string;recordId:string|number;mode:'pending'|'delete'}>()
const emit=defineEmits<{close:[]}>()
const {sparkConsume}=useSparkComponent({type:'excel-import-transform-operation-dialog'})
const {busy,error,ownUnconfirmed,foreignRecovery,recoveryEnded,permissionsPending,confirmedCreation,originalRow,save,cancel,discard}=useDataViewRecordEditing({mode:props.mode,runtime:()=>sparkConsume(PAGE_RUNTIME),dataViewKey:()=>props.dataViewKey,recordId:()=>props.recordId,onFinish:()=>emit('close')})
</script>
