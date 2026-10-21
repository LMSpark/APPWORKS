/**
 * @module app:lowcode/resources/database/lowcode-database-dataset-extensions
 * 职责：Db 专题命令视图端点映射；装配调用 spark-data DataSet 命令 helper。
 * 边界：仅供 lowcode-database-*.ts 调用；页面与 view-ops 只消费 DataView.refresh/saveChanges。
 */
import {
  bindDataSetReadonlyCommandQuery,
  ensureDataSetFileCommandView,
  ensureDataSetStaticInputTable,
  type DataSetCommandScopeGuard,
  type DataSet,
} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

export function attachCatalogCommandViews(
  dataSet: DataSet,
  http: HttpClientBase,
  assertScope: DataSetCommandScopeGuard,
  tables: Readonly<{commandInput: string; unregisteredDbNames: string; unregisteredTableNames?: string}>,
): void {
  if (dataSet.getTable(tables.unregisteredDbNames)) return
  ensureDataSetStaticInputTable(dataSet, tables.commandInput, [
    {name: 'commandId', primary: true}, {name: 'serverId'}, {name: 'dbId'},
  ])
  const input = dataSet.getTable(tables.commandInput)!
  if (input.rows.length === 0) input.addRows([{commandId: 'default', serverId: '', dbId: ''}])
  const namesView = ensureDataSetFileCommandView(dataSet, tables.unregisteredDbNames, 'database-unregistered-names', [{name: 'name', primary: true}])
  bindDataSetReadonlyCommandQuery(namesView, {
    resource: {resourceType: 'file', resourceId: 'database-unregistered-names'},
    guard: assertScope,
    queryColumns: view => view.dataTable?.columns.filter(column => column.name === 'name') ?? [],
    loadRows: async () => {
      const serverId = scalar(dataSet.getTable(tables.commandInput)?.rows[0]?.['serverId'])
      if (!serverId) throw new Error('查询未登记数据库缺少服务器 ID')
      const response = await http.get<string[]>(`/api/Db/getUnregisteredDb/${encodeURIComponent(serverId)}`)
      if (!Array.isArray(response)) throw new Error('未登记数据库列表响应格式无效')
      return response.filter(name => typeof name === 'string' && name.trim()).map(name => ({name: name.trim()}))
    },
  })
  const tableNamesKey = tables.unregisteredTableNames
  if (!tableNamesKey || dataSet.getTable(tableNamesKey)) return
  const tableNamesView = ensureDataSetFileCommandView(dataSet, tableNamesKey, 'database-unregistered-tables', [{name: 'name', primary: true}])
  bindDataSetReadonlyCommandQuery(tableNamesView, {
    resource: {resourceType: 'file', resourceId: 'database-unregistered-tables'},
    guard: assertScope,
    queryColumns: view => view.dataTable?.columns.filter(column => column.name === 'name') ?? [],
    loadRows: async () => {
      const dbId = scalar(dataSet.getTable(tables.commandInput)?.rows[0]?.['dbId'])
      if (!dbId) throw new Error('查询未登记数据表缺少数据库 ID')
      const response = await http.get<string[]>(`/api/Db/getUnregisteredTable/${encodeURIComponent(dbId)}`)
      if (!Array.isArray(response)) throw new Error('未登记数据表列表响应格式无效')
      return response.filter(name => typeof name === 'string' && name.trim()).map(name => ({name: name.trim()}))
    },
  })
}

export function attachServerConnectionTestViews(
  dataSet: DataSet,
  http: HttpClientBase,
  assertScope: DataSetCommandScopeGuard,
  tables: Readonly<{commandInput: string; testResult: string}>,
): void {
  if (dataSet.getTable(tables.testResult)) return
  ensureDataSetStaticInputTable(dataSet, tables.commandInput, [
    {name: 'commandId', primary: true},
    {name: 'Type'}, {name: 'ServerName'}, {name: 'ip_address'}, {name: 'UserName'}, {name: 'Password'}, {name: 'Port'},
  ])
  const input = dataSet.getTable(tables.commandInput)!
  if (input.rows.length === 0) {
    input.addRows([{commandId: 'default', Type: '', ServerName: '', ip_address: '', UserName: '', Password: '', Port: ''}])
  }
  const resultView = ensureDataSetFileCommandView(dataSet, tables.testResult, 'database-connection-test', [{name: 'ok', primary: true}])
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
