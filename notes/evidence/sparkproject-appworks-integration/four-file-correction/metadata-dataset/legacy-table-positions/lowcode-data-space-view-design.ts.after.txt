import { DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import { RequestState, type DataSet } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'
import { ScenarioViewFile, type ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type { PageRuntimeServicesCapability } from '@spark-appworks/spark-component'
import type { LowcodeDataSpaceAssembly } from '../lowcode-data-space-assembler'
import { LowcodeDataSpaceViewLayout } from './lowcode-data-space-view-layout'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type PageDataSpaceViewDesignReader = NonNullable<ReturnType<NonNullable<PageRuntimeServicesCapability['dataSpaceDesign']>['createReader']>['viewDesign']>
type PageDataSpaceViewModelInput = Parameters<PageDataSpaceViewDesignReader['readModel']>[0]
type PageDataSpaceViewSelection = Parameters<PageDataSpaceViewDesignReader['preview']>[0]
type PageDataSpaceViewStage = Parameters<PageDataSpaceViewDesignReader['stage']>[0]
type PageDataSpaceViewState = Awaited<ReturnType<PageDataSpaceViewDesignReader['save']>>
type PageDataSpaceViewAdopt = Parameters<PageDataSpaceViewDesignReader['adopt']>[0]
type ViewDesignOptions = Readonly<{
  workspace: ProjectWorkspace
  readModel(input: PageDataSpaceViewModelInput): Promise<FormalModel>
  assemble(scenarioId: string, file: ScenarioViewFile): Promise<LowcodeDataSpaceAssembly>
  loadMetadata?(targetId: string): Promise<DataSet>
  readLegacyLayout?(targetId: string): Promise<string | null>
  assertScope(): void
}>

type SessionSelection = Omit<PageDataSpaceViewSelection, 'scenarioId'>
type SessionStage = Omit<PageDataSpaceViewStage, 'scenarioId'>
type SessionAdopt = Omit<PageDataSpaceViewAdopt, 'scenarioId'>
type SessionDefinitionStage = Readonly<{expectedText: string; text: string}>
type SessionLayoutStage = Readonly<{expectedText: string; expectedLayoutText: string}>

function projectionConfig(dataSet: DataSet): string {
  const config = dataSet.toJson()
  for (const table of Object.values(config.tables)) {
    for (const view of Object.values(table.views)) delete view.rows
  }
  return JSON.stringify(config)
}

/** The file owns editable definitions; assembled DataSets are disposable projections of its revision. */
export class LowcodeDataSpaceDesignSession {
  readonly targetId: string
  readonly metadataDataSet: DataSet
  #file: ScenarioViewFile | null = null
  #definition: DataSet | null = null
  #definitionError: Error | null = null
  #projectionConfig: string | null = null
  #unsubscribe: (() => void) | null = null
  #generation = 0
  #disposed = false

  constructor(targetId: string, metadataDataSet: DataSet,
    private readonly design: LowcodeDataSpaceViewDesign,
    private readonly options: ViewDesignOptions) {
    this.targetId = targetId
    this.metadataDataSet = metadataDataSet
  }

  private assertLive(): void {
    if (this.#disposed) throw new Error('DATA_SPACE_DESIGN_SESSION_DISPOSED: 会话已释放')
    try { this.options.assertScope() } catch (error) { this.dispose(); throw error }
  }

  private assertOwner(): void {
    this.assertLive()
    if (this.options.workspace.getScenarioViews(this.targetId) !== this.#file) {
      this.attach(null)
      throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 视图文件 owner 已变化，请刷新')
    }
  }

  private invalidate(): void {
    this.#generation++
    this.#definition?.destroy()
    this.#definition = null
    this.#definitionError = null
    this.#projectionConfig = null
  }

  private assertProjectionClean(): void {
    if (this.#definitionError) throw this.#definitionError
    if (!this.#definition || this.#projectionConfig === null) {
      throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 定义投影已失效，请刷新')
    }
    if (projectionConfig(this.#definition) !== this.#projectionConfig) {
      throw new Error('DATA_SPACE_DESIGN_PROJECTION_EDIT: 原生投影被直接修改，请刷新后通过会话编辑')
    }
  }

  private assertDefinitionEditable(): void {
    if (!this.#definitionError) this.assertProjectionClean()
  }

  private attach(file: ScenarioViewFile | null): void {
    if (file === this.#file) return
    this.#unsubscribe?.()
    this.#unsubscribe = null
    this.invalidate()
    this.#file = file
    if (file) this.#unsubscribe = file.subscribe(() => this.invalidate())
  }

  get viewState(): PageDataSpaceViewState | null {
    this.assertOwner()
    return this.#file ? state(this.#file) : null
  }

  get definitionDataSet(): DataSet | null {
    this.assertOwner()
    if (this.#definitionError) throw this.#definitionError
    if (this.#file && !this.#definition) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 定义投影已失效，请刷新')
    return this.#definition
  }

  /** Assembly failure leaves metadata and the file editable; it never represents a valid empty definition. */
  get definitionError(): Error | null {
    this.assertOwner()
    return this.#definitionError
  }

  private requireViewState(): PageDataSpaceViewState {
    const current = this.viewState
    if (!current) throw new Error('SCENARIO_VIEW_FILE_MISSING: 视图文件不存在')
    return current
  }

  async refresh(): Promise<void> {
    this.assertLive()
    this.invalidate()
    const generation = this.#generation
    let file: ScenarioViewFile | null
    try {
      file = await this.options.workspace.loadScenarioViews({scenarioId: this.targetId})
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('SCENARIO_VIEW_FILE_MISSING:')) throw error
      this.assertLive()
      if (generation !== this.#generation) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 刷新已过期')
      this.attach(null)
      return
    }
    this.assertLive()
    if (generation !== this.#generation) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 刷新已过期')
    this.attach(file)
    const ownGeneration = this.#generation
    const revision = file.revision
    const text = file.getText()
    const assertAssemblyCurrent = (): void => {
      this.assertOwner()
      if (ownGeneration !== this.#generation || file.revision !== revision || file.getText() !== text) {
        throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 装配期间视图配置已改变')
      }
    }
    let candidate: LowcodeDataSpaceAssembly
    try {
      candidate = await this.options.assemble(this.targetId, file)
    } catch (error) {
      assertAssemblyCurrent()
      this.#definitionError = error instanceof Error ? error : new Error(String(error))
      throw this.#definitionError
    }
    try {
      assertAssemblyCurrent()
      const config = projectionConfig(candidate.dataSet)
      this.#definition = candidate.dataSet
      this.#projectionConfig = config
    } catch (error) {
      candidate.dataSet.destroy()
      throw error
    }
  }

  async createView(input: SessionSelection): Promise<PageDataSpaceViewState> {
    this.assertOwner()
    if (this.#file) throw new Error('DATA_SPACE_DESIGN_SESSION_EXISTS: 视图文件已存在，请分阶段修改')
    const generation = this.#generation
    const created = await this.design.create({...input, scenarioId: this.targetId}, () => {
      this.assertOwner()
      if (generation !== this.#generation) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 新建已过期')
    })
    this.assertLive()
    this.attach(created.dirtySource)
    await this.refresh()
    return this.requireViewState()
  }

  async stageView(input: SessionStage): Promise<PageDataSpaceViewState> {
    this.assertOwner()
    if (!this.#file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先显式创建视图配置')
    this.assertDefinitionEditable()
    const generation = this.#generation
    await this.design.stage({...input, scenarioId: this.targetId}, () => {
      this.assertOwner()
      if (generation !== this.#generation) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 编辑已过期')
    })
    this.assertLive()
    await this.refresh()
    return this.requireViewState()
  }

  async stageLegacyTablePositions(input: SessionLayoutStage): Promise<PageDataSpaceViewState> {
    this.assertOwner()
    const {expectedText, expectedLayoutText} = input
    const file = this.#file
    if (!file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先创建视图配置')
    if (file.getText() !== expectedText) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 配置已改变')
    if (file.saveStatus !== 'idle') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 须先核验上次保存')
    this.assertProjectionClean()
    const generation = this.#generation
    if (!this.options.readLegacyLayout) throw new Error('DATA_SPACE_LAYOUT_UNAVAILABLE: 缺少旧布局读取能力')
    let source: string | null
    try { source = await this.options.readLegacyLayout(this.targetId) } catch (error) {
      this.assertOwner()
      throw error
    }
    this.assertOwner()
    if (generation !== this.#generation) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 布局读取期间定义已变化')
    if (source === null) throw new Error('DATA_SPACE_LAYOUT_MISSING: 旧布局文件不存在')
    if (source !== expectedLayoutText) throw new Error('DATA_SPACE_LAYOUT_STALE: 旧布局与预览原文不同')
    this.assertProjectionClean()
    const dataSet = this.#definition
    if (!dataSet) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 定义投影已失效')
    const text = LowcodeDataSpaceViewLayout.merge(source, file, dataSet)
    if (text === expectedText) return this.requireViewState()
    return this.stageDefinition({expectedText, text})
  }

  async stageDefinition(input: SessionDefinitionStage): Promise<PageDataSpaceViewState> {
    this.assertOwner()
    const {expectedText, text} = input
    const file = this.#file
    if (!file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先显式创建视图配置')
    this.assertDefinitionEditable()
    if (file.getText() !== expectedText) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 配置已被其他编辑改变')
    if (file.saveStatus !== 'idle') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 须先核验上次保存')
    const revision = file.revision
    const generation = this.#generation
    const candidateFile = new ScenarioViewFile(this.targetId, text)
    const candidate = await this.options.assemble(this.targetId, candidateFile)
    try {
      this.assertOwner()
      if (this.#generation !== generation || file.revision !== revision || file.getText() !== expectedText) {
        throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 验证期间配置已改变')
      }
      this.assertDefinitionEditable()
      file.setText(text)
    } finally { candidate.dataSet.destroy() }
    await this.refresh()
    return this.requireViewState()
  }

  async saveViews(): Promise<PageDataSpaceViewState> {
    this.assertOwner()
    if (!this.#file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先显式创建视图配置')
    if (this.#file.saveStatus !== 'idle') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 须先核验上次保存')
    this.assertProjectionClean()
    const generation = this.#generation
    await this.design.save(this.targetId, () => {
      this.assertOwner()
      if (generation !== this.#generation) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 保存已过期')
    })
    this.assertLive()
    await this.refresh()
    return this.requireViewState()
  }

  async verifyViews(): Promise<Readonly<{outcome: 'confirmed' | 'not-applied'; state: PageDataSpaceViewState}>> {
    this.assertOwner()
    if (!this.#file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先显式创建视图配置')
    const result = await this.design.verify(this.targetId)
    this.assertOwner()
    await this.refresh()
    return {outcome: result.outcome, state: this.requireViewState()}
  }

  async previewRemoteViews(): Promise<string | null> {
    this.assertOwner()
    const result = await this.design.previewRemote(this.targetId)
    this.assertOwner()
    return result
  }

  async adoptViews(input: SessionAdopt): Promise<PageDataSpaceViewState | null> {
    this.assertOwner()
    if (!this.#file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先显式创建视图配置')
    await this.design.adopt({...input, scenarioId: this.targetId})
    this.assertLive()
    await this.refresh()
    return this.viewState
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.invalidate()
    this.#unsubscribe?.()
    this.#unsubscribe = null
    this.#file = null
    this.metadataDataSet.destroy()
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} 配置无效`)
  return value
}

function viewName(value: string, label: string): string {
  const name = value.trim()
  if (!name || name.includes('@') || name.startsWith('#')) throw new Error(`${label} 身份非法`)
  return name
}

function state(file: ScenarioViewFile): PageDataSpaceViewState {
  return { scenarioId: file.scenarioId, text: file.getText(), config: file.value.toJSON(),
    persisted: file.isPersisted, dirty: file.isDirty, revision: file.revision,
    saveStatus: file.saveStatus, submittedText: file.submittedText }
}

export class LowcodeDataSpaceViewDesign implements PageDataSpaceViewDesignReader {
  constructor(private readonly options: ViewDesignOptions) {}

  async openDesignSession(targetId: string): Promise<LowcodeDataSpaceDesignSession> {
    if (typeof targetId !== 'string' || targetId.trim() !== targetId || !targetId
      || targetId === '.' || targetId === '..' || /[\\/%\u0000-\u001f\u007f]/.test(targetId)) {
      throw new Error('DATA_SPACE_DESIGN_TARGET: 数据空间 ID 无效')
    }
    const id = viewName(targetId, '空间')
    if (!this.options.loadMetadata) throw new Error('DATA_SPACE_DESIGN_METADATA_UNAVAILABLE: 缺少正式元数据入口')
    this.options.assertScope()
    const metadata = await this.options.loadMetadata(id)
    const session = new LowcodeDataSpaceDesignSession(id, metadata, this, this.options)
    try {
      try { await session.refresh() } catch (error) {
        if (session.metadataDataSet.destroyed || session.definitionError !== error) throw error
      }
      return session
    } catch (error) {
      session.dispose()
      throw error
    }
  }

  private currentFile(scenarioId: string): ScenarioViewFile {
    this.options.assertScope()
    const file = this.options.workspace.getScenarioViews(viewName(scenarioId, '空间'))
    if (!file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先加载或显式创建视图配置')
    return file
  }

  async open(scenarioId: string) {
    this.options.assertScope()
    const file = await this.options.workspace.loadScenarioViews({ scenarioId: viewName(scenarioId, '空间') })
    this.options.assertScope()
    return { state: state(file), dirtySource: file }
  }

  async readModel(input: PageDataSpaceViewModelInput) {
    this.options.assertScope()
    const model = await this.options.readModel(input)
    this.options.assertScope()
    if (model.id !== input.modelId || model.metaName !== input.modelName) throw new Error('SCENARIO_VIEW_MODEL_IDENTITY: 正式模型身份已变化')
    return { id: model.id, name: model.metaName, fields: DataSpaceDesignApi.resolveOutputFields(model)
      .map(field => ({ name: field.canonicalName, label: field.description || field.canonicalName })) }
  }

  async create(input: PageDataSpaceViewSelection, assertCurrent?: () => void) {
    const scenarioId = viewName(input.scenarioId, '空间')
    const tableName = viewName(input.tableName, '表')
    const viewId = viewName(input.viewId, '视图')
    await this.readModel(input)
    assertCurrent?.()
    const views: Record<string, Record<string, unknown>> = { default: {} }
    if (viewId !== 'default') views[viewId] = {}
    const text = JSON.stringify({ scenarioId, tables: { [tableName]: {
      modelBinding: { modelId: input.modelId, modelName: input.modelName }, views,
    } }, viewCascades: [] })
    this.options.assertScope()
    const file = await this.options.workspace.createScenarioViews({ scenarioId, text,
      ...(assertCurrent ? {assertCurrent} : {}) })
    this.options.assertScope()
    return { state: state(file), dirtySource: file }
  }

  async stage(input: PageDataSpaceViewStage, assertCurrent?: () => void): Promise<PageDataSpaceViewState> {
    const file = this.currentFile(input.scenarioId)
    const before = file.getText()
    if (before !== input.expectedText) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 配置已被其他编辑改变')
    const tableName = viewName(input.tableName, '表')
    const viewId = viewName(input.viewId, '视图')
    const model = await this.readModel(input)
    assertCurrent?.()
    this.options.assertScope()
    if (this.currentFile(input.scenarioId) !== file || file.getText() !== before) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 字段读取期间配置已改变')
    const config = structuredClone(file.value.toJSON())
    const tables = record(config['tables'], 'tables')
    const old = tables[tableName] === undefined ? undefined : record(tables[tableName], 'table')
    const binding = old ? record(old['modelBinding'], 'modelBinding') : undefined
    if (binding && (binding['modelId'] !== model.id || binding['modelName'] !== model.name)) {
      throw new Error('SCENARIO_VIEW_MODEL_BINDING: 已存在表不能改绑正式模型')
    }
    const formalNames = new Set(model.fields.map(field => field.name))
    if (formalNames.size !== model.fields.length) throw new Error('SCENARIO_VIEW_FIELD: 正式输出字段名重复')
    const retainedColumns = old?.['columns']
    const localNames = new Set<string>()
    if (retainedColumns !== undefined) {
      if (!Array.isArray(retainedColumns)) throw new Error('SCENARIO_VIEW_FIELD: columns 配置无效')
      for (const retained of retainedColumns) {
        const column = record(retained, 'columns')
        if (typeof column['name'] !== 'string') throw new Error('SCENARIO_VIEW_FIELD: columns.name 无效')
        if (Object.hasOwn(column, 'computeExpression')) {
          if (formalNames.has(column['name'])) throw new Error(`SCENARIO_VIEW_FIELD: 本地计算列与正式输出字段重名: ${column['name']}`)
          localNames.add(column['name'])
        } else if (!formalNames.has(column['name'])) {
          throw new Error(`SCENARIO_VIEW_FIELD: columns.${String(column['name'])} 不是当前正式输出字段`)
        }
      }
    }
    const views = old ? record(old['views'], 'views') : { default: {} }
    const existing = views[viewId] === undefined ? {} : record(views[viewId], 'view')
    const configuration = record(input.configuration, 'configuration')
    const allowed = new Set(['fieldProjection', 'queryContext', 'filterExpression', 'sortExpression',
      'autoCurrentFirst', 'autoSelectFirst', 'page', 'pageSize', 'treeConfig', 'valueField',
      'labelField', 'selectionDelimiter', 'autoLoad', 'commitMode', 'aggregates'])
    for (const key of Object.keys(configuration)) {
      if (!allowed.has(key)) throw new Error(`SCENARIO_VIEW_CONFIGURATION: ${key} 不属于视图配置`)
    }
    const clear = new Set<string>(input.clear ?? [])
    for (const key of clear) {
      if (!allowed.has(key) || Object.hasOwn(configuration, key)) {
        throw new Error(`SCENARIO_VIEW_CLEAR: ${key} 不能清除`)
      }
    }
    const updated = Object.fromEntries(Object.entries({ ...existing, ...configuration })
      .filter(([key]) => !clear.has(key)))
    this.validateFieldReferences(updated, formalNames, localNames)
    views[viewId] = updated
    tables[tableName] = { ...old, modelBinding: { modelId: model.id, modelName: model.name }, views }
    const candidateFile = new ScenarioViewFile(input.scenarioId, JSON.stringify(config))
    const candidate = await this.options.assemble(input.scenarioId, candidateFile)
    candidate.dataSet.destroy()
    assertCurrent?.()
    if (this.currentFile(input.scenarioId) !== file || file.getText() !== before) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 装配期间配置已改变')
    file.setText(JSON.stringify(config))
    return state(file)
  }

  private validateFieldReferences(view: Record<string, unknown>, fields: ReadonlySet<string>, local: ReadonlySet<string>): void {
    const check = (name: unknown, path: string, allowLocal = false): void => {
      if (name === '' && (path === 'valueField' || path === 'labelField')) return
      if (typeof name !== 'string' || (!fields.has(name) && !(allowLocal && local.has(name)))) {
        throw new Error(`SCENARIO_VIEW_FIELD: ${path} 不是当前正式输出字段`)
      }
    }
    const valueField = view['valueField']
    if (typeof valueField === 'string') check(valueField, 'valueField', true)
    else if (Array.isArray(valueField)) valueField.forEach((name, index) => check(name, `valueField[${index}]`, true))
    if (view['labelField'] !== undefined) check(view['labelField'], 'labelField', true)
    const sort = view['sortExpression']
    if (Array.isArray(sort)) sort.forEach((item, index) => {
      if (isRecord(item)) check(item['field'], `sortExpression[${index}].field`)
    })
    const tree = view['treeConfig']
    if (isRecord(tree)) for (const key of ['idField', 'parentIdField', 'textField']) {
      if (tree[key] !== undefined) check(tree[key], `treeConfig.${key}`, key === 'textField')
    }
    const aggregates = view['aggregates']
    if (isRecord(aggregates)) for (const [name, value] of Object.entries(aggregates)) {
      if (isRecord(value)) check(value['field'] ?? name, `aggregates.${name}.field`, true)
    }
  }

  async save(scenarioId: string, assertCurrent?: () => void): Promise<PageDataSpaceViewState> {
    const file = this.currentFile(scenarioId)
    if (file.saveStatus !== 'idle') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 须先核验上次保存')
    const submitted = file.getText()
    if (!file.isDirty) return state(file)
    const assembled = await this.options.assemble(scenarioId, file)
    assembled.dataSet.destroy()
    this.options.assertScope()
    assertCurrent?.()
    if (this.currentFile(scenarioId) !== file || file.getText() !== submitted) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 保存前配置已改变')
    await this.options.workspace.saveScenarioViews({ scenarioId, ...(assertCurrent ? {assertCurrent} : {}) })
    this.options.assertScope()
    return state(file)
  }

  async verify(scenarioId: string) {
    const file = this.currentFile(scenarioId)
    const outcome = await this.options.workspace.verifyScenarioViews({ scenarioId })
    this.options.assertScope()
    return { outcome, state: state(file) }
  }

  async previewRemote(scenarioId: string): Promise<string | null> {
    this.options.assertScope()
    const text = await this.options.workspace.previewScenarioViewsRemote({ scenarioId })
    this.options.assertScope()
    return text
  }

  async adopt(input: PageDataSpaceViewAdopt): Promise<PageDataSpaceViewState | null> {
    this.options.assertScope()
    await this.options.workspace.adoptScenarioViews(input)
    this.options.assertScope()
    const file = this.options.workspace.getScenarioViews(input.scenarioId)
    return file ? state(file) : null
  }

  async preview(input: PageDataSpaceViewSelection) {
    const file = this.currentFile(input.scenarioId)
    const text = file.getText()
    const tableName = viewName(input.tableName, '表')
    const viewId = viewName(input.viewId, '视图')
    const tables = record(file.value.toJSON()['tables'], 'tables')
    const table = record(tables[tableName], 'table')
    const binding = record(table['modelBinding'], 'modelBinding')
    if (binding['modelId'] !== input.modelId || binding['modelName'] !== input.modelName) {
      throw new Error('SCENARIO_VIEW_MODEL_BINDING: 预览选择与正式模型绑定不一致')
    }
    if (!Object.hasOwn(record(table['views'], 'views'), viewId)) throw new Error('SCENARIO_VIEW_PREVIEW_VIEW: 视图不存在')
    const assembled = await this.options.assemble(input.scenarioId, file)
    try {
      this.options.assertScope()
      if (this.currentFile(input.scenarioId) !== file || file.getText() !== text) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 预览配置已改变')
      const view = assembled.dataSet.getView(tableName, viewId)
      if (!view) throw new Error('SCENARIO_VIEW_PREVIEW_VIEW: 视图不存在')
      await view.requestData()
      this.options.assertScope()
      if (this.currentFile(input.scenarioId) !== file || file.getText() !== text) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 预览期间配置已改变')
      if (view.requestState !== RequestState.Loaded) throw view.loadingError ?? new Error('SCENARIO_VIEW_PREVIEW_QUERY: 正式查询未完成')
      const fields = view.columns.map(column => column.name).filter(name => name !== '_pk')
      return { total: view.total, fields, rows: view.rows.map(row => {
        const safe: Record<string, unknown> = {}
        for (const field of fields) {
          const access = view.fieldAccess(row, field)
          if (access.read === 'visible') safe[field] = row[field]
          else if (access.read === 'masked') safe[field] = '••••'
        }
        return safe
      }) }
    } finally { assembled.dataSet.destroy() }
  }
}
