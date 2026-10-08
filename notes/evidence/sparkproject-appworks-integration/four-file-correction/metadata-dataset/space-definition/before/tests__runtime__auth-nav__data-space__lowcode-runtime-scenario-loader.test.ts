import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readRequestScope: vi.fn(),
  readText: vi.fn(),
  readModel: vi.fn(),
  readRelations: vi.fn(),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {
    readRequestScope: mocks.readRequestScope,
    dataSpace: { design: { readModel: mocks.readModel, readRelations: mocks.readRelations }, runtime: {} },
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
})
