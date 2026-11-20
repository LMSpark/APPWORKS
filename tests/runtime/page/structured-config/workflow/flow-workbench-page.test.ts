import {expect, it, vi} from 'vitest'
import {config, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {DataSet, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import * as scenarioLoader from '@/lowcode/data-space/lowcode-data-space-runtime'
import * as lowcode from '@/lowcode/lowcode-runtime'
import {buildFlowRunDetailRoute, buildFlowRunPageRoute, FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import FlowWorkbenchTodoPanel from '@/views/features/workflow/flow-workbench/ui/flow-workbench-todo-panel.vue'
import {withTestPageService} from '../../../../support/helpers/page-service-host'

it.each(['pending', 'processed', 'shared', 'started'] as const)('opens the original process from the configured %s tab', async tab => {
  const scene = FLOW_WORKBENCH_SCENARIO_ID
  const assemble = () => {
    const ds = DataSet.fromJson({scenarioId: scene, tables: {
      WFOBJ_FLOW_Waiting: {resourceId: 'waiting', resourceType: 'logical-view',
        columns: ['rowid', 'wfid', 'FlowID', 'StepID', 'NodeName', 'UserName'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
        views: {default: {autoLoad: false}, workbenchPending: {autoLoad: false, queryConfig: {pagination: 'none', autoQuery: false}}}},
      WFOBJ_FLOW_RELATIONLINE_STEP: {resourceId: 'steps', resourceType: 'logical-view',
        columns: ['rowid', 'WFOBJID', 'FlowID', 'description'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
        views: {default: {autoLoad: false}, workbenchProcessed: {autoLoad: false}, workbenchShared: {autoLoad: false}}},
      WFOBJ_FLOW: {resourceId: 'started', resourceType: 'logical-view',
        columns: ['rowid', 'WFMID', 'TITLE'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
        views: {default: {autoLoad: false}, workbenchStarted: {autoLoad: false}}},
    }})
    const bindings = [
      ['WFOBJ_FLOW_Waiting', 'workbenchPending', 'waiting', {rowid: 'R1', wfid: 'WF1', FlowID: 'DEF1', StepID: 'STEP1', NodeName: '办理节点'}],
      ['WFOBJ_FLOW_RELATIONLINE_STEP', 'workbenchProcessed', 'steps', {rowid: 'R2', WFOBJID: 'WF2', FlowID: 'DEF2', description: '已处理流程'}],
      ['WFOBJ_FLOW_RELATIONLINE_STEP', 'workbenchShared', 'steps', {rowid: 'R3', WFOBJID: 'WF3', FlowID: 'DEF3', description: '传阅流程'}],
      ['WFOBJ_FLOW', 'workbenchStarted', 'started', {rowid: 'WF4', WFMID: 'DEF4', TITLE: '发起流程'}],
    ] as const
    for (const [model, view, resourceId, row] of bindings) {
      bindDataSetReadonlyCommandQuery(ds.getView(model, view)!, {resource: {resourceType: 'logical-view', resourceId}, guard: () => {}, loadRows: async () => [{...row}]})
    }
    return ds
  }
  const loaded: DataSet[] = []
  const loader = vi.spyOn(scenarioLoader, 'loadLowcodeRuntimeScenario').mockImplementation(async () => {
    const ds = assemble()
    loaded.push(ds)
    return ds
  })
  const principal = vi.spyOn(lowcode, 'readLowcodePrincipal').mockReturnValue({userId: 'U1'} as ReturnType<typeof lowcode.readLowcodePrincipal>)
  const path = '/apps/APP/workbench'
  const index = ['pending', 'processed', 'shared', 'started'].indexOf(tab) + 1
  const target = tab === 'pending'
    ? buildFlowRunPageRoute({wfid: 'WF1', flowid: 'DEF1', stepid: 'STEP1'}, {projectId: 'APP'})
    : buildFlowRunDetailRoute({wfid: `WF${index}`, flowid: `DEF${index}`}, {projectId: 'APP'})
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
    expect(loaded[0]?.getView('WFOBJ_FLOW_Waiting', 'workbenchPending')?.queryContext['currentUserId']).toBe('U1')
    if (tab === 'pending') await run()!.trigger('click')
    else {
      await wrapper.get(`#tab-${tab}`).trigger('click')
      const detail = () => wrapper.findAll('button').find(button => button.text() === '运行详情')
      await vi.waitFor(() => {expect(loaded[0]?.destroyed).toBe(true); expect(detail()).toBeDefined()})
      expect(run()).toBeUndefined()
      await detail()!.trigger('click')
    }
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(target.path))
    expect(router.currentRoute.value.query).toEqual(target.query)
  } finally {
    wrapper.unmount()
    config.global.stubs = originalStubs
    loader.mockRestore()
    principal.mockRestore()
  }
})
