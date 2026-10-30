import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet, DataViewFilter, DataViewFilterCodec} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {
  DATABASE_CATALOG_RELATION_MODEL,
  DATABASE_CATALOG_RELATION_TABLE_VIEW,
  DATABASE_CATALOG_TABLE_MODEL,
  LowcodeDatabaseTableView,
} from '@/lowcode/resources/database/catalog/table-view'
import {
  databaseCatalogHasRelationCatalog,
  databaseCatalogRelationDeleteSelected,
  databaseCatalogRelationRefreshForTable,
  requireDatabaseCatalogRelationView,
} from '@/lowcode/resources/database/catalog/relation/view-ops'
import {
  DATABASE_TABLE_VIEW_SCENARIO_ID,
  DatabaseTableViewHttp,
  bootstrapDatabaseTableViewRuntime,
} from './table-view.fixture'

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

describe('database/catalog/relation/view-ops', () => {
  it('loads relations for selected table with OR pktbid/fktbid filter', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    expect(databaseCatalogHasRelationCatalog(ds)).toBe(true)
    const relationView = requireDatabaseCatalogRelationView(ds)
    await databaseCatalogRelationRefreshForTable(relationView, 'T1')
    expect(relationView.rows.map(row => row['rowid'])).toEqual(['RL1'])
    await databaseCatalogRelationRefreshForTable(relationView, 'T2')
    expect(relationView.rows.map(row => row['rowid']).sort()).toEqual(['RL1', 'RL2'])
  })

  it('creates a relation row through saveChanges on Base_TblRln', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const relationView = requireDatabaseCatalogRelationView(ds)
    await databaseCatalogRelationRefreshForTable(relationView, 'T1')
    const rowId = 'REL-CREATE'
    const expression = DataViewFilterCodec.serializeStored(DataViewFilter.condition({
      field: 'LineItems.Id', operator: 'eq', value: {Type: 'GetTableField', Field: 'Orders.Id'},
    }))
    await relationView.addRowWithIdentity({field: 'rowid', value: rowId}, {pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders',
      fkdbid: 'DB1', fktbid: 'T3', fktable: 'LineItems', rlname: 'Orders to LineItems', RelshipExp: expression, IsCascadeDeletion: 0})
    await ds.saveChanges({views: [{tableName: DATABASE_CATALOG_RELATION_MODEL, viewId: DATABASE_CATALOG_RELATION_TABLE_VIEW, ids: [rowId]}]})
    expect(http.rows[DATABASE_CATALOG_RELATION_MODEL]!.some(row => row['rowid'] === rowId && row['RelshipExp'] === expression)).toBe(true)
    expect(relationView.rows.some(row => row['rowid'] === rowId && row['RelshipExp'] === expression)).toBe(true)
    const write = http.requests.find(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    const payload = write?.data as Array<{TableName?: string; CrudModel?: {Added?: Array<Record<string, unknown>>}}>
    const added = payload.find(item => item.TableName === DATABASE_CATALOG_RELATION_MODEL)?.CrudModel?.Added
    expect(added?.map(row => row['rowid'])).toEqual([rowId])
    expect(added?.[0]?.['RelshipExp']).toBe(expression)
  })

  it('deletes a relation row through saveChanges on Base_TblRln', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const relationView = requireDatabaseCatalogRelationView(ds)
    await databaseCatalogRelationRefreshForTable(relationView, 'T1')
    const target = relationView.rows.find(row => row['rowid'] === 'RL1')!
    relationView.setSelectedRows([target])
    await databaseCatalogRelationDeleteSelected(ds, relationView)
    expect(http.rows[DATABASE_CATALOG_RELATION_MODEL]!.some(row => row['rowid'] === 'RL1')).toBe(false)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
    const tableView = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')!
    expect(tableView).toBeTruthy()
  })
})
