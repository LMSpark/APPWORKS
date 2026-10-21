import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseServer} from '@/lowcode/resources/database/lowcode-database-server'
import {
  databaseServerBeginCreate,
  databaseServerSaveEdit,
  databaseServerTestConnection,
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
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
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

describe('database-server-view-ops', () => {
  it('stages create and commits through DataSet.saveChanges', async () => {
    const ds = await LowcodeDatabaseServer.loadCatalog(DATABASE_SERVER_SCENARIO_ID)
    sets.push(ds)
    const view = requireDatabaseServerView(ds)
    const edit = await databaseServerBeginCreate(view)
    expect(edit.mode).toBe('add')
    view.updateEditingValue(edit.id, 'ServerName', '新库')
    view.updateEditingValue(edit.id, 'ip_address', '127.0.0.1')
    await databaseServerSaveEdit(ds, view, edit)
    expect(view.getSelectedValues()).toEqual([])
  })

  it('tests connection through the data layer with bound DataView editing context', async () => {
    const ds = await LowcodeDatabaseServer.loadCatalog(DATABASE_SERVER_SCENARIO_ID)
    sets.push(ds)
    const view = requireDatabaseServerView(ds)
    const edit = await databaseServerBeginCreate(view)
    view.updateEditingValue(edit.id, 'ServerName', '主库')
    view.updateEditingValue(edit.id, 'ip_address', '10.0.0.1')
    view.updateEditingValue(edit.id, 'UserName', 'root')
    view.updateEditingValue(edit.id, 'Password', 'secret')
    await expect(databaseServerTestConnection(ds, view, edit)).resolves.toBe(true)
    expect(http.requests.some(request => request.url === '/api/Db/testConnection')).toBe(true)
  })
})
