/**
 * @module app:lowcode/data-space/model-source/field-create/lowcode-data-space-field-create
 * 职责：计算字段的输入草稿、正式新增及精确回读。
 * 边界：局部输入视图不授权或持久化；新增经原元数据DataView和DataSet提交。
 * AI用途：标准组件绑定输入视图，未知提交只核验，不重复创建。
 */
import {buildDataViewKey, RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceFieldValue} from '../field-value/lowcode-data-space-field-value'

/** 同一元数据空间内的计算字段新增流程。 */
export class LowcodeDataSpaceFieldCreate {
  /** 新记录的唯一输入草稿；不绑定后端模型，不进入共享场景文件。 */
  readonly input: DataView
  readonly #fields: DataView
  readonly #models: DataView
  readonly #contexts: string
  #status: 'idle' | 'editing' | 'saving' | 'unknown' | 'readback' | 'different' = 'idle'
  #modelIdentity = ''
  #id: string | null = null
  #expected: DataRow | null = null
  #stagedSnapshot = ''
  #verification = ''
  #verifiedSnapshot = ''

  /** 捕获正式查询；生命周期回调检查当前会话及共享配置。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string, private readonly modelId: string,
    private readonly lifecycle: Readonly<{assertCurrent(): void; onDispatch(): void; readDefinition?(): DataSet | ScenarioViewConfig | null;
      validate(values: DataRow): Promise<() => void>; assertStaging?(): void}>, private readonly viewId: 'default' | 'modelFields' = 'default') {
    const fields = dataSet.getView('Base_DataModel_Field', viewId), models = dataSet.getView('Base_DataModel', 'default')
    if (!fields || !models) throw new Error('缺少正式模型或字段视图')
    this.#fields = fields; this.#models = models
    this.#contexts = JSON.stringify([models.queryContext, fields.queryContext])
    const table = dataSet.addTable(`FieldCreate_${crypto.randomUUID().replaceAll('-', '')}`, [
      {name: 'id', type: 'string', isPrimaryKey: true},
      ...['Name', 'AsName', 'description', 'ValueFun', 'FieldType'].map(name => ({name, type: 'string'})),
      {name: 'IsOutput', type: 'number'}, {name: 'IsPKey', type: 'number'},
    ])
    table.resourceType = 'static-data'
    this.input = table.getOrCreateView('default'); this.input.commitMode = 'staged'
  }

  private assertOwner(): void {
    this.lifecycle.assertCurrent()
    if (this.dataSet.destroyed || this.input.destroyed || [this.#models, this.#fields].some(view =>
      view.destroyed || this.dataSet.getView(view.tableName, view.viewId) !== view || view.dataTable?.modelBinding?.modelName !== view.tableName
      || view.queryContext['dataSpaceId'] !== this.targetId) || JSON.stringify([this.#models.queryContext, this.#fields.queryContext]) !== this.#contexts) {
      throw new Error('字段新增查询或目标已变化')
    }
  }

  private assertClean(forReadback = false): void {
    this.assertOwner()
    const staging = this.viewId === 'modelFields'
    if (staging) {
      this.lifecycle.assertStaging?.()
      if (this.#fields.commitMode !== 'staged') throw new Error('模型工作区必须使用暂存提交模式')
      if (this.#fields.queryContext['modelId'] !== this.modelId || this.#fields.rows.some(row =>
        row['dataModelId'] !== this.modelId || row['dataSetId'] !== this.targetId || row['type'] !== 'dataModel')) throw new Error('新增字段工作区所属模型已变化')
    }
    for (const view of [this.#models, this.#fields]) {
      if ((!forReadback && view.requestState !== RequestState.Loaded) || view.requestState === RequestState.Loading || view.mutating
        || !forReadback && view === this.#fields && view.rows.filter(row => !view.dirtyTracking.isPendingCreate(view.getPkKey(row) ?? '')).length + view.dirtyTracking.pendingDeleteIds.size !== view.total) throw new Error('模型未读取或字段尚未完整读取')
      if ((!staging && view.hasEditingChanges()) || view.dirtyTracking.dirtyRowIds.size || !staging && view.dirtyTracking.pendingDeleteIds.size
        || [...view.dirtyTracking.pendingCreateIds].some(id => view !== this.#fields || !staging && id !== this.#id)
        || staging && view === this.#models && view.rows.some(row => row['rowid'] !== this.modelId && view.hasEditingChanges(view.getPkKey(row)))) throw new Error('请先处理其他模型或字段草稿')
    }
    const matches = this.#models.rows.filter(row => row['rowid'] === this.modelId), model = matches[0]
    const keys = ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type']
    if (matches.length !== 1 || model?.['dataSetId'] !== this.targetId || keys.some(key => this.#models.fieldAccess(model, key).read !== 'visible')) {
      throw new Error('新增字段所属模型不可确认')
    }
    const identity = JSON.stringify(keys.map(key => model[key]))
    if (this.#modelIdentity && identity !== this.#modelIdentity) throw new Error('所属模型已变化，请取消后重新开始')
  }

  /** 只暴露状态和绑定键；实际新增权限仍取当次正式查询。 */
  getState() {
    this.assertOwner()
    return {status: this.#status, pending: this.#status !== 'idle', fieldId: this.#id, verification: this.#verification,
      canAdd: this.#fields.addActionState() === 'enabled', dataViewKey: buildDataViewKey(this.input.tableName, this.input.viewId, this.dataSet.scenarioId)}
  }

  /** 打开空白计算字段草稿，不向正式视图追加记录。 */
  begin(): void {
    if (this.#status !== 'idle') throw new Error('请先处理当前新增')
    this.assertClean()
    if (this.#fields.addActionState() !== 'enabled') throw new Error('当前查询不允许新增字段')
    const model = this.#models.rows.find(row => row['rowid'] === this.modelId)
    if (!model) throw new Error('新增字段所属模型不可确认')
    this.#modelIdentity = JSON.stringify(['rowid', 'dataSetId', 'Name', 'MetaName', 'Type'].map(key => model[key]))
    this.input.replaceRows([{id: 'draft', Name: '', AsName: '', description: '', ValueFun: '', FieldType: '计算字段', IsPKey: 0, IsOutput: 1}])
    this.input.setCurrentRowById('draft'); this.#status = 'editing'
  }

  /** 值函数目录取当前正式元数据，值仍保存在唯一输入视图。 */
  readValueFunction() {
    this.assertOwner()
    return {...new LowcodeDataSpaceFieldValue(this.dataSet, this.targetId, this.modelId, this.viewId).read(this.lifecycle.readDefinition),
      value: this.input.getEditingRow('draft')?.['ValueFun']}
  }

  /** 专业值函数编辑器写回输入视图，不写正式记录。 */
  stageValueFunction(value: string): void {
    this.assertOwner()
    if (this.#status !== 'editing') throw new Error('新增字段草稿当前不可修改')
    new LowcodeDataSpaceFieldValue(this.dataSet, this.targetId, this.modelId, this.viewId).validate(value)
    this.input.updateEditingValue('draft', 'ValueFun', value)
  }

  private values(): DataRow {
    const input = this.input.getEditingRow('draft')
    if (!input) throw new Error('缺少计算字段输入')
    const row = {...input}
    if (this.viewId === 'modelFields') for (const key of ['Name', 'description']) {
      if (typeof row[key] === 'string') row[key] = row[key].trim()
    }
    for (const key of ['Name', 'AsName']) if (typeof row[key] !== 'string' || key === 'Name' && !row[key].trim() || row[key] !== row[key].trim()
      || /[\u0000-\u001f\u007f]/.test(row[key]) || row[key] === '_pk') throw new Error('字段名称必须是非空文本，别名可留空；不能含首尾空白、控制字符或使用保留字段_pk')
    if (typeof row['description'] !== 'string' || row['IsOutput'] !== 0 && row['IsOutput'] !== 1) throw new Error('说明或输出开关格式无效')
    if (String(row['Name']).length > 100 || String(row['AsName']).length > 100 || row['description'].length > 200) throw new Error('名称和规范别名不能超过100个字符，描述不能超过200个字符')
    new LowcodeDataSpaceFieldValue(this.dataSet, this.targetId, this.modelId, this.viewId).validate(row['ValueFun'])
    return {dataSetId: this.targetId, dataModelId: this.modelId, type: 'dataModel', FieldType: '计算字段', IsPKey: 0,
      Name: row['Name'], AsName: row['AsName'], description: row['description'], ValueFun: row['ValueFun'], IsOutput: row['IsOutput'],
      Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
  }

  private finish(): void {
    this.input.discardEditingRows(); this.input.replaceRows([])
    this.#id = null; this.#expected = null; this.#stagedSnapshot = ''; this.#modelIdentity = ''; this.#verification = ''; this.#verifiedSnapshot = ''; this.#status = 'idle'
  }

  /** 取消未提交草稿；已派发新增不能以取消冒充回滚。 */
  cancel(): void {
    this.assertOwner()
    if (this.#status !== 'editing') throw new Error('已派发字段新增须先核验')
    this.finish()
  }

  /** 工作区弹窗确认：把新定义交给原modelFields视图的待新增集合；不派发请求，顶部保存统一提交。 */
  async stage(): Promise<string> {
    if (this.viewId !== 'modelFields' || this.#status !== 'editing') throw new Error('只有正在编辑的模型工作区输入可以暂存')
    this.assertClean()
    if (this.#fields.addActionState() !== 'enabled') throw new Error('当前查询不允许新增字段')
    const values = this.values(), snapshot = JSON.stringify(this.input.getEditingRow('draft'))
    const outputName = typeof values['AsName'] === 'string' && values['AsName'].length > 0 ? values['AsName'] : values['Name']
    for (const row of this.#fields.rows) {
      if (['Name', 'AsName', 'IsOutput', 'IsPKey'].some(key => this.#fields.fieldAccess(row, key).read !== 'visible')) throw new Error('已有字段合同不可核验')
      const key = this.#fields.getPkKey(row)
      if (key === undefined) throw new Error('已有字段身份不可核验')
      const next = this.#fields.getEditingRow(key) ?? row
      if (next['Name'] === values['Name']) throw new Error('字段名称已存在')
      const alias = typeof next['AsName'] === 'string' && next['AsName'].length > 0 ? next['AsName'] : next['Name']
      if (alias === outputName) throw new Error('模型列名称与已有字段冲突')
    }
    const before = new Set(this.#fields.dirtyTracking.pendingCreateIds)
    this.#status = 'saving'
    try {
      await this.#fields.addRow(values)
      this.assertClean()
      const added = this.#fields.dirtyTracking.pendingCreateRows.filter(row => !before.has(this.#fields.getPkKey(row) ?? ''))
      const row = added[0], id = row && this.#fields.getPkKey(row)
      if (added.length !== 1 || typeof id !== 'string' || row?.['rowid'] !== id || !this.matches(row, values)
        || this.#fields.addActionState() !== 'enabled' || JSON.stringify(this.input.getEditingRow('draft')) !== snapshot) throw new Error('新增暂存或权限未确认')
      this.finish(); return id
    } catch (cause) {
      // addRow通知可能在追加后抛错；只撤销本次新增，不碰之前的字段草稿。
      const added = this.#fields.dirtyTracking.pendingCreateRows.filter(row => !before.has(this.#fields.getPkKey(row) ?? ''))
      const row = added[0], id = row && this.#fields.getPkKey(row)
      if (added.length === 1 && id !== undefined && this.matches(row, values)) this.#fields.discardPendingChanges([id])
      this.#status = 'editing'; throw cause
    }
  }

  /** 经原新增权限、保存批次和回执确认单个计算字段，成功后精确回读。 */
  async save(): Promise<string> {
    if (this.viewId !== 'default') throw new Error('模型工作区须先确认暂存，再由顶部统一保存')
    if (this.#status !== 'editing') throw new Error('请先编辑或核验当前新增，不能重复提交')
    this.assertClean()
    const values = this.values(), snapshot = JSON.stringify(this.input.getEditingRow('draft'))
    this.#status = 'saving'
    let dispatched = false, confirmed = false
    try {
      const check = await this.lifecycle.validate(values)
      this.assertClean(); check()
      if (JSON.stringify(this.input.getEditingRow('draft')) !== snapshot || this.#fields.addActionState() !== 'enabled') throw new Error('新增草稿或权限已变化')
      const before = new Set(this.#fields.dirtyTracking.pendingCreateIds)
      try {await this.#fields.addRow({...values})} finally {
        const added = this.#fields.dirtyTracking.pendingCreateRows.filter(row => !before.has(this.#fields.getPkKey(row) ?? ''))
        const row = added[0], id = row && this.#fields.getPkKey(row)
        if (added.length === 1 && typeof id === 'string' && row?.['rowid'] === id) {
          this.#id = id; this.#expected = {...values}; this.#stagedSnapshot = JSON.stringify(row)
        }
      }
      this.assertClean()
      check()
      if (!this.#id || !this.#expected || this.#fields.addActionState() !== 'enabled'
        || JSON.stringify(this.input.getEditingRow('draft')) !== snapshot || !this.matches(this.#fields.rows.find(row => row['rowid'] === this.#id), values)) throw new Error('新增暂存或权限未确认')
      this.lifecycle.onDispatch(); dispatched = true
      const saved = await this.dataSet.saveChanges({applyEditingRows: false, views: [{tableName: this.#fields.tableName, viewId: this.#fields.viewId, ids: [this.#id]}]})
      this.assertOwner()
      const result = saved.data?.viewResults[0]
      if (!saved.success || saved.data?.viewResults.length !== 1 || saved.data.failedEditingRows !== 0 || result?.createdCount !== 1
        || result.savedCount !== 0 || result.deletedCount !== 0 || result.failedCount !== 0) throw new Error('字段新增回执未确认，请核验')
      confirmed = true
      if (!await this.readback()) throw new Error(this.#verification)
      const id = this.#id; this.finish(); return id
    } catch (error) {
      this.#status = confirmed ? 'readback' : dispatched ? 'unknown' : 'editing'
      if (!dispatched && this.#id) {
        try {this.discardStaged(); this.#id = null; this.#expected = null} catch {this.#status = 'readback'}
      }
      throw error
    }
  }

  private matches(row: DataRow | undefined, values: DataRow): boolean {return !!row && Object.entries(values).every(([key, value]) => Object.is(row[key], value))}

  private discardStaged(): void {
    this.assertClean(true)
    if (!this.#id) return
    if (this.#fields.dirtyTracking.isPendingCreate(this.#id)
      && JSON.stringify(this.#fields.rows.find(row => row['rowid'] === this.#id)) !== this.#stagedSnapshot) throw new Error('新增暂存已被其他操作修改，不能覆盖')
    if (this.#fields.dirtyTracking.hasPendingChanges(this.#id)) this.#fields.discardPendingChanges([this.#id])
  }

  private async readback(): Promise<boolean> {
    this.assertClean(true)
    const loaded = await this.#fields.loadFromServer({filter: {field: 'dataSetId', operator: 'eq', value: this.targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})
    this.assertClean()
    if (!loaded.success || this.#fields.loadingError) throw new Error('新增字段回读失败')
    const matches = this.#fields.rows.filter(row => row['rowid'] === this.#id), row = matches[0]
    const equal = !!row && matches.length === 1 && !!this.#expected && Object.keys(this.#expected).every(key => this.#fields.fieldAccess(row, key).read === 'visible')
      && this.matches(row, this.#expected)
    this.#verification = equal ? '已精确回读计算字段' : row ? '新增字段回读值或权限与提交不一致' : '未读取到新增字段，不能确认写入结果'
    this.#verifiedSnapshot = JSON.stringify(this.#fields.rows)
    return equal
  }

  /** 放弃本次提交的本地副本并只读核验，绝不再次发送新增。 */
  async verify(): Promise<string | null> {
    this.assertOwner()
    if (!['unknown', 'readback', 'different'].includes(this.#status)) throw new Error('没有待核验的字段新增')
    this.discardStaged(); this.#status = 'saving'
    try {
      if (!await this.readback()) {this.#status = 'different'; return null}
      const id = this.#id; this.finish(); return id
    } catch (error) {this.#status = 'readback'; throw error}
  }

  /** 明确接受刚读取的正式差异，不能据此宣称原新增成功。 */
  acceptCurrent(): void {
    this.assertClean()
    if (this.#status !== 'different' || this.#verifiedSnapshot !== JSON.stringify(this.#fields.rows)) throw new Error('请先核验正式状态')
    this.finish()
  }
}
