import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {configureLogicFixture} from './logic-view.fixture'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {config, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererTable, RendererForm, FieldText, FieldSelect} from '@spark-appworks/spark-component'
import {ElSelect} from 'element-plus'
import {defineComponent, h} from 'vue'
import LogicViewList from '@/views/features/data-platform/structured-config/logic-view/ui/logic-view-list-page.vue'
import {SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {createDynamicRouter} from '../../../../../packages/spark-app/src/router/dynamic'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../api-provider/api-provider.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn(),readModelBatch:vi.fn(),readRelations:vi.fn(),createGateways:vi.fn()}))
let http: ApiBackend, runtime: DataSpaceRuntimeApi
const models = buildFormalModels({
  Base_DataViewList: ['rowid', 'sysid', 'name', 'description', 'createuser', 'createtime'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
  Base_AppSystemList: ['rowid', 'AppDesc', 'AppName'],
})
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  createLowcodeProjectGateways:(...args:unknown[])=>service.createGateways(...args),lowcodeDesignFileUpload:undefined,createPageToolFilesIo:()=>({readText:()=>{throw Error('Unexpected tool file read')},writeText:()=>{throw Error('Unexpected tool file write')}}),
  lowcodeApi: {design:{},readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new ApiBackend(); http.records = {
    Base_DataViewList: [{rowid: 'V1', sysid: 'APP', name: '销售汇总', description: '汇总视图', createuser: 'U-ROW'}],
    Base_UserInfo: [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}],
    Base_AppSystemList: [{rowid: 'APP', AppDesc: '应用甲', AppName: 'App'}],
  }
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeLogicView.navigationScenarioId, name: '逻辑视图', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  configureLogicFixture(service,http,models)
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
})
afterEach(() => {config.global.stubs = originalStubs; vi.restoreAllMocks()})

async function openList() {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  await createDynamicRouter({router, pageComponent: LogicViewList, componentMap: {'/lv': LogicViewList},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'lv', title: '逻辑视图', path: '/lv', itemKind: 'system-page', blueprintScenarioId: LowcodeLogicView.navigationScenarioId},
    ]})}).registerRoutes()
  await router.push('/lv'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body,
    global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  await flushPromises()
  return {wrapper, router}
}

describe('logic-view list page', () => {
  it('hosts the logic view catalog runtime through the shared native session', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/features/data-platform/structured-config/logic-view/ui/logic-view-list-page.vue'), 'utf8')
    expect(source).toContain('new NativePageRuntimeSession')
    expect(source).toContain('session.isCurrent(current)')
    expect(source).not.toContain('new PageRuntime')
  })
  it('does not submit an empty catalog name or missing owning application', async () => {
    const {wrapper} = await openList()
    try {
      await wrapper.findAll('button').find(b => b.text() === '新增视图')!.trigger('click'); await flushPromises()
      await wrapper.findAll('button').find(b => b.text() === '保存目录')!.trigger('click'); await flushPromises()
      expect(http.saves).toEqual([])
      expect(wrapper.findComponent(RendererForm).exists()).toBe(true)
      await wrapper.findAll('button').find(b => b.text() === '取消')!.trigger('click'); await flushPromises()
      expect(wrapper.findComponent(RendererForm).exists()).toBe(false)
    } finally {wrapper.unmount()}
  })

  it('verifies an interrupted catalog save through the same entry without replaying the insert', async () => {
    const {wrapper} = await openList()
    try {
      await wrapper.findAll('button').find(b => b.text() === '新增视图')!.trigger('click'); await flushPromises()
      const form = wrapper.getComponent(RendererForm)
      await form.findAllComponents(FieldText).find(f => f.props('field') === 'name')!.get('input').setValue('待核验视图')
      form.getComponent(FieldSelect).getComponent(ElSelect).vm.$emit('update:modelValue', 'APP'); await flushPromises()
      http.failAfterWrite = true
      await wrapper.findAll('button').find(b => b.text() === '保存目录')!.trigger('click'); await flushPromises()
      expect(http.saves).toHaveLength(1)
      expect(wrapper.findAll('button').find(b => b.text() === '取消')!.attributes('disabled')).toBeDefined()
      await wrapper.findAll('button').find(b => b.text() === '核验目录保存结果')!.trigger('click'); await flushPromises()
      expect(http.saves).toHaveLength(1)
      expect(http.records['Base_DataViewList']).toHaveLength(2)
      expect(wrapper.findComponent(RendererForm).exists()).toBe(false)
    } finally {wrapper.unmount()}
  })

  it('creates the catalog record before design navigation and saves only that native row', async () => {
    const {wrapper, router} = await openList()
    try {
      const push = vi.spyOn(router, 'push')
      await wrapper.findAll('button').find(b => b.text() === '新增视图')!.trigger('click'); await flushPromises()
      expect(push).not.toHaveBeenCalled()
      const form = wrapper.getComponent(RendererForm)
      await form.findAllComponents(FieldText).find(f => f.props('field') === 'name')!.get('input').setValue(' 新建视图 ')
      form.getComponent(FieldSelect).getComponent(ElSelect).vm.$emit('update:modelValue', 'APP'); await flushPromises()
      await wrapper.findAll('button').find(b => b.text() === '保存目录')!.trigger('click'); await flushPromises()
      expect(http.saves).toHaveLength(1)
      expect(http.saves[0]).toMatchObject({table: 'Base_DataViewList', changed: [], deleted: [], added: [{name: '新建视图', sysid: 'APP'}]})
      expect(http.records['Base_DataViewList']).toHaveLength(2)
      expect(wrapper.findComponent(RendererForm).exists()).toBe(false)
      expect(push).not.toHaveBeenCalled()
    } finally {wrapper.unmount()}
  })

  it('cancels a new directory draft without writing or navigating', async () => {
    const {wrapper, router} = await openList()
    try {
      const push = vi.spyOn(router, 'push')
      await wrapper.findAll('button').find(b => b.text() === '新增视图')!.trigger('click'); await flushPromises()
      expect(wrapper.findComponent(RendererForm).exists()).toBe(true)
      await wrapper.findAll('button').find(b => b.text() === '取消')!.trigger('click'); await flushPromises()
      expect(http.saves).toEqual([])
      expect(http.records['Base_DataViewList']).toHaveLength(1)
      expect(push).not.toHaveBeenCalled()
    } finally {wrapper.unmount()}
  })

  it('edits description through the original view while retaining the file locator name', async () => {
    const {wrapper} = await openList()
    try {
      await wrapper.getComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click'); await flushPromises()
      const button = wrapper.findAll('button').find(b => b.text() === '编辑视图')
      expect(button).toBeDefined(); await button!.trigger('click'); await flushPromises()
      const form = wrapper.getComponent(RendererForm)
      await form.findAllComponents(FieldText).find(f => f.props('field') === 'description')!.get('input').setValue('新描述')
      await wrapper.findAll('button').find(b => b.text() === '保存目录')!.trigger('click'); await flushPromises()
      expect(http.saves).toHaveLength(1)
      expect(http.saves[0]).toMatchObject({table: 'Base_DataViewList', added: [], deleted: [], changed: [{rowid: 'V1', description: '新描述'}]})
      expect(http.records['Base_DataViewList']![0]).toMatchObject({name: '销售汇总', sysid: 'APP', description: '新描述'})
    } finally {wrapper.unmount()}
  })
  it('shows catalog row and opens design route', async () => {
    const {wrapper, router} = await openList()
    expect(wrapper.text()).toContain('逻辑视图')
    expect(wrapper.findComponent(RendererTable).text()).toContain('销售汇总')
    const push = vi.spyOn(router, 'push')
    await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '打开设计')!.trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({viewId: 'V1', [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: 'lv'}),
    }))
    wrapper.unmount()
  })

  it('disables 打开设计 without selection', async () => {
    const {wrapper} = await openList()
    const btn = wrapper.findAll('button').find(b => b.text() === '打开设计')!
    expect(btn.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
