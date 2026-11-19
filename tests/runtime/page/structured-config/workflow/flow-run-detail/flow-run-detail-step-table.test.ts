import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, reactive} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet, buildDataViewKey} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PAGE_RUNTIME, RendererTable, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import StepTable from '@/views/features/workflow/flow-runtime/detail/ui/flow-run-detail-step-table.vue'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {buildFormalModels} from '../../catalog/structured-config-catalog.fixture'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'

const fields = ['rowid','WFOBJID','STEPTYPE','StepState','description','STARTTIME','SendNodeModelId','ReceiveNodeModelId']
const instances: Array<{wrapper: VueWrapper; runtime: PageRuntime}> = []
beforeEach(() => {registerAllRenderers(); vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})})
afterEach(() => {instances.splice(0).forEach(({wrapper, runtime}) => {wrapper.unmount(); runtime.dispose()}); vi.unstubAllGlobals()})

async function fixture(hidden = false) {
  const ds = DataSet.fromJson({scenarioId: 'WORK', tables: {Steps: {modelBinding: {modelId: 'Steps-model', modelName: 'Steps'},
    columns: fields.map(name => ({name, type: 'string' as const, ...(name === 'rowid' ? {isPrimaryKey: true} : {})})),
    views: {default: {autoLoad: false, queryContext: {WFOBJID: 'WF-1'}, filterExpression: {logic: 'and', filters: [
      {field: 'WFOBJID', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'WFOBJID'}},
      {field: 'STEPTYPE', operator: 'ne', value: '12'},
    ]}, queryConfig: {allPages: true, fields}}}}}})
  const http = new ApiBackend()
  http.records['Steps'] = [
    {rowid: 'A', WFOBJID: 'WF-1', STEPTYPE: '0', StepState: '0', description: '收到的正常步骤', SendNodeModelId: 'N0', ReceiveNodeModelId: 'N1'},
    {rowid: 'B', WFOBJID: 'WF-1', STEPTYPE: '0', StepState: '2', description: '收到的作废步骤', SendNodeModelId: 'N0', ReceiveNodeModelId: 'N1'},
    {rowid: 'C', WFOBJID: 'WF-1', STEPTYPE: '0', StepState: '1', description: '发出的步骤', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2'},
    {rowid: 'D', WFOBJID: 'WF-2', STEPTYPE: '0', StepState: '0', description: '其他实例不得混入', ReceiveNodeModelId: 'N1'},
    {rowid: 'E', WFOBJID: 'WF-1', STEPTYPE: '12', StepState: '0', description: '原查询排除的类型', ReceiveNodeModelId: 'N1'},
  ]
  if (hidden) http.hiddenFields['Steps'] = ['description']
  const source = ds.getView('Steps')!, api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'fixture', headers: {}})})
  api.bindModelView(source, buildFormalModels({Steps: fields})[0]!)
  await source.refresh()
  const runtime = new PageRuntime({pageId: 'step-detail', scenarioIds: ['WORK'], loadScenario: async () => ds})
  await runtime.load()
  const options = reactive<{viewKey: string; receivedNodeId?: string; sentNodeId?: string; showVoided: boolean}>({viewKey: buildDataViewKey('Steps','default','WORK'), receivedNodeId: 'N1', showVoided: false})
  const Host = defineComponent({setup() {const {sparkProvide} = useSparkComponent({type: 'step-host'}); sparkProvide(PAGE_RUNTIME, runtime); return () => h(StepTable, {...options})}})
  const wrapper = mount(withTestPageService(Host), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  instances.push({wrapper, runtime}); await flushPromises(); await flushPromises()
  return {ds, source, http, runtime, wrapper, options}
}

it('binds a native derived view, preserves the source scope and switches voided-step filtering without copying rows', async () => {
  const {ds, source, http, runtime, wrapper, options} = await fixture()
  const rendered = wrapper.findComponent(RendererTable)
  expect(rendered.exists()).toBe(true)
  const key = rendered.props('dataViewKey') as string
  expect(key).toMatch(/^WORK@Steps@/)
  expect(runtime.resolveView(key)?.rows.map(row => row['rowid'])).toEqual(['A'])
  options.showVoided = true; await flushPromises()
  expect(runtime.resolveView(key)?.rows.map(row => row['rowid'])).toEqual(['A','B'])
  expect(source.rows.map(row => row['rowid'])).toEqual(['A','B','C'])
  expect(http.saves).toHaveLength(0)
  wrapper.unmount()
  expect(ds.getTable('Steps')!.viewList.map(view => view.viewId)).toEqual(['default'])
})

it('keeps original field visibility in the standard bound table', async () => {
  const {wrapper} = await fixture(true)
  expect(wrapper.findComponent(RendererTable).exists()).toBe(true)
  expect(wrapper.text()).not.toContain('收到的正常步骤')
})

it('withdraws the drilldown when its original source query is retargeted', async () => {
  const {ds, source, wrapper} = await fixture()
  expect(wrapper.findComponent(RendererTable).exists()).toBe(true)
  source.queryContext = {WFOBJID: 'WF-2'}
  await flushPromises()
  expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
  expect(ds.getTable('Steps')!.viewList.map(view => view.viewId)).toEqual(['default'])
})

it('releases the derived view when its source is disposed', async () => {
  const {ds, wrapper} = await fixture()
  ds.getTable('Steps')!.destroyView('default')
  await flushPromises()
  expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
  expect(ds.getTable('Steps')!.viewList).toHaveLength(0)
})

it('queries sent, edge and all-step scopes through the same original source', async () => {
  const {runtime, wrapper, options} = await fixture()
  const rows = () => runtime.resolveView(wrapper.findComponent(RendererTable).props('dataViewKey') as string)?.rows.map(row => row['rowid'])
  delete options.receivedNodeId; options.sentNodeId = 'N1'; await flushPromises()
  expect(rows()).toEqual(['C'])
  options.receivedNodeId = 'N2'; await flushPromises()
  expect(rows()).toEqual(['C'])
  delete options.sentNodeId; delete options.receivedNodeId; await flushPromises()
  expect(rows()).toEqual(['A','C'])
  options.showVoided = true; await flushPromises()
  expect(rows()).toEqual(['A','B','C'])
  options.viewKey = 'Steps@default'; await flushPromises()
  expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
  expect(wrapper.text()).toContain('scenarioId@modelName@viewId')
})

it('keeps the current drilldown after an older node query completes late', async () => {
  const {runtime, source, http, wrapper, options} = await fixture()
  let releaseOldQuery!: () => void
  const pending = new Promise<void>(resolve => { releaseOldQuery = resolve })
  http.beforeDefinitionRead = async () => {
    delete http.beforeDefinitionRead
    await pending
  }
  const reads = http.reads.length
  options.showVoided = true
  await flushPromises()
  expect(http.reads).toHaveLength(reads + 1)
  delete options.receivedNodeId
  options.sentNodeId = 'N1'
  await flushPromises()
  const key = wrapper.getComponent(RendererTable).props('dataViewKey') as string
  const current = runtime.resolveView(key)
  expect(current?.rows.map(row => row['rowid'])).toEqual(['C'])
  releaseOldQuery()
  await flushPromises()
  expect(runtime.resolveView(key)).toBe(current)
  expect(current?.rows.map(row => row['rowid'])).toEqual(['C'])
  expect(source.rows.map(row => row['rowid'])).toEqual(['A', 'B', 'C'])
})
