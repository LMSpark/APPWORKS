import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet, SparkData, DataViewFilterCodec} from '@spark-appworks/spark-data'
import {DataViewFilterLocal} from '../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import {AiDataEntryHost} from '@/lowcode/resources/shared/ai-data-entry-host'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererForm, RendererTable, RendererFilter, RendererDialog, SparkAiDataEntry,
  type AiDataEntryAttachment} from '@spark-appworks/spark-component'
import DictionaryCatalog from '@/views/features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue'
import DictionaryData from '@/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page.vue'
import DictionarySetting from '@/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-setting.vue'
import {DictionaryHttp, fixture} from '../../../../packages/spark-lowcode-api/src/platform/resources/dictionary/tests/dictionary-workspace.fixture'
import {buildOptionSourceFromView} from '../../../../packages/spark-component/src/components/fields/options/option-source'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {parseTenantScope} from '@/services/tenant-scope'
import {defineComponent, h} from 'vue'
import {RouterView} from 'vue-router'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: CatalogHttp, runtime: DataSpaceRuntimeApi, dictionaryHttp: DictionaryHttp
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const models = Object.entries({
  _Base_DictType: ['rowid', 'AppId', 'TypeName', 'functiondesc', 'StructureTypeID', 'createuser', 'crttime'],
  Base_StructureType: ['rowid', 'Mrowid', 'Name'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
  Base_AppSystemList: ['rowid', 'AppDesc', 'AppName'],
}).map(([name, fields]) => ({
  id: `${name}-model`, name, metaName: name, sourceType: 'table', sourceId: 'DB', sourceName: name,
  primaryKey: name === 'Base_UserInfo' ? 'ID' : 'rowid', businessMain: false, raw: {},
  fields: fields.map((field, order) => ({id: field, modelId: `${name}-model`, name: field, canonicalName: field,
    primaryKey: field === (name === 'Base_UserInfo' ? 'ID' : 'rowid'), description: field, type: 'string',
    output: true, computed: false, order, orderType: '', raw: {}})),
})) satisfies Array<Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>

class CatalogHttp extends HttpClientBase {
  requests: RequestConfig[] = []
  aiRequests: RequestConfig[] = []
  failAiCreate = false
  allowAdd = true
  failUsers = false
  hideUserName = false
  maskUserName = false
  hideUserValue = false
  hideStructureName = false
  unresolvedCreator = false
  userRows = [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}]
  appRows = [{rowid: 'APP', AppDesc: '应用说明', AppName: '应用名称'}]
  dictionaryRows: Array<Record<string, unknown>> = [
    {rowid: 'D1', AppId: 'APP', TypeName: '配色', createuser: 'U-ROW', StructureTypeID: 'S1'},
  ]
  pauseNextUsers?: () => Promise<void>
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url?.startsWith('/api/ai/v1/')) {
      this.aiRequests.push(config)
      if (config.method === 'POST' && config.url === '/api/ai/v1/turns' && this.failAiCreate) {
        throw new Error('AI创建请求断开，回执未知')
      }
      const result = config.url === '/api/ai/v1/agents'
        ? [{id: 'AGENT-DICTIONARY', agentName: '字典录入', description: null}]
        : config.url.endsWith('/turns')
          ? {conversationId: 'CONVERSATION-D1', turnId: 'TURN-D1', status: 'QUEUED', acceptedAt: null}
          : true
      return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
    }
    const body = config.data as {Table: Array<{Name: string; Filter?: unknown}>}
    const name = body.Table[0]!.Name
    if (name === 'Base_UserInfo' && this.pauseNextUsers) {
      const pause = this.pauseNextUsers; delete this.pauseNextUsers; await pause()
    }
    if (name === 'Base_UserInfo' && this.failUsers) throw new Error('用户目录读取失败')
    let rows: Record<string, unknown>[] = name === '_Base_DictType'
      ? this.dictionaryRows.map(row => ({...row, createuser: this.unresolvedCreator ? 'OLD-ID' : row['createuser']}))
      : name === 'Base_UserInfo' ? this.userRows
      : name === 'Base_AppSystemList' ? this.appRows
      : [{rowid: 'S1', Mrowid: '000000', Name: '基础'}]
    if (body.Table[0]?.Filter) {
      const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(body.Table[0].Filter))
      rows = rows.filter(row => filter.matches(row))
    }
    const count = rows.length
    const page = (config.data as {PageParam?: {index: number; size: number}}).PageParam
    if (page) rows = rows.slice((page.index - 1) * page.size, page.index * page.size)
    return {data: {Code: 200, Result: {primaryKeyField: name === 'Base_UserInfo' ? 'ID' : 'rowid', allowAdd: this.allowAdd,
      lingma_sys_key: 'table-key', data: {Items: rows.map(row => ({...row, lingma_sys_key: 'row-key',
        lingma_sys_params: {r: [], e: [], h: name === 'Base_UserInfo'
          ? [...(this.hideUserName ? ['UserName'] : []), ...(this.hideUserValue ? ['ROWID'] : [])]
          : name === 'Base_StructureType' && this.hideStructureName ? ['Name'] : [],
          m: name === 'Base_UserInfo' && this.maskUserName ? ['UserName'] : [], d: false}})), Count: count}}},
      status: 200, statusText: 'OK', headers: {}}
  }
}
class CatalogDictionaryHttp extends DictionaryHttp {
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    const response = await super.executeRequest(config)
    if (config.url !== '/api/DataOperation/GetData') return response
    const body = config.data as {Table?: Array<{Filter?: string}>}
    const encodedFilter = body.Table?.[0]?.Filter
    if (!encodedFilter) return response
    const payload = response.data as {Result?: {data?: {Items?: Record<string, unknown>[]; Count?: number}}}
    const resultData = payload.Result?.data
    if (!resultData?.Items) return response
    const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(encodedFilter))
    resultData.Items = resultData.Items.filter(row => filter.matches(row))
    resultData.Count = resultData.Items.length
    return response
  }
}
const sets: DataSet[] = []
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new CatalogHttp()
  dictionaryHttp = new CatalogDictionaryHttp()
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: 'CATALOG', name: '字典目录', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  vi.spyOn(LowcodeDictionary, 'loadEditor').mockImplementation(async () => {
    const {dataSet} = fixture(dictionaryHttp, false, LowcodeDictionary.editorScenarioId)
    sets.push(dataSet)
    return {dataSet}
  })
})
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); sets.splice(0).forEach(ds => ds.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals(); config.global.stubs = originalStubs})

async function openCatalog(routePath = '/catalog') {
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const tenantScope = parseTenantScope(routePath)
  const dynamic = createDynamicRouter({
    router, pageComponent: DictionaryCatalog, componentMap: {'/catalog': DictionaryCatalog},
    ...(tenantScope ? {tenantPathPrefix: '/t/:tenantId/:projectId'} : {}),
    loadNavigation: async () => ({
      id: 'root', title: 'Root', childPlacement: 'header',
      ...(tenantScope ? {projectId: tenantScope.projectId} : {}),
      items: [{id: 'catalog', title: '字典目录', path: '/catalog', itemKind: 'system-page', blueprintScenarioId: 'CATALOG'}],
    }),
  })
  await dynamic.registerRoutes()
  await router.push(routePath); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper)
  await flushPromises()
  return {wrapper, router, dynamic}
}

function captureDictionaryAiOwner(hosts: AiDataEntryHost[], attachments: AiDataEntryAttachment[]): void {
  const create = LowcodeDictionary.createAiDataEntryHost.bind(LowcodeDictionary)
  vi.spyOn(LowcodeDictionary, 'createAiDataEntryHost').mockImplementation((dataSet, workspace) => {
    const host = create(dataSet, workspace)
    hosts.push(host)
    const openSession = host.openSession.bind(host)
    vi.spyOn(host, 'openSession').mockImplementation(target => {
      const attachment = openSession(target)
      attachments.push(attachment)
      return attachment
    })
    return host
  })
}

describe('dictionary catalog formal view assembly', () => {
  it('loads application options from their own formal DataSet without rereading catalog models', async () => {
    const dataSet = await LowcodeDictionary.loadApplicationOptions('CATALOG'); sets.push(dataSet)
    const options = dataSet.getView('Base_AppSystemList', 'default')!
    expect(dataSet.scenarioId).toBe('CATALOG')
    expect(Object.keys(dataSet.tables)).toEqual(['Base_AppSystemList'])
    expect(options.valueField).toBe('rowid')
    expect(options.labelField).toBe('AppDesc')
    expect(options.rows).toMatchObject([{rowid: 'APP', AppDesc: '应用说明', AppName: '应用名称'}])
    expect(service.readModel).toHaveBeenCalledTimes(1)
    expect(service.readModel).toHaveBeenCalledWith(expect.objectContaining({dataSpaceId: 'CATALOG', metaName: 'Base_AppSystemList'}))
    expect(http.requests.map(request => (request.data as {Table: Array<{Name: string}>}).Table[0]?.Name)).toEqual(['Base_AppSystemList'])
  })

  it('loads every formally returned dictionary in the unscoped directory, including other and empty AppIds', async () => {
    http.dictionaryRows = [
      {rowid: 'D1', AppId: 'APP', TypeName: '当前应用'},
      {rowid: 'D2', AppId: 'OTHER-APP', TypeName: '其它应用'},
      {rowid: 'D3', AppId: null, TypeName: '共享目录'},
      {rowid: 'D4', AppId: '', TypeName: '未归属目录'},
    ]
    const dataSet = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(dataSet)
    const view = dataSet.getView('_Base_DictType', 'default')!
    expect(view.rows.map(row => row['rowid'])).toEqual(['D1', 'D2', 'D3', 'D4'])
    expect(view.total).toBe(4)
    expect(http.requests.filter(request => (request.data as {Table?: Array<{Name: string}>}).Table?.[0]?.Name === '_Base_DictType'))
      .toHaveLength(1)
    expect(JSON.stringify(http.requests.at(-1)?.data)).not.toContain('OTHER-APP')
  })
  it('keeps the request scope guard while not deriving the directory filter from X-AppId', async () => {
    service.readRequestScope.mockReturnValue({token: 'scope', headers: {}})
    await expect(LowcodeDictionary.loadCatalog('CATALOG')).rejects.toThrow('请先选择应用')
    expect(http.requests).toHaveLength(0)
  })

  it('consumes the catalog add permission while retaining browsing and refresh', async () => {
    http.allowAdd = false
    const {wrapper} = await openCatalog()
    const add = wrapper.findAll('button').find(button => button.text() === '新增字典')!
    expect(add.attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent(RendererTable).text()).toContain('配色')
    expect(wrapper.findAll('button').find(button => button.text() === '刷新')!.attributes('disabled')).toBeUndefined()
    await add.trigger('click'); await flushPromises()
    expect(wrapper.text()).not.toContain('正在读取字典设计')
    expect(wrapper.text()).not.toContain('保存设计')
  })
  it('keeps standard toolbar actions bound and sorts through the catalog view with its application filter', async () => {
    const {wrapper} = await openCatalog()
    expect(wrapper.text()).toContain('数据字典')
    const table = wrapper.findComponent(RendererTable)
    const toolbar = table.get('.renderer-toolbar')
    expect(toolbar.text()).toContain('新增字典')
    expect(toolbar.text()).toContain('方案设计')
    expect(toolbar.text()).toContain('打开数据维护')
    expect(toolbar.findAll('button').find(button => button.text() === '新增字典')!.attributes('disabled')).toBeUndefined()
    const design = () => toolbar.findAll('button').find(button => button.text() === '方案设计')!
    expect(design().attributes('disabled')).toBeDefined()
    await table.get('.el-table__body .el-table__row').trigger('click'); await flushPromises()
    expect(design().attributes('disabled')).toBeUndefined()
    http.requests.length = 0
    const nameHeader = table.findAll('th').find(header => header.text().includes('字典名称'))!
    await nameHeader.get('.sort-caret.descending').trigger('click'); await flushPromises()
    expect(http.requests).toHaveLength(1)
    expect(http.requests[0]!.data).toMatchObject({Table: [{Name: '_Base_DictType', Fields: expect.arrayContaining([
      expect.objectContaining({Name: 'TypeName', OrderType: 'descending'}),
    ])}]})
    expect(JSON.stringify(http.requests[0]!.data)).not.toContain('"Value":"APP"')
  })
  it.each(['000000', 0, ''])('roundtrips an explicit root parent %j without treating unrelated orphans as roots', rootParentValue => {
    const config = new ScenarioViewConfig('CATALOG', JSON.stringify({scenarioId: 'CATALOG', tables: {
      Categories: {modelBinding: {modelId: 'categories', modelName: 'Categories'}, views: {default: {treeConfig: {rootParentValue}}}},
    }}))
    expect(config.toJSON()).toMatchObject({tables: {Categories: {views: {default: {treeConfig: {rootParentValue}}}}}})
    const tree = SparkData.createTreeManager({rootParentValue}, [
      {id: 'root', parentId: rootParentValue, name: '根'}, {id: 'child', parentId: 'root', name: '子'},
      {id: 'orphan', parentId: 'missing', name: '孤立'},
    ])
    expect(tree.buildNestedTree()).toMatchObject([{id: 'root', children: [{id: 'child'}]}])
    expect(tree.getRoots()).toHaveLength(1)
    expect(tree.getNode('root')?.parentId).toBe(rootParentValue)
  })
  it('roundtrips an exact typed root-parent set through scenario config and DataSet assembly', () => {
    const rootParentValues=[null,'',0,'0','000000'] as const
    const input={
      scenarioId:'ROOTS',
      tables:{
        Categories:{
          modelBinding:{modelId:'categories',modelName:'Categories'},
          views:{
            default:{
              treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'Name',rootParentValues},
            },
          },
        },
      },
    }
    const config=new ScenarioViewConfig('ROOTS',JSON.stringify(input))
    expect(config.toJSON()).toMatchObject({tables:{Categories:{views:{default:{treeConfig:{rootParentValues}}}}}})
    const assemble=(scenario:ScenarioViewConfig)=>{
      const tables=(scenario.toJSON() as {tables:Record<string,{modelBinding:unknown;views:unknown}>}).tables
      const definition=tables['Categories']!
      return DataSet.fromJson({scenarioId:'ROOTS',dataSetName:'Roots',tables:{Categories:{tableName:'Categories',
        modelBinding:definition.modelBinding,columns:[{name:'rowid',type:'string',isPrimaryKey:true},
          {name:'prowid',type:'string'},{name:'Name',type:'string'}],views:definition.views}}})
    }
    const first=assemble(config)
    expect(first.getView('Categories','default')?.treeConfig?.rootParentValues).toEqual(rootParentValues)
    const reopenedConfig=new ScenarioViewConfig('ROOTS',JSON.stringify(config.toJSON()))
    const reopened=assemble(reopenedConfig)
    expect(reopened.getView('Categories','default')?.treeConfig?.rootParentValues).toEqual(rootParentValues)
    first.destroy();reopened.destroy()
  })
  it.each([{value:true},{value:{}},{value:[null,true]}])('rejects invalid tree root-parent sets %j and dual declarations', ({value:invalidRootParentValues}) => {
    expect(()=>new ScenarioViewConfig('ROOTS',JSON.stringify({scenarioId:'ROOTS',tables:{Categories:{
      modelBinding:{modelId:'categories',modelName:'Categories'},views:{default:{treeConfig:{rootParentValues:invalidRootParentValues}}},
    }}}))).toThrow('rootParentValues')
    expect(()=>new ScenarioViewConfig('ROOTS',JSON.stringify({scenarioId:'ROOTS',tables:{Categories:{
      modelBinding:{modelId:'categories',modelName:'Categories'},views:{default:{treeConfig:{rootParentValue:'root',rootParentValues:[null,'root']}}},
    }}}))).toThrow('rootParentValue')
  })
  it('binds auxiliary labels by their formal reference field without changing dictionary IDs', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    expect(ds.getView('Base_UserInfo', 'default')?.valueField).toBe('ROWID')
    expect(ds.getView('Base_UserInfo', 'default')?.primaryKey).toBe('ID')
    expect(ds.getView('Base_UserInfo', 'default')?.rows[0]?.['UserName']).toBe('张三')
    expect(ds.getView('Base_StructureType', 'default')?.treeConfig).toMatchObject({idField: 'rowid', parentIdField: 'Mrowid', textField: 'Name'})
    expect(ds.getView('_Base_DictType', 'default')?.rows[0]).toMatchObject({createuser: 'U-ROW', StructureTypeID: 'S1'})
  })
  it('filters by a selected application, clears back to the full native scope, and preserves server page totals', async () => {
    http.dictionaryRows = Array.from({length: 23}, (_, index) => ({rowid: `D${index + 1}`,
      AppId: index % 2 ? 'OTHER' : 'APP', TypeName: `字典${index + 1}`}))
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    const view = ds.getView('_Base_DictType', 'default')!
    http.requests.length = 0
    await view.executeFilter({field: 'AppId', operator: 'eq', value: 'APP'})
    expect(view.rows).toHaveLength(12)
    expect(view.total).toBe(12)
    await view.setPageSize(10)
    await view.setPage(2)
    expect(view.rows).toHaveLength(2)
    expect(view.total).toBe(12)
    expect(http.requests.at(-1)?.data).toMatchObject({PageParam: {index: 2, size: 10}})
    await view.executeFilter(undefined)
    expect(view.rows).toHaveLength(10)
    expect(view.total).toBe(23)
    expect(http.requests.at(-1)?.data).toMatchObject({PageParam: {index: 1, size: 10}})
    expect(JSON.stringify(http.requests.at(-1)?.data)).not.toContain('"Field":"AppId"')
    expect(view.filterExpression).toBeUndefined()
  })
  it('selects and clears the standard AppId filter through its bound application DataView', async () => {
    http.dictionaryRows = [
      {rowid: 'D1', AppId: 'APP', TypeName: '当前应用字典'},
      {rowid: 'D2', AppId: 'OTHER', TypeName: '其它应用字典'},
    ]
    const {wrapper} = await openCatalog()
    const table = wrapper.findComponent(RendererTable)
    const filter = table.findComponent(RendererFilter)
    const appItem = filter.findAll('.el-form-item').find(item => item.find('label').text() === '所属应用')!
    const select = appItem.find('.el-select')
    expect(select.exists()).toBe(true)
    await select.find('.el-select__wrapper').trigger('click'); await flushPromises()
    const appOption = Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item => item.textContent?.includes('应用说明'))
    expect(appOption).toBeDefined()
    await new DOMWrapper(appOption!).trigger('click'); await flushPromises()
    expect(table.find('.el-table__body').text()).toContain('当前应用字典')
    expect(table.find('.el-table__body').text()).not.toContain('其它应用字典')
    expect(JSON.stringify(http.requests.at(-1)?.data)).toContain('"Value":"APP"')
    await select.find('.el-select__wrapper').trigger('mouseenter')
    const clear = select.find('.el-select__clear')
    expect(clear.exists()).toBe(true)
    await clear.trigger('click'); await flushPromises()
    expect(table.find('.el-table__body').text()).toContain('其它应用字典')
    expect(table.find('.el-table__body').text()).toContain('当前应用字典')
    expect(JSON.stringify(http.requests.at(-1)?.data)).not.toContain('"Value":"APP"')
  })
  it('reports auxiliary query failures and releases the partially assembled DataSet', async () => {
    http.failUsers = true
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    await expect(LowcodeDictionary.loadCatalog('CATALOG')).rejects.toThrow('用户目录读取失败')
    expect(destroy).toHaveBeenCalled()
  })
  it('queries all matching creator names and sends reference ROWIDs without mutating auxiliary view state', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    const users = ds.getView('Base_UserInfo', 'default')!
    const rows = users.rows
    users.setSelectedRows([rows[0]!])
    http.userRows.push({ID: 'U-PK2', ROWID: 'U-ROW2', UserName: '张四'}, {ID: 'U-PK3', ROWID: 'U-ROW3', UserName: '李三'})
    http.requests.length = 0
    const view = ds.getView('_Base_DictType', 'default')!
    await view.executeFilter({field: 'createuser', operator: 'contains', value: '张'})
    expect(http.requests).toHaveLength(2)
    const request = http.requests.at(-1)?.data as {Table: Array<{Filter: unknown}>}
    expect(DataViewFilterCodec.decode(request.Table[0]!.Filter).toJSON()).toMatchObject(
      {field: 'createuser', operator: 'in', value: ['U-ROW', 'U-ROW2']})
    expect(view.filterExpression).toEqual({field: 'createuser', operator: 'contains', value: '张'})
    expect(users.rows).toBe(rows)
    expect(users.getSelectedValues()).toEqual(['U-PK'])
  })
  it('keeps an empty name match false even inside an OR expression', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    const view = ds.getView('_Base_DictType', 'default')!
    await view.executeFilter({logic:'or', filters:[{field:'createuser',operator:'contains',value:'无人匹配'},
      {field:'TypeName',operator:'eq',value:'特定字典'}]})
    const request = http.requests.at(-1)?.data as {Table: Array<{Filter: unknown}>}
    const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(request.Table[0]!.Filter))
    expect(filter.matches({AppId:'APP',createuser:'无人匹配ID',TypeName:'其他字典'})).toBe(false)
    expect(filter.matches({AppId:'APP',createuser:'U-ROW',TypeName:'特定字典'})).toBe(true)
    expect(filter.matches({AppId:'OTHER',createuser:'U-ROW',TypeName:'特定字典'})).toBe(true)
  })
  it.each(['hideUserName','maskUserName','hideUserValue','failUsers'] as const)('does not dispatch the catalog query when creator lookup %s fails', async flag => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    http[flag] = true; http.requests.length = 0
    const view = ds.getView('_Base_DictType', 'default')!
    await view.executeFilter({field:'createuser',operator:'contains',value:'张'})
    expect(view.loadingError).not.toBeNull()
    expect(http.requests.every(request => (request.data as {Table:Array<{Name:string}>}).Table[0]!.Name === 'Base_UserInfo')).toBe(true)
  })
  it('keeps creator lookup on sorting and paging and removes it on filter reset', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    const view = ds.getView('_Base_DictType', 'default')!
    http.requests.length = 0
    await view.executeFilter({field:'createuser',operator:'contains',value:'张'})
    await view.setSort([{field:'TypeName',direction:'asc'}]); await view.setPage(2); await view.refresh()
    expect(http.requests).toHaveLength(8)
    for (const request of http.requests.filter(request => (request.data as {Table:Array<{Name:string}>}).Table[0]!.Name === '_Base_DictType')) {
      expect(JSON.stringify(request.data)).toContain('U-ROW')
      expect(JSON.stringify(request.data)).not.toContain('APP')
    }
    await view.executeFilter(undefined)
    expect(http.requests).toHaveLength(9)
    expect(JSON.stringify(http.requests.at(-1)?.data)).not.toContain('U-ROW')
  })
  it('does not dispatch an obsolete catalog request after a slower creator search resolves', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    const view = ds.getView('_Base_DictType', 'default')!
    http.userRows.push({ID:'U-PK2',ROWID:'U-ROW2',UserName:'李四'})
    let release!: () => void, started!: () => void
    const ready = new Promise<void>(resolve => {started=resolve})
    const wait = new Promise<void>(resolve => {release=resolve})
    http.pauseNextUsers = () => {started(); return wait}
    http.requests.length = 0
    const previous = view.executeFilter({field:'createuser',operator:'contains',value:'张'})
    await ready
    await view.executeFilter({field:'createuser',operator:'contains',value:'李'})
    release(); await previous
    const targetRequests = http.requests.filter(request => (request.data as {Table:Array<{Name:string}>}).Table[0]!.Name === '_Base_DictType')
    expect(targetRequests).toHaveLength(1)
    expect(JSON.stringify(targetRequests[0]?.data)).toContain('U-ROW2')
    expect(view.filterExpression).toEqual({field:'createuser',operator:'contains',value:'李'})
    expect(view.loadingError).toBeNull()
  })
  it('fails an invalid scoped lookup and preserves configuration through serialization', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    const view = ds.getView('_Base_DictType', 'default')!
    expect(view.toJson().queryConfig?.filterLookups?.[0]).toEqual({field:'createuser',sourceViewKey:'CATALOG@Base_UserInfo@default',matchField:'UserName',valueField:'ROWID'})
    view.queryConfig = {...view.queryConfig,filterLookups:[{...view.queryConfig.filterLookups![0]!,sourceViewKey:'OTHER@Base_UserInfo@default'}]}
    http.requests.length = 0
    await view.executeFilter({field:'createuser',operator:'contains',value:'张'})
    expect(view.loadingError?.message).toContain('DATA_VIEW_FILTER_LOOKUP_SOURCE')
    expect(http.requests).toHaveLength(0)
  })
  it('combines lookup input with the auxiliary view scope rather than replacing it', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    http.userRows.push({ID:'OTHER-PK',ROWID:'OTHER-ROW',UserName:'张四'})
    const users = ds.getView('Base_UserInfo','default')!
    users.filterExpression = {field:'ROWID',operator:'eq',value:'U-ROW'}
    await ds.getView('_Base_DictType','default')!.executeFilter({field:'createuser',operator:'contains',value:'张'})
    expect(JSON.stringify(http.requests.at(-1)?.data)).toContain('U-ROW')
    expect(JSON.stringify(http.requests.at(-1)?.data)).not.toContain('OTHER-ROW')
  })
  it('does not bypass query dependencies on a lookup source', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    ds.addCascade({parentTable: 'Base_StructureType', parentViewId: 'default', childTable: 'Base_UserInfo', childViewId: 'default',
      autoLoad: false, filterBindings: [{sourceField: 'rowid', targetField: 'ROWID'}]})
    http.requests.length = 0
    const view = ds.getView('_Base_DictType', 'default')!
    await view.executeFilter({field: 'createuser', operator: 'contains', value: '张'})
    expect(view.loadingError?.message).toContain('DATA_VIEW_FILTER_LOOKUP_SOURCE')
    expect(http.requests).toHaveLength(0)
  })
  it('roundtrips lookup configuration through scenario pagedata without runtime rows', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    const queryConfig = ds.getView('_Base_DictType', 'default')!.queryConfig
    const config = new ScenarioViewConfig('CATALOG', JSON.stringify({scenarioId: 'CATALOG', tables: {
      _Base_DictType: {modelBinding: {modelId: '_Base_DictType-model', modelName: '_Base_DictType'}, views: {default: {queryConfig}}},
    }}))
    const reopened = new ScenarioViewConfig('CATALOG', JSON.stringify(config.toJSON()))
    expect(reopened.toJSON()).toMatchObject({tables: {_Base_DictType: {views: {default: {queryConfig}}}}})
    expect(JSON.stringify(reopened.toJSON())).not.toContain('张三')
    expect(JSON.stringify(reopened.toJSON())).not.toContain('U-ROW')
  })
  it('does not expose a hidden auxiliary label through standard option presentation', async () => {
    http.hideUserName = true
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    const source = buildOptionSourceFromView(ds.getView('Base_UserInfo', 'default')!, {labelField: 'UserName', childrenField: 'children'})
    expect(JSON.stringify(source)).not.toContain('张三')
    expect(source).toEqual([])
  })
  it.each(['maskUserName', 'hideUserValue'] as const)('excludes options when %s is protected', async protection => {
    http[protection] = true
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    expect(buildOptionSourceFromView(ds.getView('Base_UserInfo', 'default')!, {labelField: 'UserName', childrenField: 'children'})).toEqual([])
  })
  it('rejects unreadable tree labels before they can enter the tree manager cache', async () => {
    http.hideStructureName = true
    await expect(LowcodeDictionary.loadCatalog('CATALOG')).rejects.toThrow('SPARK_TREE_FIELD_UNAVAILABLE')
  })
  it.each([null, true, {}, []])('rejects invalid root parent configuration %j', rootParentValue => {
    expect(() => new ScenarioViewConfig('CATALOG', JSON.stringify({scenarioId: 'CATALOG', tables: {
      Categories: {modelBinding: {modelId: 'categories', modelName: 'Categories'}, views: {default: {treeConfig: {rootParentValue}}}},
    }}))).toThrow('rootParentValue')
  })
  it('renders resolved labels and applies and resets the standard filter without a page query implementation', async () => {
    const {wrapper} = await openCatalog()
    const table = wrapper.findComponent(RendererTable)
    expect(table.find('.el-table__body').text()).toContain('张三')
    expect(table.find('.el-table__body').text()).toContain('基础')
    const filter = table.findComponent(RendererFilter)
    expect(filter.exists()).toBe(true)
    http.requests.length = 0
    await filter.findAll('.el-form-item').find(item => item.find('label').text() === '字典名称')!.get('input').setValue('配色')
    await flushPromises()
    expect(JSON.stringify(http.requests.at(-1)?.data)).toContain('配色')
    expect(JSON.stringify(http.requests.at(-1)?.data)).not.toContain('"Value":"APP"')
    const reset = filter.findAll('button').find(button => button.text().includes('重置'))!
    await reset.trigger('click'); await flushPromises()
    expect(JSON.stringify(http.requests.at(-1)?.data)).not.toContain('"Value":"APP"')
    expect(JSON.stringify(http.requests.at(-1)?.data)).not.toContain('配色')
    await filter.findAll('.el-form-item').find(item => item.find('label').text() === '创建人')!.get('input').setValue('张')
    await flushPromises()
    expect(JSON.stringify(http.requests.at(-1)?.data)).toContain('U-ROW')
    await reset.trigger('click'); await flushPromises()
    http.unresolvedCreator = true
    const beforeRefresh = http.requests.length
    await wrapper.findAll('button').find(button => button.text() === '刷新')!.trigger('click'); await flushPromises()
    expect(http.requests.length).toBe(beforeRefresh + 1)
    expect(table.find('.el-table__body').text()).toContain('OLD-ID')
    expect(wrapper.find('[role="status"]').text()).toContain('创建人')
  })

  it('opens design dialog for selected dictionary from toolbar', async () => {
    const {wrapper} = await openCatalog()
    const table = wrapper.findComponent(RendererTable)
    await table.get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    const design = wrapper.findAll('button').find(button => button.text() === '方案设计')!
    await design.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('保存设计')
    expect(wrapper.text()).toContain('编码类型')
  })

  it('opens the selected dictionary data workspace from its catalog host', async () => {
    const {wrapper, router} = await openCatalog('/t/ENT/PROJ/catalog')
    const table = wrapper.findComponent(RendererTable)
    await table.get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    const openData = wrapper.findAll('button').find(button => button.text() === '打开数据维护')!
    await openData.trigger('click')
    await flushPromises()
    const dataPage = wrapper.findComponent(DictionaryData)
    expect(dataPage.exists()).toBe(true)
    expect(router.currentRoute.value.path).toBe('/t/ENT/PROJ/catalog')
    expect(router.currentRoute.value.query).toEqual({})
    expect(dataPage.text()).toContain('当前方案：配色（D1）')
    expect(dataPage.findComponent(RendererTable).text()).toContain('白')
    for (const label of ['新增条目', '删除当前条目', '保存数据', '取消数据修改并重读']) {
      expect(dataPage.findAll('button').some(button => button.text() === label)).toBe(true)
    }
    await dataPage.findAll('button').find(button => button.text() === 'AI 候选')!.trigger('click')
    await flushPromises()
    expect(dataPage.findComponent(SparkAiDataEntry).exists()).toBe(true)
  })

  it('keeps the dictionary data owner mounted outside the dialog after a clean close', async () => {
    const {wrapper} = await openCatalog()
    const table = wrapper.findComponent(RendererTable)
    await table.get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(DictionaryData).exists()).toBe(true)
    const editingDataSet = sets.at(-1)
    if (editingDataSet === undefined) throw new Error('字典编辑DataSet没有由目录宿主创建')

    await wrapper.findAll('button').find(button => button.text() === '关闭')!.trigger('click')
    await flushPromises()

    expect.soft(wrapper.findComponent(DictionaryData).exists()).toBe(true)
    expect.soft(wrapper.find('.dictionary-data-page').exists()).toBe(false)
    expect.soft(editingDataSet.destroyed).toBe(true)
    expect(dictionaryHttp.saves).toHaveLength(0)
  })

  it('keeps the data workspace open while dirty, then closes after ordinary cancel rereads', async () => {
    const {wrapper} = await openCatalog()
    const catalogTable = wrapper.findComponent(RendererTable)
    await catalogTable.get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click')
    await flushPromises()
    const dataPage = wrapper.findComponent(DictionaryData)
    const table = dataPage.findComponent(RendererTable)
    await table.get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await dataPage.findComponent(RendererForm).find('input').setValue('未提交草稿')
    await flushPromises()
    const footerClose = () => dataPage.findAll('button').find(button => button.text() === '关闭')!
    expect(dataPage.vm.isDirty).toBe(true)
    expect(dataPage.findComponent(RendererDialog).props('closeDisabled')).toBe(true)
    expect(footerClose().attributes('disabled')).toBeDefined()
    expect(dataPage.findAll('button').some(button => button.text() === '保存数据')).toBe(true)
    const dataDialog = wrapper.findAllComponents(RendererDialog).find(dialog => dialog.props('modelValue') === true)
    if (!dataDialog) throw new Error('数据工作区标准Dialog未打开')
    dataDialog.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.findComponent(DictionaryData).exists()).toBe(true)
    expect(dataPage.findComponent(RendererDialog).props('modelValue')).toBe(true)
    await dataPage.findAll('button').find(button => button.text() === '取消数据修改并重读')!.trigger('click')
    await flushPromises()
    expect(dataPage.findComponent(RendererDialog).props('closeDisabled')).toBe(false)
    expect(footerClose().attributes('disabled')).toBeUndefined()
    dataPage.findComponent(RendererDialog).vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.findComponent(DictionaryData).exists()).toBe(true)
    expect(wrapper.find('.dictionary-data-page').exists()).toBe(false)
    expect(dictionaryHttp.saves).toHaveLength(0)
  })

  it('releases the current data owner before switching to design, another dictionary, or create mode', async () => {
    http.dictionaryRows.push({rowid: 'D2', AppId: 'OTHER-APP', TypeName: '第二字典', createuser: 'U-ROW', StructureTypeID: 'S1'})
    dictionaryHttp.records['_Base_DictType']!.push({rowid: 'D2', AppId: 'OTHER-APP', TypeName: '第二字典', dictionaryType: '0',
      val: '编码', txt: '名称', secondValue: '', thirdValue: '', fourthvalue: '', fiveValue: '', functiondesc: ''})
    const {wrapper} = await openCatalog()
    const catalogTable = wrapper.findComponent(RendererTable)
    const catalogRows = catalogTable.findAll('.el-table__body .el-table__row')
    expect(catalogRows).toHaveLength(2)
    await catalogRows[0]!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click')
    await flushPromises()
    const dataPage = wrapper.findComponent(DictionaryData)
    const exposed = dataPage.vm.$.exposed
    if (exposed === null || typeof exposed['releaseClean'] !== 'function') throw new Error('数据页未暴露clean release')
    const release = vi.spyOn(exposed, 'releaseClean').mockImplementation(() => {throw new Error('AI临时视图仍有关系引用')})
    const originalDataSet = sets.at(-1)
    if (originalDataSet === undefined) throw new Error('字典编辑DataSet没有由目录宿主创建')

    await catalogTable.findAll('.el-table__body .el-table__row')[1]!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '方案设计')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '新增字典')!.trigger('click')
    await flushPromises()

    expect(release).toHaveBeenCalledTimes(3)
    expect(wrapper.findComponent(DictionaryData).text()).toContain('当前方案：配色（D1）')
    expect(wrapper.findComponent(DictionaryData).props('open')).toBe(true)
    expect(originalDataSet.destroyed).toBe(false)
    expect(sets).toHaveLength(1)
    expect(wrapper.text()).not.toContain('保存设计')
  })

  it('keeps an unsubmitted AI business prompt dirty in the real directory owner and blocks close and switching', async () => {
    service.readRequestScope.mockReturnValue({token: 'scope', headers: {'tenant-id': 'ENT', 'X-AppId': 'APP'}})
    vi.stubEnv('VITE_AI_DATA_ENTRY_AGENTS', JSON.stringify({ENT: 'AGENT-DICTIONARY'}))
    http.dictionaryRows.push({rowid: 'D2', AppId: 'OTHER-APP', TypeName: '第二字典', createuser: 'U-ROW', StructureTypeID: 'S1'})
    const hosts: AiDataEntryHost[] = [], attachments: AiDataEntryAttachment[] = []
    captureDictionaryAiOwner(hosts, attachments)
    const {wrapper, router, dynamic} = await openCatalog('/t/ENT/PROJ/catalog')
    const catalogTable = wrapper.findComponent(RendererTable)
    await catalogTable.findAll('.el-table__body .el-table__row')[0]!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click')
    await flushPromises()
    const dataPage = wrapper.findComponent(DictionaryData)
    await dataPage.findAll('button').find(button => button.text() === 'AI 候选')!.trigger('click')
    await flushPromises()
    const ai = dataPage.findComponent(SparkAiDataEntry)
    await ai.get('textarea').setValue('保留在目录owner中的业务提示')
    await flushPromises()

    const instance = dynamic.getSystemPageInstance(router.currentRoute.value)
    const dataSet = sets.at(-1)
    if (instance === undefined || dataSet === undefined || hosts.length !== 1 || attachments.length !== 1) {
      throw new Error('真实目录未建立系统页实例、字典DataSet或AI host attachment')
    }
    const input = dataSet.getView('AiDataEntryInput', 'default')
    const inputRow = input?.currentRow
    if (input === undefined || inputRow === null || inputRow === undefined) throw new Error('AI输入视图没有当前提示行')

    expect(input.hasEditingChanges()).toBe(true)
    expect(input.getEditingRow(input.getPkKey(inputRow)!)?.['businessPrompt']).toBe('保留在目录owner中的业务提示')
    expect(hosts[0]!.isDirty).toBe(true)
    expect(dataPage.vm.isDirty).toBe(true)
    expect(instance.isDirty).toBe(true)
    expect(() => dynamic.assertPageRuntimesClean()).toThrow('未保存')
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    expect(dataPage.findAll('button').find(button => button.text() === '关闭')!.attributes('disabled')).toBeDefined()

    const dataDialog = dataPage.findComponent(RendererDialog)
    dataDialog.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(dataDialog.props('modelValue')).toBe(true)
    await catalogTable.findAll('.el-table__body .el-table__row')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.attributes('disabled')).toBeDefined()
    expect(dataPage.text()).toContain('当前方案：配色（D1）')
    expect(attachments[0]!.signal.aborted).toBe(false)
  })

  it('retains a lost AI create capture across candidate unmount and reattachment without reposting', async () => {
    service.readRequestScope.mockReturnValue({token: 'scope', headers: {'tenant-id': 'ENT', 'X-AppId': 'APP'}})
    vi.stubEnv('VITE_AI_DATA_ENTRY_AGENTS', JSON.stringify({ENT: 'AGENT-DICTIONARY'}))
    http.failAiCreate = true
    const hosts: AiDataEntryHost[] = [], attachments: AiDataEntryAttachment[] = []
    captureDictionaryAiOwner(hosts, attachments)
    const {wrapper, router, dynamic} = await openCatalog('/t/ENT/PROJ/catalog')
    const catalogTable = wrapper.findComponent(RendererTable)
    await catalogTable.get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click')
    await flushPromises()
    const dataPage = wrapper.findComponent(DictionaryData)
    await dataPage.findAll('button').find(button => button.text() === 'AI 候选')!.trigger('click')
    await flushPromises()
    const ai = dataPage.findComponent(SparkAiDataEntry)
    await ai.get('textarea').setValue('创建回执未知的提示')
    await dataPage.findAll('button').find(button => button.text() === '开始生成')!.trigger('click')
    await flushPromises()

    const instance = dynamic.getSystemPageInstance(router.currentRoute.value)
    const dataSet = sets.at(-1)
    if (instance === undefined || dataSet === undefined || hosts.length !== 1 || attachments.length !== 1) {
      throw new Error('真实目录未建立系统页实例、字典DataSet或AI host attachment')
    }
    const requestView = dataSet.getView('AiTurnRequest', 'default')
    const requestRow = requestView?.rows[0]
    const idempotencyKey = requestRow?.['idempotencyKey']
    if (requestView === undefined || requestRow === undefined || typeof idempotencyKey !== 'string') {
      throw new Error('未知AI创建未保留正式AiTurnRequest捕获')
    }
    const postCount = http.aiRequests.filter(request => request.method === 'POST' && request.url === '/api/ai/v1/turns').length
    expect(postCount).toBe(1)
    expect(requestView.hasUnconfirmedSave).toBe(true)
    expect(hosts[0]!.isDirty).toBe(true)
    expect(dataPage.vm.isDirty).toBe(true)
    expect(instance.isDirty).toBe(true)
    expect(() => dynamic.assertPageRuntimesClean()).toThrow('未保存')
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')

    const setupState: unknown = Reflect.get(dataPage.vm.$, 'setupState')
    if (typeof setupState !== 'object' || setupState === null || !Reflect.set(setupState, 'aiVisible', false)) {
      throw new Error('无法在测试中卸载AI面板组件')
    }
    await flushPromises()
    expect(dataPage.findComponent(SparkAiDataEntry).exists()).toBe(false)
    expect(attachments[0]!.signal.aborted).toBe(true)
    expect(hosts[0]!.isDirty).toBe(true)
    expect(dataPage.vm.isDirty).toBe(true)

    if (!Reflect.set(setupState, 'aiVisible', true)) throw new Error('无法在测试中重挂AI面板组件')
    await flushPromises()
    expect(dataPage.findComponent(SparkAiDataEntry).exists()).toBe(true)
    expect(attachments).toHaveLength(2)
    expect(attachments[1]!.session).toBe(attachments[0]!.session)
    expect(attachments[1]!.session.hasUnconfirmedSave).toBe(true)
    expect(attachments[1]!.session.input.hasEditingChanges()).toBe(true)
    expect(dataSet.getView('AiTurnRequest', 'default')?.rows[0]?.['idempotencyKey']).toBe(idempotencyKey)
    expect(http.aiRequests.filter(request => request.method === 'POST' && request.url === '/api/ai/v1/turns')).toHaveLength(postCount)
    expect(hosts[0]!.isDirty).toBe(true)
    expect(dynamic.getSystemPageInstance(router.currentRoute.value)?.isDirty).toBe(true)
  })

  it('keeps the data workspace open when a save receipt is unknown', async () => {
    const {wrapper} = await openCatalog()
    const catalogTable = wrapper.findComponent(RendererTable)
    await catalogTable.get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click')
    await flushPromises()
    const dataPage = wrapper.findComponent(DictionaryData)
    await dataPage.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    await dataPage.findComponent(RendererForm).find('input').setValue('回执未知修改')
    await flushPromises()
    dictionaryHttp.afterResponse = async request => {
      if (request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') throw new Error('回执中断')
    }
    await dataPage.findAll('button').find(button => button.text() === '保存数据')!.trigger('click')
    await flushPromises()
    expect(dataPage.findAll('button').some(button => button.text() === '核验原提交（保留本地修改）')).toBe(true)
    expect(wrapper.findAll('button').find(button => button.text() === '关闭')!.attributes('disabled')).toBeDefined()
    expect(dictionaryHttp.saves).toHaveLength(1)
  })

  it('saves D1 from the catalog host, closes its runtime, and opens an isolated D2 workspace', async () => {
    http.dictionaryRows.push({rowid: 'D2', AppId: 'OTHER-APP', TypeName: '双目标', createuser: 'U-ROW', StructureTypeID: 'S1'})
    dictionaryHttp.records['_Base_DictType']!.push({rowid: 'D2', AppId: 'OTHER-APP', TypeName: '双目标', dictionaryType: '0',
      val: '代码', txt: '名称', secondValue: '色号', thirdValue: '类别', fourthvalue: 'D2用途', fiveValue: 'D2说明', functiondesc: ''})
    dictionaryHttp.records['_Base_DictData']!.push({rowid: 'E2', typeid: 'D2', ordIdx: 1, val: '20', txt: '黑',
      exVal_1: '#000', exVal_2: '基础', exVal_3: '', exVal_4: 'D2原值'})
    const {wrapper, router} = await openCatalog('/t/ENT/PROJ/catalog')
    const catalogTable = wrapper.findComponent(RendererTable)
    const catalogRows = catalogTable.findAll('.el-table__body .el-table__row')
    expect(catalogRows).toHaveLength(2)
    expect(catalogTable.find('.el-table__body').text()).toContain('OTHER-APP')

    await catalogRows[0]!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click')
    await flushPromises()
    const d1Page = wrapper.findComponent(DictionaryData)
    expect(d1Page.text()).toContain('当前方案：配色（D1）')
    await d1Page.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    const d1Note = d1Page.findComponent(RendererForm).findAll('.el-form-item')
      .find(item => item.find('label').text() === '说明')!.find('input')
    await d1Note.setValue('D1目录入口保存')
    await flushPromises()
    await d1Page.findAll('button').find(button => button.text() === '保存数据')!.trigger('click')
    await flushPromises()

    expect(dictionaryHttp.saves).toHaveLength(1)
    expect(dictionaryHttp.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {
      Changed: [expect.objectContaining({rowid: 'E1', exVal_4: 'D1目录入口保存'})],
    }}])
    expect(dictionaryHttp.saves[0]!.data).toHaveLength(1)
    expect(dictionaryHttp.records['_Base_DictData']![0]!['exVal_4']).toBe('D1目录入口保存')

    const d1RuntimeDataSet = sets.at(-1)!
    await wrapper.findAll('button').find(button => button.text() === '关闭')!.trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(DictionaryData).exists()).toBe(true)
    expect(wrapper.find('.dictionary-data-page').exists()).toBe(false)
    expect(d1RuntimeDataSet.destroyed).toBe(true)

    await catalogTable.findAll('.el-table__body .el-table__row')[1]!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click')
    await flushPromises()
    const d2Page = wrapper.findComponent(DictionaryData)
    const d2RuntimeDataSet = sets.at(-1)!
    expect(d2Page.exists()).toBe(true)
    expect(d2RuntimeDataSet).not.toBe(d1RuntimeDataSet)
    expect(d1RuntimeDataSet.destroyed).toBe(true)
    expect(d2RuntimeDataSet.destroyed).toBe(false)
    expect(d2Page.text()).toContain('当前方案：双目标（D2）')
    expect(d2Page.text()).toContain('D2用途')
    expect(d2Page.findComponent(RendererTable).text()).toContain('黑')
    expect(router.currentRoute.value.path).toBe('/t/ENT/PROJ/catalog')
    expect(router.currentRoute.value.query).toEqual({})

    await d2Page.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
    await flushPromises()
    const d2Note = d2Page.findComponent(RendererForm).findAll('.el-form-item')
      .find(item => item.find('label').text() === 'D2用途')!.find('input')
    await d2Note.setValue('D2目录入口保存')
    await flushPromises()
    await d2Page.findAll('button').find(button => button.text() === '保存数据')!.trigger('click')
    await flushPromises()

    expect(dictionaryHttp.saves).toHaveLength(2)
    expect(dictionaryHttp.saves[1]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {
      Changed: [expect.objectContaining({rowid: 'E2', exVal_3: 'D2目录入口保存'})],
    }}])
    expect(dictionaryHttp.saves[1]!.data).toHaveLength(1)
    expect(dictionaryHttp.records['_Base_DictData']![0]!['exVal_4']).toBe('D1目录入口保存')
    expect(dictionaryHttp.records['_Base_DictData']![1]!['exVal_3']).toBe('D2目录入口保存')
    expect(dictionaryHttp.records['_Base_DictData']![1]!['exVal_4']).toBe('D2原值')

    await wrapper.findAll('button').find(button => button.text() === '关闭')!.trigger('click'); await flushPromises()
    expect(d2RuntimeDataSet.destroyed).toBe(true)
    await catalogTable.findAll('.el-table__body .el-table__row')[1]!.trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '方案设计')!.trigger('click'); await flushPromises()
    const d2Design = wrapper.findComponent(DictionarySetting)
    await d2Design.findAll('.el-form-item').find(item => item.find('label').text() === '功能描述')!.get('input').setValue('跨应用设计保存')
    await wrapper.findAll('button').find(button => button.text() === '保存设计')!.trigger('click'); await flushPromises()
    expect(dictionaryHttp.records['_Base_DictType']![1]).toMatchObject({rowid: 'D2', AppId: 'OTHER-APP', functiondesc: '跨应用设计保存'})
    expect(dictionaryHttp.saves[2]!.data).toMatchObject([{TableName: '_Base_DictType', CrudModel: {
      Changed: [expect.objectContaining({rowid: 'D2', functiondesc: '跨应用设计保存'})],
    }}])
    expect((dictionaryHttp.saves[2]!.data as Array<{CrudModel: {Changed: Array<Record<string, unknown>>}}>)
      [0]!.CrudModel.Changed[0]).not.toHaveProperty('AppId')
    await wrapper.findAll('button').find(button => button.text() === '关闭')!.trigger('click'); await flushPromises()
    await catalogTable.findAll('.el-table__body .el-table__row')[1]!.trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click'); await flushPromises()
    const reopened = wrapper.findComponent(DictionaryData)
    expect(reopened.text()).toContain('当前方案：双目标（D2）')
    expect(reopened.findComponent(RendererTable).text()).toContain('D2目录入口保存')
    await wrapper.findAll('button').find(button => button.text() === '关闭')!.trigger('click'); await flushPromises()
    expect(sets.at(-1)?.destroyed).toBe(true)
  })

  it('sorts and saves displayed entry order inside the catalog host, then isolates the next dictionary', async () => {
    dictionaryHttp.records['_Base_DictData'] = [
      {rowid: 'C', typeid: 'D1', ordIdx: 1, val: 'C', txt: 'C'},
      {rowid: 'A', typeid: 'D1', ordIdx: 2, val: 'A', txt: 'A'},
      {rowid: 'B', typeid: 'D1', ordIdx: 3, val: 'B', txt: 'B'},
    ]
    http.dictionaryRows.push({rowid: 'D2', AppId: 'APP', TypeName: '双目标', createuser: 'U-ROW', StructureTypeID: 'S1'})
    dictionaryHttp.records['_Base_DictType']!.push({rowid: 'D2', AppId: 'APP', TypeName: '双目标', dictionaryType: '0',
      val: '代码', txt: '名称', secondValue: '色号', thirdValue: '类别', fourthvalue: 'D2用途', fiveValue: 'D2说明', functiondesc: ''})
    dictionaryHttp.records['_Base_DictData']!.push({rowid: 'E2', typeid: 'D2', ordIdx: 1, val: '20', txt: '黑',
      exVal_1: '#000', exVal_2: '基础', exVal_3: '', exVal_4: 'D2原值'})
    const {wrapper, router} = await openCatalog('/t/ENT/PROJ/catalog?retain=yes')
    const catalogTable = wrapper.findComponent(RendererTable)
    await catalogTable.findAll('.el-table__body .el-table__row')[0]!.trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click'); await flushPromises()
    const dataPage = wrapper.findComponent(DictionaryData)
    const dataSetD1 = sets.at(-1)!
    const table = dataPage.findComponent(RendererTable)
    const codeHeading = table.findAll('.el-table__header-wrapper th').find(cell => cell.text().includes('代码'))!
    await codeHeading.trigger('click'); await flushPromises()
    expect(table.find('.el-table__body').text().indexOf('A')).toBeLessThan(table.find('.el-table__body').text().indexOf('C'))
    const apply = dataPage.findAll('button').find(button => button.text() === '设置排序')
    expect(apply).toBeDefined()
    await apply!.trigger('click'); await flushPromises()
    expect(dataPage.findComponent(RendererTable).text()).toContain('1')
    expect(dictionaryHttp.saves).toHaveLength(0)
    await dataPage.findAll('button').find(button => button.text() === '保存数据')!.trigger('click'); await flushPromises()
    expect(dictionaryHttp.saves).toHaveLength(1)
    const orderSave = dictionaryHttp.saves[0]!.data as Array<{TableName: string; CrudModel: {Changed: Array<Record<string, unknown>>}}>
    expect(orderSave).toHaveLength(1)
    expect(orderSave[0]!.TableName).toBe('_Base_DictData')
    expect(orderSave[0]!.CrudModel.Changed.map(row => Object.fromEntries(Object.entries(row)
      .filter(([field]) => !field.startsWith('lingma_sys_'))))).toEqual([
      {rowid: 'A', ordIdx: 1}, {rowid: 'B', ordIdx: 2}, {rowid: 'C', ordIdx: 3},
    ])
    await wrapper.findAll('button').find(button => button.text() === '关闭')!.trigger('click'); await flushPromises()
    expect(dataSetD1.destroyed).toBe(true)
    await catalogTable.findAll('.el-table__body .el-table__row')[0]!.trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click'); await flushPromises()
    const reopenedD1 = wrapper.findComponent(DictionaryData)
    const reopenedD1DataSet = sets.at(-1)!
    expect(reopenedD1DataSet).not.toBe(dataSetD1)
    const reopenedText = reopenedD1.findComponent(RendererTable).find('.el-table__body').text()
    expect(reopenedText.indexOf('A')).toBeLessThan(reopenedText.indexOf('B'))
    expect(reopenedText.indexOf('B')).toBeLessThan(reopenedText.indexOf('C'))
    await wrapper.findAll('button').find(button => button.text() === '关闭')!.trigger('click'); await flushPromises()
    expect(reopenedD1DataSet.destroyed).toBe(true)
    await catalogTable.findAll('.el-table__body .el-table__row')[1]!.trigger('click'); await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '打开数据维护')!.trigger('click'); await flushPromises()
    const dataPageD2 = wrapper.findComponent(DictionaryData)
    expect(sets.at(-1)).not.toBe(dataSetD1)
    expect(dataPageD2.text()).toContain('当前方案：双目标（D2）')
    expect(dataPageD2.findComponent(RendererTable).text()).toContain('黑')
    expect(router.currentRoute.value.path).toBe('/t/ENT/PROJ/catalog')
    expect(router.currentRoute.value.query).toEqual({retain: 'yes'})
    expect(dictionaryHttp.records['_Base_DictData']![0]).toMatchObject({rowid: 'C', ordIdx: 3})
    expect(dictionaryHttp.records['_Base_DictData']!.find(row => row['rowid'] === 'E2')?.['exVal_4']).toBe('D2原值')
  })
})
