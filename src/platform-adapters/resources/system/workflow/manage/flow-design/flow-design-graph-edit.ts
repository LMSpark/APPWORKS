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
  const nextPositions = Object.fromEntries(Object.entries(layoutOverride.nodePositions ?? {}).filter(([id]) => !nodeIds.has(id)))
  const nextPaths = Object.fromEntries(Object.entries(layoutOverride.edgePaths ?? {}).filter(([id]) => !edgeIds.has(id)))
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
export async function removeFlowDesignGraphSelection(
  command: RemoveFlowDesignGraphSelectionCommand,
): Promise<RemoveFlowDesignGraphSelectionResult> {
  const flowModelId = assertFlowDesignTarget({flowModelId: command.flowModelId})
  const id = normalizeText(command.selection.id)
  if (!id) throw new Error('未选中节点或连线')
  const nodeView = requireView(command.runtime, 'WFM_FLOW_NODE')
  const edgeView = requireView(command.runtime, 'WFM_NODE_REALATION')

  if (command.selection.kind === 'edge') {
    if (!edgeView.rows.some(row => isRecord(row) && readRowId(row) === id && normalizeText(row['FLOWID']) === flowModelId)) {
      throw new Error('未找到所选连线')
    }
    const row=edgeView.rows.find(candidate=>edgeView.getPkKey(candidate)===id)
    if(!row)throw Error('未找到所选连线')
    if(edgeView.deleteActionState(row)!=='enabled')throw Error('所选连线不允许删除')
    await edgeView.removeRow(id)
    return {layoutOverride: stripLayoutForIds(command.layoutOverride, new Set(), new Set([id]))}
  }

  const node=nodeView.rows.find(row=>readRowId(row)===id&&row['FLOWID']===flowModelId)
  if(!node)throw Error('未找到所选节点')
  const related=edgeView.rows.filter(row=>row['FLOWID']===flowModelId&&(row['UpNodeID']===id||row['NextNodeID']===id))
  if(nodeView.deleteActionState(node)!=='enabled'||related.some(row=>edgeView.deleteActionState(row)!=='enabled'))throw Error('节点或关联连线不允许删除')
  const removedEdges=new Set(related.map(readRowId))
  for(const edgeId of removedEdges)await edgeView.removeRow(edgeId)
  await nodeView.removeRow(id)
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
  await nodeView.addRowWithIdentity({field:'rowid',value:nodeId},{
    FLOWID: flowModelId,
    TITLE: '新节点',
    TYPEID: '11',
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

export type AddFlowDesignEdgeCommand = Readonly<{
  runtime: PageRuntime
  flowModelId: string
  parentId: string
  childId: string
  layoutOverride: FlowDesignLayoutOverride
}>

export type AddFlowDesignEdgeResult = Readonly<{
  edgeId: string
  layoutOverride: FlowDesignLayoutOverride
}>

/** 新增连线行；同源同目标不重复添加。 */
export async function addFlowDesignEdge(command: AddFlowDesignEdgeCommand): Promise<AddFlowDesignEdgeResult> {
  const flowModelId = assertFlowDesignTarget({flowModelId: command.flowModelId})
  const parentId = normalizeText(command.parentId)
  const childId = normalizeText(command.childId)
  if (!parentId || !childId) throw new Error('连线缺少端点节点')
  if (parentId === childId) throw new Error('不能将节点连接到自身')
  const nodeView = requireView(command.runtime, 'WFM_FLOW_NODE')
  const edgeView = requireView(command.runtime, 'WFM_NODE_REALATION')
  const nodeExists = (id: string) => nodeView.rows.some(row => isRecord(row) && readRowId(row) === id && normalizeText(row['FLOWID']) === flowModelId)
  if (!nodeExists(parentId) || !nodeExists(childId)) throw new Error('端点节点不属于当前流程')
  const edgeExists = edgeView.rows.some(row =>
    isRecord(row)
    && normalizeText(row['FLOWID']) === flowModelId
    && normalizeText(row['UpNodeID']) === parentId
    && normalizeText(row['NextNodeID']) === childId,
  )
  if (edgeExists) throw new Error('相同节点间连线已存在')
  const edgeId = crypto.randomUUID()
  await edgeView.addRowWithIdentity({field:'rowid',value:edgeId},{
    FLOWID: flowModelId,
    UpNodeID: parentId,
    NextNodeID: childId,
  })
  return {edgeId, layoutOverride: command.layoutOverride}
}
