/**
 * @module lowcode/data-space/model-source/rename/lowcode-data-space-model-rename-session
 * 职责：预览并提交模型注册名及本空间结构化引用，接续原场景配置保存（无独立命令类 FSM）。
 * 边界：原DataView承担权限与批量保存；未知回执只回读，不重放数据库写入。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceModelRenameReferences, type ModelNameChange} from './lowcode-data-space-model-rename-references'
import {LowcodeDataSpaceModelDependencies} from '../lowcode-data-space-model-dependencies'

/** 原场景文件owner提供的绑定变更计划，不提供第二条文件写入通道。 */
export type ModelRenameFilePlan = Readonly<{
  tables: string[]
  tools: string[]
  references: ModelNameChange[]
  assertCurrent(): Promise<void>
  complete(reconcile: boolean): Promise<void>
}>

export type ModelRenameStatus = 'idle' | 'previewing' | 'ready' | 'saving' | 'unknown' | 'readback' | 'different' | 'configuration'

export type ModelRenameFlow = {
  status: ModelRenameStatus
  changes: ModelNameChange[]
  baseline: string
  name: string
  file: ModelRenameFilePlan | null
  pendingRows: Map<string, string>
  verification: Array<{table: string; id: string; property: string; result: string}>
  verified: string
}

export type ModelRenameLifecycle = Readonly<{
  assertCurrent(): void
  onDispatch(): void
  completed(): void
  prepareFile(oldName: string, nextName: string): Promise<ModelRenameFilePlan>
}>

export type ModelRenameHost = {
  readonly dataSet: DataSet
  readonly targetId: string
  readonly modelId: string
  readonly lifecycle: ModelRenameLifecycle
  readonly input: DataView
  readonly changesView: DataView
  readonly dependencies: LowcodeDataSpaceModelDependencies
  readonly views: DataView[]
  flow: ModelRenameFlow
}

export function createModelRenameHost(dataSet: DataSet, targetId: string, modelId: string, lifecycle: ModelRenameLifecycle): ModelRenameHost {
  const dependencies = new LowcodeDataSpaceModelDependencies(dataSet, targetId, modelId, 'rename', () => lifecycle.assertCurrent())
  const prefix = `ModelRename_${crypto.randomUUID().replaceAll('-', '')}`
  const local = (name: string, columns: string[]) => {
    const table = dataSet.addTable(name, columns.map(column => ({name: column, type: 'string', isPrimaryKey: column === 'id'})))
    table.resourceType = 'static-data'; return table.getOrCreateView('default')
  }
  const input = local(`${prefix}_input`, ['id', 'name'])
  input.commitMode = 'staged'
  const changesView = local(`${prefix}_changes`, ['id', 'table', 'record', 'property', 'before', 'after'])
  changesView.selectionDelimiter = ''
  const host: ModelRenameHost = {dataSet, targetId, modelId, lifecycle, dependencies, views: dependencies.views, input, changesView,
    flow: {status: 'idle', changes: [], baseline: '', name: '', file: null, pendingRows: new Map(), verification: [], verified: ''}}
  input.replaceRows([{id: 'rename', name: modelRenameFormalName(host)}]); input.setCurrentRowById('rename')
  return host
}

function assertOwner(host: ModelRenameHost): void {
  host.dependencies.assertOwner()
  if (host.input.destroyed || host.changesView.destroyed) throw new Error('改名输入或预览已释放')
}

function assertClean(host: ModelRenameHost, owned = false, readback = false): void {
  assertOwner(host)
  host.dependencies.assertSiblingsClean()
  if (!readback) host.dependencies.assertFieldScope()
  const {views, targetId, flow} = host
  for (const view of views) {
    if (view.mutating || view.requestState === RequestState.Loading || !readback && (view.requestState !== RequestState.Loaded || view.total !== view.rows.length)) throw new Error('改名所需数据未完整读取或仍在操作')
    const ids = new Set(owned ? flow.changes.filter(change => change.table === view.tableName).map(change => change.id) : [])
    if (view.dirtyTracking.pendingCreateIds.size || view.dirtyTracking.pendingDeleteIds.size
      || [...view.dirtyTracking.dirtyRowIds].some(id => !ids.has(String(id)))
      || view.rows.some(row => view.hasEditingChanges(view.getPkKey(row)) && !ids.has(String(view.getPkKey(row))))) throw new Error('请先处理其他定义草稿，不能覆盖')
    const found = new Set<string>()
    for (const row of view.rows) {
      const id = row['rowid']
      if (typeof id !== 'string' || !id || found.has(id) || view.getPkKey(row) !== id
        || row['dataSetId'] !== targetId || ['rowid', 'dataSetId'].some(key => view.fieldAccess(row, key).read !== 'visible')) throw new Error('正式记录身份或空间归属不可核验')
      found.add(id)
    }
  }
}

function snapshot(host: ModelRenameHost): string {return JSON.stringify(host.views.map(view => view.rows))}

function modelRenameFormalName(host: ModelRenameHost): string {
  const view = host.views[0], row = view?.rows.find(item => item['rowid'] === host.modelId)
  return view && row && view.fieldAccess(row, 'Name').read === 'visible' && typeof row['Name'] === 'string' ? row['Name'] : ''
}

function inputName(host: ModelRenameHost): string {
  const value = host.input.getEditingRow('rename')?.['name'] ?? host.input.rows[0]?.['name']
  return typeof value === 'string' ? value : ''
}

function flowStatus(host: ModelRenameHost): ModelRenameStatus {
  const {flow, views} = host
  if (flow.status === 'saving' || flow.status === 'previewing') return flow.status
  if (flow.status === 'readback' || flow.status === 'different' || flow.status === 'configuration') return flow.status
  if (flow.status !== 'idle' && views.some(view => view.hasUnconfirmedSave)) return 'unknown'
  if (flow.status === 'unknown') return 'unknown'
  return flow.status
}

export function modelRenameGetState(host: ModelRenameHost) {
  const status = flowStatus(host)
  const {flow, input} = host
  return {status, pending: status !== 'idle' || inputName(host) !== input.rows[0]?.['name'],
    changes: flow.changes, tables: flow.file?.tables ?? [], tools: flow.file?.tools ?? [], verification: flow.verification}
}

export async function modelRenamePreview(host: ModelRenameHost): Promise<void> {
  if (!['idle', 'ready'].includes(flowStatus(host))) throw new Error('请先核验上次改名')
  assertClean(host, false, true); host.flow.status = 'previewing'; host.flow.changes = []; host.flow.file = null; host.changesView.replaceRows([])
  try {
    await host.dependencies.load()
    const name = inputName(host)
    assertClean(host)
    const baseline = snapshot(host)
    const changes = LowcodeDataSpaceModelRenameReferences.prepare(host.views, host.modelId, name)
    const oldName = changes.find(change => change.table === 'Base_DataModel' && change.id === host.modelId && change.property === 'Name')?.before
    if (!oldName) throw new Error('注册名变更缺失')
    const file = await host.lifecycle.prepareFile(oldName, name)
    assertClean(host)
    if (snapshot(host) !== baseline || inputName(host) !== name) throw new Error('预览期间定义或输入已改变')
    host.flow.name = name; host.flow.baseline = baseline; host.flow.changes = changes; host.flow.file = file; host.flow.status = 'ready'
    host.changesView.replaceRows([...changes, ...file.references].map((change, index) => ({...change, id: String(index), record: change.id})))
  } catch (error) {host.flow.status = 'idle'; throw error}
}

function modelRenameRows(host: ModelRenameHost): Array<{view: DataView; id: string; row: DataRow; patch: Record<string, string>}> {
  return host.views.flatMap(view => [...new Set(host.flow.changes.filter(change => change.table === view.tableName).map(change => change.id))].map(id => {
    const row = view.rows.find(value => value['rowid'] === id)
    if (!row) throw new Error('改名记录已消失')
    return {view, id, row, patch: Object.fromEntries(host.flow.changes.filter(change => change.table === view.tableName && change.id === id).map(change => [change.property, change.after]))}
  }))
}

function modelRenameDiscardOwned(host: ModelRenameHost): void {
  assertClean(host, true, true)
  const rows = modelRenameRows(host)
  for (const item of rows) {
    const patch = item.view.getEditingPatch(item.id)
    if (patch && Object.entries(patch).some(([key, value]) => item.patch[key] !== value)) throw new Error('改名草稿已被其他编辑改变，不能覆盖')
    if (item.view.dirtyTracking.hasPendingChanges(item.id)
      && JSON.stringify(item.row) !== host.flow.pendingRows.get(`${item.view.tableName}:${item.id}`)) throw new Error('待提交记录已被其他编辑改变，不能覆盖')
  }
  for (const {view, id} of rows) view.discardPendingChanges([id])
  host.flow.pendingRows.clear()
}

export async function modelRenameSave(host: ModelRenameHost): Promise<void> {
  if (flowStatus(host) !== 'ready' || !host.flow.file) throw new Error('请先预览改名')
  assertClean(host)
  host.flow.status = 'saving'; let dispatched = false; let confirmed = false
  try {
    await host.flow.file.assertCurrent(); assertClean(host)
    if (host.flow.baseline !== snapshot(host) || host.flow.name !== inputName(host)) throw new Error('定义或名称已变化，请重新预览')
    await host.dependencies.load(true); assertClean(host)
    if (host.flow.baseline !== snapshot(host) || host.flow.name !== inputName(host)) throw new Error('正式定义或名称已变化，请重新预览')
    const changes = LowcodeDataSpaceModelRenameReferences.prepare(host.views, host.modelId, host.flow.name)
    if (JSON.stringify(changes) !== JSON.stringify(host.flow.changes)) throw new Error('改名引用已变化，请重新预览')
    const rows = modelRenameRows(host)
    const expected = JSON.stringify(host.views.map(view => view.rows.map(row => ({...row,
      ...Object.fromEntries(host.flow.changes.filter(change => change.table === view.tableName && change.id === row['rowid']).map(change => [change.property, change.after]))}))))
    for (const {view, id, patch} of rows) for (const [key, value] of Object.entries(patch)) view.updateEditingValue(id, key, value)
    for (const {view, id} of rows) {
      const result = await view.applyEditingRows([id]); assertOwner(host)
      host.flow.pendingRows.set(`${view.tableName}:${id}`, JSON.stringify(view.rows.find(row => row['rowid'] === id)))
      if (!result.success || result.data?.appliedCount !== 1 || result.data.failedCount !== 0) throw new Error('改名草稿未完整应用')
    }
    assertClean(host, true); await host.flow.file.assertCurrent(); assertClean(host, true)
    if (snapshot(host) !== expected) throw new Error('应用期间元数据被其他编辑改变，请重新核验')
    for (const {view, id, patch} of modelRenameRows(host)) {
      const row = view.rows.find(value => value['rowid'] === id)
      if (!row || view.hasEditingChanges() || Object.entries(patch).some(([key, value]) => row[key] !== value || view.fieldAccess(row, key).write !== 'allowed'
        || view.fieldAccess(row, key).read !== 'visible') || view.editActionState(row) !== 'enabled') throw new Error('提交前改名草稿或数据权限已变化')
    }
    const views = host.views.map(view => ({tableName: view.tableName, viewId: view.viewId, ids: rows.filter(item => item.view === view).map(item => item.id)})).filter(view => view.ids.length)
    host.lifecycle.onDispatch(); dispatched = true
    const saved = await host.dataSet.saveChanges({applyEditingRows: false, views})
    assertOwner(host)
    if (!saved.success || saved.data?.viewResults.length !== views.length || saved.data.failedEditingRows !== 0 || views.some(view => {
      const matches = saved.data?.viewResults.filter(result => result.tableName === view.tableName && result.viewId === view.viewId), result = matches?.[0]
      return matches?.length !== 1 || result?.savedCount !== view.ids.length || result.failedCount !== 0 || result.createdCount !== 0 || result.deletedCount !== 0
    })) throw new Error('改名回执未完整确认，请核验；不会重复提交')
    confirmed = true; host.flow.pendingRows.clear()
    if (!await modelRenameReadback(host)) throw new Error('改名回读与预览不一致')
    host.flow.status = 'configuration'; await host.flow.file.complete(false); modelRenameFinish(host)
  } catch (error) {
    if (dispatched) {if (host.flow.status !== 'configuration') host.flow.status = confirmed ? 'readback' : 'unknown'}
    else {host.flow.status = 'readback'; try {modelRenameDiscardOwned(host); host.flow.status = 'ready'} catch { /* 保留外来草稿供人工处理。 */ }}
    throw error
  }
}

async function modelRenameReadback(host: ModelRenameHost): Promise<boolean> {
  assertClean(host, false, true); host.flow.verification = []
  await host.dependencies.load(true)
  assertClean(host)
  host.flow.verification = host.flow.changes.map(change => {
    const view = host.views.find(item => item.tableName === change.table), row = view?.rows.find(item => item['rowid'] === change.id)
    return {table: change.table, id: change.id, property: change.property, result: view && row && view.fieldAccess(row, change.property).read === 'visible'
      && row[change.property] === change.after ? '回读一致' : '未读取到预期值'}
  })
  const before = host.flow.changes.find(change => change.table === 'Base_DataModel' && change.id === host.modelId && change.property === 'Name')?.before
  if (!before) throw new Error('原注册名预览已丢失')
  const remaining = LowcodeDataSpaceModelRenameReferences.prepare(host.views, host.modelId, host.flow.name, before)
  host.flow.verification.push(...remaining.map(change => ({table: change.table, id: change.id, property: change.property, result: '当前仍有旧注册名或引用；未自动补写'})))
  host.flow.verified = snapshot(host)
  if (host.flow.verification.every(item => item.result === '回读一致')) {
    host.dependencies.invalidate(host.flow.changes)
  }
  return host.flow.verification.every(item => item.result === '回读一致')
}

export async function modelRenameVerify(host: ModelRenameHost): Promise<boolean> {
  const recovery = flowStatus(host)
  if (!['unknown', 'readback', 'different', 'configuration'].includes(recovery) || !host.flow.file) throw new Error('没有待核验的改名')
  const reconcile = recovery === 'configuration'
  host.dataSet.abandonUnconfirmedSaves()
  modelRenameDiscardOwned(host); host.flow.status = 'saving'
  try {
    if (!await modelRenameReadback(host)) {host.flow.status = 'different'; return false}
    host.flow.status = 'configuration'; await host.flow.file.complete(reconcile); modelRenameFinish(host); return true
  } catch (error) {if (host.flow.status !== 'configuration') host.flow.status = 'readback'; throw error}
}

function modelRenameFinish(host: ModelRenameHost): void {
  host.input.discardEditingRows(['rename']); host.input.replaceRows([{id: 'rename', name: modelRenameFormalName(host)}]); host.input.setCurrentRowById('rename'); host.changesView.replaceRows([])
  host.flow.status = 'idle'; host.flow.changes = []; host.flow.file = null; host.flow.verification = []; host.flow.pendingRows.clear()
  host.lifecycle.completed()
}

export function modelRenameCancel(host: ModelRenameHost): void {
  assertOwner(host)
  if (!['idle', 'ready'].includes(flowStatus(host))) throw new Error('已派发改名须先核验')
  modelRenameFinish(host)
}

export function modelRenameAcceptCurrent(host: ModelRenameHost): void {
  assertClean(host)
  if (host.flow.status !== 'different' || snapshot(host) !== host.flow.verified) throw new Error('请先核验当前正式结果')
  modelRenameFinish(host)
}

export function modelRenameRelease(host: ModelRenameHost): void {
  if (host.dataSet.destroyed) return
  if (modelRenameGetState(host).pending) throw new Error('注册名操作尚未结束，不能释放')
  host.dependencies.release()
  host.dataSet.removeTable(host.input.tableName); host.dataSet.removeTable(host.changesView.tableName)
}

export type ModelRenameHandle = {
  readonly input: DataView
  readonly changesView: DataView
  getState(): ReturnType<typeof modelRenameGetState>
  preview(): Promise<void>
  cancel(): void
  save(): Promise<void>
  verify(): Promise<boolean>
  acceptCurrent(): void
  release(): void
}

export function createModelRenameHandle(host: ModelRenameHost): ModelRenameHandle {
  return {
    input: host.input,
    changesView: host.changesView,
    getState: () => modelRenameGetState(host),
    preview: () => modelRenamePreview(host),
    cancel: () => modelRenameCancel(host),
    save: () => modelRenameSave(host),
    verify: () => modelRenameVerify(host),
    acceptCurrent: () => modelRenameAcceptCurrent(host),
    release: () => modelRenameRelease(host),
  }
}
