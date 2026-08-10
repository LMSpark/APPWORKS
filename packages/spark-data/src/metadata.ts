/**
 * @module @spark-appworks/spark-data:metadata
 * 职责：提供数据层 metadata 能力，围绕 TableMetadataLike 描述 DataSet、DataTable、DataView、策略委托或数据绑定键。
 * 边界：保持框架无关，只处理数据模型、校验和本地策略，不依赖 Vue、路由或 Element Plus。
 * AI用途：生成页面数据绑定、DataViewKey 或数据策略调用时，用本模块确认 metadata 的数据语义。
 */
import { isRecord } from '@spark-appworks/spark-utils'
import type { DataSetMetadata, TableMetadata, ViewMetadata } from './types'

/** Table Metadata Like 的语义模型。 */
type TableMetadataLike = Omit<TableMetadata, 'tableName'> & {
    /** 数据表名。 */
tableName?: string}

function isTableMetadataLike(value: unknown): value is TableMetadataLike {
  if (!isRecord(value)) return false
  if (!Array.isArray(value['columns'])) return false
  const views = value['views']
  return isRecord(views) && isRecord(views['default'])
}

/**
 * 解析表元数据输入（对象、松散对象或 JSON 字符串）为规范 TableMetadata。
 */
export function parseTableMetadataInput(
  data: TableMetadata | Record<string, unknown> | string,
): TableMetadata {
  if (typeof data === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      throw new Error('DataTable.fromJson: 无效的 JSON 数据')
    }
    if (!isTableMetadataLike(parsed)) {
      throw new Error('DataTable.fromJson: JSON 缺少 columns 或 views.default')
    }
    return normalizeTableMetadata(parsed)
  }
  if (!isTableMetadataLike(data)) {
    throw new Error('DataTable.fromJson: 缺少 columns 或 views.default')
  }
  return normalizeTableMetadata(data)
}

/**
 * 解析视图元数据输入（对象、松散对象或 JSON 字符串）。
 */
export function parseViewMetadataInput(
  data: ViewMetadata | Record<string, unknown> | string,
  tableName: string,
  viewId: string,
): ViewMetadata {
  if (typeof data === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      throw new Error('DataView.fromJson: 无效的 JSON 数据')
    }
    if (!isRecord(parsed)) {
      throw new Error('DataView.fromJson: JSON 必须解析为对象')
    }
    return normalizeViewMetadata(parsed, tableName, viewId)
  }
  if (isRecord(data)) {
    return normalizeViewMetadata(data, tableName, viewId)
  }
  return normalizeViewMetadata(data, tableName, viewId)
}

function normalizeViewMetadata(
  view: ViewMetadata | Record<string, unknown>,
  tableName: string,
  viewId: string,
): ViewMetadata {
  const normalized: ViewMetadata = { tableName, viewId }
  Object.assign(normalized, view)
  normalized.tableName ??= tableName
  normalized.viewId ??= viewId
  return normalized
}

function validateViewFieldProjection(
  tableName: string,
  columns: TableMetadata['columns'],
  viewId: string,
  view: ViewMetadata,
): void {
  const projection = view.fieldProjection
  if (projection === undefined) return
  const columnNames = new Set(columns.map((column) => column.name))
  const fieldIds = new Set<string>()
  const viewFields = new Set<string>()
  for (const field of projection) {
    if (!field.fieldId.trim()) throw new Error(`表 ${tableName} 视图 ${viewId} 的 fieldId 不能为空`)
    if (!field.viewField.trim()) throw new Error(`表 ${tableName} 视图 ${viewId} 的 viewField 不能为空`)
    if (fieldIds.has(field.fieldId)) throw new Error(`表 ${tableName} 视图 ${viewId} 的 fieldId 重复: ${field.fieldId}`)
    if (viewFields.has(field.viewField)) throw new Error(`表 ${tableName} 视图 ${viewId} 的 viewField 重复: ${field.viewField}`)
    fieldIds.add(field.fieldId)
    viewFields.add(field.viewField)
    if (field.source === 'resource') {
      if (!field.resourceFieldId?.trim()) {
        throw new Error(`表 ${tableName} 视图 ${viewId} 的资源字段 ${field.fieldId} 缺少 resourceFieldId`)
      }
      if (!columnNames.has(field.resourceField)) {
        throw new Error(`表 ${tableName} 视图 ${viewId} 引用了不存在的资源字段: ${field.resourceField}`)
      }
      if (field.primaryKey && field.viewField !== field.resourceField) {
        throw new Error(`表 ${tableName} 视图 ${viewId} 的主键字段不得改名: ${field.resourceField}`)
      }
    } else if (field.resourceFieldId !== null) {
      throw new Error(`表 ${tableName} 视图 ${viewId} 的派生字段 ${field.fieldId} 不得声明 resourceFieldId`)
    }
  }
}

export function normalizeTableMetadata(
  input: TableMetadataLike,
  tableNameFromKey?: string,
): TableMetadata {
  const tableName = input.tableName ?? tableNameFromKey
  if (tableName === undefined || tableName.trim() === '') {
    throw new Error('TableMetadata.tableName 不能为空')
  }

  if (!Object.prototype.hasOwnProperty.call(input.views, 'default')) {
    throw new Error(`表 ${tableName} 缺少 views.default`)
  }

  const normalizedViews: TableMetadata['views'] = {
    default: normalizeViewMetadata(input.views.default, tableName, 'default'),
  }
  for (const [viewId, view] of Object.entries(input.views)) {
    if (viewId === 'default') continue
    normalizedViews[viewId] = normalizeViewMetadata(view, tableName, viewId)
  }
  for (const [viewId, view] of Object.entries(normalizedViews)) {
    validateViewFieldProjection(tableName, input.columns, viewId, view)
  }

  return {
    tableName,
    columns: input.columns,
    ...(input.resourceType !== undefined ? { resourceType: input.resourceType } : {}),
    ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
    ...(input.businessCategory !== undefined ? { businessCategory: input.businessCategory } : {}),
    ...(input.api !== undefined ? { api: input.api } : {}),
    ...(input.crudConfig !== undefined ? { crudConfig: input.crudConfig } : {}),
    views: normalizedViews,
  }
}

export function normalizeDataSetMetadata(input: DataSetMetadata): DataSetMetadata {
  const normalizedTables: Record<string, TableMetadata> = {}

  for (const [tableName, rawTable] of Object.entries(input.tables)) {
    normalizedTables[tableName] = normalizeTableMetadata(rawTable, tableName)
  }

  const normalizedLayout = (() => {
    if (input.layout === undefined) return undefined
    const raw = input.layout.tablePositions
    if (raw === undefined) return {}

    const tablePositions: Record<string, { x: number; y: number }> = {}
    for (const [tableName, value] of Object.entries(raw)) {
      if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
        tablePositions[tableName] = { x: value.x, y: value.y }
      }
    }

    return { tablePositions }
  })()

  return {
    schemaVersion: input.schemaVersion ?? 2,
    dataSetName: input.dataSetName,
    tables: normalizedTables,
    ...(input.resourceRelations !== undefined ? { resourceRelations: input.resourceRelations } : {}),
    ...(input.viewCascades !== undefined ? { viewCascades: input.viewCascades } : {}),
    ...(input.version !== undefined ? { version: input.version } : {}),
    ...(input.pageId !== undefined ? { pageId: input.pageId } : {}),
    ...(input.saveChanges !== undefined ? { saveChanges: input.saveChanges } : {}),
    ...(normalizedLayout !== undefined ? { layout: normalizedLayout } : {}),
  }
}
