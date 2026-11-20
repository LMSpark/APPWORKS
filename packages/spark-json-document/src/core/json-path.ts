/**
 * @module @spark-appworks/spark-json-document:core/json-path
 * 职责：提供 JSON Document/schema 处理中的 json path 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */

import type { JsonDocument, JsonValue } from './json-types'
import { isJsonObject } from './json-types'

/** JSONPath：路径段数组（string = 对象键，number = 数组索引） */
export type JsonPath = Array<string | number>

// ── 路径格式化 ─────────────────────────────────────────────────

const SIMPLE_KEY_PATTERN = /^[A-Za-z_$][\w$]*$/

/**
 * 将路径段数组格式化为 JSONPath 风格字符串。
 *
 * 空路径 → `$`；简单键 → `.key`；数字索引 → `[0]`；特殊键 → `["key"]`
 */
export function formatJsonPath(path: JsonPath): string {
  if (path.length === 0) return '$'
  let text = '$'
  for (const segment of path) {
    if (typeof segment === 'number') {
      text += `[${segment}]`
    } else if (SIMPLE_KEY_PATTERN.test(segment)) {
      text += `.${segment}`
    } else {
      text += `[${JSON.stringify(segment)}]`
    }
  }
  return text
}

// ── 路径读取 ───────────────────────────────────────────────────

/** 从 JSON 对象中读取指定路径的值。路径不存在时抛异常。 */
export function getValueAtJsonPath(root: JsonDocument, path: JsonPath): JsonValue {
  let current: unknown = root
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) throw new Error(`路径不是数组: ${formatJsonPath(path)}`)
      current = current[segment]
    } else {
      if (!isJsonObject(current)) throw new Error(`路径不是对象: ${formatJsonPath(path)}`)
      current = current[segment]
    }
  }
  if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean' || current === null || Array.isArray(current) || isJsonObject(current)) {
    return current
  }
  throw new Error(`路径指向无效值: ${formatJsonPath(path)}`)
}
