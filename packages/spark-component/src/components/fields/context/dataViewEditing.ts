/**
 * @module @spark-appworks/spark-component:components/fields/context/dataViewEditing
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/context/dataViewEditing 的模块能力，围绕 DataViewEditingEventName、DataViewEditingEvents、DataViewEditingSource 等 4 个公开契约 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/context/dataViewEditing 的声明、导出和使用边界时，从本模块开始。
 */
import { DataView, type DataFieldMemberFormat, type DataFieldMemberPath, type DataRow } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

/** Data View Editing Event Name 的语义模型。 */
export type DataViewEditingEventName =
  | 'editingFieldChanged'
  | 'editingChanged'
  | 'rowsChanged'
  | 'currentRowChanged'
  | 'selectedRowsChanged'
  | 'cleared'

/** Data View Editing Events 的语义模型。 */
export type DataViewEditingEvents = {
  /** 订阅 DataView 编辑态事件。 */
  on(eventName: DataViewEditingEventName, handler: () => void): void
  /** 取消订阅 DataView 编辑态事件。 */
  off(eventName: DataViewEditingEventName, handler: () => void): void
}

/** Data View Editing Source 的语义模型。 */
export type DataViewEditingSource = {
  /** 从行数据中提取主键值。 */
  getPkKey(row: DataRow): string | number | undefined
  /** 检查指定行（或任意行）是否存在未保存的编辑变更。 */
  hasEditingChanges(id?: string | number): boolean
  /** 获取指定 id 的编辑中行副本。 */
  getEditingRow(id: string | number): DataRow | null
  /** 更新指定行字段的编辑值并返回更新后的行副本。 */
  updateEditingValue(id: string | number, field: string, value: unknown): DataRow
  /** 编辑态事件总线（可选）。 */
  events?: DataViewEditingEvents
}

export function isDataViewEditingSource(value: unknown): value is DataViewEditingSource {
  if (!isRecord(value)) return false
  return typeof value['getPkKey'] === 'function'
    && typeof value['hasEditingChanges'] === 'function'
    && typeof value['getEditingRow'] === 'function'
    && typeof value['updateEditingValue'] === 'function'
}

export function resolveDataViewEditingRow(source: unknown, row: DataRow | null): DataRow | null {
  if (!row || !isDataViewEditingSource(source)) return null
  const rowId = source.getPkKey(row)
  if (rowId === undefined || !source.hasEditingChanges(rowId)) return null
  return source.getEditingRow(rowId)
}

/** Data View Editing Write Input 的输入数据。 */
export type DataViewEditingWriteInput = Readonly<{
  /** DataView 编辑源对象。 */
  source: unknown
  /** 目标行数据。 */
  row: DataRow | null
  /** 要写入的字段名。 */
  field: string
  /** 要写入的字段值。 */
  value: unknown
}>

export function writeDataViewEditingValue(input: DataViewEditingWriteInput): boolean {
  const { source, row, field, value } = input
  if (!row || !isDataViewEditingSource(source)) return false
  const rowId = source.getPkKey(row)
  if (rowId === undefined) return false
  source.updateEditingValue(rowId, field, value)
  return true
}

/** JSON 成员写入的输入；成员合并、取消与保存差异沿源字段由 DataView 承接。 */
export type DataViewEditingMemberWriteInput = DataViewEditingWriteInput & Readonly<{
  /** 源字段内成员路径。 */
  path: DataFieldMemberPath
  /** 源字段存储格式。 */
  format: DataFieldMemberFormat
}>

export function writeDataViewEditingMember(input: DataViewEditingMemberWriteInput): boolean {
  const { source, row, field, path, format, value } = input
  if (!row || !(source instanceof DataView)) return false
  const rowId = source.getPkKey(row)
  if (rowId === undefined) return false
  source.updateEditingMember(rowId, {field, path, format, value})
  return true
}
