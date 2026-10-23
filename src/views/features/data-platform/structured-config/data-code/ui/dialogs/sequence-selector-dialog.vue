<template>
  <RendererDialog :model-value="true" title="序列规则" width="520px" @update:model-value="emit('close')">
    <p>维护编码序列。</p>
    <RendererButton label="关闭" @click="emit('close')" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
const emit = defineEmits<{close: []}>()
</script>
