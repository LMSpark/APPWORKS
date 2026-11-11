<!--
@module app:views/features/system/flow-monitor/ui/flow-monitor-page
职责：恢复流程监控列表：按应用名称、流程标题、流程状态查询，分页显示办理信息、创建人及创建时间。
边界：列表与选项绑定同一PageRuntime的正式DataView；办理信息由DataTable计算列派生，创建人经用户选项视图显示姓名。流程运行详情随工作流运行页迁移。
AI用途：迁移系统运维流程监控时，核对状态字典、创建人映射与查询条件。
-->
<template>
  <section class="flow-monitor-page">
    <header class="flow-monitor-page__header">
      <h1>流程监控</h1>
      <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" />
    </header>
    <p v-if="loading" role="status">正在读取流程列表…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 15, 20, 50], showJumper: true}" />
  </section>
</template>

<script setup lang="ts">
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererTable, type RFilterProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const scenarioId = 'E328FBBF518141973C575D612CD75151'
const {viewKey, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'View_FlowObjList', componentType: 'flow-monitor-page', title: '流程监控',
  optionModels: ['Dict_state', 'Base_UserInfo'],
})
const stateKey = buildDataViewKey('Dict_state', 'default', scenarioId)
const userKey = buildDataViewKey('Base_UserInfo', 'default', scenarioId)

function formatMinute(value: unknown): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text.slice(0, 16)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const text = (field: string, label: string, minWidth = 140): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true}})
const fields: SparkNode[] = [
  text('AppDesc', '应用名称', 160), text('TITLE', '流程标题', 240), text('handleInfo', '办理信息', 200),
  {type: 'r-select', props: {field: 'CrtUserID', label: '创建人', readonly: true, minWidth: 120, sortable: false,
    optionDataViewKey: userKey}},
  {type: 'r-text', props: {field: 'CrtTime', label: '创建时间', readonly: true, minWidth: 160, sortable: false,
    displayFormatter: formatMinute}},
]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [
    {type: 'r-text', props: {field: 'AppDesc', label: '应用名称', placeholder: '应用名称', filterTrim: true}},
    {type: 'r-text', props: {field: 'TITLE', label: '流程标题', placeholder: '流程标题', filterTrim: true}},
    {type: 'r-select', props: {field: 'status', label: '流程状态', placeholder: '流程状态', clearable: true,
      optionDataViewKey: stateKey}},
  ],
}
</script>

<style scoped>
.flow-monitor-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.flow-monitor-page__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.flow-monitor-page__header h1 {margin: 0; font-size: 20px}
</style>
