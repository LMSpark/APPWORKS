/**
 * @module app:lowcode/data-space/lowcode-data-space-runtime
 * 职责：读取场景绑定的正式模型与关系后装配独立运行空间。边界：应用身份由既有请求 scope 提供，异步返回检查调用代次；AI 可用此入口实现 PageRuntime 的 loadScenario。
 */
import { DATA_SPACE_DESIGN_FORM_KEY, type DataSpaceApi } from '@spark-appworks/spark-lowcode-api'
import { createLowcodeProjectGateways, lowcodeApi, lowcodeCatalogDataSpace, lowcodeDesignFileUpload, lowcodeHttp } from '../lowcode-runtime'
import { APPLICATION_CATALOG_PROJECT_ID } from '@/services/application-scope'
import { readRepositoryScenarioText } from '../resources/repository/scenarios/resource'
import { LowcodeDataSpaceAssembler, type LowcodeDataSpaceAssembly } from './lowcode-data-space-assembler'
import { isRecord } from '@spark-appworks/spark-utils'
import { ProjectWorkspace, ScenarioDefinitionRecords, ScenarioDefinitionResource, ScenarioViewConfig, DataSpaceReferenceLayoutResource, ProjectToolResource, type ProjectBlueprintTreeData } from '@spark-appworks/spark-project-model'
import {lowcodeDataSpaceLayout} from './lowcode-data-space-layout'
import type { DataSet } from '@spark-appworks/spark-data'
import {LowcodeDataSpaceMetadata} from './lowcode-data-space-metadata'
import {LowcodeModelRelationAdapter} from './lowcode-model-relation-adapter'
import {createLowcodeFileResourceExecutors} from '../resources/repository/file-resource-registry'
import {createPageToolFileResourceExecutor} from '@/services/project/page-tool-file-dataview'
import {resolveSystemScenarioResource} from '@/registries/system-scenario-registry'
import {registerApiModelRules,type ApiModelRuleHost} from '../resources/integration/api-management/model-rules'
import {createCacheScenarioBindings} from '../resources/system/cache-management/runtime-bindings'
import {registerNavigationHostModelRules} from '../resources/system/navigation-host/model-rules'
import {registerDimensionSourceModelRules} from '../resources/structured-config/dimension-source/model-rules'
import {createDataRecoveryScenarioBindings} from '../resources/system/data-recovery/runtime-bindings'
import {createEnterpriseRegistrationBindings} from '../resources/system/enterprise-registration/runtime-bindings'
import {createApiInterfaceBindings} from '../resources/integration/api-management/runtime-bindings'
import {createWorkflowScenarioBindings} from '../resources/structured-config/workflow-definition/execution/runtime-bindings'
import {createAgentWorkflowCreationBindings} from '../resources/repository/agent-workflow/creation'
import {createAgentWorkflowPublicationBindings} from '../resources/repository/agent-workflow/publication'
import {createLogicViewDesignExecutor, LOGIC_VIEW_DESIGN_RESOURCE_ID, LOGIC_VIEW_DESIGN_VIEW} from '../resources/structured-config/logic-view/design-ops'
import {createExcelCatalogBindings} from '../resources/semi-structured/excel-import/catalog/creation'

/** 场景装配命令；配置身份必须匹配 scenarioId，可指定正式设计场景并检查调用是否仍有效。 */
export type LoadScenarioDataSetInput = Readonly<{
 scenarioId: string
 designScenarioId?: string
 config: Parameters<LowcodeDataSpaceAssembler['assemble']>[0]['config']
 /** 可选运行范围的模型表键；先核完整关系依赖，再读取所需模型详情，不更改正式配置或业务数据。 */
 modelScope?: string
 /** 按配置表键注入已存在的文件查询/保存owner；文件声明本身不产生存储或访问能力。 */
 fileExecutors?: Parameters<LowcodeDataSpaceAssembler['assemble']>[0]['fileExecutors']
 /** 显式非模型投影的只读绑定工厂。 */
 projectionBindings?: Parameters<LowcodeDataSpaceAssembler['assemble']>[0]['projectionBindings']
 /** 已声明命令的宿主绑定，不由页面构造提交owner。 */
 commandBindings?: Parameters<LowcodeDataSpaceAssembler['assemble']>[0]['commandBindings']
 /** 按正式modelId选择首次绑定适配模式。 */
 modelAdapters?: Parameters<LowcodeDataSpaceAssembler['assemble']>[0]['modelAdapters']
 /** 活动数据空间设计会话持有的元数据DataSet；正式定义读取复用其中相应模型的查询owner。 */
 metadataDataSet?: DataSet
 assertCurrent?: () => void
 /** 本次原页面宿主，仅供明确跨空间引用校验按需访问；不会在装配时读取。 */
 getPage?: ApiModelRuleHost['getPage']
 /** 请求作用域对应的数据空间入口；省略时为当前选中应用。 */
 dataSpace?: DataSpaceApi
}>

/** 执行项目对应的请求作用域：应用目录（企业级、平台级）只带登录身份，其它为当前选中应用。 */
function executionScopeOf(projectId: string): Readonly<{dataSpace: DataSpaceApi; readScope: () => ReturnType<typeof lowcodeApi.readRequestScope>}> {
 return projectId === APPLICATION_CATALOG_PROJECT_ID
  ? {dataSpace: lowcodeCatalogDataSpace, readScope: () => lowcodeApi.readAuthenticatedRequestScope()}
  : {dataSpace: lowcodeApi.dataSpace, readScope: () => lowcodeApi.readRequestScope()}
}

type DefinitionBindingsInput = Readonly<{
  projectId: string
  scenarioId: string
  config: ScenarioViewConfig
  assertCurrent: () => void
  owner?: ProjectWorkspace
  blueprintTreeProjection?: () => ProjectBlueprintTreeData | Promise<ProjectBlueprintTreeData>
}>

/** 场景视图文件与正式模型的唯一运行装配入口；请求 owner 提供应用及租户身份。 */
export async function loadScenarioDataSet(input: LoadScenarioDataSetInput): Promise<LowcodeDataSpaceAssembly> {
 const scenarioId = input.scenarioId.trim()
 if (!scenarioId || input.config.scenarioId !== scenarioId) throw new Error('场景视图配置身份不一致')
 const designScenarioId = input.designScenarioId ?? DATA_SPACE_DESIGN_FORM_KEY
 const dataSpace = input.dataSpace ?? lowcodeApi.dataSpace
 input.assertCurrent?.()
 const formalInput = {designScenarioId, dataSpaceId: scenarioId, ...(input.assertCurrent ? {assertCurrent: input.assertCurrent} : {})}
 let config = input.config
 const preflightTables = config.toJSON()['tables']
 if (isRecord(preflightTables)) for (const [tableName, table] of Object.entries(preflightTables)) {
  if (input.modelScope !== undefined && input.modelScope !== tableName) continue
  if (isRecord(table) && table['resourceType'] === 'logical-view' && !Object.hasOwn(table,'modelBinding')
   && typeof Object.getOwnPropertyDescriptor(input.projectionBindings ?? {}, tableName)?.value !== 'function') {
   throw new Error(`SCENARIO_PROJECTION_BINDING: ${tableName} 缺少显式只读投影工厂`)
  }
 }
 let inherited: Awaited<ReturnType<DataSpaceApi['design']['readRelations']>> | undefined
 if (input.modelScope !== undefined) {
  const configuredTables = config.toJSON()['tables']
  if (!isRecord(configuredTables) || !Object.hasOwn(configuredTables, input.modelScope)) throw new Error(`场景模型表不存在: ${input.modelScope}`)
  if (config.usesNativeResourceRelations) config = config.selectModelScope(input.modelScope)
  else {
   inherited = await dataSpace.design.readRelations(formalInput, input.metadataDataSet)
   input.assertCurrent?.()
   const bindings = new Map<string, {id: string; name: string}>()
   for (const [key, table] of Object.entries(configuredTables)) {
    if (isRecord(table) && (table['resourceType'] === 'file'||table['resourceType'] === 'command'||table['resourceType'] === 'logical-view'&&!Object.hasOwn(table,'modelBinding'))) continue
    const binding = isRecord(table) ? table['modelBinding'] : undefined
    if (!isRecord(binding) || typeof binding['modelId'] !== 'string' || typeof binding['modelName'] !== 'string') throw new Error('场景模型绑定不完整')
    bindings.set(key, {id: binding['modelId'], name: binding['modelName']})
   }
   config = config.selectModelScope(input.modelScope, new LowcodeModelRelationAdapter().scopeDependencies(inherited, bindings))
  }
 }
 const tables = config.toJSON()['tables']
 if (!isRecord(tables)) throw new Error('场景视图缺少 tables')
 const names = new Set<string>()
 for (const [tableName, table] of Object.entries(tables)) {
  if (isRecord(table) && table['resourceType'] === 'logical-view' && !Object.hasOwn(table,'modelBinding')) {
   if (typeof Object.getOwnPropertyDescriptor(input.projectionBindings ?? {}, tableName)?.value !== 'function') throw new Error(`SCENARIO_PROJECTION_BINDING: ${tableName} 缺少显式只读投影工厂`)
   continue
  }
  if(isRecord(table)&&table['resourceType']==='command'){
   if(!input.commandBindings?.[tableName])throw new Error(`SCENARIO_COMMAND_BINDING: ${tableName} 缺少命令资源绑定`)
   continue
  }
  if (isRecord(table) && table['resourceType'] === 'file') {
   const executor = input.fileExecutors && Object.hasOwn(input.fileExecutors, tableName) ? input.fileExecutors[tableName] : undefined
   if (!executor || typeof executor.executeQuery !== 'function') throw new Error(`SCENARIO_FILE_OWNER: ${tableName} 缺少文件查询owner`)
   continue
  }
  if (!isRecord(table) || !isRecord(table['modelBinding']) || typeof table['modelBinding']['modelName'] !== 'string') throw new Error('场景模型绑定不完整')
  names.add(table['modelBinding']['modelName'])
 }
 const [space, models, relations] = await Promise.all([
  dataSpace.design.readSpaceDefinition(formalInput, input.metadataDataSet),
  names.size ? dataSpace.design.readModelBatch({...formalInput, metaNames: [...names]}, input.metadataDataSet) : Promise.resolve([]),
  config.usesNativeResourceRelations ? Promise.resolve([]) : inherited !== undefined ? Promise.resolve(inherited) : dataSpace.design.readRelations(formalInput, input.metadataDataSet),
 ])
 input.assertCurrent?.()
 const result=new LowcodeDataSpaceAssembler(dataSpace.runtime, lowcodeHttp).assemble({config, space, models, relations,
  ...(input.fileExecutors ? {fileExecutors: input.fileExecutors} : {}),
  ...(input.projectionBindings ? {projectionBindings: input.projectionBindings} : {}),
  ...(input.commandBindings?{commandBindings:input.commandBindings}:{}),
  ...(input.modelAdapters?{modelAdapters:input.modelAdapters}:{})})
 try{
  registerApiModelRules(result.dataSet,{...(input.getPage?{getPage:input.getPage}:{}),...(input.assertCurrent?{assertCurrent:input.assertCurrent}:{})})
  registerNavigationHostModelRules(result.dataSet)
  registerDimensionSourceModelRules(result.dataSet)
  return result
 }
 catch(error){result.dataSet.destroy();throw error}
}

/** 当前请求的应用头。调用方固定这一次读取；之后只核对令牌和应用头是否仍是这一次。 */
export function readLowcodeExecutionProject(): Readonly<{projectId: string; assertCurrent: () => void}> {
 const scope = lowcodeApi.readRequestScope()
 const projectId = scope.headers['X-AppId']
 if (!projectId) throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 缺少当前应用身份')
 return {projectId, assertCurrent(): void {
  const current = lowcodeApi.readRequestScope()
  if (current.token !== scope.token || current.headers['X-AppId'] !== projectId) {
   throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景请求所属应用已失效')
  }
 }}
}

/** 用已解析的场景配置装配运行 DataSet。预览传入未保存定义，正式入口先读已保存文件再调用。 */
export type AssembleLowcodeRuntimeScenarioInput = Readonly<{
 projectId: string
 scenarioId: string
 config: ScenarioViewConfig
 assertCurrent: () => void
 getPage?: ApiModelRuleHost['getPage']
 owner?: ProjectWorkspace
 blueprintTreeProjection?: () => ProjectBlueprintTreeData | Promise<ProjectBlueprintTreeData>
}>

export async function assembleLowcodeRuntimeScenario(input: AssembleLowcodeRuntimeScenarioInput): Promise<DataSet> {
 const {projectId, scenarioId, config, assertCurrent} = input
 if (config.scenarioId !== scenarioId) throw new Error('场景视图配置身份不一致')
 if (projectId === APPLICATION_CATALOG_PROJECT_ID && !resolveSystemScenarioResource(scenarioId)) {
  throw new Error(`CATALOG_SCENARIO_SOURCE_MISSING: ${scenarioId} 不是已登记的系统场景，目录作用域不能装配`)
 }
 assertCurrent()
 const {dataSpace, readScope} = executionScopeOf(projectId)
 const agentCreation = createAgentWorkflowCreationBindings({config,applicationId:projectId,api:lowcodeApi.design,fileUpload:lowcodeDesignFileUpload,assertCurrent})
 const agentPublication = createAgentWorkflowPublicationBindings({config,applicationId:projectId,api:lowcodeApi.design,fileUpload:lowcodeDesignFileUpload,assertCurrent})
 const cacheBindings = createCacheScenarioBindings({config,runtime:dataSpace.runtime,assertCurrent})
 const workflowBindings = createWorkflowScenarioBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const excelBindings = createExcelCatalogBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const recoveryBindings = createDataRecoveryScenarioBindings({config,assertCurrent})
 const enterpriseBindings = createEnterpriseRegistrationBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const apiInterfaceBindings = createApiInterfaceBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const result = await loadScenarioDataSet({scenarioId, config, assertCurrent, dataSpace,
  ...agentCreation,
  ...agentPublication,
  ...cacheBindings,
  ...workflowBindings,
  ...excelBindings,
  modelAdapters: {
   ...cacheBindings.modelAdapters,
   ...recoveryBindings.modelAdapters,
  },
  commandBindings: {
   ...agentCreation.commandBindings,
   ...agentPublication.commandBindings,
   ...cacheBindings.commandBindings,
   ...workflowBindings.commandBindings,
   ...excelBindings.commandBindings,
   ...enterpriseBindings.commandBindings,
   ...apiInterfaceBindings.commandBindings,
  },
  ...(input.getPage?{getPage:input.getPage}:{}),
  ...definitionBindings({projectId, scenarioId, config, assertCurrent,
   ...(input.owner?{owner:input.owner}:{}),
   ...(input.blueprintTreeProjection?{blueprintTreeProjection:input.blueprintTreeProjection}:{})})})
 try {
  assertCurrent()
  if (result.diagnostics.length > 0) {
   throw new Error(`SCENARIO_ASSEMBLY_INCOMPLETE: 场景 ${scenarioId} 的模型关系未完整装配，请在数据空间设计中修复：\n${result.diagnostics.join('\n')}`)
  }
 } catch (failure) { result.dataSet.destroy(); throw failure }
 return result.dataSet
}

/** PageRuntime 场景装配入口：身份变化或模型关系装配不完整即失败并销毁；诊断修复仍走设计会话。 */
export async function loadLowcodeRuntimeScenario(command: Readonly<{ projectId: string; scenarioId: string; getPage?:ApiModelRuleHost['getPage'] }>): Promise<DataSet> {
 const { projectId, scenarioId } = command
 if (projectId === APPLICATION_CATALOG_PROJECT_ID) return loadCatalogRuntimeScenario(command)
 const execution = readLowcodeExecutionProject()
 if (execution.projectId !== projectId) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景请求所属应用已失效')
 const assertCurrent = execution.assertCurrent
 assertCurrent()
 const text = await createLowcodeProjectGateways(projectId).scenarioViews.readText(scenarioId)
 assertCurrent()
 if (text === null) throw new Error(`SCENARIO_VIEW_FILE_MISSING: 场景 ${scenarioId} 尚未建立视图配置`)
 return assembleLowcodeRuntimeScenario({projectId, scenarioId, config: new ScenarioViewConfig(scenarioId, text), assertCurrent,
  ...(command.getPage?{getPage:command.getPage}:{})})
}

/** 目录作用域（未进入应用）只装配已登记的系统场景；登录身份变化或选中应用即失效。 */
async function loadCatalogRuntimeScenario(command: Readonly<{ projectId: string; scenarioId: string; getPage?:ApiModelRuleHost['getPage'] }>): Promise<DataSet> {
 const {projectId, scenarioId} = command
 const resource = resolveSystemScenarioResource(scenarioId)
 if (!resource) throw new Error(`CATALOG_SCENARIO_SOURCE_MISSING: ${scenarioId} 不是已登记的系统场景，目录作用域不能装配`)
 const token = lowcodeApi.readAuthenticatedRequestScope().token
 const assertCurrent = (): void => {
  let current: string
  try {current = lowcodeApi.readAuthenticatedRequestScope().token}
  catch {throw new Error('SPARK_EXECUTION_SCOPE_STALE: 目录作用域登录会话已失效')}
  if (current !== token || lowcodeApi.application.get() !== null) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 目录作用域登录会话或应用选择已变化')
 }
 assertCurrent()
 const text = await readRepositoryScenarioText(resource, assertCurrent)
 assertCurrent()
 return assembleLowcodeRuntimeScenario({projectId, scenarioId, config: new ScenarioViewConfig(scenarioId, text), assertCurrent,
  ...(command.getPage?{getPage:command.getPage}:{})})
}

/** 文件与只读投影由各自已声明的语义身份接线，目标ID不从当前空间猜测。 */
function definitionBindings(input: DefinitionBindingsInput): Pick<LoadScenarioDataSetInput,'fileExecutors'|'projectionBindings'> {
 const {projectId, scenarioId, config, assertCurrent, owner, blueprintTreeProjection} = input
 const tables = config.toJSON()['tables']
 const declared = isRecord(tables) ? Object.entries(tables).filter(([name, table]) => isRecord(table) && table['resourceType'] === 'file'
  && Object.entries(ScenarioDefinitionRecords.resources).some(([key, resource]) => key === name && resource === table['resourceId'])) : []
 const reference = isRecord(tables) ? tables[DataSpaceReferenceLayoutResource.tableName] : undefined
 const hasReference = isRecord(reference) && reference['resourceType'] === 'file' && reference['resourceId'] === DataSpaceReferenceLayoutResource.resourceId
 const toolFile = isRecord(tables) ? tables['ProjectToolFile'] : undefined
 const hasToolFile = isRecord(toolFile) && toolFile['resourceType'] === 'file' && toolFile['resourceId'] === ProjectToolResource.resources.ProjectToolFile
 const catalog = isRecord(tables) ? tables['ProjectToolCatalog'] : undefined
 const hasCatalog = isRecord(catalog) && catalog['resourceType'] === ProjectToolResource.catalogResource.resourceType && catalog['resourceId'] === ProjectToolResource.catalogResource.resourceId
 const projectionBindings: Record<string,NonNullable<LoadScenarioDataSetInput['projectionBindings']>[string]> = {}
 const registeredFileExecutors = createLowcodeFileResourceExecutors({applicationId: projectId, api: lowcodeApi.design, fileUpload: lowcodeDesignFileUpload, assertCurrent})
 const logicViewDesign = isRecord(tables) ? tables[LOGIC_VIEW_DESIGN_VIEW] : undefined
 if (isRecord(logicViewDesign) && logicViewDesign['resourceType'] === 'file' && logicViewDesign['resourceId'] === LOGIC_VIEW_DESIGN_RESOURCE_ID) {
  registeredFileExecutors[LOGIC_VIEW_DESIGN_VIEW] = createLogicViewDesignExecutor({scenarioId, http: lowcodeHttp, guard: assertCurrent,
   readScope: executionScopeOf(projectId).readScope})
 }
 if (!declared.length && !hasReference && !hasToolFile && !hasCatalog) return {fileExecutors: registeredFileExecutors}
 const workspace = owner ?? new ProjectWorkspace({projectId, ...createLowcodeProjectGateways(projectId)})
 const executor = ScenarioDefinitionResource.forQueries({workspace, metadataScenarioId: scenarioId, assertCurrent,
  validate: async (next, previous, resources) => {
   const selected = ScenarioDefinitionRecords.validationScope(next, previous, resources)
   if (!selected) return
   const result = await loadScenarioDataSet({scenarioId: next.scenarioId, config: selected, assertCurrent, fileExecutors: executors, projectionBindings})
   try {if (result.diagnostics.length) throw new Error(`SCENARIO_DEFINITION_INCOMPLETE: ${result.diagnostics.join('；')}`)}
   finally {result.dataSet.destroy()}
  }})
 const executors = {...registeredFileExecutors, ...Object.fromEntries(declared.map(([name]) => [name, executor]))}
 if (hasReference) executors[DataSpaceReferenceLayoutResource.tableName] = new DataSpaceReferenceLayoutResource({metadataScenarioId: scenarioId,
  assertCurrent, read: lowcodeDataSpaceLayout.createReader().readDataSpaceLayout})
 const tools = new ProjectToolResource({workspace, metadataScenarioId: scenarioId, assertCurrent, ...(blueprintTreeProjection ? {blueprintTreeProjection} : {})})
 if (hasCatalog) projectionBindings['ProjectToolCatalog'] = view => tools.queryBinding(view)
 if (hasToolFile) executors['ProjectToolFile'] = createPageToolFileResourceExecutor({appId: projectId, workspace, assertCurrent})
 return {fileExecutors: executors, projectionBindings}
}

/** 装配元数据空间并读取首屏空间与模型；字段和来源关系由工作区按需加载。 */
export async function loadLowcodeDataSpaceMetadata(dataSpaceId: string,
 bindings?: Pick<LoadScenarioDataSetInput,'fileExecutors'|'projectionBindings'>, options: Readonly<{workspace?: ProjectWorkspace;
  blueprintTreeProjection?: () => ProjectBlueprintTreeData | Promise<ProjectBlueprintTreeData>}> = {}): Promise<DataSet> {
 if (typeof dataSpaceId !== 'string' || !dataSpaceId.trim() || dataSpaceId.trim() !== dataSpaceId
   || dataSpaceId === '.' || dataSpaceId === '..' || /[\\/%\u0000-\u001f\u007f]/.test(dataSpaceId)) {
  throw new Error('DATA_SPACE_METADATA_TARGET: 数据空间 ID 无效')
 }
 const scope = lowcodeApi.readRequestScope()
 const assertCurrent = (): void => {
  const current = lowcodeApi.readRequestScope()
  if (!scope.headers['X-AppId'] || current.token !== scope.token
    || current.headers['X-AppId'] !== scope.headers['X-AppId']) {
   throw new Error('SPARK_EXECUTION_SCOPE_STALE: 元数据请求所属应用已失效')
  }
 }
 assertCurrent()
 const projectId = scope.headers['X-AppId']
 if (!projectId) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 元数据请求所属应用已失效')
 const text = await createLowcodeProjectGateways(projectId).scenarioViews.readText(DATA_SPACE_DESIGN_FORM_KEY)
 assertCurrent()
 if (text === null) throw new Error('DATA_SPACE_METADATA_CONFIG: 数据空间设计器尚未建立正式视图配置')
 const config = new ScenarioViewConfig(DATA_SPACE_DESIGN_FORM_KEY, text)
 const assembly = await loadScenarioDataSet({scenarioId: DATA_SPACE_DESIGN_FORM_KEY, config, assertCurrent,
  ...(bindings ?? definitionBindings({projectId, scenarioId: DATA_SPACE_DESIGN_FORM_KEY, config, assertCurrent,
   ...(options.workspace ? {owner: options.workspace} : {}), ...(options.blueprintTreeProjection ? {blueprintTreeProjection: options.blueprintTreeProjection} : {})}))})
 const dataSet = assembly.dataSet
 try {
  assertCurrent()
  const tableNames = LowcodeDataSpaceMetadata.tables
  for (const tableName of tableNames) {
   const table = dataSet.getTable(tableName)
   if (!table) throw new Error(`DATA_SPACE_METADATA_TABLE: 缺少 ${tableName}`)
   table.forEachView(view => { view.queryContext = {...view.queryContext, dataSpaceId} })
  }
  for (const table of Object.values(dataSet.tables)) if (table.resourceType === 'file') {
   table.forEachView(view => { view.queryContext = {...view.queryContext, dataSpaceId} })
  }
  await new LowcodeDataSpaceMetadata(dataSet, dataSpaceId, assertCurrent).load(['Base_DataSet', 'Base_DataModel'])
  assertCurrent()
  return dataSet
 } catch (error) {
  dataSet.destroy()
  throw error
 }
}

/** AI与开发工作台共用工作区持有的正式C，五类定义视图按需查询目标T；不读取业务行或创建元模型。 */
export async function loadLowcodeScenarioDefinitions(workspace: ProjectWorkspace, scenarioId: string, assertCurrent: () => void): Promise<DataSet> {
 assertCurrent()
 if (workspace.project.projectId !== lowcodeApi.readRequestScope().headers['X-AppId']) {
  throw new Error('SPARK_EXECUTION_SCOPE_STALE: 定义工作区不属于当前应用')
 }
 const dataSet = await loadLowcodeDataSpaceMetadata(scenarioId, undefined, {workspace})
 try {assertCurrent(); return dataSet} catch (error) {dataSet.destroy(); throw error}
}
