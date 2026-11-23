/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design/flow-design-node-auth
 * 职责：刷新设计场景节点权限视图 queryContext（FunctionNodeAuth@nodeAuth）。
 */
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {assertFlowDesignTarget, FLOW_DESIGN_SCENARIO_ID} from '../flow-design-client'

function requireView(view: DataView | undefined, modelName: string, viewId: string): DataView {
  if (!view || view.destroyed) throw new Error(`流程设计缺少正式 ${modelName}@${viewId} 视图`)
  return view
}

export type SyncFlowDesignNodeAuthCommand = Readonly<{
  runtime: PageRuntime
  flowModelId: string
  selectedNodeId: string
  assertCurrent?: () => void
}>

/** 按选中节点刷新 FunctionNodeAuth 命名视图；无节点时清空 FunCodeID 过滤键。 */
export async function syncFlowDesignNodeAuthView(command: SyncFlowDesignNodeAuthCommand): Promise<string> {
  const targetId = assertFlowDesignTarget({
    flowModelId: command.flowModelId,
    ...(command.assertCurrent ? {assertCurrent: command.assertCurrent} : {}),
  })
  const nodeId = typeof command.selectedNodeId === 'string' ? command.selectedNodeId.trim() : ''
  command.assertCurrent?.()
  const dataSet = command.runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
  if (!dataSet) throw new Error('流程设计场景尚未装配')
  const optionView = dataSet.getView('_Base_FunctionNode', 'flowDesignOptions')
  if (optionView && !optionView.destroyed) {
    optionView.queryContext = {...optionView.queryContext, FLOWID: targetId}
    await optionView.refresh()
    command.assertCurrent?.()
  }
  const view = requireView(dataSet.getView('FunctionNodeAuth', 'nodeAuth'), 'FunctionNodeAuth', 'nodeAuth')
  view.queryContext = {
    ...view.queryContext,
    FLOWID: targetId,
    pageID: targetId,
    selectedNodeId: nodeId,
  }
  command.assertCurrent?.()
  await view.refresh()
  command.assertCurrent?.()
  if (view.loadingError) throw view.loadingError
  return buildDataViewKey('FunctionNodeAuth', 'nodeAuth', FLOW_DESIGN_SCENARIO_ID)
}

export type FlowDesignNodeAuthRowSeed = Readonly<{
  flowModelId: string
  selectedNodeId: string
}>

/** 新增节点权限行时的默认字段（保存前仍须走 DataView 编辑链）。 */
export function defaultFlowDesignNodeAuthRow(seed: FlowDesignNodeAuthRowSeed): Record<string, unknown> {
  const pageId = typeof seed.flowModelId === 'string' ? seed.flowModelId.trim() : ''
  const nodeId = typeof seed.selectedNodeId === 'string' ? seed.selectedNodeId.trim() : ''
  if (!pageId || !nodeId) throw new Error('新增节点权限缺少流程或节点身份')
  return {contenttype: 1, pageID: pageId, FunCodeID: nodeId, status: 1}
}
