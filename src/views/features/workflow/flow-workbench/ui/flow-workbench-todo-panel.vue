<!--
@module app:views/features/workflow/flow-workbench/ui/flow-workbench-todo-panel
职责：流程工作台待处理列表，消费 WFOBJ_FLOW_Waiting@workbenchPending 并提供办理/详情入口。
-->
<template>
  <RendererSection class="flow-workbench-todo" title="流程待办" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取待办…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <DisplayAlert alert-type="info" :closable="false" :show-icon="true"
      title="待处理列表消费 WFOBJ_FLOW_Waiting@workbenchPending（UserID=当前登录用户）；已处理/传阅/发起页签仍待接入。" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter" :actions="actions"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 15, 20, 50], showJumper: true}" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRouter} from 'vue-router'
import type {DataRow, SparkNode} from '@spark-appworks/spark-data'
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
import {readLowcodePrincipal} from '@/lowcode/lowcode-runtime'
import {readFlowWorkbenchRowRoute} from '@/lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-row'

const FLOW_RUN_PAGE_PATH = '/features/workflow/flow-runtime/run-page/ui/flow-run-page'
const FLOW_RUN_DETAIL_PATH = '/features/workflow/flow-runtime/detail/ui/flow-run-detail-page'

const {sparkConsume} = useSparkComponent({type: 'flow-workbench-todo-panel'})
const pageService = consumeRequiredPageService(sparkConsume, 'flow-workbench-todo-panel')
const router = useRouter()

const scenarioId = 'E328FBBF518141973C575D612CD75151'
const {viewKey, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId,
  modelName: 'WFOBJ_FLOW_Waiting',
  viewId: 'workbenchPending',
  componentType: 'flow-workbench-todo-panel',
  title: '流程待办',
  queryContext: () => {
    const userId = readLowcodePrincipal()?.userId ?? ''
    if (!userId) throw new Error('流程待办缺少当前登录用户 ID')
    return {currentUserId: userId}
  },
})

const text = (field: string, label: string, minWidth = 140): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true}})

const fields: SparkNode[] = [
  text('NodeName', '当前节点', 160),
  text('UserName', '待办人', 120),
  text('wfid', '实例', 140),
  text('FlowID', '模型', 120),
  text('StepID', '步骤', 120),
]

function openRun(row: DataRow): void {
  const routeIds = readFlowWorkbenchRowRoute(row)
  if (!routeIds) {
    void pageService.showMessage('待办行缺少 wfid 或 FlowID', 'warning')
    return
  }
  void router.push({path: FLOW_RUN_PAGE_PATH, query: {wfid: routeIds.wfid, flowid: routeIds.flowid}})
}

function openDetail(row: DataRow): void {
  const routeIds = readFlowWorkbenchRowRoute(row)
  if (!routeIds) {
    void pageService.showMessage('待办行缺少 wfid 或 FlowID', 'warning')
    return
  }
  void router.push({path: FLOW_RUN_DETAIL_PATH, query: {wfid: routeIds.wfid, flowid: routeIds.flowid}})
}

const actions = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '办理', buttonType: 'primary', onClick: (row: DataRow) => openRun(row)}},
  {type: 'r-button', props: {label: '运行详情', onClick: (row: DataRow) => openDetail(row)}},
]}))

const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [
    {type: 'r-text', props: {field: 'NodeName', label: '节点名称', placeholder: '节点名称', filterTrim: true}},
    {type: 'r-text', props: {field: 'UserName', label: '待办人', placeholder: '待办人', filterTrim: true}},
  ],
}
</script>

<style scoped>
.flow-workbench-todo {padding: 8px}
</style>