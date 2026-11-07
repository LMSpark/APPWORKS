import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet, DataViewFilter} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseServer} from '@/lowcode/resources/database/server/resource'
import {
  databaseServerBeginCreate,
  databaseServerCancelEdit,
  databaseServerSaveEdit,
  databaseServerTestConnection,
  requireDatabaseServerRegisterView,
  requireDatabaseServerView,
} from '@/lowcode/resources/database/server/view-ops'
import {
  DATABASE_SERVER_SCENARIO_ID,
  DatabaseServerHttp,
  bootstrapDatabaseServerRuntime,
} from './resource.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: DatabaseServerHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, application: {get: () => null}, dataSpace: {design: service, get runtime() {return runtime}}},
}))

const sets: DataSet[] = []

beforeEach(() => {
  http = new DatabaseServerHttp()
  runtime = bootstrapDatabaseServerRuntime(http, service)
})

afterEach(() => {sets.splice(0).forEach(ds => ds.destroy()); vi.clearAllMocks()})

describe('LowcodeDatabaseServer', () => {
  it('loads Base_serverInfo through dynamic scenario assembly', async () => {
    const ds = await LowcodeDatabaseServer.loadCatalog(DATABASE_SERVER_SCENARIO_ID)
    sets.push(ds)
    const view = requireDatabaseServerView(ds)
    expect(view.rows).toHaveLength(1)
    expect(view.columns.map(column => column.name)).toContain('ServerName')
    const typeColumn = view.columns.find(column => column.name === 'Type')
    expect(typeColumn?.type).toBe('enum')
    expect(typeColumn?.enumOptions?.some(option => option.value === 'MYSQL')).toBe(true)
    expect(view.commitMode).toBe('staged')
    expect(http.requests.some(request => JSON.stringify(request.data).includes('Base_serverInfo'))).toBe(true)
  })
})

async function openRegister() {
  const ds = await LowcodeDatabaseServer.loadCatalog(DATABASE_SERVER_SCENARIO_ID)
  sets.push(ds)
  const view = requireDatabaseServerView(ds)
  const edit = await databaseServerBeginCreate(ds, view)
  const fill = (values: Record<string, string>) => {
    for (const [field, value] of Object.entries(values)) edit.target.updateEditingValue(edit.id, field, value)
  }
  return {ds, view, edit, fill}
}

const registerInput = {ServerName: '新库', ip_address: '127.0.0.1', UserName: 'root', Password: 'secret'}
const registerCalls = () => http.requests.filter(request => request.url === '/api/Db/registerServer')
const crudCalls = () => http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')

describe('database/server/view-ops', () => {
  it('registers through the registerServer command and reads the server back from the catalog', async () => {
    const {ds, view, edit, fill} = await openRegister()
    expect(edit.mode).toBe('add')
    expect(edit.target).toBe(requireDatabaseServerRegisterView(ds))
    fill(registerInput)
    await databaseServerSaveEdit(ds, view, edit)
    expect(registerCalls()).toHaveLength(1)
    expect(registerCalls()[0]?.data).toMatchObject({rowid: edit.id, Type: 'MYSQL', Port: '3306', ...registerInput})
    expect(crudCalls()).toHaveLength(0)
    expect(view.rows.some(row => row['rowid'] === edit.id && row['ServerName'] === '新库')).toBe(true)
    expect(view.getSelectedValues()).toEqual([edit.id])
    expect(edit.target.rows.every(row => !('Password' in row) || row['Password'] === '')).toBe(true)
  })

  it('requires the reference form fields before submitting', async () => {
    const {ds, view, edit, fill} = await openRegister()
    fill({ServerName: '新库', ip_address: '127.0.0.1'})
    await expect(databaseServerSaveEdit(ds, view, edit)).rejects.toThrow('请输入服务器账号')
    expect(registerCalls()).toHaveLength(0)
  })

  it('keeps a system error unknown because its message does not prove a pre-write rejection', async () => {
    http.registerMode = 'rejected'
    const {ds, view, edit, fill} = await openRegister()
    fill(registerInput)
    await expect(databaseServerSaveEdit(ds, view, edit)).rejects.toThrow('注册结果未确认')
    expect(edit.target.hasUnconfirmedSave).toBe(true)
    expect(view.rows.map(row => row['rowid'])).toEqual(['S1'])
    expect(() => databaseServerCancelEdit(view, edit)).toThrow('请先核验')
  })

  it('verifies a lost response by rowid instead of registering twice', async () => {
    http.registerMode = 'lost'
    const {ds, view, edit, fill} = await openRegister()
    fill(registerInput)
    await databaseServerSaveEdit(ds, view, edit)
    expect(registerCalls()).toHaveLength(1)
    expect(view.rows.filter(row => row['rowid'] === edit.id)).toHaveLength(1)
    expect(edit.target.hasUnconfirmedSave).toBe(false)
  })

  it('keeps a dropped request unknown when an authorized query cannot prove non-application', async () => {
    http.registerMode = 'dropped'
    const {ds, view, edit, fill} = await openRegister()
    fill(registerInput)
    await expect(databaseServerSaveEdit(ds, view, edit)).rejects.toThrow('注册结果未确认')
    expect(registerCalls()).toHaveLength(1)
    expect(edit.target.hasUnconfirmedSave).toBe(true)
    expect(view.rows.map(row => row['rowid'])).toEqual(['S1'])
  })

  it('verifies an applied lost receipt by exact id without changing the filtered directory', async () => {
    http.rows.push({rowid: 'S-ORACLE', Type: 'ORACLE', ServerName: 'Other', ip_address: 'other', Port: '1521', description: ''})
    const {ds, view, edit, fill} = await openRegister()
    fill(registerInput)
    const filter = DataViewFilter.condition({field: 'Type', operator: 'eq', value: 'ORACLE'}).toJSON()
    await view.executeFilter(filter)
    expect(view.rows.map(row => row['rowid'])).toEqual(['S-ORACLE'])
    view.setSelectedRows([view.rows[0]!])
    const before = structuredClone(view.rows), selection = view.getSelectedValues()
    http.registerMode = 'lost'
    await expect(ds.saveChanges({views: [{tableName: edit.target.tableName, viewId: 'default', ids: [edit.id]}]})).rejects.toThrow()
    edit.target.updateEditingValue(edit.id, 'ip_address', 'later-host')
    expect(await ds.resolveUnconfirmedSaves()).toMatchObject({state: 'confirmed'})
    expect(edit.target.hasUnconfirmedSave).toBe(false)
    expect(view.filterExpression).toEqual(filter)
    expect(view.rows).toEqual(before)
    expect(view.getSelectedValues()).toEqual(selection)
    expect(registerCalls()).toHaveLength(1)
    expect(edit.target.getEditingRow(edit.id)?.['ip_address']).toBe('later-host')
  })

  it.each([true, {}, {Code: 200, Result: {}}, {Code: null, Result: {}},
    {Code: 200, Result: {serverId: 'foreign'}}, {Code: 200, Result: {rowid: 'foreign'}}])('does not fabricate an accepted identity from %j', async response => {
    const {ds, edit, fill} = await openRegister()
    fill(registerInput)
    http.registerResponseOverride = response
    await expect(ds.saveChanges({views: [{tableName: edit.target.tableName, viewId: 'default', ids: [edit.id]}]})).rejects.toThrow()
    expect(edit.target.hasUnconfirmedSave).toBe(true)
    expect(edit.target.abandonUnconfirmedSave()).toBe(false)
    expect(registerCalls()).toHaveLength(1)
  })

  it.each(['missing-count', 'hidden-account', 'duplicate', 'mismatched-value'] as const)('keeps insufficient exact readback unknown (%s)', async mode => {
    const {ds, edit, fill} = await openRegister()
    fill(registerInput)
    http.registerMode = 'lost'
    await expect(ds.saveChanges({views: [{tableName: edit.target.tableName, viewId: 'default', ids: [edit.id]}]})).rejects.toThrow()
    if (mode === 'missing-count') http.omitCount = true
    if (mode === 'hidden-account') http.hiddenReadFields = ['UserName']
    if (mode === 'duplicate') http.duplicateReadRows = true
    if (mode === 'mismatched-value') http.rows.find(row => row.rowid === edit.id)!.ip_address = 'wrong-host'
    expect(await ds.resolveUnconfirmedSaves()).toMatchObject({state: 'unknown'})
    expect(edit.target.hasUnconfirmedSave).toBe(true)
    expect(edit.target.abandonUnconfirmedSave()).toBe(false)
    expect(registerCalls()).toHaveLength(1)
  })

  it.each(['conflicting-field', 'error-type', 'zero-code'] as const)('does not accept an inconsistent acknowledgement (%s)', async mode => {
    const {ds, edit, fill} = await openRegister()
    fill(registerInput)
    http.registerResponseOverride = {Code: mode === 'zero-code' ? 0 : 200, Type: mode === 'error-type' ? 'error' : 'success',
      Result: {rowid: edit.id, ...(mode === 'conflicting-field' ? {Type: 'ORACLE'} : {})}}
    await expect(ds.saveChanges({views: [{tableName: edit.target.tableName, viewId: 'default', ids: [edit.id]}]})).rejects.toThrow()
    expect(edit.target.hasUnconfirmedSave).toBe(true)
    expect(registerCalls()).toHaveLength(1)
  })

  it('keeps an SDK-decoded HTTP 200 failure envelope unknown after invoking the registration request', async () => {
    const {ds, edit, fill} = await openRegister()
    fill(registerInput)
    http.registerResponseOverride = {protocolVersion: 4, ok: false, context: {requestId: 'fixture'},
      error: {code: 'SYSTEM_ERROR', message: 'result unavailable'}}
    await expect(ds.saveChanges({views: [{tableName: edit.target.tableName, viewId: 'default', ids: [edit.id]}]})).rejects.toThrow()
    expect(edit.target.hasUnconfirmedSave).toBe(true)
    expect(registerCalls()).toHaveLength(1)
  })

  it.each(['failed', false, null, undefined])('does not accept an unproven success type (%j)', async type => {
    const {ds, edit, fill} = await openRegister()
    fill(registerInput)
    http.registerResponseOverride = {Code: 200, ...(type === undefined ? {} : {Type: type}), Result: {rowid: edit.id}}
    await expect(ds.saveChanges({views: [{tableName: edit.target.tableName, viewId: 'default', ids: [edit.id]}]})).rejects.toThrow()
    expect(edit.target.hasUnconfirmedSave).toBe(true)
  })

  it.each([null, {}, []])('does not coerce a malformed echoed field into an empty description (%j)', async description => {
    const {ds, edit, fill} = await openRegister()
    fill(registerInput)
    http.registerResponseOverride = {Code: 200, Type: 'success', Result: {rowid: edit.id, description}}
    await expect(ds.saveChanges({views: [{tableName: edit.target.tableName, viewId: 'default', ids: [edit.id]}]})).rejects.toThrow()
    expect(edit.target.hasUnconfirmedSave).toBe(true)
  })

  it('returns the validated response snapshot when a completion listener edits the runtime row', async () => {
    const {ds, edit, fill} = await openRegister()
    fill(registerInput)
    http.registerMode = 'lost'
    await expect(ds.saveChanges({views: [{tableName: edit.target.tableName, viewId: 'default', ids: [edit.id]}]})).rejects.toThrow()
    const verification = ds.getView('Base_serverInfo', 'registrationVerify')!
    verification.events.on('requestCompleted', () => {verification.rows[0]!['ip_address'] = 'runtime-only-host'})
    expect(await ds.resolveUnconfirmedSaves()).toMatchObject({state: 'confirmed'})
    expect(edit.target.rows.find(row => row['rowid'] === edit.id)?.['ip_address']).toBe(registerInput.ip_address)
    expect(verification.rows[0]?.['ip_address']).toBe('runtime-only-host')
    expect(registerCalls()).toHaveLength(1)
  })

  it('rejects an expired scope before POST without creating an unknown capture', async () => {
    const {ds, edit, fill} = await openRegister()
    fill(registerInput)
    service.readRequestScope.mockReturnValue({token: 'changed', headers: {'X-AppId': 'OTHER', 'x-FormKey': DATABASE_SERVER_SCENARIO_ID}})
    await expect(ds.saveChanges({views: [{tableName: edit.target.tableName, viewId: 'default', ids: [edit.id]}]})).rejects.toThrow('已变化')
    expect(edit.target.hasUnconfirmedSave).toBe(false)
    expect(registerCalls()).toHaveLength(0)
  })

  it('does not report success when the registered server is missing from catalog readback', async () => {
    http.hideAddedOnRead = true
    const {ds, view, edit, fill} = await openRegister()
    fill(registerInput)
    await expect(databaseServerSaveEdit(ds, view, edit)).rejects.toThrow('重新读取目录未见该服务器')
  })

  it('tests connection with the parameters typed into the register command row', async () => {
    const {ds, edit, fill} = await openRegister()
    fill({...registerInput, ServerName: '主库', ip_address: '10.0.0.1'})
    await expect(databaseServerTestConnection(ds, edit)).resolves.toBe(true)
    const request = http.requests.find(item => item.url === '/api/Db/testConnection')
    expect(request?.data).toMatchObject({ServerName: '主库', ip_address: '10.0.0.1', UserName: 'root', Password: 'secret'})
  })
})
