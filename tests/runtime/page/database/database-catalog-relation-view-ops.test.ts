import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {
  DATABASE_CATALOG_RELATION_MODEL,
  DATABASE_CATALOG_RELATION_TABLE_VIEW,
  DATABASE_CATALOG_TABLE_MODEL,
  LowcodeDatabaseTableView,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  databaseCatalogHasRelationCatalog,
  databaseCatalogRelationDeleteSelected,
  databaseCatalogRelationRefreshForTable,
  requireDatabaseCatalogRelationView,
} from '@/lowcode/resources/database/database-catalog-relation-view-ops'
import {
  databaseCatalogRelationPrepareCreate,
  databaseCatalogRelationSaveDraft,
} from '@/lowcode/resources/database/database-catalog-relation-form-ops'
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

describe('database-catalog-relation-view-ops', () => {
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
    const draft = await databaseCatalogRelationPrepareCreate(relationView, {tableId: 'T1', tableName: 'Orders', dbId: 'DB1'}, 'master')
    const withPeer = {...draft, fktbid: 'T2', fktable: 'Other', fkdbid: 'DB1', rlname: 'Orders.Id=Other.OrderId'}
    await databaseCatalogRelationSaveDraft({dataSet: ds, view: relationView, draft: withPeer, refreshTableId: 'T1'})
    expect(http.rows[DATABASE_CATALOG_RELATION_MODEL]!.some(row => row['rlname'] === 'Orders.Id=Other.OrderId')).toBe(true)
    expect(relationView.rows.some(row => row['rlname'] === 'Orders.Id=Other.OrderId')).toBe(true)
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
