import {readFileSync} from 'node:fs'
import {expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import FlowMonitorPage from '@/views/features/system/flow-monitor/ui/flow-monitor-page.vue'
import {LowcodeDataSpaceAssembler} from '@/platform-adapters/data-space/lowcode-data-space-assembler'
import * as scenarioLoader from '@/platform-adapters/data-space/lowcode-data-space-runtime'
import {buildFlowRunDetailRoute, buildFlowRunPageRoute} from '@/platform-adapters/resources/system/workflow/manage'
import {withTestPageService} from '../../../support/helpers/page-service-host'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

it.each([
  {label: '运行详情', buildRoute: buildFlowRunDetailRoute, hidden: false, lookup:'visible'},
  {label: '办理', buildRoute: buildFlowRunPageRoute, hidden: false, lookup:'visible'},
  {label: '办理', buildRoute: buildFlowRunPageRoute, hidden: true, lookup:'visible'},
  {label: '运行详情', buildRoute: buildFlowRunDetailRoute, hidden: false, lookup:'hidden-creator'},
  {label: '运行详情', buildRoute: buildFlowRunDetailRoute, hidden: false, lookup:'no-creator'},
  {label: '运行详情', buildRoute: buildFlowRunDetailRoute, hidden: false, lookup:'late-creator'},
  {label: '运行详情', buildRoute: buildFlowRunDetailRoute, hidden: false, lookup:'retry'},
])('checks original process identities for $label (hidden definition: $hidden, creator: $lookup)', async ({label, buildRoute, hidden, lookup}) => {
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
  http.records = {
    View_FlowObjList: [
      {rowid: 'WF1', WFMID: 'DEF1', TITLE: '第一条', CrtUserID: lookup==='no-creator'?'':'CREATOR-ON-PAGE'},
      {rowid: 'WF2', WFMID: 'DEF2', TITLE: '第二条', CrtUserID: lookup==='no-creator'?'':'CREATOR-ON-PAGE'},
    ],
    Base_UserInfo: [
      {rowid:'UNRELATED-USER',UserName:'其他人员'},
      {rowid:'CREATOR-ON-PAGE',UserName:'本页创建人'},
      {rowid:'NEXT-CREATOR',UserName:'新查询创建人'},
    ],
  }
  if(lookup==='hidden-creator')http.hiddenFields['View_FlowObjList']=['CrtUserID']
  let releaseOlder: (()=>void)|undefined
  let firstLookup=true
  http.beforeDefinitionRead=async table=>{
    if(table!=='Base_UserInfo'||!firstLookup)return
    firstLookup=false
    if(lookup==='retry')throw new Error('创建人读取失败')
    if(lookup==='late-creator')await new Promise<void>(resolve=>{releaseOlder=resolve})
  }
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

    if(lookup==='hidden-creator'||lookup==='no-creator'){
      expect(http.reads.filter(read=>read.table==='Base_UserInfo')).toHaveLength(0)
      expect(wrapper.text()).not.toContain('本页创建人')
    }else if(lookup==='late-creator'){
      await vi.waitFor(()=>expect(releaseOlder).toBeDefined())
      const records=http.records['View_FlowObjList']
      if(!records)throw new Error('Missing process fixture')
      http.records['View_FlowObjList']=records.map(row=>({...row,CrtUserID:'NEXT-CREATOR'}))
      await ds.getView('View_FlowObjList')?.refresh()
      await vi.waitFor(()=>expect(wrapper.text()).toContain('新查询创建人'))
      releaseOlder?.()
      await flushPromises()
      expect(wrapper.text()).not.toContain('本页创建人')
      expect(ds.getView('Base_UserInfo')?.rows.map(row=>row['rowid'])).toEqual(['NEXT-CREATOR'])
    }else{
      if(lookup==='retry'){
        await vi.waitFor(()=>expect(wrapper.text()).toContain('创建人读取失败'))
        expect(wrapper.text()).not.toContain('本页创建人')
        await ds.getView('View_FlowObjList')?.refresh()
      }
      await vi.waitFor(()=>expect(wrapper.text()).toContain('本页创建人'))
      const creatorReads=http.reads.filter(read=>read.table==='Base_UserInfo')
      expect(creatorReads).toHaveLength(lookup==='retry'?2:1)
      const request=JSON.stringify(creatorReads.at(-1)?.data)
      expect(request).toContain('CREATOR-ON-PAGE')
      expect(request).not.toContain('UNRELATED-USER')
      expect(ds.getView('Base_UserInfo')?.rows.map(row=>row['rowid'])).toEqual(['CREATOR-ON-PAGE'])
    }
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
    releaseOlder?.()
    wrapper.unmount()
    config.global.stubs = originalStubs
    loader.mockRestore()
  }
})
