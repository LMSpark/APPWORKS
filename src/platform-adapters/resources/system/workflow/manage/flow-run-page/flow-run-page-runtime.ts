/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/flow-run-page-runtime
 * 职责：办理页装配：刷新实例、表单候选与步骤上下文。
 */
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID} from '../flow-design-client'
import {FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '../flow-runtime-client'
import type {FlowAppendUserContext} from '../flow-append-user'

const FLOW_OBJ_MODEL = 'WFOBJ_FLOW'
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
  stepId: string
  formTabs: readonly FlowRunFormRecord[]
  userDirectoryViewKey: string
  stepHistoryViewKey: string
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
  forms: ReadonlyArray<Record<string, unknown>>,
  objectForms: ReadonlyArray<Record<string, unknown>>,
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
  stepId?: string
  assertCurrent?: () => void
}>

export async function prepareFlowRunPage(command: PrepareFlowRunPageCommand): Promise<FlowRunPreparedPage> {
  const wfid = typeof command.wfid === 'string' ? command.wfid.trim() : ''
  const flowid = typeof command.flowid === 'string' ? command.flowid.trim() : ''
  if (!wfid || !flowid) throw new Error('办理页缺少 wfid 或 flowid')
  command.assertCurrent?.()
  const monitor = command.runtime.getDataSet(FLOW_MONITOR_SCENARIO_ID)
  if (!monitor) throw new Error('流程办理场景尚未装配')
  const design = command.runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
  if (!design) throw new Error('流程办理缺少设计场景伙伴')
  const workbench = command.runtime.getDataSet(FLOW_WORKBENCH_SCENARIO_ID)
  if (!workbench) throw new Error('流程办理缺少运行工作台场景伙伴')
  const flowView = requireView(monitor.getView(FLOW_OBJ_MODEL, 'default'), FLOW_OBJ_MODEL)
  flowView.queryContext = {...flowView.queryContext, rowid: wfid, wfid}
  flowView.page = 1
  await flowView.refresh()
  command.assertCurrent?.()
  if (flowView.loadingError) throw flowView.loadingError
  const instance = flowView.rows[0]
  if (!instance || flowView.rows.length !== 1 || flowView.total !== 1 || flowView.countReported === false || flowView.nextPageAvailable === true
    || instance['rowid'] !== wfid || instance['WFMID'] !== flowid) {
    throw new Error('流程办理缺少匹配的唯一正式实例')
  }
  const titleVisible = flowView.fieldAccess(instance, 'TITLE').read === 'visible'
  const assertInstance = flowView.captureReadRow(instance, titleVisible ? ['rowid', 'WFMID', 'BusTblObjID', 'TITLE'] : ['rowid', 'WFMID', 'BusTblObjID'])
  const businessKey = instance['BusTblObjID']
  if (businessKey !== null && (typeof businessKey !== 'string' || businessKey !== businessKey.trim())) {
    throw new Error('流程办理正式业务行键无效')
  }
  const title = titleVisible && typeof instance['TITLE'] === 'string' ? instance['TITLE'].trim() : ''
  const formView = requireView(design.getView(FORM_MODEL, 'default'), FORM_MODEL)
  formView.queryContext = {...formView.queryContext, FlowID: flowid, WFMID: flowid}
  const objectFormView = requireView(workbench.getView(OBJ_FORM_MODEL, 'default'), OBJ_FORM_MODEL)
  objectFormView.queryContext = {...objectFormView.queryContext, WFOBJID: wfid, wfid}
  const stepView = requireView(workbench.getView(STEP_MODEL, 'default'), STEP_MODEL)
  stepView.queryContext = {...stepView.queryContext, WFOBJID: wfid}
  const commandInstanceView = requireView(workbench.getView(FLOW_OBJ_MODEL, 'default'), FLOW_OBJ_MODEL)
  commandInstanceView.queryContext = {...commandInstanceView.queryContext, rowid: wfid, wfid}
  command.assertCurrent?.()
  await Promise.all([formView.refresh(), objectFormView.refresh(), stepView.refresh(), commandInstanceView.refresh()])
  command.assertCurrent?.()
  assertInstance()
  const failed = [formView, objectFormView, commandInstanceView].find(item => item.loadingError)
  if (failed?.loadingError) throw failed.loadingError
  if (stepView.loadingError) throw stepView.loadingError
  const stepId = command.stepId?.trim() ?? ''
  if (stepId && stepView.rows.filter(isRecord).filter(row => String(row['rowid'] ?? '') === stepId && String(row['WFOBJID'] ?? '') === wfid).length !== 1) {
    throw new Error('指定办理步骤不在本次实例正式查询结果中')
  }
  const formTabs = buildFormTabs(formView.rows.filter(isRecord), objectFormView.rows.filter(isRecord), wfid)
  return {
    instanceTitle: title || wfid,
    flowObjectId: wfid,
    flowModelId: flowid,
    busRowId: businessKey ?? '',
    stepId,
    formTabs,
    userDirectoryViewKey: buildDataViewKey('Base_UserInfo', 'default', FLOW_MONITOR_SCENARIO_ID),
    stepHistoryViewKey: buildDataViewKey(STEP_MODEL, 'default', FLOW_WORKBENCH_SCENARIO_ID),
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
