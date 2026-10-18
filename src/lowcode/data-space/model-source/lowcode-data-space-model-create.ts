/**
 * @module app:lowcode/data-space/model-source/lowcode-data-space-model-create
 * 职责：从正式来源创建模型及所属字段，经原元数据DataSet按范围提交和核验。
 * 边界：只持有操作候选与回执状态，数据和新增权限归原DataSet；不保存场景文件。
 * AI用途：原生设计页新增模型入口，未知或部分结果只读核验，不自动重放。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {PageDataSpaceModelSourceReader as SourceReader} from './lowcode-data-space-source-catalog'
import {LowcodeDataSpaceArrayDraft, type ArrayDefinition} from './array/lowcode-data-space-array-draft'

/** 正式来源候选的身份及展示信息。 */
type Source = Parameters<SourceReader['prepare']>[0]
/** 来源精确重读得到的模型与字段创建配置。 */
type Prepared = Awaited<ReturnType<SourceReader['prepare']>>
/** 使用者预览的创建候选，保存前与当前来源再次比较。 */
type Candidate = {
  /** 待创建的注册名草稿；无效输入保留，提交前须通过校验。 */
  name: string
  /** 当次正式来源及所属字段配置。 */
  prepared: Prepared
}
type Staged = {view: DataView; id: string; values: Readonly<Record<string, unknown>>; snapshot: string}

/** 一个目标空间内的模型新增流程，与正式查询的身份和生命周期绑定。 */
export class LowcodeDataSpaceModelCreate {
  readonly #models: DataView
  readonly #fieldSource: DataView
  #fields: DataView | undefined
  #fieldContext = ''
  readonly #modelContext: string
  #status: 'idle' | 'previewing' | 'ready' | 'saving' | 'unsubmitted' | 'unknown' | 'readback' | 'different' = 'idle'
  #generation = 0
  #preview: Candidate | null = null
  #staged: Staged[] = []
  #unresolved = false
  #verifiedSnapshot = ''
  #verification: Array<{table: string; id: string; result: string}> = []

  /** 捕获模型目录及C的字段查询模板；模板当前查询值属于其他工作区，不是新增命令身份，字段无需预载。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string, private readonly sources: SourceReader | undefined,
    private readonly lifecycle: Readonly<{assertCurrent(): void; onDispatch(): void}>) {
    const models = dataSet.getView('Base_DataModel', 'default'), fields = dataSet.getView('Base_DataModel_Field', 'modelInputFields')
    if (!models || !fields) throw new Error('缺少正式模型或所属字段视图配置 modelInputFields')
    this.#models = models; this.#fieldSource = fields
    this.#modelContext = JSON.stringify(models.queryContext)
    this.assertOwner()
  }

  private assertOwner(): void {
    this.lifecycle.assertCurrent()
    if (this.dataSet.destroyed) throw new Error('元数据会话已释放')
    for (const [index, view] of [this.#models, this.#fieldSource].entries()) {
      const name = index === 0 ? 'Base_DataModel' : 'Base_DataModel_Field'
      if (view.destroyed || this.dataSet.getView(name, view.viewId) !== view || view.dataTable?.modelBinding?.modelName !== name
        || index === 0 && (view.queryContext['dataSpaceId'] !== this.targetId
          || JSON.stringify(view.queryContext) !== this.#modelContext)) throw new Error('模型新增查询或目标已变化')
    }
    if (this.#fields && (this.#fields.destroyed || this.dataSet.getView(this.#fields.tableName, this.#fields.viewId) !== this.#fields
      || JSON.stringify(this.#fields.queryContext) !== this.#fieldContext)) throw new Error('新增字段查询范围已变化')
  }

  private views(): DataView[] {return this.#fields ? [this.#models, this.#fields] : [this.#models]}

  private releaseFields(): void {
    this.#fields?.dataTable?.destroyView(this.#fields.viewId)
    this.#fields = undefined; this.#fieldContext = ''
  }

  private async loadFields(modelId: string): Promise<DataView> {
    const fields = this.#fieldSource.createQueryView(`createModel:${modelId}`)
    this.#fields = fields
    fields.queryContext = {...this.#fieldSource.queryContext, dataSpaceId: this.targetId, modelId, modelIds: [modelId]}
    this.#fieldContext = JSON.stringify(fields.queryContext)
    await fields.refresh()
    this.assertOwner()
    if (fields.requestState !== RequestState.Loaded || fields.loadingError) throw new Error('新增模型所属字段查询失败')
    if (fields.total !== 0 || fields.rows.length) throw new Error('新模型身份已存在所属字段，不能继续新增')
    return fields
  }

  private assertAvailable(): void {
    this.assertOwner()
    if (!['idle', 'previewing', 'ready'].includes(this.#status)) throw new Error('请先核验上次新增，不能重复提交')
  }

  private assertClean(allowOwned = false, forReadback = false): void {
    this.assertOwner()
    for (const view of this.views()) {
      const own = new Set(allowOwned ? this.#staged.filter(item => item.view === view).map(item => item.id) : [])
      if ((!forReadback && view.requestState !== RequestState.Loaded) || view.requestState === RequestState.Loading || view.mutating) throw new Error('模型或字段尚未完整读取或正在操作')
      if (view.hasEditingChanges() || view.dirtyTracking.dirtyRowIds.size || view.dirtyTracking.pendingDeleteIds.size
        || [...view.dirtyTracking.pendingCreateIds].some(id => !own.has(String(id)))) throw new Error('请先处理其他模型或字段草稿，不能覆盖')
      if (!allowOwned && !forReadback && view.total !== view.rows.length) throw new Error('模型或字段未完整读取')
      if (view.rows.some(row => row['dataSetId'] !== this.targetId || view.fieldAccess(row, 'dataSetId').read !== 'visible'
        && !this.#staged.some(item => item.view === view && item.id === view.getPkKey(row)))) throw new Error('模型或字段归属不可读或不属于目标空间')
      if (view === this.#fields && view.rows.some(row => !Array.isArray(view.queryContext['modelIds']) || row['dataModelId'] !== view.queryContext['modelIds'][0]
        || view.fieldAccess(row, 'dataModelId').read !== 'visible'
        && !this.#staged.some(item => item.view === view && item.id === view.getPkKey(row)))) throw new Error('字段不属于当前新模型或归属不可读')
    }
  }

  private names(ownedId?: string): Set<string> {
    const names = new Set<string>()
    for (const row of this.#models.rows) {
      if (ownedId !== undefined && row['rowid'] === ownedId) continue
      if (this.#models.fieldAccess(row, 'Name').read !== 'visible' || typeof row['Name'] !== 'string' || !row['Name'].trim()) throw new Error('无法完整核对现有模型注册名')
      names.add(row['Name'].trim())
    }
    return names
  }

  private validateName(name: string, ownedId?: string): void {
    if (!name.trim() || name !== name.trim() || name.includes('@') || name.startsWith('#')) throw new Error('模型注册名不能为空、带首尾空白、包含 @ 或以 # 开头')
    if (this.names(ownedId).has(name)) throw new Error(`模型注册名“${name}”已存在，请修改`)
  }

  private name(sourceName: string): string {
    const names = this.names()
    let name = sourceName; let suffix = 1
    while (names.has(name)) name = `${sourceName}（${suffix++}）`
    return name
  }

  /** 只提供来源候选与操作状态，不返回原查询凭据或独立模型草稿。 */
  getState() {
    let nameError = ''
    if (this.#status === 'ready' && this.#preview) {
      try {this.validateName(this.#preview.name)} catch (error) {nameError = error instanceof Error ? error.message : String(error)}
    }
    return {status: this.#status, pending: this.#status !== 'idle', preview: structuredClone(this.#preview), nameError, verification: structuredClone(this.#verification)}
  }

  /** 修改首次提交前的注册名草稿；无效名称保留供修复，来源身份保持不变。 */
  setName(name: string): void {
    this.assertAvailable(); this.assertClean()
    if (this.#status !== 'ready' || !this.#preview) throw new Error('请先预览来源')
    if (typeof name !== 'string') throw new Error('模型注册名必须是文本')
    this.#preview = {...this.#preview, name}
  }

  /** 从当次候选精确读取来源及字段，预览唯一注册名；尚不修改元数据。 */
  async preview(source: Source): Promise<void> {
    this.assertAvailable(); this.assertClean()
    if (!this.sources) throw new Error('模型来源读取能力不可用')
    const generation = ++this.#generation
    this.#status = 'previewing'; this.#preview = null
    try {
      const prepared = await this.sources.prepare(source, this.dataSet)
      this.assertOwner()
      if (generation !== this.#generation) return
      this.assertClean()
      this.#preview = {name: this.name(prepared.source.name), prepared: structuredClone(prepared)}
      this.#status = 'ready'
    } catch (error) {if (generation === this.#generation) this.#status = 'idle'; throw error}
  }

  /** 取消未派发的选择与预览；已派发或未决新增须走核验。 */
  discard(): void {
    this.assertAvailable(); this.#generation++; this.#preview = null; this.#status = 'idle'
  }

  private matches(row: DataRow, values: Readonly<Record<string, unknown>>): boolean {
    return Object.entries(values).every(([key, value]) => Object.is(row[key], value))
  }

  private async stage(view: DataView, values: Readonly<Record<string, unknown>>): Promise<string> {
    const before = new Set(view.dirtyTracking.pendingCreateIds)
    try {await view.addRow({...values})} finally {
      const added = view.dirtyTracking.pendingCreateRows.filter(row => !before.has(view.getPkKey(row) ?? ''))
      const row = added[0]; const id = row && view.getPkKey(row)
      if (added.length === 1 && row && typeof id === 'string' && row['rowid'] === id && this.matches(row, values)) {
        this.#staged.push({view, id, values, snapshot: JSON.stringify(row)})
      } else if (added.length) this.#unresolved = true
    }
    this.assertOwner()
    const staged = this.#staged.at(-1)
    if (staged?.view !== view || staged.values !== values) throw new Error('新增行未获得唯一正式身份')
    return staged.id
  }

  private discardOwned(): void {
    this.assertClean(true, true)
    if (this.#unresolved) throw new Error('新增暂存身份不唯一，保留当前草稿待处理')
    for (const item of this.#staged) {
      if (item.view.dirtyTracking.isPendingCreate(item.id)) {
        const row = item.view.rows.find(current => item.view.getPkKey(current) === item.id)
        if (!row || JSON.stringify(row) !== item.snapshot) throw new Error('新增草稿被其他编辑改变，不能自动放弃')
      } else if (item.view.dirtyTracking.hasPendingChanges(item.id)) throw new Error('新增记录出现其他修改，不能覆盖')
    }
    for (const view of this.views()) view.discardPendingChanges(this.#staged.filter(item => item.view === view).map(item => item.id))
  }

  /** 重新核来源后，以原查询新增权限提交模型和字段，逐视图回执及精确回读确认。 */
  async save(): Promise<string> {
    this.assertAvailable(); this.assertClean()
    const candidate = this.#preview
    if (!candidate || this.#status !== 'ready') throw new Error('请先预览来源')
    return this.saveDefinition(candidate.name, async () => {
      if (!this.sources) throw new Error('模型来源读取能力不可用')
      const prepared = await this.sources.prepare(candidate.prepared.source, this.dataSet)
      if (JSON.stringify(prepared) !== JSON.stringify(candidate.prepared)) throw new Error('来源已变化，请重新预览')
      return prepared
    })
  }

  /** 创建显式本地数组定义；复用正式模型/字段新增批次，不伪造外部来源。 */
  async createArray(input: ArrayDefinition): Promise<string> {
    this.assertAvailable(); this.assertClean()
    if (this.#preview || this.#status === 'previewing') throw new Error('请先取消当前来源预览')
    const prepared = LowcodeDataSpaceArrayDraft.prepare(input)
    return this.saveDefinition(input.name, () => Promise.resolve(prepared))
  }

  private async saveDefinition(name: string, prepare: () => Promise<{model: Readonly<Record<string, unknown>>; fields: ReadonlyArray<Readonly<Record<string, unknown>>>}>): Promise<string> {
    this.validateName(name)
    this.#status = 'saving'; this.#staged = []; this.#unresolved = false
    let dispatched = false; let confirmed = false
    try {
      const prepared = await prepare()
      this.assertClean()
      this.validateName(name)
      if (this.#models.addActionState() !== 'enabled') throw new Error('当前查询不允许新增模型或字段')
      const modelId = await this.stage(this.#models, {dataSetId: this.targetId, Name: name, ...prepared.model})
      const fields = await this.loadFields(modelId)
      if (prepared.fields.length && fields.addActionState() !== 'enabled') throw new Error('当前查询不允许新增模型或字段')
      for (const field of prepared.fields) {
        this.assertClean(true)
        await this.stage(fields, {dataSetId: this.targetId, dataModelId: modelId, ...field})
      }
      this.assertClean(true)
      this.validateName(name, modelId)
      if (this.#models.addActionState() !== 'enabled' || prepared.fields.length && fields.addActionState() !== 'enabled'
        || this.#staged.some(item => !item.view.dirtyTracking.isPendingCreate(item.id)
          || JSON.stringify(item.view.rows.find(row => item.view.getPkKey(row) === item.id)) !== item.snapshot)) throw new Error('提交前新增权限或草稿已变化')
      const views = this.views().map(view => ({tableName: view.tableName, viewId: view.viewId,
        ids: this.#staged.filter(item => item.view === view).map(item => item.id)})).filter(view => view.ids.length)
      this.lifecycle.onDispatch(); dispatched = true
      const saved = await this.dataSet.saveChanges({applyEditingRows: false, views})
      this.assertOwner()
      if (!saved.success || saved.data?.viewResults.length !== views.length || saved.data.failedEditingRows !== 0
        || views.some(view => {
          const results = saved.data?.viewResults.filter(result => result.tableName === view.tableName && result.viewId === view.viewId)
          const result = results?.[0]
          return results?.length !== 1 || result?.createdCount !== view.ids.length || result.savedCount !== 0 || result.deletedCount !== 0 || result.failedCount !== 0
        })) throw new Error('模型或字段新增回执不完整，请核验')
      confirmed = true
      if (!await this.readback()) throw new Error('新增回读与预览不一致，请核验正式结果')
      this.finish(); return modelId
    } catch (error) {
      this.#status = confirmed ? 'readback' : dispatched ? 'unknown' : 'unsubmitted'
      if (!dispatched) {
        try {this.discardOwned(); this.#staged = []; this.releaseFields(); this.#status = 'ready'} catch { /* 保留不明归属或已改变的草稿。 */ }
      }
      throw error
    }
  }

  private snapshot(): string {return JSON.stringify(this.views().map(view => view.rows))}

  private async readback(): Promise<boolean> {
    this.assertClean(false, true)
    for (const view of this.views()) {
      if (view === this.#fields) await view.refresh()
      else await view.loadFromServer({allPages: true, maxRows: 50000})
      this.assertOwner()
      if (view.requestState !== RequestState.Loaded || view.loadingError) throw new Error('新增模型或字段回读失败')
      this.assertClean(false, true)
    }
    this.assertClean()
    this.#verifiedSnapshot = this.snapshot()
    this.#verification = this.#staged.map(item => {
      const rows = item.view.rows.filter(row => item.view.getPkKey(row) === item.id)
      const row = rows[0]
      const result = !row ? '未读取到此记录' : rows.length !== 1 || row['rowid'] !== item.id ? '身份不唯一'
        : Object.keys(item.values).some(key => item.view.fieldAccess(row, key).read !== 'visible') ? '字段不可读，无法确认'
          : this.matches(row, item.values) ? '已一致' : '字段值与预览不同'
      return {table: item.view.tableName, id: item.id, result}
    })
    return this.#verification.every(item => item.result === '已一致')
  }

  private finish(): void {
    this.releaseFields(); this.#status = 'idle'; this.#staged = []; this.#preview = null
    this.#verifiedSnapshot = ''; this.#verification = []; this.#unresolved = false
  }

  /** 显式放弃本操作待提交副本并精确回读；差异保留待确认，不再发送新增。 */
  async verify(): Promise<Readonly<{confirmed: boolean; modelId: string | null}>> {
    this.assertOwner()
    if (!['unknown', 'readback', 'unsubmitted', 'different'].includes(this.#status)) throw new Error('没有可核验的新增或请求仍在进行')
    const unsubmitted = this.#status === 'unsubmitted'
    this.discardOwned()
    this.#status = 'saving'
    try {
      if (unsubmitted) {this.#staged = []; this.releaseFields(); this.#status = 'ready'; return {confirmed: false, modelId: null}}
      const modelId = this.#staged.find(item => item.view === this.#models)?.id ?? null
      const confirmed = await this.readback()
      if (confirmed) this.finish(); else this.#status = 'different'
      return {confirmed, modelId: confirmed ? modelId : null}
    } catch (error) {this.#status = 'readback'; throw error}
  }

  /** 明确采用刚核验的正式状态；部分成功不宣称原新增完整成功，不补写或删除数据。 */
  acceptCurrent(): void {
    if (this.#status !== 'different' || this.#verifiedSnapshot !== this.snapshot()) throw new Error('请先核验当前正式结果')
    this.assertClean()
    this.finish()
  }
}
