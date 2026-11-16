/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-records
 * 职责：从步骤 DataView 行筛选追加办理列表，并规范化字段。
 */
import {isRecord} from '@spark-appworks/spark-utils'

export type FlowAppendUserContext = Readonly<{
  rowid: string
  WFOBJID: string
  SendNodeModelId: string
  ReceiveNodeModelId: string
  LastStepID: string
  TITLE: string
}>

export type FlowAppendUserListRecord = Readonly<{
  rowid: string
  WFOBJID: string
  ReceiveUserId: string
  ReceiveUserName: string
  StepState: string
  STATUS: string
  raw: Record<string, unknown>
}>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function firstTextByKeys(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const text = normalizeText(record[key])
    if (text) return text
  }
  return ''
}

export function normalizeFlowAppendUserContext(
  context: Partial<FlowAppendUserContext> | null | undefined,
): FlowAppendUserContext {
  return {
    rowid: normalizeText(context?.rowid),
    WFOBJID: normalizeText(context?.WFOBJID),
    SendNodeModelId: normalizeText(context?.SendNodeModelId),
    ReceiveNodeModelId: normalizeText(context?.ReceiveNodeModelId),
    LastStepID: normalizeText(context?.LastStepID),
    TITLE: normalizeText(context?.TITLE),
  }
}

export function normalizeFlowAppendUserListRecord(record: unknown): FlowAppendUserListRecord | null {
  if (!isRecord(record)) return null
  return {
    rowid: firstTextByKeys(record, ['rowid', 'ROWID', 'RowID']),
    WFOBJID: firstTextByKeys(record, ['WFOBJID', 'WfObjId', 'wfobjid']),
    ReceiveUserId: firstTextByKeys(record, ['ReceiveUserId', 'receiveUserId', 'ReceiveUserid']),
    ReceiveUserName: firstTextByKeys(record, ['ReceiveUserName', 'receiveUserName', 'ReceiveUsername']),
    StepState: firstTextByKeys(record, ['StepState', 'stepState']),
    STATUS: firstTextByKeys(record, ['STATUS', 'Status', 'status']),
    raw: record,
  }
}

const ACTIVE_STEP_STATES = new Set(['0', '1'])

/** 对齐参考 queryFlowAppendUserList 过滤：同关系组、LastStepID、StepState 0/1。 */
export function filterFlowAppendUserList(
  rows: ReadonlyArray<Record<string, unknown>>,
  context: Partial<FlowAppendUserContext> | null | undefined,
): FlowAppendUserListRecord[] {
  const normalized = normalizeFlowAppendUserContext(context)
  if (!normalized.WFOBJID || !normalized.SendNodeModelId || !normalized.ReceiveNodeModelId || !normalized.LastStepID) {
    return []
  }
  const output: FlowAppendUserListRecord[] = []
  for (const row of rows) {
    const item = normalizeFlowAppendUserListRecord(row)
    if (!item) continue
    if (item.WFOBJID !== normalized.WFOBJID) continue
    if (firstTextByKeys(row, ['SendNodeModelId']) !== normalized.SendNodeModelId) continue
    if (firstTextByKeys(row, ['ReceiveNodeModelId']) !== normalized.ReceiveNodeModelId) continue
    if (firstTextByKeys(row, ['LastStepID', 'lastStepID', 'LastStepId']) !== normalized.LastStepID) continue
    if (!ACTIVE_STEP_STATES.has(item.StepState)) continue
    output.push(item)
  }
  return output
}
