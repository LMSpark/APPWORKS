<!--
@module app:views/features/integration/api-management/ui/api-output-operation-dialog
职责：确认原输出删除或明确处理原待提交修改。
边界：复用公共单记录操作，不复制提交、取消与原捕获核验管线。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" :title="mode === 'delete' ? '删除输出定义' : '处理输出待提交修改'" :width="520" :append-to-body="true" :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <p>输出：{{ originalRow['enname'] }}（{{ recordId }}）</p>
    <p>{{ mode === 'delete' ? '确认删除该输出？提交时会核查正式引用。' : '仅处理明确选择的原输出记录，不提交其他记录或新输入。' }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template #footer>
      <RendererButton :label="foreignRecovery ? '关闭并保留输出修改' : mode === 'delete' ? '取消删除输出' : '关闭输出处理'" :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton v-if="mode === 'pending'" label="放弃本条输出修改" :disabled="busy || ownUnconfirmed || foreignRecovery || confirmedCreation" @click="discard" />
      <RendererButton :label="permissionsPending ? '回读已保存输出权限' : ownUnconfirmed ? '核验原输出提交' : recoveryEnded ? '原输出提交已结束' : mode === 'delete' ? '确认删除输出' : '继续保存本条输出'" button-type="primary" :disabled="busy || foreignRecovery || recoveryEnded && !permissionsPending" @click="save" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {PAGE_RUNTIME,RendererDialog,RendererButton,useSparkComponent,useDataViewRecordEditing} from '@spark-appworks/spark-component'
const props=defineProps<{dataViewKey:string;recordId:string|number;mode:'pending'|'delete'}>()
const emit=defineEmits<{close:[]}>()
const {sparkConsume}=useSparkComponent({type:'api-output-operation-dialog'})
const {busy,error,ownUnconfirmed,foreignRecovery,recoveryEnded,permissionsPending,confirmedCreation,originalRow,save,cancel,discard}=useDataViewRecordEditing({mode:props.mode,runtime:()=>sparkConsume(PAGE_RUNTIME),dataViewKey:()=>props.dataViewKey,recordId:()=>props.recordId,onFinish:()=>emit('close')})
</script>
