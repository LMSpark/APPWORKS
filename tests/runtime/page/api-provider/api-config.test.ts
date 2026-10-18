import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererForm, RendererTable} from '@spark-appworks/spark-component'
import {DataViewFilterCodec, SparkData, type DataSet} from '@spark-appworks/spark-data'
import {DataViewFilterLocal} from '../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import JsonTreeEditor from '../../../../packages/spark-component/src/components/editors/JsonTreeEditor.vue'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeApiProvider} from '@/lowcode/resources/external-api/lowcode-api-provider'
import {ApiPublicParameterDesign} from '../../../../packages/spark-lowcode-api/src/platform/resources/external-api/api-public-parameter-design'
import {ApiRequestHeaderDesign} from '../../../../packages/spark-lowcode-api/src/platform/resources/external-api/api-request-header-design'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import ApiConfigPage from '@/views/features/integration/api-management/ui/api-config-page.vue'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModelBatch: vi.fn(), readRequestScope: vi.fn()}))
let http: ConfigHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}}}))
type Row = Record<string, unknown>
const fields: Record<string, string[]> = {
  Base_InterfaceProvider: ['rowid', 'Name', 'BaseURL', 'TokenPrefix', 'CredentialsPassword', 'TokenField'],
  Base_InterfaceProvider_Headers: ['rowid', 'proId', 'paramName', 'paramValue', 'type'],
  Base_Interface_PublicParam: ['rowid', 'providerId', 'paramName', 'desc', 'interfaceId', 'outputfield', 'interfaceName', 'accessPath'],
  Base_DataServiceInterface: ['rowid', 'ProviderID', 'Name', 'LinkUrl', 'Password'],
  Base_TblField: ['rowid', 'tblid', 'enname', 'cnname'],
}
const models = Object.entries(fields).map(([name, names]) => ({id: `${name}-model`, name, metaName: name,
  sourceType: 'table', sourceId: 'DB', sourceName: name, primaryKey: 'rowid', businessMain: false, raw: {},
  fields: names.map((field, order) => ({id: field, modelId: `${name}-model`, name: field, canonicalName: field,
    primaryKey: field === 'rowid', description: field, type: 'string', output: true, computed: false, order, orderType: '', raw: {}})),
})) satisfies Array<Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>
class ConfigHttp extends HttpClientBase {
  records: Record<string, Row[]> = {
    Base_InterfaceProvider: [{rowid: 'P1', Name: '服务甲', BaseURL: '/api'}, {rowid: 'P2', Name: '服务乙'}],
    Base_InterfaceProvider_Headers: [{rowid: 'H1', proId: 'P1', paramName: 'Authorization', paramValue: '{"Type":"GetApiPublicParam","ParamName":"access_token"}', type: 'auth'},
      {rowid: 'H2', proId: 'P2', paramName: 'Private', paramValue: 'old literal', type: 'custom'}],
    Base_Interface_PublicParam: [{rowid: 'Q1', providerId: 'P1', paramName: 'access_token', desc: '令牌', interfaceId: 'I1', outputfield: 'token'},
      {rowid: 'Q2', providerId: 'P2', paramName: 'other', interfaceId: 'I3', outputfield: 'private'}],
    Base_DataServiceInterface: [{rowid: 'I1', ProviderID: 'P1', Name: '登录', LinkUrl: '/login'},
      {rowid: 'I2', ProviderID: 'P1', Name: '刷新', LinkUrl: '/refresh'}, {rowid: 'I3', ProviderID: 'P2', Name: '其他服务', LinkUrl: '/private'}],
    Base_TblField: [{rowid: 'F1', tblid: 'I1', enname: 'token', cnname: '令牌'},
      {rowid: 'F2', tblid: 'I2', enname: 'renewed', cnname: '新令牌'}, {rowid: 'F3', tblid: 'I3', enname: 'private', cnname: '其他字段'}],
  }
  reads: RequestConfig[] = []
  saves: RequestConfig[] = []
  denied: string[] = []
  failAfterWrite = false
  allowAdd = true
  allowDelete = false
  ignoreScope = false
  allowedTables = ['Base_Interface_PublicParam']
  afterRead?: (request: RequestConfig) => Promise<void>
  protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
    let result: unknown
    if (request.url === '/api/DataOperation/GetData') {
      this.reads.push(request)
      const table = (request.data as {Table: Array<{Name: string; Filter?: unknown; Fields: Array<{Name: string}>}>}).Table[0]!
      let rows = this.records[table.Name] ?? []
      if (table.Filter && !this.ignoreScope) {
        const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(table.Filter)); rows = rows.filter(row => filter.matches(row))
      }
      result = {primaryKeyField: 'rowid', allowAdd: this.allowAdd, lingma_sys_key: 'table-key', data: {
        Items: rows.map(row => ({...Object.fromEntries(table.Fields.map(f => [f.Name, row[f.Name]])),
          lingma_sys_key: 'row-key', lingma_sys_params: {r: [], e: (fields[table.Name] ?? []).filter(f => !this.denied.includes(f)), h: [], m: [], d: this.allowDelete}})), Count: rows.length}}
      await this.afterRead?.(request)
    } else if (request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      this.saves.push(request)
      const added: Record<string, Row[]>[] = [], changed: Record<string, Row[]>[] = [], deleted: Record<string, Row[]>[] = []
      for (const group of request.data as Array<{TableName: string; CrudModel: {Added: Row[]; Changed: Row[]; Deleted: Row[]}}>) {
        expect(this.allowedTables).toContain(group.TableName)
        if (!this.allowDelete) expect(group.CrudModel.Deleted).toHaveLength(0)
        if (group.CrudModel.Deleted.length) {
          expect(group.TableName).toBe('Base_InterfaceProvider_Headers')
          const ids = group.CrudModel.Deleted.map(row => row['rowid'])
          this.records[group.TableName] = this.records[group.TableName]!.filter(row => !ids.includes(row['rowid']))
          deleted.push({[group.TableName]: group.CrudModel.Deleted.map(row => ({rowid: row['rowid']}))})
        }
        for (const [kind, output] of [['Added', added], ['Changed', changed]] as const) {
          const saved = group.CrudModel[kind].map(raw => {const row = {...raw}; delete row['lingma_sys_key']; delete row['lingma_sys_params'];
            if (kind === 'Added') this.records[group.TableName]!.push(row)
            else Object.assign(this.records[group.TableName]!.find(item => item['rowid'] === row['rowid'])!, row)
            return row})
          if (saved.length) output.push({[group.TableName]: saved})
        }
      }
      if (this.failAfterWrite) throw new Error('回执中断')
      result = {maplistadd: added, maplistedit: changed, maplistdelete: deleted}
    } else throw new Error(`Unexpected ${request.url}`)
    return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
  }
}
const sets: DataSet[] = [], wrappers: VueWrapper[] = []
const originalStubs = {...config.global.stubs}
beforeEach(() => {
  http = new ConfigHttp(); runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockImplementation(({dataSpaceId}: {dataSpaceId: string}) => Promise.resolve({dataSpaceId, name: '配置', raw: {}}))
  service.readModelBatch.mockResolvedValue(models)
  vi.spyOn(LowcodeDictionary, 'loadEditor').mockImplementation(async () => {
    const dataSet = SparkData.fromJson({scenarioId: LowcodeDictionary.editorScenarioId, dataSetName: 'Dictionary', tables: {
      _Base_DictType: {resourceType: 'static-data', columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'TypeName', type: 'string'}],
        views: {default: {rows: [{rowid: 'types', TypeName: '接口公共头部信息使用类型'}]}}},
      _Base_DictData: {resourceType: 'static-data', columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'typeid', type: 'string'}, {name: 'val', type: 'string'}, {name: 'txt', type: 'string'}],
        views: {default: {valueField: 'val', labelField: 'txt', rows: [{rowid: 'T1', typeid: 'types', val: 'all', txt: '所有接口'}, {rowid: 'T2', typeid: 'types', val: 'auth', txt: '需要认证'}]}}},
    }})
    sets.push(dataSet); return {dataSet, applicationId: 'APP'}
  })
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); sets.splice(0).forEach(ds => ds.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals(); config.global.stubs = originalStubs})
async function open(id = 'P1') {
  const dataSet = await LowcodeApiProvider.loadConfiguration(); sets.push(dataSet)
  const owner = new ApiPublicParameterDesign({dataSet, providerId: id}); await owner.load()
  owner.parameters.setCurrentRowById('Q1')
  return {dataSet, owner}
}
async function page() {
  const component = defineComponent({setup: () => () => h(ApiConfigPage, {providerId: 'P1'})})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: component, componentMap: {'/config': component},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'config', title: '配置', path: '/config', itemKind: 'system-page', blueprintScenarioId: LowcodeApiProvider.configurationScenarioId},
    ]})})
  await dynamic.registerRoutes(); await router.push('/config'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()], stubs: {JsonTreeEditor: true}}})
  wrappers.push(wrapper); await flushPromises(); return wrapper
}
function button(w: VueWrapper, label: string) {return w.findAll('button').find(b => b.text() === label)!}
function item(w: VueWrapper, label: string) {return w.findComponent(RendererForm).findAll('.el-form-item').find(f => f.find('label').text() === label)!}

async function headers() {
  const dataSet = await LowcodeApiProvider.loadConfiguration(); sets.push(dataSet)
  const types = await LowcodeApiProvider.loadHeaderTypes()
  const owner = new ApiRequestHeaderDesign({dataSet, providerId: 'P1', headerTypes: types.getView('_Base_DictData')!})
  await owner.load(); owner.headers.setCurrentRowById('H1')
  http.allowedTables = ['Base_InterfaceProvider_Headers', 'Base_InterfaceProvider']
  return {owner, dataSet}
}

describe('API request header scheme', () => {
  it('cancels staged deletions and checks current delete permission before saving one provider', async () => {
    const {owner} = await headers()
    await expect(owner.removeHeader()).rejects.toThrow('删除')
    http.allowDelete = true; await owner.load(); owner.headers.setCurrentRowById('H1')
    await owner.removeHeader(); expect(owner.headers.dirtyTracking.pendingDeleteIds.has('H1')).toBe(true)
    owner.discard(); expect(owner.headers.rows.map(row => row['rowid'])).toEqual(['H1'])
    owner.headers.setCurrentRowById('H1'); await owner.removeHeader(); await owner.saveHeaders()
    expect(http.records['Base_InterfaceProvider_Headers']!.map(row => row['rowid'])).toEqual(['H2'])
    expect((await headers()).owner.headers.rows).toHaveLength(0)
    expect(http.saves).toHaveLength(1)
  })
  it('rejects changes during reference validation and invalid new function definitions', async () => {
    const {owner} = await headers()
    owner.headers.updateEditingValue('H1', 'paramValue', '{"Type":"unknown"}')
    await expect(owner.saveHeaders()).rejects.toThrow('值函数')
    owner.headers.updateEditingValue('H1', 'paramValue', '{"Type":"GetConstValue"}')
    await expect(owner.saveHeaders()).rejects.toThrow('Value')
    owner.headers.updateEditingValue('H1', 'paramValue', '{"Type":"GetConstValue","Value":"first"}')
    let release!: () => void
    const waiting = new Promise<void>(resolve => {release = resolve})
    http.afterRead = async () => {delete http.afterRead; await waiting}
    const saving = owner.saveHeaders(); await flushPromises()
    owner.headers.updateEditingValue('H1', 'paramValue', 'later literal')
    release(); await expect(saving).rejects.toThrow('变化')
    expect(http.saves).toHaveLength(0)
    expect(owner.requiresVerification).toBe(false)
  })
  it('scopes header and parameter candidates and keeps prefix and header saves independent', async () => {
    const {owner} = await headers()
    expect(owner.headers.rows.map(r => r['rowid'])).toEqual(['H1'])
    expect(owner.references.rows.map(r => r['paramName'])).toEqual(['access_token'])
    owner.provider.updateEditingValue('P1', 'TokenPrefix', 'Bearer ')
    owner.headers.updateEditingValue('H1', 'paramName', 'X-Authorization')
    await owner.saveHeaders()
    expect(http.records['Base_InterfaceProvider_Headers']![0]?.['paramName']).toBe('X-Authorization')
    expect(http.records['Base_InterfaceProvider']![0]?.['TokenPrefix']).toBeUndefined()
    expect(owner.provider.getEditingRow('P1')?.['TokenPrefix']).toBe('Bearer ')
    await owner.savePrefix()
    expect(http.records['Base_InterfaceProvider']![0]?.['TokenPrefix']).toBe('Bearer ')
    expect((await headers()).owner.provider.rows[0]?.['TokenPrefix']).toBe('Bearer ')
  })
  it('creates serialized value functions, validates saved parameter references and retains other drafts', async () => {
    const {owner, dataSet} = await headers()
    await owner.addHeader(); const id = owner.headers.getPkKey(owner.headers.currentRow!)!
    for (const [field, value] of Object.entries({paramName: 'X-New', type: 'all', paramValue: '{"Type":"GetApiPublicParam","ParamName":"other"}'})) owner.headers.updateEditingValue(id, field, value)
    await expect(owner.saveHeaders()).rejects.toThrow('参数'); expect(http.saves).toHaveLength(0)
    owner.headers.updateEditingValue(id, 'paramValue', '{"Type":"GetConstValue","Value":{"X-A":"a","X-B":"b"}}')
    const params = dataSet.getView('Base_Interface_PublicParam')!; params.configure({queryConfig: {fields: fields['Base_Interface_PublicParam']!}}); await params.loadFromServer()
    params.updateEditingValue('Q1', 'desc', '另一区未保存')
    await owner.saveHeaders()
    expect(params.hasEditingChanges()).toBe(true)
    expect(http.records['Base_InterfaceProvider_Headers']!.find(r => r['paramName'] === 'X-New')?.['paramValue']).toContain('X-B')
    expect(JSON.stringify(http.saves)).not.toContain('另一区未保存')
  })
  it('preserves legacy untouched values and blocks invalid new types, scope and denied fields', async () => {
    http.records['Base_InterfaceProvider_Headers']![0]!['paramValue'] = 'old literal'
    http.records['Base_InterfaceProvider_Headers']![0]!['type'] = 'legacy'
    const {owner} = await headers()
    owner.headers.updateEditingValue('H1', 'paramName', 'X-Legacy'); await owner.saveHeaders()
    expect(http.records['Base_InterfaceProvider_Headers']![0]?.['paramValue']).toBe('old literal')
    owner.headers.updateEditingValue('H1', 'type', 'missing'); await expect(owner.saveHeaders()).rejects.toThrow('类型'); owner.discard()
    owner.headers.updateEditingValue('H1', 'proId', 'P2'); await expect(owner.saveHeaders()).rejects.toThrow('归属'); owner.discard()
    http.denied = ['TokenPrefix']; await owner.load()
    owner.provider.updateEditingValue('P1', 'TokenPrefix', 'denied'); await expect(owner.savePrefix()).rejects.toThrow()
    expect(http.saves).toHaveLength(1)
  })
  it('blocks replay after unknown header persistence and rereads explicitly', async () => {
    const {owner} = await headers(); owner.headers.updateEditingValue('H1', 'paramName', 'X-Saved')
    http.failAfterWrite = true; await expect(owner.saveHeaders()).rejects.toThrow()
    await expect(owner.saveHeaders()).rejects.toThrow('核验'); expect(http.saves).toHaveLength(1)
    await owner.load(true); expect(owner.pending).toBe(false); expect(owner.headers.rows[0]?.['paramName']).toBe('X-Saved')
  })
})

describe('API public parameter design and native value cascades', () => {
  it('writes the standard function editor and dictionary selection to headers without saving the prefix draft', async () => {
    http.allowedTables = ['Base_InterfaceProvider_Headers', 'Base_InterfaceProvider']
    const w = await page()
    await w.findAll('[role="tab"]').find(t => t.text() === '公共请求头')!.trigger('click'); await flushPromises()
    await button(w, '新增公共头部').trigger('click'); await flushPromises()
    const field = (label: string) => w.findAll('.el-form-item').find(f => f.find('.el-form-item__label').exists() && f.find('.el-form-item__label').text() === label)!
    await field('头部名称').get('input').setValue('X-Page')
    await field('使用范围').get('.el-select__wrapper').trigger('click'); await flushPromises()
    await new DOMWrapper(Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent === '所有接口')!).trigger('click')
    await field('值函数').get('[data-function-open]').trigger('click'); await flushPromises()
    const dialog = new DOMWrapper(document.body)
    w.getComponent(JsonTreeEditor).vm.$emit('update:documentValue', {value: 'page value'}); await flushPromises()
    await dialog.get('[data-function-confirm]').trigger('click'); await flushPromises()
    await field('令牌前缀').get('input').setValue('Bearer ')
    await button(w, '保存公共请求头').trigger('click'); await flushPromises()
    expect(http.records['Base_InterfaceProvider_Headers']!.find(r => r['paramName'] === 'X-Page')).toMatchObject({type: 'all', paramValue: '{"Type":"GetConstValue","Value":"page value"}'})
    expect(http.records['Base_InterfaceProvider']![0]?.['TokenPrefix']).toBeUndefined()
    await button(w, '放弃修改并关闭').trigger('click'); await flushPromises()
    expect(w.findComponent(ApiConfigPage).emitted('close')).toHaveLength(1)
    expect((await headers()).owner.headers.rows.find(r => r['paramName'] === 'X-Page')?.['paramValue']).toContain('page value')
    expect(http.saves).toHaveLength(1)
  })
  it('offers separate header and token-prefix design without mixing account data', async () => {
    const w = await page()
    expect(w.text()).toContain('公共请求头')
    await w.findAll('[role="tab"]').find(t => t.text() === '公共请求头')!.trigger('click'); await flushPromises()
    expect(w.text()).toContain('令牌前缀')
    expect(w.text()).not.toContain('认证账号')
  })
  it('loads only this provider configuration without accounts, credentials or external calls', async () => {
    const {owner} = await open()
    expect(owner.parameters.rows.map(r => r['rowid'])).toEqual(['Q1'])
    expect(JSON.stringify(http.reads)).not.toMatch(/Password|Account|callApi/)
  })
  it('queries options by provider and interface values; keeps an invalid saved value until explicitly repaired', async () => {
    const {dataSet, owner} = await open()
    const address = {tableName: owner.parameters.tableName, viewId: owner.parameters.viewId, field: 'outputfield'}
    expect(await dataSet.refreshFieldCascade({...address, field: 'interfaceId'})).toMatchObject({status: 'ready', options: [{rowid: 'I1'}, {rowid: 'I2'}]})
    expect(await dataSet.refreshFieldCascade(address)).toMatchObject({valueStatus: 'valid', options: [{enname: 'token'}]})
    owner.parameters.updateEditingValue('Q1', 'interfaceId', 'I2'); await flushPromises()
    expect(dataSet.getFieldCascadeState(address)).toMatchObject({status: 'ready', valueStatus: 'invalid', options: [{enname: 'renewed'}]})
    expect(owner.parameters.getEditingRow('Q1')?.['outputfield']).toBe('token')
    await expect(owner.save()).rejects.toThrow('输出字段'); expect(http.saves).toHaveLength(0)
    owner.parameters.updateEditingValue('Q1', 'outputfield', 'renewed'); await owner.save()
    expect(http.records['Base_Interface_PublicParam']![0]).toMatchObject({interfaceId: 'I2', outputfield: 'renewed', interfaceName: '刷新', accessPath: '/refresh'})
    expect((await open()).owner.parameters.rows[0]).toMatchObject({interfaceId: 'I2', outputfield: 'renewed'})
    expect(JSON.stringify(http.saves)).not.toContain('F2')
  })
  it('adds a definition with fixed provider identity and refuses duplicate names', async () => {
    const {owner} = await open(); await owner.add()
    const id = owner.parameters.getPkKey(owner.parameters.currentRow!)!
    for (const [key, value] of Object.entries({paramName: 'access_token', interfaceId: 'I1', outputfield: 'token'})) owner.parameters.updateEditingValue(id, key, value)
    await expect(owner.save()).rejects.toThrow('重复'); expect(http.saves).toHaveLength(0)
    owner.parameters.updateEditingValue(id, 'paramName', 'access_token_expire'); await owner.save()
    expect(http.records['Base_Interface_PublicParam']!.find(r => r['paramName'] === 'access_token_expire')).toMatchObject({providerId: 'P1', interfaceId: 'I1', outputfield: 'token'})
  })
  it('rejects cross-provider references, unauthorized fields and renamed referenced names', async () => {
    const {owner} = await open(); owner.parameters.updateEditingValue('Q1', 'interfaceId', 'I3')
    await expect(owner.save()).rejects.toThrow('接口'); owner.discard()
    owner.parameters.updateEditingValue('Q1', 'paramName', 'renamed')
    await expect(owner.save()).rejects.toThrow('重命名'); owner.discard()
    http.denied = ['desc']; await owner.load(); owner.parameters.updateEditingValue('Q1', 'desc', '禁止')
    await expect(owner.save()).rejects.toThrow(); expect(http.saves).toHaveLength(0)
  })
  it('refuses an out-of-scope result and preserves absent identities as errors', async () => {
    http.ignoreScope = true; await expect(open()).rejects.toThrow('范围')
    http.ignoreScope = false; await expect(open('missing')).rejects.toThrow('服务商')
    expect(http.saves).toHaveLength(0)
  })
  it('does not submit a later unvalidated field edit while reference validation is in flight', async () => {
    const {owner} = await open()
    owner.parameters.updateEditingValue('Q1', 'interfaceId', 'I2')
    owner.parameters.updateEditingValue('Q1', 'outputfield', 'renewed')
    await flushPromises()
    let release!: () => void
    const waiting = new Promise<void>(resolve => {release = resolve})
    http.afterRead = async () => {delete http.afterRead; await waiting}
    const saving = owner.save()
    await flushPromises()
    owner.parameters.updateEditingValue('Q1', 'outputfield', 'not-declared')
    release()
    await expect(saving).rejects.toThrow('变化')
    expect(http.saves).toHaveLength(0)
    expect(owner.parameters.getEditingRow('Q1')?.['outputfield']).toBe('not-declared')
    expect(owner.requiresVerification).toBe(false)
  })
  it('uses current create and application permissions without an admin bypass', async () => {
    http.allowAdd = false
    const {owner} = await open()
    await expect(owner.add()).rejects.toThrow('新增')
    owner.parameters.updateEditingValue('Q1', 'desc', '跨应用修改')
    service.readRequestScope.mockReturnValue({token: 'changed', headers: {'X-AppId': 'OTHER'}})
    await expect(owner.save()).rejects.toThrow()
    expect(http.saves).toHaveLength(0)
  })
  it('isolates parameter saves from other view drafts and blocks replay after an unknown receipt', async () => {
    const {owner, dataSet} = await open()
    const other = dataSet.getView('Base_DataServiceInterface', 'default')!
    other.configure({queryContext: {providerId: 'P1'}}); await other.loadFromServer()
    other.updateEditingValue('I1', 'Name', '不应提交')
    owner.parameters.updateEditingValue('Q1', 'desc', '新的描述'); http.failAfterWrite = true
    await expect(owner.save()).rejects.toThrow(); expect(owner.requiresVerification).toBe(true)
    await expect(owner.save()).rejects.toThrow('核验'); expect(http.saves).toHaveLength(1)
    expect(JSON.stringify(http.saves)).not.toContain('不应提交')
    await owner.load(true); expect(owner.pending).toBe(false)
    expect(other.getEditingRow('I1')?.['Name']).toBe('不应提交')
    expect(owner.parameters.rows[0]?.['desc']).toBe('新的描述')
  })
  it('renders standard bound components and saves/cancels through the native owner', async () => {
    const w = await page(); await w.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click'); await flushPromises()
    await item(w, '参数描述').get('input').setValue('页面描述')
    await button(w, '保存公共参数方案').trigger('click'); await flushPromises()
    expect(http.records['Base_Interface_PublicParam']![0]?.['desc']).toBe('页面描述')
    await w.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click'); await flushPromises()
    await item(w, '参数描述').get('input').setValue('取消描述'); await button(w, '放弃修改并关闭').trigger('click'); await flushPromises()
    expect(w.findComponent(ApiConfigPage).emitted('close')).toHaveLength(1); expect(http.saves).toHaveLength(1)
    expect(w.text()).not.toContain('认证账号')
  })
  it('writes actual select choices into a new draft and queries the dependent output options', async () => {
    const w = await page()
    await button(w, '新增公共参数').trigger('click'); await flushPromises()
    await item(w, '参数名称').get('input').setValue('new_param')
    await item(w, '取值接口').get('.el-select__wrapper').trigger('click'); await flushPromises()
    const interfaceOption = Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent === '刷新')!
    expect(interfaceOption).toBeDefined()
    await new DOMWrapper(interfaceOption).trigger('click'); await flushPromises()
    expect(item(w, '取值接口').text()).toContain('刷新')
    await item(w, '输出字段').get('.el-select__wrapper').trigger('click'); await flushPromises()
    const outputOption = Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent === '新令牌')!
    expect(outputOption).toBeDefined()
    await new DOMWrapper(outputOption).trigger('click'); await flushPromises()
    await button(w, '保存公共参数方案').trigger('click'); await flushPromises()
    expect(http.records['Base_Interface_PublicParam']!.find(r => r['paramName'] === 'new_param')).toMatchObject({interfaceId: 'I2', outputfield: 'renewed'})
  })
})
