import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseTableView} from '@/lowcode/resources/database/catalog/table-view'
import {
  databaseCatalogHasWorkflowCatalog,
  databaseCatalogWorkflowRefreshForTable,
  requireDatabaseCatalogWorkflowView,
} from '@/lowcode/resources/database/catalog/workflow/view-ops'
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

describe('database/catalog/workflow/view-ops', () => {
  it('loads workflow definitions filtered by tblid', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    expect(databaseCatalogHasWorkflowCatalog(ds)).toBe(true)
    const workflowView = requireDatabaseCatalogWorkflowView(ds)
    await databaseCatalogWorkflowRefreshForTable(workflowView, 'T1')
    expect(workflowView.rows.map(row => row['rowid'])).toEqual(['W1'])
    await databaseCatalogWorkflowRefreshForTable(workflowView, 'T1', {name: '订单'})
    expect(workflowView.rows.map(row => row['name'])).toEqual(['订单流'])
  })
})
