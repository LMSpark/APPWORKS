/**
 * DataSpace 资源类型与 wire 中文标签的双向映射（设计读回 / 运行写出共用）。
 * 领域正式名仍为 {@link DataSpaceResourceType}；禁止在 design/runtime 各维护一份表。
 */
import { LowcodeApiError } from '../../core/lowcode-api-error.js'
import type { TableResourceType } from '@spark-appworks/spark-data'
import type { DataSpaceResourceType } from './data-space.js'

/** wire Type 字段中文标签（Jackson / GetData 资源行）。 */
export type DataSpaceResourceTypeWireLabel =
  | '数据库表'
  | '视图'
  | '字典'
  | '接口'
  | 'JSON'
  | '文件'

const DOMAIN_TO_WIRE: Readonly<Record<DataSpaceResourceType, DataSpaceResourceTypeWireLabel>> = {
  table: '数据库表',
  view: '视图',
  dictionary: '字典',
  interface: '接口',
  json: 'JSON',
  file: '文件',
}

type ResourceLabelDescriptor = Readonly<{ domain?: DataSpaceResourceType; native: TableResourceType }>
type ResourceLabelMap = Readonly<Record<string, ResourceLabelDescriptor>>

const RESOURCE_LABELS: ResourceLabelMap = {
  数据库表: { domain: 'table', native: 'database-table' },
  数据库视图: { domain: 'view', native: 'database-view' },
  视图: { domain: 'view', native: 'logical-view' },
  字典: { domain: 'dictionary', native: 'dictionary' },
  接口: { domain: 'interface', native: 'third-party-api' },
  JSON: { domain: 'json', native: 'json' },
  文件: { domain: 'file', native: 'file' },
  表: { native: 'database-table' },
  table: { native: 'database-table' },
}

/** 领域资源类型 → wire Type 中文标签。 */
export function encodeDataSpaceResourceType(type: DataSpaceResourceType): DataSpaceResourceTypeWireLabel {
  if (!Object.hasOwn(DOMAIN_TO_WIRE, type)) throw new LowcodeApiError(0, `未知数据资源类型: ${type}`)
  return DOMAIN_TO_WIRE[type]
}

/** wire Type 中文标签 → 领域资源类型；未知值 fail-fast。 */
export function parseDataSpaceResourceType(value: unknown): DataSpaceResourceType {
  const raw = value === undefined || value === null ? '' : String(value).trim()
  if (!raw) throw new LowcodeApiError(0, '前端模型 Type 不能为空')
  const normalized = Object.hasOwn(RESOURCE_LABELS, raw) ? RESOURCE_LABELS[raw]?.domain : undefined
  if (normalized === undefined) throw new LowcodeApiError(0, `未知数据资源类型: ${raw}`)
  return normalized
}

/** 正式模型 Type 原标签 → 原生 DataTable 资源类别；保留数据库视图与逻辑视图区别。 */
export function parseNativeDataSpaceResourceType(value: unknown): TableResourceType {
  const label = typeof value === 'string' ? value : ''
  const native = Object.hasOwn(RESOURCE_LABELS, label) ? RESOURCE_LABELS[label]?.native : undefined
  if (native === undefined) throw new LowcodeApiError(0, `未知正式模型资源类型: ${label}`)
  return native
}
