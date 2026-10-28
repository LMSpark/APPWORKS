/** 低代码应用目录查询的请求体构造与响应归一化。 */
import { LowcodeApiError } from '../core/lowcode-api-error.js'

/** 应用目录 GetData 请求头 x-FormKey 固定值。 */
export const LOWCODE_APPLICATION_CATALOG_FORM_KEY = '7AB874097A1E8711A42FD845939A6E05'

/**
 * 归一化后的应用条目；id 为 Base_AppSystemList.rowid。
 * 可选目录元信息仅在正式来源返回且当前调用可读时提供；缺省表示未知/不可用，不从登录会话补造归属。
 */
export type LowcodeApplication = Readonly<{
  id: string
  name: string
  /** Formal AppName value when returned and readable. */
  code?: string
  /** Formal AppDesc value when returned and readable. */
  description?: string
  /** Formal EntId value when returned and readable; never inferred from session identity. */
  enterpriseId?: string
  /** Formal EntShortName value when returned and readable; never inferred from session identity. */
  enterpriseShortName?: string
  /** True/false only for a readable formal IsSys value of 1/0; undefined means unknown, not false. */
  isDefault?: boolean
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstText(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function optionalText(row: Record<string, unknown>, keys: readonly string[]): string | undefined {
  let emptyValue: string | undefined
  for (const key of keys) {
    if (!Object.hasOwn(row, key)) continue
    const value = row[key]
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (normalized) return normalized
    emptyValue = normalized
  }
  return emptyValue ?? undefined
}

function optionalIsDefault(value: unknown): boolean | undefined {
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  return undefined
}

function queryItems(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) throw new LowcodeApiError(0, 'DataOperation.GetData Result 不是对象或数组')
  const data = isRecord(value['data']) ? value['data'] : isRecord(value['Data']) ? value['Data'] : value
  const items = data['Items'] ?? data['items'] ?? data['Result'] ?? data['result']
  if (items === undefined || items === null) return []
  if (Array.isArray(items)) return items
  throw new LowcodeApiError(0, 'DataOperation.GetData Result.items 不是数组')
}

/** 构造 Base_AppSystemList 应用目录查询体。 */
export function applicationCatalogQuery(): Readonly<Record<string, unknown>> {
  return {
    Table: [{
      Name: 'Base_AppSystemList',
      PrimaryKeyFields: 'rowid',
      OutputType: 'Table',
      Type: '数据库表',
      Filter: null,
      inputParams: [],
      DISTINCT: true,
      IsBusinessMain: 1,
      RelationFilterType: 'and',
    }],
  }
}

/** 归一化应用列表；按 rowid 去重，IsSys=1 映射为 isDefault。 */
export function normalizeApplications(value: unknown): readonly LowcodeApplication[] {
  const seen = new Set<string>()
  return queryItems(value).flatMap((item) => {
    if (!isRecord(item)) return []
    const id = firstText(item, ['rowid', 'ROWID', 'rowId'])
    if (!id || seen.has(id)) return []
    seen.add(id)
    const code = optionalText(item, ['AppName', 'appName'])
    const description = optionalText(item, ['AppDesc', 'appDesc'])
    const enterpriseId = optionalText(item, ['EntId', 'entId'])
    const enterpriseShortName = optionalText(item, ['EntShortName', 'entShortName'])
    const isDefault = optionalIsDefault(item['IsSys'])
    return [{
      id,
      name: description?.trim() ? description : code?.trim() ? code : id,
      ...(code === undefined ? {} : {code}),
      ...(description === undefined ? {} : {description}),
      ...(enterpriseId === undefined ? {} : {enterpriseId}),
      ...(enterpriseShortName === undefined ? {} : {enterpriseShortName}),
      ...(isDefault === undefined ? {} : {isDefault}),
    }]
  })
}
