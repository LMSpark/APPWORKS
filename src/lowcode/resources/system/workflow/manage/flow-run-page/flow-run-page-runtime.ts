/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/flow-run-page-runtime
 * 职责：办理页装配：刷新实例、表单候选与步骤上下文。
 */
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_MONITOR_SCENARIO_ID} from '../flow-runtime-client'
import type {FlowAppendUserContext} from '../flow-append-user'

const FLOW_OBJ_MODEL = 'WFOBJ_FLOW'
const FLOW_LIST_MODEL = 'View_FlowObjList'
const FORM_MODEL = 'WFM_WORKFORM'
const OBJ_FORM_MODEL = 'WFOBJ_FLOW_FORM'
const STEP_MODEL = 'WFOBJ_FLOW_RELATIONLINE_STEP'

export type FlowRunFormRecord = Readonly<{
  tabKey: string
  label: string
  sourcePath: string
  queryString: string
  formKey: string
}>

export type FlowRunPreparedPage = Readonly<{
  instanceTitle: string
  flowObjectId: string
  flowModelId: string
  busRowId: string
  formTabs: readonly FlowRunFormRecord[]
  userDirectoryViewKey: string
}>

function requireView(view: DataView | undefined, modelName: string): DataView {
  if (!view || view.destroyed) throw new Error(`流程办理缺少正式 ${modelName} 视图`)
  return view
}

function firstText(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const text = String(row[key] ?? '').trim()
    if (text) return text
  }
  return ''
}

function buildFormTabs(
  forms: readonly Record<string, unknown>[],
  objectForms: readonly Record<string, unknown>[],
  flowObjectId: string,
): FlowRunFormRecord[] {
  const tabs: FlowRunFormRecord[] = []
  const used = new Set<string>()
  for (const [index, row] of objectForms.entries()) {
    const path = firstText(row, ['FormPath', 'URL', 'url'])
    if (!path) continue
    const key = firstText(row, ['FORMID', 'formid']) || `obj-form-${index}`
    if (used.has(key)) continue
    used.add(key)
    const params = firstText(row, ['FormParams', 'formParams'])
    tabs.push({
      tabKey: key,
      label: firstText(row, ['FormName', 'TITLE']) || `业务页 ${index + 1}`,
      sourcePath: path,
      queryString: params,
      formKey: key,
    })
  }
  if (tabs.length > 0) return tabs
  for (const [index, row] of forms.entries()) {
    const path = firstText(row, ['URL', 'MobileUrl', 'url'])
    if (!path) continue
    const key = firstText(row, ['FORMID', 'rowid', 'formid']) || `form-${index}`
    if (used.has(key)) continue
    used.add(key)
    tabs.push({
      tabKey: key,
      label: firstText(row, ['FormName', 'TITLE']) || `表单 ${index + 1}`,
      sourcePath: path,
      queryString: `flowobjid=${encodeURIComponent(flowObjectId)}&formkey=${encodeURIComponent(key)}`,
      formKey: key,
    })
  }
  return tabs
}

export type PrepareFlowRunPageCommand = Readonly<{
  runtime: PageRuntime
  wfid: string
  flowid: string
  assertCurrent?: () => void
}>

export async function prepareFlowRunPage(command: PrepareFlowRunPageCommand): Promise<FlowRunPreparedPage> {
  const wfid = String(command.wfid ?? '').trim()
  const flowid = String(command.flowid ?? '').trim()
  if (!wfid || !flowid) throw new Error('办理页缺少 wfid 或 flowid')
  command.assertCurrent?.()
  const monitor = command.runtime.getDataSet(FLOW_MONITOR_SCENARIO_ID)
  if (!monitor) throw new Error('流程办理场景尚未装配')
  const listView = requireView(monitor.getView(FLOW_LIST_MODEL, 'default'), FLOW_LIST_MODEL)
  listView.queryContext = {...listView.queryContext, rowid: wfid}
  const flowView = requireView(monitor.getView(FLOW_OBJ_MODEL, 'default'), FLOW_OBJ_MODEL)
  flowView.queryContext = {...flowView.queryContext, rowid: wfid, wfid}
  const formView = requireView(monitor.getView(FORM_MODEL, 'default'), FORM_MODEL)
  formView.queryContext = {...formView.queryContext, FlowID: flowid, WFMID: flowid}
  const objectFormView = requireView(monitor.getView(OBJ_FORM_MODEL, 'default'), OBJ_FORM_MODEL)
  objectFormView.queryContext = {...objectFormView.queryContext, WFOBJID: wfid, wfid}
  const stepView = requireView(monitor.getView(STEP_MODEL, 'default'), STEP_MODEL)
  stepView.queryContext = {...stepView.queryContext, WFOBJID: wfid}
  command.assertCurrent?.()
  await Promise.all([listView.refresh(), flowView.refresh(), formView.refresh(), objectFormView.refresh(), stepView.refresh()])
  command.assertCurrent?.()
  const failed = [listView, flowView, formView, objectFormView].find(item => item.loadingError)
  if (failed?.loadingError) throw failed.loadingError
  const instance = listView.rows.find(isRecord) ?? flowView.rows.find(isRecord)
  const title = instance ? firstText(instance, ['TITLE', 'title', 'AppDesc']) : wfid
  const busRowId = instance ? firstText(instance, ['BusTblObjID', 'busRowId', 'busrowid']) : ''
  const formTabs = buildFormTabs(formView.rows.filter(isRecord), objectFormView.rows.filter(isRecord), wfid)
  return {
    instanceTitle: title || wfid,
    flowObjectId: wfid,
    flowModelId: flowid,
    busRowId,
    formTabs,
    userDirectoryViewKey: buildDataViewKey('Base_UserInfo', 'default', FLOW_MONITOR_SCENARIO_ID),
  }
}

export function buildAppendUserContext(
  step: Record<string, unknown> | null | undefined,
): FlowAppendUserContext | null {
  if (!step || !isRecord(step)) return null
  const rowid = firstText(step, ['rowid', 'ROWID'])
  const wfId = firstText(step, ['WFOBJID', 'wfid'])
  if (!rowid || !wfId) return null
  return {
    rowid,
    WFOBJID: wfId,
    SendNodeModelId: firstText(step, ['SendNodeModelId']),
    ReceiveNodeModelId: firstText(step, ['ReceiveNodeModelId']),
    LastStepID: firstText(step, ['LastStepID', 'lastStepID']),
    TITLE: firstText(step, ['TITLE', 'description', 'ReceiveNodeModelId']),
  }
}