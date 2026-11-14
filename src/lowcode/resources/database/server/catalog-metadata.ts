/**
 * @module app:lowcode/resources/database/server/catalog-metadata
 * 职责：服务器目录专题列元数据（loadCatalog 装配后 patch DataTable.columns，供 autoColumns 消费）。
 */
import type {DataColumn, DataSet, SparkNode} from '@spark-appworks/spark-data'
import {DATABASE_SERVER_MODEL} from './resource'

export const DATABASE_SERVER_TYPE_OPTIONS = [
  {value: 'MYSQL', label: 'MySQL'},
  {value: 'SQLSERVER', label: 'SQL Server'},
  {value: 'ORACLE', label: 'Oracle'},
  {value: 'POSTGRESQL', label: 'PostgreSQL'},
] as const satisfies ReadonlyArray<Readonly<{value: string; label: string}>>

/** Observed server-directory filter choices; deliberately separate from registration/API enum metadata. */
export const DATABASE_SERVER_FILTER_TYPE_OPTIONS = [
  ...DATABASE_SERVER_TYPE_OPTIONS,
  {value: 'DM', label: 'DM'},
  {value: 'KINGBASE', label: 'Kingbase'},
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

const SERVER_FIELD_PLACEHOLDERS: Readonly<Record<string, string>> = {
  Type: '请选择类型', ServerName: '请输入服务器名称', ip_address: '请输入服务器IP地址', Port: '请输入服务器端口',
  UserName: '请输入服务器账号', Password: '请输入服务器密码', description: '请输入描述',
}
type ServerFormSlot = Readonly<{name: string; colSpan: number}>
function serverFormField({name, colSpan}: ServerFormSlot): SparkNode {
  const column = DATABASE_SERVER_REGISTER_COLUMNS.find(item => item.name === name)
  const base = {field: name, label: column?.label ?? name, colSpan, placeholder: SERVER_FIELD_PLACEHOLDERS[name]}
  if (column?.enumOptions) return {type: 'r-select', props: {...base, options: [...column.enumOptions]}}
  if (name === 'description') return {type: 'r-textarea', props: {...base, autosize: {minRows: 3}}}
  return {type: 'r-text', props: {...base, ...(name === 'Password' ? {showPassword: true} : {})}}
}

/** 注册表单（12 栏网格，按参考两列排布）；系统生成的 rowid 不录入，密码输入遮盖。 */
export const DATABASE_SERVER_REGISTER_FORM_FIELDS: SparkNode[] = DATABASE_SERVER_REGISTER_COLUMNS
  .filter(column => !column.isPrimaryKey)
  .map(column => serverFormField({name: column.name, colSpan: column.name === 'description' ? 12 : 6}))

/** 编辑表单按参考排布：类型整行，IP 与名称并排，账号半行，描述整行；不含端口与密码。 */
export const DATABASE_SERVER_EDIT_FORM_FIELDS: SparkNode[] = [
  {name: 'Type', colSpan: 12}, {name: 'ip_address', colSpan: 6}, {name: 'ServerName', colSpan: 6},
  {name: 'UserName', colSpan: 6}, {name: 'description', colSpan: 12},
].map(serverFormField)

/** 参考页列表列：不展示账号、密码等敏感或未列字段。 */
export const DATABASE_SERVER_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'ServerName', label: '服务器名称', minWidth: 220, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'ip_address', label: '服务器IP地址', minWidth: 180, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'Port', label: '端口', width: 100}},
  {type: 'r-select', props: {field: 'Type', label: '类型', width: 150, options: [...DATABASE_SERVER_TYPE_OPTIONS]}},
  {type: 'r-text', props: {field: 'createuser', label: '创建人', width: 140, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间', width: 160}},
  {type: 'r-text', props: {field: 'description', label: '描述', minWidth: 220, showOverflowTooltip: true}},
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
