import type {Mock} from 'vitest'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {DataViewFilter, DataViewFilterCodec} from '@spark-appworks/spark-data'
import {DataViewFilterLocal} from '../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {attachDesignReadModelBatch} from './database-server.fixture'
import {
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL,
  DATABASE_CATALOG_ENCRYPTION_DICT_MODEL,
  DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL,
  DATABASE_CATALOG_RELATION_MODEL,
  DATABASE_CATALOG_WORKFLOW_MODEL,
  DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL,
  DATABASE_CATALOG_APP_SYSTEM_MODEL,
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

function model(metaName: string, fields: readonly string[], primaryKey = 'rowid',
  fieldTypes: Readonly<Record<string, string>> = {}): Awaited<ReturnType<DataSpaceDesignApi['readModel']>> {
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
      type: fieldTypes[field] ?? 'string',
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
  [DATABASE_CATALOG_TABLE_MODEL]: model(DATABASE_CATALOG_TABLE_MODEL, [
    'rowid', 'dbid', 'tblname', 'tbldesc', 'Expression', 'IsVisible', 'schemaName', 'status', 'createuser', 'createtime', 'object_id', 'multiTenancy',
  ]),
  [DATABASE_CATALOG_VIEW_MODEL]: model(DATABASE_CATALOG_VIEW_MODEL, [
    'rowid', 'dbid', 'vewname', 'vewdesc', 'functiondesc', 'modid', 'sql', 'IsVisible', 'SchemaName', 'status', 'createuser', 'createtime', 'object_id',
  ]),
  [DATABASE_CATALOG_APP_SYSTEM_MODEL]: model(DATABASE_CATALOG_APP_SYSTEM_MODEL, ['rowid', 'AppDesc', 'AppName']),
  [DATABASE_CATALOG_FIELD_MODEL]: model(DATABASE_CATALOG_FIELD_MODEL, [
    'rowid', 'tblid', 'tblname', 'enname', 'cnname', 'DataTypeName', 'DataType', 'DataLen',
    'IsNill', 'IsPKey', 'IsUQ', 'IsSys', 'DefaultValue', 'Memo', 'ordIdx', 'DesenID', 'encryption_rule',
  ]),
  [DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL]: model(DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL, ['rowid', 'name']),
  [DATABASE_CATALOG_ENCRYPTION_DICT_MODEL]: model(DATABASE_CATALOG_ENCRYPTION_DICT_MODEL, ['rowid', 'txt', 'val', 'ordIdx']),
  [DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL]: model(DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL, ['rowid', 'txt', 'val', 'ordIdx']),
  [DATABASE_CATALOG_RELATION_MODEL]: model(DATABASE_CATALOG_RELATION_MODEL, [
    'rowid', 'pkdbid', 'pktbid', 'pktable', 'fkdbid', 'fktbid', 'fktable', 'rlname', 'RelshipExp', 'IsCascadeDeletion', 'createuser', 'createtime',
  ], 'rowid', {IsCascadeDeletion: 'int', RelshipExp: 'json'}),
  [DATABASE_CATALOG_WORKFLOW_MODEL]: model(DATABASE_CATALOG_WORKFLOW_MODEL, [
    'rowid', 'tblid', 'name', 'workflow_key', 'description', 'status', 'version',
  ]),
  [DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL]: model(DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL, ['rowid', 'txt', 'val', 'ordIdx']),
} as const

export class DatabaseTableViewHttp extends HttpClientBase {
  requests: RequestConfig[] = []
  deniedFieldsByModel: Record<string, readonly string[]> = {}
  hiddenFieldsByModel: Record<string, readonly string[]> = {}
  rejectNextRelationSave = false
  /** Registration response overrides model per-item AjaxResult shapes. */
  registerTableResult: unknown = undefined
  registerViewResult: unknown = undefined
  failRegisterTableNames = new Set<string>()
  definitelyRejectRegisterTableNames = new Set<string>()
  failRegisterViewNames = new Set<string>()
  applyThenFailRegisterViewNames = new Set<string>()
  applyThenFailRegisterTableNames = new Set<string>()
  failCatalogReadAfterRegisterNames = new Set<string>()
  failNextCatalogRead = false
  failNextDirectoryRead = false
  directoryReadSkipped = false
  failNextVerifyRead = false
  omitCountByModel = new Set<string>()
  databasePrimaryKey = 'rowid'
  unregisteredByServer: Record<string, string[]> = {}
  unregisteredByDb: Record<string, string[]> = {}
  unregisteredTableBody: unknown = undefined
  unregisteredViewsByDb: Record<string, string[]> = {}
  rows: Record<string, Array<Record<string, unknown>>> = {
    [DATABASE_SERVER_MODEL]: [{rowid: 'S1', Type: 'MYSQL', ServerName: '主库', ip_address: '10.0.0.1', Port: '3306', description: ''}],
    [DATABASE_CATALOG_DB_MODEL]: [{rowid: 'DB1', serverId: 'S1', Name: '业务库', ServerName: '主库', SchemaName: 'dbo', Remark: ''}],
    [DATABASE_CATALOG_TABLE_MODEL]: [
      {rowid: 'T1', dbid: 'DB1', tblname: 'Orders', tbldesc: '订单', schemaName: 'dbo', status: 1, createuser: 'admin', createtime: '2026-01-01'},
      {rowid: 'T2', dbid: 'DB2', tblname: 'Other', tbldesc: '', schemaName: 'dbo', status: 1, createuser: 'admin', createtime: '2026-01-02'},
      {rowid: 'T3', dbid: 'DB1', tblname: 'LineItems', tbldesc: '明细', schemaName: 'dbo', status: 1, createuser: 'admin', createtime: '2026-01-03'},
    ],
    [DATABASE_CATALOG_VIEW_MODEL]: [{
      rowid: 'V1', dbid: 'DB1', vewname: 'OrderView', vewdesc: '订单视图', functiondesc: '查询', modid: '',
      sql: 'SELECT 1', IsVisible: 1, SchemaName: 'dbo', status: 1, createuser: 'admin', createtime: '2026-01-03',
    }],
    [DATABASE_CATALOG_APP_SYSTEM_MODEL]: [{rowid: 'APP1', AppDesc: '主应用', AppName: 'MainApp'}],
    [DATABASE_CATALOG_FIELD_MODEL]: [
      {rowid: 'F1', tblid: 'T1', enname: 'Id', cnname: '编号', DataType: 'INT', DataTypeName: '整数型', DataLen: '4', IsPKey: 1, ordIdx: 1},
      {rowid: 'F2', tblid: 'T1', enname: 'Name', cnname: '名称', DataType: 'NVARCHAR', DataTypeName: '字符串型', DataLen: '50', IsPKey: 0, ordIdx: 2},
      {rowid: 'F-T2', tblid: 'T2', enname: 'Id', cnname: '编号', DataType: 'INT', DataTypeName: '整数型', DataLen: '4', IsPKey: 1, ordIdx: 1},
      {rowid: 'F-T3-ID', tblid: 'T3', enname: 'Id', cnname: '编号', DataType: 'INT', DataTypeName: '整数型', DataLen: '4', IsPKey: 1, ordIdx: 1},
      {rowid: 'F-T3-ORDER', tblid: 'T3', enname: 'OrderId', cnname: '订单编号', DataType: 'INT', DataTypeName: '整数型', DataLen: '4', IsPKey: 0, ordIdx: 2},
      {rowid: 'F-T3-NAME', tblid: 'T3', enname: 'Name', cnname: '名称', DataType: 'NVARCHAR', DataTypeName: '字符串型', DataLen: '50', IsPKey: 0, ordIdx: 3},
      {rowid: 'F3', tblid: 'V1', enname: 'Total', cnname: '合计', DataType: 'DECIMAL', DataTypeName: '数字型', DataLen: '18', IsPKey: 0, ordIdx: 1},
    ],
    [DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL]: [
      {rowid: 'R1', name: '手机号脱敏'},
      {rowid: 'R2', name: '身份证脱敏'},
    ],
    [DATABASE_CATALOG_ENCRYPTION_DICT_MODEL]: [
      {rowid: 'E1', txt: 'AES', val: 'AES', ordIdx: 1},
    ],
    [DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL]: [
      {rowid: 'FT1', txt: '字符串', val: 'string', ordIdx: 1},
      {rowid: 'FT2', txt: '整型', val: 'int', ordIdx: 2},
    ],
    [DATABASE_CATALOG_RELATION_MODEL]: [
      {rowid: 'RL1', pkdbid: 'DB1', pktbid: 'T1', pktable: 'Orders', fkdbid: 'DB1', fktbid: 'T2', fktable: 'Other', rlname: 'Orders to Other', RelshipExp: DataViewFilterCodec.serializeStored(
        DataViewFilter.condition({field: 'Other.Id', operator: 'eq', value: {Type: 'GetTableField', Field: 'Orders.Id'}}),
      ), IsCascadeDeletion: 0, createuser: 'admin', createtime: '2026-01-01'},
      {rowid: 'RL2', pkdbid: 'DB1', pktbid: 'T2', pktable: 'Other', fkdbid: 'DB1', fktbid: 'T9', fktable: 'Remote', rlname: 'Other to Remote', RelshipExp: '', IsCascadeDeletion: 0, createuser: 'admin', createtime: '2026-01-02'},
    ],
    [DATABASE_CATALOG_WORKFLOW_MODEL]: [
      {rowid: 'W1', tblid: 'T1', name: '订单流', workflow_key: 'order_flow', description: '表 T1 绑定流', status: '1', version: '1.0'},
      {rowid: 'W2', tblid: 'T2', name: '其它流', workflow_key: 'other_flow', description: '', status: '0', version: '0.1'},
    ],
    [DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL]: [
      {rowid: 'WS1', txt: '启用', val: '1', ordIdx: 1},
      {rowid: 'WS2', txt: '停用', val: '0', ordIdx: 2},
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
      return {data: this.unregisteredTableBody ?? this.unregisteredByDb[dbId] ?? [], status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url?.startsWith('/api/View/getUnregisteredView/')) {
      const dbId = decodeURIComponent(config.url.slice('/api/View/getUnregisteredView/'.length))
      return {data: this.unregisteredViewsByDb[dbId] ?? [], status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url?.startsWith('/api/Table/registerTable/')) {
      const dbId = decodeURIComponent(config.url.slice('/api/Table/registerTable/'.length))
      const payload = config.data as Array<{table_name?: string; table_comment?: string; hasDefaultFields?: number}>
      const names = payload.map(item => String(item.table_name ?? '').trim())
      if (names.some(name => this.failRegisterTableNames.has(name))) {
        return {data: {Code: 500, Result: {success: false, message: '注册项被拒绝'}, Message: '注册项被拒绝'}, status: 200, statusText: 'OK', headers: {}}
      }
      const result = this.registerTableResult ?? Object.fromEntries(names.map(name => [name,
        this.definitelyRejectRegisterTableNames.has(name) ? '表不存在' : '注册成功']))
      const receipt = result as Record<string, unknown>
      for (const item of payload) {
        const tblname = String(item.table_name ?? '').trim()
        if (!tblname || receipt[tblname] !== '注册成功') continue
        this.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({
          rowid: `T-REG-${tblname}`, dbid: dbId, tblname, tbldesc: String(item.table_comment ?? ''), schemaName: 'dbo', status: 1,
        })
      }
      if (names.some(name => this.applyThenFailRegisterTableNames.has(name))) {
        if (names.some(name => this.failCatalogReadAfterRegisterNames.has(name))) this.failNextCatalogRead = true
        const error = new Error('注册请求连接中断')
        error.name = 'RequestError'
        Object.assign(error, {status: 503})
        throw error
      }
      return {data: {Code: 200, Result: result, Message: 'OK'}, status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url?.startsWith('/api/View/registerView/')) {
      const dbId = decodeURIComponent(config.url.slice('/api/View/registerView/'.length))
      const payload = config.data as Array<{table_name?: string}>
      const names = payload.map(item => String(item.table_name ?? '').trim())
      if (names.some(name => this.failRegisterViewNames.has(name))) {
        return {data: {Code: 500, Result: {success: false, message: '注册视图项被拒绝'}, Message: '注册视图项被拒绝'}, status: 200, statusText: 'OK', headers: {}}
      }
      const result = this.registerViewResult ?? Object.fromEntries(names.map(name => [name, '注册成功']))
      const receipt = result as Record<string, unknown>
      for (const item of payload) {
        const vewname = String(item.table_name ?? '').trim()
        if (!vewname || receipt[vewname] !== '注册成功') continue
        this.rows[DATABASE_CATALOG_VIEW_MODEL]!.push({
          rowid: `V-REG-${vewname}`, dbid: dbId, vewname, vewdesc: '', SchemaName: 'dbo', status: 1,
        })
      }
      if (names.some(name => this.applyThenFailRegisterViewNames.has(name))) {
        const error = new Error('视图注册请求连接中断')
        error.name = 'RequestError'
        Object.assign(error, {status: 503})
        throw error
      }
      return {data: {Code: 200, Result: result, Message: 'OK'}, status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url?.startsWith('/api/Table/SyncMetaData/')) {
      const parts = config.url.slice('/api/Table/SyncMetaData/'.length).split('/')
      const tableId = decodeURIComponent(parts[1] ?? '')
      const fieldRows = this.rows[DATABASE_CATALOG_FIELD_MODEL]!
      if (!fieldRows.some(row => row['tblid'] === tableId && row['enname'] === 'SyncedCol')) {
        fieldRows.push({rowid: 'F-SYNC', tblid: tableId, enname: 'SyncedCol', cnname: '同步列', DataTypeName: 'string', DataLen: '50', IsPKey: 0, ordIdx: 99})
      }
      return {data: {Code: 200, Result: true, Message: 'OK'}, status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      const payload = config.data as Array<{TableName?: string; CrudModel?: {Added?: Record<string, unknown>[]; Changed?: Record<string, unknown>[]; Deleted?: Record<string, unknown>[]}}>
      if (this.rejectNextRelationSave && payload.some(item => item.TableName === DATABASE_CATALOG_RELATION_MODEL)) {
        this.rejectNextRelationSave = false
        return {data: {Code: 200, Result: {success: false, message: '服务器拒绝关系保存'}}, status: 200, statusText: 'OK', headers: {}}
      }
      const addedBuckets: Array<Record<string, Record<string, unknown>[]>> = []
      const changedBuckets: Array<Record<string, Record<string, unknown>[]>> = []
      const deletedBuckets: Array<Record<string, Record<string, unknown>[]>> = []
      let fieldSeq = 0
      for (const item of payload) {
        const tableName = item.TableName
        const itemAdded = item.CrudModel?.Added ?? []
        if (itemAdded.length > 0) {
          const physical: Record<string, unknown>[] = []
          for (const row of itemAdded) {
            physical.push(row)
            if (tableName === DATABASE_CATALOG_TABLE_MODEL || (Object.hasOwn(row, 'tblname') && !Object.hasOwn(row, 'enname'))) {
              this.rows[DATABASE_CATALOG_TABLE_MODEL]!.push({
                rowid: 'T-NEW', dbid: 'DB1', tblname: '', tbldesc: '', schemaName: 'dbo', status: 1, createuser: 'admin', createtime: '2026-01-01', ...row,
              })
            } else if (tableName === DATABASE_CATALOG_FIELD_MODEL || Object.hasOwn(row, 'enname')) {
              fieldSeq += 1
              this.rows[DATABASE_CATALOG_FIELD_MODEL]!.push({rowid: `F-NEW-${fieldSeq}`, tblid: 'T1', ordIdx: 99, ...row})
            } else if (tableName === DATABASE_CATALOG_RELATION_MODEL) {
              this.rows[DATABASE_CATALOG_RELATION_MODEL]!.push({
                rowid: `RL-NEW-${this.rows[DATABASE_CATALOG_RELATION_MODEL]!.length + 1}`,
                createuser: 'admin',
                createtime: '2026-01-03',
                IsCascadeDeletion: 0,
                ...row,
              })
            } else {
              this.rows[DATABASE_CATALOG_DB_MODEL]!.push({
                rowid: 'DB-NEW', serverId: 'S1', Name: '', SchemaName: 'dbo', ServerName: '主库', Type: 'MYSQL', State: '1', Remark: '', ...row,
              })
            }
          }
          addedBuckets.push({physical})
        }
        const itemChanged = item.CrudModel?.Changed ?? []
        if (itemChanged.length > 0) {
          changedBuckets.push({physical: [...itemChanged]})
          for (const row of itemChanged) {
            const id = row['rowid']
            const storeKey = tableName && this.rows[tableName] ? tableName : DATABASE_CATALOG_FIELD_MODEL
            const store = this.rows[storeKey]!
            const index = store.findIndex(entry => entry['rowid'] === id)
            if (index >= 0) store[index] = {...store[index]!, ...row}
          }
        }
        const itemDeleted = item.CrudModel?.Deleted ?? []
        if (itemDeleted.length > 0) {
          deletedBuckets.push({physical: [...itemDeleted]})
          if (tableName && this.rows[tableName]) {
            for (const row of itemDeleted) {
              const id = row['rowid']
              this.rows[tableName] = this.rows[tableName]!.filter(entry => entry['rowid'] !== id)
            }
          }
        }
      }
      return {data: {Code: 200, Result: {
        ...(addedBuckets.length ? {maplistadd: addedBuckets} : {}),
        ...(changedBuckets.length ? {maplistedit: changedBuckets} : {}),
        ...(deletedBuckets.length ? {maplistdelete: deletedBuckets} : {}),
      }}, status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url !== '/api/DataOperation/GetData') throw new Error(`unexpected request ${config.url ?? ''}`)
    if (this.failNextCatalogRead && config.url === '/api/DataOperation/GetData') {
      this.failNextCatalogRead = false
      const error = new Error('目录查询连接中断')
      error.name = 'RequestError'
      Object.assign(error, {status: 503})
      throw error
    }
    const body = config.data as {Table: Array<Record<string, unknown>>; PageParam?: {index?: number; size?: number}}
    const table = body.Table[0]!
    const tableType = String(table['Type'] ?? '')
    if (tableType === '数据库表' || tableType === '数据库视图' || (table['DbId'] && table['OutputType'] === 'Table')) {
      const page = body.PageParam ?? {index: 1, size: 10}
      const previewRows = tableType === '数据库视图'
        ? [{rowid: 'VP1', Total: '100.00'}, {rowid: 'VP2', Total: '200.00'}]
        : [
          {rowid: 'P1', Id: '1', Name: '预览行一'},
          {rowid: 'P2', Id: '2', Name: '预览行二'},
        ]
      const index = Math.max(1, Number(page.index) || 1)
      const size = Math.max(1, Number(page.size) || 10)
      const start = (index - 1) * size
      const slice = previewRows.slice(start, start + size)
      return {data: {Code: 200, Result: {primaryKeyField: 'rowid', data: {Items: slice, Count: previewRows.length}}}, status: 200, statusText: 'OK', headers: {}}
    }
    const tableName = String(table['Name'] ?? '')
    if (this.failNextVerifyRead && tableName === DATABASE_CATALOG_TABLE_MODEL) {
      this.failNextVerifyRead = false
      const error = new Error('精确登记核验连接中断')
      error.name = 'RequestError'
      Object.assign(error, {status: 503})
      throw error
    }
    const page = body.PageParam ?? {index: 1, size: 20}
    if (this.failNextDirectoryRead && tableName === DATABASE_CATALOG_TABLE_MODEL) {
      if (!this.directoryReadSkipped) this.directoryReadSkipped = true
      else {
        this.failNextDirectoryRead = false
        this.directoryReadSkipped = false
        const error = new Error('目录刷新连接中断')
        error.name = 'RequestError'
        Object.assign(error, {status: 503})
        throw error
      }
    }
    let rows = [...(this.rows[tableName] ?? [])]
    if (table['Filter']) {
      const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(table['Filter']))
      rows = rows.filter(row => filter.matches(row))
    }
    const model = databaseTableViewModels[tableName as keyof typeof databaseTableViewModels]
    const fieldNames = model?.fields.map(field => field.name) ?? []
    const allowAdd = tableName === DATABASE_CATALOG_DB_MODEL || tableName === DATABASE_CATALOG_TABLE_MODEL
      || tableName === DATABASE_CATALOG_RELATION_MODEL
    const pageIndex = Math.max(1, Number(page.index) || 1)
    const pageSize = Math.max(1, Number(page.size) || 20)
    const pageRows = rows.slice((pageIndex - 1) * pageSize, pageIndex * pageSize)
    const deniedFields = new Set(this.deniedFieldsByModel[tableName] ?? [])
    const hiddenFields = new Set(this.hiddenFieldsByModel[tableName] ?? [])
    return {data: {Code: 200, Result: {primaryKeyField: tableName === DATABASE_CATALOG_DB_MODEL ? this.databasePrimaryKey : model?.primaryKey ?? 'rowid', allowAdd, lingma_sys_key: 'table-key',
      data: {Items: pageRows.map(row => ({
        ...row,
        lingma_sys_key: 'row-key',
        lingma_sys_params: {r: fieldNames.filter(field => !hiddenFields.has(field)), e: fieldNames.filter(field => !deniedFields.has(field) && !hiddenFields.has(field)), h: [...hiddenFields], m: [], d: tableName === DATABASE_CATALOG_TABLE_MODEL
          || tableName === DATABASE_CATALOG_VIEW_MODEL
          || tableName === DATABASE_CATALOG_RELATION_MODEL},
      })), ...(this.omitCountByModel.has(tableName) ? {} : {Count: rows.length})}}},
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
