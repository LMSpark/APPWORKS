<!--
@module @spark-appworks/spark-component:ai/components/diagnostics/SessionDiagnosticsPanel/SessionDiagnosticsPanel
职责：维护 @spark-appworks/spark-component 中 ai/components/SessionDiagnosticsPanel 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
AI用途：需要定位 ai/components/SessionDiagnosticsPanel 的声明、导出和使用边界时，从本模块开始。
-->
<template>
  <el-card :class="$style['diagnostics-panel']" shadow="never">
    <template #header>
      <span :class="$style['diagnostics-panel__title']">会话诊断</span>
    </template>

    <el-skeleton v-if="loading" :rows="4" animated />

    <template v-else>
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="状态">
          <el-tag :type="statusTagType" size="small">
            {{ data.summary.status ?? '无' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="历史条目数">
          {{ data.summary.historyCount }}
        </el-descriptions-item>
        <el-descriptions-item label="消息数">
          {{ data.summary.messageCount }}
        </el-descriptions-item>
        <el-descriptions-item label="工具调用">
          {{ data.summary.toolCallCount }}
        </el-descriptions-item>
        <el-descriptions-item label="失败工具调用">
          <span :class="{ [$style['diagnostics-panel__error-count']]: data.summary.failedToolCallCount > 0 }">
            {{ data.summary.failedToolCallCount }}
          </span>
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="data.issues.length > 0" :class="$style['diagnostics-panel__issues']">
        <h4 :class="$style['diagnostics-panel__subtitle']">问题列表</h4>
        <el-timeline>
          <el-timeline-item
            v-for="(issue, index) in data.issues"
            :key="index"
            :type="issue.level === 'error' ? 'danger' : issue.level === 'warn' ? 'warning' : 'primary'"
            :hollow="issue.level === 'info'"
            size="small"
          >
            <div :class="$style['diagnostics-panel__issue']">
              <span :class="$style['diagnostics-panel__issue-code']">{{ issue.code }}</span>
              <span>{{ issue.message }}</span>
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 诊断统计面板。展示摘要、转录问题列表。
 */
import { computed } from 'vue'
import type { SessionDiagnosticsPanelProps } from './SessionDiagnosticsPanel.props'

const props = withDefaults(defineProps<SessionDiagnosticsPanelProps>(), {
  loading: false,
})

const statusTagType = computed(() => {
  const status = props.data.summary.status
  if (status === 'Started') return 'warning'
  if (status === 'Completed' || status === 'success') return 'success'
  if (status === 'error' || status === 'failed') return 'danger'
  return 'info'
})
</script>

<style module>
.diagnostics-panel {
  height: 100%;
}

.diagnostics-panel__title {
  font-weight: 600;
  font-size: 15px;
}

.diagnostics-panel__subtitle {
  margin: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.diagnostics-panel__issues {
  margin-top: 12px;
}

.diagnostics-panel__issue {
  font-size: 13px;
}

.diagnostics-panel__issue-code {
  font-family: monospace;
  font-weight: 600;
  margin-right: 8px;
}

.diagnostics-panel__error-count {
  color: var(--el-color-danger);
  font-weight: 600;
}
</style>
