import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, KeepAlive, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../../../../packages/spark-app/src/router/dynamic'
import { PageRuntimePool, type PageRuntimePoolOptions } from '../../../../packages/spark-app/src/router/page-runtime-pool'
import { setDynamicRouter } from '../../../../packages/spark-app/src/navigation/nav-access'
import { useTabPages } from '../../../../packages/spark-app/src/navigation/useTabPages'
import { Spark, SparkPageRenderer } from '@spark-appworks/spark-component'
import { SparkData } from '@spark-appworks/spark-data'

describe('page call tabs and retained renderer instances', () => {
  it('invalidates a prepared command when its published tool version changes', async () => {
    const tool = {pageId: 'TOOL', projectId: 'APP', versionId: 'v1'}
    const invoke = vi.fn()
    let assertHostCurrent: (() => void) | undefined
    const component = defineComponent({props: ['host'], setup(props) {
      assertHostCurrent = () => props.host.assertCurrent()
      return () => null
    }})
    const options: PageRuntimePoolOptions = {
      pageComponent: component,
      readPageFile: undefined,
      readPageFiles: async commands => commands.map(command => command.fileName === 'rule.json' ? '[]' : ''),
      preparePageCall: () => ({scenarioInputs: {}, assertCurrent() {}, createHost: runtime => ({runtime, assertCurrent() {}, invoke})}),
      loadScenario: undefined,
      readNavTree: () => ({title: 'App', childPlacement: 'header', items: [{id: 'node', title: 'Tool', itemKind: 'page', path: '/tool', tool}]}),
      refreshRoutes: async () => {},
    }
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/tool', component, meta: {type: 'config-page', nodeId: 'node', tool}}]})
    await router.push('/tool')
    const pool = new PageRuntimePool(options)
    const runtime = pool.getPageRuntime(router.currentRoute.value)!
    await runtime.load()
    const wrapper = mount(pool.getPageRuntimeView(router.currentRoute.value)!)
    try {
      expect(assertHostCurrent).toBeDefined()
      expect(() => assertHostCurrent!()).not.toThrow()
      tool.versionId = 'v2'
      expect(() => assertHostCurrent!()).toThrow('发布版本已改变')
    } finally {wrapper.unmount(); runtime.dispose()}
  })
  it('keeps distinct calls across native pages and twelve tabs, rejects dirty closes, and preserves aborted navigation', async () => {
    const mounted = vi.fn()
    const invoke = vi.fn()
    const Page = defineComponent({ name: 'CallBody', props: ['pageRuntime', 'routeSnapshot', 'host'], setup(props) {
      const count = ref(0)
      onMounted(mounted)
      return () => h('div', [h(SparkPageRenderer, { pageRuntime: props.pageRuntime, routeSnapshot: props.routeSnapshot, host: props.host }),
        h('button', { onClick: () => { count.value++ } }, `count:${count.value}`)])
    } })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/native', component: { render: () => h('p', 'native') }, meta: { title: 'Native', type: 'system-page' } },
    ] })
    const readPageFiles = vi.fn(async (commands: readonly {fileName: string}[]) =>
      commands.map(({fileName}) => fileName === 'rule.json' ? '[]'
        : fileName === 'script.js' ? "async function __init__(){await $page.invokeHostCommand('connect')}" : ''))
    let sessionCurrent = true
    const owner = createDynamicRouter({ router, pageComponent: Page,
      readPageFiles,
      preparePageCall: () => ({
        scenarioInputs: {SCENE: {actor: 'trusted'}},
        assertCurrent() {if (!sessionCurrent) throw Error('SESSION_STALE')},
        createHost: runtime => ({runtime, invoke, assertCurrent() {if (!sessionCurrent) throw Error('SESSION_STALE')}}),
      }),
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
    expect(invoke).toHaveBeenCalledExactlyOnceWith('connect', undefined, expect.any(AbortSignal))
    expect(readPageFiles).toHaveBeenCalledOnce()
    expect(readPageFiles.mock.calls[0]?.[0].map(command => command.fileName).sort())
      .toEqual(['rule.json', 'script.js', 'style.css'])
    const scenarioId = first.call.scenarioIds[0]
    if (!scenarioId) throw new Error('missing runtime scenario identity')
    const firstView = first.getDataSet(scenarioId)?.tables['Users']?.getView('default')
    if (!firstView) throw new Error('missing first runtime DataView')
    expect(firstView.queryContext['actor']).toBe('trusted')
    sessionCurrent = false
    expect(() => owner.getPageRuntime(router.currentRoute.value)).toThrow('SESSION_STALE')
    sessionCurrent = true
    await router.push('/__page/tool-node?value=1&scenarioId=SCENE')
    await flushPromises()
    await controls.switchTo(first.instanceId)
    await flushPromises()
    const cancel = router.beforeEach(() => false)
    await expect(controls.closeTab(first.instanceId)).rejects.toThrow('取消')
    expect(first.destroyed).toBe(false)
    expect(controls.tabs.value.some(tab => tab.id === first.instanceId)).toBe(true)
    cancel()
    firstView.mutating = true
    await expect(controls.closeTab(first.instanceId)).rejects.toThrow()
    expect(first.destroyed).toBe(false)
    firstView.mutating = false
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
    const content = first.getContent('SCENE@DS-1')
    content.acceptRead('{}')
    content.setDraft('{"graphVersion":1}')
    expect(first.isDirty).toBe(true)
    expect(() => owner.assertPageRuntimesClean()).toThrow('未保存')
    await expect(controls.closeTab(first.instanceId)).rejects.toThrow('未保存')
    content.discardDraft()
    expect(first.isDirty).toBe(false)
    await controls.closeTab(first.instanceId)
    await flushPromises()
    expect(first.destroyed).toBe(true)
    expect(controls.tabs.value.some(tab => tab.id === first.instanceId)).toBe(false)
    wrapper.unmount()
    owner.disposePageRuntimes()
  })
})
