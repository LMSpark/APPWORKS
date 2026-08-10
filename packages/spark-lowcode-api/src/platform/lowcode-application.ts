import { LowcodeApiError } from '../core/lowcode-api-error.js'

export const LOWCODE_APPLICATION_CATALOG_FORM_KEY = '7AB874097A1E8711A42FD845939A6E05'

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
