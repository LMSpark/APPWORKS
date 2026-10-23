<template>
  <RendererDialog :model-value="true" title="Sheet 布局查找" width="520px" @update:model-value="emit('close')">
    <p>按业务表选择 Sheet 布局候选（ExcelImportSheetLayout 合同）。</p>
    <RendererButton label="关闭" @click="emit('close')" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
const emit = defineEmits<{close: []}>()
</script>
