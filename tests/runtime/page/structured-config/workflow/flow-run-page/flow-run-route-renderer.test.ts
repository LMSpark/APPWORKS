import {describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, useRoute} from 'vue-router'
import FlowRunRouteRenderer from '@/views/features/workflow/flow-runtime/run-page/ui/flow-run-route-renderer.vue'

vi.mock('@spark-appworks/spark-component', () => ({DisplayAlert: defineComponent({template: '<div />'})}))

describe('embedded workflow business route', () => {
  it('passes fallback workflow context and lets explicit business query values override it', async () => {
    const Child = defineComponent({
      props: ['flowid', 'flowobjid', 'stepid', 'workFormId', 'pageParam', 'busRowid'],
      setup(props) {return () => h('p', JSON.stringify(props))},
    })
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/business', component: Child}]})
    await router.push('/business')
    const wrapper = mount(FlowRunRouteRenderer, {props: {
      route: router.resolve('/business?busRowid=explicit'), cacheKey: 'context', tabKey: 'form', registry: {set: vi.fn()},
      fallbackProps: {flowid: 'model', flowobjid: 'instance', stepid: 'step', workFormId: 'form', pageParam: 'saved', busRowid: 'fallback'},
    }, global: {plugins: [router]}})
    try {
      await flushPromises()
      expect(JSON.parse(wrapper.text())).toEqual({flowid: 'model', flowobjid: 'instance', stepid: 'step', workFormId: 'form', pageParam: 'saved', busRowid: 'explicit'})
    } finally {wrapper.unmount()}
  })

  it('registers exposed business callbacks and removes them when unmounted', async () => {
    const flowSubmit = vi.fn(() => true)
    const Child = defineComponent({setup(_props, {expose}) {expose({flowSubmit}); return () => h('p', 'business')}})
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/business', component: Child}]})
    await router.push('/business')
    const registry = {set: vi.fn()}
    const wrapper = mount(FlowRunRouteRenderer, {props: {route: router.resolve('/business'), cacheKey: 'business', tabKey: 'form', registry}, global: {plugins: [router]}})
    await flushPromises()
    expect(registry.set).toHaveBeenLastCalledWith('form', expect.objectContaining({flowSubmit}))
    wrapper.unmount()
    expect(registry.set).toHaveBeenLastCalledWith('form', null)
  })

  it('provides the business route to a real child and updates it when the target changes', async () => {
    const Child = defineComponent({setup() {const route = useRoute(); return () => h('p', `${route.path}:${String(route.query['rowid'])}`)}})
    const router = createRouter({history: createMemoryHistory(), routes: [
      {path: '/run', component: Child},
      {path: '/business', component: Child},
    ]})
    await router.push('/run?rowid=outer')
    await router.isReady()
    const wrapper = mount(FlowRunRouteRenderer, {props: {
      route: router.resolve('/business?rowid=first'), cacheKey: 'first', tabKey: 'form', registry: {set: vi.fn()},
    }, global: {plugins: [router]}})
    try {
      await flushPromises()
      expect(wrapper.text()).toBe('/business:first')
      await wrapper.setProps({route: router.resolve('/business?rowid=second'), cacheKey: 'second'})
      await flushPromises()
      expect(wrapper.text()).toBe('/business:second')
      await wrapper.setProps({route: router.resolve('/business'), cacheKey: 'third'})
      await flushPromises()
      expect(wrapper.text()).toBe('/business:undefined')
      expect(router.currentRoute.value.fullPath).toBe('/run?rowid=outer')
    } finally {wrapper.unmount()}
  })
})
