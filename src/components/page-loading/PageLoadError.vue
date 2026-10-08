<template>
  <section class="page-load-error" role="alert">
    <h2>页面加载失败</h2>
    <p>{{ error?.message || '未知错误' }}</p>
    <button type="button" @click="reload">重新加载</button>
  </section>
</template>

<script setup lang="ts">
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

.page-load-error button {
  border: 1px solid var(--el-color-primary, #409eff);
  border-radius: 4px;
  padding: 0.5rem 0.875rem;
  color: var(--el-color-primary, #409eff);
  background: var(--el-bg-color, #fff);
  cursor: pointer;
}
</style>
