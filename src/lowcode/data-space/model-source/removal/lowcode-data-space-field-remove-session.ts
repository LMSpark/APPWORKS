/**
 * @module lowcode/data-space/model-source/removal/lowcode-data-space-field-remove-session
 * 职责：计算字段定义的删除预览、原批次提交及精确回读（无独立命令类 FSM）。
 * 边界：不删除物理字段或自动改写引用；数据权限、暂存及写入归原DataView/DataSet。
 */
import {buildDataViewKey, RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDefinitionSave, verifyDataSpaceDefinitionCapture, type DataSpaceDefinitionCaptureBatch, type DataSpaceDefinitionSavePart} from '../data-space-definition-save'
import {LowcodeDataSpaceModelDependencies} from '../model/lowcode-data-space-model-dependencies'
import {LowcodeDataSpaceFieldRemoveReferences} from './lowcode-data-space-field-remove-references'

export type FieldRemoveStatus = 'idle' | 'previewing' | 'ready' | 'staged' | 'saving' | 'unknown' | 'readback' | 'different'

export type FieldRemoveFlow = {
  status: FieldRemoveStatus
  row: DataRow | null
  baseline: string
  staged: boolean
  confirmed: boolean
  verification: string
  verifiedSnapshot: string
}

export type FieldRemoveLifecycle = Readonly<{
  assertCurrent(): void
  onDispatch(): void
  validate(row: DataRow, views: readonly DataView[]): Promise<() => void>
  fieldWorkspaces?(modelId: string): ReadonlyArray<Readonly<{view: DataView; ids: readonly string[]; allowPending?: boolean}>>
}>

export type FieldRemoveHost = {
  readonly dataSet: DataSet
  readonly targetId: string
  readonly fieldId: string
  readonly fieldViewId: 'default' | 'modelFields'
  readonly lifecycle: FieldRemoveLifecycle
  views: DataView[]
  readonly source: DataView
  readonly sourceContext: string
  dependencies: LowcodeDataSpaceModelDependencies | undefined
  recoveryCapture?: DataSpaceDefinitionCaptureBatch
  flow: FieldRemoveFlow
}

export type FieldRemoveHostInput = Readonly<{
  dataSet: DataSet
  targetId: string
  fieldId: string
  lifecycle: FieldRemoveLifecycle
  fieldViewId?: 'default' | 'modelFields'
}>

export function createFieldRemoveHost(input: FieldRemoveHostInput): FieldRemoveHost {
  const fieldViewId = input.fieldViewId ?? 'default'
  const {dataSet, targetId, fieldId, lifecycle} = input
  const views = ['Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'].map(name => {
    const view = dataSet.getView(name, name === 'Base_DataModel_Field' ? fieldViewId : 'default')
    if (!view) throw new Error(`缺少正式视图：${name}`)
    return view
  })
  const fields = views[1]
  if (!fields) throw new Error('缺少正式字段视图')
  return {dataSet, targetId, fieldId, fieldViewId, lifecycle, views, source: fields,
    sourceContext: JSON.stringify(fields.queryContext), dependencies: undefined,
    flow: {status: 'idle', row: null, baseline: '', staged: false, confirmed: false, verification: '', verifiedSnapshot: ''}}
}

function assertClean(host: FieldRemoveHost, readback = false): void {
  host.lifecycle.assertCurrent()
  host.dependencies?.assertSiblingsClean()
  const {source, sourceContext, views, dataSet, targetId} = host
  if (source.destroyed || sourceContext !== JSON.stringify(source.queryContext)) throw new Error('字段删除的原绑定视图已变化')
  if (source.mutating || source.requestState === RequestState.Loading) throw new Error('字段删除的原绑定视图仍有请求')
  if (!readback && (source.requestState !== RequestState.Loaded || source.total !== source.rows.filter(row => !source.dirtyTracking.isPendingCreate(String(row['rowid']))).length + source.dirtyTracking.pendingDeleteIds.size)) throw new Error('字段删除的原绑定视图未完整读取')
  if (dataSet.destroyed || views.some(view => view.destroyed || dataSet.getView(view.tableName, view.viewId) !== view
    || view.dataTable?.modelBinding?.modelName !== view.tableName || view.queryContext['dataSpaceId'] !== targetId)) throw new Error('字段删除查询或目标已变化')
  for (const view of views) {
    if (view.mutating || view.requestState === RequestState.Loading || !readback && (view.requestState !== RequestState.Loaded
      || view.rows.length !== view.total)) throw new Error('删除所需元数据未完整读取')
    if (view.hasEditingChanges() || view.dirtyTracking.pendingCreateIds.size || view.dirtyTracking.dirtyRowIds.size
      || view.dirtyTracking.pendingDeleteIds.size) throw new Error('请先处理其他元数据草稿')
    const ids = new Set<string>()
    for (const row of view.rows) {
      if (typeof row['rowid'] !== 'string' || !row['rowid'] || view.getPkKey(row) !== row['rowid'] || ids.has(row['rowid'])
        || row['dataSetId'] !== targetId || ['rowid', 'dataSetId'].some(key => view.fieldAccess(row, key).read !== 'visible')) throw new Error('字段删除身份或空间归属不可核验')
      ids.add(row['rowid'])
    }
  }
}

function snapshot(host: FieldRemoveHost): string {
  return JSON.stringify(host.views.map(view => [...view.rows]
    .sort((left, right) => String(left['rowid']).localeCompare(String(right['rowid'])))))
}

function assertPermission(host: FieldRemoveHost): void {
  const {source, fieldId, flow} = host
  if (!flow.row || source.deleteActionState(flow.row) !== 'enabled') throw new Error('当前查询不允许删除字段')
  if (flow.staged && JSON.stringify(source.dirtyTracking.getPendingDeleteSnapshot(fieldId)) !== JSON.stringify(flow.row)) throw new Error('字段删除草稿已变化')
}

function flowStatus(host: FieldRemoveHost): FieldRemoveStatus {
  const {flow, source} = host
  if (flow.status === 'saving' || flow.status === 'previewing') return flow.status
  if (flow.status === 'readback' || flow.status === 'different') return flow.status
  if (flow.status !== 'idle' && source.hasUnconfirmedSave) return 'unknown'
  if (flow.status === 'unknown') return 'unknown'
  return flow.status
}

export function fieldRemoveGetState(host: FieldRemoveHost) {
  const status = flowStatus(host)
  const {flow, source, dataSet, fieldId} = host
  return {status, pending: status !== 'idle', verification: flow.verification,
    dataViewKey: buildDataViewKey(source.tableName, source.viewId, dataSet.scenarioId),
    preview: flow.row ? {id: fieldId, modelId: String(flow.row['dataModelId']), name: String(flow.row['Name']),
      outputName: typeof flow.row['AsName'] === 'string' && flow.row['AsName'].length > 0 ? flow.row['AsName'] : String(flow.row['Name'])} : null}
}

export async function fieldRemovePreview(host: FieldRemoveHost): Promise<void> {
  if (flowStatus(host) !== 'idle') throw new Error('请先处理当前字段删除')
  host.flow.status = 'previewing'
  try {
    if (!host.dependencies) {
      host.lifecycle.assertCurrent()
      const source = host.source, original = source.rows.find(row => row['rowid'] === host.fieldId)
      if (source.requestState !== RequestState.Loaded || !original || source.fieldAccess(original, 'dataModelId').read !== 'visible'
        || typeof original['dataModelId'] !== 'string' || original['dataSetId'] !== host.targetId
        || host.sourceContext !== JSON.stringify(source.queryContext)) throw new Error('计算字段的绑定视图或所属模型不可确认')
      const models = host.dataSet.getView('Base_DataModel')
      if (!models) throw new Error('缺少正式模型视图')
      host.dependencies = new LowcodeDataSpaceModelDependencies({
        dataSet: host.dataSet, targetId: host.targetId, modelId: original['dataModelId'], operation: `fieldRemove:${host.fieldId}:${source.viewId}`,
        assertCurrent: () => host.lifecycle.assertCurrent(),
        ...(source.viewId === 'modelFields' ? {editing: {view: models, id: original['dataModelId']}} : {}),
        fieldEditing: {view: source, get ids() {return source.viewId === 'modelFields' ? [...source.rows.map(row => String(row['rowid'])), ...[...source.dirtyTracking.pendingDeleteIds].map(String)] : [String(original['rowid'])]}, allowPending: true},
        fieldWorkspaces: () => host.lifecycle.fieldWorkspaces?.(String(original['dataModelId'])) ?? [],
      })
      host.views.splice(0, host.views.length, ...host.dependencies.views)
    }
    await host.dependencies.load()
    assertClean(host)
    const row = host.source.rows.find(item => item['rowid'] === host.fieldId)
    if (!row || ['dataModelId', 'type', 'FieldType', 'Name', 'AsName', 'IsPKey', 'IsOutput'].some(key => host.source.fieldAccess(row, key).read !== 'visible')
      || row['type'] !== 'dataModel' || row['FieldType'] !== '计算字段') throw new Error('只能删除身份可读的计算字段定义')
    if (Number(row['IsPKey']) !== 0) throw new Error('不能删除主键或主键标志无法确认的字段')
    const models = host.views[0], model = models?.rows.find(item => item['rowid'] === row['dataModelId'])
    if (!models || !model || ['Name', 'MetaName', 'Type'].some(key => models.fieldAccess(model, key).read !== 'visible')) throw new Error('计算字段所属模型不可确认')
    host.flow.row = {...row}; assertPermission(host); host.flow.baseline = snapshot(host)
    const check = await host.lifecycle.validate(host.flow.row, host.views)
    check(); assertClean(host); assertPermission(host)
    if (snapshot(host) !== host.flow.baseline) throw new Error('预览期间元数据已变化')
    host.flow.status = 'ready'
  } catch (error) {fieldRemoveFinish(host); throw error}
}

function fieldRemoveFinish(host: FieldRemoveHost): void {
  host.flow.status = 'idle'; host.flow.row = null; host.flow.baseline = ''; host.flow.staged = false
  host.flow.confirmed = false; host.flow.verification = ''; host.flow.verifiedSnapshot = ''
}

export function fieldRemoveCancel(host: FieldRemoveHost): void {
  host.lifecycle.assertCurrent()
  if (!['ready', 'staged'].includes(host.flow.status)) throw new Error('只能取消未提交的字段删除')
  if (host.flow.staged) fieldRemoveDiscardOwned(host)
  fieldRemoveFinish(host)
}

export async function fieldRemoveStage(host: FieldRemoveHost): Promise<void> {
  if (host.flow.status !== 'ready' || !host.flow.row) throw new Error('请先预览字段删除')
  assertClean(host); assertPermission(host)
  if (snapshot(host) !== host.flow.baseline) throw new Error('删除预览已过期')
  const original = host.source.rows.find(row => row['rowid'] === host.fieldId)
  if (!original || JSON.stringify(original) !== JSON.stringify(host.flow.row)) throw new Error('原绑定字段已变化')
  try {if (await host.source.removeRow(host.fieldId) !== true) throw new Error('字段删除未暂存')}
  finally {host.flow.staged = host.source.dirtyTracking.pendingDeleteIds.has(host.fieldId); if (host.flow.staged) host.flow.status = 'staged'}
  host.lifecycle.assertCurrent(); assertPermission(host)
  host.source.discardEditingRows([host.fieldId])
  host.flow.status = 'staged'
}

export function fieldRemovePrepareSave(host: FieldRemoveHost): DataSpaceDefinitionSavePart {
  if (!['ready', 'staged'].includes(host.flow.status) || !host.flow.row || !host.dependencies) throw new Error('请先预览；未决字段删除不能重复提交')
  const previous = host.flow.status, dependencies = host.dependencies, row = host.flow.row, modelId = String(row['dataModelId'])
  let check: (() => void) | undefined
  return {
    dataSet: host.dataSet, targetId: host.targetId, modelId,
    prepare: async () => {
      assertClean(host); assertPermission(host)
      if (snapshot(host) !== host.flow.baseline) throw new Error('删除预览已过期，请取消后重新预览')
      await dependencies.load(true); assertClean(host)
      if (snapshot(host) !== host.flow.baseline) throw new Error('字段或引用已变化，请重新预览删除')
      check = await host.lifecycle.validate(row, host.views)
      check(); assertPermission(host)
    },
    apply: async () => {if (!host.flow.staged) await fieldRemoveStage(host)},
    check: () => {check?.(); assertPermission(host); if (snapshot(host) !== host.flow.baseline) throw new Error('提交前字段或依赖已变化')},
    targets: () => [{tableName: host.source.tableName, viewId: host.source.viewId, ids: [host.fieldId]}],
    dispatched: capture => {host.recoveryCapture = capture; host.flow.status = 'saving'; host.lifecycle.onDispatch()},
    confirm: async () => {
      host.flow.confirmed = true; host.flow.staged = false
      if (!await fieldRemoveReadback(host)) throw new Error(host.flow.verification)
      fieldRemoveFinish(host)
    },
    settled: () => {delete host.recoveryCapture},
    failed: stage => {
      if (!host.flow.row) return
      if (stage === 'confirmed') {host.flow.confirmed = true; host.flow.staged = false}
      if (stage === 'dispatched' || stage === 'confirmed') host.flow.status = host.flow.confirmed ? 'readback' : 'unknown'
      else host.flow.status = host.flow.staged ? 'staged' : previous
    },
  }
}

export async function fieldRemoveSave(host: FieldRemoveHost): Promise<boolean> {
  if (host.source.rows.some(row => row['rowid'] !== host.fieldId && (host.source.hasEditingChanges(String(row['rowid'])) || host.source.dirtyTracking.hasPendingChanges(String(row['rowid']))))) throw new Error('请由模型顶部统一保存字段草稿')
  await DataSpaceDefinitionSave.run([fieldRemovePrepareSave(host)])
  return true
}

function fieldRemoveDiscardOwned(host: FieldRemoveHost): void {
  assertClean(host, true)
  if (host.flow.staged) {
    if (host.source.dirtyTracking.pendingDeleteIds.has(host.fieldId)) {
      if (JSON.stringify(host.source.dirtyTracking.getPendingDeleteSnapshot(host.fieldId)) !== JSON.stringify(host.flow.row)) throw new Error('字段删除草稿已被其他操作修改')
    } else if (host.source.dirtyTracking.hasPendingChanges(host.fieldId)) throw new Error('待删字段出现其他修改')
    host.source.discardPendingChanges([host.fieldId]); host.flow.staged = false
  }
}

async function fieldRemoveReadback(host: FieldRemoveHost): Promise<boolean> {
  const dependencies = host.dependencies
  if (!dependencies) throw new Error('字段删除尚未读取依赖')
  assertClean(host, true)
  await dependencies.load(true)
  const loaded = await host.source.loadFromServer({allPages: true, maxRows: 50000})
  if (!loaded.success) throw new Error('字段删除后回读失败')
  assertClean(host)
  if (host.source.loadingError) throw new Error('字段删除后回读失败')
  const present = host.source.rows.some(row => row['rowid'] === host.fieldId)
  host.flow.verification = present ? '字段记录仍存在，不能确认删除成功' : host.flow.confirmed ? '字段删除回执与回读一致' : '未读取到字段；缺少完整删除回执，结果未确认'
  let dependenciesValid = true
  if (!present && host.flow.row) try {LowcodeDataSpaceFieldRemoveReferences.validate(host.views, host.flow.row)} catch (cause) {
    dependenciesValid = false; host.flow.verification = `删除后引用已变化：${cause instanceof Error ? cause.message : String(cause)}`
  }
  if (!present) {
    dependencies.invalidate([{table: host.source.tableName, id: host.fieldId}], [host.source])
  }
  host.flow.verifiedSnapshot = snapshot(host)
  return !present && host.flow.confirmed && dependenciesValid
}

export async function fieldRemoveVerify(host: FieldRemoveHost): Promise<boolean> {
  const recovery = flowStatus(host)
  if (!['unknown', 'readback', 'different'].includes(recovery)) throw new Error('没有待核验的字段删除')
  const capture = host.recoveryCapture
  if (capture && !capture.verified && capture.targets.some(target => target.tableName !== host.source.tableName
    || target.viewId !== host.source.viewId || target.ids.length !== 1 || target.ids[0] !== host.fieldId)) {
    throw new Error('原删除属于联合定义批次；请从完整字段工作区统一核验')
  }
  host.flow.status = 'saving'
  try {
    if (capture && !capture.verified && (capture.receiptInvalid || capture.targets.some(target => target.view.hasUnconfirmedSave))) {
      await verifyDataSpaceDefinitionCapture(host.dataSet, capture, capture.receiptInvalid === true)
    }
    if (!capture?.discarded) fieldRemoveDiscardOwned(host)
    const confirmed = await fieldRemoveReadback(host)
    delete host.recoveryCapture
    if (confirmed) fieldRemoveFinish(host); else host.flow.status = 'different'
    return confirmed
  } catch (error) {host.flow.status = 'readback'; throw error}
}

export function fieldRemoveAcceptCurrent(host: FieldRemoveHost): void {
  assertClean(host)
  if (host.flow.status !== 'different' || host.flow.verifiedSnapshot !== snapshot(host)) throw new Error('请先核验当前正式状态')
  fieldRemoveFinish(host)
}

export type FieldRemoveHandle = {
  getState(): ReturnType<typeof fieldRemoveGetState>
  hasInvalidReceipt(): boolean
  getRecoveryCapture(): DataSpaceDefinitionCaptureBatch | undefined
  preview(): Promise<void>
  cancel(): void
  stage(): Promise<void>
  prepareSave(): DataSpaceDefinitionSavePart
  save(): Promise<boolean>
  verify(): Promise<boolean>
  acceptCurrent(): void
}

export function createFieldRemoveHandle(host: FieldRemoveHost): FieldRemoveHandle {
  return {
    getState: () => fieldRemoveGetState(host),
    hasInvalidReceipt: () => host.recoveryCapture?.receiptInvalid === true,
    getRecoveryCapture: () => host.recoveryCapture,
    preview: () => fieldRemovePreview(host),
    cancel: () => fieldRemoveCancel(host),
    stage: () => fieldRemoveStage(host),
    prepareSave: () => fieldRemovePrepareSave(host),
    save: () => fieldRemoveSave(host),
    verify: () => fieldRemoveVerify(host),
    acceptCurrent: () => fieldRemoveAcceptCurrent(host),
  }
}
