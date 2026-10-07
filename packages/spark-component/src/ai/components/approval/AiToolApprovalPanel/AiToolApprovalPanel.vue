<!--
@module @spark-appworks/spark-component:ai/components/approval/AiToolApprovalPanel/AiToolApprovalPanel
职责：维护 @spark-appworks/spark-component 中 ai/components/AiToolApprovalPanel 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
AI用途：需要定位 ai/components/AiToolApprovalPanel 的声明、导出和使用边界时，从本模块开始。
-->
<template>
  <div :class="$style['approval-panel']">
    <template v-if="pending.length === 0">
      <el-empty :description="emptyText" :image-size="60" />
    </template>
    <template v-else>
      <AiToolApprovalCard
        v-for="request in pending"
        :key="request.id"
        :request="request"
        @allow="(id) => emit('allow', id)"
        @reject="(id, reason) => emit('reject', id, reason)"
        @abort="(id, reason) => emit('abort', id, reason)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import AiToolApprovalCard from '../AiToolApprovalCard/AiToolApprovalCard.vue'
import type { AiToolApprovalPanelProps } from './AiToolApprovalPanel.props'

defineProps<AiToolApprovalPanelProps>()

const emit = defineEmits<{
  allow: [id: string]
  reject: [id: string, reason: string]
  abort: [id: string, reason: string]
}>()
</script>

<style module>
.approval-panel {
  min-height: 60px;
}
</style>
