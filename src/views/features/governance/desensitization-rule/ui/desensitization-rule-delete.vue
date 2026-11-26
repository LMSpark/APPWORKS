<template>
  <slot />
</template>
<script setup lang="ts">
import {PAGE_RUNTIME, useSparkComponent, useDataViewRecordEditing} from '@spark-appworks/spark-component'
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
const state = () => ({recordId: props.recordId, busy: busy.value, error: error.value, ownUnconfirmed: ownUnconfirmed.value,
  verify: recoverableAction.value === 'verify-original-receipt', submitDisabled: busy.value || foreignRecovery.value || recoveryEnded.value})
defineExpose({state, close, submit})
</script>
