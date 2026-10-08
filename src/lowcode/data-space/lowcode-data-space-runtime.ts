/**
 * @module app:lowcode/data-space/lowcode-data-space-runtime
 * 职责：读取场景绑定的正式模型与关系后装配独立运行空间。边界：应用和租户由既有请求 scope 提供，异步返回检查调用代次；AI 可用此入口实现 PageRuntime 的 loadScenario。
 */
import { DATA_SPACE_DESIGN_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { createLowcodeProjectGateways, lowcodeApi, lowcodeHttp } from '../lowcode-runtime'
import { LowcodeDataSpaceAssembler, type LowcodeDataSpaceAssembly } from './lowcode-data-space-assembler'
import { isRecord } from '@spark-appworks/spark-utils'
import { ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import type { DataSet } from '@spark-appworks/spark-data'
import metadataViewConfig from '../../../config/pages/data-platform/data-space-design/pagedata.json'

/** 场景装配命令；配置身份必须匹配 scenarioId，可指定正式设计场景并检查调用是否仍有效。 */
export type LoadScenarioDataSetInput = Readonly<{
 scenarioId: string
 designScenarioId?: string
 config: Parameters<LowcodeDataSpaceAssembler['assemble']>[0]['config']
 assertCurrent?: () => void
}>

/** 场景视图文件与正式模型的唯一运行装配入口；请求 owner 提供应用及租户身份。 */
export async function loadScenarioDataSet(input: LoadScenarioDataSetInput): Promise<LowcodeDataSpaceAssembly> {
 const scenarioId = input.scenarioId.trim()
 if (!scenarioId || input.config.scenarioId !== scenarioId) throw new Error('场景视图配置身份不一致')
 const designScenarioId = input.designScenarioId ?? DATA_SPACE_DESIGN_FORM_KEY
 input.assertCurrent?.()
 const tables = input.config.toJSON()['tables']
 if (!isRecord(tables)) throw new Error('场景视图缺少 tables')
 const names = new Set<string>()
 for (const table of Object.values(tables)) {
  if (!isRecord(table) || !isRecord(table['modelBinding']) || typeof table['modelBinding']['modelName'] !== 'string') throw new Error('场景模型绑定不完整')
  names.add(table['modelBinding']['modelName'])
 }
 const formalInput = {designScenarioId, dataSpaceId: scenarioId, ...(input.assertCurrent ? {assertCurrent: input.assertCurrent} : {})}
 const [space, models, relations] = await Promise.all([
  lowcodeApi.dataSpace.design.readSpaceDefinition(formalInput),
  Promise.all([...names].map(metaName => lowcodeApi.dataSpace.design.readModel({...formalInput, metaName}))),
  lowcodeApi.dataSpace.design.readRelations(formalInput),
 ])
 input.assertCurrent?.()
 return new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({config: input.config, space, models, relations})
}

/** PageRuntime 场景装配入口：读取场景视图文件并装配，期间请求应用或身份变化即失败并销毁。 */
export async function loadLowcodeRuntimeScenario(command: Readonly<{ projectId: string; scenarioId: string }>): Promise<DataSet> {
 const { projectId, scenarioId } = command
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
 const result = await loadScenarioDataSet({ scenarioId, config: new ScenarioViewConfig(scenarioId, text), assertCurrent })
 try { assertCurrent() } catch (failure) { result.dataSet.destroy(); throw failure }
 return result.dataSet
}

/** 以单个被设计空间 ID 加载正式元数据，保留元场景身份及每个 DataView 的查询 owner。 */
export async function loadLowcodeDataSpaceMetadata(dataSpaceId: string): Promise<DataSet> {
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
 const config = new ScenarioViewConfig(DATA_SPACE_DESIGN_FORM_KEY, JSON.stringify(metadataViewConfig))
 const assembly = await loadScenarioDataSet({scenarioId: DATA_SPACE_DESIGN_FORM_KEY, config, assertCurrent})
 const dataSet = assembly.dataSet
 try {
  assertCurrent()
  const tableNames = ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation']
  for (const tableName of tableNames) {
   const table = dataSet.getTable(tableName)
   if (!table) throw new Error(`DATA_SPACE_METADATA_TABLE: 缺少 ${tableName}`)
   table.forEachView(view => { view.queryContext = {...view.queryContext, formid: dataSpaceId} })
  }
  for (const tableName of tableNames) {
   assertCurrent()
   const view = dataSet.getView(tableName, 'default')
   if (!view) throw new Error(`DATA_SPACE_METADATA_VIEW: 缺少 ${tableName}@default`)
   const result = await view.loadFromServer({allPages: true})
   assertCurrent()
   if (!result.success || view.rows.length !== view.total) {
    throw new Error(`DATA_SPACE_METADATA_QUERY: ${tableName} 未完整读取`)
   }
   const ownerField = tableName === 'Base_DataSet' ? 'rowid' : 'dataSetId'
   if (tableName === 'Base_DataSet' && view.rows.length !== 1) {
    throw new Error('DATA_SPACE_METADATA_TARGET: 目标空间未唯一返回')
   }
   for (const row of view.rows) {
    if (view.fieldAccess(row, ownerField).read !== 'visible' || row[ownerField] !== dataSpaceId) {
     throw new Error(`DATA_SPACE_METADATA_SCOPE: ${tableName} 返回了目标外或不可核验的记录`)
    }
   }
  }
  return dataSet
 } catch (error) {
  dataSet.destroy()
  throw error
 }
}
