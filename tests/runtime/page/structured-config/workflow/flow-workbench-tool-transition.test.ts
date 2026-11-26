import {expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {DataSet, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {getSystemPageIdentityCompanions} from '@/registries/vue-page-registry'
import * as scenarioLoader from '@/platform-adapters/data-space/lowcode-data-space-runtime'
import * as lowcode from '@/platform-adapters/lowcode-runtime'
import {FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/platform-adapters/resources/system/workflow/manage'
import FlowWorkbenchTodoPanel from '@/views/features/workflow/flow-workbench/ui/flow-workbench-todo-panel.vue'
import {withTestPageService} from '../../../../support/helpers/page-service-host'

it('renders the configured tab shell and keeps the current query when an earlier tab finishes late', async () => {
  const scenarioId = FLOW_WORKBENCH_SCENARIO_ID
  const companion = getSystemPageIdentityCompanions().find(item => item.path.endsWith('/flow-workbench-todo-panel'))
  if (!companion) throw new Error('缺少流程待办伴随登记')
  const router = createRouter({history: createMemoryHistory(), routes: [{
    path: `/apps/:projectId${companion.path}`,
    component: FlowWorkbenchTodoPanel,
    meta: {nodeId: FLOW_MONITOR_SCENARIO_ID, blueprintScenarioId: FLOW_MONITOR_SCENARIO_ID,
      companionScenarioId: scenarioId, systemPageIdentityState: 'resolved'},
  }]})
  await router.push(`/apps/APP${companion.path}`)

  const queries: unknown[][] = []
  const instances: DataSet[] = []
  let releaseProcessed = () => {}
  const pendingProcessed = new Promise<void>(resolve => { releaseProcessed = resolve })
  let startedDenied = true
  const loader = vi.spyOn(scenarioLoader, 'loadLowcodeRuntimeScenario').mockImplementation(async scope => {
    const waiting = 'WFOBJ_FLOW_Waiting'
    const steps = 'WFOBJ_FLOW_RELATIONLINE_STEP'
    const started = 'WFOBJ_FLOW'
    const dataset = DataSet.fromJson({scenarioId, tables: {
      [waiting]: {resourceId: 'waiting', resourceType: 'logical-view',
        columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'NodeName', type: 'string'}],
        views: {default: {autoLoad: false}, workbenchPending: {autoLoad: false}}},
      [steps]: {resourceId: 'steps', resourceType: 'logical-view',
        columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'description', type: 'string'}],
        views: {default: {autoLoad: false}, workbenchProcessed: {autoLoad: false}, workbenchShared: {autoLoad: false}}},
      [started]: {resourceId: 'started', resourceType: 'logical-view',
        columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'TITLE', type: 'string'}],
        views: {default: {autoLoad: false}, workbenchStarted: {autoLoad: false}}},
    }})
    for (const [model, viewId, resourceId] of [
      [waiting, 'workbenchPending', 'waiting'],
      [steps, 'workbenchProcessed', 'steps'],
      [steps, 'workbenchShared', 'steps'],
      [started, 'workbenchStarted', 'started'],
    ] as const) {
      const view = dataset.getView(model, viewId)
      if (!view) throw new Error(`夹具缺少视图 ${viewId}`)
      bindDataSetReadonlyCommandQuery(view, {
        resource: {resourceType: 'logical-view', resourceId},
        guard: () => {},
        loadRows: async () => {
          queries.push([scope.projectId, scope.scenarioId, viewId, view.queryContext['currentUserId']])
          if (viewId === 'workbenchProcessed') {
            await pendingProcessed
            return [{rowid: 'R2', description: '迟到的已处理行'}]
          }
          if (viewId === 'workbenchShared') return [{rowid: 'R3', description: '当前传阅行'}]
          if (viewId === 'workbenchPending') return [{rowid: 'R1', NodeName: '当前待办行'}]
          if (startedDenied) throw new Error('当前用户无权读取发起流程')
          return []
        },
      })
    }
    instances.push(dataset)
    return dataset
  })
  const principal = vi.spyOn(lowcode, 'readLowcodePrincipal').mockReturnValue({userId: 'U1'} as ReturnType<typeof lowcode.readLowcodePrincipal>)
  registerAllRenderers()
  const originalStubs = config.global.stubs
  const stubs = {...originalStubs}
  for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column', 'el-button']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(withTestPageService(RouterView, router), {
    attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  try {
    await vi.waitFor(() => expect(wrapper.text()).toContain('当前待办行'))
    expect(wrapper.get('.spark-page-container').findAll('[role="tab"]').map(tab => tab.text()))
      .toEqual(['待处理', '已处理', '传阅分享', '我发起'])

    await wrapper.get('#tab-processed').trigger('click')
    await vi.waitFor(() => {
      expect(queries.map(query => query[2])).toEqual(['workbenchPending', 'workbenchProcessed'])
      expect(instances[0]?.destroyed).toBe(true)
      expect(wrapper.get('#tab-processed').attributes('aria-selected')).toBe('true')
      expect(wrapper.text()).toContain('正在读取')
      expect(wrapper.find('.el-table').exists()).toBe(false)
    })

    await wrapper.get('#tab-shared').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('当前传阅行'))
    releaseProcessed()
    await flushPromises()
    expect(instances[1]?.destroyed).toBe(true)
    expect(wrapper.get('.spark-page-container #tab-shared').attributes('aria-selected')).toBe('true')
    expect(wrapper.findAll('.el-table')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('迟到的已处理行')

    await wrapper.get('#tab-started').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('当前用户无权读取发起流程'))
    expect(instances[2]?.destroyed).toBe(true)
    expect(instances[3]?.destroyed).toBe(true)
    expect(wrapper.find('.el-table').exists()).toBe(false)
    const retry = wrapper.findAll('button').find(button => button.text() === '重试')
    if (!retry) throw new Error('拒绝后缺少重试入口')
    startedDenied = false
    await retry.trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('.el-table')).toHaveLength(1))
    expect(wrapper.text()).not.toContain('当前用户无权读取发起流程')
    expect(instances[4]?.getView('WFOBJ_FLOW', 'workbenchStarted')?.rows).toEqual([])
    expect(queries).toEqual(['workbenchPending', 'workbenchProcessed', 'workbenchShared', 'workbenchStarted', 'workbenchStarted']
      .map(viewId => ['APP', scenarioId, viewId, 'U1']))
  } finally {
    releaseProcessed()
    wrapper.unmount()
    config.global.stubs = originalStubs
    loader.mockRestore()
    principal.mockRestore()
  }
})
