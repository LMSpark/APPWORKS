/**
 * @module app:lowcode/resources/database/lowcode-database-dataset-extensions
 * 职责：loadCatalog 装配阶段为同一 DataSet 挂接 file 命令视图（HTTP 只在 executor 内）。
 * 边界：仅供 lowcode-database-*.ts 调用；页面与 view-ops 只消费 DataView.refresh/saveChanges。
 */
import {DataViewLocalQuery, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'

type QueryResult = Awaited<ReturnType<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>>
type AssertScope = () => void

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

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

export function attachCatalogCommandViews(
  dataSet: DataSet,
  http: HttpClientBase,
  assertScope: AssertScope,
  tables: Readonly<{commandInput: string; unregisteredNames: string}>,
): void {
  if (dataSet.getTable(tables.unregisteredNames)) return
  staticInputTable(dataSet, tables.commandInput, [{name: 'commandId', primary: true}, {name: 'serverId'}])
  const input = dataSet.getTable(tables.commandInput)!
  if (input.rows.length === 0) input.addRows([{commandId: 'default', serverId: ''}])
  const namesView = commandFileTable(dataSet, tables.unregisteredNames, 'database-unregistered-names', [{name: 'name', primary: true}])
  namesView.bindQueryExecutor({
    localAggregates: false,
    queryColumns: view => view.dataTable?.columns.filter(column => column.name === 'name') ?? [],
    executeQuery: async (view, _params) => {
      assertScope()
      const serverId = scalar(dataSet.getTable(tables.commandInput)?.rows[0]?.['serverId'])
      if (!serverId) throw new Error('查询未登记数据库缺少服务器 ID')
      const response = await http.get<string[]>(`/api/Db/getUnregisteredDb/${encodeURIComponent(serverId)}`)
      if (!Array.isArray(response)) throw new Error('未登记数据库列表响应格式无效')
      const rows = response.filter(name => typeof name === 'string' && name.trim()).map(name => ({name: name.trim()}))
      return localReadonlyResult(view, rows, assertScope)
    },
  }, {resource: {resourceType: 'file', resourceId: 'database-unregistered-names'}})
}

export function attachServerConnectionTestViews(
  dataSet: DataSet,
  http: HttpClientBase,
  assertScope: AssertScope,
  tables: Readonly<{commandInput: string; testResult: string}>,
): void {
  if (dataSet.getTable(tables.testResult)) return
  staticInputTable(dataSet, tables.commandInput, [
    {name: 'commandId', primary: true},
    {name: 'Type'}, {name: 'ServerName'}, {name: 'ip_address'}, {name: 'UserName'}, {name: 'Password'}, {name: 'Port'},
  ])
  const input = dataSet.getTable(tables.commandInput)!
  if (input.rows.length === 0) {
    input.addRows([{commandId: 'default', Type: '', ServerName: '', ip_address: '', UserName: '', Password: '', Port: ''}])
  }
  const resultView = commandFileTable(dataSet, tables.testResult, 'database-connection-test', [{name: 'ok', primary: true}])
  resultView.bindQueryExecutor({
    localAggregates: false,
    queryColumns: view => view.dataTable?.columns ?? [],
    executeQuery: async (view, _params) => {
      assertScope()
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
      return localReadonlyResult(view, [{ok: response === true ? 'true' : 'false'}], assertScope)
    },
  }, {resource: {resourceType: 'file', resourceId: 'database-connection-test'}})
}
