/**
 * @module app:views/app/workflow-designs/workflow-design-graph
 * 职责：WorkflowDesigns 把投影视图的节点/连线行交给 RendererGraph：接点布局、中心坐标、端点映射、子图路径与新增行。
 * 边界：只读行或生成新增行草稿；新增行的结构经 design.json 投影得到，写入仍由页面通过 DataView 完成。
 * AI用途：排查画布节点位置、连线接点、子图切换或新增节点/连线字段时，从本模块定位。
 */
import type {DataRow} from '@spark-appworks/spark-data'
import type {GraphNodeHandles} from '@spark-appworks/spark-component'
import {
  AGENT_WORKFLOW_LINE_TABLE,
  AGENT_WORKFLOW_NODE_TABLE,
  projectWorkflowDesign,
} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-design-projection'
import {addWorkflowDesignLine, createWorkflowDesignNode, type WorkflowDesignNodeCreateKind} from '@/services/workflow-designs'

/** 节点卡片半宽/半高；投影行的 x/y 是左上角，RendererGraph 使用中心坐标。 */
const HALF_WIDTH = 116
const HALF_HEIGHT = 60

const side = (position: 'top' | 'right' | 'bottom' | 'left', ids: readonly number[]) =>
  ids.map((id, index) => ({id: String(id), side: position, offset: [0.25, 0.5, 0.75][index] ?? 0.5}))

/** design.json 的 dock 编号：输入 1-3 在上、10-12 在左；输出 4-6 在右、7-9 在下（7 靠右）。dock 0 表示自动选最近接点。 */
export const WORKFLOW_NODE_HANDLES: GraphNodeHandles = Object.freeze({
  inputs: [...side('top', [1, 2, 3]), ...side('left', [10, 11, 12])],
  outputs: [...side('right', [4, 5, 6]), ...side('bottom', [9, 8, 7])],
})

/** 节点主键到画布中心坐标；没有坐标的节点由画布临时排列。 */
export function workflowNodePositions(rows: readonly DataRow[]): Record<string, {x: number; y: number}> {
  return Object.fromEntries(rows.flatMap(row => {
    const x = row['x'], y = row['y']
    return typeof x === 'number' && typeof y === 'number' ? [[String(row['nodeKey']), {x: x + HALF_WIDTH, y: y + HALF_HEIGHT}]] : []
  }))
}

/** 画布中心坐标换回投影行的左上角。 */
export function workflowNodeCorner(center: Readonly<{x: number; y: number}>): {x: number; y: number} {
  return {x: Math.round(center.x - HALF_WIDTH), y: Math.round(center.y - HALF_HEIGHT)}
}

/** 连线端点用的节点 id 到同图节点主键。 */
export function workflowEdgeNodeKeys(rows: readonly DataRow[]): Record<string, string> {
  return Object.fromEntries(rows.flatMap(row => typeof row['id'] === 'string' ? [[row['id'], String(row['nodeKey'])]] : []))
}

/** 循环/迭代节点已声明子图时返回子图路径，否则空串。 */
export function workflowChildGraphPath(row: DataRow | null | undefined): string {
  if (!row) return ''
  for (const carrier of ['loop', 'iteration'] as const) {
    const carried = row[carrier]
    if (typeof carried === 'object' && carried !== null && 'subGraph' in carried) return `${String(row['graphPath'])}.${String(row['id'])}.${carrier}.subGraph`
  }
  return ''
}

/** 新增节点的命令。 */
export type WorkflowNodeDraft = Readonly<{
  /** 节点类别。 */
  nodeKind: WorkflowDesignNodeCreateKind
  /** 节点 id，须在本图唯一。 */
  id: string
  /** 标题。 */
  title: string
  /** 描述。 */
  desc: string
  /** 已有节点数，决定默认位置。 */
  index: number
}>

function projected(graph: {nodes: unknown[]; lines: unknown[]}, table: typeof AGENT_WORKFLOW_NODE_TABLE | typeof AGENT_WORKFLOW_LINE_TABLE): DataRow {
  const row = projectWorkflowDesign({workflow: {graph}}, '')[table].at(-1)
  if (!row) throw new Error('新增行投影失败')
  const {nodeKey: _nodeKey, lineKey: _lineKey, graphPath: _graphPath, order: _order, ...fields} = row
  return fields
}

/** 按原设计稿默认结构生成节点，经投影得到节点视图的新增行；id 唯一性由调用方按本图核对。 */
export function workflowNodeRow(draft: WorkflowNodeDraft): DataRow {
  const node = createWorkflowDesignNode({nodes: [], lines: []}, {nodeKind: draft.nodeKind, id: draft.id, title: draft.title, desc: draft.desc,
    position: {x: 120 + draft.index * 260, y: 120}})
  return projected({nodes: [node], lines: []}, AGENT_WORKFLOW_NODE_TABLE)
}

/** 新增连线的命令。 */
export type WorkflowLineDraft = Readonly<{
  /** 起点节点 id。 */
  from: string
  /** 终点节点 id。 */
  to: string
  /** 起点 dock，0 为自动。 */
  fromDock: number
  /** 终点 dock，0 为自动。 */
  toDock: number
  /** 本图已有连线 id。 */
  existingIds: readonly string[]
}>

/** 按原设计稿默认结构生成连线，经投影得到连线视图的新增行。 */
export function workflowLineRow(draft: WorkflowLineDraft): DataRow {
  const endpoint = {nodeId: '', modelId: '', memberName: ''}
  const graph = {nodes: [], lines: draft.existingIds.map(id => ({id, from: endpoint, to: endpoint}))}
  const line = addWorkflowDesignLine(graph, draft.from, draft.to)
  line.from.dock = draft.fromDock
  line.to.dock = draft.toDock
  return projected({nodes: [], lines: [line]}, AGENT_WORKFLOW_LINE_TABLE)
}
