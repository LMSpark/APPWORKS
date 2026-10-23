<template>
  <RendererDialog :model-value="true" title="编码初始化数据" width="520px" @update:model-value="emit('close')">
    <p>维护 CodeInitDataList 相关配置。</p>
    <RendererButton label="关闭" @click="emit('close')" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
const emit = defineEmits<{close: []}>()
</script>
