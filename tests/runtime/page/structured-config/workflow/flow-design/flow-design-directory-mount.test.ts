import {readFileSync} from 'node:fs'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {RendererDialog, RendererGraph, Spark, SparkPageRenderer, registerAllRenderers} from '@spark-appworks/spark-component'
import {SystemPageIdentityPool} from '../../../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
import {loadLowcodeRuntimeScenario} from '@/platform-adapters/data-space/lowcode-data-space-runtime'
import {LowcodeDataSpaceAssembler} from '@/platform-adapters/data-space/lowcode-data-space-assembler'
import {FLOW_DESIGN_SCENARIO_ID} from '@/platform-adapters/resources/system/workflow/manage'
import FlowModelList from '@/views/features/workflow/flow-model/ui/flow-model-list-page.vue'
import {withTestPageService} from '../../../../../support/helpers/page-service-host'
import {buildFormalModels} from '../../catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {buildFlowDesignScenario, storage} from './flow-design-data.fixture'

vi.mock('@/platform-adapters/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: vi.fn()}))

const catalogId = '87F0EF6AD1B64D67FFE597E7E3285994'
const path = '/apps/APP/features/workflow/flow-model/ui/flow-model-list-page'
const originalStubs = {...config.global.stubs}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-table', 'el-table-column', 'el-button', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
})
afterEach(() => {config.global.stubs = originalStubs; vi.unstubAllGlobals()})

function catalogFixture() {
  const http = new ApiBackend()
  http.records = {WFM_FLOW_MODLE: [{rowid: 'FM-1', TITLE: 'Catalog Flow 1', MEMO: '', sysid: 'APP'}], Base_UserInfo: []}
  const modelFields = {WFM_FLOW_MODLE: ['rowid', 'TITLE', 'MEMO', 'CRTUSER', 'CRTDATE', 'STATE', 'BusinessTable', 'sysid', 'createuser'],
    Base_UserInfo: ['ID', 'rowid', 'UserName']}
  const models = buildFormalModels(modelFields).map(model => ({
    ...model, id: catalogId + (model.name === 'WFM_FLOW_MODLE' ? 'p000' : 'p001'),
  }))
  const text = readFileSync('config/pages/workflow/flow-model-list/pagedata.json', 'utf8').replace('__SCENARIO__', catalogId)
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const ds = new LowcodeDataSpaceAssembler(runtime, http).assemble({config: new ScenarioViewConfig(catalogId, text),
    space: {dataSpaceId: catalogId, name: 'Catalog'}, models, relations: []}).dataSet
  return {ds, http}
}

it('runs the approval design tool in the original directory and keeps each save locked until its directory readback completes', async () => {
  const catalog = catalogFixture(), design = buildFlowDesignScenario()
  const load = vi.mocked(loadLowcodeRuntimeScenario)
  load.mockImplementation(async args => {
    expect(args.projectId).toBe('APP')
    if (args.scenarioId === catalogId) return catalog.ds
    if (args.scenarioId === FLOW_DESIGN_SCENARIO_ID) return design.ds
    throw Error('unexpected scenario')
  })
  const router = createRouter({history: createMemoryHistory(), routes: [{path, component: FlowModelList,
    meta: {nodeId: catalogId, blueprintScenarioId: catalogId, systemPageIdentityState: 'resolved'}}]})
  await router.push(path); await router.isReady()
  const page = new SystemPageIdentityPool().get(router.currentRoute.value, {scope: 'application', projectId: 'APP',
    nodeId: catalogId, pageId: catalogId, path, title: '流程模型', explicitQuery: {}, component: FlowModelList})
  const wrapper = mount(withTestPageService(page.view, router), {attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  const body = new DOMWrapper(document.body)
  const button = (label: string) => body.findAll('button').find(item => item.text().trim() === label)
  let releaseDirectory: () => void = () => undefined
  const directoryReadback = new Promise<void>(resolve => { releaseDirectory = resolve })
  try {
    await vi.waitFor(() => expect(button('设计')).toBeDefined())
    await button('设计')!.trigger('click')
    await vi.waitFor(() => expect(button('保存设计')).toBeDefined())
    const runtime = wrapper.getComponent(SparkPageRenderer).props('pageRuntime')!
    expect(runtime.tool.toDefinition().rule[0]?.id).toBe('approval-flow-design')
    expect(runtime.getDataSet(catalogId)).toBe(catalog.ds)
    expect(runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)).toBe(design.ds)
    const graph = wrapper.getComponent(RendererGraph)
    expect(runtime.resolveView(graph.props('dataViewKey')!)).toBe(design.nodes)
    const dialog = wrapper.findAllComponents(RendererDialog).find(item => item.props('title') === '流程设计')!
    const directoryReads = catalog.http.reads.length

    await button('新增节点')!.trigger('click')
    await vi.waitFor(() => expect(dialog.props('closeDisabled')).toBe(true))
    await vi.waitFor(() => expect(button('保存设计')!.attributes('disabled')).toBeUndefined())
    expect(page.isDirty).toBe(true)
    dialog.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.findComponent(SparkPageRenderer).exists()).toBe(true)
    expect(catalog.http.reads).toHaveLength(directoryReads)

    catalog.http.beforeDefinitionRead = () => directoryReadback
    await button('保存设计')!.trigger('click')
    await vi.waitFor(() => expect(catalog.http.reads).toHaveLength(directoryReads + 1))
    await flushPromises()
    expect(storage.writes).toBe(1)
    expect(button('新增节点')!.attributes('disabled')).toBeDefined()
    expect(button('保存设计')!.attributes('disabled')).toBeDefined()
    await button('新增节点')!.trigger('click')
    await button('保存设计')!.trigger('click')
    await flushPromises()
    expect(storage.writes).toBe(1)

    releaseDirectory()
    await vi.waitFor(() => expect(dialog.props('closeDisabled')).toBe(false))
    await button('新增节点')!.trigger('click')
    await vi.waitFor(() => expect(dialog.props('closeDisabled')).toBe(true))
    await vi.waitFor(() => expect(button('保存设计')!.attributes('disabled')).toBeUndefined())
    await button('保存设计')!.trigger('click')
    await vi.waitFor(() => expect(catalog.http.reads).toHaveLength(directoryReads + 2))
    await vi.waitFor(() => expect(dialog.props('closeDisabled')).toBe(false))
    expect(storage.writes).toBe(2)
    dialog.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.findComponent(SparkPageRenderer).exists()).toBe(false)
    expect(runtime.destroyed).toBe(false)
    expect(catalog.ds.destroyed).toBe(false)
    expect(design.ds.destroyed).toBe(false)
    expect(button('设计')).toBeDefined()
    expect(load.mock.calls.map(([args]) => args.scenarioId)).toEqual([catalogId, FLOW_DESIGN_SCENARIO_ID])
  } finally {releaseDirectory(); wrapper.unmount(); load.mockReset()}
})
