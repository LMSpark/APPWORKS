import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseTableView} from '@/lowcode/resources/database/lowcode-database-table-view'
import {
  DATABASE_TABLE_PREVIEW_RESULT_TABLE,
  DATABASE_VIEW_PREVIEW_RESULT_TABLE,
  databaseCatalogHasTablePreview,
  databaseCatalogHasViewPreview,
  databaseCatalogPreviewRefresh,
  databaseCatalogViewPreviewRefresh,
  requireDatabaseCatalogPreviewView,
  requireDatabaseCatalogViewPreviewView,
} from '@/lowcode/resources/database/database-catalog-preview-view-ops'
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

describe('database-catalog-preview-view-ops', () => {
  it('loads physical table preview through GetData readonly command view', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    expect(databaseCatalogHasTablePreview(ds)).toBe(true)
    const preview = requireDatabaseCatalogPreviewView(ds)
    await databaseCatalogPreviewRefresh(ds, preview, {
      dbId: 'DB1',
      tableName: 'Orders',
      tblid: 'T1',
      pageIndex: 1,
      pageSize: 10,
    })
    expect(http.requests.some(request => {
      if (request.url !== '/api/DataOperation/GetData') return false
      const data = request.data as {Table?: Array<Record<string, unknown>>}
      const table = data.Table?.[0]
      return table?.['Type'] === '数据库表' && table?.['DbId'] === 'DB1' && table?.['Name'] === 'Orders'
    })).toBe(true)
    expect(preview.rows.some(row => row['Name'] === '预览行一')).toBe(true)
    expect(preview.total).toBe(2)
    expect(ds.getView(DATABASE_TABLE_PREVIEW_RESULT_TABLE, 'default')).toBe(preview)
  })

  it('loads database view preview through GetData readonly command view', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    expect(databaseCatalogHasViewPreview(ds)).toBe(true)
    const preview = requireDatabaseCatalogViewPreviewView(ds)
    await databaseCatalogViewPreviewRefresh(ds, preview, {
      dbId: 'DB1',
      viewName: 'OrderView',
      pageIndex: 1,
      pageSize: 10,
    })
    expect(http.requests.some(request => {
      if (request.url !== '/api/DataOperation/GetData') return false
      const data = request.data as {Table?: Array<Record<string, unknown>>}
      const table = data.Table?.[0]
      return table?.['Type'] === '数据库视图' && table?.['Name'] === 'OrderView'
    })).toBe(true)
    expect(preview.rows.some(row => row['Total'] === '100.00')).toBe(true)
    expect(ds.getView(DATABASE_VIEW_PREVIEW_RESULT_TABLE, 'default')).toBe(preview)
  })
})
