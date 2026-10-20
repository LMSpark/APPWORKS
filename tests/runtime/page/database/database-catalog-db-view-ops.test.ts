import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseTableView} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  databaseCatalogDbBeginCreate,
  databaseCatalogDbSaveEdit,
  requireDatabaseCatalogDbView,
  requireDatabaseCatalogServerView,
} from '@/lowcode/resources/database/database-catalog-db-view-ops'
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

describe('database-catalog-db-view-ops', () => {
  it('registers a database row through saveChanges on _base_dbInfo', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const serverView = requireDatabaseCatalogServerView(ds)
    const dbView = requireDatabaseCatalogDbView(ds)
    expect(serverView.rows.length).toBeGreaterThan(0)
    const edit = await databaseCatalogDbBeginCreate(dbView, serverView)
    dbView.updateEditingValue(edit.id, 'Name', 'spark_crm')
    await databaseCatalogDbSaveEdit(ds, dbView, edit)
    expect(http.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
  })
})
