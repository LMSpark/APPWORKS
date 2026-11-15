import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {defineComponent, h} from 'vue'
import {PAGE_RUNTIME, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'

vi.mock('@/views/features/workflow/flow-model/design/ui/node-panel/flow-design-node-panel.vue', () => ({
  default: defineComponent({
    name: 'FlowDesignNodePanel',
    props: {viewKey: String, highlightId: [String, Number, null]},
    emits: ['selectGraphId'],
    template: '<button data-testid="pick-node" type="button" @click="$emit(\'selectGraphId\', \'N-42\')">流程节点</button>',
  }),
}))
vi.mock('@/views/features/workflow/flow-model/design/ui/node-panel/flow-design-node-auth-panel.vue', () => ({
  default: defineComponent({
    name: 'FlowDesignNodeAuthPanel',
    props: {viewKey: String, selectedNodeId: String},
    template: '<div data-testid="node-auth-panel" />',
  }),
}))
vi.mock('@/views/features/workflow/flow-model/design/ui/form-panel/flow-design-form-panel.vue', () => ({
  default: defineComponent({
    name: 'FlowDesignFormPanel',
    props: {viewKey: String},
    template: '<div data-testid="form-panel" />',
  }),
}))
vi.mock('@/views/features/workflow/flow-model/design/ui/edge-panel/flow-design-edge-panel.vue', () => ({
  default: defineComponent({
    name: 'FlowDesignEdgePanel',
    props: {viewKey: String, highlightId: [String, Number, null]},
    emits: ['selectGraphId'],
    template: '<button data-testid="pick-edge" type="button" @click="$emit(\'selectGraphId\', \'E-7\')">流程连线</button>',
  }),
}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {design: {readTextFile: vi.fn(async () => '')}},
}))
vi.mock('@spark-appworks/spark-component', async importOriginal => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-component')>()
  return {
    ...actual,
    RendererGraph: {name: 'RendererGraph', template: '<div data-testid="flow-graph">流程图</div>'},
  }
})

const {default: FlowDesignPage} = await import('@/views/features/workflow/flow-model/design/ui/flow-design-page.vue')

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

function createDesignRuntime(): PageRuntime {
  const tables: Record<string, MockView> = {
    WFM_FLOW_MODLE: createView([{TITLE: '审批样例', DesignJson: ''}]),
    WFM_FLOW_NODE: createView([{TITLE: '开始', NODETYPE: '8'}]),
    WFM_NODE_REALATION: createView([]),
    WFM_WORKFORM: createView([]),
    Base_NavigationInfo: createView([]),
    FunctionNodeAuth: createView([]),
    _Base_FunctionNode: createView([]),
  }
  return {
    instanceId: 'flow-design-mount-runtime',
    getDataSet: (scenarioId: string) => scenarioId === FLOW_DESIGN_SCENARIO_ID
      ? {getView: (name: string, viewId = 'default') => {
        if (name === 'FunctionNodeAuth' && viewId === 'nodeAuth') return tables['FunctionNodeAuth']
        if (name === '_Base_FunctionNode' && viewId === 'flowDesignOptions') return tables['_Base_FunctionNode']
        return tables[name]
      }}
      : undefined,
    resolveView: () => null,
    dispose: () => undefined,
    materialize: () => undefined,
  } as unknown as PageRuntime
}

const Host = defineComponent({
  props: {flowModelId: {type: String, required: true}},
  setup(props) {
    const {sparkProvide} = useSparkComponent({type: 'flow-design-mount-host'})
    sparkProvide(PAGE_RUNTIME, createDesignRuntime())
    return () => h(FlowDesignPage, {flowModelId: props.flowModelId})
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

async function mountDesign(flowModelId = 'FM-1'): Promise<VueWrapper> {
  const wrapper = mount(defineComponent({
    setup: () => () => h(withTestPageService(Host), {flowModelId}),
  }), {
    attachTo: document.body,
    global: {plugins: [ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('flow design page mount', () => {
  it('renders target title, read-only graph, and node/edge sections', async () => {
    const wrapper = await mountDesign()
    expect(wrapper.text()).toContain('设计目标：审批样例')
    expect(wrapper.find('[data-testid="flow-graph"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('流程节点')
    expect(wrapper.text()).toContain('流程连线')
  })

  it('updates node highlight when table emits selectGraphId', async () => {
    const wrapper = await mountDesign()
    await wrapper.find('[data-testid="pick-node"]').trigger('click')
    await flushPromises()
    const nodePanel = wrapper.findComponent({name: 'FlowDesignNodePanel'})
    expect(nodePanel.props('highlightId')).toBe('N-42')
    const edgePanel = wrapper.findComponent({name: 'FlowDesignEdgePanel'})
    expect(edgePanel.props('highlightId')).toBeNull()
  })

  it('surfaces error when parent runtime is missing', async () => {
    const wrapper = mount(defineComponent({
      setup: () => () => h(withTestPageService(FlowDesignPage), {flowModelId: 'FM-2'}),
    }), {
      attachTo: document.body,
      global: {plugins: [ElementPlus, Spark.createPlugin()]},
    })
    wrappers.push(wrapper)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('缺少父页运行实例')
  })
})