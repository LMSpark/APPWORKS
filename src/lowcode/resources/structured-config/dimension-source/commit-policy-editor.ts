/**
 * @module app:lowcode/resources/structured-config/dimension-source/commit-policy-editor
 * 职责：已保存来源绑定的“来源提交协议”草稿 owner：列出不可变版本，以稳定 policy 身份（绑定 ID + 版本摘要）新增草稿版本，
 *   按正式模型核验六个协议模型与来源事实后，以一次 DataSet 保存提交 policy 与事实字段。
 * 边界：只保存 status=0 的草稿版本，不启用、不核验物理约束与后端并发。草稿与事实直接是 Commit_Policy.draftByBinding /
 *   Commit_Field.draftByPolicy 的待新增行；模型与字段候选、必填、格式、不可变与引用由 pagedata 列规则承担，
 *   协议模型的类型、同源与实体列结构经数据空间设计 API 读取正式模型核验。
 * AI用途：调整来源提交协议约束时在此修改，页面只负责打开、绑定视图与提示。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {DimensionSourceSavedBinding} from './binding-editor'
import {assertReadable, catalogView, columnValue, liveIds, positiveInteger, readFormalModels, refreshView, requireView,
  saveDimensionSourceViews, text, type DimensionSourceTarget, type FormalField, type FormalModel, type Id} from './view-support'

const POLICY_TABLE = 'Bil_Dimension_Source_Commit_Policy'
const FIELD_TABLE = 'Bil_Dimension_Source_Commit_Field'
const META_FIELDS = ['source_meta_name', 'root_meta_name', 'intent_meta_name', 'successor_meta_name', 'fact_meta_name', 'head_meta_name'] as const
const ENTITY_COLUMNS = {
  root: ['id', 'initial_commit_id'],
  intent: ['id', 'root_id', 'predecessor_id', 'binding_id', 'binding_version', 'policy_id', 'policy_version',
    'expected_source_commit_id', 'request_digest', 'facts_digest', 'ordinal'],
  successor: ['id', 'root_id', 'next_commit_id'],
  fact: ['id', 'commit_id', 'field_id', 'value_type', 'value_state', 'value_text', 'value_number', 'value_boolean', 'value_datetime'],
  head: ['root_id', 'head_commit_id', 'binding_id', 'binding_version', 'policy_id', 'policy_version',
    'chain_complete', 'commit_count', 'successor_count', 'source_established', 'source_state'],
} as const
const VALUE_TYPES = ['string', 'number', 'boolean', 'datetime'] as const
type ValueType = typeof VALUE_TYPES[number]
const STRING_TYPES = ['string', 'varchar', 'nvarchar', 'char', 'text', '字符串', '字符', '文本']
const TYPE_GROUPS: Readonly<Record<ValueType, readonly string[]>> = {
  string: [...STRING_TYPES, 'datetime', 'timestamp', 'date', 'time', '日期', '日期时间', '时间'],
  number: ['number', 'numeric', 'decimal', 'float', 'double', 'integer', 'int', 'bigint', 'bit', '数值', '数字', '整数', '小数'],
  boolean: ['boolean', 'bool', '布尔', '布尔型'],
  datetime: ['datetime', 'timestamp', '日期时间', ...STRING_TYPES],
}
const JSON_TYPES = ['json', 'object', 'json object', 'json-object', '对象', '结构化对象']

type DraftFact = Readonly<{source_field: string; source_path: readonly string[] | undefined; value_type: ValueType}>
type DraftPolicy = Readonly<Record<typeof META_FIELDS[number] | 'source_key_field' | 'source_commit_field', string>>
type ProtocolModelCheck = Readonly<{policy: DraftPolicy; binding: DimensionSourceSavedBinding; models: readonly FormalModel[]; facts: readonly DraftFact[]}>

/** 来源提交协议编辑器装配输入。 */
export type DimensionSourceCommitPolicyEditorInput = Readonly<{
  /** 维度设计场景（88A4）运行 DataSet；须与 7AB 同处一个 PageRuntime。 */
  dataSet: DataSet
  /** 本次编辑的正式目标。 */
  target: DimensionSourceTarget
  /** 已保存且无草稿的来源绑定。 */
  binding: DimensionSourceSavedBinding
  /** 读取数据空间正式模型（含字段），只用于保存前的协议模型结构核验。 */
  readModels: DataSpaceDesignApi['readModels']
}>

function typeMatches(formalType: string, candidates: readonly string[]): boolean {
  const value = formalType.trim().toLowerCase()
  return candidates.some(candidate => value === candidate || value.startsWith(`${candidate}(`))
}
function optionalPath(value: unknown): readonly string[] | undefined {
  const source = text(value)
  if (!source) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(source) } catch { throw new Error('来源字段路径不是有效 JSON') }
  if (!Array.isArray(parsed)) throw new Error('来源字段路径必须是结构化字符串数组')
  const path = parsed.map((segment: unknown) => {
    if (typeof segment !== 'string' || segment === '' || segment.trim() !== segment) throw new Error('来源字段路径段必须是非空规范字符串')
    return segment
  })
  if (path.some(segment => ['__proto__', 'prototype', 'constructor'].includes(segment))) throw new Error('来源字段路径包含不允许的属性名')
  return path
}
function visibleField(model: FormalModel, name: string): FormalField {
  const matches = model.fields.filter(field => field.canonicalName === name)
  const selected = matches[0]
  if (matches.length !== 1 || !selected) throw new Error(`正式模型 ${model.metaName} 的输出字段必须唯一：${name}`)
  if (!selected.output || selected.computed) throw new Error(`正式模型 ${model.metaName} 字段未输出或为计算字段：${name}`)
  return selected
}
async function policyIdentity(bindingId: string, policyVersion: number): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(['spark.dimension.source-policy.v1', bindingId, policyVersion]))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

/** 端口自参考 validateProtocolModels：六模型角色与同源、来源主键/提交引用字段、协议实体列与事实来源字段类型。 */
function validateProtocolModels({policy, binding, models, facts}: ProtocolModelCheck): void {
  const names = META_FIELDS.map(field => policy[field])
  if (new Set(names).size !== names.length) throw new Error('来源与五个协议 metaName 必须互不重复')
  const selected = names.map(name => {
    const model = models.find(item => item.metaName === name)
    if (!model) throw new Error(`正式蓝图数据空间缺少来源提交模型：${name}`)
    return model
  })
  const [source, root, intent, successor, fact, head] = selected
  if (!source || !root || !intent || !successor || !fact || !head) throw new Error('来源提交模型不完整')
  if ([source, root, intent, successor, fact].some(model => model.sourceType !== '数据库表') || head.sourceType !== '数据库视图') {
    throw new Error('来源提交需由五个普通表和一个数据库视图组成，且角色类型必须匹配')
  }
  const sourceIds = new Set(selected.map(model => {
    if (!text(model.sourceId)) throw new Error(`正式模型 ${model.metaName} 缺少 sourceId`)
    return model.sourceId
  }))
  if (sourceIds.size !== 1) throw new Error('来源与协议模型必须属于同一实际 sourceId')
  if (binding.sourceKind === 'data-model' && (source.id !== binding.modelId || source.metaName !== binding.modelMetaName)) {
    throw new Error('来源协议模型与正式来源绑定模型不一致')
  }
  const key = visibleField(source, policy.source_key_field)
  if (!key.primaryKey || policy.source_key_field !== source.primaryKey) throw new Error('来源协议主键字段必须是正式模型唯一主键输出')
  if (policy.source_key_field === policy.source_commit_field) throw new Error('来源主键和提交引用字段必须不同')
  const commitField = visibleField(source, policy.source_commit_field)
  if (!typeMatches(commitField.type, STRING_TYPES)) throw new Error(`来源提交引用字段必须是正式字符串类型：${commitField.type}`)
  for (const [model, columns] of [[root, ENTITY_COLUMNS.root], [intent, ENTITY_COLUMNS.intent], [successor, ENTITY_COLUMNS.successor],
    [fact, ENTITY_COLUMNS.fact], [head, ENTITY_COLUMNS.head]] as const) {
    for (const column of columns) visibleField(model, column)
  }
  for (const [model, keyName] of [[root, 'id'], [intent, 'id'], [successor, 'id'], [fact, 'id'], [head, 'root_id']] as const) {
    if (!visibleField(model, keyName).primaryKey || model.primaryKey !== keyName) throw new Error(`正式模型 ${model.metaName} 主键必须是输出字段：${keyName}`)
  }
  for (const configured of facts) {
    const sourceField = visibleField(source, configured.source_field)
    if (configured.source_field === policy.source_commit_field) throw new Error(`来源提交引用字段不能配置为事实：${configured.source_field}`)
    if (configured.source_path?.length) {
      if (!JSON_TYPES.includes(sourceField.type.trim().toLowerCase())) throw new Error(`来源字段 ${configured.source_field} 路径源必须是正式 JSON 字段：${sourceField.type}`)
    } else if (!typeMatches(sourceField.type, TYPE_GROUPS[configured.value_type])) {
      throw new Error(`来源字段 ${configured.source_field} 的正式类型与配置不一致：${sourceField.type}`)
    }
  }
}

/** 来源提交协议草稿编辑器；一次实例只服务一个来源绑定。 */
export class DimensionSourceCommitPolicyEditor {
  /** 绑定的来源提交协议版本 DataView（byBinding，只读列表）。 */
  readonly policies: DataView
  /** 选中已有版本的事实字段 DataView（byPolicy，只读）。 */
  readonly fields: DataView
  /** 新版本草稿所在的协议视图（draftByBinding）；草稿是其待新增行。 */
  readonly draft: DataView
  /** 新版本来源事实所在的字段视图（draftByPolicy）；事实是其待新增行。 */
  readonly facts: DataView
  /** 节点数据空间正式模型候选（7AB，值为注册名）。 */
  readonly models: DataView
  /** 草稿来源模型的输出非计算字段候选（7AB，值为输出名）。 */
  readonly sourceFields: DataView
  readonly #input: DimensionSourceCommitPolicyEditorInput
  readonly #bindingById: DataView
  readonly #primaryFields: DataView
  #latestVersion = 0
  #draftId: string | undefined

  constructor(input: DimensionSourceCommitPolicyEditorInput) {
    this.#input = input
    const {dataSet} = input
    this.policies = requireView(dataSet, POLICY_TABLE, 'byBinding')
    this.fields = requireView(dataSet, FIELD_TABLE, 'byPolicy')
    this.draft = requireView(dataSet, POLICY_TABLE, 'draftByBinding')
    this.facts = requireView(dataSet, FIELD_TABLE, 'draftByPolicy')
    this.#bindingById = requireView(dataSet, 'Bil_Dimension_Source_Binding', 'byId')
    this.models = catalogView(dataSet, 'Base_DataModel', 'dimensionSourceModelNames')
    this.sourceFields = catalogView(dataSet, 'Base_DataModel_Field', 'dimensionCommitFields')
    this.#primaryFields = catalogView(dataSet, 'Base_DataModel_Field', 'dimensionCommitPrimaryFields')
  }

  /** 存在保存结果未知的提交。 */
  get unknown(): boolean { return this.draft.hasUnconfirmedSave || this.facts.hasUnconfirmedSave }

  /** 新版本草稿行 ID；未装载时为 undefined。 */
  get draftId(): string | undefined { return this.#draftId }

  /** 草稿来源模型可选择（平台注册事件来源）；数据模型来源固定为绑定模型。 */
  get sourceSelectable(): boolean { return this.#input.binding.sourceKind === 'platform-event' }

  /** 已有版本 ID（版本降序）。 */
  policyIds(): readonly Id[] {
    return liveIds(this.policies)
  }

  /** 草稿事实行 ID（呈现顺序）。 */
  factIds(): readonly Id[] {
    return liveIds(this.facts)
  }

  /** 复核来源绑定，读取已有版本与模型候选，并新增下一版本草稿。 */
  async load(): Promise<void> {
    await this.#verifyBinding()
    this.models.queryContext = {dataSetId: this.#input.target.dataSpaceId}
    await this.#refresh(this.models)
    await this.#loadPolicies()
    await this.#createDraft()
  }

  /** 查看已有版本的事实字段（只读）；事实数须与 field_count 一致。 */
  async selectVersion(policyId: Id): Promise<void> {
    const policy = this.policies.rows.find(row => this.policies.getPkKey(row) === policyId)
    if (!policy) throw new Error(`来源提交协议版本不存在：${String(policyId)}`)
    this.fields.queryContext = {policyId: String(policyId)}
    await this.#refresh(this.fields)
    const count = positiveInteger(policy['field_count'], '来源提交完整字段数')
    if (this.fields.rows.length !== count) throw new Error(`来源提交字段集合与 field_count 不一致：${this.fields.rows.length} / ${count}`)
  }

  /** 选定草稿来源模型（7AB 模型 rowid）：写入注册名、主键取其唯一正式主键并清空提交引用字段，刷新字段候选。 */
  async chooseSource(modelId: string): Promise<void> {
    const id = this.#requireDraft()
    const model = this.models.rows.find(row => text(row['rowid']) === modelId)
    if (!model) throw new Error(`来源模型不属于当前数据空间：${modelId}`)
    for (const view of [this.sourceFields, this.#primaryFields]) {
      view.queryContext = {modelId}
      await this.#refresh(view)
    }
    const primary = this.#primaryFields.rows.length === 1 ? text(this.#primaryFields.rows[0]?.['canonicalName']) : ''
    this.draft.updateEditingValue(id, 'source_meta_name', text(model['Name']))
    this.draft.updateEditingValue(id, 'source_key_field', primary)
    this.draft.updateEditingValue(id, 'source_commit_field', '')
  }

  /** 新增一条来源事实草稿行。 */
  async addFact(): Promise<void> {
    const policyId = this.#requireDraft()
    await this.facts.addRow({policy_id: policyId, field_id: '', source_field: '', source_path: '', value_type: 'string',
      required_flag: columnValue(this.facts, 'required_flag', false)})
    this.#input.target.assertCurrent()
  }

  /** 移除一条来源事实草稿行。 */
  async removeFact(id: Id): Promise<void> {
    this.#requireDraft()
    if (!this.facts.dirtyTracking.isPendingCreate(id) || await this.facts.removeRow(id) !== true) throw new Error('来源事实草稿行不存在')
  }

  /** 业务核验后以一次 DataSet 保存提交不可变草稿版本（policy + 事实字段）并回读，随后新增下一版本草稿。保存结果未知时重试只核验原提交。 */
  async saveDraft(): Promise<void> {
    const {dataSet, target} = this.#input
    const draftId = this.#requireDraft(true)
    const factIds = this.factIds()
    if (!this.unknown) await this.#stage(draftId, factIds)
    await saveDimensionSourceViews({dataSet, targets: [{view: this.draft, ids: [draftId]}, {view: this.facts, ids: factIds}], label: '来源提交协议草稿',
      assertCurrent: target.assertCurrent})
    if (!this.draft.rows.some(row => this.draft.getPkKey(row) === draftId)) throw new Error(`来源提交协议草稿已提交，但回读核验失败：版本 ${draftId} 未回读`)
    if (this.facts.rows.length !== factIds.length) throw new Error('来源提交协议草稿已提交，但回读核验失败：事实字段集合')
    this.#draftId = undefined
    await this.#loadPolicies()
    await this.#createDraft()
  }

  /** 丢弃草稿与事实行，不写入任何数据；保存结果未知时拒绝。 */
  discard(): void {
    if (this.unknown) throw new Error('来源提交协议草稿保存结果未知，未丢弃原提交，请重新打开后核对正式版本')
    const facts = this.factIds()
    if (facts.length) this.facts.discardPendingChanges([...facts])
    if (this.#draftId !== undefined) this.draft.discardPendingChanges([this.#draftId])
    this.#draftId = undefined
  }

  async #refresh(view: DataView): Promise<void> {
    await refreshView(view, this.#input.target.assertCurrent)
  }

  #requireDraft(allowUnknown = false): string {
    if (!allowUnknown && this.unknown) throw new Error('存在保存结果未知的来源提交协议草稿，请先重试保存核验')
    if (this.#draftId === undefined) throw new Error('来源提交协议草稿尚未准备')
    return this.#draftId
  }

  async #createDraft(): Promise<void> {
    const {binding} = this.#input
    const version = this.#latestVersion + 1
    const id = await policyIdentity(binding.id, version)
    this.#input.target.assertCurrent()
    this.draft.queryContext = {bindingId: binding.id}
    await this.#refresh(this.draft)
    if (this.draft.rows.some(row => this.draft.getPkKey(row) === id)) throw new Error(`来源提交协议身份已存在：${id}`)
    await this.draft.addRowWithIdentity({field: 'id', value: id}, {binding_id: binding.id, status: columnValue(this.draft, 'status', 0),
      protocol_version: columnValue(this.draft, 'protocol_version', 1), binding_version: columnValue(this.draft, 'binding_version', binding.bindingVersion),
      policy_version: columnValue(this.draft, 'policy_version', version), field_count: columnValue(this.draft, 'field_count', 0),
      ...Object.fromEntries(META_FIELDS.map(field => [field, ''])), source_key_field: '', source_commit_field: ''})
    this.#input.target.assertCurrent()
    this.draft.setCurrentRowById(id)
    this.#draftId = id
    this.facts.queryContext = {policyId: id}
    await this.#refresh(this.facts)
    if (binding.sourceKind === 'data-model') await this.chooseSource(binding.modelId)
  }

  async #loadPolicies(): Promise<void> {
    const {binding} = this.#input
    this.policies.queryContext = {bindingId: binding.id}
    await this.#refresh(this.policies)
    const ids = new Set<string>()
    const versions = new Set<number>()
    for (const row of this.policies.rows) {
      assertReadable(this.policies, row, ['id', 'binding_id', 'protocol_version', 'policy_version'])
      const id = text(row['id'])
      if (text(row['binding_id']) !== binding.id) throw new Error(`来源提交协议 ${id} 引用了其它绑定：${text(row['binding_id'])}`)
      if (Number(row['protocol_version']) !== 1) throw new Error(`来源提交协议版本不受支持：${text(row['protocol_version'])}`)
      const version = positiveInteger(row['policy_version'], '来源提交配置版本')
      if (ids.has(id)) throw new Error(`来源提交 policy 身份重复：${id}`)
      if (versions.has(version)) throw new Error(`来源提交配置版本重复：${version}`)
      ids.add(id)
      versions.add(version)
    }
    this.#latestVersion = Math.max(0, ...versions)
  }

  async #verifyBinding(): Promise<string> {
    const {binding, target} = this.#input
    this.#bindingById.queryContext = {bindingId: binding.id}
    await this.#refresh(this.#bindingById)
    const row = this.#bindingById.rows[0]
    if (this.#bindingById.rows.length !== 1 || !row) throw new Error(`来源绑定 ${binding.id} 必须唯一且正式可读，实际 ${this.#bindingById.rows.length} 条`)
    const fields = ['id', 'source_application_id', 'source_node_id', 'source_kind', 'source_model_id', 'source_model_meta_name',
      'source_contract_id', 'projection_role', 'binding_version'] as const
    assertReadable(this.#bindingById, row, fields)
    if (text(row['id']) !== binding.id || text(row['source_kind']) !== binding.sourceKind) throw new Error(`来源提交配置绑定类型无效：${binding.id}`)
    if ((text(row['projection_role']) || 'business-result') !== 'business-result') throw new Error('来源提交只允许 business-result 来源绑定')
    if (binding.sourceKind === 'platform-event' && !text(row['source_contract_id'])) throw new Error('平台注册事件来源缺少正式合同身份')
    if (positiveInteger(row['binding_version'], '正式来源绑定版本') !== binding.bindingVersion) throw new Error('来源提交请求绑定版本与正式绑定不一致')
    if (text(row['source_application_id']) !== target.applicationId || text(row['source_node_id']) !== target.nodeId) {
      throw new Error('正式来源绑定不属于当前项目蓝图节点')
    }
    if (text(row['source_model_id']) !== binding.modelId || text(row['source_model_meta_name']) !== binding.modelMetaName) {
      throw new Error('来源绑定在草稿校验期间已变化')
    }
    return JSON.stringify(fields.map(field => text(row[field])))
  }

  /** 草稿版本须仍为最新之后、绑定未变化，协议模型与事实按正式模型核验；写入完整事实数。 */
  async #stage(draftId: string, factIds: readonly Id[]): Promise<void> {
    const {binding, target} = this.#input
    if (factIds.length === 0) throw new Error('来源提交字段集合不能为空')
    const row = this.draft.getEditingRow(draftId)
    if (!row) throw new Error('来源提交协议草稿已不存在')
    const policy: DraftPolicy = {source_meta_name: text(row['source_meta_name']), root_meta_name: text(row['root_meta_name']),
      intent_meta_name: text(row['intent_meta_name']), successor_meta_name: text(row['successor_meta_name']), fact_meta_name: text(row['fact_meta_name']),
      head_meta_name: text(row['head_meta_name']), source_key_field: text(row['source_key_field']), source_commit_field: text(row['source_commit_field'])}
    const facts = factIds.map((id, index): DraftFact => {
      const fact = this.facts.getEditingRow(id)
      if (!fact) throw new Error(`第 ${index + 1} 行来源事实已不存在`)
      const type = VALUE_TYPES.find(item => item === text(fact['value_type']))
      if (!type) throw new Error(`来源事实类型不受支持：${text(fact['value_type'])}`)
      return {source_field: text(fact['source_field']), source_path: optionalPath(fact['source_path']), value_type: type}
    })
    const signature = await this.#verifyBinding()
    validateProtocolModels({policy, binding, models: await readFormalModels(this.#input.readModels, target), facts})
    await this.#loadPolicies()
    if (positiveInteger(row['policy_version'], '来源提交配置版本') <= this.#latestVersion) {
      throw new Error(`来源提交配置版本必须大于当前正式版本 ${this.#latestVersion}，请关闭后重新打开`)
    }
    if (await this.#verifyBinding() !== signature) throw new Error('来源绑定在草稿校验期间已变化')
    if (Number(row['field_count']) !== factIds.length) this.draft.updateEditingValue(draftId, 'field_count', columnValue(this.draft, 'field_count', factIds.length))
  }
}
