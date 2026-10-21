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
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
} from './database-table-view.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: DatabaseTableViewHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
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
