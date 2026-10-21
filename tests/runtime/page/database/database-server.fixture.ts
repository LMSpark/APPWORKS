import {vi, type Mock} from 'vitest'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'

export type DatabaseServerDesignMocks = {
  readSpaceDefinition: Mock
  readModel: Mock
  readModelBatch?: Mock
  readRequestScope: Mock
}

export function attachDesignReadModelBatch(service: Pick<DatabaseServerDesignMocks, 'readModel'> & DatabaseServerDesignMocks): void {
  service.readModelBatch = vi.fn(async (input: {metaNames: readonly string[]}) =>
    Promise.all(input.metaNames.map(metaName => service.readModel({...input, metaName}))))
}

export const DATABASE_SERVER_SCENARIO_ID = 'FORM-DBMS'

export const databaseServerModel = {
  id: 'server-model',
  name: 'Base_serverInfo',
  metaName: 'Base_serverInfo',
  sourceType: 'table',
  sourceId: 'DB',
  sourceName: 'Base_serverInfo',
  primaryKey: 'rowid',
  businessMain: false,
  raw: {},
  fields: ([
    ['rowid', 'rowid'],
    ['Type', '数据库类型'],
    ['ServerName', '服务器名称'],
    ['ip_address', '主机地址'],
    ['Port', '端口'],
    ['description', '描述'],
    ['UserName', '用户名'],
    ['Password', '密码'],
  ] as const).map(([field, description], order) => ({
    id: field,
    modelId: 'server-model',
    name: field,
    canonicalName: field,
    primaryKey: field === 'rowid',
    description,
    type: 'string',
    output: true,
    computed: false,
    order,
    orderType: '',
    raw: {},
  })),
} satisfies Awaited<ReturnType<DataSpaceDesignApi['readModel']>>

const databaseServerFieldNames = databaseServerModel.fields.map(field => field.name)
const databaseServerReadableFields = databaseServerFieldNames.filter(name => name !== 'Password')

export class DatabaseServerHttp extends HttpClientBase {
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
    if (config.url !== '/api/DataOperation/GetData') {
      throw new Error(`unexpected request ${config.url ?? ''}`)
    }
    const table = (config.data as {Table: Array<{Name: string}>}).Table[0]!
    if (table.Name !== 'Base_serverInfo') throw new Error(`unexpected table ${table.Name}`)
    return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: this.allowAdd, lingma_sys_key: 'table-key',
      data: {Items: this.rows.map(row => ({
        ...row,
        lingma_sys_key: 'row-key',
        lingma_sys_params: {
          r: databaseServerReadableFields,
          e: databaseServerReadableFields,
          h: ['Password'],
          m: [],
          d: true,
        },
      })), Count: this.rows.length}}},
      status: 200, statusText: 'OK', headers: {}}
  }
}

export function bootstrapDatabaseServerRuntime(http: DatabaseServerHttp, service: DatabaseServerDesignMocks): DataSpaceRuntimeApi {
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP', 'x-FormKey': DATABASE_SERVER_SCENARIO_ID}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: DATABASE_SERVER_SCENARIO_ID, name: '数据库', raw: {}})
  service.readModel.mockResolvedValue(databaseServerModel)
  attachDesignReadModelBatch(service)
  return new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
}
