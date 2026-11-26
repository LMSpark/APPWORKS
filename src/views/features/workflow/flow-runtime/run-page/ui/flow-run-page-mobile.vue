<!--
@module app:views/features/workflow/flow-runtime/run-page/ui/flow-run-page-mobile
职责：流程办理移动端入口，按本次导航身份复用办理工具和数据视图。
-->
<template>
  <div class="flow-run-page-mobile">
    <FlowRunPage mobile />
  </div>
</template>

<script setup lang="ts">
import FlowRunPage from './flow-run-page.vue'
</script>

<style scoped>
.flow-run-page-mobile {padding: 4px}
</style>
