import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, KeepAlive, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../../../packages/spark-app/src/router/dynamic'
import { setDynamicRouter } from '../../../packages/spark-app/src/navigation/nav-access'
import { useTabPages } from '../../../packages/spark-app/src/navigation/useTabPages'

describe('page call tabs and retained renderer instances', () => {
  it('keeps distinct calls across native pages and twelve tabs, rejects dirty closes, and preserves aborted navigation', async () => {
    const mounted = vi.fn()
    const Page = defineComponent({ name: 'CallBody', props: ['pageRuntime'], setup() {
      const count = ref(0)
      onMounted(mounted)
      return () => h('button', { onClick: () => { count.value++ } }, `count:${count.value}`)
    } })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/native', component: { render: () => h('p', 'native') }, meta: { title: 'Native', type: 'system-page' } },
    ] })
    const owner = createDynamicRouter({ router, pageComponent: Page,
      readPageFile: async () => '',
      loadNavigation: async () => ({ title: 'App', childPlacement: 'header', items: [
        { id: 'tool-node', title: 'Tool', itemKind: 'page', path: '/__page/tool-node', tool: { pageId: 'tool', projectId: 'APP' } },
      ] }),
    })
    await owner.registerRoutes()
    setDynamicRouter(owner)
    await router.push('/__page/tool-node?value=0')
    let controls: ReturnType<typeof useTabPages> | undefined
    const Host = defineComponent({ setup() {
      const tabs = useTabPages()
      controls = tabs
      const view = computed(() => owner.getPageRuntimeView(router.currentRoute.value))
      const names = computed(() => tabs.tabs.value.flatMap(tab => tab.runtimeName ? [tab.runtimeName] : []))
      return () => h('div', [h(KeepAlive, { include: names.value }, () => view.value ? h(view.value) : null),
        !view.value ? h('p', 'native') : null])
    } })
    const wrapper = mount(Host, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('button').trigger('click')
    const first = owner.getPageRuntime(router.currentRoute.value)
    if (!first || !controls) throw new Error('missing call controls')
    await router.push('/native')
    await flushPromises()
    for (let index = 1; index < 12; index++) {
      await router.push(`/__page/tool-node?value=${index}`)
      await flushPromises()
    }
    expect(owner.getPageRuntimeNames()).toHaveLength(12)
    expect(mounted).toHaveBeenCalledTimes(12)
    await controls.switchTo(first.instanceId)
    await flushPromises()
    expect(wrapper.get('button').text()).toBe('count:1')
    expect(mounted).toHaveBeenCalledTimes(12)
    const dirty = vi.spyOn(first, 'isDirty', 'get').mockReturnValue(true)
    await expect(controls.closeTab(first.instanceId)).rejects.toThrow('未保存')
    expect(controls.tabs.value.some(tab => tab.id === first.instanceId)).toBe(true)
    expect(first.destroyed).toBe(false)
    dirty.mockRestore()
    const cancel = router.beforeEach(() => false)
    await expect(controls.closeTab(first.instanceId)).rejects.toThrow('取消')
    expect(first.destroyed).toBe(false)
    expect(controls.tabs.value.some(tab => tab.id === first.instanceId)).toBe(true)
    cancel()
    await controls.closeTab(first.instanceId)
    await flushPromises()
    expect(first.destroyed).toBe(true)
    expect(controls.tabs.value.some(tab => tab.id === first.instanceId)).toBe(false)
    wrapper.unmount()
    owner.disposePageRuntimes()
  })
})
