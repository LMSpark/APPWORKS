import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DATA_SPACE_DESIGN_FORM_KEY } from '@spark-appworks/spark-lowcode-api'

const mocks = vi.hoisted(() => ({
  readRequestScope: vi.fn(),
  readText: vi.fn(),
  readSpaceDefinition: vi.fn(),
  readModel: vi.fn(),
  readRelations: vi.fn(),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {
    readRequestScope: mocks.readRequestScope,
    dataSpace: { design: { readSpaceDefinition: mocks.readSpaceDefinition,
      readModel: mocks.readModel, readRelations: mocks.readRelations }, runtime: {} },
  },
  lowcodeHttp: {},
  createLowcodeProjectGateways: () => ({ scenarioViews: { readText: mocks.readText } }),
}))

import { loadLowcodeRuntimeScenario } from '@/lowcode/data-space/lowcode-data-space-runtime'

const scope = (token: string, appId: string) => ({ token, headers: { 'X-AppId': appId } })

describe('loadLowcodeRuntimeScenario', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('rejects when the request application differs from the page project', async () => {
    mocks.readRequestScope.mockReturnValue(scope('t1', 'OTHER'))
    await expect(loadLowcodeRuntimeScenario({ projectId: 'APP', scenarioId: 'SCENE' })).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(mocks.readText).not.toHaveBeenCalled()
  })

  it('rejects when the request identity changes while reading the scenario file', async () => {
    mocks.readRequestScope.mockReturnValueOnce(scope('t1', 'APP')).mockReturnValueOnce(scope('t1', 'APP')).mockReturnValue(scope('t2', 'APP'))
    mocks.readText.mockResolvedValue('{}')
    await expect(loadLowcodeRuntimeScenario({ projectId: 'APP', scenarioId: 'SCENE' })).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(mocks.readModel).not.toHaveBeenCalled()
  })

  it('rejects a missing scenario view file without reading formal models', async () => {
    mocks.readRequestScope.mockReturnValue(scope('t1', 'APP'))
    mocks.readText.mockResolvedValue(null)
    await expect(loadLowcodeRuntimeScenario({ projectId: 'APP', scenarioId: 'SCENE' })).rejects.toThrow('SCENARIO_VIEW_FILE_MISSING')
    expect(mocks.readModel).not.toHaveBeenCalled()
  })

  it('reads formal space even when no tables are configured, keeping scenario identity separate from Name', async () => {
    mocks.readRequestScope.mockReturnValue(scope('t1', 'APP'))
    mocks.readText.mockResolvedValue(JSON.stringify({scenarioId: 'SCENE', tables: {}}))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: 'SCENE', name: '正式场景名称'})
    mocks.readRelations.mockResolvedValue([])
    const dataSet = await loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'})
    expect(dataSet.scenarioId).toBe('SCENE')
    expect(dataSet.dataSetName).toBe('正式场景名称')
    expect(mocks.readSpaceDefinition).toHaveBeenCalledWith(expect.objectContaining({
      designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: 'SCENE'}))
    expect(mocks.readModel).not.toHaveBeenCalled()
    dataSet.destroy()
  })

  it('rejects a formal space result returned after request scope changed', async () => {
    let resolveSpace!: (value: {dataSpaceId: string; name: string}) => void
    mocks.readRequestScope.mockReturnValue(scope('t1', 'APP'))
    mocks.readText.mockResolvedValue(JSON.stringify({scenarioId: 'SCENE', tables: {}}))
    mocks.readSpaceDefinition.mockReturnValue(new Promise(resolve => {resolveSpace = resolve}))
    mocks.readRelations.mockResolvedValue([])
    const pending = loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'})
    await vi.waitFor(() => expect(mocks.readSpaceDefinition).toHaveBeenCalledOnce())
    mocks.readRequestScope.mockReturnValue(scope('t2', 'APP'))
    resolveSpace({dataSpaceId: 'SCENE', name: '迟到名称'})
    await expect(pending).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })
})
