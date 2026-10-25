import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_FIELD_VIEW_VIEW,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  LowcodeDatabaseTableView,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  databaseCatalogDesignSavePending,
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
  lowcodeApi: {readRequestScope: service.readRequestScope, application: {get: () => null}, dataSpace: {design: service, get runtime() {return runtime}}},
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
    const dbView = ds.getView('_base_dbInfo', 'default')!
    const tableView = ds.getView('_Base_TblList', 'default')!
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

  it('commits staged view output field edits on Base_TblField@viewFields', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = ds.getView('_base_dbInfo', 'default')!
    const viewView = ds.getView(DATABASE_CATALOG_VIEW_MODEL, 'default')!
    dbView.setSelectedRows([dbView.rows[0]!])
    await viewView.refresh()
    const viewRow = viewView.rows.find(row => row['vewname'] === 'OrderView')!
    viewView.setSelectedRows([viewRow])
    const fieldView = requireDatabaseCatalogFieldView(ds, DATABASE_CATALOG_FIELD_VIEW_VIEW)
    await fieldView.refresh()
    const fieldRow = fieldView.rows.find(row => row['enname'] === 'Total')!
    const id = fieldView.getPkKey(fieldRow!)!
    fieldView.updateEditingValue(id, 'cnname', '合计列')
    await databaseCatalogFieldSavePending(ds, fieldView)
    const stored = http.rows[DATABASE_CATALOG_FIELD_MODEL]!.find(row => row['rowid'] === 'F3')
    expect(stored?.['cnname']).toBe('合计列')
  })

  it('commits table header and field edits in one saveChanges', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const dbView = ds.getView('_base_dbInfo', 'default')!
    const tableView = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')!
    dbView.setSelectedRows([dbView.rows[0]!])
    await tableView.refresh()
    const tableRow = tableView.rows.find(row => row['tblname'] === 'Orders')!
    tableView.setSelectedRows([tableRow])
    const tableId = tableView.getPkKey(tableRow)
    tableView.updateEditingValue(tableId!, 'tbldesc', '订单表')
    const fieldView = requireDatabaseCatalogFieldView(ds, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    await fieldView.refresh()
    const fieldRow = fieldView.rows.find(row => row['enname'] === 'Name')!
    fieldView.updateEditingValue(fieldView.getPkKey(fieldRow)!, 'cnname', '名称列')
    await databaseCatalogDesignSavePending({dataSet: ds, fieldView, objectView: tableView})
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    const storedTable = http.rows[DATABASE_CATALOG_TABLE_MODEL]!.find(row => row['rowid'] === 'T1')
    expect(storedTable?.['tbldesc']).toBe('订单表')
  })
})
