<!--
@module @spark-appworks/spark-component:ai/components/SparkAgentPanel/SparkAgentPanel
职责：复用现有 AI trace UI，并可选展示 AG-UI 事件 timeline。
边界：只做组合渲染，不解释 AG-UI 原始协议、不持有运行状态，也不执行 agent。
AI用途：需要把 AG-UI adapter 输出接入仓内 AI UI 层时，从本模块开始。
-->
<template>
  <div :class="$style['agent-panel']" :style="{ height }">
    <div :class="$style['agent-panel__trace']">
      <AiSessionTracePanel
        :entries="entries"
        :is-streaming="isStreaming"
        :is-reasoning="isReasoning"
        :diagnostics="diagnostics"
        height="100%"
        :empty-text="emptyText"
      />
    </div>

    <aside v-if="showTimeline" :class="$style['agent-panel__timeline']">
      <div :class="$style['agent-panel__timeline-header']">事件流</div>
      <el-empty
        v-if="normalizedTimeline.length === 0"
        :description="timelineEmptyText"
      />
      <el-scrollbar v-else :class="$style['agent-panel__timeline-scroll']">
        <div
          v-for="event in normalizedTimeline"
          :key="event.sequence"
          :class="$style['agent-panel__timeline-item']"
        >
          <div :class="$style['agent-panel__timeline-meta']">
            <code :class="$style['agent-panel__timeline-type']">{{ event.type }}</code>
            <span :class="$style['agent-panel__timeline-time']">{{ formatTime(event.timestamp) }}</span>
          </div>
          <pre :class="$style['agent-panel__timeline-payload']">{{ event.payloadPreview }}</pre>
        </div>
      </el-scrollbar>
    </aside>
  </div>
</template>

<script setup lang="ts">
/**
 * Spark Agent 面板组合壳。
 * 现有 AiSessionTracePanel 仍是主 UI；timeline 只显示 adapter 产出的只读投影。
 */
import { computed } from 'vue'
import AiSessionTracePanel from '../diagnostics/AiSessionTracePanel/AiSessionTracePanel.vue'
import type { SparkAgentPanelProps } from './SparkAgentPanel.props'

const props = withDefaults(defineProps<SparkAgentPanelProps>(), {
  height: '100%',
  emptyText: '暂无 AI 会话数据',
  timelineEmptyText: '暂无事件',
  showTimeline: false,
  timelineEvents: () => [],
})

const normalizedTimeline = computed(() => props.timelineEvents)

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<style module>
.agent-panel {
  display: flex;
  min-height: 0;
  width: 100%;
}

.agent-panel__trace {
  min-width: 0;
  flex: 1 1 auto;
}

.agent-panel__timeline {
  flex: 0 0 320px;
  min-width: 280px;
  border-left: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-blank);
  display: flex;
  flex-direction: column;
}

.agent-panel__timeline-header {
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  border-bottom: 1px solid var(--el-border-color-light);
}

.agent-panel__timeline-scroll {
  flex: 1 1 auto;
}

.agent-panel__timeline-item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.agent-panel__timeline-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.agent-panel__timeline-type {
  font-size: 12px;
  color: var(--el-color-primary);
  word-break: break-all;
}

.agent-panel__timeline-time {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.agent-panel__timeline-payload {
  margin: 0;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
