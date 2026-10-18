/**
 * @module app:lowcode/data-space/model-source/removal/lowcode-data-space-model-remove
 * 职责：预览并删除一个正式模型及其字段、直接关系，逐项确认回执与回读。
 * 边界：数据和权限仍归原DataView；不跨入独立功能标签体系改删配置。
 * AI用途：设计页删除与未知结果核验，不将空查询当成未知删除成功。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceModelRemoveReferences} from './lowcode-data-space-model-remove-references'
import {LowcodeDataSpaceModelDependencies} from '../lowcode-data-space-model-dependencies'

type Removal = {view: DataView; id: string; row: DataRow; snapshot: string}

/** 删除预览的场景文件基线及数据库删除后的局部收尾。 */
export type LowcodeDataSpaceModelRemovalFilePlan = Readonly<{
  /** 预览的正式文件原文；null表示文件缺失。 */
  baseline: string | null
  /** 本模型是否有待清理的正式模型布局坐标。 */
  layout: boolean
  /** 数据库派发前检查同一文件、修订和编辑状态。 */
  assertCurrent(): void
  /** 数据库删除确认后清理布局；reconcile仅由显式接续允许核对并采用当前远端配置。 */
  complete(reconcile: boolean): Promise<void>
}>

/** 一个模型的删除操作；候选只记录原视图行身份，不创建独立保存通道。 */
export class LowcodeDataSpaceModelRemove {
  readonly #views: DataView[]
  readonly #dependencies: LowcodeDataSpaceModelDependencies
  #status: 'idle' | 'previewing' | 'ready' | 'saving' | 'unknown' | 'readback' | 'different' | 'configuration' = 'idle'
  #entries: Removal[] = []
  #staged = new Set<Removal>()
  #baseline = ''
  #name = ''
  #confirmed = false
  #databaseComplete = false
  #filePlan: LowcodeDataSpaceModelRemovalFilePlan | null = null
  #verification: Array<{table: string; id: string; result: string}> = []

  /** 绑定当前元数据查询和目标；文件检查由原会话提供，派发后废弃旧目标投影。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string, private readonly modelId: string,
    private readonly lifecycle: Readonly<{assertCurrent(): void; validateFile(views: readonly DataView[]): Promise<LowcodeDataSpaceModelRemovalFilePlan>; onDispatch(): void}>) {
    this.#dependencies = new LowcodeDataSpaceModelDependencies(dataSet, targetId, modelId, 'remove', () => lifecycle.assertCurrent())
    this.#views = this.#dependencies.views
  }

  private assertOwner(): void {
    this.#dependencies.assertOwner()
  }

  private assertClean(readback = false): void {
    this.assertOwner()
    this.#dependencies.assertSiblingsClean()
    if (!readback) this.#dependencies.assertFieldScope()
    for (const view of this.#views) {
      if (view.mutating || view.requestState === RequestState.Loading || !readback && view.requestState !== RequestState.Loaded) throw new Error('删除所需数据尚未完整读取或仍在操作')
      if (view.hasEditingChanges() || view.dirtyTracking.pendingCreateIds.size || view.dirtyTracking.dirtyRowIds.size
        || [...view.dirtyTracking.pendingDeleteIds].some(id => ![...this.#staged].some(item => item.view === view && item.id === id))) throw new Error('请先处理其他草稿，不能合并或覆盖')
      if (!readback && !this.#staged.size && view.total !== view.rows.length) throw new Error('删除所需数据未完整读取')
      const ids = new Set<string>()
      for (const row of view.rows) {
        if (typeof row['rowid'] !== 'string' || !row['rowid'] || ids.has(row['rowid']) || view.getPkKey(row) !== row['rowid']
          || row['dataSetId'] !== this.targetId || ['rowid', 'dataSetId'].some(key => view.fieldAccess(row, key).read !== 'visible')) throw new Error('删除数据身份、唯一性或目标归属不可核验')
        ids.add(row['rowid'])
      }
    }
  }

  private snapshot(): string {
    return JSON.stringify(this.#views.map(view => [...view.rows, ...[...this.#staged].filter(item => item.view === view).map(item => item.row)]
      .sort((left, right) => String(left['rowid']).localeCompare(String(right['rowid'])))))
  }

  private prepare(): void {
    this.assertClean()
    const [models, fields, relations] = this.#views
    if (!models || !fields || !relations) throw new Error('删除所需正式视图缺失')
    const row = models.rows.find(item => item['rowid'] === this.modelId)
    if (!row || models.fieldAccess(row, 'Name').read !== 'visible' || typeof row['Name'] !== 'string' || !row['Name']) throw new Error('模型身份或注册名不可读取')
    this.#name = row['Name']
    for (const [view, keys] of [[fields, ['dataModelId']], [relations, ['parentModId', 'childModId']]] as const) {
      if (view.rows.some(item => keys.some(key => view.fieldAccess(item, key).read !== 'visible' || typeof item[key] !== 'string' || !item[key]))) throw new Error('字段或关系归属不可核验，不能删除')
    }
    LowcodeDataSpaceModelRemoveReferences.validate(this.#views, this.modelId, this.#name)
    this.#entries = this.#views.flatMap(view => view.rows.filter(item => view === models ? item['rowid'] === this.modelId
      : view === fields ? item['dataModelId'] === this.modelId : item['parentModId'] === this.modelId || item['childModId'] === this.modelId)
      .map(item => ({view, id: String(item['rowid']), row: item, snapshot: JSON.stringify(item)})))
    this.assertPermissions()
    this.#baseline = this.snapshot()
  }

  private assertPermissions(): void {
    for (const item of this.#entries) {
      if (item.view.deleteActionState(item.row) !== 'enabled') throw new Error(`缺少删除权限：${item.view.tableName}/${item.id}`)
      if (this.#staged.has(item) && JSON.stringify(item.view.dirtyTracking.getPendingDeleteSnapshot(item.id)) !== item.snapshot) throw new Error('待删记录快照已变化')
    }
  }

  /** 只返回删除清单与核验状态，不返回原查询凭据。 */
  getState() {
    return {status: this.#status, pending: this.#status !== 'idle', preview: this.#entries.length ? {name: this.#name, layout: this.#filePlan?.layout === true,
      records: this.#views.map(view => ({table: view.tableName, ids: this.#entries.filter(item => item.view === view).map(item => item.id)})).filter(item => item.ids.length)} : null,
    verification: this.#verification.map(item => ({...item}))}
  }

  /** 完整读取及文件依赖检查通过后提供确认清单；不标记删除，不发送写入。 */
  async preview(): Promise<void> {
    if (this.#status !== 'idle') throw new Error('请先处理当前删除操作')
    this.#status = 'previewing'
    try {
      this.assertClean(true); await this.#dependencies.load()
      this.prepare()
      const filePlan = await this.lifecycle.validateFile(this.#views)
      filePlan.assertCurrent(); this.assertClean(); this.assertPermissions()
      if (this.#baseline !== this.snapshot()) throw new Error('预览期间元数据已变化')
      this.#filePlan = filePlan
      this.#status = 'ready'
    } catch (error) {this.finish(); throw error}
  }

  private finish(): void {this.#status = 'idle'; this.#entries = []; this.#staged.clear(); this.#verification = []; this.#confirmed = false; this.#databaseComplete = false; this.#filePlan = null; this.#baseline = ''}

  /** 只取消未派发的预览；不会撤销已经发出的删除。 */
  cancel(): void {
    this.assertOwner()
    if (this.#status !== 'ready') throw new Error('只能取消尚未提交的删除预览')
    this.finish()
  }

  /** 确认清单后经原saveChanges派发，逐视图核对删除回执及正式回读。 */
  async save(): Promise<boolean> {
    if (this.#status !== 'ready') throw new Error('请先预览；未决删除不能重复提交')
    this.assertClean(); this.assertPermissions()
    if (this.snapshot() !== this.#baseline) throw new Error('删除预览已过期，请取消后重新预览')
    this.#status = 'saving'
    let dispatched = false
    try {
      await this.#dependencies.load(true); this.assertClean()
      if (this.snapshot() !== this.#baseline) throw new Error('正式定义已变化，请重新预览删除')
      this.prepare()
      const filePlan = await this.lifecycle.validateFile(this.#views)
      if (!this.#filePlan || this.#filePlan.baseline !== filePlan.baseline) throw new Error('删除预览的文件已变化，请取消后重新预览')
      this.#filePlan = filePlan
      const check = () => {
        filePlan.assertCurrent(); this.assertClean(); this.assertPermissions()
        if (this.snapshot() !== this.#baseline) throw new Error('提交前元数据已变化')
      }
      check()
      for (const item of this.#entries) {
        check()
        if (await item.view.removeRow(item.id) !== true) throw new Error('记录删除尚未暂存')
        this.#staged.add(item)
      }
      check()
      const views = this.#views.map(view => ({tableName: view.tableName, viewId: view.viewId,
        ids: this.#entries.filter(item => item.view === view).map(item => item.id)})).filter(view => view.ids.length)
      this.lifecycle.onDispatch(); dispatched = true
      const saved = await this.dataSet.saveChanges({applyEditingRows: false, views})
      this.assertOwner()
      if (!saved.success || saved.data?.viewResults.length !== views.length || saved.data.failedEditingRows !== 0
        || views.some(view => {
          const results = saved.data?.viewResults.filter(result => result.tableName === view.tableName && result.viewId === view.viewId)
          const result = results?.[0]
          return results?.length !== 1 || result?.deletedCount !== view.ids.length || result.savedCount !== 0 || result.createdCount !== 0 || result.failedCount !== 0
        })) throw new Error('删除回执未完整确认，请核验；不会重复提交')
      this.#confirmed = true; this.#staged.clear()
      if (!await this.readback()) throw new Error('删除回读仍有记录，不能确认完整成功')
      await this.completeConfiguration(false)
      this.finish(); return true
    } catch (error) {
      if (dispatched) this.#status = this.#databaseComplete ? 'configuration' : this.#confirmed ? 'readback' : 'unknown'
      else {
        this.#status = 'readback'
        try {this.discardOwned(); this.#status = 'ready'} catch { /* 保留被外部改变的草稿，不能自动覆盖。 */ }
      }
      throw error
    }
  }

  private discardOwned(): void {
    this.assertClean(true)
    for (const item of this.#staged) {
      if (item.view.dirtyTracking.pendingDeleteIds.has(item.id)) {
        if (JSON.stringify(item.view.dirtyTracking.getPendingDeleteSnapshot(item.id)) !== item.snapshot) throw new Error('删除草稿已变化，不能覆盖')
      } else if (item.view.dirtyTracking.hasPendingChanges(item.id)) throw new Error('待删记录出现其他修改')
    }
    for (const view of this.#views) view.discardPendingChanges([...this.#staged].filter(item => item.view === view).map(item => item.id))
    this.#staged.clear()
  }

  private async readback(): Promise<boolean> {
    this.#databaseComplete = false; this.#verification = []
    this.assertClean(true)
    await this.#dependencies.load(true)
    this.assertClean()
    const discovered: Array<{table: string; id: string; result: string}> = []
    for (const view of this.#views) {
      const ownerKeys = view.tableName === 'Base_DataModel_Field' ? ['dataModelId']
        : view.tableName === 'Base_DataModel_Relation' ? ['parentModId', 'childModId'] : []
      for (const row of view.rows) {
        if (ownerKeys.some(key => view.fieldAccess(row, key).read !== 'visible' || typeof row[key] !== 'string' || !row[key])) {
          throw new Error('删除回读的从属归属不可核验，不能确认完成')
        }
        // Readback must include dependents created after the preview, without adding them to the write set.
        if (ownerKeys.some(key => row[key] === this.modelId) && !this.#entries.some(item => item.view === view && item.id === row['rowid'])) {
          discovered.push({table: view.tableName, id: String(row['rowid']), result: '新增从属记录仍存在；不在原删除清单'})
        }
      }
    }
    this.#baseline = this.snapshot()
    this.#verification = [...this.#entries.map(item => ({table: item.view.tableName, id: item.id,
      result: item.view.rows.some(row => row['rowid'] === item.id) ? '记录仍存在' : this.#confirmed ? '回执与回读一致' : '未读取到记录；缺少完整删除回执，结果未确认'})), ...discovered]
    const confirmed = this.#confirmed && this.#verification.every(item => item.result === '回执与回读一致')
    this.#dependencies.invalidate(this.#entries.map(item => ({table: item.view.tableName, id: item.id})))
    return confirmed
  }

  private async completeConfiguration(reconcile: boolean): Promise<void> {
    this.#databaseComplete = true
    this.assertClean()
    if (!this.#filePlan) throw new Error('删除文件计划已丢失，不能确认完成')
    await this.#filePlan.complete(reconcile)
    this.assertOwner()
  }

  /** 不重放数据库删除；确认回读后处理布局，配置未决时显式核对当前远端并接续。 */
  async verify(): Promise<boolean> {
    if (!['unknown', 'readback', 'different', 'configuration'].includes(this.#status)) throw new Error('没有可核验的删除')
    const reconcile = this.#status === 'configuration'
    this.discardOwned(); this.#status = 'saving'
    try {
      const confirmed = await this.readback()
      if (confirmed) {await this.completeConfiguration(reconcile); this.finish()}
      else {this.#databaseComplete = false; this.#status = 'different'}
      return confirmed
    } catch (error) {this.#status = this.#databaseComplete ? 'configuration' : 'readback'; throw error}
  }

  /** 明确采用刚核验的正式结果结束操作；不补删、不回滚、不宣称原操作完整成功。 */
  acceptCurrent(): void {
    this.assertClean()
    if (this.#status !== 'different' || this.snapshot() !== this.#baseline) throw new Error('请先核验当前正式结果')
    this.finish()
  }
}
