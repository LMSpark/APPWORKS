import { config as testUtilsConfig, flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h, markRaw, ref, type App, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { PAGE_RUNTIME_SERVICES, Spark, SparkPageRenderer, useSparkComponent, type PageRuntimeServicesCapability } from '@spark-appworks/spark-component'
import { DataSet, RequestState, SparkData, type SparkNode } from '@spark-appworks/spark-data'
import { isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'
import {
  compileRule,
} from '@spark-appworks/spark-project-model'
import { PageRuntime, PageTool } from '@spark-appworks/spark-project-model'
import type { PageRoute } from '../../../packages/spark-component/src/runtime/script-context-types'
import { buildPageChildren } from '../../../packages/spark-component/src/page/binding'
import type { ActionExecutionContext } from '../../../packages/spark-component/src/page/actions'

type TestPageContentConfig = {
  pageId?: string
  rule: SparkNode[]
  data: DataSet
  script?: string
  css?: string
}

type TestPageRuntimeOptions = {
  pageId?: string
  load?: () => Promise<void>
  httpClient?: HttpClientBase
}

const routeSnapshot: PageRoute = { path: '/pages/test', fullPath: '/pages/test', name: 'test', params: {}, query: {}, hash: '' }

function createPageRuntime(config: TestPageContentConfig, options?: TestPageRuntimeOptions): PageRuntime {
  const tool = markRaw(new PageTool({ pageId: options?.pageId ?? config.pageId ?? 'test-page' }))
  tool.hydrateFileText('rule.json', JSON.stringify(config.rule))
  tool.hydrateFileText('script.js', config.script ?? '')
  tool.hydrateFileText('style.css', config.css ?? '')
  tool.markLoaded()
  return markRaw(new PageRuntime({ tool, scenarioIds: ['test-scene'], mainScenarioId: 'test-scene',
    loadScenario: async scenarioId => SparkData.createDataSet({ ...config.data.toJson(), scenarioId }),
    ...(options?.load === undefined ? {} : { loadTool: async () => { await options.load?.(); return tool } }),
  }))
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new Error(message)
}

function requireRecordArray(value: unknown, message: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(message)
  return value.map((item, index) => requireRecord(item, `${message}: item ${index} is not an object`))
}

function parseChildrenJson(text: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(text)
  return requireRecordArray(parsed, 'Expected rendered children JSON array')
}

function firstChildPropsFromJson(text: string): Record<string, unknown> {
  const children = parseChildrenJson(text)
  return requireRecord(children[0]?.['props'], 'Expected first child props')
}

function readOptionalFunction(value: unknown): (() => unknown) | undefined {
  return typeof value === 'function' ? () => Reflect.apply(value, undefined, []) : undefined
}

function requireFunction(value: unknown, message: string): () => unknown {
  const fn = readOptionalFunction(value)
  if (fn !== undefined) return fn
  throw new Error(message)
}

function requireSparkNode(value: SparkNode | string | number | undefined, message: string): SparkNode {
  if (value !== undefined && typeof value === 'object') return value
  throw new Error(message)
}

function disableSparkComponentRendererStub(): () => void {
  const stubs = isRecord(testUtilsConfig.global.stubs) ? testUtilsConfig.global.stubs : {}
  const hadPascal = Object.prototype.hasOwnProperty.call(stubs, 'SparkComponentRenderer')
  const hadKebab = Object.prototype.hasOwnProperty.call(stubs, 'spark-component-renderer')
  const previousPascal = stubs['SparkComponentRenderer']
  const previousKebab = stubs['spark-component-renderer']

  delete stubs['SparkComponentRenderer']
  delete stubs['spark-component-renderer']
  testUtilsConfig.global.stubs = stubs

  return () => {
    if (hadPascal && previousPascal !== undefined) stubs['SparkComponentRenderer'] = previousPascal
    else delete stubs['SparkComponentRenderer']
    if (hadKebab && previousKebab !== undefined) stubs['spark-component-renderer'] = previousKebab
    else delete stubs['spark-component-renderer']
    testUtilsConfig.global.stubs = stubs
  }
}

function createComponentRegistrationProbe(counts: Record<string, number>) {
  return {
    install(app: App) {
      const original = app.component.bind(app)
      function componentProbe(name: string): Component | undefined
      function componentProbe(name: string, component: Component): App
      function componentProbe(name: string, component?: Component): Component | undefined | App {
        if (component !== undefined && (name === 'RenderActions' || name === 'renderActions')) {
          counts[name] = (counts[name] ?? 0) + 1
        }
        return component === undefined ? original(name) : original(name, component)
      }
      app.component = componentProbe
    },
  }
}

describe('SparkPageRenderer root props aggregation', () => {
  function createActionContext(): ActionExecutionContext {
    return {
      getDataSet: () => null,
      resolveView: () => null,
      getPageService: () => null,
      getRouter: () => null,
    }
  }

  function createPageContentConfig(label: string): TestPageContentConfig {
    return {
      pageId: 'test-page',
      rule: [
        {
          type: 'r-table',
          props: {
            dataViewKey: 'Users@default',
            label,
          },
        },
      ],
      data: SparkData.createDataSet({
        dataSetName: 'PageData',
        tables: {
          Users: {
            tableName: 'Users',
            columns: [
              { name: 'id', type: 'string' },
            ],
            views: {
              default: {
                rows: [
                  { id: 'u-1' },
                ],
              },
            },
          },
        },
      }),
      script: '',
      css: '',
    }
  }

  it('passes SparkNode props through before rendering registered components', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/test',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/test')
    await router.isReady()

    const pageContent = createPageContentConfig('用户列表')

    const wrapper = mount(SparkPageRenderer, {
      props: {
        routeSnapshot,
        pageRuntime: createPageRuntime(pageContent),
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: ({ children }: { children: unknown }) => h('pre', { class: 'children-json' }, JSON.stringify(children)),
      },
    })

    await flushPromises()

    const text = wrapper.find('.children-json').text()
    const children = parseChildrenJson(text)
    const firstChild = requireRecord(children[0], 'Expected first rendered child')
    const props = requireRecord(firstChild['props'], 'Expected first rendered child props')

    expect(Array.isArray(children)).toBe(true)
    expect(props['dataViewKey']).toBe('#test-scene@Users@default')
    expect(props['label']).toBe('用户列表')
    expect(firstChild['dataViewKey']).toBeUndefined()
    expect(firstChild['label']).toBeUndefined()

    debugSpy.mockRestore()
    logSpy.mockRestore()
  })

  it('reloads when direct page content files change under the same pageId', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/test',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/test')
    await router.isReady()

    const wrapper = mount(SparkPageRenderer, {
      props: {
        routeSnapshot,
        pageRuntime: createPageRuntime(createPageContentConfig('初始标题')),
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: ({ children }: { children: unknown }) => h('pre', { class: 'children-json' }, JSON.stringify(children)),
      },
    })

    await flushPromises()

    const readLabel = (): string => {
      const text = wrapper.find('.children-json').text()
      const props = firstChildPropsFromJson(text)
      return String(props['label'])
    }

    expect(readLabel()).toBe('初始标题')

    await wrapper.setProps({
      routeSnapshot,
      pageRuntime: createPageRuntime(createPageContentConfig('更新后标题')),
    })
    await flushPromises()

    expect(readLabel()).toBe('更新后标题')
  })

  it('reports async __init__ errors through runtime diagnostics', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/test',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/test')
    await router.isReady()

    const onRuntimeError = vi.fn()

    mount(SparkPageRenderer, {
      props: {
        routeSnapshot,
        pageRuntime: createPageRuntime({
          ...createPageContentConfig('初始化'),
          script: "async function __init__() { throw new Error('ASYNC_INIT_FAIL') }",
        }),
        onRuntimeError,
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: () => h('div', { class: 'page-content' }, 'ready'),
      },
    })

    await flushPromises()
    await flushPromises()

    expect(onRuntimeError).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'init',
      pageId: 'test-page',
      message: expect.stringContaining('ASYNC_INIT_FAIL'),
    }))
  })

  it('reports page script event handler errors through runtime diagnostics', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/test',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/test')
    await router.isReady()

    let boundClick: (() => unknown) | undefined
    const onRuntimeError = vi.fn()

    mount(SparkPageRenderer, {
      props: {
        routeSnapshot,
        pageRuntime: createPageRuntime({
          ...createPageContentConfig('点击'),
          rule: [
            {
              type: 'r-button',
              props: {
                onClick: 'explode',
              },
            },
          ],
          script: "function explode() { throw new Error('SCRIPT_CLICK_FAIL') }",
        }),
        onRuntimeError,
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: ({ children }: { children: Array<{ props?: Record<string, unknown> }> }) => {
          boundClick = readOptionalFunction(children[0]?.props?.['onClick'])
          return h('button', { class: 'script-button' }, 'run')
        },
      },
    })

    await flushPromises()

    expect(boundClick).toBeTypeOf('function')
    expect(() => boundClick?.()).toThrow('SCRIPT_CLICK_FAIL')
    expect(onRuntimeError).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'script-function',
      pageId: 'test-page',
      message: expect.stringContaining('SCRIPT_CLICK_FAIL'),
    }))
  })

  it('does not map non-builtin r-button action strings to page script clicks', async () => {
    const callFunc = vi.fn<(functionName: string, ...args: unknown[]) => unknown>()
    const ruleNodes: SparkNode[] = [
      {
        type: 'r-button',
        id: 'btn__new',
        props: {
          label: '新增凭证',
          action: 'newVoucher',
        },
      },
      {
        type: 'r-button',
        id: 'btn__refresh',
        props: {
          label: '刷新',
          action: 'refresh',
        },
      },
    ]
    const children = buildPageChildren(ruleNodes, {
      callFunc,
      actionCtx: createActionContext(),
    })

    const createButtonProps = children[0]?.props ?? {}
    const refreshButtonProps = children[1]?.props ?? {}

    expect(createButtonProps['onClick']).toBeUndefined()
    expect(callFunc).not.toHaveBeenCalled()
    expect(refreshButtonProps['onClick']).toBeUndefined()
  })

  it('uses the PageRuntime pageId on cross-project-ref routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/t/:tenantId/:projectId/__ref/:refNodeId',
          name: 'spark-cross-project-ref-host',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
          meta: {
            type: 'cross-project-ref',
            crossProjectRefHost: true,
          },
        },
      ],
    })
    const loadPageRuntime = vi.fn(async () => undefined)

    await router.push('/t/lmspark/homepage/__ref/ref-node')
    await router.isReady()

    mount(SparkPageRenderer, {
      props: {
        routeSnapshot,
        pageRuntime: createPageRuntime(createPageContentConfig('跨项目目标'), {
          pageId: 'project-list',
          load: loadPageRuntime,
        }),
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
    })

    await flushPromises()

    expect(loadPageRuntime).toHaveBeenCalledTimes(1)
  })

  it('loads explicit target pageId inside cross-project-ref routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/t/:tenantId/:projectId/__ref/:refNodeId',
          name: 'spark-cross-project-ref-host',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
          meta: {
            type: 'cross-project-ref',
            crossProjectRefHost: true,
          },
        },
      ],
    })
    const loadPageRuntime = vi.fn(async () => undefined)

    await router.push('/t/lmspark/homepage/__ref/ref-node')
    await router.isReady()

    mount(SparkPageRenderer, {
      props: {
        routeSnapshot,
        pageRuntime: createPageRuntime(createPageContentConfig('跨项目目标'), {
          pageId: 'project-list',
          load: loadPageRuntime,
        }),
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
      slots: {
        content: ({ children }: { children: unknown }) => h('pre', { class: 'children-json' }, JSON.stringify(children)),
      },
    })

    await flushPromises()

    expect(loadPageRuntime).toHaveBeenCalledTimes(1)
  })

  it('does not reload an explicit pageId when the global route changes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/old',
          name: 'old-page',
          component: defineComponent({ name: 'OldRouteStub', render: () => h('div') }),
          meta: { type: 'config-page', pageId: 'old-page' },
        },
        {
          path: '/pages/new',
          name: 'new-page',
          component: defineComponent({ name: 'NewRouteStub', render: () => h('div') }),
          meta: { type: 'config-page', pageId: 'new-page' },
        },
      ],
    })
    const loadPageRuntime = vi.fn(async () => undefined)

    await router.push('/pages/old')
    await router.isReady()

    mount(SparkPageRenderer, {
      props: {
        routeSnapshot,
        pageRuntime: createPageRuntime(createPageContentConfig('old-page'), {
          pageId: 'old-page',
          load: loadPageRuntime,
        }),
      },
      global: {
        plugins: [Spark.createPlugin(), router],
      },
    })

    await flushPromises()
    expect(loadPageRuntime).toHaveBeenCalledTimes(1)

    await router.push('/pages/new')
    await router.isReady()
    await flushPromises()

    expect(loadPageRuntime).toHaveBeenCalledTimes(1)
  })

  it('rejects props.id in page rules', () => {
    const ruleNodes: SparkNode[] = [
      {
        type: 'r-button',
        props: {
          id: 'invalid-button',
          label: '旧按钮',
        },
      },
    ]
    expect(() => buildPageChildren(ruleNodes, {
      callFunc: () => undefined,
      actionCtx: createActionContext(),
    })).toThrow(/SparkNode\.props\.id is invalid/)
  })

  it('tree-node-scope demo keeps native tree props typed and button clicks executable', () => {
    const callFunc = vi.fn<(functionName: string, ...args: unknown[]) => unknown>()
    const ruleText = readFileSync(
      resolve(process.cwd(), 'backend-api-contracts/characterization-fixtures/pages-config/lmspark/homepage/tree-node-scope-demo/rule.json'),
      'utf8',
    )
    const children = buildPageChildren(compileRule(ruleText), {
      callFunc,
      actionCtx: createActionContext(),
    })

    const section = requireSparkNode(children[0], 'Expected first child to be a SparkNode')
    const sectionChildren = Array.isArray(section.children) ? section.children : []
    const treeNode = sectionChildren.find((child): child is SparkNode => typeof child === 'object' && child !== null && child.type === 'r-tree')
    const currentButton = sectionChildren.find((child): child is SparkNode => typeof child === 'object' && child !== null && child.id === 'btn-get-current')
    const checkedButton = sectionChildren.find((child): child is SparkNode => typeof child === 'object' && child !== null && child.id === 'btn-get-checked')

    expect(treeNode).toBeDefined()
    const treeProps = requireRecord(treeNode?.props?.['treeProps'], 'Expected r-tree treeProps')
    expect(treeProps['filterNodeMethod']).toBeUndefined()
    expect(treeProps['showCheckbox']).toBe(true)
    expect(treeProps['draggable']).toBe(true)

    expect(currentButton?.props?.['text']).toBeUndefined()
    expect(currentButton?.props?.['label']).toBe('获取当前选中节点')
    expect(currentButton?.props?.['onClick']).toBeTypeOf('function')

    expect(checkedButton?.props?.['text']).toBeUndefined()
    expect(checkedButton?.props?.['label']).toBe('获取勾选节点')
    expect(checkedButton?.props?.['onClick']).toBeTypeOf('function')

    requireFunction(currentButton?.props?.['onClick'], 'Expected current button click handler')()
    requireFunction(checkedButton?.props?.['onClick'], 'Expected checked button click handler')()

    expect(callFunc).toHaveBeenCalledWith('getCurrentNode')
    expect(callFunc).toHaveBeenCalledWith('getCheckedNodes')
  })

  it('refreshes page script Render components after __init__ mutates script state', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/render-init',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/render-init')
    await router.isReady()

    const restoreSparkRendererStub = disableSparkComponentRendererStub()
    try {
      const wrapper = mount(SparkPageRenderer, {
        props: {
          routeSnapshot,
        pageRuntime: createPageRuntime({
            ...createPageContentConfig('render-init'),
            pageId: 'render-init',
            rule: [{ type: 'RenderInitProbe' }],
            script: `
              let _pageState = { label: 'before-init' }
              function __init__() { _pageState.label = 'after-init' }
              function RenderInitProbe() {
                return h('div', { class: 'init-probe' }, _pageState.label)
              }
            `,
          }),
        },
        global: {
          plugins: [Spark.createPlugin(), router],
        },
      })

      await flushPromises()
      await flushPromises()

      expect(wrapper.find('.init-probe').exists(), wrapper.html()).toBe(true)
      expect(wrapper.find('.init-probe').text()).toBe('after-init')
    } finally {
      restoreSparkRendererStub()
    }
  })

  it('refreshes nested page script Render events after script state changes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/render-click',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/render-click')
    await router.isReady()

    const restoreSparkRendererStub = disableSparkComponentRendererStub()
    try {
      const wrapper = mount(SparkPageRenderer, {
        props: {
          routeSnapshot,
        pageRuntime: createPageRuntime({
            ...createPageContentConfig('render-click'),
            pageId: 'render-click',
            rule: [{ type: 'RenderClickProbe' }, { type: 'RenderMirrorProbe' }],
            script: `
              let _pageState = { current: 'user1' }
              function selectRole(next) { _pageState.current = next }
              function RenderClickProbe() {
                var current = _pageState.current
                return h('div', { class: 'click-probe', 'data-current': current }, [
                  h('button', {
                    class: 'click-probe-button',
                    onClick: function() { selectRole('manager') }
                  }, current)
                ])
              }
              function RenderMirrorProbe() {
                return h('div', { class: 'mirror-probe', 'data-current': _pageState.current }, _pageState.current)
              }
            `,
          }),
        },
        global: {
          plugins: [Spark.createPlugin(), router],
        },
      })

      await flushPromises()
      expect(wrapper.find('.click-probe').exists(), wrapper.html()).toBe(true)
      expect(wrapper.find('.click-probe').attributes('data-current')).toBe('user1')
      expect(wrapper.find('.mirror-probe').attributes('data-current')).toBe('user1')

      await wrapper.find('.click-probe-button').trigger('click')
      await flushPromises()

      expect(wrapper.find('.click-probe').attributes('data-current')).toBe('manager')
      expect(wrapper.find('.click-probe-button').text()).toBe('manager')
      expect(wrapper.find('.mirror-probe').attributes('data-current')).toBe('manager')
      expect(wrapper.find('.mirror-probe').text()).toBe('manager')
    } finally {
      restoreSparkRendererStub()
    }
  })

  it('refreshes page script Render output after an external DataView selection change', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/pages/render-view-change', component: defineComponent({ render: () => h('div') }) }],
    })
    await router.push('/pages/render-view-change')
    await router.isReady()

    const restoreSparkRendererStub = disableSparkComponentRendererStub()
    const pageRuntime = createPageRuntime({
      ...createPageContentConfig('view change'),
      pageId: 'render-view-change',
      rule: [{ type: 'RenderCurrentRowProbe' }],
      data: SparkData.createDataSet({
        dataSetName: 'PageData',
        tables: {
          Users: {
            tableName: 'Users',
            columns: [{ name: 'id', type: 'string' }],
            views: { default: { rows: [{ id: 'u-1' }, { id: 'u-2' }] } },
          },
        },
      }),
      script: `function RenderCurrentRowProbe() {
        var view = $page.getDataSet('test-scene').tables.Users.getView('default')
        return h('div', { class: 'current-row-probe' }, (view.currentRow?.id ?? 'none') + ':' + view.rows.length + ':' + view.requestState)
      }`,
    })

    try {
      const wrapper = mount(SparkPageRenderer, {
        props: { routeSnapshot, pageRuntime },
        global: { plugins: [Spark.createPlugin(), router] },
      })
      await flushPromises()

      const view = pageRuntime.getDataSet('test-scene')?.tables['Users']?.getView('default')
      expect(view).toBeDefined()
      expect(wrapper.find('.current-row-probe').text()).toBe('u-1:2:0')

      view?.setCurrentRow(view.rows[1] ?? null)
      await flushPromises()

      expect(wrapper.find('.current-row-probe').text()).toBe('u-2:2:0')

      view?.replaceRows([{ id: 'u-2' }, { id: 'u-3' }, { id: 'u-4' }])
      await flushPromises()

      expect(wrapper.find('.current-row-probe').text()).toBe('u-2:3:0')

      if (view) {
        view.requestState = RequestState.Loading
        view.events.emit('requestStateChanged', RequestState.Loading)
      }
      await flushPromises()

      expect(wrapper.find('.current-row-probe').text()).toBe('u-2:3:2')
      wrapper.unmount()
    } finally {
      restoreSparkRendererStub()
    }
  })

  it('subscribes to views created later and releases subscriptions on same-runtime reload and unmount', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/pages/render-late-view', component: defineComponent({ render: () => h('div') }) }],
    })
    await router.push('/pages/render-late-view')
    await router.isReady()

    const restoreSparkRendererStub = disableSparkComponentRendererStub()
    const tool = markRaw(new PageTool({ pageId: 'render-late-view' }))
    tool.hydrateFileText('rule.json', JSON.stringify([{ type: 'RenderLateViewProbe' }]))
    tool.hydrateFileText('script.js', `function RenderLateViewProbe() {
        var view = $page.getDataSet('extra-scene').tables.Users.getView('late')
        return h('div', { class: 'late-view-probe' }, view?.currentRow?.id ?? 'none')
      }`)
    tool.hydrateFileText('style.css', '')
    tool.markLoaded()
    const pageRuntime = markRaw(new PageRuntime({
      tool,
      scenarioIds: ['test-scene', 'extra-scene'],
      mainScenarioId: 'test-scene',
      loadScenario: async scenarioId => SparkData.createDataSet({
        dataSetName: 'PageData',
        scenarioId,
        tables: {
          Users: {
            tableName: 'Users',
            columns: [{ name: 'id', type: 'string' }],
            views: { default: { rows: [{ id: 'u-1' }] } },
          },
        },
      }),
    }))
    const originalSubscribe = DataSet.prototype.onAnyViewChange
    const unsubscribe = vi.fn()
    const subscribe = vi.spyOn(DataSet.prototype, 'onAnyViewChange').mockImplementation(function (this: DataSet, handlers) {
      const release = originalSubscribe.call(this, handlers)
      return () => { unsubscribe(); release() }
    })
    let wrapper: ReturnType<typeof mount> | undefined
    try {
      wrapper = mount(SparkPageRenderer, {
        props: { routeSnapshot, pageRuntime },
        global: { plugins: [Spark.createPlugin(), router] },
      })
      await flushPromises()

      const dataSet = pageRuntime.getDataSet('extra-scene')
      expect(dataSet).toBeDefined()

      const lateView = dataSet?.tables['Users']?.getOrCreateView('late')
      lateView?.replaceRows([{ id: 'late-1' }])
      lateView?.setCurrentRow(lateView.rows[0] ?? null)
      await flushPromises()

      expect(wrapper.find('.late-view-probe').text()).toBe('late-1')

      const exposed = wrapper.vm.$.exposed
      if (!isRecord(exposed)) throw new Error('Expected SparkPageRenderer exposed methods')
      const reload = requireFunction(exposed['reload'], 'Expected SparkPageRenderer reload method')
      await reload()
      await flushPromises()
      expect(subscribe).toHaveBeenCalledTimes(4)
      expect(unsubscribe).toHaveBeenCalledTimes(2)

      wrapper.unmount()
      wrapper = undefined
      expect(unsubscribe).toHaveBeenCalledTimes(4)
    } finally {
      wrapper?.unmount()
      subscribe.mockRestore()
      restoreSparkRendererStub()
    }
  })

  it('keeps view refresh subscriptions isolated between page instances and releases them on removal', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/pages/render-isolated-views', component: defineComponent({ render: () => h('div') }) }],
    })
    await router.push('/pages/render-isolated-views')
    await router.isReady()

    const createRuntime = () => createPageRuntime({
      ...createPageContentConfig('isolated view'),
      pageId: 'render-isolated-views',
      rule: [{ type: 'RenderIsolatedViewProbe' }],
      data: SparkData.createDataSet({
        dataSetName: 'PageData',
        tables: {
          Users: {
            tableName: 'Users',
            columns: [{ name: 'id', type: 'string' }],
            views: { default: { rows: [{ id: 'u-1' }, { id: 'u-2' }] } },
          },
        },
      }),
      script: `function RenderIsolatedViewProbe() {
        var view = $page.getDataSet('test-scene').tables.Users.getView('default')
        return h('div', { class: 'isolated-view-probe' }, $route.query.owner + ':' + view.currentRow?.id)
      }`,
    })
    const a = createRuntime()
    const b = createRuntime()
    const showA = ref(true)
    const restoreSparkRendererStub = disableSparkComponentRendererStub()
    let wrapper: ReturnType<typeof mount> | undefined
    try {
      const Parent = defineComponent({ render: () => h('div', [
        ...(showA.value ? [h('section', { class: 'view-call-a', key: a.instanceId }, [h(SparkPageRenderer, {
          pageRuntime: a,
          routeSnapshot: { ...routeSnapshot, query: { owner: 'A' } },
        })])] : []),
        h('section', { class: 'view-call-b', key: b.instanceId }, [h(SparkPageRenderer, {
          pageRuntime: b,
          routeSnapshot: { ...routeSnapshot, query: { owner: 'B' } },
        })]),
      ]) })
      wrapper = mount(Parent, { global: { plugins: [Spark.createPlugin(), router] } })
      await flushPromises()

      expect(wrapper.find('.view-call-a .isolated-view-probe').text()).toBe('A:u-1')
      expect(wrapper.find('.view-call-b .isolated-view-probe').text()).toBe('B:u-1')

      const viewA = a.getDataSet('test-scene')?.tables['Users']?.getView('default')
      viewA?.setCurrentRow(viewA.rows[1] ?? null)
      await flushPromises()

      expect(wrapper.find('.view-call-a .isolated-view-probe').text()).toBe('A:u-2')
      expect(wrapper.find('.view-call-b .isolated-view-probe').text()).toBe('B:u-1')

      showA.value = false
      await flushPromises()
      expect(a.destroyed).toBe(true)
      expect(b.destroyed).toBe(false)

      const viewB = b.getDataSet('test-scene')?.tables['Users']?.getView('default')
      viewB?.setCurrentRow(viewB.rows[1] ?? null)
      await flushPromises()
      expect(wrapper.find('.view-call-b .isolated-view-probe').text()).toBe('B:u-2')
    } finally {
      wrapper?.unmount()
      restoreSparkRendererStub()
    }
  })

  it('isolates two calls of the same tool and same Render name without app-global registration', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/pages/shared', component: defineComponent({ render: () => h('div') }) }] })
    await router.push('/pages/shared')
    await router.isReady()
    const a = createPageRuntime({ ...createPageContentConfig('shared'), pageId: 'shared', rule: [{ type: 'RenderActions' }],
      script: `let count = 0; function RenderActions() { return h('button', { class: 'shared-render', onClick: function() { count++ } }, $route.query.owner + ':' + count) }`,
    })
    const b = markRaw(new PageRuntime({ tool: a.tool, scenarioIds: [], loadScenario: async () => { throw new Error('no scene expected') } }))
    const showA = ref(true)
    const registrations: Record<string, number> = {}
    const restore = disableSparkComponentRendererStub()
    let wrapper: ReturnType<typeof mount> | undefined
    try {
      const Parent = defineComponent({ render: () => h('div', [
        ...(showA.value ? [h('section', { class: 'call-a', key: a.instanceId }, [h(SparkPageRenderer, { pageRuntime: a, routeSnapshot: { ...routeSnapshot, query: { owner: 'A' } } })])] : []),
        h('section', { class: 'call-b', key: b.instanceId }, [h(SparkPageRenderer, { pageRuntime: b, routeSnapshot: { ...routeSnapshot, query: { owner: 'B' } } })]),
      ]) })
      wrapper = mount(Parent, { global: { plugins: [Spark.createPlugin(), createComponentRegistrationProbe(registrations), router] } })
      await flushPromises()
      expect(wrapper.find('.call-a .shared-render').exists(), wrapper.html()).toBe(true)
      expect(wrapper.find('.call-a .shared-render').text()).toBe('A:0')
      expect(wrapper.find('.call-b .shared-render').text()).toBe('B:0')
      await wrapper.find('.call-a .shared-render').trigger('click')
      await flushPromises()
      expect(wrapper.find('.call-a .shared-render').text()).toBe('A:1')
      expect(wrapper.find('.call-b .shared-render').text()).toBe('B:0')
      expect(wrapper.find('.call-a [data-page]').attributes('data-page')).not.toBe(wrapper.find('.call-b [data-page]').attributes('data-page'))
      showA.value = false
      await flushPromises()
      expect(a.destroyed).toBe(true)
      expect(b.destroyed).toBe(false)
      await wrapper.find('.call-b .shared-render').trigger('click')
      await flushPromises()
      expect(wrapper.find('.call-b .shared-render').text()).toBe('B:1')
      expect(registrations).toEqual({})
    } finally { wrapper?.unmount(); restore() }
    expect(b.destroyed).toBe(true)
  })

  it('updates in-memory Render script components without duplicate app registration', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/pages/render-actions',
          component: defineComponent({ name: 'RouteStub', render: () => h('div') }),
        },
      ],
    })

    await router.push('/pages/render-actions')
    await router.isReady()

    const registrationCounts: Record<string, number> = {}
    const restoreSparkRendererStub = disableSparkComponentRendererStub()
    try {
      const baseConfig = createPageContentConfig('render-actions')
      const wrapper = mount(SparkPageRenderer, {
        props: {
          routeSnapshot,
        pageRuntime: createPageRuntime({
            ...baseConfig,
            pageId: 'render-actions',
            rule: [{ type: 'RenderActions' }],
            script: `
              function RenderActions() {
                return h('div', { class: 'actions-probe' }, 'one')
              }
            `,
          }),
        },
        global: {
          plugins: [Spark.createPlugin(), createComponentRegistrationProbe(registrationCounts), router],
        },
      })

      await flushPromises()
      expect(wrapper.find('.actions-probe').text()).toBe('one')

      await wrapper.setProps({
        routeSnapshot,
        pageRuntime: createPageRuntime({
          ...baseConfig,
          pageId: 'render-actions',
          rule: [{ type: 'RenderActions' }],
          script: `
            function RenderActions() {
              return h('div', { class: 'actions-probe' }, 'two')
            }
          `,
        }),
      })
      await flushPromises()

      expect(wrapper.find('.actions-probe').text()).toBe('two')
      expect(registrationCounts['RenderActions'] ?? 0).toBe(0)
      expect(registrationCounts['renderActions'] ?? 0).toBe(0)
    } finally {
      restoreSparkRendererStub()
    }
  })

  it('passes the inherited layout reader from the app capability into page scripts', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/pages/test', component: defineComponent({ render: () => h('div') }) }] })
    await router.push('/pages/test')
    await router.isReady()
    const readDataSpaceLayout = vi.fn(async () => 'layout-source')
    const services: PageRuntimeServicesCapability = { dataSpaceLayout: {
      scenarioId: 'test-scene', createReader: () => ({ readDataSpaceLayout }),
    } }
    const pageRuntime = createPageRuntime({ ...createPageContentConfig('layout'), rule: [],
      script: "async function __init__() { await $page.readDataSpaceLayout('DS-1') }" })
    const Parent = defineComponent({ setup() {
      const { sparkProvide } = useSparkComponent({ type: 'layout-test-host' })
      sparkProvide(PAGE_RUNTIME_SERVICES, services)
      return () => h(SparkPageRenderer, { pageRuntime, routeSnapshot })
    } })
    const wrapper = mount(Parent, { global: { plugins: [Spark.createPlugin(), router] } })
    await flushPromises()
    await flushPromises()
    expect(readDataSpaceLayout).toHaveBeenCalledOnce()
    expect(readDataSpaceLayout).toHaveBeenCalledWith('DS-1')
    wrapper.unmount()
  })
})
