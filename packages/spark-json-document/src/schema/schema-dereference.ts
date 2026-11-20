/**
 * @module @spark-appworks/spark-json-document:schema/schema-dereference
 * 职责：提供 JSON Document/schema 处理中的 schema dereference 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * Resolve JSON Schema #/$defs/* $ref against a document-level defs map.
 *
 * 生产校验优先 JsonSchemaValidator + schemaDefs（AJV 2020）；本模块用于 inline 或测试。
 */

import { isRecord } from '@spark-appworks/spark-utils'
import type { JsonSchema, JsonSchemaObject } from './schema-types'

/** Json Schema Defs 的语义模型。 */
export type JsonSchemaDefs = Readonly<Record<string, JsonSchemaObject>>

export function dereferenceJsonSchema(
  schema: JsonSchema,
  defs: JsonSchemaDefs | undefined,
  resolving: Set<string> = new Set(),
): JsonSchema {
  if (typeof schema === 'boolean' || defs === undefined) return schema
  if (!isJsonSchemaObject(schema)) return schema

  if (typeof schema['$ref'] === 'string' && schema['$ref'].startsWith('#/$defs/')) {
    const name = schema['$ref'].slice('#/$defs/'.length)
    if (resolving.has(name)) return schema
    const target = defs[name]
    if (target === undefined) return schema
    resolving.add(name)
    try {
      return dereferenceJsonSchema(target, defs, resolving)
    } finally {
      resolving.delete(name)
    }
  }

  const output: Record<string, unknown> = { ...schema }
  const properties = output['properties']
  if (isRecord(properties)) {
    output['properties'] = Object.fromEntries(
      Object.entries(properties).map(([name, property]) => [
        name,
        isJsonSchema(property)
          ? dereferenceJsonSchema(property, defs, new Set(resolving))
          : property,
      ]),
    )
  }
  const items = output['items']
  if (isJsonSchema(items)) {
    output['items'] = dereferenceJsonSchema(items, defs, new Set(resolving))
  }
  const additionalProperties = output['additionalProperties']
  if (isJsonSchema(additionalProperties)) {
    output['additionalProperties'] = dereferenceJsonSchema(
      additionalProperties,
      defs,
      new Set(resolving),
    )
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const) {
    const keywordItems = output[keyword]
    if (Array.isArray(keywordItems)) {
      output[keyword] = keywordItems
        .filter(isJsonSchema)
        .map(item => dereferenceJsonSchema(item, defs, new Set(resolving)))
    }
  }
  return output
}

export function dereferenceSchemaSlotsInValue(
  value: unknown,
  defs: JsonSchemaDefs | undefined,
  slotKeys: readonly string[],
): unknown {
  if (defs === undefined || Object.keys(defs).length === 0) return value
  if (slotKeys.length === 0) return value
  return visitValue(value, defs, slotKeys)
}

function visitValue(
  value: unknown,
  defs: JsonSchemaDefs,
  slotKeys: readonly string[],
): unknown {
  if (Array.isArray(value)) {
    return value.map(item => visitValue(item, defs, slotKeys))
  }
  if (!isRecord(value)) return value

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (slotKeys.includes(key) && isJsonSchema(child)) {
      output[key] = dereferenceJsonSchema(child, defs)
      continue
    }
    output[key] = visitValue(child, defs, slotKeys)
  }
  return output
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === 'boolean' || isJsonSchemaObject(value)
}

function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return isRecord(value)
}
