/**
 * @module lowcode/data-space/model-source/source-input/lowcode-data-space-source-input-session
 * 职责：正式来源入参 ValueFun 编辑与原生批次提交（无独立命令类 FSM）。
 */
import {DataViewFilter, RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {DataSpaceDefinitionSave, type DataSpaceDefinitionSavePart} from '../save/data-space-definition-save'

export type SourceInputStatus = 'idle' | 'pending' | 'unsubmitted' | 'unknown' | 'readback'

export type SourceInputLifecycle = Readonly<{
  assertCurrent(): void
  onDispatch(): void
  assertEditable?(): void
  refreshDirectory?(): Promise<void>
}>

export type SourceInputHost = {
  readonly fieldId: string
  readonly view: DataView
  readonly queryContext: string
  readonly modelId: string
  readonly name: string
  baseline: unknown
  readonly dataSet: DataSet
  readonly targetId: string
  readonly viewId: 'default' | 'sourceInputFields'
  flow: {status: SourceInputStatus}
  lifecycle: SourceInputLifecycle
}

const hostByHandle = new WeakMap<SourceInputHandle, SourceInputHost>()

export function createSourceInputHost(dataSet: DataSet, targetId: string, fieldId: string, lifecycle: SourceInputLifecycle,
  viewId: 'default' | 'sourceInputFields' = 'default'): SourceInputHost {
  const view = dataSet.getView('Base_DataModel_Field', viewId)
  if (!view) throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 缺少正式字段视图')
  const queryContext = JSON.stringify(view.queryContext)
  const row = view.rows.find(item => view.getPkKey(item) === fieldId)
  if (!row || ['rowid', 'dataSetId', 'dataModelId', 'Name', 'type'].some(field => view.fieldAccess(row, field).read !== 'visible')
    || typeof row['dataModelId'] !== 'string' || typeof row['Name'] !== 'string' || !row['Name'].trim()) {
    throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 来源入参身份必须唯一且可读')
  }
  const host: SourceInputHost = {fieldId, view, queryContext, modelId: row['dataModelId'], name: row['Name'],
    baseline: row['ValueFun'], dataSet, targetId, viewId, flow: {status: 'idle'}, lifecycle}
  sourceInputRow(host, false)
  return host
}

function flowStatus(host: SourceInputHost): SourceInputStatus {
  if (host.flow.status === 'pending') return 'pending'
  if (host.flow.status === 'readback') return 'readback'
  if (host.flow.status === 'unknown' || host.view.hasUnconfirmedSave && host.flow.status !== 'idle') return 'unknown'
  return host.flow.status
}

function assertOwner(host: SourceInputHost): void {
  host.lifecycle.assertCurrent()
  if (host.dataSet.destroyed || host.dataSet.getView('Base_DataModel_Field', host.viewId) !== host.view
    || host.view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field'
    || JSON.stringify(host.view.queryContext) !== host.queryContext || host.view.queryContext['dataSpaceId'] !== host.targetId
    || host.viewId === 'sourceInputFields' && host.view.queryContext['modelId'] !== host.modelId) {
    throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 来源查询 owner 或目标已变化')
  }
}

function sourceInputRow(host: SourceInputHost, writable: boolean) {
  assertOwner(host)
  const view = host.view
  const rows = view.rows.filter(item => view.getPkKey(item) === host.fieldId)
  const row = rows[0]
  if (!row || rows.length !== 1 || view.requestState !== RequestState.Loaded || view.mutating
    || ['rowid', 'dataSetId', 'dataModelId', 'Name', 'type', 'ValueFun'].some(field => view.fieldAccess(row, field).read !== 'visible')
    || row['rowid'] !== host.fieldId || row['dataSetId'] !== host.targetId || row['dataModelId'] !== host.modelId
    || row['Name'] !== host.name || row['type'] !== 'inputParams') throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 来源入参身份、归属或读取状态无效')
  const modelView = host.dataSet.getView('Base_DataModel', 'default')
  const models = modelView?.rows.filter(item => modelView.getPkKey(item) === host.modelId) ?? []
  const model = models[0]
  if (!model || !modelView || models.length !== 1
    || modelView.requestState !== RequestState.Loaded || modelView.mutating || modelView.queryContext['dataSpaceId'] !== host.targetId
    || modelView.dataTable?.modelBinding?.modelName !== 'Base_DataModel'
    || ['rowid', 'dataSetId', 'Type'].some(field => modelView.fieldAccess(model, field).read !== 'visible')
    || model['rowid'] !== host.modelId || model['dataSetId'] !== host.targetId || !['接口', '视图'].includes(String(model['Type']))) {
    throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 所属模型不是可确认的接口或逻辑视图')
  }
  if (writable && (view.fieldAccess(row, 'ValueFun').write !== 'allowed' || view.editActionState(row) !== 'enabled')) {
    throw new Error('DATA_SPACE_SOURCE_INPUT_PERMISSION: 当前来源入参不可写')
  }
  return row
}

export function sourceInputReadParameters(dataSet: DataSet, targetId: string) {
  const view = dataSet.getView('Base_DataSet', 'default')
  const row = view?.rows[0]
  if (!view || !row || view.rows.length !== 1 || view.total !== 1 || view.getPkKey(row) !== targetId
    || view.queryContext['dataSpaceId'] !== targetId || view.dataTable?.modelBinding?.modelName !== 'Base_DataSet'
    || view.fieldAccess(row, 'rowid').read !== 'visible' || row['rowid'] !== targetId
    || view.requestState !== RequestState.Loaded || view.mutating || view.fieldAccess(row, 'inputParams').read !== 'visible') {
    throw new Error('空间参数声明当前不可读，不能确认参数引用')
  }
  if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw new Error('请先保存或放弃空间参数声明修改，再选择参数引用')
  return DataSpaceDesignApi.readInputParameters({value: row['inputParams'], editable: true}).flatMap(item => {
    const name = item['Name'] ?? item['name']; const description = item['Description'] ?? item['description']
    return typeof name === 'string' && name.trim() ? [{value: name, label: typeof description === 'string' && description ? description : name}] : []
  })
}

export function sourceInputGetState(host: SourceInputHost) {
  return {status: flowStatus(host), pending: host.view.hasEditingChanges(host.fieldId) || host.view.dirtyTracking.hasPendingChanges(host.fieldId)}
}

export function sourceInputRead(host: SourceInputHost) {
  const row = sourceInputRow(host, false)
  const value = host.view.getEditingRow(host.fieldId)?.['ValueFun']
  if (value !== undefined && value !== null && typeof value !== 'string') throw new Error('ValueFun不是文本；原始记录保留')
  let inputParams: Array<{value: string; label: string}> = []
  let parameterWarning = ''
  try {inputParams = sourceInputReadParameters(host.dataSet, host.targetId)} catch (cause) {parameterWarning = cause instanceof Error ? cause.message : String(cause)}
  return {name: host.name, value, inputParams, parameterWarning,
    writable: host.view.fieldAccess(row, 'ValueFun').write === 'allowed' && host.view.editActionState(row) === 'enabled'}
}

export function sourceInputValidateValue(dataSet: DataSet, targetId: string, name: string, value: unknown): void {
  if (typeof value !== 'string') throw new Error('ValueFun必须是值函数字符串')
  if (value === '') return
  const expression = DataSpaceDesignApi.parseValueFunction(value)
  if (expression?.Type === 'GetInputParam') {
    if (sourceInputReadParameters(dataSet, targetId).filter(item => item.value === expression['ParamName']).length !== 1) throw new Error('空间参数引用未声明或名称不唯一')
  } else if (expression?.Type !== 'GetConstValue' || expression['Value'] === undefined
    || !DataViewFilter.parse({field: name, operator: 'eq', value: expression}).ok) {
    throw new Error('来源入参仅支持显式空间参数引用或JSON常量；旧原文不会自动转换')
  }
}

function validateHost(host: SourceInputHost, value: unknown): void {sourceInputValidateValue(host.dataSet, host.targetId, host.name, value)}

function assertEditable(host: SourceInputHost, status: 'idle' | 'pending' = 'idle', writable = true): void {
  host.lifecycle.assertEditable?.()
  if (flowStatus(host) !== status || host.view.dirtyTracking.hasPendingChanges()) throw new Error('请先核验待提交或结果未知的来源入参')
  if (sourceInputRow(host, writable)['ValueFun'] !== host.baseline) throw new Error('来源入参原文已变化，请重新核验')
  if (Object.keys(host.view.getEditingPatch(host.fieldId) ?? {}).some(field => field !== 'ValueFun')) throw new Error('来源入参只允许修改ValueFun')
}

export function sourceInputStage(host: SourceInputHost, value: string): void {
  assertEditable(host); validateHost(host, value)
  host.view.updateEditingValue(host.fieldId, 'ValueFun', value)
}

export function sourceInputDiscard(host: SourceInputHost): void {
  assertOwner(host)
  if (flowStatus(host) !== 'idle') throw new Error('请通过重新核验处理已派发的修改')
  host.view.discardEditingRows([host.fieldId])
}

async function sourceInputSaveHandle(handle: SourceInputHandle): Promise<void> {
  const part = sourceInputPrepareSave([handle])
  if (part) await DataSpaceDefinitionSave.run([part])
}

export function sourceInputBelongsTo(host: SourceInputHost, modelId: string, viewId: 'default' | 'sourceInputFields'): boolean {
  return host.modelId === modelId && host.viewId === viewId
}

export function sourceInputAssertWorkspaceChanges(host: SourceInputHost): void {
  if (!['idle', 'pending'].includes(flowStatus(host))) throw new Error('请先核验结果未确认的来源入参')
  host.lifecycle.assertEditable?.()
  const row = sourceInputRow(host, false), value = host.view.getEditingRow(host.fieldId)?.['ValueFun']
  if (host.view.dirtyTracking.isPendingCreate(host.fieldId) || host.view.dirtyTracking.isPendingDelete(host.fieldId)
    || Object.keys(host.view.getEditingPatch(host.fieldId) ?? {}).some(key => key !== 'ValueFun')
    || Object.keys(host.view.dirtyTracking.getDiff(host.fieldId, row)).some(key => key !== 'ValueFun')) throw new Error('来源入参只允许修改ValueFun')
  if (sourceInputGetState(host).pending || value !== host.baseline) {sourceInputRow(host, true); validateHost(host, value)}
}

function batchHosts(owners: readonly SourceInputHost[]): SourceInputHost {
  const first = owners[0]
  if (!first || new Set(owners.map(owner => owner.fieldId)).size !== owners.length || owners.some(owner =>
    owner.dataSet !== first.dataSet || owner.targetId !== first.targetId || owner.modelId !== first.modelId || owner.view !== first.view)) {
    throw new Error('来源入参批次必须属于同一实例、空间、模型和视图，且身份唯一')
  }
  owners.forEach(assertOwner)
  return first
}

export function sourceInputPrepareSave(owners: readonly SourceInputHandle[]): DataSpaceDefinitionSavePart | undefined {
  const hosts = owners.map(o => hostByHandle.get(o)).filter((h): h is SourceInputHost => !!h)
  if (!hosts.length) return
  return sourceInputPrepareSaveHosts(hosts)
}

function sourceInputPrepareSaveHosts(owners: readonly SourceInputHost[]): DataSpaceDefinitionSavePart | undefined {
  if (!owners.length) return
  const first = batchHosts(owners), view = first.view
  owners.forEach(owner => assertEditable(owner, 'idle', view.hasEditingChanges(owner.fieldId)))
  const changes = owners.filter(owner => view.hasEditingChanges(owner.fieldId)).map(owner => {
    const value = view.getEditingRow(owner.fieldId)?.['ValueFun']; validateHost(owner, value)
    return {owner, value}
  })
  if (!changes.length) return
  const changedIds = changes.map(({owner}) => owner.fieldId)
  const assertDraft = (status: 'idle' | 'pending') => {
    owners.forEach(owner => assertEditable(owner, status, view.hasEditingChanges(owner.fieldId)))
    for (const {owner, value} of changes) {
      if (view.getEditingRow(owner.fieldId)?.['ValueFun'] !== value) throw new Error('来源入参草稿已变化')
      validateHost(owner, value)
    }
  }
  return {
    dataSet: first.dataSet, targetId: first.targetId, modelId: first.modelId,
    prepare: () => {assertDraft('idle'); owners.forEach(owner => {owner.flow.status = 'pending'}); return Promise.resolve()},
    apply: async () => {
      assertDraft('pending')
      const applied = await view.applyEditingRows(changedIds)
      if (!applied.success || applied.data?.appliedCount !== changes.length || applied.data.failedCount !== 0) throw new Error('来源入参编辑尚未完整应用')
    },
    check: () => {
      if (changedIds.some(id => view.hasEditingChanges(id))) throw new Error('提交前来源配置草稿已变化')
      for (const {owner, value} of changes) {
        owner.lifecycle.assertEditable?.()
        if (sourceInputRow(owner, true)['ValueFun'] !== value) throw new Error('提交前来源入参已变化')
        validateHost(owner, value)
      }
    },
    targets: () => [{tableName: view.tableName, viewId: view.viewId, ids: changedIds}],
    dispatched: () => first.lifecycle.onDispatch(),
    confirm: async () => {
      await first.lifecycle.refreshDirectory?.()
      for (const {owner, value} of changes) if (sourceInputRow(owner, false)['ValueFun'] !== value) throw new Error('来源入参确认结果与提交值不一致')
      owners.forEach(owner => {owner.baseline = sourceInputRow(owner, false)['ValueFun']; owner.flow.status = 'idle'})
    },
    failed: stage => {owners.forEach(owner => {
      owner.flow.status = stage === 'confirmed' ? 'readback'
        : stage === 'dispatched' ? (owner.view.hasUnconfirmedSave ? 'unsubmitted' : 'unknown')
        : stage === 'applying' ? 'unsubmitted' : 'idle'
    })},
  }
}

async function readbackHost(host: SourceInputHost): Promise<void> {
  host.dataSet.abandonUnconfirmedSaves()
  assertOwner(host)
  if (host.view.hasEditingChanges() || host.view.dirtyTracking.hasPendingChanges()) throw new Error('请先明确处理字段草稿，不能用回读覆盖修改')
  const result = await host.view.loadFromServer({filter: host.view.filterExpression ?? {field: 'dataSetId', operator: 'eq', value: host.targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})
  assertOwner(host)
  if (!result.success || host.view.loadingError || host.view.rows.some(row => host.view.fieldAccess(row, 'dataSetId').read !== 'visible' || row['dataSetId'] !== host.targetId)) {
    throw new Error('来源入参回读失败或包含其他空间记录')
  }
  if (host.viewId === 'sourceInputFields' && host.view.rows.some(row => row['dataModelId'] !== host.modelId || row['type'] !== 'inputParams')) throw new Error('来源入参回读包含其他模型或字段用途')
  await host.lifecycle.refreshDirectory?.()
  host.baseline = sourceInputRow(host, false)['ValueFun']
}

export async function sourceInputReloadBatch(owners: readonly SourceInputHandle[], discardPending: boolean): Promise<void> {
  await sourceInputPrepareReloadBatch(owners, discardPending)()
}

export function sourceInputPrepareReloadBatch(owners: readonly SourceInputHandle[], discardPending: boolean): () => Promise<void> {
  const hosts = owners.map(o => hostByHandle.get(o)).filter((h): h is SourceInputHost => !!h)
  if (!hosts.length) return async () => {}
  const first = batchHosts(hosts), view = first.view, ids = hosts.map(owner => owner.fieldId)
  if (hosts.some(owner => owner.flow.status === 'pending') || view.mutating || view.requestState === RequestState.Loading) throw new Error('来源入参请求仍在进行')
  if (hosts.some(owner => sourceInputGetState(owner).pending) && !discardPending) throw new Error('本地修改尚未明确放弃')
  if (view.rows.some(row => !ids.includes(String(view.getPkKey(row)))
    && (view.hasEditingChanges(view.getPkKey(row)) || view.dirtyTracking.hasPendingChanges(view.getPkKey(row))))) throw new Error('请先处理其他字段草稿，不能用回读覆盖修改')
  if (discardPending) view.discardPendingChanges(ids)
  return async () => {
    if (hosts.some(owner => owner.flow.status === 'pending') || view.mutating || view.requestState === RequestState.Loading) throw new Error('来源入参请求仍在进行')
    hosts.forEach(owner => {owner.flow.status = 'pending'})
    try {
      await readbackHost(first)
      hosts.forEach(owner => {owner.baseline = sourceInputRow(owner, false)['ValueFun']; owner.flow.status = 'idle'})
    } catch (cause) {hosts.forEach(owner => {owner.flow.status = 'readback'}); throw cause}
  }
}

export type SourceInputHandle = {
  getState(): ReturnType<typeof sourceInputGetState>
  read(): ReturnType<typeof sourceInputRead>
  stage(value: string): void
  discard(): void
  save(): Promise<void>
  belongsTo(modelId: string, viewId: 'default' | 'sourceInputFields'): boolean
  assertWorkspaceChanges(): void
  reload(discardPending: boolean): Promise<void>
}

export function createSourceInputHandle(host: SourceInputHost): SourceInputHandle {
  const handle = {} as SourceInputHandle
  Object.assign(handle, {
    getState: () => sourceInputGetState(host),
    read: () => sourceInputRead(host),
    stage: (value: string) => sourceInputStage(host, value),
    discard: () => sourceInputDiscard(host),
    save: () => sourceInputSaveHandle(handle),
    belongsTo: (modelId: string, viewId: 'default' | 'sourceInputFields') => sourceInputBelongsTo(host, modelId, viewId),
    assertWorkspaceChanges: () => sourceInputAssertWorkspaceChanges(host),
    reload: (discardPending: boolean) => sourceInputReloadBatch([handle], discardPending),
  })
  hostByHandle.set(handle, host)
  return handle
}

/** @deprecated 兼容旧类名静态调用；新代码用 sourceInput* 模块函数。 */
export const LowcodeDataSpaceSourceInputEdit = {
  readParameters: sourceInputReadParameters,
  validateValue: sourceInputValidateValue,
  prepareSave: sourceInputPrepareSave,
  reloadBatch: sourceInputReloadBatch,
  prepareReloadBatch: sourceInputPrepareReloadBatch,
}
