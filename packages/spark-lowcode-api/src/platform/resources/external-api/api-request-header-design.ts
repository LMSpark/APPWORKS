/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/external-api/api-request-header-design
 * 职责：维护服务商公共头部与令牌前缀方案的独立提交边界。
 * 边界：草稿、权限、查询、删除和批量保存均由DataView/DataSet承接，不执行外部调用。
 * AI用途：配置页绑定headers/provider，值函数候选绑定已保存references。
 */
import {DataViewFilter, type DataSet, type DataView} from '@spark-appworks/spark-data'

/** 同一服务商配置与正式字典候选视图；字典来自独立空间。 */
type ApiRequestHeaderDesignInput = Readonly<{
  /** 已装配正式配置模型及命名视图的数据空间，由调用方负责释放。 */
  dataSet: DataSet
  /** 本次唯一服务商记录ID，用于全部配置视图的范围约束。 */
  providerId: string
  /** 原使用范围字典的条目视图，保存前核验其可读编码。 */
  headerTypes: DataView
}>

/** 头部和前缀分别保存；公共参数方案、账号值及字典不参与提交。 */
export class ApiRequestHeaderDesign {
  /** 当前服务商头部定义，增改删由此视图追踪。 */
  readonly headers: DataView
  /** 独立编辑令牌前缀的服务商视图。 */
  readonly provider: DataView
  /** 已保存公共参数的引用候选，不消费参数编辑草稿。 */
  readonly references: DataView
  readonly #input: ApiRequestHeaderDesignInput
  #busy = false
  #uncertain = false

  /** 绑定既有视图并固定服务商范围，不发查询或创建另一份草稿。 */
  constructor(input: ApiRequestHeaderDesignInput) {
    if (!input.providerId.trim() || input.providerId !== input.providerId.trim()) throw new Error('服务商身份无效')
    this.#input = input
    this.headers = this.view('Base_InterfaceProvider_Headers')
    this.provider = this.view('Base_InterfaceProvider', 'authentication')
    this.references = this.view('Base_Interface_PublicParam', 'references')
    for (const [view, field] of [[this.headers, 'proId'], [this.provider, 'rowid'], [this.references, 'providerId']] as const) {
      view.configure({filterExpression: DataViewFilter.condition({field, operator: 'eq', value: input.providerId}).toJSON()})
    }
  }
  /** 本地修改、在途操作或待核回执要求保留实例。 */
  get pending(): boolean {return this.#busy || this.#uncertain || [this.headers, this.provider].some(v => v.hasEditingChanges() || v.dirtyTracking.hasPendingChanges())}
  /** 只能经显式重读确认结果，不能自动重放。 */
  get requiresVerification(): boolean {return this.#uncertain}

  /** 读取同一服务商定义和已保存参数；显式discard仅丢弃本领域两个视图的草稿。 */
  async load(discard = false): Promise<void> {
    if (this.#busy || this.pending && !discard) throw new Error('请先处理头部修改或等待核验')
    this.#busy = true
    try {
      if (discard) await this.#input.dataSet.discardAndReload({views: [this.provider, this.headers]
        .map(view => ({tableName: view.tableName, viewId: view.viewId}))})
      for (const view of [this.provider, this.headers, this.references]) await this.read(view)
      this.assertScope(); this.provider.setCurrentRowById(this.#input.providerId); this.#uncertain = false
    } finally {this.#busy = false}
  }
  /** 在当前正式查询的新增许可下生成固定归属的本地头部。 */
  async addHeader(): Promise<void> {
    this.assertEditable()
    if (this.headers.addActionState() !== 'enabled') throw new Error('当前查询不允许新增公共头部')
    const row = await this.headers.addRow({proId: this.#input.providerId, paramName: '', paramValue: '', type: ''})
    this.headers.setCurrentRow(row)
  }
  /** 新草稿直接取消；已有记录核当次删除许可后进入原生待删域。 */
  async removeHeader(): Promise<void> {
    this.assertEditable()
    const row = this.headers.currentRow, id = row && this.headers.getPkKey(row)
    if (!row || id === null || id === undefined) throw new Error('请先选择公共头部')
    if (!this.headers.dirtyTracking.pendingCreateIds.has(id) && this.headers.deleteActionState(row) !== 'enabled') throw new Error('当前查询不允许删除公共头部')
    await this.headers.removeRow(id)
  }
  /** 只保存头部；修改的函数引用和使用类型按正式可读候选核验。 */
  async saveHeaders(): Promise<void> {
    this.assertEditable()
    const view = this.headers
    const snapshot = (): string => JSON.stringify([view.rows.map(row => {
      const id = view.getPkKey(row)
      if (id === undefined) throw new Error('公共头部缺少正式身份')
      return [id, view.getEditingRow(id), view.dirtyTracking.pendingCreateIds.has(id)]
    }), [...view.dirtyTracking.pendingDeleteIds]])
    const checked = snapshot()
    this.#busy = true
    try {
      const references = await this.references.queryOptionRows({fields: ['paramName', 'desc']})
      const types = await this.#input.headerTypes.queryOptionRows({fields: ['val', 'txt']})
      for (const original of view.rows) {
        const id = view.getPkKey(original)
        if (id === undefined) throw new Error('公共头部缺少正式身份')
        const row = view.getEditingRow(id)
        if (!row) throw new Error('公共头部编辑记录已失效')
        const created = view.dirtyTracking.pendingCreateIds.has(id)
        const changes = new Set([...Object.keys(view.getEditingPatch(id) ?? {}), ...Object.keys(view.getDirtyChanges(id))])
        if (!created && !changes.size) continue
        if (row['proId'] !== this.#input.providerId) throw new Error('公共头部归属已变化')
        for (const field of changes) {
          if (!['rowid', 'proId', 'paramName', 'paramValue', 'type'].includes(field) || !created && ['rowid', 'proId'].includes(field)) throw new Error(`头部保存不接受字段 ${field}`)
          if (!['rowid', 'proId'].includes(field) && view.fieldAccess(row, field).write !== 'allowed') throw new Error(`当前查询不允许修改 ${field}`)
        }
        if (created && view.addActionState() !== 'enabled') throw new Error('当前查询不允许新增公共头部')
        if ((created || changes.has('paramName')) && (typeof row['paramName'] !== 'string' || !row['paramName'].trim())) throw new Error('请填写头部名称')
        if ((created || changes.has('type')) && types.filter(type => type['val'] === row['type']).length !== 1) throw new Error('使用类型不在当前字典中或编码不唯一')
        if (created || changes.has('paramValue')) {
          if (typeof row['paramValue'] !== 'string') throw new Error('头部值必须保存为文本')
          let value: unknown
          try {value = JSON.parse(row['paramValue'])} catch {continue} // 后端对普通文本原样处理。
          if (value !== null && typeof value === 'object' && 'Type' in value) {
            const parsed = DataViewFilter.parse({field: 'value', operator: 'eq', value})
            if (!parsed.ok) throw new Error(parsed.issues.map(issue => issue.message).join('\n'))
            const issues = parsed.value.validate({fields: [{name: 'value', type: 'text'}],
              valueFunctions: {capabilities: ['huoshan'], apiPublicParams: references.map(ref => ({value: String(ref['paramName']), label: String(ref['desc'] ?? ref['paramName'])}))}})
            if (issues.length) throw new Error(issues.map(issue => issue.message).join('\n'))
          }
        }
      }
      this.assertScope()
      if (checked !== snapshot()) throw new Error('公共头部在校验期间发生变化，请重新保存')
      await this.persist(view)
    } finally {this.#busy = false}
  }
  /** TokenPrefix直接拼接到令牌，保留空字符串及首尾空白，不与头部一并保存。 */
  async savePrefix(): Promise<void> {
    this.assertEditable()
    const view = this.provider, id = this.#input.providerId, row = view.getEditingRow(id)
    if (!row) throw new Error('服务商编辑记录已失效')
    if (view.dirtyTracking.pendingCreateIds.size || view.dirtyTracking.pendingDeleteIds.size) throw new Error('令牌前缀只允许修改既有服务商')
    const changes = new Set([...Object.keys(view.getEditingPatch(id) ?? {}), ...Object.keys(view.getDirtyChanges(id))])
    for (const field of changes) if (field !== 'TokenPrefix') throw new Error(`令牌前缀保存不接受字段 ${field}`)
    if (changes.has('TokenPrefix') && (typeof row['TokenPrefix'] !== 'string' || view.fieldAccess(row, 'TokenPrefix').write !== 'allowed')) throw new Error('令牌前缀无效或当前不可写')
    this.#busy = true
    try {await this.persist(view); view.setCurrentRowById(id)} finally {this.#busy = false}
  }
  /** 明确取消头部和前缀草稿，不取消公共参数或其他数据空间。 */
  discard(): void {this.assertEditable(); this.headers.discardPendingChanges(); this.provider.discardPendingChanges()}
  private async persist(view: DataView): Promise<void> {
    if (!view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges()) return
    try {
      const saved = await this.#input.dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
      if (!saved.success) throw new Error(saved.message ?? '方案保存未完整确认')
      await this.read(view); this.assertScope()
    } catch (error) {this.#uncertain = true; throw error}
  }
  private async read(view: DataView): Promise<void> {const result = await view.loadFromServer({singleFlight: false}); if (!result.success) throw new Error(result.message ?? '头部方案读取失败')}
  private view(table: string, name = 'default'): DataView {const view = this.#input.dataSet.getView(table, name); if (!view) throw new Error(`头部方案缺少视图 ${table}@${name}`); return view}
  private assertEditable(): void {if (this.#busy || this.#uncertain) throw new Error('头部方案提交或结果核验尚未结束'); this.assertScope()}
  private assertScope(): void {
    const provider = this.provider.rows[0]
    if (this.#input.dataSet.destroyed || this.provider.rows.length !== 1 || provider?.['rowid'] !== this.#input.providerId
      || this.provider.fieldAccess(provider, 'rowid').read !== 'visible') throw new Error('服务商身份无效或范围不一致')
    for (const row of this.headers.rows) if (row['proId'] !== this.#input.providerId || this.headers.fieldAccess(row, 'proId').read !== 'visible') throw new Error('公共头部归属范围不一致')
  }
}
