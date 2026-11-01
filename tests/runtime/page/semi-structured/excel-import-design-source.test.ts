import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {SparkData, type DataSet} from '@spark-appworks/spark-data'
const state = vi.hoisted(() => ({load: vi.fn(), scope: vi.fn()}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: state.load}))
vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi: {readRequestScope: state.scope}, lowcodeHttp: {}}))
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
const DESIGN = '0F93B82141CF40852021D704B0E30BF4', loaded: DataSet[] = []
beforeEach(() => {
  state.scope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'EXECUTION_APP'}})
  state.load.mockReset(); state.load.mockImplementation(async ({scenarioId}: {scenarioId: string}) => {
    const ds = SparkData.fromJson({scenarioId, dataSetName: 'Excel配置', tables: {}}); loaded.push(ds); return ds
  })
})
afterEach(() => loaded.splice(0).forEach(ds => ds.destroy()))
describe('Excel independent design source', () => {
  it('loads the independent scene without attaching a synthetic file-design table', async () => {
    const ds = await LowcodeExcelImport.loadEditor(DESIGN)
    expect(state.load).toHaveBeenCalledExactlyOnceWith({projectId: 'EXECUTION_APP', scenarioId: DESIGN})
    expect(Object.keys(ds.tables)).toEqual([])
  })
  it('rejects the catalog scene as the editor source', async () => {
    await expect(LowcodeExcelImport.loadEditor(LowcodeExcelImport.navigationScenarioId)).rejects.toThrow(/设计.*场景/)
    expect(state.load).not.toHaveBeenCalled()
  })
})
