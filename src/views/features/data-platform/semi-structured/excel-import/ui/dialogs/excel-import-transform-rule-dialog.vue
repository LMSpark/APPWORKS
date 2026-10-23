<template>
  <RendererDialog :model-value="true" title="转换规则" width="560px" @update:model-value="emit('close')">
    <p>维护 ExcelImportTransformRule 条目。</p>
    <RendererButton label="关闭" @click="emit('close')" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
const emit = defineEmits<{close: []}>()
</script>
