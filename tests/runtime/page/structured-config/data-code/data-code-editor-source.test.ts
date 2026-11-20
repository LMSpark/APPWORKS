import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {SparkData, type DataSet} from '@spark-appworks/spark-data'

const state = vi.hoisted(() => ({load: vi.fn(), readScope: vi.fn()}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: state.load}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {readRequestScope: state.readScope}, lowcodeHttp: {},
}))
const {LowcodeDataCode} = await import('@/lowcode/resources/structured-config/data-code/resource')
const DESIGN = '868E62F90DB8118C74CDC9F6BCA61157'
const loaded: DataSet[] = []
beforeEach(() => {
  state.load.mockReset()
  state.readScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'EXECUTION_APP'}})
  state.load.mockImplementation(async (input: {scenarioId: string}) => {
    const ds = SparkData.fromJson({scenarioId: input.scenarioId, dataSetName: '编码设计', tables: {}})
    loaded.push(ds)
    return ds
  })
})
afterEach(() => {loaded.splice(0).forEach(ds => ds.destroy())})

describe('code editor formal scenario source', () => {
  it('loads reference-table sources from the original formal source scene and current execution scope', async () => {
    const ds = await LowcodeDataCode.loadReferenceSources()
    expect(state.load).toHaveBeenCalledExactlyOnceWith({projectId: 'EXECUTION_APP', scenarioId: '34BDBE645F461A3D83282A941D6037F4'})
    expect(ds.scenarioId).toBe('34BDBE645F461A3D83282A941D6037F4')
  })
  it('loads the independent design scenario through the canonical loader without adding a file-design owner', async () => {
    const ds = await LowcodeDataCode.loadEditor(DESIGN)
    expect(state.load).toHaveBeenCalledExactlyOnceWith({projectId: 'EXECUTION_APP', scenarioId: DESIGN})
    expect(Object.keys(ds.tables)).toEqual([])
  })

  it('rejects the catalog scenario rather than treating it as a design scene', async () => {
    await expect(LowcodeDataCode.loadEditor(LowcodeDataCode.navigationScenarioId)).rejects.toThrow(/设计.*场景/)
    expect(state.load).not.toHaveBeenCalled()
  })
})
