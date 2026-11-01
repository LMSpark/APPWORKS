import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {SparkData, type DataSet} from '@spark-appworks/spark-data'
const state = vi.hoisted(() => ({load: vi.fn(), scope: vi.fn()}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: state.load}))
vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi: {readRequestScope: state.scope}, lowcodeHttp: {}}))
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {LowcodePdfInspect} from '@/lowcode/resources/semi-structured/pdf-inspect/resource'
const loaded: DataSet[] = []
beforeEach(() => {
  state.scope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'EXECUTION_APP'}})
  state.load.mockReset(); state.load.mockImplementation(async ({scenarioId}: {scenarioId: string}) => {
    const ds = SparkData.fromJson({scenarioId, dataSetName: 'formal topic', tables: {}}); loaded.push(ds); return ds
  })
})
afterEach(() => loaded.splice(0).forEach(ds => ds.destroy()))
const topics = [
  [LowcodeWorkflowDefinition, '5E9676B1E38860B023921F48FB4370DE', 'Base_WorkflowDefinition'],
  [LowcodeExcelImport, '36B01771C627B9BF5CD493DC75B996A1', 'Base_Import_solution'],
  [LowcodePdfInspect, 'A2D63AB2AAEF156E7727094A23AEA433', 'Base_FileInspectConfig'],
] as const
describe('formal topic catalog sources', () => {
  it.each(topics)('uses the actual scene and canonical formal model for %s', async (topic, scenarioId, metaName) => {
    expect(topic.navigationScenarioId).toBe(scenarioId)
    expect(topic.catalogMetaName).toBe(metaName)
    const ds = await topic.loadCatalog(scenarioId)
    expect(state.load).toHaveBeenCalledExactlyOnceWith({projectId: 'EXECUTION_APP', scenarioId})
    expect(Object.keys(ds.tables)).toEqual([])
  })
  it.each(topics)('rejects a different scenario for %s', async topic => {
    await expect(topic.loadCatalog('WRONG')).rejects.toThrow(/场景/)
    expect(state.load).not.toHaveBeenCalled()
  })
})
