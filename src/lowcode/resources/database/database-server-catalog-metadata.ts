/**
 * @module app:lowcode/resources/database/database-server-catalog-metadata
 * 职责：服务器目录专题列元数据（loadCatalog 装配后 patch DataTable.columns，供 autoColumns 消费）。
 */
import type {DataColumn, DataSet, SparkNode} from '@spark-appworks/spark-data'
import {DATABASE_SERVER_MODEL} from './lowcode-database-server'

export const DATABASE_SERVER_TYPE_OPTIONS = [
  {value: 'MYSQL', label: 'MySQL'},
  {value: 'SQLSERVER', label: 'SQL Server'},
  {value: 'ORACLE', label: 'Oracle'},
  {value: 'POSTGRESQL', label: 'PostgreSQL'},
] as const satisfies ReadonlyArray<Readonly<{value: string; label: string}>>

/** `/Db/registerServer` 命令参数（参考注册表单）；rowid 由前端生成以便结果未知时按主键核验。 */
export const DATABASE_SERVER_REGISTER_COLUMNS: DataColumn[] = [
  {name: 'rowid', type: 'string', isPrimaryKey: true, label: 'rowid'},
  {name: 'Type', type: 'enum', label: '类型', required: true, enumOptions: [...DATABASE_SERVER_TYPE_OPTIONS]},
  {name: 'ServerName', type: 'string', label: '服务器名称', required: true},
  {name: 'ip_address', type: 'string', label: '服务器IP地址', required: true},
  {name: 'Port', type: 'string', label: '端口'},
  {name: 'UserName', type: 'string', label: '账号', required: true},
  {name: 'Password', type: 'string', label: '密码'},
  {name: 'description', type: 'string', label: '描述'},
]

/** 注册表单标准字段子组件；系统生成的 rowid 不录入，密码输入遮盖。 */
export const DATABASE_SERVER_REGISTER_FORM_FIELDS: SparkNode[] = DATABASE_SERVER_REGISTER_COLUMNS
  .filter(column => !column.isPrimaryKey)
  .map(column => column.enumOptions
    ? {type: 'r-select', props: {field: column.name, label: column.label ?? column.name, colSpan: 6, options: [...column.enumOptions]}}
    : {type: 'r-text', props: {field: column.name, label: column.label ?? column.name, colSpan: 6, ...(column.name === 'Password' ? {showPassword: true} : {})}})

/** 参考页列表列：不展示账号、密码等敏感或未列字段。 */
export const DATABASE_SERVER_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'ServerName', label: '服务器名称'}},
  {type: 'r-text', props: {field: 'ip_address', label: '服务器IP地址'}},
  {type: 'r-text', props: {field: 'Port', label: '端口'}},
  {type: 'r-select', props: {field: 'Type', label: '类型', options: [...DATABASE_SERVER_TYPE_OPTIONS]}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人'}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间'}},
  {type: 'r-text', props: {field: 'description', label: '描述'}},
]

/** 运行 DataSet 上覆盖 Type 列为枚举下拉（ScenarioViewConfig.columns 不允许改 type）。 */
export function applyDatabaseServerCatalogMetadata(dataSet: DataSet): void {
  const table = dataSet.getTable(DATABASE_SERVER_MODEL)
  if (!table) return
  const typeColumn = table.columns.find(column => column.name === 'Type')
  if (!typeColumn) return
  typeColumn.type = 'enum'
  typeColumn.enumOptions = [...DATABASE_SERVER_TYPE_OPTIONS]
  const view = dataSet.getView(DATABASE_SERVER_MODEL, 'default')
  if (!view) return
  view.fieldProjection = view.fieldProjection.map(field => (
    field.resourceField === 'Type' || field.viewField === 'Type'
      ? {...field, type: 'enum'}
      : field
  ))
}
