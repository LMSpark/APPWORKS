/**
 * @module lowcode/data-space/model-source/rename/lowcode-data-space-model-rename-session
 * 职责：预览并提交模型注册名及本空间结构化引用，接续原场景配置保存（无独立命令类 FSM）。
 * 边界：原DataView承担权限与批量保存；未知回执只回读，不重放数据库写入。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDefinitionSave, definitionTargetDraftSignature, verifyDataSpaceDefinitionCapture, type DataSpaceDefinitionCaptureBatch} from '../data-space-definition-save'
import {LowcodeDataSpaceModelRenameReferences, type ModelNameChange} from './lowcode-data-space-model-rename-references'
import {LowcodeDataSpaceModelDependencies} from '../model/lowcode-data-space-model-dependencies'

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
  capture: DataSpaceDefinitionCaptureBatch | null
  captureSignatures: Array<{view: DataView; ids: string[]; signature: string}> | null
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

export type ModelRenameHostInput = Readonly<{
  dataSet: DataSet
  targetId: string
  modelId: string
  lifecycle: ModelRenameLifecycle
}>

export function createModelRenameHost(hostInput: ModelRenameHostInput): ModelRenameHost {
  const {dataSet, targetId, modelId, lifecycle} = hostInput
  const dependencies = new LowcodeDataSpaceModelDependencies({dataSet, targetId, modelId, operation: 'rename', assertCurrent: () => lifecycle.assertCurrent()})
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
    flow: {status: 'idle', changes: [], baseline: '', name: '', file: null, capture: null, captureSignatures: null, verification: [], verified: ''}}
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
  const hasTargetChanges = !!flow.capture?.targets.some(target => target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id)))
  return {status, pending: status !== 'idle' || inputName(host) !== input.rows[0]?.['name'], canAbandonNotApplied: flow.capture?.resolution === 'not-applied',
    canDiscardLocalChanges: flow.capture?.resolution === 'confirmed' && hasTargetChanges,
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
    const changes = LowcodeDataSpaceModelRenameReferences.prepare({views: host.views, modelId: host.modelId, nextName: name})
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
  assertOwner(host)
  host.dependencies.assertSiblingsClean()
  const rows = modelRenameRows(host)
  const targets = new Set(rows.map(item => item.view))
  for (const view of host.views) {
    if (view.mutating || view.requestState === RequestState.Loading || view.hasUnconfirmedSave) throw new Error('改名目标正在操作或仍有未确认保存；保留本地修改')
    if (!targets.has(view) && (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw new Error('请先处理其他定义草稿，不能覆盖')
    if (view.rows.some(row => {
      const id = row['rowid']
      return typeof id !== 'string' || !id || view.getPkKey(row) !== id || row['dataSetId'] !== host.targetId
    })) throw new Error('正式记录身份或空间归属不可核验')
  }
  for (const item of rows) {
    const patch = item.view.getEditingPatch(item.id)
    if (patch && Object.entries(patch).some(([key, value]) => item.patch[key] !== value)) throw new Error('改名草稿已被其他编辑改变，不能覆盖')
    if (item.view.dirtyTracking.hasPendingChanges(item.id)) {
      const diff = item.view.dirtyTracking.getDiff(item.id, item.row)
      if (Object.keys(diff).length !== Object.keys(item.patch).length
        || Object.entries(item.patch).some(([key, value]) => !diff[key] || !Object.is(diff[key].to, value))) throw new Error('待提交记录已被其他编辑改变，不能覆盖')
    }
  }
  for (const {view, id} of rows) {view.discardPendingChanges([id]); view.discardEditingRows([id])}
}

export async function modelRenameSave(host: ModelRenameHost): Promise<void> {
  if (flowStatus(host) !== 'ready' || !host.flow.file) throw new Error('请先预览改名')
  const file = host.flow.file
  assertClean(host); host.flow.status = 'saving'
  try {
    await file.assertCurrent(); assertClean(host)
    if (host.flow.baseline !== snapshot(host) || host.flow.name !== inputName(host)) throw new Error('定义或名称已变化，请重新预览')
    await host.dependencies.load(true); assertClean(host)
    if (host.flow.baseline !== snapshot(host) || host.flow.name !== inputName(host)) throw new Error('正式定义或名称已变化，请重新预览')
    const changes = LowcodeDataSpaceModelRenameReferences.prepare({views: host.views, modelId: host.modelId, nextName: host.flow.name})
    if (JSON.stringify(changes) !== JSON.stringify(host.flow.changes)) throw new Error('改名引用已变化，请重新预览')
    const rows = modelRenameRows(host)
    const expected = JSON.stringify(host.views.map(view => view.rows.map(row => ({...row,
      ...Object.fromEntries(host.flow.changes.filter(change => change.table === view.tableName && change.id === row['rowid']).map(change => [change.property, change.after]))}))))
    for (const {view, id, patch} of rows) for (const [key, value] of Object.entries(patch)) view.updateEditingValue(id, key, value)
    for (const {view, id} of rows) {
      const result = await view.applyEditingRows([id]); assertOwner(host)
      if (!result.success || result.data?.appliedCount !== 1 || result.data.failedCount !== 0) throw new Error('改名草稿未完整应用')
    }
    assertClean(host, true); await file.assertCurrent(); assertClean(host, true)
    if (snapshot(host) !== expected) throw new Error('应用期间元数据被其他编辑改变，请重新核验')
    for (const {view, id, patch} of modelRenameRows(host)) {
      const row = view.rows.find(value => value['rowid'] === id)
      if (!row || view.hasEditingChanges() || Object.entries(patch).some(([key, value]) => row[key] !== value || view.fieldAccess(row, key).write !== 'allowed'
        || view.fieldAccess(row, key).read !== 'visible') || view.editActionState(row) !== 'enabled') throw new Error('提交前改名草稿或数据权限已变化')
    }
    const targets = host.views.map(view => ({tableName: view.tableName, viewId: view.viewId, ids: rows.filter(item => item.view === view).map(item => item.id)})).filter(view => view.ids.length)
    if (!targets.length) throw new Error('改名没有可提交的正式定义目标')
    await DataSpaceDefinitionSave.run([{
      dataSet: host.dataSet, targetId: host.targetId, modelId: host.modelId,
       prepare: () => Promise.resolve().then(() => assertOwner(host)), apply: () => Promise.resolve(),
      check: async () => {
        assertClean(host, true)
        if (snapshot(host) !== expected) throw new Error('派发前改名定义已变化')
        for (const {view, id, patch} of modelRenameRows(host)) {
          const row = view.rows.find(value => value['rowid'] === id)
          if (!row || view.hasEditingChanges() || Object.entries(patch).some(([key, value]) => row[key] !== value
            || view.fieldAccess(row, key).write !== 'allowed' || view.fieldAccess(row, key).read !== 'visible') || view.editActionState(row) !== 'enabled') {
            throw new Error('提交前改名草稿或数据权限已变化')
          }
        }
        await file.assertCurrent(); assertOwner(host)
      },
      targets: () => targets,
      dispatched: capture => {
        host.flow.capture = capture
        host.flow.captureSignatures = capture.targets.map(target => ({view: target.view, ids: [...target.ids], signature: definitionTargetDraftSignature(target.view, target.ids)}))
        host.lifecycle.onDispatch()
      },
      confirm: async () => {
        assertOwner(host)
        if (!await modelRenameReadback(host)) {host.flow.status = 'different'; throw new Error('改名回读与预览不一致')}
        host.flow.status = 'configuration'
        await file.complete(false)
        modelRenameFinish(host)
      },
      failed: stage => {
        if (stage === 'dispatched' || stage === 'confirmed') {
          host.flow.status = ['configuration', 'different'].includes(host.flow.status) ? host.flow.status : host.flow.capture?.resolution === 'confirmed' ? 'readback' : 'unknown'
          return
        }
        host.flow.status = 'readback'
        try {modelRenameDiscardOwned(host); host.flow.status = 'ready'} catch { /* 保留外来草稿供人工处理。 */ }
      },
    }])
  } catch (error) {
    if (host.flow.capture?.resolution === 'confirmed' && !['configuration', 'different'].includes(host.flow.status)) host.flow.status = 'readback'
    if (!host.flow.capture) {
      try {modelRenameDiscardOwned(host); host.flow.status = 'ready'}
      catch {host.flow.status = 'readback'}
    }
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
  const remaining = LowcodeDataSpaceModelRenameReferences.prepare({views: host.views, modelId: host.modelId, nextName: host.flow.name, previousName: before})
  host.flow.verification.push(...remaining.map(change => ({table: change.table, id: change.id, property: change.property, result: '当前仍有旧注册名或引用；未自动补写'})))
  host.flow.verified = snapshot(host)
  if (host.flow.verification.every(item => item.result === '回读一致')) {
    host.dependencies.invalidate(host.flow.changes)
  }
  return host.flow.verification.every(item => item.result === '回读一致')
}

export async function modelRenameVerify(host: ModelRenameHost, options: Readonly<{discardLocalChanges?: boolean}> = {}): Promise<boolean> {
  const recovery = flowStatus(host)
  if (!['unknown', 'readback', 'different', 'configuration'].includes(recovery) || !host.flow.file) throw new Error('没有待核验的改名')
  const reconcile = recovery === 'configuration'
  const batch = host.flow.capture
  const file = host.flow.file
  if (!batch) throw new Error('缺少模型改名原始SPARK捕获；不能推断提交结果')
  for (const target of batch.targets) {
    const view = host.dataSet.getView(target.tableName, target.viewId)
    if (view !== target.view || view.destroyed || JSON.stringify(view.queryContext) !== target.queryContext) throw new Error('原改名目标视图或查询上下文已变化；未知结果仍保留')
    if (view.mutating || view.requestState === RequestState.Loading) throw new Error('原改名目标视图正忙；未修改任何本地状态')
  }
  if (batch.resolution === 'not-applied' && host.flow.captureSignatures?.some(item => definitionTargetDraftSignature(item.view, item.ids) !== item.signature)) {
    throw new Error('原SPARK确认未执行后改名目标已有新修改；保留修改，不能放弃原意图')
  }
  if (options.discardLocalChanges && (batch.resolution === 'not-applied' || batch.resolution === 'accepted-current')) {
    throw new Error('只有原改名批次已确认或仍待原批次核验时，才能明确放弃目标本地新修改')
  }
  const clickSignatures = batch.targets.map(target => [target, definitionTargetDraftSignature(target.view, target.ids)] as const)
  if (options.discardLocalChanges && batch.resolution !== 'confirmed'
    && (host.flow.captureSignatures?.length !== clickSignatures.length
      || clickSignatures.some(([target, signature], index) => {
        const original = host.flow.captureSignatures?.[index]
        if (!original) return true
        return original.view !== target.view || JSON.stringify(original.ids) !== JSON.stringify(target.ids) || original.signature !== signature
      }))) throw new Error('原改名批次存在点击前的目标新修改；先核验原提交并再次明确选择放弃')
  const lateEdits = new Set<DataView>(), listeners = new Map<DataView, (event: unknown) => void>()
  const watchLateEdits = () => {for (const view of new Set(clickSignatures.map(([target]) => target.view))) {
    const listener = () => lateEdits.add(view)
    view.events.on('editingFieldChanged', listener); listeners.set(view, listener)
  }}
  const disposeGuard = () => listeners.forEach((listener, view) => view.events.off('editingFieldChanged', listener))
  host.flow.status = 'saving'
  try {
    const discardAtClick = () => {
      if (clickSignatures.some(([target, signature]) => definitionTargetDraftSignature(target.view, target.ids) !== signature)) throw new Error('核验点击后目标草稿已变化；保留修改')
      disposeGuard()
      for (const [target] of clickSignatures) {target.view.discardPendingChanges([...target.ids]); target.view.discardEditingRows([...target.ids])}
      lateEdits.clear(); watchLateEdits()
    }
    if (options.discardLocalChanges && batch.resolution === 'confirmed') discardAtClick()
    else watchLateEdits()
    if (batch.resolution !== 'confirmed' && batch.resolution !== 'not-applied' && batch.resolution !== 'accepted-current') {
      const outcome = await verifyDataSpaceDefinitionCapture(host.dataSet, batch)
      assertOwner(host)
      if (lateEdits.size) throw new Error('原改名核验期间出现新字段编辑；修改已保留，请重新核验')
      if (outcome === 'not-applied') {
        host.flow.status = 'different'
        host.flow.verification = [{table: 'Base_DataModel', id: host.modelId, property: 'Name', result: 'SPARK确认原改名未执行；原意图保留，须明确放弃后才能重试'}]
        return false
      }
      if (outcome !== 'confirmed' && outcome !== 'already-confirmed') throw new Error('原改名批次尚未取得正式SPARK回执')
      if (options.discardLocalChanges) discardAtClick()
    }
    if (batch.resolution === 'not-applied') {
      host.flow.status = 'different'
      host.flow.verification = [{table: 'Base_DataModel', id: host.modelId, property: 'Name', result: 'SPARK确认原改名未执行；原意图保留，须明确放弃后才能重试'}]
      return false
    }
    if (batch.resolution !== 'confirmed' && batch.resolution !== 'accepted-current') throw new Error('原改名批次仍待核验')
    if (lateEdits.size) throw new Error('原改名核验期间出现新字段编辑；修改已保留，请重新核验')
    if (batch.targets.some(target => target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id)))) {
      throw new Error(options.discardLocalChanges ? '明确放弃目标本地修改后仍出现新编辑；修改已保留' : '原改名已确认，但目标存在后续本地修改；保留修改并先处理')
    }
    if (!await modelRenameReadback(host)) {host.flow.status = 'different'; return false}
    if (lateEdits.size) throw new Error('原改名领域回读期间出现新字段编辑；修改已保留')
    host.flow.status = 'configuration'; await file.complete(reconcile)
    if (lateEdits.size) throw new Error('原改名文件完成期间出现新字段编辑；修改已保留')
    modelRenameFinish(host); return true
  } catch (error) {if (host.flow.status !== 'configuration') host.flow.status = batch.resolution === 'confirmed' ? 'readback' : 'unknown'; throw error}
  finally {disposeGuard()}
}

function modelRenameFinish(host: ModelRenameHost, notifyCompleted = true): void {
  host.input.discardEditingRows(['rename']); host.input.replaceRows([{id: 'rename', name: modelRenameFormalName(host)}]); host.input.setCurrentRowById('rename'); host.changesView.replaceRows([])
  host.flow.status = 'idle'; host.flow.changes = []; host.flow.file = null; host.flow.capture = null; host.flow.captureSignatures = null; host.flow.verification = []
  if (notifyCompleted) host.lifecycle.completed()
}

export function modelRenameCancel(host: ModelRenameHost): void {
  assertOwner(host)
  if (!['idle', 'ready'].includes(flowStatus(host))) throw new Error('已派发改名须先核验')
  modelRenameFinish(host)
}

export function modelRenameAbandonNotApplied(host: ModelRenameHost): void {
  const batch = host.flow.capture, signatures = host.flow.captureSignatures
  if (host.flow.status !== 'different' || batch?.resolution !== 'not-applied' || !signatures
    || signatures.some(item => definitionTargetDraftSignature(item.view, item.ids) !== item.signature)) {
    throw new Error('只有原SPARK批次确认未执行且原改名意图未变化时，才能明确放弃本次改名')
  }
  assertOwner(host)
  for (const target of batch.targets) {
    if (host.dataSet.getView(target.tableName, target.viewId) !== target.view || target.view.destroyed
      || JSON.stringify(target.view.queryContext) !== target.queryContext || target.view.mutating || target.view.requestState === RequestState.Loading
      || target.view.hasUnconfirmedSave) throw new Error('原改名目标或查询状态已变化；未放弃任何改名意图')
  }
  for (const target of batch.targets) {target.view.discardPendingChanges([...target.ids]); target.view.discardEditingRows([...target.ids])}
  modelRenameFinish(host, false)
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
  readonly targetViews: readonly DataView[]
  getState(): ReturnType<typeof modelRenameGetState>
  preview(): Promise<void>
  cancel(): void
  save(): Promise<void>
  verify(options?: Readonly<{discardLocalChanges?: boolean}>): Promise<boolean>
  abandonNotApplied(): void
  release(): void
}

export function createModelRenameHandle(host: ModelRenameHost): ModelRenameHandle {
  return {
    input: host.input,
    changesView: host.changesView,
    targetViews: host.views,
    getState: () => modelRenameGetState(host),
    preview: () => modelRenamePreview(host),
    cancel: () => modelRenameCancel(host),
    save: () => modelRenameSave(host),
    verify: options => modelRenameVerify(host, options),
    abandonNotApplied: () => modelRenameAbandonNotApplied(host),
    release: () => modelRenameRelease(host),
  }
}
