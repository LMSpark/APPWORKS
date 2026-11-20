/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/flow-run-handle-options
 * 职责：解析 GetOptionButtonHandleUserOptionData 返回的节点候选列表与开关字段。
 */
import {isRecord} from '@spark-appworks/spark-utils'

export type FlowRunHandleNodeOption = Readonly<{id: string; title: string; direction?: string; isTurnBack?: boolean}>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function readTruthyFlag(value: unknown): boolean {
  if (value === true || value === 1) return true
  const text = normalizeText(value).toLowerCase()
  return text === '1' || text === 'true' || text === 'yes'
}

export function parseFlowRunHandleNodeOptions(
  source: Record<string, unknown>,
  listKeys: readonly string[],
): readonly FlowRunHandleNodeOption[] {
  let raw: unknown
  for (const key of listKeys) {
    if (key in source) {
      raw = source[key]
      break
    }
  }
  if (!Array.isArray(raw)) return []
  return raw.filter(isRecord).map(row => ({
    id: normalizeText(row['NodeId'] ?? row['nodeId'] ?? row['rowid'] ?? row['ROWID'] ?? row['RowID'] ?? row['id']),
    title: normalizeText(row['MEMO'] ?? row['memo']) || normalizeText(
      row['TITLE'] ?? row['Title'] ?? row['title'] ?? row['nodeName'] ?? row['NodeId'] ?? row['nodeId'],
    ),
    ...(row['direction'] !== undefined || row['Direction'] !== undefined ? {direction: normalizeText(row['direction'] ?? row['Direction'])} : {}),
    ...(row['isTurnBack'] !== undefined || row['IsTurnBack'] !== undefined ? {isTurnBack: readTruthyFlag(row['isTurnBack'] ?? row['IsTurnBack'])} : {}),
  })).filter(item => item.id)
}

export function readFlowRunAllowForceBack(source: Record<string, unknown>): boolean {
  return readTruthyFlag(source['AllowToForceBack'] ?? source['allowToForceBack'])
}
