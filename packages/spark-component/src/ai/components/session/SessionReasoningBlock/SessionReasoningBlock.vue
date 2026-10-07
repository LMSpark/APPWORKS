<!--
@module @spark-appworks/spark-component:ai/components/session/SessionReasoningBlock/SessionReasoningBlock
职责：维护 @spark-appworks/spark-component 中 ai/components/SessionReasoningBlock 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
AI用途：需要定位 ai/components/SessionReasoningBlock 的声明、导出和使用边界时，从本模块开始。
-->
<template>
  <el-collapse :model-value="isActive ? [0] : []">
    <el-collapse-item :title="collapsed ? '推理过程（已完成）' : '正在推理...'" :name="0">
      <div :class="$style['reasoning-block__text']">{{ text }}</div>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup lang="ts">
/**
 * 可折叠推理块。isActive 时展开，完成后自动折叠。
 */
import type { SessionReasoningBlockProps } from './SessionReasoningBlock.props'

withDefaults(defineProps<SessionReasoningBlockProps>(), {
  collapsed: false,
  isActive: false,
})
</script>

<style module>
.reasoning-block__text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  padding: 8px 0;
}
</style>
