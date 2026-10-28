import {beforeEach, describe, expect, it, vi} from 'vitest'

const catalog = vi.hoisted(() => ({
  readById: vi.fn<(id: string, assertCurrent: () => void) => Promise<Record<string, unknown>>>(),
}))
const runtime = vi.hoisted(() => ({
  token: 'scope-1',
  readNavigation: vi.fn(async () => ({id: 'ROOT-1', projectId: 'APP-1', title: '导航', childPlacement: 'header', items: []})),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {
    session: {get: () => ({enterprise: {shortName: 'Tenant'}})},
    readRequestScope: () => ({token: runtime.token, headers: {}}),
  },
  readLowcodeRuntimeNavigation: runtime.readNavigation,
}))

vi.mock('@/lowcode/lowcode-application-catalog', () => ({
  readLowcodeApplicationById: catalog.readById,
}))

import {loadProjectRuntimeSettings} from '@/services/project/project-settings'

beforeEach(() => {
  runtime.token = 'scope-1'
  runtime.readNavigation.mockReset()
  runtime.readNavigation.mockImplementation(async () => ({
    id: 'ROOT-1', projectId: 'APP-1', title: '导航', childPlacement: 'header', items: [],
  }))
  catalog.readById.mockReset()
})

describe('project runtime settings application catalog owner', () => {
  it('reads the target application through the authenticated formal catalog reader', async () => {
    catalog.readById.mockResolvedValue({
      id: 'APP-1', name: '财务管理', code: 'finance', description: '财务系统说明', isDefault: false,
    })

    const settings = await loadProjectRuntimeSettings('Tenant', 'APP-1')

    expect(catalog.readById).toHaveBeenCalledWith('APP-1', expect.any(Function))
    expect(settings.project).toMatchObject({
      projectId: 'APP-1', name: '财务管理', description: '财务系统说明', projectType: 'application',
    })
  })

  it('keeps the session tenant scope guard ahead of application lookup', async () => {
    await expect(loadProjectRuntimeSettings('other-tenant', 'APP-1'))
      .rejects.toThrow('lowcode 应用设置路由企业与当前会话不一致')
    expect(catalog.readById).not.toHaveBeenCalled()
  })

  it('rejects an application result after the authenticated request scope changes', async () => {
    catalog.readById.mockImplementation(async (_id, assertCurrent) => {
      runtime.token = 'scope-2'
      assertCurrent()
      return {id: 'APP-1', name: '财务管理', isDefault: false}
    })

    await expect(loadProjectRuntimeSettings('Tenant', 'APP-1'))
      .rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(runtime.readNavigation).not.toHaveBeenCalled()
  })

  it('rejects navigation metadata after the authenticated request scope changes', async () => {
    catalog.readById.mockResolvedValue({id: 'APP-1', name: '财务管理', isDefault: false})
    runtime.readNavigation.mockImplementationOnce(async () => {
      runtime.token = 'scope-2'
      return {id: 'ROOT-1', projectId: 'APP-1', title: '导航', childPlacement: 'header', items: []}
    })

    await expect(loadProjectRuntimeSettings('Tenant', 'APP-1'))
      .rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })

  it('prefers stale scope over a late catalog failure after the request scope changes', async () => {
    catalog.readById.mockImplementationOnce(async () => {
      runtime.token = 'scope-2'
      throw new Error('late catalog failure')
    })

    await expect(loadProjectRuntimeSettings('Tenant', 'APP-1'))
      .rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })

  it('prefers stale scope over a late navigation failure after the request scope changes', async () => {
    catalog.readById.mockResolvedValue({id: 'APP-1', name: '财务管理', isDefault: false})
    runtime.readNavigation.mockImplementationOnce(async () => {
      runtime.token = 'scope-2'
      throw new Error('late navigation failure')
    })

    await expect(loadProjectRuntimeSettings('Tenant', 'APP-1'))
      .rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })

  it('preserves a stable catalog failure while the captured request scope remains current', async () => {
    const failure = new Error('catalog query failed')
    catalog.readById.mockRejectedValue(failure)

    await expect(loadProjectRuntimeSettings('Tenant', 'APP-1')).rejects.toBe(failure)
  })
})
