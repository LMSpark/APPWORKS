/**
 * @module @spark-appworks/spark-project-model:scenario/scenario-definition-resource
 * 职责：把场景文件中的视图、模型关系及级联定义接入SPARK data查询和保存协议。
 * 边界：不创建DataTable、不维护编辑副本；只转换原DataView捕获的变更并返回存储回执。
 * AI用途：由正式元数据空间装配文件资源，组件和业务只调用DataView/DataSet。
 */
import {DataViewLocalQuery, type DataColumn, type DataRow, type DataView, type QueryParams, type DataResourceRelation} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import type {ProjectWorkspace} from '../project/project-workspace'
import type {ScenarioViewFile} from './scenario-view-file'
import {ScenarioViewConfig} from './scenario-view-config'
import {ScenarioDefinitionRecords} from './scenario-definition-records'

/** 原生DataView查询与保存适配协议，不另定义业务提交接口。 */
type Executor = Parameters<DataView['bindQueryExecutor']>[0]
type Source = NonNullable<Executor['source']>
type History = NonNullable<Source['history']>
/** 由原生DataView接纳的查询结果与受保护身份。 */
type Result = Awaited<ReturnType<Executor['executeQuery']>>
/** DataSet捕获并交给原查询owner的变更批次。 */
type SaveCommand = Parameters<NonNullable<Executor['save']>>[0]
/** 原查询基线及确已持久的新增、修改、删除回执。 */
type Receipt = Awaited<ReturnType<NonNullable<Executor['save']>>>[number]
type Context = Readonly<{view: DataView; params: QueryParams; file: ScenarioViewFile | null; resource: string; source: readonly DataRow[]}>
/** 装配时注入的存储与语义校验；没有页面状态或后端虚构模型身份。 */
type DefinitionResourceOptions = Readonly<{
  /** 实际文件存储及冲突、回读、未知提交核验责任方。 */
  workspace: ProjectWorkspace
  /** 描述定义资源的元数据空间C身份，不随目标T变化。 */
  metadataScenarioId: string
  /** 本次被设计空间T，与查询输入dataSpaceId一致。 */
  targetScenarioId: string
  /** 每次异步读取或提交前后核对应用、会话和存储作用域。 */
  assertCurrent(): void
  /** 只校验本次改变的定义及其显式依赖，不读取目标空间的业务数据。 */
  validate(next: ScenarioViewConfig, previous: ScenarioViewConfig, resources: readonly string[]): Promise<void>
}>

/** 同一文件的多个语义资源共用此适配器；数据操作与变更状态统一由SPARK data持有。 */
export class ScenarioDefinitionResource {
  /** 已注册定义资源的调用参数；dataSpaceId定位被查询文件，不改变消费它的DataSet身份。 */
  static queryParameters(resourceId: string): ReadonlyArray<Pick<DataColumn, 'name' | 'type' | 'label' | 'required'>> {
    if (!Object.values(ScenarioDefinitionRecords.resources).some(id => id === resourceId)) {
      throw new Error('SCENARIO_DEFINITION_IDENTITY: 未注册的定义文件资源')
    }
    return [{name: 'dataSpaceId', type: 'string', label: '目标数据空间ID', required: true}]
  }

  readonly #contexts = new WeakMap<Result, Context>()
  readonly #legacy = new WeakMap<ScenarioViewFile, {text: string; relations: readonly DataResourceRelation[]}>()
  readonly #endpoints = new WeakMap<ScenarioViewFile, {text: string; rows: readonly DataRow[]}>()
  #saving = false
  #createdFile: ScenarioViewFile | undefined
  #pending: {file: ScenarioViewFile; command: string; text: string; receipts: Receipt[]; contexts: ReadonlySet<Result>} | undefined

  /** 按实际元空间、目标空间及已授权存储创建资源适配；不会创建表或读取业务行。 */
  constructor(private readonly options: DefinitionResourceOptions) {}

  /** 仅来源仍持有的原上下文需要核验；普通校验失败不进入未知恢复轮。 */
  hasUnconfirmedSave(context: Result): boolean {
    return this.#pending?.contexts.has(context) === true
  }

  /** 供宿主接纳本次原生提交首次创建的文件身份，不接纳其他入口的替换。 */
  ownsCreatedFile(file: ScenarioViewFile | null): boolean {return file !== null && file === this.#createdFile}

  /** 同一文件的来源适配；业务通过DataView预览/采用，文件owner只在资源内部执行存储核对。 */
  readonly source: Source & {readonly history: History} = {
    history: {
      list: async view => {
        this.assertSourceView(view)
        const versions = await this.options.workspace.listScenarioVersions({scenarioId: this.options.targetScenarioId})
        this.assertSourceView(view)
        return versions.map(item => ({version: item.version, label: item.fileName, lastModified: item.lastModified}))
      },
      preview: async (view, version) => {
        this.assertSourceView(view)
        if (typeof version !== 'number') throw new Error('SCENARIO_VIEW_VERSION: 场景历史使用编号版本')
        const text = await this.options.workspace.previewScenarioVersion({scenarioId: this.options.targetScenarioId, version})
        this.assertSourceView(view)
        return text
      },
      status: view => {
        this.assertSourceView(view)
        const status = this.options.workspace.getScenarioVersionStatus({scenarioId: this.options.targetScenarioId})
        this.assertSourceView(view)
        return status
      },
      verify: async (view, hooks) => {
        this.assertSourceView(view)
        const status = await this.options.workspace.verifyScenarioVersionAttempt({scenarioId: this.options.targetScenarioId,
          assertCurrent: () => {this.assertSourceView(view); hooks.assertCurrent()}})
        this.assertSourceView(view)
        return status
      },
      create: async (view, hooks) => {
        const assertCurrent = () => {
          this.assertSourceView(view)
          if (this.#saving || this.#pending) throw new Error('SCENARIO_DEFINITION_PENDING: 定义正在提交或结果待核验')
          hooks.assertCurrent()
        }
        assertCurrent()
        await this.options.workspace.createScenarioVersion({scenarioId: this.options.targetScenarioId, assertCurrent,
          onAttempt: hooks.onAttempt})
        assertCurrent()
      },
    },
    views: view => {
      this.assertSourceView(view)
      const dataSet = view.dataSet
      if (!dataSet) throw new Error('SCENARIO_DEFINITION_IDENTITY: 定义视图不属于数据空间')
      return Object.values(dataSet.tables).flatMap(table => {
        const expected = Object.entries(ScenarioDefinitionRecords.resources).find(([name]) => name === table.tableName)?.[1]
        if (!expected) return []
        if (table.resourceType !== 'file' || table.resourceId !== expected) throw new Error('SCENARIO_DEFINITION_IDENTITY: 文件定义资源已改变')
        return table.viewList.filter(item => item.queryContext['dataSpaceId'] === this.options.targetScenarioId)
      })
    },
    preview: async view => {
      this.assertSourceView(view)
      const file = this.options.workspace.getScenarioViews(this.options.targetScenarioId), version = file?.revision ?? null
      const content = await this.options.workspace.previewScenarioViewsRemote({scenarioId: this.options.targetScenarioId})
      this.assertSourceView(view)
      if (this.options.workspace.getScenarioViews(this.options.targetScenarioId) !== file || (file?.revision ?? null) !== version) {
        throw new Error('SCENARIO_VIEW_DRAFT_STALE: 预览期间本地来源已改变')
      }
      return {version, content}
    },
    adopt: async (view, snapshot, hooks) => {
      const assertCurrent = () => {
        this.assertSourceView(view)
        if (this.#saving) throw new Error('SCENARIO_DEFINITION_PENDING: 定义正在提交')
        hooks.assertCurrent()
      }
      assertCurrent()
      if (typeof snapshot.version !== 'number') throw new Error('SCENARIO_VIEW_DRAFT_STALE: 场景来源缺少本地版本')
      await this.options.workspace.adoptScenarioViews({scenarioId: this.options.targetScenarioId,
        expectedRevision: snapshot.version, previewText: snapshot.content, assertCurrent, beforeApply: hooks.beforeApply})
      this.options.assertCurrent()
      this.#pending = undefined
    },
  }

  private assertSourceView(view: DataView): void {
    this.assertView(view)
    if (view.queryContext['dataSpaceId'] !== this.options.targetScenarioId) throw new Error('SCENARIO_DEFINITION_TARGET: 定义来源须明确目标数据空间')
  }

  /** 通用页面按查询参数定位目标空间；同一提交不可混入不同目标的文件。 */
  static forQueries(options: Omit<DefinitionResourceOptions, 'targetScenarioId'>): Executor {
    const resources = new Map<string, ScenarioDefinitionResource>()
    const contexts = new WeakMap<Result, ScenarioDefinitionResource>()
    const resolve = (target: unknown) => {
      if (typeof target !== 'string' || !target.trim() || target.trim() !== target) throw new Error('SCENARIO_DEFINITION_TARGET: 查询须提供目标数据空间ID')
      let resource = resources.get(target)
      if (!resource) {resource = new ScenarioDefinitionResource({...options, targetScenarioId: target}); resources.set(target, resource)}
      return resource
    }
    return {
      hasUnconfirmedSave: context => contexts.get(context)?.hasUnconfirmedSave(context) === true,
      source: {
        history: {
          list: view => resolve(view.queryContext['dataSpaceId']).source.history.list(view),
          preview: (view, version) => resolve(view.queryContext['dataSpaceId']).source.history.preview(view, version),
          status: view => resolve(view.queryContext['dataSpaceId']).source.history.status(view),
          verify: (view, hooks) => resolve(view.queryContext['dataSpaceId']).source.history.verify(view, hooks),
          create: (view, hooks) => resolve(view.queryContext['dataSpaceId']).source.history.create(view, hooks),
        },
        views: view => resolve(view.queryContext['dataSpaceId']).source.views(view),
        preview: view => resolve(view.queryContext['dataSpaceId']).source.preview(view),
        adopt: (view, snapshot, hooks) => resolve(view.queryContext['dataSpaceId']).source.adopt(view, snapshot, hooks),
      },
      executeQuery: async (view, params) => {
        const resource = resolve(params.context?.['dataSpaceId'])
        const result = await resource.executeQuery(view, params)
        contexts.set(result, resource)
        return result
      },
      save: async command => {
        const owners = command.changes.map(change => contexts.get(change.context))
        const resource = owners[0]
        if (!resource || owners.some(owner => owner !== resource)) throw new Error('SCENARIO_DEFINITION_TARGET: 不同目标空间的定义须分别提交')
        const receipts = await resource.save(command)
        for (const receipt of receipts) contexts.set(receipt.context, resource)
        return receipts
      },
    }
  }

  /** 资源装配器交付已完整解析的旧关系来源；只读来源不是编辑状态，原数据库记录不回写。 */
  useResolvedRelations(file: ScenarioViewFile | null, relations: readonly DataResourceRelation[] | undefined): void {
    this.options.assertCurrent()
    if (!file) return
    if (file.scenarioId !== this.options.targetScenarioId || this.options.workspace.getScenarioViews(file.scenarioId) !== file) {
      throw new Error('SCENARIO_DEFINITION_IDENTITY: 来源关系不属于当前文件')
    }
    if (relations && !file.value.usesNativeResourceRelations) this.#legacy.set(file, {text: file.getText(), relations: structuredClone(relations)})
    else this.#legacy.delete(file)
  }

  private legacy(file: ScenarioViewFile): readonly DataResourceRelation[] | undefined {
    const source = this.#legacy.get(file)
    return source?.text === file.getText() ? source.relations : undefined
  }

  /** 关系来源装配器交付只读端点；graph视图同样通过查询协议接纳，不能用replaceRows绕过数据链。 */
  useRelationEndpoints(file: ScenarioViewFile, endpoints: ReadonlyArray<Pick<DataResourceRelation, 'relationId' | 'sourceRelationId' | 'parentTable' | 'childTable'>>): void {
    this.options.assertCurrent()
    if (this.options.workspace.getScenarioViews(this.options.targetScenarioId) !== file) throw new Error('SCENARIO_DEFINITION_IDENTITY: 端点来源已变化')
    this.#endpoints.set(file, {text: file.getText(), rows: endpoints.map(endpoint => ({...structuredClone(endpoint), dataSetId: file.scenarioId,
      definitionKey: JSON.stringify(!file.value.usesNativeResourceRelations && endpoint.sourceRelationId !== undefined
        ? ['source', endpoint.sourceRelationId, endpoint.parentTable, endpoint.childTable] : ['native', endpoint.relationId])}))})
  }

  /** 按正式配置表名提供同一个查询保存适配；声明本身不会创建表或授予数据库权限。 */
  get executors(): Readonly<Record<string, Executor>> {
    return Object.fromEntries(Object.keys(ScenarioDefinitionRecords.resources).map(name => [name, this]))
  }

  private assertView(view: DataView): string {
    this.options.assertCurrent()
    const resource = view.dataTable?.resourceId
    const expected = Object.entries(ScenarioDefinitionRecords.resources).find(([name]) => name === view.tableName)?.[1]
    if (view.destroyed || view.dataSet?.destroyed || view.dataSet?.scenarioId !== this.options.metadataScenarioId
      || !expected || resource !== expected || view.dataTable?.resourceType !== 'file' || view.dataTable.modelBinding) {
      throw new Error('SCENARIO_DEFINITION_IDENTITY: 定义视图不属于正式元数据空间的文件资源')
    }
    return resource
  }

  /** 查询记录来自目标文件；查询配置、结果接纳和编辑生命周期仍由原DataView执行。 */
  async executeQuery(view: DataView, params: QueryParams): Promise<Result> {
    const resource = this.assertView(view)
    if (params.context?.['dataSpaceId'] !== this.options.targetScenarioId) throw new Error('SCENARIO_DEFINITION_TARGET: 定义查询必须明确目标数据空间')
    let file: ScenarioViewFile | null
    try {file = await this.options.workspace.loadScenarioViews({scenarioId: this.options.targetScenarioId})}
    catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('SCENARIO_VIEW_FILE_MISSING:')) throw error
      file = null
    }
    this.assertView(view)
    if (file && file.saveStatus !== 'idle' || this.#pending) throw new Error('SCENARIO_DEFINITION_PENDING: 请先通过原DataSet保存核验未确认提交')
    const endpoints = file ? this.#endpoints.get(file) : undefined
    const source = resource === ScenarioDefinitionRecords.resources.DataResourceRelationDefinition && params.context['definitionProjection'] === 'endpoints'
      && file && endpoints?.text === file.getText() ? endpoints.rows : file ? ScenarioDefinitionRecords.read(file.value, resource, this.legacy(file))
        : resource === ScenarioDefinitionRecords.resources.DataSpaceLayoutDefinition ? [{dataSetId: this.options.targetScenarioId}] : []
    return this.result({view, params: structuredClone(params), file, resource, source})
  }

  private hasTable(tables: unknown, tableName: string): boolean {
    return isRecord(tables) && Object.hasOwn(tables, tableName)
  }

  private key(view: DataView, row: Readonly<DataRow>): string {
    const values = view.pk.effectivePkFields.map(field => row[field])
    if (!values.length || values.some(value => typeof value !== 'string' && typeof value !== 'number' || value === '')) {
      throw new Error('SCENARIO_DEFINITION_KEY: 定义缺少主键')
    }
    return JSON.stringify(values)
  }

  private result(context: Context, retained?: readonly DataRow[]): Result {
    const {view, file, resource, params, source} = context
    const editable = !['endpoints', 'fileModels'].includes(String(params.context?.['definitionProjection']))
    const singleton = resource === ScenarioDefinitionRecords.resources.DataSpaceLayoutDefinition
    const fields = new Set(view.columns.filter(column => column.name !== '_pk' && !column.computeExpression).map(column => column.name))
    const primaryKeys = view.columns.filter(column => column.isPrimaryKey).map(column => column.name)
    const selected = DataViewLocalQuery.select({rows: source, fields, primaryKeys, params})
    const rows = structuredClone(retained ? [...retained] : selected.rows)
    const keys = new Set(rows.map(row => this.key(view, row)))
    if (keys.size !== rows.length) throw new Error('SCENARIO_DEFINITION_DUPLICATE: 定义主键重复')
    const guard = (): void => {
      this.assertView(view)
      const current = this.options.workspace.getScenarioViews(this.options.targetScenarioId)
      if (current !== file && !(file === null && this.ownsCreatedFile(current))) throw new Error('SCENARIO_DEFINITION_STALE: 文件实例已变化')
    }
    const writable = (key: unknown, field: string): boolean => key !== undefined && editable && selected.output.has(field)
      && !(resource === ScenarioDefinitionRecords.resources.DataTableBindingDefinition && field === 'resourceType')
      && (!keys.has(String(key)) || ![...primaryKeys, 'dataSetId', 'dataModelId', 'dataModelName'].includes(field))
    const result: Result = {
      undefinedChanges: 'clear',
      rows, total: selected.total, rowKey: row => view.pk.effectivePkFields.every(field =>
        (typeof row[field] === 'string' || typeof row[field] === 'number') && row[field] !== '') ? this.key(view, row) : undefined,
      assertIdentity: identity => {
        guard()
        if (identity.scenarioId !== this.options.metadataScenarioId || identity.metaName !== view.tableName
          || identity.resource?.resourceType !== 'file' || identity.resource.resourceId !== resource) {
          throw new Error('SCENARIO_DEFINITION_IDENTITY: 查询身份不匹配')
        }
      },
      prepareNewRow: row => {
        guard()
        if (row['dataSetId'] !== undefined && row['dataSetId'] !== this.options.targetScenarioId) throw new Error('SCENARIO_DEFINITION_TARGET: 新增目标空间不一致')
        const existing = source.find(item => item['tableName'] === row['tableName'])
        return {...row, ...(resource === ScenarioDefinitionRecords.resources.DataViewDefinition && row['dataModelName'] === undefined
          && existing?.['dataModelName'] !== undefined ? {dataModelName: existing['dataModelName']} : {}), dataSetId: this.options.targetScenarioId,
          ...(fields.has('definitionKey') && row['definitionKey'] === undefined ? {definitionKey: crypto.randomUUID()} : {})}
      },
      fieldAccess: (key, field) => {
        guard()
        const visible = key !== undefined && selected.output.has(field), write = writable(key, field)
        return {read: visible ? 'visible' : 'invisible', write: write ? 'allowed' : 'denied',
          component: !visible ? 'hidden' : write ? 'editable' : 'readonly',
          required: view.columns.find(column => column.name === field)?.required === true,
          writeMode: write ? 'editable' : 'readonly'}
      },
      readFieldAccess: (_row, field) => {guard(); return selected.output.has(field) ? 'visible' : 'invisible'},
      addActionState: available => {guard(); return editable && !singleton && available !== false ? 'enabled' : 'disabled'},
      editActionState: (key, available) => {guard(); return editable && keys.has(String(key)) && available !== false ? 'enabled' : 'disabled'},
      deleteActionState: (key, available) => {guard(); return editable && !singleton && keys.has(String(key)) && available !== false ? 'enabled' : 'disabled'},
      createChildActionState: () => 'disabled',
      viewActionState: (key, available) => {guard(); return keys.has(String(key)) && available !== false ? 'enabled' : 'disabled'},
    }
    this.#contexts.set(result, context)
    return result
  }

  private clean(row: Readonly<DataRow>): DataRow {
    return Object.fromEntries(Object.entries(row).filter(([key, value]) => key !== '_pk' && value !== undefined))
  }

  private same(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true
    if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length && left.every((value, index) => this.same(value, right[index]))
    if (!isRecord(left) || !isRecord(right)) return false
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && this.same(left[key], right[key]))
  }

  /** 仅接收DataView私有查询上下文和已捕获变更；文件IO不暴露为业务保存入口。 */
  async save(command: SaveCommand): Promise<Receipt[]> {
    this.options.assertCurrent()
    if (this.#saving) throw new Error('SCENARIO_DEFINITION_PENDING: 定义正在提交')
    this.#saving = true
    try {return await this.saveCaptured(command)} finally {this.#saving = false}
  }

  private async saveCaptured(command: SaveCommand): Promise<Receipt[]> {
    const assertCurrent = () => {
      this.options.assertCurrent()
      for (const change of command.changes) {
        const context = this.#contexts.get(change.context)
        if (!context) throw new Error('SCENARIO_DEFINITION_CONTEXT: 必须使用原查询上下文')
        this.assertView(context.view)
        change.context.assertIdentity(change.identity)
      }
    }
    assertCurrent()
    const signature = JSON.stringify(command.changes.map(change => ({identity: change.identity, changes:
      Object.entries(change.changes).map(([operation, rows]) => [operation, rows.map(row => Object.entries(row)
        .map(([field, value]) => [field, value === undefined ? [] : [value]]))])})))
    if (this.#pending) {
      if (signature !== this.#pending.command) throw new Error('SCENARIO_DEFINITION_PENDING: 先核验原提交，不能夹带另一批修改')
      for (const change of command.changes) change.context.assertIdentity(change.identity)
      const pending = this.#pending
      const outcome = await this.options.workspace.verifyScenarioViews({scenarioId: this.options.targetScenarioId, assertCurrent})
      assertCurrent()
      this.#pending = undefined
      if (outcome === 'confirmed') return pending.receipts
      pending.file.setText(pending.file.savedText)
      throw new Error('SCENARIO_DEFINITION_NOT_APPLIED: 原提交未应用，草稿保留；请显式重试保存')
    }
    let file = this.options.workspace.getScenarioViews(this.options.targetScenarioId)
    if (file && (file.saveStatus !== 'idle' || file.isDirty && !(this.ownsCreatedFile(file) && !file.isPersisted))) throw new Error('SCENARIO_DEFINITION_FILE_STATE: 文件仍有另一项未提交操作')
    const previous = file?.isPersisted ? file.value : new ScenarioViewConfig(this.options.targetScenarioId, JSON.stringify({scenarioId: this.options.targetScenarioId, schemaVersion: 2, tables: {}}))
    const previousText = file?.getText() ?? null
    const candidate = new ScenarioDefinitionRecords(previous)
    const createdBindings = new Set(command.changes.filter(change => change.identity.metaName === 'DataTableBindingDefinition')
      .flatMap(change => change.changes.added?.map(row => row['tableName']) ?? []))
    const accepted: Array<{change: SaveCommand['changes'][number]; context: Context; source: DataRow[];
      added: DataRow[]; changed: DataRow[]; deleted: DataRow[]; changedFields: string[][]}> = []
    // 绑定提供所属视图的正式身份；其余定义先合并完整捕获，再统一校验，不能按临时中间状态拒绝。
    const changes = [...command.changes].sort((left, right) =>
      Number(right.identity.metaName === 'DataTableBindingDefinition') - Number(left.identity.metaName === 'DataTableBindingDefinition'))
    for (const change of changes) {
      const context = this.#contexts.get(change.context)
      if (!context || context.file !== file && !(context.file === null && this.ownsCreatedFile(file))) throw new Error('SCENARIO_DEFINITION_CONTEXT: 必须使用原查询上下文')
      change.context.assertIdentity(change.identity)
      const {view, resource} = context
      if (context.params.context?.['definitionProjection'] === 'endpoints') throw new Error('SCENARIO_DEFINITION_PROJECTION: 端点投影只读')
      let current = candidate.readRows(resource, file ? this.legacy(file) : undefined)
      if (resource === ScenarioDefinitionRecords.resources.DataResourceRelationDefinition) {
        // 原生relationId承载持久身份；显式旧格式转换或改名不替换当前查询中的记录主键。
        const identities = new Map(context.source.filter(row => typeof row['relationId'] === 'string')
          .map(row => [row['relationId'], row['definitionKey']]))
        current = current.map(row => identities.has(row['relationId']) ? {...row, definitionKey: identities.get(row['relationId'])} : row)
      }
      if (resource === ScenarioDefinitionRecords.resources.DataViewCascadeDefinition) {
        const definitions = (rows: readonly DataRow[]) => rows.map(row => Object.fromEntries(Object.entries(row).filter(([field]) => field !== 'definitionKey')))
        if (!this.same(definitions(ScenarioDefinitionRecords.read(previous, resource)), definitions(context.source))) {
          throw new Error('SCENARIO_DEFINITION_CONFLICT: 级联集合已改变，请重新查询')
        }
        // 配置没有强制cascadeId。文件序号可以变化，当前查询中的存活记录身份必须保持。
        current = current.map((row, index) => ({...row, definitionKey: context.source[index]?.['definitionKey']}))
      }
      const merged = new Map(current.map(row => [this.key(view, row), row]))
      const originals = new Map(change.context.rows.map(row => [this.key(view, row), row]))
      const used = new Set<string>(), added: DataRow[] = [], changed: DataRow[] = [], deleted: DataRow[] = [], changedFields: string[][] = []
      for (const operation of ['added', 'changed', 'deleted'] as const) for (const row of change.changes[operation] ?? []) {
        const key = this.key(view, row), original = originals.get(key), currentRow = merged.get(key)
        if (used.has(key)) throw new Error('SCENARIO_DEFINITION_DUPLICATE: 同一记录不能重复提交')
        used.add(key)
        if (operation === 'added') {
          // 同批新建表的运行结构必须有default；显式新增的default替换此空占位，不能覆盖既有定义。
          const newDefault = resource === ScenarioDefinitionRecords.resources.DataViewDefinition && row['viewId'] === 'default'
            && createdBindings.has(row['tableName']) && typeof row['tableName'] === 'string'
            && !this.hasTable(previous.toJSON()['tables'], row['tableName'])
          if (currentRow && !newDefault) throw new Error('SCENARIO_DEFINITION_DUPLICATE: 新增定义已存在')
          const value = this.clean(row)
          merged.set(key, value); added.push(value)
          continue
        }
        if (!original || !currentRow) throw new Error('SCENARIO_DEFINITION_BASELINE: 修改记录不属于原查询')
        const fields = Object.keys(row).filter(field => field !== '_pk' && !this.same(row[field], original[field]))
        const checked = operation === 'deleted' ? Object.keys(original) : fields
        if (checked.some(field => field !== '_pk' && !this.same(currentRow[field], original[field]))) {
          throw new Error('SCENARIO_DEFINITION_CONFLICT: 定义已被另一个查询修改')
        }
        if (operation === 'deleted') {merged.delete(key); deleted.push(this.clean(original)); continue}
        for (const field of fields) {
          if (change.context.fieldAccess(key, field).write !== 'allowed') throw new Error(`SCENARIO_DEFINITION_FIELD: 不可修改 ${field}`)
        }
        const value = this.clean({...currentRow, ...Object.fromEntries(fields.map(field => [field, row[field]]))})
        merged.set(key, value); changed.push(value)
        // 同批绑定更新可改变视图的只读模型名称。回执须声明这些正式派生变化，
        // DataView才能接纳新基线，而不是把旧名称误认成本地尚未提交的修改。
        changedFields.push([...new Set([...fields, ...Object.keys(value).filter(field => !this.same(value[field], original[field]))])])
      }
      const source = [...merged.values()]
      candidate.applyRows(resource, source, file !== null && this.legacy(file) !== undefined)
      accepted.push({change, context, source, added, changed, deleted, changedFields})
    }
    const next = candidate.toConfig()
    // 正式关系可消耗同批布局的待配置连线；回执必须确认最终持久值，而非域合并时的中间值。
    for (const item of accepted) if (item.context.resource === ScenarioDefinitionRecords.resources.DataSpaceLayoutDefinition) {
      item.source = ScenarioDefinitionRecords.read(next, item.context.resource)
      item.changed = item.changed.map((row, index) => {
        const key = this.key(item.context.view, row), value = item.source.find(entry => this.key(item.context.view, entry) === key)
        if (!value) throw new Error('SCENARIO_DEFINITION_LAYOUT: 最终布局缺少已提交记录')
        const fields = new Set([...Object.keys(row), ...Object.keys(value)])
        item.changedFields[index] = [...new Set([...item.changedFields[index] ?? [],
          ...[...fields].filter(field => field !== '_pk' && !this.same(value[field], row[field]))])]
        return value
      })
    }
    accepted.sort((left, right) => command.changes.indexOf(left.change) - command.changes.indexOf(right.change))
    await this.options.validate(next, previous, accepted.map(item => item.context.resource))
    assertCurrent()
    if (file !== this.options.workspace.getScenarioViews(this.options.targetScenarioId) || (file?.getText() ?? null) !== previousText || file && file.saveStatus !== 'idle') {
      throw new Error('SCENARIO_DEFINITION_STALE: 校验期间文件发生变化')
    }
    const text = ScenarioDefinitionRecords.json(next.toJSON())
    if (!file) {
      file = await this.options.workspace.createScenarioViews({scenarioId: this.options.targetScenarioId, text, assertCurrent})
      this.#createdFile = file
    }
    const submittedFile = file
    const receipts = accepted.map(item => {
      const rows = new Map(item.change.context.rows.map(row => [this.key(item.context.view, row), this.clean(row)]))
      item.deleted.forEach(row => rows.delete(this.key(item.context.view, row)))
      ;[...item.added, ...item.changed].forEach(row => rows.set(this.key(item.context.view, row), row))
      return {metaName: item.change.identity.metaName, added: item.added, changed: item.changed, deleted: item.deleted,
        changedFields: item.changedFields, context: this.result({...item.context, file: submittedFile, source: item.source}, [...rows.values()])}
    })
    file.setText(text)
    try {
      await this.options.workspace.saveScenarioViews({scenarioId: this.options.targetScenarioId, assertCurrent: () => {
        assertCurrent()
        if (submittedFile.getText() !== text) throw new Error('SCENARIO_DEFINITION_STALE: 提交期间文件发生变化')
      }})
    } catch (error) {
      if (String(file.saveStatus) === 'unknown') this.#pending = {file, command: signature, text, receipts,
        contexts: new Set(command.changes.map(change => change.context))}
      else if (file.getText() === text && previousText !== null) file.setText(previousText)
      throw error
    }
    assertCurrent()
    return receipts
  }
}
