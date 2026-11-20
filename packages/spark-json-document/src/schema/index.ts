/**
 * @module @spark-appworks/spark-json-document:schema/index
 * 职责：提供 JSON Document/schema 处理中的 index 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * schema/index.ts — JSON Schema 公共入口
 *
 * 【导出策略】类型和值分列导出，便于消费方按需导入 type-only。
 */

// ── 类型：JSON Schema 核心类型（SSOT）─────────────────────────
export type {
  JsonSchema,
  JsonSchemaObject,
  JsonSchemaType,
} from './schema-types'

// ── 值：Schema 便捷构造器 ─────────────────────────────────────
export {
  anySchema,
  arraySchema,
  booleanSchema,
  enumSchema,
  noParamsSchema,
  numberSchema,
  objectSchema,
  paramsSchema,
  stringSchema,
} from './schema-helpers'

export type {
  BooleanSchemaOptions,
  EnumSchemaOptions,
  NumberSchemaOptions,
  ObjectSchemaOptions,
  StringSchemaOptions,
} from './schema-helpers'

// ── 值 + 类型：参数校验器 ─────────────────────────────────────
export {
  JsonSchemaValidator,
} from './schema-validator'

export type {
  JsonValidationIssue,
  JsonValidationResult,
  JsonSchemaValidateOptions,
} from './schema-validator'

// ── 值 + 类型：Schema 路径解析 ────────────────────────────────
export {
  resolveSchemaInfoForPath,
} from './schema-resolution'

export type {
  JsonSchemaInfo,
} from './schema-resolution'

// ── 值：Schema 元数据注解 ─────────────────────────────────────
export {
  withMeta,
} from './with-meta'

// ── Draft 2020-12 标准化 / 审计 / $ref ────────────────────────
export {
  JSON_SCHEMA_DRAFT_2020_12,
  standardizeJsonSchema,
} from './schema-standardize'

export type {
  StandardJsonSchema,
  StandardJsonSchemaObject,
} from './schema-standardize'

export {
  assertDraft2020Schema,
  auditDraft2020Schema,
} from './schema-draft2020-audit'

export type {
  Draft2020AuditIssue,
} from './schema-draft2020-audit'

export {
  dereferenceJsonSchema,
  dereferenceSchemaSlotsInValue,
} from './schema-dereference'

export type {
  JsonSchemaDefs,
} from './schema-dereference'

export {
  attachJsonSchemaDefs,
} from './schema-attach'

export {
  extractJsonSchemaLocalDefs,
  findMissingJsonSchemaDefRefs,
  standardizeJsonSchemaWithLocalDefs,
} from './schema-defs'

export type {
  JsonSchemaLocalDefsExtraction,
} from './schema-defs'
