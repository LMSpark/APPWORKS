import type {Mock} from 'vitest'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {DataViewFilterCodec} from '@spark-appworks/spark-data'
import {DataViewFilterLocal} from '../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {attachDesignReadModelBatch} from './database-server.fixture'
import {
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {DATABASE_SERVER_MODEL} from '@/lowcode/resources/database/lowcode-database-server'

export const DATABASE_TABLE_VIEW_SCENARIO_ID = 'FORM-DB-TAV'

export type DatabaseTableViewDesignMocks = {
  readSpaceDefinition: Mock
  readModel: Mock
  readModelBatch?: Mock
  readRequestScope: Mock
}

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
  [DATABASE_SERVER_MODEL]: model(DATABASE_SERVER_MODEL, ['rowid', 'Type', 'ServerName', 'ip_address', 'Port', 'description']),
  [DATABASE_CATALOG_DB_MODEL]: model(DATABASE_CATALOG_DB_MODEL, ['rowid', 'Id', 'serverId', 'Name', 'Type', 'ServerName', 'SchemaName', 'State', 'Remark']),
  [DATABASE_CATALOG_TABLE_MODEL]: model(DATABASE_CATALOG_TABLE_MODEL, ['rowid', 'dbid', 'tblname', 'tbldesc', 'schemaName', 'status', 'object_id', 'multiTenancy']),
  [DATABASE_CATALOG_VIEW_MODEL]: model(DATABASE_CATALOG_VIEW_MODEL, ['rowid', 'dbid', 'vewname', 'vewdesc', 'SchemaName', 'status', 'object_id']),
  [DATABASE_CATALOG_FIELD_MODEL]: model(DATABASE_CATALOG_FIELD_MODEL, [
    'rowid', 'tblid', 'tblname', 'enname', 'cnname', 'DataTypeName', 'DataType', 'DataLen',
    'IsNill', 'IsPKey', 'IsUQ', 'IsSys', 'DefaultValue', 'Memo', 'ordIdx',
  ]),
} as const

export class DatabaseTableViewHttp extends HttpClientBase {
  requests: RequestConfig[] = []
  unregisteredByServer: Record<string, string[]> = {}
  unregisteredByDb: Record<string, string[]> = {}
  rows: Record<string, Array<Record<string, unknown>>> = {
    [DATABASE_SERVER_MODEL]: [{rowid: 'S1', Type: 'MYSQL', ServerName: '主库', ip_address: '10.0.0.1', Port: '3306', description: ''}],
    [DATABASE_CATALOG_DB_MODEL]: [{rowid: 'DB1', serverId: 'S1', Name: '业务库', ServerName: '主库', SchemaName: 'dbo', Remark: ''}],
    [DATABASE_CATALOG_TABLE_MODEL]: [
      {rowid: 'T1', dbid: 'DB1', tblname: 'Orders', tbldesc: '订单', schemaName: 'dbo', status: 1},
      {rowid: 'T2', dbid: 'DB2', tblname: 'Other', tbldesc: '', schemaName: 'dbo', status: 1},
    ],
    [DATABASE_CATALOG_VIEW_MODEL]: [{rowid: 'V1', dbid: 'DB1', vewname: 'OrderView', vewdesc: '', SchemaName: 'dbo', status: 1}],
    [DATABASE_CATALOG_FIELD_MODEL]: [
      {rowid: 'F1', tblid: 'T1', enname: 'Id', cnname: '编号', DataTypeName: 'int', DataLen: '4', IsPKey: 1, ordIdx: 1},
      {rowid: 'F2', tblid: 'T1', enname: 'Name', cnname: '名称', DataTypeName: 'string', DataLen: '50', IsPKey: 0, ordIdx: 2},
      {rowid: 'F3', tblid: 'V1', enname: 'Total', cnname: '合计', DataTypeName: 'decimal', DataLen: '18', IsPKey: 0, ordIdx: 1},
    ],
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url?.startsWith('/api/Db/getUnregisteredDb/')) {
      const serverId = decodeURIComponent(config.url.slice('/api/Db/getUnregisteredDb/'.length))
      return {data: this.unregisteredByServer[serverId] ?? [], status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url?.startsWith('/api/Db/getUnregisteredTable/')) {
      const dbId = decodeURIComponent(config.url.slice('/api/Db/getUnregisteredTable/'.length))
      return {data: this.unregisteredByDb[dbId] ?? [], status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      const payload = config.data as Array<{CrudModel?: {Added?: Record<string, unknown>[]; Changed?: Record<string, unknown>[]; Deleted?: Record<string, unknown>[]}}>
      const added: Record<string, unknown>[] = []
      const changed: Record<string, unknown>[] = []
      for (const item of payload) {
        for (const row of item.CrudModel?.Added ?? []) {
          added.push(row)
          if (Object.hasOwn(row, 'tblname') && !Object.hasOwn(row, 'enname')) {
            this.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({
              rowid: 'T-NEW', dbid: 'DB1', tblname: '', tbldesc: '', schemaName: 'dbo', status: 1, ...row,
            })
          } else if (Object.hasOwn(row, 'enname')) {
            this.rows[DATABASE_CATALOG_FIELD_MODEL]!.push({rowid: 'F-NEW', tblid: 'T1', ordIdx: 99, ...row})
          } else {
            this.rows[DATABASE_CATALOG_DB_MODEL]!.push({
              rowid: 'DB-NEW', serverId: 'S1', Name: '', SchemaName: 'dbo', ServerName: '主库', Type: 'MYSQL', State: '1', Remark: '', ...row,
            })
          }
        }
        for (const row of item.CrudModel?.Changed ?? []) {
          changed.push(row)
          const id = row['rowid']
          const fieldRows = this.rows[DATABASE_CATALOG_FIELD_MODEL]!
          const index = fieldRows.findIndex(item => item['rowid'] === id)
          if (index >= 0) fieldRows[index] = {...fieldRows[index]!, ...row}
        }
      }
      return {data: {Code: 200, Result: {
        ...(added.length ? {maplistadd: [{physical: added}]} : {}),
        ...(changed.length ? {maplistedit: [{physical: changed}]} : {}),
      }}, status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url !== '/api/DataOperation/GetData') throw new Error(`unexpected request ${config.url ?? ''}`)
    const table = (config.data as {Table: Array<{Name: string; Filter?: unknown}>}).Table[0]!
    let rows = [...(this.rows[table.Name] ?? [])]
    if (table.Filter) {
      const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(table.Filter))
      rows = rows.filter(row => filter.matches(row))
    }
    const model = databaseTableViewModels[table.Name as keyof typeof databaseTableViewModels]
    const fieldNames = model?.fields.map(field => field.name) ?? []
    const allowAdd = table.Name === DATABASE_CATALOG_DB_MODEL || table.Name === DATABASE_CATALOG_TABLE_MODEL
    return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd, lingma_sys_key: 'table-key',
      data: {Items: rows.map(row => ({
        ...row,
        lingma_sys_key: 'row-key',
        lingma_sys_params: {r: fieldNames, e: fieldNames, h: [], m: [], d: false},
      })), Count: rows.length}}},
      status: 200, statusText: 'OK', headers: {}}
  }
}

export function bootstrapDatabaseTableViewRuntime(http: DatabaseTableViewHttp, service: DatabaseTableViewDesignMocks): DataSpaceRuntimeApi {
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP', 'x-FormKey': DATABASE_TABLE_VIEW_SCENARIO_ID}})
  service.readSpaceDefinition.mockResolvedValue({dataSpaceId: DATABASE_TABLE_VIEW_SCENARIO_ID, name: '数据库', raw: {}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => {
    const found = (databaseTableViewModels as Record<string, Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>)[metaName]
    if (!found) throw new Error(`unexpected model ${metaName}`)
    return Promise.resolve(found)
  })
  attachDesignReadModelBatch(service)
  return new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
}
