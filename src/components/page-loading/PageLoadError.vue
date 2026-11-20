<template>
  <section class="page-load-error" role="alert">
    <h2>页面加载失败</h2>
    <p>{{ error?.message || '未知错误' }}</p>
    <RendererButton label="重新加载" button-type="primary" plain @click="reload" />
  </section>
</template>

<script setup lang="ts">
import { RendererButton } from '@spark-appworks/spark-component'

defineProps<{ error: Error }>()

function reload(): void {
  window.location.reload()
}
</script>

<style scoped>
.page-load-error {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  padding: 1.5rem;
  color: var(--el-text-color-primary, #303133);
}

.page-load-error h2,
.page-load-error p {
  margin: 0;
}
</style>
