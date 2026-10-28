import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it, vi } from 'vitest'

import { LowcodeApi } from '../lowcode-api.js'
import { LowcodeApiError } from '../core/lowcode-api-error.js'
import type { LowcodeApplicationSelectionReceipt } from '../index.js'
import type { LowcodeApplication } from '../index.js'

class FixtureHttpClient extends HttpClientBase {
  public requestConfig: RequestConfig | null = null
  public readonly requestConfigs: RequestConfig[] = []
  private fixtureIndex = 0

  public constructor(private readonly fixture: unknown) {
    super()
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    this.requestConfigs.push(config)
    return {
      data: Array.isArray(this.fixture) ? this.fixture[this.fixtureIndex++] : this.fixture,
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

class PendingFixtureHttpClient extends FixtureHttpClient {
  public readonly requestStarted = deferred<void>()
  public readonly response = deferred<HttpResponse<unknown>>()

  protected override executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    this.requestConfigs.push(config)
    this.requestStarted.resolve()
    return this.response.promise
  }
}

class FixtureStorage {
  private readonly values = new Map<string, string>()

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  public removeItem(key: string): void {
    this.values.delete(key)
  }
}

function selectFixtureApplication(api: LowcodeApi): void {
  api.application.save({ application: { id: 'APP-1', code: 'APP-CODE', name: 'fixture', description: '',
    enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }, navigationRootId: 'ROOT-1' })
}

type TestApplicationReader = (applicationId: string, assertCurrent: () => void) => Promise<LowcodeApplication>
type TestNavigationRootReader = (systemId: string, assertCurrent: () => void) => Promise<string>
type TestLowcodeApi = LowcodeApi & {
  applicationDirectoryReader: ReturnType<typeof vi.fn<TestApplicationReader>>
  navigationRootReader: ReturnType<typeof vi.fn<TestNavigationRootReader>>
}

function authenticatedFileApi(http: FixtureHttpClient): TestLowcodeApi {
  const apiReference: {value?: LowcodeApi} = {}
  const reader = vi.fn<TestApplicationReader>(async (applicationId, assertCurrent) => {
    assertCurrent()
    const current = apiReference.value?.application.get()
    if (current === null) throw new Error('application fixture missing')
    return {...current.application, id: applicationId}
  })
  const rootReader = vi.fn<TestNavigationRootReader>(async (systemId, assertCurrent) => {
    assertCurrent()
    return `ROOT-${systemId}`
  })
  const api = new LowcodeApi({http, sessionStorage: new FixtureStorage(), readApplicationById: reader,
    readNavigationRootId: rootReader})
  apiReference.value = api
  api.session.save({ accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: { userId: 'U1', account: 'fixture', displayName: 'fixture', enterpriseId: 'E1',
      enterpriseShortName: 'Lingma', role: null, raw: {} },
    enterprise: { id: 'E1', name: 'fixture', code: 'fixture', shortName: 'Lingma', shortCode: 'fixture', raw: {} },
  })
  selectFixtureApplication(api)
  return Object.assign(api, {applicationDirectoryReader: reader, navigationRootReader: rootReader}) as TestLowcodeApi
}

function authenticatedReaderApi(
  http: FixtureHttpClient,
  readApplicationById: TestApplicationReader,
): TestLowcodeApi {
  const rootReader = vi.fn<TestNavigationRootReader>(async (systemId, assertCurrent) => {
    assertCurrent()
    return `ROOT-${systemId}`
  })
  const options = {http, sessionStorage: new FixtureStorage(), readApplicationById,
    readNavigationRootId: rootReader}
  const api = new LowcodeApi(options as ConstructorParameters<typeof LowcodeApi>[0])
  api.session.save({accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: {userId: 'U1', account: 'fixture', displayName: 'fixture', enterpriseId: 'E1',
      enterpriseShortName: 'Lingma', role: null, raw: {}},
    enterprise: {id: 'E1', name: 'fixture', code: 'fixture', shortName: 'Lingma', shortCode: 'fixture', raw: {}},
  })
  selectFixtureApplication(api)
  return Object.assign(api, {applicationDirectoryReader: readApplicationById, navigationRootReader: rootReader}) as TestLowcodeApi
}

function deferred<T>(): Readonly<{
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}> {
  let resolvePromise: (value: T) => void = () => undefined
  let rejectPromise: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

describe('LowcodePlatformApi', () => {
  it('uses the host-injected navigation-root DataView reader during object selection', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: {Items: [{rowid: 'LEGACY-ROOT'}]}})
    const readNavigationRootId = vi.fn(async (systemId: string, assertCurrent: () => void) => {
      assertCurrent()
      return `ROOT-${systemId}`
    })
    const api = new LowcodeApi({http, sessionStorage: new FixtureStorage(),
      readNavigationRootId} as unknown as ConstructorParameters<typeof LowcodeApi>[0])
    api.session.save({accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'U1', account: 'fixture', displayName: 'fixture', enterpriseId: 'E1',
        enterpriseShortName: 'Lingma', role: null, raw: {}},
      enterprise: {id: 'E1', name: 'fixture', code: 'fixture', shortName: 'Lingma', shortCode: 'fixture', raw: {}},
    })

    await expect(api.platform.selectApplication({id: 'APP-B', name: 'Beta'})).resolves.toBe('ROOT-APP-B')

    expect(readNavigationRootId).toHaveBeenCalledOnce()
    expect(readNavigationRootId).toHaveBeenCalledWith('APP-B', expect.any(Function))
    expect(http.requestConfigs).toHaveLength(0)
  })

  it.each([undefined, null, 0, {}, '', '   '])('rejects an invalid injected root id %s without replacing the selected application', async rootId => {
    const http = new FixtureHttpClient({Code: 200, Result: {Items: [{rowid: 'LEGACY-ROOT'}]}})
    const readNavigationRootId = vi.fn(async () => rootId as unknown as string)
    const options = {http, sessionStorage: new FixtureStorage(), readNavigationRootId} as unknown as ConstructorParameters<typeof LowcodeApi>[0]
    const api = new LowcodeApi(options)
    api.session.save({accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'U1', account: 'fixture', displayName: 'fixture', enterpriseId: 'E1',
        enterpriseShortName: 'Lingma', role: null, raw: {}},
      enterprise: {id: 'E1', name: 'fixture', code: 'fixture', shortName: 'Lingma', shortCode: 'fixture', raw: {}},
    })
    api.application.save({application: {id: 'APP-A', name: 'Alpha'}, navigationRootId: 'ROOT-A'})

    await expect(api.platform.selectApplication({id: 'APP-B', name: 'Beta'})).rejects.toThrow(/导航根.*(无效|有效字符串)/i)

    expect(api.application.get()).toMatchObject({application: {id: 'APP-A'}, navigationRootId: 'ROOT-A'})
    expect(http.requestConfigs).toHaveLength(0)
  })

  it('trims a valid host-injected root row id without confusing it with the application id', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: {Items: [{rowid: 'LEGACY-ROOT'}]}})
    const readNavigationRootId = vi.fn(async (_systemId: string, assertCurrent: () => void) => {
      assertCurrent()
      return '  ROOT-B  '
    })
    const options = {http, sessionStorage: new FixtureStorage(), readNavigationRootId} as unknown as ConstructorParameters<typeof LowcodeApi>[0]
    const api = new LowcodeApi(options)
    api.session.save({accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'U1', account: 'fixture', displayName: 'fixture', enterpriseId: 'E1',
        enterpriseShortName: 'Lingma', role: null, raw: {}},
      enterprise: {id: 'E1', name: 'fixture', code: 'E1', shortName: 'Lingma', shortCode: 'fixture', raw: {}},
    })

    await expect(api.platform.selectApplication({id: 'APP-B', name: 'Beta'})).resolves.toBe('ROOT-B')

    expect(api.application.get()).toMatchObject({application: {id: 'APP-B'}, navigationRootId: 'ROOT-B'})
    expect(api.application.get()?.navigationRootId).not.toBe('APP-B')
    expect(http.requestConfigs).toHaveLength(0)
  })

  it.each(['selectApplication', 'activateApplication'] as const)(
    '%s fails explicitly without a root DataView reader and never falls back to HTTP', async entry => {
      const http = new FixtureHttpClient({Code: 200, Result: {Items: [{rowid: 'LEGACY-ROOT'}]}})
      const readApplicationById = vi.fn(async (id: string) => ({id, name: id}))
      const options = {http, sessionStorage: new FixtureStorage(), readApplicationById} as unknown as ConstructorParameters<typeof LowcodeApi>[0]
      const api = new LowcodeApi(options)
      api.session.save({accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
        accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
        identity: {userId: 'U1', account: 'fixture', displayName: 'fixture', enterpriseId: 'E1',
          enterpriseShortName: 'Lingma', role: null, raw: {}},
        enterprise: {id: 'E1', name: 'fixture', code: 'fixture', shortName: 'Lingma', shortCode: 'fixture', raw: {}},
      })
      const selection = entry === 'selectApplication'
        ? api.platform.selectApplication({id: 'APP-B', name: 'Beta'})
        : api.platform.activateApplication('APP-B')

      await expect(selection).rejects.toThrow(/导航根.*DataView|DataView.*导航根/i)
      expect(http.requestConfigs).toHaveLength(0)
      expect(api.application.get()).toBeNull()
    },
  )

  it('fails closed when application activation has no DataView directory reader', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: {Items: [
      {rowid: 'APP-B', AppName: 'beta', AppDesc: 'Beta'},
    ]}})
    const api = new LowcodeApi({http, sessionStorage: new FixtureStorage()})
    api.session.save({accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'U1', account: 'fixture', displayName: 'fixture', enterpriseId: 'E1',
        enterpriseShortName: 'Lingma', role: null, raw: {}},
      enterprise: {id: 'E1', name: 'fixture', code: 'fixture', shortName: 'Lingma', shortCode: 'fixture', raw: {}},
    })

    await expect(api.platform.activateApplication('APP-B')).rejects.toThrow('应用选择未配置正式 DataView 目录读取器')

    expect(http.requestConfigs).toEqual([])
    expect(api.application.get()).toBeNull()
  })

  it('uses the injected by-id directory reader inside the activation selection fence', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: {Items: [
      {rowid: 'APP-B', AppName: 'beta', AppDesc: 'Legacy HTTP result'},
    ]}})
    const reader = vi.fn(async (id: string, assertCurrent: () => void) => {
      assertCurrent()
      return {id, name: 'Beta'}
    })
    const rootReader = vi.fn<TestNavigationRootReader>(async () => 'ROOT-B')
    const options = {http, sessionStorage: new FixtureStorage(), readApplicationById: reader,
      readNavigationRootId: rootReader}
    const api = new LowcodeApi(options as ConstructorParameters<typeof LowcodeApi>[0])
    api.session.save({accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'U1', account: 'fixture', displayName: 'fixture', enterpriseId: 'E1',
        enterpriseShortName: 'Lingma', role: null, raw: {}},
      enterprise: {id: 'E1', name: 'fixture', code: 'fixture', shortName: 'Lingma', shortCode: 'fixture', raw: {}},
    })
    const root = rootReader

    const receipt = await api.platform.activateApplication(' APP-B ')

    expect(reader).toHaveBeenCalledOnce()
    expect(reader.mock.calls[0]?.[0]).toBe('APP-B')
    expect(reader.mock.calls[0]?.[1]).toEqual(expect.any(Function))
    expect(root).toHaveBeenCalledWith('APP-B', expect.any(Function))
    expect(receipt.application).toEqual({id: 'APP-B', name: 'Beta'})
    expect(api.application.get()?.application).toEqual({id: 'APP-B', name: 'Beta'})
    expect(http.requestConfigs).toEqual([])
  })

  it('rejects a DataView directory reader result whose id differs from the requested id', async () => {
    const http = new FixtureHttpClient({Code: 200, Result: {Items: [
      {rowid: 'APP-B', AppName: 'beta', AppDesc: 'Legacy HTTP result'},
    ]}})
    const reader = async () => ({id: 'APP-C', name: 'Gamma'})
    const rootReader = vi.fn<TestNavigationRootReader>(async () => 'ROOT-B')
    const options = {http, sessionStorage: new FixtureStorage(), readApplicationById: reader,
      readNavigationRootId: rootReader}
    const api = new LowcodeApi(options as ConstructorParameters<typeof LowcodeApi>[0])
    api.session.save({accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
      accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
      identity: {userId: 'U1', account: 'fixture', displayName: 'fixture', enterpriseId: 'E1',
        enterpriseShortName: 'Lingma', role: null, raw: {}},
      enterprise: {id: 'E1', name: 'fixture', code: 'fixture', shortName: 'Lingma', shortCode: 'fixture', raw: {}},
    })
    const root = rootReader

    await expect(api.platform.activateApplication('APP-B')).rejects.toThrow('应用目录读取器返回的应用 ID 与请求不匹配：APP-B')

    expect(root).not.toHaveBeenCalled()
    expect(api.application.get()).toBeNull()
    expect(http.requestConfigs).toEqual([])
  })

  it('does not resolve a navigation root when a pending directory reader is superseded', async () => {
    const pending = deferred<{id: string; name: string}>()
    const reader = vi.fn(async (id: string, assertCurrent: () => void) => {
      assertCurrent()
      const application = id === 'APP-B' ? await pending.promise : {id, name: 'Gamma'}
      assertCurrent()
      return application
    })
    const api = authenticatedReaderApi(new FixtureHttpClient({Code: 200, Result: {Items: [
      {rowid: 'APP-B', AppName: 'beta', AppDesc: 'Beta'},
      {rowid: 'APP-C', AppName: 'gamma', AppDesc: 'Gamma'},
    ]}}), reader)
    const root = api.navigationRootReader.mockResolvedValue('ROOT-C')

    const older = api.platform.activateApplication('APP-B')
    await Promise.resolve()
    if (reader.mock.calls.length === 0) {
      await older
      expect(reader).toHaveBeenCalledWith('APP-B', expect.any(Function))
      return
    }
    const newer = api.platform.activateApplication('APP-C')
    await expect(newer).resolves.toMatchObject({application: {id: 'APP-C', name: 'Gamma'}, navigationRootId: 'ROOT-C'})
    pending.resolve({id: 'APP-B', name: 'Beta'})

    await expect(older).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    expect(root).toHaveBeenCalledTimes(1)
    expect(root).toHaveBeenCalledWith('APP-C', expect.any(Function))
    expect(api.application.get()?.application.id).toBe('APP-C')
  })

  it('does not commit a directory reader result after cancellation during its wait', async () => {
    const pending = deferred<{id: string; name: string}>()
    const reader = vi.fn(async (id: string, assertCurrent: () => void) => {
      assertCurrent()
      const application = await pending.promise
      assertCurrent()
      return application
    })
    const api = authenticatedReaderApi(new FixtureHttpClient({Code: 200, Result: {Items: [
      {rowid: 'APP-B', AppName: 'beta', AppDesc: 'Beta'},
    ]}}), reader)
    const root = api.navigationRootReader
    const previous = api.application.get()

    const selecting = api.platform.activateApplication('APP-B')
    await Promise.resolve()
    api.platform.cancelPendingApplicationSelection()
    pending.resolve({id: 'APP-B', name: 'Beta'})

    await expect(selecting).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    expect(reader).toHaveBeenCalledWith('APP-B', expect.any(Function))
    expect(root).not.toHaveBeenCalled()
    expect(api.application.get()).toEqual(previous)
  })

  it.each(['late-success', 'late-failure'] as const)('does not let an older selectApplication %s overwrite a newer choice', async (result) => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const rootA = deferred<string>()
    const rootB = deferred<string>()
    api.navigationRootReader.mockImplementation((id) => (
      id === 'APP-A' ? rootA.promise : rootB.promise
    ))
    const current = api.application.get()
    if (current === null) throw new Error('application fixture missing')
    const appA = { ...current.application, id: 'APP-A' }
    const appB = { ...current.application, id: 'APP-B' }

    const selectingA = api.platform.selectApplication(appA)
    const selectingB = api.platform.selectApplication(appB)
    rootB.resolve('ROOT-B')
    await expect(selectingB).resolves.toBe('ROOT-B')
    if (result === 'late-success') rootA.resolve('ROOT-A')
    else rootA.reject(new Error('old root failed'))
    await expect(selectingA).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    expect(api.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
  })

  it.each(['select-then-activate', 'activate-then-select'] as const)(
    'invalidates mixed application selection entries for %s', async (order) => {
      const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
      const current = api.application.get()
      if (current === null) throw new Error('application fixture missing')
      const appA = { ...current.application, id: 'APP-A' }
      const appB = { ...current.application, id: 'APP-B' }
      const rootA = deferred<string>()
      const rootB = deferred<string>()
      api.applicationDirectoryReader.mockResolvedValue(appB)
      api.navigationRootReader.mockImplementation((id) => (
        id === 'APP-A' ? rootA.promise : rootB.promise
      ))

      const first = order === 'select-then-activate'
        ? api.platform.selectApplication(appA)
        : api.platform.activateApplication('APP-A')
      const second = order === 'select-then-activate'
        ? api.platform.activateApplication('APP-B')
        : api.platform.selectApplication(appB)
      await vi.waitFor(() => expect(api.navigationRootReader).toHaveBeenCalledWith('APP-B', expect.any(Function)))
      rootB.resolve('ROOT-B')
      if (order === 'select-then-activate') {
        await expect(second).resolves.toMatchObject({ navigationRootId: 'ROOT-B' })
      } else await expect(second).resolves.toBe('ROOT-B')
      rootA.resolve('ROOT-A')
      await expect(first).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
      expect(api.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
    },
  )

  it('activates one trimmed catalog id, commits its root, and returns a current receipt', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const current = api.application.get()
    if (current === null) throw new Error('application fixture missing')
    const appB = { ...current.application, id: 'APP-B' }
    const list = api.applicationDirectoryReader
    list.mockResolvedValue(appB)
    const root = api.navigationRootReader.mockResolvedValue('ROOT-B')

    const receipt = await api.platform.activateApplication(' APP-B ')

    expect(list).toHaveBeenCalledOnce()
    expect(root).toHaveBeenCalledWith('APP-B', expect.any(Function))
    expect(receipt).toMatchObject({ application: appB, navigationRootId: 'ROOT-B' })
    expect(api.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
    expect(() => receipt.assertCurrent()).not.toThrow()
  })

  it.each(['directory-reader', 'navigation-root'] as const)(
    'cancels an uncommitted activation during %s without changing the selected application', async (stage) => {
      const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
      const previous = api.application.get()
      if (previous === null) throw new Error('application fixture missing')
      const appB = { id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
        enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }
      const applications = deferred<LowcodeApplication>()
      const root = deferred<string>()
      const list = api.applicationDirectoryReader
      list.mockReturnValue(
        stage === 'directory-reader' ? applications.promise : Promise.resolve(appB),
      )
      const resolveRoot = api.navigationRootReader.mockReturnValue(root.promise)

      const activation = api.platform.activateApplication('APP-B')
      if (stage === 'directory-reader') {
        await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())
      } else {
        await vi.waitFor(() => expect(resolveRoot).toHaveBeenCalledWith('APP-B', expect.any(Function)))
      }
      api.platform.cancelPendingApplicationSelection()
      if (stage === 'directory-reader') applications.resolve(appB)
      else root.resolve('ROOT-B')

      await expect(activation).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
      expect(api.application.get()).toEqual(previous)
      expect(resolveRoot).toHaveBeenCalledTimes(stage === 'directory-reader' ? 0 : 1)
    },
  )

  it('does not invalidate a committed receipt when there is no pending selection', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const appB = { id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }
    api.applicationDirectoryReader.mockResolvedValue(appB)
    api.navigationRootReader.mockResolvedValue('ROOT-B')
    const receipt = await api.platform.activateApplication('APP-B')

    api.platform.cancelPendingApplicationSelection()

    expect(() => receipt.assertCurrent()).not.toThrow()
    expect(api.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
  })

  it('keeps a receipt valid when route cancellation runs between commit and public return', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const appB = { id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }
    api.applicationDirectoryReader.mockResolvedValue(appB)
    api.navigationRootReader.mockResolvedValue('ROOT-B')
    const originalSave = api.application.save.bind(api.application)
    const save = vi.spyOn(api.application, 'save').mockImplementation((selection) => {
      originalSave(selection)
      queueMicrotask(() => api.platform.cancelPendingApplicationSelection())
    })

    const activation = await api.platform.activateApplication('APP-B')

    expect(save).toHaveBeenCalledOnce()
    expect(() => activation.assertCurrent()).not.toThrow()
    expect(api.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
  })

  it('does not let a failed older selection cleanup remove the newer pending owner', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const current = api.application.get()
    if (current === null) throw new Error('application fixture missing')
    const appA = { ...current.application, id: 'APP-A' }
    const appB = { ...current.application, id: 'APP-B' }
    const rootA = deferred<string>()
    const applicationsB = deferred<LowcodeApplication>()
    api.navigationRootReader.mockReturnValue(rootA.promise)
    const list = api.applicationDirectoryReader
    list.mockReturnValue(applicationsB.promise)

    const older = api.platform.selectApplication(appA)
    await vi.waitFor(() => expect(api.navigationRootReader).toHaveBeenCalledWith('APP-A', expect.any(Function)))
    api.platform.cancelPendingApplicationSelection()
    const newer = api.platform.activateApplication('APP-B')
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())
    rootA.reject(new Error('older selection root failed'))
    await expect(older).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')

    api.platform.cancelPendingApplicationSelection()
    applicationsB.resolve(appB)
    await expect(newer).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    expect(api.application.get()).toEqual(current)
  })

  it('does not resolve a navigation root after activation is aborted during application lookup', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const previous = api.application.get()
    if (previous === null) throw new Error('application fixture missing')
    const applications = deferred<LowcodeApplication>()
    const list = api.applicationDirectoryReader
    list.mockReturnValue(applications.promise)
    const root = api.navigationRootReader.mockResolvedValue('ROOT-B')
    const controller = new AbortController()
    const reason = new Error('navigation intent superseded')
    const activation = api.platform.activateApplication('APP-B', controller.signal)
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())

    controller.abort(reason)
    applications.resolve({ id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false })

    await expect(activation).rejects.toBe(reason)
    expect(root).not.toHaveBeenCalled()
    expect(api.application.get()).toEqual(previous)
  })

  it('does not commit an application after activation is aborted during root lookup', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const previous = api.application.get()
    if (previous === null) throw new Error('application fixture missing')
    const appB = { id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }
    const list = api.applicationDirectoryReader.mockResolvedValue(appB)
    const root = deferred<string>()
    const resolveRoot = api.navigationRootReader.mockReturnValue(root.promise)
    const controller = new AbortController()
    const reason = new Error('navigation intent superseded')
    const activation = api.platform.activateApplication('APP-B', controller.signal)
    await vi.waitFor(() => expect(resolveRoot).toHaveBeenCalledWith('APP-B', expect.any(Function)))

    controller.abort(reason)
    root.resolve('ROOT-B')

    await expect(activation).rejects.toBe(reason)
    expect(list).toHaveBeenCalledOnce()
    expect(api.application.get()).toEqual(previous)
  })

  it('does not let an already-aborted activation revoke the prior valid receipt', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const appB = { id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }
    const list = api.applicationDirectoryReader.mockResolvedValue(appB)
    api.navigationRootReader.mockResolvedValue('ROOT-B')
    const priorReceipt = await api.platform.activateApplication('APP-B')
    const controller = new AbortController()
    const reason = new Error('navigation intent already superseded')
    controller.abort(reason)

    await expect(api.platform.activateApplication('APP-B', controller.signal)).rejects.toBe(reason)

    expect(list).toHaveBeenCalledOnce()
    expect(() => priorReceipt.assertCurrent()).not.toThrow()
    expect(api.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
  })

  it('invalidates an activation receipt on abort without rolling back its committed application', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const appB = { id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }
    api.applicationDirectoryReader.mockResolvedValue(appB)
    api.navigationRootReader.mockResolvedValue('ROOT-B')
    const controller = new AbortController()
    const reason = new Error('navigation intent superseded after commit')
    const receipt = await api.platform.activateApplication('APP-B', controller.signal)
    controller.abort(reason)

    expect(() => receipt.assertCurrent()).toThrow(reason)
    expect(api.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
  })

  it('exposes the selection receipt type through the package index for catalog and activation consumers', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const assertCurrentReceipt = (receipt: LowcodeApplicationSelectionReceipt): void => receipt.assertCurrent()
    const catalogReceipt = api.platform.enterApplicationCatalog()
    assertCurrentReceipt(catalogReceipt)
    expect(api.application.get()).toBeNull()

    const appB = { id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }
    api.applicationDirectoryReader.mockResolvedValue(appB)
    api.navigationRootReader.mockResolvedValue('ROOT-B')
    const activationReceipt = await api.platform.activateApplication('APP-B')
    assertCurrentReceipt(activationReceipt)
    expect(() => catalogReceipt.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
  })

  it('revokes catalog receipts when a later application intent begins before its first await resolves', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const catalogReceipt = api.platform.enterApplicationCatalog()
    const applications = deferred<LowcodeApplication>()
    api.applicationDirectoryReader.mockReturnValue(applications.promise)
    const activation = api.platform.activateApplication('APP-B')

    expect(() => catalogReceipt.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    applications.resolve({ id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false })
    api.navigationRootReader.mockResolvedValue('ROOT-B')
    await expect(activation).resolves.toMatchObject({ application: { id: 'APP-B' }, navigationRootId: 'ROOT-B' })
  })

  it('invalidates an in-flight activation when the catalog intent starts', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const applications = deferred<LowcodeApplication>()
    api.applicationDirectoryReader.mockReturnValue(applications.promise)
    const activation = api.platform.activateApplication('APP-B')
    const catalogReceipt = api.platform.enterApplicationCatalog()

    applications.resolve({ id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false })

    await expect(activation).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    expect(api.application.get()).toBeNull()
    expect(() => catalogReceipt.assertCurrent()).not.toThrow()
  })

  it('invalidates catalog receipts on replacement, explicit clear, and an application commit while allowing token refresh', () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const session = api.session.get()
    if (session === null) throw new Error('session fixture missing')
    const receipt = api.platform.enterApplicationCatalog()
    api.session.save({ ...session, accessToken: 'refreshed-access' })
    expect(() => receipt.assertCurrent()).not.toThrow()
    const newerCatalog = api.platform.enterApplicationCatalog()
    expect(() => receipt.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    expect(() => newerCatalog.assertCurrent()).not.toThrow()
    api.application.clear()
    expect(() => newerCatalog.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')

    const next = api.platform.enterApplicationCatalog()
    const replacement = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null })).session.get()
    if (replacement === null) throw new Error('replacement session fixture missing')
    api.session.save(replacement)
    expect(() => next.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')

    api.session.save(session)
    const clearedSession = api.platform.enterApplicationCatalog()
    api.session.clear()
    expect(() => clearedSession.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    api.session.save(session)
    const finalReceipt = api.platform.enterApplicationCatalog()
    api.application.save({ application: { id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }, navigationRootId: 'ROOT-B' })
    expect(() => finalReceipt.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
  })

  it('invalidates an activation receipt on clear, replacement, and a same-app root change while allowing token refresh', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const current = api.application.get()
    if (current === null) throw new Error('application fixture missing')
    const appB = { ...current.application, id: 'APP-B' }
    api.applicationDirectoryReader.mockResolvedValue(appB)
    api.navigationRootReader.mockResolvedValue('ROOT-B')
    const first = await api.platform.activateApplication('APP-B')
    const session = api.session.get()
    if (session === null) throw new Error('session fixture missing')
    api.session.save({ ...session, accessToken: 'refreshed-access' })
    expect(() => first.assertCurrent()).not.toThrow()

    api.application.save({ application: appB, navigationRootId: 'ROOT-CHANGED' })
    expect(() => first.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    const second = await api.platform.activateApplication('APP-B')
    api.session.clear()
    expect(() => second.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    const replacementSession = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null })).session.get()
    if (replacementSession === null) throw new Error('replacement session fixture missing')
    api.session.save(replacementSession)
    expect(() => second.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')

    const third = await api.platform.activateApplication('APP-B')
    api.application.clear()
    expect(() => third.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
  })

  it('preserves a stable root error and the previously selected application', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const current = api.application.get()
    if (current === null) throw new Error('application fixture missing')
    const appB = { ...current.application, id: 'APP-B' }
    api.applicationDirectoryReader.mockResolvedValue(appB)
    const rootError = new Error('root unavailable')
    api.navigationRootReader.mockRejectedValue(rootError)

    await expect(api.platform.activateApplication('APP-B')).rejects.toBe(rootError)
    expect(api.application.get()?.application.id).toBe('APP-1')
  })

  it.each(['stable-error', 'superseded-error'] as const)(
    'preserves current directory errors and rejects stale directory errors (%s)', async (mode) => {
      const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
      const result = deferred<LowcodeApplication>()
      const reader = api.applicationDirectoryReader
      const readerError = new Error('catalog unavailable')
      reader.mockReturnValue(result.promise)
      const activation = api.platform.activateApplication('APP-B')
      if (mode === 'superseded-error') {
        const current = api.application.get()
        if (current === null) throw new Error('application fixture missing')
        api.navigationRootReader.mockResolvedValue('ROOT-C')
        const newer = api.platform.selectApplication({ ...current.application, id: 'APP-C' })
        await expect(newer).resolves.toBe('ROOT-C')
      }
      result.reject(readerError)
      if (mode === 'stable-error') await expect(activation).rejects.toBe(readerError)
      else await expect(activation).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
      expect(api.application.get()?.application.id).toBe(mode === 'stable-error' ? 'APP-1' : 'APP-C')
    },
  )

  it('fails explicitly for an inaccessible application without clearing the current choice', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    api.applicationDirectoryReader.mockRejectedValue(new Error('lowcode 应用不存在或无权访问：APP-MISSING'))
    const root = api.navigationRootReader

    await expect(api.platform.activateApplication('APP-MISSING')).rejects.toThrow('lowcode 应用不存在或无权访问：APP-MISSING')
    expect(api.application.get()?.application.id).toBe('APP-1')
    expect(root).not.toHaveBeenCalled()
  })

  it('requires a live lowcode session for both application selection entries', async () => {
    const rootReader = vi.fn<TestNavigationRootReader>(async () => 'ROOT-B')
    const api = new LowcodeApi({ http: new FixtureHttpClient({ Code: 200, Result: null }),
      readNavigationRootId: rootReader })
    const application = { id: 'APP-B', code: 'APP-B', name: 'APP-B', description: '',
      enterpriseId: 'E1', enterpriseShortName: 'Lingma', isDefault: false }
    const root = rootReader

    await expect(api.platform.selectApplication(application)).rejects.toThrow('应用选择需要有效的 lowcode 会话')
    await expect(api.platform.activateApplication('APP-B')).rejects.toThrow('应用选择需要有效的 lowcode 会话')
    expect(root).not.toHaveBeenCalled()
  })

  it('copies a selectApplication input before waiting for its navigation root', async () => {
    const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const current = api.application.get()
    if (current === null) throw new Error('application fixture missing')
    const input = { ...current.application, id: 'APP-B' }
    const root = deferred<string>()
    api.navigationRootReader.mockReturnValue(root.promise)

    const selecting = api.platform.selectApplication(input)
    input.id = 'APP-C'
    root.resolve('ROOT-B')

    await expect(selecting).resolves.toBe('ROOT-B')
    expect(api.application.get()).toEqual({ application: { ...current.application, id: 'APP-B' }, navigationRootId: 'ROOT-B' })
  })

  it.each(['selectApplication', 'activateApplication'] as const)(
    'rechecks %s after its awaited commit before returning', async (entry) => {
      const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
      const current = api.application.get()
      if (current === null) throw new Error('application fixture missing')
      const appB = { ...current.application, id: 'APP-B' }
      const root = deferred<string>()
      api.applicationDirectoryReader.mockResolvedValue(appB)
      api.navigationRootReader.mockReturnValue(root.promise)

      const selection = entry === 'selectApplication'
        ? api.platform.selectApplication(appB)
        : api.platform.activateApplication('APP-B')
      await vi.waitFor(() => expect(api.navigationRootReader).toHaveBeenCalledWith('APP-B', expect.any(Function)))
      root.resolve('ROOT-B')
      queueMicrotask(() => {
        api.application.save({ application: { ...current.application, id: 'APP-C' }, navigationRootId: 'ROOT-C' })
      })

      await expect(selection).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
      expect(api.application.get()?.application.id).toBe('APP-C')
    },
  )

  it.each(['selectApplication', 'activateApplication'] as const)(
    'rechecks %s failures after its awaited commit before returning', async (entry) => {
      const api = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
      const current = api.application.get()
      if (current === null) throw new Error('application fixture missing')
      const appB = { ...current.application, id: 'APP-B' }
      const root = deferred<string>()
      const rootError = new Error('root unavailable')
      api.applicationDirectoryReader.mockResolvedValue(appB)
      api.navigationRootReader.mockImplementation((id) => (
        id === 'APP-C' ? Promise.resolve('ROOT-C') : root.promise
      ))

      const selection = entry === 'selectApplication'
        ? api.platform.selectApplication(appB)
        : api.platform.activateApplication('APP-B')
      await vi.waitFor(() => expect(api.navigationRootReader).toHaveBeenCalledWith('APP-B', expect.any(Function)))
      root.reject(rootError)
      queueMicrotask(() => { void api.platform.selectApplication({ ...appB, id: 'APP-C' }) })

      await expect(selection).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    },
  )

  it('invalidates an activation receipt as soon as login or logout begins', async () => {
    const loginApi = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: {
      token: 'login-access', refreshToken: 'login-refresh', expire: Date.now() + 60_000,
      refreshExpire: Date.now() + 120_000,
      userinfo: { ROWID: 'U2', LoginName: 'next', EntId: 'E2', EntShortName: 'Next' },
      entinfo: { rowid: 'E2', ShortName: 'Next' },
    } }))
    const loginContext = loginApi.application.get()
    if (loginContext === null) throw new Error('application fixture missing')
    const loginApp = { ...loginContext.application, id: 'APP-B' }
    loginApi.applicationDirectoryReader.mockResolvedValue(loginApp)
    loginApi.navigationRootReader.mockResolvedValue('ROOT-B')
    const loginReceipt = await loginApi.platform.activateApplication('APP-B')
    const login = loginApi.platform.login({ enterpriseName: 'Next', account: 'next', password: 'secret' })
    expect(() => loginReceipt.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    await login

    const logoutApi = authenticatedFileApi(new FixtureHttpClient({ Code: 200, Result: null }))
    const logoutContext = logoutApi.application.get()
    if (logoutContext === null) throw new Error('application fixture missing')
    const logoutApp = { ...logoutContext.application, id: 'APP-B' }
    logoutApi.applicationDirectoryReader.mockResolvedValue(logoutApp)
    logoutApi.navigationRootReader.mockResolvedValue('ROOT-B')
    const logoutReceipt = await logoutApi.platform.activateApplication('APP-B')
    const logout = logoutApi.platform.logout()
    expect(() => logoutReceipt.assertCurrent()).toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    await logout
  })

  it.each(['login', 'logout'] as const)(
    'does not commit a pending root after %s begins but before its network response', async (operation) => {
      const http = new PendingFixtureHttpClient({ Code: 200, Result: null })
      const api = authenticatedFileApi(http)
      const current = api.application.get()
      if (current === null) throw new Error('application fixture missing')
      const root = deferred<string>()
      api.navigationRootReader.mockReturnValue(root.promise)
      const selection = api.platform.selectApplication({ ...current.application, id: 'APP-B' })
      await vi.waitFor(() => expect(api.navigationRootReader).toHaveBeenCalledWith('APP-B', expect.any(Function)))

      const transition = operation === 'login'
        ? api.platform.login({ enterpriseName: 'Next', account: 'next', password: 'secret' })
        : api.platform.logout()
      await http.requestStarted.promise
      root.resolve('ROOT-B')

      await expect(selection).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
      expect(api.application.get()?.application.id).toBe('APP-1')
      http.response.resolve({
        data: operation === 'login' ? { Code: 200, Result: {
          token: 'login-access', refreshToken: 'login-refresh', expire: Date.now() + 60_000,
          refreshExpire: Date.now() + 120_000,
          userinfo: { ROWID: 'U2', LoginName: 'next', EntId: 'E2', EntShortName: 'Next' },
          entinfo: { rowid: 'E2', ShortName: 'Next' },
        } } : { Code: 200, Result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
      })
      await transition
    },
  )

  it('maps semantic login credentials and normalizes the login session', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: {
        token: 'access-token',
        refreshToken: 'refresh-token',
        expire: 1_800_000,
        refreshExpire: 3_600_000,
        userinfo: {
          ROWID: 'U1',
          LoginName: 'admin',
          UserName: '管理员',
          EntId: 'E1',
          EntShortName: 'Lingma',
          role: 'ADMIN',
        },
        entinfo: {
          rowid: 'E1',
          Name: 'Lingma Enterprise',
          CName: '领码科技',
          ShortName: 'Lingma',
          ShortCName: '领码',
        },
      },
    })

    const storage = new FixtureStorage()
    const api = new LowcodeApi({ http, sessionStorage: storage })
    const session = await api.platform.login({
      enterpriseName: 'Lingma',
      account: 'admin',
      password: 'secret',
    })

    expect(http.requestConfig).toMatchObject({
      url: '/api/LoginAuthority/UserLoginByEnt',
      method: 'POST',
      data: { strUser: 'admin', strPwd: 'secret', entName: 'Lingma' },
    })
    expect(session).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: 1_800_000,
      refreshExpiresAt: 3_600_000,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: 'E1',
        enterpriseShortName: 'Lingma',
        role: 'ADMIN',
      },
      enterprise: {
        id: 'E1',
        name: 'Lingma Enterprise',
        code: '领码科技',
        shortName: 'Lingma',
        shortCode: '领码',
      },
    })
    expect(api.session.get()).toEqual(session)
    expect(storage.getItem('spark_lowcode_session')).not.toBeNull()
  })

  it('lists public enterprises by display name while preserving the login ShortName', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: {
        data: {
          Items: [
            { rowid: 'E1', ShortCName: '领码科技', ShortName: 'NewApp' },
          ],
        },
      },
    })

    const enterprises = await new LowcodeApi({ http }).platform.listEnterprises()

    expect(http.requestConfig).toMatchObject({
      url: '/api/DataOperation/GetBaseData',
      method: 'POST',
      meta: { lowcodeSkipAuth: true },
    })
    expect(http.requestConfig?.data).toMatchObject({
      Table: [expect.objectContaining({ Name: 'Base_Enterprise_Info', DbName: 'QYVirtualPlat' })],
    })
    expect(enterprises).toEqual([{
      id: 'E1',
      name: '领码科技',
      shortName: 'NewApp',
      shortCode: '领码科技',
    }])
  })

  it('reads a password-free projection from the authenticated enterprise snapshot', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: null })
    const api = new LowcodeApi({ http })
    const enterpriseSnapshot = {
        rowid: 'E1',
        Name: 'Lingma Technology',
        CName: '领码科技有限公司',
        ShortCName: '领码科技',
        ShortName: 'NewApp',
        domain_name: 'newapp.example.com',
        entadminAccount: 'admin',
        entadminPassword: 'must-not-leak',
        CheckState: 1,
        storage_mode: 0,
        loginPolicy: 'single_device',
        ent_config: JSON.stringify({
          user_audit: true,
          pwd_min_length: 8,
          pwd_max_length: 32,
          pwd_require_letter: true,
          pwd_require_digit: true,
          pwd_require_special: false,
          pwd_special_chars: '!@#',
          mini_program_default_pwd: 'must-not-leak',
          verification_code_length: 6,
        }),
    }
    api.session.save({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: 1,
      refreshExpiresAt: 2,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: 'E1',
        enterpriseShortName: 'NewApp',
        role: 'ADMIN',
        raw: {},
      },
      enterprise: {
        id: 'E1',
        name: 'Lingma Technology',
        code: '领码科技有限公司',
        shortName: 'NewApp',
        shortCode: '领码科技',
        raw: enterpriseSnapshot,
      },
    })

    const enterprise = await api.platform.getEnterpriseInfo()

    expect(http.requestConfig).toBeNull()
    expect(enterprise).toEqual({
      id: 'E1',
      englishName: 'Lingma Technology',
      chineseName: '领码科技有限公司',
      chineseShortName: '领码科技',
      domainKey: 'NewApp',
      domainName: 'newapp.example.com',
      iconUrl: null,
      portalUrl: null,
      administratorAccount: 'admin',
      checkState: 1,
      createdAt: null,
      loginPolicy: 'single_device',
      storageMode: 0,
      policy: {
        userAudit: true,
        passwordMinLength: 8,
        passwordMaxLength: 32,
        passwordRequiresLetter: true,
        passwordRequiresDigit: true,
        passwordRequiresSpecial: false,
        passwordSpecialCharacters: '!@#',
        verificationCodeLength: 6,
      },
    })
    expect(JSON.stringify(enterprise)).not.toContain('must-not-leak')
  })

  it('refreshes access credentials with both source-defined token headers', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: {
        token: 'new-access',
        refreshToken: 'refresh-token',
        expire: 7_200_000,
        refreshExpire: 9_000_000,
      },
    })
    const api = new LowcodeApi({ http })
    const session = {
      accessToken: 'old-access',
      refreshToken: 'refresh-token',
      accessExpiresAt: 1,
      refreshExpiresAt: 2,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: 'E1',
        enterpriseShortName: 'Lingma',
        role: 'ADMIN',
        raw: { ROWID: 'U1' },
      },
      enterprise: {
        id: 'E1',
        name: 'Lingma Enterprise',
        code: '领码科技',
        shortName: 'Lingma',
        shortCode: '领码',
        raw: { rowid: 'E1' },
      },
    }

    api.session.save(session)
    const refreshed = await api.platform.refreshSession()

    expect(http.requestConfig).toMatchObject({
      url: '/api/LoginAuthority/refresh',
      method: 'POST',
      data: null,
      headers: {
        Authorization: 'Bearer old-access',
        'X-Authorization': 'Bearer refresh-token',
      },
    })
    expect(refreshed.accessToken).toBe('new-access')
    expect(refreshed.refreshToken).toBe('refresh-token')
    expect(refreshed.identity).toBe(session.identity)
  })

  it('logs out through the real GET endpoint with the access token', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: null })
    const api = new LowcodeApi({ http })
    api.session.save({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: 1,
      refreshExpiresAt: 2,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: null,
        enterpriseShortName: 'Lingma',
        role: null,
        raw: {},
      },
      enterprise: {
        id: null,
        name: null,
        code: null,
        shortName: 'Lingma',
        shortCode: null,
        raw: {},
      },
    })

    await api.platform.logout()

    expect(http.requestConfig).toMatchObject({
      url: '/api/LoginAuthority/UserLogoutByEnt',
      method: 'GET',
      headers: { Authorization: 'Bearer access-token' },
    })
    expect(api.session.get()).toBeNull()
  })

  it('injects the stored access token into authenticated platform requests', async () => {
    const http = new FixtureHttpClient({
      Code: 200,
      Result: 'x',
    })
    const api = new LowcodeApi({ http, sessionStorage: new FixtureStorage() })
    api.session.save({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: Date.now() + 60_000,
      refreshExpiresAt: Date.now() + 120_000,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: null,
        enterpriseShortName: 'Lingma',
        role: null,
        raw: {},
      },
      enterprise: {
        id: null,
        name: null,
        code: null,
        shortName: 'Lingma',
        shortCode: null,
        raw: {},
      },
    })

    selectFixtureApplication(api)
    await api.design.readTextFile({ appType: 'vue', customPath: '', fileName: 'page.json' })

    expect(http.requestConfig?.headers).toMatchObject({ Authorization: 'Bearer access-token', 'X-AppId': 'APP-1', 'tenant-id': 'Lingma' })
  })

  it('refreshes an expired access token before an authenticated request', async () => {
    const http = new FixtureHttpClient([
      {
        Code: 200,
        Result: {
          token: 'new-access',
          refreshToken: 'new-refresh',
          expire: Date.now() + 60_000,
          refreshExpire: Date.now() + 120_000,
        },
      },
      {
        Code: 200,
        Result: 'x',
      },
    ])
    const api = new LowcodeApi({ http, sessionStorage: new FixtureStorage() })
    api.session.save({
      accessToken: 'expired-access',
      refreshToken: 'valid-refresh',
      accessExpiresAt: Date.now() - 1,
      refreshExpiresAt: Date.now() + 60_000,
      identity: {
        userId: 'U1',
        account: 'admin',
        displayName: '管理员',
        enterpriseId: null,
        enterpriseShortName: 'NewApp',
        role: null,
        raw: {},
      },
      enterprise: {
        id: null,
        name: null,
        code: null,
        shortName: 'NewApp',
        shortCode: '领码科技',
        raw: { ShortName: 'NewApp', ShortCName: '领码科技' },
      },
    })

    selectFixtureApplication(api)
    await api.design.readTextFile({ appType: 'vue', customPath: '', fileName: 'page.json' })

    expect(http.requestConfigs).toHaveLength(2)
    expect(http.requestConfigs[0]).toMatchObject({
      url: '/api/LoginAuthority/refresh',
      headers: {
        Authorization: 'Bearer expired-access',
        'X-Authorization': 'Bearer valid-refresh',
      },
    })
    expect(http.requestConfigs[1]).toMatchObject({
      url: '/api/File/content/text',
      headers: { Authorization: 'Bearer new-access', 'X-AppId': 'APP-1', 'tenant-id': 'NewApp' },
    })
  })

  it('reads tenant-scoped cache counts without enumerating keys or values', async () => {
    const http = new FixtureHttpClient([
      { Code: 200, Result: { Count: 7, Items: [] } },
      { Code: 200, Result: { Count: 12, Items: [] } },
    ])

    const stats = await new LowcodeApi({ http }).platform.getCacheStats()

    expect(stats).toEqual({ dataSetModelCount: 7, developmentFileCount: 12 })
    expect(http.requestConfigs).toEqual([
      expect.objectContaining({
        url: '/api/sysCache/findByPatternPageWithTotal',
        method: 'POST',
        data: { prefix: 'DATA_SET_MODEL', page: 1, size: 1 },
      }),
      expect.objectContaining({
        url: '/api/sysCache/findByPatternPageWithTotal',
        method: 'POST',
        data: { prefix: 'DEV_FILE_UPDATE_TIME', page: 1, size: 1 },
      }),
    ])
  })

  it('fails closed when lowcode reports an application error', async () => {
    const http = new FixtureHttpClient({
      Code: 401,
      Message: '令牌不能为空',
      Type: 'error',
    })

    const action = authenticatedFileApi(http).design.readTextFile({
      appType: 'vue',
      customPath: '',
      fileName: 'page.json',
    })

    await expect(action).rejects.toEqual(new LowcodeApiError(401, '令牌不能为空'))
    expect(http.requestConfigs).toHaveLength(1)
  })

  it('fails closed when the response is not an AjaxResult', async () => {
    const http = new FixtureHttpClient({ result: { account: 'admin' } })

    const action = authenticatedFileApi(http).design.readTextFile({
      appType: 'vue',
      customPath: '',
      fileName: 'page.json',
    })

    await expect(action).rejects.toEqual(new LowcodeApiError(0, 'lowcode 响应缺少数字 Code'))
    expect(http.requestConfigs).toHaveLength(1)
  })

  it('maps user registration to the source DTO without inventing a session', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: { userId: 'U2' } })
    const api = new LowcodeApi({ http })

    const result = await api.platform.registerUser({
      enterpriseName: 'Lingma',
      account: 'alice',
      displayName: 'Alice',
      password: 'secret-123',
      sex: 'F',
      channel: 'EMAIL',
      phone: '',
      email: 'alice@example.com',
      verificationCode: '123456',
    })

    expect(http.requestConfig).toMatchObject({
      url: '/api/LoginAuthority/register',
      method: 'POST',
      data: {
        ent: 'Lingma',
        loginName: 'alice',
        username: 'Alice',
        type: 'EMAIL',
        email: 'alice@example.com',
        code: '123456',
      },
      meta: { lowcodeSkipAuth: true },
    })
    expect(result.id).toBe('U2')
    expect(api.session.get()).toBeNull()
  })

  it('maps enterprise registration to AddEntRequest and BaseEnterpriseInfo', async () => {
    const http = new FixtureHttpClient({ Code: 200, Result: { rowid: 'E2' } })
    const api = new LowcodeApi({ http })

    const result = await api.platform.registerEnterprise({
      englishName: 'Example Technology',
      chineseName: '示例科技',
      domainKey: 'EXAMPLE',
      chineseShortName: '示例',
      administratorAccount: 'admin',
      administratorPassword: 'secret-123',
      channel: 'MOBILE',
      verificationAccount: '13800138000',
      verificationCode: '123456',
      phone: '13800138000',
      email: '',
    })

    expect(http.requestConfig).toMatchObject({
      url: '/api/Ent/AddEnterprise',
      method: 'POST',
      data: {
        ent: {
          Name: 'Example Technology',
          CName: '示例科技',
          ShortName: 'EXAMPLE',
          ShortCName: '示例',
          entadminAccount: 'admin',
          entInfoUserPhone: '13800138000',
          storage_mode: 0,
        },
        account: '13800138000',
        type: 'MOBILE',
        code: '123456',
      },
      meta: { lowcodeSkipAuth: true },
    })
    expect(result.id).toBe('E2')
  })
})
