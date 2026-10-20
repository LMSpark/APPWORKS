/**
 * @module lowcode/data-space/input-parameters/lowcode-data-space-input-parameter-session
 * 职责：输入参数声明的暂存、提交与回读编排（无独立命令类 FSM）。
 * 边界：草稿归 DataView；流程状态由会话持有的 flow 记录。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'

export type ParameterEditStatus = 'idle' | 'pending' | 'unsubmitted' | 'unknown' | 'readback'
type ParameterRecovery = 'none' | 'unsubmitted' | 'unknown' | 'readback'

export type InputParameterEditFlow = {
  recovery: ParameterRecovery
  inFlight: boolean
  queryContext: string
}

export type InputParameterEditHost = {
  readonly view: DataView
  readonly targetId: string
  readonly dataSet: DataSet
  readonly assertCurrent: () => void
  flow: InputParameterEditFlow
}

export function createInputParameterEditHost(view: DataView, targetId: string, assertCurrent: () => void): InputParameterEditHost {
  if (!view.dataSet) throw new Error('DATA_SPACE_INPUT_PARAMETERS_CONTEXT: 缺少正式数据空间')
  return {view, targetId, dataSet: view.dataSet, assertCurrent,
    flow: {recovery: 'none', inFlight: false, queryContext: JSON.stringify(view.queryContext)}}
}

function flowStatus(host: InputParameterEditHost): ParameterEditStatus {
  const {flow, view} = host
  if (flow.inFlight) return 'pending'
  if (flow.recovery === 'readback') return 'readback'
  if (flow.recovery === 'unsubmitted') return 'unsubmitted'
  if (flow.recovery === 'unknown' || view.hasUnconfirmedSave) return 'unknown'
  return 'idle'
}

export function inputParameterGetState(host: InputParameterEditHost): {status: ParameterEditStatus; pending: boolean} {
  const {view, targetId} = host
  return {status: flowStatus(host), pending: view.dirtyTracking.hasPendingChanges(targetId) || view.hasEditingChanges(targetId)}
}

function assertOwner(host: InputParameterEditHost): void {
  const {view, targetId, dataSet, flow, assertCurrent} = host
  assertCurrent()
  if (dataSet.destroyed || view.dataSet !== dataSet
    || dataSet.getView(view.tableName, view.viewId) !== view
    || view.dataTable?.modelBinding?.modelName !== 'Base_DataSet'
    || JSON.stringify(view.queryContext) !== flow.queryContext
    || (Object.hasOwn(view.queryContext, 'dataSpaceId') && view.queryContext['dataSpaceId'] !== targetId)) {
    throw new Error('DATA_SPACE_INPUT_PARAMETERS_CONTEXT: 参数声明查询 owner 或目标已变化')
  }
}

function row(host: InputParameterEditHost, writable: boolean, view = host.view) {
  assertOwner(host)
  const {targetId} = host
  const record = view.rows[0]
  if (!record || view.rows.length !== 1 || view.total !== 1
    || view.getPkKey(record) !== targetId || record['rowid'] !== targetId
    || view.requestState !== RequestState.Loaded || view.mutating
    || view.fieldAccess(record, 'rowid').read !== 'visible'
    || view.fieldAccess(record, 'inputParams').read !== 'visible'
    || (writable && (view.fieldAccess(record, 'inputParams').write !== 'allowed'
      || view.editActionState(record) !== 'enabled'))) {
    throw new Error('DATA_SPACE_INPUT_PARAMETERS_CONTEXT: 参数声明目标或当次读写权限无效')
  }
  return record
}

function assertEditable(host: InputParameterEditHost, expectedValue: unknown): void {
  const {view, targetId} = host
  if (flowStatus(host) !== 'idle' || view.dirtyTracking.hasPendingChanges(targetId)) {
    throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 请先核验待提交或结果未知的声明')
  }
  const current = row(host, true)
  if (JSON.stringify(current['inputParams']) !== JSON.stringify(expectedValue)) {
    throw new Error('DATA_SPACE_INPUT_PARAMETERS_STALE: 参数声明原文已变化')
  }
  if (Object.keys(view.getEditingPatch(targetId) ?? {}).some(key => key !== 'inputParams')) {
    throw new Error('DATA_SPACE_INPUT_PARAMETERS_FIELDS: 声明提交不能包含其他字段修改')
  }
}

function captureFailure(host: InputParameterEditHost, confirmed: boolean, dispatched: boolean): void {
  const {flow, view} = host
  flow.inFlight = false
  if (confirmed) flow.recovery = 'readback'
  else if (dispatched) flow.recovery = view.hasUnconfirmedSave ? 'none' : 'unknown'
  else flow.recovery = 'unsubmitted'
}

export function inputParameterStage(host: InputParameterEditHost, input: Readonly<{expectedValue: unknown; value: unknown}>): void {
  assertEditable(host, input.expectedValue)
  const {view, targetId} = host
  const result = DataSpaceDesignApi.prepareInputParameters({value: input.value, original: input.expectedValue})
  view.updateEditingValue(targetId, 'inputParams', result.changed ? JSON.stringify(result.items) : input.expectedValue)
}

export async function inputParameterSave(host: InputParameterEditHost,
  input: Readonly<{expectedValue: unknown; onReceipt?: () => void}>): Promise<Array<Record<string, unknown>>> {
  const {view, targetId, dataSet, flow, assertCurrent} = host
  assertEditable(host, input.expectedValue)
  const result = DataSpaceDesignApi.prepareInputParameters({value: view.getEditingRow(targetId)?.['inputParams'], original: input.expectedValue})
  inputParameterStage(host, {expectedValue: input.expectedValue, value: result.items})
  if (!result.changed) return result.items
  const submitted = JSON.stringify(result.items)
  flow.inFlight = true
  let confirmed = false
  let dispatched = false
  try {
    const applied = await view.applyEditingRows([targetId])
    if (!applied.success || applied.data?.failedCount !== 0 || applied.data.appliedCount !== 1) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_APPLY: 输入参数编辑尚未应用')
    }
    const current = row(host, true)
    if (current['inputParams'] !== submitted || view.hasEditingChanges(targetId)) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_STALE: 提交前声明已变化')
    }
    dispatched = true
    assertCurrent()
    const saved = await dataSet.saveChanges({applyEditingRows: false,
      views: [{tableName: view.tableName, viewId: view.viewId, ids: [targetId]}]})
    if (!saved.success || saved.data?.savedCount !== 1 || saved.data.failedCount !== 0 || saved.data.failedEditingRows !== 0) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_RECEIPT: 输入参数保存回执未确认唯一目标行成功')
    }
    confirmed = true
    assertOwner(host)
    input.onReceipt?.()
    const verification = view.createQueryView(`parameterCheck_${crypto.randomUUID().replaceAll('-', '')}`)
    try {
      const items = await readback(host, verification)
      if (JSON.stringify(items) !== submitted) throw new Error('DATA_SPACE_INPUT_PARAMETERS_READBACK: 输入参数保存后回读值与提交值不一致')
      flow.recovery = 'none'
      flow.inFlight = false
      return items
    } finally {verification.dataTable?.destroyView(verification.viewId)}
  } catch (error) {
    captureFailure(host, confirmed, dispatched)
    throw error
  }
}

async function readback(host: InputParameterEditHost, view = host.view): Promise<Array<Record<string, unknown>>> {
  assertOwner(host)
  if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 请先明确处理本地修改')
  const {targetId} = host
  const result = await view.loadFromServer({
    filter: {field: 'rowid', operator: 'eq', value: targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})
  assertOwner(host)
  if (!result.success || view.loadingError) throw new Error('DATA_SPACE_INPUT_PARAMETERS_READBACK: 输入参数重新读取失败')
  return DataSpaceDesignApi.readInputParameters({value: row(host, false, view)['inputParams']})
}

export async function inputParameterReload(host: InputParameterEditHost,
  input: Readonly<{discardPending: boolean}>, refresh?: () => Promise<void>): Promise<Array<Record<string, unknown>>> {
  const {view, targetId, dataSet, flow} = host
  assertOwner(host)
  if (flow.inFlight || view.mutating || view.requestState === RequestState.Loading) {
    throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 请求仍在进行')
  }
  if (inputParameterGetState(host).pending && !input.discardPending) throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 本地修改尚未明确放弃')
  dataSet.abandonUnconfirmedSaves()
  if (input.discardPending) view.discardPendingChanges([targetId])
  flow.inFlight = true
  try {
    let items: Array<Record<string, unknown>>
    if (refresh) {
      const before = view.rows
      await refresh()
      assertOwner(host)
      if (view.rows === before || inputParameterGetState(host).pending) throw new Error('DATA_SPACE_INPUT_PARAMETERS_READBACK: 页面未完成新的声明查询')
      items = DataSpaceDesignApi.readInputParameters({value: row(host, false)['inputParams']})
    } else items = await readback(host)
    flow.recovery = 'none'
    flow.inFlight = false
    return items
  } catch (error) {
    flow.inFlight = false
    flow.recovery = 'readback'
    throw error
  }
}
