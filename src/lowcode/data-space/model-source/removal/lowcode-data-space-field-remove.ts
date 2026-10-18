/**
 * @module app:lowcode/data-space/model-source/removal/lowcode-data-space-field-remove
 * 职责：计算字段定义的删除预览、原批次提交及精确回读。
 * 边界：不删除物理字段或自动改写引用；数据权限、暂存及写入归原DataView/DataSet。
 * AI用途：确认和取消删除，未决结果只核验，不重复提交。
 */
import {buildDataViewKey, RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDefinitionSave, type DataSpaceDefinitionSavePart} from '../save/data-space-definition-save'
import {LowcodeDataSpaceModelDependencies} from '../lowcode-data-space-model-dependencies'
import {LowcodeDataSpaceFieldRemoveReferences} from './lowcode-data-space-field-remove-references'

/** 单个正式计算字段的删除流程，保留行消失后的核验状态。 */
export class LowcodeDataSpaceFieldRemove {
  readonly #views: DataView[]
  readonly #source: DataView
  readonly #sourceContext: string
  #dependencies: LowcodeDataSpaceModelDependencies | undefined
  #status: 'idle' | 'previewing' | 'ready' | 'staged' | 'saving' | 'unknown' | 'readback' | 'different' = 'idle'
  #row: DataRow | null = null
  #baseline = ''
  #staged = false
  #confirmed = false
  #verification = ''
  #verifiedSnapshot = ''

  /** 捕获元数据查询；依赖与文件一致性由当前设计会话校验。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string, private readonly fieldId: string,
    private readonly lifecycle: Readonly<{assertCurrent(): void; onDispatch(): void; validate(row: DataRow, views: readonly DataView[]): Promise<() => void>;
      fieldWorkspaces?(modelId: string): ReadonlyArray<Readonly<{view: DataView; ids: readonly string[]; allowPending?: boolean}>>}>,
    fieldViewId: 'default' | 'modelFields' = 'default') {
    this.#views = ['Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'].map(name => {
      const view = dataSet.getView(name, name === 'Base_DataModel_Field' ? fieldViewId : 'default')
      if (!view) throw new Error(`缺少正式视图：${name}`)
      return view
    })
    const fields = this.#views[1]
    if (!fields) throw new Error('缺少正式字段视图')
    this.#source = fields
    this.#sourceContext = JSON.stringify(fields.queryContext)
  }

  private assertClean(readback = false): void {
    this.lifecycle.assertCurrent()
    this.#dependencies?.assertSiblingsClean()
    if (this.#source.destroyed || this.#sourceContext !== JSON.stringify(this.#source.queryContext)) throw new Error('字段删除的原绑定视图已变化')
    if (this.#source.mutating || this.#source.requestState === RequestState.Loading) throw new Error('字段删除的原绑定视图仍有请求')
    if (!readback && (this.#source.requestState !== RequestState.Loaded || this.#source.total !== this.#source.rows.filter(row => !this.#source.dirtyTracking.isPendingCreate(String(row['rowid']))).length + this.#source.dirtyTracking.pendingDeleteIds.size)) throw new Error('字段删除的原绑定视图未完整读取')
    if (this.dataSet.destroyed || this.#views.some(view => view.destroyed || this.dataSet.getView(view.tableName, view.viewId) !== view
      || view.dataTable?.modelBinding?.modelName !== view.tableName || view.queryContext['dataSpaceId'] !== this.targetId)
      ) throw new Error('字段删除查询或目标已变化')
    for (const view of this.#views) {
      if (view.mutating || view.requestState === RequestState.Loading || !readback && (view.requestState !== RequestState.Loaded
        || view.rows.length !== view.total)) throw new Error('删除所需元数据未完整读取')
      if (view.hasEditingChanges() || view.dirtyTracking.pendingCreateIds.size || view.dirtyTracking.dirtyRowIds.size
        || view.dirtyTracking.pendingDeleteIds.size) throw new Error('请先处理其他元数据草稿')
      const ids = new Set<string>()
      for (const row of view.rows) {
        if (typeof row['rowid'] !== 'string' || !row['rowid'] || view.getPkKey(row) !== row['rowid'] || ids.has(row['rowid'])
          || row['dataSetId'] !== this.targetId || ['rowid', 'dataSetId'].some(key => view.fieldAccess(row, key).read !== 'visible')) throw new Error('字段删除身份或空间归属不可核验')
        ids.add(row['rowid'])
      }
    }
  }

  private snapshot(): string {
    return JSON.stringify(this.#views.map(view => [...view.rows]
      .sort((left, right) => String(left['rowid']).localeCompare(String(right['rowid'])))))
  }

  private assertPermission(): void {
    if (!this.#row || this.#source.deleteActionState(this.#row) !== 'enabled') throw new Error('当前查询不允许删除字段')
    if (this.#staged && JSON.stringify(this.#source.dirtyTracking.getPendingDeleteSnapshot(this.fieldId)) !== JSON.stringify(this.#row)) throw new Error('字段删除草稿已变化')
  }

  /** 删除目标和确认状态；不暴露原授权凭据。 */
  getState() {
    return {status: this.#status, pending: this.#status !== 'idle', verification: this.#verification,
      dataViewKey: buildDataViewKey(this.#source.tableName, this.#source.viewId, this.dataSet.scenarioId),
      preview: this.#row ? {id: this.fieldId, modelId: String(this.#row['dataModelId']), name: String(this.#row['Name']),
        outputName: typeof this.#row['AsName'] === 'string' && this.#row['AsName'].length > 0 ? this.#row['AsName'] : String(this.#row['Name'])} : null}
  }

  /** 只检查计算字段、所属模型和依赖，预览不产生删除草稿。 */
  async preview(): Promise<void> {
    if (this.#status !== 'idle') throw new Error('请先处理当前字段删除')
    this.#status = 'previewing'
    try {
      if (!this.#dependencies) {
        this.lifecycle.assertCurrent()
        const source = this.#source, original = source.rows.find(row => row['rowid'] === this.fieldId)
        if (source.requestState !== RequestState.Loaded || !original || source.fieldAccess(original, 'dataModelId').read !== 'visible'
          || typeof original['dataModelId'] !== 'string' || original['dataSetId'] !== this.targetId
          || this.#sourceContext !== JSON.stringify(source.queryContext)) throw new Error('计算字段的绑定视图或所属模型不可确认')
        const models = this.dataSet.getView('Base_DataModel')
        if (!models) throw new Error('缺少正式模型视图')
        this.#dependencies = new LowcodeDataSpaceModelDependencies(this.dataSet, this.targetId, original['dataModelId'], `fieldRemove:${this.fieldId}:${source.viewId}`, () => this.lifecycle.assertCurrent(),
          source.viewId === 'modelFields' ? {view: models, id: original['dataModelId']} : undefined,
          {view: source, get ids() {return source.viewId === 'modelFields' ? [...source.rows.map(row => String(row['rowid'])), ...[...source.dirtyTracking.pendingDeleteIds].map(String)] : [String(original['rowid'])]}, allowPending: true},
          () => this.lifecycle.fieldWorkspaces?.(String(original['dataModelId'])) ?? [])
        this.#views.splice(0, this.#views.length, ...this.#dependencies.views)
      }
      await this.#dependencies.load()
      this.assertClean()
      const row = this.#source.rows.find(item => item['rowid'] === this.fieldId)
      if (!row || ['dataModelId', 'type', 'FieldType', 'Name', 'AsName', 'IsPKey', 'IsOutput'].some(key => this.#source.fieldAccess(row, key).read !== 'visible')
        || row['type'] !== 'dataModel' || row['FieldType'] !== '计算字段') throw new Error('只能删除身份可读的计算字段定义')
      if (Number(row['IsPKey']) !== 0) throw new Error('不能删除主键或主键标志无法确认的字段')
      const models = this.#views[0], model = models?.rows.find(item => item['rowid'] === row['dataModelId'])
      if (!models || !model || ['Name', 'MetaName', 'Type'].some(key => models.fieldAccess(model, key).read !== 'visible')) throw new Error('计算字段所属模型不可确认')
      this.#row = {...row}; this.assertPermission(); this.#baseline = this.snapshot()
      const check = await this.lifecycle.validate(this.#row, this.#views)
      check(); this.assertClean(); this.assertPermission()
      if (this.snapshot() !== this.#baseline) throw new Error('预览期间元数据已变化')
      this.#status = 'ready'
    } catch (error) {this.finish(); throw error}
  }

  private finish(): void {
    this.#status = 'idle'; this.#row = null; this.#baseline = ''; this.#staged = false; this.#confirmed = false; this.#verification = ''; this.#verifiedSnapshot = ''
  }

  /** 取消预览或还原原视图待删除记录；已发出的删除不提供本地回滚。 */
  cancel(): void {
    this.lifecycle.assertCurrent()
    if (!['ready', 'staged'].includes(this.#status)) throw new Error('只能取消未提交的字段删除')
    if (this.#staged) this.discardOwned()
    this.finish()
  }

  /** 确认删除只暂存原绑定视图，顶部保存统一提交。删除取代本行尚未应用的编辑。 */
  async stage(): Promise<void> {
    if (this.#status !== 'ready' || !this.#row) throw new Error('请先预览字段删除')
    this.assertClean(); this.assertPermission()
    if (this.snapshot() !== this.#baseline) throw new Error('删除预览已过期')
    const original = this.#source.rows.find(row => row['rowid'] === this.fieldId)
    if (!original || JSON.stringify(original) !== JSON.stringify(this.#row)) throw new Error('原绑定字段已变化')
    try {if (await this.#source.removeRow(this.fieldId) !== true) throw new Error('字段删除未暂存')}
    finally {this.#staged = this.#source.dirtyTracking.pendingDeleteIds.has(this.fieldId); if (this.#staged) this.#status = 'staged'}
    this.lifecycle.assertCurrent(); this.assertPermission()
    this.#source.discardEditingRows([this.fieldId])
    this.#status = 'staged'
  }

  /** 将原视图待删除记录加入同一模型保存阶段；不创建第二份删除数据。 */
  prepareSave(): DataSpaceDefinitionSavePart {
    if (!['ready', 'staged'].includes(this.#status) || !this.#row || !this.#dependencies) throw new Error('请先预览；未决字段删除不能重复提交')
    const previous = this.#status, dependencies = this.#dependencies, row = this.#row, modelId = String(row['dataModelId'])
    let check: (() => void) | undefined
    return {
      dataSet: this.dataSet, targetId: this.targetId, modelId,
      prepare: async () => {
        this.assertClean(); this.assertPermission()
        if (this.snapshot() !== this.#baseline) throw new Error('删除预览已过期，请取消后重新预览')
        await dependencies.load(true); this.assertClean()
        if (this.snapshot() !== this.#baseline) throw new Error('字段或引用已变化，请重新预览删除')
        check = await this.lifecycle.validate(row, this.#views)
        check(); this.assertPermission()
      },
      apply: async () => {if (!this.#staged) await this.stage()},
      check: () => {check?.(); this.assertPermission(); if (this.snapshot() !== this.#baseline) throw new Error('提交前字段或依赖已变化')},
      targets: () => [{tableName: this.#source.tableName, viewId: this.#source.viewId, ids: [this.fieldId]}],
      dispatched: () => {this.#status = 'saving'; this.lifecycle.onDispatch()},
      confirm: async () => {
        this.#confirmed = true; this.#staged = false
        if (!await this.readback()) throw new Error(this.#verification)
        this.finish()
      },
      failed: stage => {
        if (!this.#row) return
        if (stage === 'confirmed') {this.#confirmed = true; this.#staged = false}
        if (stage === 'dispatched' || stage === 'confirmed') this.#status = this.#confirmed ? 'readback' : 'unknown'
        else this.#status = this.#staged ? 'staged' : previous
      },
    }
  }

  /** 独立调用同样使用统一定义批次；页面确认只stage，模型保存组合prepareSave。 */
  async save(): Promise<boolean> {
    if (this.#source.rows.some(row => row['rowid'] !== this.fieldId && (this.#source.hasEditingChanges(String(row['rowid'])) || this.#source.dirtyTracking.hasPendingChanges(String(row['rowid']))))) throw new Error('请由模型顶部统一保存字段草稿')
    await DataSpaceDefinitionSave.run([this.prepareSave()])
    return true
  }

  private discardOwned(): void {
    this.assertClean(true)
    if (this.#staged) {
      if (this.#source.dirtyTracking.pendingDeleteIds.has(this.fieldId)) {
        if (JSON.stringify(this.#source.dirtyTracking.getPendingDeleteSnapshot(this.fieldId)) !== JSON.stringify(this.#row)) throw new Error('字段删除草稿已被其他操作修改')
      } else if (this.#source.dirtyTracking.hasPendingChanges(this.fieldId)) throw new Error('待删字段出现其他修改')
      this.#source.discardPendingChanges([this.fieldId]); this.#staged = false
    }
  }

  private async readback(): Promise<boolean> {
    const dependencies = this.#dependencies
    if (!dependencies) throw new Error('字段删除尚未读取依赖')
    this.assertClean(true)
    await dependencies.load(true)
    const loaded = await this.#source.loadFromServer({allPages: true, maxRows: 50000})
    if (!loaded.success) throw new Error('字段删除后回读失败')
    this.assertClean()
    if (this.#source.loadingError) throw new Error('字段删除后回读失败')
    const present = this.#source.rows.some(row => row['rowid'] === this.fieldId)
    this.#verification = present ? '字段记录仍存在，不能确认删除成功' : this.#confirmed ? '字段删除回执与回读一致' : '未读取到字段；缺少完整删除回执，结果未确认'
    let dependenciesValid = true
    if (!present && this.#row) try {LowcodeDataSpaceFieldRemoveReferences.validate(this.#views, this.#row)} catch (cause) {
      dependenciesValid = false; this.#verification = `删除后引用已变化：${cause instanceof Error ? cause.message : String(cause)}`
    }
    if (!present) {
      dependencies.invalidate([{table: this.#source.tableName, id: this.fieldId}], [this.#source])
    }
    this.#verifiedSnapshot = this.snapshot()
    return !present && this.#confirmed && dependenciesValid
  }

  /** 只读核验；空结果不替代缺失的删除回执。 */
  async verify(): Promise<boolean> {
    if (!['unknown', 'readback', 'different'].includes(this.#status)) throw new Error('没有待核验的字段删除')
    this.discardOwned(); this.#status = 'saving'
    try {
      const confirmed = await this.readback()
      if (confirmed) this.finish(); else this.#status = 'different'
      return confirmed
    } catch (error) {this.#status = 'readback'; throw error}
  }

  /** 显式采用刚核验的正式状态；不宣称原删除成功，也不补删。 */
  acceptCurrent(): void {
    this.assertClean()
    if (this.#status !== 'different' || this.#verifiedSnapshot !== this.snapshot()) throw new Error('请先核验当前正式状态')
    this.finish()
  }
}
