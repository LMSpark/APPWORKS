/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design/flow-design-graph-edit
 * 职责：设计页会话内增删节点/连线行与布局覆盖，保存仍走 saveFlowDesignInfo。
 */
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {FLOW_DESIGN_SCENARIO_ID, assertFlowDesignTarget} from '../flow-design-client'
import type {FlowDesignLayoutOverride} from '../flow-design-graph-projection'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function readRowId(row: Record<string, unknown>): string {
  return normalizeText(row['rowid'] ?? row['ROWID'])
}

function requireView(runtime: PageRuntime, modelName: string) {
  const dataSet = runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
  if (!dataSet) throw new Error('流程设计场景尚未装配')
  const view = dataSet.getView(modelName, 'default')
  if (!view || view.destroyed) throw new Error(`流程设计缺少 ${modelName} 视图`)
  return view
}

function stripLayoutForIds(
  layoutOverride: FlowDesignLayoutOverride,
  nodeIds: ReadonlySet<string>,
  edgeIds: ReadonlySet<string>,
): FlowDesignLayoutOverride {
  const nextPositions = {...layoutOverride.nodePositions}
  const nextPaths = {...layoutOverride.edgePaths}
  for (const id of nodeIds) delete nextPositions[id]
  for (const id of edgeIds) delete nextPaths[id]
  return {
    ...(Object.keys(nextPositions).length > 0 ? {nodePositions: nextPositions} : {}),
    ...(Object.keys(nextPaths).length > 0 ? {edgePaths: nextPaths} : {}),
  }
}

export type RemoveFlowDesignGraphSelectionCommand = Readonly<{
  runtime: PageRuntime
  flowModelId: string
  selection: Readonly<{kind: 'node' | 'edge'; id: string}>
  layoutOverride: FlowDesignLayoutOverride
}>

export type RemoveFlowDesignGraphSelectionResult = Readonly<{
  layoutOverride: FlowDesignLayoutOverride
}>

/** 从正式表删除选中节点或连线，并清除对应布局覆盖。 */
export function removeFlowDesignGraphSelection(
  command: RemoveFlowDesignGraphSelectionCommand,
): RemoveFlowDesignGraphSelectionResult {
  const flowModelId = assertFlowDesignTarget({flowModelId: command.flowModelId})
  const id = normalizeText(command.selection.id)
  if (!id) throw new Error('未选中节点或连线')
  const nodeView = requireView(command.runtime, 'WFM_FLOW_NODE')
  const edgeView = requireView(command.runtime, 'WFM_NODE_REALATION')

  if (command.selection.kind === 'edge') {
    if (!edgeView.rows.some(row => isRecord(row) && readRowId(row) === id && normalizeText(row['FLOWID']) === flowModelId)) {
      throw new Error('未找到所选连线')
    }
    edgeView.deleteRowById(id)
    return {layoutOverride: stripLayoutForIds(command.layoutOverride, new Set(), new Set([id]))}
  }

  const removedEdges = new Set<string>()
  for (const row of edgeView.rows) {
    if (!isRecord(row) || normalizeText(row['FLOWID']) !== flowModelId) continue
    const parent = normalizeText(row['PARENTID'])
    const child = normalizeText(row['CHILDID'])
    if (parent !== id && child !== id) continue
    const edgeId = readRowId(row)
    if (edgeId) {
      edgeView.deleteRowById(edgeId)
      removedEdges.add(edgeId)
    }
  }
  if (!nodeView.rows.some(row => isRecord(row) && readRowId(row) === id && normalizeText(row['FLOWID']) === flowModelId)) {
    throw new Error('未找到所选节点')
  }
  nodeView.deleteRowById(id)
  return {
    layoutOverride: stripLayoutForIds(command.layoutOverride, new Set([id]), removedEdges),
  }
}

export type AddFlowDesignNodeCommand = Readonly<{
  runtime: PageRuntime
  flowModelId: string
  layoutOverride: FlowDesignLayoutOverride
  x?: number
  y?: number
}>

export type AddFlowDesignNodeResult = Readonly<{
  nodeId: string
  layoutOverride: FlowDesignLayoutOverride
}>

/** 新增空节点行并写入默认画布坐标。 */
export async function addFlowDesignNode(command: AddFlowDesignNodeCommand): Promise<AddFlowDesignNodeResult> {
  const flowModelId = assertFlowDesignTarget({flowModelId: command.flowModelId})
  const nodeView = requireView(command.runtime, 'WFM_FLOW_NODE')
  const nodeId = crypto.randomUUID()
  const x = Number.isFinite(command.x) ? Number(command.x) : 160
  const y = Number.isFinite(command.y) ? Number(command.y) : 120
  await nodeView.addRow({
    rowid: nodeId,
    FLOWID: flowModelId,
    TITLE: '新节点',
    NODETYPE: '8',
  })
  return {
    nodeId,
    layoutOverride: {
      ...command.layoutOverride,
      nodePositions: {
        ...command.layoutOverride.nodePositions,
        [nodeId]: {x, y},
      },
    },
  }
}