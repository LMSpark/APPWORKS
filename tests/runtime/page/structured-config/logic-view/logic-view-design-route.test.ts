import {afterEach, describe, expect, it} from 'vitest'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter} from 'vue-router'
import {SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import type {RuntimeNavigationItem} from '@spark-appworks/spark-app'
import {createDynamicRouter} from '../../../../../packages/spark-app/src/router/dynamic'

const LIST = '/features/data-platform/structured-config/logic-view/ui/logic-view-list-page'
const DESIGN = '/features/data-platform/structured-config/logic-view/ui/logic-view-design-page'
const PREFIX = '/apps/:projectId'
const listPage = defineComponent({name: 'LogicList', setup: () => () => h('p', 'list')})
const designPage = defineComponent({name: 'LogicDesign', setup: () => () => h('p', 'design')})
const hosts: Array<ReturnType<typeof createDynamicRouter>> = []

afterEach(() => {hosts.splice(0).forEach(dynamic => dynamic.resetSystemPageInstances())})

function node(id: string, path: string, scenario: string): RuntimeNavigationItem {
  return {id, title: id, itemKind: 'system-page', path, blueprintScenarioId: scenario}
}

async function open(items: readonly RuntimeNavigationItem[]) {
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({
    router, pageComponent: listPage,
    componentMap: {[LIST]: listPage, [DESIGN]: designPage},
    applicationPathPrefix: PREFIX,
    systemPageIdentityCompanions: [{path: DESIGN, hostPath: LIST}],
    loadNavigation: async () => ({id: 'root', projectId: 'APP', title: 'Root', childPlacement: 'header', items: [...items]}),
  })
  hosts.push(dynamic)
  await dynamic.registerRoutes()
  return router
}

describe('logic view design route', () => {
  it('uses only the selected list node and keeps the route matched when identity fails', async () => {
    const router = await open([
      node('list-a', LIST, 'SPACE-A'),
      node('list-b', LIST, 'SPACE-B'),
      node('other', '/features/other', 'OTHER'),
    ])
    const designPath = `/apps/APP${DESIGN}`
    expect(router.getRoutes().filter(route => route.path === `${PREFIX}${DESIGN}`)).toHaveLength(1)

    await router.push(`${designPath}?viewId=V1&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=list-a`)
    expect(router.currentRoute.value.matched.length).toBeGreaterThan(0)
    expect(router.currentRoute.value.meta['nodeId']).toBe('list-a')
    expect(router.currentRoute.value.meta['blueprintScenarioId']).toBe('SPACE-A')

    await router.push(`${designPath}?viewId=V1`)
    expect(router.currentRoute.value.matched.length).toBeGreaterThan(0)
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    expect(router.currentRoute.value.meta['blueprintScenarioId']).toBeUndefined()

    await router.push(`${designPath}?viewId=V1&${SYSTEM_PAGE_NAVIGATION_ID_QUERY}=other`)
    expect(router.currentRoute.value.matched.length).toBeGreaterThan(0)
    expect(router.currentRoute.value.meta['systemPageIdentityState']).toBe('error')
    expect(router.currentRoute.value.meta['nodeId']).toBeUndefined()
    expect(router.currentRoute.value.meta['blueprintScenarioId']).toBeUndefined()
  })
})
