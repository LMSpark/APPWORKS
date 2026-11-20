/**
 * @module lowcode/data-space/input-parameters/lowcode-data-space-input-parameter-session
 * 职责：输入参数声明的暂存、提交与回读编排（无独立命令类 FSM）。
 * 边界：草稿归 DataView；流程状态由会话持有的 flow 记录。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'

export type ParameterEditStatus = 'idle' | 'pending' | 'unsubmitted' | 'unknown' | 'readback'
/** baseline 是最近一次由正式读取或回读确认的 inputParams 原文；省略 expectedValue 的命令以它为乐观并发基线。 */
export type InputParameterEditFlow = {
  verificationRequired: boolean
  inFlight: boolean
  queryContext: string
  baseline: unknown
}

export type InputParameterCommand = Readonly<{expectedValue?: unknown}>

export type InputParameterEditHost = {
  readonly view: DataView
  readonly targetId: string
  readonly dataSet: DataSet
  readonly assertCurrent: () => void
  flow: InputParameterEditFlow
}

export type InputParameterEditHostConstruction = Readonly<{
  view: DataView
  targetId: string
  assertCurrent: () => void
  baseline: unknown
}>

export function createInputParameterEditHost(input: InputParameterEditHostConstruction): InputParameterEditHost {
  const {view, targetId, assertCurrent, baseline} = input
  if (!view.dataSet) throw new Error('DATA_SPACE_INPUT_PARAMETERS_CONTEXT: 缺少正式数据空间')
  return {view, targetId, dataSet: view.dataSet, assertCurrent,
    flow: {verificationRequired: false, inFlight: false, queryContext: JSON.stringify(view.queryContext), baseline}}
}

function expectedOf(host: InputParameterEditHost, input: InputParameterCommand): unknown {
  return 'expectedValue' in input ? input.expectedValue : host.flow.baseline
}

function flowStatus(host: InputParameterEditHost): ParameterEditStatus {
  const {flow, view} = host
  if (flow.inFlight || view.mutating || view.requestState === RequestState.Loading) return 'pending'
  if (hasUnconfirmedSave(view)) return 'unknown'
  if (flow.verificationRequired) return 'readback'
  if (view.dirtyTracking.hasPendingChanges(host.targetId)) return 'unsubmitted'
  return 'idle'
}

// A method call keeps the native getter live across awaits; TS otherwise retains stale narrowing.
function hasUnconfirmedSave(view: DataView): boolean {return view.hasUnconfirmedSave}

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
  const {flow, view, targetId} = host
  flow.inFlight = false
  flow.verificationRequired = confirmed || (dispatched && !hasUnconfirmedSave(view)
    && !view.dirtyTracking.hasPendingChanges(targetId))
  // Unknown and not-applied states remain owned by DataView's native capture/dirty state.
}

function editSnapshot(view: DataView, targetId: string): string {
  return JSON.stringify({patch: view.getEditingPatch(targetId) ?? null, row: view.getEditingRow(targetId) ?? null,
    pending: view.dirtyTracking.hasPendingChanges(targetId)})
}

export function inputParameterStage(host: InputParameterEditHost, input: Readonly<{expectedValue: unknown; value: unknown}>): void {
  assertEditable(host, input.expectedValue)
  const {view, targetId} = host
  const result = DataSpaceDesignApi.prepareInputParameters({value: input.value, original: input.expectedValue})
  view.updateEditingValue(targetId, 'inputParams', result.changed ? JSON.stringify(result.items) : input.expectedValue)
}

export async function inputParameterSave(host: InputParameterEditHost,
  input: InputParameterCommand & Readonly<{onReceipt?: () => void}>): Promise<Array<Record<string, unknown>>> {
  const {view, targetId, dataSet, flow, assertCurrent} = host
  const expectedValue = expectedOf(host, input)
  assertEditable(host, expectedValue)
  const result = DataSpaceDesignApi.prepareInputParameters({value: view.getEditingRow(targetId)?.['inputParams'], original: expectedValue})
  inputParameterStage(host, {expectedValue, value: result.items})
  if (!result.changed) return result.items
  const submitted = JSON.stringify(result.items)
  flow.inFlight = true
  let confirmed = false
  let dispatched = false
  flow.verificationRequired = true
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
    if (!inputParameterReceipt(saved, view, [1])) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_RECEIPT: 输入参数保存回执未确认唯一目标行成功')
    }
    confirmed = true
    assertOwner(host)
    input.onReceipt?.()
    const verification = view.createQueryView(`parameterCheck_${crypto.randomUUID().replaceAll('-', '')}`)
    try {
      const items = await readback(host, verification)
      if (JSON.stringify(items) !== submitted) throw new Error('DATA_SPACE_INPUT_PARAMETERS_READBACK: 输入参数保存后回读值与提交值不一致')
      flow.baseline = submitted
      flow.verificationRequired = false
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

type SaveChangesResult = Awaited<ReturnType<DataSet['saveChanges']>>
type SaveViewReceipt = NonNullable<NonNullable<SaveChangesResult['data']>['viewResults']>[number]

function inputParameterReceipt(saved: SaveChangesResult, view: DataView, savedCounts: readonly number[]): SaveViewReceipt | undefined {
  const data = saved.data
  if (!saved.success || !data) return undefined
  const results = data.viewResults
  if (data.viewCount !== 1 || data.failedCount !== 0 || data.failedEditingRows !== 0 || data.createdCount !== 0
    || data.deletedCount !== 0 || results.length !== 1) return undefined
  const receipt = results.at(0)
  if (!receipt) return undefined
  return receipt.tableName === view.tableName && receipt.viewId === view.viewId && data.savedCount === receipt.savedCount
    && receipt.appliedEditingRows === 0 && receipt.failedEditingRows === 0 && receipt.createdCount === 0
    && receipt.deletedCount === 0 && receipt.failedCount === 0 && receipt.failedIds.length === 0
    && savedCounts.includes(receipt.savedCount) ? receipt : undefined
}

async function verifyCapturedSave(host: InputParameterEditHost, discardPending: boolean): Promise<
  {kind: 'not-applied'} | {kind: 'receipt'; receipt: SaveViewReceipt | undefined; beforeVerification: string}
> {
  const {view, targetId, dataSet} = host
  const beforeVerification = editSnapshot(view, targetId)
  let saved: SaveChangesResult
  try {
    saved = await dataSet.saveChanges({applyEditingRows: false,
      views: [{tableName: view.tableName, viewId: view.viewId, ids: [targetId]}]})
  } catch (error) {
    assertOwner(host)
    const definitelyNotApplied = error instanceof Error && error.message.startsWith('SPARK_SAVE_NOT_APPLIED:')
      && !hasUnconfirmedSave(view)
    if (!definitelyNotApplied || !discardPending) throw error
    if (editSnapshot(view, targetId) !== beforeVerification) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_STALE: 参数核验期间本地草稿已变化，保留新修改')
    }
    view.discardPendingChanges([targetId])
    return {kind: 'not-applied'}
  }
  if (hasUnconfirmedSave(view)) throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 原提交仍未核验')
  return {kind: 'receipt', receipt: inputParameterReceipt(saved, view, [0, 1]), beforeVerification}
}

export async function inputParameterReload(host: InputParameterEditHost,
  input: Readonly<{discardPending: boolean}>): Promise<Array<Record<string, unknown>>> {
  const {view, targetId, flow} = host
  assertOwner(host)
  if (flow.inFlight || view.mutating || view.requestState === RequestState.Loading) {
    throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 请求仍在进行')
  }
  flow.inFlight = true
  let readbackStarted = false
  try {
    if (hasUnconfirmedSave(view)) {
      const recovery = await verifyCapturedSave(host, input.discardPending)
      if (recovery.kind === 'receipt') {
        assertOwner(host)
        const receipt = recovery.receipt
        if (!receipt) {
          flow.verificationRequired = !hasUnconfirmedSave(view) && !view.dirtyTracking.hasPendingChanges(targetId)
          throw new Error('DATA_SPACE_INPUT_PARAMETERS_RECEIPT: 原参数提交回执无法核验')
        }
        if (receipt.savedCount === 0 && input.discardPending) {
          // Snapshot is captured before the native verification await; reject late edits before discard.
          if (editSnapshot(view, targetId) !== recovery.beforeVerification) {
            throw new Error('DATA_SPACE_INPUT_PARAMETERS_STALE: 参数核验期间本地草稿已变化，保留新修改')
          }
          view.discardPendingChanges([targetId])
        }
        if (receipt.savedCount === 0 && !input.discardPending) {
          throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 原提交未生效，须明确放弃本地草稿')
        }
        flow.verificationRequired = receipt.savedCount === 1
      }
    } else if (inputParameterGetState(host).pending) {
      if (!input.discardPending) throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 本地修改尚未明确放弃')
      view.discardPendingChanges([targetId])
    }
    readbackStarted = true
    flow.verificationRequired = true
    const items = await readback(host)
    flow.baseline = row(host, false)['inputParams']
    flow.verificationRequired = false
    flow.inFlight = false
    return items
  } catch (error) {
    flow.inFlight = false
    if (readbackStarted) flow.verificationRequired = true
    throw error
  }
}
