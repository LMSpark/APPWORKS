/**
 * @module app:lowcode/data-space/lowcode-data-space-runtime
 * 职责：读取场景绑定的正式模型与关系后装配独立运行空间。边界：应用身份由既有请求 scope 提供，异步返回检查调用代次；AI 可用此入口实现 PageRuntime 的 loadScenario。
 */
import { DATA_SPACE_DESIGN_FORM_KEY, LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { createLowcodeProjectGateways, lowcodeApi, lowcodeDesignFileUpload, lowcodeHttp } from '../lowcode-runtime'
import { LowcodeDataSpaceAssembler, type LowcodeDataSpaceAssembly } from './lowcode-data-space-assembler'
import { isRecord } from '@spark-appworks/spark-utils'
import { ProjectWorkspace, ScenarioDefinitionRecords, ScenarioDefinitionResource, ScenarioViewConfig, DataSpaceReferenceLayoutResource, ProjectToolResource, type ProjectBlueprintTreeData } from '@spark-appworks/spark-project-model'
import {lowcodeDataSpaceLayout} from './lowcode-data-space-layout'
import type { DataSet } from '@spark-appworks/spark-data'
import {LowcodeDataSpaceMetadata} from './lowcode-data-space-metadata'
import {LowcodeModelRelationAdapter} from './lowcode-model-relation-adapter'
import {LOWCODE_FILE_RESOURCE_REGISTRY} from '../resources/shared/agent-workflow-file-resource'
import {getBuiltinScenarioResource, isBuiltinApplication, resolveBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {BUILTIN_BLUEPRINT_NODE_RESOURCE_ID, BUILTIN_BLUEPRINT_NODE_TABLE_NAME, BuiltinBlueprintNodeResource} from '../resources/shared/builtin-blueprint-node-resource'

/** 场景装配命令；配置身份必须匹配 scenarioId，可指定正式设计场景并检查调用是否仍有效。 */
export type LoadScenarioDataSetInput = Readonly<{
 scenarioId: string
 designScenarioId?: string
 config: Parameters<LowcodeDataSpaceAssembler['assemble']>[0]['config']
 /** 可选运行范围的模型表键；先核完整关系依赖，再读取所需模型详情，不更改正式配置或业务数据。 */
 modelScope?: string
 /** 按配置表键注入已存在的文件查询/保存owner；文件声明本身不产生存储或访问能力。 */
 fileExecutors?: Parameters<LowcodeDataSpaceAssembler['assemble']>[0]['fileExecutors']
 /** 活动数据空间设计会话持有的元数据DataSet；正式定义读取复用其中相应模型的查询owner。 */
 metadataDataSet?: DataSet
 assertCurrent?: () => void
}>

type DefinitionExecutorsInput = Readonly<{
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
 input.assertCurrent?.()
 const formalInput = {designScenarioId, dataSpaceId: scenarioId, ...(input.assertCurrent ? {assertCurrent: input.assertCurrent} : {})}
 let config = input.config
 let inherited: Awaited<ReturnType<typeof lowcodeApi.dataSpace.design.readRelations>> | undefined
 if (input.modelScope !== undefined) {
  const configuredTables = config.toJSON()['tables']
  if (!isRecord(configuredTables) || !Object.hasOwn(configuredTables, input.modelScope)) throw new Error(`场景模型表不存在: ${input.modelScope}`)
  if (config.usesNativeResourceRelations) config = config.selectModelScope(input.modelScope)
  else {
   inherited = await lowcodeApi.dataSpace.design.readRelations(formalInput, input.metadataDataSet)
   input.assertCurrent?.()
   const bindings = new Map<string, {id: string; name: string}>()
   for (const [key, table] of Object.entries(configuredTables)) {
    if (isRecord(table) && table['resourceType'] === 'file') continue
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
  if (isRecord(table) && table['resourceType'] === 'file') {
   const executor = input.fileExecutors && Object.hasOwn(input.fileExecutors, tableName) ? input.fileExecutors[tableName] : undefined
   const deferredToolFile = input.scenarioId === LOWCODE_APPLICATION_CATALOG_FORM_KEY
    && tableName === 'ProjectToolFile' && table['resourceId'] === ProjectToolResource.resources.ProjectToolFile
   if ((!executor || typeof executor.executeQuery !== 'function') && !deferredToolFile) throw new Error(`SCENARIO_FILE_OWNER: ${tableName} 缺少文件查询owner`)
   continue
  }
  if (!isRecord(table) || !isRecord(table['modelBinding']) || typeof table['modelBinding']['modelName'] !== 'string') throw new Error('场景模型绑定不完整')
  names.add(table['modelBinding']['modelName'])
 }
 const [space, models, relations] = await Promise.all([
  lowcodeApi.dataSpace.design.readSpaceDefinition(formalInput, input.metadataDataSet),
  names.size ? lowcodeApi.dataSpace.design.readModelBatch({...formalInput, metaNames: [...names]}, input.metadataDataSet) : Promise.resolve([]),
  config.usesNativeResourceRelations ? Promise.resolve([]) : inherited !== undefined ? Promise.resolve(inherited) : lowcodeApi.dataSpace.design.readRelations(formalInput, input.metadataDataSet),
 ])
 input.assertCurrent?.()
 return new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({config, space, models, relations,
  ...(input.fileExecutors ? {fileExecutors: input.fileExecutors} : {})})
}

/** PageRuntime 场景装配入口：身份变化或模型关系装配不完整即失败并销毁；诊断修复仍走设计会话。 */
export async function loadLowcodeRuntimeScenario(command: Readonly<{ projectId: string; scenarioId: string }>): Promise<DataSet> {
 const { projectId, scenarioId } = command
 if (isBuiltinApplication(projectId) && !resolveBuiltinScenarioResource(scenarioId)) {
  throw new Error(`BUILTIN_SCENARIO_SOURCE_MISSING: ${scenarioId} 不是已登记的系统程序场景`)
 }
 const scope = lowcodeApi.readRequestScope()
 const assertCurrent = (): void => {
  if (lowcodeApi.readRequestScope().token !== scope.token || scope.headers['X-AppId'] !== projectId) {
   throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景请求所属应用已失效')
  }
 }
 assertCurrent()
 const text = await createLowcodeProjectGateways(projectId).scenarioViews.readText(scenarioId)
 assertCurrent()
 if (text === null) throw new Error(`SCENARIO_VIEW_FILE_MISSING: 场景 ${scenarioId} 尚未建立视图配置`)
 const config = new ScenarioViewConfig(scenarioId, text)
 const result = await loadScenarioDataSet({scenarioId, config, assertCurrent,
  fileExecutors: definitionExecutors({projectId, scenarioId, config, assertCurrent})})
 try {
  assertCurrent()
  if (result.diagnostics.length > 0) {
   throw new Error(`SCENARIO_ASSEMBLY_INCOMPLETE: 场景 ${scenarioId} 的模型关系未完整装配，请在数据空间设计中修复：\n${result.diagnostics.join('\n')}`)
  }
 } catch (failure) { result.dataSet.destroy(); throw failure }
 return result.dataSet
}

/** 文件资源由已声明的语义身份接线，目标ID仍由DataView输入提供，不从当前空间猜测。 */
function definitionExecutors(input: DefinitionExecutorsInput): NonNullable<LoadScenarioDataSetInput['fileExecutors']> {
 const {projectId, scenarioId, config, assertCurrent, owner, blueprintTreeProjection} = input
 const tables = config.toJSON()['tables']
 const declared = isRecord(tables) ? Object.entries(tables).filter(([name, table]) => isRecord(table) && table['resourceType'] === 'file'
  && Object.entries(ScenarioDefinitionRecords.resources).some(([key, resource]) => key === name && resource === table['resourceId'])) : []
 const reference = isRecord(tables) ? tables[DataSpaceReferenceLayoutResource.tableName] : undefined
 const hasReference = isRecord(reference) && reference['resourceType'] === 'file' && reference['resourceId'] === DataSpaceReferenceLayoutResource.resourceId
 const toolTables = isRecord(tables) ? Object.entries(ProjectToolResource.resources).filter(([name, id]) => {
  // DevSystem binds the formal ProjectToolFile table through spark-data's
  // FileResource adapter so its read/edit/save/history lifecycle has one owner.
  // The data-space designer still uses ProjectToolResource for its own query use cases.
  if (scenarioId === LOWCODE_APPLICATION_CATALOG_FORM_KEY && name === 'ProjectToolFile') return false
  const table = tables[name]; return isRecord(table) && table['resourceType'] === 'file' && table['resourceId'] === id
 }) : []
 const builtinBlueprintTable = isRecord(tables) ? tables[BUILTIN_BLUEPRINT_NODE_TABLE_NAME] : undefined
 const declaresBuiltinBlueprint = isRecord(builtinBlueprintTable) && builtinBlueprintTable['resourceType'] === 'file'
  && builtinBlueprintTable['resourceId'] === BUILTIN_BLUEPRINT_NODE_RESOURCE_ID
 const builtinBlueprintScenario = scenarioId === getBuiltinScenarioResource('projectBlueprint').scenarioId
 if (isBuiltinApplication(projectId) && builtinBlueprintScenario && !declaresBuiltinBlueprint) {
  throw new Error('BUILTIN_BLUEPRINT_SOURCE_MISSING: 7AB 蓝图场景未声明仓内蓝图节点 DataView')
 }
 const builtinBlueprintOwner = isBuiltinApplication(projectId) && builtinBlueprintScenario
 const registeredFileExecutors = Object.fromEntries(LOWCODE_FILE_RESOURCE_REGISTRY.map(definition => [definition.tableName,
  definition.createExecutor({applicationId: projectId, api: lowcodeApi.design, fileUpload: lowcodeDesignFileUpload, assertCurrent})]))
 if (declaresBuiltinBlueprint) registeredFileExecutors[BUILTIN_BLUEPRINT_NODE_TABLE_NAME] = builtinBlueprintOwner
  ? new BuiltinBlueprintNodeResource({applicationId: projectId, scenarioId, assertCurrent}).executor
  : {executeQuery: () => Promise.reject(new Error('BUILTIN_BLUEPRINT_IDENTITY: 当前应用不能读取 AppWorks 仓内蓝图节点'))}
 if (!declared.length && !hasReference && !toolTables.length) return registeredFileExecutors
 const workspace = owner ?? new ProjectWorkspace({projectId, ...createLowcodeProjectGateways(projectId)})
 const executor = ScenarioDefinitionResource.forQueries({workspace, metadataScenarioId: scenarioId, assertCurrent,
  validate: async (next, previous, resources) => {
   const selected = ScenarioDefinitionRecords.validationScope(next, previous, resources)
   if (!selected) return
   const result = await loadScenarioDataSet({scenarioId: next.scenarioId, config: selected, assertCurrent, fileExecutors: executors})
   try {if (result.diagnostics.length) throw new Error(`SCENARIO_DEFINITION_INCOMPLETE: ${result.diagnostics.join('；')}`)}
   finally {result.dataSet.destroy()}
  }})
 const executors = {...registeredFileExecutors, ...Object.fromEntries(declared.map(([name]) => [name, executor]))}
 if (hasReference) executors[DataSpaceReferenceLayoutResource.tableName] = new DataSpaceReferenceLayoutResource({metadataScenarioId: scenarioId,
  assertCurrent, read: lowcodeDataSpaceLayout.createReader().readDataSpaceLayout})
 const tools = new ProjectToolResource({workspace, metadataScenarioId: scenarioId, assertCurrent, ...(blueprintTreeProjection ? {blueprintTreeProjection} : {})})
 for (const [name] of toolTables) executors[name] = tools
 return executors
}

/** 装配元数据空间并读取首屏空间与模型；字段和来源关系由工作区按需加载。 */
export async function loadLowcodeDataSpaceMetadata(dataSpaceId: string,
 fileExecutors?: LoadScenarioDataSetInput['fileExecutors'], options: Readonly<{workspace?: ProjectWorkspace;
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
  fileExecutors: fileExecutors ?? definitionExecutors({projectId, scenarioId: DATA_SPACE_DESIGN_FORM_KEY, config, assertCurrent,
   ...(options.workspace ? {owner: options.workspace} : {}), ...(options.blueprintTreeProjection ? {blueprintTreeProjection: options.blueprintTreeProjection} : {})})})
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
