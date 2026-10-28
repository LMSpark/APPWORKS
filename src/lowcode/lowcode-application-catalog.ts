/**
 * @module app:lowcode/lowcode-application-catalog
 * 职责：通过正式应用目录模型装配应用目录运行 DataSet。
 * 边界：固定目录身份，复用当前登录会话和 SPARK DataView 权限结果；不要求已选应用。
 */
import { DataSpaceApi, DataSpaceDesignApi, DATA_SPACE_DESIGN_FORM_KEY, LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import type { LowcodeApplication } from '@spark-appworks/spark-lowcode-api'
import {DataViewFilter, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import { ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { lowcodeApi, lowcodeHttp } from './lowcode-runtime'
import { LowcodeDataSpaceAssembler } from './data-space/lowcode-data-space-assembler'

const MODEL_NAME = 'Base_AppSystemList'
const REQUIRED_OUTPUTS = ['rowid'] as const
const NAVIGATION_MODEL_NAME = 'Base_NavigationInfo'
const NAVIGATION_ROOT_OUTPUTS = ['rowid', 'SysId', 'prowid'] as const
const NAVIGATION_ROOT_MAX_ROWS = 2

type FormalViewSpec = Readonly<{
  dataSpaceId: string
  modelName: string
  requiredOutputFields: readonly string[]
  validateOutputs?: (outputNames: ReadonlySet<string>) => void
  pageSize?: number
  queryConfig: DataView['queryConfig']
  sortExpression: DataView['sortExpression']
}>

/** Shared only by the two host-owned formal DataViews: application catalog and navigation root. */
async function loadFormalHostDataView(
  spec: FormalViewSpec,
  assertCallerCurrent: () => void,
): Promise<DataSet> {
  assertCallerCurrent()
  const scope = lowcodeApi.readAuthenticatedRequestScope()
  const assertCurrent = (): void => {
    assertCallerCurrent()
    let currentToken: string
    try {currentToken = lowcodeApi.readAuthenticatedRequestScope().token}
    catch {throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式数据空间视图所属登录会话已变化')}
    if (currentToken !== scope.token) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式数据空间视图所属登录会话已变化')
    }
  }
  assertCurrent()
  const api = new DataSpaceApi({http: lowcodeHttp, readScope: () => lowcodeApi.readAuthenticatedRequestScope()})
  const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: spec.dataSpaceId, assertCurrent}
  try {
    const [space, model] = await Promise.all([
      api.design.readSpaceDefinition(input),
      api.design.readModel({...input, metaName: spec.modelName}),
    ])
    assertCurrent()
    if (space.dataSpaceId !== spec.dataSpaceId || model.metaName !== spec.modelName
      || !model.id.trim() || model.primaryKey !== 'rowid') {
      throw new Error(`正式数据空间模型身份不匹配：${spec.dataSpaceId}@${spec.modelName}`)
    }
    const outputs = new Set(DataSpaceDesignApi.resolveOutputFields(model).map(field => field.canonicalName))
    for (const field of spec.requiredOutputFields) if (!outputs.has(field)) {
      throw new Error(`正式模型 ${spec.modelName} 缺少可输出字段 ${field}`)
    }
    spec.validateOutputs?.(outputs)
    const config = new ScenarioViewConfig(spec.dataSpaceId, JSON.stringify({
      scenarioId: spec.dataSpaceId,
      tables: {[spec.modelName]: {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {default: {
        autoLoad: false, autoCurrentFirst: false, autoSelectFirst: false,
        ...(spec.pageSize === undefined ? {} : {pageSize: spec.pageSize}),
        queryConfig: spec.queryConfig,
        sortExpression: spec.sortExpression,
      }}}},
      resourceRelations: [], viewCascades: [],
    }))
    const {dataSet, diagnostics} = new LowcodeDataSpaceAssembler(api.runtime, lowcodeHttp)
      .assemble({config, space, models: [model], relations: []})
    try {
      assertCurrent()
      if (diagnostics.length) throw new Error(`正式数据空间视图装配不完整: ${diagnostics.join('；')}`)
      const view = dataSet.getView(spec.modelName, 'default')
      if (view?.primaryKey !== 'rowid') throw new Error(`正式模型 ${spec.modelName} 默认 DataView 身份无效`)
      return dataSet
    } catch (error) {dataSet.destroy(); throw error}
  } catch (error) {
    assertCurrent()
    throw error
  }
}

/** 装配正式应用目录 DataSet；调用方通过默认视图查询并拥有、销毁返回的 DataSet。 */
export async function loadLowcodeApplicationCatalog(assertCallerCurrent: () => void = () => undefined): Promise<DataSet> {
  const dataSet = await loadFormalHostDataView({dataSpaceId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, modelName: MODEL_NAME,
    requiredOutputFields: REQUIRED_OUTPUTS, validateOutputs: outputs => {
      if (!outputs.has('AppDesc') && !outputs.has('AppName')) {
        throw new Error('正式应用目录模型缺少可输出应用名称字段 AppDesc/AppName')
      }
    }, queryConfig: {allPages: true, distinct: true},
    sortExpression: [{field: 'rowid', direction: 'asc'}]}, assertCallerCurrent)
  const view = dataSet.getView(MODEL_NAME, 'default')
  if (view?.queryConfig.allPages !== true || view.queryConfig.distinct !== true) {
    dataSet.destroy()
    throw new Error('正式应用目录 DataView 配置无效')
  }
  return dataSet
}

/** Read the unique visible root through the target model's formal Base_NavigationInfo DataView. */
export async function readLowcodeNavigationRootId(
  systemId: string,
  assertCallerCurrent: () => void,
): Promise<string> {
  const normalizedSystemId = systemId.trim()
  if (!normalizedSystemId) throw new Error('应用导航根查询缺少有效 systemId')
  assertCallerCurrent()
  const dataSet = await loadFormalHostDataView({dataSpaceId: LOWCODE_APPLICATION_CATALOG_FORM_KEY,
    modelName: NAVIGATION_MODEL_NAME, requiredOutputFields: NAVIGATION_ROOT_OUTPUTS,
    pageSize: 1, queryConfig: {fields: NAVIGATION_ROOT_OUTPUTS, allPages: true,
      distinct: true, maxRows: NAVIGATION_ROOT_MAX_ROWS},
    sortExpression: [{field: 'rowid', direction: 'asc'}]}, assertCallerCurrent)
  try {
    assertCallerCurrent()
    const view = dataSet.getView(NAVIGATION_MODEL_NAME, 'default')
    if (view?.primaryKey !== 'rowid' || view.queryConfig.allPages !== true
      || view.queryConfig.maxRows !== NAVIGATION_ROOT_MAX_ROWS
      || JSON.stringify(view.queryConfig.fields) !== JSON.stringify(NAVIGATION_ROOT_OUTPUTS)) {
      throw new Error('正式导航根 DataView 配置或身份无效')
    }
    view.filterExpression = DataViewFilter.group({logic: 'and', filters: [
      DataViewFilter.condition({field: 'SysId', operator: 'eq', value: normalizedSystemId}).toJSON(),
      DataViewFilter.condition({field: 'prowid', operator: 'eq', value: '000000'}).toJSON(),
    ]}).toJSON()
    const result = await view.requestRefresh()
    assertCallerCurrent()
    if (!result.success) throw new Error(result.message ?? '正式导航根 DataView 查询失败')
    if (!Number.isSafeInteger(view.total) || view.total < 0 || view.total !== view.rows.length) {
      throw new Error(`正式导航根 DataView 总数未确认：total=${view.total} rows=${view.rows.length}`)
    }
    if (view.total !== 1 || view.rows.length !== 1) {
      throw new Error(`应用导航根节点应唯一，正式 DataView 返回 ${view.rows.length} 行`)
    }
    const row = view.rows[0]
    if (!row) throw new Error('正式导航根 DataView 缺少结果行')
    for (const field of NAVIGATION_ROOT_OUTPUTS) {
      if (!Object.hasOwn(row, field) || view.fieldAccess(row, field).read !== 'visible') {
        throw new Error(`正式导航根 DataView 身份字段不可读：${field}`)
      }
    }
    const id = row['rowid']
    if (typeof id !== 'string' || !id.trim() || row['SysId'] !== normalizedSystemId || row['prowid'] !== '000000') {
      throw new Error('正式导航根 DataView 返回了身份不匹配的根节点')
    }
    return id.trim()
  } finally {
    dataSet.destroy()
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

/** Read one application from the formal DataView, retaining only visible metadata and releasing its DataSet. */
export async function readLowcodeApplicationById(
  applicationId: string,
  assertCurrent: () => void,
): Promise<LowcodeApplication> {
  const normalizedId = applicationId.trim()
  if (!normalizedId) throw new Error('应用 ID 不能为空')
  assertCurrent()
  const dataSet = await loadLowcodeApplicationCatalog(assertCurrent)
  try {
    assertCurrent()
    const view = dataSet.getView(MODEL_NAME, 'default')
    if (view?.primaryKey !== 'rowid' || view.queryConfig.allPages !== true || view.queryConfig.distinct !== true) {
      throw new Error('正式应用目录 DataView 配置或身份无效')
    }
    const result = await view.requestRefresh()
    assertCurrent()
    if (!result.success) throw new Error(result.message ?? '正式应用目录 DataView 查询失败')

    const matchingRows = view.rows.filter((row: DataRow) => (
      Object.hasOwn(row, 'rowid')
      && view.fieldAccess(row, 'rowid').read === 'visible'
      && row['rowid'] === normalizedId
    ))
    if (matchingRows.length === 0) throw new Error(`lowcode 应用不存在或无权访问：${normalizedId}`)
    if (matchingRows.length !== 1) throw new Error(`正式应用目录包含重复应用 ID：${normalizedId}`)
    const row = matchingRows[0]
    if (!row) throw new Error('正式应用目录缺少可读的应用身份')
    const id = readableText(view, row, 'rowid')
    if (id === undefined || id !== normalizedId) throw new Error('正式应用目录缺少可读的应用身份')
    const code = readableText(view, row, 'AppName')
    const description = readableText(view, row, 'AppDesc')
    const enterpriseId = readableText(view, row, 'EntId')
    const enterpriseShortName = readableText(view, row, 'EntShortName')
    const name = description !== undefined && description.length > 0
      ? description
      : code !== undefined && code.length > 0 ? code : id
    const isDefault = readableDefault(view, row)
    return {
      id,
      name,
      ...(code === undefined ? {} : {code}),
      ...(description === undefined ? {} : {description}),
      ...(enterpriseId === undefined ? {} : {enterpriseId}),
      ...(enterpriseShortName === undefined ? {} : {enterpriseShortName}),
      ...(isDefault === undefined ? {} : {isDefault}),
    }
  } finally {
    dataSet.destroy()
  }
}
