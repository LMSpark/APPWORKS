/**
 * @module app:lowcode/resources/structured-config/dimension-source/event-editor
 * 职责：已保存数据模型来源绑定的“维护数据模型事件”owner：按绑定事件编码装载唯一事件合同（Bil_Dimension_Rule_Template），
 *   核验来源绑定与正式模型、模板编码唯一及规则/绑定引用约束，以一次 DataSet 保存提交。
 * 边界：只服务 data-model 来源且事件编码不属于平台注册事件；内置事件合同不可修改。业务分类与来源字段候选、必填与不可变由 pagedata
 *   列规则承担，启用事件的业务日期字段由场景模型规则承担；正式模型与主键经同一 PageRuntime 中 7AB 的候选视图读取。不维护规则本身。
 * AI用途：调整数据模型事件合同约束时在此修改，页面只负责打开、表单绑定与提示。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import type {DimensionSourceSavedBinding} from './binding-editor'
import {isPlatformEventCode} from './source-contracts'
import {assertReadable, bit, catalogView, changed, columnValue, normalized, refreshView, requireView, saveDimensionSourceViews, text,
  type DimensionSourceTarget, type FieldKind, type Id} from './view-support'

const TEMPLATE_TABLE = 'Bil_Dimension_Rule_Template'
const BINDING_TABLE = 'Bil_Dimension_Source_Binding'
const CONTRACT_KINDS: Readonly<Record<string, FieldKind>> = {
  template_code: 'text', biz_category: 'text', source_table: 'text', source_pk_field: 'text', biz_no_field: 'text', biz_date_field: 'text', status: 'bit',
}
const CONTRACT_FIELDS = ['template_code', 'biz_category', 'source_table', 'source_pk_field', 'biz_no_field', 'biz_date_field'] as const

/** 事件编辑器装配输入。 */
export type DimensionSourceEventEditorInput = Readonly<{
  /** 维度设计场景（88A4）运行 DataSet；须与 7AB 同处一个 PageRuntime。 */
  dataSet: DataSet
  /** 本次编辑的正式目标。 */
  target: DimensionSourceTarget
  /** 已保存且无草稿的数据模型来源绑定。 */
  binding: DimensionSourceSavedBinding
}>

type EventSource = Readonly<{eventCode: string; metaName: string; primaryKey: string}>

/** 数据模型事件合同编辑器；一次实例只服务一个来源绑定。 */
export class DimensionSourceEventEditor {
  /** 按事件编码编辑的事件合同 DataView（editByEvent）。 */
  readonly template: DataView
  /** 已启用业务分类候选（Biz_Category.enabled）。 */
  readonly categories: DataView
  /** 当前模型正式输出字段候选（7AB，值为输出名）。 */
  readonly outputFields: DataView
  readonly #input: DimensionSourceEventEditorInput
  readonly #byCode: DataView
  readonly #rules: DataView
  readonly #bindingById: DataView
  readonly #bindingsByEvent: DataView
  readonly #models: DataView
  readonly #primaryFields: DataView
  #eventId: Id | undefined
  #persisted: Readonly<Record<string, string | number>> | undefined

  constructor(input: DimensionSourceEventEditorInput) {
    this.#input = input
    const {dataSet} = input
    this.template = requireView(dataSet, TEMPLATE_TABLE, 'editByEvent')
    this.#byCode = requireView(dataSet, TEMPLATE_TABLE, 'byTemplateCode')
    this.#rules = requireView(dataSet, 'Bil_Dimension_Rule', 'byEvent')
    this.#bindingById = requireView(dataSet, BINDING_TABLE, 'byId')
    this.#bindingsByEvent = requireView(dataSet, BINDING_TABLE, 'validationByEvent')
    this.categories = requireView(dataSet, 'Bil_Dimension_Biz_Category', 'enabled')
    this.outputFields = catalogView(dataSet, 'Base_DataModel_Field', 'dimensionSourceFieldNames')
    this.#models = catalogView(dataSet, 'Base_DataModel', 'dimensionSourceModels')
    this.#primaryFields = catalogView(dataSet, 'Base_DataModel_Field', 'dimensionCollectionPrimaryFields')
  }

  /** 当前事件合同行 ID；未装载时为 undefined。 */
  get eventId(): Id | undefined { return this.#eventId }

  /** 当前为新建事件合同。 */
  get isNew(): boolean { return this.#persisted === undefined }

  /** 存在保存结果未知的提交。 */
  get unknown(): boolean { return this.template.hasUnconfirmedSave }

  /** 事件合同表单字段。 */
  formFields(): readonly string[] {
    return ['template_code', 'template_name', 'biz_category', 'priority', 'status', 'biz_no_field', 'biz_date_field', 'description']
  }

  hasDraft(): boolean {
    const id = this.#eventId
    return id !== undefined && changed(this.template, id)
  }

  /** 复核来源绑定与正式模型后装载唯一事件合同；不存在时新增草稿。 */
  async load(): Promise<void> {
    const source = await this.#verifyBinding()
    this.template.queryContext = {eventCode: source.eventCode}
    await this.#refresh(this.template)
    const exact = this.template.rows.filter(row => {
      assertReadable(this.template, row, ['rowid', 'event_code', 'source_table', 'builtin_flag', ...Object.keys(CONTRACT_KINDS)])
      return text(row['event_code']) === source.eventCode
    })
    if (exact.length > 1) throw new Error(`维度事件合同必须唯一：${source.eventCode}`)
    const existing = exact[0]
    if (existing) {
      if (text(existing['source_table']) && text(existing['source_table']) !== source.metaName) throw new Error(`现有事件来源资源与当前正式模型不一致：${source.metaName}`)
      if (bit(existing['builtin_flag']) === 1) throw new Error(`内置事件合同不能由数据模型事件编辑器修改：${source.eventCode}`)
      this.#eventId = this.template.getPkKey(existing)
      this.#persisted = this.#snapshot(existing)
    } else {
      const row = await this.template.addRow({template_code: source.eventCode, template_name: '', event_code: source.eventCode, biz_category: '',
        source_table: source.metaName, source_pk_field: source.primaryKey, biz_no_field: '', biz_date_field: '',
        priority: columnValue(this.template, 'priority', 0), status: columnValue(this.template, 'status', false), description: '',
        builtin_flag: columnValue(this.template, 'builtin_flag', false), voucher_required: columnValue(this.template, 'voucher_required', false),
        auto_voucher_write: columnValue(this.template, 'auto_voucher_write', false), stop_after_match: columnValue(this.template, 'stop_after_match', true)})
      this.#input.target.assertCurrent()
      this.#eventId = this.template.getPkKey(row)
      this.#persisted = undefined
    }
    if (this.#eventId === undefined) throw new Error('维度事件合同缺少唯一身份')
    this.template.setCurrentRowById(this.#eventId)
    this.outputFields.queryContext = {modelId: this.#input.binding.modelId}
    await this.#refresh(this.categories)
    await this.#refresh(this.outputFields)
  }

  /** 业务核验后以一次 DataSet 保存提交事件合同并回读；无修改返回 false。保存结果未知时重试只核验原提交。 */
  async save(): Promise<boolean> {
    const {dataSet, target} = this.#input
    const id = this.#requireEvent()
    if (!this.unknown) await this.#validate(id)
    if (!await saveDimensionSourceViews({dataSet, targets: [{view: this.template, ids: [id]}], label: '数据模型事件', assertCurrent: target.assertCurrent})) return false
    const row = this.template.rows.find(item => this.template.getPkKey(item) === id)
    if (!row) throw new Error(`数据模型事件已提交，但回读核验失败：记录 ${String(id)} 未回读`)
    this.#persisted = this.#snapshot(row)
    return true
  }

  /** 丢弃事件合同草稿；保存结果未知时拒绝。 */
  discard(): void {
    if (this.unknown) throw new Error('存在保存结果未知的数据模型事件提交，请先重试保存核验')
    if (this.#eventId !== undefined) this.template.discardPendingChanges([this.#eventId])
  }

  async #refresh(view: DataView): Promise<void> {
    await refreshView(view, this.#input.target.assertCurrent)
  }

  #requireEvent(): Id {
    if (this.#eventId === undefined) throw new Error('数据模型事件尚未装载')
    return this.#eventId
  }

  #snapshot(row: Readonly<Record<string, unknown>>): Readonly<Record<string, string | number>> {
    return Object.fromEntries(Object.entries(CONTRACT_KINDS).map(([field, kind]) => [field, normalized(kind, row[field])]))
  }

  /** 复核绑定唯一、属于当前节点且仍为该数据模型来源；模型须属于节点数据空间并有唯一正式主键。 */
  async #verifyBinding(): Promise<EventSource> {
    const {binding, target} = this.#input
    if (binding.sourceKind !== 'data-model') throw new Error(`维度来源绑定不是当前数据模型来源：${binding.id}`)
    this.#bindingById.queryContext = {bindingId: binding.id}
    await this.#refresh(this.#bindingById)
    const row = this.#bindingById.rows[0]
    if (this.#bindingById.rows.length !== 1 || !row || text(row['id']) !== binding.id) throw new Error(`维度来源绑定必须完整且唯一：${binding.id}`)
    assertReadable(this.#bindingById, row, ['source_kind', 'source_application_id', 'source_node_id', 'source_model_id', 'source_model_meta_name', 'event_code'])
    if (text(row['source_kind']) !== 'data-model') throw new Error(`维度来源绑定不是当前数据模型来源：${binding.id}`)
    if (text(row['source_application_id']) !== target.applicationId || text(row['source_node_id']) !== target.nodeId) {
      throw new Error('维度来源绑定与当前蓝图应用或节点不一致')
    }
    if (text(row['source_model_id']) !== binding.modelId) throw new Error('维度来源绑定与当前选定模型不一致')
    const eventCode = text(row['event_code'])
    if (eventCode !== binding.eventCode) throw new Error('维度来源绑定事件编码已变化，请刷新后重试')
    if (isPlatformEventCode(eventCode)) throw new Error(`事件编码属于平台注册事件，不能作为数据模型事件维护：${eventCode}`)
    const metaName = text(row['source_model_meta_name'])
    const models = await this.#models.queryOptionRows({fields: ['rowid', 'Name'], context: {dataSetId: target.dataSpaceId}})
    target.assertCurrent()
    const model = models.find(item => text(item['rowid']) === binding.modelId)
    if (!model || text(model['Name']) !== metaName) throw new Error(`当前蓝图节点未绑定维度来源模型：${metaName}`)
    const primaries = await this.#primaryFields.queryOptionRows({fields: ['rowid', 'canonicalName'], context: {modelId: binding.modelId}})
    target.assertCurrent()
    const primary = primaries.length === 1 ? text(primaries[0]?.['canonicalName']) : ''
    if (!primary) throw new Error(`模型 ${metaName} 缺少唯一正式主键输出`)
    return {eventCode, metaName, primaryKey: primary}
  }

  /** 模板编码全局唯一；已有规则或其它来源引用时不能变更合同字段，存在启用规则时不能停用。来源资源与主键按正式模型写回。 */
  async #validate(id: Id): Promise<void> {
    const source = await this.#verifyBinding()
    const row = this.template.getEditingRow(id)
    if (!row) throw new Error('维度事件合同已不存在')
    if (text(row['event_code']) !== source.eventCode) throw new Error('提交事件编码与当前来源绑定不一致')
    const derived: ReadonlyArray<readonly [string, string]> = [['source_table', source.metaName], ['source_pk_field', source.primaryKey],
      ...(this.#persisted ? [] : [['template_category', text(row['biz_category'])] as const])]
    for (const [field, value] of derived) {
      if (text(row[field]) !== value) this.template.updateEditingValue(id, field, value)
    }
    const templateCode = text(row['template_code'])
    if (templateCode) {
      this.#byCode.queryContext = {templateCode}
      await this.#refresh(this.#byCode)
      if (this.#byCode.rows.some(item => text(item['template_code']) === templateCode && this.#byCode.getPkKey(item) !== id)) {
        throw new Error(`template_code 已存在：${templateCode}`)
      }
    }
    const persisted = this.#persisted
    if (persisted) {
      const next = this.#snapshot(this.template.getEditingRow(id) ?? {})
      const contractChanged = CONTRACT_FIELDS.some(field => next[field] !== persisted[field])
      this.#rules.queryContext = {eventCode: source.eventCode}
      this.#bindingsByEvent.queryContext = {eventCode: source.eventCode}
      await this.#refresh(this.#rules)
      await this.#refresh(this.#bindingsByEvent)
      const others = this.#bindingsByEvent.rows.filter(item => text(item['id']) !== this.#input.binding.id)
      if (contractChanged && (this.#rules.rows.length || others.length)) {
        throw new Error(`事件合同已有规则或其它来源引用，不能变更业务分类或来源字段：${source.eventCode}`)
      }
      if (next['status'] === 0 && persisted['status'] === 1 && this.#rules.rows.some(rule => bit(rule['status']) === 1)) {
        throw new Error(`事件存在启用规则引用，不能停用：${source.eventCode}`)
      }
    }
    this.#input.target.assertCurrent()
  }
}
