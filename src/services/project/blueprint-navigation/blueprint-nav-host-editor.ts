/**
 * @module app:services/project/blueprint-navigation/blueprint-nav-host-editor
 * 职责：蓝图节点的导航宿主关系（Base_Navigation_DataRelation，prowid=节点 id）新增、编辑、删除，均经同一 DataSet 单独提交并回读核验；
 *   数据空间→资源→字段候选由 7AB pagedata 声明的正式视图按输入参数查询。
 * 边界：只操作蓝图 PageRuntime 中 7AB 场景的视图；字段名按正式列大小写解析，缺失必需列即拒绝；删除前核对目标行在当前节点下唯一；
 *   结果未知时再次保存只核验原提交，不以新身份重提；paramType 按参考保存为 {type,name} JSON；不配置权限（属批次5）。
 * AI用途：导航配置页签的宿主关系维护在此收口，替代旧的只增命令；页面只消费本类的状态与动作。
 */
import {buildDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DimensionSourceChangeSubmission, DimensionSourceOptionTables, text, type FieldKind, type Id} from '@/lowcode/resources/structured-config/dimension-source/view-support'

export const BLUEPRINT_NAV_HOST_TABLE = 'Base_Navigation_DataRelation'
export const BLUEPRINT_NAV_HOST_VIEW = 'byNode'
const OPTION_VIEWS = Object.freeze({
  dataSets: ['Base_DataSet', 'navHostDataSets'],
  resources: ['Base_DataModel', 'navHostResources'],
  fields: ['Base_DataModel_Field', 'navHostFields'],
} as const)
/** 宿主关系的逻辑字段（按正式列大小写解析）。 */
const HOST_FIELDS = Object.freeze(['prowid', 'pName', 'title', 'dataSetId', 'DataName', 'dataType', 'selectTextParam', 'TextParamName',
  'selectValParam', 'ValParamName', 'selectPid', 'paramType'] as const)
const REQUIRED_FIELDS = Object.freeze([
  ['title', '请输入标题'], ['dataSetId', '请选择数据空间'], ['DataName', '请选择资源'], ['selectTextParam', '请选择文本字段'],
  ['TextParamName', '请输入文本参数名称'], ['selectValParam', '请选择值字段'], ['ValParamName', '请输入值参数名称'],
] as const)
const PARAM_ROW_ID = 'param'

function resolveColumn(view: DataView, name: string): string | undefined {
  const exact = view.columns.find(column => column.name === name)
  if (exact) return exact.name
  const matches = view.columns.filter(column => column.name.toLowerCase() === name.toLowerCase())
  if (matches.length > 1) throw new Error(`${view.tableName} 存在大小写冲突的字段 ${name}`)
  return matches[0]?.name
}

/** 解析已保存的 paramType；非 {type,name} JSON 的旧值原样作为属性名称保留，不丢弃。 */
export function parseNavHostParamType(raw: unknown): Readonly<{type: string; name: string}> {
  const value = text(raw)
  if (!value) return {type: '', name: ''}
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const type: unknown = Reflect.get(parsed, 'type'), name: unknown = Reflect.get(parsed, 'name')
      return {type: text(type), name: text(name)}
    }
  } catch { /* 非 JSON 旧值按原文保留 */ }
  return {type: '', name: value}
}

/** 宿主关系编辑目标：应用、节点身份、导航宿主名称（节点导航标题）与代次校验。 */
export type BlueprintNavHostTarget = Readonly<{applicationId: string; nodeId: string; hostName: string; assertCurrent: () => void}>

/** 一个蓝图节点的导航宿主关系列表与单条编辑。 */
export class BlueprintNavHostEditor {
  readonly view: DataView
  readonly dataSets: DataView
  readonly resources: DataView
  readonly fieldOptions: DataView
  /** 处理方式与属性名称的暂存输入（单行 type/name）。 */
  readonly paramInput: DataView
  /** 逻辑字段 → 正式列名。 */
  readonly fields: Readonly<Record<string, string>>
  readonly #target: BlueprintNavHostTarget
  readonly #submission: DimensionSourceChangeSubmission
  readonly #inputs: DimensionSourceOptionTables
  #stopCascade: (() => void) | undefined
  #dataSetSeq = 0
  #resourceSeq = 0

  constructor(dataSet: DataSet, target: BlueprintNavHostTarget) {
    const view = dataSet.getView(BLUEPRINT_NAV_HOST_TABLE, BLUEPRINT_NAV_HOST_VIEW)
    if (!view || view.dataTable?.modelBinding?.modelName !== BLUEPRINT_NAV_HOST_TABLE) throw new Error('蓝图运行时缺少导航宿主关系 byNode 视图')
    if (!target.nodeId.trim() || !target.applicationId.trim()) throw new Error('导航宿主关系缺少应用或蓝图节点身份')
    const option = ([table, viewId]: readonly [string, string]) => {
      const found = dataSet.getView(table, viewId)
      if (!found) throw new Error(`蓝图运行时缺少导航宿主候选视图 ${table}.${viewId}`)
      return found
    }
    this.view = view
    this.dataSets = option(OPTION_VIEWS.dataSets)
    this.resources = option(OPTION_VIEWS.resources)
    this.fieldOptions = option(OPTION_VIEWS.fields)
    this.#target = target
    this.#submission = new DimensionSourceChangeSubmission(dataSet, '导航宿主', target.assertCurrent)
    const fields: Record<string, string> = {}
    for (const field of HOST_FIELDS) {
      const column = resolveColumn(view, field)
      if (column) fields[field] = column
    }
    const missing = ['prowid', 'paramType', ...REQUIRED_FIELDS.map(([field]) => field)].filter(field => !fields[field])
    if (missing.length) throw new Error(`导航宿主关系缺少正式字段：${missing.join('、')}`)
    this.fields = fields
    this.#inputs = new DimensionSourceOptionTables(dataSet, {applicationId: target.applicationId, nodeId: target.nodeId, dataSpaceId: '', assertCurrent: target.assertCurrent})
    this.paramInput = this.#inputs.input('NavHostParam', ['id', 'type', 'name'])
  }

  get nodeId(): string { return this.#target.nodeId }
  get hostName(): string { return this.#target.hostName }
  get unknown(): boolean { return this.#submission.unknown }
  /** 候选及输入视图的完整键。 */
  viewKey(view: DataView): string {
    const scenarioId = view.dataSet?.scenarioId
    if (!scenarioId) throw new Error('导航宿主视图缺少场景身份')
    return buildDataViewKey(view.tableName, view.viewId, scenarioId)
  }
  /** 存在本地待保存、待删除或结果未知的宿主修改。 */
  get pending(): boolean {
    return this.#submission.unknown || this.view.dirtyTracking.pendingDeleteIds.size > 0 || this.view.rows.some(row => {
      const id = this.view.getPkKey(row)
      return id !== undefined && (this.view.hasEditingChanges(id) || this.view.dirtyTracking.hasPendingChanges(id))
    })
  }

  /** 读取当前节点的全部宿主关系与数据空间候选；返回行必须都属于当前节点。 */
  async load(): Promise<void> {
    if (this.pending) throw new Error('导航宿主存在未处理修改，不能重新读取')
    this.view.queryContext = {nodeId: this.#target.nodeId}
    await this.view.refresh()
    this.#target.assertCurrent()
    if (this.view.loadingError) throw this.view.loadingError
    if (this.view.rows.length !== this.view.total) throw new Error('导航宿主关系读取不完整')
    if (this.view.rows.some(row => row[this.column('prowid')] !== this.#target.nodeId)) throw new Error('导航宿主关系返回了其他节点的记录')
  }

  /** 读取当前应用的数据空间候选。 */
  async loadDataSets(): Promise<void> {
    await this.#query(this.dataSets, {applicationId: this.#target.applicationId})
  }

  /** 按所选数据空间读取资源候选；空值清空候选。 */
  async loadResources(dataSetId: string): Promise<void> {
    if (dataSetId) await this.#query(this.resources, {dataSetId})
    else this.resources.clearAll()
    this.fieldOptions.clearAll()
  }

  /** 按资源来源名定位资源，返回其行（未定位时为 undefined），并读取字段候选。 */
  async loadFields(metaName: string): Promise<Readonly<DataRow> | undefined> {
    const matches = metaName ? this.resources.rows.filter(row => text(row['MetaName']) === metaName) : []
    if (matches.length > 1) throw new Error(`数据空间中资源来源名 ${metaName} 不唯一`)
    const [resource] = matches
    if (resource) await this.#query(this.fieldOptions, {modelId: text(resource['rowid'])})
    else this.fieldOptions.clearAll()
    return resource
  }

  /** 暂存一条新宿主关系并设为当前行；返回新行身份。 */
  async stageCreate(): Promise<Id> {
    this.#submission.assertSettled()
    if (this.pending) throw new Error('导航宿主存在未处理修改')
    if (this.view.addActionState() !== 'enabled') throw new Error('当前查询不允许新增导航宿主')
    const values: Record<string, unknown> = {[this.column('prowid')]: this.#target.nodeId}
    const hostColumn = this.fields['pName']
    if (hostColumn && this.#target.hostName && this.view.newRowFieldAccess(hostColumn).write === 'allowed') values[hostColumn] = this.#target.hostName
    const id = this.view.getPkKey(await this.view.addRow(values))
    if (id === undefined || !this.view.setCurrentRowById(id)) throw new Error('导航宿主新增行未进入当前 DataView')
    this.#resetParam({type: '', name: ''})
    return id
  }

  /** 选中一条已有宿主关系进入编辑。 */
  beginEdit(id: Id): void {
    this.#submission.assertSettled()
    if (this.pending) throw new Error('导航宿主存在未处理修改')
    const row = this.#uniqueRow(id)
    if (this.view.editActionState(row) !== 'enabled') throw new Error('当前查询不允许编辑该导航宿主')
    if (!this.view.setCurrentRowById(id)) throw new Error('导航宿主行未进入当前 DataView')
    this.#resetParam(parseNavHostParamType(row[this.column('paramType')]))
  }

  /** 读取编辑行（含覆盖）中逻辑字段的值。 */
  value(id: Id, field: string): string {
    const column = this.fields[field]
    return column ? text(this.view.getEditingRow(id)?.[column]) : ''
  }

  /** 写入编辑覆盖（值不变时跳过）。 */
  write(id: Id, field: string, value: unknown): void {
    const column = this.column(field)
    if (text(this.view.getEditingRow(id)?.[column]) !== text(value)) this.view.updateEditingValue(id, column, value)
  }

  /** 校验并提交新增或编辑，回读核验；结果未知时再次调用只核验原提交。 */
  async save(id: Id): Promise<void> {
    if (!this.#submission.unknown) {
      const row = this.view.getEditingRow(id)
      if (!row) throw new Error('没有待保存的导航宿主')
      if (row[this.column('prowid')] !== this.#target.nodeId) throw new Error('导航宿主不属于当前蓝图节点')
      for (const [field, message] of REQUIRED_FIELDS) if (!text(row[this.column(field)])) throw new Error(message)
      if (this.value(id, 'ValParamName') === this.value(id, 'TextParamName')) throw new Error('值参数名称与文本参数名称不能相同')
      const param = this.paramInput.getEditingRow(PARAM_ROW_ID)
      const next = {type: text(param?.['type']), name: text(param?.['name'])}
      const saved = parseNavHostParamType(row[this.column('paramType')])
      if (this.view.dirtyTracking.isPendingCreate(id) || saved.type !== next.type || saved.name !== next.name) this.write(id, 'paramType', JSON.stringify(next))
      const patch = this.view.getEditingPatch(id) ?? {}
      const current = this.view.getEditingRow(id) ?? row
      const kinds: Record<string, FieldKind> = {}
      for (const column of Object.values(this.fields)) if (text(current[column]) || Object.hasOwn(patch, column)) kinds[column] = 'text'
      if (!this.#submission.capture([{view: this.view, ids: [id], kinds}])) throw new Error('导航宿主没有修改')
    }
    await this.#submission.submit()
  }

  /** 放弃当前未提交的新增或编辑。 */
  discard(id: Id): void {
    if (this.#submission.unknown) throw new Error('导航宿主保存结果未知，不能放弃')
    if (this.view.hasEditingChanges(id) || this.view.dirtyTracking.hasPendingChanges(id)) this.view.discardPendingChanges([id])
  }

  /** 删除一条宿主关系并核验已不存在；目标须在当前节点下唯一。 */
  async remove(id: Id): Promise<void> {
    if (!this.#submission.unknown) {
      if (this.pending) throw new Error('导航宿主存在未处理修改')
      const row = this.#uniqueRow(id)
      if (this.view.deleteActionState(row) !== 'enabled') throw new Error('当前查询不允许删除该导航宿主')
      await this.view.removeRow(id)
      if (!this.#submission.capture([{view: this.view, ids: [id], kinds: {}}])) throw new Error('导航宿主删除未进入待提交')
    }
    await this.#submission.submit()
  }

  column(field: string): string {
    const column = this.fields[field]
    if (!column) throw new Error(`导航宿主关系缺少正式字段 ${field}`)
    return column
  }

  /** 打开编辑时装载三级候选，不改原值。 */
  async loadCandidates(id: Id): Promise<void> {
    await this.loadDataSets()
    await this.loadResources(this.value(id, 'dataSetId'))
    await this.loadFields(this.value(id, 'DataName'))
  }

  /**
   * 跟随编辑行的上游字段：数据空间变化清空资源、资源类型与字段映射并重查资源；资源变化清空字段映射、重查字段并填入资源类型。
   * 每级按代次丢弃迟到结果；失败经 onError 报告，不吞错。
   */
  followCascade(id: Id, onError: (cause: Error) => void): void {
    this.stopCascade()
    const dataSet = this.view.dataSet
    if (!dataSet) throw new Error('导航宿主视图缺少 DataSet')
    const mappings = ['selectTextParam', 'selectValParam', 'selectPid'].filter(field => this.fields[field])
    const report = (cause: unknown) => onError(cause instanceof Error ? cause : new Error(String(cause)))
    this.#stopCascade = dataSet.onAnyViewChange({editingFieldChanged: (tableName, viewId, event) => {
      if (tableName !== this.view.tableName || viewId !== this.view.viewId || event.rowId !== id) return
      if (event.field === this.column('dataSetId')) {
        const seq = ++this.#dataSetSeq
        try { for (const field of ['DataName', 'dataType', ...mappings]) this.write(id, field, '') } catch (cause) { report(cause); return }
        this.loadResources(text(event.nextValue)).catch(cause => { if (seq === this.#dataSetSeq) report(cause) })
      } else if (event.field === this.column('DataName')) {
        const seq = ++this.#resourceSeq
        try { for (const field of mappings) this.write(id, field, '') } catch (cause) { report(cause); return }
        this.loadFields(text(event.nextValue)).then(resource => {
          if (seq === this.#resourceSeq) this.write(id, 'dataType', text(resource?.['Type']))
        }, cause => { if (seq === this.#resourceSeq) report(cause) })
      }
    }})
  }

  stopCascade(): void {
    this.#stopCascade?.()
    this.#stopCascade = undefined
    this.#dataSetSeq++
    this.#resourceSeq++
  }

  /** 释放级联监听与暂存输入视图；未提交的宿主修改由调用方先处理。 */
  release(): void {
    this.stopCascade()
    this.#inputs.release()
  }

  async #query(view: DataView, context: Readonly<Record<string, string>>): Promise<void> {
    view.queryContext = {...context}
    await view.refresh()
    this.#target.assertCurrent()
    if (view.loadingError) throw view.loadingError
  }

  #resetParam(value: Readonly<{type: string; name: string}>): void {
    this.paramInput.discardEditingRows([PARAM_ROW_ID])
    this.paramInput.deleteRowById(PARAM_ROW_ID)
    this.paramInput.appendRow({id: PARAM_ROW_ID, ...value})
    this.paramInput.setCurrentRowById(PARAM_ROW_ID)
  }

  #uniqueRow(id: Id): DataRow {
    const rows = this.view.rows.filter(row => this.view.getPkKey(row) === id)
    const [row] = rows
    if (rows.length !== 1 || !row) throw new Error('导航宿主记录不存在或不唯一')
    if (row[this.column('prowid')] !== this.#target.nodeId) throw new Error('导航宿主不属于当前蓝图节点')
    return row
  }
}
