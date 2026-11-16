/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-records
 * 职责：规范化宿主步骤上下文和单条原查询记录；不执行列表查询或过滤。
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
