import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DOMWrapper,config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {defineComponent, h, markRaw, reactive} from 'vue'
import {PAGE_RUNTIME, RendererDialog, RendererForm, RendererTable, RendererTabs, Spark, SparkPageRenderer, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime, type PageTool} from '@spark-appworks/spark-project-model'
import {DataSet, bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView, ensureDataSetStaticInputTable, parseDataViewKey, getSparkNodeChildren, nodeId, type DataView} from '@spark-appworks/spark-data'
import {ensureFlowRunApprovalViews} from '@/lowcode/resources/system/workflow/manage/flow-run-page/input/approval-input-workspace'
import {createFlowRunOptionsBinding} from '@/lowcode/resources/system/workflow/manage/flow-run-page/query/options-binding'
import {FlowRunCommandResource} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/flow-run-command-resource'
import {FLOW_DESIGN_SCENARIO_ID, FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'
import {createMemoryHistory, createRouter} from 'vue-router'
import {SystemPageIdentityPool} from '../../../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
import workbenchScenario from '../../../../../../config/pages/workflow/flow-workbench/pagedata.json'
import {fixture as designFixture} from '../flow-design/flow-design-data.fixture'
const {reloadRuntime} = vi.hoisted(() => ({reloadRuntime: vi.fn(async () => undefined)}))
const {openTool, runtimeOptions} = vi.hoisted(() => ({
  openTool: vi.fn<(pageId: string) => PageTool>(),
  runtimeOptions: vi.fn<(options: {tool: (pageId: string) => PageTool; scenarioId: string; navigationId?: string; preserveRuntime: () => boolean}) => void>(),
}))
const callbacks = vi.hoisted(() => ({end: vi.fn(async (_payload: unknown) => true), succeeded: vi.fn(async (_payload: unknown) => {}), failed: vi.fn((_payload: unknown) => {})}))

vi.mock('@/views/features/shared/runtime/use-feature-page-runtime', async () => {
  const {ref, toRef} = await import('vue')
  return {
    useFeaturePageRuntime: (options: Parameters<typeof runtimeOptions>[0]) => {
      runtimeOptions(options)
      openTool.mockImplementation(options.tool)
      const runtime = markRaw({...(fixturePageRuntime ?? createRuntime()), tool: options.tool(options.navigationId ?? 'mobile-navigation-node')})
      return {
        session: {runtime, isCurrent: (candidate: unknown) => candidate === runtime},
        viewKey: ref('E328FBBF518141973C575D612CD75151@View_FlowObjList@default'),
        ready: ref(true),
        loading: ref(false),
        error: ref(''),
        reloadBlocked: toRef(routeState, 'reloadBlocked'),
        loadCurrentRoute: reloadRuntime,
      }
    },
  }
})
const routeState = reactive({query: {wfid: 'WF-1', flowid: 'FM-1', stepid: ''}, meta: {}, path: '/test', reloadBlocked: false})
let releaseOldQuery: (() => void) | undefined
let delayFirstQuery = false
let instanceReads = 0
const approvalState = {rows: [], hasUnconfirmedSave: false, mutating: false, hasEditingChanges: () => false, dirtyTracking: {hasPendingChanges: () => false}}
let originalCommandView: DataView | undefined
let originalOptionsView: DataView | undefined
let originalDirectoryView: DataView | undefined
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => routeState,
    useRouter: () => ({resolve: vi.fn(() => ({matched: [], path: '/demo'}))}),
  }
})
vi.mock('@/views/features/workflow/flow-runtime/run-page/ui/flow-run-route-renderer.vue', async () => {
  const {defineComponent, h, onMounted, onBeforeUnmount} = await import('vue')
  return {default: defineComponent({name: 'FlowRunRouteRenderer', props: ['fallbackProps', 'registry', 'tabKey'], setup(props) {
    onMounted(() => props['registry'].set(props['tabKey'], {flowSubmitEnd: callbacks.end, flowSubmitSucceeded: callbacks.succeeded, flowSubmitFailed: callbacks.failed}))
    onBeforeUnmount(() => props['registry'].set(props['tabKey'], null))
    return () => h('div', {'data-testid': 'biz-route'}, JSON.stringify(props['fallbackProps']))
  }})}
})
vi.mock('@/registries/vue-page-registry', () => ({getVuePageOptions: () => [{path: '/business'}]}))
vi.mock('@/views/features/workflow/flow-append-user/ui/flow-append-user.vue', () => ({
  default: {name: 'FlowAppendUser', template: '<div data-testid="append-user">加签</div>'},
}))
const {default: MobileFlowRunPage} = await import('@/views/features/workflow/flow-runtime/run-page/ui/flow-run-page-mobile.vue')
const {default: FlowRunPage} = await import('@/views/features/workflow/flow-runtime/run-page/ui/flow-run-page.vue')

type MockView = {
  getColumn:(name:string)=>{name:string}|undefined
  fieldAccess:()=>{read:'visible'}
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
    getColumn:(name:string)=>rows.some(row=>Object.hasOwn(row,name))?{name}:undefined,
    fieldAccess:()=>({read:'visible'}),
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

let designDataSet:DataSet
function createRuntime(): PageRuntime {
  const monitor = {
    View_FlowObjList: createView([{rowid: 'WF-1', TITLE: '实例', WFMID: 'FM-1', BusTblObjID: 'BUS-1'}]),
    WFOBJ_FLOW: createView([{rowid: 'WF-1', WFMID: 'FM-1', TITLE: '实例'}]),
    Dict_state: createView([]),
    Base_UserInfo: originalDirectoryView ?? createView([]),
  }
  const workbench = {
    ApprovalOptions: originalOptionsView,
    ApprovalCommand: originalCommandView ?? approvalState,
    WFOBJ_FLOW: createView([{rowid: 'WF-1', WFMID: 'FM-1'}]),
    WFOBJ_FLOW_FORM: createView([{FORMID: 'F1', FormPath: '/business', FormParams: 'rowid=BUS-9'}, {FORMID: 'F2', FormPath: '/business', FormParams: 'rowid=BUS-10'}]),
    WFOBJ_FLOW_RELATIONLINE_STEP: createView([{rowid: 'S1', WFOBJID: 'WF-1'}]),
    WFOBJ_FLOW_Waiting: createView([]),
  }
  const instanceRows = monitor.View_FlowObjList.rows
  const actualWorkbench = originalOptionsView?.dataSet ?? DataSet.fromJson({scenarioId: FLOW_WORKBENCH_SCENARIO_ID, tables: {}})
  vi.spyOn(actualWorkbench, 'getView').mockImplementation((name, id) => DataSet.prototype.getView.call(actualWorkbench, name, id) ?? workbench[name as keyof typeof workbench] as DataView | undefined)
  Object.defineProperty(monitor.View_FlowObjList, 'rows', {get: () => {instanceReads += 1; return instanceRows}})
  return {
    instanceId: 'flow-run-page-mount',
    getDataSet: (id: string) => {
      if (id === FLOW_DESIGN_SCENARIO_ID) return designDataSet
      if (id === FLOW_MONITOR_SCENARIO_ID) return {getView: (name: string) => monitor[name as keyof typeof monitor]}
      if (id === FLOW_WORKBENCH_SCENARIO_ID) return actualWorkbench
      return undefined
    },
    resolveView: (key: string) => {
      if (key === `${FLOW_MONITOR_SCENARIO_ID}@Base_UserInfo@default`) return originalDirectoryView ?? null
      const descriptor = parseDataViewKey(key)
      const actual = descriptor && actualWorkbench.getView(descriptor.tableName, descriptor.viewId)
      if (actual) return actual
      if (key.includes('View_FlowObjList')) return monitor.View_FlowObjList
      if (key.includes('WFOBJ_FLOW_RELATIONLINE_STEP')) return workbench.WFOBJ_FLOW_RELATIONLINE_STEP
      if (key.includes('WFM_FLOW_NODE')) return designDataSet.getView('WFM_FLOW_NODE')
      if (key.includes('WFM_NODE_REALATION')) return designDataSet.getView('WFM_NODE_REALATION')
      return null
    },
    dispose: () => undefined,
    materialize: () => undefined,
  } as unknown as PageRuntime
}

let fixturePageRuntime: PageRuntime | undefined
const RawHost = defineComponent({
  setup() {
    const {sparkProvide} = useSparkComponent({type: 'flow-run-page-mount-host'})
    fixturePageRuntime = createRuntime()
    sparkProvide(PAGE_RUNTIME, fixturePageRuntime)
    return () => h(FlowRunPage)
  },
})
const pagePool = new SystemPageIdentityPool()
const fixtureRouter = createRouter({history: createMemoryHistory(), routes: []})
const pageInstance = pagePool.get(fixtureRouter.currentRoute.value, {scope: 'application', nodeId: 'run', pageId: 'run', path: '/test', title: '办理', component: RawHost, explicitQuery: {}})
const Host = pageInstance.view

const wrappers: VueWrapper[] = []
const baselineStubs = {...config.global.stubs}
const WorkflowRendererStub = defineComponent({
  props: ['pageRuntime', 'host'],
  setup(props, {slots}) {
    return () => slots['content']?.({children: getSparkNodeChildren((props['pageRuntime'] as PageRuntime).tool.rule.children).filter(node => nodeId(node) !== 'history').map(node => {
      if (nodeId(node) !== 'pageActions' && nodeId(node) !== 'approvalActions') return node
      return {...node, children: getSparkNodeChildren(node.children).map(button => ({
        ...button, props: {...button.props, onClick: () => (props['host'] as {invoke: (name: string) => unknown}).invoke(`workflow.${nodeId(button)}`)},
      }))}
    })})
  },
})


beforeEach(async () => {
  const prepared=await designFixture(false,false);designDataSet=prepared.ds
  prepared.http.records['WFM_FLOW_NODE']!.push({rowid:'N2',FLOWID:'FM-1',TITLE:'Next',TYPEID:11})
  prepared.http.records['WFM_NODE_REALATION']=[{rowid:'E1',FLOWID:'FM-1',UpNodeID:'N1',NextNodeID:'N2'}]
  registerAllRenderers()
  approvalState.hasUnconfirmedSave = false
  originalOptionsView = undefined
  originalDirectoryView = undefined
  config.global.stubs = {...baselineStubs, SparkPageRenderer: WorkflowRendererStub}
  delete config.global.stubs['SparkComponentRenderer']
  delete config.global.stubs['spark-component-renderer']
  reloadRuntime.mockClear()
  callbacks.end.mockReset().mockResolvedValue(true); callbacks.succeeded.mockReset().mockResolvedValue(undefined); callbacks.failed.mockClear()
  routeState.reloadBlocked = false
  routeState.query.wfid = 'WF-1'
  fixturePageRuntime = undefined
  routeState.query.stepid = ''
  releaseOldQuery = undefined
  delayFirstQuery = false
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(item => item.unmount())
  config.global.stubs = {...baselineStubs}
  vi.unstubAllGlobals()
})

describe('flow run page mount', () => {
  it('keeps the mobile navigation node distinct from the monitoring data space', async () => {
    const mobile = pagePool.get(fixtureRouter.currentRoute.value, {scope: 'application', nodeId: 'mobile-navigation-node',
      pageId: 'mobile-navigation-node', path: '/test/mobile', title: '移动办理', component: MobileFlowRunPage, explicitQuery: {}})
    wrappers.push(mount(withTestPageService(mobile.view), {global: {plugins: [ElementPlus, Spark.createPlugin()]}}))
    await flushPromises()
    const options = runtimeOptions.mock.lastCall?.[0]
    expect(options?.scenarioId).toBe(FLOW_MONITOR_SCENARIO_ID)
    expect(options).not.toHaveProperty('navigationId')
    const tool = openTool('mobile-navigation-node')
    expect(tool.pageId).toBe('mobile-navigation-node')
    expect(tool.getFileText('rule.json')).toBe(openTool(FLOW_MONITOR_SCENARIO_ID).getFileText('rule.json'))
  })

  it('loads the history rule under the original navigation and workbench view identities', async () => {
    wrappers.push(mount(withTestPageService(Host), {global: {plugins: [ElementPlus, Spark.createPlugin()]}}))
    await flushPromises()
    const tool = openTool(FLOW_MONITOR_SCENARIO_ID)
    expect(tool.rule.children?.[0]).toMatchObject({
      type: 'r-section',
      props: {title: '步骤历史'},
      children: [{
        type: 'r-table',
        props: {dataViewKey: `${FLOW_WORKBENCH_SCENARIO_ID}@WFOBJ_FLOW_RELATIONLINE_STEP@default`},
        children: [{props: {field: 'description'}}, {props: {field: 'ReceiveUserName'}},
          {props: {field: 'STARTTIME'}}, {props: {field: 'StepState'}}],
      }],
    })
    const model = 'WFOBJ_FLOW_RELATIONLINE_STEP'
    const configured = workbenchScenario.tables[model]
    const workbench = DataSet.fromJson({scenarioId: FLOW_WORKBENCH_SCENARIO_ID, tables: {
      [model]: {...configured, views: {default: configured.views.default}, columns: configured.views.default.queryConfig.fields
        .map(name => ({name, type: name === 'STEPTYPE' ? 'number' : 'string', isPrimaryKey: name === 'rowid'}))},
    }})
    const approval = ensureFlowRunApprovalViews(workbench)
    expect([approval.inputs.rows, approval.nodes.rows, approval.forceTargets.rows]).toEqual([[], [], []])
    const runtime = markRaw(new PageRuntime({tool, scenarioIds: [FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID],
      mainScenarioId: FLOW_MONITOR_SCENARIO_ID,
      loadScenario: async id => id === FLOW_WORKBENCH_SCENARIO_ID ? workbench : DataSet.fromJson({scenarioId: id, tables: {}}),
    }))
    delete config.global.stubs['el-table']
    delete config.global.stubs['el-table-column']
    const invoke = vi.fn()
    try {
      const wrapper = mount(withTestPageService(defineComponent({setup: () => () => h(SparkPageRenderer, {
        pageRuntime: runtime,
        host: {runtime, assertCurrent: () => {}, invoke},
        routeSnapshot: {path: '/test', fullPath: '/test', params: {}, query: {}, hash: '', name: null},
        autoLoad: false,
      })})), {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkPageRenderer: false}}})
      wrappers.push(wrapper)
      await flushPromises()
      const history = workbench.getView(model)
      if (!history) throw new Error('步骤历史视图装配失败')
      history.queryContext = {WFOBJID: 'WF-1'}
      const readAccess = (field: string) => field === 'STARTTIME' ? 'invisible' as const : 'visible' as const
      history.bindQueryExecutor({executeQuery: async () => ({
        rows: [{rowid: 'STEP-1', WFOBJID: 'WF-1', STEPTYPE: 0, description: '原步骤摘要',
          ReceiveUserName: '测试办理人', STARTTIME: '2026-11-19', StepState: '1'}],
        total: 1,
        assertIdentity: identity => expect(identity).toMatchObject({scenarioId: FLOW_WORKBENCH_SCENARIO_ID, metaName: model}),
        rowKey: row => row['rowid'],
        fieldAccess: (_key, field) => ({read: readAccess(field), write: 'denied', required: false,
          component: readAccess(field) === 'visible' ? 'readonly' : 'hidden', writeMode: 'readonly'}),
        readFieldAccess: (_row, field) => readAccess(field),
        addActionState: () => 'hidden', editActionState: () => 'hidden', deleteActionState: () => 'hidden',
        createChildActionState: () => 'hidden', viewActionState: () => 'enabled',
      })})
      await history.refresh()
      expect(history.loadingError).toBeNull()
      await flushPromises()
      expect(wrapper.text()).toContain('步骤历史')
      expect(wrapper.findComponent({name: 'ElTable'}).props('data')).toMatchObject([{rowid: 'STEP-1', description: '原步骤摘要', ReceiveUserName: '测试办理人'}])
      expect(wrapper.text()).toContain('原步骤摘要')
      expect(wrapper.text()).toContain('测试办理人')
      expect(wrapper.text()).not.toContain('2026-11-19')
      await wrapper.findAll('button').find(button => button.text() === '核验原办理结果')?.trigger('click')
      await flushPromises()
      expect(invoke).toHaveBeenCalledWith('workflow.verify', undefined, expect.any(AbortSignal))
    } finally {
      wrappers.pop()?.unmount()
      runtime.dispose()
    }

  })

  it('retains the original context when a navigation change is blocked', async () => {
    const wrapper = mount(withTestPageService(Host), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
    wrappers.push(wrapper)
    await flushPromises()
    const reads = instanceReads
    routeState.reloadBlocked = true
    routeState.query.wfid = 'WF-2'
    await flushPromises()
    expect(instanceReads).toBe(reads)
    expect(wrapper.text()).toContain('当前仍显示原办理记录')
    for (const label of ['流程图', '加签', '撤回', '办理']) {
      expect(wrapper.findAll('button').find(button => button.text() === label)?.attributes('disabled')).toBeDefined()
    }
    expect(wrapper.findAll('button').find(button => button.text() === '核验原办理结果')?.element.disabled).toBe(false)
  })

  it('opens its flow chart with the original formal edge endpoints',async()=>{
    const wrapper=mount(withTestPageService(Host),{global:{plugins:[ElementPlus,Spark.createPlugin()]}})
    wrappers.push(wrapper);await flushPromises()
    await wrapper.findAll('button').find(button=>button.text()==='流程图')!.trigger('click');await flushPromises()
    const graph=wrapper.findComponent({name: 'RendererGraph'}),edge=designDataSet.getView('WFM_NODE_REALATION')!.rows[0]!
    expect(graph.exists()).toBe(true)
    const source=graph.props('edgeSourceField'),target=graph.props('edgeTargetField')
    if(!source||!target)throw Error('流程图必须声明正式连线端点字段')
    expect(edge[source]).toBe('N1')
    expect(edge[target]).toBe('N2')
  })
  it.each(['success', 'unknown', 'callback-error', 'form-switch', 'business-error', 'directory', 'append-input'])('uses original parameter views through the %s outcome', async outcome => {
    const ds = DataSet.fromJson({scenarioId: FLOW_WORKBENCH_SCENARIO_ID, tables: {}})
    const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
    ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCandidates', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}]})
    const steps = ensureDataSetResourceView({dataSet: ds, tableName: 'WFOBJ_FLOW_RELATIONLINE_STEP', resource: {resourceType: 'service-query', resourceId: 'steps'}, columns: [{name: 'rowid', primary: true}, ...['WFOBJID', 'description', 'ReceiveUserName', 'STARTTIME', 'StepState'].map(name => ({name}))]})
    bindDataSetReadonlyCommandQuery(steps, {resource: {resourceType: 'service-query', resourceId: 'steps'}, guard: () => {}, loadRows: async () => [{rowid: 'S1', WFOBJID: 'WF-1'}]})
    const directorySet = DataSet.fromJson({scenarioId: FLOW_MONITOR_SCENARIO_ID, tables: {}})
    const directory = ensureDataSetResourceView({dataSet: directorySet, tableName: 'Base_UserInfo', resource: {resourceType: 'logical-view', resourceId: 'directory'}, columns: [{name: 'rowid', primary: true}, {name: 'UserName'}]})
    directory.queryConfig = {allPages: true, fields: ['rowid', 'UserName']}
    const readDirectory = vi.fn(async () => [{rowid: 'U1', UserName: '张三'}, {rowid: 'U2', UserName: '李四'}])
    bindDataSetReadonlyCommandQuery(directory, {resource: {resourceType: 'logical-view', resourceId: 'directory'}, guard: () => {}, loadRows: readDirectory})
    if (outcome === 'directory') originalDirectoryView = directory
    const payload = {curNode: {rowid: 'CUR', TYPEID: '1', TITLE: '当前'}, nextNodes: [{rowid: 'NEXT-1', title: '正式后续节点', direction: 'forward'}], execUser: outcome === 'directory' ? [{nodeId: 'NEXT-1', minNum: 1, maxNum: 1, allowChange: '1', userList: [{UserId: 'U1', UserName: '张三'}]}] : []}
    const query = vi.fn(async () => payload)
    bindDataSetReadonlyCommandQuery(view, createFlowRunOptionsBinding({view, client: {getHandleOptionData: query}, guard: () => {}, captureTarget: () => () => {}}))
    const command = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'}, columns: [{name: 'rowid', primary: true}, ...['action', 'flowObjectId', 'stepId', 'flowId', 'busRowid', 'formKey', 'idea', 'nodeId', 'type', 'notifyType'].map(name => ({name})), {name: 'isReturn', type: 'boolean'}, {name: 'nextNode', type: 'array'}]})
    const dispatch = vi.fn(async (_row: Readonly<Record<string, unknown>>) => {if (outcome === 'unknown') throw Error('lost receipt')})
    if (outcome === 'callback-error') callbacks.succeeded.mockRejectedValueOnce(Error('callback refresh failed'))
    bindDataSetCommandSubmit(command, new FlowRunCommandResource({view: command, guard: () => {}, captureTarget: () => () => {}, dispatch}).binding())
    const continuation = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalContinuation', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-continuation'}, columns: [{name: 'id', primary: true}, {name: 'enableNext', type: 'boolean'}]})
    bindDataSetReadonlyCommandQuery(continuation, {resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-continuation'}, guard: () => {}, loadRows: async () => [{id: 'current', enableNext: false}]})
    const appendOptions = ensureDataSetResourceView({dataSet: ds, tableName: 'AppendOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:append-options'}, columns: [{name: 'id', primary: true}]})
    bindDataSetReadonlyCommandQuery(appendOptions, {resource: {resourceType: 'logical-view', resourceId: 'workflow:append-options'}, guard: () => {}, loadRows: async () => []})
    originalOptionsView = view
    const originalStubs = {...config.global.stubs}, stubs = {...config.global.stubs}
    for (const key of ['el-table', 'el-table-column', 'el-button']) delete stubs[key]
    config.global.stubs = stubs
    routeState.query.stepid = 'S1'
    const wrapper = mount(defineComponent({setup: () => () => h(withTestPageService(Host))}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
    try {
      await flushPromises()
      if (outcome === 'append-input') {
        ensureDataSetStaticInputTable(ds, 'AppendInput', [{name: 'inputId', primary: true}, {name: 'receiveUsers', type: 'array'}])
        const input = ds.getView('AppendInput')!; input.commitMode = 'staged'
        await appendOptions.refresh(); await flushPromises()
        input.replaceRows([{inputId: 'current', receiveUsers: ['U1:张三']}]); input.setCurrentRowById('current'); await flushPromises()
        expect(pageInstance.isDirty).toBe(true)
        expect(wrapper.findAllComponents(RendererDialog).find(dialog => dialog.props('title') === '追加办理人')?.props('closeDisabled')).toBe(true)
        await wrapper.findAll('button').find(item => item.text() === '办理')!.trigger('click'); await flushPromises()
        expect(query).not.toHaveBeenCalled(); expect(input.rows).toHaveLength(1)
        input.replaceRows([]); await flushPromises()
        expect(pageInstance.isDirty).toBe(false)
        expect(wrapper.findAllComponents(RendererDialog).find(dialog => dialog.props('title') === '追加办理人')?.props('closeDisabled')).toBe(false)
        return
      }
      const button = wrapper.findAll('button').find(item => item.text() === '办理')!
      await button.trigger('click')
      await flushPromises()
      expect(query).toHaveBeenCalledWith({modelId: 'FM-1', stepId: 'S1', busRowId: 'BUS-1', formid: 'F1'})
      expect(wrapper.text()).toContain('正式后续节点')
      const nodes = wrapper.findAllComponents(RendererTable)
        .find(table => table.props('dataViewKey') === `${FLOW_WORKBENCH_SCENARIO_ID}@ApprovalNodeInput@default`)
      expect(nodes?.text()).toContain('下一节点')
      expect(wrapper.findAllComponents(RendererForm).some(form => form.props('dataViewKey') === `${FLOW_WORKBENCH_SCENARIO_ID}@ApprovalInput@default`)).toBe(true)
      expect(view.rows[0]?.['payload']).toEqual(payload)
      expect(readDirectory).toHaveBeenCalledTimes(outcome === 'directory' ? 1 : 0)
      if (outcome === 'directory') ds.getView('ApprovalNodeInput')!.updateEditingValue('NEXT-1', 'ExecUserList', ['U2:李四'])
      if (outcome === 'form-switch') {
        const tabs = wrapper.findComponent(RendererTabs)
        expect(tabs.exists()).toBe(true)
        await tabs.get('#tab-F2').trigger('click'); await flushPromises()
        expect(tabs.props('modelValue')).toBe('F1')
        expect(tabs.get('#tab-F1').attributes('aria-selected')).toBe('true')
        expect(wrapper.text()).toContain('取消原办理参数')
        await wrapper.findAll('button').find(item => item.text() === '关闭')!.trigger('click'); await flushPromises()
        await tabs.get('#tab-F2').trigger('click'); await flushPromises()
        expect(tabs.props('modelValue')).toBe('F2')
        await button.trigger('click'); await flushPromises()
        expect(query).toHaveBeenLastCalledWith(expect.objectContaining({formid: 'F2'}))
        await wrapper.get('textarea').setValue('保留原目标意见')
        routeState.query.wfid = 'WF-OTHER'; await flushPromises()
        await wrapper.findAll('button').find(item => item.text() === '提交')!.trigger('click'); await flushPromises()
        expect(dispatch).not.toHaveBeenCalled()
        expect(callbacks.end).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('目标已变化')
        return
      }
      await wrapper.get('textarea').setValue('同意')
      ds.getView('ApprovalInput')!.updateEditingValue('current', 'notifySms', true)
      callbacks.end.mockResolvedValueOnce(false)
      await wrapper.findAll('button').find(item => item.text() === '提交')!.trigger('click'); await flushPromises()
      expect(dispatch).not.toHaveBeenCalled()
      expect(command.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(ds.getView('ApprovalInput')?.getEditingRow('current')?.['idea']).toBe('同意')
      if (outcome === 'business-error') {
        callbacks.end.mockRejectedValueOnce(Error('business validation failed'))
        await wrapper.findAll('button').find(item => item.text() === '提交')!.trigger('click'); await flushPromises()
        expect(dispatch).not.toHaveBeenCalled()
        expect(callbacks.failed).not.toHaveBeenCalled()
        expect(command.dirtyTracking.hasPendingChanges()).toBe(false)
        expect(wrapper.text()).toContain('business validation failed')
      }
      await wrapper.findAll('button').find(item => item.text() === '提交')!.trigger('click'); await flushPromises()
      expect(dispatch).toHaveBeenCalledTimes(1)
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({idea: '同意', notifyType: '0', nextNode: [{NodeId: 'NEXT-1', ExecUserList: outcome === 'directory' ? ['U2:李四'] : []}]}))
      if (outcome === 'unknown') {
        expect(command.hasUnconfirmedSave).toBe(true)
        expect(runtimeOptions.mock.lastCall?.[0].preserveRuntime()).toBe(true)
        expect(wrapper.findAllComponents(RendererDialog).find(dialog => dialog.props('title') === '追加办理人')?.props('closeDisabled')).toBe(true)
        expect(wrapper.text()).toContain('审批结果未知')
        expect(ds.getView('ApprovalInput')?.getEditingRow('current')?.['idea']).toBe('同意')
        expect(callbacks.succeeded).not.toHaveBeenCalled()
        expect(callbacks.failed).not.toHaveBeenCalled()
        await wrapper.findAll('button').find(item => item.text() === '关闭')!.trigger('click'); await flushPromises()
        expect(wrapper.find('textarea').exists()).toBe(true)
        await wrapper.findAll('button').find(item => item.text() === '提交')!.trigger('click'); await flushPromises()
        expect(dispatch).toHaveBeenCalledTimes(1)
        return
      }
      if (outcome === 'callback-error') {
        expect(wrapper.text()).toContain('审批提交已确认')
        expect(wrapper.find('textarea').exists()).toBe(false)
        const beforeRepeat = callbacks.end.mock.calls.length
        await button.trigger('click'); await flushPromises()
        await wrapper.findAll('button').find(item => item.text() === '提交')!.trigger('click'); await flushPromises()
        expect(callbacks.end).toHaveBeenCalledTimes(beforeRepeat)
        expect(dispatch).toHaveBeenCalledTimes(1)
      }
      expect(callbacks.succeeded).toHaveBeenCalledTimes(1)
      expect(callbacks.failed).not.toHaveBeenCalled()
      expect(callbacks.end).toHaveBeenCalledWith(expect.objectContaining({action: {name: '提交', nodes: [{nodeId: 'NEXT-1', title: '正式后续节点', direction: 'forward', selectedUsers: outcome === 'directory' ? ['U2:李四'] : []}]}, currentNode: expect.objectContaining({rowid: 'CUR'}), opinionText: '同意'}))
      expect(wrapper.findAll('button').find(item => item.text() === '办理')!.attributes('disabled')).toBeUndefined()
    } finally {wrapper.unmount(); originalOptionsView = undefined; originalDirectoryView = undefined; config.global.stubs = originalStubs; ds.destroy(); directorySet.destroy()}
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
