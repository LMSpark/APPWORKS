import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {defineComponent, h} from 'vue'
import {PAGE_RUNTIME, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID, FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {readRequestScope: vi.fn(() => ({}))},
  lowcodeHttp: {},
}))
vi.mock('@/views/features/shared/runtime/use-feature-page-runtime', async () => {
  const {ref} = await import('vue')
  return {
    useFeaturePageRuntime: () => ({
      viewKey: ref('E328FBBF518141973C575D612CD75151@View_FlowObjList@default'),
      ready: ref(true),
      loading: ref(false),
      error: ref(''),
      loadCurrentRoute: vi.fn(async () => undefined),
    }),
  }
})
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => ({query: {wfid: 'WF-1', flowid: 'FM-1'}, meta: {}, path: '/test'}),
    useRouter: () => ({resolve: vi.fn(() => ({matched: [], path: '/demo'}))}),
  }
})
vi.mock('@/views/features/workflow/flow-runtime/run-page/ui/flow-run-route-renderer.vue', () => ({
  default: {name: 'FlowRunRouteRenderer', template: '<div data-testid="biz-route">业务页</div>'},
}))
vi.mock('@/views/features/workflow/flow-append-user/ui/flow-append-user.vue', () => ({
  default: {name: 'FlowAppendUser', template: '<div data-testid="append-user">加签</div>'},
}))
vi.mock('@spark-appworks/spark-component', async importOriginal => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-component')>()
  return {
    ...actual,
    RendererGraph: {name: 'RendererGraph', template: '<div data-testid="run-chart">图</div>'},
  }
})

const {default: FlowRunPage} = await import('@/views/features/workflow/flow-runtime/run-page/ui/flow-run-page.vue')

type MockView = {
  destroyed: boolean
  queryContext: Record<string, string>
  loadingError: Error | null
  refresh: ReturnType<typeof vi.fn>
  rows: Array<Record<string, unknown>>
  events: {on: (event: string, handler: () => void) => void; off: (event: string, handler: () => void) => void}
}

function createView(rows: MockView['rows']): MockView {
  const handlers = new Map<string, Array<() => void>>()
  return {
    destroyed: false,
    queryContext: {},
    loadingError: null,
    refresh: vi.fn(async () => undefined),
    rows,
    events: {
      on: (event, handler) => {
        const list = handlers.get(event) ?? []
        list.push(handler)
        handlers.set(event, list)
      },
      off: (event, handler) => {
        handlers.set(event, (handlers.get(event) ?? []).filter(item => item !== handler))
      },
    },
  }
}

function createRuntime(): PageRuntime {
  const design = {
    WFM_FLOW_MODLE: createView([{TITLE: '样例', DesignJson: ''}]),
    WFM_FLOW_NODE: createView([{rowid: 'N1', TITLE: '开始'}]),
    WFM_NODE_REALATION: createView([]),
    WFM_WORKFORM: createView([]),
    Base_NavigationInfo: createView([]),
  }
  const monitor = {
    View_FlowObjList: createView([{rowid: 'WF-1', TITLE: '实例', WFMID: 'FM-1', BusTblObjID: 'BUS-1'}]),
    WFOBJ_FLOW: createView([{rowid: 'WF-1', WFMID: 'FM-1', TITLE: '实例'}]),
    Dict_state: createView([]),
    Base_UserInfo: createView([]),
  }
  const workbench = {
    WFOBJ_FLOW_FORM: createView([]),
    WFOBJ_FLOW_RELATIONLINE_STEP: createView([{rowid: 'S1', WFOBJID: 'WF-1'}]),
    WFOBJ_FLOW_Waiting: createView([]),
  }
  return {
    instanceId: 'flow-run-page-mount',
    getDataSet: (id: string) => {
      if (id === FLOW_DESIGN_SCENARIO_ID) return {getView: (name: string) => design[name as keyof typeof design]}
      if (id === FLOW_MONITOR_SCENARIO_ID) return {getView: (name: string) => monitor[name as keyof typeof monitor]}
      if (id === FLOW_WORKBENCH_SCENARIO_ID) return {getView: (name: string) => workbench[name as keyof typeof workbench]}
      return undefined
    },
    resolveView: (key: string) => {
      if (key.includes('View_FlowObjList')) return monitor.View_FlowObjList
      if (key.includes('WFOBJ_FLOW_RELATIONLINE_STEP')) return workbench.WFOBJ_FLOW_RELATIONLINE_STEP
      if (key.includes('WFM_FLOW_NODE')) return design.WFM_FLOW_NODE
      if (key.includes('WFM_NODE_REALATION')) return design.WFM_NODE_REALATION
      return null
    },
    dispose: () => undefined,
    materialize: () => undefined,
  } as unknown as PageRuntime
}

const Host = defineComponent({
  setup() {
    const {sparkProvide} = useSparkComponent({type: 'flow-run-page-mount-host'})
    sparkProvide(PAGE_RUNTIME, createRuntime())
    return () => h(FlowRunPage)
  },
})

const wrappers: VueWrapper[] = []

beforeEach(() => {
  registerAllRenderers()
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(item => item.unmount())
  vi.unstubAllGlobals()
})

describe('flow run page mount', () => {
  it('loads instance title and header actions', async () => {
    const wrapper = mount(defineComponent({
      setup: () => () => h(withTestPageService(Host)),
    }), {
      attachTo: document.body,
      global: {plugins: [ElementPlus, Spark.createPlugin()]},
    })
    wrappers.push(wrapper)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('实例')
    expect(wrapper.text()).toContain('流程图')
    expect(wrapper.text()).toContain('加签')
    expect(wrapper.text()).toContain('撤回')
  })
})
