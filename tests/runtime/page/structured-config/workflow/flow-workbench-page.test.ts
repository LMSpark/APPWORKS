import {expect, it, vi} from 'vitest'
import {config, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {DataSet, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import * as scenarioLoader from '@/lowcode/data-space/lowcode-data-space-runtime'
import * as lowcode from '@/lowcode/lowcode-runtime'
import {buildFlowRunPageRoute, FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import FlowWorkbenchTodoPanel from '@/views/features/workflow/flow-workbench/ui/flow-workbench-todo-panel.vue'
import {withTestPageService} from '../../../../support/helpers/page-service-host'

it('opens the selected workbench step through the configured action', async () => {
  const scene = FLOW_WORKBENCH_SCENARIO_ID
  const ds = DataSet.fromJson({scenarioId: scene, tables: {
    WFOBJ_FLOW_Waiting: {resourceId: 'waiting', resourceType: 'logical-view',
      columns: ['rowid', 'wfid', 'FlowID', 'StepID', 'NodeName', 'UserName'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
      views: {default: {autoLoad: false}, workbenchPending: {autoLoad: false, queryConfig: {pagination: 'none', autoQuery: false}}}},
    WFOBJ_FLOW_RELATIONLINE_STEP: {columns: [], views: {default: {autoLoad: false}, workbenchProcessed: {autoLoad: false}, workbenchShared: {autoLoad: false}}},
    WFOBJ_FLOW: {columns: [], views: {default: {autoLoad: false}, workbenchStarted: {autoLoad: false}}},
  }})
  const pending = ds.getView('WFOBJ_FLOW_Waiting', 'workbenchPending')!
  bindDataSetReadonlyCommandQuery(pending, {resource: {resourceType: 'logical-view', resourceId: 'waiting'}, guard: () => {},
    loadRows: async () => [{rowid: 'R1', wfid: 'WF1', FlowID: 'DEF1', StepID: 'STEP1', NodeName: '办理节点'}]})
  const loader = vi.spyOn(scenarioLoader, 'loadLowcodeRuntimeScenario').mockResolvedValue(ds)
  const principal = vi.spyOn(lowcode, 'readLowcodePrincipal').mockReturnValue({userId: 'U1'} as ReturnType<typeof lowcode.readLowcodePrincipal>)
  const path = '/apps/APP/workbench'
  const target = buildFlowRunPageRoute({wfid: 'WF1', flowid: 'DEF1', stepid: 'STEP1'}, {projectId: 'APP'})
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path, component: FlowWorkbenchTodoPanel, meta: {nodeId: FLOW_MONITOR_SCENARIO_ID, blueprintScenarioId: FLOW_MONITOR_SCENARIO_ID, systemPageIdentityState: 'resolved'}},
    {path: target.path, component: {template: '<div>办理目标</div>'}},
  ]})
  await router.push(path)
  registerAllRenderers()
  const originalStubs = config.global.stubs
  const stubs = {...originalStubs}
  for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column', 'el-button']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(withTestPageService(RouterView, router), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  try {
    const run = () => wrapper.findAll('button').find(button => button.text() === '办理')
    await vi.waitFor(() => expect(run(), wrapper.text()).toBeDefined())
    expect(pending.queryContext['currentUserId']).toBe('U1')
    await run()!.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(target.path))
    expect(router.currentRoute.value.query).toEqual(target.query)
  } finally {
    wrapper.unmount()
    config.global.stubs = originalStubs
    loader.mockRestore()
    principal.mockRestore()
  }
})
