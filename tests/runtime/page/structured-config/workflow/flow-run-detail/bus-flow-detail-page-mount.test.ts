import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {createMemoryHistory, createRouter} from 'vue-router'
import {DataSet, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {RendererDialog, RendererTable, RendererTabs, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import {FLOW_DESIGN_SCENARIO_ID, FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/platform-adapters/resources/system/workflow/manage'
import BusFlowDetailPage from '@/views/features/workflow/flow-runtime/bus-detail/ui/bus-flow-detail-page.vue'
import FlowRunPage from '@/views/features/workflow/flow-runtime/run-page/ui/flow-run-page.vue'
import {SystemPageIdentityPool} from '../../../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
import FlowRunDetailPage from '@/views/features/workflow/flow-runtime/detail/ui/flow-run-detail-page.vue'
import FlowRunDetailStepTable from '@/views/features/workflow/flow-runtime/detail/ui/flow-run-detail-step-table.vue'
import {fixture as designFixture} from '../flow-design/flow-design-data.fixture'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'

const {loadScenario} = vi.hoisted(() => ({loadScenario: vi.fn()}))
vi.mock('@/platform-adapters/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: loadScenario}))
// Vitest strips CSS imports by default. Pass the actual tool text to the runtime.
vi.mock('@/views/features/workflow/flow-runtime/detail/ui/tool/style.css?raw', async () => {
  const {readFileSync} = await import('node:fs')
  return {default: readFileSync('src/views/features/workflow/flow-runtime/detail/ui/tool/style.css', 'utf8')}
})

const defaultStubs = config.global.stubs
beforeEach(() => {
  loadScenario.mockClear()
  config.global.stubs = {...defaultStubs}
  Reflect.deleteProperty(config.global.stubs, 'el-table')
  Reflect.deleteProperty(config.global.stubs, 'el-table-column')
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {config.global.stubs = defaultStubs; vi.unstubAllGlobals()})

it.each([
  {name: 'business detail', component: BusFlowDetailPage, nodeId: 'business-detail', suffix: 'bus-detail/ui/bus-flow-detail-page', denyDictionary: false},
  {name: 'runtime detail', component: FlowRunDetailPage, nodeId: FLOW_MONITOR_SCENARIO_ID, suffix: 'detail/ui/flow-run-detail-page', denyDictionary: false},
  {name: 'runtime detail with state dictionary denied', component: FlowRunDetailPage, nodeId: FLOW_MONITOR_SCENARIO_ID, suffix: 'detail/ui/flow-run-detail-page', denyDictionary: true},
  {name: 'workflow run', component: FlowRunPage, nodeId: FLOW_MONITOR_SCENARIO_ID, suffix: 'run-page/ui/flow-run-page', denyDictionary: false},
])('renders $name through the owned runtime and peer scenarios', async ({name, component, nodeId, suffix, denyDictionary}) => {
  const runtimeDetail = component === FlowRunDetailPage
  const monitor = DataSet.fromJson({scenarioId: FLOW_MONITOR_SCENARIO_ID, tables: {}})
  const designSource = runtimeDetail ? await designFixture(false, false) : undefined
  if (designSource) {
    designSource.http.records['WFM_FLOW_NODE']?.push({rowid: 'N2', FLOWID: 'FM-1', TITLE: 'Target', TYPEID: 11})
    designSource.http.records['WFM_NODE_REALATION'] = [{rowid: 'E1', FLOWID: 'FM-1', UpNodeID: 'N1', NextNodeID: 'N2'}]
  }
  const design = designSource?.ds ?? DataSet.fromJson({scenarioId: FLOW_DESIGN_SCENARIO_ID, tables: {}})
  const workbench = DataSet.fromJson({scenarioId: FLOW_WORKBENCH_SCENARIO_ID, tables: {}})
  const instance = {rowid: 'WF-1', WFMID: 'FM-1', TITLE: '流程实例摘要', status: '待办理', BusTblObjID: 'BUS-1'}
  function bind(dataSet: DataSet, tableName: string, value?: Record<string, string> | Record<string, string>[]) {
    const resource = {resourceType: 'logical-view', resourceId: tableName}
    const rows = Array.isArray(value) ? value : value ? [value] : []
    const columns = Object.keys(rows[0] ?? {rowid: ''}).map(name => ({name, primary: name === 'rowid'}))
    const view = ensureDataSetResourceView({dataSet, tableName, resource, columns})
    bindDataSetReadonlyCommandQuery(view, {resource, guard: () => {}, loadRows: async () => {
      if (tableName === 'AppendStepStates' && denyDictionary) throw Error('当前人不可读')
      return rows
    }})
  }
  bind(monitor, 'View_FlowObjList', runtimeDetail ? instance : {...instance, rowid: 'WF-OTHER', TITLE: '另一流程', BusTblObjID: 'BUS-OTHER'})
  bind(monitor, 'WFOBJ_FLOW', instance)
  if (!runtimeDetail) bind(design, 'WFM_WORKFORM')
  bind(monitor, 'Dict_state')
  bind(workbench, 'WFOBJ_FLOW_Waiting', [{rowid: 'W1', wfid: 'WF-1', StepID: 'S1', NodeID: 'N1'},
    {rowid: 'W2', wfid: 'WF-OTHER', StepID: 'S2', NodeID: 'N1'}])
  bind(workbench, 'WFOBJ_FLOW_FORM')
  const step = {rowid: 'S1', WFOBJID: 'WF-1', StepState: '0', description: '待处理的正式步骤',
    STARTTIME: '2026-11-26 08:00:00', ReceiveNodeModelId: 'N1', SendNodeModelId: 'N2'}
  bind(workbench, 'WFOBJ_FLOW_RELATIONLINE_STEP', [step, {...step, rowid: 'S2', description: '仅另一实例待办'}])
  bind(workbench, 'AppendStepStates', {rowid: '0', value: '0', label: '未签收'})
  bind(workbench, 'WFOBJ_FLOW', instance)
  const scenarios = new Map([[FLOW_MONITOR_SCENARIO_ID, monitor], [FLOW_DESIGN_SCENARIO_ID, design], [FLOW_WORKBENCH_SCENARIO_ID, workbench]])
  loadScenario.mockImplementation(async ({scenarioId}: {scenarioId: string}) => scenarios.get(scenarioId))
  const path = `/apps/APP-1/features/workflow/flow-runtime/${suffix}`
  const router = createRouter({history: createMemoryHistory(), routes: [{path, component,
    meta: {nodeId, blueprintScenarioId: FLOW_MONITOR_SCENARIO_ID, systemPageIdentityState: 'resolved'}}]})
  const query = {wfid: 'WF-1', flowid: 'FM-1'}
  await router.push({path, query})
  const page = new SystemPageIdentityPool().get(router.currentRoute.value, {
    scope: 'application', nodeId, pageId: nodeId, path, title: name, component, explicitQuery: query,
  })
  registerAllRenderers()
  const wrapper = mount(withTestPageService(page.view, router), {global: {plugins: [router, ElementPlus, Spark.createPlugin()],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn},
    stubs: {SparkComponentRenderer: false}}})
  try {
    await flushPromises()
    expect(loadScenario.mock.calls.map(([input]) => input.scenarioId)).toEqual(expect.arrayContaining([...scenarios.keys()]))
    if (runtimeDetail) {
      const pageRoot = wrapper.get('.spark-page-container')
      const instanceId = pageRoot.attributes('data-page')
      expect(instanceId).toBeTruthy()
      expect(wrapper.get('style').element.textContent).toContain(`[data-page="${instanceId}"].spark-page-container .flow-run-detail-page__graph`)
      expect(wrapper.text()).toContain('运行轨迹')
      const graph = wrapper.getComponent({name: 'RendererGraph'})
      expect(graph.props('disabled')).toBe(true)
      expect(graph.props('edgeSourceField')).toBe('UpNodeID')
      expect(graph.props('edgeTargetField')).toBe('NextNodeID')
      expect(graph.props('dataViewKey')).toBe(`${FLOW_DESIGN_SCENARIO_ID}@WFM_FLOW_NODE@default`)
      expect(graph.props('edgeDataViewKey')).toBe(`${FLOW_DESIGN_SCENARIO_ID}@WFM_NODE_REALATION@default`)
      graph.vm.$emit('select', {kind: 'node', id: 'N1', open: true, control: {cancel: false}})
      await flushPromises()
      const drilldown = wrapper.findAllComponents(RendererDialog).find(dialog => dialog.props('title')?.endsWith(' - 步骤信息'))
      expect(drilldown?.props('modelValue')).toBe(true)
      expect(drilldown?.getComponent(FlowRunDetailStepTable).props()).toMatchObject({
        viewKey: `${FLOW_WORKBENCH_SCENARIO_ID}@WFOBJ_FLOW_RELATIONLINE_STEP@default`, receivedNodeId: 'N1', showVoided: false,
      })
      const receivedSteps = drilldown?.getComponent(FlowRunDetailStepTable)
      const stepTable = receivedSteps?.getComponent(RendererTable)
      const rows = stepTable?.findAll('.el-table__row') ?? []
      expect(rows.map(row => row.text())).toEqual(expect.arrayContaining([expect.stringContaining('待处理的正式步骤'), expect.stringContaining('仅另一实例待办')]))
      expect(rows.find(row => row.text().includes('待处理的正式步骤'))?.text()).toContain('待办')
      expect(rows.find(row => row.text().includes('仅另一实例待办'))?.find('.el-tag').exists()).toBe(false)
      if (denyDictionary) {
        expect(receivedSteps?.text()).toContain('流程步骤状态字典读取失败')
        expect(stepTable?.text()).not.toContain('未签收')
      } else {
        expect(stepTable?.text()).toContain('未签收')
      }
      drilldown?.getComponent(RendererTabs).vm.$emit('update:modelValue', 'sent')
      await flushPromises()
      expect(drilldown?.findAllComponents(FlowRunDetailStepTable).some(table => table.props('sentNodeId') === 'N1')).toBe(true)
      drilldown?.vm.$emit('update:modelValue', false)
      const edge = design.getView('WFM_NODE_REALATION')?.rows[0]
      expect(edge?.['rowid']).toBeDefined()
      graph.vm.$emit('select', {kind: 'edge', id: edge?.['rowid'], open: true, control: {cancel: false}})
      await flushPromises()
      const edgeDrilldown = wrapper.findAllComponents(RendererDialog).find(dialog => dialog.props('title')?.includes(' → '))
      expect(drilldown?.props('modelValue')).toBe(false)
      expect(edgeDrilldown?.props('modelValue')).toBe(true)
      expect(edgeDrilldown?.getComponent(FlowRunDetailStepTable).props()).toMatchObject({sentNodeId: 'N1', receivedNodeId: 'N2'})
      expect(wrapper.getComponent(RendererTable).props('dataViewKey')).toBe(`${FLOW_MONITOR_SCENARIO_ID}@View_FlowObjList@default`)
      const destination = '/apps/APP-1/features/workflow/flow-runtime/run-page/ui/flow-run-page'
      router.addRoute({path: destination, component: {render: () => null}})
      const button = wrapper.findAll('button').find(item => item.text() === '前往办理')
      expect(button).toBeDefined()
      await button!.trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(destination)
      expect(router.currentRoute.value.query).toMatchObject({...query, [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: FLOW_MONITOR_SCENARIO_ID})
      return
    }
    if (name === 'workflow run') {
      expect(wrapper.text()).toContain('流程实例摘要')
      expect(wrapper.text()).not.toContain('另一流程')
      expect(wrapper.text()).toContain('步骤历史')
      expect(wrapper.getComponent(RendererTable).props('dataViewKey')).toBe(`${FLOW_WORKBENCH_SCENARIO_ID}@WFOBJ_FLOW_RELATIONLINE_STEP@default`)
      return
    }
    const summary = wrapper.getComponent(RendererTable)
    expect(wrapper.text()).toContain('流程实例摘要')
    expect(wrapper.text()).not.toContain('另一流程')
    expect(summary.props('dataViewKey')).toBe(`${FLOW_MONITOR_SCENARIO_ID}@WFOBJ_FLOW@default`)
    expect(summary.props('children')).toEqual(expect.arrayContaining([expect.objectContaining({props: expect.objectContaining({field: 'TITLE', label: '流程标题'})})]))
    expect(monitor.getView('WFOBJ_FLOW')?.rows[0]).toMatchObject(instance)
    for (const [label, destination] of [
      ['办理', '/apps/APP-1/features/workflow/flow-runtime/run-page/ui/flow-run-page'],
      ['运行详情', '/apps/APP-1/features/workflow/flow-runtime/detail/ui/flow-run-detail-page'],
    ] as const) {
      router.addRoute({path: destination, component: {render: () => null}})
      const button = wrapper.findAll('button').find(item => item.text() === label)
      expect(button).toBeDefined()
      await button!.trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(destination)
      expect(router.currentRoute.value.query).toMatchObject({...query, [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: FLOW_MONITOR_SCENARIO_ID})
    }
  } finally {wrapper.unmount()}
})
