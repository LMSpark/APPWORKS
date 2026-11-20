/**
 * @module @spark-appworks/spark-json-document:core/coercion
 * 职责：提供 JSON Document/schema 处理中的 coercion 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * core/coercion.ts — 将任意运行时值规整为 JSON 安全值
 * ═══════════════════════════════════════════════════════════════
 *
 * 两个公开函数：
 * - coerceJsonValue(value) — 尽力转换（lossy）：跳过 NaN/undefined/循环引用，
 *   Symbol/BigInt/Date/URL 转字符串，TypedArray 转 number[]。
 * - coerceStrictJsonValue(value) — 严格转换：遇到 NaN/Infinity/BigInt/Symbol/
 *   循环引用/无效 Date 时返回 undefined，不静默转换非 JSON 安全值。
 */

import type { JsonValue } from './json-types'

const STRICT_REJECT = Symbol('strict-reject')

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

// ── 公开入口 ──────────────────────────────────────────────────

export function coerceJsonValue(value: unknown): JsonValue | undefined {
  return coerceInternal(value, new WeakSet<object>())
}

export function coerceStrictJsonValue(value: unknown): JsonValue | undefined {
  const result = coerceStrict(value, new WeakSet<object>())
  return result === STRICT_REJECT ? undefined : result
}

// ── 内部递归实现 ──────────────────────────────────────────────

function coerceInternal(value: unknown, seen: WeakSet<object>): JsonValue | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'symbol') return value.toString()

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
  }
  if (value instanceof URL) {
    return value.toString()
  }

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value))
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }

  if (isUnknownArray(value) || value instanceof Set) {
    return withCycleGuard(value, seen, () => coerceIterable(value, seen))
  }

  if (value instanceof Map) {
    return withCycleGuard(value, seen, () => coerceRecord(value.entries(), seen))
  }

  if (typeof value === 'object') {
    return withCycleGuard(value, seen, () => coerceRecord(Object.entries(value), seen))
  }

  return undefined
}

function coerceStrict(value: unknown, seen: WeakSet<object>): JsonValue | typeof STRICT_REJECT | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : STRICT_REJECT
  if (typeof value === 'boolean') return value
  if (typeof value === 'bigint') return STRICT_REJECT
  if (typeof value === 'symbol') return STRICT_REJECT

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : STRICT_REJECT
  }
  if (value instanceof URL) {
    return value.toString()
  }

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value))
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }

  if (isUnknownArray(value) || value instanceof Set) {
    return withCycleGuardStrict(value, seen, () => coerceIterableStrict(value, seen))
  }

  if (value instanceof Map) {
    return withCycleGuardStrict(value, seen, () => coerceRecordStrict(value.entries(), seen))
  }

  if (typeof value === 'object') {
    return withCycleGuardStrict(value, seen, () => coerceRecordStrict(Object.entries(value), seen))
  }

  return STRICT_REJECT
}

// ── 循环引用保护 ──────────────────────────────────────────────

function withCycleGuard<TValue extends JsonValue>(
  value: object,
  seen: WeakSet<object>,
  createValue: () => TValue,
): TValue | undefined {
  if (seen.has(value)) return undefined
  seen.add(value)
  try {
    return createValue()
  } finally {
    seen.delete(value)
  }
}

function withCycleGuardStrict<TValue extends JsonValue>(
  value: object,
  seen: WeakSet<object>,
  createValue: () => TValue | typeof STRICT_REJECT,
): TValue | typeof STRICT_REJECT {
  if (seen.has(value)) return STRICT_REJECT
  seen.add(value)
  try {
    return createValue()
  } finally {
    seen.delete(value)
  }
}

// ── 迭代器处理 ────────────────────────────────────────────────

function coerceIterable(items: Iterable<unknown>, seen: WeakSet<object>): JsonValue[] {
  const out: JsonValue[] = []
  for (const item of items) {
    const coerced = coerceInternal(item, seen)
    if (coerced !== undefined) out.push(coerced)
  }
  return out
}

function coerceIterableStrict(items: Iterable<unknown>, seen: WeakSet<object>): JsonValue[] | typeof STRICT_REJECT {
  const out: JsonValue[] = []
  for (const item of items) {
    const coerced = coerceStrict(item, seen)
    if (coerced === STRICT_REJECT) return STRICT_REJECT
    if (coerced !== undefined) out.push(coerced)
  }
  return out
}

function coerceRecord(
  entries: Iterable<readonly [unknown, unknown]>,
  seen: WeakSet<object>,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {}
  for (const [key, raw] of entries) {
    const coerced = coerceInternal(raw, seen)
    if (coerced !== undefined) out[String(key)] = coerced
  }
  return out
}

function coerceRecordStrict(
  entries: Iterable<readonly [unknown, unknown]>,
  seen: WeakSet<object>,
): Record<string, JsonValue> | typeof STRICT_REJECT {
  const out: Record<string, JsonValue> = {}
  for (const [key, raw] of entries) {
    const coerced = coerceStrict(raw, seen)
    if (coerced === STRICT_REJECT) return STRICT_REJECT
    if (coerced !== undefined) out[String(key)] = coerced
  }
  return out
}
