/**
 * @module app:lowcode/resources/structured-config/dimension-source/binding-editor
 * 职责：蓝图节点“维度来源设计”的数据模型来源绑定与字段→维度映射编辑 owner：装载唯一绑定、草稿、正式校验、单次保存与回读核验。
 * 边界：只处理 source_kind=data-model；绑定/映射/维度定义均经 88A4 场景 DataView 读写，正式模型经数据空间设计 API 读取，
 *   模型与字段候选只作为 static-data 选项视图呈现，不作为正式数据副本保存。平台事件、来源集合、提交协议不在本模块。
 * AI用途：修改维度来源绑定校验或保存核验时在此调整，页面组合式函数只负责门禁、代次与对话框状态。
 */
import {buildDataViewKey, dataSetCommandQueryResultFromLocalRows, ensureDataSetStaticInputTable, DataSetSavePreflightError,
  type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'

/** DataView 行主键身份（GUID 文本或数值）。 */
type Id = string | number
/** 数据空间设计 API 返回的正式模型（含字段）。 */
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModels']>>[number]
type SaveAction = 'added' | 'changed' | 'deleted'
type CapturedRow = Readonly<{id: Id; action: SaveAction; values: Readonly<Record<string, string | number>>}>
type CapturedGroup = Readonly<{view: DataView; ids: readonly Id[]; rows: readonly CapturedRow[]}>
type FieldKind = 'text' | 'integer' | 'bit'

const BINDING_TABLE = 'Bil_Dimension_Source_Binding'
const MAPPING_TABLE = 'Bil_Dimension_Source_Mapping'
const DEFINITION_TABLE = 'Bil_Dimension_Definition'
const BINDING_VIEW = 'byNode'
const MAPPING_VIEW = 'editByBinding'
const SOURCE_KIND = 'data-model'
const BUSINESS_RESULT = 'business-result'

const BINDING_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  binding_code: 'text', source_application_id: 'text', source_node_id: 'text', source_kind: 'text', source_model_id: 'text',
  source_model_meta_name: 'text', event_code: 'text', payload_version: 'integer', binding_version: 'integer', status: 'bit',
  effective_from: 'text', effective_to: 'text', description: 'text', projection_role: 'text',
}
const MAPPING_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  binding_id: 'text', source_field_id: 'text', source_field_name: 'text', target_definition_id: 'text', target_definition_code: 'text',
  mapping_kind: 'text', mapping_value: 'text', required_flag: 'bit', sort_no: 'integer', version_no: 'integer',
}
const OPTIONAL_BINDING_FIELDS = ['effective_from', 'effective_to', 'description', 'projection_role']
const DEFINITION_FIELDS = ['id', 'definition_code', 'status'] as const

/** 维度来源编辑的正式目标：蓝图应用、节点与该节点已保存回读的主数据空间；assertCurrent 拒绝迟到结果。 */
export type DimensionSourceBindingTarget = Readonly<{
  /** 蓝图所属应用 ID，写入 source_application_id。 */
  applicationId: string
  /** 蓝图节点稳定 ID，写入 source_node_id。 */
  nodeId: string
  /** 节点已保存的主数据空间（conid）；来源模型必须属于该空间。 */
  dataSpaceId: string
  /** 编辑目标仍为当前节点与上下文；失效时抛错。 */
  assertCurrent: () => void
}>

/** 编辑器装配输入：已装配的 88A4 DataSet、正式目标及正式模型读取入口。 */
export type DimensionSourceBindingEditorInput = Readonly<{
  /** 维度设计场景（88A4）运行 DataSet。 */
  dataSet: DataSet
  /** 本次编辑的正式目标。 */
  target: DimensionSourceBindingTarget
  /** 读取数据空间正式模型（含字段）。 */
  readModels: DataSpaceDesignApi['readModels']
}>

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}
function requiredText(value: unknown, label: string): string {
  const result = text(value)
  if (!result) throw new Error(`${label}不能为空`)
  return result
}
function positiveInteger(value: unknown, label: string): number {
  const result = text(value) === '' ? Number.NaN : Number(value)
  if (!Number.isInteger(result) || result < 1) throw new Error(`${label}必须是正整数`)
  return result
}
function bit(value: unknown): number {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value === 0 ? 0 : 1
  return ['1', 'true', 'yes', '\u0001'].includes(text(value).toLowerCase()) ? 1 : 0
}
function projectionRole(value: unknown): string {
  const role = text(value)
  if (role === '' || role === BUSINESS_RESULT) return BUSINESS_RESULT
  if (role === 'source-voucher') return role
  throw new Error(`来源投影角色不受支持：${role}`)
}
function normalized(kind: FieldKind, value: unknown): string | number {
  if (kind === 'bit') return bit(value)
  if (kind === 'integer') return text(value) === '' ? '' : Number(value)
  return text(value)
}
function hasColumn(view: DataView, field: string): boolean {
  return view.columns.some(column => column.name === field)
}
function assertColumns(view: DataView, fields: readonly string[], label: string): void {
  const missing = fields.filter(field => !hasColumn(view, field))
  if (missing.length) throw new Error(`${label}视图缺少正式字段：${missing.join('、')}`)
}
function assertReadable(view: DataView, row: Readonly<DataRow>, fields: readonly string[]): void {
  for (const field of fields) {
    if (view.fieldAccess(row, field).read !== 'visible') throw new Error(`字段 ${field} 无法读取，不能核验维度来源绑定`)
  }
}
/** 按正式列类型写入整数或 0/1 标志：布尔列写布尔，文本列写数字文本，其余写数字，避免 DataView 类型校验拒绝。 */
function columnValue(view: DataView, field: string, value: number | boolean): string | number | boolean {
  const type = view.columns.find(column => column.name === field)?.type.toLowerCase() ?? ''
  const numeric = typeof value === 'boolean' ? (value ? 1 : 0) : value
  if (type === 'boolean' || type === 'bool') return numeric === 1
  return ['string', 'varchar', 'text'].includes(type) ? String(numeric) : numeric
}
function requireView(dataSet: DataSet, tableName: string, viewId: string): DataView {
  const view = dataSet.getView(tableName, viewId)
  if (!view) throw new Error(`维度设计场景缺少视图 ${tableName}.${viewId}`)
  return view
}

/** 蓝图节点数据模型来源绑定编辑器；一次实例只服务一个节点目标，关闭时须 dispose。 */
export class DimensionSourceBindingEditor {
  /** 节点来源绑定 DataView（byNode）。 */
  readonly binding: DataView
  /** 当前绑定的字段映射 DataView（editByBinding）。 */
  readonly mapping: DataView
  /** 维度定义候选 DataView（default）。 */
  readonly definition: DataView
  /** 正式模型候选 static-data DataView。 */
  readonly modelOptions: DataView
  /** 当前根模型正式输出字段候选 static-data DataView。 */
  readonly fieldOptions: DataView
  readonly #input: DimensionSourceBindingEditorInput
  readonly #tables: string[] = []
  readonly #stop: () => void
  #models: readonly FormalModel[] = []
  #model: FormalModel | undefined
  #bindingId: Id | undefined
  #persistedVersion: number | undefined
  #mappingIds = new Set<Id>()
  #captured: readonly CapturedGroup[] | undefined
  #unknown: Error | undefined
  #pairFailure: Error | undefined

  /** 解析 88A4 的绑定、映射、维度定义视图并建立模型/字段 static-data 选项视图；视图或正式字段缺失时抛错。 */
  constructor(input: DimensionSourceBindingEditorInput) {
    this.#input = input
    const {dataSet} = input
    this.binding = requireView(dataSet, BINDING_TABLE, BINDING_VIEW)
    this.mapping = requireView(dataSet, MAPPING_TABLE, MAPPING_VIEW)
    this.definition = requireView(dataSet, DEFINITION_TABLE, 'default')
    assertColumns(this.binding, Object.keys(BINDING_FIELD_KINDS).filter(field => !OPTIONAL_BINDING_FIELDS.includes(field)), '来源绑定')
    assertColumns(this.mapping, Object.keys(MAPPING_FIELD_KINDS), '来源字段映射')
    assertColumns(this.definition, DEFINITION_FIELDS, '维度定义')
    try {
      this.modelOptions = this.#mountOptions('DimensionSourceModelOption', ['id', 'name', 'metaName', 'sourceName'],
        () => this.#models.map(model => ({id: model.id, name: model.name, metaName: model.metaName, sourceName: model.sourceName})))
      this.fieldOptions = this.#mountOptions('DimensionSourceFieldOption', ['id', 'canonicalName', 'name', 'type'],
        () => this.#outputFields().map(field => ({id: field.id, canonicalName: field.canonicalName, name: field.name, type: field.type})))
    } catch (cause) {
      this.#releaseTables()
      throw cause
    }
    this.#stop = dataSet.onAnyViewChange({editingFieldChanged: (tableName, viewId, event) => {
      if (tableName !== MAPPING_TABLE || viewId !== MAPPING_VIEW || !this.#mappingIds.has(event.rowId)) return
      if (event.field === 'source_field_id') this.#pair(event.rowId, 'source_field_name', this.#fieldName(event.nextValue))
      else if (event.field === 'target_definition_id') this.#pair(event.rowId, 'target_definition_code', this.#definitionCode(event.nextValue))
    }})
  }

  /** 视图在所属 PageRuntime 中的完整绑定键。 */
  viewKey(view: DataView): string {
    return buildDataViewKey(view.tableName, view.viewId, this.#input.dataSet.scenarioId)
  }

  /** 已选根模型；未选择时为 undefined。 */
  get model(): FormalModel | undefined { return this.#model }

  /** 当前编辑的来源绑定行 ID；未选择模型时为 undefined。 */
  get bindingId(): Id | undefined { return this.#bindingId }

  /** 存在保存结果未知的提交时为 true；此时只能重试核验原提交，不能修改、丢弃或新建。 */
  get unknown(): boolean { return this.#unknown !== undefined }

  /** 绑定视图实际输出的可编辑表单字段。 */
  bindingFormFields(): readonly string[] {
    return ['binding_code', 'event_code', 'payload_version', 'binding_version', 'status', 'effective_from', 'effective_to', 'description']
      .filter(field => hasColumn(this.binding, field))
  }

  /** 当前映射行 ID（呈现顺序，不含待删除行）。 */
  mappingIds(): readonly Id[] {
    return this.mapping.rows.flatMap(row => {
      const id = this.mapping.getPkKey(row)
      return id === undefined || this.mapping.dirtyTracking.pendingDeleteIds.has(id) ? [] : [id]
    })
  }

  /** 本编辑器持有的绑定或映射存在未保存修改。 */
  hasDraft(): boolean {
    const changed = (view: DataView, id: Id) => view.hasEditingChanges(id) || view.dirtyTracking.hasPendingChanges(id)
    return (this.#bindingId !== undefined && changed(this.binding, this.#bindingId)) || [...this.#mappingIds].some(id => changed(this.mapping, id))
  }

  /** 读取节点已保存数据空间的正式模型，并刷新模型候选与维度定义候选。 */
  async loadModels(): Promise<void> {
    this.#models = await this.#readModels()
    await this.#refresh(this.modelOptions)
    await this.#refresh(this.definition)
  }

  /** 选择根来源模型：唯一已有绑定直接编辑，不存在时新增草稿，多于一个时拒绝。 */
  async selectModel(modelId: string): Promise<void> {
    if (this.#unknown) throw new Error('存在保存结果未知的来源绑定提交，请先重试保存核验')
    if (this.hasDraft()) throw new Error('当前来源绑定还有未保存修改，请先保存或取消')
    const model = this.#models.find(item => item.id === modelId)
    if (!model) throw new Error(`来源模型不属于当前数据空间：${modelId}`)
    const {target} = this.#input
    this.#discardOwned()
    this.#model = undefined
    this.#bindingId = undefined
    this.#mappingIds = new Set()
    this.binding.queryContext = {applicationId: target.applicationId, nodeId: target.nodeId}
    await this.#refresh(this.binding)
    const matches = this.binding.rows.filter(row => {
      assertReadable(this.binding, row, ['source_kind', 'source_model_id'])
      return text(row['source_kind']) === SOURCE_KIND && text(row['source_model_id']) === model.id
    })
    if (matches.length > 1) throw new Error(`蓝图节点来源存在 ${matches.length} 个绑定，不能自动选择，请先治理重复配置`)
    const existing = matches[0]
    let id: Id | undefined
    if (existing) {
      id = this.binding.getPkKey(existing)
      this.#persistedVersion = positiveInteger(existing['binding_version'], '绑定版本')
    } else {
      const row = await this.binding.addRow(this.#bindingDefaults(model))
      target.assertCurrent()
      id = this.binding.getPkKey(row)
      this.#persistedVersion = undefined
    }
    if (id === undefined) throw new Error('来源绑定缺少唯一身份')
    this.#bindingId = id
    this.#model = model
    this.mapping.queryContext = {bindingId: String(id)}
    await this.#refresh(this.mapping)
    this.#mappingIds = new Set(this.mappingIds())
    await this.#refresh(this.fieldOptions)
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

  /** 校验后以一次 DataSet 保存提交绑定与映射，并回读核验；无修改返回 false。保存结果未知时重试只核验原提交，不以新身份重提。 */
  async save(): Promise<boolean> {
    const {dataSet, target} = this.#input
    if (!this.#unknown) {
      await this.validate()
      target.assertCurrent()
      this.#captured = this.#capture()
    }
    const groups = this.#captured
    if (!groups?.length) return false
    try {
      const response = await dataSet.saveChanges({views: groups.map(group => ({tableName: group.view.tableName, viewId: group.view.viewId, ids: [...group.ids]}))})
      target.assertCurrent()
      if (!response.data) throw new Error(response.error?.message ?? response.message ?? '来源绑定保存缺少回执')
      const complete = groups.every(group => {
        const receipt = response.data?.viewResults.find(item => item.tableName === group.view.tableName && item.viewId === group.view.viewId)
        const counted = (action: SaveAction) => group.rows.filter(row => row.action === action).length
        return receipt?.failedCount === 0 && receipt.failedEditingRows === 0
          && receipt.createdCount === counted('added') && receipt.savedCount === counted('changed') && receipt.deletedCount === counted('deleted')
      })
      if (!response.success || !complete) throw new Error(response.error?.message ?? response.message ?? '来源绑定保存未全部确认')
      this.#unknown = undefined
    } catch (cause) {
      if (cause instanceof Error && groups.some(group => group.view.hasUnconfirmedSaveFor(group.ids, cause))) {
        this.#unknown = cause
        throw new Error(`${cause.message}；来源绑定保存结果未知，请重试“保存”核验原提交，不会以新身份重新提交`)
      }
      this.#unknown = undefined
      if (cause instanceof DataSetSavePreflightError) this.#captured = undefined
      throw cause
    }
    await this.#readback(groups)
    this.#captured = undefined
    return true
  }

  /** 端口自参考 normalizeBinding/normalizeMapping、#validateFormalSource、#assertTargetDefinitions 的保存前校验；同时按呈现顺序重排 sort_no。 */
  async validate(): Promise<void> {
    if (this.#pairFailure) throw this.#pairFailure
    const bindingId = this.#requireBinding()
    const {target} = this.#input
    const header = this.binding.getEditingRow(bindingId)
    if (!header) throw new Error('来源绑定已不存在')
    if (text(header['source_kind']) !== SOURCE_KIND) throw new Error(`来源类型不受支持：${text(header['source_kind'])}`)
    const binding = {
      id: requiredText(bindingId, '来源绑定 id'),
      binding_code: requiredText(header['binding_code'], '来源绑定编码'),
      source_application_id: requiredText(header['source_application_id'], '来源应用'),
      source_node_id: requiredText(header['source_node_id'], '来源蓝图节点'),
      source_model_id: requiredText(header['source_model_id'], '来源模型'),
      source_model_meta_name: requiredText(header['source_model_meta_name'], '来源模型注册名'),
      event_code: requiredText(header['event_code'], '来源事件编码'),
      payload_version: positiveInteger(header['payload_version'], '事件载荷版本'),
      binding_version: positiveInteger(header['binding_version'], '绑定版本'),
      status: bit(header['status']),
    }
    if (hasColumn(this.binding, 'projection_role')) projectionRole(header['projection_role'])
    if (binding.source_application_id !== target.applicationId || binding.source_node_id !== target.nodeId) {
      throw new Error('来源绑定不属于当前蓝图节点')
    }
    if (this.#persistedVersion !== undefined && binding.binding_version < this.#persistedVersion) throw new Error('绑定版本不能倒退')
    const ids = this.mappingIds()
    for (const [index, id] of ids.entries()) {
      if (Number(this.mapping.getEditingRow(id)?.['sort_no']) !== index + 1) this.mapping.updateEditingValue(id, 'sort_no', columnValue(this.mapping, 'sort_no', index + 1))
    }
    const mappings = ids.map((id, index) => {
      const row = this.mapping.getEditingRow(id)
      const label = (name: string) => `第 ${index + 1} 行${name}`
      if (!row) throw new Error(`${label('来源字段映射')}已不存在`)
      const kind = requiredText(row['mapping_kind'], label('映射类型'))
      if (kind !== 'direct' && kind !== 'constant') throw new Error(`${label('映射类型')}不受支持：${kind}`)
      const mapping = {
        id: requiredText(id, label('来源字段映射 id')),
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
      if (mapping.binding_id !== binding.id) throw new Error(`${label('来源字段映射')}不属于当前来源绑定`)
      return mapping
    })
    if (binding.status === 1 && mappings.length === 0) throw new Error('启用来源绑定前至少配置一个正式字段映射')
    const pairs = new Set<string>()
    for (const [index, mapping] of mappings.entries()) {
      const pair = `${mapping.source_field_id}\u0000${mapping.target_definition_id}`
      if (pairs.has(pair)) throw new Error(`第 ${index + 1} 行与已有字段维度映射重复`)
      pairs.add(pair)
      if (mapping.mapping_kind === 'constant' && !mapping.mapping_value) throw new Error(`第 ${index + 1} 行常量映射缺少映射值`)
    }
    const models = await this.#readModels()
    const model = models.find(item => item.metaName === binding.source_model_meta_name)
    if (!model) throw new Error(`根来源模型不属于正式蓝图节点数据空间：${binding.source_model_meta_name}`)
    if (model.id !== binding.source_model_id) throw new Error('根来源模型正式身份与来源绑定不一致')
    for (const [index, mapping] of mappings.entries()) {
      if (mapping.mapping_kind !== 'direct') continue
      const field = model.fields.find(item => item.id === mapping.source_field_id)
      if (!field?.output || field.canonicalName !== mapping.source_field_name) {
        throw new Error(`第 ${index + 1} 行直接来源字段必须匹配根模型正式输出字段身份与名称`)
      }
    }
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
      if (binding.status === 1 && bit(definition['status']) !== 1) throw new Error(`第 ${index + 1} 行目标维度未启用：${mapping.target_definition_code}`)
    }
  }

  /** 丢弃本编辑器持有的绑定与映射草稿，不写入任何数据；保存结果未知时拒绝。 */
  discard(): void {
    if (this.#unknown) throw new Error('来源绑定保存结果未知，不能丢弃原提交；请先重试保存核验')
    this.#discardOwned()
    this.#captured = undefined
  }

  /** 释放订阅与临时选项表；不丢弃草稿，调用方须先 discard 或已保存。 */
  dispose(): void {
    this.#stop()
    this.#releaseTables()
  }

  async #readModels(): Promise<readonly FormalModel[]> {
    const {target} = this.#input
    if (!target.dataSpaceId) throw new Error('正式蓝图节点没有绑定数据空间')
    const models = await this.#input.readModels({designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: target.dataSpaceId,
      assertCurrent: target.assertCurrent})
    target.assertCurrent()
    return models
  }

  async #refresh(view: DataView): Promise<void> {
    view.assertResultReplacementAllowed()
    await view.refresh()
    this.#input.target.assertCurrent()
    if (view.loadingError) throw view.loadingError
  }

  #requireBinding(): Id {
    if (this.#unknown) throw new Error('存在保存结果未知的来源绑定提交，请先重试保存核验')
    if (this.#bindingId === undefined || !this.#model) throw new Error('请先选择来源模型')
    return this.#bindingId
  }

  #bindingDefaults(model: FormalModel): Record<string, unknown> {
    const {target} = this.#input
    return {binding_code: '', source_application_id: target.applicationId, source_node_id: target.nodeId, source_kind: SOURCE_KIND,
      source_model_id: model.id, source_model_meta_name: model.metaName, event_code: '', payload_version: columnValue(this.binding, 'payload_version', 1),
      binding_version: columnValue(this.binding, 'binding_version', 1),
      status: columnValue(this.binding, 'status', false), ...(hasColumn(this.binding, 'projection_role') ? {projection_role: BUSINESS_RESULT} : {})}
  }

  #outputFields(): FormalModel['fields'] {
    return this.#model?.fields.filter(field => field.output) ?? []
  }

  #fieldName(value: unknown): string {
    return this.#outputFields().find(field => field.id === text(value))?.canonicalName ?? ''
  }

  #definitionCode(value: unknown): string {
    const found = this.definition.rows.filter(row => text(row['id']) === text(value))
    return found.length === 1 ? text(found[0]?.['definition_code']) : ''
  }

  #pair(id: Id, field: string, value: string): void {
    try {
      if (text(this.mapping.getEditingRow(id)?.[field]) !== value) this.mapping.updateEditingValue(id, field, value)
      this.#pairFailure = undefined
    } catch (cause) {
      this.#pairFailure = cause instanceof Error ? cause : new Error(String(cause))
    }
  }

  #discardOwned(): void {
    if (this.#mappingIds.size) this.mapping.discardPendingChanges([...this.#mappingIds])
    if (this.#bindingId !== undefined) this.binding.discardPendingChanges([this.#bindingId])
  }

  #capture(): readonly CapturedGroup[] {
    const bindingId = this.#requireBinding()
    const groups: CapturedGroup[] = []
    const add = (view: DataView, ids: readonly Id[], kinds: Readonly<Record<string, FieldKind>>) => {
      const changed = ids.filter(id => view.hasEditingChanges(id) || view.dirtyTracking.hasPendingChanges(id))
      if (!changed.length) return
      groups.push({view, ids: changed, rows: changed.map((id): CapturedRow => {
        if (view.dirtyTracking.pendingDeleteIds.has(id)) return {id, action: 'deleted', values: {}}
        const row = view.getEditingRow(id)
        if (!row) throw new Error('待保存来源绑定行已不存在')
        return {id, action: view.dirtyTracking.isPendingCreate(id) ? 'added' : 'changed', values: Object.fromEntries(Object.entries(kinds)
          .filter(([field]) => hasColumn(view, field)).map(([field, kind]) => [field, normalized(kind, row[field])]))}
      })})
    }
    add(this.binding, [bindingId], BINDING_FIELD_KINDS)
    add(this.mapping, [...this.#mappingIds], MAPPING_FIELD_KINDS)
    return groups
  }

  async #readback(groups: readonly CapturedGroup[]): Promise<void> {
    const bindingId = this.#requireBinding()
    const expectedMappings = this.mappingIds()
    for (const view of [this.binding, this.mapping]) {
      if (view.hasPendingSavedRowPermissions) await view.refreshSavedRowPermissions()
      await this.#refresh(view)
    }
    const mismatch = (detail: string) => new Error(`来源绑定保存后读回不一致：${detail}`)
    for (const group of groups) for (const expected of group.rows) {
      const row = group.view.rows.find(item => group.view.getPkKey(item) === expected.id)
      if (expected.action === 'deleted') {
        if (row) throw mismatch(`已删除记录 ${String(expected.id)} 仍存在`)
        continue
      }
      if (!row) throw mismatch(`记录 ${String(expected.id)} 未回读`)
      const kinds = group.view === this.binding ? BINDING_FIELD_KINDS : MAPPING_FIELD_KINDS
      for (const [field, value] of Object.entries(expected.values)) {
        assertReadable(group.view, row, [field])
        const kind = kinds[field]
        if (!kind || normalized(kind, row[field]) !== value) throw mismatch(`记录 ${String(expected.id)} 的 ${field}`)
      }
    }
    const header = this.binding.rows.find(row => this.binding.getPkKey(row) === bindingId)
    if (!header) throw mismatch(`来源绑定 ${String(bindingId)} 未回读`)
    const actual = this.mappingIds()
    if (actual.length !== expectedMappings.length || actual.some(id => !expectedMappings.includes(id))) throw mismatch('字段映射集合')
    this.#persistedVersion = positiveInteger(header['binding_version'], '绑定版本')
    this.#mappingIds = new Set(actual)
  }

  #mountOptions(prefix: string, columns: readonly string[], rows: () => readonly DataRow[]): DataView {
    const {dataSet, target} = this.#input
    const tableName = `${prefix}${crypto.randomUUID().replaceAll('-', '')}`
    if (dataSet.getTable(tableName)) throw new Error('维度来源候选临时表名称冲突')
    ensureDataSetStaticInputTable(dataSet, tableName, columns.map((name, index) => index === 0 ? {name, primary: true} : {name}))
    this.#tables.push(tableName)
    const table = dataSet.getTable(tableName)
    const view = dataSet.getView(tableName, 'default')
    if (!table || !view) throw new Error('维度来源候选 DataView 未装配')
    const resourceId = `blueprint-dimension-source:${target.applicationId}:${crypto.randomUUID()}`
    table.resourceId = resourceId
    view.bindQueryExecutor({
      localAggregates: false,
      executeQuery: async query => {
        target.assertCurrent()
        return dataSetCommandQueryResultFromLocalRows(query, rows().map(row => ({...row})), target.assertCurrent)
      },
    }, {resource: {resourceType: 'static-data', resourceId}})
    return view
  }

  #releaseTables(): void {
    const {dataSet} = this.#input
    for (const tableName of this.#tables.splice(0)) {
      if (!dataSet.destroyed && dataSet.getTable(tableName)) dataSet.removeTable(tableName)
    }
  }
}
