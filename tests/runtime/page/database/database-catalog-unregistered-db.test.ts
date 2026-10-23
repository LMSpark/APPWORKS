import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseTableView} from '@/lowcode/resources/database/lowcode-database-table-view'
import {databaseCatalogQueryUnregisteredDbNames} from '@/lowcode/resources/database/database-catalog-db-view-ops'
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

describe('databaseCatalogQueryUnregisteredDbNames', () => {
  it('loads names through DataView.refresh on the catalog DataSet', async () => {
    http.unregisteredByServer = {S1: ['PhysA', 'PhysB']}
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const names = await databaseCatalogQueryUnregisteredDbNames(ds, 'S1')
    expect(names).toEqual(['PhysA', 'PhysB'])
    expect(http.requests.some(request => request.url === '/api/Db/getUnregisteredDb/S1')).toBe(true)
  })
})
