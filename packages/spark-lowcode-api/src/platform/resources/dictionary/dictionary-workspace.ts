/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/dictionary/dictionary-workspace
 * 职责：字典专题的定义/条目业务约束，复用正式DataSet的查询、编辑覆盖及批量提交。
 * 边界：不发送HTTP、不保存第二份行数据、不把字典查询授权转换为元记录维护授权。
 * AI用途：设计页绑定definition，独立数据页绑定entries并消费已保存标题，各自通过明确的保存方法提交。
 */
import {DataView, DataViewFilter, type DataSet, type DataRow} from '@spark-appworks/spark-data'
import {DictionarySchema} from './dictionary-schema'

/** 已装配正式模型的字典维护输入；一个实例只维护一个确定的字典。 */
type DictionaryWorkspaceInput = Readonly<{
  /** 正式字典定义与条目模型装配出的运行空间。 */
  dataSet: DataSet
  /** 本次唯一字典资源身份。 */
  dictionaryId: string
  /** 当前应用范围，由正式宿主提供。 */
  applicationId: string
  /** 新建时仍先正式查询空目标，取得新增权限与保存基线。 */
  create?: boolean
}>

/** 定义与条目共用原DataSet保存owner；失败后只能先重读核验，不自动重放。 */
export class DictionaryWorkspace {
  /** 方案设计定义视图；数据页只消费其已保存配置。 */
  readonly definition: DataView
  /** 业务条目视图；普通提交与设计定义隔离。 */
  readonly entries: DataView
  readonly #input: DictionaryWorkspaceInput
  #busy = false
  #uncertain = false
  #creating: boolean
  #deleting = false
  #removed = false

  /** 接受正式模型装配的DataSet；业务过滤进入视图配置，分页重查也保留同一范围。 */
  constructor(input: DictionaryWorkspaceInput) {
    if (!input.dictionaryId.trim() || !input.applicationId.trim()) throw new Error('字典身份和应用不能为空')
    const definition = input.dataSet.getView('_Base_DictType', 'default')
    const entries = input.dataSet.getView('_Base_DictData', 'default')
    if (!definition || !entries) throw new Error('字典维护空间缺少正式定义或条目视图')
    this.#input = input
    this.#creating = input.create === true
    this.definition = definition
    this.entries = entries
    definition.queryContext = {rowid: input.dictionaryId}
    entries.queryContext = {rowid: input.dictionaryId}
    definition.configure({filterExpression: DataViewFilter.group({logic: 'and', filters: [
      {field: 'rowid', operator: 'eq', value: input.dictionaryId},
      {field: 'AppId', operator: 'eq', value: input.applicationId},
    ]}).toJSON(), queryConfig: {allPages: true}, commitMode: 'staged'})
    entries.configure({filterExpression: DataViewFilter.condition({field: 'typeid', operator: 'eq', value: input.dictionaryId}).toJSON(),
      queryConfig: {allPages: true}, sortExpression: [{field: 'ordIdx', direction: 'asc'}, {field: 'rowid', direction: 'asc'}],
      commitMode: 'staged', valueField: 'val', labelField: 'txt'})
  }

  /** 是否有本地编辑或结果待核验；宿主以此阻止误关和目标切换。 */
  get pending(): boolean {
    return this.#uncertain || [this.definition, this.entries].some(view => view.hasEditingChanges()
      || view.dirtyTracking.hasPendingChanges())
  }
  /** 提交回执不确定时，禁用再次保存并提供显式重读入口。 */
  get requiresVerification(): boolean { return this.#uncertain }
  /** 删除后重新查询，定义和条目均不再返回；宿主结束本次维护实例。 */
  get removed(): boolean { return this.#removed }

  /** 首次读取或显式放弃本地修改后重读；失败不宣称保存成功或服务器回滚。 */
  async load(discard = false): Promise<void> {
    if (this.#busy || this.pending && !discard) throw new Error('请先保存或明确放弃字典修改')
    this.#busy = true
    try {
      if (discard) for (const view of [this.definition, this.entries]) {view.abandonUnconfirmedSave(); view.discardPendingChanges()}
      const result = await this.definition.loadFromServer({singleFlight: false})
      if (!result.success) throw new Error(result.message ?? '字典定义读取失败')
      const absentAfterDelete = this.#deleting && this.definition.rows.length === 0
      if (!absentAfterDelete && (!this.#creating || this.definition.rows.length > 0)) this.assertScope()
      const loaded = await this.entries.loadFromServer({singleFlight: false})
      if (!loaded.success) throw new Error(loaded.message ?? '字典条目读取失败')
      if (absentAfterDelete) {
        if (this.entries.rows.length > 0) throw new Error('定义已不再返回，但仍有条目，需核验部分删除结果')
        this.#removed = true; this.#uncertain = false; this.#deleting = false
        return
      }
      if (this.#creating && this.definition.rows.length === 0) {
        if (this.entries.rows.length > 0) throw new Error('新字典身份下已有条目，不能继续创建')
        if (this.definition.addActionState() !== 'enabled') throw new Error('当前查询不允许新建字典')
        await this.definition.addRow({rowid: this.#input.dictionaryId, AppId: this.#input.applicationId,
          TypeName: '', dictionaryType: '0', val: '编码', txt: '显示文本'})
      }
      this.assertScope()
      this.definition.setCurrentRow(this.definition.rows[0] ?? null)
      this.#uncertain = false
      this.#deleting = false
    } finally { this.#busy = false }
  }

  /** 原查询权限控制新增；类型归属固定为本次字典，不由页面传入。 */
  async addEntry(): Promise<void> {
    this.assertEditable()
    if (this.#creating) throw new Error('请先保存字典设计，再进入数据维护')
    if (this.entries.addActionState() !== 'enabled') throw new Error('当前查询不允许新增字典条目')
    const row = await this.entries.addRow({typeid: this.#input.dictionaryId, val: '', txt: ''})
    if (!('rowid' in row) || typeof row['rowid'] !== 'string') throw new Error('新增字典条目没有正式身份')
    this.entries.setCurrentRowById(row['rowid'])
  }

  /** 删除先进入DataView暂存态；正式提交仍由统一批量保存校验每条权限。 */
  async removeEntry(id: string | number): Promise<void> {
    this.assertEditable()
    if (!this.canRemoveEntry(id)) throw new Error('当前查询不允许删除该字典条目')
    if (this.entries.dirtyTracking.pendingCreateIds.has(id)) {
      this.entries.discardPendingChanges([id])
      return
    }
    await this.entries.removeRow(id)
  }

  /**
   * 条目移除的呈现及执行共用判断；取消本实例新增草稿不借用服务端删除权限。
   * @param id 本次条目视图中的主键。
   * @returns 当前可移除该条目或取消其新增草稿时为true。
   */
  canRemoveEntry(id: string | number): boolean {
    if (this.#busy || this.#uncertain) return false
    const row = this.entries.rows.find(item => this.entries.getPkKey(item) === id)
    return !!row && (this.entries.dirtyTracking.pendingCreateIds.has(id) || this.entries.deleteActionState(row) === 'enabled')
  }

  /** 仅提交设计定义；数据更改不能混入设计保存。删除资源另按完整性规则提交。 */
  async saveDesign(): Promise<void> { await this.save(this.definition) }

  /** 仅提交业务条目，消费已保存的设计；不能顺带保存标题或新建设计。 */
  async saveData(): Promise<void> {
    if (this.#creating || this.#deleting) throw new Error('请先保存字典设计，再维护业务数据')
    await this.save(this.entries)
  }

  private async save(target: DataView): Promise<void> {
    if (this.#busy || this.#uncertain) throw new Error('字典提交或结果核验尚未结束')
    if (this.#deleting) {
      await this.commit(this.definition)
      try {await this.load()} catch (error) {this.#uncertain = true; throw error}
      return
    }
    const other = target === this.definition ? this.entries : this.definition
    if (other.hasEditingChanges() || other.dirtyTracking.hasPendingChanges()) throw new Error('设计配置与业务数据必须分别维护和保存，请先取消另一类修改')
    this.assertScope()
    for (const view of [this.definition, this.entries]) this.assertChangesAllowed(view)
    const row = this.definition.getEditingRow(this.#input.dictionaryId)
    if (!row) throw new Error('字典定义已失效')
    const definitionChanges = this.changedFields(this.definition, this.#input.dictionaryId)
    DictionarySchema.validateDefinition(row, definitionChanges)
    for (const entry of this.entries.rows) {
      const id = this.entries.getPkKey(entry)
      if (id === undefined) throw new Error('字典条目缺少主键')
      const edited = this.entries.getEditingRow(id)
      const fields = this.changedFields(this.entries, id)
      if (fields && definitionChanges?.includes('dictionaryType')) {
        if (this.entries.fieldAccess(entry, 'val').read !== 'visible') throw new Error('条目编码不可读，无法核验编码类型变更')
        fields.push('val')
      }
      if ((!fields || fields.includes('val')) && (!this.definition.getColumn('dictionaryType')
        || row['dictionaryType'] === undefined || this.definition.fieldAccess(row, 'dictionaryType').read !== 'visible')) {
        throw new Error('字典编码类型缺失或不可读，无法核验条目编码')
      }
      if (edited) DictionarySchema.validateEntry(edited, row, fields)
    }
    await this.commit(target)
    this.#creating = false
    if (this.pending) throw new Error('本次提交已确认，仍有随后发生的编辑，请保留并处理')
    await this.load()
  }

  /** 完整读取且没有草稿时，按当次查询核定义及每条条目的删除许可；供呈现和执行共用。 */
  get canRemoveDefinition(): boolean {
    const row = this.definition.rows[0]
    return !this.#busy && !this.#creating && !this.#removed && !this.pending
      && this.definition.rows.length === 1 && !!row && row['rowid'] === this.#input.dictionaryId
      && this.entries.rows.length === this.entries.total
      && this.definition.deleteActionState(row) === 'enabled'
      && this.entries.rows.every(entry => this.entries.deleteActionState(entry) === 'enabled')
  }

  /** 显式暂存定义及全部条目删除，逐条核当次权限，批量提交顺序先条目后定义。 */
  async removeDefinition(): Promise<void> {
    this.assertEditable()
    if (this.pending) throw new Error('请先保存或取消当前编辑后再删除字典')
    if (this.entries.rows.length !== this.entries.total) throw new Error('字典条目未完整读取，不能删除字典')
    if (!this.canRemoveDefinition) throw new Error('当前查询未授权删除字典及其全部条目')
    for (const entry of [...this.entries.rows]) {
      const id = this.entries.getPkKey(entry)
      if (id === undefined) throw new Error('字典条目缺少身份')
      await this.entries.removeRow(id)
    }
    await this.definition.removeRow(this.#input.dictionaryId)
    this.#deleting = true
  }

  private async commit(target: DataView): Promise<void> {
    this.#busy = true
    try {
      if (this.#deleting) {
        // DataSet按模型依赖排序；整字典删除显式使用同一owner的逆序批量提交。
        const receipts = await DataView.saveQueryViews([{view: this.entries}, {view: this.definition}])
        if (receipts.some(receipt => !receipt.success)) throw new Error('字典删除未完整确认')
        return
      }
      const saved = await this.#input.dataSet.saveChanges({views: [{tableName: target.tableName, viewId: target.viewId}]})
      if (!saved.success) throw new Error(saved.message ?? '字典保存未完整确认')
    } catch (error) { this.#uncertain = true; throw error }
    finally { this.#busy = false }
  }

  /** 按当次字段权限取标题；没有标题时保留字段，禁止据此裁剪扩展数据。 */
  fieldLabel(name: string): string {
    const field = DictionarySchema.fields.find(item => item.name === name)
    if (!field) throw new Error(`未知字典业务字段 ${name}`)
    const row = this.definition.getEditingRow(this.#input.dictionaryId)
    if (!row || this.definition.fieldAccess(row, field.titleField).read !== 'visible') return field.defaultLabel
    const label = row[field.titleField]
    return typeof label === 'string' && label.trim() ? label : field.defaultLabel
  }

  private assertEditable(): void {
    if (this.#busy || this.#uncertain) throw new Error('字典提交或结果核验尚未结束')
    this.assertScope()
  }
  private assertScope(): void {
    const row = this.definition.rows[0]
    if (this.definition.rows.length !== 1 || row?.['rowid'] !== this.#input.dictionaryId
      || this.definition.fieldAccess(row, 'AppId').read !== 'visible' || row['AppId'] !== this.#input.applicationId) {
      throw new Error('字典定义不属于本次应用或无法核验身份')
    }
    for (const entry of this.entries.rows) this.assertEntry(entry)
  }
  private assertEntry(row: DataRow): void {
    if (this.entries.fieldAccess(row, 'typeid').read !== 'visible' || row['typeid'] !== this.#input.dictionaryId) {
      throw new Error('字典条目归属不一致或不可读')
    }
  }

  private assertChangesAllowed(view: DataView): void {
    if (view.dirtyTracking.pendingCreateIds.size && view.addActionState() !== 'enabled') throw new Error('当前查询不允许新增')
    for (const row of view.rows) {
      const id = view.getPkKey(row)
      if (id === undefined || view.dirtyTracking.pendingCreateIds.has(id)) continue
      const fields = new Set([...Object.keys(view.getEditingPatch(id) ?? {}), ...Object.keys(view.getDirtyChanges(id))])
      for (const field of fields) {
        if (view.fieldAccess(row, field).write !== 'allowed') throw new Error(`当前查询不允许修改字段 ${field}`)
      }
    }
  }

  private changedFields(view: DataView, id: string | number): string[] | undefined {
    return view.dirtyTracking.pendingCreateIds.has(id) ? undefined
      : [...new Set([...Object.keys(view.getEditingPatch(id) ?? {}), ...Object.keys(view.getDirtyChanges(id))])]
  }
}
