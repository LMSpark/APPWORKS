/**
 * @module app:lowcode/resources/database/database-spark-data-auxiliary
 * 职责：Db 侧读/探测能力挂到同一 DataSet（辅助静态表 + 绑定 query executor），禁止业务层直调 HTTP。
 */
import {DataViewLocalQuery, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import type {DatabaseServerEditState} from './database-server-view-ops'

type QueryResult = Awaited<ReturnType<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>>

export const DATABASE_COMMAND_INPUT_TABLE = 'DatabaseCatalogCommandInput'
export const DATABASE_UNREGISTERED_NAMES_TABLE = 'DatabaseUnregisteredNames'
export const DATABASE_CONNECTION_INPUT_TABLE = 'DatabaseConnectionTestInput'
export const DATABASE_CONNECTION_RESULT_TABLE = 'DatabaseConnectionTestResult'

type AssertScope = () => void

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  throw new Error('命令输入字段不是可提交的标量值')
}

function staticInputTable(dataSet: DataSet, tableName: string, columns: ReadonlyArray<{name: string; primary?: boolean}>): void {
  if (dataSet.getTable(tableName)) return
  const table = dataSet.addTable(tableName, columns.map(column => ({
    name: column.name,
    type: 'string',
    ...(column.primary ? {isPrimaryKey: true} : {}),
  })))
  table.resourceType = 'static-data'
}

function commandFileTable(
  dataSet: DataSet,
  tableName: string,
  resourceId: string,
  columns: ReadonlyArray<{name: string; primary?: boolean}>,
): DataView {
  if (dataSet.getTable(tableName)) {
    const existing = dataSet.getView(tableName, 'default')
    if (!existing) throw new Error(`命令视图缺失: ${tableName}`)
    return existing
  }
  const table = dataSet.addTable(tableName, columns.map(column => ({
    name: column.name,
    type: 'string',
    ...(column.primary ? {isPrimaryKey: true} : {}),
  })))
  table.resourceType = 'file'
  table.resourceId = resourceId
  const view = dataSet.getView(tableName, 'default')
  if (!view) throw new Error(`命令视图缺失: ${tableName}`)
  return view
}

function localReadonlyResult(view: DataView, rows: readonly DataRow[], guard: AssertScope): Promise<QueryResult> {
  guard()
  const fields = new Set(view.columns.filter(column => column.name !== '_pk' && !column.computeExpression).map(column => column.name))
  const {rows: outputRows, total, output} = DataViewLocalQuery.select({
    rows: [...rows],
    fields,
    primaryKeys: view.primaryKey ? [view.primaryKey] : [],
    params: {page: 1, allPages: true, treeMode: 'flat'},
  })
  const rowKey = (row: Readonly<DataRow>) => (view.primaryKey ? row[view.primaryKey] : undefined)
  const keys = new Set(outputRows.map(rowKey))
  const allowed = (key: unknown, field: string) => key !== undefined && keys.has(key) && output.has(field)
  return Promise.resolve({
    rows: outputRows,
    total,
    rowKey,
    assertIdentity: () => guard(),
    fieldAccess: (key, field) => ({
      read: allowed(key, field) ? 'visible' : 'invisible',
      write: 'denied',
      component: allowed(key, field) ? 'readonly' : 'hidden',
      required: false,
      writeMode: 'readonly',
    }),
    readFieldAccess: (row, field) => (outputRows.includes(row) && output.has(field) ? 'visible' : 'invisible'),
    addActionState: () => 'hidden',
    editActionState: () => 'hidden',
    deleteActionState: () => 'hidden',
    createChildActionState: () => 'hidden',
    viewActionState: (key, available = true) => (keys.has(key) ? (available ? 'enabled' : 'disabled') : 'hidden'),
  })
}

/** 表和视图目录：未登记物理库名经辅助 DataView.refresh 读取。 */
export function installDatabaseCatalogAuxiliaryViews(dataSet: DataSet, http: HttpClientBase, assertScope: AssertScope): void {
  if (dataSet.getTable(DATABASE_UNREGISTERED_NAMES_TABLE)) return
  staticInputTable(dataSet, DATABASE_COMMAND_INPUT_TABLE, [{name: 'commandId', primary: true}, {name: 'serverId'}])
  const input = dataSet.getTable(DATABASE_COMMAND_INPUT_TABLE)!
  if (input.rows.length === 0) input.addRows([{commandId: 'default', serverId: ''}])
  const namesView = commandFileTable(dataSet, DATABASE_UNREGISTERED_NAMES_TABLE, 'database-unregistered-names', [{name: 'name', primary: true}])
  namesView.bindQueryExecutor({
    localAggregates: false,
    queryColumns: view => view.dataTable?.columns.filter(column => column.name === 'name') ?? [],
    executeQuery: async (view, params) => {
      assertScope()
      const serverId = scalar(dataSet.getTable(DATABASE_COMMAND_INPUT_TABLE)?.rows[0]?.['serverId'])
      if (!serverId) throw new Error('查询未登记数据库缺少服务器 ID')
      const response = await http.get<string[]>(`/api/Db/getUnregisteredDb/${encodeURIComponent(serverId)}`)
      if (!Array.isArray(response)) throw new Error('未登记数据库列表响应格式无效')
      const rows = response.filter(name => typeof name === 'string' && name.trim()).map(name => ({name: name.trim()}))
      return localReadonlyResult(view, rows, assertScope)
    },
  }, {resource: {resourceType: 'file', resourceId: 'database-unregistered-names'}})
}

/** 服务器目录：连接测试经辅助 DataView.refresh 读取结果。 */
export function installDatabaseServerAuxiliaryViews(dataSet: DataSet, http: HttpClientBase, assertScope: AssertScope): void {
  if (dataSet.getTable(DATABASE_CONNECTION_RESULT_TABLE)) return
  staticInputTable(dataSet, DATABASE_CONNECTION_INPUT_TABLE, [
    {name: 'commandId', primary: true},
    {name: 'Type'}, {name: 'ServerName'}, {name: 'ip_address'}, {name: 'UserName'}, {name: 'Password'}, {name: 'Port'},
  ])
  const input = dataSet.getTable(DATABASE_CONNECTION_INPUT_TABLE)!
  if (input.rows.length === 0) input.addRows([{commandId: 'default', Type: '', ServerName: '', ip_address: '', UserName: '', Password: '', Port: ''}])
  const resultView = commandFileTable(dataSet, DATABASE_CONNECTION_RESULT_TABLE, 'database-connection-test', [{name: 'ok', primary: true}])
  resultView.bindQueryExecutor({
    localAggregates: false,
    queryColumns: view => view.dataTable?.columns ?? [],
    executeQuery: async (view, params) => {
      assertScope()
      const value = dataSet.getTable(DATABASE_CONNECTION_INPUT_TABLE)?.rows[0]
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
      const ok = response === true
      return localReadonlyResult(view, [{ok: ok ? 'true' : 'false'}], assertScope)
    },
  }, {resource: {resourceType: 'file', resourceId: 'database-connection-test'}})
}

export function setDatabaseCommandServerId(dataSet: DataSet, serverId: string): void {
  const table = dataSet.getTable(DATABASE_COMMAND_INPUT_TABLE)
  const row = table?.rows[0]
  if (!row) throw new Error('目录命令输入未就绪')
  row['serverId'] = serverId.trim()
  const view = dataSet.getView(DATABASE_COMMAND_INPUT_TABLE, 'default')
  view?.setCurrentRowById(String(row['commandId'] ?? 'default'))
}

export async function queryUnregisteredDatabaseNames(dataSet: DataSet, serverId: string): Promise<readonly string[]> {
  setDatabaseCommandServerId(dataSet, serverId)
  const view = dataSet.getView(DATABASE_UNREGISTERED_NAMES_TABLE, 'default')
  if (!view) throw new Error('未登记库查询视图缺失')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
  return view.rows.map(row => scalar(row['name'])).filter(Boolean)
}

export function writeConnectionTestInput(dataSet: DataSet, edit: DatabaseServerEditState, boundView: DataView): void {
  if (boundView.currentRow !== edit.row || !boundView.rows.includes(edit.row)) throw new Error('连接测试时编辑目标或查询已变化')
  const value = boundView.getEditingRow(edit.id)
  if (!value) throw new Error('连接测试缺少编辑中的服务器记录')
  const row = dataSet.getTable(DATABASE_CONNECTION_INPUT_TABLE)?.rows[0]
  if (!row) throw new Error('连接测试输入未就绪')
  for (const field of ['Type', 'ServerName', 'ip_address', 'UserName', 'Password', 'Port'] as const) {
    row[field] = scalar(value[field])
  }
  if (edit.mode === 'add' && !scalar(value['UserName'])) throw new Error('注册前请填写用户名')
  const inputView = dataSet.getView(DATABASE_CONNECTION_INPUT_TABLE, 'default')
  inputView?.setCurrentRowById(String(row['commandId'] ?? 'default'))
}

export async function queryServerConnectionTest(dataSet: DataSet, boundView: DataView, edit: DatabaseServerEditState): Promise<boolean> {
  writeConnectionTestInput(dataSet, edit, boundView)
  const view = dataSet.getView(DATABASE_CONNECTION_RESULT_TABLE, 'default')
  if (!view) throw new Error('连接测试结果视图缺失')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
  const row = view.rows[0]
  return row?.['ok'] === 'true'
}
