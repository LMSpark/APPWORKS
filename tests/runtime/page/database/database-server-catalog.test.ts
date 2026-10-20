import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDatabaseServer} from '@/lowcode/resources/database/lowcode-database-server'
import {
  databaseServerBeginCreate,
  databaseServerSaveEdit,
  databaseServerTestConnection,
  requireDatabaseServerView,
} from '@/lowcode/resources/database/database-server-view-ops'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: ServerHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))

const serverModel = {
  id: 'server-model', name: 'Base_serverInfo', metaName: 'Base_serverInfo', sourceType: 'table', sourceId: 'DB', sourceName: 'Base_serverInfo',
  primaryKey: 'rowid', businessMain: false, raw: {},
  fields: ['rowid', 'Type', 'ServerName', 'ip_address', 'Port', 'description', 'UserName', 'Password'].map((field, order) => ({
    id: field, modelId: 'server-model', name: field, canonicalName: field, primaryKey: field === 'rowid', description: field, type: 'string',
    output: true, computed: false, order, orderType: '', raw: {},
  })),
} satisfies Awaited<ReturnType<DataSpaceDesignApi['readModel']>>

class ServerHttp extends HttpClientBase {
  requests: RequestConfig[] = []
  rows = [{rowid: 'S1', Type: 'MYSQL', ServerName: '主库', ip_address: '10.0.0.1', Port: '3306', description: ''}]
  allowAdd = true

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url === '/api/Db/testConnection') {
      return {data: true, status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      const payload = config.data as Array<{CrudModel?: {Added?: Record<string, unknown>[]; Changed?: Record<string, unknown>[]; Deleted?: Record<string, unknown>[]}}>
      const added = payload.flatMap(item => item.CrudModel?.Added ?? [])
      const changed = payload.flatMap(item => item.CrudModel?.Changed ?? [])
      const deleted = payload.flatMap(item => item.CrudModel?.Deleted ?? [])
      for (const row of added) this.rows.push({rowid: 'S-NEW', Type: 'MYSQL', ServerName: '', ip_address: '', Port: '3306', description: '', ...row})
      for (const row of changed) {
        const id = row['rowid']
        const index = this.rows.findIndex(item => item['rowid'] === id)
        if (index >= 0) this.rows[index] = {...this.rows[index]!, ...row}
      }
      for (const row of deleted) {
        const id = row['rowid']
        this.rows = this.rows.filter(item => item['rowid'] !== id)
      }
      return {data: {Code: 200, Result: {
        ...(added.length ? {maplistadd: [{physical: added.map(row => ({...row}))}]} : {}),
        ...(changed.length ? {maplistedit: [{physical: changed.map(row => ({...row}))}]} : {}),
        ...(deleted.length ? {maplistdelete: [{physical: deleted.map(row => ({...row}))}]} : {}),
      }}, status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url === '/api/Db/testConnection') {
      return {data: true, status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url !== '/api/DataOperation/GetData') {
      throw new Error(`unexpected request ${config.url ?? ''}`)
    }
    const body = config.data as {Table: Array<{Name: string}>}
    const name = body.Table[0]?.Name
    if (name !== 'Base_serverInfo') throw new Error(`unexpected table ${name}`)
    return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: this.allowAdd, lingma_sys_key: 'table-key',
      data: {Items: this.rows.map(row => ({...row, lingma_sys_key: 'row-key', lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}})), Count: this.rows.length}}},
      status: 200, statusText: 'OK', headers: {}}
  }
}

const sets: DataSet[] = []

beforeEach(() => {
  http = new ServerHttp()
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP', 'x-FormKey': 'FORM-DBMS'}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: 'FORM-DBMS', name: '数据库', raw: {}})
  service.readModel.mockResolvedValue(serverModel)
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
})

afterEach(() => {sets.splice(0).forEach(ds => ds.destroy()); vi.clearAllMocks()})

describe('LowcodeDatabaseServer', () => {
  it('loads Base_serverInfo through dynamic scenario assembly', async () => {
    const ds = await LowcodeDatabaseServer.loadCatalog('FORM-DBMS')
    sets.push(ds)
    const view = requireDatabaseServerView(ds)
    expect(view.rows).toHaveLength(1)
    expect(view.commitMode).toBe('staged')
    expect(http.requests.some(request => JSON.stringify(request.data).includes('Base_serverInfo'))).toBe(true)
  })
})

describe('database-server-view-ops', () => {
  it('stages create and commits through DataSet.saveChanges', async () => {
    const ds = await LowcodeDatabaseServer.loadCatalog('FORM-DBMS')
    sets.push(ds)
    const view = requireDatabaseServerView(ds)
    const edit = await databaseServerBeginCreate(view)
    expect(edit.mode).toBe('add')
    view.updateEditingValue(edit.id, 'ServerName', '新库')
    view.updateEditingValue(edit.id, 'ip_address', '127.0.0.1')
    await databaseServerSaveEdit(ds, view, edit)
    expect(view.getSelectedValues()).toEqual([])
  })

  it('rejects connection test until DataView command contract exists', async () => {
    await expect(databaseServerTestConnection()).rejects.toThrow(/DataView/)
    expect(http.requests.some(request => request.url === '/api/Db/testConnection')).toBe(false)
  })
})
