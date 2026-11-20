import { vi } from 'vitest'
import { DataSet, buildDataViewKey, parseDataViewKey, resolveDataViewKey, type DataSetContract } from '@spark-appworks/spark-data'
import { PageRuntime } from '../../../packages/spark-project-model/src/page/runtime-page'
import { PageTool } from '../../../packages/spark-project-model/src/page/page-tool'
/** Mount fixtures own one explicit main scenario; production resolution stays in PageRuntime. */
export function createTestPageRuntime(dataSet: DataSetContract): PageRuntime {
 if (!(dataSet instanceof DataSet)) throw new Error('fixture requires DataSet')
 const scenarioId = dataSet.scenarioId ?? 'test-scenario'
 const runtime = new PageRuntime({tool:new PageTool({pageId:'test-page'}),scenarioIds:[scenarioId],mainScenarioId:scenarioId,loadScenario:async()=>dataSet})
 vi.spyOn(runtime,'getDataSet').mockImplementation(id=>id === scenarioId ? dataSet : undefined)
 vi.spyOn(runtime,'resolveView').mockImplementation(binding=>{
  const descriptor=parseDataViewKey(binding)
  if(!descriptor||(descriptor.scope??scenarioId)!==scenarioId)throw new Error(`invalid fixture binding: ${binding}`)
  const key=descriptor.scope===undefined&&dataSet.scenarioId ? buildDataViewKey(descriptor.tableName,descriptor.viewId,scenarioId) : binding
  return resolveDataViewKey(key,dataSet)
 })
 return runtime
}
