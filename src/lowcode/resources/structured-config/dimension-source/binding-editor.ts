/**
 * @module app:lowcode/resources/structured-config/dimension-source/binding-editor
 * 职责：蓝图节点“维度来源设计”的来源绑定 owner：数据模型或平台注册事件来源、字段→维度映射、根模型子集合；
 *   装载唯一绑定、草稿、正式校验、单次保存与回读核验，已有正式维度结果时拒绝变更受保护字段。
 * 边界：绑定/映射/集合/维度定义均经 88A4 场景 DataView 读写；正式模型经数据空间设计 API 读取，平台合同来自 source-contracts 注册表；
 *   候选只作为 static-data 选项视图呈现。数据模型事件与来源提交协议由各自编辑器维护。
 * AI用途：修改维度来源绑定校验或保存核验时在此调整，页面组合式函数只负责门禁、代次与对话框状态。
 */
import {buildDataViewKey, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {normalizeCollection, validateCollectionModels, validateCollectionTree, type DimensionSourceCollection} from './collection-rules'
import {dimensionSourceContract, DIMENSION_SOURCE_CONTRACTS, type DimensionSourceContract} from './source-contracts'
import {assertColumns, assertReadable, bit, columnValue, DimensionSourceChangeSubmission, DimensionSourceOptionTables, formalPrimaryField,
  normalized, pairEditing, positiveInteger, readFormalModels, refreshView, requiredText, requireView, text,
  type DimensionSourceTarget, type FieldKind, type FormalModel, type Id} from './view-support'

/** 维度来源类别：节点数据空间模型或平台注册事件。 */
export type DimensionSourceKind = 'data-model' | 'platform-event'
/** 已保存且无草稿的来源绑定身份，供数据模型事件与来源提交协议编辑器复核。 */
export type DimensionSourceSavedBinding = Readonly<{
  id: string
  sourceKind: DimensionSourceKind
  eventCode: string
  bindingVersion: number
  projectionRole: string
  modelId: string
  modelMetaName: string
}>

const BINDING_TABLE = 'Bil_Dimension_Source_Binding'
const MAPPING_TABLE = 'Bil_Dimension_Source_Mapping'
const COLLECTION_TABLE = 'Bil_Dimension_Source_Collection'
const DEFINITION_TABLE = 'Bil_Dimension_Definition'
const BINDING_VIEW = 'byNode'
const MAPPING_VIEW = 'editByBinding'
const COLLECTION_VIEW = 'byBinding'
const BUSINESS_RESULT = 'business-result'
const SOURCE_VOUCHER = 'source-voucher'

const BINDING_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  binding_code: 'text', source_application_id: 'text', source_node_id: 'text', source_kind: 'text', source_model_id: 'text',
  source_model_meta_name: 'text', source_contract_id: 'text', event_code: 'text', payload_version: 'integer', binding_version: 'integer',
  status: 'bit', effective_from: 'text', effective_to: 'text', description: 'text', projection_role: 'text',
  account_field_id: 'text', account_field_name: 'text',
}
const MAPPING_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  binding_id: 'text', source_field_id: 'text', source_field_name: 'text', target_definition_id: 'text', target_definition_code: 'text',
  mapping_kind: 'text', mapping_value: 'text', required_flag: 'bit', sort_no: 'integer', version_no: 'integer',
}
const COLLECTION_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  binding_id: 'text', parent_collection_id: 'text', collection_name: 'text', source_model_id: 'text', source_model_meta_name: 'text',
  parent_key_field_id: 'text', parent_key_field_name: 'text', child_key_field_id: 'text', child_key_field_name: 'text',
  child_pk_field_id: 'text', child_pk_field_name: 'text', sort_no: 'integer',
}
const DEFINITION_FIELDS = ['id', 'definition_code', 'status'] as const
const PROTECTED_FIELDS = ['projection_role', 'account_field_id', 'account_field_name', 'source_model_id', 'source_model_meta_name', 'binding_version'] as const

/** 编辑器装配输入：已装配的 88A4 DataSet、正式目标、正式模型读取与维度台账引用核验入口。 */
export type DimensionSourceBindingEditorInput = Readonly<{
  /** 维度设计场景（88A4）运行 DataSet。 */
  dataSet: DataSet
  /** 本次编辑的正式目标。 */
  target: DimensionSourceTarget
  /** 读取数据空间正式模型（含字段）。 */
  readModels: DataSpaceDesignApi['readModels']
  /** 来源绑定已有未删除的正式维度结果时为 true；无法核验时抛错。 */
  hasLedgerRecords: (bindingId: string, assertCurrent: () => void) => Promise<boolean>
}>

type PersistedBinding = Readonly<Record<string, string | number> & {collections: string}>
type SourceFieldOption = Readonly<{id: string; canonicalName: string; name: string; type: string; dimensionCode: string}>
type NormalizedMapping = Readonly<{
  binding_id: string
  source_field_id: string
  source_field_name: string
  target_definition_id: string
  target_definition_code: string
  mapping_kind: string
  mapping_value: string
  sort_no: number
  version_no: number
}>

function projectionRole(value: unknown): string {
  const role = text(value)
  if (role === '' || role === BUSINESS_RESULT) return BUSINESS_RESULT
  if (role === SOURCE_VOUCHER) return role
  throw new Error(`来源投影角色不受支持：${role}`)
}
function sourceKind(value: unknown): DimensionSourceKind {
  const kind = text(value)
  if (kind === 'data-model' || kind === 'platform-event') return kind
  throw new Error(`来源类型不受支持：${kind}`)
}

/** 蓝图节点来源绑定编辑器；一次实例只服务一个节点目标，关闭时须 dispose。 */
export class DimensionSourceBindingEditor {
  /** 节点来源绑定 DataView（byNode）。 */
  readonly binding: DataView
  /** 当前绑定的字段映射 DataView（editByBinding）。 */
  readonly mapping: DataView
  /** 当前绑定的根模型子集合 DataView（byBinding）。 */
  readonly collection: DataView
  /** 维度定义候选 DataView（default）。 */
  readonly definition: DataView
  /** 正式模型候选 static-data DataView（主键 id）。 */
  readonly modelOptions: DataView
  /** 平台注册事件合同候选 static-data DataView（主键 id）。 */
  readonly contractOptions: DataView
  /** 映射来源字段候选：根模型正式输出字段或平台合同维度字段。 */
  readonly fieldOptions: DataView
  /** 根模型账套字段候选：输出且非计算字段。 */
  readonly accountFieldOptions: DataView
  /** 子集合父集合候选：本次编辑中的其它集合。 */
  readonly collectionParentOptions: DataView
  /** 子集合外键候选：节点数据空间各模型输出且非计算字段。 */
  readonly collectionFieldOptions: DataView
  readonly #input: DimensionSourceBindingEditorInput
  readonly #options: DimensionSourceOptionTables
  readonly #submission: DimensionSourceChangeSubmission
  readonly #stop: () => void
  #models: readonly FormalModel[] = []
  #kind: DimensionSourceKind | undefined
  #model: FormalModel | undefined
  #contract: DimensionSourceContract | undefined
  #bindingId: Id | undefined
  #persisted: PersistedBinding | undefined
  #mappingIds = new Set<Id>()
  #collectionIds = new Set<Id>()
  #pairFailure: Error | undefined

  /** 解析 88A4 的绑定、映射、集合、维度定义视图并建立 static-data 候选视图；视图或正式字段缺失时抛错。 */
  constructor(input: DimensionSourceBindingEditorInput) {
    this.#input = input
    const {dataSet, target} = input
    this.binding = requireView(dataSet, BINDING_TABLE, BINDING_VIEW)
    this.mapping = requireView(dataSet, MAPPING_TABLE, MAPPING_VIEW)
    this.collection = requireView(dataSet, COLLECTION_TABLE, COLLECTION_VIEW)
    this.definition = requireView(dataSet, DEFINITION_TABLE, 'default')
    assertColumns(this.binding, Object.keys(BINDING_FIELD_KINDS), '来源绑定')
    assertColumns(this.mapping, Object.keys(MAPPING_FIELD_KINDS), '来源字段映射')
    assertColumns(this.collection, Object.keys(COLLECTION_FIELD_KINDS), '来源子集合')
    assertColumns(this.definition, DEFINITION_FIELDS, '维度定义')
    this.#options = new DimensionSourceOptionTables(dataSet, target)
    this.#submission = new DimensionSourceChangeSubmission(dataSet, '来源绑定', target.assertCurrent)
    try {
      this.modelOptions = this.#options.mount('DimensionSourceModelOption', ['id', 'name', 'metaName', 'sourceName'],
        () => this.#models.map(model => ({id: model.id, name: model.name, metaName: model.metaName, sourceName: model.sourceName})))
      this.contractOptions = this.#options.mount('DimensionSourceContractOption', ['id', 'name', 'eventCode', 'payloadVersion', 'label'],
        () => DIMENSION_SOURCE_CONTRACTS.map(contract => ({id: contract.id, name: contract.name, eventCode: contract.eventCode,
          payloadVersion: contract.payloadVersion, label: `${contract.name} · v${contract.payloadVersion}`})))
      this.fieldOptions = this.#options.mount('DimensionSourceFieldOption', ['id', 'canonicalName', 'name', 'type', 'dimensionCode'],
        () => this.#sourceFields())
      this.accountFieldOptions = this.#options.mount('DimensionSourceAccountOption', ['id', 'canonicalName', 'name'],
        () => (this.#kind === 'data-model' ? this.#model?.fields ?? [] : []).filter(field => field.output && !field.computed)
          .map(field => ({id: field.id, canonicalName: field.canonicalName, name: field.name})))
      this.collectionParentOptions = this.#options.mount('DimensionSourceCollectionParent', ['id', 'collectionName'],
        () => this.collectionIds().map(id => ({id, collectionName: text(this.collection.getEditingRow(id)?.['collection_name']) || String(id)})))
      this.collectionFieldOptions = this.#options.mount('DimensionSourceCollectionField', ['id', 'canonicalName', 'metaName', 'label'],
        () => this.#models.flatMap(model => model.fields.filter(field => field.output && !field.computed)
          .map(field => ({id: field.id, canonicalName: field.canonicalName, metaName: model.metaName, label: `${model.metaName}.${field.canonicalName}`}))))
    } catch (cause) {
      this.#options.release()
      throw cause
    }
    this.#stop = dataSet.onAnyViewChange({editingFieldChanged: (tableName, viewId, event) => {
      if (tableName === MAPPING_TABLE && viewId === MAPPING_VIEW && this.#mappingIds.has(event.rowId)) this.#pairMapping(event.rowId, event.field, event.nextValue)
      else if (tableName === BINDING_TABLE && viewId === BINDING_VIEW && event.rowId === this.#bindingId && event.field === 'account_field_id') {
        this.#track(pairEditing(this.binding, event.rowId, {account_field_name: this.#accountName(event.nextValue)}))
      } else if (tableName === COLLECTION_TABLE && viewId === COLLECTION_VIEW && this.#collectionIds.has(event.rowId)) {
        this.#pairCollection(event.rowId, event.field, event.nextValue)
      }
    }})
  }

  /** 视图在所属 PageRuntime 中的完整绑定键。 */
  viewKey(view: DataView): string {
    return buildDataViewKey(view.tableName, view.viewId, this.#input.dataSet.scenarioId)
  }

  /** 当前来源类别；未选择来源时为 undefined。 */
  get sourceKind(): DimensionSourceKind | undefined { return this.#kind }

  /** 已选根模型（数据模型来源）。 */
  get model(): FormalModel | undefined { return this.#model }

  /** 已选平台注册事件合同。 */
  get contract(): DimensionSourceContract | undefined { return this.#contract }

  /** 当前编辑的来源绑定行 ID；未选择来源时为 undefined。 */
  get bindingId(): Id | undefined { return this.#bindingId }

  /** 存在保存结果未知的提交时为 true；此时只能重试核验原提交，不能修改、丢弃或新建。 */
  get unknown(): boolean { return this.#submission.unknown }

  /** 节点数据空间正式模型数量。 */
  get modelCount(): number { return this.#models.length }

  /** 绑定表单字段：平台事件来源不提供根模型账套字段。 */
  bindingFormFields(): readonly string[] {
    return ['binding_code', 'event_code', 'payload_version', 'binding_version', 'projection_role',
      ...(this.#kind === 'data-model' ? ['account_field_id'] : []), 'status', 'effective_from', 'effective_to', 'description']
  }

  /** 平台合同中不能映射为维度的字段名称（供页面提示）。 */
  platformNonDimensionFields(): readonly string[] {
    return this.#contract?.fields.filter(field => field.semanticRole !== 'dimension').map(field => field.name) ?? []
  }

  /** 当前映射行 ID（呈现顺序，不含待删除行）。 */
  mappingIds(): readonly Id[] {
    return this.#liveIds(this.mapping)
  }

  /** 当前子集合行 ID（呈现顺序，不含待删除行）。 */
  collectionIds(): readonly Id[] {
    return this.#liveIds(this.collection)
  }

  /** 本编辑器持有的绑定、映射或集合存在未保存修改。 */
  hasDraft(): boolean {
    const changed = (view: DataView, id: Id) => view.hasEditingChanges(id) || view.dirtyTracking.hasPendingChanges(id)
    return (this.#bindingId !== undefined && changed(this.binding, this.#bindingId))
      || [...this.#mappingIds].some(id => changed(this.mapping, id)) || [...this.#collectionIds].some(id => changed(this.collection, id))
  }

  /** 已保存、无草稿且结果确认的来源绑定；否则为 undefined。 */
  savedBinding(): DimensionSourceSavedBinding | undefined {
    const id = this.#bindingId
    if (id === undefined || !this.#kind || this.unknown || this.hasDraft() || this.binding.dirtyTracking.isPendingCreate(id)) return undefined
    const row = this.binding.rows.find(item => this.binding.getPkKey(item) === id)
    if (!row) return undefined
    return {id: String(id), sourceKind: this.#kind, eventCode: text(row['event_code']), bindingVersion: Number(row['binding_version']),
      projectionRole: projectionRole(row['projection_role']), modelId: text(row['source_model_id']), modelMetaName: text(row['source_model_meta_name'])}
  }

  /** 读取节点已保存数据空间的正式模型，并刷新各候选视图与维度定义候选。 */
  async loadModels(): Promise<void> {
    this.#models = await readFormalModels(this.#input.readModels, this.#input.target)
    for (const view of [this.modelOptions, this.contractOptions, this.collectionFieldOptions, this.definition]) await this.#refresh(view)
  }

  /** 选择来源（模型 ID 或平台合同 ID）：唯一已有绑定直接编辑，不存在时新增草稿，多于一个时拒绝。 */
  async selectSource(kind: DimensionSourceKind, referenceId: string): Promise<void> {
    this.#submission.assertSettled()
    if (this.hasDraft()) throw new Error('当前来源绑定还有未保存修改，请先保存或取消')
    const model = kind === 'data-model' ? this.#models.find(item => item.id === referenceId) : undefined
    if (kind === 'data-model' && !model) throw new Error(`来源模型不属于当前数据空间：${referenceId}`)
    const contract = kind === 'platform-event' ? dimensionSourceContract(referenceId) : undefined
    const {target} = this.#input
    this.#discardOwned()
    this.#reset()
    this.binding.queryContext = {applicationId: target.applicationId, nodeId: target.nodeId}
    await this.#refresh(this.binding)
    const matches = this.binding.rows.filter(row => {
      assertReadable(this.binding, row, ['source_kind', 'source_model_id', 'source_contract_id'])
      return text(row['source_kind']) === kind
        && (model ? text(row['source_model_id']) === model.id : text(row['source_contract_id']) === contract?.id)
    })
    if (matches.length > 1) throw new Error(`蓝图节点来源存在 ${matches.length} 个绑定，不能自动选择，请先治理重复配置`)
    const existing = matches[0]
    let id: Id | undefined
    if (existing) {
      assertReadable(this.binding, existing, Object.keys(BINDING_FIELD_KINDS))
      if (model && text(existing['source_model_meta_name']) !== model.metaName) throw new Error('来源绑定模型注册名与正式数据空间不一致')
      if (contract && (text(existing['event_code']) !== contract.eventCode || Number(existing['payload_version']) !== contract.payloadVersion)) {
        throw new Error('来源绑定与平台注册事件合同不一致')
      }
      id = this.binding.getPkKey(existing)
    } else {
      const row = await this.binding.addRow(this.#bindingDefaults(kind, model, contract))
      target.assertCurrent()
      id = this.binding.getPkKey(row)
    }
    if (id === undefined) throw new Error('来源绑定缺少唯一身份')
    this.#bindingId = id
    this.#kind = kind
    this.#model = model
    this.#contract = contract
    this.mapping.queryContext = {bindingId: String(id)}
    await this.#refresh(this.mapping)
    this.#mappingIds = new Set(this.mappingIds())
    this.collection.queryContext = {bindingId: String(id)}
    await this.#refresh(this.collection)
    this.#collectionIds = new Set(this.collectionIds())
    if (kind === 'platform-event' && this.#collectionIds.size) throw new Error('平台注册事件来源不支持数据空间集合，请先治理已有集合记录')
    this.#persisted = existing ? this.#snapshot() : undefined
    for (const view of [this.fieldOptions, this.accountFieldOptions, this.collectionParentOptions]) await this.#refresh(view)
  }

  /** 为当前绑定新增一条直接字段映射草稿，顺序号接续末尾，映射版本取绑定版本。 */
  async addMapping(): Promise<void> {
    const bindingId = this.#requireBinding()
    const header = this.binding.getEditingRow(bindingId)
    if (!header) throw new Error('来源绑定已不存在')
    const version = Number(header['binding_version'])
    const row = await this.mapping.addRow({binding_id: String(bindingId), mapping_kind: 'direct', mapping_value: '',
      required_flag: columnValue(this.mapping, 'required_flag', false), sort_no: columnValue(this.mapping, 'sort_no', this.mappingIds().length + 1),
      version_no: columnValue(this.mapping, 'version_no', Number.isInteger(version) && version >= 1 ? version : 1)})
    this.#input.target.assertCurrent()
    const id = this.mapping.getPkKey(row)
    if (id === undefined || this.#mappingIds.has(id)) throw new Error('新增来源字段映射缺少唯一身份')
    this.#mappingIds.add(id)
  }

  /** 删除当前绑定的一条映射（新增草稿直接丢弃，已保存行标记为待删除）。 */
  async removeMapping(id: Id): Promise<void> {
    this.#requireBinding()
    if (!this.#mappingIds.has(id)) throw new Error('来源字段映射不属于本次编辑')
    if (await this.mapping.removeRow(id) !== true) throw new Error('来源字段映射删除未完成')
  }

  /** 新增一条根记录下的子集合草稿：父主键取根模型正式主键。 */
  async addCollection(): Promise<void> {
    const bindingId = this.#requireBinding()
    const root = this.#requireDataModel()
    const primary = formalPrimaryField(root)
    if (!primary) throw new Error(`模型 ${root.metaName} 缺少正式主键输出`)
    const row = await this.collection.addRow({binding_id: String(bindingId), parent_collection_id: '', collection_name: '',
      source_model_id: '', source_model_meta_name: '', parent_key_field_id: primary.id, parent_key_field_name: primary.canonicalName,
      child_key_field_id: '', child_key_field_name: '', child_pk_field_id: '', child_pk_field_name: '',
      sort_no: columnValue(this.collection, 'sort_no', this.collectionIds().length + 1)})
    this.#input.target.assertCurrent()
    const id = this.collection.getPkKey(row)
    if (id === undefined || this.#collectionIds.has(id)) throw new Error('新增来源子集合缺少唯一身份')
    this.#collectionIds.add(id)
    await this.#refresh(this.collectionParentOptions)
  }

  /** 删除一条子集合；仍有下级集合时拒绝。 */
  async removeCollection(id: Id): Promise<void> {
    this.#requireBinding()
    if (!this.#collectionIds.has(id)) throw new Error('来源子集合不属于本次编辑')
    const child = this.collectionIds().find(other => text(this.collection.getEditingRow(other)?.['parent_collection_id']) === String(id))
    if (child !== undefined) {
      const name = text(this.collection.getEditingRow(id)?.['collection_name']) || String(id)
      throw new Error(`请先移除 ${name} 下的子集合`)
    }
    if (await this.collection.removeRow(id) !== true) throw new Error('来源子集合删除未完成')
    await this.#refresh(this.collectionParentOptions)
  }

  /** 校验后以一次 DataSet 保存提交绑定、映射与集合，并回读核验；无修改返回 false。保存结果未知时重试只核验原提交。 */
  async save(): Promise<boolean> {
    const {target} = this.#input
    if (!this.#submission.unknown) {
      await this.validate()
      target.assertCurrent()
      const bindingId = this.#requireBinding()
      const changed = this.#submission.capture([
        {view: this.binding, ids: [bindingId], kinds: BINDING_FIELD_KINDS},
        {view: this.mapping, ids: [...this.#mappingIds], kinds: MAPPING_FIELD_KINDS},
        {view: this.collection, ids: [...this.#collectionIds], kinds: COLLECTION_FIELD_KINDS},
      ])
      if (!changed) return false
    }
    const expectedMappings = this.mappingIds()
    const expectedCollections = this.collectionIds()
    if (!await this.#submission.submit()) return false
    const bindingId = this.#requireBinding()
    const mismatch = (detail: string) => new Error(`来源绑定已提交，但回读核验失败：${detail}`)
    for (const view of [this.binding, this.mapping, this.collection]) await this.#refresh(view)
    if (!this.binding.rows.some(row => this.binding.getPkKey(row) === bindingId)) throw mismatch(`来源绑定 ${String(bindingId)} 未回读`)
    const same = (actual: readonly Id[], expected: readonly Id[]) => actual.length === expected.length && actual.every(id => expected.includes(id))
    if (!same(this.mappingIds(), expectedMappings)) throw mismatch('字段映射集合')
    if (!same(this.collectionIds(), expectedCollections)) throw mismatch('来源子集合')
    this.#mappingIds = new Set(this.mappingIds())
    this.#collectionIds = new Set(this.collectionIds())
    this.#persisted = this.#snapshot()
    return true
  }

  /** 保存前校验：绑定身份、来源合同与账套字段、映射、子集合、维度定义；受保护字段变化且已有正式结果时拒绝。按呈现顺序重排 sort_no。 */
  async validate(): Promise<void> {
    if (this.#pairFailure) throw this.#pairFailure
    const bindingId = this.#requireBinding()
    const {target} = this.#input
    const kind = sourceKind(this.binding.getEditingRow(bindingId)?.['source_kind'])
    if (kind !== this.#kind) throw new Error('来源绑定的来源类型不可转移')
    const contract = kind === 'platform-event' ? dimensionSourceContract(text(this.binding.getEditingRow(bindingId)?.['source_contract_id'])) : undefined
    if (contract) {
      const failure = pairEditing(this.binding, bindingId, {event_code: contract.eventCode,
        payload_version: columnValue(this.binding, 'payload_version', contract.payloadVersion)})
      if (failure) throw failure
    }
    const header = this.binding.getEditingRow(bindingId)
    if (!header) throw new Error('来源绑定已不存在')
    const binding = {
      id: requiredText(bindingId, '来源绑定 id'),
      binding_code: requiredText(header['binding_code'], '来源绑定编码'),
      source_application_id: requiredText(header['source_application_id'], '来源应用'),
      source_node_id: requiredText(header['source_node_id'], '来源蓝图节点'),
      event_code: requiredText(header['event_code'], '来源事件编码'),
      payload_version: positiveInteger(header['payload_version'], '事件载荷版本'),
      binding_version: positiveInteger(header['binding_version'], '绑定版本'),
      status: bit(header['status']),
      projection_role: projectionRole(header['projection_role']),
      account_field_id: text(header['account_field_id']),
      account_field_name: text(header['account_field_name']),
    }
    if (binding.source_application_id !== target.applicationId || binding.source_node_id !== target.nodeId) throw new Error('来源绑定不属于当前蓝图节点')
    if (kind === 'data-model') {
      requiredText(header['source_model_id'], '来源模型')
      requiredText(header['source_model_meta_name'], '来源模型注册名')
      if (text(header['source_contract_id'])) throw new Error('数据模型来源不能引用平台事件合同')
    } else if (text(header['source_model_id']) || text(header['source_model_meta_name'])) {
      throw new Error('平台注册事件来源不能绑定数据模型')
    }
    if (binding.projection_role === SOURCE_VOUCHER && kind !== 'data-model') throw new Error('来源凭证投影必须绑定节点数据空间模型')
    const accountRequired = binding.projection_role === SOURCE_VOUCHER || binding.account_field_id !== '' || binding.account_field_name !== ''
    if (accountRequired) {
      if (kind !== 'data-model') throw new Error('根模型账套字段只适用于数据模型来源')
      requiredText(binding.account_field_id, '正式账套字段')
      requiredText(binding.account_field_name, '正式账套字段输出名')
    }
    const persisted = this.#persisted
    if (persisted) {
      const version = Number(persisted['binding_version'])
      const contractChanged = text(header['source_contract_id']) !== persisted['source_contract_id']
        || binding.event_code !== persisted['event_code'] || binding.payload_version !== persisted['payload_version']
      if (binding.binding_version < version || (contractChanged && binding.binding_version <= version)) {
        throw new Error(contractChanged ? '平台事件合同或载荷版本变化时必须增加绑定版本' : '绑定版本不能倒退')
      }
    }
    const mappings = this.#normalizedMappings(binding.id)
    const collections = this.#normalizedCollections(binding.id)
    validateCollectionTree(collections)
    if (binding.status === 1 && mappings.length === 0) throw new Error('启用来源绑定前至少配置一个正式字段映射')
    const pairs = new Set<string>()
    for (const [index, mapping] of mappings.entries()) {
      const pair = `${mapping.source_field_id}\u0000${mapping.target_definition_id}`
      if (pairs.has(pair)) throw new Error(`第 ${index + 1} 行与已有字段维度映射重复`)
      pairs.add(pair)
      if (mapping.mapping_kind === 'constant' && !mapping.mapping_value) throw new Error(`第 ${index + 1} 行常量映射缺少映射值`)
    }
    if (contract) this.#assertPlatformMappings(contract, mappings)
    else await this.#assertFormalSource({header, accountRequired, mappings, collections})
    await this.#assertDefinitions(mappings, binding.status === 1)
    if (persisted && this.#protectedChanged(persisted)
      && await this.#input.hasLedgerRecords(binding.id, target.assertCurrent)) {
      throw new Error('已有正式维度结果使用此来源绑定，不能变更角色、模型、关联字段或绑定版本')
    }
    target.assertCurrent()
  }

  /** 丢弃本编辑器持有的绑定、映射与集合草稿，不写入任何数据；保存结果未知时拒绝。 */
  discard(): void {
    this.#submission.assertSettled()
    this.#discardOwned()
  }

  /** 释放订阅与临时选项表；不丢弃草稿，调用方须先 discard 或已保存。 */
  dispose(): void {
    this.#stop()
    this.#options.release()
  }

  async #refresh(view: DataView): Promise<void> {
    await refreshView(view, this.#input.target.assertCurrent)
  }

  #liveIds(view: DataView): readonly Id[] {
    return view.rows.flatMap(row => {
      const id = view.getPkKey(row)
      return id === undefined || view.dirtyTracking.pendingDeleteIds.has(id) ? [] : [id]
    })
  }

  #reset(): void {
    this.#kind = undefined
    this.#model = undefined
    this.#contract = undefined
    this.#bindingId = undefined
    this.#persisted = undefined
    this.#mappingIds = new Set()
    this.#collectionIds = new Set()
    this.#pairFailure = undefined
  }

  #requireBinding(): Id {
    this.#submission.assertSettled()
    if (this.#bindingId === undefined || !this.#kind) throw new Error('请先选择来源')
    return this.#bindingId
  }

  #requireDataModel(): FormalModel {
    if (this.#kind !== 'data-model' || !this.#model) throw new Error('平台注册事件来源不支持数据空间集合')
    return this.#model
  }

  #bindingDefaults(kind: DimensionSourceKind, model: FormalModel | undefined, contract: DimensionSourceContract | undefined): Record<string, unknown> {
    const {target} = this.#input
    return {binding_code: '', source_application_id: target.applicationId, source_node_id: target.nodeId, source_kind: kind,
      source_model_id: model?.id ?? '', source_model_meta_name: model?.metaName ?? '', source_contract_id: contract?.id ?? '',
      event_code: contract?.eventCode ?? '', payload_version: columnValue(this.binding, 'payload_version', contract?.payloadVersion ?? 1),
      binding_version: columnValue(this.binding, 'binding_version', 1), status: columnValue(this.binding, 'status', false),
      projection_role: BUSINESS_RESULT, account_field_id: '', account_field_name: ''}
  }

  #sourceFields(): readonly SourceFieldOption[] {
    if (this.#contract) {
      return this.#contract.fields.filter(field => field.semanticRole === 'dimension')
        .map(field => ({id: field.id, canonicalName: field.name, name: field.name, type: field.valueType, dimensionCode: field.dimensionCode ?? ''}))
    }
    return (this.#model?.fields ?? []).filter(field => field.output)
      .map(field => ({id: field.id, canonicalName: field.canonicalName, name: field.name, type: field.type, dimensionCode: ''}))
  }

  #accountName(value: unknown): string {
    return this.#model?.fields.find(field => field.output && !field.computed && field.id === text(value))?.canonicalName ?? ''
  }

  #definitionByCode(code: string): Readonly<Record<string, unknown>> | undefined {
    const found = this.definition.rows.filter(row => text(row['definition_code']) === code)
    return found.length === 1 ? found[0] : undefined
  }

  #track(failure: Error | undefined): void {
    if (failure) this.#pairFailure = failure
  }

  #pairMapping(id: Id, field: string, value: unknown): void {
    if (field === 'source_field_id') {
      const source = this.#sourceFields().find(item => item.id === text(value))
      this.#track(pairEditing(this.mapping, id, {source_field_name: source?.canonicalName ?? ''}))
      if (this.#contract) {
        const definition = source?.dimensionCode ? this.#definitionByCode(source.dimensionCode) : undefined
        this.#track(pairEditing(this.mapping, id, {target_definition_id: text(definition?.['id'])}))
      }
    } else if (field === 'target_definition_id') {
      const found = this.definition.rows.filter(row => text(row['id']) === text(value))
      this.#track(pairEditing(this.mapping, id, {target_definition_code: found.length === 1 ? text(found[0]?.['definition_code']) : ''}))
    }
  }

  #pairCollection(id: Id, field: string, value: unknown): void {
    if (field === 'source_model_id') {
      const child = this.#models.find(model => model.id === text(value))
      const primary = child ? formalPrimaryField(child) : undefined
      this.#track(pairEditing(this.collection, id, {source_model_meta_name: child?.metaName ?? '', child_pk_field_id: primary?.id ?? '',
        child_pk_field_name: primary?.canonicalName ?? '', child_key_field_id: '', child_key_field_name: ''}))
      for (const other of this.collectionIds()) {
        if (text(this.collection.getEditingRow(other)?.['parent_collection_id']) === String(id)) this.#pairParentKey(other)
      }
    } else if (field === 'parent_collection_id') {
      this.#pairParentKey(id)
    } else if (field === 'child_key_field_id') {
      const meta = text(this.collection.getEditingRow(id)?.['source_model_meta_name'])
      const child = this.#models.find(model => model.metaName === meta)
      const key = child?.fields.find(item => item.output && !item.computed && item.id === text(value))
      this.#track(pairEditing(this.collection, id, {child_key_field_name: key?.canonicalName ?? ''}))
    } else if (field === 'collection_name') {
      this.collectionParentOptions.refresh().catch((cause: unknown) => this.#track(cause instanceof Error ? cause : new Error(String(cause))))
    }
  }

  #pairParentKey(id: Id): void {
    const parentId = text(this.collection.getEditingRow(id)?.['parent_collection_id'])
    const parentMeta = parentId ? text(this.collection.getEditingRow(parentId)?.['source_model_meta_name']) : this.#model?.metaName
    const parent = this.#models.find(model => model.metaName === parentMeta)
    const primary = parent ? formalPrimaryField(parent) : undefined
    this.#track(pairEditing(this.collection, id, {parent_key_field_id: primary?.id ?? '', parent_key_field_name: primary?.canonicalName ?? ''}))
  }

  #normalizedMappings(bindingId: string): readonly NormalizedMapping[] {
    const ids = this.mappingIds()
    for (const [index, id] of ids.entries()) {
      if (Number(this.mapping.getEditingRow(id)?.['sort_no']) !== index + 1) this.mapping.updateEditingValue(id, 'sort_no', columnValue(this.mapping, 'sort_no', index + 1))
    }
    return ids.map((id, index) => {
      const row = this.mapping.getEditingRow(id)
      const label = (name: string) => `第 ${index + 1} 行${name}`
      if (!row) throw new Error(`${label('来源字段映射')}已不存在`)
      const kind = requiredText(row['mapping_kind'], label('映射类型'))
      if (kind !== 'direct' && kind !== 'constant') throw new Error(`${label('映射类型')}不受支持：${kind}`)
      const mapping = {
        binding_id: requiredText(row['binding_id'], label('来源绑定 id')),
        source_field_id: requiredText(row['source_field_id'], label('来源字段')),
        source_field_name: requiredText(row['source_field_name'], label('来源字段名')),
        target_definition_id: requiredText(row['target_definition_id'], label('目标维度定义')),
        target_definition_code: requiredText(row['target_definition_code'], label('目标维度编码')),
        mapping_kind: kind,
        mapping_value: text(row['mapping_value']),
        sort_no: positiveInteger(row['sort_no'], label('映射顺序')),
        version_no: positiveInteger(row['version_no'], label('映射版本')),
      }
      if (mapping.binding_id !== bindingId) throw new Error(`${label('来源字段映射')}不属于当前来源绑定`)
      return mapping
    })
  }

  #normalizedCollections(bindingId: string): readonly DimensionSourceCollection[] {
    const ids = this.collectionIds()
    if (this.#kind !== 'data-model' && ids.length) throw new Error('平台注册事件来源不支持数据空间集合')
    for (const [index, id] of ids.entries()) {
      if (Number(this.collection.getEditingRow(id)?.['sort_no']) !== index + 1) {
        this.collection.updateEditingValue(id, 'sort_no', columnValue(this.collection, 'sort_no', index + 1))
      }
    }
    return ids.map((id, index) => {
      const row = this.collection.getEditingRow(id)
      if (!row) throw new Error(`第 ${index + 1} 行来源子集合已不存在`)
      const collection = normalizeCollection(String(id), row, index)
      if (collection.binding_id !== bindingId) throw new Error(`第 ${index + 1} 行来源子集合不属于当前来源绑定`)
      return collection
    })
  }

  #assertPlatformMappings(contract: DimensionSourceContract, mappings: readonly NormalizedMapping[]): void {
    const fields = new Map(contract.fields.map(field => [field.id, field]))
    for (const [index, mapping] of mappings.entries()) {
      const field = fields.get(mapping.source_field_id)
      if (!field) throw new Error(`第 ${index + 1} 行来源字段不属于平台注册事件合同：${mapping.source_field_id}`)
      if (field.name !== mapping.source_field_name) throw new Error(`第 ${index + 1} 行来源字段名称与平台注册事件合同不一致：${field.name}`)
      if (field.semanticRole !== 'dimension') {
        throw new Error(`第 ${index + 1} 行来源字段 ${field.name} 的语义角色是 ${field.semanticRole}，不能映射为维度定义`)
      }
      if (field.dimensionCode !== mapping.target_definition_code) throw new Error(`第 ${index + 1} 行来源字段 ${field.name} 只能映射到维度 ${field.dimensionCode ?? ''}`)
    }
  }

  async #assertFormalSource(input: Readonly<{header: Readonly<Record<string, unknown>>; accountRequired: boolean
    mappings: readonly NormalizedMapping[]; collections: readonly DimensionSourceCollection[]}>): Promise<void> {
    const {header, accountRequired, mappings, collections} = input
    const models = await readFormalModels(this.#input.readModels, this.#input.target)
    const metaName = text(header['source_model_meta_name'])
    const root = models.find(item => item.metaName === metaName)
    if (!root) throw new Error(`根来源模型不属于正式蓝图节点数据空间：${metaName}`)
    if (root.id !== text(header['source_model_id'])) throw new Error('根来源模型正式身份与来源绑定不一致')
    if (accountRequired) {
      const account = root.fields.find(field => field.id === text(header['account_field_id']))
      if (!account?.output || account.computed || account.canonicalName !== text(header['account_field_name'])) {
        throw new Error('账套字段必须匹配根模型正式输出字段身份与名称')
      }
    }
    for (const [index, mapping] of mappings.entries()) {
      if (mapping.mapping_kind !== 'direct') continue
      const field = root.fields.find(item => item.id === mapping.source_field_id)
      if (!field?.output || field.canonicalName !== mapping.source_field_name) {
        throw new Error(`第 ${index + 1} 行直接来源字段必须匹配根模型正式输出字段身份与名称`)
      }
    }
    validateCollectionModels(root, models, collections)
  }

  async #assertDefinitions(mappings: readonly NormalizedMapping[], requireEnabled: boolean): Promise<void> {
    await this.#refresh(this.definition)
    for (const [index, mapping] of mappings.entries()) {
      const found = this.definition.rows.filter(row => {
        assertReadable(this.definition, row, DEFINITION_FIELDS)
        return text(row['id']) === mapping.target_definition_id
      })
      const definition = found[0]
      if (found.length !== 1 || !definition) throw new Error(`第 ${index + 1} 行目标维度不存在或身份不唯一：${mapping.target_definition_id}`)
      if (text(definition['definition_code']) !== mapping.target_definition_code) {
        throw new Error(`第 ${index + 1} 行目标维度身份与编码不一致：${mapping.target_definition_code}`)
      }
      if (requireEnabled && bit(definition['status']) !== 1) throw new Error(`第 ${index + 1} 行目标维度未启用：${mapping.target_definition_code}`)
    }
  }

  #collectionsSignature(): string {
    return JSON.stringify(this.collectionIds().map(id => {
      const row = this.collection.getEditingRow(id) ?? {}
      return [String(id), ...Object.entries(COLLECTION_FIELD_KINDS).map(([field, kind]) => normalized(kind, row[field]))]
    }))
  }

  #snapshot(): PersistedBinding {
    const id = this.#bindingId
    const row = id === undefined ? undefined : this.binding.rows.find(item => this.binding.getPkKey(item) === id)
    if (!row) throw new Error('来源绑定已不存在')
    return {...Object.fromEntries(Object.entries(BINDING_FIELD_KINDS).map(([field, kind]) => [field,
      field === 'projection_role' ? projectionRole(row[field]) : normalized(kind, row[field])])), collections: this.#collectionsSignature()}
  }

  #protectedChanged(persisted: PersistedBinding): boolean {
    const id = this.#bindingId
    const header = id === undefined ? undefined : this.binding.getEditingRow(id)
    if (!header) return true
    return PROTECTED_FIELDS.some(field => (field === 'projection_role' ? projectionRole(header[field])
      : normalized(BINDING_FIELD_KINDS[field] ?? 'text', header[field])) !== persisted[field])
      || this.#collectionsSignature() !== persisted.collections
  }

  #discardOwned(): void {
    if (this.#mappingIds.size) this.mapping.discardPendingChanges([...this.#mappingIds])
    if (this.#collectionIds.size) this.collection.discardPendingChanges([...this.#collectionIds])
    if (this.#bindingId !== undefined) this.binding.discardPendingChanges([this.#bindingId])
  }
}
