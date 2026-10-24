/**
 * @module lowcode/data-space/model-source/lowcode-data-space-model-create-session
 * 职责：从正式来源创建模型及所属字段，经原元数据 DataSet 按范围提交和核验（无独立命令类 FSM）。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {PageDataSpaceModelSourceReader as SourceReader} from './lowcode-data-space-source-catalog'
import {LowcodeDataSpaceArrayDraft, type ArrayDefinition} from './array/lowcode-data-space-array-draft'
import {DataSpaceDefinitionSave, definitionTargetDraftSignature, verifyAndDiscardDataSpaceDefinitionCapture,
  verifyDataSpaceDefinitionCapture, type DataSpaceDefinitionCaptureBatch} from './save/data-space-definition-save'

export type ModelCreateSources = SourceReader | undefined
type Source = Parameters<NonNullable<SourceReader>['prepare']>[0]
type Prepared = Awaited<ReturnType<NonNullable<SourceReader>['prepare']>>
type Candidate = {name: string; prepared: Prepared}
type Staged = {view: DataView; id: string; values: Readonly<Record<string, unknown>>; snapshot: string}
export type ModelCreateStatus = 'idle' | 'previewing' | 'ready' | 'saving' | 'unsubmitted' | 'unknown' | 'readback' | 'different'

export type ModelCreateFlow = {
  status: ModelCreateStatus
  generation: number
  preview: Candidate | null
  staged: Staged[]
  capture: DataSpaceDefinitionCaptureBatch | null
  captureSignatures: Array<{view: DataView; ids: string[]; signature: string}> | null
  readbackSignatures: Array<{view: DataView; ids: string[]; signature: string}> | null
  unresolved: boolean
  verification: Array<{table: string; id: string; result: string}>
}

export type ModelCreateLifecycle = Readonly<{assertCurrent(): void; onDispatch(): void}>

export type ModelCreateHost = {
  readonly models: DataView
  readonly fieldSource: DataView
  fields: DataView | undefined
  fieldContext: string
  readonly modelContext: string
  readonly dataSet: DataSet
  readonly targetId: string
  readonly sources: ModelCreateSources
  flow: ModelCreateFlow
  lifecycle: ModelCreateLifecycle
}

export type ModelCreateHostInput = Readonly<{
  dataSet: DataSet
  targetId: string
  sources: ModelCreateSources
  lifecycle: ModelCreateLifecycle
}>

export function createModelCreateHost(input: ModelCreateHostInput): ModelCreateHost {
  const {dataSet, targetId, sources, lifecycle} = input
  const models = dataSet.getView('Base_DataModel', 'default'), fields = dataSet.getView('Base_DataModel_Field', 'modelInputFields')
  if (!models || !fields) throw new Error('缺少正式模型或所属字段视图配置 modelInputFields')
  const host: ModelCreateHost = {
    models, fieldSource: fields, fields: undefined, fieldContext: '', modelContext: JSON.stringify(models.queryContext),
    dataSet, targetId, sources,
    flow: {status: 'idle', generation: 0, preview: null, staged: [], capture: null, captureSignatures: null,
      readbackSignatures: null, unresolved: false, verification: []},
    lifecycle,
  }
  assertOwner(host)
  return host
}

function hasUnconfirmedDispatch(host: ModelCreateHost): boolean {
  return host.flow.staged.length > 0 && modelCreateViews(host).some(view => view.hasUnconfirmedSave)
}

function flowStatus(host: ModelCreateHost): ModelCreateStatus {
  const {flow} = host
  if (flow.status === 'saving') return 'saving'
  if (flow.status === 'readback' || flow.status === 'different') return flow.status
  if (flow.status === 'unknown' || hasUnconfirmedDispatch(host)) return 'unknown'
  return flow.status
}

function assertOwner(host: ModelCreateHost): void {
  host.lifecycle.assertCurrent()
  if (host.dataSet.destroyed) throw new Error('元数据会话已释放')
  for (const [index, view] of [host.models, host.fieldSource].entries()) {
    const name = index === 0 ? 'Base_DataModel' : 'Base_DataModel_Field'
    if (view.destroyed || host.dataSet.getView(name, view.viewId) !== view || view.dataTable?.modelBinding?.modelName !== name
      || index === 0 && (view.queryContext['dataSpaceId'] !== host.targetId
        || JSON.stringify(view.queryContext) !== host.modelContext)) throw new Error('模型新增查询或目标已变化')
  }
  if (host.fields && (host.fields.destroyed || host.dataSet.getView(host.fields.tableName, host.fields.viewId) !== host.fields
    || JSON.stringify(host.fields.queryContext) !== host.fieldContext)) throw new Error('新增字段查询范围已变化')
}

function modelCreateViews(host: ModelCreateHost): DataView[] {return host.fields ? [host.models, host.fields] : [host.models]}

function releaseFields(host: ModelCreateHost): void {
  if (host.fields && (host.fields.hasUnconfirmedSave || host.fields.hasEditingChanges() || host.fields.dirtyTracking.hasPendingChanges())) {
    throw new Error('新增字段视图仍有原始捕获或本地修改，不能释放')
  }
  host.fields?.dataTable?.destroyView(host.fields.viewId)
  host.fields = undefined; host.fieldContext = ''
}

async function loadFields(host: ModelCreateHost, modelId: string): Promise<DataView> {
  const fields = host.fieldSource.createQueryView(`createModel:${modelId}`)
  host.fields = fields
  fields.queryContext = {...host.fieldSource.queryContext, dataSpaceId: host.targetId, modelId, modelIds: [modelId]}
  host.fieldContext = JSON.stringify(fields.queryContext)
  await fields.refresh()
  assertOwner(host)
  if (fields.requestState !== RequestState.Loaded || fields.loadingError) throw new Error('新增模型所属字段查询失败')
  if (fields.total !== 0 || fields.rows.length) throw new Error('新模型身份已存在所属字段，不能继续新增')
  return fields
}

function assertAvailable(host: ModelCreateHost): void {
  assertOwner(host)
  if (!['idle', 'previewing', 'ready'].includes(flowStatus(host))) throw new Error('请先核验上次新增，不能重复提交')
}

function assertClean(host: ModelCreateHost, allowOwned = false, forReadback = false): void {
  assertOwner(host)
  for (const view of modelCreateViews(host)) {
    const own = new Set(allowOwned ? host.flow.staged.filter(item => item.view === view).map(item => item.id) : [])
    if ((!forReadback && view.requestState !== RequestState.Loaded) || view.requestState === RequestState.Loading || view.mutating) throw new Error('模型或字段尚未完整读取或正在操作')
    if (view.hasEditingChanges() || view.dirtyTracking.dirtyRowIds.size || view.dirtyTracking.pendingDeleteIds.size
      || [...view.dirtyTracking.pendingCreateIds].some(id => !own.has(String(id)))) throw new Error('请先处理其他模型或字段草稿，不能覆盖')
    if (!allowOwned && !forReadback && view.total !== view.rows.length) throw new Error('模型或字段未完整读取')
    if (view.rows.some(row => row['dataSetId'] !== host.targetId || view.fieldAccess(row, 'dataSetId').read !== 'visible'
      && !host.flow.staged.some(item => item.view === view && item.id === view.getPkKey(row)))) throw new Error('模型或字段归属不可读或不属于目标空间')
    if (view === host.fields && view.rows.some(row => !Array.isArray(view.queryContext['modelIds']) || row['dataModelId'] !== view.queryContext['modelIds'][0]
      || view.fieldAccess(row, 'dataModelId').read !== 'visible'
      && !host.flow.staged.some(item => item.view === view && item.id === view.getPkKey(row)))) throw new Error('字段不属于当前新模型或归属不可读')
  }
}

function names(host: ModelCreateHost, ownedId?: string): Set<string> {
  const result = new Set<string>()
  for (const row of host.models.rows) {
    if (ownedId !== undefined && row['rowid'] === ownedId) continue
    if (host.models.fieldAccess(row, 'Name').read !== 'visible' || typeof row['Name'] !== 'string' || !row['Name'].trim()) throw new Error('无法完整核对现有模型注册名')
    result.add(row['Name'].trim())
  }
  return result
}

function validateName(host: ModelCreateHost, name: string, ownedId?: string): void {
  if (!name.trim() || name !== name.trim() || name.includes('@') || name.startsWith('#')) throw new Error('模型注册名不能为空、带首尾空白、包含 @ 或以 # 开头')
  if (names(host, ownedId).has(name)) throw new Error(`模型注册名“${name}”已存在，请修改`)
}

function uniqueName(host: ModelCreateHost, sourceName: string): string {
  const taken = names(host)
  let name = sourceName; let suffix = 1
  while (taken.has(name)) name = `${sourceName}（${suffix++}）`
  return name
}

export function modelCreateGetState(host: ModelCreateHost) {
  let nameError = ''
  if (host.flow.status === 'ready' && host.flow.preview) {
    try {validateName(host, host.flow.preview.name)} catch (error) {nameError = error instanceof Error ? error.message : String(error)}
  }
  const status = flowStatus(host)
  const batch = host.flow.capture
  return {status, pending: status !== 'idle', modelId: host.flow.staged.find(item => item.view === host.models)?.id ?? null,
    canAbandonNotApplied: status === 'different' && host.flow.capture?.resolution === 'not-applied',
    canDiscardLocalChanges: status === 'readback' && batch?.resolution === 'confirmed'
      && batch.targets.some(target => target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id))),
    preview: structuredClone(host.flow.preview), nameError, verification: structuredClone(host.flow.verification)}
}

export function modelCreateSetName(host: ModelCreateHost, name: string): void {
  assertAvailable(host); assertClean(host)
  if (host.flow.status !== 'ready' || !host.flow.preview) throw new Error('请先预览来源')
  if (typeof name !== 'string') throw new Error('模型注册名必须是文本')
  host.flow.preview = {...host.flow.preview, name}
}

export async function modelCreatePreview(host: ModelCreateHost, source: Source): Promise<void> {
  assertAvailable(host); assertClean(host)
  if (!host.sources) throw new Error('模型来源读取能力不可用')
  const generation = ++host.flow.generation
  host.flow.status = 'previewing'; host.flow.preview = null
  try {
    const prepared = await host.sources.prepare(source, host.dataSet)
    assertOwner(host)
    if (generation !== host.flow.generation) return
    assertClean(host)
    host.flow.preview = {name: uniqueName(host, prepared.source.name), prepared: structuredClone(prepared)}
    host.flow.status = 'ready'
  } catch (error) {if (generation === host.flow.generation) host.flow.status = 'idle'; throw error}
}

export function modelCreateDiscard(host: ModelCreateHost): void {
  assertAvailable(host); host.flow.generation++; host.flow.preview = null; host.flow.status = 'idle'
}

function rowMatches(row: DataRow, values: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(values).every(([key, value]) => Object.is(row[key], value))
}

async function stageRow(host: ModelCreateHost, view: DataView, values: Readonly<Record<string, unknown>>): Promise<string> {
  const before = new Set(view.dirtyTracking.pendingCreateIds)
  try {await view.addRow({...values})} finally {
    const added = view.dirtyTracking.pendingCreateRows.filter(row => !before.has(view.getPkKey(row) ?? ''))
    const row = added[0]; const id = row && view.getPkKey(row)
    if (added.length === 1 && row && typeof id === 'string' && row['rowid'] === id && rowMatches(row, values)) {
      host.flow.staged.push({view, id, values, snapshot: JSON.stringify(row)})
    } else if (added.length) host.flow.unresolved = true
  }
  assertOwner(host)
  const staged = host.flow.staged.at(-1)
  if (staged?.view !== view || staged.values !== values) throw new Error('新增行未获得唯一正式身份')
  return staged.id
}

function discardOwned(host: ModelCreateHost): void {
  assertClean(host, true, true)
  if (host.flow.unresolved) throw new Error('新增暂存身份不唯一，保留当前草稿待处理')
  for (const item of host.flow.staged) {
    if (item.view.dirtyTracking.isPendingCreate(item.id)) {
      const row = item.view.rows.find(current => item.view.getPkKey(current) === item.id)
      if (!row || JSON.stringify(row) !== item.snapshot) throw new Error('新增草稿被其他编辑改变，不能自动放弃')
    } else if (item.view.dirtyTracking.hasPendingChanges(item.id)) throw new Error('新增记录出现其他修改，不能覆盖')
  }
  for (const view of modelCreateViews(host)) view.discardPendingChanges(host.flow.staged.filter(item => item.view === view).map(item => item.id))
}

export async function modelCreateSave(host: ModelCreateHost): Promise<string> {
  assertAvailable(host); assertClean(host)
  const candidate = host.flow.preview
  if (!candidate || host.flow.status !== 'ready') throw new Error('请先预览来源')
  return modelCreateSaveDefinition(host, candidate.name, async () => {
    if (!host.sources) throw new Error('模型来源读取能力不可用')
    const prepared = await host.sources.prepare(candidate.prepared.source, host.dataSet)
    if (JSON.stringify(prepared) !== JSON.stringify(candidate.prepared)) throw new Error('来源已变化，请重新预览')
    return prepared
  })
}

export async function modelCreateCreateArray(host: ModelCreateHost, input: ArrayDefinition): Promise<string> {
  assertAvailable(host); assertClean(host)
  if (host.flow.preview || host.flow.status === 'previewing') throw new Error('请先取消当前来源预览')
  const prepared = LowcodeDataSpaceArrayDraft.prepare(input)
  return modelCreateSaveDefinition(host, input.name, () => Promise.resolve(prepared))
}

async function modelCreateSaveDefinition(host: ModelCreateHost, name: string,
  prepare: () => Promise<{model: Readonly<Record<string, unknown>>; fields: ReadonlyArray<Readonly<Record<string, unknown>>>}>): Promise<string> {
  validateName(host, name)
  host.flow.status = 'saving'; host.flow.staged = []; host.flow.captureSignatures = null
  host.flow.readbackSignatures = null; host.flow.unresolved = false
  try {
    const prepared = await prepare()
    assertClean(host)
    validateName(host, name)
    if (host.models.addActionState() !== 'enabled') throw new Error('当前查询不允许新增模型或字段')
    const modelId = await stageRow(host, host.models, {dataSetId: host.targetId, Name: name, ...prepared.model})
    const fields = await loadFields(host, modelId)
    if (prepared.fields.length && fields.addActionState() !== 'enabled') throw new Error('当前查询不允许新增模型或字段')
    for (const field of prepared.fields) {
      assertClean(host, true)
      await stageRow(host, fields, {dataSetId: host.targetId, dataModelId: modelId, ...field})
    }
    assertClean(host, true)
    validateName(host, name, modelId)
    if (host.models.addActionState() !== 'enabled' || prepared.fields.length && fields.addActionState() !== 'enabled'
      || host.flow.staged.some(item => !item.view.dirtyTracking.isPendingCreate(item.id)
        || JSON.stringify(item.view.rows.find(row => item.view.getPkKey(row) === item.id)) !== item.snapshot)) throw new Error('提交前新增权限或草稿已变化')
    const targets = () => modelCreateViews(host).map(view => ({tableName: view.tableName, viewId: view.viewId,
      ids: host.flow.staged.filter(item => item.view === view).map(item => item.id)})).filter(view => view.ids.length)
    const part = {
      dataSet: host.dataSet, targetId: host.targetId, modelId,
      prepare: () => Promise.resolve().then(() => {assertOwner(host); assertClean(host, true); assertStaged(host)}),
      apply: async () => {},
      check: () => {assertOwner(host); assertClean(host, true); assertStaged(host)},
      targets,
      dispatched: (capture: DataSpaceDefinitionCaptureBatch) => {
        host.flow.capture = capture
        host.flow.captureSignatures = capture.targets.map(target => ({view: target.view, ids: [...target.ids],
          signature: definitionTargetDraftSignature(target.view, target.ids)}))
        host.lifecycle.onDispatch()
      },
      confirm: async () => {
        assertOwner(host)
        if (!await modelCreateReadback(host)) {host.flow.status = 'different'; throw new Error('新增回读与预览不一致，请核验正式结果')}
      },
      settled: () => modelCreateFinish(host),
      failed: (stage: 'preparing' | 'applying' | 'dispatched' | 'confirmed') => {
        if (stage === 'dispatched' || stage === 'confirmed') {
          const confirmed = stage === 'confirmed' || host.flow.capture?.resolution === 'confirmed'
          host.flow.status = confirmed ? modelCreateReadbackFailureStatus(host) : 'unknown'
          return
        }
        host.flow.status = 'unsubmitted'
      },
    }
    await DataSpaceDefinitionSave.run([part])
    assertOwner(host)
    return modelId
  } catch (error) {
    const capture = host.flow.capture
    if (capture === null) {
      host.flow.status = 'unsubmitted'
      try {discardOwned(host); host.flow.staged = []; releaseFields(host); host.flow.status = 'ready'} catch { /* 保留不明归属或已改变的草稿。 */ }
    } else if (capture.resolution === 'confirmed') {
      host.flow.status = modelCreateReadbackFailureStatus(host)
    } else {
      host.flow.status = hasUnconfirmedDispatch(host) ? 'unknown' : 'readback'
    }
    throw error
  }
}

function assertStaged(host: ModelCreateHost): void {
  if (host.flow.unresolved || !host.flow.staged.length) throw new Error('新增身份未完整确认，不能派发')
  const expected = modelCreateViews(host).flatMap(view => host.flow.staged.filter(item => item.view === view).map(item => item.id))
  for (const item of host.flow.staged) {
    if (host.dataSet.getView(item.view.tableName, item.view.viewId) !== item.view || item.view.destroyed
      || item.view.hasUnconfirmedSave || item.view.mutating || item.view.requestState === RequestState.Loading
      || JSON.stringify(item.view.queryContext) !== (item.view === host.models ? host.modelContext : host.fieldContext)) {
      throw new Error('模型新增原视图或查询范围已变化，不能派发')
    }
    const row = item.view.rows.find(current => item.view.getPkKey(current) === item.id)
    if (!row || !item.view.dirtyTracking.isPendingCreate(item.id) || JSON.stringify(row) !== item.snapshot
      || !rowMatches(row, item.values) || item.view.addActionState() !== 'enabled') throw new Error('模型或字段新增草稿/权限已变化')
  }
  if (new Set(expected).size !== expected.length) throw new Error('模型新增身份重复，不能派发')
}

function modelCreateReadbackFailureStatus(host: ModelCreateHost): 'different' | 'readback' {
  return host.flow.verification.some(item => item.result !== '已一致') ? 'different' : 'readback'
}

async function modelCreateReadback(host: ModelCreateHost): Promise<boolean> {
  const batch = host.flow.capture
  if (batch?.resolution !== 'confirmed') throw new Error('新增原DataSet批次尚未取得完整正式回执')
  assertCaptureOwner(host, batch)
  if (host.flow.readbackSignatures?.some(item => definitionTargetDraftSignature(item.view, item.ids) !== item.signature)) {
    throw new Error('新增领域回读开始前原目标已有后续修改；保留修改，请重新处理')
  }
  host.flow.readbackSignatures ??= batch.targets.map(target => ({view: target.view, ids: [...target.ids],
    signature: definitionTargetDraftSignature(target.view, target.ids)}))
  const edited = new Set<DataView>(), listeners = new Map<DataView, (event: unknown) => void>()
  for (const view of new Set(batch.targets.map(target => target.view))) {
    const listener = () => edited.add(view)
    view.events.on('editingFieldChanged', listener); listeners.set(view, listener)
  }
  const assertReadbackUnchanged = () => {
    assertCaptureOwner(host, batch)
    const changed = host.flow.readbackSignatures?.some(item => edited.has(item.view)
      || definitionTargetDraftSignature(item.view, item.ids) !== item.signature)
    if (changed) throw new Error('新增领域回读期间出现后续修改；已保留修改，请重新核验')
  }
  try {
    assertClean(host, false, true)
  for (const view of modelCreateViews(host)) {
    if (view === host.fields) await view.refresh()
    else await view.loadFromServer({allPages: true, maxRows: 50000})
    assertReadbackUnchanged()
    if (view.requestState !== RequestState.Loaded || view.loadingError) throw new Error('新增模型或字段回读失败')
    assertClean(host, false, true)
  }
  assertReadbackUnchanged()
  assertClean(host)
  host.flow.verification = host.flow.staged.map(item => {
    const rows = item.view.rows.filter(row => item.view.getPkKey(row) === item.id)
    const row = rows[0]
    const result = !row ? '未读取到此记录' : rows.length !== 1 || row['rowid'] !== item.id ? '身份不唯一'
      : Object.keys(item.values).some(key => item.view.fieldAccess(row, key).read !== 'visible') ? '字段不可读，无法确认'
        : rowMatches(row, item.values) ? '已一致' : '字段值与预览不同'
    return {table: item.view.tableName, id: item.id, result}
  })
  return host.flow.verification.every(item => item.result === '已一致')
  } finally {listeners.forEach((listener, view) => view.events.off('editingFieldChanged', listener))}
}

function assertCaptureOwner(host: ModelCreateHost, batch: DataSpaceDefinitionCaptureBatch): void {
  assertOwner(host)
  for (const target of batch.targets) {
    if (host.dataSet.getView(target.tableName, target.viewId) !== target.view || target.view.destroyed
      || JSON.stringify(target.view.queryContext) !== target.queryContext) throw new Error('新增原保存目标视图或查询范围已变化；未知结果仍保留')
    if (target.view.mutating || target.view.requestState === RequestState.Loading) throw new Error('新增原保存目标仍在操作；未修改本地状态')
  }
}

function modelCreateFinish(host: ModelCreateHost): void {
  releaseFields(host); host.flow.status = 'idle'; host.flow.staged = []; host.flow.capture = null; host.flow.captureSignatures = null
  host.flow.readbackSignatures = null; host.flow.preview = null
  host.flow.verification = []; host.flow.unresolved = false
}

export async function modelCreateVerify(host: ModelCreateHost): Promise<Readonly<{confirmed: boolean; modelId: string | null}>> {
  assertOwner(host)
  const recovery = flowStatus(host)
  if (!['unknown', 'readback', 'unsubmitted', 'different'].includes(recovery)) throw new Error('没有可核验的新增或请求仍在进行')
  const batch = host.flow.capture
  if (!batch) {
    if (recovery !== 'unsubmitted') throw new Error('缺少模型新增原SPARK捕获；不能根据数据读回来认定或清理本次创建')
    discardOwned(host)
    host.flow.staged = []; releaseFields(host); host.flow.status = 'ready'; return {confirmed: false, modelId: null}
  }
  assertCaptureOwner(host, batch)
  const modelId = host.flow.staged.find(item => item.view === host.models)?.id ?? null
  if (!modelId) throw new Error('缺少原模型新增身份，未知结果仍保留')
  if (batch.resolution === 'not-applied' && host.flow.captureSignatures?.some(item => definitionTargetDraftSignature(item.view, item.ids) !== item.signature)) {
    throw new Error('原新增批次已确认未生效，但原目标草稿已变化；保留修改，不能放弃原意图')
  }
  const before = host.flow.captureSignatures
  if (batch.resolution !== 'confirmed' && batch.resolution !== 'not-applied' && batch.targets.some(target => target.view.hasUnconfirmedSave)
    && (!before || before.some(item => definitionTargetDraftSignature(item.view, item.ids) !== item.signature))) {
    throw new Error('原新增目标草稿在核验前已变化；保留修改，不能重新签发原批次')
  }
  host.flow.status = 'saving'
  try {
    if (batch.resolution !== 'confirmed' && batch.resolution !== 'not-applied') {
      const outcome = await verifyDataSpaceDefinitionCapture(host.dataSet, batch, false)
      assertCaptureOwner(host, batch)
      if (outcome === 'not-applied') {
        if (host.flow.captureSignatures?.some(item => definitionTargetDraftSignature(item.view, item.ids) !== item.signature)) {
          throw new Error('原新增核验期间目标草稿已变化；保留修改，不能放弃原意图')
        }
        host.flow.status = 'different'
        host.flow.verification = [{table: host.models.tableName, id: modelId, result: '原模型及字段批次已确认未生效；须明确放弃本次创建意图'}]
        return {confirmed: false, modelId: null}
      }
      if (outcome !== 'confirmed' && outcome !== 'already-confirmed') throw new Error('原模型新增批次尚未取得完整SPARK回执')
    }
    if (batch.resolution === 'not-applied') {
      host.flow.status = 'different'
      host.flow.verification = [{table: host.models.tableName, id: modelId, result: '原模型及字段批次已确认未生效；须明确放弃本次创建意图'}]
      return {confirmed: false, modelId: null}
    }
    const laterChanges = batch.targets.some(target => target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id)))
    if (laterChanges) {host.flow.status = 'readback'; throw new Error('原新增批次已确认，但目标仍有本地后续修改；保留修改后再核验')}
    const confirmed = await modelCreateReadback(host)
    if (confirmed) {modelCreateFinish(host); return {confirmed: true, modelId}}
    host.flow.status = 'different'
    return {confirmed: false, modelId}
  } catch (error) {
    if (host.flow.status !== 'different') host.flow.status = batch.resolution === 'confirmed' ? 'readback'
      : batch.targets.some(target => target.view.hasUnconfirmedSave) ? 'unknown' : 'readback'
    throw error
  }
}

export async function modelCreateAbandonNotApplied(host: ModelCreateHost): Promise<void> {
  const batch = host.flow.capture
  const signatures = host.flow.captureSignatures
  if (host.flow.status !== 'different' || batch?.resolution !== 'not-applied' || !signatures
    || signatures.some(item => definitionTargetDraftSignature(item.view, item.ids) !== item.signature)) {
    throw new Error('只有原模型新增批次确认未生效且原目标意图未变化时，才能放弃本次创建')
  }
  assertCaptureOwner(host, batch)
  if (batch.targets.some(target => target.view.hasUnconfirmedSave)) throw new Error('原模型新增批次仍有未决捕获；未放弃任何创建意图')
  await verifyAndDiscardDataSpaceDefinitionCapture(host.dataSet, batch, {discardLocalChanges: true, acceptCurrentOnInvalidReceipt: false})
  assertCaptureOwner(host, batch)
  for (const target of batch.targets) target.view.discardEditingRows([...target.ids])
  if (batch.targets.some(target => target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id)))) {
    throw new Error('放弃原模型新增意图后仍有目标修改；保留恢复状态')
  }
  modelCreateFinish(host)
}

export async function modelCreateDiscardLocalChanges(host: ModelCreateHost): Promise<string> {
  const batch = host.flow.capture
  const state = modelCreateGetState(host)
  const modelId = state.modelId ?? undefined
  if (!state.canDiscardLocalChanges || batch?.resolution !== 'confirmed' || !modelId) {
    throw new Error('只有数据库完整确认后原模型/字段目标存在后续本地修改时，才能明确放弃这些修改并继续核验')
  }
  // Preflight all captured views and identities before synchronously discarding any target.
  assertCaptureOwner(host, batch)
  if (batch.targets.some(target => target.view.hasUnconfirmedSave)) throw new Error('原模型新增批次仍有未决捕获；未放弃任何后续修改')
  for (const target of batch.targets) {
    for (const id of target.ids) {
      if (target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id)) continue
      // A target may already have been refreshed after the confirmed write; it remains an exact identity.
      if (!target.view.rows.some(row => target.view.getPkKey(row) === id)) throw new Error('原模型新增目标身份已变化；未放弃任何后续修改')
    }
  }
  for (const target of batch.targets) target.view.discardPendingChanges([...target.ids])
  batch.discarded = true
  host.flow.readbackSignatures = null
  host.flow.status = 'readback'
  const result = await modelCreateVerify(host)
  if (!result.confirmed || result.modelId !== modelId) throw new Error('本地后续修改已明确放弃，但模型与字段正式回读仍未完整确认')
  return modelId
}

export type ModelCreateHandle = {
  getState(): ReturnType<typeof modelCreateGetState>
  setName(name: string): void
  preview(source: Source): Promise<void>
  discard(): void
  save(): Promise<string>
  createArray(input: ArrayDefinition): Promise<string>
  verify(): Promise<Readonly<{confirmed: boolean; modelId: string | null}>>
  abandonNotApplied(): Promise<void>
  discardLocalChanges(): Promise<string>
}

export function createModelCreateHandle(host: ModelCreateHost): ModelCreateHandle {
  return {
    getState: () => modelCreateGetState(host),
    setName: name => modelCreateSetName(host, name),
    preview: source => modelCreatePreview(host, source),
    discard: () => modelCreateDiscard(host),
    save: () => modelCreateSave(host),
    createArray: input => modelCreateCreateArray(host, input),
    verify: () => modelCreateVerify(host),
    abandonNotApplied: () => modelCreateAbandonNotApplied(host),
    discardLocalChanges: () => modelCreateDiscardLocalChanges(host),
  }
}
