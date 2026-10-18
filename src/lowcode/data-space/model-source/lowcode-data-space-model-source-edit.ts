/**
 * @module app:lowcode/data-space/model-source/lowcode-data-space-model-source-edit
 * 职责：预览来源替换或当前来源字段同步，保留同名定义及派生字段配置。
 * 边界：正式记录归原DataView；删除须检查引用，来源合同变化须明确确认并校验最终模型。
 * AI用途：沿原元数据视图的权限、批量保存和回读处理来源变更及未知结果。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {LowcodeDataSpaceModelCreate} from './lowcode-data-space-model-create'
import {LowcodeDataSpaceRelationMigration} from './lowcode-data-space-relation-migration'
import {LowcodeDataSpaceModelMigration} from './lowcode-data-space-model-migration'
import {LowcodeDataSpaceFieldMigration} from './lowcode-data-space-field-migration'
import {LowcodeDataSpaceSourceCatalog} from './lowcode-data-space-source-catalog'
import {LowcodeDataSpaceSourceInputEdit} from './lowcode-data-space-source-input-edit'

/** 与新增模型共享的正式来源能力。 */
type Reader = NonNullable<ConstructorParameters<typeof LowcodeDataSpaceModelCreate>[2]>
/** 精确读取后的来源配置。 */
type Prepared = Awaited<ReturnType<Reader['prepare']>>
/** 同一正式模型在来源变更前后的投影；只描述定义，不携带运行行。 */
export type SourceContractChange = Readonly<{
  /** 仅固定投影迁移及删除检查需要原合同；纯来源修复不要求旧来源先可装配。无数据字段时返回null。 */
  previous(): ReturnType<typeof DataSpaceDesignApi.projectModel> | null
  /** 来源变更候选模型，字段沿用正式ID，只包含预览中的合同变化。 */
  after: ReturnType<typeof DataSpaceDesignApi.projectModel>
}>
/** 数据库确认后接续原定义DataView的文件迁移，不另开文件写入通道。 */
export type SourceContractPlan = Readonly<{
  /** 用户确认时可见的命名视图字段差异。 */
  viewChanges: Array<{tableName: string; viewId: string; fieldId: string; before: string; after: string}>
  /** 应用与派发期间核对本地文件基线及其他定义操作。 */
  check(): void
  /** 数据库派发前核对远端文件基线。 */
  assertCurrent(): Promise<void>
  /** 数据库已确认后保存或核验文件；不会重放数据库写入。 */
  complete(reconcile: boolean): Promise<void>
}>
/** 来源替换的预览；正式记录仍归原DataView。 */
type Preview = {
  /** 同步保持已绑定来源；替换允许显式选择另一个来源。 */
  operation: 'replace' | 'synchronize'
  /** 同步已消失的字段或替换时明确选中的字段；保存前核验命令依赖。 */
  removals: Array<{id: string; name: string; type: string}>
  /** 来源已消失的普通字段可以显式选择移除，主键须同时校验候选合同。 */
  removalChoices: Array<{id: string; name: string; removed: boolean}>
  /** 新来源参数的明确取值；未配置时不得提交替换或同步。 */
  inputChoices: Array<{sourceName: string; value: string}>
  /** 当前已保存的空间参数目录；不可读时常量仍可编辑。 */
  inputParams: Array<{value: string; label: string}>
  /** 参数声明不可用的原因；不猜测引用。 */
  parameterWarning: string
  /** 已有字段的类型/主键差异；只有明确确认才进入原视图变更。 */
  contractChanges: Array<{id: string; name: string; before: string; after: string; accepted: boolean; patch: Record<string, unknown>}>
  /** 与本次来源合同一起确认、在数据库回读后提交的命名视图变化。 */
  viewChanges: SourceContractPlan['viewChanges']
  /** 保持不变的模型注册名。 */
  name: string
  /** 精确重读得到的来源。 */
  prepared: Prepared
  /** 逐字段兼容性结果，不包含运行行或权限凭据。 */
  differences: Array<{name: string; result: string}>
  /** 须先处理的迁移或诊断项。 */
  problems: string[]
  /** 原字段到同用途来源字段的显式选择；数据字段的合同差异另行确认。 */
  fieldChoices: Array<{id: string; name: string; outputName: string; sourceName: string; candidates: string[]}>
  /** 尚未绑定的数据字段，可显式引入为输出列。 */
  additions: Array<{sourceName: string; included: boolean}>
  /** 原始关系表达式与按本次字段映射生成的提交值；只在确认时写入。 */
  relationChanges: Array<{id: string; before: string; after: string}>
  /** 模型自身来源字段引用的原值和显式映射结果；输出名称不参与迁移。 */
  modelChanges: Array<{property: string; before: string; after: string}>
  /** 自身和依赖模型Filter字段引用变更；后端Join配置不参与本轮迁移。 */
  expressionChanges: ReturnType<typeof LowcodeDataSpaceModelMigration.prepare>
  /** 本模型字段ValueFun中的明确来源引用变更；不修改输出名称。 */
  fieldExpressionChanges: ReturnType<typeof LowcodeDataSpaceFieldMigration.prepare>
}
type FieldEdit = {id: string; patch: Record<string, unknown>; snapshot: string}
type FieldAddition = {id: string; values: Record<string, unknown>; snapshot: string}

/** 同一模型的来源替换流程；不提供破坏字段合同的快捷覆盖。 */
export class LowcodeDataSpaceModelSourceEdit {
  private static readonly sourceKeys = ['Type', 'MetaName', 'DbId', 'DbName'] as const
  readonly #views: DataView[]
  readonly #models: DataView
  #fields: DataView
  #syncFields: DataView | undefined
  #replacementFields: DataView | undefined
  #relations: DataView
  #replacementRelations: DataView | undefined
  readonly #contexts: string[]
  #status: 'idle' | 'previewing' | 'ready' | 'saving' | 'unknown' | 'readback' | 'unsubmitted' | 'different' | 'configuration' = 'idle'
  #generation = 0
  #preview: Preview | null = null
  #baseline = ''
  #expected = ''
  #pendingSnapshot = ''
  #patch: Record<string, unknown> = {}
  #verifiedSnapshot = ''
  #verification: Array<{table: string; id: string; result: string}> = []
  readonly #mappings = new Map<string, string>()
  readonly #included = new Set<string>()
  readonly #removals = new Set<string>()
  readonly #inputs = new Map<string, string>()
  readonly #acceptedContracts = new Set<string>()
  #contractPlan: SourceContractPlan | null = null
  #fieldEdits: FieldEdit[] = []
  #relationEdits: FieldEdit[] = []
  #modelEdits: FieldEdit[] = []
  #added: FieldAddition[] = []
  #removed: Array<{id: string; row: DataRow}> = []

  /** 捕获目标；同步与替换均从C派生独立命名查询视图，生命周期归设计会话。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string,
    private readonly options: Readonly<{modelId: string; sources: Reader; validateConfiguration(): Promise<() => void>;
      validateTransition?(model: Prepared['model']): Promise<() => void>;
      prepareContract?(change: SourceContractChange): Promise<SourceContractPlan>;
      validateRemovals?(ids: readonly string[], contract?: SourceContractChange): Promise<() => void>; assertCurrent(): void; onDispatch(): void; completed(): void}>) {
    this.#views = ['Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'].map(name => {
      const view = dataSet.getView(name, 'default')
      if (!view) throw new Error(`缺少正式元数据视图：${name}`)
      return view
    })
    const [models, fields, relations] = this.#views
    if (!models || !fields || !relations) throw new Error('正式元数据视图不完整')
    this.#models = models; this.#fields = fields; this.#relations = relations
    this.#contexts = this.#views.map(view => JSON.stringify(view.queryContext))
    this.assertOwner()
  }

  private assertOwner(): void {
    this.options.assertCurrent()
    if (this.dataSet.destroyed || this.#views.some((view, i) => view.destroyed || this.dataSet.getView(view.tableName, view.viewId) !== view
      || view.dataTable?.modelBinding?.modelName !== view.tableName || view.queryContext['dataSpaceId'] !== this.targetId
      || JSON.stringify(view.queryContext) !== this.#contexts[i])) throw new Error('来源替换查询或目标已变化')
  }

  private selectViews(synchronizing: boolean): void {
    this.assertClean(false, true)
    const template = this.dataSet.getView('Base_DataModel_Field', 'modelInputFields')
    if (!template || template.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field') throw new Error('缺少正式所属字段查询配置modelInputFields')
    if (synchronizing) this.#syncFields ??= template.createQueryView(`sourceSync:${this.options.modelId}`)
    else {
      this.#replacementFields ??= template.createQueryView(`sourceReplace:${this.options.modelId}`)
      this.#replacementRelations ??= this.#relations.createQueryView(`sourceReplace:${this.options.modelId}`)
      this.#relations = this.#replacementRelations
    }
    const fields = synchronizing ? this.#syncFields : this.#replacementFields
    if (!fields) throw new Error('来源操作字段视图不存在')
    // Filter可能使用限定名，也可能存在含点的本地字段；仅补读持有Filter的模型，不扫描其他模型字段。
    const modelIds = new Set([this.options.modelId])
    if (!synchronizing) for (const model of this.#models.rows) {
      if (this.#models.fieldAccess(model, 'Filter').read !== 'visible') throw new Error('模型过滤配置不可读，不能核验来源引用')
      if (model['Filter'] !== undefined && model['Filter'] !== null && model['Filter'] !== '') {
        if (typeof model['rowid'] !== 'string' || !model['rowid']) throw new Error('依赖模型身份不可确认')
        modelIds.add(model['rowid'])
      }
    }
    fields.queryContext = {...template.queryContext, dataSpaceId: this.targetId, modelId: this.options.modelId, modelIds: [...modelIds].sort()}
    this.#fields = fields
    this.#views.splice(0, this.#views.length, this.#models, this.#fields, ...synchronizing ? [] : [this.#relations])
    this.#contexts.splice(0, this.#contexts.length, ...this.#views.map(view => JSON.stringify(view.queryContext)))
    this.assertOwner()
  }

  private assertClean(allowOwned = false, forReadback = false): void {
    this.assertOwner()
    for (const view of this.#views) {
      if (Object.values(view.dataTable?.views ?? {}).some(other => other !== view
        && (other.mutating || other.hasEditingChanges() || other.dirtyTracking.hasPendingChanges()))) throw new Error('请先处理其他元数据草稿，不能覆盖')
      const owned = new Set(allowOwned ? view === this.#models ? [this.options.modelId, ...this.#modelEdits.map(item => item.id)]
        : view === this.#fields ? [...this.#fieldEdits, ...this.#added, ...this.#removed].map(item => item.id) : this.#relationEdits.map(item => item.id) : [])
      if ((!forReadback && view.requestState !== RequestState.Loaded) || view.requestState === RequestState.Loading || view.mutating
        || (!forReadback && !allowOwned && view.total !== view.rows.length)) throw new Error('元数据尚未完整读取或正在操作')
      const foreignEdits = view.hasEditingChanges() && (owned.size === 0
        || view.rows.some(row => !owned.has(String(view.getPkKey(row))) && view.hasEditingChanges(view.getPkKey(row))))
      if (foreignEdits || [...view.dirtyTracking.pendingDeleteIds].some(id => !owned.has(String(id)))
        || [...view.dirtyTracking.pendingCreateIds, ...view.dirtyTracking.dirtyRowIds].some(id => !owned.has(String(id)))) throw new Error('请先处理其他元数据草稿，不能覆盖')
      if (view.rows.some(row => row['dataSetId'] !== this.targetId || view.fieldAccess(row, 'dataSetId').read !== 'visible'
        && !(allowOwned && view === this.#fields && this.#added.some(item => item.id === view.getPkKey(row))))) throw new Error('元数据归属不可读或不属于目标空间')
      if ((view === this.#syncFields || view === this.#replacementFields) && view.rows.some(row => !Array.isArray(view.queryContext['modelIds'])
        || !view.queryContext['modelIds'].includes(row['dataModelId'])
        || view.fieldAccess(row, 'dataModelId').read !== 'visible'
          && !(allowOwned && this.#added.some(item => item.id === view.getPkKey(row))))) throw new Error('来源字段归属不可读或不属于本次模型范围')
    }
  }

  private current(id = this.options.modelId): DataRow {
    const rows = this.#models.rows.filter(row => this.#models.getPkKey(row) === id)
    const row = rows[0]
    if (rows.length !== 1 || row?.['rowid'] !== id) throw new Error('模型身份不存在或不唯一')
    return row
  }

  private values(view: DataView, row: DataRow): Record<string, unknown> {
    // 正式CRUD会重写目标记录的更新时间/更新人；它们不属于须保持不变的设计合同。
    const targetModel = view === this.#models || view === this.#fields && row['dataModelId'] === this.options.modelId || view === this.#relations
    return Object.fromEntries(view.columns.filter(column => column.name !== '_pk'
      && !(targetModel && ['updatetime', 'updateuser'].includes(column.name.toLowerCase()))).map(column => {
      if (view.fieldAccess(row, column.name).read !== 'visible') throw new Error(`无法完整核对${view.tableName}.${column.name}`)
      return [column.name, row[column.name]]
    }))
  }

  private snapshot(patch: Record<string, unknown> = {}, applyFields = false): string {
    return JSON.stringify(this.#views.map(view => view.rows.filter(row => view !== this.#fields || !this.#added.some(item => item.id === view.getPkKey(row))
      && !(applyFields && this.#removed.some(item => item.id === view.getPkKey(row)))).map(row => ({id: view.getPkKey(row), values: {
      ...this.values(view, row), ...(view === this.#models && row['rowid'] === this.options.modelId ? patch : {}),
      ...(applyFields && view === this.#models ? this.#modelEdits.find(item => item.id === view.getPkKey(row))?.patch : {}),
      ...(applyFields && view === this.#fields ? this.#fieldEdits.find(item => item.id === view.getPkKey(row))?.patch : {}),
      ...(applyFields && view === this.#relations ? this.#relationEdits.find(item => item.id === view.getPkKey(row))?.patch : {}),
    }})).sort((a, b) => String(a.id).localeCompare(String(b.id)))))
  }

  private available(): void {
    this.assertOwner()
    if (!['idle', 'previewing', 'ready'].includes(this.#status)) throw new Error('请先核验上次来源替换，不能重复提交')
  }

  private assess(prepared: Prepared): Preview {
    const row = this.current(), problems: string[] = [], differences: Preview['differences'] = [], fieldChoices: Preview['fieldChoices'] = [], additions: Preview['additions'] = []
    const removals: Preview['removals'] = [], removalChoices: Preview['removalChoices'] = [], inputChoices: Preview['inputChoices'] = [], contractChanges: Preview['contractChanges'] = []
    if (typeof row['Name'] !== 'string' || !row['Name'].trim()) throw new Error('模型注册名无效')
    if (LowcodeDataSpaceSourceCatalog.config(prepared.source.type).label !== prepared.model.Type) problems.push('来源类型与正式读取结果不一致')
    for (const key of ['JoinFilter', 'ForeignKeyFields', 'PId', 'JoinType', 'RequestComplete', 'items', 'addApi', 'updateApi', 'deleteApi']) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') problems.push(`${key}含已有配置，须先确认来源引用迁移`)
    }
    const fields = this.#fields.rows.filter(item => item['dataModelId'] === this.options.modelId)
    const keys = new Set<string>()
    const sourceKeys = new Set<string>()
    for (const item of prepared.fields) {
      const key = JSON.stringify([item.type, item.Name])
      if (sourceKeys.has(key)) problems.push(`来源字段不唯一：${item.Name}`)
      sourceKeys.add(key)
    }
    const used = new Set<string>()
    for (const item of fields) {
      const name = String(item['Name']), type = item['type'], key = JSON.stringify([type, item['Name']])
      const computed = type === 'dataModel' && item['FieldType'] === '计算字段'
      const removable = !computed && ['dataModel', 'inputParams'].includes(String(type)) && new Set<unknown>([0, 1, '0', '1', false, true]).has(item['IsPKey'])
        && typeof item['rowid'] === 'string' && !!item['rowid'] && this.#fields.getPkKey(item) === item['rowid']
        && typeof item['Name'] === 'string' && !!item['Name'].trim()
        && !prepared.fields.some(next => next.type === type && next.Name === name)
      if (removable) removalChoices.push({id: String(item['rowid']), name, removed: this.#removals.has(String(item['rowid']))})
      if (removable && this.#removals.has(String(item['rowid']))) {
        if (keys.has(key)) problems.push(`${name}：模型字段名称与用途不唯一`)
        keys.add(key); removals.push({id: String(item['rowid']), name, type: String(type)})
        differences.push({name, result: '明确移除旧字段定义；提交前核验引用与权限'})
        continue
      }
      const sourceName = this.#mappings.get(String(item['rowid'])) ?? name
      const candidates = prepared.fields.filter(next => next.type === type && next.Name === sourceName)
      const next = candidates[0]
      let result = '保留原记录、输出别名和配置'
      if (keys.has(key)) result = '模型字段名称与用途不唯一'
      else if (computed) {
        if (typeof item['rowid'] !== 'string' || !item['rowid'] || this.#fields.getPkKey(item) !== item['rowid']
          || typeof item['Name'] !== 'string' || !item['Name'].trim()) result = '计算字段身份或名称无效'
        else if (candidates.length) result = '来源字段与保留的计算字段重名'
      }
      else if (!['dataModel', 'inputParams'].includes(String(type)) || item['FieldType'] === '计算字段') result = '派生或处理字段须先确认来源引用'
      else if (candidates.length !== 1 || !next) result = '来源字段缺失或不唯一'
      else if (!new Set<unknown>([0, 1, '0', '1', false, true]).has(item['IsPKey'])) result = '原字段主键标记无效'
      else if (type === 'inputParams' && (item['FieldType'] !== next.FieldType || Number(item['IsPKey']) !== next.IsPKey)) result = '来源入参类型或主键合同变化，须先明确取值转换'
      else if (type === 'dataModel') this.assessFieldContract(item, next, {contractChanges, problems})
      const sourceKey = JSON.stringify([type, sourceName])
      if (sourceName !== name && type === 'dataModel') {
        const configured = (value: unknown) => value !== undefined && value !== null && value !== ''
        if (this.#models.rows.some(model => model['rowid'] !== this.options.modelId
            && ['RequestComplete', 'JoinFilter', 'ForeignKeyFields', 'PId', 'JoinType'].some(property => configured(model[property])))) problems.push(`${name}：存在未解析的跨模型表达式，须先确认来源字段引用`)
      }
      if (!computed) {
        if (used.has(sourceKey)) result = '同一来源字段不能映射到多个记录'
        used.add(sourceKey)
      }
      const outputName = typeof item['AsName'] === 'string' && item['AsName'].trim() ? item['AsName'].trim() : name.trim()
      if (['dataModel', 'inputParams'].includes(String(type)) && item['FieldType'] !== '计算字段') fieldChoices.push({id: String(item['rowid']), name, outputName, sourceName,
        candidates: prepared.fields.filter(candidate => candidate.type === type && (type === 'dataModel'
          || candidate.FieldType === item['FieldType'] && candidate.IsPKey === Number(item['IsPKey']))).map(candidate => candidate.Name)})
      keys.add(key); differences.push({name, result})
      if (result !== '保留原记录、输出别名和配置') problems.push(`${name}：${result}`)
      else if (computed) differences[differences.length - 1] = {name, result: '保留计算字段及配置；取值引用按原合同核验'}
      else if (sourceName !== name) differences[differences.length - 1] = {name, result: `来源改为 ${sourceName}；保留记录ID及输出名 ${outputName}`}
    }
    for (const item of prepared.fields) if (!used.has(JSON.stringify([item.type, item.Name]))) {
      const included = this.#included.has(item.Name)
      if (item.type === 'inputParams') {
        this.assessInput(item.Name, {inputChoices, differences, problems})
        continue
      }
      const result = item.IsPKey === 1 ? included ? '引入主键并参与输出' : '来源新增主键，须明确引入或映射' : included ? '引入为输出字段' : '来源新增字段，未引入模型'
      differences.push({name: item.Name, result})
      if (item.IsPKey === 1 && !included) problems.push(`${item.Name}：${result}`)
      additions.push({sourceName: item.Name, included})
    }
    const modelChanges: Preview['modelChanges'] = []
    if (fieldChoices.some(choice => choice.name !== choice.sourceName && fields.some(item => item['rowid'] === choice.id && item['type'] === 'dataModel'))) {
      // 来源字段配置与结果输出名不同；hasChildField/topValue均不作为字段引用。
      for (const property of ['parentField', 'PrimaryKeyFields']) {
        const before = row[property]
        if (before === undefined || before === null || before === '') continue
        if (typeof before !== 'string') {problems.push(`${property}字段引用不是文本，原值保留`); continue}
        const tokens = property === 'PrimaryKeyFields' ? before.split(',') : [before]
        const names = new Set<string>()
        const after = tokens.map(token => {
          const name = token.trim(), matches = fields.filter(item => item['type'] === 'dataModel' && item['Name'] === name)
          const current = matches[0]
          if (!name || names.has(name) || matches.length !== 1 || !current) {
            problems.push(`${property}字段引用未唯一解析：${name || '空字段'}`); return token
          }
          names.add(name)
          const choice = fieldChoices.find(item => item.id === current['rowid'])
          return choice && choice.name !== choice.sourceName ? token.slice(0, token.indexOf(name)) + choice.sourceName + token.slice(token.indexOf(name) + name.length) : token
        }).join(property === 'PrimaryKeyFields' ? ',' : '')
        if (after !== before) modelChanges.push({property, before, after})
      }
    }
    const mappings = fieldChoices.filter(choice => choice.name !== choice.sourceName && fields.some(field => field['rowid'] === choice.id && field['type'] === 'dataModel'))
      .map(choice => ({modelId: this.options.modelId, name: choice.name, sourceName: choice.sourceName}))
    let expressionChanges: Preview['expressionChanges'] = [], relationChanges: Preview['relationChanges'] = []
    let fieldExpressionChanges: Preview['fieldExpressionChanges'] = []
    try {
      fieldExpressionChanges = LowcodeDataSpaceFieldMigration.prepare({modelId: this.options.modelId,
        models: this.#models.rows.map(model => model['rowid'] === this.options.modelId ? {...model, Type: prepared.model.Type} : model),
        fields: this.#fields.rows.filter(field => !removals.some(item => item.id === field['rowid'])), mappings})
    } catch (error) {problems.push(error instanceof Error ? error.message : String(error))}
    try {
      expressionChanges = LowcodeDataSpaceModelMigration.prepare({modelId: this.options.modelId,
        models: this.#models.rows, fields: this.#fields.rows, mappings})
    } catch (error) {problems.push(error instanceof Error ? error.message : String(error))}
    try {
      relationChanges = LowcodeDataSpaceRelationMigration.prepare({relations: this.#relations.rows, models: this.#models.rows, fields: this.#fields.rows,
        mappings})
    } catch (error) {problems.push(error instanceof Error ? error.message : String(error))}
    const preview: Preview = {operation: 'replace', removals, removalChoices, inputChoices, inputParams: [], parameterWarning: '', contractChanges, viewChanges: this.#contractPlan?.viewChanges ?? [], name: row['Name'], prepared: structuredClone(prepared), differences, problems, fieldChoices, additions, relationChanges, modelChanges, expressionChanges, fieldExpressionChanges}
    if (this.needsSourceContract(preview)) {
      try {this.projectSourceModel(preview)} catch (error) {preview.problems.push(error instanceof Error ? error.message : String(error))}
    }
    this.readInputParameters(preview)
    return preview
  }

  private assessFieldContract(row: DataRow, source: Prepared['fields'][number], preview: Pick<Preview, 'contractChanges' | 'problems'>): string | undefined {
    const patch: Record<string, unknown> = {}
    if (typeof row['FieldType'] !== 'string' || row['FieldType'].toLowerCase() !== source.FieldType.toLowerCase()) patch['FieldType'] = source.FieldType
    if (Number(row['IsPKey']) !== source.IsPKey) patch['IsPKey'] = source.IsPKey
    if (!Object.keys(patch).length) return undefined
    if (source.IsPKey === 1 && Number(row['IsOutput']) !== 1) patch['IsOutput'] = 1
    const accepted = this.#acceptedContracts.has(String(row['rowid'])), name = String(row['Name'])
    preview.contractChanges.push({id: String(row['rowid']), name,
      before: `类型 ${String(row['FieldType'])}；主键 ${String(row['IsPKey'])}`,
      after: `类型 ${source.FieldType}；主键 ${source.IsPKey}${patch['IsOutput'] === 1 ? '；参与输出' : ''}`, accepted, patch})
    const result = `来源类型或主键合同已变化，${accepted ? '已确认迁移' : '请先处理'}（类型 ${String(row['FieldType'])} → ${source.FieldType}；主键 ${String(row['IsPKey'])} → ${source.IsPKey}）`
    if (!accepted) preview.problems.push(`${name}：${result}`)
    return result
  }

  private assessInput(sourceName: string, preview: Pick<Preview, 'inputChoices' | 'differences' | 'problems'>): void {
    const value = this.#inputs.get(sourceName) ?? ''
    preview.inputChoices.push({sourceName, value})
    try {
      if (!value) throw new Error('新增来源入参须明确配置空间参数引用或JSON常量')
      LowcodeDataSpaceSourceInputEdit.validateValue(this.dataSet, this.targetId, sourceName, value)
      preview.differences.push({name: sourceName, result: '新增来源入参；使用明确配置的取值'})
    } catch (error) {
      const result = error instanceof Error ? error.message : String(error)
      preview.differences.push({name: sourceName, result}); preview.problems.push(`${sourceName}：${result}`)
    }
  }

  private readInputParameters(preview: Preview): void {
    if (preview.inputChoices.length) try {preview.inputParams = LowcodeDataSpaceSourceInputEdit.readParameters(this.dataSet, this.targetId)}
    catch (error) {preview.parameterWarning = error instanceof Error ? error.message : String(error)}
  }

  private assessSynchronization(prepared: Prepared): Preview {
    const model = this.current(), fields = this.#fields.rows.filter(row => row['dataModelId'] === this.options.modelId)
    const preview: Preview = {operation: 'synchronize', name: String(model['Name']), prepared: structuredClone(prepared),
      differences: [], problems: [], fieldChoices: [], additions: [], removals: [], removalChoices: [], inputChoices: [], inputParams: [], parameterWarning: '', contractChanges: [], viewChanges: this.#contractPlan?.viewChanges ?? [], relationChanges: [], modelChanges: [], expressionChanges: [], fieldExpressionChanges: []}
    const key = (row: DataRow) => JSON.stringify([row['type'], row['Name']])
    if (new Set(fields.map(key)).size !== fields.length || new Set(prepared.fields.map(key)).size !== prepared.fields.length) {
      preview.problems.push('字段名称与用途不唯一，不能同步')
    }
    for (const row of fields) {
      const name = String(row['Name']), source = prepared.fields.find(item => key(item) === key(row))
      if (!['dataModel', 'inputParams'].includes(String(row['type'])) || row['FieldType'] === '计算字段') {
        if (source) preview.problems.push(`${name}：来源字段与保留的派生字段重名`)
        preview.differences.push({name, result: '保留派生字段及配置'}); continue
      }
      if (source) {
        const result = this.assessFieldContract(row, source, preview) ?? '保留原记录、输出和全部配置'
        preview.differences.push({name, result})
      } else {
        preview.removals.push({id: String(row['rowid']), name, type: String(row['type'])})
        preview.differences.push({name, result: '来源已不存在，确认后删除此字段定义'})
      }
    }
    for (const row of prepared.fields) if (!fields.some(item => key(item) === key(row))) {
      preview.additions.push({sourceName: row.Name, included: true})
      if (row.type === 'inputParams') this.assessInput(row.Name, preview)
      else preview.differences.push({name: row.Name, result: `新增来源字段；${row.IsPKey === 1 ? '作为主键并参与输出' : row.IsOutput === 1 ? '参与输出' : '不输出'}`})
    }
    if (this.needsSourceContract(preview)) {
      try {this.projectSourceModel(preview)} catch (error) {preview.problems.push(error instanceof Error ? error.message : String(error))}
    }
    this.readInputParameters(preview)
    return preview
  }

  private needsSourceContract(preview: Preview): boolean {
    return preview.operation === 'replace' || preview.contractChanges.length > 0
      || this.sourceAdditions(preview).some(row => row.type === 'dataModel')
      || preview.removals.some(item => item.type === 'dataModel')
  }

  private sourceAdditions(preview: Preview): Prepared['fields'] {
    return preview.prepared.fields.filter(field => preview.operation === 'synchronize'
      ? !this.#fields.rows.some(item => item['dataModelId'] === this.options.modelId && item['type'] === field.type && item['Name'] === field.Name)
      : field.type === 'dataModel' ? preview.additions.some(item => item.sourceName === field.Name && item.included)
        : preview.inputChoices.some(item => item.sourceName === field.Name))
  }

  private projectSourceModel(preview: Preview): ReturnType<typeof DataSpaceDesignApi.projectModel> {
    const model = this.current(), fields = this.#fields.rows.filter(row => row['dataModelId'] === this.options.modelId && row['type'] === 'dataModel')
    // 候选标识只用于完整定义校验；真正新增行由原DataView分配身份，不将此标识写入配置或数据库。
    const finalFields: DataRow[] = [...fields.filter(row => !preview.removals.some(item => item.id === row['rowid'])).map(row => {
      const choice = preview.fieldChoices.find(item => item.id === row['rowid']), expression = preview.fieldExpressionChanges.find(item => item.id === row['rowid'])
      return {...row, ...choice && choice.sourceName !== choice.name ? {Name: choice.sourceName,
        AsName: typeof row['AsName'] === 'string' && row['AsName'].trim() ? row['AsName'] : choice.outputName} : {},
        ...preview.contractChanges.find(change => change.id === row['rowid'])?.patch, ...expression ? {ValueFun: expression.after} : {}}
    }), ...this.sourceAdditions(preview).filter(row => row.type === 'dataModel').map((row, index) => ({...row, rowid: `new:${index}`, dataModelId: this.options.modelId,
      IsOutput: row.IsPKey === 1 || preview.operation === 'replace' ? 1 : row.IsOutput}))]
    const keys = finalFields.filter(row => Number(row['IsPKey']) === 1)
    if (keys.length > 1) throw new Error('来源存在多个主键，须先明确唯一主键合同')
    const key = String(keys[0]?.['Name'] ?? ''), declared = model['PrimaryKeyFields']
    const oldKeys = fields.filter(row => Number(row['IsPKey']) === 1)
    const changingKey = oldKeys.length !== keys.length || oldKeys.some(row => row['rowid'] !== keys[0]?.['rowid'])
    if (changingKey && fields.length > 0 && declared !== undefined && declared !== null && declared !== '') {
      if (typeof declared !== 'string' || fields.filter(row => Number(row['IsPKey']) === 1 && (row['Name'] === declared || row['AsName'] === declared)).length !== 1) throw new Error('原主键声明不能唯一对应旧来源键，请先核查')
      preview.modelChanges = preview.modelChanges.filter(change => change.property !== 'PrimaryKeyFields')
      if (declared !== key) preview.modelChanges.push({property: 'PrimaryKeyFields', before: declared, after: key})
    }
    const raw = {...model, ...preview.operation === 'replace' ? Object.fromEntries(LowcodeDataSpaceModelSourceEdit.sourceKeys.map(property => [property, preview.prepared.model[property]])) : {},
      ...Object.fromEntries([...preview.modelChanges, ...preview.expressionChanges.filter(change => change.id === this.options.modelId)].map(change => [change.property, change.after]))}
    const candidate = DataSpaceDesignApi.projectModel(raw, finalFields,
      preview.prepared.source.type === 'table' ? key : '')
    DataSpaceDesignApi.resolveFields(candidate)
    return candidate
  }

  private projectSourceContract(preview: Preview): SourceContractChange {
    const model = {...this.current()}, fields = this.#fields.rows
      .filter(row => row['dataModelId'] === this.options.modelId && row['type'] === 'dataModel').map(row => ({...row}))
    return {previous: () => fields.length ? DataSpaceDesignApi.projectModel(model, fields, ['数据库表', '表', 'table'].includes(String(model['Type']))
      ? String(fields.find(row => Number(row['IsPKey']) === 1)?.['Name'] ?? '') : '') : null, after: this.projectSourceModel(preview)}
  }

  /** 确认已有字段的来源合同差异；取消或重新预览会清除确认，不改正式行。 */
  confirmFieldContract(input: Readonly<{fieldId: string; accepted: boolean}>): void {
    const preview = this.selected()
    if (!preview.contractChanges.some(change => change.id === input.fieldId)) throw new Error('字段不是当前来源的合同差异')
    if (input.accepted) this.#acceptedContracts.add(input.fieldId)
    else this.#acceptedContracts.delete(input.fieldId)
    this.#preview = this.reassess(preview)
  }

  private reassess(preview: Preview): Preview {
    const result = preview.operation === 'synchronize' ? this.assessSynchronization(preview.prepared) : this.assess(preview.prepared)
    if (this.needsSourceContract(result) && !this.#contractPlan) result.problems.push('命名视图合同尚未通过检查，请重新预览并处理诊断')
    return result
  }

  private async prepareContract(preview: Preview, generation: number, baseline: string): Promise<boolean> {
    this.#contractPlan = null; preview.viewChanges = []
    if (this.needsSourceContract(preview)) {
      try {
        if (!this.options.prepareContract) throw new Error('缺少来源字段合同的命名视图迁移检查')
        const plan = await this.options.prepareContract(this.projectSourceContract(preview))
        if (generation !== this.#generation) return false
        this.assertClean()
        if (this.snapshot() !== baseline) throw new Error('读取视图合同期间定义已变化，请重新预览')
        this.#contractPlan = plan; preview.viewChanges = plan.viewChanges
      } catch (error) {preview.problems.push(error instanceof Error ? error.message : String(error))}
    }
    if (generation !== this.#generation) return false
    this.assertClean()
    if (this.snapshot() !== baseline) throw new Error('读取视图合同期间定义已变化，请重新预览')
    return true
  }

  private async refreshMapping(preview: Preview): Promise<void> {
    const generation = ++this.#generation
    this.#status = 'previewing'; this.#contractPlan = null
    try {
      const result = this.assess(preview.prepared)
      if (await this.prepareContract(result, generation, this.#baseline)) {this.#preview = result; this.#status = 'ready'}
    } catch (error) {if (generation === this.#generation) this.#status = 'idle'; throw error}
  }

  /**
   * 精确定位当前绑定来源，以独立所属字段视图预览增删；不修改正式记录或已有草稿。
   * @throws 来源身份缺失、重名、权限不足或读取期间定义变化时拒绝，不按名称回退其他数据库/提供方。
   */
  async previewBoundSource(): Promise<void> {
    this.available(); this.selectViews(true)
    const generation = ++this.#generation
    this.#status = 'previewing'; this.#preview = null; this.#mappings.clear(); this.#included.clear(); this.#removals.clear(); this.#inputs.clear(); this.#acceptedContracts.clear(); this.#contractPlan = null
    try {
      await this.#fields.refresh()
      this.assertClean()
      if (generation !== this.#generation) return
      const model = this.current(), baseline = this.snapshot()
      const type = LowcodeDataSpaceSourceCatalog.types.find(item => item.label === model['Type'])?.value
      if (!type || typeof model['MetaName'] !== 'string' || !model['MetaName'] || typeof model['DbId'] !== 'string' || !model['DbId']) throw new Error('已绑定来源类型、名称或身份不完整')
      const matches: Array<Parameters<Reader['prepare']>[0]> = [], seen = new Set<string>()
      let read = 0, total = 0
      for (let page = 1; page <= 500; page++) {
        const result = await this.options.sources.query({type, keyword: model['MetaName'], page, pageSize: 100}, this.dataSet)
        this.assertClean()
        if (generation !== this.#generation) return
        if (this.snapshot() !== baseline) throw new Error('读取来源期间定义已变化，请重新预览')
        if (!Number.isSafeInteger(result.total) || result.total < 0 || page > 1 && result.total !== total) throw new Error('来源目录分页范围已变化')
        total = result.total
        for (const row of result.rows) {
          if (seen.has(row.id)) throw new Error('来源目录身份重复')
          seen.add(row.id)
          const id = type === 'table' || type === 'databaseView' ? row.dbid : type === 'interface' ? row.providerId : row.id
          if (row.type === type && row.name === model['MetaName'] && id === model['DbId']) matches.push(row)
        }
        read += result.rows.length
        if (read >= total) break
        if (!result.rows.length) throw new Error('来源目录未完整读取')
      }
      if (read !== total || matches.length !== 1 || !matches[0]) throw new Error('已绑定来源不存在、不唯一或未完整读取')
      const prepared = await this.options.sources.prepare(matches[0], this.dataSet)
      this.assertClean()
      if (generation !== this.#generation) return
      if (this.snapshot() !== baseline) throw new Error('读取来源期间定义已变化，请重新预览')
      const preview = this.assessSynchronization(prepared)
      if (!await this.prepareContract(preview, generation, baseline)) return
      this.#baseline = baseline; this.#preview = preview; this.#status = 'ready'
    } catch (error) {if (generation === this.#generation) this.#status = 'idle'; throw error}
  }

  private selected(): Preview {
    this.available(); this.assertClean()
    if (this.#status !== 'ready' || !this.#preview || this.snapshot() !== this.#baseline) throw new Error('元数据已变化，请重新预览')
    return this.#preview
  }

  /** 显式映射同用途来源，保留记录和输出名；等待视图合同预览，类型/主键差异另行确认。 */
  async mapField(input: Readonly<{fieldId: string; sourceName: string}>): Promise<void> {
    const preview = this.selected(), choice = preview.fieldChoices.find(item => item.id === input.fieldId)
    if (preview.operation !== 'replace') throw new Error('同步当前来源不修改字段映射')
    if (!choice?.candidates.includes(input.sourceName)) throw new Error('来源字段须与原字段用途一致，入参还须保持类型及主键合同')
    this.#acceptedContracts.delete(input.fieldId)
    this.#mappings.set(input.fieldId, input.sourceName); this.#included.delete(input.sourceName)
    await this.refreshMapping(preview)
  }

  /** 显式引入尚未绑定的来源字段，等待候选模型/视图合同预览；不自动新增入参。 */
  async includeField(input: Readonly<{sourceName: string; included: boolean}>): Promise<void> {
    const preview = this.selected()
    if (preview.operation !== 'replace') throw new Error('同步按完整来源字段生成差异')
    if (!preview.additions.some(item => item.sourceName === input.sourceName)) throw new Error('字段不是当前可引入来源')
    if (input.included) this.#included.add(input.sourceName); else this.#included.delete(input.sourceName)
    await this.refreshMapping(preview)
  }

  /** 显式移除来源已不存在的普通定义，等待候选合同预览；删除仍经原引用检查与DataSet提交。 */
  async removeField(input: Readonly<{fieldId: string; removed: boolean}>): Promise<void> {
    const preview = this.selected()
    if (preview.operation !== 'replace' || !preview.removalChoices.some(item => item.id === input.fieldId)) throw new Error('只能显式移除来源已消失的普通字段')
    this.#acceptedContracts.delete(input.fieldId)
    if (input.removed) {this.#removals.add(input.fieldId); this.#mappings.delete(input.fieldId)}
    else this.#removals.delete(input.fieldId)
    await this.refreshMapping(preview)
  }

  /** 新来源参数必须明确配置，使用已有来源入参合同，不自动迁移旧值。 */
  configureInput(input: Readonly<{sourceName: string; value: string}>): void {
    const preview = this.selected()
    if (!preview.inputChoices.some(item => item.sourceName === input.sourceName)) throw new Error('参数不是当前新增来源入参')
    LowcodeDataSpaceSourceInputEdit.validateValue(this.dataSet, this.targetId, input.sourceName, input.value)
    this.#inputs.set(input.sourceName, input.value)
    this.#preview = this.reassess(preview)
  }

  /** 返回不含正式记录/授权的候选及流程状态，供预览与关闭保护。 */
  getState() {return {status: this.#status, pending: this.#status !== 'idle', preview: structuredClone(this.#preview), verification: structuredClone(this.#verification)}}

  /** 比较完整原元数据与候选来源，尚不改变记录。 */
  async preview(source: Parameters<Reader['prepare']>[0]): Promise<void> {
    this.available(); this.selectViews(false)
    const generation = ++this.#generation
    this.#status = 'previewing'; this.#preview = null; this.#mappings.clear(); this.#included.clear(); this.#removals.clear(); this.#inputs.clear(); this.#acceptedContracts.clear(); this.#contractPlan = null
    try {
      for (const view of [this.#fields, this.#relations]) {
        const result = await view.loadFromServer()
        this.assertClean(false, true)
        if (generation !== this.#generation) return
        if (!result.success) throw new Error('来源替换依赖读取失败')
      }
      this.assertClean()
      const baseline = this.snapshot()
      const prepared = await this.options.sources.prepare(source, this.dataSet)
      this.assertClean()
      if (generation !== this.#generation) return
      if (this.snapshot() !== baseline) throw new Error('读取来源期间定义已变化，请重新预览')
      const preview = this.assess(prepared)
      if (!await this.prepareContract(preview, generation, baseline)) return
      this.#baseline = baseline; this.#preview = preview; this.#status = 'ready'
    } catch (error) {if (generation === this.#generation) this.#status = 'idle'; throw error}
  }

  /** 放弃尚未派发的来源选择。 */
  discard(): void {this.available(); this.#generation++; this.finish()}

  private async reload(): Promise<void> {
    this.assertClean(false, true)
    for (const view of this.#views) {
      const loaded = await view.loadFromServer({allPages: true, maxRows: 50000})
      this.assertClean(false, true)
      if (!loaded.success || view.loadingError) throw new Error('来源替换元数据回读失败')
    }
    this.assertClean()
  }

  private fieldRow(id: string): DataRow {
    const rows = this.#fields.rows.filter(row => this.#fields.getPkKey(row) === id && row['dataModelId'] === this.options.modelId)
    if (rows.length !== 1 || !rows[0]) throw new Error('字段身份不存在或不唯一')
    return rows[0]
  }

  private relationRow(id: string): DataRow {
    const rows = this.#relations.rows.filter(row => this.#relations.getPkKey(row) === id)
    if (rows.length !== 1 || !rows[0]) throw new Error('关系身份不存在或不唯一')
    return rows[0]
  }

  private async stageAddition(values: Record<string, unknown>): Promise<void> {
    const before = new Set(this.#fields.dirtyTracking.pendingCreateIds)
    try {await this.#fields.addRow(values)} finally {
      const rows = this.#fields.dirtyTracking.pendingCreateRows.filter(row => !before.has(this.#fields.getPkKey(row) ?? ''))
      const row = rows[0], id = row && this.#fields.getPkKey(row)
      if (rows.length === 1 && row && typeof id === 'string' && row['rowid'] === id && Object.entries(values).every(([key, value]) => Object.is(row[key], value))) {
        this.#added.push({id, values, snapshot: JSON.stringify(row)})
      }
    }
    if (this.#added.at(-1)?.values !== values) throw new Error('新增字段未获得唯一正式身份，请处理原视图草稿')
  }

  /** 重新核对来源、映射及权限，提交原元数据视图的明确delta；各表分别核验结果。 */
  async save(): Promise<string> {
    this.available(); this.assertClean()
    const candidate = this.#preview
    if (this.#status !== 'ready' || !candidate) throw new Error('请先预览来源')
    if (candidate.problems.length) throw new Error(candidate.problems.join('；'))
    if (this.snapshot() !== this.#baseline) throw new Error('元数据已变化，请重新预览')
    this.#status = 'saving'; this.#fieldEdits = []; this.#relationEdits = []; this.#modelEdits = []; this.#added = []; this.#removed = []; this.#pendingSnapshot = ''; this.#patch = {}
    let dispatched = false, confirmed = false
    try {
      const prepared = await this.options.sources.prepare(candidate.prepared.source, this.dataSet)
      await this.reload()
      if (JSON.stringify(prepared) !== JSON.stringify(candidate.prepared) || this.snapshot() !== this.#baseline) throw new Error('来源或元数据已变化，请重新预览')
      const row = this.current()
      const patch = candidate.operation === 'synchronize' ? {} : Object.fromEntries(LowcodeDataSpaceModelSourceEdit.sourceKeys.filter(key => row[key] !== prepared.model[key]).map(key => [key, prepared.model[key]]))
      for (const change of candidate.modelChanges) patch[change.property] = change.after
      for (const change of candidate.expressionChanges) {
        if (change.id === this.options.modelId) {patch[change.property] = change.after; continue}
        let item = this.#modelEdits.find(edit => edit.id === change.id)
        if (!item) {item = {id: change.id, patch: {}, snapshot: ''}; this.#modelEdits.push(item)}
        item.patch[change.property] = change.after
      }
      for (const choice of candidate.fieldChoices) {
        if (choice.sourceName === choice.name) continue
        const field = this.fieldRow(choice.id)
        this.#fieldEdits.push({id: choice.id, patch: {Name: choice.sourceName,
          ...(field['type'] === 'dataModel' && !(typeof field['AsName'] === 'string' && field['AsName'].trim()) ? {AsName: choice.outputName} : {})}, snapshot: ''})
      }
      for (const change of candidate.contractChanges) {
        const edit = this.#fieldEdits.find(item => item.id === change.id)
        if (edit) Object.assign(edit.patch, change.patch)
        else this.#fieldEdits.push({id: change.id, patch: {...change.patch}, snapshot: ''})
      }
      for (const change of candidate.fieldExpressionChanges) {
        let edit = this.#fieldEdits.find(item => item.id === change.id)
        if (!edit) {edit = {id: change.id, patch: {}, snapshot: ''}; this.#fieldEdits.push(edit)}
        edit.patch['ValueFun'] = change.after
      }
      const additions = this.sourceAdditions(candidate)
      this.#removed = candidate.removals.map(item => ({id: item.id, row: {...this.fieldRow(item.id)}}))
      this.#relationEdits = candidate.relationChanges.map(item => ({id: item.id, patch: {filter: item.after}, snapshot: ''}))
      if (!Object.keys(patch).length && !this.#modelEdits.length && !this.#fieldEdits.length && !additions.length && !this.#removed.length) {this.finish(); return this.options.modelId}
      const assertConfiguration = !this.#contractPlan && (this.#fieldEdits.length || additions.length)
        ? await this.options.validateConfiguration() : () => {}
      let assertTransition = () => {}
      let assertContract = () => {}
      if (this.needsSourceContract(candidate)) {
        if (!this.#contractPlan) throw new Error('缺少已核验的命名视图迁移计划')
        await this.#contractPlan.assertCurrent(); assertContract = this.#contractPlan.check
      }
      if (row['Type'] !== prepared.model.Type) {
        if (!this.options.validateTransition) throw new Error('缺少来源类型变化的视图合同检查')
        assertTransition = await this.options.validateTransition(prepared.model)
      }
      let assertRemovals = () => {}
      if (this.#removed.length) {
        if (!this.options.validateRemovals) throw new Error('缺少字段删除引用检查，不能同步')
        assertRemovals = await this.options.validateRemovals(this.#removed.map(item => item.id),
          this.needsSourceContract(candidate) ? this.projectSourceContract(candidate) : undefined)
      }
      this.assertClean()
      if (this.snapshot() !== this.#baseline) throw new Error('元数据已变化，请重新预览')
      const assertWritable = () => {
        this.assertOwner(); assertConfiguration(); assertTransition(); assertContract(); assertRemovals()
        for (const input of candidate.inputChoices) LowcodeDataSpaceSourceInputEdit.validateValue(this.dataSet, this.targetId, input.sourceName, input.value)
        if (Object.keys(patch).length && (this.#models.editActionState(this.current()) !== 'enabled' || Object.keys(patch).some(key => this.#models.fieldAccess(this.current(), key).write !== 'allowed'))) throw new Error('当前查询不允许修改来源字段')
        for (const item of this.#modelEdits) if (this.#models.editActionState(this.current(item.id)) !== 'enabled'
          || Object.keys(item.patch).some(key => this.#models.fieldAccess(this.current(item.id), key).write !== 'allowed')) throw new Error(`当前查询不允许修改依赖模型${item.id}的表达式`)
        if (additions.length && this.#fields.addActionState() !== 'enabled') throw new Error('当前查询不允许新增字段')
        for (const item of this.#removed) if (this.#fields.deleteActionState(item.row) !== 'enabled') throw new Error(`当前查询不允许删除字段：${String(item.row['Name'])}`)
        for (const item of this.#fieldEdits) if (this.#fields.editActionState(this.fieldRow(item.id)) !== 'enabled'
          || Object.keys(item.patch).some(key => this.#fields.fieldAccess(this.fieldRow(item.id), key).write !== 'allowed')) throw new Error('当前查询不允许修改映射字段')
        for (const item of this.#relationEdits) if (this.#relations.editActionState(this.relationRow(item.id)) !== 'enabled'
          || this.#relations.fieldAccess(this.relationRow(item.id), 'filter').write !== 'allowed') throw new Error('当前查询不允许修改关系表达式')
      }
      assertWritable(); this.#expected = this.snapshot(patch, true); this.#patch = patch
      if (Object.keys(patch).length) {
        for (const [key, value] of Object.entries(patch)) this.#models.updateEditingValue(this.options.modelId, key, value)
        const applied = await this.#models.applyEditingRows([this.options.modelId]).finally(() => {
          if (Object.entries(patch).every(([key, value]) => Object.is(this.current()[key], value))) this.#pendingSnapshot = JSON.stringify(this.current())
        })
        if (!applied.success || applied.data?.appliedCount !== 1 || applied.data.failedCount !== 0) throw new Error('来源修改尚未应用')
      }
      for (const item of this.#modelEdits) {
        this.assertClean(true); assertWritable()
        if (this.#models.hasEditingChanges(item.id) || this.#models.dirtyTracking.hasPendingChanges(item.id)) throw new Error('依赖模型存在其他草稿，不能覆盖')
        for (const [key, value] of Object.entries(item.patch)) this.#models.updateEditingValue(item.id, key, value)
        const applied = await this.#models.applyEditingRows([item.id]).finally(() => {
          if (Object.entries(item.patch).every(([key, value]) => Object.is(this.current(item.id)[key], value))) item.snapshot = JSON.stringify(this.current(item.id))
        })
        if (!applied.success || applied.data?.appliedCount !== 1 || applied.data.failedCount !== 0) throw new Error('依赖模型表达式尚未应用')
      }
      for (const item of this.#fieldEdits) {
        this.assertClean(true); assertWritable()
        if (this.#fields.hasEditingChanges(item.id) || this.#fields.dirtyTracking.hasPendingChanges(item.id)) throw new Error('字段存在其他草稿，不能覆盖')
        for (const [key, value] of Object.entries(item.patch)) this.#fields.updateEditingValue(item.id, key, value)
        const applied = await this.#fields.applyEditingRows([item.id]).finally(() => {
          if (Object.entries(item.patch).every(([key, value]) => Object.is(this.fieldRow(item.id)[key], value))) item.snapshot = JSON.stringify(this.fieldRow(item.id))
        })
        if (!applied.success || applied.data?.appliedCount !== 1 || applied.data.failedCount !== 0) throw new Error('字段映射尚未应用')
      }
      for (const field of additions) {
        this.assertClean(true); assertWritable()
        const input = field.type === 'inputParams' ? candidate.inputChoices.find(item => item.sourceName === field.Name) : undefined
        await this.stageAddition({...field, ...input ? {ValueFun: input.value} : {},
          IsOutput: field.type === 'inputParams' ? 0 : field.IsPKey === 1 ? 1 : candidate.operation === 'synchronize' ? field.IsOutput : 1, dataSetId: this.targetId, dataModelId: this.options.modelId})
      }
      for (const item of this.#relationEdits) {
        this.assertClean(true); assertWritable()
        if (this.#relations.hasEditingChanges(item.id) || this.#relations.dirtyTracking.hasPendingChanges(item.id)) throw new Error('关系存在其他草稿，不能覆盖')
        this.#relations.updateEditingValue(item.id, 'filter', item.patch['filter'])
        const applied = await this.#relations.applyEditingRows([item.id]).finally(() => {
          if (this.relationRow(item.id)['filter'] === item.patch['filter']) item.snapshot = JSON.stringify(this.relationRow(item.id))
        })
        if (!applied.success || applied.data?.appliedCount !== 1 || applied.data.failedCount !== 0) throw new Error('关系迁移尚未应用')
      }
      for (const item of this.#removed) {
        this.assertClean(true); assertWritable()
        if (JSON.stringify(this.fieldRow(item.id)) !== JSON.stringify(item.row) || await this.#fields.removeRow(item.id) !== true) throw new Error('待删除字段已变化或删除未暂存')
      }
      this.assertClean(true); assertWritable()
      if (this.#views.some(view => view.hasEditingChanges())) throw new Error('提交前出现新的元数据编辑，请保留并处理草稿')
      if (this.snapshot() !== this.#expected || this.#added.some(item => JSON.stringify(this.fieldRow(item.id)) !== item.snapshot)) throw new Error('提交前元数据已变化')
      const selections = [{view: this.#models, changed: [...Object.keys(patch).length ? [this.options.modelId] : [], ...this.#modelEdits.map(item => item.id)], added: new Array<string>(), removed: new Array<string>()},
        {view: this.#fields, changed: this.#fieldEdits.map(item => item.id), added: this.#added.map(item => item.id), removed: this.#removed.map(item => item.id)},
        {view: this.#relations, changed: this.#relationEdits.map(item => item.id), added: new Array<string>(), removed: new Array<string>()}].filter(item => item.changed.length || item.added.length || item.removed.length)
      await this.#contractPlan?.assertCurrent()
      this.assertClean(true); assertWritable()
      if (this.#views.some(view => view.hasEditingChanges()) || this.snapshot() !== this.#expected
        || this.#added.some(item => JSON.stringify(this.fieldRow(item.id)) !== item.snapshot)) throw new Error('核对配置期间元数据草稿已变化，不能派发')
      this.options.onDispatch(); dispatched = true
      const saved = await this.dataSet.saveChanges({applyEditingRows: false, views: selections.map(item => ({tableName: item.view.tableName, viewId: item.view.viewId, ids: [...item.changed, ...item.added, ...item.removed]}))})
      this.assertOwner()
      if (!saved.success || saved.data?.failedEditingRows !== 0 || saved.data.viewResults.length !== selections.length || selections.some(item => {
        const results = saved.data?.viewResults.filter(result => result.tableName === item.view.tableName && result.viewId === item.view.viewId)
        const result = results?.[0]
        return results?.length !== 1 || result?.savedCount !== item.changed.length || result.createdCount !== item.added.length || result.deletedCount !== item.removed.length || result.failedCount !== 0
      })) throw new Error('来源或字段回执未确认全部目标，请核验')
      confirmed = true
      if (!await this.readback()) throw new Error('来源替换回读与预览不一致')
      if (this.#contractPlan) {this.#status = 'configuration'; await this.#contractPlan.complete(false)}
      this.finish(true); return this.options.modelId
    } catch (error) {
      if (this.#status !== 'configuration') this.#status = confirmed ? 'readback' : dispatched ? 'unknown' : 'unsubmitted'
      if (!dispatched && this.#views.every(view => !view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges())) this.#status = 'ready'
      throw error
    }
  }

  private async readback(): Promise<boolean> {
    await this.reload()
    this.#verifiedSnapshot = this.verificationSnapshot()
    const matched = this.snapshot() === this.#expected
    const additions = this.#added.map(item => {
      const rows = this.#fields.rows.filter(row => this.#fields.getPkKey(row) === item.id), row = rows[0]
      const result = !row ? '未读取到新增字段' : rows.length !== 1 ? '字段身份不唯一' : Object.entries(item.values).every(([key, value]) =>
        this.#fields.fieldAccess(row, key).read === 'visible' && Object.is(row[key], value)) ? '新增字段已一致' : '新增字段不可读或与预览不同'
      return {table: this.#fields.tableName, id: item.id, result}
    })
    this.#verification = [{table: this.#models.tableName, id: this.options.modelId, result: matched ? '模型、字段、关系及未变记录已一致' : '正式记录与预览不同，请处理差异'}, ...additions,
      ...this.#removed.map(item => ({table: this.#fields.tableName, id: item.id,
        result: this.#fields.rows.some(row => this.#fields.getPkKey(row) === item.id) ? '字段仍存在，删除未确认' : '字段定义删除已确认'})),
      ...this.#preview?.modelChanges.map(item => ({table: this.#models.tableName, id: `${this.options.modelId}.${item.property}`,
        result: this.current()[item.property] === item.after ? `${item.property}引用已一致` : `${item.property}引用与预览不同，请处理差异`})) ?? [],
      ...this.#preview?.expressionChanges.map(item => ({table: this.#models.tableName, id: `${item.id}.${item.property}`,
        result: this.#models.rows.find(row => this.#models.getPkKey(row) === item.id)?.[item.property] === item.after ? `${item.name}.${item.property}已一致` : `${item.name}.${item.property}与预览不同，请处理差异`})) ?? [],
      ...this.#preview?.fieldExpressionChanges.map(item => ({table: this.#fields.tableName, id: `${item.id}.ValueFun`,
        result: this.#fields.rows.find(row => this.#fields.getPkKey(row) === item.id)?.['ValueFun'] === item.after ? `${item.name}.ValueFun已一致` : `${item.name}.ValueFun与预览不同，请处理差异`})) ?? [],
      ...this.#relationEdits.map(item => ({table: this.#relations.tableName, id: item.id,
        result: this.#relations.rows.find(row => this.#relations.getPkKey(row) === item.id)?.['filter'] === item.patch['filter'] ? '关系表达式已一致' : '关系表达式与预览不同，请处理差异'}))]
    const confirmed = matched && additions.every(item => item.result === '新增字段已一致')
    if (confirmed) this.invalidateChangedSiblings()
    return confirmed
  }

  private invalidateChangedSiblings(adopting = false): void {
    const changed = [...adopting || this.#fieldEdits.length || this.#added.length || this.#removed.length ? [this.#fields] : [],
      ...adopting || this.#relationEdits.length ? [this.#relations] : []]
    const consumers: DataView[] = []
    for (const source of changed) source.dataTable?.forEachView(view => {
      if (view === source && this.#views.includes(source) || view.requestState === RequestState.Idle) return
      if (source === this.#fields) {
        const modelId = view.queryContext['modelId'], modelIds = view.queryContext['modelIds']
        const scoped = typeof modelId === 'string' && modelId ? [modelId] : Array.isArray(modelIds) ? modelIds : null
        if (scoped?.length && !scoped.includes(this.options.modelId)
          && !view.rows.some(row => row['dataModelId'] === this.options.modelId)) return
      }
      consumers.push(view)
    })
    // 先核完受影响消费者，避免后续视图存在草稿或在途查询时已清掉前面的视图。
    if (consumers.some(view => [RequestState.Preparing, RequestState.Loading].includes(view.requestState) || view.mutating
      || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw new Error('其他元数据草稿或查询尚未处理，不能废弃旧查询')
    for (const view of consumers) view.clearAll()
  }

  private verificationSnapshot(): string {return JSON.stringify([this.snapshot(), this.#added.map(item => this.#fields.rows.find(row => this.#fields.getPkKey(row) === item.id))])}

  private finish(updateConsumers = false): void {
    this.#status = 'idle'; this.#preview = null; this.#expected = ''; this.#pendingSnapshot = ''; this.#patch = {}; this.#verifiedSnapshot = ''; this.#verification = []; this.#fieldEdits = []; this.#relationEdits = []; this.#modelEdits = []; this.#added = []; this.#removed = []; this.#mappings.clear(); this.#included.clear(); this.#removals.clear(); this.#inputs.clear(); this.#acceptedContracts.clear(); this.#contractPlan = null
    if (updateConsumers) this.options.completed()
  }

  /** 仅放弃本操作未改变的delta并核验正式结果；不会重放写入。 */
  async verify(): Promise<Readonly<{confirmed: boolean; modelId: string | null}>> {
    this.assertOwner()
    if (this.#status === 'configuration' && this.#contractPlan) {
      if (!await this.readback()) throw new Error('数据库定义已变化，保留待确认的文件迁移；不会重复提交数据库')
      await this.#contractPlan.complete(true); this.finish(true)
      return {confirmed: true, modelId: this.options.modelId}
    }
    if (!['unknown', 'readback', 'unsubmitted', 'different'].includes(this.#status)) throw new Error('没有待核验来源替换或请求仍在进行')
    this.assertClean(true, true)
    const unsubmitted = this.#status === 'unsubmitted'
    if (this.#models.hasEditingChanges(this.options.modelId)) {
      const patch = this.#models.getEditingPatch(this.options.modelId) ?? {}
      if (!unsubmitted || Object.keys(patch).length !== Object.keys(this.#patch).length
        || Object.entries(patch).some(([key, value]) => !Object.is(this.#patch[key], value))) throw new Error('本次来源编辑已改变，不能自动放弃')
    }
    if (this.#models.dirtyTracking.hasPendingChanges(this.options.modelId)) {
      if (JSON.stringify(this.current()) !== this.#pendingSnapshot) throw new Error('本次来源草稿已改变，不能自动放弃')
    }
    for (const item of this.#modelEdits) {
      const patch = this.#models.getEditingPatch(item.id)
      if (patch && (!unsubmitted || Object.keys(patch).length !== Object.keys(item.patch).length
        || Object.entries(patch).some(([key, value]) => !Object.is(item.patch[key], value)))) throw new Error('依赖模型编辑已改变，不能自动放弃')
      if (this.#models.dirtyTracking.hasPendingChanges(item.id) && JSON.stringify(this.current(item.id)) !== item.snapshot) throw new Error('依赖模型草稿已改变，不能自动放弃')
    }
    for (const item of this.#fieldEdits) {
      const patch = this.#fields.getEditingPatch(item.id)
      if (patch && (!unsubmitted || Object.keys(patch).length !== Object.keys(item.patch).length
        || Object.entries(patch).some(([key, value]) => !Object.is(item.patch[key], value)))) throw new Error('字段映射编辑已改变，不能自动放弃')
      if (this.#fields.dirtyTracking.hasPendingChanges(item.id) && JSON.stringify(this.fieldRow(item.id)) !== item.snapshot) throw new Error('字段映射草稿已改变，不能自动放弃')
    }
    for (const item of this.#added) if (this.#fields.hasEditingChanges(item.id) || this.#fields.dirtyTracking.hasPendingChanges(item.id)
      && (!this.#fields.dirtyTracking.isPendingCreate(item.id) || JSON.stringify(this.fieldRow(item.id)) !== item.snapshot)) throw new Error('新增字段草稿已改变，不能自动放弃')
    for (const item of this.#removed) if (this.#fields.hasEditingChanges(item.id) || this.#fields.dirtyTracking.hasPendingChanges(item.id)
      && JSON.stringify(this.#fields.dirtyTracking.getPendingDeleteSnapshot(item.id)) !== JSON.stringify(item.row)) throw new Error('待删除字段草稿已改变，不能自动放弃')
    for (const item of this.#relationEdits) {
      const patch = this.#relations.getEditingPatch(item.id)
      if (patch && (!unsubmitted || Object.keys(patch).length !== 1 || patch['filter'] !== item.patch['filter'])) throw new Error('关系迁移编辑已改变，不能自动放弃')
      if (this.#relations.dirtyTracking.hasPendingChanges(item.id) && JSON.stringify(this.relationRow(item.id)) !== item.snapshot) throw new Error('关系迁移草稿已改变，不能自动放弃')
    }
    this.#models.discardPendingChanges([this.options.modelId, ...this.#modelEdits.map(item => item.id)])
    this.#fields.discardPendingChanges([...this.#fieldEdits, ...this.#added, ...this.#removed].map(item => item.id))
    this.#relations.discardPendingChanges(this.#relationEdits.map(item => item.id))
    this.#status = 'saving'
    try {
      if (unsubmitted) {this.#fieldEdits = []; this.#relationEdits = []; this.#modelEdits = []; this.#added = []; this.#removed = []; await this.reload(); this.#status = 'ready'; return {confirmed: false, modelId: null}}
      const confirmed = await this.readback()
      if (confirmed && this.#contractPlan) {this.#status = 'configuration'; await this.#contractPlan.complete(false)}
      if (confirmed) this.finish(true); else this.#status = 'different'
      return {confirmed, modelId: confirmed ? this.options.modelId : null}
    } catch (error) {if (this.#status !== 'configuration') this.#status = 'readback'; throw error}
  }

  /** 显式采用刚回读的正式状态；不补写，也不宣称原替换已成功。 */
  acceptCurrent(): void {
    this.assertClean()
    if (this.#status !== 'different' || this.#verifiedSnapshot !== this.verificationSnapshot()) throw new Error('请先核验当前正式结果')
    // 差异采用不证明原提交成功；正式结果可能含未计划的字段/关系变化，旧消费者须重查。
    this.invalidateChangedSiblings(true)
    this.finish(true)
  }
}
