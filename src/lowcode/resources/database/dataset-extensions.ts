/**
 * @module app:lowcode/resources/database/dataset-extensions
 * 职责：Db 专题命令视图端点映射；装配调用 spark-data DataSet 命令 helper。
 * 边界：仅供本目录的 directory、server/resource、catalog/table-view 调用；页面与 view-ops 只消费 DataView.refresh/saveChanges。
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

const catalogInputColumns = [
  {name: 'commandId', primary: true}, {name: 'serverId'}, {name: 'dbId'}, {name: 'addDefaultFields'}, {name: 'batchId'},
] as const

type CatalogInputIdentity = Readonly<{name: string; table: SparkData.DataTable; view: SparkData.DataView}>
type CatalogResultKind = 'databases' | 'tables' | 'views'
const catalogResultResources: Readonly<Record<CatalogResultKind, string>> = {
  databases: 'database-unregistered-names', tables: 'database-unregistered-tables', views: 'database-unregistered-views',
}
const catalogInputInstances = new WeakMap<SparkData.DataTable, SparkData.DataView>()
const catalogResultBindings = new WeakMap<SparkData.DataView, Readonly<{
  input: CatalogInputIdentity; binding: SparkData.DataSetReadonlyCommandBinding
}>>()

function captureCatalogInput(dataSet: DataSet, name: string): CatalogInputIdentity {
  SparkData.ensureDataSetStaticInputTable(dataSet, name, catalogInputColumns)
  const table = dataSet.getTable(name), view = dataSet.getView(name, 'default')
  if (!table || view?.destroyed !== false || view.primaryKey !== 'commandId') throw new Error('CATALOG_COMMAND_INPUT_IDENTITY: 目录命令输入视图或主键无效')
  const initialized = catalogInputInstances.get(table)
  if (initialized !== undefined && initialized !== view) throw new Error('CATALOG_COMMAND_INPUT_IDENTITY: 原目录命令输入视图已被替换')
  return {name, table, view}
}

function assertCatalogInput(dataSet: DataSet, identity: CatalogInputIdentity): void {
  if (dataSet.destroyed || dataSet.getTable(identity.name) !== identity.table
    || dataSet.getView(identity.name, 'default') !== identity.view || identity.view.destroyed) {
    throw new Error('CATALOG_COMMAND_INPUT_IDENTITY: 原目录命令输入已失效')
  }
  captureCatalogInput(dataSet, identity.name)
}

export type AttachCatalogCommandViewsInput = DatabaseCommandAttachInput & Readonly<{
  tables: Readonly<{commandInput: string; unregisteredDbNames?: string; unregisteredTableNames?: string; unregisteredViewNames?: string}>
}>

export function attachCatalogCommandViews(input: AttachCatalogCommandViewsInput): void {
  const {dataSet, http, assertScope, tables} = input
  if (dataSet.destroyed || !dataSet.scenarioId?.trim()) throw new Error('CATALOG_COMMAND_IDENTITY: 目录命令需要存活且有明确场景的 DataSet')
  assertScope()
  const descriptors = ([
    {name: tables.unregisteredDbNames, kind: 'databases'},
    {name: tables.unregisteredTableNames, kind: 'tables'},
    {name: tables.unregisteredViewNames, kind: 'views'},
  ] as const).flatMap(item => item.name === undefined ? [] : [{name: item.name, kind: item.kind}])
  const names = [tables.commandInput, ...descriptors.map(item => item.name)]
  if (names.some(name => !name.trim() || name.includes('@')) || new Set(names).size !== names.length) {
    throw new Error('CATALOG_COMMAND_TABLE_NAMES: 输入及结果表名须非空、无 @ 且互不相同')
  }
  let capturedInput = dataSet.getTable(tables.commandInput) ? captureCatalogInput(dataSet, tables.commandInput) : undefined
  const requireInput = (): CatalogInputIdentity => {
    if (!capturedInput) throw new Error('CATALOG_COMMAND_INPUT_IDENTITY: 目录命令输入尚未装配')
    return capturedInput
  }
  const prepare = (view: SparkData.DataView, kind: CatalogResultKind): SparkData.DataSetReadonlyCommandBinding =>
    SparkData.prepareDataSetReadonlyCommandQuery(view, {
      resource: {resourceType: 'file', resourceId: catalogResultResources[kind]},
      guard: () => {assertScope(); assertCatalogInput(dataSet, requireInput())},
      captureQueryInputs: () => {
        const identity = requireInput(), row = identity.table.rows[0], field = kind === 'databases' ? 'serverId' : 'dbId'
        const id = scalar(row?.[field])
        return () => {
          if (identity.table.rows[0] !== row || scalar(row?.[field]) !== id) {
            throw new Error('CATALOG_COMMAND_INPUT_CHANGED: 本次目录查询目标已切换')
          }
        }
      },
      queryColumns: target => target.dataTable?.columns.filter(column => column.name === 'name') ?? [],
      loadRows: async () => {
        const row = requireInput().table.rows[0]
        const id = scalar(row?.[kind === 'databases' ? 'serverId' : 'dbId'])
        if (!id) throw new Error(kind === 'databases' ? '查询未登记数据库缺少服务器 ID' : '查询未登记对象缺少数据库 ID')
        let response: unknown
        if (kind === 'databases') response = commandAjaxResult(await http.get<unknown>(`/api/Db/getUnregisteredDb/${encodeURIComponent(id)}`), '查询未登记数据库失败')
        else if (kind === 'tables') response = commandAjaxResult(await http.get<unknown>(`/api/Db/getUnregisteredTable/${encodeURIComponent(id)}`), '查询未登记数据表失败')
        else response = await http.get<unknown>(`/api/View/getUnregisteredView/${encodeURIComponent(id)}`)
        if (!Array.isArray(response)) throw new Error('未登记对象列表响应格式无效')
        return response.filter((name: unknown): name is string => typeof name === 'string' && name.trim() !== '').map(name => ({name: name.trim()}))
      },
    })
  const plans = descriptors.map(descriptor => {
    if (!dataSet.getTable(descriptor.name)) return {...descriptor, view: undefined, binding: undefined}
    const view = SparkData.ensureDataSetFileCommandView({dataSet, tableName: descriptor.name,
      resourceId: catalogResultResources[descriptor.kind], columns: [{name: 'name', primary: true}]})
    if (view.primaryKey !== 'name') throw new Error('CATALOG_COMMAND_RESULT_IDENTITY: 目录命令结果必须以 name 为主键')
    const original = catalogResultBindings.get(view)
    if (original !== undefined) {
      if (capturedInput === undefined) throw new Error('CATALOG_COMMAND_INPUT_IDENTITY: 原目录命令输入已缺失')
      if (original.input.name !== capturedInput.name || original.input.table !== capturedInput.table || original.input.view !== capturedInput.view) {
        throw new Error('CATALOG_COMMAND_INPUT_IDENTITY: 结果视图不能改绑目录命令输入')
      }
    }
    const binding = original?.binding ?? prepare(view, descriptor.kind)
    binding.assertCanBind()
    return {...descriptor, view, binding}
  })
  // 所有调用前可判定的冲突已预检；不承诺回调异常的跨表回滚。
  capturedInput ??= captureCatalogInput(dataSet, tables.commandInput)
  const identity = capturedInput
  if (!catalogInputInstances.has(identity.table)) {
    if (identity.table.rows.length === 0) identity.table.addRows([{commandId: 'default', serverId: '', dbId: '', addDefaultFields: '1', batchId: crypto.randomUUID()}])
    else if (identity.table.rows[0] && !scalar(identity.table.rows[0]['batchId'])) identity.table.rows[0]['batchId'] = crypto.randomUUID()
    identity.view.commitMode = 'staged'
    if (identity.table.rows[0]) identity.view.setCurrentRow(identity.table.rows[0])
    catalogInputInstances.set(identity.table, identity.view)
  }
  for (const plan of plans) {
    const view = plan.view ?? SparkData.ensureDataSetFileCommandView({dataSet, tableName: plan.name,
      resourceId: catalogResultResources[plan.kind], columns: [{name: 'name', primary: true}]})
    const binding = plan.binding ?? prepare(view, plan.kind)
    binding.bind()
    catalogResultBindings.set(view, {input: identity, binding})
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
    throw new DatabaseCommandCompletionUnknown(`${fallback}：服务未返回可核验的逐项回执`)
  }
  const code = Number(response['Code'])
  if (code !== 0 && code !== 200) {
    throw new DatabaseCommandCompletionUnknown(scalar(response['Message']) || scalar(response['Msg']) || `${fallback}（${scalar(response['Code'])}），结果仍未知`)
  }
  const result = response['Result']
  if (isRecord(result) && result[objectName] === '注册成功') return 'created'
  if (isRecord(result) && result[objectName] === alreadyValue) return 'already'
  const diagnostic = isRecord(result) ? scalar(result[objectName]) : ''
  if (diagnostic === missingValue) throw new Error(`${fallback}：${missingValue}`)
  throw new DatabaseCommandCompletionUnknown(diagnostic
    ? `${fallback}：${diagnostic}；未取得精确成功回执，结果仍未知`
    : `${fallback}：缺少精确对象成功回执，结果仍未知`)
}

/** 命令完成证据不足、连接中断、超时或服务端5xx均不能据此判定原提交未生效。 */
function isDatabaseCommandUnconfirmed(error: unknown): boolean {
  if (error instanceof DatabaseCommandCompletionUnknown) return true
  if (!(error instanceof Error) || error.name !== 'RequestError' || !('status' in error)) return false
  const status = Number(error.status)
  return status === 0 || status >= 500
}

class DatabaseCommandCompletionUnknown extends Error {
  constructor(message: string) {super(message); this.name = 'DatabaseCommandCompletionUnknown'}
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
  const filter = SparkData.DataViewFilter.group({logic: 'and', filters: [
    SparkData.DataViewFilter.condition({field: 'dbid', operator: 'eq', value: dbid}).toJSON(),
    SparkData.DataViewFilter.condition({field: nameField, operator: 'eq', value: objectName}).toJSON(),
  ]}).toJSON()
  await verifyRegistrationQuery({dataSet, modelName, filter, values: {dbid, [nameField]: objectName}, assertScope})
}

async function verifyRegistrationQuery(options: Readonly<{
  dataSet: DataSet
  modelName: string
  filter: Parameters<SparkData.DataView['executeFilter']>[0]
  values: Readonly<Record<string, string>>
  expectedKey?: string
  assertScope: DataSetCommandScopeGuard
}>): Promise<DataRow> {
  const {dataSet, modelName, filter, values, expectedKey, assertScope} = options
  const view = dataSet.getView(modelName, 'registrationVerify')
  if (!view) throw new Error(`核验注册结果缺少正式视图 ${modelName}@registrationVerify`)
  const originalValidator = view.validateQueryResult
  let validationCount = 0
  let verifiedRow: DataRow | undefined
  const validateCurrent = async (result: Parameters<NonNullable<typeof view.validateQueryResult>>[0]): Promise<void> => {
    await originalValidator?.(result)
    assertScope()
    if (dataSet.getView(modelName, 'registrationVerify') !== view
      || JSON.stringify(view.filterExpression) !== JSON.stringify(filter)) {
      throw new DatabaseCommandCompletionUnknown('精确登记核验已过期，状态仍未知')
    }
    if (!result.countReported || result.total !== 1 || result.rows.length !== 1) {
      throw new DatabaseCommandCompletionUnknown(`精确登记核验未返回唯一且完整的服务端结果，状态仍未知（countReported=${String(result.countReported)}, total=${result.total}, rows=${result.rows.length}）`)
    }
    const row = result.rows[0]
    if (!row) throw new DatabaseCommandCompletionUnknown('精确登记核验结果为空，状态仍未知')
    const key = result.rowKey(row)
    if (typeof key !== 'string' || !key.trim() || (expectedKey !== undefined && key !== expectedKey)
      || Object.entries(values).some(([field, value]) => !Object.hasOwn(row, field)
        || (typeof row[field] !== 'string' && typeof row[field] !== 'number')
        || result.fieldAccess(key, field).read !== 'visible' || scalar(row[field]) !== value)) {
      throw new DatabaseCommandCompletionUnknown('精确登记核验字段不可读或身份不匹配，状态仍未知')
    }
    verifiedRow = Object.fromEntries(Object.keys(values).map(field => [field, scalar(row[field])]))
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
      throw new DatabaseCommandCompletionUnknown('精确登记核验未完成当前查询，状态仍未知')
    }
    if (view.rows.length !== 1 || !verifiedRow) throw new DatabaseCommandCompletionUnknown('精确登记核验没有唯一正式记录，状态仍未知')
    return verifiedRow
  } catch (error) {
    if (error instanceof DatabaseCommandCompletionUnknown) throw error
    throw new DatabaseCommandCompletionUnknown(`精确登记核验失败，状态仍未知：${error instanceof Error ? error.message : String(error)}`)
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
  const view = ensureDatabaseWriteCommandView({dataSet, tableName: options.register,
    resourceId: 'database-server-register', columns: options.columns})
  if (revalidateDatabaseCommandBinding(view)) return
  const fields = options.columns.filter(column => !column.isPrimaryKey).map(column => column.name)
  const assertBinding = SparkData.bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-server-register'},
    guard: assertScope,
    inputFields: fields,
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: isDatabaseCommandUnconfirmed,
    allowAbandonUnconfirmed: false,
    submit: async row => {
      const payload: Record<string, string> = {rowid: scalar(row['rowid'])}
      for (const field of fields) payload[field] = field === 'Type' ? scalar(row[field]).toUpperCase() : scalar(row[field])
      let response: unknown
      try {
        response = await http.post<unknown>('/api/Db/registerServer', payload)
      } catch (error) {
        throw new DatabaseCommandCompletionUnknown(`注册服务器未取得完成回执，结果仍未知：${error instanceof Error ? error.message : String(error)}`)
      }
      if (!isRecord(response) || response['Code'] !== 200 || response['Type'] !== 'success'
        || !isRecord(response['Result']) || response['Result']['rowid'] !== payload['rowid']) {
        throw new DatabaseCommandCompletionUnknown('DATABASE_SERVER_ACK_UNCONFIRMED: 注册服务器回执缺少原身份或成功证明，结果仍未知')
      }
      const returned = response['Result']
      if (fields.some(field => field !== 'Password' && Object.hasOwn(returned, field)
        && (typeof returned[field] !== 'string' || scalar(returned[field]) !== payload[field]))) {
        throw new DatabaseCommandCompletionUnknown('DATABASE_SERVER_ACK_UNCONFIRMED: 注册服务器回执与原提交冲突，结果仍未知')
      }
      const accepted: DataRow = {rowid: payload['rowid']}
      for (const field of fields) if (field !== 'Password' && Object.hasOwn(returned, field)) accepted[field] = scalar(returned[field])
      return accepted
    },
    verify: async row => {
      const rowid = scalar(row['rowid'])
      const values = {rowid, ...Object.fromEntries(fields.filter(field => field !== 'Password')
        .map(field => [field, field === 'Type' ? scalar(row[field]).toUpperCase() : scalar(row[field])]))}
      const filter = SparkData.DataViewFilter.condition({field: 'rowid', operator: 'eq', value: rowid}).toJSON()
      const found = await verifyRegistrationQuery({dataSet, modelName: options.catalog, filter, values, expectedKey: rowid, assertScope})
      return Object.fromEntries(Object.keys(values).map(field => [field, scalar(found[field])]))
    },
  })
  view.commitMode = 'staged'
  databaseWriteCommandBindings.set(view, assertBinding)
}

/**
 * 注册物理表写命令；默认字段完成须精确成功回执，正式目录回读不能代替默认字段执行证据。
 */
export type AttachTableRegisterCommandViewInput = DatabaseCommandAttachInput & Readonly<{
  register: string
  catalogModel: string
}>

export function attachTableRegisterCommandView(input: AttachTableRegisterCommandViewInput): void {
  const {dataSet, http, assertScope, register, catalogModel} = input
  const options = {register, catalogModel}
  const view = ensureDatabaseWriteCommandView({dataSet, tableName: options.register, resourceId: 'database-table-register', columns: [
    {name: 'rowid', type: 'string', isPrimaryKey: true, label: 'rowid'},
    {name: 'dbid', type: 'string', label: '数据库', required: true},
    {name: 'tableName', type: 'string', label: '表名', required: true},
    {name: 'tableComment', type: 'string', label: '表说明'},
    {name: 'addDefaultFields', type: 'string', label: '默认字段'},
    {name: 'batchKey', type: 'string', label: '批次'},
    {name: 'registrationDisposition', type: 'string', label: '命令处理状态'},
    {name: 'registrationStatus', type: 'string', label: '状态'},
  ]})
  if (revalidateDatabaseCommandBinding(view)) return
  const defaultFieldsAcknowledged = new Map<string, Readonly<{dbid: string; tableName: string}>>()
  const assertBinding = SparkData.bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-table-register'},
    guard: assertScope,
    inputFields: ['dbid', 'tableName', 'tableComment', 'addDefaultFields', 'batchKey', 'registrationDisposition', 'registrationStatus'],
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: isDatabaseCommandUnconfirmed,
    submit: async row => {
      const commandId = scalar(row['rowid'])
      defaultFieldsAcknowledged.delete(commandId)
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
      if (addDefault && receipt === 'created') defaultFieldsAcknowledged.set(commandId, {dbid, tableName})
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
      const acknowledged = defaultFieldsAcknowledged.get(scalar(row['rowid']))
      if (scalar(row['addDefaultFields']) === '1' && (acknowledged?.dbid !== dbid || acknowledged.tableName !== tableName)) {
        throw new DatabaseCommandCompletionUnknown('默认字段补齐尚无正式完成回执，登记状态仍未知')
      }
      await verifyRegisteredObject({dataSet, modelName: options.catalogModel, nameField: 'tblname', dbid, objectName: tableName, assertScope})
      return {...row, registrationStatus: '已确认'}
    },
  })
  view.commitMode = 'staged'
  databaseWriteCommandBindings.set(view, assertBinding)
}

export type AttachViewRegisterCommandViewInput = DatabaseCommandAttachInput & Readonly<{
  register: string
  catalogModel: string
}>

export function attachViewRegisterCommandView(input: AttachViewRegisterCommandViewInput): void {
  const {dataSet, http, assertScope, register, catalogModel} = input
  const options = {register, catalogModel}
  const view = ensureDatabaseWriteCommandView({dataSet, tableName: options.register, resourceId: 'database-view-register', columns: [
    {name: 'rowid', type: 'string', isPrimaryKey: true, label: 'rowid'},
    {name: 'dbid', type: 'string', label: '数据库', required: true},
    {name: 'viewName', type: 'string', label: '视图名', required: true},
    {name: 'viewComment', type: 'string', label: '视图说明'},
    {name: 'batchKey', type: 'string', label: '批次'},
    {name: 'registrationDisposition', type: 'string', label: '命令处理状态'},
    {name: 'registrationStatus', type: 'string', label: '状态'},
  ]})
  if (revalidateDatabaseCommandBinding(view)) return
  const assertBinding = SparkData.bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-view-register'},
    guard: assertScope,
    inputFields: ['dbid', 'viewName', 'viewComment', 'batchKey', 'registrationDisposition', 'registrationStatus'],
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: isDatabaseCommandUnconfirmed,
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
  view.commitMode = 'staged'
  databaseWriteCommandBindings.set(view, assertBinding)
}

export type AttachTableSyncMetaDataViewInput = DatabaseCommandAttachInput & Readonly<{
  sync: string
}>

const databaseWriteCommandBindings = new WeakMap<SparkData.DataView, () => void>()

function revalidateDatabaseCommandBinding(view: SparkData.DataView): boolean {
  const assertBinding = databaseWriteCommandBindings.get(view)
  if (!assertBinding) return false
  assertBinding()
  return true
}

function ensureDatabaseWriteCommandView(input: Readonly<{
  dataSet: DataSet; tableName: string; resourceId: string; columns: readonly DataColumn[]
}>): SparkData.DataView {
  const {dataSet, tableName, resourceId, columns} = input
  const primaryColumns = columns.filter(column => column.isPrimaryKey === true)
  if (primaryColumns.length !== 1 || primaryColumns[0]?.name !== 'rowid' || primaryColumns[0].type !== 'string') {
    throw new Error('DATABASE_COMMAND_PRIMARY_KEY_CONFLICT: 数据库写命令声明必须包含唯一字符串主键 rowid')
  }
  const view = SparkData.ensureDataSetFileCommandView({dataSet, tableName, resourceId,
    columns: columns.map(({isPrimaryKey, ...column}) => ({...column, primary: isPrimaryKey === true}))})
  if (view.primaryKey !== 'rowid') throw new Error('DATABASE_COMMAND_PRIMARY_KEY_CONFLICT: 数据库写命令视图必须以 rowid 标识本次命令')
  return view
}

export function attachTableSyncMetaDataView(input: AttachTableSyncMetaDataViewInput): void {
  const {dataSet, http, assertScope, sync} = input
  if (!dataSet.getTable(sync)) {
    const table = dataSet.addTable(sync, [
      {name: 'rowid', type: 'string', isPrimaryKey: true, label: 'rowid'},
      {name: 'dbid', type: 'string', label: '数据库'},
      {name: 'tableid', type: 'string', label: '表'},
    ])
    table.resourceType = 'file'
    table.resourceId = 'database-table-sync-metadata'
  }
  const view = SparkData.ensureDataSetFileCommandView({dataSet, tableName: sync,
    resourceId: 'database-table-sync-metadata', columns: [{name: 'rowid', primary: true}, {name: 'dbid'}, {name: 'tableid'}]})
  if (view.primaryKey !== 'rowid') throw new Error('DATABASE_SYNC_PRIMARY_KEY_CONFLICT: 同步命令视图必须以 rowid 标识本次命令')
  if (revalidateDatabaseCommandBinding(view)) return
  const assertBinding = SparkData.bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'database-table-sync-metadata'},
    guard: assertScope,
    inputFields: ['dbid', 'tableid'],
    createKey: () => crypto.randomUUID().replaceAll('-', '').toUpperCase(),
    isUnconfirmed: isDatabaseCommandUnconfirmed,
    allowAbandonUnconfirmed: false,
    submit: async row => {
      const dbid = scalar(row['dbid'])
      const tableid = scalar(row['tableid'])
      if (!dbid || !tableid) throw new Error('同步元数据缺少数据库或表 ID')
      const response=await http.post<unknown>(`/api/Table/SyncMetaData/${encodeURIComponent(dbid)}/${encodeURIComponent(tableid)}`, {})
      const confirmed=response===true||isRecord(response)&&typeof response['Code']==='number'
        &&(response['Code']===0||response['Code']===200)&&response['Result']===true
      if(!confirmed)throw new DatabaseCommandCompletionUnknown('DATABASE_SYNC_ACK_UNCONFIRMED: 未取得本次同步的明确成功回执，结果仍未知')
      return {rowid: scalar(row['rowid']), dbid, tableid}
    },
    verify: () => {
      // 现有接口没有原请求标识或版本核验合同；字段目录的当前状态不能证明本次同步结果。
      return Promise.reject(new Error('DATABASE_SYNC_UNVERIFIABLE: 同步接口缺少本次提交的权威核验能力，保留原提交且不能重发'))
    },
  })
  view.commitMode = 'staged'
  databaseWriteCommandBindings.set(view, assertBinding)
}

export type AttachServerConnectionTestViewsInput = DatabaseCommandAttachInput & Readonly<{
  tables: Readonly<{commandInput: string; testResult: string}>
}>

export type AttachDatabaseDirectoryConnectionTestViewsInput = DatabaseCommandAttachInput & Readonly<{
  tables: Readonly<{commandInput: string; testResult: string}>
}>

const connectionTargetFields = ['Name', 'serverId'] as const
const connectionServerFields = ['Type', 'ServerName', 'ip_address', 'Port'] as const
type DirectoryConnectionTarget = {databaseId: string | number; serverId: string; dbName: string; database: DataRow;
  server: DataRow; serverValues: Readonly<Record<string, string>>}
type DirectoryConnectionController = {capture: (databaseId: string | number) => string; clear: (clearResult?: boolean) => void}
const directoryConnectionControllers = new WeakMap<DataSet, DirectoryConnectionController>()

export function captureDatabaseDirectoryConnectionTestTarget(dataSet: DataSet, databaseId: string | number): string {
  const controller = directoryConnectionControllers.get(dataSet)
  if (!controller) throw new Error('数据库连接测试尚未装配')
  return controller.capture(databaseId)
}

export function clearDatabaseDirectoryConnectionTest(dataSet: DataSet, clearResult = true): void {
  directoryConnectionControllers.get(dataSet)?.clear(clearResult)
}

function readable(view: SparkData.DataView, row: DataRow, fields: readonly string[]): void {
  for (const field of fields) if (view.fieldAccess(row, field).read !== 'visible') throw new Error(`连接测试缺少字段读取权限: ${field}`)
}

export function attachDatabaseDirectoryConnectionTestViews(input: AttachDatabaseDirectoryConnectionTestViewsInput): void {
  const {dataSet, http, assertScope, tables} = input
  if (dataSet.getTable(tables.testResult)) return
  SparkData.ensureDataSetStaticInputTable(dataSet, tables.commandInput, [
    {name: 'commandId', primary: true}, {name: 'Type'}, {name: 'ServerName'}, {name: 'ip_address'},
    {name: 'Port'}, {name: 'dbName'}, {name: 'UserName'}, {name: 'Password'},
  ])
  const command = dataSet.getTable(tables.commandInput)
  if (!command) throw new Error('数据库连接测试命令输入表未装配')
  if (!command.rows.length) command.addRows([{commandId: 'default', Type: '', ServerName: '', ip_address: '', Port: '', dbName: '', UserName: '', Password: ''}])
  const commandView = dataSet.getView(tables.commandInput, 'default')
  if (!commandView) throw new Error('数据库连接测试输入视图缺失')
  const commandRow = command.rows[0]
  if (!commandRow) throw new Error('数据库连接测试命令输入未就绪')
  commandView.commitMode = 'staged'
  commandView.setCurrentRow(commandRow)
  const result = SparkData.ensureDataSetFileCommandView({dataSet, tableName: tables.testResult,
    resourceId: 'database-directory-connection-test', columns: [{name: 'ok', primary: true}]})
  let target: DirectoryConnectionTarget | undefined
  let targetGeneration = 0
  const clearSecrets = (): void => {
    const row = commandView.rows[0] ?? command.rows[0]
    if (row) {
      const id = commandView.getPkKey(row)
      if (typeof id === 'string' || typeof id === 'number') commandView.discardEditingRows([id])
      row['UserName'] = ''; row['Password'] = ''
    }
  }
  const resetTarget = (clearRows: boolean): void => {targetGeneration++; target = undefined; if (clearRows) result.replaceRows([]); clearSecrets()}
  const dbView = dataSet.getView('_base_dbInfo', 'default')
  const serverView = dataSet.getView('Base_serverInfo', 'default')
  if (!dbView || !serverView) throw new Error('数据库目录缺少正式数据库或服务器视图')
  SparkData.bindDataSetReadonlyCommandQuery(result, {
    resource: {resourceType: 'file', resourceId: 'database-directory-connection-test'}, guard: () => {
      try {assertScope()} catch (error) {clearSecrets(); throw error}
    },
    loadRows: async () => {
      const capturedTarget = target
      const capturedGeneration = targetGeneration
      try {
      const inputRow = commandView.rows[0] ?? command.rows[0]
        if (!inputRow || !capturedTarget) throw new Error('请先选择数据库目录记录')
        const dbRows = dbView.rows.filter(row => dbView.getPkKey(row) === capturedTarget.databaseId)
        const serverRows = serverView.rows.filter(row => serverView.getPkKey(row) === capturedTarget.serverId)
        if (dbRows.length !== 1 || serverRows.length !== 1 || dbView.getSelectedValues().length !== 1
          || dbView.getSelectedValues()[0] !== capturedTarget.databaseId || serverRows[0] !== capturedTarget.server) throw new Error('数据库或服务器目录身份已变化')
        const dbRow = dbRows.at(0), serverRow = serverRows.at(0)
        if (!dbRow || !serverRow) throw new Error('数据库或服务器目录身份已变化')
        readable(dbView, dbRow, [...connectionTargetFields, dbView.primaryKey])
        readable(serverView, serverRow, [...connectionServerFields, serverView.primaryKey])
        if (scalar(dbRow['Name']) !== capturedTarget.dbName || scalar(dbRow['serverId']) !== capturedTarget.serverId) throw new Error('所选数据库身份已变化')
        const inputId = commandView.getPkKey(inputRow)
        const effectiveInput = (typeof inputId === 'string' || typeof inputId === 'number' ? commandView.getEditingRow(inputId) : null) ?? inputRow
        const payload = {Type: scalar(effectiveInput['Type']).toUpperCase(), ServerName: scalar(effectiveInput['ServerName']),
          ip_address: scalar(effectiveInput['ip_address']), UserName: scalar(effectiveInput['UserName']),
          Password: scalar(effectiveInput['Password']), Port: scalar(effectiveInput['Port'])}
        if (!payload.UserName || !payload.Password) throw new Error('请输入本次连接测试的账号和密码')
        const serverValues = {Type: payload.Type, ServerName: payload.ServerName, ip_address: payload.ip_address, Port: payload.Port}
        if (connectionServerFields.some(field => serverValues[field] !== capturedTarget.serverValues[field])) {
          throw new Error('服务器连接参数已变化，请重新选择数据库')
        }
        const response = commandAjaxResult(await http.post<unknown>(`/api/Db/testConnection?db=${encodeURIComponent(capturedTarget.dbName)}`, payload), '数据库连接测试失败')
        if (response !== true && response !== false) throw new Error('数据库连接测试回执格式无效')
        if (target !== capturedTarget || targetGeneration !== capturedGeneration || dbView.getSelectedValues()[0] !== capturedTarget.databaseId
          || dbRow !== capturedTarget.database || dbView.rows.find(row => dbView.getPkKey(row) === capturedTarget.databaseId) !== dbRow
          || serverView.rows.find(row => serverView.getPkKey(row) === capturedTarget.serverId) !== serverRow) {
          throw new Error('连接测试目标已变化，已丢弃旧结果')
        }
        return [{ok: response === true ? 'true' : 'false'}]
      } finally {
        if (target === capturedTarget && targetGeneration === capturedGeneration) clearSecrets()
      }
    },
  })
  const capture = (databaseId: string | number): string => {
    resetTarget(true)
    const selected = dbView.getSelectedValues()
    if (selected.length !== 1 || selected[0] !== databaseId) throw new Error('请先明确选择数据库目录记录')
    const match = dbView.rows.filter(row => dbView.getPkKey(row) === databaseId)
    if (match.length !== 1) throw new Error('请明确选择一条数据库目录记录')
    const dbRow = match[0]
    if (!dbRow) throw new Error('请明确选择一条数据库目录记录')
    readable(dbView, dbRow, [...connectionTargetFields, dbView.primaryKey])
    const serverId = scalar(dbRow['serverId'])
    const servers = serverView.rows.filter(row => serverView.getPkKey(row) === serverId)
    if (!serverId || servers.length !== 1) throw new Error('所选数据库未匹配到唯一服务器')
    const serverRow = servers[0]
    if (!serverRow) throw new Error('所选数据库未匹配到唯一服务器')
    readable(serverView, serverRow, [...connectionServerFields, serverView.primaryKey])
    target = {databaseId, serverId, dbName: scalar(dbRow['Name']), database: dbRow, server: serverRow,
      serverValues: Object.fromEntries(connectionServerFields.map(field => [field, scalar(serverRow[field])]))}
    targetGeneration++
    const inputRow = commandView.rows[0] ?? command.rows[0]
    if (!inputRow) throw new Error('数据库连接测试命令输入未就绪')
    for (const [key, field] of [['Type','Type'], ['ServerName','ServerName'], ['ip_address','ip_address'], ['Port','Port']] as const) inputRow[key] = scalar(serverRow[field])
    inputRow['dbName'] = target.dbName
    inputRow['UserName'] = ''; inputRow['Password'] = ''
    return target.dbName
  }
  directoryConnectionControllers.set(dataSet, {capture, clear: (clearRows = true) => resetTarget(clearRows)})
}

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
