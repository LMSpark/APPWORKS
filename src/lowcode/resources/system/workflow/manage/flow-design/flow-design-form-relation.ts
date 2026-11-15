/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design/flow-design-form-relation
 * 职责：从 WFM_WORKFORM DataView 序列化并提交 SaveFlowAndFormRelation。
 */
import type {DataView} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {isRecord} from '@spark-appworks/spark-utils'
import {FLOW_DESIGN_SCENARIO_ID} from '../flow-design-client'
import {requestFlowResult, type FlowRequestScope} from '../flow-run-page/flow-http'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function readNumber(value: unknown): number | undefined {
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

export type FlowWorkFormPayloadRow = Readonly<Record<string, unknown>>

/** 将视图行映射为 Flow 合同 WFMWORKFORM[]。 */
export function buildWorkFormRelationPayload(view: DataView, flowModelId: string): FlowWorkFormPayloadRow[] {
  const flowId = normalizeText(flowModelId)
  const payload: FlowWorkFormPayloadRow[] = []
  for (const row of view.rows) {
    if (!isRecord(row)) continue
    const rowId = normalizeText(row['rowid'] ?? row['ROWID'])
    if (!rowId) continue
    payload.push({
      ROWID: rowId,
      FORMID: normalizeText(row['FORMID'] ?? row['formid']) || rowId,
      URL: normalizeText(row['URL'] ?? row['url']),
      MobileUrl: normalizeText(row['MobileUrl'] ?? row['mobileUrl']),
      FormName: normalizeText(row['FormName'] ?? row['TITLE'] ?? row['title']),
      FlowID: normalizeText(row['FlowID'] ?? row['FLOWID']) || flowId,
      CnPath: normalizeText(row['CnPath']),
      BusField: normalizeText(row['BusField']),
      BusTable: normalizeText(row['BusTable']),
      TitleField: normalizeText(row['TitleField']),
      ...(readNumber(row['Width']) !== undefined ? {Width: readNumber(row['Width'])} : {}),
      ...(readNumber(row['Height']) !== undefined ? {Height: readNumber(row['Height'])} : {}),
    })
  }
  return payload
}

export function shouldSyncWorkFormRelation(view: DataView): boolean {
  if (view.rows.length > 0) return true
  return view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()
}

export type SaveFlowWorkFormRelationCommand = Readonly<{
  http: HttpClientBase
  flowModelId: string
  view: DataView
  readScope: () => FlowRequestScope
  assertCurrent?: () => void
}>

export async function saveFlowWorkFormRelation(command: SaveFlowWorkFormRelationCommand): Promise<void> {
  if (!shouldSyncWorkFormRelation(command.view)) return
  const flowId = normalizeText(command.flowModelId)
  if (!flowId) throw new Error('流程表单关联缺少 flowId')
  const scope = command.readScope()
  if (!scope.token.trim()) throw new Error('流程表单关联缺少登录身份')
  command.assertCurrent?.()
  const body = buildWorkFormRelationPayload(command.view, flowId)
  if (body.length === 0) return
  await requestFlowResult(command.http, {
    method: 'POST',
    path: `/api/Flow/SaveFlowAndFormRelation/${encodeURIComponent(flowId)}`,
    data: body,
    headers: {...scope.headers, 'X-FormKey': FLOW_DESIGN_SCENARIO_ID},
  })
  command.assertCurrent?.()
}