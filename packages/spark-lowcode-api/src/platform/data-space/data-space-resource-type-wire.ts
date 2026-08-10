/**
 * DataSpace 资源类型与 wire 中文标签的双向映射（设计读回 / 运行写出共用）。
 * 领域正式名仍为 {@link DataSpaceResourceType}；禁止在 design/runtime 各维护一份表。
 */
import { LowcodeApiError } from '../../core/lowcode-api-error.js'
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

const WIRE_TO_DOMAIN: Readonly<Record<string, DataSpaceResourceType>> = {
  数据库表: 'table',
  数据库视图: 'view',
  视图: 'view',
  字典: 'dictionary',
  接口: 'interface',
  JSON: 'json',
  文件: 'file',
}

/** 领域资源类型 → wire Type 中文标签。 */
export function encodeDataSpaceResourceType(type: DataSpaceResourceType): DataSpaceResourceTypeWireLabel {
  return DOMAIN_TO_WIRE[type]
}

/** wire Type 中文标签 → 领域资源类型；未知值 fail-fast。 */
export function parseDataSpaceResourceType(value: unknown): DataSpaceResourceType {
  const raw = value === undefined || value === null ? '' : String(value).trim()
  if (!raw) throw new LowcodeApiError(0, '前端模型 Type 不能为空')
  const normalized = WIRE_TO_DOMAIN[raw]
  if (normalized === undefined) throw new LowcodeApiError(0, `未知数据资源类型: ${raw}`)
  return normalized
}
