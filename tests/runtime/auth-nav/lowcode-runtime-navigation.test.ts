import type { LowcodeProjectBlueprintRecord } from '@spark-appworks/spark-lowcode-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { SYSTEM_PAGE_NAVIGATION_ID_QUERY, type RuntimeNavigation } from '@spark-appworks/spark-app'
import { createDynamicRouter } from '../../../packages/spark-app/src/router/dynamic'
import { setDynamicRouter } from '../../../packages/spark-app/src/navigation/nav-access'

import NavIcon from '@/components/NavIcon.vue'
import { ProjectNavigationGuard } from '@/services/project/navigation/project-navigation-guard'
import { APPLICATION_CATALOG_PROJECT_ID } from '@/services/tenant-scope'
import { DataSet, type DataRow } from '@spark-appworks/spark-data'
import { loadLowcodeRuntimeScenario } from '@/lowcode/data-space/lowcode-data-space-runtime'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import { PageRuntime } from '@spark-appworks/spark-project-model'
import * as VuePageRegistry from '@/registries/vue-page-registry'

const applicationCatalogReader = vi.hoisted(() => ({read: vi.fn<(applicationId: string, assertCurrent: () => void) => Promise<unknown>>()}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({ loadLowcodeRuntimeScenario: vi.fn() }))
vi.mock('@/lowcode/lowcode-application-catalog', () => ({readLowcodeApplicationById: applicationCatalogReader.read}))

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

type NavigationDataSetFixture = {dataSet: DataSet; filters: unknown[]}
let lastNavigationDataSet: NavigationDataSetFixture | undefined
function createNavigationDataSet(options: {rows?: DataRow[]; beforeQuery?: () => Promise<void>} = {}): NavigationDataSetFixture {
  const scenarioId = LOWCODE_APPLICATION_CATALOG_FORM_KEY
  const fields = ['rowid', 'SysId', 'prowid', 'FunOrderValue', 'name', 'FunName', 'conType', 'NavigationUrl', 'IsShowAtNav']
  const dataSet = DataSet.fromJson({scenarioId, tables: {Base_NavigationInfo: {
    modelBinding: {modelId: `${scenarioId}p000`, modelName: 'Base_NavigationInfo'},
    columns: fields.map(name => ({name, type: name === 'FunOrderValue' || name === 'IsShowAtNav' ? 'number' : 'string', isPrimaryKey: name === 'rowid'})),
    views: {default: {autoLoad: false}},
  }}})
  const filters: unknown[] = []
  const view = dataSet.getView('Base_NavigationInfo', 'default')!
  view.bindQueryExecutor({executeQuery: async (_target, params) => {
    filters.push(params.filter)
    await options.beforeQuery?.()
    const findProject = (filter: unknown): string | undefined => {
      if (filter === null || typeof filter !== 'object') return undefined
      const item = filter as Record<string, unknown>
      if (item['field'] === 'SysId' && typeof item['value'] === 'string') return item['value']
      if (Array.isArray(item['filters'])) return item['filters'].map(findProject).find(value => value !== undefined)
      return undefined
    }
    const projectId = findProject(params.filter) ?? 'APP-B'
    const selected = options.rows ?? [{rowid: `ROOT-${projectId}`, SysId: projectId, prowid: '000000', FunOrderValue: 0,
      name: projectId, FunName: projectId, conType: 'Model', NavigationUrl: '', IsShowAtNav: 0}]
    const rows = selected.filter(row => row['SysId'] === projectId)
    return {rows, total: rows.length, countReported: true, resultPrimaryKey: 'rowid',
      assertIdentity: actual => {if (actual.scenarioId !== scenarioId || actual.metaName !== 'Base_NavigationInfo') throw new Error('identity mismatch')},
      rowKey: row => row['rowid'],
      fieldAccess: (key, field) => rows.some(row => row['rowid'] === key && Object.hasOwn(row, field))
        ? {read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}
        : {read: 'invisible', write: 'denied', component: 'hidden', required: false, writeMode: 'readonly'},
      readFieldAccess: (row, field) => Object.hasOwn(row, field) ? 'visible' : 'invisible',
      addActionState: () => 'hidden', editActionState: () => 'hidden', deleteActionState: () => 'hidden',
      createChildActionState: () => 'hidden', viewActionState: () => 'hidden'}
  }})
  const fixture = {dataSet, filters}
  lastNavigationDataSet = fixture
  return fixture
}

async function expectApplicationReaderStarted(navigation: Promise<RuntimeNavigation>): Promise<boolean> {
  await Promise.resolve()
  if (applicationCatalogReader.read.mock.calls.length > 0) return true
  await navigation
  expect(applicationCatalogReader.read).toHaveBeenCalledOnce()
  return false
}

beforeEach(() => {
  lastNavigationDataSet = undefined
  applicationCatalogReader.read.mockReset()
  applicationCatalogReader.read.mockImplementation(async (id) => application(id))
  vi.mocked(loadLowcodeRuntimeScenario).mockImplementation(async () => createNavigationDataSet().dataSet)
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
    vi.spyOn(applicationCatalogReader, 'read').mockResolvedValue(appB)
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
    const applicationRead = deferred<unknown>()
    const list = vi.spyOn(applicationCatalogReader, 'read').mockReturnValue(applicationRead.promise)
    const root = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')
    const controller = new AbortController()
    const reason = new Error('navigation intent superseded')
    const activation = activateLowcodeApplication('APP-B', controller.signal)
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())

    controller.abort(reason)
    applicationRead.resolve(application('APP-B'))

    await expect(activation).rejects.toBe(reason)
    expect(root).not.toHaveBeenCalled()
    expect(lowcodeApi.application.get()).toEqual(previous)
  })

  it('exports the reserved system-page identity key through the spark-app package root', () => {
    expect(SYSTEM_PAGE_NAVIGATION_ID_QUERY).toBe('__sparkNavigationId')
  })

  it('rejects navigation when the execution application changes during authorization read', async () => {
    saveExecutionScope('APP-A')
    const authorization = deferred<Awaited<ReturnType<typeof lowcodeApi.blueprint.readNavigationAuthorization>>>()
    const authorizationRead = vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockReturnValue(authorization.promise)

    const navigation = readLowcodeRuntimeNavigation()
    await vi.waitFor(() => expect(authorizationRead).toHaveBeenCalledOnce())
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
    const readApplication = vi.spyOn(applicationCatalogReader, 'read').mockResolvedValue(application('APP-B'))
    const listApplications = vi.spyOn(lowcodeApi.platform, 'listApplications')
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')
    const authorization = vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockResolvedValue({ items: [], contexts: [] })

    const navigation = await readLowcodeRuntimeNavigation('APP-B')

    expect(readApplication).toHaveBeenCalledOnce()
    expect(readApplication).toHaveBeenCalledWith('APP-B', expect.any(Function))
    expect(listApplications).not.toHaveBeenCalled()
    expect(resolveRoot).toHaveBeenCalledWith('APP-B')
    expect(authorization).toHaveBeenCalledWith('APP-B', 'ROOT-B')
    expect(navigation).toMatchObject({projectId: 'APP-B', title: 'APP-B'})
    expect(lowcodeApi.application.get()?.application.id).toBe('APP-A')
  })

  it('reads explicit target navigation through its scoped DataView while authorization stays independent', async () => {
    saveExecutionScope('APP-A')
    applicationCatalogReader.read.mockResolvedValue(application('APP-B'))
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')
    const row: DataRow = {rowid: 'NODE-B', SysId: 'APP-B', prowid: '000000', FunOrderValue: 1, name: 'Page B', FunName: 'Page B',
      conType: 'Navitem', NavigationUrl: 'vue:dashboard', IsShowAtNav: 1}
    vi.mocked(loadLowcodeRuntimeScenario).mockImplementation(async () => createNavigationDataSet({rows: [row]}).dataSet)
    const records = vi.spyOn(lowcodeApi.blueprint, 'readRecords')
    const authorization = vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization')
      .mockResolvedValue({items: [{id: 'NODE-B', target: 'vue:dashboard', targetKind: 'vue', formKey: null, children: []}], contexts: []})

    const navigation = await readLowcodeRuntimeNavigation('APP-B')

    expect(loadLowcodeRuntimeScenario).toHaveBeenCalledWith({projectId: 'APP-A', scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY})
    expect(lastNavigationDataSet?.filters[0]).toMatchObject({field: 'SysId', operator: 'eq', value: 'APP-B'})
    expect(JSON.stringify(lastNavigationDataSet?.filters[0])).toContain('APP-B')
    expect(lowcodeApi.readRequestScope().headers['X-AppId']).toBe('APP-A')
    expect(records).not.toHaveBeenCalled()
    expect(resolveRoot).toHaveBeenCalledWith('APP-B')
    expect(authorization).toHaveBeenCalledWith('APP-B', 'ROOT-B')
    expect(lowcodeApi.application.get()?.application.id).toBe('APP-A')
    expect(navigation.items.some(item => item.id === 'NODE-B')).toBe(true)
  })

  it('preserves application directory reader errors without a legacy list fallback', async () => {
    saveExecutionScope('APP-A')
    const readApplication = vi.spyOn(applicationCatalogReader, 'read').mockRejectedValue(new Error('formal app catalog query failed'))
    const listApplications = vi.spyOn(lowcodeApi.platform, 'listApplications')
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId')

    await expect(readLowcodeRuntimeNavigation('APP-B')).rejects.toThrow('formal app catalog query failed')

    expect(readApplication).toHaveBeenCalledOnce()
    expect(listApplications).not.toHaveBeenCalled()
    expect(resolveRoot).not.toHaveBeenCalled()
  })

  it('rejects an execution-app change while the by-ID directory reader is pending', async () => {
    saveExecutionScope('APP-A')
    const pendingApplication = deferred<unknown>()
    const readApplication = vi.spyOn(applicationCatalogReader, 'read').mockReturnValue(pendingApplication.promise)
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId')
    const navigation = readLowcodeRuntimeNavigation('APP-B')
    if (!await expectApplicationReaderStarted(navigation)) return

    lowcodeApi.application.save({application: application('APP-C'), navigationRootId: 'ROOT-C'})
    pendingApplication.resolve(application('APP-B'))

    await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(resolveRoot).not.toHaveBeenCalled()
  })

  it('waits for the DataView read before disposal when authorization fails and execution scope changes', async () => {
    saveExecutionScope('APP-A')
    const queryGate = deferred<void>()
    let startQuery!: () => void
    const queryStarted = new Promise<void>(resolve => {startQuery = resolve})
    const fixture = createNavigationDataSet({beforeQuery: async () => {startQuery(); await queryGate.promise}})
    vi.mocked(loadLowcodeRuntimeScenario).mockResolvedValue(fixture.dataSet)
    const authorization = deferred<Awaited<ReturnType<typeof lowcodeApi.blueprint.readNavigationAuthorization>>>()
    vi.spyOn(lowcodeApi.blueprint, 'readNavigationAuthorization').mockReturnValue(authorization.promise)
    const runtimeDispose = vi.spyOn(PageRuntime.prototype, 'dispose')
    const ownerDispose = vi.spyOn(BlueprintWorkspaceDataView.prototype, 'dispose')

    const navigation = readLowcodeRuntimeNavigation()
    await queryStarted
    authorization.reject(new Error('authorization read failed'))
    await Promise.resolve()
    expect(runtimeDispose).not.toHaveBeenCalled()
    expect(ownerDispose).not.toHaveBeenCalled()
    saveExecutionScope('APP-B')
    queryGate.resolve()

    await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(runtimeDispose).toHaveBeenCalledOnce()
    expect(ownerDispose).toHaveBeenCalledOnce()
    expect(fixture.dataSet.destroyed).toBe(true)
  })

  it('does not let a late application catalog overwrite a newer activation intent', async () => {
    saveExecutionScope('APP-OLD')
    const appA = application('APP-A')
    const appB = application('APP-B')
    const applicationsA = deferred<unknown>()
    const applicationsB = deferred<unknown>()
    const rootB = deferred<string>()
    const readApplication = vi.spyOn(applicationCatalogReader, 'read')
      .mockReturnValueOnce(applicationsA.promise)
      .mockReturnValueOnce(applicationsB.promise)
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockImplementation((id) => (
      id === 'APP-B' ? rootB.promise : Promise.resolve('ROOT-A')
    ))

    const activationA = activateLowcodeApplication('APP-A')
    const activationB = activateLowcodeApplication('APP-B')
    applicationsB.resolve(appB)
    await vi.waitFor(() => expect(resolveRoot).toHaveBeenCalledWith('APP-B'))
    applicationsA.resolve(appA)

    await expect(activationA).rejects.toThrow('LOWCODE_APPLICATION_SELECTION_STALE')
    expect(resolveRoot).toHaveBeenCalledTimes(1)
    rootB.resolve('ROOT-B')
    await expect(activationB).resolves.toMatchObject({ application: appB, navigationRootId: 'ROOT-B' })
    expect(lowcodeApi.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
    expect(readApplication).toHaveBeenCalledTimes(2)
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

    const applicationRead = deferred<unknown>()
    const readApplication = vi.spyOn(applicationCatalogReader, 'read').mockReturnValue(applicationRead.promise)
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-APP-B')
    const staleNavigation = router.push('/t/fixture-tenant/APP-B/dashboard?from=activation')
    await vi.waitFor(() => expect(readApplication).toHaveBeenCalledOnce())

    await router.push(`/t/fixture-tenant/APP-A/dashboard?view=latest&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)
    applicationRead.resolve(application('APP-B'))
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

    const applicationRead = deferred<unknown>()
    const readApplication = vi.spyOn(applicationCatalogReader, 'read').mockReturnValue(applicationRead.promise)
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-APP-B')
    const externalActivation = activateLowcodeApplication('APP-B')
    await vi.waitFor(() => expect(readApplication).toHaveBeenCalledOnce())

    await router.push(`/t/fixture-tenant/APP-A/dashboard?view=latest&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=dashboard`)
    applicationRead.resolve(application('APP-B'))
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

    vi.spyOn(applicationCatalogReader, 'read').mockResolvedValue(application('APP-A'))
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
    vi.spyOn(applicationCatalogReader, 'read').mockResolvedValue(appB)
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
    vi.spyOn(applicationCatalogReader, 'read').mockResolvedValue(appB)
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
      const applicationRead = deferred<unknown>()
      const list = vi.spyOn(applicationCatalogReader, 'read').mockReturnValue(applicationRead.promise)
      const root = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId')
      const activation = activateLowcodeApplication('APP-B')
      await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())

      if (change === 'application-clear') lowcodeApi.application.clear()
      else {
        lowcodeApi.session.clear()
        saveExecutionScope('APP-OLD')
      }
      applicationRead.resolve(appB)

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
    const applicationRead = deferred<unknown>()
    vi.spyOn(applicationCatalogReader, 'read').mockReturnValue(applicationRead.promise)
    vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')
    const activation = activateLowcodeApplication('APP-B')
    await vi.waitFor(() => expect(applicationCatalogReader.read).toHaveBeenCalledOnce())
    lowcodeApi.session.save({ ...originalSession, accessToken: 'fixture-refreshed-access' })
    applicationRead.resolve(appB)

    await expect(activation).resolves.toMatchObject({ application: appB, navigationRootId: 'ROOT-B' })
    expect(lowcodeApi.application.get()).toEqual({ application: appB, navigationRootId: 'ROOT-B' })
  })

  it('stops after a pending target lookup invalidates the execution scope', async () => {
    saveExecutionScope('APP-A')
    const deferredApplication = deferred<unknown>()
    applicationCatalogReader.read.mockReturnValue(deferredApplication.promise)
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId')
    const records = vi.spyOn(lowcodeApi.blueprint, 'readRecords')

    const navigation = readLowcodeRuntimeNavigation('APP-B')
    await vi.waitFor(() => expect(applicationCatalogReader.read).toHaveBeenCalledOnce())
    lowcodeApi.application.save({ application: application('APP-B'), navigationRootId: 'ROOT-B' })
    deferredApplication.resolve(application('APP-B'))

    await expect(navigation).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(resolveRoot).not.toHaveBeenCalled()
    expect(records).not.toHaveBeenCalled()
  })

  it('stops before blueprint reads when navigation-root resolution becomes stale', async () => {
    saveExecutionScope('APP-A')
    vi.spyOn(applicationCatalogReader, 'read').mockResolvedValue(application('APP-B'))
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
    const deferredApplication = deferred<unknown>()
    applicationCatalogReader.read.mockReturnValue(deferredApplication.promise)
    const resolveRoot = vi.spyOn(lowcodeApi.platform, 'resolveNavigationRootId').mockResolvedValue('ROOT-B')

    const navigation = readLowcodeRuntimeNavigation('APP-B')
    await vi.waitFor(() => expect(applicationCatalogReader.read).toHaveBeenCalledOnce())
    lowcodeApi.application.save({ application: application('APP-B'), navigationRootId: 'ROOT-B' })
    deferredApplication.resolve(application('APP-B'))

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

  it('passes only a configured Vue page dataSpaceId to the system-page navigation item', () => {
    const pages = VuePageRegistry.getVuePageOptions()
    const configuredScenarioId = 'FORM-EXPLICIT-1'
    vi.spyOn(VuePageRegistry, 'getVuePageOptions').mockReturnValue(pages.map(page => page.path === '/settings'
      ? {...page, dataSpaceId: configuredScenarioId}
      : page))

    const navigation = lowcodeApplicationCatalogNavigation()
    const configured = navigation.items.find(item => item.path === '/settings')
    const unconfigured = navigation.items.find(item => item.path === '/app-list')

    expect(configured?.blueprintScenarioId).toBe(configuredScenarioId)
    expect(unconfigured?.blueprintScenarioId).toBeUndefined()
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
