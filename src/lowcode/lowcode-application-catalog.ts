/**
 * @module app:lowcode/lowcode-application-catalog
 * 职责：从正式目录场景配置装配应用目录和导航根 DataView。
 * 边界：查询字段、分页和排序由仓内场景 DataView 声明；正式应用与导航数据仍由 SPARK data 查询。
 */
import type {LowcodeApplication} from '@spark-appworks/spark-lowcode-api'
import {DataViewFilter, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataSpaceAssembler} from './data-space/lowcode-data-space-assembler'
import {LowcodeModelRelationAdapter} from './data-space/lowcode-model-relation-adapter'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {lowcodeApi, lowcodeHttp} from './lowcode-runtime'
import {readRepositoryScenarioText} from './resources/shared/repository-scenarios/repository-scenario-resource'

const APPLICATION_CATALOG_SCENARIO = 'projectBlueprint'
const NAVIGATION_ROOT_SCENARIO = 'projectBlueprint'
const APPLICATION_MODEL = 'Base_AppSystemList'
const APPLICATION_VIEW = 'catalogApps'
const NAVIGATION_MODEL = 'Base_NavigationInfo'
const NAVIGATION_ROOT_VIEW = 'navigationRoot'
const APPLICATION_ID_FIELD = 'rowid'

function captureAuthenticatedScope(assertCallerCurrent: () => void): () => void {
  assertCallerCurrent()
  const scope = lowcodeApi.readAuthenticatedRequestScope()
  const assertCurrent = (): void => {
    let currentToken: string
    try {currentToken = lowcodeApi.readAuthenticatedRequestScope().token}
    catch {throw new Error('SPARK_EXECUTION_SCOPE_STALE: 目录 DataView 所属登录会话已变化')}
    if (currentToken !== scope.token) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 目录 DataView 所属登录会话已变化')
    assertCallerCurrent()
  }
  assertCurrent()
  return assertCurrent
}

/** Load a model's declared view from the builtin catalog scenario through the shared assembler. */
async function loadCatalogDataSet(modelName: string, scenarioName: 'dataSpaceCatalog' | 'projectBlueprint', assertCallerCurrent: () => void): Promise<DataSet> {
  const assertCurrent = captureAuthenticatedScope(assertCallerCurrent)
  const resource = getBuiltinScenarioResource(scenarioName)
  const text = await readRepositoryScenarioText(resource, assertCurrent)
  const sourceConfig = new ScenarioViewConfig(resource.scenarioId, text)
  const api = new DataSpaceApi({http: lowcodeHttp, readScope: () => lowcodeApi.readAuthenticatedRequestScope()})
  const input = {designScenarioId: getBuiltinScenarioResource('dataSpaceDesign').scenarioId,
    dataSpaceId: resource.scenarioId, assertCurrent}
  try {
    const relations = await api.design.readRelations(input)
    assertCurrent()
    const tables = sourceConfig.toJSON()['tables']
    if (!isRecord(tables)) throw new Error('目录场景缺少正式模型绑定')
    const bindings = new Map<string, {id: string; name: string}>()
    for (const [tableName, table] of Object.entries(tables)) {
      if (!isRecord(table) || !isRecord(table['modelBinding']) || typeof table['modelBinding']['modelId'] !== 'string'
        || typeof table['modelBinding']['modelName'] !== 'string') continue
      bindings.set(tableName, {id: table['modelBinding']['modelId'], name: table['modelBinding']['modelName']})
    }
    const targets = [...bindings].filter(([, binding]) => binding.name === modelName)
    if (targets.length !== 1) throw new Error(`目录场景正式模型绑定不唯一：${modelName}`)
    const targetTableKey = targets[0]?.[0]
    if (!targetTableKey) throw new Error(`目录场景没有正式模型绑定：${modelName}`)
    const scopedConfig = sourceConfig.selectModelScope(targetTableKey,
      new LowcodeModelRelationAdapter().scopeDependencies(relations, bindings))
    const scopedTables = scopedConfig.toJSON()['tables']
    if (!isRecord(scopedTables)) throw new Error('目录 DataView 范围缺少正式模型')
    const modelNames = [...new Set(Object.values(scopedTables).flatMap(table => isRecord(table)
      && isRecord(table['modelBinding']) && typeof table['modelBinding']['modelName'] === 'string'
      ? [table['modelBinding']['modelName']] : []))]
    const [space, models] = await Promise.all([
      api.design.readSpaceDefinition(input),
      api.design.readModelBatch({...input, metaNames: modelNames}),
    ])
    assertCurrent()
    const assembly = new LowcodeDataSpaceAssembler(api.runtime, lowcodeHttp)
      .assemble({config: scopedConfig, space, models, relations})
    try {
      assertCurrent()
      if (assembly.diagnostics.length) throw new Error(`目录 DataView 装配不完整：${assembly.diagnostics.join('；')}`)
      return assembly.dataSet
    } catch (error) {
      assembly.dataSet.destroy()
      throw error
    }
  } catch (error) {
    assertCurrent()
    throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read the unique visible root through the catalog scenario's formal DataView. */
export async function readLowcodeNavigationRootId(
  systemId: string,
  assertCallerCurrent: () => void,
): Promise<string> {
  const normalizedSystemId = systemId.trim()
  if (!normalizedSystemId) throw new Error('应用导航根查询缺少有效 systemId')
  const assertCurrent = captureAuthenticatedScope(assertCallerCurrent)
  const dataSet = await loadCatalogDataSet(NAVIGATION_MODEL, NAVIGATION_ROOT_SCENARIO, assertCurrent)
  try {
    assertCurrent()
    const view = requireConfiguredView(dataSet, NAVIGATION_MODEL, NAVIGATION_ROOT_VIEW)
    assertNavigationRootView(view)
    view.filterExpression = DataViewFilter.group({logic: 'and', filters: [
      DataViewFilter.condition({field: 'SysId', operator: 'eq', value: normalizedSystemId}).toJSON(),
      DataViewFilter.condition({field: 'prowid', operator: 'eq', value: '000000'}).toJSON(),
    ]}).toJSON()
    const result = await view.requestRefresh()
    assertCurrent()
    if (!result.success) throw new Error(result.message ?? '正式导航根 DataView 查询失败')
    if (view.total !== 1 || view.rows.length !== 1) {
      throw new Error(`应用导航根节点应唯一，正式 DataView 返回 ${view.rows.length} 行`)
    }
    const row = view.rows[0]
    if (!row) throw new Error('正式导航根 DataView 缺少结果行')
    for (const field of ['rowid', 'SysId', 'prowid']) {
      if (!Object.hasOwn(row, field) || view.fieldAccess(row, field).read !== 'visible') {
        throw new Error(`正式导航根 DataView 身份字段不可读：${field}`)
      }
    }
    const id = row['rowid']
    if (typeof id !== 'string' || row['SysId'] !== normalizedSystemId || row['prowid'] !== '000000') {
      throw new Error('正式导航根 DataView 返回了身份不匹配的根节点')
    }
    return id
  } catch (error) {
    assertCurrent()
    throw error
  } finally {dataSet.destroy()}
}

/** DataSet owner used by the app directory pages; its view configuration comes from repository pagedata. */
export async function loadLowcodeApplicationCatalog(assertCallerCurrent: () => void = () => undefined): Promise<DataSet> {
  return loadCatalogDataSet(APPLICATION_MODEL, APPLICATION_CATALOG_SCENARIO, assertCallerCurrent)
}

export function getFormalModelView(dataSet: DataSet, modelName: string, viewId: string): DataView {
  const tableMatches = Object.entries(dataSet.tables).filter(([, table]) => table.modelBinding?.modelName === modelName)
  if (tableMatches.length !== 1) throw new Error(`正式模型名称绑定不唯一：${modelName}`)
  const tableKey = tableMatches[0]?.[0]
  if (!tableKey) throw new Error(`正式模型名称未绑定：${modelName}`)
  const view = dataSet.getView(tableKey, viewId)
  if (view?.primaryKey !== APPLICATION_ID_FIELD) {
    throw new Error(`目录场景缺少正式 DataView：${modelName}@${viewId}`)
  }
  if (view.dataTable?.modelBinding?.modelName !== modelName) {
    throw new Error(`正式 DataView 模型身份不匹配：${modelName}@${viewId}`)
  }
  return view
}

function requireConfiguredView(dataSet: DataSet, modelName: string, viewId: string): DataView {
  return getFormalModelView(dataSet, modelName, viewId)
}

function assertNavigationRootView(view: DataView): void {
  if (view.queryConfig.allPages !== true || view.queryConfig.maxRows !== 2
    || view.pageSize !== 1 || JSON.stringify(view.queryConfig.fields) !== JSON.stringify(['rowid', 'SysId', 'prowid'])) {
    throw new Error('正式导航根 DataView 配置或身份无效')
  }
}

function readableText(view: DataView, row: DataRow, field: string): string | undefined {
  if (!Object.hasOwn(row, field) || view.fieldAccess(row, field).read !== 'visible') return undefined
  const value = row[field]
  return typeof value === 'string' ? value.trim() : undefined
}

function readableDefault(view: DataView, row: DataRow): boolean | undefined {
  if (!Object.hasOwn(row, 'IsSys') || view.fieldAccess(row, 'IsSys').read !== 'visible') return undefined
  const value = row['IsSys']
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  return undefined
}

/** Project one formal catalog row through its returned DataView field permissions. */
function projectLowcodeApplication(view: DataView, row: DataRow): LowcodeApplication {
  if (!Object.hasOwn(row, APPLICATION_ID_FIELD) || view.fieldAccess(row, APPLICATION_ID_FIELD).read !== 'visible') {
    throw new Error('正式应用目录 DataView 返回了不可读的应用身份')
  }
  const id = row[APPLICATION_ID_FIELD]
  if (typeof id !== 'string' || !id.trim() || id !== id.trim()) throw new Error('正式应用目录 DataView 返回了无效应用主键')
  const code = readableText(view, row, 'AppName')
  const applicationName = readableText(view, row, 'AppDesc')
  const description = readableText(view, row, 'Memo')
  const enterpriseId = readableText(view, row, 'EntId')
  const enterpriseShortName = readableText(view, row, 'EntShortName')
  const name = applicationName && applicationName.length > 0 ? applicationName : code && code.length > 0 ? code : id
  const isDefault = readableDefault(view, row)
  return {id, name, ...(code === undefined ? {} : {code}), ...(description === undefined ? {} : {description}),
    ...(enterpriseId === undefined ? {} : {enterpriseId}), ...(enterpriseShortName === undefined ? {} : {enterpriseShortName}),
    ...(isDefault === undefined ? {} : {isDefault})}
}

/** Read the complete application catalog through its declared DataView. */
export async function readLowcodeApplications(assertCallerCurrent: () => void): Promise<readonly LowcodeApplication[]> {
  const assertCurrent = captureAuthenticatedScope(assertCallerCurrent)
  const dataSet = await loadCatalogDataSet(APPLICATION_MODEL, APPLICATION_CATALOG_SCENARIO, assertCurrent)
  try {
    assertCurrent()
    const view = requireConfiguredView(dataSet, APPLICATION_MODEL, APPLICATION_VIEW)
    if (view.queryConfig.allPages !== true || view.queryConfig.distinct !== true) {
      throw new Error('正式应用目录 DataView 配置无效')
    }
    const result = await view.requestRefresh()
    assertCurrent()
    if (!result.success) throw new Error(result.message ?? '正式应用目录 DataView 查询失败')
    const applications: LowcodeApplication[] = []
    const seenIds = new Set<string>()
    for (const row of view.rows) {
      const application = projectLowcodeApplication(view, row)
      if (seenIds.has(application.id)) throw new Error(`正式应用目录包含重复应用 ID：${application.id}`)
      seenIds.add(application.id)
      applications.push(application)
    }
    return applications
  } catch (error) {
    assertCurrent()
    throw error
  } finally {dataSet.destroy()}
}

/** Read one exact application through the shared formal catalog projection. */
export async function readLowcodeApplicationById(
  applicationId: string,
  assertCurrent: () => void,
): Promise<LowcodeApplication> {
  const normalizedId = applicationId.trim()
  if (!normalizedId) throw new Error('应用 ID 不能为空')
  const applications = await readLowcodeApplications(assertCurrent)
  assertCurrent()
  const application = applications.find(item => item.id === normalizedId)
  if (!application) throw new Error(`lowcode 应用不存在或无权访问：${normalizedId}`)
  return application
}
