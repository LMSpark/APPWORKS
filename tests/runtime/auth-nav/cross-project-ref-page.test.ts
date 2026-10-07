import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import { CrossProjectRefPage, createCrossProjectRefRouteProps } from '../../../packages/spark-app/src/router/cross-project-ref-page'

const navState = vi.hoisted((): { tree: RuntimeNavigation | null } => ({ tree: null }))
vi.mock('../../../packages/spark-app/src/navigation/nav-access', () => ({ getNavTree: () => navState.tree }))

async function setup(target?: string) {
  navState.tree = { id: 'root', title: 'root', childPlacement: 'sidebar', items: [{ id: 'ref-node', title: 'Orders', itemKind: 'ref', ...(target ? { refPath: target } : {}) }] }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/t/:tenantId/:projectId/__ref/:refNodeId', component: CrossProjectRefPage, props: createCrossProjectRefRouteProps(), meta: { type: 'cross-project-ref' } },
    { path: '/t/:tenantId/:projectId/__tool/:pageId', component: { template: '<div />' } },
  ] })
  await router.push('/t/T/HOST/__ref/ref-node?scenarioId=CALL&additionalScenarioIds=A&additionalScenarioIds=B&bare&blank=#caller')
  await router.isReady()
  return { router, open: () => mount(CrossProjectRefPage, { props: { route: router.currentRoute.value }, global: { plugins: [router] } }) }
}

describe('CrossProjectRefPage uses the shared route factory', () => {
  beforeEach(() => { navState.tree = null })
  it('redirects to the explicit tool, preserving call parameters and target overrides', async () => {
    const { router, open } = await setup('@app:TARGET/__tool/orders?scenarioId=TARGET-SCENE#target')
    const wrapper = open()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/t/T/TARGET/__tool/orders')
    expect(router.currentRoute.value.query).toEqual({ scenarioId: 'TARGET-SCENE', additionalScenarioIds: ['A', 'B'], bare: null, blank: '' })
    expect(router.currentRoute.value.hash).toBe('#target')
    wrapper.unmount()
  })
  it('fails without guessing a tool from the reference ID', async () => {
    const { router, open } = await setup()
    const wrapper = open()
    await flushPromises()
    expect(wrapper.text()).toContain('缺少明确调用目标')
    expect(router.currentRoute.value.path).toBe('/t/T/HOST/__ref/ref-node')
    wrapper.unmount()
  })
  it('keeps the original route when navigation is rejected', async () => {
    const { router, open } = await setup('@app:TARGET/__tool/orders')
    router.beforeEach(to => to.params['projectId'] === 'TARGET' ? false : undefined)
    const wrapper = open()
    await flushPromises()
    expect(wrapper.text()).toContain('引用导航未完成')
    expect(router.currentRoute.value.params['projectId']).toBe('HOST')
    wrapper.unmount()
  })
})
