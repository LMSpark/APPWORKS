import { DataViewFilter } from '../filter/data-view-filter'
import type { DataViewFilterValueFunction } from '../filter/data-view-filter-contract'

export function parseDataSpaceValueFunction(
  serialized: string,
  validationFieldName: string,
  displayFieldName = validationFieldName,
): DataViewFilterValueFunction {
  let value: unknown
  try {value = JSON.parse(serialized)} catch {throw new TypeError(`SPARK 字段 ${displayFieldName} ValueFun 不是有效 JSON`)}
  const parsed = DataViewFilter.parse({field: validationFieldName, operator: 'eq', value})
  if (!parsed.ok) throw new TypeError(parsed.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'))
  const tree = parsed.value.toJSON()
  const functionValue = 'field' in tree ? tree.value : undefined
  if (functionValue === null || typeof functionValue !== 'object' || Array.isArray(functionValue)
    || !('Type' in functionValue) || typeof functionValue['Type'] !== 'string') {
    throw new TypeError(`SPARK 字段 ${displayFieldName} ValueFun 缺少 Type`)
  }
  return {...functionValue, Type: functionValue['Type']}
}

export function parseOptionalDataSpaceValueFunction(
  serialized: string | null | undefined,
  displayFieldName = 'ValueFun',
): DataViewFilterValueFunction | undefined {
  if (serialized === null || serialized === undefined) return undefined
  const normalized = serialized.trim()
  if (normalized === '' || normalized === '""' || normalized === 'null') return undefined
  return parseDataSpaceValueFunction(normalized, displayFieldName)
}
