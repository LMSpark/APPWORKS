/**
 * @module app:lowcode/resources/database/lowcode-database-dataset-extensions
 * 职责：Db 专题命令视图端点映射；装配调用 spark-data DataSet 命令 helper。
 * 边界：仅供 lowcode-database-*.ts 调用；页面与 view-ops 只消费 DataView.refresh/saveChanges。
 */
import * as SparkData from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'

type DataColumn = SparkData.DataColumn
type DataRow = SparkData.DataRow
type DataSetCommandScopeGuard = SparkData.DataSetCommandScopeGuard
type DataSet = SparkData.DataSet

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
  SparkData.ensureDataSetStaticInputTable(dataSet, commandInput, [
    {name: 'commandId', primary: true}, {name: 'serverId'}, {name: 'dbId'}, {name: 'addDefaultFields'}, {name: 'batchId'},
  ])
  const input = dataSet.getTable(commandInput)
  if (!input) throw new Error('目录命令输入表未装配')
  if (input.rows.length === 0) input.addRows([{commandId: 'default', serverId: '', dbId: '', addDefaultFields: '1', batchId: crypto.randomUUID()}])
  else if (input.rows[0] && !scalar(input.rows[0]['batchId'])) input.rows[0]['batchId'] = crypto.randomUUID()
  const view = dataSet.getView(commandInput, 'default')
  if (view) {
    view.commitMode = 'staged'
    if (input.rows[0]) view.setCurrentRow(input.rows[0])
  }
}

function attachUnregisteredDbNamesView(
  ctx: DatabaseCommandAttachInput,
  tables: Readonly<{commandInput: string; unregisteredDbNames: string}>,
): void {
  const {dataSet, http, assertScope} = ctx
  if (dataSet.getTable(tables.unregisteredDbNames)) return
  const namesView = SparkData.ensureDataSetFileCommandView({dataSet, tableName: tables.unregisteredDbNames, resourceId: 'database-unregistered-names', columns: [{name: 'name', primary: true}]})
  SparkData.bindDataSetReadonlyCommandQuery(namesView, {
    resource: {resourceType: 'file', resourceId: 'database-unregistered-names'},
    guard: assertScope,
    queryColumns: view => view.dataTable?.columns.filter(column => column.name === 'name') ?? [],
    loadRows: async () => {
      const serverId = scalar(dataSet.getTable(tables.commandInput)?.rows[0]?.['serverId'])
      if (!serverId) throw new Error('查询未登记数据库缺少服务器 ID')
      const response = await http.get<string[]>(`/api/Db/getUnregisteredDb/${encodeURIComponent(serverId)}`)
      if (!Array.isArray(response)) throw new Error('未登记数据库列表响应格式无效')
      return response.filter((name: unknown): name is string => typeof name === 'string' && name.trim() !== '').map(name => ({name: name.trim()}))
    },
  })
}

function attachUnregisteredTableNamesView(
  ctx: DatabaseCommandAttachInput,
  tables: Readonly<{commandInput: string; unregisteredTableNames: string}>,
): void {
  const {dataSet, http, assertScope} = ctx
  if (dataSet.getTable(tables.unregisteredTableNames)) return
  const tableNamesView = SparkData.ensureDataSetFileCommandView({dataSet, tableName: tables.unregisteredTableNames, resourceId: 'database-unregistered-tables', columns: [{name: 'name', primary: true}]})
  SparkData.bindDataSetReadonlyCommandQuery(tableNamesView, {
    resource: {resourceType: 'file', resourceId: 'database-unregistered-tables'},
    guard: assertScope,
    queryColumns: view => view.dataTable?.columns.filter(column => column.name === 'name') ?? [],
    loadRows: async () => {
      const dbId = scalar(dataSet.getTable(tables.commandInput)?.rows[0]?.['dbId'])
      if (!dbId) throw new Error('查询未登记数据表缺少数据库 ID')
      const response = commandAjaxResult(await http.get<unknown>(`/api/Db/getUnregisteredTable/${encodeURIComponent(dbId)}`), '查询未登记数据表失败')
      if (!Array.isArray(response)) throw new Error('未登记数据表列表响应格式无效')
      return response.filter((name: unknown): name is string => typeof name === 'string' && name.trim() !== '').map(name => ({name: name.trim()}))
    },
  })
}

function attachUnregisteredViewNamesView(
  ctx: DatabaseCommandAttachInput,
  tables: Readonly<{commandInput: string; unregisteredViewNames: string}>,
): void {
  const {dataSet, http, assertScope} = ctx
  if (dataSet.getTable(tables.unregisteredViewNames)) return
  const viewNamesView = SparkData.ensureDataSetFileCommandView({dataSet, tableName: tables.unregisteredViewNames, resourceId: 'database-unregistered-views', columns: [{name: 'name', primary: true}]})
  SparkData.bindDataSetReadonlyCommandQuery(viewNamesView, {
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
  tables: Readonly<{commandInput: string; unregisteredDbNames?: string; unregisteredTableNames?: string; unregisteredViewNames?: string}>
}>

export function attachCatalogCommandViews(input: AttachCatalogCommandViewsInput): void {
  const {dataSet, tables} = input
  const ctx: DatabaseCommandAttachInput = input
  ensureCatalogCommandInputTable(dataSet, tables.commandInput)
  if (tables.unregisteredDbNames) attachUnregisteredDbNamesView(ctx, {commandInput: tables.commandInput, unregisteredDbNames: tables.unregisteredDbNames})
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

/** 当前服务实现的逐项成功回执：精确名称键和值，不接受参考文档中的其它猜测形态。 */
type RegistrationReceiptOptions = Readonly<{
  response: unknown
  objectName: string
  fallback: string
  alreadyValue: string
  missingValue: string
}>

function requireRegistrationReceipt(options: RegistrationReceiptOptions): 'created' | 'already' {
  const {response, objectName, fallback, alreadyValue, missingValue} = options
  if (!isRecord(response) || !('Code' in response)) {
    throw new RegistrationCompletionUnknown(`${fallback}：服务未返回可核验的逐项回执`)
  }
  const code = Number(response['Code'])
  if (code !== 0 && code !== 200) {
    throw new RegistrationCompletionUnknown(scalar(response['Message']) || scalar(response['Msg']) || `${fallback}（${scalar(response['Code'])}），结果仍未知`)
  }
  const result = response['Result']
  if (isRecord(result) && result[objectName] === '注册成功') return 'created'
  if (isRecord(result) && result[objectName] === alreadyValue) return 'already'
  const diagnostic = isRecord(result) ? scalar(result[objectName]) : ''
  if (diagnostic === missingValue) throw new Error(`${fallback}：${missingValue}`)
  throw new RegistrationCompletionUnknown(diagnostic
    ? `${fallback}：${diagnostic}；未取得精确成功回执，结果仍未知`
    : `${fallback}：缺少精确对象成功回执，结果仍未知`)
}

function registerResult(response: unknown): unknown {
  return commandAjaxResult(response, '注册服务器失败')
}

/** 连接中断、超时或服务端 5xx 时不能断定注册是否已生效。 */
function registerUnconfirmed(error: unknown): boolean {
  if (error instanceof Error && error.name === 'RegistrationCompletionUnknown') return true
  if (!(error instanceof Error) || error.name !== 'RequestError' || !('status' in error)) return false
  const status = Number(error.status)
  return status === 0 || status >= 500
}

class RegistrationCompletionUnknown extends Error {
  constructor(message: string) {super(message); this.name = 'RegistrationCompletionUnknown'}
}

/** A precise already-registered receipt proves this true option was refused before field completion. */
export class RegistrationDefaultFieldsNotAppliedError extends Error {
  constructor(message: string) {super(message); this.name = 'RegistrationDefaultFieldsNotAppliedError'}
}

type VerifyRegisteredObjectOptions = Readonly<{
  dataSet: DataSet
  modelName: string
  nameField: 'tblname' | 'vewname'
  dbid: string
  objectName: string
  assertScope: DataSetCommandScopeGuard
}>

async function verifyRegisteredObject(options: VerifyRegisteredObjectOptions): Promise<void> {
  const {dataSet, modelName, nameField, dbid, objectName, assertScope} = options
  const view = dataSet.getView(modelName, 'registrationVerify')
  if (!view) throw new Error(`核验注册结果缺少正式视图 ${modelName}@registrationVerify`)
  const originalValidator = view.validateQueryResult
  const filter = SparkData.DataViewFilter.group({logic: 'and', filters: [
    SparkData.DataViewFilter.condition({field: 'dbid', operator: 'eq', value: dbid}).toJSON(),
    SparkData.DataViewFilter.condition({field: nameField, operator: 'eq', value: objectName}).toJSON(),
  ]}).toJSON()
  let validationCount = 0
  const validateCurrent = async (result: Parameters<NonNullable<typeof view.validateQueryResult>>[0]): Promise<void> => {
    await originalValidator?.(result)
    assertScope()
    if (dataSet.getView(modelName, 'registrationVerify') !== view
      || JSON.stringify(view.filterExpression) !== JSON.stringify(filter)) {
      throw new RegistrationCompletionUnknown('精确登记核验已过期，状态仍未知')
    }
    if (!result.countReported || result.total !== 1 || result.rows.length !== 1) {
      throw new RegistrationCompletionUnknown(`精确登记核验未返回唯一且完整的服务端结果，状态仍未知（countReported=${String(result.countReported)}, total=${result.total}, rows=${result.rows.length}）`)
    }
    const row = result.rows[0]
    if (!row) throw new RegistrationCompletionUnknown('精确登记核验结果为空，状态仍未知')
    const key = result.rowKey(row)
    if (typeof key !== 'string' || !key.trim() || result.fieldAccess(key, 'dbid').read !== 'visible'
      || result.fieldAccess(key, nameField).read !== 'visible'
      || scalar(row['dbid']) !== dbid || scalar(row[nameField]) !== objectName) {
      throw new RegistrationCompletionUnknown('精确登记核验字段不可读或身份不匹配，状态仍未知')
    }
    validationCount += 1
  }
  const validator = (result: Parameters<NonNullable<typeof view.validateQueryResult>>[0]): void | Promise<void> => validateCurrent(result)
  view.validateQueryResult = validator
  try {
    await view.executeFilter(filter)
    assertScope()
    const queryError = view.loadingError
    if (queryError instanceof Error) throw queryError
    if (dataSet.getView(modelName, 'registrationVerify') !== view || view.requestState !== SparkData.RequestState.Loaded
      || validationCount === 0 || JSON.stringify(view.filterExpression) !== JSON.stringify(filter)) {
      throw new RegistrationCompletionUnknown('精确登记核验未完成当前查询，状态仍未知')
    }
    if (view.rows.length !== 1) throw new RegistrationCompletionUnknown('精确登记核验没有唯一正式记录，状态仍未知')
  } catch (error) {
    if (error instanceof RegistrationCompletionUnknown) throw error
    throw new RegistrationCompletionUnknown(`精确登记核验失败，状态仍未知：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    if (view.validateQueryResult === validator) view.validateQueryResult = originalValidator
  }
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
  SparkData.bindDataSetCommandSubmit(view, {
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
    {name: 'batchKey', type: 'string', label: '批次'},
    {name: 'registrationDisposition', type: 'string', label: '命令处理状态'},
    {name: 'registrationStatus', type: 'string', label: '状态'},
  ])
  table.resourceType = 'file'
  table.resourceId = 'database-table-register'
  const view = dataSet.getView(options.register, 'default')
  if (!view) throw new Error('注册数据表命令视图缺失')
  view.commitMode = 'staged'
  const defaultFieldsAcknowledged = new WeakSet<DataRow>()
  SparkData.bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-table-register'},
    guard: assertScope,
    inputFields: ['dbid', 'tableName', 'tableComment', 'addDefaultFields', 'batchKey', 'registrationDisposition', 'registrationStatus'],
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: registerUnconfirmed,
    submit: async row => {
      const dbid = scalar(row['dbid'])
      const tableName = scalar(row['tableName'])
      if (!dbid || !tableName) throw new Error('注册表缺少数据库或表名')
      const addDefault = scalar(row['addDefaultFields']) === '1'
      const response = await http.post<unknown>(`/api/Table/registerTable/${encodeURIComponent(dbid)}`, [{
        table_name: tableName,
        table_comment: scalar(row['tableComment']),
        hasDefaultFields: addDefault ? 1 : 0,
      }])
      const receipt = requireRegistrationReceipt({response, objectName: tableName, fallback: '注册表失败', alreadyValue: '表已注册', missingValue: '表不存在'})
      if (addDefault && receipt === 'already') {
        try {
          await verifyRegisteredObject({dataSet, modelName: options.catalogModel, nameField: 'tblname', dbid, objectName: tableName, assertScope})
        } catch (error) {
          const diagnostic = error instanceof Error ? error.message : String(error)
          throw new RegistrationDefaultFieldsNotAppliedError(`服务明确返回表已注册，本次默认字段补齐未执行；正式目录读回失败：${diagnostic}`)
        }
        throw new RegistrationDefaultFieldsNotAppliedError('服务明确返回表已注册，本次默认字段补齐未执行')
      }
      if (addDefault && receipt === 'created') defaultFieldsAcknowledged.add(row)
      await verifyRegisteredObject({dataSet, modelName: options.catalogModel, nameField: 'tblname', dbid, objectName: tableName, assertScope})
      return {
        rowid: scalar(row['rowid']),
        dbid,
        tableName,
        tableComment: scalar(row['tableComment']),
        addDefaultFields: addDefault ? '1' : '0',
        batchKey: scalar(row['batchKey']),
        registrationStatus: '已确认',
      }
    },
    verify: async row => {
      const dbid = scalar(row['dbid'])
      const tableName = scalar(row['tableName'])
      if (scalar(row['addDefaultFields']) === '1' && !defaultFieldsAcknowledged.has(row)) {
        throw new RegistrationCompletionUnknown('默认字段补齐尚无正式完成回执，登记状态仍未知')
      }
      await verifyRegisteredObject({dataSet, modelName: options.catalogModel, nameField: 'tblname', dbid, objectName: tableName, assertScope})
      return {...row, registrationStatus: '已确认'}
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
    {name: 'batchKey', type: 'string', label: '批次'},
    {name: 'registrationDisposition', type: 'string', label: '命令处理状态'},
    {name: 'registrationStatus', type: 'string', label: '状态'},
  ])
  table.resourceType = 'file'
  table.resourceId = 'database-view-register'
  const view = dataSet.getView(options.register, 'default')
  if (!view) throw new Error('注册视图命令视图缺失')
  view.commitMode = 'staged'
  SparkData.bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-view-register'},
    guard: assertScope,
    inputFields: ['dbid', 'viewName', 'viewComment', 'batchKey', 'registrationDisposition', 'registrationStatus'],
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: registerUnconfirmed,
    submit: async row => {
      const dbid = scalar(row['dbid'])
      const viewName = scalar(row['viewName'])
      if (!dbid || !viewName) throw new Error('注册视图缺少数据库或视图名')
      const response = await http.post<unknown>(`/api/View/registerView/${encodeURIComponent(dbid)}`, [{
        table_name: viewName,
      }])
      requireRegistrationReceipt({response, objectName: viewName, fallback: '注册视图失败', alreadyValue: '视图已注册', missingValue: '视图不存在'})
      await verifyRegisteredObject({dataSet, modelName: options.catalogModel, nameField: 'vewname', dbid, objectName: viewName, assertScope})
      return {rowid: scalar(row['rowid']), dbid, viewName, viewComment: scalar(row['viewComment']), batchKey: scalar(row['batchKey']), registrationStatus: '已确认'}
    },
    verify: async row => {
      const dbid = scalar(row['dbid'])
      const viewName = scalar(row['viewName'])
      await verifyRegisteredObject({dataSet, modelName: options.catalogModel, nameField: 'vewname', dbid, objectName: viewName, assertScope})
      return {...row, registrationStatus: '已确认'}
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
  SparkData.bindDataSetCommandSubmit(view, {
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
  SparkData.ensureDataSetStaticInputTable(dataSet, tables.commandInput, [
    {name: 'commandId', primary: true},
    {name: 'Type'}, {name: 'ServerName'}, {name: 'ip_address'}, {name: 'UserName'}, {name: 'Password'}, {name: 'Port'},
  ])
  const commandInputTable = dataSet.getTable(tables.commandInput)
  if (!commandInputTable) throw new Error('连接测试命令输入表未装配')
  if (commandInputTable.rows.length === 0) {
    commandInputTable.addRows([{commandId: 'default', Type: '', ServerName: '', ip_address: '', UserName: '', Password: '', Port: ''}])
  }
  const resultView = SparkData.ensureDataSetFileCommandView({dataSet, tableName: tables.testResult, resourceId: 'database-connection-test', columns: [{name: 'ok', primary: true}]})
  SparkData.bindDataSetReadonlyCommandQuery(resultView, {
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
