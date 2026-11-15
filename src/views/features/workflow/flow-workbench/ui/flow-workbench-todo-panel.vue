<!--
@module app:views/features/workflow/flow-workbench/ui/flow-workbench-todo-panel
职责：流程工作台四页签列表，消费 pagedata 命名视图并提供办理/详情入口。
-->
<template>
  <RendererSection class="flow-workbench-todo" title="流程工作台" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <RendererTabs v-model="activeTab" class="flow-workbench-todo__tabs">
      <RendererTabPane v-for="item in TAB_ITEMS" :key="item.id" :name="item.id" :label="item.label" :index="tabIndex(item.id)">
        <RendererTable v-if="ready && activeTab === item.id" :data-view-key="viewKey" :children="columns"
          :filter="filter" :actions="actions" :stripe="true" :show-row-index="true" :show-data-view-meta="false"
          :pagination="{pageSizes: [10, 15, 20, 50], showJumper: true}" />
      </RendererTabPane>
    </RendererTabs>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRouter} from 'vue-router'
import type {DataRow} from '@spark-appworks/spark-data'
import {
  RendererSection,
  RendererTable,
  RendererTabPane,
  RendererTabs,
  consumeRequiredPageService,
  type RToolbarProps,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import type {FlowWorkbenchTab} from '@/lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-filters'
import {buildFlowRunDetailRoute, buildFlowRunPageRoute} from '@/lowcode/resources/system/workflow/manage'
import {readFlowWorkbenchRowRoute} from '@/lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-row'
import {useFlowWorkbenchTodo} from '../model/use-flow-workbench-todo'

const {sparkConsume} = useSparkComponent({type: 'flow-workbench-todo-panel'})
const pageService = consumeRequiredPageService(sparkConsume, 'flow-workbench-todo-panel')
const router = useRouter()

const {
  TAB_ITEMS,
  activeTab,
  showRunAction,
  columns,
  filter,
  viewKey,
  ready,
  loading,
  error,
  loadCurrentRoute,
} = useFlowWorkbenchTodo()

function tabIndex(id: FlowWorkbenchTab): number {
  return TAB_ITEMS.findIndex(item => item.id === id)
}

function openRun(row: DataRow): void {
  const routeIds = readFlowWorkbenchRowRoute(row, activeTab.value)
  if (!routeIds) {
    void pageService.showMessage('行记录缺少 wfid 或流程模型 ID', 'warning')
    return
  }
  void router.push(buildFlowRunPageRoute({wfid: routeIds.wfid, flowid: routeIds.flowid}))
}

function openDetail(row: DataRow): void {
  const routeIds = readFlowWorkbenchRowRoute(row, activeTab.value)
  if (!routeIds) {
    void pageService.showMessage('行记录缺少 wfid 或流程模型 ID', 'warning')
    return
  }
  void router.push(buildFlowRunDetailRoute({wfid: routeIds.wfid, flowid: routeIds.flowid}))
}

const actions = computed<RToolbarProps>(() => ({
  children: [
    ...(showRunAction.value
      ? [{type: 'r-button' as const, props: {label: '办理', buttonType: 'primary', onClick: (row: DataRow) => openRun(row)}}]
      : []),
    {type: 'r-button', props: {label: '运行详情', onClick: (row: DataRow) => openDetail(row)}},
  ],
}))
</script>

<style scoped>
.flow-workbench-todo {padding: 8px}
.flow-workbench-todo__tabs {margin-top: 4px}
</style>