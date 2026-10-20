/**
 * @module lowcode/data-space/model-source/source-edit/lowcode-data-space-model-source-edit-session
 * 职责：预览来源替换或当前来源字段同步，保留同名定义及派生字段配置（无独立命令类 FSM）。
 * 边界：正式记录归原DataView；删除须检查引用，来源合同变化须明确确认并校验最终模型。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {ModelCreateSources} from '../lowcode-data-space-model-create-session'
import {LowcodeDataSpaceRelationMigration} from '../lowcode-data-space-relation-migration'
import {LowcodeDataSpaceModelMigration} from '../lowcode-data-space-model-migration'
import {LowcodeDataSpaceFieldMigration} from '../lowcode-data-space-field-migration'
import {LowcodeDataSpaceSourceCatalog} from '../lowcode-data-space-source-catalog'
import {sourceInputReadParameters, sourceInputValidateValue} from '../source-input/lowcode-data-space-source-input-session'

/** 与新增模型共享的正式来源能力。 */
type Reader = NonNullable<ModelCreateSources>
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

export type ModelSourceEditStatus = 'idle' | 'previewing' | 'ready' | 'saving' | 'unknown' | 'readback' | 'unsubmitted' | 'different' | 'configuration'

const SOURCE_KEYS = ['Type', 'MetaName', 'DbId', 'DbName'] as const

export type ModelSourceEditLifecycle = Readonly<{
  validateConfiguration(): Promise<() => void>
  validateTransition?(model: Prepared['model']): Promise<() => void>
  prepareContract?(change: SourceContractChange): Promise<SourceContractPlan>
  validateRemovals?(ids: readonly string[], contract?: SourceContractChange): Promise<() => void>
  assertCurrent(): void
  onDispatch(): void
  completed(): void
}>

export type ModelSourceEditFlow = {
  status: ModelSourceEditStatus
  generation: number
  preview: Preview | null
  baseline: string
  expected: string
  pendingSnapshot: string
  patch: Record<string, unknown>
  verifiedSnapshot: string
  verification: Array<{table: string; id: string; result: string}>
  mappings: Map<string, string>
  included: Set<string>
  removals: Set<string>
  inputs: Map<string, string>
  acceptedContracts: Set<string>
  contractPlan: SourceContractPlan | null
  fieldEdits: FieldEdit[]
  relationEdits: FieldEdit[]
  modelEdits: FieldEdit[]
  added: FieldAddition[]
  removed: Array<{id: string; row: DataRow}>
}

export type ModelSourceEditHost = {
  readonly dataSet: DataSet
  readonly targetId: string
  readonly modelId: string
  readonly sources: Reader
  readonly lifecycle: ModelSourceEditLifecycle
  views: DataView[]
  models: DataView
  fields: DataView
  syncFields: DataView | undefined
  replacementFields: DataView | undefined
  relations: DataView
  replacementRelations: DataView | undefined
  contexts: string[]
  flow: ModelSourceEditFlow
}

function createModelSourceEditFlow(): ModelSourceEditFlow {
  return {
    status: 'idle', generation: 0, preview: null, baseline: '', expected: '', pendingSnapshot: '', patch: {},
    verifiedSnapshot: '', verification: [], mappings: new Map(), included: new Set(), removals: new Set(),
    inputs: new Map(), acceptedContracts: new Set(), contractPlan: null, fieldEdits: [], relationEdits: [],
    modelEdits: [], added: [], removed: [],
  }
}

export function createModelSourceEditHost(dataSet: DataSet, targetId: string, modelId: string, sources: Reader, lifecycle: ModelSourceEditLifecycle): ModelSourceEditHost {
  const views = ['Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'].map(name => {
    const view = dataSet.getView(name, 'default')
    if (!view) throw new Error(`缺少正式元数据视图：${name}`)
    return view
  })
  const [models, fields, relations] = views
  if (!models || !fields || !relations) throw new Error('正式元数据视图不完整')
  const host: ModelSourceEditHost = {
    dataSet, targetId, modelId, sources, lifecycle, views, models, fields, relations,
    syncFields: undefined, replacementFields: undefined, replacementRelations: undefined,
    contexts: views.map(view => JSON.stringify(view.queryContext)), flow: createModelSourceEditFlow(),
  }
  modelSourceEditAssertOwner(host)
  return host
}

function modelSourceEditAssertOwner(host: ModelSourceEditHost): void {
  host.lifecycle.assertCurrent()
  if (host.dataSet.destroyed || host.views.some((view, i) => view.destroyed || host.dataSet.getView(view.tableName, view.viewId) !== view
    || view.dataTable?.modelBinding?.modelName !== view.tableName || view.queryContext['dataSpaceId'] !== host.targetId
    || JSON.stringify(view.queryContext) !== host.contexts[i])) throw new Error('来源替换查询或目标已变化')
}

function modelSourceEditSelectViews(host: ModelSourceEditHost, synchronizing: boolean) {
  modelSourceEditAssertClean(host, false, true)
  const template = host.dataSet.getView('Base_DataModel_Field', 'modelInputFields')
  if (!template || template.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field') throw new Error('缺少正式所属字段查询配置modelInputFields')
  if (synchronizing) host.syncFields ??= template.createQueryView(`sourceSync:${host.modelId}`)
  else {
    host.replacementFields ??= template.createQueryView(`sourceReplace:${host.modelId}`)
    host.replacementRelations ??= host.relations.createQueryView(`sourceReplace:${host.modelId}`)
    host.relations = host.replacementRelations
  }
  const fields = synchronizing ? host.syncFields : host.replacementFields
  if (!fields) throw new Error('来源操作字段视图不存在')
  // Filter可能使用限定名，也可能存在含点的本地字段；仅补读持有Filter的模型，不扫描其他模型字段。
  const modelIds = new Set([host.modelId])
  if (!synchronizing) for (const model of host.models.rows) {
    if (host.models.fieldAccess(model, 'Filter').read !== 'visible') throw new Error('模型过滤配置不可读，不能核验来源引用')
    if (model['Filter'] !== undefined && model['Filter'] !== null && model['Filter'] !== '') {
      if (typeof model['rowid'] !== 'string' || !model['rowid']) throw new Error('依赖模型身份不可确认')
      modelIds.add(model['rowid'])
    }
  }
  fields.queryContext = {...template.queryContext, dataSpaceId: host.targetId, modelId: host.modelId, modelIds: [...modelIds].sort()}
  host.fields = fields
  host.views.splice(0, host.views.length, host.models, host.fields, ...synchronizing ? [] : [host.relations])
  host.contexts.splice(0, host.contexts.length, ...host.views.map(view => JSON.stringify(view.queryContext)))
  modelSourceEditAssertOwner(host)
}

function modelSourceEditAssertClean(host: ModelSourceEditHost, allowOwned = false, forReadback = false) {
  modelSourceEditAssertOwner(host)
  for (const view of host.views) {
    if (Object.values(view.dataTable?.views ?? {}).some(other => other !== view
      && (other.mutating || other.hasEditingChanges() || other.dirtyTracking.hasPendingChanges()))) throw new Error('请先处理其他元数据草稿，不能覆盖')
    const owned = new Set(allowOwned ? view === host.models ? [host.modelId, ...host.flow.modelEdits.map(item => item.id)]
      : view === host.fields ? [...host.flow.fieldEdits, ...host.flow.added, ...host.flow.removed].map(item => item.id) : host.flow.relationEdits.map(item => item.id) : [])
    if ((!forReadback && view.requestState !== RequestState.Loaded) || view.requestState === RequestState.Loading || view.mutating
      || (!forReadback && !allowOwned && view.total !== view.rows.length)) throw new Error('元数据尚未完整读取或正在操作')
    const foreignEdits = view.hasEditingChanges() && (owned.size === 0
      || view.rows.some(row => !owned.has(String(view.getPkKey(row))) && view.hasEditingChanges(view.getPkKey(row))))
    if (foreignEdits || [...view.dirtyTracking.pendingDeleteIds].some(id => !owned.has(String(id)))
      || [...view.dirtyTracking.pendingCreateIds, ...view.dirtyTracking.dirtyRowIds].some(id => !owned.has(String(id)))) throw new Error('请先处理其他元数据草稿，不能覆盖')
    if (view.rows.some(row => row['dataSetId'] !== host.targetId || view.fieldAccess(row, 'dataSetId').read !== 'visible'
      && !(allowOwned && view === host.fields && host.flow.added.some(item => item.id === view.getPkKey(row))))) throw new Error('元数据归属不可读或不属于目标空间')
    if ((view === host.syncFields || view === host.replacementFields) && view.rows.some(row => !Array.isArray(view.queryContext['modelIds'])
      || !view.queryContext['modelIds'].includes(row['dataModelId'])
      || view.fieldAccess(row, 'dataModelId').read !== 'visible'
        && !(allowOwned && host.flow.added.some(item => item.id === view.getPkKey(row))))) throw new Error('来源字段归属不可读或不属于本次模型范围')
  }
}

function modelSourceEditCurrent(host: ModelSourceEditHost, id = host.modelId) {
  const rows = host.models.rows.filter(row => host.models.getPkKey(row) === id)
  const row = rows[0]
  if (rows.length !== 1 || row?.['rowid'] !== id) throw new Error('模型身份不存在或不唯一')
  return row
}

function modelSourceEditValues(host: ModelSourceEditHost, view: DataView, row: DataRow) {
  // 正式CRUD会重写目标记录的更新时间/更新人；它们不属于须保持不变的设计合同。
  const targetModel = view === host.models || view === host.fields && row['dataModelId'] === host.modelId || view === host.relations
  return Object.fromEntries(view.columns.filter(column => column.name !== '_pk'
    && !(targetModel && ['updatetime', 'updateuser'].includes(column.name.toLowerCase()))).map(column => {
    if (view.fieldAccess(row, column.name).read !== 'visible') throw new Error(`无法完整核对${view.tableName}.${column.name}`)
    return [column.name, row[column.name]]
  }))
}

function modelSourceEditSnapshot(host: ModelSourceEditHost, patch: Record<string, unknown> = {}, applyFields = false) {
  return JSON.stringify(host.views.map(view => view.rows.filter(row => view !== host.fields || !host.flow.added.some(item => item.id === view.getPkKey(row))
    && !(applyFields && host.flow.removed.some(item => item.id === view.getPkKey(row)))).map(row => ({id: view.getPkKey(row), values: {
    ...modelSourceEditValues(host, view, row), ...(view === host.models && row['rowid'] === host.modelId ? patch : {}),
    ...(applyFields && view === host.models ? host.flow.modelEdits.find(item => item.id === view.getPkKey(row))?.patch : {}),
    ...(applyFields && view === host.fields ? host.flow.fieldEdits.find(item => item.id === view.getPkKey(row))?.patch : {}),
    ...(applyFields && view === host.relations ? host.flow.relationEdits.find(item => item.id === view.getPkKey(row))?.patch : {}),
  }})).sort((a, b) => String(a.id).localeCompare(String(b.id)))))
}

function modelSourceEditFlowStatus(host: ModelSourceEditHost) {
  if (host.flow.status === 'saving' || host.flow.status === 'previewing') return host.flow.status
  if (host.flow.status === 'readback' || host.flow.status === 'different' || host.flow.status === 'configuration' || host.flow.status === 'unsubmitted') return host.flow.status
  if (host.flow.status !== 'idle' && host.views.some(view => view.hasUnconfirmedSave)) return 'unknown'
  if (host.flow.status === 'unknown') return 'unknown'
  return host.flow.status
}

function modelSourceEditAvailable(host: ModelSourceEditHost) {
  modelSourceEditAssertOwner(host)
  if (!['idle', 'previewing', 'ready'].includes(modelSourceEditFlowStatus(host))) throw new Error('请先核验上次来源替换，不能重复提交')
}

function modelSourceEditAssess(host: ModelSourceEditHost, prepared: Prepared) {
  const row = modelSourceEditCurrent(host), problems: string[] = [], differences: Preview['differences'] = [], fieldChoices: Preview['fieldChoices'] = [], additions: Preview['additions'] = []
  const removals: Preview['removals'] = [], removalChoices: Preview['removalChoices'] = [], inputChoices: Preview['inputChoices'] = [], contractChanges: Preview['contractChanges'] = []
  if (typeof row['Name'] !== 'string' || !row['Name'].trim()) throw new Error('模型注册名无效')
  if (LowcodeDataSpaceSourceCatalog.config(prepared.source.type).label !== prepared.model.Type) problems.push('来源类型与正式读取结果不一致')
  for (const key of ['JoinFilter', 'ForeignKeyFields', 'PId', 'JoinType', 'RequestComplete', 'items', 'addApi', 'updateApi', 'deleteApi']) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') problems.push(`${key}含已有配置，须先确认来源引用迁移`)
  }
  const fields = host.fields.rows.filter(item => item['dataModelId'] === host.modelId)
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
      && typeof item['rowid'] === 'string' && !!item['rowid'] && host.fields.getPkKey(item) === item['rowid']
      && typeof item['Name'] === 'string' && !!item['Name'].trim()
      && !prepared.fields.some(next => next.type === type && next.Name === name)
    if (removable) removalChoices.push({id: String(item['rowid']), name, removed: host.flow.removals.has(String(item['rowid']))})
    if (removable && host.flow.removals.has(String(item['rowid']))) {
      if (keys.has(key)) problems.push(`${name}：模型字段名称与用途不唯一`)
      keys.add(key); removals.push({id: String(item['rowid']), name, type: String(type)})
      differences.push({name, result: '明确移除旧字段定义；提交前核验引用与权限'})
      continue
    }
    const sourceName = host.flow.mappings.get(String(item['rowid'])) ?? name
    const candidates = prepared.fields.filter(next => next.type === type && next.Name === sourceName)
    const next = candidates[0]
    let result = '保留原记录、输出别名和配置'
    if (keys.has(key)) result = '模型字段名称与用途不唯一'
    else if (computed) {
      if (typeof item['rowid'] !== 'string' || !item['rowid'] || host.fields.getPkKey(item) !== item['rowid']
        || typeof item['Name'] !== 'string' || !item['Name'].trim()) result = '计算字段身份或名称无效'
      else if (candidates.length) result = '来源字段与保留的计算字段重名'
    }
    else if (!['dataModel', 'inputParams'].includes(String(type)) || item['FieldType'] === '计算字段') result = '派生或处理字段须先确认来源引用'
    else if (candidates.length !== 1 || !next) result = '来源字段缺失或不唯一'
    else if (!new Set<unknown>([0, 1, '0', '1', false, true]).has(item['IsPKey'])) result = '原字段主键标记无效'
    else if (type === 'inputParams' && (item['FieldType'] !== next.FieldType || Number(item['IsPKey']) !== next.IsPKey)) result = '来源入参类型或主键合同变化，须先明确取值转换'
    else if (type === 'dataModel') modelSourceEditAssessFieldContract(host, item, next, {contractChanges, problems})
    const sourceKey = JSON.stringify([type, sourceName])
    if (sourceName !== name && type === 'dataModel') {
      const configured = (value: unknown) => value !== undefined && value !== null && value !== ''
      if (host.models.rows.some(model => model['rowid'] !== host.modelId
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
    const included = host.flow.included.has(item.Name)
    if (item.type === 'inputParams') {
      modelSourceEditAssessInput(host, item.Name, {inputChoices, differences, problems})
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
    .map(choice => ({modelId: host.modelId, name: choice.name, sourceName: choice.sourceName}))
  let expressionChanges: Preview['expressionChanges'] = [], relationChanges: Preview['relationChanges'] = []
  let fieldExpressionChanges: Preview['fieldExpressionChanges'] = []
  try {
    fieldExpressionChanges = LowcodeDataSpaceFieldMigration.prepare({modelId: host.modelId,
      models: host.models.rows.map(model => model['rowid'] === host.modelId ? {...model, Type: prepared.model.Type} : model),
      fields: host.fields.rows.filter(field => !removals.some(item => item.id === field['rowid'])), mappings})
  } catch (error) {problems.push(error instanceof Error ? error.message : String(error))}
  try {
    expressionChanges = LowcodeDataSpaceModelMigration.prepare({modelId: host.modelId,
      models: host.models.rows, fields: host.fields.rows, mappings})
  } catch (error) {problems.push(error instanceof Error ? error.message : String(error))}
  try {
    relationChanges = LowcodeDataSpaceRelationMigration.prepare({relations: host.relations.rows, models: host.models.rows, fields: host.fields.rows,
      mappings})
  } catch (error) {problems.push(error instanceof Error ? error.message : String(error))}
  const preview: Preview = {operation: 'replace', removals, removalChoices, inputChoices, inputParams: [], parameterWarning: '', contractChanges, viewChanges: host.flow.contractPlan?.viewChanges ?? [], name: row['Name'], prepared: structuredClone(prepared), differences, problems, fieldChoices, additions, relationChanges, modelChanges, expressionChanges, fieldExpressionChanges}
  if (modelSourceEditNeedsSourceContract(host, preview)) {
    try {modelSourceEditProjectSourceModel(host, preview)} catch (error) {preview.problems.push(error instanceof Error ? error.message : String(error))}
  }
  modelSourceEditReadInputParameters(host, preview)
  return preview
}

function modelSourceEditAssessFieldContract(host: ModelSourceEditHost, row: DataRow, source: Prepared['fields'][number], preview: Pick<Preview, 'contractChanges' | 'problems'>) {
  const patch: Record<string, unknown> = {}
  if (typeof row['FieldType'] !== 'string' || row['FieldType'].toLowerCase() !== source.FieldType.toLowerCase()) patch['FieldType'] = source.FieldType
  if (Number(row['IsPKey']) !== source.IsPKey) patch['IsPKey'] = source.IsPKey
  if (!Object.keys(patch).length) return undefined
  if (source.IsPKey === 1 && Number(row['IsOutput']) !== 1) patch['IsOutput'] = 1
  const accepted = host.flow.acceptedContracts.has(String(row['rowid'])), name = String(row['Name'])
  preview.contractChanges.push({id: String(row['rowid']), name,
    before: `类型 ${String(row['FieldType'])}；主键 ${String(row['IsPKey'])}`,
    after: `类型 ${source.FieldType}；主键 ${source.IsPKey}${patch['IsOutput'] === 1 ? '；参与输出' : ''}`, accepted, patch})
  const result = `来源类型或主键合同已变化，${accepted ? '已确认迁移' : '请先处理'}（类型 ${String(row['FieldType'])} → ${source.FieldType}；主键 ${String(row['IsPKey'])} → ${source.IsPKey}）`
  if (!accepted) preview.problems.push(`${name}：${result}`)
  return result
}

function modelSourceEditAssessInput(host: ModelSourceEditHost, sourceName: string, preview: Pick<Preview, 'inputChoices' | 'differences' | 'problems'>) {
  const value = host.flow.inputs.get(sourceName) ?? ''
  preview.inputChoices.push({sourceName, value})
  try {
    if (!value) throw new Error('新增来源入参须明确配置空间参数引用或JSON常量')
    sourceInputValidateValue(host.dataSet, host.targetId, sourceName, value)
    preview.differences.push({name: sourceName, result: '新增来源入参；使用明确配置的取值'})
  } catch (error) {
    const result = error instanceof Error ? error.message : String(error)
    preview.differences.push({name: sourceName, result}); preview.problems.push(`${sourceName}：${result}`)
  }
}

function modelSourceEditReadInputParameters(host: ModelSourceEditHost, preview: Preview) {
  if (preview.inputChoices.length) try {preview.inputParams = sourceInputReadParameters(host.dataSet, host.targetId)}
  catch (error) {preview.parameterWarning = error instanceof Error ? error.message : String(error)}
}

function modelSourceEditAssessSynchronization(host: ModelSourceEditHost, prepared: Prepared) {
  const model = modelSourceEditCurrent(host), fields = host.fields.rows.filter(row => row['dataModelId'] === host.modelId)
  const preview: Preview = {operation: 'synchronize', name: String(model['Name']), prepared: structuredClone(prepared),
    differences: [], problems: [], fieldChoices: [], additions: [], removals: [], removalChoices: [], inputChoices: [], inputParams: [], parameterWarning: '', contractChanges: [], viewChanges: host.flow.contractPlan?.viewChanges ?? [], relationChanges: [], modelChanges: [], expressionChanges: [], fieldExpressionChanges: []}
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
      const result = modelSourceEditAssessFieldContract(host, row, source, preview) ?? '保留原记录、输出和全部配置'
      preview.differences.push({name, result})
    } else {
      preview.removals.push({id: String(row['rowid']), name, type: String(row['type'])})
      preview.differences.push({name, result: '来源已不存在，确认后删除此字段定义'})
    }
  }
  for (const row of prepared.fields) if (!fields.some(item => key(item) === key(row))) {
    preview.additions.push({sourceName: row.Name, included: true})
    if (row.type === 'inputParams') modelSourceEditAssessInput(host, row.Name, preview)
    else preview.differences.push({name: row.Name, result: `新增来源字段；${row.IsPKey === 1 ? '作为主键并参与输出' : row.IsOutput === 1 ? '参与输出' : '不输出'}`})
  }
  if (modelSourceEditNeedsSourceContract(host, preview)) {
    try {modelSourceEditProjectSourceModel(host, preview)} catch (error) {preview.problems.push(error instanceof Error ? error.message : String(error))}
  }
  modelSourceEditReadInputParameters(host, preview)
  return preview
}

function modelSourceEditNeedsSourceContract(host: ModelSourceEditHost, preview: Preview) {
  return preview.operation === 'replace' || preview.contractChanges.length > 0
    || modelSourceEditSourceAdditions(host, preview).some(row => row.type === 'dataModel')
    || preview.removals.some(item => item.type === 'dataModel')
}

function modelSourceEditSourceAdditions(host: ModelSourceEditHost, preview: Preview) {
  return preview.prepared.fields.filter(field => preview.operation === 'synchronize'
    ? !host.fields.rows.some(item => item['dataModelId'] === host.modelId && item['type'] === field.type && item['Name'] === field.Name)
    : field.type === 'dataModel' ? preview.additions.some(item => item.sourceName === field.Name && item.included)
      : preview.inputChoices.some(item => item.sourceName === field.Name))
}

function modelSourceEditProjectSourceModel(host: ModelSourceEditHost, preview: Preview) {
  const model = modelSourceEditCurrent(host), fields = host.fields.rows.filter(row => row['dataModelId'] === host.modelId && row['type'] === 'dataModel')
  // 候选标识只用于完整定义校验；真正新增行由原DataView分配身份，不将此标识写入配置或数据库。
  const finalFields: DataRow[] = [...fields.filter(row => !preview.removals.some(item => item.id === row['rowid'])).map(row => {
    const choice = preview.fieldChoices.find(item => item.id === row['rowid']), expression = preview.fieldExpressionChanges.find(item => item.id === row['rowid'])
    return {...row, ...choice && choice.sourceName !== choice.name ? {Name: choice.sourceName,
      AsName: typeof row['AsName'] === 'string' && row['AsName'].trim() ? row['AsName'] : choice.outputName} : {},
      ...preview.contractChanges.find(change => change.id === row['rowid'])?.patch, ...expression ? {ValueFun: expression.after} : {}}
  }), ...modelSourceEditSourceAdditions(host, preview).filter(row => row.type === 'dataModel').map((row, index) => ({...row, rowid: `new:${index}`, dataModelId: host.modelId,
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
  const raw = {...model, ...preview.operation === 'replace' ? Object.fromEntries(SOURCE_KEYS.map(property => [property, preview.prepared.model[property]])) : {},
    ...Object.fromEntries([...preview.modelChanges, ...preview.expressionChanges.filter(change => change.id === host.modelId)].map(change => [change.property, change.after]))}
  const candidate = DataSpaceDesignApi.projectModel(raw, finalFields,
    preview.prepared.source.type === 'table' ? key : '')
  DataSpaceDesignApi.resolveFields(candidate)
  return candidate
}

function modelSourceEditProjectSourceContract(host: ModelSourceEditHost, preview: Preview) {
  const model = {...modelSourceEditCurrent(host)}, fields = host.fields.rows
    .filter(row => row['dataModelId'] === host.modelId && row['type'] === 'dataModel').map(row => ({...row}))
  return {previous: () => fields.length ? DataSpaceDesignApi.projectModel(model, fields, ['数据库表', '表', 'table'].includes(String(model['Type']))
    ? String(fields.find(row => Number(row['IsPKey']) === 1)?.['Name'] ?? '') : '') : null, after: modelSourceEditProjectSourceModel(host, preview)}
}

/** 确认已有字段的来源合同差异；取消或重新预览会清除确认，不改正式行。 */
export function modelSourceEditConfirmFieldContract(host: ModelSourceEditHost, input: Readonly<{fieldId: string; accepted: boolean}>) {
  const preview = modelSourceEditSelected(host)
  if (!preview.contractChanges.some(change => change.id === input.fieldId)) throw new Error('字段不是当前来源的合同差异')
  if (input.accepted) host.flow.acceptedContracts.add(input.fieldId)
  else host.flow.acceptedContracts.delete(input.fieldId)
  host.flow.preview = modelSourceEditReassess(host, preview)
}

function modelSourceEditReassess(host: ModelSourceEditHost, preview: Preview) {
  const result = preview.operation === 'synchronize' ? modelSourceEditAssessSynchronization(host, preview.prepared) : modelSourceEditAssess(host, preview.prepared)
  if (modelSourceEditNeedsSourceContract(host, result) && !host.flow.contractPlan) result.problems.push('命名视图合同尚未通过检查，请重新预览并处理诊断')
  return result
}

async function modelSourceEditPrepareContract(host: ModelSourceEditHost, preview: Preview, generation: number, baseline: string) {
  host.flow.contractPlan = null; preview.viewChanges = []
  if (modelSourceEditNeedsSourceContract(host, preview)) {
    try {
      if (!host.lifecycle.prepareContract) throw new Error('缺少来源字段合同的命名视图迁移检查')
      const plan = await host.lifecycle.prepareContract(modelSourceEditProjectSourceContract(host, preview))
      if (generation !== host.flow.generation) return false
      modelSourceEditAssertClean(host)
      if (modelSourceEditSnapshot(host) !== baseline) throw new Error('读取视图合同期间定义已变化，请重新预览')
      host.flow.contractPlan = plan; preview.viewChanges = plan.viewChanges
    } catch (error) {preview.problems.push(error instanceof Error ? error.message : String(error))}
  }
  if (generation !== host.flow.generation) return false
  modelSourceEditAssertClean(host)
  if (modelSourceEditSnapshot(host) !== baseline) throw new Error('读取视图合同期间定义已变化，请重新预览')
  return true
}

async function modelSourceEditRefreshMapping(host: ModelSourceEditHost, preview: Preview) {
  const generation = ++host.flow.generation
  host.flow.status = 'previewing'; host.flow.contractPlan = null
  try {
    const result = modelSourceEditAssess(host, preview.prepared)
    if (await modelSourceEditPrepareContract(host, result, generation, host.flow.baseline)) {host.flow.preview = result; host.flow.status = 'ready'}
  } catch (error) {if (generation === host.flow.generation) host.flow.status = 'idle'; throw error}
}

/**
 * 精确定位当前绑定来源，以独立所属字段视图预览增删；不修改正式记录或已有草稿。
 * @throws 来源身份缺失、重名、权限不足或读取期间定义变化时拒绝，不按名称回退其他数据库/提供方。
 */
export async function modelSourceEditPreviewBoundSource(host: ModelSourceEditHost) {
  modelSourceEditAvailable(host); modelSourceEditSelectViews(host, true)
  const generation = ++host.flow.generation
  host.flow.status = 'previewing'; host.flow.preview = null; host.flow.mappings.clear(); host.flow.included.clear(); host.flow.removals.clear(); host.flow.inputs.clear(); host.flow.acceptedContracts.clear(); host.flow.contractPlan = null
  try {
    await host.fields.refresh()
    modelSourceEditAssertClean(host)
    if (generation !== host.flow.generation) return
    const model = modelSourceEditCurrent(host), baseline = modelSourceEditSnapshot(host)
    const type = LowcodeDataSpaceSourceCatalog.types.find(item => item.label === model['Type'])?.value
    if (!type || typeof model['MetaName'] !== 'string' || !model['MetaName'] || typeof model['DbId'] !== 'string' || !model['DbId']) throw new Error('已绑定来源类型、名称或身份不完整')
    const matches: Array<Parameters<Reader['prepare']>[0]> = [], seen = new Set<string>()
    let read = 0, total = 0
    for (let page = 1; page <= 500; page++) {
      const result = await host.sources.query({type, keyword: model['MetaName'], page, pageSize: 100}, host.dataSet)
      modelSourceEditAssertClean(host)
      if (generation !== host.flow.generation) return
      if (modelSourceEditSnapshot(host) !== baseline) throw new Error('读取来源期间定义已变化，请重新预览')
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
    const prepared = await host.sources.prepare(matches[0], host.dataSet)
    modelSourceEditAssertClean(host)
    if (generation !== host.flow.generation) return
    if (modelSourceEditSnapshot(host) !== baseline) throw new Error('读取来源期间定义已变化，请重新预览')
    const preview = modelSourceEditAssessSynchronization(host, prepared)
    if (!await modelSourceEditPrepareContract(host, preview, generation, baseline)) return
    host.flow.baseline = baseline; host.flow.preview = preview; host.flow.status = 'ready'
  } catch (error) {if (generation === host.flow.generation) host.flow.status = 'idle'; throw error}
}

function modelSourceEditSelected(host: ModelSourceEditHost) {
  modelSourceEditAvailable(host); modelSourceEditAssertClean(host)
  if (modelSourceEditFlowStatus(host) !== 'ready' || !host.flow.preview || modelSourceEditSnapshot(host) !== host.flow.baseline) throw new Error('元数据已变化，请重新预览')
  return host.flow.preview
}

/** 显式映射同用途来源，保留记录和输出名；等待视图合同预览，类型/主键差异另行确认。 */
export async function modelSourceEditMapField(host: ModelSourceEditHost, input: Readonly<{fieldId: string; sourceName: string}>) {
  const preview = modelSourceEditSelected(host), choice = preview.fieldChoices.find(item => item.id === input.fieldId)
  if (preview.operation !== 'replace') throw new Error('同步当前来源不修改字段映射')
  if (!choice?.candidates.includes(input.sourceName)) throw new Error('来源字段须与原字段用途一致，入参还须保持类型及主键合同')
  host.flow.acceptedContracts.delete(input.fieldId)
  host.flow.mappings.set(input.fieldId, input.sourceName); host.flow.included.delete(input.sourceName)
  await modelSourceEditRefreshMapping(host, preview)
}

/** 显式引入尚未绑定的来源字段，等待候选模型/视图合同预览；不自动新增入参。 */
export async function modelSourceEditIncludeField(host: ModelSourceEditHost, input: Readonly<{sourceName: string; included: boolean}>) {
  const preview = modelSourceEditSelected(host)
  if (preview.operation !== 'replace') throw new Error('同步按完整来源字段生成差异')
  if (!preview.additions.some(item => item.sourceName === input.sourceName)) throw new Error('字段不是当前可引入来源')
  if (input.included) host.flow.included.add(input.sourceName); else host.flow.included.delete(input.sourceName)
  await modelSourceEditRefreshMapping(host, preview)
}

/** 显式移除来源已不存在的普通定义，等待候选合同预览；删除仍经原引用检查与DataSet提交。 */
export async function modelSourceEditRemoveField(host: ModelSourceEditHost, input: Readonly<{fieldId: string; removed: boolean}>) {
  const preview = modelSourceEditSelected(host)
  if (preview.operation !== 'replace' || !preview.removalChoices.some(item => item.id === input.fieldId)) throw new Error('只能显式移除来源已消失的普通字段')
  host.flow.acceptedContracts.delete(input.fieldId)
  if (input.removed) {host.flow.removals.add(input.fieldId); host.flow.mappings.delete(input.fieldId)}
  else host.flow.removals.delete(input.fieldId)
  await modelSourceEditRefreshMapping(host, preview)
}

/** 新来源参数必须明确配置，使用已有来源入参合同，不自动迁移旧值。 */
export function modelSourceEditConfigureInput(host: ModelSourceEditHost, input: Readonly<{sourceName: string; value: string}>) {
  const preview = modelSourceEditSelected(host)
  if (!preview.inputChoices.some(item => item.sourceName === input.sourceName)) throw new Error('参数不是当前新增来源入参')
  sourceInputValidateValue(host.dataSet, host.targetId, input.sourceName, input.value)
  host.flow.inputs.set(input.sourceName, input.value)
  host.flow.preview = modelSourceEditReassess(host, preview)
}

/** 返回不含正式记录/授权的候选及流程状态，供预览与关闭保护。 */
export function modelSourceEditGetState(host: ModelSourceEditHost) {
  const status = modelSourceEditFlowStatus(host)
  return {status, pending: status !== 'idle', preview: structuredClone(host.flow.preview), verification: structuredClone(host.flow.verification)}
}

/** 比较完整原元数据与候选来源，尚不改变记录。 */
export async function modelSourceEditPreview(host: ModelSourceEditHost, source: Parameters<Reader['prepare']>[0]) {
  modelSourceEditAvailable(host); modelSourceEditSelectViews(host, false)
  const generation = ++host.flow.generation
  host.flow.status = 'previewing'; host.flow.preview = null; host.flow.mappings.clear(); host.flow.included.clear(); host.flow.removals.clear(); host.flow.inputs.clear(); host.flow.acceptedContracts.clear(); host.flow.contractPlan = null
  try {
    for (const view of [host.fields, host.relations]) {
      const result = await view.loadFromServer()
      modelSourceEditAssertClean(host, false, true)
      if (generation !== host.flow.generation) return
      if (!result.success) throw new Error('来源替换依赖读取失败')
    }
    modelSourceEditAssertClean(host)
    const baseline = modelSourceEditSnapshot(host)
    const prepared = await host.sources.prepare(source, host.dataSet)
    modelSourceEditAssertClean(host)
    if (generation !== host.flow.generation) return
    if (modelSourceEditSnapshot(host) !== baseline) throw new Error('读取来源期间定义已变化，请重新预览')
    const preview = modelSourceEditAssess(host, prepared)
    if (!await modelSourceEditPrepareContract(host, preview, generation, baseline)) return
    host.flow.baseline = baseline; host.flow.preview = preview; host.flow.status = 'ready'
  } catch (error) {if (generation === host.flow.generation) host.flow.status = 'idle'; throw error}
}

/** 放弃尚未派发的来源选择。 */
export function modelSourceEditDiscard(host: ModelSourceEditHost) {modelSourceEditAvailable(host); host.flow.generation++; modelSourceEditFinish(host)}

async function modelSourceEditReload(host: ModelSourceEditHost) {
  modelSourceEditAssertClean(host, false, true)
  for (const view of host.views) {
    const loaded = await view.loadFromServer({allPages: true, maxRows: 50000})
    modelSourceEditAssertClean(host, false, true)
    if (!loaded.success || view.loadingError) throw new Error('来源替换元数据回读失败')
  }
  modelSourceEditAssertClean(host)
}

function modelSourceEditFieldRow(host: ModelSourceEditHost, id: string) {
  const rows = host.fields.rows.filter(row => host.fields.getPkKey(row) === id && row['dataModelId'] === host.modelId)
  if (rows.length !== 1 || !rows[0]) throw new Error('字段身份不存在或不唯一')
  return rows[0]
}

function modelSourceEditRelationRow(host: ModelSourceEditHost, id: string) {
  const rows = host.relations.rows.filter(row => host.relations.getPkKey(row) === id)
  if (rows.length !== 1 || !rows[0]) throw new Error('关系身份不存在或不唯一')
  return rows[0]
}

async function modelSourceEditStageAddition(host: ModelSourceEditHost, values: Record<string, unknown>) {
  const before = new Set(host.fields.dirtyTracking.pendingCreateIds)
  try {await host.fields.addRow(values)} finally {
    const rows = host.fields.dirtyTracking.pendingCreateRows.filter(row => !before.has(host.fields.getPkKey(row) ?? ''))
    const row = rows[0], id = row && host.fields.getPkKey(row)
    if (rows.length === 1 && row && typeof id === 'string' && row['rowid'] === id && Object.entries(values).every(([key, value]) => Object.is(row[key], value))) {
      host.flow.added.push({id, values, snapshot: JSON.stringify(row)})
    }
  }
  if (host.flow.added.at(-1)?.values !== values) throw new Error('新增字段未获得唯一正式身份，请处理原视图草稿')
}

/** 重新核对来源、映射及权限，提交原元数据视图的明确delta；各表分别核验结果。 */
export async function modelSourceEditSave(host: ModelSourceEditHost) {
  modelSourceEditAvailable(host); modelSourceEditAssertClean(host)
  const candidate = host.flow.preview
  if (modelSourceEditFlowStatus(host) !== 'ready' || !candidate) throw new Error('请先预览来源')
  if (candidate.problems.length) throw new Error(candidate.problems.join('；'))
  if (modelSourceEditSnapshot(host) !== host.flow.baseline) throw new Error('元数据已变化，请重新预览')
  host.flow.status = 'saving'; host.flow.fieldEdits = []; host.flow.relationEdits = []; host.flow.modelEdits = []; host.flow.added = []; host.flow.removed = []; host.flow.pendingSnapshot = ''; host.flow.patch = {}
  let dispatched = false, confirmed = false
  try {
    const prepared = await host.sources.prepare(candidate.prepared.source, host.dataSet)
    await modelSourceEditReload(host)
    if (JSON.stringify(prepared) !== JSON.stringify(candidate.prepared) || modelSourceEditSnapshot(host) !== host.flow.baseline) throw new Error('来源或元数据已变化，请重新预览')
    const row = modelSourceEditCurrent(host)
    const patch = candidate.operation === 'synchronize' ? {} : Object.fromEntries(SOURCE_KEYS.filter(key => row[key] !== prepared.model[key]).map(key => [key, prepared.model[key]]))
    for (const change of candidate.modelChanges) patch[change.property] = change.after
    for (const change of candidate.expressionChanges) {
      if (change.id === host.modelId) {patch[change.property] = change.after; continue}
      let item = host.flow.modelEdits.find(edit => edit.id === change.id)
      if (!item) {item = {id: change.id, patch: {}, snapshot: ''}; host.flow.modelEdits.push(item)}
      item.patch[change.property] = change.after
    }
    for (const choice of candidate.fieldChoices) {
      if (choice.sourceName === choice.name) continue
      const field = modelSourceEditFieldRow(host, choice.id)
      host.flow.fieldEdits.push({id: choice.id, patch: {Name: choice.sourceName,
        ...(field['type'] === 'dataModel' && !(typeof field['AsName'] === 'string' && field['AsName'].trim()) ? {AsName: choice.outputName} : {})}, snapshot: ''})
    }
    for (const change of candidate.contractChanges) {
      const edit = host.flow.fieldEdits.find(item => item.id === change.id)
      if (edit) Object.assign(edit.patch, change.patch)
      else host.flow.fieldEdits.push({id: change.id, patch: {...change.patch}, snapshot: ''})
    }
    for (const change of candidate.fieldExpressionChanges) {
      let edit = host.flow.fieldEdits.find(item => item.id === change.id)
      if (!edit) {edit = {id: change.id, patch: {}, snapshot: ''}; host.flow.fieldEdits.push(edit)}
      edit.patch['ValueFun'] = change.after
    }
    const additions = modelSourceEditSourceAdditions(host, candidate)
    host.flow.removed = candidate.removals.map(item => ({id: item.id, row: {...modelSourceEditFieldRow(host, item.id)}}))
    host.flow.relationEdits = candidate.relationChanges.map(item => ({id: item.id, patch: {filter: item.after}, snapshot: ''}))
    if (!Object.keys(patch).length && !host.flow.modelEdits.length && !host.flow.fieldEdits.length && !additions.length && !host.flow.removed.length) {modelSourceEditFinish(host); return host.modelId}
    const assertConfiguration = !host.flow.contractPlan && (host.flow.fieldEdits.length || additions.length)
      ? await host.lifecycle.validateConfiguration() : () => {}
    let assertTransition = () => {}
    let assertContract = () => {}
    if (modelSourceEditNeedsSourceContract(host, candidate)) {
      if (!host.flow.contractPlan) throw new Error('缺少已核验的命名视图迁移计划')
      await host.flow.contractPlan.assertCurrent(); assertContract = host.flow.contractPlan.check
    }
    if (row['Type'] !== prepared.model.Type) {
      if (!host.lifecycle.validateTransition) throw new Error('缺少来源类型变化的视图合同检查')
      assertTransition = await host.lifecycle.validateTransition(prepared.model)
    }
    let assertRemovals = () => {}
    if (host.flow.removed.length) {
      if (!host.lifecycle.validateRemovals) throw new Error('缺少字段删除引用检查，不能同步')
      assertRemovals = await host.lifecycle.validateRemovals(host.flow.removed.map(item => item.id),
        modelSourceEditNeedsSourceContract(host, candidate) ? modelSourceEditProjectSourceContract(host, candidate) : undefined)
    }
    modelSourceEditAssertClean(host)
    if (modelSourceEditSnapshot(host) !== host.flow.baseline) throw new Error('元数据已变化，请重新预览')
    const assertWritable = () => {
      modelSourceEditAssertOwner(host); assertConfiguration(); assertTransition(); assertContract(); assertRemovals()
      for (const input of candidate.inputChoices) sourceInputValidateValue(host.dataSet, host.targetId, input.sourceName, input.value)
      if (Object.keys(patch).length && (host.models.editActionState(modelSourceEditCurrent(host)) !== 'enabled' || Object.keys(patch).some(key => host.models.fieldAccess(modelSourceEditCurrent(host), key).write !== 'allowed'))) throw new Error('当前查询不允许修改来源字段')
      for (const item of host.flow.modelEdits) if (host.models.editActionState(modelSourceEditCurrent(host, item.id)) !== 'enabled'
        || Object.keys(item.patch).some(key => host.models.fieldAccess(modelSourceEditCurrent(host, item.id), key).write !== 'allowed')) throw new Error(`当前查询不允许修改依赖模型${item.id}的表达式`)
      if (additions.length && host.fields.addActionState() !== 'enabled') throw new Error('当前查询不允许新增字段')
      for (const item of host.flow.removed) if (host.fields.deleteActionState(item.row) !== 'enabled') throw new Error(`当前查询不允许删除字段：${String(item.row['Name'])}`)
      for (const item of host.flow.fieldEdits) if (host.fields.editActionState(modelSourceEditFieldRow(host, item.id)) !== 'enabled'
        || Object.keys(item.patch).some(key => host.fields.fieldAccess(modelSourceEditFieldRow(host, item.id), key).write !== 'allowed')) throw new Error('当前查询不允许修改映射字段')
      for (const item of host.flow.relationEdits) if (host.relations.editActionState(modelSourceEditRelationRow(host, item.id)) !== 'enabled'
        || host.relations.fieldAccess(modelSourceEditRelationRow(host, item.id), 'filter').write !== 'allowed') throw new Error('当前查询不允许修改关系表达式')
    }
    assertWritable(); host.flow.expected = modelSourceEditSnapshot(host, patch, true); host.flow.patch = patch
    if (Object.keys(patch).length) {
      for (const [key, value] of Object.entries(patch)) host.models.updateEditingValue(host.modelId, key, value)
      const applied = await host.models.applyEditingRows([host.modelId]).finally(() => {
        if (Object.entries(patch).every(([key, value]) => Object.is(modelSourceEditCurrent(host)[key], value))) host.flow.pendingSnapshot = JSON.stringify(modelSourceEditCurrent(host))
      })
      if (!applied.success || applied.data?.appliedCount !== 1 || applied.data.failedCount !== 0) throw new Error('来源修改尚未应用')
    }
    for (const item of host.flow.modelEdits) {
      modelSourceEditAssertClean(host, true); assertWritable()
      if (host.models.hasEditingChanges(item.id) || host.models.dirtyTracking.hasPendingChanges(item.id)) throw new Error('依赖模型存在其他草稿，不能覆盖')
      for (const [key, value] of Object.entries(item.patch)) host.models.updateEditingValue(item.id, key, value)
      const applied = await host.models.applyEditingRows([item.id]).finally(() => {
        if (Object.entries(item.patch).every(([key, value]) => Object.is(modelSourceEditCurrent(host, item.id)[key], value))) item.snapshot = JSON.stringify(modelSourceEditCurrent(host, item.id))
      })
      if (!applied.success || applied.data?.appliedCount !== 1 || applied.data.failedCount !== 0) throw new Error('依赖模型表达式尚未应用')
    }
    for (const item of host.flow.fieldEdits) {
      modelSourceEditAssertClean(host, true); assertWritable()
      if (host.fields.hasEditingChanges(item.id) || host.fields.dirtyTracking.hasPendingChanges(item.id)) throw new Error('字段存在其他草稿，不能覆盖')
      for (const [key, value] of Object.entries(item.patch)) host.fields.updateEditingValue(item.id, key, value)
      const applied = await host.fields.applyEditingRows([item.id]).finally(() => {
        if (Object.entries(item.patch).every(([key, value]) => Object.is(modelSourceEditFieldRow(host, item.id)[key], value))) item.snapshot = JSON.stringify(modelSourceEditFieldRow(host, item.id))
      })
      if (!applied.success || applied.data?.appliedCount !== 1 || applied.data.failedCount !== 0) throw new Error('字段映射尚未应用')
    }
    for (const field of additions) {
      modelSourceEditAssertClean(host, true); assertWritable()
      const input = field.type === 'inputParams' ? candidate.inputChoices.find(item => item.sourceName === field.Name) : undefined
      await modelSourceEditStageAddition(host, {...field, ...input ? {ValueFun: input.value} : {},
        IsOutput: field.type === 'inputParams' ? 0 : field.IsPKey === 1 ? 1 : candidate.operation === 'synchronize' ? field.IsOutput : 1, dataSetId: host.targetId, dataModelId: host.modelId})
    }
    for (const item of host.flow.relationEdits) {
      modelSourceEditAssertClean(host, true); assertWritable()
      if (host.relations.hasEditingChanges(item.id) || host.relations.dirtyTracking.hasPendingChanges(item.id)) throw new Error('关系存在其他草稿，不能覆盖')
      host.relations.updateEditingValue(item.id, 'filter', item.patch['filter'])
      const applied = await host.relations.applyEditingRows([item.id]).finally(() => {
        if (modelSourceEditRelationRow(host, item.id)['filter'] === item.patch['filter']) item.snapshot = JSON.stringify(modelSourceEditRelationRow(host, item.id))
      })
      if (!applied.success || applied.data?.appliedCount !== 1 || applied.data.failedCount !== 0) throw new Error('关系迁移尚未应用')
    }
    for (const item of host.flow.removed) {
      modelSourceEditAssertClean(host, true); assertWritable()
      if (JSON.stringify(modelSourceEditFieldRow(host, item.id)) !== JSON.stringify(item.row) || await host.fields.removeRow(item.id) !== true) throw new Error('待删除字段已变化或删除未暂存')
    }
    modelSourceEditAssertClean(host, true); assertWritable()
    if (host.views.some(view => view.hasEditingChanges())) throw new Error('提交前出现新的元数据编辑，请保留并处理草稿')
    if (modelSourceEditSnapshot(host) !== host.flow.expected || host.flow.added.some(item => JSON.stringify(modelSourceEditFieldRow(host, item.id)) !== item.snapshot)) throw new Error('提交前元数据已变化')
    const selections = [{view: host.models, changed: [...Object.keys(patch).length ? [host.modelId] : [], ...host.flow.modelEdits.map(item => item.id)], added: new Array<string>(), removed: new Array<string>()},
      {view: host.fields, changed: host.flow.fieldEdits.map(item => item.id), added: host.flow.added.map(item => item.id), removed: host.flow.removed.map(item => item.id)},
      {view: host.relations, changed: host.flow.relationEdits.map(item => item.id), added: new Array<string>(), removed: new Array<string>()}].filter(item => item.changed.length || item.added.length || item.removed.length)
    await host.flow.contractPlan?.assertCurrent()
    modelSourceEditAssertClean(host, true); assertWritable()
    if (host.views.some(view => view.hasEditingChanges()) || modelSourceEditSnapshot(host) !== host.flow.expected
      || host.flow.added.some(item => JSON.stringify(modelSourceEditFieldRow(host, item.id)) !== item.snapshot)) throw new Error('核对配置期间元数据草稿已变化，不能派发')
    host.lifecycle.onDispatch(); dispatched = true
    const saved = await host.dataSet.saveChanges({applyEditingRows: false, views: selections.map(item => ({tableName: item.view.tableName, viewId: item.view.viewId, ids: [...item.changed, ...item.added, ...item.removed]}))})
    modelSourceEditAssertOwner(host)
    if (!saved.success || saved.data?.failedEditingRows !== 0 || saved.data.viewResults.length !== selections.length || selections.some(item => {
      const results = saved.data?.viewResults.filter(result => result.tableName === item.view.tableName && result.viewId === item.view.viewId)
      const result = results?.[0]
      return results?.length !== 1 || result?.savedCount !== item.changed.length || result.createdCount !== item.added.length || result.deletedCount !== item.removed.length || result.failedCount !== 0
    })) throw new Error('来源或字段回执未确认全部目标，请核验')
    confirmed = true
    if (!await modelSourceEditReadback(host)) throw new Error('来源替换回读与预览不一致')
    if (host.flow.contractPlan) {host.flow.status = 'configuration'; await host.flow.contractPlan.complete(false)}
    modelSourceEditFinish(host, true); return host.modelId
  } catch (error) {
    if (host.flow.status !== 'configuration') host.flow.status = confirmed ? 'readback' : dispatched ? 'unknown' : 'unsubmitted'
    if (!dispatched && host.views.every(view => !view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges())) host.flow.status = 'ready'
    throw error
  }
}

async function modelSourceEditReadback(host: ModelSourceEditHost) {
  await modelSourceEditReload(host)
  host.flow.verifiedSnapshot = modelSourceEditVerificationSnapshot(host)
  const matched = modelSourceEditSnapshot(host) === host.flow.expected
  const additions = host.flow.added.map(item => {
    const rows = host.fields.rows.filter(row => host.fields.getPkKey(row) === item.id), row = rows[0]
    const result = !row ? '未读取到新增字段' : rows.length !== 1 ? '字段身份不唯一' : Object.entries(item.values).every(([key, value]) =>
      host.fields.fieldAccess(row, key).read === 'visible' && Object.is(row[key], value)) ? '新增字段已一致' : '新增字段不可读或与预览不同'
    return {table: host.fields.tableName, id: item.id, result}
  })
  host.flow.verification = [{table: host.models.tableName, id: host.modelId, result: matched ? '模型、字段、关系及未变记录已一致' : '正式记录与预览不同，请处理差异'}, ...additions,
    ...host.flow.removed.map(item => ({table: host.fields.tableName, id: item.id,
      result: host.fields.rows.some(row => host.fields.getPkKey(row) === item.id) ? '字段仍存在，删除未确认' : '字段定义删除已确认'})),
    ...host.flow.preview?.modelChanges.map(item => ({table: host.models.tableName, id: `${host.modelId}.${item.property}`,
      result: modelSourceEditCurrent(host)[item.property] === item.after ? `${item.property}引用已一致` : `${item.property}引用与预览不同，请处理差异`})) ?? [],
    ...host.flow.preview?.expressionChanges.map(item => ({table: host.models.tableName, id: `${item.id}.${item.property}`,
      result: host.models.rows.find(row => host.models.getPkKey(row) === item.id)?.[item.property] === item.after ? `${item.name}.${item.property}已一致` : `${item.name}.${item.property}与预览不同，请处理差异`})) ?? [],
    ...host.flow.preview?.fieldExpressionChanges.map(item => ({table: host.fields.tableName, id: `${item.id}.ValueFun`,
      result: host.fields.rows.find(row => host.fields.getPkKey(row) === item.id)?.['ValueFun'] === item.after ? `${item.name}.ValueFun已一致` : `${item.name}.ValueFun与预览不同，请处理差异`})) ?? [],
    ...host.flow.relationEdits.map(item => ({table: host.relations.tableName, id: item.id,
      result: host.relations.rows.find(row => host.relations.getPkKey(row) === item.id)?.['filter'] === item.patch['filter'] ? '关系表达式已一致' : '关系表达式与预览不同，请处理差异'}))]
  const confirmed = matched && additions.every(item => item.result === '新增字段已一致')
  if (confirmed) modelSourceEditInvalidateChangedSiblings(host)
  return confirmed
}

function modelSourceEditInvalidateChangedSiblings(host: ModelSourceEditHost, adopting = false) {
  const changed = [...adopting || host.flow.fieldEdits.length || host.flow.added.length || host.flow.removed.length ? [host.fields] : [],
    ...adopting || host.flow.relationEdits.length ? [host.relations] : []]
  const consumers: DataView[] = []
  for (const source of changed) source.dataTable?.forEachView(view => {
    if (view === source && host.views.includes(source) || view.requestState === RequestState.Idle) return
    if (source === host.fields) {
      const modelId = view.queryContext['modelId'], modelIds = view.queryContext['modelIds']
      const scoped = typeof modelId === 'string' && modelId ? [modelId] : Array.isArray(modelIds) ? modelIds : null
      if (scoped?.length && !scoped.includes(host.modelId)
        && !view.rows.some(row => row['dataModelId'] === host.modelId)) return
    }
    consumers.push(view)
  })
  // 先核完受影响消费者，避免后续视图存在草稿或在途查询时已清掉前面的视图。
  if (consumers.some(view => [RequestState.Preparing, RequestState.Loading].includes(view.requestState) || view.mutating
    || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw new Error('其他元数据草稿或查询尚未处理，不能废弃旧查询')
  for (const view of consumers) view.clearAll()
}

function modelSourceEditVerificationSnapshot(host: ModelSourceEditHost) {return JSON.stringify([modelSourceEditSnapshot(host), host.flow.added.map(item => host.fields.rows.find(row => host.fields.getPkKey(row) === item.id))])}

function modelSourceEditFinish(host: ModelSourceEditHost, updateConsumers = false) {
  host.flow.status = 'idle'; host.flow.preview = null; host.flow.expected = ''; host.flow.pendingSnapshot = ''; host.flow.patch = {}; host.flow.verifiedSnapshot = ''; host.flow.verification = []; host.flow.fieldEdits = []; host.flow.relationEdits = []; host.flow.modelEdits = []; host.flow.added = []; host.flow.removed = []; host.flow.mappings.clear(); host.flow.included.clear(); host.flow.removals.clear(); host.flow.inputs.clear(); host.flow.acceptedContracts.clear(); host.flow.contractPlan = null
  if (updateConsumers) host.lifecycle.completed()
}

/** 仅放弃本操作未改变的delta并核验正式结果；不会重放写入。 */
export async function modelSourceEditVerify(host: ModelSourceEditHost): Promise<Readonly<{confirmed: boolean; modelId: string | null}>> {
  modelSourceEditAssertOwner(host)
  const recovery = modelSourceEditFlowStatus(host)
  if (recovery === 'configuration' && host.flow.contractPlan) {
    host.dataSet.abandonUnconfirmedSaves()
    if (!await modelSourceEditReadback(host)) throw new Error('数据库定义已变化，保留待确认的文件迁移；不会重复提交数据库')
    await host.flow.contractPlan.complete(true); modelSourceEditFinish(host, true)
    return {confirmed: true, modelId: host.modelId}
  }
  if (!['unknown', 'readback', 'unsubmitted', 'different'].includes(recovery)) throw new Error('没有待核验来源替换或请求仍在进行')
  host.dataSet.abandonUnconfirmedSaves()
  modelSourceEditAssertClean(host, true, true)
  const unsubmitted = recovery === 'unsubmitted'
  if (host.models.hasEditingChanges(host.modelId)) {
    const patch = host.models.getEditingPatch(host.modelId) ?? {}
    if (!unsubmitted || Object.keys(patch).length !== Object.keys(host.flow.patch).length
      || Object.entries(patch).some(([key, value]) => !Object.is(host.flow.patch[key], value))) throw new Error('本次来源编辑已改变，不能自动放弃')
  }
  if (host.models.dirtyTracking.hasPendingChanges(host.modelId)) {
    if (JSON.stringify(modelSourceEditCurrent(host)) !== host.flow.pendingSnapshot) throw new Error('本次来源草稿已改变，不能自动放弃')
  }
  for (const item of host.flow.modelEdits) {
    const patch = host.models.getEditingPatch(item.id)
    if (patch && (!unsubmitted || Object.keys(patch).length !== Object.keys(item.patch).length
      || Object.entries(patch).some(([key, value]) => !Object.is(item.patch[key], value)))) throw new Error('依赖模型编辑已改变，不能自动放弃')
    if (host.models.dirtyTracking.hasPendingChanges(item.id) && JSON.stringify(modelSourceEditCurrent(host, item.id)) !== item.snapshot) throw new Error('依赖模型草稿已改变，不能自动放弃')
  }
  for (const item of host.flow.fieldEdits) {
    const patch = host.fields.getEditingPatch(item.id)
    if (patch && (!unsubmitted || Object.keys(patch).length !== Object.keys(item.patch).length
      || Object.entries(patch).some(([key, value]) => !Object.is(item.patch[key], value)))) throw new Error('字段映射编辑已改变，不能自动放弃')
    if (host.fields.dirtyTracking.hasPendingChanges(item.id) && JSON.stringify(modelSourceEditFieldRow(host, item.id)) !== item.snapshot) throw new Error('字段映射草稿已改变，不能自动放弃')
  }
  for (const item of host.flow.added) if (host.fields.hasEditingChanges(item.id) || host.fields.dirtyTracking.hasPendingChanges(item.id)
    && (!host.fields.dirtyTracking.isPendingCreate(item.id) || JSON.stringify(modelSourceEditFieldRow(host, item.id)) !== item.snapshot)) throw new Error('新增字段草稿已改变，不能自动放弃')
  for (const item of host.flow.removed) if (host.fields.hasEditingChanges(item.id) || host.fields.dirtyTracking.hasPendingChanges(item.id)
    && JSON.stringify(host.fields.dirtyTracking.getPendingDeleteSnapshot(item.id)) !== JSON.stringify(item.row)) throw new Error('待删除字段草稿已改变，不能自动放弃')
  for (const item of host.flow.relationEdits) {
    const patch = host.relations.getEditingPatch(item.id)
    if (patch && (!unsubmitted || Object.keys(patch).length !== 1 || patch['filter'] !== item.patch['filter'])) throw new Error('关系迁移编辑已改变，不能自动放弃')
    if (host.relations.dirtyTracking.hasPendingChanges(item.id) && JSON.stringify(modelSourceEditRelationRow(host, item.id)) !== item.snapshot) throw new Error('关系迁移草稿已改变，不能自动放弃')
  }
  host.models.discardPendingChanges([host.modelId, ...host.flow.modelEdits.map(item => item.id)])
  host.fields.discardPendingChanges([...host.flow.fieldEdits, ...host.flow.added, ...host.flow.removed].map(item => item.id))
  host.relations.discardPendingChanges(host.flow.relationEdits.map(item => item.id))
  host.flow.status = 'saving'
  try {
    if (unsubmitted) {host.flow.fieldEdits = []; host.flow.relationEdits = []; host.flow.modelEdits = []; host.flow.added = []; host.flow.removed = []; await modelSourceEditReload(host); host.flow.status = 'ready'; return {confirmed: false, modelId: null}}
    const confirmed = await modelSourceEditReadback(host)
    if (confirmed && host.flow.contractPlan) {host.flow.status = 'configuration'; await host.flow.contractPlan.complete(false)}
    if (confirmed) modelSourceEditFinish(host, true); else host.flow.status = 'different'
    return {confirmed, modelId: confirmed ? host.modelId : null}
  } catch (error) {if (host.flow.status !== 'configuration') host.flow.status = 'readback'; throw error}
}

/** 显式采用刚回读的正式状态；不补写，也不宣称原替换已成功。 */
export function modelSourceEditAcceptCurrent(host: ModelSourceEditHost) {
  modelSourceEditAssertClean(host)
  if (host.flow.status !== 'different' || host.flow.verifiedSnapshot !== modelSourceEditVerificationSnapshot(host)) throw new Error('请先核验当前正式结果')
  // 差异采用不证明原提交成功；正式结果可能含未计划的字段/关系变化，旧消费者须重查。
  modelSourceEditInvalidateChangedSiblings(host, true)
  modelSourceEditFinish(host, true)
}
export type ModelSourceEditHandle = {
  getState(): ReturnType<typeof modelSourceEditGetState>
  confirmFieldContract(input: Readonly<{fieldId: string; accepted: boolean}>): void
  previewBoundSource(): Promise<void>
  mapField(input: Readonly<{fieldId: string; sourceName: string}>): Promise<void>
  includeField(input: Readonly<{sourceName: string; included: boolean}>): Promise<void>
  removeField(input: Readonly<{fieldId: string; removed: boolean}>): Promise<void>
  configureInput(input: Readonly<{sourceName: string; value: string}>): void
  preview(source: Parameters<Reader['prepare']>[0]): Promise<void>
  discard(): void
  save(): Promise<string>
  verify(): Promise<Readonly<{confirmed: boolean; modelId: string | null}>>
  acceptCurrent(): void
}

export function createModelSourceEditHandle(host: ModelSourceEditHost): ModelSourceEditHandle {
  return {
    getState: () => modelSourceEditGetState(host),
    confirmFieldContract: input => modelSourceEditConfirmFieldContract(host, input),
    previewBoundSource: () => modelSourceEditPreviewBoundSource(host),
    mapField: input => modelSourceEditMapField(host, input),
    includeField: input => modelSourceEditIncludeField(host, input),
    removeField: input => modelSourceEditRemoveField(host, input),
    configureInput: input => modelSourceEditConfigureInput(host, input),
    preview: source => modelSourceEditPreview(host, source),
    discard: () => modelSourceEditDiscard(host),
    save: () => modelSourceEditSave(host),
    verify: () => modelSourceEditVerify(host),
    acceptCurrent: () => modelSourceEditAcceptCurrent(host),
  }
}

/** @deprecated 兼容旧类名；新代码使用 ModelSourceEditHandle。 */
export type LowcodeDataSpaceModelSourceEdit = ModelSourceEditHandle
