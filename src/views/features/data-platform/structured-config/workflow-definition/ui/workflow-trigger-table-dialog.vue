<template>
  <RendererDialog :model-value="true" title="触发表选择" width="560px" @update:model-value="emit('close')">
    <p>工作流 {{ workflowId }} 的触发表配置（DataWorkFlow.triggerTables 合同）。</p>
    <RendererButton label="关闭" @click="emit('close')" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
defineProps<{workflowId: string}>()
const emit = defineEmits<{close: []}>()
</script>
