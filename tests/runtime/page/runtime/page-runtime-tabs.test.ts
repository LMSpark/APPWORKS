import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, KeepAlive, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../../../../packages/spark-app/src/router/dynamic'
import { PageRuntimePool, type PageRuntimePoolOptions } from '../../../../packages/spark-app/src/router/page-runtime-pool'
import { setDynamicRouter } from '../../../../packages/spark-app/src/navigation/nav-access'
import { useTabPages } from '../../../../packages/spark-app/src/navigation/useTabPages'
import { RendererButton, Spark, SparkPageRenderer, registerAllRenderers } from '@spark-appworks/spark-component'
import { protectPageChanges } from '@/services/project/navigation/page-unload-protection'
import { SparkData } from '@spark-appworks/spark-data'

describe('page call tabs and retained renderer instances', () => {
  it.each([undefined, 'v1'])('invalidates the original command on version change from %s and rejects a later missing version', async initialVersion => {
    const tool: {pageId: string; projectId: string; versionId?: string} = {
      pageId: 'TOOL', projectId: 'APP', ...(initialVersion === undefined ? {} : {versionId: initialVersion}),
    }
    const invoke = vi.fn()
    let assertHostCurrent: (() => void) | undefined
    registerAllRenderers()
    const component = defineComponent({props: ['pageRuntime', 'routeSnapshot', 'host'], setup(props) {
      assertHostCurrent = () => props.host.assertCurrent()
      return () => h(SparkPageRenderer, {pageRuntime: props.pageRuntime, routeSnapshot: props.routeSnapshot, host: props.host})
    }})
    const readFiles = vi.fn<NonNullable<PageRuntimePoolOptions['readPageFiles']>>()
    const options: PageRuntimePoolOptions = {
      pageComponent: component,
      readPageFile: undefined,
      readPageFiles: readFiles.mockImplementation(async commands => commands.map(command => {
        if (command.fileName === 'rule.json') return '[{"type":"r-button","props":{"label":"保存","onClick":"save"}}]'
        if (command.fileName === 'script.js') return "async function save(){try{await $page.invokeHostCommand('save')}catch(error){if(!String(error).includes('发布版本已改变'))throw error}}"
        return ''
      })),
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
    const wrapper = mount(pool.getPageRuntimeView(router.currentRoute.value)!, {global: {
      plugins: [Spark.createPlugin()], stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false},
    }})
    try {
      await flushPromises()
      expect(assertHostCurrent).toBeDefined()
      expect(() => assertHostCurrent!()).not.toThrow()
      wrapper.getComponent(RendererButton).vm.$emit('click')
      await flushPromises()
      expect(invoke).toHaveBeenCalledExactlyOnceWith('save', undefined, expect.any(AbortSignal))
      tool.versionId = 'v2'
      expect(() => assertHostCurrent!()).toThrow('发布版本已改变')
      wrapper.getComponent(RendererButton).vm.$emit('click')
      await flushPromises()
      expect(invoke).toHaveBeenCalledTimes(1)
      expect(readFiles.mock.calls.map(([commands]) => commands.map(command => command.versionId))).toEqual([[initialVersion, initialVersion, initialVersion]])
      await runtime.reload()
      expect(readFiles.mock.calls[1]?.[0].map(command => command.versionId)).toEqual(['v2', 'v2', 'v2'])
      delete tool.versionId
      await expect(runtime.reload()).rejects.toThrow('已发布工具缺少版本绑定')
      expect(readFiles).toHaveBeenCalledTimes(2)
    } finally {wrapper.unmount(); runtime.dispose()}
  })
  it('does not borrow a published version from inherited menu metadata on an explicit tool call', async () => {
    const page = defineComponent({render: () => h('div')})
    const readPageFiles = vi.fn<NonNullable<PageRuntimePoolOptions['readPageFiles']>>(async commands =>
      commands.map(({fileName}) => fileName === 'rule.json' ? '[]' : ''))
    const readNavTree = vi.fn<PageRuntimePoolOptions['readNavTree']>(() => ({title: 'App', childPlacement: 'header', items: [
      {id: 'parent', title: 'Published', itemKind: 'page', path: '/published',
        tool: {projectId: 'APP', pageId: 'another-tool', versionId: 'release-7'}},
    ]}))
    const router = createRouter({history: createMemoryHistory(), routes: [{
      path: '/apps/:projectId', component: page, meta: {nodeId: 'parent'}, children: [{
        path: '__tool/:pageId', component: page, meta: {type: 'config-page', programmaticTool: true},
      }],
    }]})
    const pool = new PageRuntimePool({pageComponent: page, readNavTree, readPageFiles, readPageFile: undefined,
      loadScenario: undefined, refreshRoutes: async () => undefined})
    await router.push('/apps/APP/__tool/called-tool')
    const runtime = pool.getPageRuntime(router.currentRoute.value)
    if (!runtime) throw Error('missing explicit tool runtime')
    try {
      expect(router.currentRoute.value.meta['nodeId']).toBe('parent')
      await runtime.load()
      expect(readNavTree).not.toHaveBeenCalled()
      expect(readPageFiles.mock.calls[0]?.[0]).toEqual(['rule.json', 'script.js', 'style.css'].map(fileName =>
        ({projectId: 'APP', pageId: 'called-tool', fileName})))
    } finally {runtime.dispose()}
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
    expect(() => owner.assertPageRuntimesClean()).not.toThrow()
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
    expect(() => owner.assertPageRuntimesClean()).toThrow('未保存修改')
    await router.push('/native')
    await flushPromises()
    expect(() => owner.assertPageRuntimesClean()).toThrow('未保存修改')
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
    // A tool can own draft state outside its DataSet, while the router owns its lifetime.
    let externalDirty = true
    first.setExternalDirtySource('working-draft', {get isDirty() { return externalDirty }, subscribe: () => () => {}})
    window.addEventListener('beforeunload', protectPageChanges)
    try {
      const refresh = () => window.dispatchEvent(new Event('beforeunload', {cancelable: true}))
      expect(refresh()).toBe(false)
      await expect(controls.closeTab(first.instanceId)).rejects.toThrow('未保存')
      expect(first.destroyed).toBe(false)
      externalDirty = false
      expect(refresh()).toBe(true)
    } finally {
      window.removeEventListener('beforeunload', protectPageChanges)
      first.setExternalDirtySource('working-draft', null)
    }
    await controls.closeTab(first.instanceId)
    await flushPromises()
    expect(first.destroyed).toBe(true)
    expect(controls.tabs.value.some(tab => tab.id === first.instanceId)).toBe(false)
    wrapper.unmount()
    owner.disposePageRuntimes()
  })
})
