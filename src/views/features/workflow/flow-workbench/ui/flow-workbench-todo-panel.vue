<!--
@module app:views/features/workflow/flow-workbench/ui/flow-workbench-todo-panel
职责：流程工作台四页签列表，消费 pagedata 命名视图并提供办理/详情入口。
-->
<template>
  <RendererSection class="flow-workbench-todo" title="流程工作台" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <RendererTabs v-model="activeTab" class="flow-workbench-todo__tabs">
      <RendererTabPane v-for="item in TAB_ITEMS" :key="item.id" :name="item.id" :label="item.label" :index="tabIndex(item.id)">
        <SparkPageRenderer v-if="runtime && host && activeTab === item.id" :page-runtime="runtime"
          :route-snapshot="routeSnapshot" :host="host" :auto-load="false">
          <template #content="{children}">
            <template v-for="(node, index) in children" :key="nodeId(node) ?? index">
              <SparkComponentRenderer v-if="nodeId(node) === activeTab" :config="node" />
            </template>
          </template>
        </SparkPageRenderer>
      </RendererTabPane>
    </RendererTabs>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {parseApplicationPathScope} from '@/services/application-scope'
import {PageTool} from '@spark-appworks/spark-project-model'
import {nodeId, type DataRow} from '@spark-appworks/spark-data'
import {
  RendererSection,
  SparkPageRenderer,
  SparkComponentRenderer,
  RendererTabPane,
  RendererTabs,
  consumeRequiredPageService,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import type {FlowWorkbenchTab} from '@/lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-filters'
import {buildFlowRunDetailRoute, buildFlowRunPageRoute} from '@/lowcode/resources/system/workflow/manage'
import {readFlowWorkbenchRowRoute} from '@/lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-row'
import {useFlowWorkbenchTodo} from '../model/use-flow-workbench-todo'

import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const {sparkConsume} = useSparkComponent({type: 'flow-workbench-todo-panel'})
const pageService = consumeRequiredPageService(sparkConsume, 'flow-workbench-todo-panel')
const router = useRouter()
const route = useRoute()
const appScope = () => {
  const scope = parseApplicationPathScope(route.path)
  if (!scope) throw new Error('流程工作台缺少应用路径作用域')
  return scope
}

const {TAB_ITEMS, activeTab, viewKey, session, ready, loading, error, loadCurrentRoute} = useFlowWorkbenchTodo(pageId => {
  const tool = new PageTool({pageId})
  tool.hydrateFileText('rule.json', rule)
  tool.hydrateFileText('script.js', script)
  tool.hydrateFileText('style.css', style)
  tool.markLoaded()
  return tool
})
const runtime = computed(() => ready.value ? session.runtime : undefined)
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (!session.isCurrent(current)) throw new Error('流程工作台运行实例已失效')
  }
  return {runtime: current, assertCurrent, invoke(command: string, input: unknown) {
    assertCurrent()
    if (!input || typeof input !== 'object') return
    const row = input as DataRow
    const source = current.resolveView(viewKey.value)
    if (!source?.rows.includes(row)) return
    if (command === 'workbench.run' && activeTab.value === 'pending') openRun(row)
    if (command === 'workbench.detail') openDetail(row)
  }}
})

function tabIndex(id: FlowWorkbenchTab): number {
  return TAB_ITEMS.findIndex(item => item.id === id)
}

function openRun(row: DataRow): void {
  const routeIds = readFlowWorkbenchRowRoute(row, activeTab.value)
  if (!routeIds) {
    void pageService.showMessage('行记录缺少 wfid 或流程模型 ID', 'warning')
    return
  }
  void router.push(buildFlowRunPageRoute({wfid: routeIds.wfid, flowid: routeIds.flowid, stepid: routeIds.stepId}, appScope()))
}

function openDetail(row: DataRow): void {
  const routeIds = readFlowWorkbenchRowRoute(row, activeTab.value)
  if (!routeIds) {
    void pageService.showMessage('行记录缺少 wfid 或流程模型 ID', 'warning')
    return
  }
  void router.push(buildFlowRunDetailRoute({wfid: routeIds.wfid, flowid: routeIds.flowid}, appScope()))
}

</script>

<style scoped>
.flow-workbench-todo {padding: 8px}
.flow-workbench-todo__tabs {margin-top: 4px}
</style>
