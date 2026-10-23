import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseTableView} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  databaseCatalogDbSelectedId,
  databaseCatalogQueryUnregisteredTableNames,
  databaseCatalogTableBeginCreate,
  databaseCatalogTableSaveEdit,
  requireDatabaseCatalogDbViewForTable,
  requireDatabaseCatalogTableView,
} from '@/lowcode/resources/database/database-catalog-table-view-ops'
import {
  databaseCatalogQueryUnregisteredViewNames,
  databaseCatalogSyncTableMetadata,
} from '@/lowcode/resources/database/database-catalog-sync-view-ops'
import {
  databaseCatalogRegisterTables,
  databaseCatalogRegisterViews,
} from '@/lowcode/resources/database/database-catalog-register-view-ops'
import {
  databaseCatalogCanDeleteRow,
  databaseCatalogDeleteRow,
} from '@/lowcode/resources/database/database-catalog-object-view-ops'
import {databaseCatalogCopyTable} from '@/lowcode/resources/database/database-catalog-copy-view-ops'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
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

describe('database-catalog-table-view-ops', () => {
  it('registers a table row through saveChanges on _Base_TblList', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    const tableView = requireDatabaseCatalogTableView(ds)
    expect(dbView.rows.length).toBeGreaterThan(0)
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    if (tableView.loadingError) throw tableView.loadingError
    const edit = await databaseCatalogTableBeginCreate(tableView, dbView)
    tableView.updateEditingValue(edit.id, 'tblname', 'Invoices')
    await databaseCatalogTableSaveEdit(ds, tableView, edit)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
  })

  it('loads unregistered view names through command DataView', async () => {
    http.unregisteredViewsByDb = {DB1: ['RawView']}
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    const names = await databaseCatalogQueryUnregisteredViewNames(ds, dbId)
    expect(names).toEqual(['RawView'])
    expect(http.requests.some(request => request.url === `/api/View/getUnregisteredView/${dbId}`)).toBe(true)
  })

  it('registers physical tables through registerTable write command', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    await databaseCatalogRegisterTables(ds, dbId, [{
      tableName: 'StagingOrders',
      tableComment: 'staging',
      addDefaultFields: true,
    }])
    expect(http.requests.some(request => request.url === `/api/Table/registerTable/${dbId}`)).toBe(true)
    const tableView = requireDatabaseCatalogTableView(ds)
    expect(tableView.rows.some(row => row['tblname'] === 'StagingOrders')).toBe(true)
  })

  it('registers physical views through registerView write command', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    await databaseCatalogRegisterViews(ds, dbId, [{viewName: 'SalesView', viewComment: ''}])
    expect(http.requests.some(request => request.url === `/api/View/registerView/${dbId}`)).toBe(true)
    const viewCatalog = ds.getView('_Base_ViewList', 'default')!
    expect(viewCatalog.rows.some(row => row['vewname'] === 'SalesView')).toBe(true)
  })

  it('syncs table metadata through write command and refreshes fields', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    const tableView = requireDatabaseCatalogTableView(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    if (tableView.loadingError) throw tableView.loadingError
    tableView.setSelectedRows([tableView.rows[0]!])
    const fieldView = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)!
    await fieldView.refresh()
    if (fieldView.loadingError) throw fieldView.loadingError
    const dbId = databaseCatalogDbSelectedId(dbView)
    const tableId = tableView.getSelectedValues()[0] as string
    await databaseCatalogSyncTableMetadata({dataSet: ds, dbId, tableId, fieldView})
    expect(http.requests.some(request => request.url === `/api/Table/SyncMetaData/${dbId}/${tableId}`)).toBe(true)
    expect(fieldView.rows.some(row => row['enname'] === 'SyncedCol')).toBe(true)
  })

  it('copies a table with fields through one saveChanges', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    const tableView = requireDatabaseCatalogTableView(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    if (tableView.loadingError) throw tableView.loadingError
    const source = tableView.rows.find(row => row['tblname'] === 'Orders')
    expect(source).toBeTruthy()
    const sourceId = tableView.getPkKey(source!) as string
    const dbId = databaseCatalogDbSelectedId(dbView)
    const newId = await databaseCatalogCopyTable(ds, {
      sourceTableId: sourceId,
      dbId,
      newTableName: 'OrdersCopy',
      newTableDesc: '复制订单',
    })
    expect(newId.length).toBeGreaterThan(0)
    const created = tableView.rows.find(row => tableView.getPkKey(row) === newId)
    expect(created).toBeTruthy()
    tableView.setSelectedRows([created!])
    const fieldView = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)!
    await fieldView.refresh()
    if (fieldView.loadingError) throw fieldView.loadingError
    expect(fieldView.rows.filter(row => row['tblid'] === newId).length).toBeGreaterThan(0)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
  })

  it('deletes a table row through saveChanges on _Base_TblList', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    const tableView = requireDatabaseCatalogTableView(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    if (tableView.loadingError) throw tableView.loadingError
    const target = tableView.rows.find(row => row['tblname'] === 'Orders')
    expect(target).toBeTruthy()
    const id = tableView.getPkKey(target!)
    expect(typeof id).toBe('string')
    expect(databaseCatalogCanDeleteRow(tableView, id as string)).toBe(true)
    await databaseCatalogDeleteRow(ds, tableView, id as string)
    expect(tableView.rows.some(row => row['tblname'] === 'Orders')).toBe(false)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
  })

  it('loads unregistered table names through command DataView', async () => {
    http.unregisteredByDb = {DB1: ['RawA', 'RawB']}
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = requireDatabaseCatalogDbViewForTable(ds)
    dbView.setSelectedRows([dbView.rows[0]!])
    const dbId = databaseCatalogDbSelectedId(dbView)
    const names = await databaseCatalogQueryUnregisteredTableNames(ds, dbId)
    expect(names).toEqual(['RawA', 'RawB'])
    expect(http.requests.some(request => request.url === `/api/Db/getUnregisteredTable/${dbId}`)).toBe(true)
  })
})
