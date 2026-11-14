/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design-runtime
 * 职责：在已装配流程设计场景的 PageRuntime 内，按目标模型 rowid 刷新模型/节点/连线视图。
 * 边界：供设计对话框消费父页运行实例，不单独触发场景装载或导航身份校验。
 */
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {assertFlowDesignTarget, FLOW_DESIGN_SCENARIO_ID} from './flow-design-client'
import {readFlowDesignDataJsonText} from './flow-design-data-json'
import {buildFlowDesignGraphLayout, type FlowDesignGraphLayout} from './flow-design-graph-projection'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'

const DESIGN_TABLES = ['WFM_FLOW_MODLE', 'WFM_FLOW_NODE', 'WFM_NODE_REALATION'] as const

export type FlowDesignPreparedViews = Readonly<{
  modelTitle: string
  nodeViewKey: string
  edgeViewKey: string
  graphLayout: FlowDesignGraphLayout
}>

function requireView(view: DataView | undefined, modelName: string): DataView {
  if (!view || view.destroyed) throw new Error(`流程设计缺少正式 ${modelName} 视图`)
  return view
}

function readRowTitle(row: DataView['rows'][number] | undefined, fallback: string): string {
  if (!row || typeof row !== 'object') return fallback
  const title = row['TITLE']
  return typeof title === 'string' && title.trim() ? title.trim() : fallback
}

/** 写入 FLOWID 查询上下文并刷新设计场景下三张主表视图。 */
export async function prepareFlowDesignViews(
  runtime: PageRuntime,
  flowModelId: string,
  options: Readonly<{assertCurrent?: () => void}> = {},
): Promise<FlowDesignPreparedViews> {
  const targetId = assertFlowDesignTarget({
    flowModelId,
    ...(options.assertCurrent ? {assertCurrent: options.assertCurrent} : {}),
  })
  options.assertCurrent?.()
  const dataSet = runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
  if (!dataSet) throw new Error('流程设计场景尚未装配，请从流程模型列表刷新后重开设计')
  const queryContext = {FLOWID: targetId, rowid: targetId}
  const views: DataView[] = []
  for (const modelName of DESIGN_TABLES) {
    const view = requireView(dataSet.getView(modelName, 'default'), modelName)
    view.queryContext = {...view.queryContext, ...queryContext}
    views.push(view)
  }
  options.assertCurrent?.()
  await Promise.all(views.map(item => item.refresh()))
  options.assertCurrent?.()
  const failed = views.find(item => item.loadingError)
  if (failed?.loadingError) throw failed.loadingError
  const modelView = requireView(dataSet.getView('WFM_FLOW_MODLE', 'default'), 'WFM_FLOW_MODLE')
  const nodeView = requireView(dataSet.getView('WFM_FLOW_NODE', 'default'), 'WFM_FLOW_NODE')
  const edgeView = requireView(dataSet.getView('WFM_NODE_REALATION', 'default'), 'WFM_NODE_REALATION')
  const modelRow = modelView.rows[0]
  const designJson = await readFlowDesignDataJsonText({
    flowId: targetId,
    ...(modelRow && typeof modelRow === 'object' ? {modelRow} : {}),
    api: lowcodeApi.design,
    ...(options.assertCurrent ? {assertCurrent: options.assertCurrent} : {}),
  })
  options.assertCurrent?.()
  return {
    modelTitle: readRowTitle(modelRow, targetId),
    nodeViewKey: buildDataViewKey('WFM_FLOW_NODE', 'default', FLOW_DESIGN_SCENARIO_ID),
    edgeViewKey: buildDataViewKey('WFM_NODE_REALATION', 'default', FLOW_DESIGN_SCENARIO_ID),
    graphLayout: buildFlowDesignGraphLayout({modelView, nodeView, edgeView, designJsonOverride: designJson}),
  }
}