import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {defineComponent, h, reactive} from 'vue'
import {PAGE_RUNTIME, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSet, bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView, type DataView} from '@spark-appworks/spark-data'
import {createFlowRunOptionsBinding} from '@/lowcode/resources/system/workflow/manage/flow-run-page/query/options-binding'
import {FlowRunCommandResource} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/flow-run-command-resource'
import {FLOW_DESIGN_SCENARIO_ID, FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'
import {createMemoryHistory, createRouter} from 'vue-router'
import {SystemPageIdentityPool} from '../../../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
const {reloadRuntime} = vi.hoisted(() => ({reloadRuntime: vi.fn(async () => undefined)}))

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
      loadCurrentRoute: reloadRuntime,
    }),
  }
})
const routeState = reactive({query: {wfid: 'WF-1', flowid: 'FM-1', stepid: ''}, meta: {}, path: '/test'})
let releaseOldQuery: (() => void) | undefined
let delayFirstQuery = false
let instanceReads = 0
const approvalState = {hasUnconfirmedSave: false, mutating: false, hasEditingChanges: () => false, dirtyTracking: {hasPendingChanges: () => false}}
let originalCommandView: DataView | undefined
let originalOptionsView: DataView | undefined
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => routeState,
    useRouter: () => ({resolve: vi.fn(() => ({matched: [], path: '/demo'}))}),
  }
})
vi.mock('@/views/features/workflow/flow-runtime/run-page/ui/flow-run-route-renderer.vue', () => ({
  default: {name: 'FlowRunRouteRenderer', props: ['fallbackProps'], template: '<div data-testid="biz-route">{{ JSON.stringify(fallbackProps) }}</div>'},
}))
vi.mock('@/registries/vue-page-registry', () => ({getVuePageOptions: () => [{path: '/business'}]}))
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
    refresh: vi.fn(async () => {
      if (delayFirstQuery) {
        delayFirstQuery = false
        await new Promise<void>(resolve => {releaseOldQuery = resolve})
      }
    }),
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
    ApprovalOptions: originalOptionsView,
    ApprovalCommand: originalCommandView ?? approvalState,
    WFOBJ_FLOW: createView([{rowid: 'WF-1', WFMID: 'FM-1'}]),
    WFOBJ_FLOW_FORM: createView([{FORMID: 'F1', FormPath: '/business', FormParams: 'rowid=BUS-9'}]),
    WFOBJ_FLOW_RELATIONLINE_STEP: createView([{rowid: 'S1', WFOBJID: 'WF-1'}]),
    WFOBJ_FLOW_Waiting: createView([]),
  }
  const instanceRows = monitor.View_FlowObjList.rows
  Object.defineProperty(monitor.View_FlowObjList, 'rows', {get: () => {instanceReads += 1; return instanceRows}})
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

const RawHost = defineComponent({
  setup() {
    const {sparkProvide} = useSparkComponent({type: 'flow-run-page-mount-host'})
    sparkProvide(PAGE_RUNTIME, createRuntime())
    return () => h(FlowRunPage)
  },
})
const pagePool = new SystemPageIdentityPool()
const fixtureRouter = createRouter({history: createMemoryHistory(), routes: []})
const pageInstance = pagePool.get(fixtureRouter.currentRoute.value, {scope: 'application', nodeId: 'run', pageId: 'run', path: '/test', title: '办理', component: RawHost, explicitQuery: {}})
const Host = pageInstance.view

const wrappers: VueWrapper[] = []

beforeEach(() => {
  registerAllRenderers()
  approvalState.hasUnconfirmedSave = false
  reloadRuntime.mockClear()
  routeState.query.stepid = ''
  releaseOldQuery = undefined
  delayFirstQuery = false
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(item => item.unmount())
  vi.unstubAllGlobals()
})

describe('flow run page mount', () => {
  it('queries and renders approval options from the original runtime DataView', async () => {
    const ds = DataSet.fromJson({scenarioId: FLOW_WORKBENCH_SCENARIO_ID, tables: {}})
    const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
    const query = vi.fn(async () => ({nextNodes: [{rowid: 'NEXT-1', title: '正式后续节点'}]}))
    bindDataSetReadonlyCommandQuery(view, createFlowRunOptionsBinding({view, client: {getHandleOptionData: query}, guard: () => {}, captureTarget: () => () => {}}))
    originalOptionsView = view
    routeState.query.stepid = 'S1'
    const wrapper = mount(defineComponent({setup: () => () => h(withTestPageService(Host))}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
    try {
      await flushPromises()
      const button = wrapper.findAll('button').find(item => item.text() === '办理')!
      await button.trigger('click')
      await flushPromises()
      expect(query).toHaveBeenCalledWith({modelId: 'FM-1', stepId: 'S1', busRowId: 'BUS-1', formid: 'F1'})
      expect(wrapper.text()).toContain('正式后续节点')
      expect(view.rows[0]?.['payload']).toEqual({nextNodes: [{rowid: 'NEXT-1', title: '正式后续节点'}]})
    } finally {wrapper.unmount(); originalOptionsView = undefined; ds.destroy()}
  })
  it('retains the actual unknown DataSet command when the system page is closed', async () => {
    const ds = DataSet.fromJson({scenarioId: FLOW_WORKBENCH_SCENARIO_ID, tables: {}})
    const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'}, columns: [{name: 'rowid', primary: true}, {name: 'action'}, {name: 'flowObjectId'}, {name: 'stepId'}]})
    const dispatch = vi.fn(async () => {throw Error('lost receipt')})
    bindDataSetCommandSubmit(view, new FlowRunCommandResource({view, guard: () => {}, captureTarget: () => () => {}, dispatch}).binding())
    originalCommandView = view
    const wrapper = mount(defineComponent({setup: () => () => h(withTestPageService(Host))}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
    try {
      await flushPromises()
      await view.refresh()
      await view.addRow({action: 'submit', flowObjectId: 'WF-1', stepId: 'S1'})
      await expect(ds.saveChanges()).rejects.toThrow()
      expect(view.hasUnconfirmedSave).toBe(true)
      expect(() => pagePool.close(pageInstance.instanceId)).toThrow('待核验')
      expect(view.destroyed).toBe(false)
      expect(dispatch).toHaveBeenCalledTimes(1)
      originalCommandView = undefined
      const second = pagePool.get({...fixtureRouter.currentRoute.value, path: '/second'}, {scope: 'application', nodeId: 'second', pageId: 'second', path: '/second', title: '另一个办理页', component: RawHost, explicitQuery: {}})
      const secondWrapper = mount(defineComponent({setup: () => () => h(withTestPageService(second.view))}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
      try {
        await flushPromises()
        expect(second.isDirty).toBe(false)
        expect(pagePool.close(second.instanceId)).toBe(true)
        expect(() => pagePool.close(pageInstance.instanceId)).toThrow('待核验')
      } finally {secondWrapper.unmount()}
    } finally {wrapper.unmount(); originalCommandView = undefined; ds.destroy()}
  })
  it('blocks releasing the real system-page instance while its original command is unknown', async () => {
    const wrapper = mount(defineComponent({setup: () => () => h(withTestPageService(Host))}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
    wrappers.push(wrapper)
    await flushPromises()
    approvalState.hasUnconfirmedSave = true
    expect(() => pagePool.assertClean()).toThrow('待核验')
    expect(() => pagePool.close(pageInstance.instanceId)).toThrow('待核验')
    wrapper.findComponent({name: 'RendererSection'}).vm.$emit('retry')
    await flushPromises()
    expect(reloadRuntime).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('原审批命令')
    approvalState.hasUnconfirmedSave = false
    expect(() => pagePool.assertClean()).not.toThrow()
  })
  it('stops an outstanding query after the page is unmounted', async () => {
    delayFirstQuery = true
    const wrapper = mount(defineComponent({setup: () => () => h(withTestPageService(Host))}), {
      global: {plugins: [ElementPlus, Spark.createPlugin()]},
    })
    await flushPromises()
    wrapper.unmount()
    const readsBeforeRelease = instanceReads
    releaseOldQuery?.()
    await flushPromises()
    expect(instanceReads).toBe(readsBeforeRelease)
  })

  it('does not let a late old query replace the newer rejected step', async () => {
    delayFirstQuery = true
    const wrapper = mount(defineComponent({setup: () => () => h(withTestPageService(Host))}), {
      global: {plugins: [ElementPlus, Spark.createPlugin()]},
    })
    wrappers.push(wrapper)
    await flushPromises()
    routeState.query.stepid = 'missing'
    await flushPromises()
    expect(wrapper.text()).toContain('指定办理步骤')
    const readsBeforeRelease = instanceReads
    releaseOldQuery?.()
    await flushPromises()
    expect(instanceReads).toBe(readsBeforeRelease)
    expect(wrapper.text()).not.toContain('未查询到业务页签')
  })

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
    expect(wrapper.text()).toContain('核验原办理结果')
    expect(JSON.parse(wrapper.find('[data-testid="biz-route"]').text())).toEqual({
      flowid: 'FM-1', flowobjid: 'WF-1', stepid: '', workFormId: 'F1', pageParam: 'rowid=BUS-9', busRowid: 'BUS-1',
    })
    routeState.query.stepid = 'missing-step'
    await flushPromises()
    expect(wrapper.text()).toContain('指定办理步骤不在本次实例正式查询结果中')
  })
})
