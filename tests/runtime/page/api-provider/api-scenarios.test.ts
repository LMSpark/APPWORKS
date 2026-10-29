import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import type {DataView} from '@spark-appworks/spark-data'
import {createApiService, seed, NAV, CONFIG, API, pagedata} from './api-provider.fixture'

const api = vi.hoisted(() => ({current: undefined as unknown as ReturnType<typeof import('./api-provider.fixture')['createApiService']>}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return api.current.state.http},
  lowcodeApi: {readRequestScope: (...args: unknown[]) => api.current.service.readRequestScope(...args),
    dataSpace: {get design() {return api.current.service}, get runtime() {return api.current.state.runtime}}},
  createLowcodeProjectGateways: () => ({scenarioViews: {readScope: () => 'scope', readText: async (id: string) => pagedata[id] ?? null,
    writeText: async () => {throw new Error('pages must not write scenario files')}}}),
  lowcodeDesignFileUpload: async () => {throw new Error('unexpected design file upload')},
}))
const {loadLowcodeRuntimeScenario} = await import('@/lowcode/data-space/lowcode-data-space-runtime')

api.current = createApiService()
const runtimes: PageRuntime[] = []
beforeEach(() => api.current.reset(seed))
afterEach(() => {runtimes.splice(0).forEach(runtime => runtime.dispose()); vi.restoreAllMocks()})

async function open(scenarioId: string, providerId?: string) {
  const runtime = new PageRuntime({pageId: 'api-test', scenarioIds: [scenarioId],
    ...(providerId ? {scenarioInputs: {[scenarioId]: {providerId}}} : {}),
    loadScenario: id => loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: id})})
  runtimes.push(runtime)
  await runtime.load()
  const dataSet = runtime.getDataSet(scenarioId)!
  dataSet.triggerAutoLoad()
  await vi.waitFor(() => {
    for (const table of Object.values(dataSet.tables)) for (const view of table.viewList) if (view.autoLoad) expect(view.requestState).not.toBe(1)
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  return dataSet
}
const byId = (view: DataView, id: string) => view.rows.find(row => view.getPkKey(row) === id)!
const http = () => api.current.state.http
const views = (tableName: string, viewId = 'default') => [{tableName, viewId}]

describe('provider catalog scenario', () => {
  it('loads the catalog, follows the selection into definition and edits only the selected provider', async () => {
    const ds = await open(NAV)
    const catalog = ds.getView('Base_InterfaceProvider')!, definition = ds.getView('Base_InterfaceProvider', 'definition')!
    expect(catalog.rows.map(row => row['rowid'])).toEqual(['P1', 'P2'])
    expect(definition.rows).toEqual([])
    catalog.setSelectedRows([byId(catalog, 'P2')!])
    await vi.waitFor(() => expect(definition.rows.map(row => row['rowid'])).toEqual(['P2']))
    expect(definition.currentRow?.['rowid']).toBe('P2')
    definition.updateEditingValue('P2', 'Name', '  服务丙  ')
    expect((await ds.saveChanges({views: views('Base_InterfaceProvider', 'definition')})).success).toBe(true)
    expect(http().records['Base_InterfaceProvider']!.find(row => row['rowid'] === 'P2')?.['Name']).toBe('服务丙')
    expect(definition.deleteActionState(byId(definition, 'P2'))).toBe('disabled')
  })

  it('creates a provider from the empty create result and rejects blank required fields', async () => {
    const ds = await open(NAV)
    const create = ds.getView('Base_InterfaceProvider', 'create')!
    await create.discardAndReload()
    expect(create.rows).toEqual([])
    const row = await create.addRow({})
    const id = create.getPkKey(row)!
    expect(id).not.toBe('')
    await expect(ds.saveChanges({views: views('Base_InterfaceProvider', 'create')})).rejects.toThrow('DATA_VIEW_SAVE_VALIDATION')
    create.updateEditingValue(id, 'Name', '新服务'); create.updateEditingValue(id, 'BaseURL', 'https://new.test')
    expect((await ds.saveChanges({views: views('Base_InterfaceProvider', 'create')})).success).toBe(true)
    expect(http().records['Base_InterfaceProvider']!.some(item => item['Name'] === '新服务' && item['rowid'] === id)).toBe(true)
  })
})

describe('request settings scenario', () => {
  it('scopes every view to the provider input and fills ownership on new rows', async () => {
    const ds = await open(CONFIG, 'P1')
    expect(ds.getView('Base_InterfaceProvider_Headers')!.rows.map(row => row['rowid'])).toEqual(['H1'])
    expect(ds.getView('Base_Interface_PublicParam')!.rows.map(row => row['rowid'])).toEqual(['Q1'])
    expect(ds.getView('Base_InterfaceProvider', 'authentication')!.rows.map(row => row['rowid'])).toEqual(['P1'])
    const headers = ds.getView('Base_InterfaceProvider_Headers')!
    const row = await headers.addRow({})
    expect(row).toMatchObject({proId: 'P1'})
  })

  it('enforces header rules and saves the token prefix verbatim and separately', async () => {
    const ds = await open(CONFIG, 'P1')
    const headers = ds.getView('Base_InterfaceProvider_Headers')!
    headers.updateEditingValue('H1', 'type', 'unknown')
    await expect(ds.saveChanges({views: views('Base_InterfaceProvider_Headers')})).rejects.toThrow('Base_InterfaceProvider_Headers@default.type')
    headers.updateEditingValue('H1', 'type', 'all')
    headers.updateEditingValue('H1', 'paramValue', JSON.stringify({Type: 'GetApiPublicParam', ParamName: 'missing'}))
    await expect(ds.saveChanges({views: views('Base_InterfaceProvider_Headers')})).rejects.toThrow('Base_InterfaceProvider_Headers@default.paramValue')
    headers.updateEditingValue('H1', 'paramValue', JSON.stringify({Type: 'GetApiPublicParam', ParamName: 'access_token'}))
    const prefix = ds.getView('Base_InterfaceProvider', 'authentication')!
    prefix.updateEditingValue('P1', 'TokenPrefix', ' Token ')
    expect((await ds.saveChanges({views: views('Base_InterfaceProvider', 'authentication')})).success).toBe(true)
    expect(http().records['Base_InterfaceProvider']![0]!['TokenPrefix']).toBe(' Token ')
    expect(headers.hasEditingChanges()).toBe(true)
    expect((await ds.saveChanges({views: views('Base_InterfaceProvider_Headers')})).success).toBe(true)
    expect(http().records['Base_InterfaceProvider_Headers']![0]!['type']).toBe('all')
  })

  it('checks public parameter names and references, fills interface display fields and forbids deletes', async () => {
    const ds = await open(CONFIG, 'P1')
    const params = ds.getView('Base_Interface_PublicParam')!
    expect(params.fieldAccess(byId(params, 'Q1'), 'paramName').write).toBe('denied')
    await expect(params.removeRow('Q1')).rejects.toThrow('DATA_VIEW_DELETE_DISABLED')
    const row = await params.addRow({})
    const id = params.getPkKey(row)!
    expect(row).toMatchObject({providerId: 'P1'})
    for (const [field, value] of Object.entries({paramName: 'access_token', interfaceId: 'I2', outputfield: 'data'})) params.updateEditingValue(id, field, value)
    await expect(ds.saveChanges({views: views('Base_Interface_PublicParam')})).rejects.toThrow('重复')
    params.updateEditingValue(id, 'paramName', ' spaced ')
    await expect(ds.saveChanges({views: views('Base_Interface_PublicParam')})).rejects.toThrow('首尾空白')
    params.updateEditingValue(id, 'paramName', 'query_data')
    params.updateEditingValue(id, 'outputfield', 'token')
    await expect(ds.saveChanges({views: views('Base_Interface_PublicParam')})).rejects.toThrow('Base_Interface_PublicParam@default.outputfield')
    params.updateEditingValue(id, 'outputfield', 'data')
    expect((await ds.saveChanges({views: views('Base_Interface_PublicParam')})).success).toBe(true)
    expect(http().records['Base_Interface_PublicParam']!.find(item => item['paramName'] === 'query_data'))
      .toMatchObject({providerId: 'P1', interfaceId: 'I2', interfaceName: '查询', accessPath: '/query'})
  })

  it('keeps an unknown save result until discard-and-reread shows the server state without replaying the write', async () => {
    const ds = await open(CONFIG, 'P1')
    const headers = ds.getView('Base_InterfaceProvider_Headers')!
    headers.updateEditingValue('H1', 'paramName', 'X-Auth')
    http().failAfterWrite = true
    await expect(ds.saveChanges({views: views('Base_InterfaceProvider_Headers')})).rejects.toThrow()
    expect(headers.hasUnconfirmedSave).toBe(true)
    const writes = http().saves.length
    await ds.discardAndReload({views: views('Base_InterfaceProvider_Headers')})
    expect(http().saves).toHaveLength(writes)
    expect(headers.hasUnconfirmedSave).toBe(false)
    expect(byId(headers, 'H1')?.['paramName']).toBe('X-Auth')
  })
})

describe('interface scheme scenario', () => {
  it('shows no child definitions until an interface is selected, then scopes them to it', async () => {
    const ds = await open(API, 'P1')
    const interfaces = ds.getView('Base_DataServiceInterface')!, params = ds.getView('_Base_ParamList')!
    expect(interfaces.rows.map(row => row['rowid'])).toEqual(['I1', 'I2'])
    expect(params.rows).toEqual([])
    expect(http().reads.some(read => read.table === '_Base_ParamList')).toBe(false)
    interfaces.setCurrentRowById('I2'); interfaces.setSelectedRows([byId(interfaces, 'I2')!])
    await vi.waitFor(() => expect(params.rows.map(row => row['parid'])).toEqual(['A2']))
    expect(await params.addRow({})).toMatchObject({pid: 'I2'})
  })

  it('locks the interface pointer while children are pending and gates child adds under a new interface', async () => {
    const ds = await open(API, 'P1')
    const interfaces = ds.getView('Base_DataServiceInterface')!, headers = ds.getView('Base_InterfaceApi_Headers')!
    interfaces.setCurrentRowById('I2'); interfaces.setSelectedRows([byId(interfaces, 'I2')!])
    await vi.waitFor(() => expect(headers.rows).toHaveLength(1))
    headers.updateEditingValue('X1', 'ParamDesc', 'changed')
    expect(() => interfaces.setCurrentRowById('I1')).toThrow('DATA_VIEW_SELECTION_LOCKED')
    await ds.discardAndReload({views: views('Base_InterfaceApi_Headers')})
    const draft = await interfaces.addRow({})
    interfaces.setCurrentRow(draft); interfaces.setSelectedRows([draft])
    expect(draft).toMatchObject({ProviderID: 'P1'})
    expect(headers.addActionState()).not.toBe('enabled')
  })

  it('validates interface definitions against option tables, auth flag and JSON schemes', async () => {
    const ds = await open(API, 'P1')
    const interfaces = ds.getView('Base_DataServiceInterface')!
    interfaces.setCurrentRowById('I1'); interfaces.setSelectedRows([byId(interfaces, 'I1')!])
    interfaces.updateEditingValue('I1', 'request', 'PATCH')
    await expect(ds.saveChanges({views: views('Base_DataServiceInterface')})).rejects.toThrow('Base_DataServiceInterface@default.request')
    interfaces.updateEditingValue('I1', 'request', 'GET')
    interfaces.updateEditingValue('I1', 'GetParamStr', '[1]')
    await expect(ds.saveChanges({views: views('Base_DataServiceInterface')})).rejects.toThrow('须为JSON对象')
    interfaces.updateEditingValue('I1', 'GetParamStr', JSON.stringify({q: JSON.stringify({Type: 'GetInputParam', ParamName: 'user'})}))
    interfaces.updateEditingValue('I1', 'Name', '查询')
    await expect(ds.saveChanges({views: views('Base_DataServiceInterface')})).rejects.toThrow('重复')
    interfaces.updateEditingValue('I1', 'Name', '取令牌')
    interfaces.updateEditingValue('I1', 'AccountName', 'C1')
    expect((await ds.saveChanges({views: views('Base_DataServiceInterface')})).success).toBe(true)
    expect(http().records['Base_DataServiceInterface']![0]).toMatchObject({request: 'GET', AccountName: 'C1'})
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(interfaces.currentRow?.['rowid']).toBe('I1')
    expect(interfaces.getSelectedValues()).toEqual(['I1'])
  })
})
