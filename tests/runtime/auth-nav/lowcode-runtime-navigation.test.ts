import type { LowcodeProjectBlueprintRecord } from '@spark-appworks/spark-lowcode-api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { SYSTEM_PAGE_NAVIGATION_ID_QUERY, type RuntimeNavigation } from '@spark-appworks/spark-app'
import { createDynamicRouter } from '../../../packages/spark-app/src/router/dynamic'
import { setDynamicRouter } from '../../../packages/spark-app/src/navigation/nav-access'

import NavIcon from '@/components/NavIcon.vue'
import { ProjectNavigationGuard } from '@/services/project/navigation/project-navigation-guard'
import { APPLICATION_CATALOG_PROJECT_ID } from '@/services/tenant-scope'

import {
  assembleLowcodeRuntimeNavigation,
  activateLowcodeApplication,
  enterLowcodeApplicationCatalog,
  lowcodeApplicationCatalogNavigation,
  lowcodeEnterpriseDisplayName,
  lowcodeApi,
  readLowcodeRuntimeNavigation,
} from '@/lowcode/lowcode-runtime'

function saveExecutionScope(applicationId: string, navigationRootId = `ROOT-${applicationId}`): void {
  lowcodeApi.session.save({
    accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: { userId: 'USER-1', account: 'fixture', displayName: 'fixture', enterpriseId: 'TENANT-1',
      enterpriseShortName: 'fixture-tenant', role: null, raw: {} },
    enterprise: { id: 'TENANT-1', name: 'fixture', code: 'fixture', shortName: 'fixture-tenant', shortCode: 'fixture', raw: {} },
  })
  lowcodeApi.application.save({
    application: { id: applicationId, code: applicationId, name: applicationId, description: '',
      enterpriseId: 'OWNER-1', enterpriseShortName: 'owner', isDefault: false },
    navigationRootId,
  })
}

function application(applicationId: string) {
  return { id: applicationId, code: applicationId, name: applicationId, description: '',
    enterpriseId: 'OWNER-1', enterpriseShortName: 'owner', isDefault: false }
}

function deferred<T>(): Readonly<{
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.restoreAllMocks()
  lowcodeApi.application.clear()
  lowcodeApi.session.clear()
})

type BlueprintFixtureInput = Readonly<{
  nodeId: string
  parentNodeId?: string
  name: string
  title: string
  kind?: LowcodeProjectBlueprintRecord['kind']
  target?: string
  scenarioId?: string
  order?: number
}>

function record(input: BlueprintFixtureInput): LowcodeProjectBlueprintRecord {
  return {
    nodeId: input.nodeId,
    parentNodeId: input.parentNodeId ?? '',
    projectId: 'PROJECT-1',
    kind: input.kind ?? 'page',
    capability: { name: input.name },
    navigation: { title: input.title, ...(input.target === undefined ? {} : { target: input.target }), order: input.order ?? 0,
      publishInMenu: true, showChildren: true, beginGroup: false },
    ...(input.scenarioId ? { dataSpace: { scenarioId: input.scenarioId, models: [] } } : {}),
    source: {},
  }
}

describe('lowcode project navigation projection', () => {
  it('returns a current receipt for the application catalog state', () => {
    saveExecutionScope('APP-A')
    const originalCatalog = lowcodeApi.platform.enterApplicationCatalog.bind(lowcodeApi.platform)
    const captured: { receipt: ReturnType<typeof lowcodeApi.platform.enterApplicationCatalog> | null } = { receipt: null }
    vi.spyOn(lowcodeApi.platform, 'enterApplicationCatalog').mockImplementation(() => {
      const receipt = originalCatalog()
      captured.receipt = receipt
      return receipt
    })

    const receipt = enterLowcodeApplicationCatalog()

    expect(receipt).toEqual(expect.objectContaining({ assertCurrent: expect.any(Function) }))
    expect(receipt).toBe(captured.receipt)
    expect(lowcodeApi.application.get()).toBeNull()
    expect(() => receipt.assertCurrent()).not.toThrow()
  })

  it('returns the platform activation receipt unchanged', async () => {
    saveExecutionScope('APP-OLD')
    const appB = application('APP-B')
    vi.spyOn(lowcodeApi.platform, 'listApplications').mockResolvedValue([appB])
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')
    const originalActivate = lowcodeApi.platform.activateApplication.bind(lowcodeApi.platform)
    const captured: { receipt: Awaited<ReturnType<typeof lowcodeApi.platform.activateApplication>> | null } = { receipt: null }
    vi.spyOn(lowcodeApi.platform, 'activateApplication').mockImplementation(async (applicationId) => {
      const receipt = await originalActivate(applicationId)
      captured.receipt = receipt
      return receipt
    })

    const receipt = await activateLowcodeApplication('APP-B')

    expect(receipt).toBe(captured.receipt)
    expect(() => receipt.assertCurrent()).not.toThrow()
  })

  it('forwards an aborted navigation signal to the real platform selection fence', async () => {
    saveExecutionScope('APP-A')
    const previous = lowcodeApi.application.get()
    if (previous === null) throw new Error('application fixture missing')
    const applications = deferred<Awaited<ReturnType<typeof lowcodeApi.platform.listApplications>>>()
    const list = vi.spyOn(lowcodeApi.platform, 'listApplications').mockReturnValue(applications.promise)
    const root = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')
    const controller = new AbortController()
    const reason = new Error('navigation intent superseded')
    const activation = activateLowcodeApplication('APP-B', controller.signal)
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())

    controller.abort(reason)
    applications.resolve([application('APP-B')])

    await expect(activation).rejects.toBe(reason)
    expect(root).not.toHaveBeenCalled()
    expect(lowcodeApi.application.get()).toEqual(previous)
  })

  it('exports the reserved system-page identity key through the spark-app package root', () => {
    expect(SYSTEM_PAGE_NAVIGATION_ID_QUERY).toBe('__sparkNavigationId')
  })

  it('rejects navigation when the execution application changes during authorization read', async () => {
    saveExecutionScope('APP-A')
    const records = vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([])
    const authorization = deferred<Awaited<ReturnType<typeof lowcodeApi.blueprint.readNavigationAuthorization>>>()
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockReturnValue(authorization.promise)

    const navigation = readLowcodeRuntimeNavigation()
    await vi.waitFor(() => expect(records).toHaveBeenCalledOnce())
    saveExecutionScope('APP-B')
    authorization.resolve({ items: [], contexts: [] })

    await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })

  it.each(['session-reset', 'application-round-trip', 'navigation-root-change'] as const)(
    'rejects navigation when %s changes while authorization is pending', async (change) => {
      saveExecutionScope('APP-A')
      vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([])
      const authorization = deferred<Awaited<ReturnType<typeof lowcodeApi.blueprint.readNavigationAuthorization>>>()
      vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockReturnValue(authorization.promise)
      const navigation = readLowcodeRuntimeNavigation()
      await vi.waitFor(() => expect(lowcodeApi.blueprint.readNavigationAuthorization).toHaveBeenCalledOnce())

      if (change === 'session-reset') {
        lowcodeApi.session.clear()
        saveExecutionScope('APP-A')
      } else if (change === 'application-round-trip') {
        lowcodeApi.application.save({ application: application('APP-B'), navigationRootId: 'ROOT-B' })
        lowcodeApi.application.save({ application: application('APP-A'), navigationRootId: 'ROOT-APP-A' })
      } else {
        lowcodeApi.application.save({ application: application('APP-A'), navigationRootId: 'ROOT-CHANGED' })
      }
      authorization.resolve({ items: [], contexts: [] })

      await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    },
  )

  it('keeps an explicit target separate from the stable execution application', async () => {
    saveExecutionScope('APP-A')
    const listApplications = vi.spyOn(lowcodeApi.platform, 'listApplications').mockResolvedValue([application('APP-B')])
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')
    const records = vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([])
    const authorization = vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockResolvedValue({ items: [], contexts: [] })

    const navigation = await readLowcodeRuntimeNavigation('APP-B')

    expect(listApplications).toHaveBeenCalledOnce()
    expect(resolveRoot).toHaveBeenCalledWith('APP-B')
    expect(records).toHaveBeenCalledWith('APP-B')
    expect(authorization).toHaveBeenCalledWith('APP-B', 'ROOT-B')
    expect(navigation.projectId).toBe('APP-B')
    expect(lowcodeApi.application.get()?.application.id).toBe('APP-A')
  })

  it('does not let a late application catalog overwrite a newer activation intent', async () => {
    saveExecutionScope('APP-OLD')
    const appA = application('APP-A')
    const appB = application('APP-B')
    const applicationsA = deferred<Awaited<ReturnType<typeof lowcodeApi.platform.listApplications>>>()
    const applicationsB = deferred<Awaited<ReturnType<typeof lowcodeApi.platform.listApplications>>>()
    const rootB = deferred<string>()
    const listApplications = vi.spyOn(lowcodeApi.platform, 'listApplications')
      .mockReturnValueOnce(applicationsA.promise)
      .mockReturnValueOnce(applicationsB.promise)
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockImplementation((id) => (
      id === 'APP-B' ? rootB.promise : Promise.resolve('ROOT-A')
    ))

    const activationA = activateLowcodeApplication('APP-A')
    const activationB = activateLowcodeApplication('APP-B')
    applicationsB.resolve([appB])
    await vi.waitFor(() => expect(resolveRoot).toHaveBeenCalledWith('APP-B'))
    applicationsA.resolve([appA])

    await expect(activationA).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    expect(resolveRoot).toHaveBeenCalledTimes(1)
    rootB.resolve('ROOT-B')
    await expect(activationB).resolves.toMatchObject({ application: appB, navigationRootId: 'ROOT-B' })
    expect(lowcodeApi.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
    expect(listApplications).toHaveBeenCalledTimes(2)
  })

  it('keeps the active URL, platform application, and native page instance aligned after same-app navigation supersedes activation', async () => {
    saveExecutionScope('APP-A')
    const page = defineComponent({ setup: () => () => h('main', 'dashboard') })
    const navigation: RuntimeNavigation = {
      id: 'ROOT-APP-A', title: 'App A', projectId: 'APP-A', childPlacement: 'header',
      items: [{ id: 'dashboard', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard' }],
    }
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const dynamic = createDynamicRouter({
      router,
      pageComponent: page,
      tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => navigation,
      componentMap: { '/dashboard': page },
    })
    await dynamic.registerRoutes()
    setDynamicRouter(dynamic)
    const guard = new ProjectNavigationGuard({
      publicPaths: new Set(['/login']),
      publicHomePath: '/login',
      isPlatformWorkspacePath: (path) => path.startsWith('/platform'),
    })
    router.beforeEach((to) => guard.resolve(to))

    await router.push(`/t/fixture-tenant/APP-A/dashboard?${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()

    const applications = deferred<Awaited<ReturnType<typeof lowcodeApi.platform.listApplications>>>()
    const listApplications = vi.spyOn(lowcodeApi.platform, 'listApplications').mockReturnValue(applications.promise)
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-APP-B')
    const staleNavigation = router.push('/t/fixture-tenant/APP-B/dashboard?from=activation')
    await vi.waitFor(() => expect(listApplications).toHaveBeenCalledOnce())

    await router.push(`/t/fixture-tenant/APP-A/dashboard?view=latest&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)
    applications.resolve([application('APP-B')])
    await staleNavigation

    const observed = {
      url: router.currentRoute.value.fullPath,
      applicationId: lowcodeApi.application.get()?.application.id ?? null,
      nativeInstanceId: dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId ?? null,
    }
    expect(observed).toEqual({
      url: `/t/fixture-tenant/APP-A/dashboard?view=latest&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`,
      applicationId: 'APP-A',
      nativeInstanceId: expect.any(String),
    })
  })

  it('cancels a pending external activation when same-app query navigation takes ownership', async () => {
    saveExecutionScope('APP-A')
    const page = defineComponent({ setup: () => () => h('main', 'dashboard') })
    const navigation: RuntimeNavigation = {
      id: 'ROOT-APP-A', title: 'App A', projectId: 'APP-A', childPlacement: 'header',
      items: [{ id: 'dashboard', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard' }],
    }
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const dynamic = createDynamicRouter({
      router,
      pageComponent: page,
      tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => navigation,
      componentMap: { '/dashboard': page },
    })
    await dynamic.registerRoutes()
    setDynamicRouter(dynamic)
    const guard = new ProjectNavigationGuard({
      publicPaths: new Set(['/login']),
      publicHomePath: '/login',
      isPlatformWorkspacePath: (path) => path.startsWith('/platform'),
    })
    router.beforeEach((to) => guard.resolve(to))
    await router.push(`/t/fixture-tenant/APP-A/dashboard?${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)
    const initialInstance = dynamic.getSystemPageInstance(router.currentRoute.value)
    if (!initialInstance) throw new Error('APP-A system-page fixture did not create a native instance')

    const applications = deferred<Awaited<ReturnType<typeof lowcodeApi.platform.listApplications>>>()
    const listApplications = vi.spyOn(lowcodeApi.platform, 'listApplications').mockReturnValue(applications.promise)
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-APP-B')
    const externalActivation = activateLowcodeApplication('APP-B')
    await vi.waitFor(() => expect(listApplications).toHaveBeenCalledOnce())

    await router.push(`/t/fixture-tenant/APP-A/dashboard?view=latest&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)
    applications.resolve([application('APP-B')])
    const activationOutcome = await externalActivation.then(
      (receipt) => {
        receipt.assertCurrent()
        return { status: 'committed' }
      },
      (error: unknown) => ({ status: 'rejected', errorMessage: error instanceof Error ? error.message : String(error) }),
    )

    const observed = {
      activationOutcome,
      url: router.currentRoute.value.fullPath,
      applicationId: lowcodeApi.application.get()?.application.id ?? null,
      navigationProjectId: dynamic.getNavTree()?.projectId ?? null,
      nativeInstanceId: dynamic.getSystemPageInstance(router.currentRoute.value)?.instanceId ?? null,
    }
    console.info('C2D2F_EXTERNAL_ACTIVATION_OUTCOME', JSON.stringify(observed))
    expect(observed).toEqual({
      activationOutcome: { status: 'rejected', errorMessage: expect.stringContaining('STALE') },
      url: `/t/fixture-tenant/APP-A/dashboard?view=latest&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`,
      applicationId: 'APP-A',
      navigationProjectId: 'APP-A',
      nativeInstanceId: expect.any(String),
    })
  })

  it('keeps a committed application receipt current through an ordinary same-app query navigation', async () => {
    saveExecutionScope('APP-A')
    const page = defineComponent({ setup: () => () => h('main', 'dashboard') })
    const navigation: RuntimeNavigation = {
      id: 'ROOT-APP-A', title: 'App A', projectId: 'APP-A', childPlacement: 'header',
      items: [{ id: 'dashboard', title: 'Dashboard', itemKind: 'system-page', path: '/dashboard' }],
    }
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const dynamic = createDynamicRouter({
      router,
      pageComponent: page,
      tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => navigation,
      componentMap: { '/dashboard': page },
    })
    await dynamic.registerRoutes()
    setDynamicRouter(dynamic)
    const guard = new ProjectNavigationGuard({
      publicPaths: new Set(['/login']),
      publicHomePath: '/login',
      isPlatformWorkspacePath: (path) => path.startsWith('/platform'),
    })
    router.beforeEach((to) => guard.resolve(to))
    await router.push(`/t/fixture-tenant/APP-A/dashboard?${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)

    vi.spyOn(lowcodeApi.platform, 'listApplications').mockResolvedValue([application('APP-A')])
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-APP-A')
    const receipt = await activateLowcodeApplication('APP-A')
    await router.push(`/t/fixture-tenant/APP-A/dashboard?view=latest&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)

    expect(() => receipt.assertCurrent()).not.toThrow()
    expect(lowcodeApi.application.get()?.application.id).toBe('APP-A')
    expect(dynamic.getNavTree()?.projectId).toBe('APP-A')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
  })

  it('reinstalls the real target owner when navigation supersedes an activation just after platform commit', async () => {
    saveExecutionScope('APP-A')
    const page = defineComponent({ setup: () => () => h('main', 'dashboard') })
    const navigationForApplication = (projectId: string): RuntimeNavigation => ({
      id: `ROOT-${projectId}`, title: projectId, projectId, childPlacement: 'header',
      items: [{ id: 'dashboard', title: 'Dashboard', itemKind: 'system-page' as const, path: '/dashboard' }],
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const dynamic = createDynamicRouter({
      router,
      pageComponent: page,
      tenantPathPrefix: '/t/:tenantId/:projectId',
      loadNavigation: async () => navigationForApplication(lowcodeApi.application.get()?.application.id ?? 'homepage'),
      componentMap: { '/dashboard': page },
    })
    await dynamic.registerRoutes()
    setDynamicRouter(dynamic)
    const guard = new ProjectNavigationGuard({
      publicPaths: new Set(['/login']),
      publicHomePath: '/login',
      isPlatformWorkspacePath: (path) => path.startsWith('/platform'),
    })
    router.beforeEach((to) => guard.resolve(to))
    await router.push(`/t/fixture-tenant/APP-A/dashboard?${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)

    const appB = application('APP-B')
    vi.spyOn(lowcodeApi.platform, 'listApplications').mockResolvedValue([appB])
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-APP-B')
    const newerNavigation = deferred<void>()
    const originalActivate = lowcodeApi.platform.activateApplication.bind(lowcodeApi.platform)
    let scheduleNewerNavigation = true
    vi.spyOn(lowcodeApi.platform, 'activateApplication').mockImplementation(async (applicationId, signal) => {
      const receipt = await originalActivate(applicationId, signal)
      if (scheduleNewerNavigation) {
        scheduleNewerNavigation = false
        queueMicrotask(() => {
          void router.push(`/t/fixture-tenant/APP-B/dashboard?intent=new&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)
            .then(() => newerNavigation.resolve(), newerNavigation.reject)
        })
      }
      return receipt
    })

    const staleNavigation = router.push(`/t/fixture-tenant/APP-B/dashboard?intent=old&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)
    await newerNavigation.promise
    await staleNavigation

    expect(router.currentRoute.value.fullPath)
      .toBe(`/t/fixture-tenant/APP-B/dashboard?intent=new&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)
    expect(lowcodeApi.application.get()?.application.id).toBe('APP-B')
    expect(dynamic.getNavTree()?.projectId).toBe('APP-B')
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeDefined()
  })

  it('rechecks the activation receipt after the runtime await continuation', async () => {
    saveExecutionScope('APP-OLD')
    const appB = application('APP-B')
    vi.spyOn(lowcodeApi.platform, 'listApplications').mockResolvedValue([appB])
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')
    const originalActivate = lowcodeApi.platform.activateApplication.bind(lowcodeApi.platform)
    vi.spyOn(lowcodeApi.platform, 'activateApplication').mockImplementation(async (applicationId) => {
      const receipt = await originalActivate(applicationId)
      queueMicrotask(() => {
        lowcodeApi.application.save({ application: application('APP-C'), navigationRootId: 'ROOT-C' })
      })
      return receipt
    })

    const activation = activateLowcodeApplication('APP-B')

    await expect(activation).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    expect(lowcodeApi.application.get()).toEqual({ application: application('APP-C'), navigationRootId: 'ROOT-C' })
  })

  it.each(['application-clear', 'session-replacement'] as const)(
    'stops a pending application selection after %s', async (change) => {
      saveExecutionScope('APP-OLD')
      const appB = application('APP-B')
      const applications = deferred<Awaited<ReturnType<typeof lowcodeApi.platform.listApplications>>>()
      const list = vi.spyOn(lowcodeApi.platform, 'listApplications').mockReturnValue(applications.promise)
      const root = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId')
      const activation = activateLowcodeApplication('APP-B')
      await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())

      if (change === 'application-clear') lowcodeApi.application.clear()
      else {
        lowcodeApi.session.clear()
        saveExecutionScope('APP-OLD')
      }
      applications.resolve([appB])

      await expect(activation).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
      expect(root).not.toHaveBeenCalled()
      expect(lowcodeApi.application.get()?.application.id).not.toBe('APP-B')
    },
  )

  it('allows token refresh while an application selection is pending', async () => {
    saveExecutionScope('APP-OLD')
    const appB = application('APP-B')
    const originalSession = lowcodeApi.session.get()
    if (originalSession === null) throw new Error('session fixture missing')
    const applications = deferred<Awaited<ReturnType<typeof lowcodeApi.platform.listApplications>>>()
    vi.spyOn(lowcodeApi.platform, 'listApplications').mockReturnValue(applications.promise)
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')
    const activation = activateLowcodeApplication('APP-B')
    await vi.waitFor(() => expect(lowcodeApi.platform.listApplications).toHaveBeenCalledOnce())
    lowcodeApi.session.save({ ...originalSession, accessToken: 'fixture-refreshed-access' })
    applications.resolve([appB])

    await expect(activation).resolves.toMatchObject({ application: appB, navigationRootId: 'ROOT-B' })
    expect(lowcodeApi.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
  })

  it('stops after a pending target lookup invalidates the execution scope', async () => {
    saveExecutionScope('APP-A')
    const applications = deferred<Awaited<ReturnType<typeof lowcodeApi.platform.listApplications>>>()
    vi.spyOn(lowcodeApi.platform, 'listApplications').mockReturnValue(applications.promise)
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId')
    const records = vi.spyOn(lowcodeApi.blueprint, 'readRecords')

    const navigation = readLowcodeRuntimeNavigation('APP-B')
    lowcodeApi.application.save({ application: application('APP-B'), navigationRootId: 'ROOT-B' })
    applications.resolve([application('APP-B')])

    await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(resolveRoot).not.toHaveBeenCalled()
    expect(records).not.toHaveBeenCalled()
  })

  it('stops before blueprint reads when navigation-root resolution becomes stale', async () => {
    saveExecutionScope('APP-A')
    vi.spyOn(lowcodeApi.platform, 'listApplications').mockResolvedValue([application('APP-B')])
    const root = deferred<string>()
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockReturnValue(root.promise)
    const records = vi.spyOn(lowcodeApi.blueprint, 'readRecords')

    const navigation = readLowcodeRuntimeNavigation('APP-B')
    await vi.waitFor(() => expect(lowcodeApi.platform.resolveNavigationRootId).toHaveBeenCalledWith('APP-B'))
    lowcodeApi.session.clear()
    root.resolve('ROOT-B')

    await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(records).not.toHaveBeenCalled()
  })

  it('rechecks immediately after application lookup before resolving the target root', async () => {
    saveExecutionScope('APP-A')
    const applications = deferred<Awaited<ReturnType<typeof lowcodeApi.platform.listApplications>>>()
    vi.spyOn(lowcodeApi.platform, 'listApplications').mockReturnValue(applications.promise)
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')

    const navigation = readLowcodeRuntimeNavigation('APP-B')
    applications.resolve([application('APP-B')])
    queueMicrotask(() => {
      lowcodeApi.application.save({ application: application('APP-B'), navigationRootId: 'ROOT-B' })
    })

    await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(resolveRoot).not.toHaveBeenCalled()
  })

  it('rechecks after the final parallel response before assembling navigation', async () => {
    saveExecutionScope('APP-A')
    vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([])
    const authorization = deferred<Awaited<ReturnType<typeof lowcodeApi.blueprint.readNavigationAuthorization>>>()
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockReturnValue(authorization.promise)

    const navigation = readLowcodeRuntimeNavigation()
    await vi.waitFor(() => expect(lowcodeApi.blueprint.readNavigationAuthorization).toHaveBeenCalledOnce())
    authorization.resolve({ items: [], contexts: [] })
    queueMicrotask(() => {
      lowcodeApi.application.save({ application: application('APP-B'), navigationRootId: 'ROOT-B' })
    })

    await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })

  it('turns a late request failure into stale-scope failure after the execution application changes', async () => {
    saveExecutionScope('APP-A')
    vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([])
    const authorization = deferred<Awaited<ReturnType<typeof lowcodeApi.blueprint.readNavigationAuthorization>>>()
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockReturnValue(authorization.promise)
    const navigation = readLowcodeRuntimeNavigation()
    await vi.waitFor(() => expect(lowcodeApi.blueprint.readNavigationAuthorization).toHaveBeenCalledOnce())
    lowcodeApi.application.save({ application: application('APP-B'), navigationRootId: 'ROOT-B' })
    authorization.reject(new Error('late backend failure'))

    await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })

  it('allows token refresh with stable identity references and preserves stable request errors', async () => {
    saveExecutionScope('APP-A')
    const originalSession = lowcodeApi.session.get()
    if (originalSession === null) throw new Error('session fixture missing')
    const authorization = deferred<Awaited<ReturnType<typeof lowcodeApi.blueprint.readNavigationAuthorization>>>()
    vi.spyOn(lowcodeApi.blueprint, 'readRecords').mockResolvedValue([])
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockReturnValue(authorization.promise)
    const navigation = readLowcodeRuntimeNavigation()
    await vi.waitFor(() => expect(lowcodeApi.blueprint.readNavigationAuthorization).toHaveBeenCalledOnce())
    lowcodeApi.session.save({ ...originalSession, accessToken: 'fixture-refreshed-access' })
    authorization.resolve({ items: [], contexts: [] })
    await expect(navigation).resolves.toMatchObject({ projectId: 'APP-A' })

    const stableError = new Error('fixture authorization failure')
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockRejectedValue(stableError)
    await expect(readLowcodeRuntimeNavigation()).rejects.toBe(stableError)
  })

  it('uses the local catalog without reading a request scope when no application is selected', async () => {
    lowcodeApi.application.clear()
    const scope = vi.spyOn(lowcodeApi, 'readRequestScope')
    const records = vi.spyOn(lowcodeApi.blueprint, 'readRecords')
    const authorization = vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization')

    await expect(readLowcodeRuntimeNavigation()).resolves.toEqual(lowcodeApplicationCatalogNavigation())

    expect(scope).not.toHaveBeenCalled()
    expect(records).not.toHaveBeenCalled()
    expect(authorization).not.toHaveBeenCalled()
    expect(lowcodeApplicationCatalogNavigation().projectId).toBe(APPLICATION_CATALOG_PROJECT_ID)
    expect(lowcodeApi.application.get()).toBeNull()
  })

  it('renders lowcode legacy icon classes as icons instead of raw class text', () => {
    const wrapper = mount(NavIcon, {
      props: { name: 'e-icons layui-icon layui-icon-app' },
      global: { stubs: { 'el-icon': { template: '<i><slot /></i>' } } },
    })

    expect(wrapper.text()).not.toContain('layui-icon')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('normalizes application icon aliases instead of rendering icon names as text', () => {
    for (const name of ['DataBase', 'FolderOpen']) {
      const wrapper = mount(NavIcon, {
        props: { name },
        global: { stubs: { 'el-icon': { template: '<i><slot /></i>' } } },
      })

      expect(wrapper.text()).not.toContain(name)
      expect(wrapper.find('svg').exists()).toBe(true)
    }
  })

  it('uses the Chinese enterprise short name as the AppWorks display label', () => {
    expect(lowcodeEnterpriseDisplayName({
      id: 'E1',
      name: 'QinYanTech',
      code: '武汉领码科技有限公司',
      shortName: 'NewApp',
      shortCode: '领码科技',
      raw: {},
    })).toBe('领码科技')
  })

  it('keeps every AppWorks tenant page reachable from the application catalog', () => {
    const catalog = lowcodeApplicationCatalogNavigation()

    expect(catalog.homePath).toBe('/app-list')
    expect(catalog.items.map((child) => child.path)).toEqual([
      '/settings',
      '/app-list',
      '/tenants',
      '/apps',
    ])
    expect(catalog.items.every((child) => child.itemKind === 'system-page')).toBe(true)
  })

  it.each(['Payroll.Calculate', 'Payroll.Calculate.Renamed'])('keeps the menu title and nested home path for capability %s', (name) => {
    const projection = assembleLowcodeRuntimeNavigation({
      applicationName: 'SPARK薪酬管理',
      projectId: 'PROJECT-1',
      navigationRootId: 'ROOT-1',
      records: [
        record({ nodeId: 'module-1', name: 'Payroll', title: '工资管理', kind: 'module', order: 0 }),
        record({
          nodeId: 'page-1',
          parentNodeId: 'module-1',
          name,
          title: '工资核算',
          kind: 'page',
          target: 'vue:payroll/salary-calculation',
          scenarioId: 'FORM-1',
          order: 1,
        }),
      ],
      authorization: {
        items: [{
          id: 'module-1',
          target: '',
          targetKind: 'empty',
          formKey: null,
          children: [{
            id: 'page-1',
            target: 'vue:payroll/salary-calculation',
            targetKind: 'vue',
            formKey: 'FORM-1',
            children: [],
          }],
        }],
        contexts: [],
      },
    })

    expect(projection.homePath).toBe(`/payroll/salary-calculation?${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=page-1`)
    expect(projection.items[0]).not.toHaveProperty('dataSpaceId')
    expect(projection.items[0]?.children?.[0]).toMatchObject({
      title: '工资核算',
      path: '/payroll/salary-calculation',
      itemKind: 'system-page',
    })
    expect(projection.items[0]?.children?.[0]).not.toHaveProperty('formKey')
    expect(projection.items[0]?.children?.[0]).not.toHaveProperty('dataSpaceId')
    expect(projection.items.at(-1)).toMatchObject({
      id: 'appworks-system-tools',
      title: 'SPARK 工具',
      itemKind: 'module',
    })
    expect(projection.items.at(-1)?.children?.map((child) => child.path)).toEqual([
      '/demo/template-dsl',
      '/cache-manager',
      '/dashboard',
      '/capability-demo',
      '/workflow-designs',
      '/dev',
      '/dbms',
    ])
    expect(projection.items.at(-1)?.children?.every((child) => !('dataSpaceId' in child))).toBe(true)
  })

  it('keeps the cfg tool target separate from the scenario call parameter', () => {
    const tool = record({ nodeId: 'NODE-1', name: 'Orders.Query', title: '订单查询',
      target: 'cfg:shared/orders', scenarioId: 'SCENE-1' })
    const projection = assembleLowcodeRuntimeNavigation({
      applicationName: '测试应用', projectId: 'PROJECT-1', navigationRootId: 'ROOT-1',
      records: [tool], authorization: { items: [{ id: 'NODE-1', target: 'cfg:shared/orders',
        targetKind: 'route', formKey: 'SCENE-1', children: [] }], contexts: [] },
    })

    expect(tool.navigation?.target).toBe('cfg:shared/orders')
    expect(projection.items[0]).toMatchObject({ id: 'NODE-1', title: '订单查询',
      itemKind: 'page', path: '/__page/NODE-1?scenarioId=SCENE-1', tool: { projectId: 'PROJECT-1', pageId: 'shared/orders' } })
    expect(projection.items[0]?.blueprintScenarioId).toBe('SCENE-1')
    expect(projection.homePath).toBe('/__page/NODE-1?scenarioId=SCENE-1')
    expect(projection.items[0]).not.toHaveProperty('formKey')
    expect(projection.items[0]?.path).not.toContain('shared/orders')
  })

  it('preserves native scene call parameters and hash while projecting the Vue resource', () => {
    const target = 'vue:/orders?scenarioId=SCENE-1&item=A&item=B&bare&empty=#details'
    const projection = assembleLowcodeRuntimeNavigation({
      applicationName: '测试应用', projectId: 'PROJECT-1', navigationRootId: 'ROOT-1',
      records: [record({ nodeId: 'native', name: 'Orders', title: '订单', target, scenarioId: 'BOUND-SCENARIO' })],
      authorization: { items: [{ id: 'native', target, targetKind: 'vue', formKey: null, children: [] }], contexts: [] },
    })
    expect(projection.items[0]?.path).toBe('/orders?scenarioId=SCENE-1&item=A&item=B&bare&empty=#details')
    expect(projection.items[0]?.blueprintScenarioId).toBe('BOUND-SCENARIO')
    expect(projection.homePath).toBe(`/orders?scenarioId=SCENE-1&item=A&item=B&bare&empty=&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=native#details`)
  })
})
