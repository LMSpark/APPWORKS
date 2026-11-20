/**
 * @module app:services/smart-bid/content-node-hash
 * 职责：按投标规格§1.1及工序合同生成节点规范载荷及SHA-256，不改变传入节点。
 * 边界：不计算子树/有效摘要，不保存、授权或采用修订；data数字必须由业务以字符串表达。
 */
import {isRecord} from '@spark-appworks/spark-utils'

function normalized(value: string): string {
  for (const character of value) {
    const code = character.codePointAt(0)
    if (code !== undefined && code >= 0xD800 && code <= 0xDFFF) throw new Error('INVALID_UNICODE')
  }
  return value.normalize('NFC')
}

function codePointOrder(left: string, right: string): number {
  const a = Array.from(left, character => character.codePointAt(0) ?? 0)
  const b = Array.from(right, character => character.codePointAt(0) ?? 0)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

function arrayValues(value: readonly unknown[]): unknown[] {
  if (Reflect.ownKeys(value).length !== value.length + 1) throw new Error('NON_JSON_ARRAY')
  const items: unknown[] = []
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('NON_JSON_ARRAY')
    items.push(descriptor.value)
  }
  return items
}

function payloadValue(input: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key)
  if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_NODE_PAYLOAD')
  return descriptor.value
}

function canonical(value: unknown, ancestors: Set<object>): string {
  if (typeof value === 'string') return JSON.stringify(normalized(value))
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value !== 'object') throw new Error('NON_JSON_OR_NUMERIC_DATA')
  if (ancestors.has(value)) throw new Error('CYCLIC_PAYLOAD')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${arrayValues(value).map(item => canonical(item, ancestors)).join(',')}]`
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('NON_JSON_OBJECT')
    if (Object.getOwnPropertySymbols(value).length > 0) throw new Error('NON_JSON_OBJECT')
    const entries = new Map<string, unknown>()
    for (const key of Object.keys(value)) {
      const name = normalized(key)
      if (entries.has(name)) throw new Error('NFC_KEY_COLLISION')
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) throw new Error('NON_JSON_OBJECT')
      entries.set(name, descriptor.value)
    }
    return `{${[...entries.keys()].sort().map(key => `${JSON.stringify(key)}:${canonical(entries.get(key), ancestors)}`).join(',')}}`
  } finally { ancestors.delete(value) }
}

function canonicalNodePayload(input: unknown, kind: 'content' | 'operation'): string {
  if (!isRecord(input)) throw new Error('INVALID_NODE_PAYLOAD')
  const id = payloadValue(input, kind === 'content' ? 'nodeId' : 'id'), parent = payloadValue(input, 'parentId')
  const type = payloadValue(input, 'type'), value = payloadValue(input, 'value'), index = payloadValue(input, 'index')
  const rawClasses = payloadValue(input, 'class'), data = payloadValue(input, 'data')
  const classValues = Array.isArray(rawClasses) ? arrayValues(rawClasses) : null
  const validParent = typeof parent === 'string' && parent.trim().length > 0 || kind === 'operation' && parent === null
  if (typeof id !== 'string' || !id.trim() || !validParent
    || typeof type !== 'string' || !type.trim() || typeof value !== 'string'
    || typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0
    || classValues === null || !classValues.every((item): item is string => typeof item === 'string')
    || !isRecord(data)) throw new Error('INVALID_NODE_PAYLOAD')
  const classes = [...new Set(classValues.map(item => normalized(item)))].sort(codePointOrder)
  // index是唯一数值字段；data中的业务数字不接受JS浮点值。
  const fields = new Map<string, string>([
    ['id', canonical(id, new Set())], ['parentId', canonical(parent, new Set())],
    ['index', JSON.stringify(index)], ['type', canonical(type, new Set())],
    ['class', canonical(classes, new Set())], ['value', canonical(value, new Set())],
    ['data', canonical(data, new Set())],
  ])
  return `{${[...fields.keys()].sort().map(key => `${JSON.stringify(key)}:${fields.get(key)}`).join(',')}}`
}

/** 仅选择内容节点七项载荷；对象键按UTF-16排序，class单独按码点排序。 */
export function canonicalContentNode(input: unknown): string { return canonicalNodePayload(input, 'content') }

/** 工序使用id，允许显式null根父；路线结构、发布及调用授权由工序领域继续核验。 */
export function canonicalOperationNode(input: unknown): string { return canonicalNodePayload(input, 'operation') }

async function digestCanonical(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** 使用宿主Web Crypto计算内容节点UTF-8摘要；没有加密能力时失败，不降级为弱摘要。 */
export async function hashContentNode(input: unknown): Promise<string> { return digestCanonical(canonicalContentNode(input)) }

/** 工序与内容复用同一规范及摘要实现；不包含路线子节点哈希。 */
export async function hashOperationNode(input: unknown): Promise<string> { return digestCanonical(canonicalOperationNode(input)) }
