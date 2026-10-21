/**
 * @module app:lowcode/resources/database/database-server-catalog-metadata
 * 职责：服务器目录专题列元数据（loadCatalog 装配后 patch DataTable.columns，供 autoColumns 消费）。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {DATABASE_SERVER_MODEL} from './lowcode-database-server'

export const DATABASE_SERVER_TYPE_OPTIONS = [
  {value: 'MYSQL', label: 'MySQL'},
  {value: 'SQLSERVER', label: 'SQL Server'},
  {value: 'ORACLE', label: 'Oracle'},
  {value: 'POSTGRESQL', label: 'PostgreSQL'},
] as const satisfies readonly Readonly<{value: string; label: string}>[]

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
