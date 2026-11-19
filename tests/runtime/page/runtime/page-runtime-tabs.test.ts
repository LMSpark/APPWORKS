import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, KeepAlive, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createDynamicRouter } from '../../../../packages/spark-app/src/router/dynamic'
import {
  PageRuntimePool,
  type PageRuntimePoolOptions,
  type RuntimePagePublicationManifest,
} from '../../../../packages/spark-app/src/router/page-runtime-pool'
import { setDynamicRouter } from '../../../../packages/spark-app/src/navigation/nav-access'
import { useTabPages } from '../../../../packages/spark-app/src/navigation/useTabPages'
import { RendererButton, Spark, SparkPageRenderer, registerAllRenderers } from '@spark-appworks/spark-component'
import { protectPageChanges } from '@/services/project/navigation/page-unload-protection'
import { SparkData } from '@spark-appworks/spark-data'

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

describe('page call tabs and retained renderer instances', () => {
  it.each([
    'BLUEPRINT_ONLY', 'AUTH_MISSING', 'MANIFEST_MISSING', 'SCENARIO_MISSING', 'IDENTITY_CONFLICT',
  ] as const)('rejects a %s navigation receipt before materializing files', async state => {
    const page = defineComponent({render: () => h('div')})
    const readPageFiles = vi.fn()
    const loadScenario = vi.fn()
    const router = createRouter({history: createMemoryHistory(), routes: [{
      path: '/receipt', component: page,
      meta: {type: 'config-page', nodeId: 'NODE', tool: {projectId: 'APP', pageId: 'TOOL'}},
    }]})
    await router.push('/receipt?scenarioId=SCENE')
    const runtime = new PageRuntimePool({
      pageComponent: page, readPageFile: undefined, readPageFiles, loadScenario,
      resolvePageNavigationReceipt: async () => ({
        state, reason: 'fixture receipt', assertCurrent: () => {},
      }),
      readNavTree: () => null, refreshRoutes: async () => undefined,
    }).getPageRuntime(router.currentRoute.value)!

    await expect(runtime.load()).rejects.toThrow(`PAGE_NAVIGATION_RECEIPT_${state}`)
    expect(readPageFiles).not.toHaveBeenCalled()
    expect(loadScenario).not.toHaveBeenCalled()
    expect(runtime.isLoaded).toBe(false)
    runtime.dispose()
  })

  it('hydrates only the READY receipt proofs and rejects the retained call after its route changes', async () => {
    const page = defineComponent({render: () => h('div')})
    const files = {'rule.json': '[]', 'script.js': '', 'style.css': ''} as const
    const pagedataText = JSON.stringify({scenarioId: 'SCENE', tables: {}})
    const manifest: RuntimePagePublicationManifest = {
      pageId: 'TOOL', scenarioIds: ['SCENE'], sourceRevision: 'ready-proof',
      files: await Promise.all((['rule.json', 'script.js', 'style.css'] as const).map(async fileName => ({
        fileName, version: 1, sha256: await sha256(files[fileName]),
      }))),
      pagedata: [{
        scenarioId: 'SCENE', version: 2, fileName: '2__pagedata.json',
        sha256: await sha256(pagedataText), sourceRevision: 'proof', text: pagedataText,
      }],
    }
    const readPageFiles = vi.fn()
    const router = createRouter({history: createMemoryHistory(), routes: [{
      path: '/receipt', component: page,
      meta: {type: 'config-page', nodeId: 'NODE', tool: {projectId: 'APP', pageId: 'TOOL'}},
    }]})
    await router.push('/receipt?scenarioId=SCENE')
    const originalRoute = router.currentRoute.value
    const pool = new PageRuntimePool({
      pageComponent: page, readPageFile: undefined, readPageFiles,
      resolvePageNavigationReceipt: async () => ({
        state: 'READY', assertCurrent: () => {},
        publication: {publicationRef: '1', manifest, assertCurrent: () => {}},
        files: Object.entries(files).map(([fileName, text]) => ({
          fileName: fileName as keyof typeof files, version: 1, text,
        })),
      }),
      loadScenario: async ({scenarioId}) => SparkData.createDataSet({dataSetName: scenarioId, scenarioId, tables: {}}),
      readNavTree: () => null, readCurrentRoute: () => router.currentRoute.value,
      refreshRoutes: async () => undefined,
    })
    const runtime = pool.getPageRuntime(originalRoute)!
    await runtime.load()
    expect(readPageFiles).not.toHaveBeenCalled()
    await router.push('/receipt?scenarioId=SCENE&tab=next')
    expect(() => pool.getPageRuntime(originalRoute)).toThrow('PAGE_RUNTIME_STALE')
    runtime.dispose()
  })

  it('materializes a four-file publication only after every manifest proof succeeds', async () => {
    const page = defineComponent({render: () => h('div')})
    const files = {
      'rule.json': '[]',
      'script.js': 'async function noop(){}',
      'style.css': '',
    } as const
    const pagedataText = JSON.stringify({scenarioId: 'SCENE', tables: {}})
    const manifest: RuntimePagePublicationManifest = {
      pageId: 'TOOL', scenarioIds: ['SCENE'], sourceRevision: 'published-proof',
      files: await Promise.all((['rule.json', 'script.js', 'style.css'] as const).map(async fileName => ({
        fileName, version: fileName === 'rule.json' ? 3 : fileName === 'script.js' ? 4 : 5,
        sha256: await sha256(files[fileName]),
      }))),
      pagedata: [{
        scenarioId: 'SCENE', version: 6, fileName: '6__pagedata.json',
        sha256: await sha256(pagedataText), sourceRevision: 'published-source', text: pagedataText,
      }],
    }
    const readPageFiles = vi.fn<NonNullable<PageRuntimePoolOptions['readPageFiles']>>(async commands =>
      commands.map(command => files[command.fileName]))
    const loadScenario = vi.fn(async ({scenarioId}: {scenarioId: string}) =>
      SparkData.createDataSet({dataSetName: scenarioId, scenarioId, tables: {}}))
    const router = createRouter({history: createMemoryHistory(), routes: [{
      path: '/published', component: page,
      meta: {type: 'config-page', nodeId: 'NODE', tool: {projectId: 'APP', pageId: 'TOOL'}},
    }]})
    await router.push('/published?scenarioId=SCENE')
    const pool = new PageRuntimePool({
      pageComponent: page, readPageFile: undefined, readPageFiles,
      resolvePagePublication: async () => ({
        publicationRef: 'rule=3;script=4;style=5;manifest=7', manifest, assertCurrent: () => {},
      }),
      loadScenario, readNavTree: () => ({title: 'App', childPlacement: 'header', items: [{
        id: 'NODE', title: 'Published', path: '/published',
        tool: {projectId: 'APP', pageId: 'TOOL'},
      }]}),
      refreshRoutes: async () => undefined,
    })
    const runtime = pool.getPageRuntime(router.currentRoute.value)!
    try {
      await runtime.load()
      expect(readPageFiles.mock.calls[0]?.[0].map(command => command.versionId))
        .toEqual(['rule=3;script=4;style=5;manifest=7', 'rule=3;script=4;style=5;manifest=7', 'rule=3;script=4;style=5;manifest=7'])
      expect(runtime.source).toMatchObject({
        mode:'published',sourceRevision:manifest.sourceRevision,
        publicationRef:'rule=3;script=4;style=5;manifest=7',scenarioIds:['SCENE'],
      })
      expect(loadScenario).toHaveBeenCalledWith({projectId: 'APP', scenarioId: 'SCENE',
        source: runtime.source, pagedata: manifest.pagedata[0]})
    } finally { runtime.dispose() }
  })

  it('rejects manifest proof conflicts before hydrating the page or loading scenarios', async () => {
    const page = defineComponent({render: () => h('div')})
    const text = JSON.stringify({scenarioId: 'SCENE', tables: {}})
    const manifest: RuntimePagePublicationManifest = {
      pageId: 'TOOL', scenarioIds: ['SCENE'], sourceRevision: 'conflict-proof',
      files: [
        {fileName: 'rule.json' as const, version: 1, sha256: await sha256('expected-rule')},
        {fileName: 'script.js' as const, version: 1, sha256: await sha256('expected-script')},
        {fileName: 'style.css' as const, version: 1, sha256: await sha256('')},
      ],
      pagedata: [{
        scenarioId: 'SCENE', version: 2, fileName: '2__pagedata.json',
        sha256: await sha256(text), sourceRevision: 'proof', text,
      }],
    }
    const loadScenario = vi.fn()
    const router = createRouter({history: createMemoryHistory(), routes: [{
      path: '/published', component: page,
      meta: {type: 'config-page', nodeId: 'NODE', tool: {projectId: 'APP', pageId: 'TOOL'}},
    }]})
    await router.push('/published?scenarioId=SCENE')
    const runtime = new PageRuntimePool({
      pageComponent: page, readPageFile: undefined,
      readPageFiles: async (commands: ReadonlyArray<Parameters<NonNullable<PageRuntimePoolOptions['readPageFile']>>[0]>) => commands.map(command =>
        command.fileName === 'rule.json' ? 'tampered-rule' : command.fileName === 'script.js' ? 'expected-script' : ''),
      resolvePagePublication: async () => ({manifest, publicationRef: '1', assertCurrent: () => {}}),
      loadScenario, readNavTree: () => null, refreshRoutes: async () => undefined,
    }).getPageRuntime(router.currentRoute.value)!
    await expect(runtime.load()).rejects.toThrow('PAGE_PUBLICATION_PROOF_CONFLICT')
    expect(loadScenario).not.toHaveBeenCalled()
    expect(runtime.isLoaded).toBe(false)
    runtime.dispose()
  })

  it('rejects publication resolution without a readable manifest', async () => {
    const page = defineComponent({render: () => h('div')})
    const readPageFiles = vi.fn<NonNullable<PageRuntimePoolOptions['readPageFiles']>>(async commands => commands.map(command =>
      command.fileName === 'rule.json' ? '[]' : ''))
    const router = createRouter({history: createMemoryHistory(), routes: [{
      path: '/legacy', component: page,
      meta: {type: 'config-page', nodeId: 'NODE', tool: {projectId: 'APP', pageId: 'LEGACY'}},
    }]})
    await router.push('/legacy?scenarioId=SCENE')
    const runtime = new PageRuntimePool({
      pageComponent: page, readPageFile: undefined, readPageFiles,
      resolvePagePublication: async () => undefined,
      loadScenario: async ({scenarioId}) => SparkData.createDataSet({
        dataSetName: scenarioId, scenarioId, tables: {},
      }),
      readNavTree: () => null, refreshRoutes: async () => undefined,
    }).getPageRuntime(router.currentRoute.value)!
    await expect(runtime.load()).rejects.toThrow('PAGE_RUNTIME_PUBLICATION_REQUIRED')
    expect(readPageFiles).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('does not materialize files after the publication execution scope becomes stale', async () => {
    const page = defineComponent({render: () => h('div')})
    let current = true
    const files = {'rule.json': '[]', 'script.js': '', 'style.css': ''} as const
    const pagedataText = JSON.stringify({scenarioId: 'SCENE', tables: {}})
    const manifest: RuntimePagePublicationManifest = {
      pageId: 'TOOL', scenarioIds: ['SCENE'], sourceRevision: 'stale-proof',
      files: await Promise.all((['rule.json', 'script.js', 'style.css'] as const).map(async fileName => ({
        fileName, version: 1, sha256: await sha256(files[fileName]),
      }))),
      pagedata: [{
        scenarioId: 'SCENE', version: 2, fileName: '2__pagedata.json',
        sha256: await sha256(pagedataText), sourceRevision: 'proof', text: pagedataText,
      }],
    }
    const loadScenario = vi.fn()
    const router = createRouter({history: createMemoryHistory(), routes: [{
      path: '/published', component: page,
      meta: {type: 'config-page', nodeId: 'NODE', tool: {projectId: 'APP', pageId: 'TOOL'}},
    }]})
    await router.push('/published?scenarioId=SCENE')
    const runtime = new PageRuntimePool({
      pageComponent: page, readPageFile: undefined,
      readPageFiles: async commands => {
        current = false
        return commands.map(command => command.fileName === 'rule.json' ? '[]' : '')
      },
      resolvePagePublication: async () => ({
        publicationRef: '9', manifest,
        assertCurrent: () => {if (!current) throw Error('PAGE_PUBLICATION_SCOPE_STALE')},
      }),
      loadScenario, readNavTree: () => null, refreshRoutes: async () => undefined,
    }).getPageRuntime(router.currentRoute.value)!
    await expect(runtime.load()).rejects.toThrow('PAGE_PUBLICATION_SCOPE_STALE')
    expect(runtime.isLoaded).toBe(false)
    expect(loadScenario).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('invalidates the original command when its formal tool binding changes', async () => {
    const tool: {pageId: string; projectId: string} = {pageId: 'TOOL', projectId: 'APP'}
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
        if (command.fileName === 'script.js') return "async function save(){try{await $page.invokeHostCommand('save')}catch(error){if(!String(error).includes('蓝图工具绑定已改变'))throw error}}"
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
      tool.pageId = 'TOOL-NEXT'
      expect(() => assertHostCurrent!()).toThrow('蓝图工具绑定已改变')
      wrapper.getComponent(RendererButton).vm.$emit('click')
      await flushPromises()
      expect(invoke).toHaveBeenCalledTimes(1)
      expect(readFiles.mock.calls.map(([commands]) => commands.map(command => command.versionId))).toEqual([[undefined, undefined, undefined]])
      tool.pageId = 'TOOL'
      await runtime.reload()
      expect(readFiles.mock.calls[1]?.[0].map(command => command.versionId)).toEqual([undefined, undefined, undefined])
    } finally {wrapper.unmount(); runtime.dispose()}
  })
  it('does not borrow inherited menu file metadata on an explicit tool call', async () => {
    const page = defineComponent({render: () => h('div')})
    const readPageFiles = vi.fn<NonNullable<PageRuntimePoolOptions['readPageFiles']>>(async commands =>
      commands.map(({fileName}) => fileName === 'rule.json' ? '[]' : ''))
    const readNavTree = vi.fn<PageRuntimePoolOptions['readNavTree']>(() => ({title: 'App', childPlacement: 'header', items: [
      {id: 'parent', title: 'Published', itemKind: 'page', path: '/published',
        tool: {projectId: 'APP', pageId: 'another-tool'}},
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
      expect(runtime.source).toMatchObject({mode:'design',publicationRef:null,scenarioIds:[]})
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
