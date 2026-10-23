<template>
  <RendererDialog :model-value="true" title="编码类编辑" width="520px" @update:model-value="emit('close')">
    <p>编辑编码类规则。</p>
    <RendererButton label="关闭" @click="emit('close')" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
const emit = defineEmits<{close: []}>()
</script>
