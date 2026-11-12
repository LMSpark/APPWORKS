/**
 * @module app:lowcode/resources/structured-config/dimension-source/event-editor
 * 职责：已保存数据模型来源绑定的“维护数据模型事件”owner：按绑定事件编码装载唯一事件合同（Bil_Dimension_Rule_Template），
 *   校验业务分类、来源字段与引用约束，单次保存并回读核验。
 * 边界：只服务 data-model 来源且事件编码不属于平台注册事件；内置事件合同不可修改；事件合同、规则、绑定与业务分类均经 88A4 DataView 读取，
 *   正式模型经数据空间设计 API 读取。不维护规则本身。
 * AI用途：调整数据模型事件合同约束时在此修改，页面只负责打开、表单绑定与提示。
 */
import {buildDataViewKey, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {DimensionSourceSavedBinding} from './binding-editor'
import {isPlatformEventCode} from './source-contracts'
import {assertColumns, assertReadable, bit, columnValue, DimensionSourceChangeSubmission, DimensionSourceOptionTables, normalized,
  pairEditing, readFormalModels, refreshView, requiredText, requireView, text, type DimensionSourceTarget, type FieldKind,
  type FormalModel, type Id} from './view-support'

const TEMPLATE_TABLE = 'Bil_Dimension_Rule_Template'
const BINDING_TABLE = 'Bil_Dimension_Source_Binding'
const EVENT_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  template_code: 'text', template_name: 'text', event_code: 'text', biz_category: 'text', source_table: 'text', source_pk_field: 'text',
  biz_no_field: 'text', biz_date_field: 'text', priority: 'number', status: 'bit', description: 'text',
}
const CREATE_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  ...EVENT_FIELD_KINDS, template_category: 'text', builtin_flag: 'bit', voucher_required: 'bit', auto_voucher_write: 'bit', stop_after_match: 'bit',
}
const CONTRACT_FIELDS = ['template_code', 'biz_category', 'source_table', 'source_pk_field', 'biz_no_field', 'biz_date_field'] as const

/** 事件编辑器装配输入。 */
export type DimensionSourceEventEditorInput = Readonly<{
  /** 维度设计场景（88A4）运行 DataSet。 */
  dataSet: DataSet
  /** 本次编辑的正式目标。 */
  target: DimensionSourceTarget
  /** 已保存且无草稿的数据模型来源绑定。 */
  binding: DimensionSourceSavedBinding
  /** 读取数据空间正式模型（含字段）。 */
  readModels: DataSpaceDesignApi['readModels']
}>

/** 数据模型事件合同编辑器；一次实例只服务一个来源绑定，关闭时须 dispose。 */
export class DimensionSourceEventEditor {
  /** 按事件编码编辑的事件合同 DataView（editByEvent）。 */
  readonly template: DataView
  /** 业务分类候选（Biz_Category.default）。 */
  readonly categories: DataView
  /** 当前模型正式输出字段候选 static-data DataView（主键 canonicalName）。 */
  readonly outputFieldOptions: DataView
  readonly #input: DimensionSourceEventEditorInput
  readonly #byCode: DataView
  readonly #rules: DataView
  readonly #bindingById: DataView
  readonly #bindingsByEvent: DataView
  readonly #options: DimensionSourceOptionTables
  readonly #submission: DimensionSourceChangeSubmission
  #model: FormalModel | undefined
  #eventId: Id | undefined
  #persisted: Readonly<Record<string, string | number>> | undefined

  constructor(input: DimensionSourceEventEditorInput) {
    this.#input = input
    const {dataSet, target} = input
    this.template = requireView(dataSet, TEMPLATE_TABLE, 'editByEvent')
    this.#byCode = requireView(dataSet, TEMPLATE_TABLE, 'byTemplateCode')
    this.#rules = requireView(dataSet, 'Bil_Dimension_Rule', 'byEvent')
    this.#bindingById = requireView(dataSet, BINDING_TABLE, 'byId')
    this.#bindingsByEvent = requireView(dataSet, BINDING_TABLE, 'validationByEvent')
    this.categories = requireView(dataSet, 'Bil_Dimension_Biz_Category', 'default')
    assertColumns(this.template, ['rowid', ...Object.keys(CREATE_FIELD_KINDS)], '维度事件合同')
    this.#options = new DimensionSourceOptionTables(dataSet, target)
    this.#submission = new DimensionSourceChangeSubmission(dataSet, '数据模型事件', target.assertCurrent)
    this.outputFieldOptions = this.#options.mount('DimensionSourceEventField', ['canonicalName', 'name', 'type'],
      () => (this.#model?.fields ?? []).filter(field => field.output).map(field => ({canonicalName: field.canonicalName, name: field.name, type: field.type})))
  }

  /** 视图在所属 PageRuntime 中的完整绑定键。 */
  viewKey(view: DataView): string {
    return buildDataViewKey(view.tableName, view.viewId, this.#input.dataSet.scenarioId)
  }

  /** 当前事件合同行 ID；未装载时为 undefined。 */
  get eventId(): Id | undefined { return this.#eventId }

  /** 当前为新建事件合同。 */
  get isNew(): boolean { return this.#persisted === undefined }

  /** 存在保存结果未知的提交。 */
  get unknown(): boolean { return this.#submission.unknown }

  /** 事件合同表单字段。 */
  formFields(): readonly string[] {
    return ['template_code', 'template_name', 'biz_category', 'priority', 'status', 'biz_no_field', 'biz_date_field', 'description']
  }

  hasDraft(): boolean {
    const id = this.#eventId
    return id !== undefined && (this.template.hasEditingChanges(id) || this.template.dirtyTracking.hasPendingChanges(id))
  }

  /** 复核来源绑定与正式模型后装载唯一事件合同；不存在时新增草稿。 */
  async load(): Promise<void> {
    const {eventCode, model} = await this.#verifyBinding()
    this.#model = model
    this.template.queryContext = {eventCode}
    await this.#refresh(this.template)
    const exact = this.template.rows.filter(row => {
      assertReadable(this.template, row, ['rowid', ...Object.keys(CREATE_FIELD_KINDS)])
      return text(row['event_code']) === eventCode
    })
    if (exact.length > 1) throw new Error(`维度事件合同必须唯一：${eventCode}`)
    const existing = exact[0]
    if (existing) {
      if (text(existing['source_table']) && text(existing['source_table']) !== model.metaName) throw new Error(`现有事件来源资源与当前正式模型不一致：${model.metaName}`)
      if (bit(existing['builtin_flag']) === 1) throw new Error(`内置事件合同不能由数据模型事件编辑器修改：${eventCode}`)
      this.#eventId = this.template.getPkKey(existing)
      this.#persisted = this.#snapshot(existing)
    } else {
      const row = await this.template.addRow({template_code: eventCode, template_name: '', event_code: eventCode, biz_category: '',
        source_table: model.metaName, source_pk_field: model.primaryKey, biz_no_field: '', biz_date_field: '',
        priority: columnValue(this.template, 'priority', 0), status: columnValue(this.template, 'status', false), description: ''})
      this.#input.target.assertCurrent()
      this.#eventId = this.template.getPkKey(row)
      this.#persisted = undefined
    }
    if (this.#eventId === undefined) throw new Error('维度事件合同缺少唯一身份')
    await this.#refresh(this.categories)
    await this.#refresh(this.outputFieldOptions)
  }

  /** 校验并以一次 DataSet 保存提交事件合同，回读核验；无修改返回 false。保存结果未知时重试只核验原提交。 */
  async save(): Promise<boolean> {
    if (!this.#submission.unknown) {
      const kinds = await this.#validate()
      const id = this.#requireEvent()
      if (!this.#submission.capture([{view: this.template, ids: [id], kinds}])) return false
    }
    if (!await this.#submission.submit()) return false
    const id = this.#requireEvent()
    const row = this.template.rows.find(item => this.template.getPkKey(item) === id)
    if (!row) throw new Error(`数据模型事件已提交，但回读核验失败：记录 ${String(id)} 未回读`)
    this.#persisted = this.#snapshot(row)
    return true
  }

  /** 丢弃事件合同草稿；保存结果未知时拒绝。 */
  discard(): void {
    this.#submission.assertSettled()
    if (this.#eventId !== undefined) this.template.discardPendingChanges([this.#eventId])
  }

  dispose(): void {
    this.#options.release()
  }

  async #refresh(view: DataView): Promise<void> {
    await refreshView(view, this.#input.target.assertCurrent)
  }

  #requireEvent(): Id {
    this.#submission.assertSettled()
    if (this.#eventId === undefined || !this.#model) throw new Error('数据模型事件尚未装载')
    return this.#eventId
  }

  #snapshot(row: Readonly<Record<string, unknown>>): Readonly<Record<string, string | number>> {
    return Object.fromEntries(Object.entries(EVENT_FIELD_KINDS).map(([field, kind]) => [field, normalized(kind, row[field])]))
  }

  async #verifyBinding(): Promise<Readonly<{eventCode: string; model: FormalModel}>> {
    const {binding, target} = this.#input
    if (binding.sourceKind !== 'data-model') throw new Error(`维度来源绑定不是当前数据模型来源：${binding.id}`)
    this.#bindingById.queryContext = {bindingId: binding.id}
    await this.#refresh(this.#bindingById)
    const rows = this.#bindingById.rows.filter(row => text(row['id']) === binding.id)
    const row = rows[0]
    if (rows.length !== 1 || this.#bindingById.rows.length !== 1 || !row) throw new Error(`维度来源绑定必须完整且唯一：${binding.id}`)
    assertReadable(this.#bindingById, row, ['source_kind', 'source_application_id', 'source_node_id', 'source_model_id', 'source_model_meta_name', 'event_code'])
    if (text(row['source_kind']) !== 'data-model') throw new Error(`维度来源绑定不是当前数据模型来源：${binding.id}`)
    if (text(row['source_application_id']) !== target.applicationId || text(row['source_node_id']) !== target.nodeId) {
      throw new Error('维度来源绑定与当前蓝图应用或节点不一致')
    }
    if (text(row['source_model_id']) !== binding.modelId) throw new Error('维度来源绑定与当前选定模型不一致')
    const eventCode = requiredText(row['event_code'], '维度来源事件编码')
    if (eventCode !== binding.eventCode) throw new Error('维度来源绑定事件编码已变化，请刷新后重试')
    if (isPlatformEventCode(eventCode)) throw new Error(`事件编码属于平台注册事件，不能作为数据模型事件维护：${eventCode}`)
    const metaName = requiredText(row['source_model_meta_name'], '维度来源模型注册名')
    const models = await readFormalModels(this.#input.readModels, target)
    const model = models.find(item => item.metaName === metaName)
    if (!model) throw new Error(`当前蓝图节点未绑定维度来源模型：${metaName}`)
    if (model.id !== binding.modelId) throw new Error(`正式模型与当前来源绑定不一致：${metaName}`)
    return {eventCode, model}
  }

  async #validate(): Promise<Readonly<Record<string, FieldKind>>> {
    const id = this.#requireEvent()
    const {eventCode, model} = await this.#verifyBinding()
    this.#model = model
    const row = this.template.getEditingRow(id)
    if (!row) throw new Error('维度事件合同已不存在')
    if (text(row['event_code']) !== eventCode) throw new Error('提交事件编码与当前来源绑定不一致')
    const templateCode = requiredText(row['template_code'], '维度事件模板编码')
    requiredText(row['template_name'], '维度事件名称')
    const category = requiredText(row['biz_category'], '维度事件业务分类')
    const priority = text(row['priority']) === '' ? Number.NaN : Number(row['priority'])
    if (!Number.isFinite(priority)) throw new Error('维度事件优先级必须是有限数字')
    const status = bit(row['status'])
    const bizNo = text(row['biz_no_field'])
    const bizDate = text(row['biz_date_field'])
    const outputs = new Set(model.fields.filter(field => field.output).map(field => field.canonicalName))
    if (bizNo && !outputs.has(bizNo)) throw new Error(`业务编号字段不属于当前模型输出字段：${bizNo}`)
    if (bizDate && !outputs.has(bizDate)) throw new Error(`业务日期字段不属于当前模型输出字段：${bizDate}`)
    if (status === 1 && !bizDate) throw new Error('启用事件业务日期字段不能为空')
    const persisted = this.#persisted
    if (persisted?.['biz_category'] !== category) {
      await this.#refresh(this.categories)
      const valid = this.categories.rows.filter(item => text(item['biz_category_code']) === category && bit(item['status']) === 1)
      if (valid.length !== 1) throw new Error(`维度事件业务分类未正式登记、未启用或不唯一：${category}`)
    }
    this.#byCode.queryContext = {templateCode}
    await this.#refresh(this.#byCode)
    if (this.#byCode.rows.some(item => text(item['template_code']) === templateCode && this.#byCode.getPkKey(item) !== id)) {
      throw new Error(`template_code 已存在：${templateCode}`)
    }
    const next: Readonly<Record<string, string>> = {template_code: templateCode, biz_category: category, source_table: model.metaName,
      source_pk_field: model.primaryKey, biz_no_field: bizNo, biz_date_field: bizDate}
    if (persisted) {
      const contractChanged = CONTRACT_FIELDS.some(field => next[field] !== persisted[field])
      this.#rules.queryContext = {eventCode}
      this.#bindingsByEvent.queryContext = {eventCode}
      await this.#refresh(this.#rules)
      await this.#refresh(this.#bindingsByEvent)
      const others = this.#bindingsByEvent.rows.filter(item => text(item['id']) !== this.#input.binding.id)
      if (contractChanged && (this.#rules.rows.length || others.length)) throw new Error(`事件合同已有规则或其它来源引用，不能变更业务分类或来源字段：${eventCode}`)
      if (status === 0 && persisted['status'] === 1 && this.#rules.rows.some(rule => bit(rule['status']) === 1)) {
        throw new Error(`事件存在启用规则引用，不能停用：${eventCode}`)
      }
    }
    const writes: Array<readonly [string, unknown]> = [['source_table', model.metaName], ['source_pk_field', model.primaryKey]]
    if (!persisted) {
      writes.push(['template_category', category], ['builtin_flag', columnValue(this.template, 'builtin_flag', false)],
        ['voucher_required', columnValue(this.template, 'voucher_required', false)],
        ['auto_voucher_write', columnValue(this.template, 'auto_voucher_write', false)],
        ['stop_after_match', columnValue(this.template, 'stop_after_match', true)])
    }
    const failure = pairEditing(this.template, id, Object.fromEntries(writes))
    if (failure) throw failure
    this.#input.target.assertCurrent()
    return persisted ? EVENT_FIELD_KINDS : CREATE_FIELD_KINDS
  }
}
