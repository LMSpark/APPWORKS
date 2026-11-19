import {expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {createMemoryHistory, createRouter} from 'vue-router'
import {DataSet, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import {FLOW_DESIGN_SCENARIO_ID, FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import BusFlowDetailPage from '@/views/features/workflow/flow-runtime/bus-detail/ui/bus-flow-detail-page.vue'
import FlowRunPage from '@/views/features/workflow/flow-runtime/run-page/ui/flow-run-page.vue'
import {SystemPageIdentityPool} from '../../../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'

const {loadScenario} = vi.hoisted(() => ({loadScenario: vi.fn()}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: loadScenario}))

it.each([
  {name: 'business detail', component: BusFlowDetailPage, nodeId: 'business-detail', suffix: 'bus-detail/ui/bus-flow-detail-page'},
  {name: 'workflow run', component: FlowRunPage, nodeId: FLOW_MONITOR_SCENARIO_ID, suffix: 'run-page/ui/flow-run-page'},
])('renders $name through the owned runtime and peer scenarios', async ({name, component, nodeId, suffix}) => {
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
  const path = `/apps/APP-1/features/workflow/flow-runtime/${suffix}`
  const router = createRouter({history: createMemoryHistory(), routes: [{path, component,
    meta: {nodeId, blueprintScenarioId: FLOW_MONITOR_SCENARIO_ID, systemPageIdentityState: 'resolved'}}]})
  const query = {wfid: 'WF-1', flowid: 'FM-1'}
  await router.push({path, query})
  const page = new SystemPageIdentityPool().get(router.currentRoute.value, {
    scope: 'application', nodeId, pageId: nodeId, path, title: name, component, explicitQuery: query,
  })
  registerAllRenderers()
  const wrapper = mount(withTestPageService(page.view, router), {global: {plugins: [router, ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
  try {
    await flushPromises()
    expect(loadScenario.mock.calls.map(([input]) => input.scenarioId)).toEqual(expect.arrayContaining([...scenarios.keys()]))
    if (name === 'workflow run') {
      expect(wrapper.text()).toContain('流程实例摘要')
      expect(wrapper.text()).toContain('步骤历史')
      expect(wrapper.getComponent(RendererTable).props('dataViewKey')).toBe(`${FLOW_WORKBENCH_SCENARIO_ID}@WFOBJ_FLOW_RELATIONLINE_STEP@default`)
      return
    }
    const summary = wrapper.getComponent(RendererTable)
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
