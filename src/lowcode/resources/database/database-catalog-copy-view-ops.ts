/**
 * @module app:lowcode/resources/database/database-catalog-copy-view-ops
 * 职责：复制物理表（_Base_TblList + Base_TblField 同一次 saveChanges，对齐参考 copyTable）。
 */
import type {DataRow, DataSet} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_TABLE_MODEL,
} from './lowcode-database-table-view'
import {requireDatabaseCatalogFieldView} from './database-catalog-field-view-ops'
import {requireDatabaseCatalogTableView} from './database-catalog-table-view-ops'

const fieldCopyKeys = [
  'enname', 'cnname', 'DataTypeName', 'DataType', 'DataLen',
  'IsNill', 'IsPKey', 'IsUQ', 'IsSys', 'DefaultValue', 'Memo', 'ordIdx',
] as const

export type DatabaseCatalogCopyTableInput = Readonly<{
  sourceTableId: string
  dbId: string
  newTableName: string
  newTableDesc: string
}>

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

function compareName(value: unknown): string {
  return scalar(value).toLowerCase()
}

function copyFieldScalar(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (key === 'IsPKey' || key === 'IsUQ' || key === 'IsSys' || key === 'IsNill' || key === 'ordIdx' || key === 'DataLen') {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  }
  return value
}

function copyFieldPayload(source: DataRow, tblid: string, tblname: string): Partial<DataRow> {
  const payload: Record<string, unknown> = {tblid, tblname}
  for (const key of fieldCopyKeys) {
    if (key in source) payload[key] = copyFieldScalar(key, source[key])
  }
  return payload
}

export async function databaseCatalogCopyTable(dataSet: DataSet, input: DatabaseCatalogCopyTableInput): Promise<string> {
  const sourceTableId = input.sourceTableId.trim()
  const dbId = input.dbId.trim()
  const newTableName = input.newTableName.trim()
  const newTableDesc = input.newTableDesc.trim()
  if (!sourceTableId) throw new Error('源表 rowid 不能为空')
  if (!dbId) throw new Error('请先选择数据库')
  if (!newTableName) throw new Error('新表名不能为空')
  if (!newTableDesc) throw new Error('新表描述不能为空')

  const tableView = requireDatabaseCatalogTableView(dataSet)
  const fieldView = requireDatabaseCatalogFieldView(dataSet, DATABASE_CATALOG_FIELD_TABLE_VIEW)
  if (tableView.mutating || fieldView.mutating || tableView.hasUnconfirmedSave || fieldView.hasUnconfirmedSave) {
    throw new Error('目录保存进行中，不能复制表')
  }

  const sourceRow = tableView.rows.find(item => tableView.getPkKey(item) === sourceTableId)
  if (!sourceRow) throw new Error('源表不存在，无法复制')
  if (compareName(sourceRow['dbid']) !== compareName(dbId)) throw new Error('源表不属于当前数据库')

  const duplicate = tableView.rows.some(item =>
    compareName(item['dbid']) === compareName(dbId) && compareName(item['tblname']) === compareName(newTableName))
  if (duplicate) throw new Error('当前数据库中已存在同名表，请重新输入')

  tableView.setSelectedRows([sourceRow])
  await fieldView.refresh()
  if (fieldView.loadingError) throw fieldView.loadingError
  const sourceFields = fieldView.rows.filter(item => scalar(item['tblid']) === sourceTableId)
  if (sourceFields.length === 0) throw new Error('源表没有字段，无法复制')

  const newRowId = crypto.randomUUID().replaceAll('-', '').toUpperCase()
  const schemaName = scalar(sourceRow['schemaName']) || 'dbo'
  const status = scalar(sourceRow['status']) || '1'
  await tableView.addRowWithIdentity({field: 'rowid', value: newRowId}, {
    dbid: dbId,
    tblname: newTableName,
    tbldesc: newTableDesc,
    schemaName,
    status,
  })

  for (const sourceField of sourceFields) {
    await fieldView.addRow(copyFieldPayload(sourceField, newRowId, newTableName))
  }

  const result = await dataSet.saveChanges({
    views: [
      {tableName: DATABASE_CATALOG_TABLE_MODEL, viewId: tableView.viewId},
      {tableName: DATABASE_CATALOG_FIELD_MODEL, viewId: fieldView.viewId},
    ],
  })
  if (!result.success) throw new Error(result.message ?? '复制表失败')

  await tableView.refresh()
  if (tableView.loadingError) throw tableView.loadingError
  const created = tableView.rows.find(item => tableView.getPkKey(item) === newRowId)
  if (!created) throw new Error('复制已提交，但目录尚未见到新表，请刷新后核对')

  return newRowId
}
