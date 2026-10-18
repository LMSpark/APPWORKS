/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/external-api/api-interface-design
 * 职责：接口方案及输入、头部定义的身份、独立保存和引用校验。
 * 边界：复用DataView草稿/权限和DataSet提交，不发起外部调用。
 * AI用途：原接口设计页绑定这些视图；testvalue在独立数据维护页处理。
 */
import {DataViewFilter, type DataSet, type DataView, type DataViewFilterFunctionContext} from '@spark-appworks/spark-data'

/** 方案装配入口；两个空间保留正式身份。 */
type InterfaceDesignInput = {
  /** 接口正式空间。 */
  dataSet: DataSet
  /** 服务商与账号身份所在的配置空间，不查询凭据。 */
  context: DataSet
  /** 被维护接口的共同服务商主键。 */
  providerId: string
}

/** 接口方案领域；仅维护设计定义。 */
export class ApiInterfaceDesign {
  /** 接口列表及当前定义。 */
  readonly interfaces: DataView
  /** 输入定义，不含测试值。 */
  readonly parameters: DataView
  /** 接口请求头定义。 */
  readonly headers: DataView
  /** 正式输出字段；当前元模型写入合同未齐，仅供查看。 */
  readonly outputs: DataView
  /** 服务商身份。 */
  readonly provider: DataView
  /** 同服务商账号身份候选。 */
  readonly accounts: DataView
  /** 已保存公共参数引用。 */
  readonly publicParameters: DataView
  /** 已保存输入引用，与定义草稿分开。 */
  readonly inputReferences: DataView
  readonly #input: InterfaceDesignInput
  #busy = false
  #uncertain = false

  /** 绑定两个正式数据空间及固定服务商范围；构造不读取数据。 */
  constructor(input: InterfaceDesignInput) {
    if (!input.providerId.trim() || input.providerId.trim() !== input.providerId) throw new Error('服务商ID无效')
    this.#input = input
    this.interfaces = this.view('Base_DataServiceInterface')
    this.parameters = this.view('_Base_ParamList')
    this.inputReferences = this.view('_Base_ParamList', 'references')
    this.headers = this.view('Base_InterfaceApi_Headers')
    this.outputs = this.view('Base_TblField')
    this.publicParameters = this.view('Base_Interface_PublicParam')
    const provider = input.context.getView('Base_InterfaceProvider'), accounts = input.context.getView('Base_InterfaceProvider_Account')
    if (!provider || !accounts) throw new Error('接口方案缺少服务商上下文')
    this.provider = provider; this.accounts = accounts
    for (const [view, field] of [[provider, 'rowid'], [accounts, 'ProviderID'], [this.interfaces, 'ProviderID'], [this.publicParameters, 'providerId']] as const) {
      view.configure({filterExpression: DataViewFilter.condition({field, operator: 'eq', value: input.providerId}).toJSON()})
    }
  }
  /** 草稿、在途操作或未知回执要求保留实例。 */
  get pending(): boolean {return this.#busy || this.#uncertain || this.writable.some(view => view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())}
  /** 未知回执须显式重读核验。 */
  get requiresVerification(): boolean {return this.#uncertain}
  private get writable(): readonly DataView[] {return [this.interfaces, this.parameters, this.headers]}

  /** 读取服务商方案；discard明确丢弃本领域草稿并核验。 */
  async load(discard = false): Promise<void> {
    if (this.#busy || this.pending && !discard) throw new Error('请先处理接口修改或等待核验')
    this.#busy = true
    try {
      if (discard) for (const view of this.writable) view.discardPendingChanges()
      this.interfaces.setSelectedRows([]); this.interfaces.setCurrentRow(null)
      await this.read(this.provider); this.assertScope()
      for (const view of [this.accounts, this.publicParameters, this.interfaces, ...['request', 'ContentType', '接口参数类型', 'ParamType'].map(name => this.view(name))]) await this.read(view)
      this.assertScope(); this.#uncertain = false
    } finally {this.#busy = false}
  }
  /** 拒绝未处理草稿后切换；子定义范围由原生值级联确定。 */
  async select(id: string): Promise<void> {
    this.assertEditable()
    if (this.pending) throw new Error('请先保存或放弃当前接口修改')
    const row = this.interfaces.rows.find(candidate => this.interfaces.getPkKey(candidate) === id)
    if (row?.['ProviderID'] !== this.#input.providerId || this.interfaces.fieldAccess(row, 'rowid').read !== 'visible') throw new Error('接口不在当前可读范围')
    this.#busy = true
    try {this.interfaces.setCurrentRow(row); this.interfaces.setSelectedRows([row]); await this.readChildren(); this.assertScope()}
    finally {this.#busy = false}
  }
  /** 新建本地接口；主定义先保存，才能新增持久子定义。 */
  async addInterface(): Promise<void> {
    this.assertEditable()
    if (this.pending) throw new Error('请先处理当前接口修改')
    if (this.interfaces.addActionState() !== 'enabled') throw new Error('当前查询不允许新增接口')
    const row = await this.interfaces.addRow({ProviderID: this.#input.providerId, Name: '', LinkUrl: ''})
    this.interfaces.setCurrentRow(row); this.interfaces.setSelectedRows([row]); await this.readChildren()
  }
  /** 新增固定归属的输入或头部定义。 */
  async add(section: 'parameters' | 'headers'): Promise<void> {
    this.assertEditable()
    const id = this.currentId(), view = this[section]
    if (this.interfaces.dirtyTracking.pendingCreateIds.has(id)) throw new Error('请先保存接口主定义')
    if (view.addActionState() !== 'enabled') throw new Error('当前查询不允许新增定义')
    const row = await view.addRow(section === 'parameters' ? {pid: id, parname: '', pardesc: '', parzdtype: ''} : {interfaceId: id, ParamName: '', ParamDesc: '', ValueFun: ''})
    view.setCurrentRow(row)
  }
  /** 头部按当次删除许可暂存删除，交由原生保存复核。 */
  async removeHeader(): Promise<void> {
    this.assertEditable()
    const row = this.headers.currentRow, id = row && this.headers.getPkKey(row)
    if (!row || id === undefined || id === null) throw new Error('请先选择头部')
    if (!this.headers.dirtyTracking.pendingCreateIds.has(id) && this.headers.deleteActionState(row) !== 'enabled') throw new Error('当前查询不允许删除头部')
    await this.headers.removeRow(id)
  }
  /** 只保存选定定义域；函数引用核已保存定义，旧字段保留，未知回执不重放。 */
  async save(section: 'definition' | 'parameters' | 'headers'): Promise<void> {
    this.assertEditable()
    const view = section === 'definition' ? this.interfaces : this[section], id = this.currentId()
    const newlyCreated = section === 'definition' && view.dirtyTracking.pendingCreateIds.has(id)
    if (section !== 'definition' && this.interfaces.dirtyTracking.pendingCreateIds.has(id)) throw new Error('请先保存接口主定义')
    const snapshot = () => JSON.stringify([view.rows.map(row => {
      const key = view.getPkKey(row)
      if (key === undefined) throw new Error('定义缺少主键')
      return [key, view.getEditingRow(key), view.getDirtyChanges(key)]
    }), [...view.dirtyTracking.pendingCreateIds], [...view.dirtyTracking.pendingDeleteIds]])
    const checked = snapshot()
    this.#busy = true
    try {
      const inputs = await this.inputReferences.queryOptionRows({fields: ['parname', 'pardesc']})
      const publics = await this.publicParameters.queryOptionRows({fields: ['paramName', 'desc']})
      const context: DataViewFilterFunctionContext = {capabilities: ['huoshan'],
        inputParams: inputs.map(row => ({value: String(row['parname']), label: String(row['pardesc'] ?? row['parname'])})),
        apiPublicParams: publics.map(row => ({value: String(row['paramName']), label: String(row['desc'] ?? row['paramName'])}))}
      this.validate(view, section, context); this.assertScope()
      if (checked !== snapshot()) throw new Error('定义在校验期间发生变化，请重新保存')
      if (!view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges()) return
      try {
        const result = await this.#input.dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
        if (!result.success) throw new Error(result.message ?? '接口方案保存未完整确认')
        await this.read(view)
        if (section === 'definition') {view.setCurrentRowById(id); if (view.currentRow) view.setSelectedRows([view.currentRow])}
        if (newlyCreated) await this.readChildren()
        if (section === 'parameters') await this.read(this.inputReferences)
        this.assertScope()
      } catch (cause) {this.#uncertain = true; throw cause}
    } finally {this.#busy = false}
  }
  /** 明确取消本领域草稿，不修改正式记录。 */
  discard(): void {this.assertEditable(); for (const view of this.writable) view.discardPendingChanges()}

  private validate(view: DataView, section: string, context: DataViewFilterFunctionContext): void {
    if (section !== 'headers' && view.dirtyTracking.pendingDeleteIds.size) throw new Error('接口或输入删除须先核完整引用，当前不能提交')
    const allowed = section === 'definition' ? ['Name', 'AccountName', 'ContentType', 'request', 'LinkUrl', 'Desc', 'paramType', 'GetParamStr', 'FormDataParam', 'BodyParamJsonStr', 'resultPath', 'requiresAuth']
      : section === 'parameters' ? ['parname', 'pardesc', 'parzdtype'] : ['ParamName', 'ParamDesc', 'ValueFun']
    const scopeField = section === 'definition' ? 'ProviderID' : section === 'parameters' ? 'pid' : 'interfaceId'
    const scopeValue = section === 'definition' ? this.#input.providerId : this.currentId()
    for (const original of view.rows) {
      const id = view.getPkKey(original)
      if (id === undefined) throw new Error('定义缺少主键')
      const row = view.getEditingRow(id)
      if (!row) throw new Error('编辑定义已失效')
      const created = view.dirtyTracking.pendingCreateIds.has(id)
      const changes = new Set([...Object.keys(view.getEditingPatch(id) ?? {}), ...Object.keys(view.getDirtyChanges(id))])
      if (!created && !changes.size) continue
      if (row[scopeField] !== scopeValue || section === 'definition' && id !== this.currentId()) throw new Error('定义归属或目标已变化')
      if (created && view.addActionState() !== 'enabled') throw new Error('当前查询不允许新增定义')
      for (const field of changes) {
        if (created && [scopeField, section === 'parameters' ? 'parid' : 'rowid'].includes(field)) continue
        if (!allowed.includes(field)) throw new Error(`方案保存不接受字段 ${field}`)
        if (view.fieldAccess(row, field).write !== 'allowed') throw new Error(`当前查询不允许修改 ${field}`)
      }
      const name = section === 'definition' ? 'Name' : section === 'parameters' ? 'parname' : 'ParamName'
      if ((created || changes.has(name)) && (typeof row[name] !== 'string' || !row[name].trim())) throw new Error('请填写定义名称')
      if (created || changes.has(name)) {
        const matches = view.rows.filter(candidate => {
          const key = view.getPkKey(candidate)
          return key !== undefined && view.getEditingRow(key)?.[name] === row[name]
        })
        if (matches.length !== 1) throw new Error('定义名称重复，请使用唯一名称')
      }
      if (section === 'parameters' && !created && changes.has('parname') && row['parname'] !== original['parname']) throw new Error('输入重命名须先核接口、头部和下游引用')
      if (section === 'definition' && (created || changes.has('LinkUrl')) && (typeof row['LinkUrl'] !== 'string' || !row['LinkUrl'].trim())) throw new Error('请填写接口路径')
      for (const [field, table] of [['request', 'request'], ['paramType', '接口参数类型'], ['ContentType', 'ContentType'], ['parzdtype', 'ParamType']] as const) {
        if (allowed.includes(field) && (created || changes.has(field)) && (row[field] !== undefined && row[field] !== null && row[field] !== '' || field === 'request' || field === 'parzdtype')) this.checkOption(this.view(table), row[field], 'val')
      }
      if (changes.has('AccountName') && row['AccountName'] !== '' && row['AccountName'] !== null && row['AccountName'] !== undefined) this.checkOption(this.accounts, row['AccountName'], 'rowid')
      if (changes.has('requiresAuth') && row['requiresAuth'] !== 0 && row['requiresAuth'] !== 1) throw new Error('认证标记必须为0或1')
      for (const field of ['GetParamStr', 'FormDataParam', 'BodyParamJsonStr']) if (changes.has(field)) this.validateJson(row[field], context, field === 'GetParamStr')
      if (changes.has('ValueFun') || section === 'headers' && created) this.validateFunction(row['ValueFun'], context)
    }
  }
  private validateFunction(raw: unknown, context: DataViewFilterFunctionContext): void {
    if (typeof raw !== 'string') throw new Error('值函数必须保存为文本')
    let value: unknown
    try {value = JSON.parse(raw)} catch {return}
    if (value === null || typeof value !== 'object' || !('Type' in value)) return
    const parsed = DataViewFilter.parse({field: 'value', operator: 'eq', value})
    if (!parsed.ok) throw new Error(parsed.issues.map(issue => issue.message).join('\n'))
    const issues = parsed.value.validate({fields: [{name: 'value', type: 'text'}], valueFunctions: context})
    if (issues.length) throw new Error(issues.map(issue => issue.message).join('\n'))
  }
  private validateJson(raw: unknown, context: DataViewFilterFunctionContext, objectOnly: boolean): void {
    if (raw === '' || raw === null || raw === undefined) return
    if (typeof raw !== 'string') throw new Error('请求方案必须保存为JSON文本')
    let value: unknown
    try {value = JSON.parse(raw)} catch {throw new Error('请求方案不是有效JSON')}
    if (value === null || typeof value !== 'object' || objectOnly && Array.isArray(value)) throw new Error('请求方案须为JSON对象或受支持的数组')
    const visit = (node: unknown): void => {
      if (typeof node === 'string') this.validateFunction(node, context)
      else if (node !== null && typeof node === 'object') Object.values(node).forEach(visit)
    }
    visit(value)
  }
  private checkOption(view: DataView, value: unknown, field: string): void {
    if (view.rows.filter(row => row[field] === value && view.fieldAccess(row, field).read === 'visible').length !== 1) throw new Error(`${field}引用不在当前可读候选中或不唯一`)
  }
  private currentId(): string {
    const row = this.interfaces.currentRow, id = row && this.interfaces.getPkKey(row)
    if (typeof id !== 'string' || !id) throw new Error('请先选择接口')
    return id
  }
  private async readChildren(): Promise<void> {for (const view of [this.parameters, this.headers, this.outputs, this.inputReferences]) await this.read(view)}
  private async read(view: DataView): Promise<void> {await view.refresh(); if (view.loadingError) throw view.loadingError}
  private view(name: string, viewId = 'default'): DataView {const view = this.#input.dataSet.getView(name, viewId); if (!view) throw new Error(`接口方案缺少视图 ${name}@${viewId}`); return view}
  private assertEditable(): void {if (this.#busy || this.#uncertain) throw new Error('接口方案提交或核验尚未结束'); this.assertScope()}
  private assertScope(): void {
    const row = this.provider.rows[0]
    if (this.#input.dataSet.destroyed || this.#input.context.destroyed || this.provider.rows.length !== 1 || row?.['rowid'] !== this.#input.providerId || this.provider.fieldAccess(row, 'rowid').read !== 'visible') throw new Error('服务商身份已失效')
    for (const [view, field] of [[this.interfaces, 'ProviderID'], [this.accounts, 'ProviderID'], [this.publicParameters, 'providerId']] as const) {
      for (const item of view.rows) if (item[field] !== this.#input.providerId || view.fieldAccess(item, field).read !== 'visible') throw new Error('接口方案归属范围不一致')
    }
    const current = this.interfaces.currentRow
    if (current) {
      const id = this.interfaces.getPkKey(current)
      for (const [view, field] of [[this.parameters, 'pid'], [this.headers, 'interfaceId'], [this.outputs, 'tblid'], [this.inputReferences, 'pid']] as const) {
        for (const item of view.rows) if (item[field] !== id || view.fieldAccess(item, field).read !== 'visible') throw new Error('子定义不在当前接口范围')
      }
    }
  }
}
