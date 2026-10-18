/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/external-api/api-provider-design
 * 职责：外部服务商基础定义的业务校验与维护流程。
 * 边界：消费正式DataView的编辑和权限，通过DataSet保存；不发HTTP、不持有行副本、不执行外部接口。
 * AI用途：标准表单绑定definition，目录和接口调用不参与基础定义提交。
 */
import {DataViewFilter, type DataSet, type DataView} from '@spark-appworks/spark-data'

/** 基础设计实例只接受已装配空间及一个确定的服务商身份。 */
type ApiProviderDesignInput = Readonly<{
  /** 正式服务商模型及定义视图所在的运行空间。 */
  dataSet: DataSet
  /** 本次唯一服务商rowid；新建也先核查询授权与身份冲突。 */
  providerId: string
  /** 显式新建，不能将已有记录当作新增草稿。 */
  create?: boolean
}>

/** 基础信息独立提交，回执未知后必须回原身份重读，不能自动重放。 */
export class ApiProviderDesign {
  /** 标准表单绑定的定义视图，Name与BaseURL的唯一编辑真源。 */
  readonly definition: DataView
  readonly #input: ApiProviderDesignInput
  #creating: boolean
  #creationSubmitted = false
  #busy = false
  #uncertain = false

  /** 限定定义视图的正式查询范围，过滤/重查始终消费同一providerId。 */
  constructor(input: ApiProviderDesignInput) {
    if (!input.providerId.trim() || input.providerId !== input.providerId.trim()) throw new Error('服务商身份不能为空或包含首尾空白')
    const definition = input.dataSet.getView('Base_InterfaceProvider', 'definition')
    if (!definition) throw new Error('服务商空间缺少基础定义视图')
    this.#input = input; this.definition = definition; this.#creating = input.create === true
    definition.configure({commitMode: 'staged', filterExpression: DataViewFilter.condition({field: 'rowid', operator: 'eq', value: input.providerId}).toJSON()})
  }

  /** 本地草稿、在途提交或待核回执均须阻止误关。 */
  get pending(): boolean {return this.#busy || this.#uncertain || this.definition.hasEditingChanges() || this.definition.dirtyTracking.hasPendingChanges()}
  /** 保存回执不确定时仅允许显式重读，不允许再次提交。 */
  get requiresVerification(): boolean {return this.#uncertain}

  /** 首次读取或显式放弃草稿后重读；新建先取得正式空查询的新增授权。 */
  async load(discard = false): Promise<void> {
    if (this.#busy || this.pending && !discard) throw new Error('请先处理服务商修改或等待提交核验')
    this.#busy = true
    try {
      if (discard) this.definition.discardPendingChanges()
      const result = await this.definition.loadFromServer({singleFlight: false})
      if (!result.success) throw new Error(result.message ?? '服务商基础信息读取失败')
      if (this.#creating && this.definition.rows.length > 0 && !this.#creationSubmitted) throw new Error('服务商身份已存在，不能覆盖创建')
      if (this.#creating && this.definition.rows.length === 0) {
        if (this.definition.addActionState() !== 'enabled') throw new Error('当前查询不允许新增服务商')
        await this.definition.addRow({rowid: this.#input.providerId, Name: '', BaseURL: ''})
      } else this.#creating = false
      this.assertIdentity()
      this.definition.setCurrentRowById(this.#input.providerId)
      this.#uncertain = false
    } finally {this.#busy = false}
  }

  /** 只保存本次服务商的基础定义字段；校验失败保留草稿，已发请求失败须重读。 */
  async save(): Promise<void> {
    if (this.#busy || this.#uncertain) throw new Error('服务商提交或结果核验尚未结束')
    this.assertIdentity()
    const id = this.#input.providerId, view = this.definition
    const row = view.getEditingRow(id)
    if (!row) throw new Error('服务商编辑身份已失效')
    const changes = new Set([...Object.keys(view.getEditingPatch(id) ?? {}), ...Object.keys(view.getDirtyChanges(id))])
    if (view.dirtyTracking.pendingDeleteIds.size) throw new Error('基础信息保存不接受删除')
    for (const name of changes) if (!['rowid', 'Name', 'BaseURL'].includes(name)) throw new Error(`基础信息保存不接受字段 ${name}`)
    if (this.#creating && view.addActionState() !== 'enabled') throw new Error('当前查询不允许新增服务商')
    for (const [field, title] of [['Name', '服务提供商名称'], ['BaseURL', 'API 基础 URL']] as const) {
      if (!this.#creating && !changes.has(field)) continue
      if (view.fieldAccess(row, field).write !== 'allowed') throw new Error(`当前查询不允许修改 ${title}`)
      const value = row[field]
      if (typeof value !== 'string' || !value.trim()) throw new Error(`请填写${title}`)
      if (value !== value.trim()) view.updateEditingValue(id, field, value.trim())
    }
    if (!this.pending) return
    this.#busy = true
    try {
      this.#creationSubmitted ||= this.#creating
      const result = await this.#input.dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
      if (!result.success) throw new Error(result.message ?? '服务商保存未完整确认')
      this.#creating = false
    } catch (error) {this.#uncertain = true; throw error}
    finally {this.#busy = false}
    try {await this.load()} catch (error) {this.#uncertain = true; throw error}
  }

  /** 明确取消本地编辑；未知回执和在途请求不能被当作取消服务器写入。 */
  discard(): void {
    if (this.#busy || this.#uncertain) throw new Error('请等待提交或先重读核验')
    this.definition.discardPendingChanges()
  }

  private assertIdentity(): void {
    const row = this.definition.rows[0]
    if (this.definition.rows.length !== 1 || row?.['rowid'] !== this.#input.providerId
      || this.definition.fieldAccess(row, 'rowid').read !== 'visible') throw new Error('服务商查询身份不唯一或与本次目标不一致')
  }
}
