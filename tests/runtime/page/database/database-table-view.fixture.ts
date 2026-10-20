import type {Mock} from 'vitest'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {DataViewFilterCodec} from '@spark-appworks/spark-data'
import {DataViewFilterLocal} from '../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
} from '@/lowcode/resources/database/lowcode-database-table-view'

export const DATABASE_TABLE_VIEW_SCENARIO_ID = 'FORM-DB-TAV'

export type DatabaseTableViewDesignMocks = Readonly<{
  readSpaceDefinition: Mock
  readModel: Mock
  readRequestScope: Mock
}>

function model(metaName: string, fields: readonly string[], primaryKey = 'rowid'): Awaited<ReturnType<DataSpaceDesignApi['readModel']>> {
  return {
    id: `${metaName}-model`,
    name: metaName,
    metaName,
    sourceType: 'table',
    sourceId: 'DB',
    sourceName: metaName,
    primaryKey,
    businessMain: false,
    raw: {},
    fields: fields.map((field, order) => ({
      id: field,
      modelId: `${metaName}-model`,
      name: field,
      canonicalName: field,
      primaryKey: field === primaryKey,
      description: field,
      type: 'string',
      output: true,
      computed: false,
      order,
      orderType: '',
      raw: {},
    })),
  }
}

export const databaseTableViewModels = {
  [DATABASE_CATALOG_DB_MODEL]: model(DATABASE_CATALOG_DB_MODEL, ['rowid', 'Name', 'ServerName', 'SchemaName', 'Remark']),
  [DATABASE_CATALOG_TABLE_MODEL]: model(DATABASE_CATALOG_TABLE_MODEL, ['rowid', 'dbid', 'tblname', 'tbldesc', 'schemaName', 'status']),
  [DATABASE_CATALOG_VIEW_MODEL]: model(DATABASE_CATALOG_VIEW_MODEL, ['rowid', 'dbid', 'vewname', 'vewdesc', 'SchemaName', 'status']),
} as const

export class DatabaseTableViewHttp extends HttpClientBase {
  requests: RequestConfig[] = []
  rows: Record<string, Array<Record<string, unknown>>> = {
    [DATABASE_CATALOG_DB_MODEL]: [{rowid: 'DB1', Name: '业务库', ServerName: '主库', SchemaName: 'dbo', Remark: ''}],
    [DATABASE_CATALOG_TABLE_MODEL]: [
      {rowid: 'T1', dbid: 'DB1', tblname: 'Orders', tbldesc: '订单', schemaName: 'dbo', status: 1},
      {rowid: 'T2', dbid: 'DB2', tblname: 'Other', tbldesc: '', schemaName: 'dbo', status: 1},
    ],
    [DATABASE_CATALOG_VIEW_MODEL]: [{rowid: 'V1', dbid: 'DB1', vewname: 'OrderView', vewdesc: '', SchemaName: 'dbo', status: 1}],
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url !== '/api/DataOperation/GetData') throw new Error(`unexpected request ${config.url ?? ''}`)
    const table = (config.data as {Table: Array<{Name: string; Filter?: unknown}>}).Table[0]!
    let rows = [...(this.rows[table.Name] ?? [])]
    if (table.Filter) {
      const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(table.Filter))
      rows = rows.filter(row => filter.matches(row))
    }
    return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false, lingma_sys_key: 'table-key',
      data: {Items: rows.map(row => ({...row, lingma_sys_key: 'row-key', lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}})), Count: rows.length}}},
      status: 200, statusText: 'OK', headers: {}}
  }
}

export function bootstrapDatabaseTableViewRuntime(http: DatabaseTableViewHttp, service: DatabaseTableViewDesignMocks): DataSpaceRuntimeApi {
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP', 'x-FormKey': DATABASE_TABLE_VIEW_SCENARIO_ID}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: DATABASE_TABLE_VIEW_SCENARIO_ID, name: '数据库', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
    const found = databaseTableViewModels[metaName as keyof typeof databaseTableViewModels]
    if (!found) throw new Error(`unexpected model ${metaName}`)
    return Promise.resolve(found)
  })
  return new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
}
