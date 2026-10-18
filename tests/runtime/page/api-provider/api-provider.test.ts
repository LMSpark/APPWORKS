import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererForm, RendererTable, RendererDialog} from '@spark-appworks/spark-component'
import {DataViewFilterCodec, type DataSet} from '@spark-appworks/spark-data'
import {DataViewFilterLocal} from '../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {getVuePageEntry} from '@/registries/vue-page-registry'
import {LowcodeApiProvider} from '@/lowcode/resources/external-api/lowcode-api-provider'
import {ApiProviderDesign} from '../../../../packages/spark-lowcode-api/src/platform/resources/external-api/api-provider-design'
import ApiProviderPage from '@/views/features/integration/api-management/ui/api-management-page.vue'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModelBatch: vi.fn(), readRequestScope: vi.fn(), readRelations: vi.fn()}))
let http: ProviderHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const providerFields = ['rowid', 'Name', 'BaseURL', 'updateuser', 'updatetime', 'CredentialsPassword']
const models = Object.entries({Base_InterfaceProvider: providerFields, Base_UserInfo: ['ID', 'ROWID', 'UserName']}).map(([name, fields]) => ({
  id: `${name}-model`, name, metaName: name, sourceType: 'table', sourceId: 'DB', sourceName: name,
  primaryKey: name === 'Base_UserInfo' ? 'ID' : 'rowid', businessMain: false, raw: {},
  fields: fields.map((field, order) => ({id: field, modelId: `${name}-model`, name: field, canonicalName: field,
    primaryKey: field === (name === 'Base_UserInfo' ? 'ID' : 'rowid'), description: field, type: 'string',
    output: true, computed: false, order, orderType: '', raw: {}})),
})) satisfies Array<Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>
type Row = Record<string, unknown>
class ProviderHttp extends HttpClientBase {
  records: Row[] = [{rowid: 'P1', Name: '服务甲', BaseURL: 'https://example.test/api', updateuser: 'U-ROW', CredentialsPassword: 'fixture-only'},
    {rowid: 'P2', Name: '服务乙', BaseURL: '/api/other'}]
  reads: RequestConfig[] = []
  saves: RequestConfig[] = []
  denied: string[] = []
  allowAdd = true
  failAfterWrite = false
  ignoreFilter = false
  protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
    let result: unknown
    if (request.url === '/api/DataOperation/GetData') {
      this.reads.push(request)
      const body = request.data as {Table: Array<{Name: string; Filter?: unknown; Fields: Array<{Name: string}>}>}
      const table = body.Table[0]!
      const provider = table.Name === 'Base_InterfaceProvider'
      let rows = provider ? this.records : [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '修改人甲'}]
      if (table.Filter && !this.ignoreFilter) {
        const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(table.Filter))
        rows = rows.filter(row => filter.matches(row))
      }
      result = {primaryKeyField: provider ? 'rowid' : 'ID', allowAdd: this.allowAdd, lingma_sys_key: 'table-key',
        data: {Items: rows.map(row => ({...Object.fromEntries(table.Fields.map(field => [field.Name, row[field.Name]])),
          lingma_sys_key: 'row-key', lingma_sys_params: {r: [], e: (provider ? providerFields : []).filter(field => !this.denied.includes(field)), h: [], m: [], d: false}})), Count: rows.length}}
    } else if (request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      this.saves.push(request)
      const maplistadd: Record<string, Row[]>[] = [], maplistedit: Record<string, Row[]>[] = []
      for (const group of request.data as Array<{TableName: string; CrudModel: {Added: Row[]; Changed: Row[]; Deleted: Row[]}}>) {
        expect(group.TableName).toBe('Base_InterfaceProvider')
        expect(group.CrudModel.Deleted).toHaveLength(0)
        for (const [kind, output] of [['Added', maplistadd], ['Changed', maplistedit]] as const) {
          const saved: Row[] = []
          for (const raw of group.CrudModel[kind]) {
            const row = {...raw}; delete row['lingma_sys_key']; delete row['lingma_sys_params']
            if (kind === 'Added') this.records.push(row)
            else Object.assign(this.records.find(item => item['rowid'] === row['rowid'])!, row)
            saved.push({...row})
          }
          if (saved.length) output.push({[group.TableName]: saved})
        }
      }
      if (this.failAfterWrite) throw new Error('回执中断')
      result = {maplistadd, maplistedit, maplistdelete: []}
    } else throw new Error(`Unexpected ${request.url}`)
    return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
  }
}
const sets: DataSet[] = [], wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new ProviderHttp()
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockImplementation(({dataSpaceId}: {dataSpaceId: string}) => Promise.resolve({dataSpaceId, name: '外部服务', raw: {}}))
  service.readModelBatch.mockResolvedValue(models)
  service.readRelations.mockResolvedValue([])
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); sets.splice(0).forEach(ds => ds.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals(); config.global.stubs = originalStubs})
async function openDesign(id = 'P1', create = false) {
  const dataSet = await LowcodeApiProvider.load('SCENE')
  sets.push(dataSet)
  const owner = new ApiProviderDesign({dataSet, providerId: id, create})
  await owner.load()
  return {owner, dataSet}
}
async function openPage() {
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: ApiProviderPage, componentMap: {'/providers': ApiProviderPage},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'providers', title: '外部服务管理', path: '/providers', itemKind: 'system-page', blueprintScenarioId: 'SCENE'},
    ]})})
  await dynamic.registerRoutes(); await router.push('/providers'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises(); return wrapper
}
function button(wrapper: VueWrapper, label: string) {return wrapper.findAll('button').find(item => item.text() === label)!}
function field(wrapper: VueWrapper, label: string) {return wrapper.findComponent(RendererForm).findAll('.el-form-item').find(item => item.find('label').text() === label)!.get('input')}

describe('External API provider design through native data space', () => {
  it('registers the original business path without changing the navigation URL', () => {
    const path = '/features/integration/api-management/ui/api-management-page'
    expect(getVuePageEntry(path)).toMatchObject({source: `src/views${path}.vue`, scope: 'app', shellTool: false})
  })
  it('projects catalog fields without secrets and preserves the modifier identity', async () => {
    const dataSet = await LowcodeApiProvider.load('SCENE'); sets.push(dataSet)
    const view = dataSet.getView('Base_InterfaceProvider', 'default')!
    await view.refresh()
    expect(view.rows[0]).toMatchObject({rowid: 'P1', updateuser: 'U-ROW'})
    expect(view.rows[0]).not.toHaveProperty('CredentialsPassword')
    expect(dataSet.getTable('Base_InterfaceProvider')!.columns.some(c => c.name === 'CredentialsPassword')).toBe(true)
    expect(JSON.stringify(http.reads)).not.toContain('CredentialsPassword')
  })
  it('saves only changed design fields, preserves unrelated data, and rereads in a new instance', async () => {
    const {owner} = await openDesign()
    owner.definition.updateEditingValue('P1', 'Name', '改名')
    await owner.save()
    expect(http.saves).toHaveLength(1)
    expect(JSON.stringify(http.saves)).not.toContain('CredentialsPassword')
    expect(http.records[1]!['Name']).toBe('服务乙')
    const next = await openDesign()
    expect(next.owner.definition.currentRow?.['Name']).toBe('改名')
    expect(owner.pending).toBe(false)
  })
  it('requires both inputs for a new provider and saves after native field editing', async () => {
    const {owner} = await openDesign('NEW', true)
    owner.definition.updateEditingValue('NEW', 'Name', ' 新服务 ')
    await expect(owner.save()).rejects.toThrow('基础 URL')
    expect(http.saves).toHaveLength(0)
    owner.definition.updateEditingValue('NEW', 'BaseURL', '/new')
    await owner.save()
    expect(http.records.find(row => row['rowid'] === 'NEW')).toMatchObject({Name: '新服务', BaseURL: '/new'})
    expect(owner.pending).toBe(false)
  })
  it('does not overwrite an existing identity when creation collides', async () => {
    await expect(openDesign('P1', true)).rejects.toThrow('已存在')
    expect(http.saves).toHaveLength(0)
  })
  it('rejects a result outside the requested provider scope', async () => {
    http.ignoreFilter = true
    await expect(openDesign()).rejects.toThrow('身份')
    expect(http.saves).toHaveLength(0)
  })
  it('respects create denial and field denial without losing a local edit', async () => {
    http.allowAdd = false
    await expect(openDesign('NEW', true)).rejects.toThrow('新增')
    http.denied = ['Name']
    const {owner} = await openDesign()
    owner.definition.updateEditingValue('P1', 'Name', '不应保存')
    await expect(owner.save()).rejects.toThrow()
    expect(http.saves).toHaveLength(0)
  })
  it('does not mix other view changes into the basic definition save', async () => {
    const {owner, dataSet} = await openDesign()
    const catalog = dataSet.getView('Base_InterfaceProvider', 'default')!
    await catalog.refresh()
    catalog.updateEditingValue('P2', 'Name', '未提交的目录修改')
    owner.definition.updateEditingValue('P1', 'BaseURL', '/changed')
    await owner.save()
    expect(http.records[1]!['Name']).toBe('服务乙')
    expect(catalog.getEditingRow('P2')?.['Name']).toBe('未提交的目录修改')
    expect(JSON.stringify(http.saves)).not.toContain('P2')
  })
  it('refuses fields outside the basic definition even when present in the formal model', async () => {
    const {owner} = await openDesign()
    owner.definition.updateEditingValue('P1', 'CredentialsPassword', 'not-a-real-credential')
    await expect(owner.save()).rejects.toThrow('不接受字段')
    expect(http.saves).toHaveLength(0)
  })
  it('refuses a save after the application scope has changed', async () => {
    const {owner} = await openDesign()
    owner.definition.updateEditingValue('P1', 'Name', '不能跨应用保存')
    service.readRequestScope.mockReturnValue({token: 'other-scope', headers: {'X-AppId': 'OTHER'}})
    await expect(owner.save()).rejects.toThrow()
    expect(http.saves).toHaveLength(0)
  })
  it('keeps an unknown receipt blocked until explicit reread, without replaying the write', async () => {
    const {owner} = await openDesign()
    owner.definition.updateEditingValue('P1', 'Name', '已写待核')
    http.failAfterWrite = true
    await expect(owner.save()).rejects.toThrow()
    expect(owner.requiresVerification).toBe(true)
    await expect(owner.save()).rejects.toThrow('核验')
    expect(http.saves).toHaveLength(1)
    await owner.load(true)
    expect(owner.definition.currentRow?.['Name']).toBe('已写待核')
    expect(owner.pending).toBe(false)
  })
  it('renders native bound components, persists an edit, and cancels another without writes', async () => {
    const page = await openPage()
    expect(page.findComponent(RendererTable).text()).toContain('服务甲')
    expect(page.findComponent(RendererTable).text()).toContain('修改人甲')
    await page.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click'); await flushPromises()
    await button(page, '编辑基础信息').trigger('click'); await flushPromises()
    await field(page, '服务提供商名称').setValue('页面修改')
    await button(page, '保存基础信息').trigger('click'); await flushPromises()
    expect(http.records[0]!['Name']).toBe('页面修改')
    expect(page.findComponent(RendererTable).text()).toContain('页面修改')
    await field(page, '服务提供商名称').setValue('取消的修改')
    await button(page, '放弃修改并关闭').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(page.findComponent(RendererForm).exists()).toBe(false)
    expect(http.records[0]!['Name']).toBe('页面修改')
  })
  it('disables creation on the actual standard toolbar when the query denies it', async () => {
    http.allowAdd = false
    const page = await openPage()
    expect(button(page, '新增服务商').attributes('disabled')).toBeDefined()
    expect(page.findComponent(RendererTable).text()).toContain('服务甲')
  })
  it('reports unresolved modifiers without inventing or rewriting their identity', async () => {
    http.records[0]!['updateuser'] = 'OLD-USER'
    const page = await openPage()
    expect(page.get('[role="status"]').text()).toContain('修改人')
    expect(page.findComponent(RendererTable).text()).toContain('OLD-USER')
    expect(http.records[0]!['updateuser']).toBe('OLD-USER')
    expect(http.saves).toHaveLength(0)
  })
  it('opens a native create draft and cancellation removes it without saving', async () => {
    const page = await openPage()
    await button(page, '新增服务商').trigger('click'); await flushPromises()
    await field(page, '服务提供商名称').setValue('未提交新服务')
    await button(page, '保存基础信息').trigger('click'); await flushPromises()
    expect(page.text()).toContain('请填写API 基础 URL')
    expect(http.saves).toHaveLength(0)
    await button(page, '放弃修改并关闭').trigger('click'); await flushPromises()
    expect(page.findComponent(RendererForm).exists()).toBe(false)
    await button(page, '新增服务商').trigger('click'); await flushPromises()
    expect(field(page, '服务提供商名称').element.value).toBe('')
    await button(page, '放弃修改并关闭').trigger('click'); await flushPromises()
    expect(http.records).toHaveLength(2)
  })
  it('keeps a dirty dialog open when its built-in close control is used', async () => {
    const page = await openPage()
    await button(page, '新增服务商').trigger('click'); await flushPromises()
    await field(page, '服务提供商名称').setValue('必须保留的草稿')
    await page.findComponent(RendererDialog).get('.el-dialog__headerbtn').trigger('click'); await flushPromises()
    expect(page.findComponent(RendererDialog).get('.el-overlay').isVisible()).toBe(true)
    expect(field(page, '服务提供商名称').element.value).toBe('必须保留的草稿')
    await button(page, '放弃修改并关闭').trigger('click'); await flushPromises()
    expect(page.findComponent(RendererForm).exists()).toBe(false)
  })
})
