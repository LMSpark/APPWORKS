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
 const [models, relations] = await Promise.all([
  Promise.all([...names].map(metaName => lowcodeApi.dataSpace.design.readModel({...formalInput, metaName}))),
  lowcodeApi.dataSpace.design.readRelations(formalInput),
 ])
 input.assertCurrent?.()
 return new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({config: input.config, models, relations})
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
