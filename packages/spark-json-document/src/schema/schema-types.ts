/**
 * @module @spark-appworks/spark-json-document:schema/schema-types
 * 职责：提供 JSON Document/schema 处理中的 schema types 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · Schema 类型枚举
// ═══════════════════════════════════════════════════════════════

/**
 * JSON Schema type 字段允许的类型字符串。
 * 支持联合类型数组，如 ['string', 'null'] 表示可选字符串。
 */
export type JsonSchemaType =
  | 'null'
  | 'boolean'
  | 'object'
  | 'array'
  | 'number'
  | 'integer'
  | 'string'

/**
 * JSON Schema 节点。
 * - `true` : 接受任意值（无约束）
 * - `false`: 拒绝任何值（用于禁止某字段）
 * - `JsonSchemaObject`: 完整约束节点
 */
export type JsonSchema = boolean | JsonSchemaObject

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · Schema 节点
// ═══════════════════════════════════════════════════════════════

/**
 * 标准 JSON Schema 节点（Draft 2020-12 常用子集）。
 *
 * 覆盖以下特性：
 *   - 类型声明：type / title / description
 *   - 对象约束：properties / required / additionalProperties
 *   - 数组约束：items / prefixItems
 *   - 枚举/常量：enum / const
 *   - 组合校验：oneOf / anyOf / allOf / not
 *   - 字符串校验：maxLength / minLength / pattern / format
 *   - 数字校验：minimum / maximum
 *   - 引用与示例：$ref / default / examples
 */
export type JsonSchemaObject = {
  /** 保留标准 JSON Schema 扩展关键字与 resultSchema 文档型字段 */
  readonly [keyword: string]: unknown

  // ── 引用 ──
  /** JSON Reference，引用另一个 schema（可选） */
  readonly $ref?: string

  // ── 类型元数据 ──
  /** 数据类型，支持联合类型数组 */
  readonly type?: JsonSchemaType | readonly JsonSchemaType[]
  /** 类型标题（可选） */
  readonly title?: string
  /** 类型描述，会展示给 LLM */
  readonly description?: string

  // ── 对象属性约束 ──
  /** 属性定义：属性名 → Schema */
  readonly properties?: Readonly<Record<string, JsonSchema>>
  /** 必填属性名列表 */
  readonly required?: readonly string[]
  /** 是否允许额外属性：false=拒绝，true=接受任意，JsonSchema=按 schema 校验 */
  readonly additionalProperties?: JsonSchema

  // ── 数组项约束 ──
  /** 数组项 Schema（普通数组） */
  readonly items?: JsonSchema
  /** 元组前缀项 Schema（固定长度元组） */
  readonly prefixItems?: readonly JsonSchema[]

  // ── 枚举与常量 ──
  /** 枚举值列表，值必须是有效 JSON 类型 */
  readonly enum?: ReadonlyArray<string | number | boolean | null>
  /** 常量值 */
  readonly const?: string | number | boolean | null

  // ── 默认值与示例 ──
  /** 默认值 */
  readonly default?: unknown
  /** 示例值列表 */
  readonly examples?: readonly unknown[]

  // ── 组合 schema ──
  /** 必须匹配其中一个 */
  readonly oneOf?: readonly JsonSchema[]
  /** 匹配任意一个 */
  readonly anyOf?: readonly JsonSchema[]
  /** 必须匹配所有 */
  readonly allOf?: readonly JsonSchema[]
  /** 不能匹配此 schema */
  readonly not?: JsonSchema

  // ── 字符串校验 ──
  /** 最大长度 */
  readonly maxLength?: number
  /** 最小长度 */
  readonly minLength?: number
  /** 正则表达式模式 */
  readonly pattern?: string
  /** 格式（如 email、date-time、uri 等） */
  readonly format?: string

  // ── 数字校验 ──
  /** 最小值 */
  readonly minimum?: number
  /** 最大值 */
  readonly maximum?: number
}
