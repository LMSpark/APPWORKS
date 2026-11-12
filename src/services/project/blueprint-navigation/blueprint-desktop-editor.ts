/**
 * @module app:services/project/blueprint-navigation/blueprint-desktop-editor
 * 职责：蓝图节点的桌面显示记录（Base_Desktop_System，rowid=节点 id）：运行时按注册名解析正式模型与三类桌面字典，
 *   装配独立 DataSet；读取 0/1 条记录，新增后逐字段回读，取消显示后核验记录已不存在。
 * 边界：模型身份经数据空间设计 API 按名解析，解析不到即拒绝写入；提交统一经 DataSet.saveChanges 与回读核验，
 *   结果未知时只核验原提交，不重放；不在前端判断权限，字段可写性取当前查询结果。
 * AI用途：调整桌面显示字段或校验时在此修改；页面只消费 BlueprintDesktopRecord 的状态与动作。
 */
import type {DataRow, DataSet, DataView} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {columnValue, DimensionSourceChangeSubmission, type FieldKind} from '@/lowcode/resources/structured-config/dimension-source/view-support'
import desktopViewsSource from '../../../../config/pages/application/project-blueprint/desktop-views.json?raw'

const DESKTOP_TABLE = 'Base_Desktop_System'
const DESKTOP_VIEW = 'byNode'
/** 桌面字段 → 字典模型注册名。 */
const DESKTOP_DICTIONARIES = Object.freeze({AppPopupMode: 'Dict_Page_Popup', AppType: 'Dict_Desktop_AppType', IconStyle: 'DesktopStyle'})
const DESKTOP_FIELD_KINDS: Readonly<Record<string, FieldKind>> = Object.freeze({
  AppName: 'text', ShortCNName: 'text', AppOrdidx: 'integer', AppUrl: 'text', MobileUrl: 'text', AppPopupMode: 'text', AppType: 'text',
  IsDesktopShow: 'bit', IsReqLogin: 'bit', AppSmallIconUrl: 'text', BgColor: 'text', FontColor: 'text', IconStyle: 'text',
})
const REQUIRED_FIELDS = Object.freeze([['AppName', '请输入名称'], ['AppOrdidx', '请输入排序'], ['AppUrl', '请输入PC端地址']] as const)

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
/** 字典候选视图：值/文案字段按正式列解析。 */
export type BlueprintDesktopOption = Readonly<{tableName: string; valueField: string; labelField: string}>
/** 桌面 DataSet 的字段与字典布局：逻辑字段名 → 正式列名（大小写按正式列解析）。 */
export type BlueprintDesktopLayout = Readonly<{
  fields: Readonly<Record<string, string>>
  options: Readonly<Record<string, BlueprintDesktopOption>>
  warnings: readonly string[]
}>

type DesktopDocument = Readonly<{scenarioId: string; tables: Readonly<Record<string, Record<string, unknown>>>}>

function desktopDocument(source: string): DesktopDocument {
  const parsed: unknown = JSON.parse(source)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('桌面视图配置不是对象')
  const scenarioId: unknown = Reflect.get(parsed, 'scenarioId')
  const tables: unknown = Reflect.get(parsed, 'tables')
  if (typeof scenarioId !== 'string' || !scenarioId || typeof tables !== 'object' || tables === null) throw new Error('桌面视图配置缺少场景或表')
  const entries = Object.keys(tables).map((name): [string, Record<string, unknown>] => {
    const value: unknown = Reflect.get(tables, name)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`桌面视图配置 ${name} 不是对象`)
    const table: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      const item: unknown = Reflect.get(value, key)
      table[key] = item
    }
    return [name, table]
  })
  return {scenarioId, tables: Object.fromEntries(entries)}
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function resolveColumn(view: DataView, name: string): string | undefined {
  const exact = view.columns.find(column => column.name === name)
  if (exact) return exact.name
  const matches = view.columns.filter(column => column.name.toLowerCase() === name.toLowerCase())
  if (matches.length > 1) throw new Error(`${view.tableName} 存在大小写冲突的字段 ${name}`)
  return matches[0]?.name
}

function blank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === ''
}

/** 按注册名运行时解析桌面模型并装配独立 DataSet；DataSet 生命周期归调用方。 */
export class BlueprintDesktopEditor {
  readonly #design: Pick<DataSpaceDesignApi, 'readModel' | 'readSpaceDefinition'>
  readonly #assembler: LowcodeDataSpaceAssembler
  readonly #document: DesktopDocument

  constructor(design: Pick<DataSpaceDesignApi, 'readModel' | 'readSpaceDefinition'>, assembler: LowcodeDataSpaceAssembler, source = desktopViewsSource) {
    this.#design = design
    this.#assembler = assembler
    this.#document = desktopDocument(source)
  }

  /** 桌面 DataSet 的场景身份（取自桌面视图配置）。 */
  get scenarioId(): string { return this.#document.scenarioId }

  /** 解析桌面模型（必需）与字典模型（缺失时降级为文本字段并给出提示）并装配 DataSet。 */
  async assemble(assertCurrent: () => void): Promise<Readonly<{dataSet: DataSet; warnings: readonly string[]}>> {
    const document = this.#document
    const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: document.scenarioId, assertCurrent}
    const names = Object.keys(document.tables)
    if (!names.includes(DESKTOP_TABLE)) throw new Error('桌面视图配置缺少 Base_Desktop_System')
    const [space, ...resolved] = await Promise.all([
      this.#design.readSpaceDefinition(input),
      ...names.map(async metaName => {
        try { return {metaName, model: await this.#design.readModel({...input, metaName})} }
        catch (cause) { return {metaName, error: describe(cause)} }
      }),
    ])
    assertCurrent()
    const models: FormalModel[] = [], tables: Record<string, unknown> = {}, warnings: string[] = []
    for (const item of resolved) {
      if ('error' in item) {
        if (item.metaName === DESKTOP_TABLE) throw new Error(`桌面显示模型 ${DESKTOP_TABLE} 未能按注册名解析：${item.error}`)
        warnings.push(`桌面字典 ${item.metaName} 未能解析，对应字段改为直接录入：${item.error}`)
        continue
      }
      models.push(item.model)
      tables[item.metaName] = {...document.tables[item.metaName], modelBinding: {modelId: item.model.id, modelName: item.metaName}}
    }
    const config = new ScenarioViewConfig(document.scenarioId, JSON.stringify({scenarioId: document.scenarioId, tables}))
    return {dataSet: this.#assembler.assemble({config, space, models, relations: []}).dataSet, warnings}
  }
}

/** 一个节点的桌面显示记录：0/1 条，新增与取消显示各自单独提交并回读。 */
export class BlueprintDesktopRecord {
  readonly view: DataView
  readonly layout: BlueprintDesktopLayout
  readonly #dataSet: DataSet
  readonly #nodeId: string
  readonly #assertCurrent: () => void
  readonly #submission: DimensionSourceChangeSubmission

  /** 绑定已装配 DataSet 中的桌面视图；warnings 为装配阶段的字典降级提示。 */
  constructor(dataSet: DataSet, target: Readonly<{nodeId: string; assertCurrent: () => void; warnings: readonly string[]}>) {
    const view = dataSet.getView(DESKTOP_TABLE, DESKTOP_VIEW)
    if (!view || view.dataTable?.modelBinding?.modelName !== DESKTOP_TABLE) throw new Error('桌面 DataSet 缺少 Base_Desktop_System 视图')
    if (!target.nodeId.trim()) throw new Error('桌面显示缺少蓝图节点身份')
    this.view = view
    this.#dataSet = dataSet
    this.#nodeId = target.nodeId
    this.#assertCurrent = target.assertCurrent
    this.#submission = new DimensionSourceChangeSubmission(dataSet, '桌面显示', target.assertCurrent)
    if (resolveColumn(view, 'rowid') !== 'rowid') throw new Error('Base_Desktop_System 缺少正式 rowid 字段')
    const fields: Record<string, string> = {}
    for (const field of Object.keys(DESKTOP_FIELD_KINDS)) {
      const column = resolveColumn(view, field)
      if (column) fields[field] = column
    }
    const missing = REQUIRED_FIELDS.filter(([field]) => !fields[field]).map(([field]) => field)
    if (missing.length) throw new Error(`Base_Desktop_System 缺少正式字段：${missing.join('、')}`)
    const options: Record<string, BlueprintDesktopOption> = {}
    const warnings = [...target.warnings]
    for (const [field, tableName] of Object.entries(DESKTOP_DICTIONARIES)) {
      const optionView = dataSet.getView(tableName, 'default')
      if (!optionView || !fields[field]) continue
      const valueField = resolveColumn(optionView, 'val'), labelField = resolveColumn(optionView, 'txt')
      if (valueField && labelField) options[field] = {tableName, valueField, labelField}
      else warnings.push(`桌面字典 ${tableName} 缺少 val/txt 字段，对应字段改为直接录入`)
    }
    this.layout = {fields, options, warnings}
  }

  get nodeId(): string { return this.#nodeId }
  /** 逻辑标志字段的真/假值，按正式列类型给出布尔、数字或数字文本。 */
  flag(field: string, on: boolean): boolean | number | string {
    const column = this.layout.fields[field]
    const type = this.view.columns.find(item => item.name === column)?.type.toLowerCase() ?? ''
    if (type === 'boolean' || type === 'bool') return on
    return ['string', 'varchar', 'text', 'char'].includes(type) ? (on ? '1' : '0') : (on ? 1 : 0)
  }
  /** 当前节点已存在且已回读的桌面记录。 */
  get record(): DataRow | undefined {
    return this.view.rows.find(row => row['rowid'] === this.#nodeId && !this.view.dirtyTracking.isPendingCreate(this.#nodeId))
  }
  /** 存在本地待保存或结果未知的桌面修改。 */
  get pending(): boolean {
    return this.#submission.unknown || this.view.rows.some(row => {
      const id = this.view.getPkKey(row)
      return id !== undefined && (this.view.hasEditingChanges(id) || this.view.dirtyTracking.hasPendingChanges(id))
    }) || this.view.dirtyTracking.pendingDeleteIds.size > 0
  }
  get unknown(): boolean { return this.#submission.unknown }

  /** 读取当前节点的桌面记录（0 或 1 条）及字典候选。 */
  async load(): Promise<void> {
    this.view.queryContext = {nodeId: this.#nodeId}
    await this.view.refresh()
    this.#assertCurrent()
    if (this.view.loadingError) throw this.view.loadingError
    if (this.view.rows.length !== this.view.total || this.view.rows.length > 1) throw new Error('当前节点存在多条或不完整的桌面记录')
    for (const option of Object.values(this.layout.options)) {
      const optionView = this.#dataSet.getView(option.tableName, 'default')
      if (!optionView) continue
      optionView.queryConfig = {...optionView.queryConfig, allPages: true}
      await optionView.refresh()
      this.#assertCurrent()
      if (optionView.loadingError) throw optionView.loadingError
    }
  }

  /** 以节点身份暂存一条新桌面记录；defaults 为逻辑字段的初值（导航地址原样作为 PC 端地址）。 */
  async stageCreate(defaults: Readonly<Record<string, unknown>>): Promise<void> {
    this.#submission.assertSettled()
    if (this.record) throw new Error('当前节点已显示到桌面')
    if (this.pending) throw new Error('桌面显示存在未处理修改')
    if (this.view.addActionState() !== 'enabled') throw new Error('当前查询不允许新增桌面记录')
    const values: Record<string, unknown> = {}
    for (const [field, value] of Object.entries(defaults)) {
      const column = this.layout.fields[field]
      if (!column || blank(value) || this.view.newRowFieldAccess(column).write !== 'allowed') continue
      values[column] = DESKTOP_FIELD_KINDS[field] === 'integer' && typeof value === 'number' ? columnValue(this.view, column, value) : value
    }
    await this.view.addRowWithIdentity({field: 'rowid', value: this.#nodeId}, values)
    if (!this.view.setCurrentRowById(this.#nodeId)) throw new Error('桌面新增行未进入当前 DataView')
  }

  /** 校验必填并提交新增，回读逐字段核验；结果未知时再次调用只核验原提交。 */
  async saveCreate(): Promise<void> {
    if (!this.#submission.unknown) {
      const row = this.view.getEditingRow(this.#nodeId)
      if (!row || !this.view.dirtyTracking.isPendingCreate(this.#nodeId)) throw new Error('没有待保存的桌面记录')
      for (const [field, message] of REQUIRED_FIELDS) if (blank(row[this.layout.fields[field] ?? field])) throw new Error(message)
      this.#capture()
    }
    await this.#submission.submit()
    if (!this.record) throw new Error('桌面显示已提交，但未回读到桌面记录')
  }

  /** 取消新增：放弃尚未提交的桌面新增行。 */
  discardCreate(): void {
    if (this.#submission.unknown) throw new Error('桌面显示保存结果未知，不能放弃')
    if (this.view.dirtyTracking.isPendingCreate(this.#nodeId) || this.view.hasEditingChanges(this.#nodeId)) this.view.discardPendingChanges([this.#nodeId])
  }

  /** 取消桌面显示：删除当前节点的桌面记录并核验已不存在；结果未知时再次调用只核验原提交。 */
  async remove(): Promise<void> {
    if (!this.#submission.unknown) {
      const row = this.record
      if (!row) throw new Error('当前节点没有桌面记录')
      if (this.pending) throw new Error('桌面显示存在未处理修改')
      if (this.view.deleteActionState(row) !== 'enabled') throw new Error('当前查询不允许删除桌面记录')
      await this.view.removeRow(this.#nodeId)
      this.#capture()
    }
    await this.#submission.submit()
    if (this.view.rows.some(row => row['rowid'] === this.#nodeId)) throw new Error('取消桌面显示后仍读回桌面记录')
  }

  /** 只回读本次实际填写的字段；未填写字段可能由服务端赋默认值，不作为核验依据。 */
  #capture(): void {
    const row = this.view.getEditingRow(this.#nodeId)
    const kinds = Object.fromEntries(Object.entries(this.layout.fields)
      .filter(([, column]) => !!row && !blank(row[column]))
      .map(([field, column]) => [column, DESKTOP_FIELD_KINDS[field] ?? 'text']))
    if (!this.#submission.capture([{view: this.view, ids: [this.#nodeId], kinds}])) throw new Error('没有待提交的桌面修改')
  }
}
