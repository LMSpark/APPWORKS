import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {createRouter,createMemoryHistory} from 'vue-router'
import {SystemPageIdentityPool} from '../../../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
import {defineComponent, h, ref, isRef, type Ref} from 'vue'
import {fixture} from './flow-design-data.fixture'
import {lowcodeApi} from '@/platform-adapters/lowcode-runtime'
import {PAGE_RUNTIME, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID, saveFlowDesignInfo} from '@/platform-adapters/resources/system/workflow/manage'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'

vi.mock('@/platform-adapters/resources/system/workflow/manage', async importOriginal => ({
  ...await importOriginal<typeof import('@/platform-adapters/resources/system/workflow/manage')>(),
  saveFlowDesignInfo: vi.fn(async () => ({complete:true})),
}))

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
vi.mock('@spark-appworks/spark-component', async importOriginal => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-component')>()
  return {
    ...actual,
    RendererGraph: {name: 'RendererGraph', props: {disabled: Boolean}, template: '<div data-testid="flow-graph">流程图</div>'},
  }
})

const {default: FlowDesignPage} = await import('@/views/features/workflow/flow-model/design/ui/flow-design-page.vue')

let currentRuntime:PageRuntime
let queryGate:Promise<void>|undefined
const Host = defineComponent({
  props: {flowModelId: {type: String, required: true}},
  setup(props) {
    const {sparkProvide} = useSparkComponent({type: 'flow-design-mount-host'})
    sparkProvide(PAGE_RUNTIME, currentRuntime)
    return () => h(FlowDesignPage, {flowModelId: props.flowModelId})
  },
})

const HostWithPageService=withTestPageService(Host)
let currentPage:ReturnType<SystemPageIdentityPool['get']>
function systemOwner(component:ReturnType<typeof defineComponent>){
 const router=createRouter({history:createMemoryHistory(),routes:[]})
 currentPage=new SystemPageIdentityPool().get(router.currentRoute.value,{scope:'application',nodeId:'design',pageId:'design',path:'/test',title:'流程设计',component,explicitQuery:{}})
 return currentPage.view
}
const wrappers: VueWrapper[] = []

beforeEach(() => {
  queryGate = undefined
  vi.mocked(saveFlowDesignInfo).mockReset().mockResolvedValue({complete:true})
  vi.mocked(lowcodeApi.design.readTextFile).mockClear()
  registerAllRenderers()
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(item => item.unmount())
  vi.unstubAllGlobals()
})

async function mountDesign(flowModelId: string | Ref<string> = 'FM-1'): Promise<VueWrapper> {
  const state=await fixture(true,false);currentRuntime=state.runtime
  state.http.beforeDefinitionRead=async()=>{await queryGate}
  const wrapper = mount(systemOwner(defineComponent({
    setup: () => () => h(HostWithPageService, {flowModelId: isRef(flowModelId) ? flowModelId.value : flowModelId}),
  })), {
    attachTo: document.body,
    global: {plugins: [ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('flow design page mount', () => {
  it.each(['unmount', 'switch'])('stops the original file read after %s while model queries are pending', async outcome => {
    let release: (() => void) | undefined
    queryGate = new Promise(resolve => {release = resolve})
    const target = ref('FM-1'), wrapper = await mountDesign(target)
    if (outcome === 'unmount') wrapper.unmount()
    else {target.value = 'FM-2'; await flushPromises()}
    release?.(); await flushPromises(); await flushPromises()
    const files = vi.mocked(lowcodeApi.design.readTextFile).mock.calls.map(([input]) => input.fileName)
    expect(files).not.toContain('FM-1EJ2.json')
    if (outcome === 'switch') expect(files).toEqual(['FM-2EJ2.json'])
  })

  it('unlocks the graph after successful save and reload', async () => {
    const wrapper = await mountDesign()
    const save = wrapper.findAll('button').find(button => button.text().includes('保存设计'))
    expect(save).toBeDefined()
    await save!.trigger('click'); await flushPromises(); await flushPromises()
    expect(saveFlowDesignInfo).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({name: 'RendererGraph'}).props('disabled')).toBe(false)
    const again = wrapper.findAll('button').find(button => button.text().includes('保存设计'))!
    expect(again.attributes('disabled')).toBeUndefined()
  })

  it('renders target title, read-only graph, and node/edge sections', async () => {
    const wrapper = await mountDesign()
    expect(wrapper.text()).toContain('设计目标：Flow 1')
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

  it('stages graph creation and cancels it without writes while guarding page close',async()=>{
    const wrapper=await mountDesign(),nodes=currentRuntime.getDataSet(FLOW_DESIGN_SCENARIO_ID)!.getView('WFM_FLOW_NODE')!
    const add=wrapper.findAll('button').find(button=>button.text().includes('新增节点'))!
    await add.trigger('click');await flushPromises()
    expect(nodes.rows).toHaveLength(2);expect(currentPage.isDirty).toBe(true)
    const cancel=wrapper.findAll('button').find(button=>button.text().includes('取消修改'))!
    await cancel.trigger('click');await flushPromises()
    expect(nodes.rows.map(row=>row['rowid'])).toEqual(['N1']);expect(currentPage.isDirty).toBe(false)
  })

  it('retains the original dirty workspace when its parent supplies another target',async()=>{
    const target=ref('FM-1'),wrapper=await mountDesign(target),ds=currentRuntime.getDataSet(FLOW_DESIGN_SCENARIO_ID)!,nodes=ds.getView('WFM_FLOW_NODE')!
    await wrapper.findAll('button').find(button=>button.text().includes('新增节点'))!.trigger('click');await flushPromises()
    target.value='FM-2';await flushPromises()
    expect(nodes.queryContext['FLOWID']).toBe('FM-1');expect(nodes.dirtyTracking.hasPendingChanges()).toBe(true);expect(currentPage.isDirty).toBe(true)
    const cancel=wrapper.findAll('button').find(button=>button.text().includes('取消修改'))!
    expect(cancel.attributes('disabled')).toBeUndefined()
    await cancel.trigger('click');await flushPromises();await flushPromises()
    expect(nodes.queryContext['FLOWID']).toBe('FM-2');expect(currentPage.isDirty).toBe(false)
  })

  it('surfaces error when parent runtime is missing', async () => {
    const wrapper = mount(systemOwner(defineComponent({
      setup: () => () => h(withTestPageService(FlowDesignPage), {flowModelId: 'FM-2'}),
    })), {
      attachTo: document.body,
      global: {plugins: [ElementPlus, Spark.createPlugin()]},
    })
    wrappers.push(wrapper)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('缺少父页运行实例')
  })
})