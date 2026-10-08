/**
 * @module @spark-appworks/spark-data:core/data-view-key
 * 职责：提供 spark-data 数据管线中的 data view key 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * DataViewKey — DataView location and member access helpers.
 *
 * DataViewKey locates a DataView:
 *   - `tableName@viewId`
 *   - `#scope@tableName@viewId`
 *
 * DataMember identifies a DataView output member. dataField optionally reads a
 * business field/path from object-shaped members including currentRow or
 * aggregateResult.
 */

import { isRecord } from '@spark-appworks/spark-utils'
import type { DataView } from '../data-view'
import { isDataRow } from './data-row-guards'
import type {
  AggregateResultRow,
  DataColumn,
  DataRow,
  DataSetContract,
  DataSource,
} from '../types'

/** Data Member 的语义模型。 */
export enum DataMember {
    /** Rows 字段。 */
Rows = 'rows',
    /** Columns 字段。 */
Columns = 'columns',
    /** Current Row 字段。 */
CurrentRow = 'currentRow',
    /** Selected Rows 字段。 */
SelectedRows = 'selectedRows',
    /** Aggregate Result 结果。 */
AggregateResult = 'aggregateResult',
    /** Selection Aggregate Result 结果。 */
SelectionAggregateResult = 'selectionAggregateResult',
    /** Total 字段。 */
Total = 'total',
    /** Page 字段。 */
Page = 'page',
    /** Page Size 大小。 */
PageSize = 'pageSize',
    /** Request State 状态。 */
RequestState = 'requestState',
    /** Mutating 字段。 */
Mutating = 'mutating',
    /** Loading Error 错误信息。 */
LoadingError = 'loadingError',
    /** Mutating Error 错误信息。 */
MutatingError = 'mutatingError',
}

/** Data View Key Descriptor 的语义模型。 */
export type DataViewKeyDescriptor = {
  /** DataSet scope, present only for cross-page `#scope` references. */
  scope?: string
  /** DataTable name. */
  tableName: string
  /** DataView id. */
  viewId: string
  /** Original dataViewKey string. */
  raw: string
  /** Whether this key uses the cross-page `#scope` prefix. */
  crossPage?: boolean}

/** Data View Member Descriptor 的语义模型。 */
export type DataViewMemberDescriptor = DataViewKeyDescriptor & {
  /** DataView output member. */
    dataMember: DataMember
    /** Optional business field/path inside object-shaped members. */
    dataField?: string}

/** Data View Member Input 的输入数据。 */
export type DataViewMemberInput = {
    /** DataView 定位键。 */
dataViewKey: string | undefined
    /** DataView 成员名。 */
dataMember: DataMember | `${DataMember}` | undefined
    /** DataView 成员字段路径。 */
dataField?: string | undefined}

/** Data View Member Object 的语义模型。 */
export type DataViewMemberObject = {
  [key: string]: unknown}

// 这里不再为 JS 基础类型保留导出别名，DataView 标量成员直接在联合类型中内联。
/** Data View Member Value 的语义模型。 */
export type DataViewMemberValue =
  | DataRow
  | AggregateResultRow
  | readonly DataRow[]
  | readonly DataColumn[]
  | DataViewMemberObject
  | readonly unknown[]
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Error

const SEPARATOR = '@'
const CROSS_PAGE_PREFIX = '#'

const DATA_MEMBER_VALUES = new Set<string>(Object.values(DataMember))

const FIELD_ADDRESSABLE_MEMBERS = new Set<DataMember>([
  DataMember.CurrentRow,
  DataMember.AggregateResult,
  DataMember.SelectionAggregateResult,
])

function parseScopedParts(rawKey: string): string[] | null {
  if (!rawKey.startsWith(CROSS_PAGE_PREFIX)) return null
  return rawKey.substring(1).split(SEPARATOR)
}

function normalizeDataField(dataField: string | undefined): string | undefined {
  if (typeof dataField !== 'string') return undefined
  const normalized = dataField.trim()
  return normalized.length > 0 ? normalized : undefined
}

function parseDataMember(value: DataViewMemberInput['dataMember']): DataMember | null {
  if (typeof value !== 'string') return null
  return isDataMember(value) ? value : null
}

function isDataMember(value: string): value is DataMember {
  return DATA_MEMBER_VALUES.has(value)
}

function extractDataField(value: unknown, dataField: string): unknown {
  const pathParts = dataField.split('.')
  let current: unknown = value

  for (const part of pathParts) {
    if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part]
    } else {
      return undefined
    }
  }

  return current
}

function normalizeDataViewMemberValue(value: unknown): DataViewMemberValue {
  if (value instanceof Error) return value
  if (Array.isArray(value)) return value.map((item: unknown) => item)
  if (isRecord(value)) return value
  if (value === null || value === undefined) return value

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol':
      return value
    case 'undefined':
    case 'object':
    case 'function':
      return undefined
    default:
      return undefined
  }
}

function getDataViewMemberValue(view: DataView, dataMember: DataMember): DataViewMemberValue {
  switch (dataMember) {
    case DataMember.Rows: return view.rows
    case DataMember.Columns: return view.columns
    case DataMember.CurrentRow: return view.currentRow
    case DataMember.SelectedRows: return view.selectedRows
    case DataMember.AggregateResult: return view.aggregateResult
    case DataMember.SelectionAggregateResult: return view.selectionAggregateResult
    case DataMember.Total: return view.total
    case DataMember.Page: return view.page
    case DataMember.PageSize: return view.pageSize
    case DataMember.RequestState: return view.requestState
    case DataMember.Mutating: return view.mutating
    case DataMember.LoadingError: return view.loadingError
    case DataMember.MutatingError: return view.mutatingError
  }
}

function resolveValueWithField(
  value: DataViewMemberValue,
  dataMember: DataMember,
  dataField: string | undefined,
): DataViewMemberValue {
  if (dataField === undefined) return value
  if (!FIELD_ADDRESSABLE_MEMBERS.has(dataMember)) return undefined
  if (!isRecord(value)) return undefined
  return normalizeDataViewMemberValue(extractDataField(value, dataField))
}

export function isDataViewKey(dataViewKey: string): boolean {
  return parseDataViewKey(dataViewKey) !== null
}

export function parseDataViewKey(dataViewKey: string): DataViewKeyDescriptor | null {
  if (!dataViewKey) return null

  const scopedParts = parseScopedParts(dataViewKey)
  if (scopedParts) {
    if (scopedParts.length !== 3) return null
    const [scope, tableName, viewId] = scopedParts
    if (!scope || !tableName || !viewId) return null
    return { scope, tableName, viewId, raw: dataViewKey, crossPage: true }
  }

  const parts = dataViewKey.split(SEPARATOR)
  if (parts.length !== 2) return null
  const [tableName, viewId] = parts
  if (!tableName || !viewId) return null
  return { tableName, viewId, raw: dataViewKey }
}

export function buildDataViewKey(
  tableName: string,
  viewId = 'default',
  scope?: string,
): string {
  const prefix = scope ? `${CROSS_PAGE_PREFIX}${scope}${SEPARATOR}` : ''
  return `${prefix}${tableName}${SEPARATOR}${viewId}`
}

export function resolveDataViewKey(
  dataViewKey: string | undefined,
  dataSet: DataSetContract | null | undefined,
): DataView | undefined {
  if (!dataViewKey || !dataSet) return undefined
  const descriptor = parseDataViewKey(dataViewKey)
  if (!descriptor) return undefined
  return dataSet.getView(descriptor.tableName, descriptor.viewId)
}

function parseDataViewMemberDescriptor(input: DataViewMemberInput): DataViewMemberDescriptor | null {
  const key = typeof input.dataViewKey === 'string' ? input.dataViewKey.trim() : ''
  const keyDescriptor = key ? parseDataViewKey(key) : null
  if (!keyDescriptor) return null
  const dataMember = parseDataMember(input.dataMember)
  if (dataMember === null) return null
  const dataField = normalizeDataField(input.dataField)
  return {
    ...keyDescriptor,
    dataMember,
    ...(dataField !== undefined ? { dataField } : {}),
  }
}

export function resolveDataViewMember(
  input: DataViewMemberInput,
  dataSet: DataSetContract | null | undefined,
): DataViewMemberValue {
  if (!dataSet) return undefined
  const descriptor = parseDataViewMemberDescriptor(input)
  if (!descriptor) return undefined
  const view = dataSet.getView(descriptor.tableName, descriptor.viewId)
  if (!view) return undefined
  return resolveValueWithField(
    getDataViewMemberValue(view, descriptor.dataMember),
    descriptor.dataMember,
    descriptor.dataField,
  )
}

/** Data View Member Binding 的语义模型。 */
export type DataViewMemberBinding = {
    /** 类型判别字段。 */
kind: 'value'
    /** 当前值。 */
value: DataViewMemberValue
    /** 来源对象。 */
source: DataSource
    /** descriptor 字段。 */
descriptor: DataViewMemberDescriptor}

export function resolveDataViewMemberBinding(
  input: DataViewMemberInput,
  dataSet: DataSetContract | null | undefined,
): DataViewMemberBinding | null {
  if (!dataSet) return null
  const descriptor = parseDataViewMemberDescriptor(input)
  if (!descriptor) return null
  const view = dataSet.getView(descriptor.tableName, descriptor.viewId)
  if (!view) return null
  const value = resolveValueWithField(
    getDataViewMemberValue(view, descriptor.dataMember),
    descriptor.dataMember,
    descriptor.dataField,
  )
  return {
    kind: 'value',
    value,
    source: view,
    descriptor,
  }
}

/** Data View Key Diagnostic Status 的语义模型。 */
export type DataViewKeyDiagnosticStatus =
  | 'ok'
  | 'invalid-key'
  | 'missing-dataset'
  | 'missing-table'
  | 'missing-view'

/** Data View Key Diagnostic 的诊断信息。 */
export type DataViewKeyDiagnostic = {
    /** ok 字段。 */
ok: boolean
    /** 当前状态。 */
status: DataViewKeyDiagnosticStatus
    /** raw Key 键。 */
rawKey: string
    /** descriptor 字段。 */
descriptor: DataViewKeyDescriptor | null
    /** 用户可读消息。 */
message: string}

/** Data View Member Diagnostic Status 的语义模型。 */
export type DataViewMemberDiagnosticStatus =
  | DataViewKeyDiagnosticStatus
  | 'invalid-member'
  | 'empty-current-row'
  | 'empty-selection'
  | 'missing-field'
  | 'unsupported-data-field'

/** Data View Member Diagnostic 的诊断信息。 */
export type DataViewMemberDiagnostic = {
    /** ok 字段。 */
ok: boolean
    /** 当前状态。 */
status: DataViewMemberDiagnosticStatus
    /** raw Key 键。 */
rawKey: string
    /** descriptor 字段。 */
descriptor: DataViewMemberDescriptor | null
    /** 用户可读消息。 */
message: string}

type DataViewKeyDiagnosticInput = Readonly<{
  status: DataViewKeyDiagnosticStatus
  rawKey: string
  descriptor: DataViewKeyDescriptor | null
  message: string
}>

type DataViewMemberDiagnosticInput = Readonly<{
  status: DataViewMemberDiagnosticStatus
  rawKey: string
  descriptor: DataViewMemberDescriptor | null
  message: string
}>

function dataViewKeyDiagnostic(input: DataViewKeyDiagnosticInput): DataViewKeyDiagnostic {
  const { status, rawKey, descriptor, message } = input
  return {
    ok: status === 'ok',
    status,
    rawKey,
    descriptor,
    message,
  }
}

function dataViewMemberDiagnostic(input: DataViewMemberDiagnosticInput): DataViewMemberDiagnostic {
  const { status, rawKey, descriptor, message } = input
  return {
    ok: status === 'ok',
    status,
    rawKey,
    descriptor,
    message,
  }
}

export function diagnoseDataViewKey(
  rawKey: string,
  dataSet: DataSetContract | null | undefined,
): DataViewKeyDiagnostic {
  const normalizedKey = typeof rawKey === 'string' ? rawKey.trim() : ''
  const descriptor = normalizedKey ? parseDataViewKey(normalizedKey) : null
  if (!descriptor) {
    return dataViewKeyDiagnostic({ status: 'invalid-key', rawKey, descriptor: null, message: `无效 DataViewKey: ${rawKey}` })
  }
  if (!dataSet) {
    return dataViewKeyDiagnostic({ status: 'missing-dataset', rawKey, descriptor, message: `DataSet 未就绪: ${rawKey}` })
  }
  const table = dataSet.getTable(descriptor.tableName)
  if (!table) {
    return dataViewKeyDiagnostic({ status: 'missing-table', rawKey, descriptor, message: `DataViewKey 表不存在: ${descriptor.tableName}` })
  }
  const view = table.getView(descriptor.viewId)
  if (!view) {
    return dataViewKeyDiagnostic({ status: 'missing-view', rawKey, descriptor, message: `DataViewKey 视图不存在: ${descriptor.tableName}@${descriptor.viewId}` })
  }
  return dataViewKeyDiagnostic({ status: 'ok', rawKey, descriptor, message: `DataViewKey 可解析: ${rawKey}` })
}

export function diagnoseDataViewMember(
  input: DataViewMemberInput,
  dataSet: DataSetContract | null | undefined,
): DataViewMemberDiagnostic {
  const rawKey = typeof input.dataViewKey === 'string' ? input.dataViewKey : ''
  const normalizedKey = rawKey.trim()
  const keyDescriptor = normalizedKey ? parseDataViewKey(normalizedKey) : null
  if (!keyDescriptor) {
    return dataViewMemberDiagnostic({ status: 'invalid-key', rawKey, descriptor: null, message: `无效 DataViewKey: ${rawKey}` })
  }

  const dataMember = parseDataMember(input.dataMember)
  if (dataMember === null) {
    return dataViewMemberDiagnostic({ status: 'invalid-member', rawKey, descriptor: null, message: `无效 DataMember: ${String(input.dataMember)}` })
  }

  const dataField = normalizeDataField(input.dataField)
  const descriptor: DataViewMemberDescriptor = {
    ...keyDescriptor,
    dataMember,
    ...(dataField !== undefined ? { dataField } : {}),
  }

  if (!dataSet) {
    return dataViewMemberDiagnostic({ status: 'missing-dataset', rawKey, descriptor, message: `DataSet 未就绪: ${rawKey}` })
  }

  const table = dataSet.getTable(descriptor.tableName)
  if (!table) {
    return dataViewMemberDiagnostic({ status: 'missing-table', rawKey, descriptor, message: `DataViewKey 表不存在: ${descriptor.tableName}` })
  }

  const view = table.getView(descriptor.viewId)
  if (!view) {
    return dataViewMemberDiagnostic({ status: 'missing-view', rawKey, descriptor, message: `DataViewKey 视图不存在: ${descriptor.tableName}@${descriptor.viewId}` })
  }

  const value = getDataViewMemberValue(view, descriptor.dataMember)
  if (descriptor.dataMember === DataMember.CurrentRow && value === null) {
    return dataViewMemberDiagnostic({ status: 'empty-current-row', rawKey, descriptor, message: `DataMember 当前行为空: ${rawKey}` })
  }
  if (descriptor.dataMember === DataMember.SelectedRows && Array.isArray(value) && value.length === 0) {
    return dataViewMemberDiagnostic({ status: 'empty-selection', rawKey, descriptor, message: `DataMember 选中行为空: ${rawKey}` })
  }

  if (descriptor.dataField !== undefined) {
    if (!FIELD_ADDRESSABLE_MEMBERS.has(descriptor.dataMember)) {
      return dataViewMemberDiagnostic({ status: 'unsupported-data-field', rawKey, descriptor, message: `dataField 不适用于当前 DataMember: ${descriptor.dataMember}` })
    }
    if (!isRecord(value)) {
      return dataViewMemberDiagnostic({ status: 'unsupported-data-field', rawKey, descriptor, message: `dataField 不适用于当前值: ${rawKey}` })
    }
    if (extractDataField(value, descriptor.dataField) === undefined) {
      return dataViewMemberDiagnostic({ status: 'missing-field', rawKey, descriptor, message: `dataField 字段不存在: ${descriptor.dataField}` })
    }
  }

  return dataViewMemberDiagnostic({ status: 'ok', rawKey, descriptor, message: `DataView 成员可解析: ${rawKey}` })
}

export function getDataViewIdentity(descriptor: DataViewKeyDescriptor): string {
  return `${descriptor.tableName}.${descriptor.viewId}`
}

/** Resolved Data View Capabilities 的语义模型。 */
export type ResolvedDataViewCapabilities = {
  /** Resolved DataView, or null when unavailable. */
  dataSource: DataView | null
  /** Resolved row-like context, or null when unavailable. */
  dataRow: DataRow | null}

export function resolveDataViewCapabilities(
  input: Partial<DataViewMemberInput>,
  dataSet: DataSetContract | null | undefined,
): ResolvedDataViewCapabilities {
  const empty: ResolvedDataViewCapabilities = { dataSource: null, dataRow: null }
  if (!input.dataViewKey || !dataSet) return empty

  const view = resolveDataViewKey(input.dataViewKey, dataSet)
  if (!view) return empty

  if (input.dataMember === undefined) {
    return {
      dataSource: view,
      dataRow: isDataRow(view.currentRow) ? view.currentRow : null,
    }
  }

  const value = resolveDataViewMember({
    dataViewKey: input.dataViewKey,
    dataMember: input.dataMember,
    dataField: input.dataField,
  }, dataSet)

  return {
    dataSource: view,
    dataRow: isDataRow(value) ? value : null,
  }
}
