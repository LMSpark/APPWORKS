/**
 * @module app:lowcode/resources/database/lowcode-database-dataset-extensions
 * 职责：Db 专题命令视图端点映射；装配调用 spark-data DataSet 命令 helper。
 * 边界：仅供 lowcode-database-*.ts 调用；页面与 view-ops 只消费 DataView.refresh/saveChanges。
 */
import {
  bindDataSetCommandSubmit,
  bindDataSetReadonlyCommandQuery,
  ensureDataSetFileCommandView,
  ensureDataSetStaticInputTable,
  type DataColumn,
  type DataRow,
  type DataSetCommandScopeGuard,
  type DataSet,
} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'

type DatabaseCommandAttachInput = Readonly<{
  dataSet: DataSet
  http: HttpClientBase
  assertScope: DataSetCommandScopeGuard
}>

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

function ensureCatalogCommandInputTable(dataSet: DataSet, commandInput: string): void {
  ensureDataSetStaticInputTable(dataSet, commandInput, [
    {name: 'commandId', primary: true}, {name: 'serverId'}, {name: 'dbId'},
  ])
  const input = dataSet.getTable(commandInput)
  if (!input) throw new Error('目录命令输入表未装配')
  if (input.rows.length === 0) input.addRows([{commandId: 'default', serverId: '', dbId: ''}])
}

function attachUnregisteredDbNamesView(
  ctx: DatabaseCommandAttachInput,
  tables: Readonly<{commandInput: string; unregisteredDbNames: string}>,
): void {
  const {dataSet, http, assertScope} = ctx
  if (dataSet.getTable(tables.unregisteredDbNames)) return
  const namesView = ensureDataSetFileCommandView({dataSet, tableName: tables.unregisteredDbNames, resourceId: 'database-unregistered-names', columns: [{name: 'name', primary: true}]})
  bindDataSetReadonlyCommandQuery(namesView, {
    resource: {resourceType: 'file', resourceId: 'database-unregistered-names'},
    guard: assertScope,
    queryColumns: view => view.dataTable?.columns.filter(column => column.name === 'name') ?? [],
    loadRows: async () => {
      const serverId = scalar(dataSet.getTable(tables.commandInput)?.rows[0]?.['serverId'])
      if (!serverId) throw new Error('查询未登记数据库缺少服务器 ID')
      const response = await http.get<string[]>(`/api/Db/getUnregisteredDb/${encodeURIComponent(serverId)}`)
      if (!Array.isArray(response)) throw new Error('未登记数据库列表响应格式无效')
      return response.filter(name => typeof name === 'string' && name.trim() !== '').map(name => ({name: name.trim()}))
    },
  })
}

function attachUnregisteredTableNamesView(
  ctx: DatabaseCommandAttachInput,
  tables: Readonly<{commandInput: string; unregisteredTableNames: string}>,
): void {
  const {dataSet, http, assertScope} = ctx
  if (dataSet.getTable(tables.unregisteredTableNames)) return
  const tableNamesView = ensureDataSetFileCommandView({dataSet, tableName: tables.unregisteredTableNames, resourceId: 'database-unregistered-tables', columns: [{name: 'name', primary: true}]})
  bindDataSetReadonlyCommandQuery(tableNamesView, {
    resource: {resourceType: 'file', resourceId: 'database-unregistered-tables'},
    guard: assertScope,
    queryColumns: view => view.dataTable?.columns.filter(column => column.name === 'name') ?? [],
    loadRows: async () => {
      const dbId = scalar(dataSet.getTable(tables.commandInput)?.rows[0]?.['dbId'])
      if (!dbId) throw new Error('查询未登记数据表缺少数据库 ID')
      const response = await http.get<string[]>(`/api/Db/getUnregisteredTable/${encodeURIComponent(dbId)}`)
      if (!Array.isArray(response)) throw new Error('未登记数据表列表响应格式无效')
      return response.filter(name => typeof name === 'string' && name.trim() !== '').map(name => ({name: name.trim()}))
    },
  })
}

function attachUnregisteredViewNamesView(
  ctx: DatabaseCommandAttachInput,
  tables: Readonly<{commandInput: string; unregisteredViewNames: string}>,
): void {
  const {dataSet, http, assertScope} = ctx
  if (dataSet.getTable(tables.unregisteredViewNames)) return
  const viewNamesView = ensureDataSetFileCommandView({dataSet, tableName: tables.unregisteredViewNames, resourceId: 'database-unregistered-views', columns: [{name: 'name', primary: true}]})
  bindDataSetReadonlyCommandQuery(viewNamesView, {
    resource: {resourceType: 'file', resourceId: 'database-unregistered-views'},
    guard: assertScope,
    queryColumns: view => view.dataTable?.columns.filter(column => column.name === 'name') ?? [],
    loadRows: async () => {
      const dbId = scalar(dataSet.getTable(tables.commandInput)?.rows[0]?.['dbId'])
      if (!dbId) throw new Error('查询未登记视图缺少数据库 ID')
      const response = await http.get<string[]>(`/api/View/getUnregisteredView/${encodeURIComponent(dbId)}`)
      if (!Array.isArray(response)) throw new Error('未登记视图列表响应格式无效')
      return response.filter(name => typeof name === 'string' && name.trim() !== '').map(name => ({name: name.trim()}))
    },
  })
}

export type AttachCatalogCommandViewsInput = DatabaseCommandAttachInput & Readonly<{
  tables: Readonly<{commandInput: string; unregisteredDbNames: string; unregisteredTableNames?: string; unregisteredViewNames?: string}>
}>

export function attachCatalogCommandViews(input: AttachCatalogCommandViewsInput): void {
  const {dataSet, tables} = input
  const ctx: DatabaseCommandAttachInput = input
  ensureCatalogCommandInputTable(dataSet, tables.commandInput)
  attachUnregisteredDbNamesView(ctx, tables)
  if (tables.unregisteredTableNames) {
    attachUnregisteredTableNamesView(ctx, {commandInput: tables.commandInput, unregisteredTableNames: tables.unregisteredTableNames})
  }
  if (tables.unregisteredViewNames) {
    attachUnregisteredViewNamesView(ctx, {commandInput: tables.commandInput, unregisteredViewNames: tables.unregisteredViewNames})
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** AjaxResult `{Code, Message, Result}`：Code 0/200 为成功，其余为后端明确拒绝。 */
function commandAjaxResult(response: unknown, fallbackMessage: string): unknown {
  if (!isRecord(response) || !('Code' in response)) return response
  const code = Number(response['Code'])
  if (code === 0 || code === 200) return response['Result']
  throw new Error(scalar(response['Message']) || scalar(response['Msg']) || `${fallbackMessage}（${scalar(response['Code'])}）`)
}

function registerResult(response: unknown): unknown {
  return commandAjaxResult(response, '注册服务器失败')
}

/** 连接中断、超时或服务端 5xx 时不能断定注册是否已生效。 */
function registerUnconfirmed(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== 'RequestError' || !('status' in error)) return false
  const status = Number(error.status)
  return status === 0 || status >= 500
}

/**
 * 注册服务器写命令视图：一行新增 = 一次 `/Db/registerServer`（后端测连、查重、写企业归属并加密密码）。
 * 结果未知时按前端生成的 rowid 重新读取服务器目录核验，不重放注册。
 */
export type AttachServerRegisterViewInput = DatabaseCommandAttachInput & Readonly<{
  register: string
  catalog: string
  columns: DataColumn[]
}>

export function attachServerRegisterView(input: AttachServerRegisterViewInput): void {
  const {dataSet, http, assertScope, register, catalog, columns} = input
  const options = {register, catalog, columns}
  if (dataSet.getTable(options.register)) return
  const table = dataSet.addTable(options.register, options.columns.map(column => ({...column})))
  table.resourceType = 'file'
  table.resourceId = 'database-server-register'
  const view = dataSet.getView(options.register, 'default')
  if (!view) throw new Error('注册服务器命令视图缺失')
  view.commitMode = 'staged'
  const fields = options.columns.filter(column => !column.isPrimaryKey).map(column => column.name)
  bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-server-register'},
    guard: assertScope,
    inputFields: fields,
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: registerUnconfirmed,
    submit: async row => {
      const payload: Record<string, string> = {rowid: scalar(row['rowid'])}
      for (const field of fields) payload[field] = field === 'Type' ? scalar(row[field]).toUpperCase() : scalar(row[field])
      const result = registerResult(await http.post<unknown>('/api/Db/registerServer', payload))
      const returned = isRecord(result) ? result : {}
      const rowid = scalar(returned['rowid']) || scalar(returned['serverId']) || payload['rowid']
      const accepted: DataRow = {rowid}
      for (const field of fields) if (field !== 'Password') accepted[field] = Object.hasOwn(returned, field) ? scalar(returned[field]) : payload[field]
      return accepted
    },
    verify: async row => {
      const catalogView = dataSet.getView(options.catalog, 'default')
      if (!catalogView) throw new Error('核验注册结果缺少服务器目录视图')
      await catalogView.refresh()
      if (catalogView.loadingError) throw catalogView.loadingError
      const rowid = scalar(row['rowid'])
      const found = catalogView.rows.find(item => catalogView.getPkKey(item) === rowid)
      if (!found) return undefined
      const accepted: DataRow = {rowid}
      for (const field of fields) if (field !== 'Password') accepted[field] = scalar(found[field])
      return accepted
    },
  })
}

/**
 * 同步表元数据写命令：`POST /Table/SyncMetaData/{dbid}/{tableid}`。
 * verify 通过刷新字段目录确认同步已反映到 Base_TblField。
 */
export type AttachTableRegisterCommandViewInput = DatabaseCommandAttachInput & Readonly<{
  register: string
  catalogModel: string
}>

export function attachTableRegisterCommandView(input: AttachTableRegisterCommandViewInput): void {
  const {dataSet, http, assertScope, register, catalogModel} = input
  const options = {register, catalogModel}
  if (dataSet.getTable(options.register)) return
  const table = dataSet.addTable(options.register, [
    {name: 'rowid', type: 'string', isPrimaryKey: true, label: 'rowid'},
    {name: 'dbid', type: 'string', label: '数据库', required: true},
    {name: 'tableName', type: 'string', label: '表名', required: true},
    {name: 'tableComment', type: 'string', label: '表说明'},
    {name: 'addDefaultFields', type: 'string', label: '默认字段'},
  ])
  table.resourceType = 'file'
  table.resourceId = 'database-table-register'
  const view = dataSet.getView(options.register, 'default')
  if (!view) throw new Error('注册数据表命令视图缺失')
  view.commitMode = 'staged'
  bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-table-register'},
    guard: assertScope,
    inputFields: ['dbid', 'tableName', 'tableComment', 'addDefaultFields'],
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: registerUnconfirmed,
    submit: async row => {
      const dbid = scalar(row['dbid'])
      const tableName = scalar(row['tableName'])
      if (!dbid || !tableName) throw new Error('注册表缺少数据库或表名')
      const addDefault = scalar(row['addDefaultFields']) === '1'
      commandAjaxResult(await http.post<unknown>(`/api/Table/registerTable/${encodeURIComponent(dbid)}`, [{
        table_name: tableName,
        table_comment: scalar(row['tableComment']),
        hasDefaultFields: addDefault ? 1 : 0,
      }]), '注册表失败')
      return {
        rowid: scalar(row['rowid']),
        dbid,
        tableName,
        tableComment: scalar(row['tableComment']),
        addDefaultFields: addDefault ? '1' : '0',
      }
    },
    verify: async row => {
      const catalogView = dataSet.getView(options.catalogModel, 'default')
      if (!catalogView) throw new Error('核验注册表结果缺少表目录视图')
      await catalogView.refresh()
      if (catalogView.loadingError) throw catalogView.loadingError
      const dbid = scalar(row['dbid'])
      const tableName = scalar(row['tableName'])
      const found = catalogView.rows.find(item => scalar(item['dbid']) === dbid && scalar(item['tblname']) === tableName)
      return found ? row : undefined
    },
  })
}

export type AttachViewRegisterCommandViewInput = DatabaseCommandAttachInput & Readonly<{
  register: string
  catalogModel: string
}>

export function attachViewRegisterCommandView(input: AttachViewRegisterCommandViewInput): void {
  const {dataSet, http, assertScope, register, catalogModel} = input
  const options = {register, catalogModel}
  if (dataSet.getTable(options.register)) return
  const table = dataSet.addTable(options.register, [
    {name: 'rowid', type: 'string', isPrimaryKey: true, label: 'rowid'},
    {name: 'dbid', type: 'string', label: '数据库', required: true},
    {name: 'viewName', type: 'string', label: '视图名', required: true},
    {name: 'viewComment', type: 'string', label: '视图说明'},
  ])
  table.resourceType = 'file'
  table.resourceId = 'database-view-register'
  const view = dataSet.getView(options.register, 'default')
  if (!view) throw new Error('注册视图命令视图缺失')
  view.commitMode = 'staged'
  bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-view-register'},
    guard: assertScope,
    inputFields: ['dbid', 'viewName', 'viewComment'],
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: registerUnconfirmed,
    submit: async row => {
      const dbid = scalar(row['dbid'])
      const viewName = scalar(row['viewName'])
      if (!dbid || !viewName) throw new Error('注册视图缺少数据库或视图名')
      commandAjaxResult(await http.post<unknown>(`/api/View/registerView/${encodeURIComponent(dbid)}`, [{
        table_name: viewName,
      }]), '注册视图失败')
      return {rowid: scalar(row['rowid']), dbid, viewName, viewComment: scalar(row['viewComment'])}
    },
    verify: async row => {
      const catalogView = dataSet.getView(options.catalogModel, 'default')
      if (!catalogView) throw new Error('核验注册视图结果缺少视图目录视图')
      await catalogView.refresh()
      if (catalogView.loadingError) throw catalogView.loadingError
      const dbid = scalar(row['dbid'])
      const viewName = scalar(row['viewName'])
      const found = catalogView.rows.find(item => scalar(item['dbid']) === dbid && scalar(item['vewname']) === viewName)
      return found ? row : undefined
    },
  })
}

export type AttachTableSyncMetaDataViewInput = DatabaseCommandAttachInput & Readonly<{
  sync: string
  fieldTableView: string
  fieldModel: string
  tableCatalogModel: string
}>

export function attachTableSyncMetaDataView(input: AttachTableSyncMetaDataViewInput): void {
  const {dataSet, http, assertScope, sync, fieldTableView, fieldModel, tableCatalogModel} = input
  const options = {sync, fieldTableView, fieldModel, tableCatalogModel}
  if (dataSet.getTable(options.sync)) return
  const table = dataSet.addTable(options.sync, [
    {name: 'rowid', type: 'string', isPrimaryKey: true, label: 'rowid'},
    {name: 'dbid', type: 'string', label: '数据库'},
    {name: 'tableid', type: 'string', label: '表'},
  ])
  table.resourceType = 'file'
  table.resourceId = 'database-table-sync-metadata'
  const view = dataSet.getView(options.sync, 'default')
  if (!view) throw new Error('同步元数据命令视图缺失')
  view.commitMode = 'staged'
  bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-table-sync-metadata'},
    guard: assertScope,
    inputFields: ['dbid', 'tableid'],
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: registerUnconfirmed,
    submit: async row => {
      const dbid = scalar(row['dbid'])
      const tableid = scalar(row['tableid'])
      if (!dbid || !tableid) throw new Error('同步元数据缺少数据库或表 ID')
      commandAjaxResult(await http.post<unknown>(`/api/Table/SyncMetaData/${encodeURIComponent(dbid)}/${encodeURIComponent(tableid)}`, {}), '同步元数据失败')
      return {rowid: scalar(row['rowid']), dbid, tableid}
    },
    verify: async row => {
      const fieldView = dataSet.getView(options.fieldModel, options.fieldTableView)
      if (!fieldView) throw new Error('核验同步结果缺少字段目录视图')
      const tableList = dataSet.getView(options.tableCatalogModel, 'default')
      const tblid = scalar(row['tableid'])
      const parentRow = tableList?.rows.find(item => tableList.getPkKey(item) === tblid)
      if (tableList && parentRow) tableList.setSelectedRows([parentRow])
      await fieldView.refresh()
      if (fieldView.loadingError) throw fieldView.loadingError
      return fieldView.rows.length > 0 ? row : undefined
    },
  })
}

export type AttachServerConnectionTestViewsInput = DatabaseCommandAttachInput & Readonly<{
  tables: Readonly<{commandInput: string; testResult: string}>
}>

export function attachServerConnectionTestViews(input: AttachServerConnectionTestViewsInput): void {
  const {dataSet, http, assertScope, tables} = input
  if (dataSet.getTable(tables.testResult)) return
  ensureDataSetStaticInputTable(dataSet, tables.commandInput, [
    {name: 'commandId', primary: true},
    {name: 'Type'}, {name: 'ServerName'}, {name: 'ip_address'}, {name: 'UserName'}, {name: 'Password'}, {name: 'Port'},
  ])
  const commandInputTable = dataSet.getTable(tables.commandInput)
  if (!commandInputTable) throw new Error('连接测试命令输入表未装配')
  if (commandInputTable.rows.length === 0) {
    commandInputTable.addRows([{commandId: 'default', Type: '', ServerName: '', ip_address: '', UserName: '', Password: '', Port: ''}])
  }
  const resultView = ensureDataSetFileCommandView({dataSet, tableName: tables.testResult, resourceId: 'database-connection-test', columns: [{name: 'ok', primary: true}]})
  bindDataSetReadonlyCommandQuery(resultView, {
    resource: {resourceType: 'file', resourceId: 'database-connection-test'},
    guard: assertScope,
    loadRows: async () => {
      const value = dataSet.getTable(tables.commandInput)?.rows[0]
      if (!value) throw new Error('连接测试缺少输入行')
      const payload = {
        Type: scalar(value['Type']).toUpperCase(),
        ServerName: scalar(value['ServerName']),
        ip_address: scalar(value['ip_address']),
        UserName: scalar(value['UserName']),
        Password: scalar(value['Password']),
        Port: scalar(value['Port']),
      }
      if (!payload.Type) throw new Error('请选择数据库类型')
      if (!payload.ServerName || !payload.ip_address) throw new Error('请填写服务器名称与主机地址')
      const response = await http.post<boolean>('/api/Db/testConnection', payload)
      return [{ok: response === true ? 'true' : 'false'}]
    },
  })
}
