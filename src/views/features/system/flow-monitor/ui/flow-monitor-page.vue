<!--
@module app:views/features/system/flow-monitor/ui/flow-monitor-page
职责：恢复流程监控列表：按应用名称、流程标题、流程状态查询，分页显示办理信息、创建人及创建时间。
边界：列表与选项绑定同一PageRuntime的正式DataView；办理信息由DataTable计算列派生，创建人经用户选项视图显示姓名。流程运行详情随工作流运行页迁移。
AI用途：迁移系统运维流程监控时，核对状态字典、创建人映射与查询条件。
-->
<template>
  <RendererSection :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取流程列表…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import type {DataRow} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import {RendererSection, SparkPageRenderer, consumeRequiredPageService, useSparkComponent} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import {buildFlowRunDetailRoute, buildFlowRunPageRoute} from '@/lowcode/resources/system/workflow/manage'

import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const {sparkConsume} = useSparkComponent({type: 'flow-monitor-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'flow-monitor-page')

const scenarioId = 'E328FBBF518141973C575D612CD75151'
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'View_FlowObjList', componentType: 'flow-monitor-page', title: '流程监控',
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
  optionModels: ['Dict_state', 'Base_UserInfo'],
})
const router = useRouter()
const route = useRoute()
const appScope = () => {
  const scope = parseApplicationPathScope(route.path)
  if (!scope) throw new Error('流程监控缺少应用路径作用域')
  return scope
}
function openRun(row: DataRow, detail: boolean): void {
  const view = ready.value ? session.runtime?.resolveView(viewKey.value) : undefined
  if (!view?.rows.includes(row) || ['rowid', 'WFMID'].some(field => view.fieldAccess(row, field).read !== 'visible')) {
    void pageService.showMessage('无法读取当前流程记录的正式身份，请重新查询', 'warning')
    return
  }
  const wfid = textValue(row, 'rowid')
  const flowid = textValue(row, 'WFMID')
  if (!wfid || !flowid) {
    void pageService.showMessage('流程记录缺少 wfid 或 flowid', 'warning')
    return
  }
  try {
    view.captureReadRow(row, ['rowid', 'WFMID'])()
    const buildRoute = detail ? buildFlowRunDetailRoute : buildFlowRunPageRoute
    void router.push(buildRoute({wfid, flowid}, appScope()))
  } catch {
    void pageService.showMessage('当前流程记录已失效，请重新查询', 'warning')
  }
}
function textValue(row: DataRow, field: string): string {
  const value = row[field]
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}
const runtime = computed(() => ready.value ? session.runtime : undefined)
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {
    if (!session.isCurrent(current)) throw new Error('流程监控运行实例已失效')
  }
  return {runtime: current, assertCurrent, invoke(command: string, input: unknown) {
    assertCurrent()
    if (input && typeof input === 'object' && (command === 'flowMonitor.run' || command === 'flowMonitor.detail')) {
      openRun(input as DataRow, command === 'flowMonitor.detail')
    }
  }}
})
</script>
