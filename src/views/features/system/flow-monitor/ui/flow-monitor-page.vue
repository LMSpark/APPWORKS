<!--
@module app:views/features/system/flow-monitor/ui/flow-monitor-page
职责：恢复流程监控列表：按应用名称、流程标题、流程状态查询，分页显示办理信息、创建人及创建时间。
边界：列表与选项绑定同一PageRuntime的正式DataView；办理信息由DataTable计算列派生，创建人经用户选项视图显示姓名。流程运行详情随工作流运行页迁移。
AI用途：迁移系统运维流程监控时，核对状态字典、创建人映射与查询条件。
-->
<template>
  <RendererSection class="flow-monitor-page" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取流程列表…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter" :actions="actions"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 15, 20, 50], showJumper: true}" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRouter} from 'vue-router'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {RendererSection, RendererTable, consumeRequiredPageService, type RFilterProps, type RToolbarProps, useSparkComponent} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const {sparkConsume} = useSparkComponent({type: 'flow-monitor-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'flow-monitor-page')

const FLOW_RUN_DETAIL_PATH = '/features/workflow/flow-runtime/detail/ui/flow-run-detail-page'

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
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true}})
const fields: SparkNode[] = [
  text('AppDesc', '应用名称', 160), text('TITLE', '流程标题', 240),
  {type: 'r-text', props: {field: 'handleInfo', label: '办理信息', readonly: true, minWidth: 200, sortable: false, showOverflowTooltip: true}},
  {type: 'r-select', props: {field: 'CrtUserID', label: '创建人', readonly: true, minWidth: 120, sortable: false,
    optionDataViewKey: userKey}},
  {type: 'r-text', props: {field: 'CrtTime', label: '创建时间', readonly: true, minWidth: 160,
    displayFormatter: formatMinute}},
]
const router = useRouter()
const actions = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '运行详情', onClick: (row: DataRow) => openRunDetail(row)}},
]}))
function textValue(row: DataRow, field: string): string {
  const value = row[field]
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}
function openRunDetail(row: DataRow): void {
  const wfid = textValue(row, 'rowid')
  const flowid = textValue(row, 'WFMID')
  if (!wfid || !flowid) {
    void pageService.showMessage('流程记录缺少 wfid 或 flowid', 'warning')
    return
  }
  void router.push({path: FLOW_RUN_DETAIL_PATH, query: {wfid, flowid}})
}
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
.flow-monitor-page {padding: 8px}
</style>
