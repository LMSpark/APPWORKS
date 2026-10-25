import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet, RequestState} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseDirectory} from '@/lowcode/resources/database/lowcode-database-directory'
import {DATABASE_CATALOG_DB_MODEL} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  databaseCatalogDbBeginCreate,
  databaseCatalogDbCancelEdit,
  databaseCatalogQueryUnregisteredDbNames,
  databaseCatalogDbSaveEdit,
  databaseCatalogServerSelectedId,
  requireDatabaseCatalogDbView,
  requireDatabaseCatalogServerView,
} from '@/lowcode/resources/database/database-catalog-db-view-ops'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
  databaseTableViewModels,
} from './database-table-view.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: DatabaseTableViewHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, application: {get: () => null}, dataSpace: {design: service, get runtime() {return runtime}}},
}))

const sets: DataSet[] = []

beforeEach(() => {
  http = new DatabaseTableViewHttp()
  runtime = bootstrapDatabaseTableViewRuntime(http, service)
})

afterEach(() => {sets.splice(0).forEach(ds => ds.destroy()); vi.clearAllMocks()})

describe('database-catalog-db-view-ops', () => {
  it('requires explicit server selection and saves one database row through its DataView/DataSet', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    expect(serverView.rows.length).toBeGreaterThan(0)
    await expect(databaseCatalogDbBeginCreate(dbView, serverView)).rejects.toThrow('当前不能新增数据库')
    const server = serverView.rows[0]!
    serverView.setSelectedRows([server])
    const edit = await databaseCatalogDbBeginCreate(dbView, serverView)
    dbView.updateEditingValue(edit.id, 'Name', 'spark_crm')
    await databaseCatalogDbSaveEdit(ds, dbView, edit)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    expect(http.requests.some(request => request.url === '/api/DataOperation/GetData'
      && JSON.stringify(request.data).includes('ServerName'))).toBe(true)
  })

  it('cancels only the newly added DataView row without submitting it', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    const edit = await databaseCatalogDbBeginCreate(dbView, serverView)
    expect(dbView.rows).toContain(edit.row)
    expect(databaseCatalogDbCancelEdit(dbView, edit)).toBeUndefined()
    expect(dbView.rows).not.toContain(edit.row)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('queries unregistered database names through the directory DataSet command view', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    const serverId = databaseCatalogServerSelectedId(serverView)
    http.unregisteredByServer[serverId] = ['Staging', 'Archive']
    const names = await databaseCatalogQueryUnregisteredDbNames(ds, serverId, {
      commandInput: 'DatabaseDirectoryCommandInput',
      unregisteredDbNames: 'DatabaseDirectoryUnregisteredDatabaseNames',
    })
    expect(names).toEqual(['Staging', 'Archive'])
    expect(http.requests.some(request => request.url === `/api/Db/getUnregisteredDb/${serverId}`)).toBe(true)
    expect(ds.getTable('DatabaseDirectoryUnregisteredTableNames')).toBeUndefined()
    expect(ds.getTable('DatabaseDirectoryUnregisteredViewNames')).toBeUndefined()
  })

  it('does not invent a database type when the selected server has no readable type', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    const server = serverView.rows[0]!
    server['Type'] = ''
    serverView.setSelectedRows([server])
    await expect(databaseCatalogDbBeginCreate(dbView, serverView)).rejects.toThrow('当前不能新增数据库')
    expect(dbView.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it.each([
    ['request failed', (view: ReturnType<typeof requireDatabaseCatalogServerView>) => {
      view.requestState = RequestState.Failed
      view.loadingError = new Error('server query failed')
    }],
    ['server name is unreadable', (view: ReturnType<typeof requireDatabaseCatalogServerView>) => {
      vi.spyOn(view, 'fieldAccess').mockImplementation((row, field) => field === 'ServerName'
        ? {read: 'masked', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}
        : {read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'})
    }],
  ])('refuses server context when %s', async (_label, invalidate) => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    invalidate(serverView)
    await expect(databaseCatalogDbBeginCreate(dbView, serverView)).rejects.toThrow('当前不能新增数据库')
    expect(dbView.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('keeps a staged create when the formal query marks Name as a computed read-only field', async () => {
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
      const found = databaseTableViewModels[metaName as keyof typeof databaseTableViewModels]
      if (!found) throw new Error(`unexpected model ${metaName}`)
      return Promise.resolve(metaName === DATABASE_CATALOG_DB_MODEL
        ? {...found, fields: found.fields.map(field => field.name === 'Name' ? {...field, computed: true} : field)}
        : found)
    })
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    expect(dbView.addActionState()).toBe('enabled')
    const edit = await databaseCatalogDbBeginCreate(dbView, serverView)
    expect(dbView.fieldAccess(edit.row, 'Name')).toMatchObject({write: 'denied'})
    await expect(databaseCatalogDbSaveEdit(ds, dbView, edit)).rejects.toThrow('数据库名称字段当前不可写')
    expect(dbView.rows).toContain(edit.row)
    expect(dbView.dirtyTracking.isPendingCreate(edit.id)).toBe(true)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('blocks cancel and create after an unknown save, then verifies only the original DataView target', async () => {
    const ds = await LowcodeDatabaseDirectory.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    serverView.setSelectedRows([serverView.rows[0]!])
    const edit = await databaseCatalogDbBeginCreate(dbView, serverView)
    dbView.updateEditingValue(edit.id, 'Name', 'unknown-save')
    Object.defineProperty(dbView, 'hasUnconfirmedSave', {configurable: true, get: () => true})
    const saveChanges = vi.spyOn(ds, 'saveChanges').mockResolvedValue({success: true} as never)
    vi.spyOn(dbView, 'refresh').mockResolvedValue(undefined)

    expect(() => databaseCatalogDbCancelEdit(dbView, edit)).toThrow('请先核验未确认的保存结果')
    await expect(databaseCatalogDbBeginCreate(dbView, serverView)).rejects.toThrow('当前不能新增数据库')
    await databaseCatalogDbSaveEdit(ds, dbView, edit)

    expect(saveChanges).toHaveBeenCalledOnce()
    expect(saveChanges).toHaveBeenCalledWith({views: [{tableName: dbView.tableName, viewId: dbView.viewId, ids: [edit.id]}]})
  })
})
