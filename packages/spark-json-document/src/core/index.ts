/**
 * @module @spark-appworks/spark-json-document:core/index
 * 职责：提供 JSON Document/schema 处理中的 index 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * core/index.ts — JSON 基础类型与工具公共入口
 */

// ── 类型 ──
export type {
  JsonDocument,
  JsonObject,
  JsonParamShape,
  JsonParams,
  JsonValue,
} from './json-types'

// ── 值 + 类型：运行时守卫 ──
export {
  asJsonValue,
  isJsonObject,
  toPrimitive,
} from './json-types'

// ── 类型：路径 ──
export type { JsonPath } from './json-path'

// ── 值：路径操作 ──
export {
  formatJsonPath,
  getValueAtJsonPath,
} from './json-path'

// ── 值：JSON 值规整 ──
export {
  coerceJsonValue,
  coerceStrictJsonValue,
} from './coercion'

// ── 值：解析与序列化 ──
export {
  normalizeJsonDocument,
  parseJsonDocument,
  serializeJsonDocument,
} from './parse'
