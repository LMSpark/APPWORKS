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
import {captureFlowAppendStep} from '../flow-append-user/flow-append-user-list'

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

/** 工作台选项和命令对同一正式实例需要核验的输入。 */
type FlowWorkbenchInstanceTarget = Readonly<{
  /** 取自原步骤所属的流程实例或待提交命令。 */
  objectId: unknown
  /** 选项和办理提交指定的流程模型键。 */
  modelId?: string
  /** 选项和办理提交使用的业务行键，空串代表正式无业务行。 */
  businessRowId?: string
}>

/** 从工作台原查询捕获完整唯一的目标及可读字段，供选项接纳与命令派发重核。 */
export function captureFlowWorkbenchInstance(view: DataView | undefined, target: FlowWorkbenchInstanceTarget): () => void {
  const object = view?.rows[0]
  if (!view || view.loadingError || view.rows.length !== 1 || view.total !== 1 || view.countReported === false
    || view.nextPageAvailable === true || !object || typeof target.objectId !== 'string' || !target.objectId.trim()
    || object['rowid'] !== target.objectId) {
    throw Error('审批工作台缺少匹配的唯一正式实例')
  }
  const assertObject = view.captureReadRow(object, target.businessRowId === undefined
    ? ['rowid', 'WFMID'] : ['rowid', 'WFMID', 'BusTblObjID'])
  const modelId = object['WFMID']
  if (typeof modelId !== 'string' || !modelId.trim() || (target.modelId !== undefined && modelId !== target.modelId)) {
    throw Error('审批流程模型与正式实例不符')
  }
  if (target.businessRowId !== undefined) {
    const businessRowId = object['BusTblObjID']
    if ((businessRowId === null ? '' : businessRowId) !== target.businessRowId) throw Error('审批业务行与正式实例不符')
  }
  return assertObject
}

function assertCompleteForms(view: DataView): void {
  view.captureReadResult()()
  if (view.total !== view.rows.length || view.countReported === false || view.nextPageAvailable === true) {
    throw Error('流程表单查询结果不完整')
  }
}

function formText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function formLabel(view: DataView, row: DataView['rows'][number], fallback: string): string {
  if (view.fieldAccess(row, 'FormName').read !== 'visible') return fallback
  view.captureReadRow(row, ['FormName'])()
  return formText(row['FormName']) || fallback
}

function assertUniqueFormKeys(tabs: readonly FlowRunFormRecord[]): void {
  if (new Set(tabs.map(tab => tab.formKey)).size !== tabs.length) throw Error('正式流程表单身份重复')
}

function readInstanceForms(view: DataView, objectId: string): FlowRunFormRecord[] {
  assertCompleteForms(view)
  const tabs = view.rows.map((row, index) => {
    view.captureReadRow(row, ['WFOBJID', 'FORMID', 'FormPath', 'FormParams'])()
    if (row['WFOBJID'] !== objectId) throw Error('业务表单与当前流程实例不符')
    const key = formText(row['FORMID'])
    const sourcePath = formText(row['FormPath'])
    const params = row['FormParams']
    if (!key || !sourcePath || (params !== null && typeof params !== 'string')) throw Error('正式业务表单身份、路径或参数无效')
    return {tabKey: key, formKey: key, sourcePath, queryString: formText(params), label: formLabel(view, row, `业务页 ${index + 1}`)}
  })
  assertUniqueFormKeys(tabs)
  return tabs
}

function readDesignForms(view: DataView, instance: {objectId: string; modelId: string}, preferMobile: boolean): FlowRunFormRecord[] {
  assertCompleteForms(view)
  const tabs: FlowRunFormRecord[] = []
  const [preferredPath, alternatePath] = preferMobile ? ['mobileUrl', 'URL'] as const : ['URL', 'mobileUrl'] as const
  for (const [index, row] of view.rows.entries()) {
    view.captureReadRow(row, ['FlowID', preferredPath])()
    if (row['FlowID'] !== instance.modelId) throw Error('设计表单与当前流程模型不符')
    let sourcePath = formText(row[preferredPath])
    if (!sourcePath) {
      view.captureReadRow(row, [alternatePath])()
      sourcePath = formText(row[alternatePath])
    }
    if (!sourcePath) continue
    view.captureReadRow(row, ['FORMID'])()
    const key = formText(row['FORMID'])
    if (!key) throw Error('正式设计表单身份无效')
    const queryString = `flowobjid=${encodeURIComponent(instance.objectId)}&formkey=${encodeURIComponent(key)}`
    tabs.push({tabKey: key, formKey: key, sourcePath, queryString, label: formLabel(view, row, `表单 ${index + 1}`)})
  }
  assertUniqueFormKeys(tabs)
  return tabs
}

export type PrepareFlowRunPageCommand = Readonly<{
  runtime: PageRuntime
  wfid: string
  flowid: string
  stepId?: string
  /** 移动入口对已证为空的实例表单，优先读取设计表单的移动地址。 */
  preferMobileForm?: boolean
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
  formView.queryContext = {...formView.queryContext, FlowID: flowid, WFMID: flowid, FLOWID: flowid}
  const objectFormView = requireView(workbench.getView(OBJ_FORM_MODEL, 'default'), OBJ_FORM_MODEL)
  objectFormView.queryContext = {...objectFormView.queryContext, WFOBJID: wfid, wfid}
  const stepView = requireView(workbench.getView(STEP_MODEL, 'default'), STEP_MODEL)
  stepView.queryContext = {...stepView.queryContext, WFOBJID: wfid}
  const commandInstanceView = requireView(workbench.getView(FLOW_OBJ_MODEL, 'default'), FLOW_OBJ_MODEL)
  commandInstanceView.queryContext = {...commandInstanceView.queryContext, rowid: wfid, wfid}
  commandInstanceView.page = 1
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
  const instanceForms = readInstanceForms(objectFormView, wfid)
  const formTabs = instanceForms.length ? instanceForms : readDesignForms(formView, {objectId: wfid, modelId: flowid}, command.preferMobileForm === true)
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

/** 从当前原步骤行证明加签关系与可读描述，再生成仅供本次窗口消费的上下文。 */
export function buildAppendUserContext(
  view: DataView, step: DataView['rows'][number],
): FlowAppendUserContext {
  const target = {
    rowid: formText(step['rowid']), WFOBJID: formText(step['WFOBJID']),
    SendNodeModelId: formText(step['SendNodeModelId']), ReceiveNodeModelId: formText(step['ReceiveNodeModelId']),
    LastStepID: formText(step['LastStepID']),
  }
  if (!view.rows.includes(step)) throw Error('追加参与人缺少原步骤查询行')
  captureFlowAppendStep(view, target)()
  let title = ''
  if (view.fieldAccess(step, 'description').read === 'visible') {
    view.captureReadRow(step, ['description'])()
    title = formText(step['description'])
  }
  return {...target, TITLE: title || '当前步骤'}
}
