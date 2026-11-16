import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDatabaseDirectory} from '@/lowcode/resources/database/directory'
import {LowcodeDatabaseServer} from '@/lowcode/resources/database/server/resource'
import {LowcodeDatabaseTableView} from '@/lowcode/resources/database/catalog/table-view'
import {DATABASE_TABLE_VIEW_SCENARIO_ID, DatabaseTableViewHttp, bootstrapDatabaseTableViewRuntime} from './catalog/table-view.fixture'

const mocks = vi.hoisted(() => ({
  readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn(),
  readAuthenticatedRequestScope: vi.fn(), selectedScope: vi.fn(), application: vi.fn(),
  applicationRevision: 0,
}))
let http: DatabaseTableViewHttp, runtime: DataSpaceRuntimeApi, appRuntime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: mocks.selectedScope, readAuthenticatedRequestScope: mocks.readAuthenticatedRequestScope,
    application: {get: mocks.application, get revision() {return mocks.applicationRevision}}, dataSpace: {design: mocks, get runtime() {return appRuntime}}},
  lowcodeCatalogDataSpace: {design: mocks, get runtime() {return runtime}},
}))

const sets: DataSet[] = []
beforeEach(() => {
  http = new DatabaseTableViewHttp()
  appRuntime = bootstrapDatabaseTableViewRuntime(http, mocks)
  runtime = new DataSpaceRuntimeApi({http, readScope: mocks.readAuthenticatedRequestScope})
  mocks.application.mockReset().mockReturnValue(null)
  mocks.applicationRevision = 0
  mocks.selectedScope.mockReset().mockImplementation(() => {throw new Error('no application selected')})
  mocks.readAuthenticatedRequestScope.mockReset().mockReturnValue({token: 'tenant-session-1', headers: {}})
})
afterEach(() => {sets.splice(0).forEach(ds => ds.destroy())})

describe.each([
  {name: 'database directory', load: LowcodeDatabaseDirectory.loadCatalog, table: '_base_dbInfo'},
  {name: 'server directory', load: LowcodeDatabaseServer.loadCatalog, table: 'Base_serverInfo'},
  {name: 'table and view directory', load: LowcodeDatabaseTableView.loadCatalog, table: '_base_dbInfo'},
])('enterprise $name execution scope', ({load, table}) => {
  it('loads the exact formal directory without selecting or borrowing a business application', async () => {
    const ds = await load(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    expect(ds.getView(table, 'default')?.rows.length).toBeGreaterThan(0)
    expect(http.requests.length).toBeGreaterThan(0)
    expect(http.requests.every(request => request.headers?.['X-AppId'] === undefined)).toBe(true)
    expect(mocks.selectedScope).not.toHaveBeenCalled()
    expect(mocks.readAuthenticatedRequestScope).toHaveBeenCalled()
    expect(mocks.readSpaceDefinition).toHaveBeenCalledWith(expect.objectContaining({dataSpaceId: DATABASE_TABLE_VIEW_SCENARIO_ID}))
  })

  it('rejects metadata that returns after the authenticated tenant session changes', async () => {
    const original = mocks.readSpaceDefinition.getMockImplementation()!
    mocks.readSpaceDefinition.mockImplementation(async (...args: unknown[]) => {
      const result = await original(...args)
      mocks.readAuthenticatedRequestScope.mockReturnValue({token: 'tenant-session-2', headers: {}})
      return result
    })
    await expect(load(DATABASE_TABLE_VIEW_SCENARIO_ID)).rejects.toThrow('登录身份已变化')
    expect(http.requests).toHaveLength(0)
  })

  it('rejects a directory load when an application is selected while metadata is in flight', async () => {
    const original = mocks.readSpaceDefinition.getMockImplementation()!
    mocks.readSpaceDefinition.mockImplementation(async (...args: unknown[]) => {
      const result = await original(...args)
      mocks.application.mockReturnValue({application: {id: 'APP'}})
      return result
    })
    await expect(load(DATABASE_TABLE_VIEW_SCENARIO_ID)).rejects.toThrow('身份已变化')
    expect(http.requests).toHaveLength(0)
  })

  it('preserves the selected application request scope', async () => {
    mocks.application.mockReturnValue({application: {id: 'APP'}})
    mocks.selectedScope.mockImplementation(() => mocks.readRequestScope())
    const ds = await load(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    expect(ds.getView(table, 'default')?.rows.length).toBeGreaterThan(0)
    expect(http.requests.length).toBeGreaterThan(0)
    expect(http.requests.every(request => request.headers?.['X-AppId'] === 'APP')).toBe(true)
    expect(mocks.readAuthenticatedRequestScope).not.toHaveBeenCalled()
  })

  it.each(['selected', 'selected-and-cleared'] as const)('rejects loaded queries and staged saves after application is %s', async transition => {
    const ds = await load(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const view = ds.getView(table, 'default')!
    const query = view.createQueryView('scopeVerification')
    const id = view.getPkKey(view.rows[0]!)!
    const field = table === 'Base_serverInfo' ? 'description' : 'Remark'
    view.updateEditingValue(id, field, 'staged before scope change')
    expect((await view.applyEditingRows([id])).success).toBe(true)
    const requests = http.requests.length
    mocks.application.mockReturnValue(transition === 'selected' ? {application: {id: 'APP'}} : null)
    mocks.applicationRevision += transition === 'selected' ? 1 : 2
    await expect(ds.saveChanges({applyEditingRows: false, views: [{tableName: table, viewId: 'default', ids: [id]}]}))
      .rejects.toThrow('身份已变化')
    expect(http.requests).toHaveLength(requests)
    await query.refresh()
    expect(query.loadingError?.message).toContain('身份已变化')
    expect(http.requests).toHaveLength(requests)
  })

  it('rejects a query response after application selection changes in flight', async () => {
    const ds = await load(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const view = ds.getView(table, 'default')!
    const remove = http.interceptors.response.use({onResponse: response => {
      mocks.application.mockReturnValue({application: {id: 'APP'}})
      mocks.applicationRevision++
      return response
    }})
    try {
      await view.refresh()
      expect(view.loadingError?.message).toContain('身份已变化')
    } finally {remove()}
  })

  it('does not accept a late save receipt after application selection changes', async () => {
    const ds = await load(DATABASE_TABLE_VIEW_SCENARIO_ID)
    sets.push(ds)
    const view = ds.getView(table, 'default')!
    const id = view.getPkKey(view.rows[0]!)!
    view.updateEditingValue(id, table === 'Base_serverInfo' ? 'description' : 'Remark', 'in-flight change')
    const remove = http.interceptors.response.use({onResponse: response => {
      if (http.requests.at(-1)?.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
        mocks.application.mockReturnValue({application: {id: 'APP'}})
        mocks.applicationRevision++
      }
      return response
    }})
    try {
      await expect(ds.saveChanges({views: [{tableName: table, viewId: 'default', ids: [id]}]})).rejects.toThrow('身份已变化')
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      await expect(ds.saveChanges({views: [{tableName: table, viewId: 'default', ids: [id]}]})).rejects.toThrow('身份已变化')
      expect(http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    } finally {remove()}
  })
})
