/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/external-api/api-public-parameter-design
 * 职责：外部接口公共参数定义的身份、引用和保存范围校验。
 * 边界：标准组件直接编辑DataView，查询/级联/权限/提交复用spark-data；不调用外部接口。
 * AI用途：方案配置保存interfaceId和输出字段名，账号数据不参与本次提交。
 */
import {DataViewFilter, type DataSet, type DataView, type DataRow} from '@spark-appworks/spark-data'

/** 公共参数方案只维护一个服务商的正式定义记录。 */
type ApiPublicParameterDesignInput = Readonly<{
  /** 正式元模型与命名视图已装配的配置空间。 */
  dataSet: DataSet
  /** 正式服务商rowid，不是空间身份。 */
  providerId: string
}>

/** 公共参数经已保存接口方案取值；定义与真实调用数据分别维护。 */
export class ApiPublicParameterDesign {
  /** 只读服务商上下文，为接口候选提供父值。 */
  readonly provider: DataView
  /** 列表和表单共同绑定的方案视图，持有全部草稿。 */
  readonly parameters: DataView
  readonly #input: ApiPublicParameterDesignInput
  #busy = false
  #uncertain = false

  /** 固定归属过滤，重查始终沿本次服务商身份。 */
  constructor(input: ApiPublicParameterDesignInput) {
    if (!input.providerId.trim() || input.providerId !== input.providerId.trim()) throw new Error('服务商身份无效')
    this.#input = input
    this.provider = this.view('Base_InterfaceProvider')
    this.parameters = this.view('Base_Interface_PublicParam')
    for (const [view, field] of [[this.provider, 'rowid'], [this.parameters, 'providerId']] as const) {
      view.configure({filterExpression: DataViewFilter.condition({field, operator: 'eq', value: input.providerId}).toJSON()})
    }
  }

  /** 在途操作、草稿及未知回执都需要由宿主保留当前实例。 */
  get pending(): boolean {return this.#busy || this.#uncertain || this.parameters.hasEditingChanges() || this.parameters.dirtyTracking.hasPendingChanges()}
  /** 未确认提交后只允许显式重读，不能重放写入。 */
  get requiresVerification(): boolean {return this.#uncertain}

  /** 首次加载或显式取消后重读，不把未找到的服务商伪造为可编辑记录。 */
  async load(discard = false): Promise<void> {
    if (this.#busy || this.pending && !discard) throw new Error('请先处理公共参数修改或等待核验')
    this.#busy = true
    try {
      if (discard) await this.parameters.discardAndReload()
      const result = await this.provider.loadFromServer({singleFlight: false})
      if (!result.success) throw new Error(result.message ?? '服务商读取失败')
      this.assertProvider()
      this.provider.setCurrentRowById(this.#input.providerId)
      const parameters = await this.parameters.loadFromServer({singleFlight: false})
      if (!parameters.success) throw new Error(parameters.message ?? '公共参数读取失败')
      this.assertParameterScope()
      this.#uncertain = false
    } finally {this.#busy = false}
  }

  /** 在正式空查询的新增授权下创建定义草稿，归属固定为当前服务商。 */
  async add(): Promise<void> {
    this.assertEditable()
    if (this.parameters.addActionState() !== 'enabled') throw new Error('当前查询不允许新增公共参数')
    const row = await this.parameters.addRow({providerId: this.#input.providerId, paramName: '', desc: '', interfaceId: '', outputfield: ''})
    const id = this.parameters.getPkKey(row)
    if (id === undefined) throw new Error('新增公共参数缺少身份')
    this.parameters.setCurrentRowById(id)
  }

  /** 只提交公共参数定义；失效引用保留供修正，不自动清空或选择第一项。 */
  async save(): Promise<void> {
    this.assertEditable()
    this.assertParameterScope()
    const view = this.parameters, names = new Set<string>(), displayUpdates = new Map<string | number, DataRow>()
    if (view.dirtyTracking.pendingDeleteIds.size) throw new Error('公共参数删除尚需完整引用核验')
    // 异步引用校验只对这一刻的草稿有效；临时指纹不成为第二份编辑数据。
    const snapshot = (): string => JSON.stringify(view.rows.map(row => {
      const id = view.getPkKey(row)
      return [id, id === undefined ? null : view.getEditingRow(id), id !== undefined && view.dirtyTracking.pendingCreateIds.has(id)]
    }))
    const checked = snapshot()
    this.#busy = true
    try {
      for (const original of view.rows) {
        const id = view.getPkKey(original)
        if (id === undefined) throw new Error('公共参数缺少身份')
        const row = view.getEditingRow(id)
        if (row?.['providerId'] !== this.#input.providerId) throw new Error('公共参数归属范围不一致')
        const created = view.dirtyTracking.pendingCreateIds.has(id)
        const changed = new Set([...Object.keys(view.getEditingPatch(id) ?? {}), ...Object.keys(view.getDirtyChanges(id))])
        if (view.fieldAccess(original, 'paramName').read !== 'visible') throw new Error('公共参数名称不可读，不能核验重复')
        const name = row['paramName']
        if (typeof name !== 'string' || !name.trim() || name !== name.trim()) throw new Error('参数名称不能为空或包含首尾空白')
        if (names.has(name)) throw new Error(`公共参数名称重复: ${name}`)
        names.add(name)
        if (!created && !changed.size) continue
        for (const field of changed) {
          if (!['rowid', 'providerId', 'paramName', 'desc', 'interfaceId', 'outputfield'].includes(field)) throw new Error(`公共参数方案不接受字段 ${field}`)
          if (!created && ['rowid', 'providerId', 'paramName'].includes(field)) throw new Error('公共参数身份或重命名需要完整引用核验')
          if (!['rowid', 'providerId'].includes(field) && view.fieldAccess(row, field).write !== 'allowed') throw new Error(`当前查询不允许修改 ${field}`)
        }
        if (created && view.addActionState() !== 'enabled') throw new Error('当前查询不允许新增公共参数')
        if (created || changed.has('interfaceId') || changed.has('outputfield')) {
          const apiId = row['interfaceId'], output = row['outputfield']
          if (typeof apiId !== 'string' || !apiId) throw new Error('请选择取值接口')
          if (typeof output !== 'string' || !output) throw new Error('请选择输出字段')
          const interfaces = await this.view('Base_DataServiceInterface').queryOptionRows({fields: ['rowid', 'Name', 'LinkUrl'], context: {providerId: this.#input.providerId}})
          const matches = interfaces.filter(api => api['rowid'] === apiId), api = matches[0]
          if (matches.length !== 1 || !api) throw new Error('取值接口不属于当前可读服务商范围')
          const outputs = await this.view('Base_TblField').queryOptionRows({fields: ['enname'], context: {interfaceId: apiId}})
          if (outputs.filter(field => field['enname'] === output).length !== 1) throw new Error('输出字段不属于当前可读接口或名称不唯一')
          if (created || changed.has('interfaceId')) {
            if (typeof api['Name'] !== 'string' || typeof api['LinkUrl'] !== 'string') throw new Error('接口名称或访问地址缺失，不能保存显示信息')
            displayUpdates.set(id, {interfaceName: api['Name'], accessPath: api['LinkUrl']})
          }
        }
      }
      this.assertProvider()
      if (snapshot() !== checked || view.dirtyTracking.pendingDeleteIds.size) throw new Error('公共参数在校验期间发生变化，请重新保存')
      for (const [id, values] of displayUpdates) for (const [field, value] of Object.entries(values)) {
        const row = view.getEditingRow(id)
        if (!row || row[field] !== value && view.fieldAccess(row, field).write !== 'allowed') throw new Error(`当前查询不允许同步接口显示字段 ${field}`)
      }
      // 保留原字段给既有消费者；身份仍以interfaceId为准，显示信息取本次正式接口。
      for (const [id, values] of displayUpdates) for (const [field, value] of Object.entries(values)) {
        if (view.getEditingRow(id)?.[field] !== value) view.updateEditingValue(id, field, value)
      }
      if (!view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges()) return
      try {
        const saved = await this.#input.dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
        if (!saved.success) throw new Error(saved.message ?? '公共参数保存未完整确认')
      } catch (error) {this.#uncertain = true; throw error}
    } finally {this.#busy = false}
    try {await this.load()} catch (error) {this.#uncertain = true; throw error}
  }

  /** 明确取消本地定义草稿；未知回执不能当作服务器已回滚。 */
  discard(): void {this.assertEditable(); this.parameters.discardPendingChanges()}

  private view(tableName: string): DataView {
    const view = this.#input.dataSet.getView(tableName, 'default')
    if (!view) throw new Error(`公共参数空间缺少视图: ${tableName}`)
    return view
  }
  private assertEditable(): void {
    if (this.#busy || this.#uncertain) throw new Error('公共参数提交或结果核验尚未结束')
    this.assertProvider()
  }
  private assertProvider(): void {
    const row = this.provider.rows[0]
    if (this.provider.destroyed || this.#input.dataSet.destroyed || this.provider.rows.length !== 1
      || row?.['rowid'] !== this.#input.providerId || this.provider.fieldAccess(row, 'rowid').read !== 'visible') throw new Error('服务商不存在或查询范围不一致')
  }
  private assertParameterScope(): void {
    for (const row of this.parameters.rows) if (row['providerId'] !== this.#input.providerId
      || this.parameters.fieldAccess(row, 'providerId').read !== 'visible') throw new Error('公共参数查询范围不一致')
  }
}
