import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import type { LowcodeApplicationSelectionReceipt } from '@spark-appworks/spark-lowcode-api'
import { createDynamicRouter } from '../../../../packages/spark-app/src/router/dynamic'
import { setDynamicRouter } from '../../../../packages/spark-app/src/navigation/nav-access'
import { ProjectNavigationGuard } from '@/services/project/navigation/project-navigation-guard'
import { activateLowcodeApplication, enterLowcodeApplicationCatalog } from '@/lowcode/lowcode-runtime'

type GuardPrincipal = { enterpriseName: string; applicationId: string | null }
type GuardTestState = {
  loggedIn: boolean
  principal: GuardPrincipal | null
  receiptError: Error | null
  cancelPendingSelection: () => void
  activation: (applicationId: string, signal?: AbortSignal) => Promise<LowcodeApplicationSelectionReceipt>
  catalog: () => LowcodeApplicationSelectionReceipt
  makeReceipt: () => LowcodeApplicationSelectionReceipt
}

const testState = vi.hoisted((): GuardTestState => ({
  loggedIn: true,
  principal: { enterpriseName: 'acme', applicationId: 'APP-A' },
  receiptError: null,
  cancelPendingSelection: vi.fn(),
  makeReceipt: () => ({ assertCurrent() {
    if (testState.receiptError !== null) throw testState.receiptError
  } }),
  activation: async (applicationId, signal) => {
    signal?.throwIfAborted()
    testState.principal = { enterpriseName: 'acme', applicationId }
    return testState.makeReceipt()
  },
  catalog: () => {
    testState.principal = { enterpriseName: 'acme', applicationId: null }
    return testState.makeReceipt()
  },
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: { platform: { cancelPendingApplicationSelection: () => testState.cancelPendingSelection() } },
  activateLowcodeApplication: vi.fn((applicationId: string, signal?: AbortSignal) => testState.activation(applicationId, signal)),
  enterLowcodeApplicationCatalog: vi.fn(() => testState.catalog()),
  hasLowcodeSession: () => testState.loggedIn,
  readLowcodePrincipal: () => testState.principal,
}))

const page = defineComponent({ setup: () => () => h('div', 'page') })

function navigationFor(projectId: string): RuntimeNavigation {
  return {
    id: 'root', title: 'Root', projectId, homePath: '/dashboard', childPlacement: 'header',
    items: [{ id: 'dashboard', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard' }],
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function createGuardRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: page },
    { path: '/login', component: page },
    { path: '/about', component: page },
    { path: '/platform', component: page },
  ] })
  let loadNavigation: () => Promise<RuntimeNavigation> = async () => navigationFor(testState.principal?.applicationId ?? 'homepage')
  const dynamic = createDynamicRouter({
    router,
    pageComponent: page,
    tenantPathPrefix: '/t/:tenantId/:projectId',
    loadNavigation: () => loadNavigation(),
    componentMap: { '/dashboard': page },
  })
  await dynamic.registerRoutes()
  setDynamicRouter(dynamic)
  const guard = new ProjectNavigationGuard({
    publicPaths: new Set(['/','/login','/about']),
    publicHomePath: '/',
    isPlatformWorkspacePath: (path) => path === '/platform' || path.startsWith('/platform/'),
  })
  const errors: unknown[] = []
  router.onError((error) => errors.push(error))
  router.beforeEach((to) => guard.resolve(to))
  return {
    router,
    dynamic,
    errors,
    setLoadNavigation(loader: () => Promise<RuntimeNavigation>) { loadNavigation = loader },
  }
}

afterEach(() => {
  testState.loggedIn = true
  testState.principal = { enterpriseName: 'acme', applicationId: 'APP-A' }
  testState.receiptError = null
  testState.activation = async (applicationId, signal) => {
    signal?.throwIfAborted()
    testState.principal = { enterpriseName: 'acme', applicationId }
    return testState.makeReceipt()
  }
  testState.catalog = () => {
    testState.principal = { enterpriseName: 'acme', applicationId: null }
    return testState.makeReceipt()
  }
  vi.clearAllMocks()
})

describe('ProjectNavigationGuard', () => {
  it('preserves public and unauthenticated routing decisions', async () => {
    const { router } = await createGuardRouter()
    testState.loggedIn = false

    await router.push('/about')
    expect(router.currentRoute.value.path).toBe('/about')
    await router.push('/platform')
    expect(router.currentRoute.value.path).toBe('/')
    await router.push('/t/acme/APP-A/dashboard?view=private#section')
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('keeps authenticated public utilities and redirects platform or non-tenant paths home', async () => {
    const { router } = await createGuardRouter()

    await router.push('/about')
    expect(router.currentRoute.value.path).toBe('/about')
    await router.push('/platform')
    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-A/dashboard')
    await router.push('/not-tenant?source=direct#top')
    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-A/dashboard')
  })

  it('corrects a mismatched tenant while preserving its query and hash', async () => {
    const { router } = await createGuardRouter()

    await router.push('/t/other/APP-A/dashboard?filter=one#section')

    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-A/dashboard?filter=one#section')
  })

  it('does not select or refresh when the URL already matches the current application', async () => {
    const { router, dynamic } = await createGuardRouter()
    const refresh = vi.spyOn(dynamic, 'refreshRoutes')

    await router.push('/t/acme/APP-A/dashboard?view=one#part')

    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-A/dashboard?view=one#part')
    expect(vi.mocked(activateLowcodeApplication)).not.toHaveBeenCalled()
    expect(vi.mocked(enterLowcodeApplicationCatalog)).not.toHaveBeenCalled()
    expect(testState.cancelPendingSelection).toHaveBeenCalledOnce()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('selects an application or catalog once and restores the original query/hash', async () => {
    const { router, dynamic } = await createGuardRouter()
    const refresh = vi.spyOn(dynamic, 'refreshRoutes')

    await router.push('/t/acme/APP-B/dashboard?tab=reports#chart')
    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-B/dashboard?tab=reports#chart')
    expect(vi.mocked(activateLowcodeApplication)).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()

    await router.push('/t/acme/homepage/dashboard?tab=catalog#top')
    expect(router.currentRoute.value.fullPath).toBe('/t/acme/homepage/dashboard?tab=catalog#top')
    expect(vi.mocked(enterLowcodeApplicationCatalog)).toHaveBeenCalledOnce()
    expect(testState.principal?.applicationId).toBeNull()
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('cancels an activation that completes after a newer same-app query navigation', async () => {
    const { router, dynamic } = await createGuardRouter()
    await router.push('/t/acme/APP-A/dashboard?before=activation')
    const originalInstance = dynamic.getSystemPageInstance(router.currentRoute.value)
    expect(originalInstance).toBeDefined()
    let releaseActivation: (() => void) | undefined
    testState.activation = (applicationId, signal) => new Promise((resolve, reject) => {
      releaseActivation = () => {
        if (signal?.aborted) {
          reject(signal.reason)
          return
        }
        testState.principal = { enterpriseName: 'acme', applicationId }
        resolve(testState.makeReceipt())
      }
    })
    const dispose = vi.spyOn(dynamic, 'disposePageRuntimes')
    const reset = vi.spyOn(dynamic, 'resetSystemPageInstances')
    const refresh = vi.spyOn(dynamic, 'refreshRoutes')
    const oldNavigation = router.push('/t/acme/APP-B/dashboard?from=A#old')
    await vi.waitFor(() => expect(releaseActivation).toBeDefined())

    await router.push('/t/acme/APP-A/dashboard?from=B#current')
    releaseActivation?.()
    await oldNavigation

    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-A/dashboard?from=B#current')
    expect(testState.principal?.applicationId).toBe('APP-A')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
    expect(reset).not.toHaveBeenCalled()
    expect(dispose).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('reselects and refreshes when principal matches the route but the loaded navigation owner is stale', async () => {
    const { router, dynamic } = await createGuardRouter()
    const refresh = vi.spyOn(dynamic, 'refreshRoutes')
    testState.principal = { enterpriseName: 'acme', applicationId: 'APP-B' }

    await router.push('/t/acme/APP-B/dashboard?view=latest#owner')

    expect(testState.principal?.applicationId).toBe('APP-B')
    expect(vi.mocked(activateLowcodeApplication)).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(dynamic.getNavTree()?.projectId).toBe('APP-B')
    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-B/dashboard?view=latest#owner')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
  })

  it('fails once when refresh succeeds with a navigation tree for the wrong application', async () => {
    const { router, dynamic, errors, setLoadNavigation } = await createGuardRouter()
    const refresh = vi.spyOn(dynamic, 'refreshRoutes')
    let loadAttempts = 0
    const repeatedLoad = new Error('unexpected repeated navigation owner refresh')
    setLoadNavigation(async () => {
      loadAttempts += 1
      if (loadAttempts > 1) throw repeatedLoad
      return navigationFor('APP-A')
    })

    const outcome = await router.push('/t/acme/APP-B/dashboard?view=wrong-owner').then(
      () => ({ error: null }),
      (error: unknown) => ({ error }),
    )

    expect(outcome.error).toBeInstanceOf(Error)
    if (!(outcome.error instanceof Error)) throw new Error('navigation owner mismatch was not rejected')
    expect(outcome.error.message).toContain('导航归属不一致')
    expect(errors).toContain(outcome.error)
    expect(vi.mocked(activateLowcodeApplication)).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(loadAttempts).toBe(1)
  })

  it('cancels a stale activation failure without forwarding it to Router onError', async () => {
    const { router, errors } = await createGuardRouter()
    let rejectActivation: ((reason: unknown) => void) | undefined
    const staleError = new Error('late activation failure')
    testState.activation = () => new Promise((_resolve, reject) => { rejectActivation = reject })
    const oldNavigation = router.push('/t/acme/APP-B/dashboard?from=A#old').then(
      () => undefined,
      (error: unknown) => error,
    )
    await vi.waitFor(() => expect(rejectActivation).toBeDefined())

    await router.push('/t/acme/APP-A/dashboard?from=B#current')
    rejectActivation?.(staleError)
    await oldNavigation

    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-A/dashboard?from=B#current')
    expect(errors).not.toContain(staleError)
  })

  it('does not redirect over a newer same-path query/hash after refresh completes', async () => {
    const { router, dynamic, setLoadNavigation } = await createGuardRouter()
    const oldRefresh = deferred<RuntimeNavigation>()
    const newRefresh = deferred<RuntimeNavigation>()
    let loadCount = 0
    setLoadNavigation(() => {
      loadCount += 1
      return loadCount === 1 ? oldRefresh.promise : newRefresh.promise
    })
    const refresh = vi.spyOn(dynamic, 'refreshRoutes')
    const oldNavigation = router.push('/t/acme/APP-B/dashboard?from=A#old')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())

    const newNavigation = router.push('/t/acme/APP-B/dashboard?from=B#current')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    oldRefresh.resolve(navigationFor('APP-A'))
    await oldNavigation
    newRefresh.resolve(navigationFor('APP-B'))
    await newNavigation

    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-B/dashboard?from=B#current')
    expect(dynamic.getNavTree()?.projectId).toBe('APP-B')
  })

  it('cancels a stale refresh failure instead of reporting it as a current route error', async () => {
    const { router, dynamic, errors, setLoadNavigation } = await createGuardRouter()
    const oldRefresh = deferred<RuntimeNavigation>()
    const newRefresh = deferred<RuntimeNavigation>()
    let loadCount = 0
    setLoadNavigation(() => {
      loadCount += 1
      return loadCount === 1 ? oldRefresh.promise : newRefresh.promise
    })
    const refresh = vi.spyOn(dynamic, 'refreshRoutes')
    const staleError = new Error('late navigation failure')
    const oldNavigation = router.push('/t/acme/APP-B/dashboard?from=A#old').then(
      () => undefined,
      (error: unknown) => error,
    )
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())

    const newNavigation = router.push('/t/acme/APP-B/dashboard?from=B#current')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    oldRefresh.reject(staleError)
    await oldNavigation
    newRefresh.resolve(navigationFor('APP-B'))
    await newNavigation

    expect(router.currentRoute.value.fullPath).toBe('/t/acme/APP-B/dashboard?from=B#current')
    expect(errors).not.toContain(staleError)
    expect(dynamic.getNavTree()?.projectId).toBe('APP-B')
  })

  it('preserves the same current activation and refresh errors on Router onError', async () => {
    const activationFixture = await createGuardRouter()
    const activationError = new Error('activation failed')
    testState.activation = () => Promise.reject(activationError)

    await expect(activationFixture.router.push('/t/acme/APP-B/dashboard')).rejects.toBe(activationError)
    expect(activationFixture.errors).toContain(activationError)

    const refreshFixture = await createGuardRouter()
    testState.activation = async (applicationId) => {
      testState.principal = { enterpriseName: 'acme', applicationId }
      return testState.makeReceipt()
    }
    const refreshError = new Error('refresh failed')
    refreshFixture.setLoadNavigation(() => Promise.reject(refreshError))

    await expect(refreshFixture.router.push('/t/acme/APP-B/dashboard')).rejects.toBe(refreshError)
    expect(refreshFixture.errors).toContain(refreshError)
  })

  it('rejects a still-current guard when its platform receipt expires during refresh', async () => {
    const { router, dynamic, errors, setLoadNavigation } = await createGuardRouter()
    const gate = deferred<RuntimeNavigation>()
    setLoadNavigation(() => gate.promise)
    const refresh = vi.spyOn(dynamic, 'refreshRoutes')
    const receiptError = new Error('selection receipt expired')
    const navigation = router.push('/t/acme/APP-B/dashboard?from=A#old')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    testState.receiptError = receiptError
    gate.resolve(navigationFor('APP-B'))

    await expect(navigation).rejects.toBe(receiptError)
    expect(errors).toContain(receiptError)
  })

  it('rejects dirty configuration before native reset or application selection', async () => {
    const { router, dynamic } = await createGuardRouter()
    const dirtyError = new Error('dirty page')
    const clean = vi.spyOn(dynamic, 'assertPageRuntimesClean').mockImplementation(() => { throw dirtyError })
    const reset = vi.spyOn(dynamic, 'resetSystemPageInstances')

    await expect(router.push('/t/acme/APP-B/dashboard')).rejects.toBe(dirtyError)

    expect(clean).toHaveBeenCalledOnce()
    expect(reset).not.toHaveBeenCalled()
    expect(vi.mocked(activateLowcodeApplication)).not.toHaveBeenCalled()
  })
})

