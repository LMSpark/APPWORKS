import {expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {DataSet, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {FLOW_DESIGN_SCENARIO_ID, FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import BusFlowDetailPage from '@/views/features/workflow/flow-runtime/bus-detail/ui/bus-flow-detail-page.vue'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'

const {loadScenario} = vi.hoisted(() => ({loadScenario: vi.fn()}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: loadScenario}))

it('renders the business detail tool against the monitor and workbench scenarios', async () => {
  const monitor = DataSet.fromJson({scenarioId: FLOW_MONITOR_SCENARIO_ID, tables: {}})
  const design = DataSet.fromJson({scenarioId: FLOW_DESIGN_SCENARIO_ID, tables: {}})
  const workbench = DataSet.fromJson({scenarioId: FLOW_WORKBENCH_SCENARIO_ID, tables: {}})
  const instance = {rowid: 'WF-1', WFMID: 'FM-1', TITLE: '流程实例摘要', status: '待办理', BusTblObjID: 'BUS-1'}
  function bind(dataSet: DataSet, tableName: string, row?: Record<string, string>) {
    const resource = {resourceType: 'logical-view', resourceId: tableName}
    const columns = Object.keys(row ?? {rowid: ''}).map(name => ({name, primary: name === 'rowid'}))
    const view = ensureDataSetResourceView({dataSet, tableName, resource, columns})
    bindDataSetReadonlyCommandQuery(view, {resource, guard: () => {}, loadRows: async () => row ? [row] : []})
  }
  bind(monitor, 'View_FlowObjList', instance)
  bind(monitor, 'WFOBJ_FLOW', instance)
  bind(design, 'WFM_WORKFORM')
  bind(workbench, 'WFOBJ_FLOW_FORM')
  bind(workbench, 'WFOBJ_FLOW_RELATIONLINE_STEP')
  bind(workbench, 'WFOBJ_FLOW', instance)
  const scenarios = new Map([[FLOW_MONITOR_SCENARIO_ID, monitor], [FLOW_DESIGN_SCENARIO_ID, design], [FLOW_WORKBENCH_SCENARIO_ID, workbench]])
  loadScenario.mockImplementation(async ({scenarioId}: {scenarioId: string}) => scenarios.get(scenarioId))
  const path = '/apps/APP-1/features/workflow/flow-runtime/bus-detail/ui/bus-flow-detail-page'
  const router = createRouter({history: createMemoryHistory(), routes: [{path, component: BusFlowDetailPage,
    meta: {nodeId: 'business-detail', blueprintScenarioId: FLOW_MONITOR_SCENARIO_ID, systemPageIdentityState: 'resolved'}}]})
  await router.push({path, query: {wfid: 'WF-1', flowid: 'FM-1'}})
  registerAllRenderers()
  const wrapper = mount(withTestPageService(RouterView, router), {global: {plugins: [router, ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
  try {
    await flushPromises()
    expect(loadScenario.mock.calls.map(([input]) => input.scenarioId)).toEqual(expect.arrayContaining([...scenarios.keys()]))
    const summary = wrapper.getComponent(RendererTable)
    expect(summary.props('dataViewKey')).toBe(`${FLOW_MONITOR_SCENARIO_ID}@WFOBJ_FLOW@default`)
    expect(summary.props('children')).toEqual(expect.arrayContaining([expect.objectContaining({props: expect.objectContaining({field: 'TITLE', label: '流程标题'})})]))
    expect(monitor.getView('WFOBJ_FLOW')?.rows[0]).toMatchObject(instance)
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(expect.arrayContaining(['办理', '运行详情']))
  } finally {wrapper.unmount()}
})
