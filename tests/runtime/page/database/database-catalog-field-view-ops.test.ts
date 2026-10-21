import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  LowcodeDatabaseTableView,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  databaseCatalogFieldSavePending,
  requireDatabaseCatalogFieldView,
} from '@/lowcode/resources/database/database-catalog-field-view-ops'
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

describe('database-catalog-field-view-ops', () => {
  it('commits staged field edits through saveChanges on Base_TblField', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = ds.getView('Base_serverInfo', 'default')!
    const dbView = ds.getView('_base_dbInfo', 'default')!
    const tableView = ds.getView('_Base_TblList', 'default')!
    serverView.setSelectedRows([serverView.rows[0]!])
    await dbView.refresh()
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    const tableRow = tableView.rows.find(row => row['tblname'] === 'Orders')
    expect(tableRow).toBeTruthy()
    tableView.setSelectedRows([tableRow!])
    const fieldView = requireDatabaseCatalogFieldView(ds, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    await fieldView.refresh()
    const fieldRow = fieldView.rows.find(row => row['enname'] === 'Id')
    expect(fieldRow).toBeTruthy()
    const id = fieldView.getPkKey(fieldRow!)
    expect(id).toBeDefined()
    fieldView.updateEditingValue(id!, 'cnname', '订单编号')
    await databaseCatalogFieldSavePending(ds, fieldView)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    const stored = http.rows[DATABASE_CATALOG_FIELD_MODEL]!.find(row => row['rowid'] === 'F1')
    expect(stored?.['cnname']).toBe('订单编号')
  })
})
