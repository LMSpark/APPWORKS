import {afterEach, describe, expect, it} from 'vitest'
import {createMemoryHistory, createRouter} from 'vue-router'
import {buildComponentMap, getVuePageRouteAliases} from '@/registries/vue-page-registry'
import {createDynamicRouter} from '../../../packages/spark-app/src/router/dynamic'
import {SystemPageIdentityResolver} from '../../../packages/spark-app/src/router/system-page-identity/system-page-identity-resolver'
import type {RuntimeNavigation, RuntimeNavigationItem} from '@spark-appworks/spark-app'
import {DATABASE_TABLE_VIEW_SCENARIO_ID} from '../page/database/database-table-view.fixture'

const CANONICAL_PATH = '/features/data-platform/database-management/table-and-view/ui/table-and-view-page'
const LEGACY_PATH = '/DataBaseManage/TableAndView'
const TENANT_PREFIX = '/t/:tenantId/:projectId'
const TABLE_VIEW_NODE_ID = 'table-view-target'

const hosts: Array<ReturnType<typeof createDynamicRouter>> = []

afterEach(() => {
  hosts.splice(0).forEach(dynamic => dynamic.resetSystemPageInstances())
})

function formalTableViewNode(): RuntimeNavigationItem {
  return {
    id: TABLE_VIEW_NODE_ID,
    title: '表和视图管理',
    itemKind: 'system-page',
    path: CANONICAL_PATH,
    blueprintScenarioId: DATABASE_TABLE_VIEW_SCENARIO_ID,
  }
}

function rootNavigation(items: RuntimeNavigationItem[]): RuntimeNavigation {
  return {id: 'metadata-app', projectId: 'APP', title: 'Metadata', childPlacement: 'sidebar', items}
}

async function setup(loadNavigation: () => Promise<RuntimeNavigation>) {
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const componentMap = await buildComponentMap()
  const componentAliases = getVuePageRouteAliases()
  expect(componentMap[CANONICAL_PATH]).toBeDefined()
  const dynamic = createDynamicRouter({router, pageComponent: componentMap[CANONICAL_PATH]!, componentMap,
    componentAliases, tenantPathPrefix: TENANT_PREFIX, loadNavigation})
  hosts.push(dynamic)
  return {router, dynamic}
}

describe('database TableAndView legacy Router alias', () => {
  it('declares the legacy path as an explicit alias of the canonical Vue page registry entry', async () => {
    const componentMap = await buildComponentMap()
    expect(componentMap[CANONICAL_PATH]).toBeDefined()
    expect(getVuePageRouteAliases()[CANONICAL_PATH]).toEqual([LEGACY_PATH])
  })

  it('resolves canonical and legacy paths through one formal owner while isolating databaseId instances', async () => {
    const {router, dynamic} = await setup(async () => rootNavigation([formalTableViewNode()]))
    await dynamic.registerRoutes()

    const canonicalRoutePath = `/t/TENANT/APP${CANONICAL_PATH}`
    const legacyRoutePath = `/t/TENANT/APP${LEGACY_PATH}`
    const canonicalRecord = router.getRoutes().find(route => route.path === TENANT_PREFIX + CANONICAL_PATH)
    const aliasRecord = router.getRoutes().find(route => route.path === TENANT_PREFIX + LEGACY_PATH)
    expect(aliasRecord, 'the declared legacy path must be a Vue Router alias route').toBeDefined()
    expect(aliasRecord?.aliasOf?.path).toBe(canonicalRecord?.path)
    const resolvedAlias = router.resolve(`${legacyRoutePath}?databaseId=DB-A`)
    expect(resolvedAlias.path).toBe(legacyRoutePath)
    expect(resolvedAlias.matched[0]?.path).toBe(TENANT_PREFIX + LEGACY_PATH)
    expect(resolvedAlias.matched[0]?.aliasOf?.path).toBe(canonicalRecord?.path)

    let canonicalInstanceId: string | undefined
    for (const [path, databaseId] of [[canonicalRoutePath, 'DB-CANONICAL'], [legacyRoutePath, 'DB-A']] as const) {
      const navigationFailure = await router.push(`${path}?databaseId=${databaseId}`)
      expect(navigationFailure).toBeUndefined()
      const route = router.currentRoute.value
      expect(route.path).toBe(path)
      expect(route.fullPath).toBe(`${path}?databaseId=${databaseId}`)
      expect(route.matched[0]?.aliasOf?.path).toBe(databaseId === 'DB-A' ? canonicalRecord?.path : undefined)
      expect(route.matched[0]?.meta['systemPageIdentityPath']).toBe(TENANT_PREFIX + CANONICAL_PATH)
      const instance = dynamic.getSystemPageInstance(route)
      expect(route.query['databaseId']).toBe(databaseId)
      expect(route.meta['nodeId']).toBe(TABLE_VIEW_NODE_ID)
      expect(route.meta['blueprintScenarioId']).toBe(DATABASE_TABLE_VIEW_SCENARIO_ID)
      expect(route.meta['systemPageIdentityPath']).toBe(TENANT_PREFIX + CANONICAL_PATH)
      expect(instance).toBeDefined()
      if (databaseId === 'DB-CANONICAL') canonicalInstanceId = instance?.instanceId
      expect(SystemPageIdentityResolver.forRouter(router).resolveComponent(route)).toBe(instance?.view)
    }

    await router.push(`${legacyRoutePath}?databaseId=DB-A`)
    const databaseA = dynamic.getSystemPageInstance(router.currentRoute.value)
    expect(databaseA?.instanceId).not.toBe(canonicalInstanceId)
    await router.push(`${legacyRoutePath}?databaseId=DB-B`)
    const databaseB = dynamic.getSystemPageInstance(router.currentRoute.value)
    expect(router.currentRoute.value.query['databaseId']).toBe('DB-B')
    expect(databaseB?.instanceId).not.toBe(databaseA?.instanceId)
    await router.push(`${legacyRoutePath}?databaseId=DB-A`)
    const restoredDatabaseA = dynamic.getSystemPageInstance(router.currentRoute.value)
    expect(router.currentRoute.value.path).toBe(legacyRoutePath)
    expect(router.currentRoute.value.query['databaseId']).toBe('DB-A')
    expect(restoredDatabaseA?.instanceId).toBe(databaseA?.instanceId)
  })

  it('allows multiple formal owners of the same canonical page path to share its alias', async () => {
    const secondOwner = {...formalTableViewNode(), id: 'table-view-target-2', title: '表和视图管理副入口'}
    const {router, dynamic} = await setup(async () => rootNavigation([formalTableViewNode(), secondOwner]))
    await expect(dynamic.registerRoutes()).resolves.toBeUndefined()
    expect(router.getRoutes().filter(route => route.path === TENANT_PREFIX + LEGACY_PATH)).toHaveLength(1)
  })

  it('resolves the shared legacy alias only when navigation supplies the selected formal owner marker', async () => {
    const secondOwner = {...formalTableViewNode(), id: 'table-view-target-2', title: '表和视图管理副入口'}
    const {router, dynamic} = await setup(async () => rootNavigation([formalTableViewNode(), secondOwner]))
    await dynamic.registerRoutes()
    const legacyRoutePath = `/t/TENANT/APP${LEGACY_PATH}`
    await router.push(`${legacyRoutePath}?databaseId=DB-A`)
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    expect(router.currentRoute.value.meta['systemPageIdentityError']).toMatch(/多个导航项/)
    await router.push(`${legacyRoutePath}?databaseId=DB-A&__sparkNavigationId=${TABLE_VIEW_NODE_ID}`)
    expect(router.currentRoute.value.meta['nodeId']).toBe(TABLE_VIEW_NODE_ID)
    expect(router.currentRoute.value.meta['blueprintScenarioId']).toBe(DATABASE_TABLE_VIEW_SCENARIO_ID)
    expect(router.currentRoute.value.query['databaseId']).toBe('DB-A')
  })

  it('does not create a legacy alias when no formal TableAndView owner is present', async () => {
    const {router, dynamic} = await setup(async () => rootNavigation([]))
    await dynamic.registerRoutes()

    const legacyRoutePath = `/t/TENANT/APP${LEGACY_PATH}`
    expect(router.resolve(`${legacyRoutePath}?databaseId=DB-A`).matched).toHaveLength(0)
    await router.push(`${legacyRoutePath}?databaseId=DB-A`)
    expect(router.currentRoute.value.matched).toHaveLength(0)
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)).toBeUndefined()
  })

  it('rejects a formal route that conflicts with the declared legacy alias', async () => {
    const conflict: RuntimeNavigationItem = {
      id: 'legacy-path-owner', title: '冲突节点', itemKind: 'system-page', path: LEGACY_PATH,
      blueprintScenarioId: 'CONFLICTING-SPACE',
    }
    const {router, dynamic} = await setup(async () => rootNavigation([formalTableViewNode(), conflict]))

    await expect(dynamic.registerRoutes()).rejects.toThrow(/alias|别名|冲突/i)
    expect(router.getRoutes().some(route => route.path === TENANT_PREFIX + LEGACY_PATH)).toBe(false)
  })

  it('removes the legacy alias when a route refresh removes its formal owner', async () => {
    let current = rootNavigation([formalTableViewNode()])
    const {router, dynamic} = await setup(async () => current)
    await dynamic.registerRoutes()
    const legacyRoutePath = `/t/TENANT/APP${LEGACY_PATH}`
    const aliasRecord = router.getRoutes().find(route => route.path === TENANT_PREFIX + LEGACY_PATH)
    expect(aliasRecord?.aliasOf?.path).toBe(TENANT_PREFIX + CANONICAL_PATH)

    current = rootNavigation([])
    await dynamic.refreshRoutes()
    expect(router.getRoutes().some(route => route.path === legacyRoutePath)).toBe(false)
    expect(router.resolve(`${legacyRoutePath}?databaseId=DB-A`).matched).toHaveLength(0)
    expect(dynamic.getRegisteredRoutes()).not.toContain(legacyRoutePath)
  })
})
