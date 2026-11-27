/**
 * @module app:lowcode/data-space/lowcode-data-space-runtime
 * 职责：读取场景绑定的正式模型与关系后装配独立运行空间。边界：应用身份由既有请求 scope 提供，异步返回检查调用代次；AI 可用此入口实现 PageRuntime 的 loadScenario。
 */
import { DATA_SPACE_DESIGN_FORM_KEY, type DataSpaceApi } from '@/platform-adapters/api'
import { createLowcodeProjectGateways, lowcodeApi, lowcodeCatalogRuntimeDataSpace, lowcodeDesignFileUpload, lowcodeHttp,
 readLowcodeCatalogRuntimeRequestScope, verifyLowcodeNativeApplicationPlan } from '../lowcode-runtime'
import { APPLICATION_CATALOG_PROJECT_ID } from '@/services/application-scope'
import { readRepositoryScenarioText } from '../resources/repository/scenarios/resource'
import { LowcodeDataSpaceAssembler, type LowcodeDataSpaceAssembly } from './lowcode-data-space-assembler'
import { isRecord } from '@spark-appworks/spark-utils'
import { ProjectWorkspace, ScenarioDefinitionRecords, ScenarioDefinitionResource, ScenarioViewConfig, DataSpaceReferenceLayoutResource, ProjectToolResource, type PageRuntimeSource, type ProjectBlueprintTreeData } from '@spark-appworks/spark-project-model'
import {lowcodeDataSpaceLayout} from './lowcode-data-space-layout'
import {DataSet,parseRuntimeDataSetPlanFile,type DataViewFilterTree} from '@spark-appworks/spark-data'
import {readRuntimeDataSetPlan} from './runtime-data-set-plan-file'
import {bindWechatChannelsAccounts} from '@/platform-adapters/resources/integration/mp-open/channels-accounts-resource'
import {LowcodeDataSpaceMetadata} from './lowcode-data-space-metadata'
import {LowcodeModelRelationAdapter} from './lowcode-model-relation-adapter'
import {createLowcodeFileResourceExecutors} from '../resources/repository/file-resource-registry'
import {createPageToolFileResourceExecutor} from '@/services/project/page-tool-file-dataview'
import {resolveSystemScenarioResource} from '@/registries/system-scenario-registry'
import {registerApiModelRules,type ApiModelRuleHost} from '../resources/integration/api-management/model-rules'
import {createCacheScenarioBindings} from '../resources/system/cache-management/runtime-bindings'
import {createApprovalOptionsBindings} from '../resources/system/workflow/manage/flow-run-page/query/runtime-bindings'
import {createApprovalCommandBindings} from '../resources/system/workflow/manage/flow-run-page/command/runtime-bindings'
import {registerNavigationHostModelRules} from '../resources/system/navigation-host/model-rules'
import {registerDimensionSourceModelRules} from '../resources/structured-config/dimension-source/model-rules'
import {createDataRecoveryScenarioBindings} from '../resources/system/data-recovery/runtime-bindings'
import {createEnterpriseRegistrationBindings} from '../resources/system/enterprise-registration/runtime-bindings'
import {createApiInterfaceBindings} from '../resources/integration/api-management/runtime-bindings'
import {createWorkflowScenarioBindings} from '../resources/structured-config/workflow-definition/execution/runtime-bindings'
import {createAgentWorkflowCreationBindings} from '../resources/repository/agent-workflow/creation'
import {createAgentWorkflowPublicationBindings} from '../resources/repository/agent-workflow/publication'
import {createAgentWorkflowDeletionBindings} from '../resources/repository/agent-workflow/deletion'
import {createLogicViewDesignExecutor, LOGIC_VIEW_DESIGN_RESOURCE_ID, LOGIC_VIEW_DESIGN_VIEW} from '../resources/structured-config/logic-view/design-ops'
import {createExcelCatalogBindings} from '../resources/semi-structured/excel-import/catalog/creation'
import {createPdfInspectionProjectionBindings} from '../resources/semi-structured/pdf-inspect/runtime-bindings'
import {createPdfInspectionUploadBindings} from '../resources/semi-structured/pdf-inspect/upload-command'
import {createPdfInspectionInitBindings} from '../resources/semi-structured/pdf-inspect/init-command'

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
  ? {dataSpace: lowcodeCatalogRuntimeDataSpace, readScope: readLowcodeCatalogRuntimeRequestScope}
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
 const agentDeletion = createAgentWorkflowDeletionBindings({config,applicationId:projectId,api:lowcodeApi.design,assertCurrent})
 const cacheBindings = createCacheScenarioBindings({config,runtime:dataSpace.runtime,assertCurrent})
 const approvalBindings = createApprovalCommandBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const workflowBindings = createWorkflowScenarioBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const excelBindings = projectId === APPLICATION_CATALOG_PROJECT_ID ? {} : createExcelCatalogBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const recoveryBindings = createDataRecoveryScenarioBindings({config,assertCurrent})
 const enterpriseBindings = createEnterpriseRegistrationBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const apiInterfaceBindings = createApiInterfaceBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const approvalOptions = createApprovalOptionsBindings({config,http:lowcodeHttp,readScope,assertCurrent})
 const definitions = definitionBindings({projectId, scenarioId, config, assertCurrent,
   ...(input.owner?{owner:input.owner}:{}),
   ...(input.blueprintTreeProjection?{blueprintTreeProjection:input.blueprintTreeProjection}:{})})
 const result = await loadScenarioDataSet({scenarioId, config, assertCurrent, dataSpace,
  ...agentCreation,
  ...agentPublication,
  ...agentDeletion,
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
   ...agentDeletion.commandBindings,
   ...cacheBindings.commandBindings,
   ...approvalBindings.commandBindings,
   ...workflowBindings.commandBindings,
   ...excelBindings.commandBindings,
   ...enterpriseBindings.commandBindings,
   ...apiInterfaceBindings.commandBindings,
   ...createPdfInspectionUploadBindings({config,http:lowcodeHttp,readScope,assertCurrent}),
   ...createPdfInspectionInitBindings({config,http:lowcodeHttp,readScope,assertCurrent,
    readStorage: () => window.localStorage,
    readOwner: () => {
     const session = lowcodeApi.session.get()
     const enterpriseId = session?.enterprise.id ?? session?.identity.enterpriseId
     if (!session || !enterpriseId) throw Error('PDF_INSPECTION_INIT_RECOVERY: 缺少当前企业认证会话')
     return {enterpriseId, enterpriseShortName: session.enterprise.shortName,
      actorId: session.identity.userId, applicationId: projectId, scenarioId}
    }}),
  },
  ...(input.getPage?{getPage:input.getPage}:{}),
  ...definitions,
  projectionBindings: {...definitions.projectionBindings, ...approvalOptions.projectionBindings,
   ...createPdfInspectionProjectionBindings({config,http:lowcodeHttp,readScope,assertCurrent})}})
 try {
  assertCurrent()
  if (result.diagnostics.length > 0) {
   throw new Error(`SCENARIO_ASSEMBLY_INCOMPLETE: 场景 ${scenarioId} 的模型关系未完整装配，请在数据空间设计中修复：\n${result.diagnostics.join('\n')}`)
  }
 } catch (failure) { result.dataSet.destroy(); throw failure }
 return result.dataSet
}

const MP_APPLICATION_WORKING_PLAN = Object.freeze({
 projectId: 'D99A1DCE9894698799101EFD70F8FC76',
 nodeId: 'B9EB9A416B3AFC711E3787399368D247',
 scenarioId: 'B9EB9A416B3AFC711E3787399368D247',
 routePath: '/features/integration/mp-open/ui/application-page',
 models: [{id: '42a0f810-edb8-46a1-9174-f6141d212c6d',name: 'base_channel_miniapp_template_application'}],
})

const MP_TEMPLATE_CATALOG_WORKING_PLAN = Object.freeze({
 projectId: MP_APPLICATION_WORKING_PLAN.projectId,
 nodeId: '3F1AB1BEE8CDF6A4DE28F44A933CDCF5',
 scenarioId: '3F1AB1BEE8CDF6A4DE28F44A933CDCF5',
 routePath: '/features/integration/mp-open/ui/catalog-page',
 models: [
  {id: '6b62d736-17ba-44fe-a93d-52a80fc124ea',name: 'base_channel_miniapp_template'},
  {id: '3104bca0-9393-4124-9eec-ca122be7a359',name: 'base_enterprise_channel_account'},
 ],
})

const MP_CHANNELS_WORKING_PLAN = Object.freeze({
 projectId: MP_APPLICATION_WORKING_PLAN.projectId,
 nodeId: '0BBCD14A992018D72F7D0131BBEE6700',
 scenarioId: '0BBCD14A992018D72F7D0131BBEE6700',
 routePath: '/features/integration/mp-open/ui/channels-page',
 models: [
  {id:'9959230d-3516-4eda-834d-0a28240520d8',name:'base_channel_operator_account'},
  {id:'94e2d837-f384-44f6-b3dc-8fe5b8dec4fa',name:'base_enterprise_channel_account'},
 ],
})
const MP_MY_MINIAPP_WORKING_PLAN = Object.freeze({
 projectId: MP_APPLICATION_WORKING_PLAN.projectId,
 nodeId: '547CB8AD9613D81428C2280A8FC22819', scenarioId: '547CB8AD9613D81428C2280A8FC22819',
 routePath: '/features/integration/mp-open/ui/my-miniapp-page',
 models: [
  {id:'29391cd6-5164-439d-95a0-e28af992853f',name:'base_channel_miniapp_template_application'},
  {id:'37f50083-7d99-4db4-b93d-a2137fc016df',name:'Base_AppSystemList'},
  {id:'42c4bc92-cf0d-461e-a8fc-c32bcff7810a',name:'base_channel_account_application'},
  {id:'5fd93d86-2d6e-4d21-af30-55ebabaf7ae3',name:'base_channel_miniapp_deployment'},
  {id:'9cc27e89-e1cf-492b-b5db-2a93a68c9611',name:'base_enterprise_channel_account'},
  {id:'a8d2e26a-8f73-46f3-a36a-45b5f6b50adf',name:'base_channel_miniapp_template'},
 ],
})
const nativeWorkingPlans = [MP_APPLICATION_WORKING_PLAN, MP_TEMPLATE_CATALOG_WORKING_PLAN, MP_CHANNELS_WORKING_PLAN, MP_MY_MINIAPP_WORKING_PLAN]

/** 原生目录和关联各有明确命名视图；首次查询只由实际消费者派发。 */
function configureMyMiniappViews(dataSet: DataSet): void {
 const declarations = [
  {tableName:'base_enterprise_channel_account',viewId:'accounts',fields:['id','provider','account_type','nick_name','authorizer_appid','authorization_status','enabled']},
  {tableName:'base_channel_miniapp_template_application',viewId:'applications',fields:['id','channel_account_id','status','user_version','deployment_id']},
  {tableName:'base_channel_miniapp_deployment',viewId:'deployments',fields:['id','channel_account_id','status','user_version','provider']},
  {tableName:'base_channel_account_application',viewId:'bindings',fields:['id','channel_account_id','usage_code','status']},
  {tableName:'Base_AppSystemList',viewId:'businessApplications',fields:['rowid','AppName']},
 ]
 for (const {tableName,viewId,fields} of declarations) {
  const table=dataSet.getTable(tableName)
  if(!table || table.getView(viewId) || fields.some(field=>!table.columns.some(column=>column.name===field))) {
   throw Error(`NATIVE_DATASET_PLAN_MODEL: 我的账号正式视图 ${tableName}@${viewId} 装配不完整`)
  }
  const primaryKey=tableName==='Base_AppSystemList'?'rowid':'id'
  const view=table.getOrCreateView(viewId)
  if(view.primaryKey!==primaryKey) throw Error('NATIVE_DATASET_PLAN_MODEL: 我的账号正式视图主键不符')
  view.applyViewConfig({queryConfig:{fields,pagination:'paged',allPages:false,autoQuery:false},
   sortExpression:[{field:primaryKey,direction:'asc'}],page:1,pageSize:10,allowDelete:false})
 }
 configureMiniappTemplateViews(dataSet,'installable')
}

/** 运营号视图继承正式模型来源，独立于专用账号投影。 */
function configureChannelOperators(dataSet: DataSet): void {
 const table = dataSet.getTable('base_channel_operator_account')
 const fields = ['id','operator_uid','display_name','bind_mode','status','updated_at']
 if (!table || table.getView('operators') || fields.some(field => !table.columns.some(column => column.name===field))) {
  throw Error('NATIVE_DATASET_PLAN_MODEL: 视频号运营号缺少正式字段或视图身份冲突')
 }
 table.getOrCreateView('operators').applyViewConfig({queryConfig:{fields,pagination:'paged',allPages:false,autoQuery:false},
  sortExpression:[{field:'id',direction:'asc'}],page:1,pageSize:10,allowDelete:false})
}

/** 在正式绑定前配置目录和安装候选，确保不同用途继承同表 owner 及字段权限。 */
function configureMiniappTemplateViews(dataSet: DataSet, usage: 'catalog'|'installable' = 'catalog'): void {
 const table = dataSet.getTable('base_channel_miniapp_template')
 const fields = ['id', 'provider', 'display_name', 'catalog_visible', 'active']
 if (!table || fields.some(field => !table.columns.some(column => column.name === field))) {
  throw new Error('NATIVE_DATASET_PLAN_MODEL: 小程序模板目录缺少正式字段')
 }
 for (const [channel, provider] of [['Wechat','WECHAT_OPEN'],['Douyin','DOUYIN_OPEN']] as const) {
  const providerFilter: DataViewFilterTree = {field: 'provider',operator: 'eq',value: provider}
  const scopes: ReadonlyArray<readonly [string, DataViewFilterTree]> = [
   ...(usage==='catalog' ? [[`catalog${channel}`, providerFilter] as const] : []),
   [`installable${channel}`, {logic: 'and', filters: [providerFilter,
    {field: 'catalog_visible',operator: 'eq',value: true}, {field: 'active',operator: 'eq',value: true}]}],
  ]
  for (const [viewId, scopeFilter] of scopes) {
   if (table.getView(viewId)) throw new Error('NATIVE_DATASET_PLAN_MODEL: 小程序模板视图身份冲突')
   table.getOrCreateView(viewId).applyViewConfig({scopeFilter,
    queryConfig: {fields, pagination: 'paged', allPages: false, autoQuery: false},
    sortExpression: [{field:'id',direction:'asc'}], page: 1, pageSize: 10, allowDelete: false})
  }
 }
}

/** 原生页明确选用已知应用工作 Plan，实例 guard 约束导航变更期间迟到的已派发读取。 */
type NativeWorkingPlanSource = Readonly<{nodeId: string; routePath: string; assertCurrent: () => void}>

/** PageRuntime 场景装配入口：身份变化或模型关系装配不完整即失败并销毁；诊断修复仍走设计会话。 */
export async function loadLowcodeRuntimeScenario(command: Readonly<{
 projectId: string
 scenarioId: string
 source?: PageRuntimeSource
 workingSource?: NativeWorkingPlanSource
 pagedata?: Readonly<{scenarioId: string; version: number; fileName: string; sha256: string; sourceRevision: string; text: string}>
 dataset?: Readonly<{scenarioId: string; fileName: string; sha256: string; sourceRevision: string}>
 getPage?:ApiModelRuleHost['getPage']
}>): Promise<DataSet> {
 const { projectId, scenarioId } = command
 const source = command.source ?? {mode:'design' as const,sourceRevision:'working',publicationRef:null,scenarioIds:[scenarioId]}
 if (!source.scenarioIds.includes(scenarioId)
   || source.scenarioIds.some(id => typeof id !== 'string' || !id.trim())) {
  throw new Error('PAGE_RUNTIME_SOURCE_CONTRACT: 场景加载来源身份不一致')
 }
 if (source.mode === 'preview') {
  throw new Error('PAGE_PREVIEW_TEMPORARY_SOURCE: 预览配置必须由临时装配入口消费')
 }
 if (source.mode === 'published') {
  if (!source.publicationRef?.trim() || !command.pagedata && !command.dataset) {
   throw new Error('PAGE_RUNTIME_PUBLICATION_REQUIRED: 发布场景必须使用 manifest 场景 proof')
  }
 } else if (source.publicationRef !== null || command.pagedata || command.dataset) {
  throw new Error('PAGE_RUNTIME_SOURCE_CONFLICT: 设计运行不能携带 publication 场景 proof')
 }
 if (command.pagedata && command.dataset) throw new Error('PAGE_RUNTIME_SOURCE_CONFLICT: pagedata 与 Dataset proof 不能同时存在')
 if (command.pagedata && command.pagedata.scenarioId !== scenarioId) {
  throw new Error('PAGE_PUBLICATION_MANIFEST_CONFLICT: pagedata 场景身份不一致')
 }
 const workingSource = command.workingSource
 if (workingSource) {
  if (source.mode !== 'design' || source.sourceRevision !== 'working' || source.scenarioIds.length !== 1) {
   throw new Error('NATIVE_DATASET_PLAN_SOURCE_CONFLICT: 工作 Plan 只适用于本次原生主场景')
  }
  const expected = nativeWorkingPlans.find(entry => projectId === entry.projectId && scenarioId === entry.scenarioId
    && workingSource.nodeId === entry.nodeId && workingSource.routePath === entry.routePath)
  if (!expected) {
   throw new Error('NATIVE_DATASET_PLAN_IDENTITY: 工作 Plan 与正式应用及入口身份不一致')
  }
  const execution = readLowcodeExecutionProject()
  if (execution.projectId !== projectId) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 工作 Plan 所属应用已失效')
  const assertCurrent = () => {
   workingSource.assertCurrent()
   execution.assertCurrent()
  }
  assertCurrent()
  await verifyLowcodeNativeApplicationPlan({...expected, assertCurrent})
  assertCurrent()
  const fileDataSet = DataSet.fromJson({scenarioId, tables: {}})
  const text = await readRuntimeDataSetPlan({scenarioId, dataSet: fileDataSet, assertCurrent})
   .finally(() => fileDataSet.destroy())
  assertCurrent()
  if (text === null) throw new Error('DATASET_PLAN_FILE_MISSING: 后端独立 Dataset 文件不存在')
  const plan = parseRuntimeDataSetPlanFile(text, scenarioId)
  if (plan.models.length !== expected.models.length
    || !expected.models.every(model => plan.models.some(actual => actual.id === model.id && actual.metaName === model.name))) {
   throw new Error('NATIVE_DATASET_PLAN_MODEL: 工作 Plan 未绑定本入口的正式模型')
  }
  const configureViews = expected === MP_TEMPLATE_CATALOG_WORKING_PLAN ? configureMiniappTemplateViews
   : expected === MP_CHANNELS_WORKING_PLAN ? configureChannelOperators
    : expected === MP_MY_MINIAPP_WORKING_PLAN ? configureMyMiniappViews : undefined
  const dataSet = await assembleLowcodeRuntimeDataSetPlan({projectId, scenarioId, text, assertCurrent,
   ...(configureViews ? {configureViews} : {}), ...(command.getPage ? {getPage: command.getPage} : {})})
  try {
   assertCurrent()
   if (expected === MP_CHANNELS_WORKING_PLAN) bindWechatChannelsAccounts({dataSet,http:lowcodeHttp,
    readScope:()=>lowcodeApi.readRequestScope(),assertCurrent})
   return dataSet
  } catch (cause) {dataSet.destroy(); throw cause}
 }
 if (projectId === APPLICATION_CATALOG_PROJECT_ID) {
  if (source.mode !== 'design') throw new Error('CATALOG_SCENARIO_SOURCE_CONFLICT: 目录场景只接纳仓内设计来源')
  return loadCatalogRuntimeScenario(command)
 }
 const execution = readLowcodeExecutionProject()
 if (execution.projectId !== projectId) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景请求所属应用已失效')
 const assertCurrent = execution.assertCurrent
 assertCurrent()
 if (command.dataset) {
  if (command.dataset.scenarioId !== scenarioId || command.dataset.fileName !== `${scenarioId}.dataset.json`) {
   throw new Error('PAGE_PUBLICATION_MANIFEST_CONFLICT: Dataset Plan 身份不一致')
  }
  const fileDataSet = DataSet.fromJson({scenarioId, tables: {}})
  const text = await readRuntimeDataSetPlan({scenarioId, dataSet: fileDataSet, assertCurrent})
   .finally(() => fileDataSet.destroy())
  assertCurrent()
  if (text === null) throw new Error('DATASET_PLAN_FILE_MISSING: 后端独立 Dataset 文件不存在')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  assertCurrent()
  const sha256 = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
  if (sha256 !== command.dataset.sha256) throw new Error('PAGE_PUBLICATION_DATASET_PROOF_CONFLICT: Dataset 文件 SHA 不匹配')
  const plan = parseRuntimeDataSetPlanFile(text, scenarioId)
  if (plan.contentHash !== command.dataset.sourceRevision) {
   throw new Error('PAGE_PUBLICATION_DATASET_PROOF_CONFLICT: Dataset contentHash 不匹配')
  }
  return assembleLowcodeRuntimeDataSetPlan({projectId, scenarioId, text, assertCurrent,
   ...(command.getPage?{getPage:command.getPage}:{})})
 }
 const text = command.pagedata?.text
  ?? await createLowcodeProjectGateways(projectId).scenarioViews.readText(scenarioId)
 assertCurrent()
 if (text === null) throw new Error(`SCENARIO_VIEW_FILE_MISSING: 场景 ${scenarioId} 尚未建立视图配置`)
 return assembleLowcodeRuntimeScenario({projectId, scenarioId, config: new ScenarioViewConfig(scenarioId, text), assertCurrent,
  ...(command.getPage?{getPage:command.getPage}:{})})
}

/** Assemble an independent backend-owned Dataset Plan through formal model owners. */
export async function assembleLowcodeRuntimeDataSetPlan(input: Readonly<{
 projectId: string
 scenarioId: string
 text: string
 assertCurrent: () => void
 configureViews?: (dataSet: DataSet) => void
 getPage?: ApiModelRuleHost['getPage']
}>): Promise<DataSet> {
 const plan = parseRuntimeDataSetPlanFile(input.text, input.scenarioId)
 const {dataSpace} = executionScopeOf(input.projectId)
 const formalInput = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: input.scenarioId,
  assertCurrent: input.assertCurrent}
 const [space, models] = await Promise.all([
  dataSpace.design.readSpaceDefinition(formalInput),
  dataSpace.design.readModelBatch({...formalInput, metaNames: [...new Set(plan.models.map(model => model.metaName))]}),
 ])
 input.assertCurrent()
 const result = new LowcodeDataSpaceAssembler(dataSpace.runtime, lowcodeHttp).assembleRuntimePlan({plan, space, models, ...(input.configureViews ? {configureViews: input.configureViews} : {})})
 try {
  registerApiModelRules(result.dataSet,{...(input.getPage?{getPage:input.getPage}:{}),assertCurrent:input.assertCurrent})
  registerNavigationHostModelRules(result.dataSet)
  registerDimensionSourceModelRules(result.dataSet)
  input.assertCurrent()
  return result.dataSet
 } catch (error) {
  result.dataSet.destroy()
  throw error
 }
}

/** 目录作用域（未进入应用）只装配已登记的系统场景；登录身份变化或选中应用即失效。 */
async function loadCatalogRuntimeScenario(command: Readonly<{ projectId: string; scenarioId: string; getPage?:ApiModelRuleHost['getPage'] }>): Promise<DataSet> {
 const {projectId, scenarioId} = command
 const resource = resolveSystemScenarioResource(scenarioId)
 if (!resource) throw new Error(`CATALOG_SCENARIO_SOURCE_MISSING: ${scenarioId} 不是已登记的系统场景，目录作用域不能装配`)
 const token = readLowcodeCatalogRuntimeRequestScope().token
 const assertCurrent = (): void => {
  if (readLowcodeCatalogRuntimeRequestScope().token !== token) {
   throw new Error('SPARK_EXECUTION_SCOPE_STALE: 目录作用域登录会话或应用代次已变化')
  }
 }
 assertCurrent()
 const text = await readRepositoryScenarioText(resource, assertCurrent)
 assertCurrent()
 const declared = new ScenarioViewConfig(scenarioId, text)
 // 平台目录只加载列表消费的模型，文件与执行资源由应用内场景装配。
 const directoryModels: Partial<Record<typeof resource.name, string>> = {
  pdfInspectCatalog: 'Base_FileInspectConfig', jsonDataCatalog: 'Base_JsonData', excelImportCatalog: 'Base_Import_solution',
 }
 const model = directoryModels[resource.name]
 const config = model ? declared.selectModelScope(model, []) : declared
 return assembleLowcodeRuntimeScenario({projectId, scenarioId, config, assertCurrent,
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
