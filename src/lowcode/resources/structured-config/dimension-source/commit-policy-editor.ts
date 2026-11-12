/**
 * @module app:lowcode/resources/structured-config/dimension-source/commit-policy-editor
 * 职责：已保存来源绑定的“来源提交协议”草稿 owner：列出不可变版本，按正式模型校验六个协议模型与来源事实，
 *   以稳定 policy 身份（绑定 ID + 版本摘要）单次保存 policy 与事实字段并回读核验。
 * 边界：只保存 status=0 的草稿版本，不启用、不核验物理约束与后端并发；草稿表单与事实行是 static 暂存输入，
 *   正式写入只经 Commit_Policy.byBinding / Commit_Field.byPolicy 视图的 DataSet 保存。
 * AI用途：调整来源提交协议约束时在此修改，页面只负责打开、绑定输入与提示。
 */
import {buildDataViewKey, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {DimensionSourceSavedBinding} from './binding-editor'
import {assertReadable, bit, columnValue, DimensionSourceChangeSubmission, DimensionSourceOptionTables, pairEditing, positiveInteger,
  readFormalModels, refreshView, requiredText, requireView, text, type DimensionSourceTarget, type FieldKind, type FormalField,
  type FormalModel, type Id} from './view-support'

const POLICY_TABLE = 'Bil_Dimension_Source_Commit_Policy'
const FIELD_TABLE = 'Bil_Dimension_Source_Commit_Field'
const DRAFT_ROW = 'draft'
const META_FIELDS = ['source_meta_name', 'root_meta_name', 'intent_meta_name', 'successor_meta_name', 'fact_meta_name', 'head_meta_name'] as const
const POLICY_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  binding_id: 'text', status: 'integer', protocol_version: 'integer', binding_version: 'integer', policy_version: 'integer', field_count: 'integer',
  ...Object.fromEntries(META_FIELDS.map(field => [field, 'text' as const])), source_key_field: 'text', source_commit_field: 'text',
}
const FACT_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  policy_id: 'text', field_id: 'text', source_field: 'text', source_path: 'text', value_type: 'text', required_flag: 'bit',
}
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

type DraftFact = Readonly<{field_id: string; source_field: string; source_path: readonly string[] | undefined; value_type: ValueType; required_flag: number}>
type DraftPolicy = Readonly<Record<typeof META_FIELDS[number] | 'source_key_field' | 'source_commit_field', string> & {policy_version: number}>
type PendingDraft = Readonly<{policyId: string; factIds: readonly Id[]}>
type ProtocolModelCheck = Readonly<{policy: DraftPolicy; binding: DimensionSourceSavedBinding; models: readonly FormalModel[]; facts: readonly DraftFact[]}>

/** 来源提交协议编辑器装配输入。 */
export type DimensionSourceCommitPolicyEditorInput = Readonly<{
  /** 维度设计场景（88A4）运行 DataSet。 */
  dataSet: DataSet
  /** 本次编辑的正式目标。 */
  target: DimensionSourceTarget
  /** 已保存且无草稿的来源绑定。 */
  binding: DimensionSourceSavedBinding
  /** 读取数据空间正式模型（含字段）。 */
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
  const sourceIds = new Set(selected.map(model => requiredText(model.sourceId, `正式模型 ${model.metaName} sourceId`)))
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

/** 来源提交协议草稿编辑器；一次实例只服务一个来源绑定，关闭时须 dispose。 */
export class DimensionSourceCommitPolicyEditor {
  /** 绑定的来源提交协议版本 DataView（byBinding）。 */
  readonly policies: DataView
  /** 选中版本或待保存草稿的事实字段 DataView（byPolicy）。 */
  readonly fields: DataView
  /** 新版本草稿表单（static 暂存输入，唯一行 draft）。 */
  readonly draft: DataView
  /** 新版本来源事实行（static 暂存输入）。 */
  readonly facts: DataView
  /** 节点数据空间正式模型候选（主键 metaName）。 */
  readonly modelOptions: DataView
  /** 草稿来源模型的输出非计算字段候选（主键 canonicalName）。 */
  readonly sourceFieldOptions: DataView
  readonly #input: DimensionSourceCommitPolicyEditorInput
  readonly #bindingById: DataView
  readonly #options: DimensionSourceOptionTables
  readonly #submission: DimensionSourceChangeSubmission
  readonly #stop: () => void
  #models: readonly FormalModel[] = []
  #latestVersion = 0
  #pending: PendingDraft | undefined
  #pairFailure: Error | undefined

  constructor(input: DimensionSourceCommitPolicyEditorInput) {
    this.#input = input
    const {dataSet, target} = input
    this.policies = requireView(dataSet, POLICY_TABLE, 'byBinding')
    this.fields = requireView(dataSet, FIELD_TABLE, 'byPolicy')
    this.#bindingById = requireView(dataSet, 'Bil_Dimension_Source_Binding', 'byId')
    this.#options = new DimensionSourceOptionTables(dataSet, target)
    this.#submission = new DimensionSourceChangeSubmission(dataSet, '来源提交协议草稿', target.assertCurrent)
    try {
      this.draft = this.#options.input('DimensionSourceCommitDraft', ['draftId', 'policy_version', ...META_FIELDS, 'source_key_field', 'source_commit_field'])
      this.facts = this.#options.input('DimensionSourceCommitFact', ['factId', 'field_id', 'source_field', 'source_path', 'value_type', 'required_flag'])
      this.modelOptions = this.#options.mount('DimensionSourceCommitModel', ['metaName', 'name', 'sourceType'],
        () => this.#models.map(model => ({metaName: model.metaName, name: model.name, sourceType: model.sourceType})))
      this.sourceFieldOptions = this.#options.mount('DimensionSourceCommitField', ['canonicalName', 'name', 'type'],
        () => (this.#sourceModel()?.fields ?? []).filter(field => field.output && !field.computed)
          .map(field => ({canonicalName: field.canonicalName, name: field.name, type: field.type})))
    } catch (cause) {
      this.#options.release()
      throw cause
    }
    this.#stop = dataSet.onAnyViewChange({editingFieldChanged: (tableName, _viewId, event) => {
      if (tableName !== this.draft.tableName || event.rowId !== DRAFT_ROW || event.field !== 'source_meta_name') return
      const model = this.#models.find(item => item.metaName === text(event.nextValue))
      const failure = pairEditing(this.draft, DRAFT_ROW, {source_key_field: model?.primaryKey ?? '', source_commit_field: ''})
      if (failure) this.#pairFailure = failure
      this.sourceFieldOptions.refresh().catch((cause: unknown) => { this.#pairFailure = cause instanceof Error ? cause : new Error(String(cause)) })
    }})
  }

  /** 视图在所属 PageRuntime 中的完整绑定键。 */
  viewKey(view: DataView): string {
    return buildDataViewKey(view.tableName, view.viewId, this.#input.dataSet.scenarioId)
  }

  /** 存在保存结果未知的提交。 */
  get unknown(): boolean { return this.#submission.unknown }

  /** 草稿表单行 ID。 */
  get draftId(): string { return DRAFT_ROW }

  /** 已有版本 ID（版本降序）。 */
  policyIds(): readonly Id[] {
    return this.policies.rows.flatMap(row => {
      const id = this.policies.getPkKey(row)
      return id === undefined || this.policies.dirtyTracking.isPendingCreate(id) ? [] : [id]
    })
  }

  /** 草稿事实行 ID（呈现顺序）。 */
  factIds(): readonly Id[] {
    return this.facts.rows.flatMap(row => {
      const id = this.facts.getPkKey(row)
      return id === undefined ? [] : [id]
    })
  }

  /** 复核来源绑定，读取已有版本与正式模型，并重置新版本草稿。 */
  async load(): Promise<void> {
    await this.#verifyBinding()
    this.#models = await readFormalModels(this.#input.readModels, this.#input.target)
    await this.#loadPolicies()
    await this.#refresh(this.modelOptions)
    this.#resetDraft()
    await this.#refresh(this.sourceFieldOptions)
  }

  /** 查看已有版本的事实字段（只读）；事实数须与 field_count 一致。 */
  async selectVersion(policyId: Id): Promise<void> {
    this.#submission.assertSettled()
    const policy = this.policies.rows.find(row => this.policies.getPkKey(row) === policyId)
    if (!policy) throw new Error(`来源提交协议版本不存在：${String(policyId)}`)
    this.fields.queryContext = {policyId: String(policyId)}
    await this.#refresh(this.fields)
    const count = positiveInteger(policy['field_count'], '来源提交完整字段数')
    if (this.fields.rows.length !== count) throw new Error(`来源提交字段集合与 field_count 不一致：${this.fields.rows.length} / ${count}`)
  }

  /** 新增一条来源事实草稿行。 */
  addFact(): void {
    this.#submission.assertSettled()
    this.facts.appendRow({factId: crypto.randomUUID(), field_id: '', source_field: '', source_path: '', value_type: 'string', required_flag: '0'})
  }

  /** 移除一条来源事实草稿行。 */
  removeFact(id: Id): void {
    this.#submission.assertSettled()
    this.facts.discardEditingRows([id])
    if (!this.facts.deleteRowById(id)) throw new Error('来源事实草稿行不存在')
  }

  /** 校验并以一次 DataSet 保存提交不可变草稿版本（policy + 事实字段），回读核验。保存结果未知时重试只核验原提交。 */
  async saveDraft(): Promise<void> {
    if (!this.#submission.unknown) await this.#stage()
    const pending = this.#pending
    if (!pending) throw new Error('来源提交协议草稿尚未准备')
    try {
      await this.#submission.submit()
    } catch (cause) {
      if (!this.#submission.unknown) {
        this.policies.discardPendingChanges([pending.policyId])
        this.fields.discardPendingChanges([...pending.factIds])
        this.#pending = undefined
      }
      throw cause
    }
    this.#pending = undefined
    const mismatch = (detail: string) => new Error(`来源提交协议草稿已提交，但回读核验失败：${detail}`)
    await this.#verifyBinding()
    if (!this.policies.rows.some(row => this.policies.getPkKey(row) === pending.policyId)) throw mismatch(`版本 ${pending.policyId} 未回读`)
    if (this.fields.rows.length !== pending.factIds.length) throw mismatch('事实字段集合')
    await this.#loadPolicies()
    this.#resetDraft()
  }

  dispose(): void {
    this.#stop()
    this.#options.release()
  }

  async #refresh(view: DataView): Promise<void> {
    await refreshView(view, this.#input.target.assertCurrent)
  }

  #sourceModel(): FormalModel | undefined {
    const meta = text(this.draft.getEditingRow(DRAFT_ROW)?.['source_meta_name'])
    return this.#models.find(model => model.metaName === meta)
  }

  #resetDraft(): void {
    const ids = this.factIds()
    this.facts.discardEditingRows([...ids])
    for (const id of ids) this.facts.deleteRowById(id)
    this.draft.discardEditingRows([DRAFT_ROW])
    this.draft.deleteRowById(DRAFT_ROW)
    const {binding} = this.#input
    const source = binding.sourceKind === 'data-model' ? this.#models.find(model => model.metaName === binding.modelMetaName) : undefined
    this.draft.appendRow({draftId: DRAFT_ROW, policy_version: String(this.#latestVersion + 1), source_meta_name: source?.metaName ?? '',
      root_meta_name: '', intent_meta_name: '', successor_meta_name: '', fact_meta_name: '', head_meta_name: '',
      source_key_field: source?.primaryKey ?? '', source_commit_field: ''})
    this.draft.setCurrentRowById(DRAFT_ROW)
    this.#pairFailure = undefined
  }

  async #loadPolicies(): Promise<void> {
    const {binding} = this.#input
    this.policies.queryContext = {bindingId: binding.id}
    await this.#refresh(this.policies)
    const ids = new Set<string>()
    const versions = new Set<number>()
    for (const row of this.policies.rows) {
      assertReadable(this.policies, row, ['id', ...Object.keys(POLICY_FIELD_KINDS)])
      const id = requiredText(row['id'], '来源提交协议 ID')
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

  #readDraft(): Readonly<{policy: DraftPolicy; facts: readonly DraftFact[]}> {
    if (this.#pairFailure) throw this.#pairFailure
    const row = this.draft.getEditingRow(DRAFT_ROW)
    if (!row) throw new Error('来源提交协议草稿表单已不存在')
    const labels: Readonly<Record<typeof META_FIELDS[number], string>> = {source_meta_name: '来源模型 metaName', root_meta_name: '对象根模型 metaName',
      intent_meta_name: '提交意图模型 metaName', successor_meta_name: '后继登记模型 metaName', fact_meta_name: '提交事实模型 metaName',
      head_meta_name: '当前性模型 metaName'}
    const meta = (field: typeof META_FIELDS[number]): string => requiredText(row[field], labels[field])
    const policy: DraftPolicy = {
      source_meta_name: meta('source_meta_name'), root_meta_name: meta('root_meta_name'), intent_meta_name: meta('intent_meta_name'),
      successor_meta_name: meta('successor_meta_name'), fact_meta_name: meta('fact_meta_name'), head_meta_name: meta('head_meta_name'),
      source_key_field: requiredText(row['source_key_field'], '来源主键输出字段'),
      source_commit_field: requiredText(row['source_commit_field'], '来源提交引用输出字段'),
      policy_version: positiveInteger(row['policy_version'], '来源提交配置版本'),
    }
    const facts = this.factIds().map((id, index): DraftFact => {
      const fact = this.facts.getEditingRow(id)
      const label = (name: string) => `第 ${index + 1} 行${name}`
      if (!fact) throw new Error(`${label('来源事实')}已不存在`)
      const valueType = requiredText(fact['value_type'], label('来源事实类型'))
      const type = VALUE_TYPES.find(item => item === valueType)
      if (!type) throw new Error(`来源事实类型不受支持：${valueType}`)
      return {field_id: requiredText(fact['field_id'], label('来源事实字段 ID')), source_field: requiredText(fact['source_field'], label('来源事实来源字段')),
        source_path: optionalPath(fact['source_path']), value_type: type, required_flag: bit(fact['required_flag'])}
    })
    if (facts.length === 0) throw new Error('来源提交字段集合不能为空')
    const ids = new Set<string>()
    for (const fact of facts) {
      if (ids.has(fact.field_id)) throw new Error(`来源提交字段 ID 重复：${fact.field_id}`)
      ids.add(fact.field_id)
    }
    return {policy, facts}
  }

  async #stage(): Promise<void> {
    const {policy, facts} = this.#readDraft()
    const {binding, target} = this.#input
    const bindingSignature = await this.#verifyBinding()
    this.#models = await readFormalModels(this.#input.readModels, target)
    validateProtocolModels({policy, binding, models: this.#models, facts})
    await this.#loadPolicies()
    if (policy.policy_version <= this.#latestVersion) throw new Error(`来源提交配置版本必须大于当前正式版本 ${this.#latestVersion}`)
    if (await this.#verifyBinding() !== bindingSignature) throw new Error('来源绑定在草稿校验期间已变化')
    const policyId = await policyIdentity(binding.id, policy.policy_version)
    target.assertCurrent()
    if (this.policyIds().includes(policyId)) throw new Error(`来源提交协议身份已存在：${policyId}`)
    this.fields.queryContext = {policyId}
    await this.#refresh(this.fields)
    await this.policies.addRowWithIdentity({field: 'id', value: policyId}, {binding_id: binding.id,
      status: columnValue(this.policies, 'status', 0), protocol_version: columnValue(this.policies, 'protocol_version', 1),
      binding_version: columnValue(this.policies, 'binding_version', binding.bindingVersion),
      policy_version: columnValue(this.policies, 'policy_version', policy.policy_version),
      field_count: columnValue(this.policies, 'field_count', facts.length),
      ...Object.fromEntries(META_FIELDS.map(field => [field, policy[field]])),
      source_key_field: policy.source_key_field, source_commit_field: policy.source_commit_field})
    const factIds: Id[] = []
    try {
      for (const fact of facts) {
        const row = await this.fields.addRow({policy_id: policyId, field_id: fact.field_id, source_field: fact.source_field,
          source_path: fact.source_path ? JSON.stringify(fact.source_path) : '', value_type: fact.value_type,
          required_flag: columnValue(this.fields, 'required_flag', fact.required_flag)})
        const id = this.fields.getPkKey(row)
        if (id === undefined) throw new Error('来源事实字段缺少唯一身份')
        factIds.push(id)
      }
      target.assertCurrent()
      this.#submission.capture([{view: this.policies, ids: [policyId], kinds: POLICY_FIELD_KINDS},
        {view: this.fields, ids: factIds, kinds: FACT_FIELD_KINDS}])
    } catch (cause) {
      this.policies.discardPendingChanges([policyId])
      this.fields.discardPendingChanges(factIds)
      throw cause
    }
    this.#pending = {policyId, factIds}
  }
}
