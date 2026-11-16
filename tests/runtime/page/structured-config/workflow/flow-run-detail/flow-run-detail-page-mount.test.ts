import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {defineComponent, h} from 'vue'
import {SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import {PAGE_RUNTIME, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {design: {readTextFile: vi.fn(async () => '')}},
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
const routerPush = vi.fn()
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => ({query: {wfid: 'WF-1', flowid: 'FM-1'}, meta: {}, path: '/apps/APP-1/features/workflow/flow-runtime/detail/ui/flow-run-detail-page'}),
    useRouter: () => ({push: routerPush}),
  }
})
vi.mock('@spark-appworks/spark-component', async importOriginal => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-component')>()
  return {
    ...actual,
    RendererGraph: {name: 'RendererGraph', template: '<div data-testid="run-graph">运行图</div>', emits: ['select']},
    RendererTable: {name: 'RendererTable', props: ['dataViewKey', 'children'], template: '<div data-testid="run-summary">摘要</div>'},
  }
})

const {default: FlowRunDetailPage} = await import('@/views/features/workflow/flow-runtime/detail/ui/flow-run-detail-page.vue')

const MONITOR_SCENARIO_ID = 'E328FBBF518141973C575D612CD75151'

type MockView = {
  destroyed: boolean
  queryContext: Record<string, string>
  loadingError: Error | null
  refresh: ReturnType<typeof vi.fn>
  rows: Array<Record<string, unknown>>
}

function createView(rows: MockView['rows']): MockView {
  return {destroyed: false, queryContext: {}, loadingError: null, refresh: vi.fn(async () => undefined), rows}
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
    View_FlowObjList: createView([{TITLE: '实例', WFMID: 'FM-1'}]),
    Dict_state: createView([]),
  }
  const workbench = {
    WFOBJ_FLOW_RELATIONLINE_STEP: createView([]),
    WFOBJ_FLOW_Waiting: createView([]),
  }
  return {
    instanceId: 'flow-run-detail-mount',
    getDataSet: (id: string) => {
      if (id === FLOW_DESIGN_SCENARIO_ID) return {getView: (name: string) => design[name as keyof typeof design]}
      if (id === MONITOR_SCENARIO_ID) return {getView: (name: string) => monitor[name as keyof typeof monitor]}
      if (id === FLOW_WORKBENCH_SCENARIO_ID) return {getView: (name: string) => workbench[name as keyof typeof workbench]}
      return undefined
    },
    resolveView: (key: string) => {
      if (key.includes('View_FlowObjList')) return monitor.View_FlowObjList
      if (key.includes('WFOBJ_FLOW_RELATIONLINE_STEP')) return workbench.WFOBJ_FLOW_RELATIONLINE_STEP
      if (key.includes('WFOBJ_FLOW_Waiting')) return workbench.WFOBJ_FLOW_Waiting
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
    const {sparkProvide} = useSparkComponent({type: 'flow-run-detail-mount-host'})
    sparkProvide(PAGE_RUNTIME, createRuntime())
    return () => h(FlowRunDetailPage)
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

describe('flow run detail page mount', () => {
  it('renders summary and read-only run graph when route query is provided', async () => {
    const wrapper = mount(defineComponent({
      setup: () => () => h(withTestPageService(Host)),
    }), {
      attachTo: document.body,
      global: {plugins: [ElementPlus, Spark.createPlugin()]},
    })
    wrappers.push(wrapper)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('流程运行详情')
    expect(wrapper.text()).toContain('运行轨迹')
    expect(wrapper.find('[data-testid="run-graph"]').exists()).toBe(true)
  })
  it('header 前往办理 navigates to run page route', async () => {
    routerPush.mockClear()
    const wrapper = mount(defineComponent({
      setup: () => () => h(withTestPageService(Host)),
    }), {
      attachTo: document.body,
      global: {plugins: [ElementPlus, Spark.createPlugin()]},
    })
    wrappers.push(wrapper)
    await flushPromises()
    await flushPromises()
    const button = wrapper.findAll('button').find(item => item.text().includes('前往办理'))
    expect(button).toBeDefined()
    await button!.trigger('click')
    expect(routerPush).toHaveBeenCalledWith({
      path: '/apps/APP-1/features/workflow/flow-runtime/run-page/ui/flow-run-page',
      query: {wfid: 'WF-1', flowid: 'FM-1', [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: MONITOR_SCENARIO_ID},
    })
  })
})
