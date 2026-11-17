/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-detail-graph-projection
 * 职责：按运行步骤/待办为设计图节点打上 in-memory 展示字段，供 RendererGraph 徽标规则消费。
 */
import type {DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
type FlowRunDetailStepRow = Readonly<Record<string, unknown>>
type FlowRunDetailWaitingRow = Readonly<Record<string, unknown>>

const NODE_BADGE_FIELD = 'runGraphBadge'

export type FlowRunNodeBadge = 'completed' | 'waiting'
export type FlowRunGraphNodeBadges = Readonly<Record<string, FlowRunNodeBadge>>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function rowId(row: FlowRunDetailStepRow | FlowRunDetailWaitingRow): string {
  return normalizeText(row['rowid'] ?? row['ROWID'])
}

/** 推导节点已完成/待办集合，待办优先于已完成。 */
export function buildFlowRunGraphNodeBadges(
  steps: readonly FlowRunDetailStepRow[],
  waiting: readonly FlowRunDetailWaitingRow[],
): FlowRunGraphNodeBadges {
  const completed = new Set<string>()
  const waitingNodes = new Set<string>()
  for (const item of steps) {
    if (normalizeText(item['STATUS']) !== '1') continue
    const send = normalizeText(item['SendNodeModelId'])
    const receive = normalizeText(item['ReceiveNodeModelId'])
    if (send) completed.add(send)
    if (receive) completed.add(receive)
  }
  for (const item of waiting) {
    const nodeId = normalizeText(item['NodeID'])
    if (nodeId) waitingNodes.add(nodeId)
  }
  const badges: Record<string, FlowRunNodeBadge> = {}
  for (const id of completed) {
    if (!waitingNodes.has(id)) badges[id] = 'completed'
  }
  for (const id of waitingNodes) badges[id] = 'waiting'
  return badges
}

/** 将徽标字段写入节点行（仅内存展示，不提交）。 */
export function applyFlowRunGraphNodeBadges(nodeView: DataView, badges: FlowRunGraphNodeBadges): void {
  for (const row of nodeView.rows) {
    if (!isRecord(row)) continue
    const id = rowId(row)
    const badge = badges[id]
    if (badge) row[NODE_BADGE_FIELD] = badge
    else Reflect.deleteProperty(row, NODE_BADGE_FIELD)
  }
}

export const FLOW_RUN_GRAPH_NODE_BADGE_FIELD = NODE_BADGE_FIELD
