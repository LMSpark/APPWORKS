/**
 * 低代码应用目录与导航根查询：DataOperation.GetData 请求体构造与响应归一化。
 * wire 行字段大小写混用（rowid/ROWID、AppName/appName 等），归一化层负责别名兼容。
 */
import { LowcodeApiError } from '../core/lowcode-api-error.js'

/** 应用目录 GetData 请求头 x-FormKey 固定值。 */
export const LOWCODE_APPLICATION_CATALOG_FORM_KEY = '7AB874097A1E8711A42FD845939A6E05'

/** 归一化后的应用条目；id 为 Base_AppSystemList.rowid。 */
export type LowcodeApplication = Readonly<{
  id: string
  code: string
  name: string
  description: string
  enterpriseId: string
  enterpriseShortName: string
  isDefault: boolean
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

/** 构造导航根查询体；Filter 固定 SysId + prowId=000000，ValueFun 键 Type 大写。 */
export function navigationRootQuery(systemId: string): Readonly<Record<string, unknown>> {
  return {
    Table: [{
      Name: 'Base_NavigationInfo',
      PrimaryKeyFields: 'rowid',
      OutputType: 'Table',
      Type: '数据库表',
      Filter: {
        Type: 'and',
        Filters: [
          {
            Type: 'cond',
            Field: 'SysId',
            Operator: 'equal',
            Value: null,
            ValueFun: { Type: 'GetConstValue', Value: systemId },
          },
          {
            Type: 'cond',
            Field: 'prowId',
            Operator: 'equal',
            Value: null,
            ValueFun: { Type: 'GetConstValue', Value: '000000' },
          },
        ],
      },
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
    const code = firstText(item, ['AppName', 'appName'])
    const description = firstText(item, ['AppDesc', 'appDesc'])
    return [{
      id,
      code,
      name: description || code || id,
      description,
      enterpriseId: firstText(item, ['EntId', 'entId']),
      enterpriseShortName: firstText(item, ['EntShortName', 'entShortName']),
      isDefault: Number(item['IsSys'] ?? 0) === 1,
    }]
  })
}

/** 从导航查询结果提取唯一根 rowid；非 1 条根节点时 fail-fast。 */
export function normalizeNavigationRootId(value: unknown): string {
  const roots = queryItems(value).flatMap((item) => {
    if (!isRecord(item)) return []
    const id = firstText(item, ['rowid', 'ROWID', 'rowId'])
    return id ? [id] : []
  })
  if (roots.length !== 1) {
    throw new LowcodeApiError(0, `应用导航根节点应唯一，实际 ${roots.length} 个`)
  }
  return roots[0] ?? ''
}
