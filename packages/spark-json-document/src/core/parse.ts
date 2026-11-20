/**
 * @module @spark-appworks/spark-json-document:core/parse
 * 职责：提供 JSON Document/schema 处理中的 parse 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * core/parse.ts — JSON 文档解析与序列化
 * ═══════════════════════════════════════════════════════════════
 */

import type { JsonDocument, JsonValue } from './json-types'
import { asJsonValue, isJsonObject } from './json-types'

/** 解析 JSON 字符串为 JsonDocument */
export function parseJsonDocument(rawText: string): JsonDocument {
  const parsed: unknown = JSON.parse(rawText)
  return normalizeJsonDocument(parsed)
}

/** 将 JsonDocument 序列化为格式化 JSON 字符串 */
export function serializeJsonDocument(value: JsonDocument): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * 归一化任意值为 JsonDocument（顶层仅允许对象或数组）。
 */
/** 解析任意 JSON 值。空文本和非法文本抛出，JSON null 是合法值。 */
export function parseJsonValue(rawText: string): JsonValue {
  const parsed: unknown = JSON.parse(rawText)
  const value = asJsonValue(parsed)
  if (value === null && parsed !== null) throw new Error('JSON 值无效')
  return value ?? null
}

export function normalizeJsonDocument(value: unknown): JsonDocument {
  const narrowed = asJsonValue(value)
  if (narrowed === null) throw new Error('JSON 顶层必须是对象或数组')
  if (Array.isArray(narrowed) || isJsonObject(narrowed)) return narrowed
  throw new Error('JSON 顶层必须是对象或数组')
}
