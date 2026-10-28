/**
 * @module app:lowcode/lowcode-application-catalog
 * 职责：通过正式应用目录模型装配应用目录运行 DataSet。
 * 边界：固定目录身份，复用当前登录会话和 SPARK DataView 权限结果；不要求已选应用。
 */
import { DataSpaceApi, DataSpaceDesignApi, DATA_SPACE_DESIGN_FORM_KEY, LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import type { LowcodeApplication } from '@spark-appworks/spark-lowcode-api'
import type { DataRow, DataSet, DataView } from '@spark-appworks/spark-data'
import { ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { lowcodeApi, lowcodeHttp } from './lowcode-runtime'
import { LowcodeDataSpaceAssembler } from './data-space/lowcode-data-space-assembler'

const MODEL_NAME = 'Base_AppSystemList'
const REQUIRED_OUTPUTS = ['rowid'] as const

/** 装配正式应用目录 DataSet；调用方通过默认视图查询并拥有、销毁返回的 DataSet。 */
export async function loadLowcodeApplicationCatalog(assertCallerCurrent: () => void = () => undefined): Promise<DataSet> {
  assertCallerCurrent()
  const scope = lowcodeApi.readAuthenticatedRequestScope()
  const assertCurrent = (): void => {
    assertCallerCurrent()
    let currentToken: string
    try {currentToken = lowcodeApi.readAuthenticatedRequestScope().token}
    catch {throw new Error('SPARK_EXECUTION_SCOPE_STALE: 应用目录所属登录会话已变化')}
    if (currentToken !== scope.token) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 应用目录所属登录会话已变化')
    }
  }
  assertCurrent()
  const api = new DataSpaceApi({http: lowcodeHttp, readScope: () => lowcodeApi.readAuthenticatedRequestScope()})
  const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, assertCurrent}
  try {
    const [space, model] = await Promise.all([
      api.design.readSpaceDefinition(input),
      api.design.readModel({...input, metaName: MODEL_NAME}),
    ])
    assertCurrent()
    if (space.dataSpaceId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY || model.metaName !== MODEL_NAME
      || model.primaryKey !== 'rowid') throw new Error('正式应用目录空间、模型或主键身份不匹配')
    const outputs = new Set(DataSpaceDesignApi.resolveOutputFields(model).map(field => field.canonicalName))
    for (const field of REQUIRED_OUTPUTS) if (!outputs.has(field)) {
      throw new Error(`正式应用目录模型缺少可输出字段 ${field}`)
    }
    if (!outputs.has('AppDesc') && !outputs.has('AppName')) {
      throw new Error('正式应用目录模型缺少可输出应用名称字段 AppDesc/AppName')
    }
    const config = new ScenarioViewConfig(LOWCODE_APPLICATION_CATALOG_FORM_KEY, JSON.stringify({
      scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY,
      tables: {[MODEL_NAME]: {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {default: {
        autoLoad: false, autoCurrentFirst: false, autoSelectFirst: false,
        queryConfig: {allPages: true, distinct: true},
        sortExpression: [{field: model.primaryKey, direction: 'asc'}],
      }}}},
      resourceRelations: [], viewCascades: [],
    }))
    const {dataSet, diagnostics} = new LowcodeDataSpaceAssembler(api.runtime, lowcodeHttp)
      .assemble({config, space, models: [model], relations: []})
    try {
      assertCurrent()
      if (diagnostics.length) throw new Error(`应用目录空间装配不完整: ${diagnostics.join('；')}`)
      const view = dataSet.getView(MODEL_NAME, 'default')
      if (view?.primaryKey !== 'rowid' || view.queryConfig.allPages !== true || view.queryConfig.distinct !== true) {
        throw new Error('正式应用目录 DataView 配置或身份无效')
      }
      return dataSet
    } catch (error) {dataSet.destroy(); throw error}
  } catch (error) {
    assertCurrent()
    throw error
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
