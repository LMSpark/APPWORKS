<template>
  <RendererDialog :model-value="true" title="编码类选择" width="520px" @update:model-value="emit('close')">
    <p>维护编码类候选（专用接口，见 data-code research）。</p>
    <RendererButton label="关闭" @click="emit('close')" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
const emit = defineEmits<{close: []}>()
</script>
