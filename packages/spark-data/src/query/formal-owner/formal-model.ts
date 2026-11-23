import type { DataViewFieldProjection, TableResourceType } from '../../types'
import type { DataViewFilterValueFunction } from '../filter/data-view-filter-contract'

export type FormalModelField = Readonly<{
  id: string
  modelId: string
  name: string
  canonicalName: string
  type: string
  primaryKey: boolean
  description: string
  output: boolean
  computed: boolean
  order: number
  orderType: string
  allowAIAdd?: boolean
  raw: Readonly<Record<string, unknown>>
}>

export type DataSpaceSourceInputBinding = Readonly<{
  id: string
  name: string
  valueFunction?: DataViewFilterValueFunction
}>

export type FormalModelDescriptor = Readonly<{
  id: string
  metaName: string
  name: string
  sourceName: string
  sourceId: string
  sourceType: string
  primaryKey: string
  businessMain: boolean
  fields: readonly FormalModelField[]
  raw: Readonly<Record<string, unknown>>
  sourceInputBindings?: readonly DataSpaceSourceInputBinding[]
}>

const FORMAL_RESOURCE_TYPES: Readonly<Record<string, TableResourceType>> = {
  数据库表: 'database-table',
  数据库视图: 'database-view',
  视图: 'logical-view',
  字典: 'dictionary',
  接口: 'third-party-api',
  平台接口: 'third-party-api',
  JSON: 'json',
  文件: 'file',
  数组: 'static-data',
  表: 'database-table',
  table: 'database-table',
}

export function resolveFormalTableResource(model: Pick<FormalModelDescriptor, 'sourceType' | 'sourceName'>) {
  const resourceId = model.sourceName.trim()
  const resourceType = FORMAL_RESOURCE_TYPES[model.sourceType]
  if (!resourceId) throw new Error('正式模型来源名不能为空')
  if (resourceType === undefined) throw new Error(`未知正式模型资源类型: ${model.sourceType}`)
  return Object.freeze({resourceType, resourceId})
}

function sameSemanticValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null || typeof left !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameSemanticValue(value, right[index]))
  }
  const leftRecord: Record<string, unknown> = { ...left }
  const rightRecord: Record<string, unknown> = { ...right }
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && sameSemanticValue(leftRecord[key], rightRecord[key]))
}

function sameFormalOutput(left: FormalModelField, right: FormalModelField): boolean {
  return left.name === right.name && left.canonicalName === right.canonicalName && left.type === right.type
    && left.primaryKey === right.primaryKey && left.description === right.description && left.output === right.output
    && left.computed === right.computed && left.order === right.order && left.orderType === right.orderType
    && left.allowAIAdd === right.allowAIAdd
    && ['Group', 'Value', 'ValueFun', 'Expression', 'Distinct'].every(key => {
      const read = (row: Readonly<Record<string, unknown>>) =>
        Object.keys(row).find(name => name.toLowerCase() === key.toLowerCase())
      const leftKey = read(left.raw), rightKey = read(right.raw)
      return leftKey === undefined || rightKey === undefined
        ? leftKey === rightKey
        : sameSemanticValue(left.raw[leftKey], right.raw[rightKey])
    })
}

function resolveFieldsByName(model: FormalModelDescriptor, outputOnly: boolean): readonly FormalModelField[] {
  const fields: FormalModelField[] = []
  const byCanonicalName = new Map<string, FormalModelField>()
  for (const field of model.fields) {
    if (outputOnly && !field.output) continue
    const existing = byCanonicalName.get(field.canonicalName)
    if (existing === undefined) {
      byCanonicalName.set(field.canonicalName, field)
      fields.push(field)
    } else if (!sameFormalOutput(existing, field)) {
      throw new Error(`正式模型${outputOnly ? '输出' : ''}字段重复: ${model.metaName}`)
    }
  }
  return Object.freeze(fields)
}

export function resolveFormalOutputFields(model: FormalModelDescriptor): readonly FormalModelField[] {
  return resolveFieldsByName(model, true)
}

export function resolveFormalFields(model: FormalModelDescriptor): readonly FormalModelField[] {
  return resolveFieldsByName(model, false)
}

export function resolveFormalNewRowFields(
  model: FormalModelDescriptor,
  names: readonly string[],
): readonly FormalModelField[] {
  const fields = resolveFormalFields(model), physical = new Set<string>(), result: FormalModelField[] = []
  if (new Set(names).size !== names.length) throw new Error('SPARK_NEW_ROW_INPUT: 新行字段范围重复')
  for (const name of names) {
    const field = fields.find(candidate => candidate.canonicalName === name)
    if (!field || field.primaryKey || name === model.primaryKey || field.computed || name === '_pk'
      || name.startsWith('lingma_sys_') || field.name.startsWith('lingma_sys_') || physical.has(field.name.toLowerCase())) {
      throw new Error(`SPARK_NEW_ROW_INPUT: 新行字段须为唯一正式普通输入: ${name}`)
    }
    physical.add(field.name.toLowerCase())
    result.push(field)
  }
  return Object.freeze(result)
}

export function createFormalFieldProjection(model: FormalModelDescriptor): DataViewFieldProjection[] {
  return resolveFormalFields(model).map(field => ({
    fieldId: field.id, source: 'resource', resourceFieldId: field.id, resourceField: field.canonicalName,
    viewField: field.canonicalName, type: field.type || 'string', label: field.description || field.canonicalName,
    output: field.output, sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: field.primaryKey,
    value: '', valueFunction: '', expression: '',
  }))
}
