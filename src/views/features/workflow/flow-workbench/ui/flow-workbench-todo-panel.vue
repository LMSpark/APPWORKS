<!--
@module app:views/features/workflow/flow-workbench/ui/flow-workbench-todo-panel
职责：流程工作台待办列表 MVP，共用监控场景 View_FlowObjList 并提供办理/详情入口。
-->
<template>
  <RendererSection class="flow-workbench-todo" title="流程待办" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取待办…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <DisplayAlert alert-type="info" :closable="false" :show-icon="true"
      title="消费 View_FlowObjList@workbenchTodo 命名视图；当前与 default 同源查询，精确「我的待办」过滤待在 D99 实服合同确认后写入 pagedata。" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter" :actions="actions"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 15, 20, 50], showJumper: true}" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRouter} from 'vue-router'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {
  DisplayAlert,
  RendererSection,
  RendererTable,
  consumeRequiredPageService,
  type RFilterProps,
  type RToolbarProps,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const FLOW_RUN_PAGE_PATH = '/features/workflow/flow-runtime/run-page/ui/flow-run-page'
const FLOW_RUN_DETAIL_PATH = '/features/workflow/flow-runtime/detail/ui/flow-run-detail-page'

const {sparkConsume} = useSparkComponent({type: 'flow-workbench-todo-panel'})
const pageService = consumeRequiredPageService(sparkConsume, 'flow-workbench-todo-panel')
const router = useRouter()

const scenarioId = 'E328FBBF518141973C575D612CD75151'
const {viewKey, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,
  modelName: 'View_FlowObjList',
  viewId: 'workbenchTodo',
  componentType: 'flow-workbench-todo-panel',
  title: '流程待办',
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
  text('AppDesc', '应用名称', 160),
  text('TITLE', '流程标题', 220),
  text('handleInfo', '办理信息', 200),
  {type: 'r-select', props: {field: 'status', label: '状态', readonly: true, minWidth: 120, sortable: false, optionDataViewKey: stateKey}},
  {type: 'r-select', props: {field: 'CrtUserID', label: '创建人', readonly: true, minWidth: 120, sortable: false, optionDataViewKey: userKey}},
  {type: 'r-text', props: {field: 'CrtTime', label: '创建时间', readonly: true, minWidth: 160, displayFormatter: formatMinute}},
]

function textValue(row: DataRow, field: string): string {
  const value = row[field]
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function openRun(row: DataRow): void {
  const wfid = textValue(row, 'rowid')
  const flowid = textValue(row, 'WFMID')
  if (!wfid || !flowid) {
    void pageService.showMessage('流程记录缺少 wfid 或 flowid', 'warning')
    return
  }
  void router.push({path: FLOW_RUN_PAGE_PATH, query: {wfid, flowid}})
}

function openDetail(row: DataRow): void {
  const wfid = textValue(row, 'rowid')
  const flowid = textValue(row, 'WFMID')
  if (!wfid || !flowid) {
    void pageService.showMessage('流程记录缺少 wfid 或 flowid', 'warning')
    return
  }
  void router.push({path: FLOW_RUN_DETAIL_PATH, query: {wfid, flowid}})
}

const actions = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '办理', buttonType: 'primary', onClick: (row: DataRow) => openRun(row)}},
  {type: 'r-button', props: {label: '运行详情', onClick: (row: DataRow) => openDetail(row)}},
]}))

const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [
    {type: 'r-text', props: {field: 'TITLE', label: '流程标题', placeholder: '流程标题', filterTrim: true}},
    {type: 'r-text', props: {field: 'handleInfo', label: '办理信息', placeholder: '办理信息', filterTrim: true}},
    {type: 'r-select', props: {field: 'status', label: '流程状态', placeholder: '流程状态', clearable: true, optionDataViewKey: stateKey}},
  ],
}
</script>

<style scoped>
.flow-workbench-todo {padding: 8px}
</style>