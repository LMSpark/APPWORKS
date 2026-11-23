/**
 * @module app:lowcode/data-space/model-source/platform-api-route-spec
 * 职责：解析平台接口 route_spec 的正式输入、输出字段及调用契约。
 * 边界：只转换已授权来源行，不调用平台接口、不持久化模型字段。
 * AI用途：平台接口来源创建或重开时，以 route_spec 生成正式模型字段。
 */
import {isRecord} from '@spark-appworks/spark-utils'

export type PlatformApiRouteField = Readonly<{
  name: string
  description: string
  fieldType: string
  source: string
}>

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

function field(value: unknown): PlatformApiRouteField | null {
  if (!isRecord(value)) return null
  const name = text(value['name'] ?? value['Name'] ?? value['field'] ?? value['Field'] ?? value['enname'])
  if (!name) return null
  return {
    name,
    description: text(value['description'] ?? value['Description'] ?? value['displayName'] ?? value['cnname'] ?? value['Memo']),
    fieldType: text(value['type'] ?? value['FieldType'] ?? value['fieldType'] ?? value['dataType'] ?? value['DataTypeName']) || 'varchar',
    source: text(value['source'] ?? value['Source']),
  }
}

function children(value: Record<string, unknown> | null): unknown[] {
  const raw = value?.['children'] ?? value?.['Children']
  return Array.isArray(raw) ? raw : []
}

function fields(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []
  const raw = value['fields'] ?? value['Fields']
  return Array.isArray(raw) ? raw : []
}

function unique(rows: unknown[]): PlatformApiRouteField[] {
  const names = new Set<string>(), result: PlatformApiRouteField[] = []
  for (const raw of rows) {
    const item = field(raw)
    if (!item || names.has(item.name)) continue
    names.add(item.name)
    result.push(Object.freeze(item))
  }
  return result
}

export function parsePlatformApiRouteSpec(value: unknown): Readonly<Record<string, unknown>> {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function readPlatformApiInputFields(value: unknown): readonly PlatformApiRouteField[] {
  const spec = parsePlatformApiRouteSpec(value)
  return unique(fields(spec['inputs'] ?? spec['Inputs']))
}

function findChild(rows: unknown[], name: string): Record<string, unknown> | null {
  for (const item of rows) if (isRecord(item) && text(item['name'] ?? item['Name']) === name) return item
  return null
}

function resultRoot(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  return findChild(children(value), 'Result') ?? value
}

function outputFields(spec: Record<string, unknown>, outputPath: unknown): PlatformApiRouteField[] {
  const path = text(outputPath) || '$'
  const rawOutputs = spec['outputs'] ?? spec['Outputs']
  if (Array.isArray(rawOutputs)) {
    const outputs: unknown[] = rawOutputs
    const entry = outputs.find(item => isRecord(item) && (text(item['path'] ?? item['Path'] ?? item['outputPath']) || '$') === path)
    if (isRecord(entry)) {
      const declared = fields(entry)
      const normalized: unknown[] = declared.map(item => typeof item === 'string'
        ? {name: item, fieldType: 'varchar', source: 'response'} : item)
      const result = unique(normalized).map(item => ({...item, source:item.source || 'response'}))
      if (result.length) return result
    }
  }
  let node = resultRoot(spec['returnType'] ?? spec['ReturnType'])
  if (!node) return []
  const segments = path === '$' ? [] : path.replace(/^\$\.?/, '').split('.').map(segment => segment.replace(/\[\*]|\[\d+]/g, '')).filter(Boolean)
  for (const segment of segments) {
    const next = findChild(children(node), segment)
    if (!next) return []
    node = next
  }
  return unique(children(node)).map(item => ({...item, source:item.source || 'response'}))
}

export function readPlatformApiOutputFields(routeSpec: unknown, outputPath: unknown): readonly PlatformApiRouteField[] {
  return outputFields(parsePlatformApiRouteSpec(routeSpec), outputPath)
}

export function readPlatformApiPrimaryRoute(value: unknown): string {
  const spec = parsePlatformApiRouteSpec(value)
  const routes = spec['routes'] ?? spec['Routes']
  return Array.isArray(routes) ? text(routes[0]) : ''
}
