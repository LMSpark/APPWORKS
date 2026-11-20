<!--
@module @spark-appworks/spark-component:ai/components/diagnostics/AiSessionTracePanel/AiSessionTracePanel
职责：维护 @spark-appworks/spark-component 中 ai/components/AiSessionTracePanel 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
AI用途：需要定位 ai/components/AiSessionTracePanel 的声明、导出和使用边界时，从本模块开始。
-->
<template>
  <el-scrollbar :class="$style['trace-panel']" :style="{ height }">
    <div v-if="isEmpty" :class="$style['trace-panel__empty']">
      <el-empty :description="emptyText" />
    </div>
    <el-row v-else :class="$style['trace-panel__body']" :gutter="16">
      <el-col :span="16">
        <SessionStreamView
          :entries="entries"
          :is-streaming="isStreaming"
          :is-reasoning="isReasoning"
          :empty-text="emptyText"
        />
      </el-col>
      <el-col :span="8">
        <SessionDiagnosticsPanel :data="diagnostics" />
      </el-col>
    </el-row>
  </el-scrollbar>
</template>

<script setup lang="ts">
/**
 * AI 会话监视根面板。
 * 左侧流式消息视图 + 右侧诊断面板。
 */
import { computed } from 'vue'
import SessionStreamView from '../../session/SessionStreamView/SessionStreamView.vue'
import SessionDiagnosticsPanel from '../SessionDiagnosticsPanel/SessionDiagnosticsPanel.vue'
import type { AiSessionTracePanelProps } from './AiSessionTracePanel.props'

const props = withDefaults(defineProps<AiSessionTracePanelProps>(), {
  height: '100%',
  emptyText: '暂无 AI 会话数据',
})

const isEmpty = computed(() =>
  props.entries.length === 0 && !hasDiagnostics(props.diagnostics),
)

function hasDiagnostics(data: AiSessionTracePanelProps['diagnostics']): boolean {
  const summary = data.summary
  return (
    summary.status !== null
    || summary.historyCount > 0
    || summary.messageCount > 0
    || summary.toolCallCount > 0
    || summary.failedToolCallCount > 0
    || summary.functionNames.length > 0
    || summary.lastAssistantText.length > 0
    || data.transcript.length > 0
    || data.issues.length > 0
  )
}
</script>

<style module>
.trace-panel {
  height: 100%;
}

.trace-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.trace-panel__body {
  padding: 16px;
  height: 100%;
}
</style>
