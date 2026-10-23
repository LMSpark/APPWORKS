/**
 * @module lowcode/data-space/model-source/lowcode-data-space-model-create-session
 * 职责：从正式来源创建模型及所属字段，经原元数据 DataSet 按范围提交和核验（无独立命令类 FSM）。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {PageDataSpaceModelSourceReader as SourceReader} from './lowcode-data-space-source-catalog'
import {LowcodeDataSpaceArrayDraft, type ArrayDefinition} from './array/lowcode-data-space-array-draft'

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
  unresolved: boolean
  verifiedSnapshot: string
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
    flow: {status: 'idle', generation: 0, preview: null, staged: [], unresolved: false, verifiedSnapshot: '', verification: []},
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
  return {status, pending: status !== 'idle', preview: structuredClone(host.flow.preview), nameError, verification: structuredClone(host.flow.verification)}
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
  host.flow.status = 'saving'; host.flow.staged = []; host.flow.unresolved = false
  let dispatched = false; let confirmed = false
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
    const views = modelCreateViews(host).map(view => ({tableName: view.tableName, viewId: view.viewId,
      ids: host.flow.staged.filter(item => item.view === view).map(item => item.id)})).filter(view => view.ids.length)
    host.lifecycle.onDispatch(); dispatched = true
    const saved = await host.dataSet.saveChanges({applyEditingRows: false, views})
    assertOwner(host)
    if (!saved.success || saved.data?.viewResults.length !== views.length || saved.data.failedEditingRows !== 0
      || views.some(view => {
        const results = saved.data?.viewResults.filter(result => result.tableName === view.tableName && result.viewId === view.viewId)
        const result = results?.[0]
        return results?.length !== 1 || result?.createdCount !== view.ids.length || result.savedCount !== 0 || result.deletedCount !== 0 || result.failedCount !== 0
      })) throw new Error('模型或字段新增回执不完整，请核验')
    confirmed = true
    if (!await modelCreateReadback(host)) throw new Error('新增回读与预览不一致，请核验正式结果')
    modelCreateFinish(host); return modelId
  } catch (error) {
    host.flow.status = confirmed ? 'readback' : dispatched ? (hasUnconfirmedDispatch(host) ? 'unsubmitted' : 'unknown') : 'unsubmitted'
    if (!dispatched) {
      try {discardOwned(host); host.flow.staged = []; releaseFields(host); host.flow.status = 'ready'} catch { /* 保留不明归属或已改变的草稿。 */ }
    }
    throw error
  }
}

function snapshot(host: ModelCreateHost): string {return JSON.stringify(modelCreateViews(host).map(view => view.rows))}

async function modelCreateReadback(host: ModelCreateHost): Promise<boolean> {
  assertClean(host, false, true)
  for (const view of modelCreateViews(host)) {
    if (view === host.fields) await view.refresh()
    else await view.loadFromServer({allPages: true, maxRows: 50000})
    assertOwner(host)
    if (view.requestState !== RequestState.Loaded || view.loadingError) throw new Error('新增模型或字段回读失败')
    assertClean(host, false, true)
  }
  assertClean(host)
  host.flow.verifiedSnapshot = snapshot(host)
  host.flow.verification = host.flow.staged.map(item => {
    const rows = item.view.rows.filter(row => item.view.getPkKey(row) === item.id)
    const row = rows[0]
    const result = !row ? '未读取到此记录' : rows.length !== 1 || row['rowid'] !== item.id ? '身份不唯一'
      : Object.keys(item.values).some(key => item.view.fieldAccess(row, key).read !== 'visible') ? '字段不可读，无法确认'
        : rowMatches(row, item.values) ? '已一致' : '字段值与预览不同'
    return {table: item.view.tableName, id: item.id, result}
  })
  return host.flow.verification.every(item => item.result === '已一致')
}

function modelCreateFinish(host: ModelCreateHost): void {
  releaseFields(host); host.flow.status = 'idle'; host.flow.staged = []; host.flow.preview = null
  host.flow.verifiedSnapshot = ''; host.flow.verification = []; host.flow.unresolved = false
}

export async function modelCreateVerify(host: ModelCreateHost): Promise<Readonly<{confirmed: boolean; modelId: string | null}>> {
  assertOwner(host)
  const recovery = flowStatus(host)
  if (!['unknown', 'readback', 'unsubmitted', 'different'].includes(recovery)) throw new Error('没有可核验的新增或请求仍在进行')
  host.dataSet.abandonUnconfirmedSaves()
  const unsubmitted = recovery === 'unsubmitted'
  discardOwned(host)
  host.flow.status = 'saving'
  try {
    if (unsubmitted) {host.flow.staged = []; releaseFields(host); host.flow.status = 'ready'; return {confirmed: false, modelId: null}}
    const modelId = host.flow.staged.find(item => item.view === host.models)?.id ?? null
    const confirmed = await modelCreateReadback(host)
    if (confirmed) modelCreateFinish(host); else host.flow.status = 'different'
    return {confirmed, modelId: confirmed ? modelId : null}
  } catch (error) {host.flow.status = 'readback'; throw error}
}

export function modelCreateAcceptCurrent(host: ModelCreateHost): void {
  if (host.flow.status !== 'different' || host.flow.verifiedSnapshot !== snapshot(host)) throw new Error('请先核验当前正式结果')
  assertClean(host)
  modelCreateFinish(host)
}

export type ModelCreateHandle = {
  getState(): ReturnType<typeof modelCreateGetState>
  setName(name: string): void
  preview(source: Source): Promise<void>
  discard(): void
  save(): Promise<string>
  createArray(input: ArrayDefinition): Promise<string>
  verify(): Promise<Readonly<{confirmed: boolean; modelId: string | null}>>
  acceptCurrent(): void
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
    acceptCurrent: () => modelCreateAcceptCurrent(host),
  }
}
