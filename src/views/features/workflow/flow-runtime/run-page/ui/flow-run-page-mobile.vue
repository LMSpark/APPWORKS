<!--
@module app:views/features/workflow/flow-runtime/run-page/ui/flow-run-page-mobile
职责：流程办理移动端布局占位，与桌面页共用运行 query 合同。
-->
<template>
  <RendererSection class="flow-run-page-mobile" title="流程办理" :bordered="false" :grid-columns="1">
    <FlowRunPage />
  </RendererSection>
</template>

<script setup lang="ts">
import {RendererSection} from '@spark-appworks/spark-component'
import FlowRunPage from './flow-run-page.vue'
</script>

<style scoped>
.flow-run-page-mobile {padding: 4px}
</style>