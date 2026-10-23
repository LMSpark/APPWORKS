/**
 * @module lowcode/data-space/model-source/removal/lowcode-data-space-model-remove-session
 * 职责：预览并删除一个正式模型及其字段、直接关系，逐项确认回执与回读（无独立命令类 FSM）。
 * 边界：数据和权限仍归原DataView；不跨入独立功能标签体系改删配置。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceModelRemoveReferences} from './lowcode-data-space-model-remove-references'
import {LowcodeDataSpaceModelDependencies} from '../lowcode-data-space-model-dependencies'

type Removal = {view: DataView; id: string; row: DataRow; snapshot: string}

/** 删除预览的场景文件基线及数据库删除后的局部收尾。 */
export type LowcodeDataSpaceModelRemovalFilePlan = Readonly<{
  baseline: string | null
  layout: boolean
  assertCurrent(): void
  complete(reconcile: boolean): Promise<void>
}>

export type ModelRemoveStatus = 'idle' | 'previewing' | 'ready' | 'saving' | 'unknown' | 'readback' | 'different' | 'configuration'

export type ModelRemoveFlow = {
  status: ModelRemoveStatus
  entries: Removal[]
  staged: Set<Removal>
  baseline: string
  name: string
  confirmed: boolean
  databaseComplete: boolean
  filePlan: LowcodeDataSpaceModelRemovalFilePlan | null
  verification: Array<{table: string; id: string; result: string}>
}

export type ModelRemoveLifecycle = Readonly<{
  assertCurrent(): void
  validateFile(views: readonly DataView[]): Promise<LowcodeDataSpaceModelRemovalFilePlan>
  onDispatch(): void
}>

export type ModelRemoveHost = {
  readonly dataSet: DataSet
  readonly targetId: string
  readonly modelId: string
  readonly lifecycle: ModelRemoveLifecycle
  readonly dependencies: LowcodeDataSpaceModelDependencies
  readonly views: DataView[]
  flow: ModelRemoveFlow
}

export type ModelRemoveHostInput = Readonly<{
  dataSet: DataSet
  targetId: string
  modelId: string
  lifecycle: ModelRemoveLifecycle
}>

export function createModelRemoveHost(input: ModelRemoveHostInput): ModelRemoveHost {
  const {dataSet, targetId, modelId, lifecycle} = input
  const dependencies = new LowcodeDataSpaceModelDependencies({dataSet, targetId, modelId, operation: 'remove', assertCurrent: () => lifecycle.assertCurrent()})
  return {dataSet, targetId, modelId, lifecycle, dependencies, views: dependencies.views,
    flow: {status: 'idle', entries: [], staged: new Set(), baseline: '', name: '', confirmed: false, databaseComplete: false, filePlan: null, verification: []}}
}

function assertOwner(host: ModelRemoveHost): void {
  host.dependencies.assertOwner()
}

function assertClean(host: ModelRemoveHost, readback = false): void {
  assertOwner(host)
  host.dependencies.assertSiblingsClean()
  if (!readback) host.dependencies.assertFieldScope()
  const {views, flow, targetId} = host
  for (const view of views) {
    if (view.mutating || view.requestState === RequestState.Loading || !readback && view.requestState !== RequestState.Loaded) throw new Error('删除所需数据尚未完整读取或仍在操作')
    if (view.hasEditingChanges() || view.dirtyTracking.pendingCreateIds.size || view.dirtyTracking.dirtyRowIds.size
      || [...view.dirtyTracking.pendingDeleteIds].some(id => ![...flow.staged].some(item => item.view === view && item.id === id))) throw new Error('请先处理其他草稿，不能合并或覆盖')
    if (!readback && !flow.staged.size && view.total !== view.rows.length) throw new Error('删除所需数据未完整读取')
    const ids = new Set<string>()
    for (const row of view.rows) {
      if (typeof row['rowid'] !== 'string' || !row['rowid'] || ids.has(row['rowid']) || view.getPkKey(row) !== row['rowid']
        || row['dataSetId'] !== targetId || ['rowid', 'dataSetId'].some(key => view.fieldAccess(row, key).read !== 'visible')) throw new Error('删除数据身份、唯一性或目标归属不可核验')
      ids.add(row['rowid'])
    }
  }
}

function snapshot(host: ModelRemoveHost): string {
  return JSON.stringify(host.views.map(view => [...view.rows, ...[...host.flow.staged].filter(item => item.view === view).map(item => item.row)]
    .sort((left, right) => String(left['rowid']).localeCompare(String(right['rowid'])))))
}

function modelRemovePrepare(host: ModelRemoveHost): void {
  assertClean(host)
  const [models, fields, relations] = host.views
  if (!models || !fields || !relations) throw new Error('删除所需正式视图缺失')
  const row = models.rows.find(item => item['rowid'] === host.modelId)
  if (!row || models.fieldAccess(row, 'Name').read !== 'visible' || typeof row['Name'] !== 'string' || !row['Name']) throw new Error('模型身份或注册名不可读取')
  host.flow.name = row['Name']
  for (const [view, keys] of [[fields, ['dataModelId']], [relations, ['parentModId', 'childModId']]] as const) {
    if (view.rows.some(item => keys.some(key => view.fieldAccess(item, key).read !== 'visible' || typeof item[key] !== 'string' || !item[key]))) throw new Error('字段或关系归属不可核验，不能删除')
  }
  LowcodeDataSpaceModelRemoveReferences.validate(host.views, host.modelId, host.flow.name)
  host.flow.entries = host.views.flatMap(view => view.rows.filter(item => view === models ? item['rowid'] === host.modelId
    : view === fields ? item['dataModelId'] === host.modelId : item['parentModId'] === host.modelId || item['childModId'] === host.modelId)
    .map(item => ({view, id: String(item['rowid']), row: item, snapshot: JSON.stringify(item)})))
  assertPermissions(host)
  host.flow.baseline = snapshot(host)
}

function assertPermissions(host: ModelRemoveHost): void {
  for (const item of host.flow.entries) {
    if (item.view.deleteActionState(item.row) !== 'enabled') throw new Error(`缺少删除权限：${item.view.tableName}/${item.id}`)
    if (host.flow.staged.has(item) && JSON.stringify(item.view.dirtyTracking.getPendingDeleteSnapshot(item.id)) !== item.snapshot) throw new Error('待删记录快照已变化')
  }
}

function flowStatus(host: ModelRemoveHost): ModelRemoveStatus {
  const {flow, views} = host
  if (flow.status === 'saving' || flow.status === 'previewing') return flow.status
  if (flow.status === 'readback' || flow.status === 'different' || flow.status === 'configuration') return flow.status
  if (flow.status !== 'idle' && views.some(view => view.hasUnconfirmedSave)) return 'unknown'
  if (flow.status === 'unknown') return 'unknown'
  return flow.status
}

export function modelRemoveGetState(host: ModelRemoveHost) {
  const status = flowStatus(host)
  const {flow} = host
  return {status, pending: status !== 'idle', preview: flow.entries.length ? {name: flow.name, layout: flow.filePlan?.layout === true,
    records: host.views.map(view => ({table: view.tableName, ids: flow.entries.filter(item => item.view === view).map(item => item.id)})).filter(item => item.ids.length)} : null,
  verification: flow.verification.map(item => ({...item}))}
}

export async function modelRemovePreview(host: ModelRemoveHost): Promise<void> {
  if (flowStatus(host) !== 'idle') throw new Error('请先处理当前删除操作')
  host.flow.status = 'previewing'
  try {
    assertClean(host, true); await host.dependencies.load()
    modelRemovePrepare(host)
    const filePlan = await host.lifecycle.validateFile(host.views)
    filePlan.assertCurrent(); assertClean(host); assertPermissions(host)
    if (host.flow.baseline !== snapshot(host)) throw new Error('预览期间元数据已变化')
    host.flow.filePlan = filePlan
    host.flow.status = 'ready'
  } catch (error) {modelRemoveFinish(host); throw error}
}

function modelRemoveFinish(host: ModelRemoveHost): void {
  host.flow.status = 'idle'; host.flow.entries = []; host.flow.staged.clear(); host.flow.verification = []
  host.flow.confirmed = false; host.flow.databaseComplete = false; host.flow.filePlan = null; host.flow.baseline = ''
}

export function modelRemoveCancel(host: ModelRemoveHost): void {
  assertOwner(host)
  if (flowStatus(host) !== 'ready') throw new Error('只能取消尚未提交的删除预览')
  modelRemoveFinish(host)
}

export async function modelRemoveSave(host: ModelRemoveHost): Promise<boolean> {
  if (flowStatus(host) !== 'ready') throw new Error('请先预览；未决删除不能重复提交')
  assertClean(host); assertPermissions(host)
  if (snapshot(host) !== host.flow.baseline) throw new Error('删除预览已过期，请取消后重新预览')
  host.flow.status = 'saving'
  let dispatched = false
  try {
    await host.dependencies.load(true); assertClean(host)
    if (snapshot(host) !== host.flow.baseline) throw new Error('正式定义已变化，请重新预览删除')
    modelRemovePrepare(host)
    const filePlan = await host.lifecycle.validateFile(host.views)
    if (host.flow.filePlan?.baseline !== filePlan.baseline) throw new Error('删除预览的文件已变化，请取消后重新预览')
    host.flow.filePlan = filePlan
    const check = () => {
      filePlan.assertCurrent(); assertClean(host); assertPermissions(host)
      if (snapshot(host) !== host.flow.baseline) throw new Error('提交前元数据已变化')
    }
    check()
    for (const item of host.flow.entries) {
      check()
      if (await item.view.removeRow(item.id) !== true) throw new Error('记录删除尚未暂存')
      host.flow.staged.add(item)
    }
    check()
    const views = host.views.map(view => ({tableName: view.tableName, viewId: view.viewId,
      ids: host.flow.entries.filter(item => item.view === view).map(item => item.id)})).filter(view => view.ids.length)
    host.lifecycle.onDispatch(); dispatched = true
    const saved = await host.dataSet.saveChanges({applyEditingRows: false, views})
    assertOwner(host)
    if (!saved.success || saved.data?.viewResults.length !== views.length || saved.data.failedEditingRows !== 0
      || views.some(view => {
        const results = saved.data?.viewResults.filter(result => result.tableName === view.tableName && result.viewId === view.viewId)
        const result = results?.[0]
        return results?.length !== 1 || result?.deletedCount !== view.ids.length || result.savedCount !== 0 || result.createdCount !== 0 || result.failedCount !== 0
      })) throw new Error('删除回执未完整确认，请核验；不会重复提交')
    host.flow.confirmed = true; host.flow.staged.clear()
    if (!await modelRemoveReadback(host)) throw new Error('删除回读仍有记录，不能确认完整成功')
    await modelRemoveCompleteConfiguration(host, false)
    modelRemoveFinish(host); return true
  } catch (error) {
    if (dispatched) host.flow.status = host.flow.databaseComplete ? 'configuration' : host.flow.confirmed ? 'readback' : 'unknown'
    else {
      host.flow.status = 'readback'
      try {modelRemoveDiscardOwned(host); host.flow.status = 'ready'} catch { /* 保留被外部改变的草稿，不能自动覆盖。 */ }
    }
    throw error
  }
}

function modelRemoveDiscardOwned(host: ModelRemoveHost): void {
  assertClean(host, true)
  for (const item of host.flow.staged) {
    if (item.view.dirtyTracking.pendingDeleteIds.has(item.id)) {
      if (JSON.stringify(item.view.dirtyTracking.getPendingDeleteSnapshot(item.id)) !== item.snapshot) throw new Error('删除草稿已变化，不能覆盖')
    } else if (item.view.dirtyTracking.hasPendingChanges(item.id)) throw new Error('待删记录出现其他修改')
  }
  for (const view of host.views) view.discardPendingChanges([...host.flow.staged].filter(item => item.view === view).map(item => item.id))
  host.flow.staged.clear()
}

async function modelRemoveReadback(host: ModelRemoveHost): Promise<boolean> {
  host.flow.databaseComplete = false; host.flow.verification = []
  assertClean(host, true)
  await host.dependencies.load(true)
  assertClean(host)
  const discovered: Array<{table: string; id: string; result: string}> = []
  for (const view of host.views) {
    const ownerKeys = view.tableName === 'Base_DataModel_Field' ? ['dataModelId']
      : view.tableName === 'Base_DataModel_Relation' ? ['parentModId', 'childModId'] : []
    for (const row of view.rows) {
      if (ownerKeys.some(key => view.fieldAccess(row, key).read !== 'visible' || typeof row[key] !== 'string' || !row[key])) {
        throw new Error('删除回读的从属归属不可核验，不能确认完成')
      }
      if (ownerKeys.some(key => row[key] === host.modelId) && !host.flow.entries.some(item => item.view === view && item.id === row['rowid'])) {
        discovered.push({table: view.tableName, id: String(row['rowid']), result: '新增从属记录仍存在；不在原删除清单'})
      }
    }
  }
  host.flow.baseline = snapshot(host)
  host.flow.verification = [...host.flow.entries.map(item => ({table: item.view.tableName, id: item.id,
    result: item.view.rows.some(row => row['rowid'] === item.id) ? '记录仍存在' : host.flow.confirmed ? '回执与回读一致' : '未读取到记录；缺少完整删除回执，结果未确认'})), ...discovered]
  const confirmed = host.flow.confirmed && host.flow.verification.every(item => item.result === '回执与回读一致')
  host.dependencies.invalidate(host.flow.entries.map(item => ({table: item.view.tableName, id: item.id})))
  return confirmed
}

async function modelRemoveCompleteConfiguration(host: ModelRemoveHost, reconcile: boolean): Promise<void> {
  host.flow.databaseComplete = true
  assertClean(host)
  if (!host.flow.filePlan) throw new Error('删除文件计划已丢失，不能确认完成')
  await host.flow.filePlan.complete(reconcile)
  assertOwner(host)
}

export async function modelRemoveVerify(host: ModelRemoveHost): Promise<boolean> {
  const recovery = flowStatus(host)
  if (!['unknown', 'readback', 'different', 'configuration'].includes(recovery)) throw new Error('没有可核验的删除')
  const reconcile = recovery === 'configuration'
  host.dataSet.abandonUnconfirmedSaves()
  modelRemoveDiscardOwned(host); host.flow.status = 'saving'
  try {
    const confirmed = await modelRemoveReadback(host)
    if (confirmed) {await modelRemoveCompleteConfiguration(host, reconcile); modelRemoveFinish(host)}
    else {host.flow.databaseComplete = false; host.flow.status = 'different'}
    return confirmed
  } catch (error) {host.flow.status = host.flow.databaseComplete ? 'configuration' : 'readback'; throw error}
}

export function modelRemoveAcceptCurrent(host: ModelRemoveHost): void {
  assertClean(host)
  if (host.flow.status !== 'different' || snapshot(host) !== host.flow.baseline) throw new Error('请先核验当前正式结果')
  modelRemoveFinish(host)
}

export type ModelRemoveHandle = {
  getState(): ReturnType<typeof modelRemoveGetState>
  preview(): Promise<void>
  cancel(): void
  save(): Promise<boolean>
  verify(): Promise<boolean>
  acceptCurrent(): void
}

export function createModelRemoveHandle(host: ModelRemoveHost): ModelRemoveHandle {
  return {
    getState: () => modelRemoveGetState(host),
    preview: () => modelRemovePreview(host),
    cancel: () => modelRemoveCancel(host),
    save: () => modelRemoveSave(host),
    verify: () => modelRemoveVerify(host),
    acceptCurrent: () => modelRemoveAcceptCurrent(host),
  }
}
