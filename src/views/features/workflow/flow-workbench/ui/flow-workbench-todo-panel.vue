<!--
@module app:views/features/workflow/flow-workbench/ui/flow-workbench-todo-panel
职责：流程工作台四页签列表，消费 pagedata 命名视图并提供办理/详情入口。
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false" />
  <RendererSection v-else :class="shell.props.class" :title="shell.props.title" :bordered="shell.props.bordered"
    :grid-columns="shell.props.gridColumns" :grid-gap="shell.props.gridGap"
    :status="loading ? '正在读取…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <RendererTabs :model-value="activeTab" :class="tabs.props.class" @update:model-value="selectTab">
      <RendererTabPane v-for="(pane, index) of tabs.children" :key="pane.id" :name="pane.props.name" :label="pane.props.label" :index="index" />
    </RendererTabs>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {parseApplicationPathScope} from '@/services/application-scope'
import {PageTool} from '@spark-appworks/spark-project-model'
import {isDataRow, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {
  RendererSection,
  SparkPageRenderer,
  SparkComponentRenderer,
  RendererTabPane,
  RendererTabs,
  consumeRequiredPageService,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import {buildFlowRunDetailRoute, buildFlowRunPageRoute} from '@/platform-adapters/resources/system/workflow/manage'
import {readFlowWorkbenchRowRoute} from '@/platform-adapters/resources/system/workflow/manage/flow-workbench/flow-workbench-row'
import {useFlowWorkbenchTodo} from '../model/use-flow-workbench-todo'

import rules from './tool/rule.json'
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

const shell = rules[0]
const tabs = shell?.children[0]?.props.tabs
if (!shell || !tabs) throw Error('流程工作台工具缺少标签声明')
const {activeTab, selectTab, viewKey, session, ready, loading, error, loadCurrentRoute} = useFlowWorkbenchTodo(pageId => {
  const tool = new PageTool({pageId})
  tool.hydrateFileText('rule.json', JSON.stringify(rules))
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
  const tab = activeTab.value, key = viewKey.value
  const assertCurrent = () => {
    if (!ready.value || !session.isCurrent(current) || activeTab.value !== tab || viewKey.value !== key) {
      throw Error('流程工作台运行实例已失效')
    }
  }
  return {runtime: current, assertCurrent, invoke(command: string, input: unknown) {
    assertCurrent()
    if (command === 'workbench.connect') return {
      controls: {tabs: RendererTabs, pane: RendererTabPane, render: SparkComponentRenderer},
      tab,
      select: (value: string | number) => {assertCurrent(); selectTab(value)},
    }
    if (!isDataRow(input)) return undefined
    const row = input
    const source = current.resolveView(key)
    if (!source?.rows.includes(row)) return undefined
    if (command === 'workbench.run' && tab === 'pending') openRoute(source, row, false)
    if (command === 'workbench.detail') openRoute(source, row, true)
    return undefined
  }}
})

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

<style scoped src="./tool/style.css"></style>
