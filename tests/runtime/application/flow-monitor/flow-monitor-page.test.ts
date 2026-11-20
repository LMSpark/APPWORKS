import {readFileSync} from 'node:fs'
import {expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import FlowMonitorPage from '@/views/features/system/flow-monitor/ui/flow-monitor-page.vue'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import * as scenarioLoader from '@/lowcode/data-space/lowcode-data-space-runtime'
import {buildFlowRunDetailRoute, buildFlowRunPageRoute} from '@/lowcode/resources/system/workflow/manage'
import {withTestPageService} from '../../../support/helpers/page-service-host'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

it.each([
  {label: '运行详情', buildRoute: buildFlowRunDetailRoute, hidden: false},
  {label: '办理', buildRoute: buildFlowRunPageRoute, hidden: false},
  {label: '办理', buildRoute: buildFlowRunPageRoute, hidden: true},
])('checks original process identities for $label (hidden definition: $hidden)', async ({label, buildRoute, hidden}) => {
  const scene = 'E328FBBF518141973C575D612CD75151'
  const path = '/apps/APP/monitor'
  const source = readFileSync('config/pages/system/flow-monitor/pagedata.json', 'utf8')
  const tables = JSON.parse(source).tables as Record<string, {modelBinding: {modelId: string}; views: {default: {queryConfig: {fields: string[]}}}}>
  const fields = Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.views.default.queryConfig.fields]))
  const models = buildFormalModels(fields).map(model => {
    const id = tables[model.name]!.modelBinding.modelId
    return {...model, id, primaryKey: 'rowid', fields: model.fields.map(field => ({...field, modelId: id, primaryKey: field.name === 'rowid'}))}
  })
  const http = new ApiBackend()
  http.primaryKeys['Base_UserInfo'] = 'rowid'
  if (hidden) http.hiddenFields['View_FlowObjList'] = ['WFMID']
  http.records = {View_FlowObjList: [{rowid: 'WF1', WFMID: 'DEF1', TITLE: '第一条'}, {rowid: 'WF2', WFMID: 'DEF2', TITLE: '第二条'}]}
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const ds = new LowcodeDataSpaceAssembler(api, http).assemble({config: new ScenarioViewConfig(scene, source),
    space: {dataSpaceId: scene, name: 'Flow monitor'}, models, relations: []}).dataSet
  const loader = vi.spyOn(scenarioLoader, 'loadLowcodeRuntimeScenario').mockResolvedValue(ds)
  const target = buildRoute({wfid: 'WF2', flowid: 'DEF2'}, {projectId: 'APP'})
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path, component: FlowMonitorPage, meta: {nodeId: 'MONITOR', blueprintScenarioId: scene, systemPageIdentityState: 'resolved'}},
    {path: target.path, component: {template: '<div>运行详情目标</div>'}},
  ]})
  await router.push(path)
  registerAllRenderers()
  const originalStubs = config.global.stubs
  const stubs = {...originalStubs}
  for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column', 'el-button']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(withTestPageService(RouterView, router), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  try {
    const buttons = () => wrapper.findAll('button').filter(button => button.text() === label)
    await vi.waitFor(() => expect(buttons(), wrapper.text()).toHaveLength(2))
    const navigate = vi.spyOn(router, 'push')
    await buttons()[1]!.trigger('click')
    await flushPromises()
    if (hidden) {
      expect(navigate).not.toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe(path)
    } else {
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(target.path))
      expect(router.currentRoute.value.query).toEqual(target.query)
    }
    expect(http.saves).toHaveLength(0)
  } finally {
    wrapper.unmount()
    config.global.stubs = originalStubs
    loader.mockRestore()
  }
})
