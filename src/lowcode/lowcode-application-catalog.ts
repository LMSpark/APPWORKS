/**
 * @module app:lowcode/lowcode-application-catalog
 * 职责：通过正式应用目录模型装配应用目录运行 DataSet。
 * 边界：固定目录身份，复用当前登录会话和 SPARK DataView 权限结果；不要求已选应用。
 */
import { DataSpaceApi, DataSpaceDesignApi, DATA_SPACE_DESIGN_FORM_KEY, LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import type { DataSet } from '@spark-appworks/spark-data'
import { ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { lowcodeApi, lowcodeHttp } from './lowcode-runtime'
import { LowcodeDataSpaceAssembler } from './data-space/lowcode-data-space-assembler'

const MODEL_NAME = 'Base_AppSystemList'
const REQUIRED_OUTPUTS = ['rowid'] as const

/** 装配正式应用目录 DataSet；调用方通过默认视图查询并拥有、销毁返回的 DataSet。 */
export async function loadLowcodeApplicationCatalog(): Promise<DataSet> {
  const scope = lowcodeApi.readAuthenticatedRequestScope()
  const assertCurrent = (): void => {
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
