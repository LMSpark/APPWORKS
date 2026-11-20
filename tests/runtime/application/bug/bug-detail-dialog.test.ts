import {afterEach, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {defineComponent, h} from 'vue'
import {config, mount, flushPromises} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PAGE_RUNTIME, RendererButton, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import BugDetailDialog from '@/views/features/system/bug-manage/ui/bug-detail-dialog.vue'
import BugManagePage from '@/views/features/system/bug-manage/ui/bug-manage-page.vue'
import * as scenarioLoader from '@/lowcode/data-space/lowcode-data-space-runtime'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

const dispose: Array<() => void> = []
afterEach(() => {dispose.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks()})
async function open(hidden = false) {
  const http = new ApiBackend()
  http.records = {Bugs: [{rowid: 'B', Title: 'bug', CompleteUserID: 'U1', CompleteUserName: 'original'}],
    Users: [{rowid: 'U2', ID: 'U2', UserName: 'restricted'}]}
  if (hidden) http.hiddenFields['Users'] = ['UserName']
  const fields = {Bugs: ['rowid', 'Title', 'CompleteUserID', 'CompleteUserName', 'SystemID', 'FkType', 'State', 'FormPath', 'Content'], Users: ['rowid', 'ID', 'UserName']}
  const tables = Object.fromEntries(Object.entries(fields).map(([name, columns]) => [name, {
    modelBinding: {modelId: `${name}-model`, modelName: name},
    views: {default: {commitMode: 'staged', queryConfig: {fields: columns, allPages: true}}},
  }]))
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const config = new ScenarioViewConfig('BUG', JSON.stringify({scenarioId: 'BUG', tables}))
  const ds = new LowcodeDataSpaceAssembler(api, http).assemble({config,
    space: {dataSpaceId: 'BUG', name: 'Bug'}, models: buildFormalModels(fields), relations: []}).dataSet
  const runtime = new PageRuntime({pageId: 'bug-test', scenarioIds: ['BUG'], loadScenario: async () => ds})
  await runtime.load()
  await Promise.all([ds.getView('Bugs')!.refresh(), ds.getView('Users')!.refresh()])
  const wrapper = mount(defineComponent({setup() {
    useSparkComponent({type: 'bug-host'}).sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(BugDetailDialog, {dataViewKey: 'BUG@Bugs@default', recordId: 'B',
      userKey: 'BUG@Users@default', systemKey: 'BUG@Users@default', typeKey: 'BUG@Users@default', stateKey: 'BUG@Users@default'})
  }}), {global: {stubs: {RendererDialog: {template: '<div><slot/><slot name="footer"/></div>'}}}})
  dispose.push(() => runtime.dispose(), () => wrapper.unmount())
  ds.getView('Bugs')!.updateEditingValue('B', 'CompleteUserID', 'U2')
  return {http, wrapper, bugs: ds.getView('Bugs')!, users: ds.getView('Users')!}
}
async function submit(f: Awaited<ReturnType<typeof open>>) {
  f.wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '保存')!.vm.$emit('click')
  await flushPromises()
}
it('opens the original BUG record through the configured directory action', async () => {
  const scenarioId = '5B54AEBD5BD1BBC72710D4022589A404'
  const text = readFileSync('config/pages/system/bug-manage/pagedata.json', 'utf8')
  const scenario = new ScenarioViewConfig(scenarioId, text)
  const tables = JSON.parse(text).tables as Record<string, {modelBinding: {modelId: string}; views: {default: {queryConfig: {fields: string[]}}}}>
  const fields = Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.views.default.queryConfig.fields]))
  const models = buildFormalModels(fields).map(model => {
    const id = tables[model.name]!.modelBinding.modelId
    return {...model, id, fields: model.fields.map(field => ({...field, modelId: id}))}
  })
  const http = new ApiBackend()
  http.records = {Base_Bug_Info: [{rowid: 'B1', Title: '原BUG'}, {rowid: 'B2', Title: '另一个BUG'}]}
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const ds = new LowcodeDataSpaceAssembler(api, http).assemble({config: scenario,
    space: {dataSpaceId: scenarioId, name: 'Bug'}, models, relations: []}).dataSet
  vi.spyOn(scenarioLoader, 'loadLowcodeRuntimeScenario').mockResolvedValue(ds)
  registerAllRenderers()
  const router = createRouter({history: createMemoryHistory(), routes: [{path: '/apps/APP/bugs', component: BugManagePage,
    meta: {nodeId: scenarioId, blueprintScenarioId: scenarioId, systemPageIdentityState: 'resolved'}}]})
  await router.push('/apps/APP/bugs')
  const originalStubs = config.global.stubs
  const stubs = {...originalStubs}
  for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column', 'el-button']) delete stubs[key]
  config.global.stubs = stubs
  dispose.push(() => {config.global.stubs = originalStubs})
  const wrapper = mount(RouterView, {attachTo: document.body, global: {plugins: [router, ElementPlus, VXETable, Spark.createPlugin()]}})
  dispose.push(() => wrapper.unmount())
  await vi.waitFor(() => expect(wrapper.findAllComponents(RendererButton).filter(button => button.props('label') === '详情'), wrapper.text()).toHaveLength(2))
  await wrapper.findAllComponents(RendererButton).filter(button => button.props('label') === '详情')[1]!.trigger('click')
  await vi.waitFor(() => expect(wrapper.getComponent(BugDetailDialog).props('recordId')).toBe('B2'))
  expect(http.saves).toHaveLength(0)
})
it('does not copy an unreadable user name into the bug record', async () => {
  const f = await open(true)
  await submit(f)
  expect(f.http.saves).toHaveLength(0)
  expect(f.wrapper.get('[role="alert"]').text()).toContain('DATA_VIEW_READ_ROW')
})
it('saves the selected exact identity and readable name together', async () => {
  const f = await open()
  await submit(f)
  expect(f.http.records['Bugs']?.[0]).toMatchObject({CompleteUserID: 'U2', CompleteUserName: 'restricted'})
  expect(f.http.saves).toHaveLength(1)
})
it('rejects a stale option query without submitting the bug', async () => {
  const f = await open()
  f.users.queryContext = {different: 'scope'}
  await submit(f)
  expect(f.http.saves).toHaveLength(0)
})
it('does not coerce differently typed user identities', async () => {
  const f = await open()
  f.http.records['Users'] = [{rowid: 'U2', ID: '2', UserName: 'restricted'}]
  await f.users.refresh()
  f.bugs.updateEditingValue('B', 'CompleteUserID', 2)
  await submit(f)
  expect(f.http.saves).toHaveLength(0)
})
it('clears the redundant name when the selected identity is cleared', async () => {
  const f = await open()
  f.bugs.updateEditingValue('B', 'CompleteUserID', '')
  await submit(f)
  expect(f.http.records['Bugs']?.[0]).toMatchObject({CompleteUserID: '', CompleteUserName: ''})
})
it('preserves an unchanged historical handler without requiring a new option row', async () => {
  const f = await open(true)
  f.bugs.updateEditingValue('B', 'CompleteUserID', 'U1')
  f.bugs.updateEditingValue('B', 'Title', 'changed')
  await submit(f)
  expect(f.http.records['Bugs']?.[0]).toMatchObject({Title: 'changed', CompleteUserName: 'original'})
})
it('restores the original name when a rejected submit is followed by reverting the handler', async () => {
  const f = await open()
  vi.spyOn(f.bugs.dataSet!, 'saveChanges').mockRejectedValueOnce(new Error('pre-save validation rejected'))
  await submit(f)
  expect(f.http.saves).toHaveLength(0)
  f.bugs.updateEditingValue('B', 'CompleteUserID', 'U1')
  await submit(f)
  expect(f.http.records['Bugs']?.[0]).toMatchObject({CompleteUserID: 'U1', CompleteUserName: 'original'})
})
