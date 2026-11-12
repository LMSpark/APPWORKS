/**
 * @module app:lowcode/resources/structured-config/dimension-source/binding-editor
 * 职责：蓝图节点“维度来源设计”的来源绑定 owner：数据模型或平台注册事件来源、字段→维度映射、根模型子集合；
 *   装载唯一绑定、新增草稿、版本/集合结构/维度启用/台账引用等业务核验，并以一次 DataSet 保存提交。
 * 边界：绑定/映射/集合/维度定义经 88A4 场景 DataView 读写；模型与字段候选是同一 PageRuntime 中 7AB 的正式视图，
 *   平台合同是 spark-data 选项目录；必填、格式、不可变、候选引用与名称回填由 pagedata 列及视图规则承担，跨字段约束由场景模型规则承担。
 *   正式模型结构（集合父子主键、外键身份）仍经数据空间设计 API 读取核验。数据模型事件与来源提交协议由各自编辑器维护。
 * AI用途：修改维度来源绑定的业务核验时在此调整，页面组合式函数只负责门禁、代次与对话框状态。
 */
import {DataViewOptionCatalog, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {normalizeCollection, validateCollectionModels, validateCollectionTree, type DimensionSourceCollection} from './collection-rules'
import {dimensionSourceContract, DIMENSION_SOURCE_CONTRACTS, type DimensionSourceContract} from './source-contracts'
import {assertReadable, bit, catalogView, changed, columnValue, liveIds, normalized, positiveInteger, readFormalModels, refreshView,
  requireView, saveDimensionSourceViews, text, type DimensionSourceTarget, type FieldKind, type Id} from './view-support'

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
/** 节点数据空间中的正式模型（7AB Base_DataModel 行）：rowid、注册名 Name 与来源名 MetaName。 */
export type DimensionSourceModel = Readonly<{id: string; name: string; sourceName: string}>

const BINDING_TABLE = 'Bil_Dimension_Source_Binding'
const MAPPING_TABLE = 'Bil_Dimension_Source_Mapping'
const COLLECTION_TABLE = 'Bil_Dimension_Source_Collection'
const MAPPING_VIEWS: Readonly<Record<DimensionSourceKind, string>> = {'data-model': 'editByBinding', 'platform-event': 'platformByBinding'}
const BUSINESS_RESULT = 'business-result'
/** 平台合同与合同维度字段目录；88A4 平台映射视图的 fieldOptions 按这些名称引用。 */
const CONTRACT_TABLE = 'DimensionSourceContract'
const CONTRACT_FIELD_TABLE = 'DimensionSourceContractField'

const SNAPSHOT_KINDS: Readonly<Record<string, FieldKind>> = {
  source_contract_id: 'text', event_code: 'text', payload_version: 'integer', binding_version: 'integer', projection_role: 'text',
  account_field_id: 'text', account_field_name: 'text', source_model_id: 'text', source_model_meta_name: 'text',
}
const PROTECTED_FIELDS = ['projection_role', 'account_field_id', 'account_field_name', 'source_model_id', 'source_model_meta_name', 'binding_version'] as const

/** 编辑器装配输入：已装配的 88A4 DataSet、正式目标、正式模型读取与维度台账引用核验入口。 */
export type DimensionSourceBindingEditorInput = Readonly<{
  /** 维度设计场景（88A4）运行 DataSet；须与 7AB 同处一个 PageRuntime。 */
  dataSet: DataSet
  /** 本次编辑的正式目标。 */
  target: DimensionSourceTarget
  /** 读取数据空间正式模型（含字段），只用于保存前的集合结构核验。 */
  readModels: DataSpaceDesignApi['readModels']
  /** 来源绑定已有未删除的正式维度结果时为 true；无法核验时抛错。 */
  hasLedgerRecords: (bindingId: string, assertCurrent: () => void) => Promise<boolean>
}>

type Snapshot = Readonly<Record<string, string | number> & {collections: string}>

function role(value: unknown): string {
  return text(value) || BUSINESS_RESULT
}

/** 蓝图节点来源绑定编辑器；一次实例只服务一个节点目标，关闭时须 dispose。 */
export class DimensionSourceBindingEditor {
  /** 节点来源绑定 DataView（byNode）。 */
  readonly binding: DataView
  /** 当前绑定的根模型子集合 DataView（byBinding）。 */
  readonly collection: DataView
  /** 已保存的同绑定子集合（父集合候选）。 */
  readonly collectionParents: DataView
  /** 维度定义候选 DataView（default）。 */
  readonly definition: DataView
  /** 节点数据空间正式模型候选（7AB）。 */
  readonly models: DataView
  /** 根模型正式输出字段候选（7AB，映射来源字段）。 */
  readonly sourceFields: DataView
  /** 根模型输出且非计算字段候选（7AB，账套字段）。 */
  readonly accountFields: DataView
  /** 节点数据空间各模型正式主键候选（7AB，集合父主键）。 */
  readonly spacePrimaryFields: DataView
  /** 平台注册事件合同目录。 */
  readonly contracts: DataView
  /** 当前平台合同的维度字段目录（映射来源字段）。 */
  readonly contractFields: DataView
  readonly #input: DimensionSourceBindingEditorInput
  readonly #mappingViews: Readonly<Record<DimensionSourceKind, DataView>>
  readonly #collectionPrimaryFields: DataView
  readonly #contractCatalog: DataViewOptionCatalog
  readonly #fieldCatalog: DataViewOptionCatalog
  #kind: DimensionSourceKind | undefined
  #model: DimensionSourceModel | undefined
  #contract: DimensionSourceContract | undefined
  #bindingId: Id | undefined
  #persisted: Snapshot | undefined
  #mappingIds = new Set<Id>()
  #collectionIds = new Set<Id>()

  /** 解析 88A4 与 7AB 视图并建立平台合同目录；视图缺失时抛错。 */
  constructor(input: DimensionSourceBindingEditorInput) {
    this.#input = input
    const {dataSet} = input
    this.binding = requireView(dataSet, BINDING_TABLE, 'byNode')
    this.#mappingViews = {'data-model': requireView(dataSet, MAPPING_TABLE, MAPPING_VIEWS['data-model']),
      'platform-event': requireView(dataSet, MAPPING_TABLE, MAPPING_VIEWS['platform-event'])}
    this.collection = requireView(dataSet, COLLECTION_TABLE, 'byBinding')
    this.collectionParents = requireView(dataSet, COLLECTION_TABLE, 'parentsByBinding')
    this.definition = requireView(dataSet, 'Bil_Dimension_Definition', 'default')
    this.models = catalogView(dataSet, 'Base_DataModel', 'dimensionSourceModels')
    this.sourceFields = catalogView(dataSet, 'Base_DataModel_Field', 'dimensionSourceFields')
    this.accountFields = catalogView(dataSet, 'Base_DataModel_Field', 'dimensionSourceKeyFields')
    this.spacePrimaryFields = catalogView(dataSet, 'Base_DataModel_Field', 'dimensionSpacePrimaryFields')
    this.#collectionPrimaryFields = catalogView(dataSet, 'Base_DataModel_Field', 'dimensionCollectionPrimaryFields')
    this.#contractCatalog = new DataViewOptionCatalog(dataSet, {tableName: CONTRACT_TABLE, fields: ['name', 'eventCode', 'payloadVersion']})
    try {
      this.#fieldCatalog = new DataViewOptionCatalog(dataSet, {tableName: CONTRACT_FIELD_TABLE, fields: ['name', 'dimensionCode', 'valueType']})
    } catch (cause) {
      this.#contractCatalog.dispose()
      throw cause
    }
    this.contracts = this.#contractCatalog.view
    this.contractFields = this.#fieldCatalog.view
  }

  /** 当前来源类别的映射视图：数据模型映射或平台事件映射。 */
  get mapping(): DataView { return this.#mappingViews[this.#kind ?? 'data-model'] }

  /** 当前来源类别；未选择来源时为 undefined。 */
  get sourceKind(): DimensionSourceKind | undefined { return this.#kind }

  /** 已选根模型（数据模型来源）。 */
  get model(): DimensionSourceModel | undefined { return this.#model }

  /** 已选平台注册事件合同。 */
  get contract(): DimensionSourceContract | undefined { return this.#contract }

  /** 当前编辑的来源绑定行 ID；未选择来源时为 undefined。 */
  get bindingId(): Id | undefined { return this.#bindingId }

  /** 存在保存结果未知的提交时为 true；此时只能重试保存核验原提交，不能修改、丢弃或新建。 */
  get unknown(): boolean { return this.#owned().some(({view}) => view.hasUnconfirmedSave) }

  /** 节点数据空间正式模型数量。 */
  get modelCount(): number { return this.models.rows.length }

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
    return liveIds(this.mapping)
  }

  /** 当前子集合行 ID（呈现顺序，不含待删除行）。 */
  collectionIds(): readonly Id[] {
    return liveIds(this.collection)
  }

  /** 本编辑器持有的绑定、映射或集合存在未保存修改。 */
  hasDraft(): boolean {
    return this.#owned().some(({view, ids}) => ids.some(id => changed(view, id)))
  }

  /** 已保存、无草稿且结果确认的来源绑定；否则为 undefined。 */
  savedBinding(): DimensionSourceSavedBinding | undefined {
    const id = this.#bindingId
    if (id === undefined || !this.#kind || this.unknown || this.hasDraft() || this.binding.dirtyTracking.isPendingCreate(id)) return undefined
    const row = this.binding.rows.find(item => this.binding.getPkKey(item) === id)
    if (!row) return undefined
    return {id: String(id), sourceKind: this.#kind, eventCode: text(row['event_code']), bindingVersion: Number(row['binding_version']),
      projectionRole: role(row['projection_role']), modelId: text(row['source_model_id']), modelMetaName: text(row['source_model_meta_name'])}
  }

  /** 读取节点已保存数据空间的正式模型与主键候选，登记平台合同目录并刷新维度定义。 */
  async loadModels(): Promise<void> {
    const {dataSpaceId} = this.#input.target
    if (!dataSpaceId) throw new Error('正式蓝图节点没有绑定数据空间')
    this.models.queryContext = {dataSetId: dataSpaceId}
    this.spacePrimaryFields.queryContext = {dataSetId: dataSpaceId}
    for (const view of [this.models, this.spacePrimaryFields, this.definition]) await this.#refresh(view)
    this.#contractCatalog.replace(DIMENSION_SOURCE_CONTRACTS.map(contract => ({value: contract.id, label: `${contract.name} · v${contract.payloadVersion}`,
      name: contract.name, eventCode: contract.eventCode, payloadVersion: String(contract.payloadVersion)})))
  }

  /** 选择来源（模型 rowid 或平台合同 ID）：唯一已有绑定直接编辑，不存在时新增草稿，多于一个时拒绝。 */
  async selectSource(kind: DimensionSourceKind, referenceId: string): Promise<void> {
    this.#assertSettled()
    if (this.hasDraft()) throw new Error('当前来源绑定还有未保存修改，请先保存或取消')
    const model = kind === 'data-model' ? this.#findModel(referenceId) : undefined
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
    if (existing) {
      assertReadable(this.binding, existing, Object.keys(SNAPSHOT_KINDS))
      if (model && text(existing['source_model_meta_name']) !== model.name) throw new Error('来源绑定模型注册名与正式数据空间不一致')
    }
    const id = existing ? this.binding.getPkKey(existing) : this.binding.getPkKey(await this.binding.addRow(this.#bindingDefaults(kind, model, contract)))
    target.assertCurrent()
    if (id === undefined) throw new Error('来源绑定缺少唯一身份')
    this.#bindingId = id
    this.#kind = kind
    this.#model = model
    this.#contract = contract
    this.binding.setCurrentRowById(id)
    if (model) {
      for (const view of [this.sourceFields, this.accountFields]) {
        view.queryContext = {modelId: model.id}
        await this.#refresh(view)
      }
    }
    this.#fieldCatalog.replace(contract ? contract.fields.filter(field => field.semanticRole === 'dimension').map(field => ({value: field.id,
      label: field.name, name: field.name, dimensionCode: field.dimensionCode ?? '', valueType: field.valueType})) : [])
    for (const view of [this.mapping, this.collection, this.collectionParents]) {
      view.queryContext = {bindingId: String(id)}
      await this.#refresh(view)
    }
    this.#mappingIds = new Set(this.mappingIds())
    this.#collectionIds = new Set(this.collectionIds())
    if (kind === 'platform-event' && this.#collectionIds.size) throw new Error('平台注册事件来源不支持数据空间集合，请先治理已有集合记录')
    this.#persisted = existing ? this.#snapshot() : undefined
  }

  /** 为当前绑定新增一条直接字段映射草稿，顺序号接续末尾，映射版本取绑定版本。 */
  async addMapping(): Promise<void> {
    const bindingId = this.#requireBinding()
    const version = Number(this.binding.getEditingRow(bindingId)?.['binding_version'])
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

  /** 新增一条根记录下的子集合草稿并设为当前行：父主键默认取根模型唯一正式主键。 */
  async addCollection(): Promise<void> {
    const bindingId = this.#requireBinding()
    if (this.#kind !== 'data-model' || !this.#model) throw new Error('平台注册事件来源不支持数据空间集合')
    const primaries = await this.#collectionPrimaryFields.queryOptionRows({fields: ['rowid', 'canonicalName'], context: {modelId: this.#model.id}})
    this.#input.target.assertCurrent()
    const primary = primaries.length === 1 ? primaries[0] : undefined
    const row = await this.collection.addRow({binding_id: String(bindingId), parent_collection_id: '', collection_name: '',
      source_model_id: '', source_model_meta_name: '', parent_key_field_id: text(primary?.['rowid']), parent_key_field_name: text(primary?.['canonicalName']),
      child_key_field_id: '', child_key_field_name: '', child_pk_field_id: '', child_pk_field_name: '',
      sort_no: columnValue(this.collection, 'sort_no', this.collectionIds().length + 1)})
    this.#input.target.assertCurrent()
    const id = this.collection.getPkKey(row)
    if (id === undefined || this.#collectionIds.has(id)) throw new Error('新增来源子集合缺少唯一身份')
    this.#collectionIds.add(id)
    this.collection.setCurrentRowById(id)
  }

  /** 选中一条子集合作为详情编辑的当前行（子外键与子主键候选按其子模型级联）。 */
  selectCollection(id: Id): void {
    this.#requireBinding()
    if (!this.#collectionIds.has(id) || !this.collection.setCurrentRowById(id)) throw new Error('来源子集合不属于本次编辑')
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
  }

  /** 业务核验后以一次 DataSet 保存提交绑定、映射与集合并回读；无修改返回 false。保存结果未知时重试只核验原提交。 */
  async save(): Promise<boolean> {
    const {dataSet, target} = this.#input
    if (!this.unknown) await this.validate()
    if (!await saveDimensionSourceViews({dataSet, targets: this.#owned(), label: '来源绑定', assertCurrent: target.assertCurrent})) return false
    const bindingId = this.#requireBinding()
    if (!this.binding.rows.some(row => this.binding.getPkKey(row) === bindingId)) throw new Error(`来源绑定已提交，但回读核验失败：${String(bindingId)} 未回读`)
    await this.#refresh(this.collectionParents)
    this.#mappingIds = new Set(this.mappingIds())
    this.#collectionIds = new Set(this.collectionIds())
    this.#persisted = this.#snapshot()
    return true
  }

  /** 保存前业务核验：目标节点、版本递增、映射唯一与启用、集合结构、维度启用；受保护字段变化且已有正式结果时拒绝。按呈现顺序重排 sort_no。 */
  async validate(): Promise<void> {
    const bindingId = this.#requireBinding()
    const {target} = this.#input
    const header = this.binding.getEditingRow(bindingId)
    if (!header) throw new Error('来源绑定已不存在')
    if (text(header['source_application_id']) !== target.applicationId || text(header['source_node_id']) !== target.nodeId) {
      throw new Error('来源绑定不属于当前蓝图节点')
    }
    const version = positiveInteger(header['binding_version'], '绑定版本')
    const persisted = this.#persisted
    if (persisted) {
      const contractChanged = text(header['source_contract_id']) !== persisted['source_contract_id']
        || text(header['event_code']) !== persisted['event_code'] || normalized('integer', header['payload_version']) !== persisted['payload_version']
      if (version < Number(persisted['binding_version']) || (contractChanged && version <= Number(persisted['binding_version']))) {
        throw new Error(contractChanged ? '平台事件合同或载荷版本变化时必须增加绑定版本' : '绑定版本不能倒退')
      }
    }
    const mappings = this.#renumber(this.mapping).map(id => this.mapping.getEditingRow(id) ?? {})
    if (bit(header['status']) === 1 && mappings.length === 0) throw new Error('启用来源绑定前至少配置一个正式字段映射')
    const pairs = new Set<string>()
    for (const [index, mapping] of mappings.entries()) {
      const pair = `${text(mapping['source_field_id'])}\u0000${text(mapping['target_definition_id'])}`
      if (pairs.has(pair)) throw new Error(`第 ${index + 1} 行与已有字段维度映射重复`)
      pairs.add(pair)
    }
    const collections = this.#collections()
    validateCollectionTree(collections)
    if (collections.length) await this.#assertCollectionModels(collections)
    if (bit(header['status']) === 1) await this.#assertDefinitionsEnabled(mappings)
    if (persisted && this.#protectedChanged(persisted) && await this.#input.hasLedgerRecords(String(bindingId), target.assertCurrent)) {
      throw new Error('已有正式维度结果使用此来源绑定，不能变更角色、模型、关联字段或绑定版本')
    }
    target.assertCurrent()
  }

  /** 丢弃本编辑器持有的绑定、映射与集合草稿，不写入任何数据；保存结果未知时拒绝。 */
  discard(): void {
    this.#assertSettled()
    this.#discardOwned()
  }

  /** 释放平台合同目录；不丢弃草稿，调用方须先 discard 或已保存。 */
  dispose(): void {
    this.#fieldCatalog.dispose()
    this.#contractCatalog.dispose()
  }

  async #refresh(view: DataView): Promise<void> {
    await refreshView(view, this.#input.target.assertCurrent)
  }

  #owned(): Array<Readonly<{view: DataView; ids: readonly Id[]}>> {
    const id = this.#bindingId
    return [{view: this.binding, ids: id === undefined ? [] : [id]}, {view: this.mapping, ids: [...this.#mappingIds]},
      {view: this.collection, ids: [...this.#collectionIds]}]
  }

  #assertSettled(): void {
    if (this.unknown) throw new Error('存在保存结果未知的来源绑定提交，请先重试保存核验')
  }

  #findModel(id: string): DimensionSourceModel | undefined {
    const row = this.models.rows.find(item => text(item['rowid']) === id)
    return row ? {id, name: text(row['Name']), sourceName: text(row['MetaName'])} : undefined
  }

  #reset(): void {
    this.#kind = undefined
    this.#model = undefined
    this.#contract = undefined
    this.#bindingId = undefined
    this.#persisted = undefined
    this.#mappingIds = new Set()
    this.#collectionIds = new Set()
  }

  #requireBinding(): Id {
    this.#assertSettled()
    if (this.#bindingId === undefined || !this.#kind) throw new Error('请先选择来源')
    return this.#bindingId
  }

  #bindingDefaults(kind: DimensionSourceKind, model: DimensionSourceModel | undefined, contract: DimensionSourceContract | undefined): DataRow {
    const {target} = this.#input
    return {binding_code: '', source_application_id: target.applicationId, source_node_id: target.nodeId, source_kind: kind,
      source_model_id: model?.id ?? '', source_model_meta_name: model?.name ?? '', source_contract_id: contract?.id ?? '',
      event_code: contract?.eventCode ?? '', payload_version: columnValue(this.binding, 'payload_version', contract?.payloadVersion ?? 1),
      binding_version: columnValue(this.binding, 'binding_version', 1), status: columnValue(this.binding, 'status', false),
      projection_role: BUSINESS_RESULT, account_field_id: '', account_field_name: ''}
  }

  #renumber(view: DataView): readonly Id[] {
    const ids = liveIds(view)
    for (const [index, id] of ids.entries()) {
      if (Number(view.getEditingRow(id)?.['sort_no']) !== index + 1) view.updateEditingValue(id, 'sort_no', columnValue(view, 'sort_no', index + 1))
    }
    return ids
  }

  #collections(): readonly DimensionSourceCollection[] {
    const ids = this.#renumber(this.collection)
    if (this.#kind !== 'data-model' && ids.length) throw new Error('平台注册事件来源不支持数据空间集合')
    return ids.map(id => normalizeCollection(String(id), this.collection.getEditingRow(id) ?? {}))
  }

  async #assertCollectionModels(collections: readonly DimensionSourceCollection[]): Promise<void> {
    const models = await readFormalModels(this.#input.readModels, this.#input.target)
    const root = models.find(item => item.id === this.#model?.id)
    if (!root || root.metaName !== this.#model?.name) throw new Error(`根来源模型不属于正式蓝图节点数据空间：${this.#model?.name ?? ''}`)
    validateCollectionModels(root, models, collections)
  }

  /** 一次性查询维度定义，不替换候选视图结果，避免使在途的编辑回填失效。 */
  async #assertDefinitionsEnabled(mappings: ReadonlyArray<Readonly<DataRow>>): Promise<void> {
    const definitions = await this.definition.queryOptionRows({fields: ['id', 'definition_code', 'status']})
    this.#input.target.assertCurrent()
    for (const [index, mapping] of mappings.entries()) {
      const id = text(mapping['target_definition_id'])
      const found = definitions.filter(row => text(row['id']) === id)
      if (found.length === 1 && bit(found[0]?.['status']) !== 1) {
        throw new Error(`第 ${index + 1} 行目标维度未启用：${text(found[0]?.['definition_code'])}`)
      }
    }
  }

  #collectionsSignature(): string {
    return JSON.stringify(this.collectionIds().map(id => normalizeCollection(String(id), this.collection.getEditingRow(id) ?? {})))
  }

  #snapshot(): Snapshot {
    const id = this.#bindingId
    const row = id === undefined ? undefined : this.binding.rows.find(item => this.binding.getPkKey(item) === id)
    if (!row) throw new Error('来源绑定已不存在')
    return {...Object.fromEntries(Object.entries(SNAPSHOT_KINDS).map(([field, kind]) => [field,
      field === 'projection_role' ? role(row[field]) : normalized(kind, row[field])])), collections: this.#collectionsSignature()}
  }

  #protectedChanged(persisted: Snapshot): boolean {
    const id = this.#bindingId
    const header = id === undefined ? undefined : this.binding.getEditingRow(id)
    if (!header) return true
    return PROTECTED_FIELDS.some(field => (field === 'projection_role' ? role(header[field])
      : normalized(SNAPSHOT_KINDS[field] ?? 'text', header[field])) !== persisted[field])
      || this.#collectionsSignature() !== persisted.collections
  }

  #discardOwned(): void {
    for (const {view, ids} of this.#owned()) if (ids.length) view.discardPendingChanges([...ids])
  }
}
