/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-detail-runtime
 * 职责：运行详情页聚合刷新步骤/待办与设计只读图，不发起办理写入。
 */
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID} from '../flow-design-client'
import type {FlowDesignGraphLayout} from '../flow-design-graph-projection'
import {prepareFlowDesignViews} from '../flow-design-runtime'
import {
  applyFlowRunGraphNodeBadges,
  buildFlowRunGraphNodeBadges,
  FLOW_RUN_GRAPH_NODE_BADGE_FIELD,
  type FlowRunGraphNodeBadges,
} from './flow-run-detail-graph-projection'

import {FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '../flow-runtime-client'

const MONITOR_SCENARIO_ID = FLOW_MONITOR_SCENARIO_ID
const STEP_MODEL = 'WFOBJ_FLOW_RELATIONLINE_STEP'
const WAITING_MODEL = 'WFOBJ_FLOW_Waiting'

export type FlowRunDetailPreparedPage = Readonly<{
  nodeViewKey: string
  edgeViewKey: string
  stepViewKey: string
  waitingViewKey: string
  graphLayout: FlowDesignGraphLayout
  nodeBadgeField: typeof FLOW_RUN_GRAPH_NODE_BADGE_FIELD
  nodeBadges: FlowRunGraphNodeBadges
}>

function requireView(view: DataView | undefined, modelName: string): DataView {
  if (!view || view.destroyed) throw new Error(`流程运行详情缺少正式 ${modelName} 视图`)
  return view
}

export type PrepareFlowRunDetailPageCommand = Readonly<{
  runtime: PageRuntime
  wfid: string
  flowid: string
  assertCurrent?: () => void
}>

/** 刷新监控场景步骤/待办，并装配伙伴设计场景只读图。 */
export async function prepareFlowRunDetailPage(
  command: PrepareFlowRunDetailPageCommand,
): Promise<FlowRunDetailPreparedPage> {
  const wfid = typeof command.wfid === 'string' ? command.wfid.trim() : ''
  const flowid = typeof command.flowid === 'string' ? command.flowid.trim() : ''
  if (!flowid) throw new Error('缺少流程模型标识 flowid')
  command.assertCurrent?.()
  if (!command.runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)) {
    throw new Error('运行详情缺少流程设计伙伴场景，请确认 peerScenarioIds 已装配')
  }
  const monitor = command.runtime.getDataSet(MONITOR_SCENARIO_ID)
  if (!monitor) throw new Error('流程运行详情场景尚未装配')
  const workbench = command.runtime.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)
  if (!workbench) throw new Error('运行详情缺少运行工作台伙伴场景')
  const stepStates = workbench.getView('AppendStepStates', 'default')
  if (wfid) {
    const stepView = requireView(workbench.getView(STEP_MODEL, 'default'), STEP_MODEL)
    const waitingView = requireView(workbench.getView(WAITING_MODEL, 'default'), WAITING_MODEL)
    stepView.queryContext = {...stepView.queryContext, WFOBJID: wfid}
    waitingView.queryContext = {...waitingView.queryContext, wfid}
    command.assertCurrent?.()
    await Promise.all([stepView.refresh(), waitingView.refresh(), stepStates?.refresh()])
    command.assertCurrent?.()
    const failed = [stepView, waitingView].find(item => item.loadingError)
    if (failed?.loadingError) throw failed.loadingError
  }
  const design = await prepareFlowDesignViews(command.runtime, flowid, {
    ...(command.assertCurrent ? {assertCurrent: command.assertCurrent} : {}),
  })
  command.assertCurrent?.()
  const stepView = requireView(workbench.getView(STEP_MODEL, 'default'), STEP_MODEL)
  const waitingView = requireView(workbench.getView(WAITING_MODEL, 'default'), WAITING_MODEL)
  const badgeSteps = stepView.rows.filter(isRecord)
  const badgeWaiting = waitingView.rows.filter(isRecord)
  const badges = buildFlowRunGraphNodeBadges(badgeSteps, badgeWaiting)
  const designSet = command.runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
  const nodeView = requireView(designSet?.getView('WFM_FLOW_NODE', 'default'), 'WFM_FLOW_NODE')
  applyFlowRunGraphNodeBadges(nodeView, badges)
  return {
    nodeViewKey: design.nodeViewKey,
    edgeViewKey: design.edgeViewKey,
    stepViewKey: buildDataViewKey(STEP_MODEL, 'default', FLOW_WORKBENCH_SCENARIO_ID),
    waitingViewKey: buildDataViewKey(WAITING_MODEL, 'default', FLOW_WORKBENCH_SCENARIO_ID),
    graphLayout: design.graphLayout,
    nodeBadgeField: FLOW_RUN_GRAPH_NODE_BADGE_FIELD,
    nodeBadges: badges,
  }
}
