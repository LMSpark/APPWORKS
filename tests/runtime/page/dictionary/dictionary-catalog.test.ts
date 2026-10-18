import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet, SparkData, DataViewFilterCodec} from '@spark-appworks/spark-data'
import {DataViewFilterLocal} from '../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererTable, RendererFilter} from '@spark-appworks/spark-component'
import DictionaryCatalog from '@/views/features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue'
import {buildOptionSourceFromView} from '../../../../packages/spark-component/src/components/fields/options/option-source'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {defineComponent, h} from 'vue'
import {RouterView} from 'vue-router'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: CatalogHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))
const models = Object.entries({
  _Base_DictType: ['rowid', 'AppId', 'TypeName', 'functiondesc', 'StructureTypeID', 'createuser', 'crttime'],
  Base_StructureType: ['rowid', 'Mrowid', 'Name'],
  Base_UserInfo: ['ID', 'ROWID', 'UserName'],
}).map(([name, fields]) => ({
  id: `${name}-model`, name, metaName: name, sourceType: 'table', sourceId: 'DB', sourceName: name,
  primaryKey: name === 'Base_UserInfo' ? 'ID' : 'rowid', businessMain: false, raw: {},
  fields: fields.map((field, order) => ({id: field, modelId: `${name}-model`, name: field, canonicalName: field,
    primaryKey: field === (name === 'Base_UserInfo' ? 'ID' : 'rowid'), description: field, type: 'string',
    output: true, computed: false, order, orderType: '', raw: {}})),
})) satisfies Array<Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>

class CatalogHttp extends HttpClientBase {
  requests: RequestConfig[] = []
  allowAdd = true
  failUsers = false
  hideUserName = false
  maskUserName = false
  hideUserValue = false
  hideStructureName = false
  unresolvedCreator = false
  userRows = [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}]
  pauseNextUsers?: () => Promise<void>
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const body = config.data as {Table: Array<{Name: string; Filter?: unknown}>}
    const name = body.Table[0]!.Name
    if (name === 'Base_UserInfo' && this.pauseNextUsers) {
      const pause = this.pauseNextUsers; delete this.pauseNextUsers; await pause()
    }
    if (name === 'Base_UserInfo' && this.failUsers) throw new Error('用户目录读取失败')
    let rows: Record<string, unknown>[] = name === '_Base_DictType' ? [{rowid: 'D1', AppId: 'APP', TypeName: '配色', createuser: this.unresolvedCreator ? 'OLD-ID' : 'U-ROW', StructureTypeID: 'S1'}]
      : name === 'Base_UserInfo' ? this.userRows
      : [{rowid: 'S1', Mrowid: '000000', Name: '基础'}]
    if (name === 'Base_UserInfo' && body.Table[0]?.Filter) {
      const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(body.Table[0].Filter))
      rows = rows.filter(row => filter.matches(row))
    }
    return {data: {Code: 200, Result: {primaryKeyField: name === 'Base_UserInfo' ? 'ID' : 'rowid', allowAdd: this.allowAdd,
      lingma_sys_key: 'table-key', data: {Items: rows.map(row => ({...row, lingma_sys_key: 'row-key',
        lingma_sys_params: {r: [], e: [], h: name === 'Base_UserInfo'
          ? [...(this.hideUserName ? ['UserName'] : []), ...(this.hideUserValue ? ['ROWID'] : [])]
          : name === 'Base_StructureType' && this.hideStructureName ? ['Name'] : [],
          m: name === 'Base_UserInfo' && this.maskUserName ? ['UserName'] : [], d: false}})), Count: rows.length}}},
      status: 200, statusText: 'OK', headers: {}}
  }
}
const sets: DataSet[] = []
const wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new CatalogHttp()
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: 'CATALOG', name: '字典目录', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(models.find(m => m.metaName === metaName)))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
})
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); sets.splice(0).forEach(ds => ds.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals(); config.global.stubs = originalStubs})

async function openCatalog() {
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: DictionaryCatalog, componentMap: {'/catalog': DictionaryCatalog},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'catalog', title: '字典目录', path: '/catalog', itemKind: 'system-page', blueprintScenarioId: 'CATALOG'},
    ]})})
  await dynamic.registerRoutes()
  await router.push('/catalog'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('dictionary catalog formal view assembly', () => {
  it('consumes the catalog add permission while retaining browsing and refresh', async () => {
    http.allowAdd = false
    const wrapper = await openCatalog()
    const add = wrapper.findAll('button').find(button => button.text() === '新增字典')!
    expect(add.attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent(RendererTable).text()).toContain('配色')
    expect(wrapper.findAll('button').find(button => button.text() === '刷新')!.attributes('disabled')).toBeUndefined()
    await add.trigger('click'); await flushPromises()
    expect(wrapper.text()).not.toContain('正在读取字典设计')
    expect(wrapper.text()).not.toContain('保存设计')
  })
  it('keeps standard toolbar actions bound and sorts through the catalog view with its application filter', async () => {
    const wrapper = await openCatalog()
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
    expect(JSON.stringify(http.requests[0]!.data)).toContain('"Value":"APP"')
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
  it('binds auxiliary labels by their formal reference field without changing dictionary IDs', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    expect(ds.getView('Base_UserInfo', 'default')?.valueField).toBe('ROWID')
    expect(ds.getView('Base_UserInfo', 'default')?.primaryKey).toBe('ID')
    expect(ds.getView('Base_UserInfo', 'default')?.rows[0]?.['UserName']).toBe('张三')
    expect(ds.getView('Base_StructureType', 'default')?.treeConfig).toMatchObject({idField: 'rowid', parentIdField: 'Mrowid', textField: 'Name'})
    expect(ds.getView('_Base_DictType', 'default')?.rows[0]).toMatchObject({createuser: 'U-ROW', StructureTypeID: 'S1'})
  })
  it('keeps the application constraint when user filters are changed, cleared, sorted and paged', async () => {
    const ds = await LowcodeDictionary.loadCatalog('CATALOG'); sets.push(ds)
    const view = ds.getView('_Base_DictType', 'default')!
    http.requests.length = 0
    await view.executeFilter({field: 'TypeName', operator: 'contains', value: '配'})
    await view.setSort([{field: 'TypeName', direction: 'desc'}])
    await view.setPage(2)
    await view.executeFilter(undefined)
    expect(http.requests).toHaveLength(4)
    for (const request of http.requests) {
      const body = request.data as {Table: Array<{Filter: unknown}>}
      const text = JSON.stringify(body.Table[0]?.Filter)
      expect(text).toContain('"Field":"AppId"')
      expect(text).toContain('"Value":"APP"')
    }
    expect(view.filterExpression).toBeUndefined()
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
    expect(DataViewFilterCodec.decode(request.Table[0]!.Filter).toJSON()).toMatchObject({logic: 'and', filters: [
      {field: 'AppId', value: 'APP'}, {field: 'createuser', operator: 'in', value: ['U-ROW', 'U-ROW2']},
    ]})
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
    expect(filter.matches({AppId:'OTHER',createuser:'U-ROW',TypeName:'特定字典'})).toBe(false)
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
      expect(JSON.stringify(request.data)).toContain('APP')
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
    const wrapper = await openCatalog()
    const table = wrapper.findComponent(RendererTable)
    expect(table.find('.el-table__body').text()).toContain('张三')
    expect(table.find('.el-table__body').text()).toContain('基础')
    const filter = table.findComponent(RendererFilter)
    expect(filter.exists()).toBe(true)
    http.requests.length = 0
    await filter.findAll('.el-form-item').find(item => item.find('label').text() === '字典名称')!.get('input').setValue('配色')
    await flushPromises()
    expect(JSON.stringify(http.requests.at(-1)?.data)).toContain('配色')
    expect(JSON.stringify(http.requests.at(-1)?.data)).toContain('APP')
    const reset = filter.findAll('button').find(button => button.text().includes('重置'))!
    await reset.trigger('click'); await flushPromises()
    expect(JSON.stringify(http.requests.at(-1)?.data)).toContain('APP')
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
})
