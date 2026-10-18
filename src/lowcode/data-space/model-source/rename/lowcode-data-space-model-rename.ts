/**
 * @module app:lowcode/data-space/model-source/rename/lowcode-data-space-model-rename
 * 职责：预览并提交模型注册名及本空间结构化引用，接续原场景配置保存。
 * 边界：原DataView承担权限与批量保存；未知回执只回读，不重放数据库写入。
 * AI用途：模型节点的改名输入、预览、提交、取消和恢复流程。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceModelRenameReferences, type ModelNameChange} from './lowcode-data-space-model-rename-references'
import {LowcodeDataSpaceModelDependencies} from '../lowcode-data-space-model-dependencies'

/** 原场景文件owner提供的绑定变更计划，不提供第二条文件写入通道。 */
export type ModelRenameFilePlan = Readonly<{
  /** 被变更的内部表键，仅用于预览。 */
  tables: string[]
  /** 当前蓝图读取到的工具清单及准确静态引用。 */
  tools: string[]
  /** 原工具文件中的完整绑定变更。 */
  references: ModelNameChange[]
  /** 派发数据库写入前重核文件基线。 */
  assertCurrent(): Promise<void>
  /** 正式数据库结果一致后保存或核验同一配置。 */
  complete(reconcile: boolean): Promise<void>
}>

/** 一个正式模型的注册名操作；输入和预览均由同一元数据DataSet提供视图。 */
export class LowcodeDataSpaceModelRename {
  /** 标准字段绑定的局部输入视图；不持久化为正式元数据。 */
  readonly input: DataView
  /** 标准列表绑定的只读变更投影。 */
  readonly changesView: DataView
  readonly #views: DataView[]
  readonly #dependencies: LowcodeDataSpaceModelDependencies
  #status: 'idle' | 'previewing' | 'ready' | 'saving' | 'unknown' | 'readback' | 'different' | 'configuration' = 'idle'
  #changes: ModelNameChange[] = []
  #baseline = ''
  #name = ''
  #file: ModelRenameFilePlan | null = null
  #pendingRows = new Map<string, string>()
  #verification: Array<{table: string; id: string; property: string; result: string}> = []
  #verified = ''

  /** 捕获正式视图和作用域；文件及生命周期归原设计会话。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string, private readonly modelId: string,
    private readonly lifecycle: Readonly<{assertCurrent(): void; onDispatch(): void; completed(): void;
      prepareFile(oldName: string, nextName: string): Promise<ModelRenameFilePlan>}>) {
    this.#dependencies = new LowcodeDataSpaceModelDependencies(dataSet, targetId, modelId, 'rename', () => lifecycle.assertCurrent())
    this.#views = this.#dependencies.views
    const prefix = `ModelRename_${crypto.randomUUID().replaceAll('-', '')}`
    const local = (name: string, columns: string[]) => {
      const table = dataSet.addTable(name, columns.map(column => ({name: column, type: 'string', isPrimaryKey: column === 'id'})))
      table.resourceType = 'static-data'; return table.getOrCreateView('default')
    }
    this.input = local(`${prefix}_input`, ['id', 'name'])
    this.input.commitMode = 'staged'
    this.changesView = local(`${prefix}_changes`, ['id', 'table', 'record', 'property', 'before', 'after'])
    this.changesView.selectionDelimiter = ''
    this.input.replaceRows([{id: 'rename', name: this.formalName()}]); this.input.setCurrentRowById('rename')
  }

  private assertOwner(): void {
    this.#dependencies.assertOwner()
    if (this.input.destroyed || this.changesView.destroyed) throw new Error('改名输入或预览已释放')
  }

  private assertClean(owned = false, readback = false): void {
    this.assertOwner()
    this.#dependencies.assertSiblingsClean()
    if (!readback) this.#dependencies.assertFieldScope()
    for (const view of this.#views) {
      if (view.mutating || view.requestState === RequestState.Loading || !readback && (view.requestState !== RequestState.Loaded || view.total !== view.rows.length)) throw new Error('改名所需数据未完整读取或仍在操作')
      const ids = new Set(owned ? this.#changes.filter(change => change.table === view.tableName).map(change => change.id) : [])
      if (view.dirtyTracking.pendingCreateIds.size || view.dirtyTracking.pendingDeleteIds.size
        || [...view.dirtyTracking.dirtyRowIds].some(id => !ids.has(String(id)))
        || view.rows.some(row => view.hasEditingChanges(view.getPkKey(row)) && !ids.has(String(view.getPkKey(row))))) throw new Error('请先处理其他定义草稿，不能覆盖')
      const found = new Set<string>()
      for (const row of view.rows) {
        const id = row['rowid']
        if (typeof id !== 'string' || !id || found.has(id) || view.getPkKey(row) !== id
          || row['dataSetId'] !== this.targetId || ['rowid', 'dataSetId'].some(key => view.fieldAccess(row, key).read !== 'visible')) throw new Error('正式记录身份或空间归属不可核验')
        found.add(id)
      }
    }
  }

  private snapshot(): string {return JSON.stringify(this.#views.map(view => view.rows))}
  private formalName(): string {
    const view = this.#views[0], row = view?.rows.find(item => item['rowid'] === this.modelId)
    return view && row && view.fieldAccess(row, 'Name').read === 'visible' && typeof row['Name'] === 'string' ? row['Name'] : ''
  }
  private inputName(): string {const value = this.input.getEditingRow('rename')?.['name'] ?? this.input.rows[0]?.['name']; return typeof value === 'string' ? value : ''}

  /** 显示操作状态及可读变更，数据权限仍由正式视图核定。 */
  getState() {return {status: this.#status, pending: this.#status !== 'idle' || this.inputName() !== this.input.rows[0]?.['name'],
    changes: this.#changes, tables: this.#file?.tables ?? [], tools: this.#file?.tools ?? [], verification: this.#verification}}

  /** 在没有正式写入的情况下，检查新名称、权限、引用和场景文件基线。 */
  async preview(): Promise<void> {
    if (!['idle', 'ready'].includes(this.#status)) throw new Error('请先核验上次改名')
    this.assertClean(false, true); this.#status = 'previewing'; this.#changes = []; this.#file = null; this.changesView.replaceRows([])
    try {
      await this.#dependencies.load()
      const name = this.inputName()
      this.assertClean()
      const baseline = this.snapshot()
      const changes = LowcodeDataSpaceModelRenameReferences.prepare(this.#views, this.modelId, name)
      const oldName = changes.find(change => change.table === 'Base_DataModel' && change.id === this.modelId && change.property === 'Name')?.before
      if (!oldName) throw new Error('注册名变更缺失')
      const file = await this.lifecycle.prepareFile(oldName, name)
      this.assertClean()
      if (this.snapshot() !== baseline || this.inputName() !== name) throw new Error('预览期间定义或输入已改变')
      this.#name = name; this.#baseline = baseline; this.#changes = changes; this.#file = file; this.#status = 'ready'
      this.changesView.replaceRows([...changes, ...file.references].map((change, index) => ({...change, id: String(index), record: change.id})))
    } catch (error) {this.#status = 'idle'; throw error}
  }

  private rows(): Array<{view: DataView; id: string; row: DataRow; patch: Record<string, string>}> {
    return this.#views.flatMap(view => [...new Set(this.#changes.filter(change => change.table === view.tableName).map(change => change.id))].map(id => {
      const row = view.rows.find(value => value['rowid'] === id)
      if (!row) throw new Error('改名记录已消失')
      return {view, id, row, patch: Object.fromEntries(this.#changes.filter(change => change.table === view.tableName && change.id === id).map(change => [change.property, change.after]))}
    }))
  }

  private discardOwned(): void {
    this.assertClean(true, true)
    const rows = this.rows()
    for (const item of rows) {
      const patch = item.view.getEditingPatch(item.id)
      if (patch && Object.entries(patch).some(([key, value]) => item.patch[key] !== value)) throw new Error('改名草稿已被其他编辑改变，不能覆盖')
      if (item.view.dirtyTracking.hasPendingChanges(item.id)
        && JSON.stringify(item.row) !== this.#pendingRows.get(`${item.view.tableName}:${item.id}`)) throw new Error('待提交记录已被其他编辑改变，不能覆盖')
    }
    for (const {view, id} of rows) view.discardPendingChanges([id])
    this.#pendingRows.clear()
  }

  /** 只提交预览列出的原记录；数据库与场景文件分别确认，不假设跨来源事务。 */
  async save(): Promise<void> {
    if (this.#status !== 'ready' || !this.#file) throw new Error('请先预览改名')
    this.assertClean()
    this.#status = 'saving'; let dispatched = false; let confirmed = false
    try {
      await this.#file.assertCurrent(); this.assertClean()
      if (this.#baseline !== this.snapshot() || this.#name !== this.inputName()) throw new Error('定义或名称已变化，请重新预览')
      await this.#dependencies.load(true); this.assertClean()
      if (this.#baseline !== this.snapshot() || this.#name !== this.inputName()) throw new Error('正式定义或名称已变化，请重新预览')
      const changes = LowcodeDataSpaceModelRenameReferences.prepare(this.#views, this.modelId, this.#name)
      if (JSON.stringify(changes) !== JSON.stringify(this.#changes)) throw new Error('改名引用已变化，请重新预览')
      const rows = this.rows()
      const expected = JSON.stringify(this.#views.map(view => view.rows.map(row => ({...row,
        ...Object.fromEntries(this.#changes.filter(change => change.table === view.tableName && change.id === row['rowid']).map(change => [change.property, change.after]))}))))
      for (const {view, id, patch} of rows) for (const [key, value] of Object.entries(patch)) view.updateEditingValue(id, key, value)
      for (const {view, id} of rows) {
        const result = await view.applyEditingRows([id]); this.assertOwner()
        this.#pendingRows.set(`${view.tableName}:${id}`, JSON.stringify(view.rows.find(row => row['rowid'] === id)))
        if (!result.success || result.data?.appliedCount !== 1 || result.data.failedCount !== 0) throw new Error('改名草稿未完整应用')
      }
      this.assertClean(true); await this.#file.assertCurrent(); this.assertClean(true)
      if (this.snapshot() !== expected) throw new Error('应用期间元数据被其他编辑改变，请重新核验')
      for (const {view, id, patch} of this.rows()) {
        const row = view.rows.find(value => value['rowid'] === id)
        if (!row || view.hasEditingChanges() || Object.entries(patch).some(([key, value]) => row[key] !== value || view.fieldAccess(row, key).write !== 'allowed'
          || view.fieldAccess(row, key).read !== 'visible') || view.editActionState(row) !== 'enabled') throw new Error('提交前改名草稿或数据权限已变化')
      }
      const views = this.#views.map(view => ({tableName: view.tableName, viewId: view.viewId, ids: rows.filter(item => item.view === view).map(item => item.id)})).filter(view => view.ids.length)
      this.lifecycle.onDispatch(); dispatched = true
      const saved = await this.dataSet.saveChanges({applyEditingRows: false, views})
      this.assertOwner()
      if (!saved.success || saved.data?.viewResults.length !== views.length || saved.data.failedEditingRows !== 0 || views.some(view => {
        const matches = saved.data?.viewResults.filter(result => result.tableName === view.tableName && result.viewId === view.viewId), result = matches?.[0]
        return matches?.length !== 1 || result?.savedCount !== view.ids.length || result.failedCount !== 0 || result.createdCount !== 0 || result.deletedCount !== 0
      })) throw new Error('改名回执未完整确认，请核验；不会重复提交')
      confirmed = true; this.#pendingRows.clear()
      if (!await this.readback()) throw new Error('改名回读与预览不一致')
      this.#status = 'configuration'; await this.#file.complete(false); this.finish()
    } catch (error) {
      if (dispatched) {if (this.#status !== 'configuration') this.#status = confirmed ? 'readback' : 'unknown'}
      else {this.#status = 'readback'; try {this.discardOwned(); this.#status = 'ready'} catch { /* 保留外来草稿供人工处理。 */ }}
      throw error
    }
  }

  private async readback(): Promise<boolean> {
    this.assertClean(false, true); this.#verification = []
    await this.#dependencies.load(true)
    this.assertClean()
    this.#verification = this.#changes.map(change => {
      const view = this.#views.find(item => item.tableName === change.table), row = view?.rows.find(item => item['rowid'] === change.id)
      return {table: change.table, id: change.id, property: change.property, result: view && row && view.fieldAccess(row, change.property).read === 'visible'
        && row[change.property] === change.after ? '回读一致' : '未读取到预期值'}
    })
    const before = this.#changes.find(change => change.table === 'Base_DataModel' && change.id === this.modelId && change.property === 'Name')?.before
    if (!before) throw new Error('原注册名预览已丢失')
    const remaining = LowcodeDataSpaceModelRenameReferences.prepare(this.#views, this.modelId, this.#name, before)
    this.#verification.push(...remaining.map(change => ({table: change.table, id: change.id, property: change.property, result: '当前仍有旧注册名或引用；未自动补写'})))
    this.#verified = this.snapshot()
    if (this.#verification.every(item => item.result === '回读一致')) {
      this.#dependencies.invalidate(this.#changes)
    }
    return this.#verification.every(item => item.result === '回读一致')
  }

  /** 未知回执只丢弃本操作未被外部修改的本地delta并回读；一致后接续文件保存。 */
  async verify(): Promise<boolean> {
    if (!['unknown', 'readback', 'different', 'configuration'].includes(this.#status) || !this.#file) throw new Error('没有待核验的改名')
    const reconcile = this.#status === 'configuration'
    this.discardOwned(); this.#status = 'saving'
    try {
      if (!await this.readback()) {this.#status = 'different'; return false}
      this.#status = 'configuration'; await this.#file.complete(reconcile); this.finish(); return true
    } catch (error) {if (this.#status !== 'configuration') this.#status = 'readback'; throw error}
  }

  private finish(): void {
    this.input.discardEditingRows(['rename']); this.input.replaceRows([{id: 'rename', name: this.formalName()}]); this.input.setCurrentRowById('rename'); this.changesView.replaceRows([])
    this.#status = 'idle'; this.#changes = []; this.#file = null; this.#verification = []; this.#pendingRows.clear()
    this.lifecycle.completed()
  }

  /** 仅取消未派发的输入与预览，不撤销服务端请求。 */
  cancel(): void {this.assertOwner(); if (!['idle', 'ready'].includes(this.#status)) throw new Error('已派发改名须先核验'); this.finish()}

  /** 采用刚回读的正式结果结束未完成操作；不补写引用、不宣称改名成功。 */
  acceptCurrent(): void {
    this.assertClean()
    if (this.#status !== 'different' || this.snapshot() !== this.#verified) throw new Error('请先核验当前正式结果')
    this.finish()
  }

  /** 仅释放无草稿、无未决提交的局部视图；正式元数据和场景配置保留。 */
  release(): void {
    if (this.dataSet.destroyed) return
    if (this.getState().pending) throw new Error('注册名操作尚未结束，不能释放')
    this.#dependencies.release()
    this.dataSet.removeTable(this.input.tableName); this.dataSet.removeTable(this.changesView.tableName)
  }
}
