import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet, RequestState} from '@spark-appworks/spark-data'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {readNavigationAuthorizationDataView} from '@/lowcode/resources/shared/navigation-authorization-resource'

const executionAppId = 'EXEC-APP'
const executionRootId = 'EXEC-ROOT'
const targetAppId = 'TARGET-APP'
const targetRootId = 'TARGET-ROOT'
const evidence = {items: [{id: 'MENU-1', target: 'vue:/features/example', targetKind: 'vue' as const,
  formKey: 'SCENE-1', children: []}], contexts: []}

function selectExecutionApplication(navigationRootId = executionRootId): void {
  lowcodeApi.session.save({accessToken: 'test-access', refreshToken: 'test-refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: {userId: 'USER-1', account: 'test', displayName: 'Test', enterpriseId: 'ENT-1',
      enterpriseShortName: 'Enterprise', role: null, raw: {}},
    enterprise: {id: 'ENT-1', name: 'Enterprise', code: 'ENT', shortName: 'Enterprise',
      shortCode: 'Enterprise', raw: {}},
  })
  lowcodeApi.application.save({application: {id: executionAppId, name: 'Execution app'}, navigationRootId})
}

afterEach(() => {
  vi.restoreAllMocks()
  lowcodeApi.application.clear()
  lowcodeApi.session.clear()
})

describe('navigation authorization semantic resource', () => {
  it('passes a separate target app/root while fencing the selected execution scope', async () => {
    selectExecutionApplication()
    vi.spyOn(lowcodeApi, 'readAuthenticatedRequestScope').mockReturnValue({token: 'AUTH-ONLY', headers: {}})
    let dataSet: DataSet | undefined
    const fromJson = DataSet.fromJson.bind(DataSet)
    vi.spyOn(DataSet, 'fromJson').mockImplementation((...args) => {
      const created = fromJson(...args)
      dataSet = created
      return created
    })
    const readAuthorization = vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockImplementation(async () => {
      expect(dataSet?.getView('NavigationAuthorization', 'default')?.requestState).toBe(RequestState.Loading)
      return evidence
    })

    await expect(readNavigationAuthorizationDataView({applicationId: targetAppId,
      navigationRootId: targetRootId, assertCurrent: () => undefined})).resolves.toEqual(evidence)

    expect(readAuthorization).toHaveBeenCalledOnce()
    expect(readAuthorization).toHaveBeenCalledWith(targetAppId, targetRootId)
    expect(dataSet?.destroyed).toBe(true)
  })

  it('propagates the official authorization failure and releases the temporary resource', async () => {
    selectExecutionApplication()
    let dataSet: DataSet | undefined
    const fromJson = DataSet.fromJson.bind(DataSet)
    vi.spyOn(DataSet, 'fromJson').mockImplementation((...args) => {
      const created = fromJson(...args)
      dataSet = created
      return created
    })
    const failure = new Error('menu authorization unavailable')
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockRejectedValue(failure)

    await expect(readNavigationAuthorizationDataView({applicationId: targetAppId,
      navigationRootId: targetRootId, assertCurrent: () => undefined})).rejects.toBe(failure)
    expect(dataSet?.destroyed).toBe(true)
  })

  it.each([
    ['nested menu item', '{"items":[{"id":"MENU","target":"vue:/menu","targetKind":"vue","formKey":null,"children":[{"id":7,"target":"","targetKind":"empty","formKey":null,"children":[]}]}],"contexts":[]}'],
    ['relation context', '{"items":[],"contexts":[{"id":"REL","navigationId":"MENU","title":"","childRowId":"CHILD","textParameterName":"","valueParameterName":"","workflowId":"","flowState":"invalid","valueField":"","textField":"","titlePlacement":""}]}'],
  ])('rejects malformed %s in the official authorization response', async (_kind, payload) => {
    selectExecutionApplication()
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockImplementation(async () => JSON.parse(payload))

    await expect(readNavigationAuthorizationDataView({applicationId: targetAppId,
      navigationRootId: targetRootId, assertCurrent: () => undefined})).rejects.toThrow('NAVIGATION_AUTHORIZATION_RESULT_INVALID')
  })

  it('rejects when the execution application changes during the authorization query', async () => {
    selectExecutionApplication()
    let complete: ((value: typeof evidence) => void) | undefined
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockImplementation(() => new Promise(resolve => {complete = resolve}))
    const request = readNavigationAuthorizationDataView({applicationId: targetAppId,
      navigationRootId: targetRootId, assertCurrent: () => undefined})
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
    lowcodeApi.application.save({application: {id: 'OTHER-APP', name: 'Other app'}, navigationRootId: 'OTHER-ROOT'})
    complete?.(evidence)
    await expect(request).rejects.toThrow('NAVIGATION_AUTHORIZATION_SCOPE_STALE')
  })

  it('rejects when the execution navigation root changes during the authorization query', async () => {
    selectExecutionApplication()
    let complete: ((value: typeof evidence) => void) | undefined
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockImplementation(() => new Promise(resolve => {complete = resolve}))
    const request = readNavigationAuthorizationDataView({applicationId: targetAppId,
      navigationRootId: targetRootId, assertCurrent: () => undefined})
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
    lowcodeApi.application.save({application: {id: executionAppId, name: 'Execution app'}, navigationRootId: 'CHANGED-ROOT'})
    complete?.(evidence)
    await expect(request).rejects.toThrow('NAVIGATION_AUTHORIZATION_SCOPE_STALE')
  })
})
