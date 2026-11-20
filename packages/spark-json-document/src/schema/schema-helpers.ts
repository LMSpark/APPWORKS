/**
 * @module @spark-appworks/spark-json-document:schema/schema-helpers
 * 职责：提供 JSON Document/schema 处理中的 schema helpers 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */

import type {
  JsonSchema,
  JsonSchemaObject,
} from './schema-types'

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 基础类型构造器 — 标量类型的快捷创建
// ═══════════════════════════════════════════════════════════════

/** String Schema Options 的调用配置。 */
export type StringSchemaOptions = Readonly<{
  /** 是否允许 null 值（type 变为 ['string', 'null']）。 */
  nullable?: boolean
  /** 最小字符串长度约束。 */
  minLength?: number
}>

/** Number Schema Options 的调用配置。 */
export type NumberSchemaOptions = Readonly<{
  /** 是否允许 null 值（type 变为 ['number', 'null']）。 */
  nullable?: boolean
}>

/** Boolean Schema Options 的调用配置。 */
export type BooleanSchemaOptions = Readonly<{
  /** 是否允许 null 值（type 变为 ['boolean', 'null']）。 */
  nullable?: boolean
}>

/** 任意类型 schema（无 type 约束，仅带可选描述） */
export function anySchema(description?: string): JsonSchemaObject {
  return {
    ...(description !== undefined ? { description } : {}),
  }
}

/** 字符串 schema，可选 nullable / minLength */
export function stringSchema(
  description: string,
  options: StringSchemaOptions = {},
): JsonSchemaObject {
  return {
    type: options.nullable === true ? ['string', 'null'] : 'string',
    description,
    ...(options.minLength !== undefined ? { minLength: options.minLength } : {}),
  }
}

/** 数字 schema，可选 nullable */
export function numberSchema(description: string, options: NumberSchemaOptions = {}): JsonSchemaObject {
  return {
    type: options.nullable === true ? ['number', 'null'] : 'number',
    description,
  }
}

/** 布尔 schema，可选 nullable */
export function booleanSchema(description: string, options: BooleanSchemaOptions = {}): JsonSchemaObject {
  return {
    type: options.nullable === true ? ['boolean', 'null'] : 'boolean',
    description,
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 复合构造器 — 枚举 / 数组 / 对象
// ═══════════════════════════════════════════════════════════════

/** Enum Schema Options 的调用配置。 */
export type EnumSchemaOptions = Readonly<{
  /** 枚举值的 JSON Schema 类型（默认按 values 推断）。 */
  type?: 'string' | 'number'
  /** 是否允许 null 值（enum 追加 null）。 */
  nullable?: boolean
}>

/** 枚举 schema，自动推断 type（string/number），可选 nullable */
export function enumSchema(
  values: ReadonlyArray<string | number | boolean | null>,
  description: string,
  options: EnumSchemaOptions = {},
): JsonSchemaObject {
  const type = options.type ?? (values.some(value => typeof value === 'number') ? 'number' : 'string')
  return {
    type: options.nullable === true ? [type, 'null'] : type,
    enum: options.nullable === true ? [...values, null] : [...values],
    description,
  }
}

/** 数组 schema，items 默认为 anySchema() */
export function arraySchema(items: JsonSchema = anySchema(), description?: string): JsonSchemaObject {
  return {
    type: 'array',
    items,
    ...(description !== undefined ? { description } : {}),
  }
}

/** Object Schema Options 的调用配置。 */
export type ObjectSchemaOptions = Readonly<{
  /** 必填属性名列表。 */
  required?: readonly string[]
  /** schema 描述文本。 */
  description?: string
  /** 额外属性的 schema 约束（false 表示禁止额外属性）。 */
  additionalProperties?: JsonSchema
}>

/** 对象 schema，type=object + properties + required + additionalProperties */
export function objectSchema(
  properties: Readonly<Record<string, JsonSchema>> = {},
  options: ObjectSchemaOptions = {},
): JsonSchemaObject {
  return {
    type: 'object',
    properties,
    ...(options.required !== undefined && options.required.length > 0 ? { required: [...options.required] } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.additionalProperties !== undefined ? { additionalProperties: options.additionalProperties } : {}),
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 根节点构造器 — 函数 paramsSchema 入口
// ═══════════════════════════════════════════════════════════════

/**
 * 函数参数根 schema。
 * 调用 `paramsSchema({...}, ['requiredField1'])` 等效于
 * `objectSchema({...}, { required: ['requiredField1'] })`，
 * 但返回类型明确为 JsonSchemaObject。
 */
export function paramsSchema(
  properties: Readonly<Record<string, JsonSchema>> = {},
  required: readonly string[] = [],
  description?: string,
): JsonSchemaObject {
  return objectSchema(properties, {
    required,
    ...(description !== undefined ? { description } : {}),
  })
}

/**
 * 无参数函数的 schema。
 * additionalProperties: false 告诉 LLM 不要传任何参数。
 */
export function noParamsSchema(description = '不接受参数，请传 {} 或留空。'): JsonSchemaObject {
  return objectSchema({}, {
    additionalProperties: false,
    description,
  })
}
