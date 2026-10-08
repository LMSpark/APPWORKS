import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, KeepAlive, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../../../../packages/spark-app/src/router/dynamic'
import { setDynamicRouter } from '../../../../packages/spark-app/src/navigation/nav-access'
import { useTabPages } from '../../../../packages/spark-app/src/navigation/useTabPages'
import { Spark, SparkPageRenderer } from '@spark-appworks/spark-component'
import { SparkData } from '@spark-appworks/spark-data'

describe('page call tabs and retained renderer instances', () => {
  it('keeps distinct calls across native pages and twelve tabs, rejects dirty closes, and preserves aborted navigation', async () => {
    const mounted = vi.fn()
    const Page = defineComponent({ name: 'CallBody', props: ['pageRuntime', 'routeSnapshot'], setup(props) {
      const count = ref(0)
      onMounted(mounted)
      return () => h('div', [h(SparkPageRenderer, { pageRuntime: props.pageRuntime, routeSnapshot: props.routeSnapshot }),
        h('button', { onClick: () => { count.value++ } }, `count:${count.value}`)])
    } })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/native', component: { render: () => h('p', 'native') }, meta: { title: 'Native', type: 'system-page' } },
    ] })
    const owner = createDynamicRouter({ router, pageComponent: Page,
      readPageFile: async ({ fileName }) => fileName === 'rule.json' ? '[]' : '',
      loadScenario: async ({ scenarioId }) => SparkData.createDataSet({ dataSetName: 'PageData', scenarioId, tables: {
        Users: { tableName: 'Users', columns: [{ name: 'id', type: 'string' }, { name: 'name', type: 'string' }],
          views: { default: { rows: [{ id: 'u-1', name: 'Original' }] } } },
      } }),
      loadNavigation: async () => ({ title: 'App', childPlacement: 'header', items: [
        { id: 'tool-node', title: 'Tool', itemKind: 'page', path: '/__page/tool-node', tool: { pageId: 'tool', projectId: 'APP' } },
      ] }),
    })
    await owner.registerRoutes()
    setDynamicRouter(owner)
    await router.push('/__page/tool-node?value=0&scenarioId=SCENE')
    let controls: ReturnType<typeof useTabPages> | undefined
    const Host = defineComponent({ setup() {
      const tabs = useTabPages()
      controls = tabs
      const view = computed(() => owner.getPageRuntimeView(router.currentRoute.value))
      const names = computed(() => tabs.tabs.value.flatMap(tab => tab.runtimeName ? [tab.runtimeName] : []))
      return () => h('div', [h(KeepAlive, { include: names.value }, () => view.value ? h(view.value) : null),
        !view.value ? h('p', 'native') : null])
    } })
    const wrapper = mount(Host, { global: { plugins: [Spark.createPlugin(), router] } })
    await flushPromises()
    await wrapper.get('button').trigger('click')
    const first = owner.getPageRuntime(router.currentRoute.value)
    if (!first || !controls) throw new Error('missing call controls')
    expect(first.call.scenarioIds).toEqual(['SCENE'])
    await first.load()
    const scenarioId = first.call.scenarioIds[0]
    if (!scenarioId) throw new Error('missing runtime scenario identity')
    const firstView = first.getDataSet(scenarioId)?.tables['Users']?.getView('default')
    if (!firstView) throw new Error('missing first runtime DataView')
    await router.push('/__page/tool-node?value=1&scenarioId=SCENE')
    await flushPromises()
    await controls.switchTo(first.instanceId)
    await flushPromises()
    const cancel = router.beforeEach(() => false)
    await expect(controls.closeTab(first.instanceId)).rejects.toThrow('取消')
    expect(first.destroyed).toBe(false)
    expect(controls.tabs.value.some(tab => tab.id === first.instanceId)).toBe(true)
    cancel()
    firstView.updateEditingValue('u-1', 'name', 'unsaved draft')
    expect(first.isDirty).toBe(true)
    await router.push('/native')
    await flushPromises()
    for (let index = 2; index < 12; index++) {
      await router.push(`/__page/tool-node?value=${index}&scenarioId=SCENE`)
      await flushPromises()
    }
    expect(owner.getPageRuntimeNames()).toHaveLength(12)
    expect(mounted).toHaveBeenCalledTimes(12)
    await controls.switchTo(first.instanceId)
    await flushPromises()
    expect(wrapper.get('button').text()).toBe('count:1')
    expect(owner.getPageRuntime(router.currentRoute.value)).toBe(first)
    expect(first.getDataSet(scenarioId)?.tables['Users']?.getView('default')).toBe(firstView)
    expect(firstView.getEditingPatch('u-1')).toEqual({ name: 'unsaved draft' })
    expect(mounted).toHaveBeenCalledTimes(12)
    await expect(controls.closeTab(first.instanceId)).rejects.toThrow('未保存')
    expect(controls.tabs.value.some(tab => tab.id === first.instanceId)).toBe(true)
    expect(first.destroyed).toBe(false)
    firstView.discardEditingRows()
    expect(first.isDirty).toBe(false)
    await controls.closeTab(first.instanceId)
    await flushPromises()
    expect(first.destroyed).toBe(true)
    expect(controls.tabs.value.some(tab => tab.id === first.instanceId)).toBe(false)
    wrapper.unmount()
    owner.disposePageRuntimes()
  })
})
