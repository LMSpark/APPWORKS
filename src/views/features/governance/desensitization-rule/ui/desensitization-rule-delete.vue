<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="删除确认" :width="520"
    :close-disabled="busy" @update:model-value="close">
    <p>确定要删除此脱敏规则吗？</p>
    <RendererForm :data-view-key="dataViewKey" :context-row-id="recordId" :show-data-view-meta="false" :auto-columns="false">
      <FieldText field="name" label="名称" :readonly="true" />
    </RendererForm>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="ownUnconfirmed" role="alert">删除结果未知，保留原提交，不会重复删除。</p>
    <template #footer>
      <RendererButton :label="ownUnconfirmed ? '关闭并保留修改' : '取消'" :disabled="busy" @click="close" />
      <RendererButton :label="recoverableAction === 'verify-original-receipt' ? '核验原删除结果' : '确定删除'"
        button-type="danger" :disabled="busy || foreignRecovery || recoveryEnded" @click="submit" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {PAGE_RUNTIME, RendererDialog, RendererForm, RendererButton, FieldText, useSparkComponent, useDataViewRecordEditing} from '@spark-appworks/spark-component'
const props = defineProps<{dataViewKey: string; recordId: string | number}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'desensitization-rule-delete'})
const {busy, error, ownUnconfirmed, foreignRecovery, recoveryEnded, recoverableAction, save, cancel, retainDraft, verifyOriginalReceipt} =
  useDataViewRecordEditing({mode: 'delete', runtime: () => sparkConsume(PAGE_RUNTIME), dataViewKey: () => props.dataViewKey,
    recordId: () => props.recordId, onFinish: () => emit('close')})
function close(): void {
  if (ownUnconfirmed.value || recoverableAction.value !== 'none') retainDraft()
  else cancel()
}
async function submit(): Promise<void> {
  if (recoverableAction.value === 'verify-original-receipt') await verifyOriginalReceipt()
  else await save()
}
</script>
