/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design/flow-design-table-sync
 * 职责：按 DesignJson 节点/边 id 集合同 FLOWID 下行做 staged 删增，供 saveFlowDesignInfo 提交。
 */
import type {DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {parseFlowDesignGraphJson} from '../flow-design-graph-projection'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function readRowId(row: Record<string, unknown>): string {
  return normalizeText(row['rowid'] ?? row['ROWID'])
}

function titleFromNode(node: Record<string, unknown>): string {
  const props = node['properties']
  if (isRecord(props)) {
    const title = normalizeText(props['title'] ?? props['TITLE'])
    if (title) return title
  }
  return normalizeText(node['title'] ?? node['TITLE']) || '未命名节点'
}

export type SyncFlowDesignTablesCommand = Readonly<{
  flowModelId: string
  designJson: string
  nodeView: DataView
  edgeView: DataView
  assertCurrent?: () => void
}>

/** 将 DesignJson 与节点/连线表对齐；json 节点/边集合为空时不执行对应删除。 */
export async function syncFlowDesignTables(command: SyncFlowDesignTablesCommand): Promise<void> {
  const flowModelId = normalizeText(command.flowModelId)
  if (!flowModelId) throw new Error('流程设计同步缺少 flowModelId')
  const parsed = parseFlowDesignGraphJson(command.designJson)
  const nodeIds = new Set((parsed?.nodes ?? []).map(node => normalizeText(node['id'])).filter(Boolean))
  const edgeIds = new Set((parsed?.edges ?? []).map(edge => normalizeText(edge['id'])).filter(Boolean))

  if (nodeIds.size > 0) {
    for (const row of command.nodeView.rows) {
      if (!isRecord(row)) continue
      if (normalizeText(row['FLOWID']) !== flowModelId) continue
      const id = readRowId(row)
      if (id && !nodeIds.has(id)) command.nodeView.deleteRowById(id)
    }
  }

  for (const node of parsed?.nodes ?? []) {
    const id = normalizeText(node['id'])
    if (!id) continue
    const exists = command.nodeView.rows.some(row => isRecord(row) && readRowId(row) === id)
    if (!exists) {
      command.assertCurrent?.()
      await command.nodeView.addRow({
        rowid: id,
        FLOWID: flowModelId,
        TITLE: titleFromNode(node),
      })
    }
  }

  if (edgeIds.size > 0) {
    for (const row of command.edgeView.rows) {
      if (!isRecord(row)) continue
      if (normalizeText(row['FLOWID']) !== flowModelId) continue
      const id = readRowId(row)
      if (id && !edgeIds.has(id)) command.edgeView.deleteRowById(id)
    }
  }

  for (const edge of parsed?.edges ?? []) {
    const id = normalizeText(edge['id'])
    const parent = normalizeText(edge['sourceNodeId'])
    const child = normalizeText(edge['targetNodeId'])
    if (!id || !parent || !child) continue
    const exists = command.edgeView.rows.some(row => isRecord(row) && readRowId(row) === id)
    if (!exists) {
      command.assertCurrent?.()
      await command.edgeView.addRow({
        rowid: id,
        FLOWID: flowModelId,
        PARENTID: parent,
        CHILDID: child,
      })
    }
  }
}