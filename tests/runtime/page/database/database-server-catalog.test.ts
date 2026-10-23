import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseServer} from '@/lowcode/resources/database/lowcode-database-server'
import {
  databaseServerBeginCreate,
  databaseServerCancelEdit,
  databaseServerSaveEdit,
  databaseServerTestConnection,
  requireDatabaseServerRegisterView,
  requireDatabaseServerView,
} from '@/lowcode/resources/database/database-server-view-ops'
import {
  DATABASE_SERVER_SCENARIO_ID,
  DatabaseServerHttp,
  bootstrapDatabaseServerRuntime,
} from './database-server.fixture'

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

describe('database-server-view-ops', () => {
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

  it('keeps the input and writes nothing when the backend rejects the registration', async () => {
    http.registerMode = 'rejected'
    const {ds, view, edit, fill} = await openRegister()
    fill(registerInput)
    await expect(databaseServerSaveEdit(ds, view, edit)).rejects.toThrow('数据库连接失败')
    expect(edit.target.hasUnconfirmedSave).toBe(false)
    expect(view.rows.map(row => row['rowid'])).toEqual(['S1'])
    expect(databaseServerCancelEdit(view, edit)).toBeUndefined()
    expect(edit.target.dirtyTracking.hasPendingChanges()).toBe(false)
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

  it('reports a dropped request as not registered after verification', async () => {
    http.registerMode = 'dropped'
    const {ds, view, edit, fill} = await openRegister()
    fill(registerInput)
    await expect(databaseServerSaveEdit(ds, view, edit)).rejects.toThrow('已核验：服务器未注册')
    expect(registerCalls()).toHaveLength(1)
    expect(edit.target.hasUnconfirmedSave).toBe(false)
    expect(view.rows.map(row => row['rowid'])).toEqual(['S1'])
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
