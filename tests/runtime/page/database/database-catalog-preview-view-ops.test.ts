import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet, RequestState} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {DATABASE_CATALOG_DB_MODEL, DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW, DATABASE_CATALOG_TABLE_MODEL, LowcodeDatabaseTableView} from '@/lowcode/resources/database/lowcode-database-table-view'
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
    const databases = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')!
    databases.setSelectedRows([databases.rows[0]!])
    const tables = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')!
    await tables.refresh()
    const selectedTable = tables.rows.find(row => tables.getPkKey(row) === 'T1')!
    tables.setSelectedRows([selectedTable])
    const fields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)!
    await fields.refresh()
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
    const request = http.requests.filter(request => request.url === '/api/DataOperation/GetData'
      && (request.data as {Table?: Array<Record<string, unknown>>}).Table?.[0]?.['Type'] === '数据库表').slice(-1)[0]
    const descriptor = (request?.data as {Table?: Array<Record<string, unknown>>} | undefined)?.Table?.[0]
    expect(descriptor?.['PrimaryKeyFields']).toBe('Id')
    expect(descriptor?.['Fields']).toEqual([
      {name: 'Id', label: '编号', fieldType: '整数型', isPrimaryKey: true},
      {name: 'Name', label: '名称', fieldType: '字符串型', isPrimaryKey: false},
    ])
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

  it('does not publish physical preview columns when the application scope changes during the request', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const preview = requireDatabaseCatalogPreviewView(ds)
    const originalColumns = preview.columns.map(column => column.name)
    http.onPhysicalPreviewResponse = () => service.readRequestScope.mockReturnValue({
      token: 'changed-scope', headers: {'X-AppId': 'OTHER', 'x-FormKey': DATABASE_TABLE_VIEW_SCENARIO_ID},
    })

    await expect(databaseCatalogPreviewRefresh(ds, preview, {
      dbId: 'DB1', tableName: 'Orders', tblid: 'T1', pageIndex: 1, pageSize: 10,
    })).rejects.toThrow('表和视图目录请求所属应用或登录身份已变化')

    expect(preview.columns.map(column => column.name)).toEqual(originalColumns)
    expect(preview.rows).toEqual([])
  })

  it('uses DataView page inputs for the physical request and preserves the service total', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const preview = requireDatabaseCatalogPreviewView(ds)

    await databaseCatalogPreviewRefresh(ds, preview, {
      dbId: 'DB1', tableName: 'Orders', tblid: 'T1', pageIndex: 1, pageSize: 1,
    })
    await databaseCatalogPreviewRefresh(ds, preview, {
      dbId: 'DB1', tableName: 'Orders', tblid: 'T1', pageIndex: 2, pageSize: 1,
    })

    const request = http.requests.filter(request => request.url === '/api/DataOperation/GetData'
      && (request.data as {Table?: Array<Record<string, unknown>>}).Table?.[0]?.['Type'] === '数据库表').slice(-1)[0]
    expect(request?.data).toMatchObject({PageParam: {index: 2, size: 1}})
    expect(preview.rows.map(row => row['Id'])).toEqual(['2'])
    expect(preview.total).toBe(2)
  })

  it('keeps an empty physical result as a successful loaded empty view', async () => {
    const ds = await LowcodeDatabaseTableView.loadCatalog(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const preview = requireDatabaseCatalogPreviewView(ds)
    http.physicalPreviewRowsOverride = []

    await databaseCatalogPreviewRefresh(ds, preview, {
      dbId: 'DB1', tableName: 'Orders', tblid: 'T1', pageIndex: 1, pageSize: 10,
    })

    expect(preview.requestState).toBe(RequestState.Loaded)
    expect(preview.loadingError).toBeNull()
    expect(preview.rows).toEqual([])
    expect(preview.total).toBe(0)
  })
})
