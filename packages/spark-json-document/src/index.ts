/**
 * @module @spark-appworks/spark-json-document:index
 * 职责：提供 JSON Document/schema 处理中的 index 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * @packageDocumentation
 *
 * @spark-appworks/spark-json-document — 通用 JSON 文档编辑与 JSON Schema 工具包
 *
 * 公共入口分为三个子域：
 *   core/   — JSON 值类型、路径操作、解析序列化、值规整
 *   schema/ — JSON Schema 类型、构造器、校验器、路径解析、元数据注解
 *   tree/   — UUID 稳定树模型、策略注入、不可变变更、平铺往返
 *
 * 所有符号从本桶文件显式导出；消费方直接 import from '@spark-appworks/spark-json-document'。
 */

// ═══════════════════════════════════════════════════════════════
// core — JSON 基础类型与工具
// ═══════════════════════════════════════════════════════════════

export type {
  JsonDocument,
  JsonObject,
  JsonParamShape,
  JsonParams,
  JsonValue,
} from './core/json-types'

export {
  asJsonValue,
  isJsonObject,
  toPrimitive,
} from './core/json-types'

export type { JsonPath } from './core/json-path'

export {
  formatJsonPath,
  getValueAtJsonPath,
} from './core/json-path'

export {
  readJsonProperty,
  readJsonValueAtResultPath,
  resultPathToJmespath,
} from './core/json-result-path'

export {
  coerceJsonValue,
  coerceStrictJsonValue,
} from './core/coercion'

export {
  normalizeJsonDocument,
  parseJsonDocument,
  serializeJsonDocument,
} from './core/parse'

// ═══════════════════════════════════════════════════════════════
// schema — JSON Schema 类型、构造、校验、解析
// ═══════════════════════════════════════════════════════════════

export type {
  JsonSchema,
  JsonSchemaObject,
  JsonSchemaType,
} from './schema/schema-types'

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
} from './schema/schema-helpers'

export type {
  BooleanSchemaOptions,
  EnumSchemaOptions,
  NumberSchemaOptions,
  ObjectSchemaOptions,
  StringSchemaOptions,
} from './schema/schema-helpers'

export {
  JsonSchemaValidator,
} from './schema/schema-validator'

export type {
  JsonValidationIssue,
  JsonValidationResult,
  JsonSchemaValidateOptions,
} from './schema/schema-validator'

export {
  resolveSchemaInfoForPath,
} from './schema/schema-resolution'

export type {
  JsonSchemaInfo,
} from './schema/schema-resolution'

export {
  withMeta,
} from './schema/with-meta'

export {
  JSON_SCHEMA_DRAFT_2020_12,
  standardizeJsonSchema,
  assertDraft2020Schema,
  auditDraft2020Schema,
  dereferenceJsonSchema,
  dereferenceSchemaSlotsInValue,
  attachJsonSchemaDefs,
  extractJsonSchemaLocalDefs,
  findMissingJsonSchemaDefRefs,
  standardizeJsonSchemaWithLocalDefs,
} from './schema/index'

export type {
  StandardJsonSchema,
  StandardJsonSchemaObject,
  Draft2020AuditIssue,
  JsonSchemaDefs,
  JsonSchemaLocalDefsExtraction,
} from './schema/index'

// ═══════════════════════════════════════════════════════════════
// tree — UUID 稳定树编辑引擎
// ═══════════════════════════════════════════════════════════════

export type {
  AutoPopulateEntry,
  FlatJsonTreeDocument,
  JsonNodeType,
  JsonTreePolicy,
  MutationResult,
  RenameNodeKeyInput,
  TreeDisplayNode,
  TreeModel,
  JsonTreeNode,
  UpdateNodeTypeInput,
} from './tree/tree-types'

export {
  buildJsonTreeRows,
  buildTreeModel,
  exportJsonDocument,
  filterJsonTreeNodes,
  getNodePath,
  toDisplayRows,
} from './tree/tree-build'

export {
  addChildNode,
  addSiblingNode,
  applyAutoPopulatePatches,
  deleteNode,
  renameNodeKey,
  updateNodeType,
  updateNodeValue,
} from './tree/tree-mutation'

export {
  flattenJsonDocumentForEdit,
  restoreJsonDocumentByOriginalType,
  restoreJsonDocumentFromFlat,
} from './tree/tree-flatten'

export {
  ensureUniqueObjectKey,
  formatValuePreview,
  rootOf,
} from './tree/tree-utils'
