<template>
  <RendererDialog :model-value="true" title="父码规则" width="520px" @update:model-value="emit('close')">
    <p>配置父码选项与规则。</p>
    <RendererButton label="关闭" @click="emit('close')" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
const emit = defineEmits<{close: []}>()
</script>
