/**
 * 企业目录归一化：GetBaseData 的 wire 字段映射。
 * 企业 wire 键多为 PascalCase（ShortName、ShortCName 等）；目录按 ShortName 去重。
 */
import {isRecord} from '@spark-appworks/spark-utils'

import {readLowcodeQueryItems} from '../core/lowcode-query-items.js'

/** 企业目录条目；shortName 为登录 entName 与域标识。 */
export type LowcodeEnterpriseCatalogItem = Readonly<{
  id: string
  name: string
  shortName: string
  shortCode: string
}>

function firstText(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function queryItems(value: unknown): readonly unknown[] {
  return readLowcodeQueryItems(value,{label:'企业目录',itemKeys:['Items','items']})
}

/** 构造 Base_Enterprise_Info 企业目录 GetBaseData 查询体。 */
export function enterpriseCatalogQuery(): Readonly<Record<string, unknown>> {
  return {
    Table: [{
      Name: 'Base_Enterprise_Info',
      Type: '数据库表',
      DbName: 'QYVirtualPlat',
      Fields: [
        { Name: 'rowid', FieldType: 'varchar', IsOutput: true },
        { Name: 'ShortCName', FieldType: 'varchar', IsOutput: true },
        { Name: 'ShortName', FieldType: 'varchar', IsOutput: true },
      ],
    }],
  }
}

/** 归一化企业目录；按 ShortName 去重，id 优先 rowid 否则回退 shortName。 */
export function normalizeEnterpriseCatalog(value: unknown): readonly LowcodeEnterpriseCatalogItem[] {
  const seen = new Set<string>()
  return queryItems(value).flatMap((item) => {
    if (!isRecord(item)) return []
    const shortName = firstText(item, ['ShortName'])
    if (!shortName || seen.has(shortName)) return []
    seen.add(shortName)
    const id = firstText(item, ['rowid', 'ROWID', 'row_id']) || shortName
    const shortCode = firstText(item, ['ShortCName'])
    return [{
      id,
      name: shortCode || shortName,
      shortName,
      shortCode,
    }]
  })
}
