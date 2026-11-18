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
import {nodeId, type DataRow, type DataView} from '@spark-appworks/spark-data'
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
    if (command === 'workbench.run' && activeTab.value === 'pending') openRoute(source, row, false)
    if (command === 'workbench.detail') openRoute(source, row, true)
  }}
})

function tabIndex(id: FlowWorkbenchTab): number {
  return TAB_ITEMS.findIndex(item => item.id === id)
}

function openRoute(source: DataView, row: DataRow, detail: boolean): void {
  const tab = activeTab.value
  const fields = tab === 'pending' ? ['wfid', 'WFOBJID', 'FlowID', 'StepID']
    : tab === 'started' ? ['rowid', 'WFMID'] : ['WFOBJID', 'FlowID', 'WFMID', 'rowid']
  try {
    const available = fields.filter(field => source.fieldAccess(row, field).read === 'visible' && Object.hasOwn(row, field))
    source.captureReadRow(row, available)()
    const routeIds = readFlowWorkbenchRowRoute(Object.fromEntries(available.map(field => [field, row[field]])), tab)
    if (!routeIds || (!detail && !routeIds.stepId)) throw new Error('流程身份缺失')
    const {wfid, flowid, stepId} = routeIds
    const scope = appScope()
    void router.push(detail ? buildFlowRunDetailRoute({wfid, flowid}, scope) : buildFlowRunPageRoute({wfid, flowid, stepid: stepId}, scope))
  } catch {
    void pageService.showMessage('当前流程身份不可读或查询已失效，请重新查询', 'warning')
  }
}

</script>

<style scoped>
.flow-workbench-todo {padding: 8px}
.flow-workbench-todo__tabs {margin-top: 4px}
</style>
