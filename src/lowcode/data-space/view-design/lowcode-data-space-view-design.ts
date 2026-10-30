import {ScenarioDefinitionResource, ScenarioDefinitionRecords, DataSpaceReferenceLayoutResource, ProjectToolResource} from '@spark-appworks/spark-project-model'
import { DataSpaceDesignApi, DataSpaceRuntimeApi } from '@spark-appworks/spark-lowcode-api'
import * as SparkData from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'
import { ScenarioViewConfig, ScenarioViewFile, type ProjectBlueprintTreeData, type ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type { LowcodeDataSpaceAssembly } from '../lowcode-data-space-assembler'
import { LowcodeDataSpaceViewLayout } from './lowcode-data-space-view-layout'
import { LowcodeDataSpaceViewMetadata } from './lowcode-data-space-view-metadata'
import {createPageToolFileResourceExecutor} from '@/services/project/page-tool-file-dataview'
import { LowcodeDataSpaceViewFields } from './lowcode-data-space-view-fields'
import { LowcodeDataSpaceFieldValue } from '../model-source/field/lowcode-data-space-field-value'
import { LowcodeDataSpaceRelationMetadata } from './lowcode-data-space-relation-metadata'
import { LowcodeDataSpaceCascadeMetadata } from './lowcode-data-space-cascade-metadata'

import {
  createInputParameterEditHost, inputParameterGetState, inputParameterReload, inputParameterSave, inputParameterStage,
  type InputParameterEditHost, type ParameterEditStatus,
} from '../input-parameters/lowcode-data-space-input-parameter-session'
import { LowcodeDataSpaceInputParameterReferences, type InputParameterInspection } from '../input-parameters/lowcode-data-space-input-parameter-references'
import {createSourceInputHandle, createSourceInputHost, type SourceInputHandle} from '../model-source/source/lowcode-data-space-source-input-session'
import {createModelEditHandle, createModelEditHost, type ModelEditSession} from '../model-source/model/lowcode-data-space-model-edit-session'
import {createArrayHandle, createArrayHost, type ArrayDefinitionChange, type ArrayEditHandle} from '../model-source/array/lowcode-data-space-array-session'
import { LowcodeDataSpaceArrayConfiguration } from '../model-source/array/lowcode-data-space-array-configuration'
import {createModelRenameHandle, createModelRenameHost, type ModelRenameFilePlan, type ModelRenameHandle} from '../model-source/rename/lowcode-data-space-model-rename-session'
import { LowcodeDataSpaceModelRenameTools } from '../model-source/rename/lowcode-data-space-model-rename-tools'
import {createModelRemoveHandle, createModelRemoveHost, type LowcodeDataSpaceModelRemovalFilePlan, type ModelRemoveHandle} from '../model-source/removal/lowcode-data-space-model-remove-session'
import {createFieldEditHandle, createFieldEditHost, type FieldEditSession} from '../model-source/field/lowcode-data-space-field-edit-session'
import {createFieldCreateHandle, createFieldCreateHost, type FieldCreateHandle} from '../model-source/field/lowcode-data-space-field-create-session'
import {createFieldRemoveHandle, createFieldRemoveHost, type FieldRemoveHandle} from '../model-source/removal/lowcode-data-space-field-remove-session'
import { LowcodeDataSpaceFieldRemoveReferences } from '../model-source/removal/lowcode-data-space-field-remove-references'
import { LowcodeDataSpaceFieldOutput } from '../model-source/field/lowcode-data-space-field-output'
import {createModelCreateHandle, createModelCreateHost, type ModelCreateHandle, type ModelCreateSources} from '../model-source/model/lowcode-data-space-model-create-session'
import {
  createModelSourceEditHandle,
  createModelSourceEditHost,
  type ModelSourceEditHandle,
  type SourceContractChange,
  type SourceContractPlan,
} from '../model-source/source/lowcode-data-space-model-source-edit-session'
import { LowcodeDataSpaceModelDependencies } from '../model-source/model/lowcode-data-space-model-dependencies'
import { LowcodeDataSpaceQueryPreview } from './preview/lowcode-data-space-query-preview'
import {LowcodeDataSpaceMetadata} from '../lowcode-data-space-metadata'
import {LowcodeModelRelationAdapter} from '../lowcode-model-relation-adapter'

type DataViewExecutor=Parameters<SparkData.DataView['bindQueryExecutor']>[0]
function readOnlyFileExecutor(executor:DataViewExecutor):DataViewExecutor{
  const source=executor.source
  return {
    ...executor,
    executeQuery:async(view,params)=>{
      const result=await executor.executeQuery(view,params)
      return {...result,
        fieldAccess:(key,field)=>{const access=result.fieldAccess(key,field);return {...access,write:'denied' as const,
          component:access.read==='invisible'?'hidden' as const:'readonly' as const,writeMode:'readonly' as const}},
        addActionState:()=> 'disabled' as const,editActionState:()=> 'disabled' as const,
        deleteActionState:()=> 'disabled' as const,createChildActionState:()=> 'disabled' as const}
    },
    save:()=>Promise.reject(new Error('SCENARIO_VIEW_PREVIEW_READ_ONLY: 预览不提交工具文件')),
    ...(source?{source:{...source,
      adopt:()=>Promise.reject(new Error('SCENARIO_VIEW_PREVIEW_READ_ONLY: 预览不采用工具文件')),
      ...(source.history?{history:{...source.history,create:()=>Promise.reject(new Error('SCENARIO_VIEW_PREVIEW_READ_ONLY: 预览不创建工具快照'))}}:{})}}:{})
  }
}

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type PageDataSpaceViewState = Readonly<{
  scenarioId: string
  text: string
  config: Readonly<Record<string, unknown>>
  persisted: boolean
  dirty: boolean
  revision: number
  saveStatus: 'idle' | 'pending' | 'unknown'
  submittedText: string | null
}>
type PageDataSpaceViewModelInput = Readonly<{ scenarioId: string; modelId: string; modelName: string }>
type PageDataSpaceViewSelection = Readonly<{
  scenarioId: string
  tableName: string
  modelId: string
  modelName: string
  viewId: string
}>

export type ViewDesignAssembleInput = Readonly<{
  scenarioId: string
  config: ScenarioViewConfig
  /** 当前设计会话的正式元数据DataSet；仅设计预览/装配读取复用此查询owner。 */
  metadataDataSet?: SparkData.DataSet
  fileExecutors?: Readonly<Record<string, Parameters<SparkData.DataView['bindQueryExecutor']>[0]>>
  modelScope?: string
}>

type ViewDesignOptions = Readonly<{
  workspace: ProjectWorkspace
  /** 已注册并提供 executor 的 file resource；新绑定校验/预览与正式运行共用同一适配器。 */
  fileResourceExecutors?: Readonly<Record<string, Parameters<SparkData.DataView['bindQueryExecutor']>[0]>>
  readModel(input: PageDataSpaceViewModelInput, metadata: SparkData.DataSet): Promise<FormalModel>
  /**
   * 装配不可变运行配置；文件身份、版本与保存仍由设计owner核定。
   * scenarioId 必须与 config 一致；fileExecutors 为文件资源既有查询适配；modelScope 可选表键。
   * @returns 独立SparkData.DataSet与转换诊断；调用者负责拒绝不完整预览并释放实例。
   */
  assemble(input: ViewDesignAssembleInput): Promise<LowcodeDataSpaceAssembly>
  loadMetadata?(targetId: string, fileExecutors?: Readonly<Record<string, Parameters<SparkData.DataView['bindQueryExecutor']>[0]>>): Promise<SparkData.DataSet>
  readLegacyLayout?(targetId: string): Promise<string | null>
  /** 当前应用绑定的正式来源查询及精确预览能力，供原生新增模型使用。 */
  modelSources?: ModelCreateSources
  assertScope(): void
}>

type SessionSelection = Omit<PageDataSpaceViewSelection, 'scenarioId'>
/** 选定模型下的命名视图；数据库使用正式模型身份，文件使用原生表键与资源身份，二者不可混用。 */
type NativeViewSelection = SessionSelection | Readonly<{tableName: string; viewId: string; fileResourceId: string}>
type SessionAdopt = Readonly<{
  expectedRevision: number
  previewText: string | null
  /** 仅在远端核对成功后允许取消的文件定义视图；未列出的脏视图保持并阻止接纳。 */
  discardViews?: ReadonlyArray<Pick<SparkData.DataView, 'tableName' | 'viewId'>>
}>
/** 当前会话的加载阶段；省略时完成目标定义装配后交付。 */
export type SessionLoadOptions = Readonly<{
  /** 先交付元数据概览，目标定义由同一会话的loadDefinition按需装配。 */
  deferDefinition?: boolean
  /** 由页面唯一 PageRuntime 持有的正式导航 DataView 投影；工具目录查询时惰性调用。 */
  blueprintTreeProjection?: () => ProjectBlueprintTreeData | Promise<ProjectBlueprintTreeData>
}>

/** 当前定义操作实际依赖的读取范围和预览快照。 */
type DefinitionReadOptions = Readonly<{
  /** 布局或模型预览允许目标空间尚无运行投影。 */
  allowMissingDefinition?: boolean
  /** 读取已保存初值的正式模型预览ID。 */
  previewModelId?: string
  /** 由字段工作区提供的本次快照校验。 */
  fieldPreviewGuard?: () => void
  /** The sole pending create consumed by a named-view draft preview. */
  newViewDraft?: Readonly<{id: string; signature: string}>
  /** The preview's selected resource identity, checked against the complete owner/model query results. */
  previewIdentity?: NativeViewSelection
  /** 命令需要完整读取的元表；不为布局保存扩大到字段/关系。 */
  metadataNames?: readonly string[]
}>
/** 精确解除当前场景文件中的数据库或文件模型绑定；不删除来源资源的内容。 */
type SessionBindingRemoval = Readonly<Pick<SessionSelection, 'tableName'> & (Pick<SessionSelection, 'modelId' | 'modelName'> | {
  /** 文件资源的正式标识；与数据库modelId/modelName互斥，由当前查询配置核定。 */
  resourceId: string
}) & {
  /** 预览确认时的完整文件原文；与当前草稿不同则拒绝解除。 */
  expectedText: string
}>
type DesignSessionConstruction = Readonly<{
  targetId: string
  metadataDataSet: SparkData.DataSet
  design: LowcodeDataSpaceViewDesign
  options: ViewDesignOptions
  definitionResource: ScenarioDefinitionResource
  blueprintTreeProjection?: SessionLoadOptions['blueprintTreeProjection']
}>
type PrepareModelConfigurationChangeInput = Readonly<{
  modelId: string
  before: string
  after: string
  arrayChange?: ArrayDefinitionChange
  sourceChange?: SourceContractChange
}>
function projectionConfig(dataSet: SparkData.DataSet): string {
  const config = dataSet.toJson()
  for (const table of Object.values(config.tables)) {
    for (const view of Object.values(table.views)) delete view.rows
  }
  return JSON.stringify(config)
}

function assertFormalTarget(dataSet: SparkData.DataSet, targetId: string, assertCurrent: () => void): void {
  assertCurrent()
  const view = dataSet.getView('Base_DataSet', 'default')
  const rows = view?.rows.filter(row => row['rowid'] === targetId) ?? []
  const row = rows[0]
  if (dataSet.destroyed || !view || view.destroyed
    || view.requestState !== SparkData.RequestState.Loaded || view.rows.length !== view.total || view.total !== 1
    || view.queryContext['dataSpaceId'] !== targetId || rows.length !== 1 || !row
    || view.fieldAccess(row, 'rowid').read !== 'visible') {
    throw new Error('DATA_SPACE_DESIGN_TARGET_UNCONFIRMED: 目标数据空间未由正式Base_DataSet唯一确认')
  }
  assertCurrent()
}

/** The file owns editable definitions; assembled DataSets are disposable projections of its revision. */
export class LowcodeDataSpaceDesignSession {
  readonly targetId: string
  readonly metadataDataSet: SparkData.DataSet
  #file: ScenarioViewFile | null = null
  #definition: SparkData.DataSet | null = null
  #definitionError: Error | null = null
  #relationDefinitionKey: string | null = null
  #relationDefinitionReadVersion = 0
  #definitionLoad: Promise<void> | null = null
  #diagnostics: readonly string[] = Object.freeze([])
  #projectionConfig: string | null = null
  #unsubscribe: (() => void) | null = null
  #generation = 0
  #viewFields: {key: string; columns: readonly SparkData.DataColumn[]; outputProjection?: ReturnType<typeof LowcodeDataSpaceViewFields.project>['outputProjection']} | null = null
  #viewFieldLoad: {key: string; task: Promise<void>} | null = null
  readonly #modelFieldReads = new Map<string, {key: string; model?: FormalModel; columns?: readonly SparkData.DataColumn[]; task: Promise<readonly SparkData.DataColumn[]>}>()
  #disposed = false
  readonly #previewInvalidationListeners = new Set<() => void>()
  readonly #metadata: LowcodeDataSpaceMetadata
  readonly #viewMetadata: LowcodeDataSpaceViewMetadata
  readonly #relationMetadata: LowcodeDataSpaceRelationMetadata
  readonly #cascadeMetadata: LowcodeDataSpaceCascadeMetadata
  readonly #blueprintTreeProjection?: SessionLoadOptions['blueprintTreeProjection']
  #inputParameterHost: InputParameterEditHost | null = null
  readonly #sourceInputs = new Map<string, SourceInputHandle>()
  readonly #modelEdits = new Map<string, ModelEditSession>()
  readonly #arrayEdits = new Map<string, ArrayEditHandle>()
  readonly #modelRenames = new Map<string, ModelRenameHandle>()
  readonly #modelRemovals = new Map<string, ModelRemoveHandle>()
  readonly #fieldEdits = new Map<string, FieldEditSession>()
  readonly #fieldCreates = new Map<string, FieldCreateHandle>()
  readonly #fieldRemovals = new Map<string, FieldRemoveHandle>()
  #modelCreate: ModelCreateHandle | null = null
  readonly #modelSources = new Map<string, ModelSourceEditHandle>()
  readonly #sourceRemovalDependencies = new Map<string, LowcodeDataSpaceModelDependencies>()
  readonly #fieldOutputDependencies = new Map<string, LowcodeDataSpaceModelDependencies>()

  private readonly design: LowcodeDataSpaceViewDesign
  private readonly options: ViewDesignOptions
  private readonly definitionResource: ScenarioDefinitionResource

  constructor(input: DesignSessionConstruction) {
    const {targetId, metadataDataSet, design, options, definitionResource, blueprintTreeProjection} = input
    this.targetId = targetId
    this.metadataDataSet = metadataDataSet
    this.design = design
    this.options = options
    this.definitionResource = definitionResource
    this.#blueprintTreeProjection = blueprintTreeProjection
    this.#metadata = new LowcodeDataSpaceMetadata(metadataDataSet, targetId, () => this.assertLive())
    this.#viewMetadata = new LowcodeDataSpaceViewMetadata(metadataDataSet)
    this.#relationMetadata = new LowcodeDataSpaceRelationMetadata(metadataDataSet, definitionResource)
    this.#cascadeMetadata = new LowcodeDataSpaceCascadeMetadata(metadataDataSet)
  }

  private assertLive(): void {
    if (this.#disposed) throw new Error('DATA_SPACE_DESIGN_SESSION_DISPOSED: 会话已释放')
    try { this.options.assertScope() } catch (error) { this.dispose(); throw error }
  }

  /** 参数声明链路的 scope 校验：失效时 fail-fast，但不释放整段设计会话。 */
  private assertInputParameterContext(): void {
    if (this.#disposed) throw new Error('DATA_SPACE_DESIGN_SESSION_DISPOSED: 会话已释放')
    this.options.assertScope()
  }

  private assertOwner(): void {
    this.assertLive()
    const current = this.options.workspace.getScenarioViews(this.targetId)
    if (!this.#file && this.definitionResource.ownsCreatedFile(current)) this.attach(current)
    if (current !== this.#file) {
      this.attach(null)
      throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 视图文件 owner 已变化，请刷新')
    }
  }

  private invalidate(options: {preserveModelInputs?: boolean} = {}): void {
    this.#generation++
    this.#definitionLoad = null
    this.#viewFields = null
    this.#viewFieldLoad = null
    this.#modelFieldReads.clear()
    if (!this.metadataDataSet.destroyed) this.#viewMetadata.setFieldOptions(null)
    const inputs = this.metadataDataSet.destroyed ? undefined : this.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')
    if (!options.preserveModelInputs && inputs?.queryContext['modelId'] !== undefined) {
      inputs.configure({queryContext: {dataSpaceId: this.targetId, modelId: '', modelIds: []}})
      inputs.replaceRows([])
    }
    this.#definition?.destroy()
    this.#definition = null
    this.#definitionError = null
    this.#diagnostics = Object.freeze([])
    this.#relationDefinitionKey = null
    this.#projectionConfig = null
  }

  private assertMetadataClean(): void {
    this.#viewMetadata.assertClean()
    this.#relationMetadata.assertClean()
    this.#cascadeMetadata.assertClean()
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
    this.invalidate({preserveModelInputs: true})
    this.#file = file
    if (file) {
      let text = file.getText()
      this.#unsubscribe = file.subscribe(() => {
        // 保存状态/回执不改变定义；只在原文改变或owner失效时丢弃投影。
        let current: string
        try {current = file.getText()} catch {this.invalidate({preserveModelInputs: true}); return}
        if (current !== text) {text = current; this.invalidate({preserveModelInputs: true})}
        else this.#generation++ // 仍使在途编辑校验失效，不能跨过提交状态变化继续暂存。
      })
    }
  }

  get viewState(): PageDataSpaceViewState | null {
    this.assertOwner()
    return this.#file ? state(this.#file) : null
  }

  private modelFieldSnapshot(tableName: string) {
    this.assertOwner()
    const file = this.#file, tables = file?.value.toJSON()['tables']
    let table = isRecord(tables) ? tables[tableName] : undefined
    if (table === undefined) {
      // 首个视图尚未保存时，模型绑定只从原定义SparkData.DataView的新增记录读取，不另存绑定草稿。
      const definitions = this.metadataDataSet.getView('DataViewDefinition', 'default')
      const pending = definitions?.rows.filter(row => row['tableName'] === tableName).map(row => {
        const key = definitions.getPkKey(row), draft = key === undefined ? undefined : definitions.getEditingRow(key)
        if (key === undefined || !definitions.dirtyTracking.isPendingCreate(key) || draft?.['dataSetId'] !== this.targetId
          || draft['tableName'] !== tableName || typeof draft['dataModelId'] !== 'string' || typeof draft['dataModelName'] !== 'string'
          || ['dataSetId', 'tableName', 'dataModelId', 'dataModelName'].some(field => definitions.fieldAccess(row, field).read !== 'visible')) {
          throw new Error('字段目录新增绑定身份不可确认')
        }
        return {modelId: draft['dataModelId'], modelName: draft['dataModelName']}
      }) ?? []
      const binding = pending[0]
      if (binding && pending.every(item => item.modelId === binding.modelId && item.modelName === binding.modelName)) table = {modelBinding: binding}
    }
    const binding = isRecord(table) ? table['modelBinding'] : undefined
    if (file && isRecord(table) && table['resourceType'] === 'file' && binding === undefined) {
      // 文件模型以正式声明的资源及字段为真源，不伪造数据库模型身份或补查Base_DataModel_Field。
      return {file, table, input: undefined, sourceName: undefined, key: JSON.stringify([tableName, table['resourceId'], table['columns']])}
    }
    if (!file || !isRecord(table) || !isRecord(binding) || typeof binding['modelId'] !== 'string' || typeof binding['modelName'] !== 'string') {
      throw new Error('字段目录绑定与正式模型不一致')
    }
    const input = {scenarioId: this.targetId, modelId: binding['modelId'], modelName: binding['modelName']}
    const models = this.metadataDataSet.getView('Base_DataModel', 'default')
    const matches = models?.rows.filter(row => row['rowid'] === input.modelId) ?? [], model = matches[0]
    if (models?.requestState !== SparkData.RequestState.Loaded
      || models.queryContext['dataSpaceId'] !== this.targetId || models.dataTable?.modelBinding?.modelName !== 'Base_DataModel'
      || !model || matches.length !== 1 || model['Name'] !== input.modelName || model['dataSetId'] !== this.targetId
      || ['rowid', 'dataSetId', 'Name', 'MetaName'].some(field => models.fieldAccess(model, field).read !== 'visible')) {
      throw new Error('字段目录模型身份不可确认')
    }
    return {file, table, input, sourceName: model['MetaName'], key: JSON.stringify([tableName, input, model, table['columns']])}
  }

  private viewFieldSnapshot(input: NativeViewSelection) {
    const snapshot = this.modelFieldSnapshot(input.tableName)
    const fileModel = 'fileResourceId' in input
    if (fileModel ? snapshot.input !== undefined || snapshot.table['resourceId'] !== input.fileResourceId
      : snapshot.input?.modelId !== input.modelId || snapshot.input.modelName !== input.modelName) throw new Error('字段目录模型身份不可确认')
    const view = this.metadataDataSet.getView('DataViewDefinition', 'default')
    const rows = view?.rows.filter(row => row['tableName'] === input.tableName && row['viewId'] === input.viewId) ?? [], row = rows[0]
    const rowKey = row && view?.getPkKey(row), definition = rowKey === undefined ? undefined : view?.getEditingRow(rowKey)
    if (!view || !row || rows.length !== 1 || definition?.['dataSetId'] !== this.targetId
      || (fileModel ? definition['dataModelId'] !== undefined || definition['dataModelName'] !== undefined : definition['dataModelId'] !== input.modelId || definition['dataModelName'] !== input.modelName)
      || ['dataSetId', ...fileModel ? [] : ['dataModelId', 'dataModelName'], 'tableName', 'viewId', 'fieldProjection', 'treeConfig', 'queryConfig'].some(field => view.fieldAccess(row, field).read !== 'visible')) {
      throw new Error('字段目录视图身份不可确认')
    }
    const projection = Object.fromEntries(['fieldProjection', 'treeConfig', 'queryConfig'].map(key => [key, definition[key]]))
    return {...snapshot, projection,
      // Save-state generations guard writes, not column identity. Real definition/model invalidation
      // already clears the catalog and pending read; query edits/receipts must not discard either.
      key: JSON.stringify([input, snapshot.key, projection['fieldProjection']])}
  }

  private readModel(input: PageDataSpaceViewModelInput): Promise<FormalModel> {
    this.assertLive()
    return this.options.readModel(input, this.metadataDataSet)
  }

  private async readModelColumns(tableName: string): Promise<readonly SparkData.DataColumn[]> {
    const snapshot = this.modelFieldSnapshot(tableName), previous = this.#modelFieldReads.get(tableName)
    if (previous?.key === snapshot.key) return previous.task
    const pending: {key: string; model?: FormalModel; columns?: readonly SparkData.DataColumn[]; task: Promise<readonly SparkData.DataColumn[]>} = {key: snapshot.key, task: Promise.resolve([])}
    this.#modelFieldReads.set(tableName, pending)
    pending.task = (async () => {
      if (!snapshot.input) {
        const table = SparkData.DataTable.fromJson({tableName, ...snapshot.table, views: {default: {autoLoad: false}}})
        try {pending.columns = Object.freeze(table.columns.filter(column => column.name !== '_pk').map(column => Object.freeze({...column})))}
        finally {table.destroy()}
        return pending.columns
      }
      const model = await this.readModel(snapshot.input)
      if (this.#modelFieldReads.get(tableName) !== pending || this.modelFieldSnapshot(tableName).key !== snapshot.key || this.#file !== snapshot.file) throw new Error('字段目录读取已过期')
      if (model.id !== snapshot.input.modelId || model.metaName !== snapshot.input.modelName || model.sourceName !== snapshot.sourceName) throw new Error('字段目录正式模型身份已变化')
      const columns = LowcodeDataSpaceViewFields.columns(model, snapshot.table['columns'], tableName).filter(column => column.name !== '_pk')
      pending.model = model
      pending.columns = Object.freeze(columns.map(column => Object.freeze(column)))
      return pending.columns
    })()
    try {return await pending.task} catch (cause) {
      if (this.#modelFieldReads.get(tableName) === pending) this.#modelFieldReads.delete(tableName)
      throw cause
    }
  }

  /**
   * 为选中原生关系读取父子及显式引用模型的字段，其他绑定通过标准独立编辑器按需读取。
   * @param rowKey 当前元数据SparkData.DataView中关系定义的主键；不接受另一空间或无读取许可的行。
   * @returns 条件字段与值函数目录；模型和字段来自正式readModel，缓存可丢弃，不装配完整目标或保存。
   * @throws 模型/关系身份、字段读取权限、文件或会话发生变化时拒绝旧目录。
   */
  async loadRelationFields(rowKey: string | number): Promise<Readonly<{columns: readonly SparkData.DataColumn[]; context: SparkData.DataViewFilterFunctionContext}>> {
    this.assertOwner()
    const file = this.#file, originalText = file?.getText()
    const view = this.metadataDataSet.getView('DataResourceRelationDefinition')
    const row = view?.getEditingRow(rowKey)
    const parent = row?.['parentTable'], child = row?.['childTable']
    const assertCurrent = (): void => {
      this.assertOwner()
      const current = view?.getEditingRow(rowKey)
      if (!file || this.#file !== file || file.getText() !== originalText || !view
        || current?.['dataSetId'] !== this.targetId || current['parentTable'] !== parent || current['childTable'] !== child
        || ['dataSetId', 'parentTable', 'childTable', 'filterExpression'].some(field => view.fieldAccess(current, field).read !== 'visible')) {
        throw new Error('关系字段目录身份已失效，请重新选择关系')
      }
    }
    assertCurrent()
    if (typeof parent !== 'string' || typeof child !== 'string' || !parent || !child) throw new Error('请选择当前空间已绑定的父模型和子模型；原条件保留，保存前重新校验')
    const tables = file?.value.toJSON()['tables']
    if (!isRecord(tables)) throw new Error('关系字段目录缺少模型绑定')
    // Validate catalogue identity before issuing any read, including models offered to value functions.
    const snapshots = Object.keys(tables).map(tableName => ({tableName, ...this.modelFieldSnapshot(tableName)}))
    const assertCatalogCurrent = (): void => {
      assertCurrent()
      if (snapshots.some(snapshot => this.modelFieldSnapshot(snapshot.tableName).key !== snapshot.key)) throw new Error('关系字段目录模型身份已变化')
    }
    const [parentColumns, childColumns] = await Promise.all([this.readModelColumns(parent), this.readModelColumns(child)])
    assertCatalogCurrent()
    const fields = (columns: readonly SparkData.DataColumn[]) => columns.map(column => ({name: column.name, label: column.label ?? column.name}))
    const parameters = this.metadataDataSet.getView('Base_DataSet', 'default')
    const spaceRow = parameters?.rows.find(item => parameters.getPkKey(item) === this.targetId)
    const inputParams = spaceRow && parameters?.fieldAccess(spaceRow, 'inputParams').read === 'visible'
      ? DataSpaceDesignApi.readInputParameters({value: spaceRow['inputParams'], editable: true}).map(item => {
        const name = item['Name']
        if (typeof name !== 'string') throw new Error('空间参数名称无效')
        return {label: name, value: name}
      }) : []
    const context = SparkData.DataViewFilter.editorContext({inputParams,
      relatedFields: parentColumns.flatMap(column => [{label: column.name, value: column.name}, {label: `${parent}.${column.name}`, value: `${parent}.${column.name}`}]),
      tables: snapshots.map(snapshot => {
        const cached = this.#modelFieldReads.get(snapshot.tableName)
        const columns = cached?.key === snapshot.key ? cached.columns : undefined
        return {name: snapshot.tableName, ...(columns ? {fields: fields(columns)} : {}), loadFields: async () => {
          assertCurrent()
          if (this.modelFieldSnapshot(snapshot.tableName).key !== snapshot.key) throw new Error('关系字段目录模型身份已变化')
          const result = await this.readModelColumns(snapshot.tableName)
          assertCurrent()
          return fields(result)
        }}
      })})
    const filter = SparkData.DataViewFilter.parse(row['filterExpression'])
    const resolved = filter.ok ? await filter.value.loadEditorContext(context) : context
    assertCatalogCurrent()
    return {columns: childColumns.flatMap(column => [column, {...column, name: `${child}.${column.name}`}]), context: resolved}
  }

  /** Read the selected view's disposable field catalog; null means it has not been loaded for this identity/configuration. */
  getViewFields(input: NativeViewSelection): readonly SparkData.DataColumn[] | null {
    const snapshot = this.viewFieldSnapshot(input)
    return this.#viewFields?.key === snapshot.key ? this.#viewFields.columns : null
  }
  /**
   * 当前正式模型的输出投影模板，与loadViewFields共用身份/字段读取；返回副本，不修改定义。
   * @param input 精确模型与命名视图身份。
   * @returns 目录尚未加载或文件资源返回null；用户显式初始化后才由原定义SparkData.DataView记录变更。
   * @throws 目标、模型、视图或会话身份失效时拒绝读取。
   */
  getViewOutputProjection(input: NativeViewSelection): readonly SparkData.DataViewFieldProjection[] | null {
    const snapshot = this.viewFieldSnapshot(input)
    return this.#viewFields?.key === snapshot.key && this.#viewFields.outputProjection
      ? structuredClone(this.#viewFields.outputProjection) : null
  }

  /**
   * 读取命名视图值函数的本模型、正式上游及关联字段目录，沿参考节点请求设置的语义提供候选。
   * @param input 当前空间中的精确模型绑定和视图；旧格式仅补读关系端点，原生格式直接使用文件关系。
   * @returns 模型名称为正式modelName，字段为本仓正式输出；与视图字段目录共用按模型读取，不装配完整目标或执行函数。
   * @throws 文件、正式模型、视图身份、可读权限或会话变化时拒绝过期目录；不改变原过滤定义。
   */
  async loadViewFilterContext(input: NativeViewSelection): Promise<SparkData.DataViewFilterFunctionContext> {
    const initial = this.viewFieldSnapshot(input), text = initial.file.getText()
    const assertCurrent = (): void => {
      const current = this.viewFieldSnapshot(input)
      if (current.file !== initial.file || current.file.getText() !== text || current.key !== initial.key) throw new Error('视图函数目录身份已变化')
    }
    return this.readFilterContext(input, assertCurrent)
  }

  /**
   * 为当前预览提供正式本模型与上游值函数目录，供标准r-filter消费。
   * @param preview 本空间仍有效的模型或命名视图预览；当前字段复用原SparkData.DataView查询来源合同。
   * @returns 正式模型名称及字段目录；仅补读尚未缓存的上游模型，不装配目标或修改预览与持久定义。
   * @throws 预览关闭、模型/文件/会话身份变化或上游字段不可读取时拒绝过期目录。
   */
  async loadPreviewFilterContext(preview: LowcodeDataSpaceQueryPreview): Promise<SparkData.DataViewFilterFunctionContext> {
    this.assertOwner()
    const view = preview.view, table = view.dataTable, binding = table?.modelBinding
    if (!table || view.dataSet?.scenarioId !== this.targetId) throw new Error('预览函数目录正式模型身份不一致')
    const input = binding ?? (table.resourceType === 'file' && table.resourceId ? {tableName: table.tableName, fileResourceId: table.resourceId} : undefined)
    if (!input) throw new Error('预览函数目录正式模型身份不一致')
    const assertCurrent = (): void => {
      this.assertOwner()
      if (preview.view !== view || view.dataTable !== table) throw new Error('预览函数目录身份已变化')
    }
    return this.readFilterContext(input, assertCurrent, view.queryColumns)
  }

  private async readFilterContext(input: Pick<SessionSelection, 'modelId' | 'modelName'> & {tableName?: string} | Readonly<{tableName: string; fileResourceId: string}>,
    assertCurrent: () => void, currentColumns?: readonly SparkData.DataColumn[]): Promise<SparkData.DataViewFilterFunctionContext> {
    const file = this.#file, text = file?.getText()
    const check = (): void => {
      assertCurrent()
      if (this.#file !== file || file?.getText() !== text) throw new Error('函数目录配置已变化')
    }
    check()
    if (file && !file.value.usesNativeResourceRelations) await this.#metadata.load(['Base_DataModel_Relation'])
    check()
    const tables = file?.value.toJSON()['tables']
    const entries = isRecord(tables) ? Object.entries(tables) : []
    if (input.tableName !== undefined && !entries.some(([name]) => name === input.tableName)) {
      entries.push([input.tableName, this.modelFieldSnapshot(input.tableName).table])
    }
    const matches = entries.filter(([name, table]) => 'fileResourceId' in input ? name === input.tableName
      : isRecord(table) && isRecord(table['modelBinding']) && table['modelBinding']['modelId'] === input.modelId)
    if (matches.length > 1 || !currentColumns && matches.length !== 1) throw new Error('视图函数目录模型绑定不唯一')
    const ownTable = matches[0]?.[0]
    if (ownTable) {
      const own = this.modelFieldSnapshot(ownTable)
      if ('fileResourceId' in input ? own.input !== undefined || own.table['resourceId'] !== input.fileResourceId
        : own.input?.modelId !== input.modelId || own.input.modelName !== input.modelName) throw new Error('视图函数目录模型身份不可确认')
    }
    const adapter = new LowcodeModelRelationAdapter()
    const bindings = new Map(entries.flatMap(([name, table]) => isRecord(table) && isRecord(table['modelBinding'])
      && typeof table['modelBinding']['modelId'] === 'string' ? [[name, {id: table['modelBinding']['modelId']}] as const] : []))
    const relations = file?.value.resolveResourceRelationEndpoints(file.value.usesNativeResourceRelations
      ? [] : adapter.endpoints(adapter.readMetadataEndpoints(this.metadataDataSet, this.targetId), bindings)) ?? []
    const names = ownTable ? [ownTable] : [], visited = new Set(names)
    for (const child of names) for (const relation of relations) {
      if (relation.childTable !== child || visited.has(relation.parentTable)) continue
      this.modelFieldSnapshot(relation.parentTable)
      names.push(relation.parentTable); visited.add(relation.parentTable)
    }
    const snapshots = (currentColumns ? names.slice(1) : names).map(tableName => ({tableName, ...this.modelFieldSnapshot(tableName)}))
    const columns = await Promise.all(snapshots.map(snapshot => this.readModelColumns(snapshot.tableName)))
    check()
    if (snapshots.some(snapshot => this.modelFieldSnapshot(snapshot.tableName).key !== snapshot.key)) throw new Error('视图函数目录模型身份已变化')
    const fields = (items: readonly SparkData.DataColumn[]) => items.filter(column => column.name !== '_pk' && !column.isComputed && !column.computeExpression)
      .map(column => ({name: column.name, label: column.label ?? column.name}))
    const directory = [...currentColumns ? [{name: 'fileResourceId' in input ? input.tableName : input.modelName, fields: fields(currentColumns)}] : [], ...snapshots.map((snapshot, index) => {
      const items = columns[index]
      if (!items) throw new Error('视图函数目录字段读取未完成')
      const model = this.#modelFieldReads.get(snapshot.tableName)?.model
      if (snapshot.input && !model) throw new Error('视图函数目录正式模型读取未完成')
      const outputs = model ? new Set(DataSpaceDesignApi.resolveOutputFields(model).map(field => field.canonicalName)) : undefined
      return {name: snapshot.input?.modelName ?? snapshot.tableName, fields: fields(outputs ? items.filter(column => outputs.has(column.name)) : items)}
    })]
    return SparkData.DataViewFilter.editorContext({
      tables: directory,
      relatedFields: directory.flatMap((table, index) => index === 0 ? [] : table.fields.map(field => ({
        label: `${table.name}.${field.label}`, value: `${table.name}.${field.name}`,
      }))),
    })
  }

  private async readViewFieldCatalog(input: NativeViewSelection) {
    const snapshot = this.viewFieldSnapshot(input)
    await this.readModelColumns(input.tableName)
    const model = this.#modelFieldReads.get(input.tableName)?.model
    if (this.viewFieldSnapshot(input).key !== snapshot.key || this.#file !== snapshot.file) throw new Error('字段目录读取已过期')
    let catalog: ReturnType<typeof LowcodeDataSpaceViewFields.project>
    if ('fileResourceId' in input) {
      const table = SparkData.DataTable.fromJson({tableName: input.tableName, ...snapshot.table, views: {default: {}, [input.viewId]: snapshot.projection}})
      try {
        const view = table.getOrCreateView(input.viewId)
        catalog = {columns: [...view.columns], selectionColumns: LowcodeDataSpaceViewFields.selectionColumns(view), primaryKeys: [...view.effectivePkFields]}
      } finally {table.destroy()}
    } else {
      if (model?.id !== input.modelId || model.metaName !== input.modelName || model.sourceName !== snapshot.sourceName) throw new Error('字段目录正式模型身份已变化')
      catalog = LowcodeDataSpaceViewFields.project({
        model, tableName: input.tableName, configured: snapshot.table['columns'], viewId: input.viewId, definition: snapshot.projection,
      })
    }
    return {snapshot, catalog}
  }

  /**
   * 为配置级联读取一个绑定视图的字段，写入元空间已有DataViewFieldOption，多个端点共享模型读取。
   * @param tableName 当前文件内的模型表键；正式模型身份从已核定绑定读取，不接受模型名或首表回退。
   * @param viewId 所属模型的命名视图；输出投影和主键/计算字段只读约束沿原生视图合同。
   * @returns 候选SparkData.DataView已刷新；不装配整个目标、不查询业务行、不修改定义或持久化。
   * @throws 不可读身份、失效作用域或读取期间的绑定/投影变化拒绝发布候选。
   */
  async loadCascadeFields(tableName: string, viewId: string): Promise<void> {
    const model = this.modelFieldSnapshot(tableName)
    let input: NativeViewSelection
    if (model.input) input = {tableName, viewId, modelId: model.input.modelId, modelName: model.input.modelName}
    else {
      const resourceId = model.table['resourceId']
      if (typeof resourceId !== 'string') throw new Error('字段目录缺少文件资源身份')
      input = {tableName, viewId, fileResourceId: viewName(resourceId, '文件资源')}
    }
    const {snapshot, catalog} = await this.readViewFieldCatalog(input)
    const assertCurrent = (): void => {
      if (this.viewFieldSnapshot(input).key !== snapshot.key || this.#file !== snapshot.file) throw new Error('字段目录读取已过期')
    }
    assertCurrent()
    await this.#viewMetadata.setViewFieldOptions(tableName, viewId, catalog)
    assertCurrent()
  }

  /**
   * Read only the selected formal model and project its named-view fields without assembling the target SparkData.DataSet.
   * @param input Exact table binding, model identity and view name in the current metadata definition view.
   * @returns Populates the existing field-option SparkData.DataView; no business query, definition edit or persistence occurs.
   * @throws Missing/read-restricted identity, changed file/scope or obsolete request prevents publication.
   */
  async loadViewFields(input: NativeViewSelection): Promise<void> {
    const snapshot = this.viewFieldSnapshot(input)
    if (this.#viewFields?.key === snapshot.key) return
    if (this.#viewFieldLoad?.key === snapshot.key) return this.#viewFieldLoad.task
    this.#viewFields = null
    this.#viewMetadata.setFieldOptions(null)
    const pending = {key: snapshot.key, task: Promise.resolve()}
    this.#viewFieldLoad = pending
    pending.task = (async () => {
      const {catalog} = await this.readViewFieldCatalog(input)
      if (this.#viewFieldLoad !== pending || this.viewFieldSnapshot(input).key !== snapshot.key || this.#file !== snapshot.file) throw new Error('字段目录读取已过期')
      await this.#viewMetadata.setViewFieldOptions(input.tableName, input.viewId, catalog)
      if (this.#viewFieldLoad !== pending || this.viewFieldSnapshot(input).key !== snapshot.key) throw new Error('字段目录读取已过期')
      this.#viewFields = {key: snapshot.key, columns: catalog.columns, outputProjection: catalog.outputProjection}
    })()
    try {await pending.task} finally {if (this.#viewFieldLoad === pending) this.#viewFieldLoad = null}
  }

  /** 工作区按需读取字段或来源关系，复用正式 SparkData.DataView；不是保存前的全量检查。 */
  async loadMetadataViews(names: ReadonlyArray<'Base_DataModel_Field' | 'Base_DataModel_Relation'>): Promise<void> {
    this.assertLive()
    await this.#metadata.load(names)
    this.assertLive()
  }

  /**
   * 当前文件的关系定义已可交给默认SparkData.DataView编辑；不代表整个目标SparkData.DataSet已经装配。
   * 原生文件直接就绪，旧格式须有完整投影或同文件/代次/正式来源的成功转换记录。
   * @returns 关系工作区是否就绪；源查询或身份不再成立时拒绝复用。
   */
  get relationDefinitionsReady(): boolean {
    this.assertOwner()
    if (this.#file?.value.usesNativeResourceRelations || this.#definition && !this.#definitionError) return true
    return this.#relationDefinitionKey !== null && this.#relationDefinitionKey === this.relationDefinitionSnapshot()
  }

  private relationDefinitionSnapshot(): string {
    return JSON.stringify([this.#generation, this.#file?.getText(),
      new LowcodeModelRelationAdapter().readMetadataRelations(this.metadataDataSet, this.targetId)])
  }

  /**
   * 读取完整旧关系并按端点/值函数依赖转换；不装配目标业务视图、不查询业务行或写旧库。
   * 不完整来源和转换诊断不能升级为原生定义；文件自身坏引用保留供显式修复。
   */
  async loadRelationDefinitions(): Promise<void> {
    this.assertOwner()
    const file = this.#file, text = file?.getText(), generation = this.#generation
    if (file?.value.usesNativeResourceRelations) {
      this.#viewMetadata.assertClean(); this.#cascadeMetadata.assertClean()
      if (this.#definition) this.assertProjectionClean()
      return
    }
    if (!file) return
    const adapter = new LowcodeModelRelationAdapter()
    const sourceView = this.metadataDataSet.getView('Base_DataModel_Relation', 'default')
    if (this.#relationDefinitionKey && sourceView?.requestState === SparkData.RequestState.Loaded && this.#relationDefinitionKey === this.relationDefinitionSnapshot()) {
      this.#viewMetadata.assertClean(); this.#cascadeMetadata.assertClean()
      if (this.#definition) this.assertProjectionClean()
      return // 同一已完整转换的工作区允许继续编辑，不能重查覆盖刚创建或修改的关系草稿。
    }
    this.assertMetadataClean()
    if (this.#definition) this.assertProjectionClean()
    const readVersion = ++this.#relationDefinitionReadVersion
    this.#relationDefinitionKey = null
    this.definitionResource.useResolvedRelations(file, undefined)
    const loaded = sourceView?.requestState === SparkData.RequestState.Loaded
    await this.#metadata.load(['Base_DataModel_Relation'])
    adapter.readMetadataRelations(this.metadataDataSet, this.targetId)
    // 已展示的目录可能查询过子集；完整转换须显式按正式空间范围重新查询，不能把子集当空/全量。
    if (loaded) {
      const filter = sourceView.filterExpression
      if (!filter) throw new Error('旧关系来源缺少目标空间范围过滤')
      const result = await sourceView.loadFromServer({allPages: true, filter})
      if (!result.success) throw new Error('旧关系来源重新查询失败')
      await this.#metadata.load(['Base_DataModel_Relation'])
    }
    const sources = adapter.readMetadataRelations(this.metadataDataSet, this.targetId), sourceText = JSON.stringify(sources)
    const check = () => {
      this.assertOwner(); this.assertMetadataClean()
      if (this.#relationDefinitionReadVersion !== readVersion || this.#file !== file || file.getText() !== text || this.#generation !== generation
        || JSON.stringify(adapter.readMetadataRelations(this.metadataDataSet, this.targetId)) !== sourceText) {
        throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 关系工作区读取已过期')
      }
    }
    check()
    const tables = file.value.toJSON()['tables']
    if (!isRecord(tables)) throw new Error('关系工作区缺少模型绑定')
    const identities = new Map<string, Pick<FormalModel, 'id' | 'name'>>()
    for (const [key, table] of Object.entries(tables)) {
      if (isRecord(table) && table['resourceType'] === 'file') continue
      const binding = isRecord(table) ? table['modelBinding'] : undefined
      if (!isRecord(binding)) throw new Error('关系工作区模型绑定不完整')
      identities.set(key, {id: viewName(binding['modelId'], '模型ID'), name: viewName(binding['modelName'], '模型名称')})
    }
    const needed = new Set(adapter.scopeDependencies(sources, identities).flatMap(relation =>
      [relation.parentTable, relation.childTable, ...relation.referencedTables]).filter(key => identities.has(key)))
    await Promise.all([...needed].map(key => this.readModelColumns(key)))
    check()
    const models = new Map<string, FormalModel>()
    for (const key of needed) {
      const model = this.#modelFieldReads.get(key)?.model
      if (!model) throw new Error(`关系工作区正式模型未读取: ${key}`)
      models.set(key, model)
    }
    const converted = adapter.adapt(sources, models), resolvedIds = new Set(converted.resourceRelations.map(relation => relation.sourceRelationId))
    const diagnostics = [...converted.diagnostics, ...sources.filter(source => !resolvedIds.has(source.sourceRelationId))
      .map(source => `旧关系未完整转换: ${source.sourceRelationId}`)]
    this.#diagnostics = Object.freeze(diagnostics)
    let resolved: SparkData.DataResourceRelation[]
    try {resolved = file.value.resolveResourceRelations(converted.resourceRelations)}
    catch (cause) {
      this.#definitionError = cause instanceof Error ? cause : new Error(String(cause))
      await this.#relationMetadata.reset(file)
      check()
      return
    }
    if (diagnostics.length) throw new Error(`SCENARIO_DEFINITION_INCOMPLETE: ${diagnostics.join('；')}`)
    this.definitionResource.useResolvedRelations(file, resolved)
    try {
      await this.#relationMetadata.reset(file, resolved)
      check()
      this.#relationDefinitionKey = this.relationDefinitionSnapshot()
    } catch (cause) {
      if (!this.#disposed && this.#relationDefinitionReadVersion === readVersion && generation === this.#generation
        && this.#file === file && file.getText() === text) this.definitionResource.useResolvedRelations(file, undefined)
      throw cause
    }
  }

  /**
   * 读取画布关系端点，保持完整运行定义未装配；标准画布绑定关系表的只读graph视图。
   * @returns 完成后graph只包含当前文件及可确认正式模型的端点；不会读取字段、查询业务行或保存。
   * @throws 元关系/模型权限与范围不符、文件改变或本次会话失效时拒绝显示旧端点。
   */
  async loadGraphRelations(): Promise<void> {
    this.assertOwner()
    const file = this.#file, generation = this.#generation
    const text = file?.getText()
    const assertCurrent = (): void => {
      this.assertOwner()
      if (generation !== this.#generation || this.#file !== file || file?.getText() !== text) throw new Error('画布关系读取已过期')
    }
    if (!file) {await this.#relationMetadata.resetGraph(null, []); assertCurrent(); return}
    try {
      if (!file.value.usesNativeResourceRelations) await this.#metadata.load(['Base_DataModel_Relation'])
      assertCurrent()
      const models = this.metadataDataSet.getView('Base_DataModel', 'default')
      if (models?.requestState !== SparkData.RequestState.Loaded || models.total !== models.rows.length
        || models.queryContext['dataSpaceId'] !== this.targetId || models.dataTable?.modelBinding?.modelName !== 'Base_DataModel') throw new Error('画布模型未完整读取')
      const tables = file.value.toJSON()['tables'], bindings = new Map<string, Pick<FormalModel, 'id'>>()
      if (!isRecord(tables)) throw new Error('画布缺少表配置')
      for (const [tableName, table] of Object.entries(tables)) {
        // 文件表的身份与字段由已解析配置声明，不存在后端Base_DataModel记录。
        if (isRecord(table) && table['resourceType'] === 'file') continue
        const binding = isRecord(table) ? table['modelBinding'] : undefined
        const rows = isRecord(binding) ? models.rows.filter(row => row['rowid'] === binding['modelId']) : []
        const row = rows[0]
        if (!isRecord(binding) || typeof binding['modelId'] !== 'string' || !row || rows.length !== 1 || row['Name'] !== binding['modelName']
          || row['dataSetId'] !== this.targetId || ['rowid', 'dataSetId', 'Name'].some(field => models.fieldAccess(row, field).read !== 'visible')) throw new Error('画布模型身份不可确认')
        bindings.set(tableName, {id: binding['modelId']})
      }
      const adapter = new LowcodeModelRelationAdapter()
      await this.#relationMetadata.resetGraph(file, file.value.resolveResourceRelationEndpoints(file.value.usesNativeResourceRelations
        ? [] : adapter.endpoints(adapter.readMetadataEndpoints(this.metadataDataSet, this.targetId), bindings)))
      assertCurrent()
    } catch (cause) {
      if (!this.metadataDataSet.destroyed && generation === this.#generation && this.#file === file) await this.#relationMetadata.resetGraph(null, [])
      throw cause
    }
  }

  /** 校验目标空间的参数声明并写入原元数据视图编辑态；不提交数据库或修改引用。 */
  private inputParameterHost(): InputParameterEditHost {
    this.assertInputParameterContext()
    if (!this.#inputParameterHost) {
      const view = this.metadataDataSet.getView('Base_DataSet', 'default')
      if (!view) throw new Error('DATA_SPACE_INPUT_PARAMETERS_CONTEXT: 缺少正式空间元数据视图')
      this.#inputParameterHost = createInputParameterEditHost(view, this.targetId, () => this.assertInputParameterContext())
    }
    return this.#inputParameterHost
  }

  stageInputParameters(input: Readonly<{expectedValue: unknown; value: unknown}>): void {
    inputParameterStage(this.inputParameterHost(), input)
  }

  /** FieldJson 等直接写 SparkData.DataView 时未必已创建 host；pending 仍须读正式视图编辑态。 */
  private inputParameterPendingFromView(): boolean {
    const view = this.metadataDataSet.getView('Base_DataSet', 'default')
    if (!view || this.metadataDataSet.destroyed) return false
    return view.dirtyTracking.hasPendingChanges(this.targetId) || view.hasEditingChanges(this.targetId)
  }

  /** 声明编辑流程状态；页面与复制 API 经会话读取，不暴露独立命令类。 */
  getInputParameterState(): {status: ParameterEditStatus; pending: boolean} {
    if (this.#disposed) throw new Error('DATA_SPACE_DESIGN_SESSION_DISPOSED: 会话已释放')
    const host = this.#inputParameterHost
    if (!host) return {status: 'idle', pending: this.inputParameterPendingFromView()}
    return inputParameterGetState(host)
  }

  async saveInputParameters(input: Readonly<{expectedValue: unknown; onReceipt?: () => void}>): Promise<Array<Record<string, unknown>>> {
    return inputParameterSave(this.inputParameterHost(), input)
  }

  async reloadInputParameters(input: Readonly<{discardPending: boolean}>): Promise<Array<Record<string, unknown>>> {
    return inputParameterReload(this.inputParameterHost(), input)
  }

  private assertFieldViewEditable(fieldId: string, viewId: string): void {
    this.assertLive()
    this.metadataDataSet.getTable('Base_DataModel_Field')?.forEachView(other => {
      if (other.viewId !== viewId && (other.hasEditingChanges(fieldId) || other.dirtyTracking.hasPendingChanges(fieldId))) {
        throw new Error('同一字段在其他视图仍有草稿，请先保存或取消')
      }
    })
  }

  /** 模型预览读取正式字段候选前，丢弃已无保存意义的目录编辑覆盖并补读完整默认目录。 */
  private async ensureDefaultFieldCatalogForPreview(): Promise<void> {
    this.assertLive()
    const directory = this.metadataDataSet.getView('Base_DataModel_Field', 'default')
    if (!directory || directory.hasEditingChanges() || directory.dirtyTracking.hasPendingChanges() || directory.mutating) return
    if (directory.dirtyTracking.dirtyRowIds.size) directory.discardEditingRows()
    if (directory.requestState === SparkData.RequestState.Loaded && directory.rows.length === directory.total) return
    const result = await directory.loadFromServer({allPages: true})
    this.assertLive()
    if (!result.success || directory.rows.length !== directory.total) throw new Error('字段候选尚未完整读取或有未保存修改')
  }

  private async refreshFieldDirectory(viewId: string): Promise<void> {
    if (viewId === 'default') return
    this.assertLive()
    const directory = this.metadataDataSet.getView('Base_DataModel_Field', 'default')
    if (!directory) throw new Error('空间字段目录不存在')
    // 目录是独立查询快照；有草稿或在途操作时保留，不能为已确认的字段回读覆盖它。
    if (directory.hasEditingChanges() || directory.dirtyTracking.hasPendingChanges() || directory.mutating
      || [SparkData.RequestState.Preparing, SparkData.RequestState.Loading].includes(directory.requestState)) return
    if (directory.requestState === SparkData.RequestState.Idle && directory.rows.length === 0) return
    // 已确认的提交与独立目录的读取分别报告；查询失败由原SparkData.DataView保留错误和只读状态。
    try {await directory.loadFromServer({allPages: true})} catch (cause) {
      if (directory.requestState !== SparkData.RequestState.Failed || !directory.loadingError) throw cause
      return
    }
    this.assertLive()
  }

  /** 维护正式来源入参的ValueFun；同一字段复用流程状态，提交即使旧目标投影失效。 */
  getSourceInput(fieldId: string, viewId: 'default' | 'sourceInputFields' = 'default'): SourceInputHandle {
    this.assertLive()
    const key = `${viewId}@${fieldId}`
    let owner = this.#sourceInputs.get(key)
    if (!owner) {
      const host = createSourceInputHost({
        dataSet: this.metadataDataSet, targetId: this.targetId, fieldId, viewId,
        lifecycle: {assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate(),
          assertEditable: () => this.assertFieldViewEditable(fieldId, viewId),
          refreshDirectory: () => this.refreshFieldDirectory(viewId)},
      })
      owner = createSourceInputHandle(host)
      this.#sourceInputs.set(key, owner)
    }
    return owner
  }

  /** 读取当前模型的正式来源入参；过滤及查询选项来自pagedata，不替换目录视图。 */
  async loadSourceInputFields(modelId: string): Promise<SparkData.DataView> {
    this.assertLive()
    const models = this.metadataDataSet.getView('Base_DataModel', 'default')
    const rows = models?.rows.filter(row => models.getPkKey(row) === modelId) ?? [], model = rows[0]
    const view = this.metadataDataSet.getView('Base_DataModel_Field', 'sourceInputFields')
    if (!models || !model || rows.length !== 1 || !view || models.dataTable?.modelBinding?.modelName !== 'Base_DataModel'
      || view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field' || models.requestState !== SparkData.RequestState.Loaded
      || models.queryContext['dataSpaceId'] !== this.targetId || model['dataSetId'] !== this.targetId
      || ['rowid', 'dataSetId', 'Type'].some(field => models.fieldAccess(model, field).read !== 'visible')
      || !['接口', '视图'].includes(String(model['Type']))) throw new Error('来源入参所属模型不是当前空间可确认的接口或逻辑视图')
    if (this.hasPendingSourceInputs() || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()
      || view.requestState === SparkData.RequestState.Loading || view.mutating) throw new Error('请先处理来源入参草稿或在途查询')
    for (const key of this.#sourceInputs.keys()) if (key.startsWith('sourceInputFields@')) this.#sourceInputs.delete(key)
    view.configure({queryContext: {dataSpaceId: this.targetId, modelId}})
    const modelContext = JSON.stringify(models.queryContext), sourceType = model['Type']
    const context = JSON.stringify(view.queryContext)
    const assertContext = (): void => {
      this.assertLive()
      const currentModels = this.metadataDataSet.getView('Base_DataModel', 'default')
      if (currentModels !== models || models.requestState !== SparkData.RequestState.Loaded || JSON.stringify(models.queryContext) !== modelContext
        || models.rows.filter(row => row['rowid'] === modelId && row['dataSetId'] === this.targetId && row['Type'] === sourceType
          && ['rowid', 'dataSetId', 'Type'].every(field => models.fieldAccess(row, field).read === 'visible')).length !== 1) throw new Error('来源入参读取期间模型身份已变化')
      if (JSON.stringify(view.queryContext) !== context) throw new Error('来源入参查询已过期')
    }
    view.validateQueryResult = result => {
      assertContext()
      if (result.total !== result.rows.length || result.rows.some(row =>
        ['rowid', 'dataSetId', 'dataModelId', 'type'].some(field => result.fieldAccess(result.rowKey(row), field).read !== 'visible')
        || row['dataSetId'] !== this.targetId || row['dataModelId'] !== modelId || row['type'] !== 'inputParams')) throw new Error('来源入参未完整读取或返回范围不符')
    }
    const result = await view.loadFromServer()
    assertContext()
    if (!result.success) throw new Error('来源入参未完整读取或返回范围不符')
    return view
  }

  /** 取得模型工作区的原入参owner；保留未决行身份，回读缺行仍能从原批次核验。 */
  getModelSourceInputs(modelId: string): SourceInputHandle[] {
    this.assertLive()
    const view = this.metadataDataSet.getView('Base_DataModel_Field', 'sourceInputFields')
    if (view?.requestState === SparkData.RequestState.Loaded && view.queryContext['modelId'] === modelId && view.queryContext['dataSpaceId'] === this.targetId) {
      for (const row of view.rows) {
        const id = view.getPkKey(row)
        if (typeof id === 'string' && ['rowid', 'dataSetId', 'dataModelId', 'Name', 'type', 'ValueFun'].every(field => view.fieldAccess(row, field).read === 'visible')) {
          this.getSourceInput(id, 'sourceInputFields')
        }
      }
    }
    return [...this.#sourceInputs.values()].filter(owner => owner.belongsTo(modelId, 'sourceInputFields'))
  }

  /** 供宿主释放检查；包含没有本地delta但仍待核验的来源入参提交。 */
  hasPendingSourceInputs(): boolean {
    return [...this.#sourceInputs.values()].some(owner => {const current = owner.getState(); return current.pending || current.status !== 'idle'})
  }

  /**
   * 查询请求设置右侧的上游模型字段；原生关系仅决定模型集合，不执行关系过滤或推导输入级联。
   * @param modelId 当前正式模型ID；端点经目标配置的modelBinding解析，不用物理来源名猜测。
   * @returns 元字段表的modelInputFields视图，范围过滤保留在pagedata及queryContext中。
   * 原生v2直接读取文件关系；旧格式只读取关系目录并映射端点，不装配完整目标。
   * @throws 关系定义、正式身份、查询范围或本次会话失效时明确报错，不把未知关系当作空结果。
   */
  async loadModelInputFields(modelId: string): Promise<SparkData.DataView> {
    this.assertOwner()
    const generation = this.#generation
    if (this.#file && !this.#file.value.usesNativeResourceRelations && !this.#definition) await this.#metadata.load(['Base_DataModel_Relation'])
    this.assertOwner()
    if (generation !== this.#generation) throw new Error('模型输入参数查询已过期')
    const definition = this.readFunctionDefinition()
    if (!definition) throw new Error('模型关系尚未装配，暂不能确认模型输入参数')
    const models = this.metadataDataSet.getView('Base_DataModel', 'default')
    const view = this.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')
    if (!models || !view || models.dataTable?.modelBinding?.modelName !== 'Base_DataModel'
      || view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field'
      || models.requestState !== SparkData.RequestState.Loaded || models.mutating
      || models.queryContext['dataSpaceId'] !== this.targetId) throw new Error('模型输入参数缺少当前模型查询或命名视图')
    const identity = (id: string, name?: string): void => {
      const rows = models.rows.filter(row => models.getPkKey(row) === id), row = rows[0]
      if (!row || rows.length !== 1 || row['rowid'] !== id || row['dataSetId'] !== this.targetId
        || ['rowid', 'dataSetId', 'Name'].some(field => models.fieldAccess(row, field).read !== 'visible')
        || name !== undefined && row['Name'] !== name) throw new Error('模型输入参数的模型身份不可确认')
    }
    identity(modelId)
    const hasPendingInput = (): boolean => view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()
      || view.mutating || [SparkData.RequestState.Preparing, SparkData.RequestState.Loading].includes(view.requestState)
    if (hasPendingInput()) {
      throw new Error('模型输入参数仍有草稿或在途查询')
    }
    const references = new LowcodeDataSpaceFieldValue({dataSet: this.metadataDataSet, targetId: this.targetId, modelId})
    const ids = references.readAncestorModelIds(definition), modelIds = new Set(ids)
    view.configure({queryContext: {dataSpaceId: this.targetId, modelId, modelIds: ids}})
    const queryContext = JSON.stringify(view.queryContext)
    view.replaceRows([])
    const assertContext = (): void => {
      this.assertOwner()
      if (generation !== this.#generation || this.readFunctionDefinition() !== definition || JSON.stringify(view.queryContext) !== queryContext) throw new Error('模型输入参数查询已过期')
      identity(modelId)
      if (JSON.stringify(references.readAncestorModelIds(definition)) !== JSON.stringify(ids)) throw new Error('模型输入参数的上游范围已变化')
    }
    view.validateQueryResult = result => {
      assertContext()
      if (result.total !== result.rows.length || result.rows.some(row =>
        ['rowid', 'dataSetId', 'dataModelId'].some(field => result.fieldAccess(result.rowKey(row), field).read !== 'visible')
        || row['dataSetId'] !== this.targetId || !modelIds.has(String(row['dataModelId'])))) throw new Error('模型输入参数未完整读取或返回范围不符')
    }
    if (!ids.length) return view
    const result = await view.loadFromServer()
    try {
      assertContext()
      if (!result.success) throw new Error('模型输入参数未完整读取或返回范围不符')
    } catch (cause) {
      // 已接纳的合法结果也可能在订阅回调后过期；仅撤下本次投影，不动新查询或草稿。
      if (result.success && !view.destroyed && JSON.stringify(view.queryContext) === queryContext
        && !hasPendingInput()) view.clearAll()
      throw cause
    }
    return view
  }

  /**
   * 加载统一模型工作区的正式字段视图和已配置的脱敏规则候选；全空间目录仍保留在default。
   * @param modelId 当前被设计空间内唯一、可读的模型ID。
   * @returns 由metadataDataSet持有的命名视图，表格和编辑器共同消费。
   * @throws 有字段草稿、未决请求或返回范围失配时拒绝切换，不复制旧权限或数据。
   */
  async loadModelFields(modelId: string): Promise<SparkData.DataView> {
    this.assertLive()
    const viewId = 'modelFields'
    const models = this.metadataDataSet.getView('Base_DataModel', 'default')
    const model = models?.rows.find(row => row['rowid'] === modelId)
    const view = this.metadataDataSet.getView('Base_DataModel_Field', viewId)
    if (!models || model?.['dataSetId'] !== this.targetId || ['rowid', 'dataSetId'].some(field => models.fieldAccess(model, field).read !== 'visible')
      || !view) throw new Error('模型字段工作区缺少正式模型或命名视图')
    if (this.hasPendingFieldEdits() || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()
      || view.requestState === SparkData.RequestState.Loading || view.mutating) throw new Error('请先处理字段草稿或在途查询')
    const rules = this.metadataDataSet.getView('Base_Desensitization_Rule', 'default')
    if (rules && view.columns.some(column => column.name === 'Expression')) {
      const loaded = await rules.loadFromServer()
      this.assertLive()
      if (!loaded.success || rules.total !== rules.rows.length) throw new Error('脱敏规则未完整读取')
    }
    for (const key of this.#fieldEdits.keys()) if (key.startsWith(`${viewId}@`)) this.#fieldEdits.delete(key)
    view.configure({queryContext: {dataSpaceId: this.targetId, modelId}})
    const context = JSON.stringify(view.queryContext)
    const assertContext = (): void => {
      this.assertLive()
      if (JSON.stringify(view.queryContext) !== context || models.requestState !== SparkData.RequestState.Loaded
        || models.queryContext['dataSpaceId'] !== this.targetId
        || models.rows.filter(row => row['rowid'] === modelId && row['dataSetId'] === this.targetId
          && ['rowid', 'dataSetId'].every(field => models.fieldAccess(row, field).read === 'visible')).length !== 1) throw new Error('模型字段读取期间模型身份已变化')
    }
    view.validateQueryResult = result => {
      assertContext()
      if (result.total !== result.rows.length || result.rows.some(row =>
        ['rowid', 'dataSetId', 'dataModelId', 'type'].some(field => result.fieldAccess(result.rowKey(row), field).read !== 'visible')
        || row['dataSetId'] !== this.targetId || row['dataModelId'] !== modelId || row['type'] !== 'dataModel')) throw new Error('模型字段未完整读取或返回范围不符')
    }
    const result = await view.loadFromServer()
    assertContext()
    if (!result.success) throw new Error('模型字段未完整读取或返回范围不符')
    this.getModelEdit(modelId).bindFields(view)
    return view
  }

  /**
   * 取得正式字段配置流程；字段草稿及权限属于指定查询视图。
   * @param fieldId 正式字段ID。
   * @param viewId 独立字段入口用default；统一模型列工作区用modelFields，不回退查询身份。
   */
  getFieldEdit(fieldId: string, viewId: 'default' | 'modelFields' = 'default'): FieldEditSession {
    this.assertLive()
    const key = `${viewId}@${fieldId}`
    let host = this.#fieldEdits.get(key)
    if (!host) {
      host = createFieldEditHost({
        dataSet: this.metadataDataSet, targetId: this.targetId, fieldId, viewId,
        lifecycle: {assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate(),
          readModel: (modelId, modelName) => this.readModel({scenarioId: this.targetId, modelId, modelName}),
          readDefinition: () => this.readFunctionDefinition(),
          validateOutputs: (changes, modelPatch) => this.validateFieldOutputs(changes, modelPatch, viewId),
          stagePrimaryKey: (modelId, name) => this.getModelEdit(modelId).stage('PrimaryKeyFields', name),
          assertEditable: () => this.assertFieldViewEditable(fieldId, viewId),
          refreshDirectory: () => this.refreshFieldDirectory(viewId)},
      })
      this.#fieldEdits.set(key, host)
    }
    return createFieldEditHandle(host)
  }

  private async validateFieldOutputs(changes: ReadonlyArray<{original: SparkData.DataRow; patch: Readonly<Record<string, unknown>>; creating?: boolean}>,
    modelPatch: Readonly<Record<string, unknown>> | undefined, viewId: 'default' | 'modelFields'): Promise<() => void> {
    this.assertOwner(); this.assertMetadataClean()
    const file = this.#file, text = file?.getText() ?? null, revision = file?.revision
    const fields = this.metadataDataSet.getView('Base_DataModel_Field', viewId)
    const models = this.metadataDataSet.getView('Base_DataModel', 'default')
    const model = models?.rows.find(row => row['rowid'] === changes[0]?.original['dataModelId'])
    if (!fields || !models || !model || typeof model['Name'] !== 'string' || typeof model['rowid'] !== 'string') throw new Error('字段所属模型不可确认')
    if (changes.some(change => change.original['dataModelId'] !== model['rowid'])) throw new Error('字段批次所属模型不一致')
    const altersReferences = changes.some(({original, patch}) => 'Name' in patch
      || patch['IsOutput'] === 0 && Number(original['IsOutput']) === 1)
    let definitionViews: ReadonlyArray<SparkData.DataView | undefined> = [models, fields]
    if (changes.some(({patch}) => 'Name' in patch)) {
      const key = `${viewId}:${model['rowid']}`
      this.#fieldOutputDependencies.get(key)?.release()
      const dependencies = new LowcodeDataSpaceModelDependencies({
        dataSet: this.metadataDataSet, targetId: this.targetId, modelId: model['rowid'], operation: `fieldOutput:${viewId}`,
        assertCurrent: () => this.assertLive(), editing: {view: models, id: model['rowid']},
        fieldEditing: {view: fields, ids: [...changes.map(change => String(change.original['rowid'])), ...[...fields.dirtyTracking.pendingDeleteIds].map(String)], allowPending: fields.dirtyTracking.pendingDeleteIds.size > 0},
      })
      this.#fieldOutputDependencies.set(key, dependencies)
      await dependencies.load()
      definitionViews = dependencies.views
    } else if (altersReferences) {
      const template = this.metadataDataSet.getView('Base_DataModel_Relation', 'default')
      if (!template) throw new Error('缺少模型关系查询配置')
      const key = `fieldOutput:${viewId}:${model['rowid']}`
      const relations = template.dataTable?.views[key] ?? template.createQueryView(key)
      if (relations.mutating || relations.requestState === SparkData.RequestState.Loading || relations.hasEditingChanges()
        || relations.dirtyTracking.hasPendingChanges() || template.hasEditingChanges() || template.dirtyTracking.hasPendingChanges()) throw new Error('请先处理模型关系草稿或查询')
      relations.configure({queryContext: {...template.queryContext}})
      relations.filterExpression = template.filterExpression
      const result = await relations.loadFromServer({allPages: true, maxRows: 50000})
      this.assertOwner(); this.assertMetadataClean()
      if (!result.success || relations.loadingError) throw new Error('模型关系依赖读取失败')
      definitionViews = [models, fields, relations]
    }
    const dependencies = ['Base_DataModel', 'Base_DataModel_Field', ...altersReferences ? ['Base_DataModel_Relation'] : []]
    const snapshot = (): string => JSON.stringify(dependencies.map(name => {
      const view = name === 'Base_DataModel_Field' ? fields : name === 'Base_DataModel_Relation' ? definitionViews[2] : models
      if (!view || view.mutating || view.requestState !== SparkData.RequestState.Loaded || view.loadingError
        || name !== 'Base_DataModel' && view.rows.filter(row => !view.dirtyTracking.isPendingCreate(view.getPkKey(row) ?? '')).length + view.dirtyTracking.pendingDeleteIds.size !== view.total
        || view.queryContext['dataSpaceId'] !== this.targetId) throw new Error('输出依赖元数据未完整读取')
      if (name === 'Base_DataModel_Field' && viewId !== 'default' && view.queryContext['modelId'] !== model['rowid']) throw new Error('字段工作区所属模型已变化')
      const rows = view.rows.filter(row => name === 'Base_DataModel' ? row['rowid'] === model['rowid']
        : name === 'Base_DataModel_Field' ? row['dataModelId'] === model['rowid'] : true)
      if (name !== 'Base_DataModel_Field') {
        if (rows.some(row => {
          const id = view.getPkKey(row)
          if (id === undefined) throw new Error('模型草稿身份不可确认')
          if (!view.hasEditingChanges(id) && !view.dirtyTracking.hasPendingChanges(id)) return false
          if (name !== 'Base_DataModel' || !modelPatch) return true
          const editing = view.getEditingPatch(id)
          if (editing && Object.keys(editing).length) return JSON.stringify(editing) !== JSON.stringify(modelPatch)
          return Object.entries(view.dirtyTracking.getDiff(id, row)).some(([key, diff]) => !Object.hasOwn(modelPatch, key) || diff.to !== modelPatch[key])
        })) throw new Error('请先处理模型或关系草稿')
      }
      return [view.queryContext, rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) =>
        !(name === 'Base_DataModel_Field' && changes.some(change => row['rowid'] === change.original['rowid'] && Object.hasOwn(change.patch, key)))
        && !(name === 'Base_DataModel' && row['rowid'] === model['rowid'] && modelPatch && Object.hasOwn(modelPatch, key)))))]
    }))
    const baseline = snapshot(), referenceSnapshot = () => JSON.stringify(definitionViews
      .flatMap(view => view && view !== models && view !== fields ? [[view.queryContext, view.filterExpression, view.rows]] : []))
    const referenceBaseline = referenceSnapshot()
    const assertCurrent = () => {
      this.assertOwner(); this.assertMetadataClean()
      if (changes.some(change => change.creating)) this.assertModelFieldDrafts(viewName(model['rowid'], '模型ID'), viewId)
      if (this.#file !== file || file?.isDirty || file?.saveStatus !== undefined && file.saveStatus !== 'idle'
        || file?.revision !== revision || (file?.getText() ?? null) !== text || snapshot() !== baseline
        || referenceSnapshot() !== referenceBaseline) throw new Error('输出依赖配置已变化，请重新核验')
      for (const {original, creating} of changes) {
        const view = creating ? this.metadataDataSet.getView('Base_DataModel_Field', 'modelFields') : fields
        if (!view || creating && (view.queryContext['modelId'] !== model['rowid'] || view.addActionState() !== 'enabled'
          || !view.dirtyTracking.isPendingCreate(String(original['rowid'])))) throw new Error('新增字段身份或权限已变化')
        for (const key of ['AsName', 'IsOutput']) if (view.fieldAccess(original, key).read !== 'visible') throw new Error('字段输出映射不可读')
      }
    }
    assertCurrent()
    const formal = await this.readModel({scenarioId: this.targetId, modelId: model['rowid'], modelName: model['Name']})
    assertCurrent()
    if (formal.id !== model['rowid'] || formal.metaName !== model['Name'] || formal.sourceName !== model['MetaName']) throw new Error('正式模型身份或来源已变化')
    for (const {original, patch, creating} of changes) if (!creating && 'ValueFun' in patch) {
      const field = formal.fields.find(item => item.id === original['rowid'])
      if (!field || field.raw['ValueFun'] !== original['ValueFun']) throw new Error('字段值函数原文已变化，请重新核验')
      if (modelPatch && Object.hasOwn(modelPatch, 'PrimaryKeyFields') ? field.name === modelPatch['PrimaryKeyFields'] : field.primaryKey) throw new Error('正式主键不能修改取值定义')
      const expression = DataSpaceDesignApi.parseValueFunction(String(patch['ValueFun']))
      const resource = DataSpaceDesignApi.resolveTableResource(formal).resourceType
      if (['database-table', 'database-view'].includes(resource) && !['引用', '计算字段'].includes(String(field.raw['FieldType']))
        && expression?.Type === 'GetConstValue' && expression['Value'] !== null && typeof expression['Value'] !== 'string') {
        throw new Error('当前后端普通数据库字段表达式只接受文本取值；非文本常量保留为草稿，不转换类型或提交')
      }
    }
    const remote = await this.previewRemoteViews()
    assertCurrent()
    if (remote !== text) throw new Error('远端视图配置已变化，请重新打开后核验输出引用')
    const validate = () => {
      assertCurrent()
      const candidate = modelPatch ? {...formal, raw: {...formal.raw, ...modelPatch}} : formal
      if (changes.some(change => change.creating)) LowcodeDataSpaceFieldOutput.validateAdditions({model: candidate, changes, config: file?.value ?? null,
        metadata: this.metadataDataSet, targetId: this.targetId, fieldView: fields})
      for (const {original, patch, creating} of changes) if (!creating) LowcodeDataSpaceFieldOutput.validate({model: candidate, original, patch, changes,
        fieldView: fields, definitionViews,
        ...modelPatch && Object.hasOwn(modelPatch, 'PrimaryKeyFields') ? {primaryKeyName: String(modelPatch['PrimaryKeyFields'])} : {},
        config: file?.value ?? null, metadata: this.metadataDataSet, targetId: this.targetId})
    }
    validate()
    return validate
  }

  private assertModelFieldDrafts(modelId: string, viewId: string): void {
    this.metadataDataSet.getTable('Base_DataModel_Field')?.forEachView(other => {
      if (other.viewId === viewId || !other.hasEditingChanges() && !other.dirtyTracking.hasPendingChanges()) return
      const rows = other.rows.filter(row => {
        const id = other.getPkKey(row)
        return id !== undefined && (other.hasEditingChanges(id) || other.dirtyTracking.hasPendingChanges(id))
      })
      for (const id of other.dirtyTracking.pendingDeleteIds) {
        const row = other.dirtyTracking.getPendingDeleteSnapshot(id)
        if (!row) throw new Error('待删除字段归属不可核验')
        rows.push(row)
      }
      for (const row of rows) {
        if (['dataSetId', 'dataModelId'].some(field => other.fieldAccess(row, field).read !== 'visible')
          || row['dataSetId'] !== this.targetId || typeof row['dataModelId'] !== 'string') throw new Error('字段草稿归属不可核验')
        if (row['dataModelId'] !== modelId) continue
        if (other.fieldAccess(row, 'type').read !== 'visible' || row['type'] !== 'inputParams') throw new Error('当前模型在其他字段视图仍有草稿')
      }
    })
  }

  /** 同一模型只保留一个创建流程；输入视图不保存为正式元模型。 */
  getFieldCreate(modelId: string, viewId: 'default' | 'modelFields' = 'default'): FieldCreateHandle {
    this.assertLive()
    const key = `${viewId}@${modelId}`
    let owner = this.#fieldCreates.get(key)
    if (!owner) {
      const host = createFieldCreateHost({
        dataSet: this.metadataDataSet, targetId: this.targetId, modelId, viewId,
        lifecycle: {
          assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate(),
          validate: values => this.validateFieldCreation(modelId, values), readDefinition: () => this.readFunctionDefinition(),
          assertStaging: () => {
            this.assertLive(); this.assertMetadataClean()
            if ([...this.#fieldEdits.values(), ...this.#modelEdits.values(), ...this.#sourceInputs.values()].some(edit => edit.getState().status !== 'idle')
              || this.hasPendingModelRemovals() || this.hasPendingModelCreate() || this.hasPendingModelSourceEdits()
              || [...this.#fieldRemovals].some(([id, edit]) => edit.getState().pending && !(viewId === 'modelFields' && id.startsWith('modelFields@') && edit.getState().status === 'staged' && edit.getState().preview?.modelId === modelId))
              || [...this.#fieldCreates].some(([id, edit]) => id !== key && edit.getState().pending)) throw new Error('请先核验其他未决操作')
            this.assertModelFieldDrafts(modelId, viewId)
          },
        },
      })
      owner = createFieldCreateHandle(host)
      this.#fieldCreates.set(key, owner)
    }
    return owner
  }

  /** 离开字段新增工作区时释放空的输入视图；草稿及未决提交保留给原会话核验。 */
  releaseFieldCreate(modelId: string, viewId: 'default' | 'modelFields' = 'default'): void {
    if (this.#disposed || this.metadataDataSet.destroyed) return
    const key = `${viewId}@${modelId}`, owner = this.#fieldCreates.get(key)
    if (!owner) return
    try {
      if (owner.getState().pending) return
    } catch {
      this.#fieldCreates.delete(key)
      return
    }
    this.metadataDataSet.removeTable(owner.input.tableName)
    this.#fieldCreates.delete(key)
  }

  private async validateFieldCreation(modelId: string, values: SparkData.DataRow): Promise<() => void> {
    this.assertOwner(); this.assertMetadataClean()
    const file = this.#file, text = file?.getText() ?? null, revision = file?.revision
    const models = this.metadataDataSet.getView('Base_DataModel', 'default'), fields = this.metadataDataSet.getView('Base_DataModel_Field', 'default')
    const row = models?.rows.find(item => item['rowid'] === modelId)
    if (!models || !fields || !row || typeof row['Name'] !== 'string') throw new Error('新增字段所属模型不可确认')
    const snapshot = () => JSON.stringify([models.rows, fields.rows.filter(item => !fields.dirtyTracking.isPendingCreate(fields.getPkKey(item) ?? ''))])
    const baseline = snapshot()
    const assertCurrent = () => {
      this.assertOwner(); this.assertMetadataClean()
      if (this.#file !== file || file?.isDirty || file?.revision !== revision || (file?.getText() ?? null) !== text
        || file && file.saveStatus !== 'idle' || snapshot() !== baseline
        || [...this.#fieldEdits.values()].some(owner => owner.getState().status !== 'idle')
        || this.hasPendingModelEdits() || this.hasPendingModelRemovals() || this.hasPendingModelCreate() || this.hasPendingModelSourceEdits()
        || [...this.#fieldCreates].some(([id, owner]) => id !== `default@${modelId}` && owner.getState().pending)) throw new Error('新增字段依赖配置或其他操作已变化')
      for (const field of fields.rows) {
        if (fields.dirtyTracking.isPendingCreate(fields.getPkKey(field) ?? '')) continue
        if (['dataSetId', 'dataModelId', 'type'].some(key => fields.fieldAccess(field, key).read !== 'visible') || field['dataSetId'] !== this.targetId) throw new Error('字段归属不可核验')
      }
    }
    assertCurrent()
    const formal = await this.readModel({scenarioId: this.targetId, modelId, modelName: row['Name']})
    assertCurrent()
    if (formal.id !== modelId || formal.metaName !== row['Name'] || formal.sourceName !== row['MetaName']) throw new Error('正式模型身份或来源已变化')
    const originals = fields.rows.filter(field => field['dataModelId'] === modelId && field['type'] === 'dataModel')
    if (formal.fields.length !== originals.length || originals.some(field => {
      const matches = formal.fields.filter(item => item.id === field['rowid']), match = matches[0]
      const alias = field['AsName'], canonicalName = typeof alias === 'string' && alias.length > 0 ? alias : field['Name']
      return ['Name', 'AsName', 'IsOutput'].some(key => fields.fieldAccess(field, key).read !== 'visible') || matches.length !== 1 || !match
        || match.name !== field['Name'] || match.canonicalName !== canonicalName || match.output !== (Number(field['IsOutput']) === 1)
    })) throw new Error('正式字段定义已变化，请重新打开')
    if (formal.fields.some(field => field.name === values['Name'])) throw new Error('字段名称已存在')
    const outputName = typeof values['AsName'] === 'string' && values['AsName'].length > 0 ? values['AsName'] : values['Name']
    if (formal.fields.some(field => field.canonicalName === outputName)) throw new Error('模型列名称与已有字段冲突')
    const tables = file?.value.toJSON()['tables']
    if (isRecord(tables)) for (const table of Object.values(tables)) {
      if (isRecord(table) && isRecord(table['modelBinding']) && table['modelBinding']['modelId'] === modelId && Array.isArray(table['columns'])
        && table['columns'].some(column => isRecord(column) && column['name'] === outputName && Object.hasOwn(column, 'computeExpression'))) throw new Error('模型列名称与本地计算字段冲突')
    }
    const remote = await this.previewRemoteViews()
    assertCurrent()
    if (remote !== text) throw new Error('远端视图配置已变化，请重新打开')
    return assertCurrent
  }

  /** 含没有本地delta但仍待核验的字段提交，供页面关闭及切换保护。 */
  getUnresolvedFieldIds(modelId: string, viewId: 'default' | 'modelFields'): string[] {
    const view = this.metadataDataSet.getView('Base_DataModel_Field', viewId)
    if (view?.queryContext['modelId'] !== modelId) return []
    return [...this.#fieldEdits].flatMap(([key, owner]) => key.startsWith(`${viewId}@`) && owner.getState().status !== 'idle' ? [key.slice(viewId.length + 1)] : [])
  }

  /** 原字段视图中的新增也算待提交，即使尚未打开单行编辑器。 */
  hasPendingFieldEdits(): boolean {
    return [...this.#fieldEdits.values()].some(owner => {const current = owner.getState(); return current.pending || current.status !== 'idle'})
      || ['default', 'modelFields'].some(id => this.metadataDataSet.getView('Base_DataModel_Field', id)?.dirtyTracking.hasPendingChanges())
      || [...this.#fieldCreates.values()].some(owner => owner.getState().pending)
      || [...this.#fieldRemovals.values()].some(owner => owner.getState().pending)
  }

  /** 当前模型原绑定视图的待删除或未决流程；记录数据仍仅在SparkData.DataView。 */
  getModelFieldRemovals(modelId: string, viewId = 'modelFields'): FieldRemoveHandle[] {
    return [...this.#fieldRemovals].flatMap(([key, owner]) => key.startsWith(`${viewId}@`) && owner.getState().preview?.modelId === modelId
      && owner.getState().pending ? [owner] : [])
  }

  /** 计算字段删除复用原SparkData.DataView；恢复入口不依赖待删行仍存在。 */
  getFieldRemove(fieldId: string, fieldViewId: 'default' | 'modelFields' = 'default'): FieldRemoveHandle {
    this.assertLive()
    const key = `${fieldViewId}@${fieldId}`
    let owner = this.#fieldRemovals.get(key)
    if (!owner) {
      const host = createFieldRemoveHost({dataSet: this.metadataDataSet, targetId: this.targetId, fieldId, fieldViewId, lifecycle: {
        assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate(), validate: (row, views) => this.validateFieldRemoval(row, views, key),
        fieldWorkspaces: modelId => {
          if (fieldViewId !== 'modelFields') return []
          const inputs = this.getModelSourceInputs(modelId)
          inputs.forEach(input => input.assertWorkspaceChanges())
          const view = this.metadataDataSet.getView('Base_DataModel_Field', 'sourceInputFields')
          return inputs.length && view ? [{view, ids: view.rows.map(row => String(view.getPkKey(row))), allowPending: true}] : []
        },
      }})
      owner = createFieldRemoveHandle(host)
      this.#fieldRemovals.set(key, owner)
    }
    return owner
  }

  private async validateFieldRemoval(row: SparkData.DataRow, views: readonly SparkData.DataView[], ownerKey: string): Promise<() => void> {
    this.assertOwner(); this.assertMetadataClean()
    const file = this.#file, text = file?.getText() ?? null, revision = file?.revision
    const workspace = ownerKey.startsWith('modelFields@') ? this.metadataDataSet.getView('Base_DataModel_Field', 'modelFields') : undefined
    const check = () => {
      this.assertOwner(); this.assertMetadataClean()
      if (workspace) this.getModelSourceInputs(String(row['dataModelId'])).forEach(input => input.assertWorkspaceChanges())
      const space = this.metadataDataSet.getView('Base_DataSet')
      if (space?.hasEditingChanges() || space?.dirtyTracking.hasPendingChanges()
        || [...this.#fieldEdits].some(([key, owner]) => owner.getState().status !== 'idle' && !(workspace && key.startsWith('modelFields@')))
        || [...this.#sourceInputs.values()].some(owner => owner.getState().status !== 'idle' && !(workspace && owner.belongsTo(String(row['dataModelId']), 'sourceInputFields')))
        || [...this.#fieldCreates.values()].some(owner => owner.getState().pending)
        || [...this.#fieldRemovals].some(([id, owner]) => id !== ownerKey && owner.getState().pending && !(workspace && id.startsWith('modelFields@') && owner.getState().preview?.modelId === row['dataModelId']))
        || [...this.#modelEdits].some(([id, owner]) => (owner.getState().pending || owner.getState().status !== 'idle') && !(workspace && id === row['dataModelId']))
        || this.hasPendingModelCreate() || this.hasPendingModelSourceEdits() || this.hasPendingModelRemovals()) throw new Error('请先处理其他定义操作，再删除字段')
      if (this.#file !== file || file?.isDirty || file?.revision !== revision || (file?.getText() ?? null) !== text
        || file && file.saveStatus !== 'idle') throw new Error('字段删除的视图配置已变化或尚未确认')
    }
    check()
    const models = views[0], model = models?.rows.find(item => item['rowid'] === row['dataModelId'])
    if (!model || typeof model['rowid'] !== 'string' || typeof model['Name'] !== 'string') throw new Error('删除字段所属模型不可确认')
    const formal = await this.readModel({scenarioId: this.targetId, modelId: model['rowid'], modelName: model['Name']})
    check()
    if (formal.id !== model['rowid'] || formal.metaName !== model['Name'] || formal.sourceName !== model['MetaName']) throw new Error('正式模型身份或来源已变化')
    const fields = formal.fields.filter(item => item.id === row['rowid']), field = fields[0]
    if (fields.length !== 1 || !field || field.raw['FieldType'] !== row['FieldType'] || field.raw['ValueFun'] !== row['ValueFun']) throw new Error('删除字段的正式定义已变化')
    if (field.primaryKey) throw new Error('不能删除正式主键字段')
    LowcodeDataSpaceFieldOutput.validate({model: formal, original: row, patch: {}, operation: 'remove',
      config: file?.value ?? null, metadata: this.metadataDataSet, targetId: this.targetId, definitionViews: views})
    LowcodeDataSpaceFieldRemoveReferences.validate(views, row, workspace ? {fieldView: workspace} : {})
    const remote = await this.previewRemoteViews()
    check()
    if (remote !== text) throw new Error('远端视图配置已变化，请重新打开后删除字段')
    return () => {check(); LowcodeDataSpaceFieldRemoveReferences.validate(views, row, workspace ? {fieldView: workspace} : {})}
  }

  /** 维护正式模型的查询配置；模型身份和来源替换不在此入口改动。 */
  getModelEdit(modelId: string): ModelEditSession {
    this.assertLive()
    let host = this.#modelEdits.get(modelId)
    if (!host) {
      host = createModelEditHost({
        dataSet: this.metadataDataSet, targetId: this.targetId, modelId,
        lifecycle: {assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate(),
          validatePrimaryKey: model => this.validateModelViewConfiguration(model),
          primaryKeyChanged: retained => {
            for (const key of this.#fieldEdits.keys()) if (!retained || !key.startsWith(`${retained}@`)) this.#fieldEdits.delete(key)
            this.#modelSources.clear()
          }},
      })
      const fields = this.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')
      if (fields?.queryContext['dataSpaceId'] === this.targetId && fields.queryContext['modelId'] === modelId) host.bindFields(fields)
      this.#modelEdits.set(modelId, host)
    }
    return createModelEditHandle(host)
  }

  /** 已有数组共用原定义批次；工作区显式绑定modelFields，独立完整目录调用使用default。 */
  getArrayEdit(modelId: string, fieldViewId: 'default' | 'modelFields' = 'default'): ArrayEditHandle {
    this.assertLive()
    const key = `${fieldViewId}@${modelId}`
    let owner = this.#arrayEdits.get(key)
    if (!owner) {
      const host = createArrayHost({
        dataSet: this.metadataDataSet, targetId: this.targetId, modelId, fieldViewId,
        lifecycle: {
          assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate(),
          validate: (change, views) => this.validateArrayDefinition(change, views),
          prepareRename: change => this.prepareModelConfigurationChange({
            modelId, before: change.original.name, after: change.candidate.name, arrayChange: change,
          }),
          completed: () => {
            this.#modelEdits.clear(); this.#fieldEdits.clear(); this.#modelSources.clear()
            for (const rename of this.#modelRenames.values()) if (!rename.getState().pending) rename.cancel()
          },
        },
      })
      owner = createArrayHandle(host)
      this.#arrayEdits.set(key, owner)
    }
    return owner
  }

  /** 关闭无草稿数组窗口时释放流程身份；未决提交保留供核验。 */
  releaseArrayEdit(modelId: string, fieldViewId: 'default' | 'modelFields' = 'default'): void {
    const key = `${fieldViewId}@${modelId}`
    const owner = this.#arrayEdits.get(key)
    if (owner && !owner.getState().pending) {owner.release(); this.#arrayEdits.delete(key)}
  }

  private async validateArrayDefinition(change: ArrayDefinitionChange, views: readonly SparkData.DataView[]): Promise<() => void> {
    this.assertLive(); this.assertMetadataClean()
    // 保留字段名称的新增/主键切换只依赖本模型及配置；标题/顺序连文件也不需要读取。
    if (change.original.name === change.candidate.name
      && !change.removals.length && !change.references.length
      && change.original.fields.every(field => change.candidate.fields.some(candidate => candidate.id === field.id))
      && change.changes.every(entry => Object.keys(entry.patch).every(key => key === 'description' || key === 'Order' || key === 'IsPKey' || key === 'IsOutput' && entry.patch[key] === 1))) {
      if (change.original.fields.length !== change.candidate.fields.length || change.original.primaryKey !== change.candidate.primaryKey
        || change.changes.some(entry => Object.hasOwn(entry.patch, 'IsPKey') || Object.hasOwn(entry.patch, 'IsOutput'))) {
        const config = this.#file ? LowcodeDataSpaceArrayConfiguration.rewrite(this.#file.value, change) : undefined
        return this.validateModelViewConfiguration(change.candidate, config)
      }
      return () => {this.assertLive(); this.assertMetadataClean()}
    }
    const file = this.#file, text = file?.getText() ?? null, revision = file?.revision
    const snapshot = () => JSON.stringify(views.map(view => {
      const name = view.tableName
      if (view.requestState !== SparkData.RequestState.Loaded || view.total !== view.rows.length - view.dirtyTracking.pendingCreateIds.size + view.dirtyTracking.pendingDeleteIds.size || view.mutating
        || view.queryContext['dataSpaceId'] !== this.targetId) throw new Error('数组依赖元数据未完整读取')
      return view.rows.filter(row => !(name === 'Base_DataModel' && row['rowid'] === change.original.id)
        && !(name === 'Base_DataModel_Field' && row['dataModelId'] === change.original.id && row['type'] === 'dataModel'))
        .map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !change.references.some(reference => reference.table === name && reference.id === row['rowid'] && reference.property === key))))
    }))
    const before = snapshot()
    const check = () => {
      this.assertLive(); this.assertMetadataClean()
      if (this.#file !== file || file?.isDirty || file?.saveStatus !== undefined && file.saveStatus !== 'idle'
        || file?.revision !== revision || (file?.getText() ?? null) !== text || snapshot() !== before) throw new Error('数组依赖定义或场景配置已变化')
    }
    check()
    const candidateConfig = file ? LowcodeDataSpaceArrayConfiguration.rewrite(file.value, change) : undefined
    const primaryCheck = await this.validateModelViewConfiguration({...change.candidate, name: change.original.name, metaName: change.original.metaName}, candidateConfig)
    check()
    for (const entry of change.changes) {
      LowcodeDataSpaceFieldOutput.validateReferences({model: change.original, original: entry.original, patch: entry.patch,
        config: Object.hasOwn(entry.patch, 'Name') ? null : file?.value ?? null, metadata: this.metadataDataSet, targetId: this.targetId,definitionChanges:change.references,definitionViews:views})
    }
    for (const row of change.removals) {
      LowcodeDataSpaceFieldRemoveReferences.validate(views, row, {operation: 'remove', primaryKeyReplacement: String(change.candidate.raw['PrimaryKeyFields'] ?? '')})
      LowcodeDataSpaceFieldOutput.validateReferences({model: change.original, original: row, patch: {}, operation: 'remove',
        config: file?.value ?? null, metadata: this.metadataDataSet, targetId: this.targetId,definitionViews:views})
    }
    return () => {check(); primaryCheck()}
  }

  /** 字段集合或主键改变只核模型关联配置；不读取其他模型字段或关系目录。 */
  private async validateModelViewConfiguration(model: FormalModel, configuration?: ScenarioViewConfig, validateViews = false): Promise<() => void> {
    this.assertOwner(); this.assertMetadataClean()
    DataSpaceDesignApi.resolveFields(model)
    const file = this.#file, text = file?.getText() ?? null, revision = file?.revision
    const check = () => {
      this.assertOwner(); this.assertMetadataClean()
      if (this.#file !== file || file?.isDirty || file?.saveStatus !== undefined && file.saveStatus !== 'idle'
        || file?.revision !== revision || (file?.getText() ?? null) !== text) throw new Error('模型关联的场景配置已变化，请先处理配置')
    }
    check()
    const tables = (configuration ?? file?.value)?.toJSON()['tables']
    if (isRecord(tables)) for (const [tableName, table] of Object.entries(tables)) {
      if (!isRecord(table) || !isRecord(table['modelBinding']) || table['modelBinding']['modelId'] !== model.id) continue
      if (table['modelBinding']['modelName'] !== model.name) throw new Error('场景配置关联模型身份不一致')
      if (Array.isArray(table['columns']) && table['columns'].some(column => isRecord(column) && column['name'] === model.primaryKey && Object.hasOwn(column, 'computeExpression'))) throw new Error(`tables.${tableName}.columns 主键与本地计算列重名`)
      if (Array.isArray(table['columns']) && table['columns'].some(column => isRecord(column) && Object.hasOwn(column, 'computeExpression')
        && model.fields.some(field => field.canonicalName === column['name']))) throw new Error(`tables.${tableName}.columns 正式字段与本地计算列重名`)
      if (validateViews && isRecord(table['views'])) for (const [viewId, view] of Object.entries(table['views'])) {
        if (!isRecord(view)) continue
        const projected = LowcodeDataSpaceViewFields.project({model, tableName, configured: table['columns'], viewId, definition: view})
        const outputs = new Set(model.fields.filter(field => field.output).map(field => field.canonicalName))
        LowcodeDataSpaceViewFields.validateReferences(view, outputs, new Set(projected.columns.filter(column => !outputs.has(column.name)).map(column => column.name)))
        LowcodeDataSpaceViewFields.validateSelection(view, new Set(projected.selectionColumns.map(column => column.name)))
      }
      if (isRecord(table['views'])) for (const [viewId, view] of Object.entries(table['views'])) {
        if (!isRecord(view) || !Array.isArray(view['fieldProjection'])) continue
        view['fieldProjection'].forEach((field, index) => {
          if (!isRecord(field)) return
          const formal = model.fields.find(item => item.id === field['fieldId'])
          if (!formal || formal.primaryKey !== field['primaryKey']) throw new Error(`tables.${tableName}.views.${viewId}.fieldProjection[${index}].primaryKey 仍固定旧主键，请先处理配置`)
        })
      }
    }
    const remote = await this.previewRemoteViews()
    check()
    if (remote !== text) throw new Error('远端视图配置已变化，请重新核验模型字段')
    return check
  }

  /** 保留没有本地delta但仍待核验的模型提交，供页面关闭保护。 */
  hasPendingModelEdits(): boolean {
    return [...this.#arrayEdits.values()].some(owner => owner.getState().pending)
      || [...this.#modelRenames.values()].some(owner => owner.getState().pending)
      || [...this.#modelEdits.values()].some(owner => {const current = owner.getState(); return current.pending || current.status !== 'idle'})
  }

  /** 维护注册名及本空间明确引用，原正式模型ID、来源和内部表键保持不变。 */
  getModelRename(modelId: string): ModelRenameHandle {
    this.assertLive()
    let owner = this.#modelRenames.get(modelId)
    if (!owner) {
      const host = createModelRenameHost({dataSet: this.metadataDataSet, targetId: this.targetId, modelId, lifecycle: {
        assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate(),
        prepareFile: (before, after) => this.prepareModelConfigurationChange({modelId, before, after}),
        completed: () => {
          this.#modelEdits.clear(); this.#fieldEdits.clear(); this.#sourceInputs.clear(); this.#modelSources.clear()
          const directory = this.metadataDataSet.getView('Base_DataModel_Field', 'default')
          if (directory && !directory.hasEditingChanges() && !directory.dirtyTracking.hasPendingChanges() && !directory.mutating) {
            directory.discardEditingRows()
          }
        },
      }})
      owner = createModelRenameHandle(host)
      this.#modelRenames.set(modelId, owner)
    }
    return owner
  }

  /** 离开模型节点时释放空的改名输入；未决操作继续由会话保留。 */
  releaseModelRename(modelId: string): void {
    const owner = this.#modelRenames.get(modelId)
    if (!owner || owner.getState().pending) return
    owner.release(); this.#modelRenames.delete(modelId)
  }

  private async prepareModelConfigurationChange(input: PrepareModelConfigurationChangeInput): Promise<ModelRenameFilePlan & Pick<SourceContractPlan, 'check' | 'viewChanges'>> {
    const {modelId, before, after, arrayChange, sourceChange} = input
    this.assertOwner(); this.assertMetadataClean()
    const file = this.#file, text = file?.getText() ?? null, revision = file?.revision
    const check = () => {
      this.assertOwner(); this.assertMetadataClean()
      for (const name of Object.keys(ScenarioDefinitionRecords.resources)) {
        if (this.metadataDataSet.getTable(name)?.viewList.some(view => view.mutating || view.requestState === SparkData.RequestState.Loading
          || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw new Error('请先处理定义视图草稿或查询')
      }
      const space = this.metadataDataSet.getView('Base_DataSet')
      if (space?.hasEditingChanges() || space?.dirtyTracking.hasPendingChanges() || this.hasPendingModelCreate() || this.hasPendingModelRemovals()
        || [...this.#modelSources].some(([id, owner]) => (!sourceChange || id !== modelId) && owner.getState().pending)
        || [...this.#modelEdits.values(), ...this.#fieldEdits.values(), ...this.#sourceInputs.values()].some(owner => owner.getState().status !== 'idle')) throw new Error('请先处理其他定义操作')
      if (this.#file !== file || file?.isDirty || file?.revision !== revision || (file?.getText() ?? null) !== text
        || file && file.saveStatus !== 'idle') throw new Error('场景配置已变化或尚未确认，请先处理配置')
    }
    check()
    const config = file ? structuredClone((arrayChange ? LowcodeDataSpaceArrayConfiguration.rewrite(file.value, arrayChange) : file.value).toJSON()) : null, tables: string[] = []
    const viewChanges: SourceContractPlan['viewChanges'] = []
    if (config && isRecord(config['tables'])) for (const [name, value] of Object.entries(config['tables'])) {
      if (!isRecord(value) || !isRecord(value['modelBinding'])) continue
      const binding = value['modelBinding']
      if (binding['modelId'] === modelId) {
        if (binding['modelName'] !== before) throw new Error('场景模型身份与正式注册名不一致')
        binding['modelName'] = after; tables.push(name)
        if (sourceChange && isRecord(value['views'])) for (const [viewId, view] of Object.entries(value['views'])) {
          if (!isRecord(view) || !Array.isArray(view['fieldProjection'])) continue
          const original = sourceChange.previous()
          if (!original) throw new Error(`${name}@${viewId} 原模型尚无数据字段，不能沿用已有固定投影`)
          LowcodeDataSpaceViewFields.validateProjection(view, original, `${name}@${viewId}`)
          for (const column of view['fieldProjection']) {
            if (!isRecord(column)) continue
            const field = sourceChange.after.fields.find(candidateField => candidateField.id === column['fieldId'])
            if (!field || field.canonicalName !== column['resourceField'] || !field.output) throw new Error(`${name}@${viewId} 字段身份或输出发生变化，不能套用类型/主键迁移`)
            const type = field.type || 'string'
            if (column['type'] === type && column['primaryKey'] === field.primaryKey) continue
            viewChanges.push({tableName: name, viewId, fieldId: field.id,
              before: `类型 ${String(column['type'])}；主键 ${String(column['primaryKey'])}`,
              after: `类型 ${type}；主键 ${String(field.primaryKey)}`})
            column['type'] = type; column['primaryKey'] = field.primaryKey
          }
        }
      } else if (binding['modelName'] === before || binding['modelName'] === after) throw new Error('场景存在其他同名模型绑定，请先处理')
    }
    const candidate = config && tables.length && JSON.stringify(config) !== JSON.stringify(file?.value.toJSON()) ? JSON.stringify(config) : text
    if (candidate !== null) new ScenarioViewConfig(this.targetId, candidate)
    if (sourceChange) await this.validateModelViewConfiguration(sourceChange.after, candidate === null ? undefined : new ScenarioViewConfig(this.targetId, candidate), true)
    if (await this.previewRemoteViews() !== text) throw new Error('远端场景配置已变化，请重新打开')
    const fieldNames = arrayChange ? LowcodeDataSpaceArrayConfiguration.names(arrayChange) : undefined
    const tools = before !== after || fieldNames?.size
      ? await LowcodeDataSpaceModelRenameTools.prepare({
        dataSet: this.metadataDataSet,
        targetId: this.targetId,
        before,
        after,
        assertLive: () => this.assertLive(),
        ...(fieldNames !== undefined ? { fieldNames } : {}),
      })
      : undefined
    check()
    let owned = text
    const commandViews = new Map<string, SparkData.DataView>(), signatures = new Map<SparkData.DataView, string>()
    const signature = (view: SparkData.DataView) => JSON.stringify([view.queryContext, view.filterExpression, view.rows.map(row => {
      const id = view.getPkKey(row)
      if (id === undefined) throw new Error('定义查询行缺少主键')
      return Object.entries(view.getEditingRow(id) ?? row).filter(([key]) => key !== '_pk' && key !== 'dataModelName').sort(([a], [b]) => a.localeCompare(b))
    })])
    const selectors = () => [...commandViews.values()].map(view => ({tableName: view.tableName, viewId: view.viewId}))
    const assertCompletion = () => {
      this.assertOwner(); this.assertMetadataClean()
      for (const name of Object.keys(ScenarioDefinitionRecords.resources)) {
        if (this.metadataDataSet.getTable(name)?.viewList.some(view => ![...commandViews.values()].includes(view)
          && (view.mutating || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()))) throw new Error('改名期间其他定义视图出现草稿，不能覆盖')
      }
      for (const [view, expected] of signatures) {
        if (view.destroyed || view.mutating || view.requestState !== SparkData.RequestState.Loaded
          || this.metadataDataSet.getView(view.tableName, view.viewId) !== view || signature(view) !== expected) throw new Error('改名期间定义命令视图出现外来修改，不能覆盖')
      }
      if (this.#file !== file || (file?.getText() ?? null) !== owned) throw new Error('改名期间场景配置被其他编辑改变，不能覆盖')
      const models = this.metadataDataSet.getView('Base_DataModel'), row = models?.rows.find(item => item['rowid'] === modelId)
      if (!models || !row || models.requestState !== SparkData.RequestState.Loaded || models.rows.length !== models.total || row['Name'] !== after
        || models.fieldAccess(row, 'Name').read !== 'visible' || models.hasEditingChanges() || models.dirtyTracking.hasPendingChanges()) throw new Error('正式注册名未确认，不能保存场景绑定')
    }
    const stageDefinitions = async (nextText: string): Promise<void> => {
      if (!file) return
      const next = new ScenarioViewConfig(this.targetId, nextText)
      for (const [name, resource] of Object.entries(ScenarioDefinitionRecords.resources)) {
        const previous = ScenarioDefinitionRecords.read(file.value, resource), candidateRows = ScenarioDefinitionRecords.read(next, resource)
        const source = this.metadataDataSet.getView(name, 'default')
        if (!source || source.dataTable?.resourceId !== resource) throw new Error('正式定义资源缺失或已改变')
        // 配置投影尚未进入SparkData.DataView，不含其计算主键；先按正式主键字段匹配，再从查询行取得实际主键。
        const identity = (row: SparkData.DataRow) => JSON.stringify(source.pk.effectivePkFields.map(field => row[field]))
        const candidates = new Map(candidateRows.map(row => [identity(row), row]))
        if (previous.length !== candidates.size || previous.some(row => !candidates.has(identity(row)))) throw new Error('定义改名不能隐式增删模型或视图')
        const updates = previous.flatMap(row => {
          const rowIdentity = identity(row), candidateRow = candidates.get(rowIdentity)
          if (!candidateRow) throw new Error('定义改名缺少原记录对应项')
          const patch = Object.fromEntries([...new Set([...Object.keys(row), ...Object.keys(candidateRow)])]
            .filter(key => key !== '_pk' && key !== 'dataModelName' && JSON.stringify(row[key]) !== JSON.stringify(candidateRow[key]))
            .map(key => [key, candidateRow[key]]))
          return Object.keys(patch).length ? [{rowIdentity, patch}] : []
        })
        if (!updates.length) continue
        let view = commandViews.get(name)
        if (view?.requestState !== SparkData.RequestState.Loaded) {
          if (!view) {view = source.createQueryView(`modelDefinition:${modelId}`); commandViews.set(name, view)}
          if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw new Error('定义查询已失效，未提交修改继续保留')
          const result = await view.loadFromServer({allPages: true, maxRows: 50000})
          if (!result.success || view.loadingError || view.queryContext['dataSpaceId'] !== this.targetId) throw new Error('定义命令查询未完成')
          signatures.set(view, signature(view))
          assertCompletion()
        }
        for (const {rowIdentity, patch} of updates) {
          const row = view.rows.find(value => identity(value) === rowIdentity), id = row && view.getPkKey(row)
          if (id === undefined || row?.['dataSetId'] !== this.targetId) throw new Error('修改定义不在本次查询结果内')
          for (const [key, value] of Object.entries(patch)) view.updateEditingValue(id, key, value)
        }
        signatures.set(view, signature(view))
      }
    }
    const submitDefinitions = async (): Promise<void> => {
      assertCompletion()
      try {
        const result = await this.metadataDataSet.saveChanges({views: selectors()})
        if (!result.success) throw new Error(result.message ?? '模型已修改，定义提交尚未确认')
        if (file && !file.isDirty && file.saveStatus === 'idle') owned = file.getText()
      } catch (error) {
        if (file && error instanceof Error && error.message.startsWith('SCENARIO_DEFINITION_NOT_APPLIED:')
          && file.getText() === file.savedText) owned = file.getText()
        throw error
      } finally {
        if (file?.saveStatus === 'unknown' && file.getText() === file.submittedText) owned = file.getText()
      }
      assertCompletion()
      if ([...commandViews.values()].some(view => view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw new Error('定义还有未确认修改')
    }
    const adoptDefinitions = async (remote: string): Promise<void> => {
      if (!file) return
      await this.adoptDefinitionViews({expectedRevision: file.revision, previewText: remote, discardViews: selectors()}, false)
      owned = remote
      for (const view of commandViews.values()) signatures.set(view, signature(view))
      assertCompletion()
    }
    return {tables, tools: tools?.pageIds ?? [], references: tools?.changes ?? [], viewChanges, check,
      assertCurrent: async () => {
        check(); await tools?.assertCurrent()
        if (sourceChange && await this.previewRemoteViews() !== text) throw new Error('远端视图配置已变化，请重新预览来源合同')
        check()
      }, complete: async reconcile => {
      assertCompletion()
      if (file && candidate !== text && candidate !== null) {
        let nextText = candidate
        if (file.saveStatus === 'pending') throw new Error('场景文件仍在提交')
        if (file.saveStatus === 'unknown') {
          try {await submitDefinitions(); assertCompletion()}
          catch (cause) {if (!reconcile || !(cause instanceof Error) || !cause.message.startsWith('SCENARIO_VIEW_CONFLICT:')) throw cause}
        }
        if (reconcile && (arrayChange || sourceChange)) {
          const remote = await this.previewRemoteViews()
          assertCompletion()
          if (remote === null || remote !== text && remote !== candidate) throw new Error('定义迁移期间远端配置已改变，请先核查冲突；不会重复替换字段')
          if (remote !== file.savedText || file.saveStatus !== 'idle') {
            await adoptDefinitions(remote)
          }
        } else if (reconcile) {
          const remote = await this.previewRemoteViews()
          assertCompletion()
          if (remote === null) throw new Error('远端场景配置已删除，请先处理该冲突')
          const current = structuredClone(new ScenarioViewConfig(this.targetId, remote).toJSON()), currentTables = current['tables']
          if (!isRecord(currentTables)) throw new Error('远端场景模型配置无效')
          for (const value of Object.values(currentTables)) {
            if (!isRecord(value) || !isRecord(value['modelBinding'])) continue
            const binding = value['modelBinding']
            if (binding['modelId'] === modelId) {
              if (binding['modelName'] !== before && binding['modelName'] !== after) throw new Error('远端模型绑定已指向其他注册名，不能覆盖')
              binding['modelName'] = after
            } else if (binding['modelName'] === before || binding['modelName'] === after) throw new Error('远端存在同名模型绑定，不能覆盖')
          }
          nextText = JSON.stringify(current)
          if (remote !== file.savedText || file.saveStatus !== 'idle') {
            await adoptDefinitions(remote)
          }
        }
        if (file.getText() !== nextText) {
          if (!reconcile && await this.previewRemoteViews() !== text) throw new Error('远端场景配置已变化，保留原文供处理')
          assertCompletion(); await stageDefinitions(nextText)
        }
        assertCompletion()
        if ([...commandViews.values()].some(view => view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) await submitDefinitions()
        if (file.saveStatus !== 'idle' || file.isDirty) throw new Error('场景绑定保存尚未确认')
      }
      await tools?.complete(reconcile)
      assertCompletion()
      for (const view of commandViews.values()) view.dataTable?.destroyView(view.viewId)
      commandViews.clear(); signatures.clear()
      if (!sourceChange) await this.refresh({deferDefinition: true})
    }}
  }

  /** 删除当前模型及其正式从属定义，复用原元数据视图和文件依赖检查。 */
  getModelRemove(modelId: string): ModelRemoveHandle {
    this.assertLive()
    let owner = this.#modelRemovals.get(modelId)
    if (!owner) {
      const host = createModelRemoveHost({
        dataSet: this.metadataDataSet, targetId: this.targetId, modelId,
        lifecycle: {assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate(), validateFile: views => this.validateModelRemoval(modelId, views)},
      })
      owner = createModelRemoveHandle(host)
      this.#modelRemovals.set(modelId, owner)
    }
    return owner
  }

  /** 含预览和未决删除，避免模型行消失后丢失核验入口。 */
  hasPendingModelRemovals(): boolean {return [...this.#modelRemovals.values()].some(owner => owner.getState().pending)}

  private async validateModelRemoval(modelId: string, views: readonly SparkData.DataView[]): Promise<LowcodeDataSpaceModelRemovalFilePlan> {
    this.assertOwner(); this.assertMetadataClean()
    const file = this.#file, text = file?.getText() ?? null, revision = file?.revision
    const layoutView = this.metadataDataSet.getView('DataSpaceLayoutDefinition', 'default')
    if (!layoutView || layoutView.dataTable?.resourceId !== ScenarioDefinitionRecords.resources.DataSpaceLayoutDefinition) throw new Error('布局定义视图缺失')
    const assertLayoutClean = () => {
      if (layoutView.dataTable?.viewList.some(view => view.mutating || view.requestState === SparkData.RequestState.Loading
        || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw new Error('请先处理布局草稿或查询，再删除模型')
    }
    const assertCurrent = () => {
      this.assertOwner(); this.assertMetadataClean()
      assertLayoutClean()
      const space = this.metadataDataSet.getView('Base_DataSet', 'default')
      // 本操作暂存的删除也会被编辑owner看作pending；草稿由删除owner检查，这里只拦其他未决提交。
      if (space?.hasEditingChanges() || space?.dirtyTracking.hasPendingChanges()
        || [...this.#modelEdits.values(), ...this.#fieldEdits.values(), ...this.#sourceInputs.values()].some(owner => owner.getState().status !== 'idle')
        || this.hasPendingModelCreate() || this.hasPendingModelSourceEdits()) throw new Error('请先处理其他定义操作，再删除模型')
      if (this.#file !== file || file?.isDirty || file?.revision !== revision || (file?.getText() ?? null) !== text
        || this.viewState && this.viewState.saveStatus !== 'idle') throw new Error('视图配置已变化或尚未确认，请先处理配置')
    }
    assertCurrent()
    const config = file?.value.toJSON(), tables = config?.['tables']
    const models = this.metadataDataSet.getView('Base_DataModel', 'default')
    const modelName = models?.rows.find(row => row['rowid'] === modelId)?.['Name']
    if (isRecord(tables)) for (const [name, table] of Object.entries(tables)) {
      if (isRecord(table) && isRecord(table['modelBinding']) && (table['modelBinding']['modelId'] === modelId
        || typeof modelName === 'string' && table['modelBinding']['modelName'] === modelName)) throw new Error(`模型仍有视图绑定：${name}，请先解除并保存`)
    }
    const removedRelations = new Set(views.find(view => view.tableName === 'Base_DataModel_Relation')?.rows
      .filter(row => row['parentModId'] === modelId || row['childModId'] === modelId).map(row => row['rowid']))
    if (!file?.value.usesNativeResourceRelations && Array.isArray(config?.['resourceRelations']) && config['resourceRelations'].some(relation => isRecord(relation)
      && removedRelations.has(relation['sourceRelationId']))) throw new Error('文件仍有来源关系扩展，请先解除并保存')
    const remote = await this.previewRemoteViews()
    assertCurrent()
    if (remote !== text) throw new Error('远端视图配置已变化，请重新打开后预览删除')
    const layout = config?.['layout']
    const hasLayout = isRecord(layout) && (isRecord(layout['modelPositions']) && Object.hasOwn(layout['modelPositions'], modelId)
      || isRecord(layout['unboundEdges']) && Object.values(layout['unboundEdges']).some(edge => isRecord(edge) && (edge['source'] === modelId || edge['target'] === modelId)))
    if (hasLayout) {
      await layoutView.refresh()
      if (layoutView.loadingError) throw layoutView.loadingError
      assertCurrent()
    }
    const layoutRow = () => {
      if (layoutView.destroyed || this.metadataDataSet.getView(layoutView.tableName, layoutView.viewId) !== layoutView
        || layoutView.queryContext['dataSpaceId'] !== this.targetId || layoutView.requestState !== SparkData.RequestState.Loaded
        || layoutView.rows.length !== 1 || layoutView.total !== 1 || layoutView.rows[0]?.['dataSetId'] !== this.targetId) throw new Error('布局查询身份已变化')
      const id = layoutView.getPkKey(layoutView.rows[0])
      if (id === undefined) throw new Error('布局定义记录缺少主键')
      const row = layoutView.getEditingRow(id)
      if (!row) throw new Error('布局定义记录缺失')
      return {id, row}
    }
    const layoutSignature = () => JSON.stringify(Object.entries(layoutRow().row).sort(([a], [b]) => a.localeCompare(b)))
    let ownedLayout = hasLayout ? layoutSignature() : null
    let ownedText = text
    const assertCompletion = (): void => {
      this.assertLive(); this.assertMetadataClean()
      if (hasLayout && (layoutSignature() !== ownedLayout || layoutView.mutating
        || layoutView.dataTable?.viewList.some(view => view !== layoutView && (view.mutating || view.requestState === SparkData.RequestState.Loading
          || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())))) throw new Error('布局清理期间出现外来草稿或查询，不能覆盖')
      if (this.#file !== file || this.options.workspace.getScenarioViews(this.targetId) !== file
        || (file?.getText() ?? null) !== ownedText) throw new Error('布局清理期间文件或外来草稿已变化，不能覆盖')
      for (const tableName of ['Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation']) {
        const view = views.find(item => item.tableName === tableName)
        if (view?.requestState !== SparkData.RequestState.Loaded || this.metadataDataSet.getView(tableName, view.viewId) !== view || view.mutating || view.rows.length !== view.total
          || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw new Error('布局清理所需元数据已变化或仍有草稿')
        if (view.rows.some(row => tableName === 'Base_DataModel' ? row['rowid'] === modelId
          : tableName === 'Base_DataModel_Field' ? row['dataModelId'] === modelId : row['parentModId'] === modelId || row['childModId'] === modelId)) {
          throw new Error('模型或从属定义仍存在，不能清理布局')
        }
      }
    }
    const refreshProjection = async (): Promise<void> => {
      await this.refresh({deferDefinition: true})
    }
    const submitLayout = async (): Promise<void> => {
      assertCompletion()
      try {
        const result = await this.metadataDataSet.saveChanges({views: [{tableName: layoutView.tableName, viewId: layoutView.viewId}]})
        if (!result.success) throw new Error(result.message ?? '模型已删除，布局清理尚未确认')
        if (file && !file.isDirty && file.saveStatus === 'idle') ownedText = file.getText()
      } catch (error) {
        if (file && error instanceof Error && error.message.startsWith('SCENARIO_DEFINITION_NOT_APPLIED:')
          && file.getText() === file.savedText) ownedText = file.getText()
        throw error
      } finally {
        if (file?.saveStatus === 'unknown' && file.getText() === file.submittedText) ownedText = file.getText()
      }
      assertCompletion()
      if (layoutView.hasEditingChanges() || layoutView.dirtyTracking.hasPendingChanges()) throw new Error('布局还有未确认修改')
    }
    const assertRemovedReferences = (value: ScenarioViewConfig): void => {
      const candidate = value.toJSON(), candidateTables = candidate['tables']
      if (isRecord(candidateTables) && Object.values(candidateTables).some(table => isRecord(table) && isRecord(table['modelBinding'])
        && (table['modelBinding']['modelId'] === modelId || table['modelBinding']['modelName'] === modelName))) {
        throw new Error('当前文件仍绑定已删除模型，请先修复配置后继续')
      }
      if (!value.usesNativeResourceRelations && Array.isArray(candidate['resourceRelations']) && candidate['resourceRelations'].some(relation => isRecord(relation)
        && removedRelations.has(relation['sourceRelationId']))) throw new Error('当前文件仍引用已删除模型关系，请先修复配置后继续')
    }
    return {baseline: text, layout: hasLayout, assertCurrent, complete: async reconcile => {
      assertCompletion()
      if (!file || !hasLayout) return
      if (file.saveStatus === 'pending') throw new Error('布局文件仍在提交，请等待完成')
      if (file.saveStatus === 'unknown') {
        try {
          await submitLayout()
          await refreshProjection(); return
        } catch (error) {
          if (!reconcile || !(error instanceof Error) || !error.message.startsWith('SCENARIO_VIEW_CONFLICT:')) throw error
        }
      }
      if (reconcile) {
        const currentRemote = await this.previewRemoteViews()
        assertCompletion()
        if (currentRemote !== null) assertRemovedReferences(new ScenarioViewConfig(this.targetId, currentRemote))
        if (currentRemote !== file.savedText || file.saveStatus !== 'idle') {
          await this.adoptViews({expectedRevision: file.revision, previewText: currentRemote,
            discardViews: [{tableName: layoutView.tableName, viewId: layoutView.viewId}]})
          this.assertLive()
          if (currentRemote === null) {await refreshProjection(); return}
          ownedText = currentRemote
          ownedLayout = layoutSignature()
          assertCompletion()
        }
      }
      assertRemovedReferences(file.value)
      const {id, row} = layoutRow()
      if (isRecord(row['unboundEdges'])) {
        const edges = Object.fromEntries(Object.entries(row['unboundEdges'])
          .filter(([, edge]) => !isRecord(edge) || edge['source'] !== modelId && edge['target'] !== modelId))
        if (Object.keys(edges).length !== Object.keys(row['unboundEdges']).length) layoutView.updateEditingValue(id, 'unboundEdges', edges)
      }
      if (isRecord(row['modelPositions']) && Object.hasOwn(row['modelPositions'], modelId)) {
        const positions = {...row['modelPositions']}
        Reflect.deleteProperty(positions, modelId)
        layoutView.updateEditingValue(id, 'modelPositions', positions)
      }
      ownedLayout = layoutSignature()
      assertCompletion()
      if (layoutView.hasEditingChanges() || layoutView.dirtyTracking.hasPendingChanges()) await submitLayout()
      assertCompletion()
      if (file.isDirty || file.saveStatus !== 'idle') throw new Error('模型已删除，布局清理尚未确认')
      await refreshProjection()
    }}
  }


  /** 同一会话复用新模型创建状态；新增记录仍归原模型和字段视图。 */
  getModelCreate(): ModelCreateHandle {
    this.assertLive()
    if (!this.#modelCreate) {
      const host = createModelCreateHost({
        dataSet: this.metadataDataSet, targetId: this.targetId, sources: this.options.modelSources,
        lifecycle: {assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate({preserveModelInputs: true})},
      })
      this.#modelCreate = createModelCreateHandle(host)
    }
    return this.#modelCreate
  }

  /** 包括预览和没有本地delta的未决新增，避免关闭时丢失核验入口。 */
  hasPendingModelCreate(): boolean {return this.#modelCreate?.getState().pending === true}

  /** 保留字段合同的来源替换或当前来源同步；共用正式来源读取与原SparkData.DataView保存。 */
  getModelSourceEdit(modelId: string): ModelSourceEditHandle {
    this.assertLive()
    if (!this.options.modelSources) throw new Error('模型来源读取能力不可用')
    let owner = this.#modelSources.get(modelId)
    if (!owner) {
      const host = createModelSourceEditHost({
        dataSet: this.metadataDataSet, targetId: this.targetId, modelId, sources: this.options.modelSources,
        lifecycle: {
          validateConfiguration: () => this.validateSourceConfiguration(),
          validateTransition: model => this.validateSourceTransition(modelId, {sourceType: model.Type, sourceName: model.MetaName}),
          prepareContract: change => this.prepareModelConfigurationChange({
            modelId, before: change.after.name, after: change.after.name, sourceChange: change,
          }),
          validateRemovals: (ids, contract) => this.validateSourceRemovals(modelId, ids, contract),
          assertCurrent: () => this.assertLive(), onDispatch: () => this.invalidate(),
          completed: () => {this.#modelEdits.clear(); this.#fieldEdits.clear(); this.#sourceInputs.clear()},
        },
      })
      owner = createModelSourceEditHandle(host)
      this.#modelSources.set(modelId, owner)
    }
    return owner
  }

  /** 来源命令共享文件身份核对；模型列冲突由完整候选合同检查，不另按输出名校验。 */
  private async validateSourceConfiguration(): Promise<() => void> {
    this.assertOwner(); this.assertMetadataClean()
    const file = this.#file, text = file?.getText() ?? null, revision = file?.revision
    const assertCurrent = () => {
      this.assertOwner(); this.assertMetadataClean()
      if (this.#file !== file || file?.isDirty || file?.revision !== revision || (file?.getText() ?? null) !== text) throw new Error('视图配置已变化，请先处理配置再重新预览来源')
    }
    assertCurrent()
    const remote = await this.previewRemoteViews()
    assertCurrent()
    if (remote !== text) throw new Error('远端视图配置已变化，请刷新后重新预览来源')
    return assertCurrent
  }

  private async validateSourceTransition(modelId: string, model: Pick<FormalModel, 'sourceType' | 'sourceName'>): Promise<() => void> {
    const check = await this.validateSourceConfiguration()
    const original = this.metadataDataSet.getView('Base_DataModel', 'default')?.rows.find(row => row['rowid'] === modelId)
    if (!original || typeof original['Name'] !== 'string' || typeof original['Type'] !== 'string' || typeof original['MetaName'] !== 'string') throw new Error('来源切换缺少正式模型身份')
    const from = DataSpaceDesignApi.resolveTableResource({sourceType: original['Type'], sourceName: original['MetaName']})
    const to = DataSpaceDesignApi.resolveTableResource(model)
    const tables = this.#file?.value.toJSON()['tables']
    if (isRecord(tables)) for (const [name, table] of Object.entries(tables)) {
      if (!isRecord(table) || !isRecord(table['modelBinding']) || table['modelBinding']['modelId'] !== modelId) continue
      if (table['modelBinding']['modelName'] !== original['Name'] || !isRecord(table['views'])) throw new Error(`${name}的模型绑定已失效`)
      const requests = SparkData.FormalTableRequestConfig.parse(table, `tables.${name}`)
      if (from.resourceType !== to.resourceType && Object.keys(requests.endpoints).length) throw new Error(`${name}.api含显式请求端点，须先确认新来源的查询和提交合同`)
      for (const [viewId, view] of Object.entries(table['views'])) {
        if (!isRecord(view)) throw new Error(`${name}@${viewId}不是有效视图定义`)
        const query = SparkData.DataViewQuery.parse(view['queryConfig'] ?? {})
        const fields = Array.isArray(view['fieldProjection']) ? view['fieldProjection'].filter(isRecord)
          .filter(field => field['output'] === true && (!query.fields || query.fields.includes(String(field['viewField'])))) : []
        try {
          DataSpaceRuntimeApi.validateResourceQuery(model, {sourceInputMode: query.sourceInputMode, outputType: query.outputType,
            tree: query.tree !== undefined || view['treeConfig'] !== undefined,
            aggregate: fields.some(field => typeof field['group'] === 'number' && field['group'] > 0
              || typeof field['valueFunction'] === 'string' && !!field['valueFunction'].trim())})
        } catch (error) {throw new Error(`${name}@${viewId}：${error instanceof Error ? error.message : String(error)}`)}
      }
    }
    check()
    return check
  }

  private async validateSourceRemovals(modelId: string, ids: readonly string[], contract?: SourceContractChange): Promise<() => void> {
    const check = await this.validateSourceConfiguration()
    let dependencies = this.#sourceRemovalDependencies.get(modelId)
    if (!dependencies) {
      const models = this.metadataDataSet.getView('Base_DataModel', 'default')
      if (!models) throw new Error('来源字段删除缺少模型目录视图')
      dependencies = new LowcodeDataSpaceModelDependencies({
        dataSet: this.metadataDataSet, targetId: this.targetId, modelId, operation: 'sourceRemoval',
        assertCurrent: () => this.assertLive(), editing: {view: models, id: modelId},
      })
      this.#sourceRemovalDependencies.set(modelId, dependencies)
    }
    await dependencies.load(true); check()
    const [models, fields] = dependencies.views
    const model = models.rows.find(row => row['rowid'] === modelId)
    if (!model || typeof model['Name'] !== 'string') throw new Error('同步字段所属模型不可确认')
    const snapshot = () => JSON.stringify(dependencies.views.map(view => view.rows))
    const baseline = snapshot()
    // 资源主键已经改变时，原注册定义未必还能按最新资源装配；按同批已核验合同对照正式元数据。
    const originalFields = fields.rows.filter(row => row['dataModelId'] === modelId && row['type'] === 'dataModel')
    const previous = contract?.previous()
    const formal = contract ? previous ? DataSpaceDesignApi.projectModel(model, originalFields,
      ['数据库表', '表', 'table'].includes(previous.sourceType) ? previous.fields.find(field => field.primaryKey)?.name ?? '' : '') : null
      : await this.readModel({scenarioId: this.targetId, modelId, modelName: model['Name']})
    if (contract) {
      const signature = (value: SourceContractChange['after']) => JSON.stringify([value.id, value.metaName, value.sourceName, value.sourceId, value.sourceType,
        value.primaryKey, value.raw['PrimaryKeyFields'], value.fields.map(({raw: _raw, ...field}) => field).sort((a, b) => a.id.localeCompare(b.id))])
      if (previous ? !formal || signature(formal) !== signature(previous) : originalFields.length > 0) throw new Error('同步删除的原字段合同已变化')
      if (contract.after.id !== modelId || contract.after.metaName !== model['Name']) throw new Error('来源变更的模型身份已变化')
    }
    check()
    if (snapshot() !== baseline || formal && (formal.id !== modelId || formal.metaName !== model['Name'] || formal.sourceName !== model['MetaName'])) throw new Error('同步字段正式定义已变化')
    for (const modelRow of models.rows) for (const key of ['addApi', 'updateApi', 'deleteApi', 'items']) {
      if (models.columns.some(column => column.name === key) && models.fieldAccess(modelRow, key).read !== 'visible') throw new Error(`${key}不可读，无法核验字段依赖`)
      const value = modelRow[key]
      if (value !== undefined && value !== null && value !== '') throw new Error(`${String(modelRow['Name'])}.${key}的字段引用尚未完整核验，请先处理再同步删除`)
    }
    for (const id of ids) {
      const rows = fields.rows.filter(row => row['rowid'] === id), row = rows[0]
      if (rows.length !== 1 || row?.['dataModelId'] !== modelId || !['dataModel', 'inputParams'].includes(String(row['type'])) || row['FieldType'] === '计算字段') throw new Error('同步删除字段身份不可确认')
      if (row['type'] === 'dataModel') {
        if (!formal) throw new Error('缺少待删除字段的原模型合同')
        const input = {model: formal, original: row, patch: {}, operation: 'remove' as const,
          config: this.#file?.value ?? null, metadata: this.metadataDataSet, targetId: this.targetId, definitionViews: dependencies.views}
        if (contract) LowcodeDataSpaceFieldOutput.validateReferences(input)
        else LowcodeDataSpaceFieldOutput.validate(input)
      }
      LowcodeDataSpaceFieldRemoveReferences.validate(dependencies.views, row, contract
        ? {primaryKeyReplacement: String(contract.after.raw['PrimaryKeyFields'] ?? '')} : {})
    }
    return () => {
      check(); dependencies.assertOwner()
      if (snapshot() !== baseline || dependencies.views.some(view => view.mutating || view.requestState !== SparkData.RequestState.Loaded
        || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw new Error('同步删除的依赖已变化，请重新预览')
    }
  }

  /** 包含来源预览和未决提交，避免释放时丢失核验入口。 */
  hasPendingModelSourceEdits(): boolean {return [...this.#modelSources.values()].some(owner => owner.getState().pending)}

  /** 复制当前空间的模型调用资料和命名视图键；正式主键由原读取owner确认，不输出业务行或授权凭据。 */
  async readApiInfo(): Promise<string> {
    const snapshot = (): string => {
      this.assertOwner(); this.assertMetadataClean()
      const spaceView = this.metadataDataSet.getView('Base_DataSet', 'default')
      const parameters = this.#inputParameterHost ? inputParameterGetState(this.#inputParameterHost) : undefined
      if (this.hasPendingModelEdits() || this.hasPendingFieldEdits() || this.hasPendingSourceInputs()
        || spaceView?.hasUnconfirmedSave
        || this.metadataDataSet.getTable('Base_DataModel_Field')?.viewList.some(view => view.mutating || view.hasUnconfirmedSave
          || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())
        || this.hasPendingModelCreate() || this.hasPendingModelSourceEdits() || this.hasPendingModelRemovals()
        || parameters && (parameters.pending || parameters.status !== 'idle')
        || this.#file?.isDirty || this.#file && this.#file.saveStatus !== 'idle') throw new Error('请先处理未提交修改或待核验操作，再复制 API 信息')
      return JSON.stringify(['Base_DataSet', 'Base_DataModel'].map(name => {
        const view = this.metadataDataSet.getView(name, 'default')
        if (!view || view.destroyed || view.requestState !== SparkData.RequestState.Loaded || view.mutating || view.rows.length !== view.total
          || view.queryContext['dataSpaceId'] !== this.targetId || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) {
          throw new Error('复制 API 所需的正式元数据尚未完整确认')
        }
        const keys = name === 'Base_DataSet' ? ['rowid'] : ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type']
        const owner = name === 'Base_DataSet' ? 'rowid' : 'dataSetId'
        if (name === 'Base_DataSet' && view.rows.length !== 1
          || view.rows.some(row => row[owner] !== this.targetId || keys.some(key => view.fieldAccess(row, key).read !== 'visible'))) {
          throw new Error('复制 API 所需的模型身份或归属不可读')
        }
        return [view.queryContext, view.rows]
      }))
    }
    const baseline = snapshot(), file = this.#file, revision = file?.revision
    const modelView = this.metadataDataSet.getView('Base_DataModel', 'default')
    if (!modelView) throw new Error('复制 API 所需的正式模型视图不存在')
    const identities = modelView.rows.map(row => {
      const modelId = row['rowid'], modelName = row['Name'], type = row['Type']
      if (typeof modelId !== 'string' || !modelId || typeof modelName !== 'string' || !modelName.trim() || typeof type !== 'string') throw new Error('正式模型身份不完整')
      return {modelId, modelName, type}
    })
    if (new Set(identities.map(item => item.modelId)).size !== identities.length
      || new Set(identities.map(item => item.modelName)).size !== identities.length) throw new Error('正式模型身份或注册名重复')
    const settled = await Promise.allSettled(identities.map(item => this.readModel({scenarioId: this.targetId, ...item})))
    if (snapshot() !== baseline || this.#file !== file || file?.revision !== revision) throw new Error('API 信息读取期间定义已变化，请重试')
    const tables = file?.value.toJSON()['tables']
    const models = identities.map((identity, index) => {
      const result = settled[index]
      if (!result || result.status === 'rejected') throw result?.reason ?? new Error('正式模型读取未完成')
      const model = result.value
      if (model.id !== identity.modelId || model.metaName !== identity.modelName) throw new Error('正式模型读取身份不一致')
      const dataViewKeys: string[] = []
      let bound = false
      if (isRecord(tables)) for (const table of Object.values(tables)) {
        if (!isRecord(table) || !isRecord(table['modelBinding']) || table['modelBinding']['modelId'] !== model.id) continue
        if (bound) throw new Error('命名视图的模型绑定不唯一')
        bound = true
        if (table['modelBinding']['modelName'] !== model.metaName || !isRecord(table['views'])) throw new Error('命名视图的模型绑定已失效')
        for (const viewId of Object.keys(table['views'])) dataViewKeys.push(SparkData.buildDataViewKey(model.metaName, viewId, this.targetId))
      }
      return {...identity, primaryKey: model.primaryKey, dataViewKeys}
    })
    return `const DataSetId = ${JSON.stringify(this.targetId)};\nconst DataModels = ${JSON.stringify(models, null, 2)};`
  }

  /** 检查当前声明编辑对参数引用的影响；不推断未来调用值，不保存或改写定义。 */
  inspectInputParameters(): InputParameterInspection {
    this.assertOwner()
    if (this.#file && !this.#definition && !this.#definitionError) {
      throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 参数引用定义投影已失效，请刷新')
    }
    const result = new LowcodeDataSpaceInputParameterReferences(this.metadataDataSet, this.targetId).inspect(this.#file?.value ?? null)
    if (this.#definitionError || this.#diagnostics.length > 0) {
      result.complete = false
      result.issues.push('目标定义未完整装配，引用检查仅覆盖当前可解析的配置')
    }
    return result
  }

  /** 当前文件投影的读取状态；保存后的unloaded不是装配失败，也不允许继续消费旧投影。 */
  get definitionStatus(): 'absent' | 'unloaded' | 'loading' | 'ready' | 'failed' {
    this.assertOwner()
    if (!this.#file) return 'absent'
    if (this.#definitionLoad) return 'loading'
    if (this.#definitionError) return 'failed'
    return this.#definition ? 'ready' : 'unloaded'
  }

  private readFunctionDefinition(): SparkData.DataSet | ScenarioViewConfig | null {
    this.assertOwner()
    this.#relationMetadata.assertClean()
    if (this.#file?.value.usesNativeResourceRelations) return this.#file.value
    const status = this.definitionStatus
    if (status === 'ready') this.assertProjectionClean()
    else if (this.#file) {
      if (this.metadataDataSet.getView('Base_DataModel_Relation')?.requestState !== SparkData.RequestState.Loaded) {
        throw new Error('模型关系配置尚未读取，上游字段候选暂不可用；请在模型输入参数区读取')
      }
      return this.#file.value
    }
    return this.definitionDataSet
  }

  get definitionDataSet(): SparkData.DataSet | null {
    this.assertOwner()
    if (this.#definitionError) throw this.#definitionError
    if (this.#file && !this.#definition) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 定义投影已失效，请刷新')
    return this.#definition
  }

  /** 捕获当前模型正式字段或工作区的可执行查询草稿；其他视图/结构草稿仍由原保护拒绝。 */
  private captureModelFieldPreview(modelId: string) {
    const scoped = this.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')
    const viewId = scoped?.requestState === SparkData.RequestState.Loaded && scoped.queryContext['modelId'] === modelId
      && scoped.queryContext['dataSpaceId'] === this.targetId ? 'modelFields' : 'default'
    const view = this.metadataDataSet.getView('Base_DataModel_Field', viewId)
    if (view?.requestState !== SparkData.RequestState.Loaded || view.rows.length !== view.total
      || viewId === 'default' && (view.hasEditingChanges()
        || !view.rows.some(row => row['dataModelId'] === modelId && row['type'] === 'dataModel'))) return undefined
    if (!view.rows.length && !view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges()) return undefined
    const read = () => {
      this.assertLive()
      if (view !== this.metadataDataSet.getView('Base_DataModel_Field', viewId) || view.requestState !== SparkData.RequestState.Loaded
        || view.rows.length !== view.total || viewId === 'modelFields' && view.queryContext['modelId'] !== modelId
        || view.queryContext['dataSpaceId'] !== this.targetId || view.dirtyTracking.hasPendingChanges()
        || [...this.#fieldCreates.values(), ...this.#fieldRemovals.values()].some(owner => owner.getState().pending)
        || [...this.#fieldEdits.values()].some(owner => owner.getState().status !== 'idle')) throw new Error('字段预览工作区或提交状态已变化')
      for (const other of Object.values(this.metadataDataSet.getTable('Base_DataModel_Field')?.views ?? {})) {
        if (other !== view && (other.hasEditingChanges() || other.dirtyTracking.hasPendingChanges())) throw new Error('其他字段视图仍有草稿，不能预览')
      }
      const fields = view.rows.filter(row => viewId === 'modelFields' || row['dataModelId'] === modelId && row['type'] === 'dataModel').map(row => {
        const id = view.getPkKey(row)
        if (typeof id !== 'string' || row['dataModelId'] !== modelId) throw new Error('字段预览身份或所属模型不一致')
        return this.getFieldEdit(id, viewId).readPreview()
      })
      if (!fields.length || new Set(fields.map(field => field.name)).size !== fields.length) throw new Error('字段预览为空或名称不唯一')
      return fields
    }
    const strictFieldGuard = viewId === 'modelFields'
    const applyProjection = (fields: ReturnType<typeof read>, target: SparkData.DataView): void => {
      const projection = target.fieldProjection.length ? target.fieldProjection : target.columns.filter(column => column.name !== '_pk').map(column => {
        const field = fields.find(candidate => candidate.name === column.name && candidate.formalOutput)
        if (!field) throw new Error('正式查询字段与预览工作区不一致，请重新读取')
        return {fieldId: field.id, source: 'resource' as const, resourceFieldId: field.id, resourceField: column.name,
          viewField: column.name, type: column.type, label: column.label ?? column.name, output: true,
          sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: column.isPrimaryKey === true,
          value: '', valueFunction: '', expression: ''}
      })
      if (!projection.length || fields.some(field => field.formalOutput && !projection.some(item => item.viewField === field.name))) {
        throw new Error('正式查询字段与预览工作区不一致，请重新读取')
      }
      target.configure({fieldProjection: projection.map(item => {
        const field = fields.find(candidate => candidate.name === item.viewField)
        if (field?.id !== item.resourceFieldId || item.output !== field.formalOutput) throw new Error('正式字段身份或输出已变化，不能套用旧草稿')
        return {...item, output: field.output, label: field.label || field.name, sortOrder: 0, sortDirection: null}
      }), sortExpression: [...fields].sort((a, b) => b.order - a.order)
        .flatMap(field => field.output && field.order > 0 && field.direction !== undefined ? [{field: field.name, direction: field.direction}] : [])})
    }
    if (strictFieldGuard) {
      const fields = read(), snapshot = JSON.stringify(fields)
      const assertCurrent = () => {if (JSON.stringify(read()) !== snapshot) throw new Error('字段查询设置已变化，请重新打开预览')}
      return {assertCurrent, apply: (target: SparkData.DataView) => {assertCurrent(); applyProjection(fields, target)}}
    }
    return {assertCurrent: () => {}, apply: (target: SparkData.DataView) => applyProjection(read(), target)}
  }

  private definitionReadGuard(options: DefinitionReadOptions = {}): () => void {
    const {allowMissingDefinition = false, previewModelId, fieldPreviewGuard, newViewDraft, previewIdentity,
      metadataNames = ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation']} = options
    const generation = this.#generation
    const previewGuard = previewModelId === undefined ? undefined : this.getModelEdit(previewModelId).capturePreview()
    const assertCurrent = (): void => {
      this.assertOwner()
      if (newViewDraft) this.#viewMetadata.assertCleanExceptNewViewDraft(newViewDraft.id, this.targetId)
      else this.assertMetadataClean()
      if (newViewDraft) {
        const definitions = this.metadataDataSet.getView('DataViewDefinition', 'default')
        const row = definitions?.rows.find(item => definitions.getPkKey(item) === newViewDraft.id)
        const draft = definitions?.getEditingRow(newViewDraft.id)
        if (!definitions || !row || !draft || !definitions.dirtyTracking.isPendingCreate(newViewDraft.id)
          || JSON.stringify(draft) !== newViewDraft.signature) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 新视图草稿已变化')
      }
      previewGuard?.(); fieldPreviewGuard?.()
      if (!allowMissingDefinition || this.#definition) this.assertProjectionClean()
      if (generation !== this.#generation || this.#file && this.#file.saveStatus !== 'idle') throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 定义已变化或保存待核验')
      const fieldDrafts = !fieldPreviewGuard && (this.hasPendingFieldEdits() || ['default', 'modelFields']
        .some(id => this.metadataDataSet.getView('Base_DataModel_Field', id)?.hasEditingChanges()))
      if (previewGuard && fieldDrafts) throw new Error('字段定义尚未保存，当前查询接口不支持字段结构草稿预览；请先保存或取消字段修改')
      const modelDrafts = previewGuard ? [...this.#arrayEdits.values(), ...this.#modelRenames.values()].some(owner => owner.getState().pending)
        || [...this.#modelEdits].some(([id, owner]) => id !== previewModelId && (owner.getState().pending || owner.getState().status !== 'idle'))
        : this.hasPendingModelEdits()
      if (modelDrafts || fieldDrafts || this.hasPendingSourceInputs()
        || this.metadataDataSet.getTable('DataTableBindingDefinition')?.viewList.some(view => view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges() || view.mutating)
        || this.hasPendingModelCreate() || this.hasPendingModelSourceEdits() || this.hasPendingModelRemovals()) throw new Error('请先处理元数据修改，再继续操作')
      for (const name of metadataNames) {
        const view = this.metadataDataSet.getView(name, 'default')
        if (view?.requestState !== SparkData.RequestState.Loaded || view.mutating || view.rows.length !== view.total
          || view.queryContext['dataSpaceId'] !== this.targetId || view.hasEditingChanges() && !(previewGuard && name === 'Base_DataModel')
          && !(newViewDraft && name === 'DataViewDefinition') || view.dirtyTracking.hasPendingChanges()
          && !(newViewDraft && name === 'DataViewDefinition' && view.dirtyTracking.pendingCreateIds.size === 1 && view.dirtyTracking.isPendingCreate(newViewDraft.id))) {
          throw new Error('所需元数据未完整读取或存在其他定义草稿，请先处理未保存修改')
        }
      }
      if (previewIdentity) this.assertPreviewMetadataIdentity(previewIdentity)
    }
    assertCurrent()
    return assertCurrent
  }

  private assertPreviewMetadataIdentity(input: NativeViewSelection): void {
    const space = this.metadataDataSet.getView('Base_DataSet', 'default')
    if (!space) throw new Error('DATA_SPACE_PREVIEW_OWNER: Base_DataSet元数据视图缺失')
    const spaceRows = space.rows.filter(row => space.getPkKey(row) === this.targetId)
    if (space.requestState !== SparkData.RequestState.Loaded || space.rows.length !== space.total || space.total !== 1
      || space.queryContext['dataSpaceId'] !== this.targetId || spaceRows.length !== 1) {
      throw new Error('DATA_SPACE_PREVIEW_OWNER: Base_DataSet未唯一确认当前目标空间')
    }
    const spaceRow = spaceRows[0]
    if (spaceRow === undefined) throw new Error('DATA_SPACE_PREVIEW_OWNER: Base_DataSet未唯一确认当前目标空间')
    if (spaceRow['rowid'] !== this.targetId || space.fieldAccess(spaceRow, 'rowid').read !== 'visible') {
      throw new Error('DATA_SPACE_PREVIEW_OWNER: Base_DataSet未唯一确认当前目标空间')
    }
    if ('fileResourceId' in input) return
    const models = this.metadataDataSet.getView('Base_DataModel', 'default')
    if (!models) throw new Error('DATA_SPACE_PREVIEW_MODEL: Base_DataModel元数据视图缺失')
    const matches = models.rows.filter(row => models.getPkKey(row) === input.modelId)
    if (models.requestState !== SparkData.RequestState.Loaded || models.rows.length !== models.total
      || models.queryContext['dataSpaceId'] !== this.targetId || matches.length !== 1) {
      throw new Error('DATA_SPACE_PREVIEW_MODEL: Base_DataModel未确认所选正式模型身份')
    }
    const model = matches[0]
    if (model === undefined) throw new Error('DATA_SPACE_PREVIEW_MODEL: Base_DataModel未确认所选正式模型身份')
    if (model['rowid'] !== input.modelId || model['dataSetId'] !== this.targetId || model['Name'] !== input.modelName
      || ['rowid', 'dataSetId', 'Name'].some(field => models.fieldAccess(model, field).read !== 'visible')) {
      throw new Error('DATA_SPACE_PREVIEW_MODEL: Base_DataModel未确认所选正式模型身份')
    }
  }

  private captureNewViewPreviewDraft(input: NativeViewSelection): Readonly<{id: string; signature: string; config: ScenarioViewConfig}> | undefined {
    const definitionView = this.metadataDataSet.getView('DataViewDefinition', 'default')
    const draftRows = definitionView?.rows.filter(row => row['tableName'] === input.tableName && row['viewId'] === input.viewId
      && definitionView.dirtyTracking.isPendingCreate(definitionView.getPkKey(row) ?? '')) ?? []
    if (!draftRows.length) return undefined
    const row = draftRows[0]
    if (draftRows.length !== 1 || !definitionView || !row) throw new Error('SCENARIO_VIEW_DRAFT_IDENTITY: 新视图草稿身份无效')
    const id = definitionView.getPkKey(row), idKey = id === undefined ? undefined : String(id), draft = idKey === undefined ? undefined : definitionView.getEditingRow(idKey)
    if (idKey === undefined || !draft) throw new Error('SCENARIO_VIEW_DRAFT_IDENTITY: 新视图草稿身份无效')
    if (draft['dataSetId'] !== this.targetId || draft['tableName'] !== input.tableName
      || draft['viewId'] !== input.viewId || ('fileResourceId' in input
        ? draft['dataModelId'] !== undefined || draft['dataModelName'] !== undefined
        : draft['dataModelId'] !== input.modelId || draft['dataModelName'] !== input.modelName)
      || ['dataSetId', 'tableName', 'viewId', ...('fileResourceId' in input ? [] : ['dataModelId', 'dataModelName']),
        ...Object.keys(draft).filter(key => ScenarioViewConfig.isViewProperty(key))].some(field => definitionView.fieldAccess(row, field).read !== 'visible')) {
      throw new Error('SCENARIO_VIEW_DRAFT_IDENTITY: 新视图草稿身份或读取权限无效')
    }
    const file = this.#file
    if (!file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 新视图预览需要已加载的模型配置')
    const config = structuredClone(file.value.toJSON()), tables = record(config['tables'], 'tables')
    const table = tables[input.tableName]
    if (table === undefined) throw new Error('SCENARIO_VIEW_PREVIEW_VIEW: 新视图所属模型未配置')
    const views = record(record(table, 'table')['views'], 'views')
    if (Object.hasOwn(views, input.viewId)) throw new Error('SCENARIO_VIEW_DRAFT_IDENTITY: 新增视图与已保存视图冲突')
    views[input.viewId] = Object.fromEntries(Object.entries(draft).filter(([key, value]) => ScenarioViewConfig.isViewProperty(key) && value !== undefined))
    return {id: idKey, signature: JSON.stringify(draft), config: new ScenarioViewConfig(this.targetId, JSON.stringify(config))}
  }

  /** Shared synchronous eligibility check for the preview action; the actual open repeats this guard. */
  canOpenPreview(input: NativeViewSelection): boolean {
    try {
      const draft = this.captureNewViewPreviewDraft(input)
      const newViewDraft = draft ? {id: draft.id, signature: draft.signature} : undefined
      this.definitionReadGuard({allowMissingDefinition: true, metadataNames: ['Base_DataSet', 'Base_DataModel'], previewIdentity: input,
        ...(newViewDraft ? {newViewDraft} : {})})
      return true
    } catch {return false}
  }

  /** Load only the owner records required to prove a new view's model/space identity, then rerun the strict preview guard. */
  async preparePreviewEligibility(input: NativeViewSelection): Promise<boolean> {
    try {
      const draft = this.captureNewViewPreviewDraft(input)
      if (!draft) return false
      const newViewDraft = {id: draft.id, signature: draft.signature}
      this.definitionReadGuard({allowMissingDefinition: true, metadataNames: [], newViewDraft})
      await this.#metadata.load(['Base_DataSet', 'Base_DataModel'])
      const assertCurrent = this.definitionReadGuard({allowMissingDefinition: true,
        metadataNames: ['Base_DataSet', 'Base_DataModel'], newViewDraft, previewIdentity: input})
      assertCurrent()
      return true
    } catch {return false}
  }

  /** 按已保存配置及所选模型范围重新装配命名预览；无需旧设计投影，仍拒绝未决元数据/文件草稿及过期身份。不查询或修改元数据视图中的业务行。 */
  async openPreview(input: NativeViewSelection): Promise<LowcodeDataSpaceQueryPreview> {
    const draft = this.captureNewViewPreviewDraft(input)
    const newViewDraft = draft ? {id: draft.id, signature: draft.signature} : undefined
    const assertCurrent = this.definitionReadGuard({allowMissingDefinition: true, metadataNames: ['Base_DataSet', 'Base_DataModel'],
      previewIdentity: input, ...(newViewDraft ? {newViewDraft} : {})})
    return this.design.openPreview({...input, scenarioId: this.targetId}, {
      assertCurrent, ...(draft ? {configOverride: draft.config} : {}),
      subscribe: listener => this.subscribePreviewGuard(assertCurrent, listener), blueprintTreeProjection: this.#blueprintTreeProjection,
    })
  }

  private subscribePreviewGuard(assertCurrent: () => void, listener: () => void): () => void {
    const changed = () => {try {assertCurrent()} catch {listener()}}
    const stop = this.metadataDataSet.onAnyViewChange({editingChanged: changed, rowsChanged: changed,
      configChanged: changed, requestStateChanged: changed, mutatingChanged: changed, cleared: changed})
    this.#previewInvalidationListeners.add(listener)
    return () => {stop(); this.#previewInvalidationListeners.delete(listener)}
  }

  /** 按正式模型及已保存初值创建预览SparkData.DataView；请求调整留在预览实例，不保存模型请求草稿。 */
  async openModelPreview(input: Pick<SessionSelection, 'modelId' | 'modelName'>): Promise<LowcodeDataSpaceQueryPreview> {
    await this.ensureDefaultFieldCatalogForPreview()
    const fields = this.captureModelFieldPreview(input.modelId)
    const guard = this.definitionReadGuard({allowMissingDefinition: true, previewModelId: input.modelId,
      metadataNames: ['Base_DataSet', 'Base_DataModel'],
      ...(fields ? {fieldPreviewGuard: fields.assertCurrent} : {})})
    const assertCurrent = (): void => {
      guard()
      const models = this.metadataDataSet.getView('Base_DataModel', 'default')
      const matches = models?.rows.filter(row => models.getPkKey(row) === input.modelId) ?? []
      const row = matches[0]
      if (!models || !row || matches.length !== 1 || row['rowid'] !== input.modelId || row['dataSetId'] !== this.targetId
        || row['Name'] !== input.modelName || ['rowid', 'dataSetId', 'Name'].some(field => models.fieldAccess(row, field).read !== 'visible')) {
        throw new Error('SCENARIO_VIEW_MODEL_IDENTITY: 模型预览身份或读取权限已变化')
      }
    }
    assertCurrent()
    const preview = await this.design.openModelPreview({...input, scenarioId: this.targetId}, assertCurrent,
      listener => this.subscribePreviewGuard(assertCurrent, listener))
    try {
      const view = preview.view
      const initial = this.getModelEdit(input.modelId).readPreview(view)
      fields?.apply(view)
      view.filterExpression = initial.filterExpression
      view.queryConfig = {
        ...view.queryConfig,
        outputType: initial.outputType,
        ...(initial.outputType === 'SelfRefData' && initial.nodeId ? {
          tree: {
            keyField: initial.keyField,
            parentField: initial.parentField,
            ...(initial.hasChildrenField ? {hasChildrenField: initial.hasChildrenField} : {}),
            mode: treeRelationMode(initial.treeMode),
            nodeId: initial.nodeId,
          },
        } : {}),
      }
      assertCurrent()
      return preview
    } catch (cause) {
      preview.dispose()
      throw cause
    }
  }

  /** Assembly failure leaves metadata and the file editable; it never represents a valid empty definition. */
  get definitionError(): Error | null {
    this.assertOwner()
    return this.#definitionError
  }

  /** 当次装配未能转换的来源诊断；原始元数据保留，不能把运行子集当完整定义。 */
  get definitionDiagnostics(): readonly string[] {
    this.assertOwner()
    if (this.#file && !this.#definition && !this.#definitionError) {
      throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 装配诊断已失效，请刷新')
    }
    return this.#diagnostics
  }

  private requireViewState(): PageDataSpaceViewState {
    const current = this.viewState
    if (!current) throw new Error('SCENARIO_VIEW_FILE_MISSING: 视图文件不存在')
    return current
  }

  /** 重读文件定义；延迟模式先交付元数据，画布读取端点，完整编辑工作区再调用loadDefinition。 */
  async refresh(options: SessionLoadOptions = {}): Promise<void> {
    this.assertLive()
    this.assertMetadataClean()
    this.attach(this.options.workspace.getScenarioViews(this.targetId))
    this.invalidate()
    const generation = this.#generation
    await this.#viewMetadata.reset()
    this.assertLive()
    if (generation !== this.#generation) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 刷新已过期')
    this.assertMetadataClean()
    const file = this.options.workspace.getScenarioViews(this.targetId)
    this.attach(file)
    await this.#relationMetadata.reset(file)
    await this.#cascadeMetadata.reset()
    if (file && !options.deferDefinition) await this.loadDefinition()
  }

  /** 装配当前文件的目标结构；同代次在途调用合并，成功复用，失败可重试，不查询业务行或保存。 */
  async loadDefinition(): Promise<void> {
    this.assertOwner()
    if (this.#definitionLoad) return this.#definitionLoad
    if (!this.#file) return
    if (this.#definition) {this.assertProjectionClean(); return}
    this.assertMetadataClean()
    this.#definitionError = null
    const pending = this.assembleDefinition(this.#file)
    this.#definitionLoad = pending
    try {await pending} finally {if (this.#definitionLoad === pending) this.#definitionLoad = null}
  }

  private async assembleDefinition(file: ScenarioViewFile): Promise<void> {
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
      candidate = await this.options.assemble({scenarioId: this.targetId, config: file.value})
    } catch (error) {
      assertAssemblyCurrent()
      this.#definitionError = error instanceof Error ? error : new Error(String(error))
      throw this.#definitionError
    }
    try {
      assertAssemblyCurrent()
      this.assertMetadataClean()
      await this.acceptDefinition(candidate, assertAssemblyCurrent)
    } catch (error) {
      candidate.dataSet.destroy()
      throw error
    }
  }

  private async acceptDefinition(candidate: LowcodeDataSpaceAssembly, assertCurrent: () => void): Promise<void> {
    const config = projectionConfig(candidate.dataSet)
    const source = this.metadataDataSet.getView('Base_DataModel_Relation', 'default')
    const converted = new Set(candidate.dataSet.resourceRelations?.map(relation => relation.sourceRelationId))
    const incomplete = candidate.diagnostics.length > 0 || source?.rows.some(row =>
      source.fieldAccess(row, 'rowid').read !== 'visible' || !converted.has(String(row['rowid'])))
    this.definitionResource.useResolvedRelations(this.#file, incomplete ? undefined : candidate.dataSet.resourceRelations)
    await this.#relationMetadata.reset(this.#file, candidate.dataSet.resourceRelations)
    assertCurrent()
    this.assertMetadataClean()
    this.#viewMetadata.setFieldOptions(candidate.dataSet)
    this.#projectionConfig = config
    this.#diagnostics = Object.freeze([...candidate.diagnostics])
    this.#definition = candidate.dataSet
  }

  /** 通过元空间正式只读视图查询参考布局；未加载与缺文件不同，读取期间定义变化则拒绝使用结果。 */
  async readReferenceLayout(): Promise<string | null> {
    this.assertOwner()
    const generation = this.#generation
    const view = this.metadataDataSet.getView(DataSpaceReferenceLayoutResource.tableName, 'default')
    if (!view || view.dataTable?.resourceId !== DataSpaceReferenceLayoutResource.resourceId) throw new Error('DATA_SPACE_LAYOUT_UNAVAILABLE: 元空间缺少参考布局资源声明')
    await view.refresh()
    this.assertOwner()
    if (generation !== this.#generation) throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 布局读取期间定义已变化')
    if (view.loadingError) throw view.loadingError
    const row = view.rows[0]
    if (view.requestState !== SparkData.RequestState.Loaded || view.rows.length !== 1 || row?.['dataSetId'] !== this.targetId
      || view.fieldAccess(row, 'content').read !== 'visible' || (row['content'] !== null && typeof row['content'] !== 'string')) {
      throw new Error('DATA_SPACE_REFERENCE_RESULT: 参考布局查询没有返回当前目标的完整结果')
    }
    return row['content']
  }

  /** 将精确模型绑定及所属配置的删除记入原生SparkData.DataView；提交和取消仍由SparkData.DataSet/SparkData.DataView执行。 */
  async removeModelBinding(input: SessionBindingRemoval): Promise<PageDataSpaceViewState> {
    this.assertOwner()
    this.#viewMetadata.assertViewsClean()
    this.#relationMetadata.assertClean()
    this.#cascadeMetadata.assertClean()
    const file = this.#file
    if (!file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先加载视图配置')
    if (file.saveStatus !== 'idle') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 请先核验原提交')
    const {expectedText, tableName} = input
    if (file.getText() !== expectedText) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 配置已改变，请重新确认绑定')
    const config = structuredClone(file.value.toJSON())
    const tables = config['tables']
    const table = isRecord(tables) && Object.hasOwn(tables, tableName) ? tables[tableName] : undefined
    if (!isRecord(tables) || !isRecord(table) || ('resourceId' in input
      ? table['resourceType'] !== 'file' || table['resourceId'] !== input.resourceId || table['modelBinding'] !== undefined
      : !isRecord(table['modelBinding']) || table['modelBinding']['modelId'] !== input.modelId || table['modelBinding']['modelName'] !== input.modelName)) {
      throw new Error('SCENARIO_VIEW_MODEL_IDENTITY: 待解除的模型绑定已改变或不存在')
    }
    const view = this.metadataDataSet.getView('DataTableBindingDefinition', 'default')
    const row = view?.rows.find(item => item['tableName'] === tableName)
    const key = row && view?.getPkKey(row)
    if (!view || key === undefined || row?.['dataSetId'] !== this.targetId) throw new Error('SCENARIO_VIEW_MODEL_IDENTITY: 当前绑定查询缺少目标')
    if (view.commitMode !== 'staged') throw new Error('SCENARIO_VIEW_MODEL_DELETE: 绑定删除须使用待提交模式')
    if (view.hasEditingChanges(key) || view.dirtyTracking.hasPendingChanges(key)) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 请先处理当前模型配置修改')
    const generation = this.#generation
    const snapshot = JSON.stringify(view.rows)
    const next = ScenarioDefinitionRecords.write({config: file.value, resource: ScenarioDefinitionRecords.resources.DataTableBindingDefinition,
      rows: ScenarioDefinitionRecords.read(file.value, ScenarioDefinitionRecords.resources.DataTableBindingDefinition).filter(item => item['tableName'] !== tableName)})
    const scope = next.selectTableValidationScope(file.value)
    const candidate = scope ? await this.options.assemble({scenarioId: this.targetId, config: scope}) : null
    try {
      this.assertOwner()
      if (file.getText() !== expectedText || this.#generation !== generation || JSON.stringify(view.rows) !== snapshot || view.hasEditingChanges(key) || view.dirtyTracking.hasPendingChanges(key)) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 解除期间配置已改变')
      if (candidate?.diagnostics.length) throw new Error(`SCENARIO_VIEW_MODEL_REFERENCES: ${candidate.diagnostics.join('；')}`)
      if (await view.removeRow(key) !== true) throw new Error('SCENARIO_VIEW_MODEL_DELETE: 原生视图未接受删除')
    } finally {candidate?.dataSet.destroy()}
    return this.requireViewState()
  }

  async previewRemoteViews(): Promise<string | null> {
    this.assertOwner()
    const result = await this.definitionSourceView().previewSource()
    this.assertOwner()
    return result.content
  }

  private definitionSourceView(): SparkData.DataView {
    const view = this.metadataDataSet.getView('DataViewDefinition', 'default')
    if (!view) throw new Error('SCENARIO_DEFINITION_IDENTITY: 文件定义视图缺失')
    return view
  }

  /** 接纳已展示且再次核对的远端文件，刷新定义编辑视图与画布端点；完整运行定义仍按工作区需要装配。 */
  async adoptViews(input: SessionAdopt): Promise<PageDataSpaceViewState | null> {
    return this.adoptDefinitionViews(input, true)
  }

  /** 结构命令先恢复文件查询，再迁移已确认的模型名称；中间态不装配旧名称的画布投影。 */
  private async adoptDefinitionViews(input: SessionAdopt, refreshGraph: boolean): Promise<PageDataSpaceViewState | null> {
    this.assertOwner()
    if (!this.#file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先显式创建视图配置')
    const views = Object.entries(ScenarioDefinitionRecords.resources).flatMap(([name, resourceId]) => {
      const table = this.metadataDataSet.getTable(name)
      if (table?.resourceType !== 'file' || table.resourceId !== resourceId) throw new Error('SCENARIO_DEFINITION_IDENTITY: 文件定义资源缺失或已改变')
      return table.viewList
    })
    const discarded = (input.discardViews ?? []).map(selector => {
      const view = this.metadataDataSet.getView(selector.tableName, selector.viewId)
      if (!view || !views.includes(view)) throw new Error('SCENARIO_DEFINITION_IDENTITY: 只能明确取消本次文件定义视图')
      return view
    })
    const loaded = views.filter(view => view.requestState === SparkData.RequestState.Loaded)
    await this.definitionSourceView().adoptSource({version: input.expectedRevision, content: input.previewText}, {discardViews: discarded})
    this.assertLive()
    this.attach(this.options.workspace.getScenarioViews(this.targetId))
    this.invalidate({preserveModelInputs: true})
    await this.#viewMetadata.reset()
    await this.#relationMetadata.reset(this.#file)
    await this.#cascadeMetadata.reset()
    if (refreshGraph) await this.loadGraphRelations()
    for (const view of loaded) {
      if (view.tableName !== 'DataSpaceLayoutDefinition' && view.viewId === 'default'
        || view.tableName === 'DataResourceRelationDefinition' && view.viewId === 'graph') continue
      await view.refresh()
      if (view.loadingError) throw view.loadingError
    }
    return this.viewState
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const listener of [...this.#previewInvalidationListeners]) listener()
    this.#previewInvalidationListeners.clear()
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

function viewName(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} 无效`)
  const name = value.trim()
  if (!name || name.includes('@') || name.startsWith('#')) throw new Error(`${label} 身份非法`)
  return name
}

function treeRelationMode(value: unknown): 'child' | 'parent' {
  if (value === 'child' || value === 'parent') return value
  throw new Error('树关系方向无效')
}

function state(file: ScenarioViewFile): PageDataSpaceViewState {
  return { scenarioId: file.scenarioId, text: file.getText(), config: file.value.toJSON(),
    persisted: file.isPersisted, dirty: file.isDirty, revision: file.revision,
    saveStatus: file.saveStatus, submittedText: file.submittedText }
}

export class LowcodeDataSpaceViewDesign {
  constructor(private readonly options: ViewDesignOptions) {}

  private referenceLayoutResource(metadataScenarioId: string): DataSpaceReferenceLayoutResource {
    return new DataSpaceReferenceLayoutResource({metadataScenarioId, assertCurrent: this.options.assertScope,
      read: targetId => {
        if (!this.options.readLegacyLayout) throw new Error('DATA_SPACE_LAYOUT_UNAVAILABLE: 缺少旧布局读取能力')
        return this.options.readLegacyLayout(targetId)
      }})
  }

  /** 打开正式元数据与文件定义；deferDefinition由分层页面使用，目标装配仍由同一会话承接。 */
  async openDesignSession(targetId: string, options: SessionLoadOptions = {}): Promise<LowcodeDataSpaceDesignSession> {
    if (typeof targetId !== 'string' || targetId.trim() !== targetId || !targetId
      || targetId === '.' || targetId === '..' || /[\\/%\u0000-\u001f\u007f]/.test(targetId)) {
      throw new Error('DATA_SPACE_DESIGN_TARGET: 数据空间 ID 无效')
    }
    const id = viewName(targetId, '空间')
    const loadMetadata = this.options.loadMetadata
    if (!loadMetadata) throw new Error('DATA_SPACE_DESIGN_METADATA_UNAVAILABLE: 缺少正式元数据入口')
    this.options.assertScope()
    const cached = this.options.workspace.getScenarioViews(id), cachedRevision = cached?.revision
    const refreshCachedSource = cached !== null && !cached.isDirty
    let resource: ScenarioDefinitionResource | undefined
    const requireResource = () => {
      if (!resource) throw new Error('SCENARIO_DEFINITION_LOADING: 元数据空间尚未装配')
      return resource
    }
    const executor: Parameters<SparkData.DataView['bindQueryExecutor']>[0] = {
      hasUnconfirmedSave: context => requireResource().hasUnconfirmedSave(context),
      source: {
        history: {
          list: view => requireResource().source.history.list(view),
          preview: (view, version) => requireResource().source.history.preview(view, version),
          status: view => requireResource().source.history.status(view),
          verify: (view, hooks) => requireResource().source.history.verify(view, hooks),
          create: (view, hooks) => requireResource().source.history.create(view, hooks),
        },
        views: view => requireResource().source.views(view),
        preview: view => requireResource().source.preview(view),
        adopt: (view, snapshot, hooks) => requireResource().source.adopt(view, snapshot, hooks),
      },
      executeQuery: (view, params) => {
        if (!resource) throw new Error('SCENARIO_DEFINITION_LOADING: 元数据空间尚未装配')
        return resource.executeQuery(view, params)
      },
      save: command => {
        if (!resource) throw new Error('SCENARIO_DEFINITION_LOADING: 元数据空间尚未装配')
        return resource.save(command)
      },
    }
    const fileExecutors = {...Object.fromEntries(Object.keys(ScenarioDefinitionRecords.resources).map(name => [name, executor])),
      ...(this.options.fileResourceExecutors ?? {})}
    const catalogResources=new Map<string,ProjectToolResource>()
    const catalogExecutor: Parameters<SparkData.DataView['bindQueryExecutor']>[0] = {executeQuery: (view, params) => {
      const metadataScenarioId=view.dataSet?.scenarioId
      if(!metadataScenarioId)throw new Error('PROJECT_TOOL_IDENTITY: 元空间身份缺失')
      let toolResource=catalogResources.get(metadataScenarioId)
      if(!toolResource){toolResource=new ProjectToolResource({workspace:this.options.workspace,metadataScenarioId,assertCurrent:this.options.assertScope,
        ...(options.blueprintTreeProjection?{blueprintTreeProjection:options.blueprintTreeProjection}:{})});catalogResources.set(metadataScenarioId,toolResource)}
      return toolResource.executeQuery(view,params)
    }}
    for (const name of Object.keys(ProjectToolResource.resources)) fileExecutors[name] = name === 'ProjectToolCatalog' ? catalogExecutor
      : this.options.fileResourceExecutors?.[name] ?? createPageToolFileResourceExecutor({appId: this.options.workspace.project.projectId, workspace: this.options.workspace, assertCurrent: this.options.assertScope})
    fileExecutors[DataSpaceReferenceLayoutResource.tableName] = {executeQuery: (view, params) => {
      const scenarioId = view.dataSet?.scenarioId
      if (!scenarioId) throw new Error('DATA_SPACE_REFERENCE_IDENTITY: 元空间身份缺失')
      return this.referenceLayoutResource(scenarioId).executeQuery(view, params)
    }}
    const metadata = await loadMetadata(id, fileExecutors)
    const assemble = (input: ViewDesignAssembleInput) => this.options.assemble({...input,
      metadataDataSet: metadata,
      fileExecutors: input.fileExecutors ?? fileExecutors})
    let session: LowcodeDataSpaceDesignSession | undefined
    try {
      this.options.assertScope()
      assertFormalTarget(metadata, id, this.options.assertScope)
      if (!metadata.scenarioId) throw new Error('DATA_SPACE_DESIGN_METADATA_IDENTITY: 元数据空间缺少身份')
      resource = new ScenarioDefinitionResource({workspace: this.options.workspace,
        metadataScenarioId: metadata.scenarioId, targetScenarioId: id, assertCurrent: this.options.assertScope,
        validate: async (next, previous, resources) => {
          if (resources.includes(ScenarioDefinitionRecords.resources.DataSpaceLayoutDefinition)) {
            const fileModels = metadata.getView('DataTableBindingDefinition', 'fileModels')
            LowcodeDataSpaceViewLayout.assertModels({
              base: previous.toJSON(),
              config: next.toJSON(),
              targetId: id,
              models: metadata.getView('Base_DataModel', 'default'),
              ...(fileModels ? {files: fileModels} : {}),
            })
          }
          const scope = ScenarioDefinitionRecords.validationScope(next, previous, resources)
          if (!scope) return
          const candidate = await assemble({scenarioId: id, config: scope})
          try {
            if (candidate.diagnostics.length) throw new Error(`SCENARIO_DEFINITION_INCOMPLETE: ${candidate.diagnostics.join('；')}`)
          } finally {candidate.dataSet.destroy()}
        }})
      if (refreshCachedSource) {
        const assertCachedClean = () => {
          this.options.assertScope()
          if (this.options.workspace.getScenarioViews(id) !== cached || cached.revision !== cachedRevision || cached.isDirty) {
            throw new Error('SCENARIO_VIEW_DRAFT_STALE: 重开期间目标配置已改变，保留本地状态')
          }
        }
        assertCachedClean()
        const source = metadata.getView('DataViewDefinition', 'default')
        if (!source) throw new Error('SCENARIO_DEFINITION_IDENTITY: 文件定义视图缺失')
        const remote = await source.previewSource()
        assertCachedClean()
        if (remote.content !== cached.getText()) await source.adoptSource(remote)
      }
      session = new LowcodeDataSpaceDesignSession({
        targetId: id, metadataDataSet: metadata, design: this, options: {...this.options, assemble}, definitionResource: resource,
        ...(options.blueprintTreeProjection ? {blueprintTreeProjection: options.blueprintTreeProjection} : {}),
      })
      try { await session.refresh(options) } catch (error) {
        if (session.metadataDataSet.destroyed || session.definitionError !== error) throw error
      }
      return session
    } catch (error) {
      if (session) session.dispose()
      else metadata.destroy()
      throw error
    }
  }

  private currentFile(scenarioId: string): ScenarioViewFile {
    this.options.assertScope()
    const file = this.options.workspace.getScenarioViews(viewName(scenarioId, '空间'))
    if (!file) throw new Error('SCENARIO_VIEW_FILE_MISSING: 请先加载或显式创建视图配置')
    return file
  }

  /**
   * 装配可供标准组件绑定的独立预览实例；调用方关闭时必须dispose。
   * @param subscribe 调用方定义/会话失效订阅；与文件订阅共同释放已绑定的SparkData.DataView，预览关闭时解除。
   */
  async openPreview(input: NativeViewSelection & {scenarioId: string}, options: Readonly<{assertCurrent?: () => void;
    configOverride?: ScenarioViewConfig; subscribe?: (listener: () => void) => () => void;
    blueprintTreeProjection?: SessionLoadOptions['blueprintTreeProjection']}> = {}): Promise<LowcodeDataSpaceQueryPreview> {
    const {assertCurrent, configOverride} = options
    const file = this.currentFile(input.scenarioId)
    const text = file.getText()
    const revision = file.revision
    const tableName = viewName(input.tableName, '表')
    const viewId = viewName(input.viewId, '视图')
    const tables = record(file.value.toJSON()['tables'], 'tables')
    const table = record(tables[tableName], 'table')
    const binding = table['modelBinding']
    if ('fileResourceId' in input ? binding !== undefined || table['resourceType'] !== 'file' || table['resourceId'] !== input.fileResourceId
      : !isRecord(binding) || binding['modelId'] !== input.modelId || binding['modelName'] !== input.modelName) {
      throw new Error('SCENARIO_VIEW_MODEL_BINDING: 预览选择与正式模型绑定不一致')
    }
    const config = configOverride ?? file.value
    const configuredTable = record(record(config.toJSON()['tables'], 'tables')[tableName], 'table')
    if (!Object.hasOwn(record(configuredTable['views'], 'views'), viewId)) throw new Error('SCENARIO_VIEW_PREVIEW_VIEW: 视图不存在')
    assertCurrent?.()
    const executor = ScenarioDefinitionResource.forQueries({workspace: this.options.workspace, metadataScenarioId: input.scenarioId,
      assertCurrent: () => {this.options.assertScope(); assertCurrent?.()},
      validate: () => Promise.reject(new Error('SCENARIO_VIEW_PREVIEW_READ_ONLY: 预览不提交定义'))})
    const fileExecutors = {...Object.fromEntries(Object.keys(ScenarioDefinitionRecords.resources).map(name => [name, executor])),
      ...(this.options.fileResourceExecutors ?? {})}
    fileExecutors[DataSpaceReferenceLayoutResource.tableName] = this.referenceLayoutResource(input.scenarioId)
    const catalogResources=new Map<string,ProjectToolResource>()
    fileExecutors['ProjectToolCatalog'] = {executeQuery: (view:SparkData.DataView,params:SparkData.QueryParams) => {
      const metadataScenarioId=view.dataSet?.scenarioId
      if(!metadataScenarioId)throw new Error('PROJECT_TOOL_IDENTITY: 元空间身份缺失')
      let toolResource=catalogResources.get(metadataScenarioId)
      if(!toolResource){toolResource=new ProjectToolResource({workspace:this.options.workspace,metadataScenarioId,
        assertCurrent:()=>{this.options.assertScope();assertCurrent?.()},...(options.blueprintTreeProjection?{blueprintTreeProjection:options.blueprintTreeProjection}:{})});catalogResources.set(metadataScenarioId,toolResource)}
      return toolResource.executeQuery(view,params)
    }}
    fileExecutors['ProjectToolFile'] = readOnlyFileExecutor(this.options.fileResourceExecutors?.['ProjectToolFile']
      ?? createPageToolFileResourceExecutor({appId: this.options.workspace.project.projectId, workspace: this.options.workspace,
        assertCurrent: () => {this.options.assertScope(); assertCurrent?.()}, readOnly: true}))
    const assembled = await this.options.assemble({scenarioId: input.scenarioId, config, fileExecutors, modelScope: tableName})
    let preview: LowcodeDataSpaceQueryPreview | undefined
    try {
      const validate = (): void => {
        this.options.assertScope(); assertCurrent?.()
        if (this.currentFile(input.scenarioId) !== file || file.revision !== revision || file.getText() !== text) throw new Error('SCENARIO_VIEW_DRAFT_STALE: 预览配置已改变')
      }
      validate()
      if (assembled.diagnostics.length) throw new Error(`SCENARIO_ASSEMBLY_INCOMPLETE: ${assembled.diagnostics.join('；')}`)
      preview = new LowcodeDataSpaceQueryPreview(assembled.dataSet, 'fileResourceId' in input ? tableName : input.modelName, viewId,
        {assertCurrent: validate, subscribe: listener => {
          const fileStop = file.subscribe(listener), metadataStop = options.subscribe?.(listener)
          return () => {fileStop(); metadataStop?.()}
        }})
      await preview.runtime.load()
      if (preview.view !== assembled.dataSet.getView(tableName, viewId)) throw new Error('SCENARIO_VIEW_PREVIEW_VIEW: 命名视图绑定不唯一')
      return preview
    } catch (cause) {preview?.dispose(); assembled.dataSet.destroy(); throw cause}
  }

  /** 独立装配正式模型的临时默认视图；不注册场景文件，不叠加已有命名视图规则。 */
  async openModelPreview(input: PageDataSpaceViewModelInput, assertCurrent?: () => void,
    subscribe?: (listener: () => void) => () => void): Promise<LowcodeDataSpaceQueryPreview> {
    const scenarioId = viewName(input.scenarioId, '空间')
    const original = this.options.workspace.getScenarioViews(scenarioId)
    const text = original?.getText(), revision = original?.revision
    const validate = (): void => {
      this.options.assertScope(); assertCurrent?.()
      if (this.options.workspace.getScenarioViews(scenarioId) !== original || original?.getText() !== text || original?.revision !== revision) {
        throw new Error('SCENARIO_VIEW_PREVIEW_STALE: 预览期间空间配置已变化')
      }
    }
    validate()
    const file = new ScenarioViewFile(scenarioId, JSON.stringify({scenarioId, schemaVersion: 2, resourceRelations: [], tables: {PreviewModel: {
      modelBinding: {modelId: input.modelId, modelName: input.modelName}, views: {default: {autoLoad: false}},
    }}}))
    const assembled = await this.options.assemble({scenarioId, config: file.value})
    let preview: LowcodeDataSpaceQueryPreview | undefined
    try {
      validate()
      const table = assembled.dataSet.getTable('PreviewModel')
      if (table?.modelBinding?.modelId !== input.modelId || table.modelBinding.modelName !== input.modelName) {
        throw new Error('SCENARIO_VIEW_MODEL_IDENTITY: 模型预览装配身份不一致')
      }
      preview = new LowcodeDataSpaceQueryPreview(assembled.dataSet, input.modelName, 'default',
        {assertCurrent: validate, subscribe: listener => {
          const fileStop = original?.subscribe(listener), metadataStop = subscribe?.(listener)
          return () => {fileStop?.(); metadataStop?.()}
        }})
      await preview.runtime.load()
      if (preview.view !== table.getView('default')) throw new Error('SCENARIO_VIEW_PREVIEW_VIEW: 模型默认视图绑定不唯一')
      return preview
    } catch (cause) {preview?.dispose(); assembled.dataSet.destroy(); throw cause}
  }

  async preview(input: PageDataSpaceViewSelection) {
    const preview = await this.openPreview(input)
    try {await preview.query({context: {}}); return preview.snapshot()}
    finally {preview.dispose()}
  }
}
