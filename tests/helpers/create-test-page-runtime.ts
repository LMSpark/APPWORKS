import { vi } from 'vitest'
import { DataSet, type DataSetContract } from '@spark-appworks/spark-data'
import { PageRuntime } from '../../packages/spark-project-model/src/page/runtime-page'
import { PageTool } from '../../packages/spark-project-model/src/page/page-tool'
/** Mount fixtures own one explicit main scenario; production resolution stays in PageRuntime. */
export function createTestPageRuntime(dataSet: DataSetContract): PageRuntime {
 if (!(dataSet instanceof DataSet)) throw new Error('fixture requires DataSet')
 const scenarioId = dataSet.scenarioId ?? 'test-scenario'
 const runtime = new PageRuntime({tool:new PageTool({pageId:'test-page'}),scenarioIds:[scenarioId],mainScenarioId:scenarioId,loadScenario:async()=>dataSet})
 vi.spyOn(runtime,'getDataSet').mockImplementation(id=>id === scenarioId ? dataSet : undefined)
 vi.spyOn(runtime,'resolveView').mockImplementation(binding=>{
  const parts = binding.startsWith('#') ? binding.slice(1).split('@') : [scenarioId,...binding.split('@')]
  if(parts.length !== 3 || parts.some(part=>!part) || parts[0]!==scenarioId) throw new Error(`invalid fixture binding: ${binding}`)
  return dataSet.getView(parts[1] ?? '',parts[2] ?? '')
 })
 return runtime
}
