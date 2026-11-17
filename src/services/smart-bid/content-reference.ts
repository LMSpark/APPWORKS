/**
 * @module app:services/smart-bid/content-reference
 * 职责：按投标业务规格§1.2检查引用值形状，不解析事实或受控原对象。
 * 边界：通过不表示版本、权限或业务值有效；敏感ownerRef只核存在，具体身份交原对象合同。
 */

import {isRecord} from '@spark-appworks/spark-utils'

const fieldsByType: Readonly<Record<string, readonly string[]>> = {
  fact: ['factId'], number: ['number', 'unit'], date: ['date'], bool: ['bool'],
  page: ['nodeId'], xref: ['nodeId', 'show'], resource: ['resourceVersionId'], sensitive: ['ownerRef', 'field'],
}

/** 返回引用形状错误；保留零和false，不转换原值或猜默认值。 */
export function validateContentReference(value: unknown): string[] {
  if (!isRecord(value)) return ['REFERENCE_OBJECT']
  const record = value, type = record['type']
  if (typeof type !== 'string' || !Object.hasOwn(fieldsByType, type)) return ['REFERENCE_TYPE']
  const fields = fieldsByType[type] ?? [], errors: string[] = []
  for (const key of Object.keys(record)) if (key !== 'type' && !fields.includes(key)) errors.push(`REFERENCE_FIELD:${key}`)
  for (const key of fields) {
    const field = record[key]
    if (!Object.hasOwn(record, key)) {errors.push(`REFERENCE_MISSING:${key}`); continue}
    if (key === 'bool') {
      if (typeof field !== 'boolean') errors.push('REFERENCE_BOOL')
    } else if (key === 'ownerRef') {
      if (field === null || field === undefined || field === '') errors.push('REFERENCE_OWNER')
    } else if (typeof field !== 'string' || field.trim().length === 0) errors.push(`REFERENCE_TEXT:${key}`)
  }
  if (type === 'number' && (typeof record['number'] !== 'string' || !/^-?\d+(?:\.\d+)?$/u.test(record['number']))) errors.push('REFERENCE_NUMBER')
  if (type === 'xref' && record['show'] !== 'title' && record['show'] !== 'number') errors.push('REFERENCE_SHOW')
  if (type === 'date') {
    const date = record['date']
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) errors.push('REFERENCE_DATE')
    else {
      const parsed = new Date(`${date}T00:00:00.000Z`)
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) errors.push('REFERENCE_DATE')
    }
  }
  return errors
}
