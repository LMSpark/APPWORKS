/**
 * @module @spark-appworks/spark-json-document:schema/schema-resolution
 * 职责：提供 JSON Document/schema 处理中的 schema resolution 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * schema/schema-resolution.ts — JSON Schema 路径解析
 * ═══════════════════════════════════════════════════════════════
 *
 * 根据 JsonPath 在 JSON Schema 中解析对应节点的元信息（title/description/required/enum）。
 * 支持 $ref 解析、oneOf 分支选择、items/properties/additionalProperties 导航。
 */

import type { JsonPath } from '../core/json-path'
import { isJsonObject } from '../core/json-types'

/** Schema 路径解析结果 */
export type JsonSchemaInfo = {
    /** 显示标题。 */
title: string
    /** description 字段。 */
description: string
    /** 是否必填。 */
required: boolean
    /** enum Values 字段。 */
enumValues: string[]
}

type JsonSchemaRecord = {
  [key: string]: unknown
}

/**
 * 在 JSON Schema 中解析指定路径的元信息。
 *
 * @param schema - JSON Schema 对象
 * @param path   - 目标路径（JsonPath 格式）
 */
export function resolveSchemaInfoForPath(
  schema: Record<string, unknown> | null | undefined,
  path: JsonPath,
): JsonSchemaInfo {
  if (!schema) return emptySchemaInfo()

  const defs = asSchemaRecord(schema['$defs'])
  const parentSchema = resolveSchemaNode(schema, path.slice(0, -1), defs)
  const schemaNode = resolveSchemaNode(schema, path, defs)
  const lastSegment = path[path.length - 1]
  const required = typeof lastSegment === 'string'
    ? listRequiredKeys(parentSchema).includes(lastSegment)
    : false

  return {
    title: readSchemaString(schemaNode, 'title'),
    description: readSchemaString(schemaNode, 'description'),
    required,
    enumValues: readSchemaEnum(schemaNode),
  }
}

function resolveSchemaNode(
  schemaNode: JsonSchemaRecord | null | undefined,
  path: JsonPath,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  let current = normalizeSchemaNode(schemaNode, defs)
  for (const segment of path) {
    if (!current) return null
    current = selectChildSchema(current, segment, defs)
  }
  return current
}

function normalizeSchemaNode(
  schemaNode: JsonSchemaRecord | null | undefined,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  if (!schemaNode) return null

  const refValue = schemaNode['$ref']
  if (typeof refValue === 'string' && refValue.startsWith('#/$defs/') && defs) {
    const refKey = refValue.slice('#/$defs/'.length)
    const target = asSchemaRecord(defs[refKey])
    return normalizeSchemaNode(target ?? schemaNode, defs)
  }

  if (Array.isArray(schemaNode['oneOf'])) {
    return schemaNode
  }

  return schemaNode
}

function selectChildSchema(
  schemaNode: JsonSchemaRecord,
  segment: string | number,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  const normalized = normalizeSchemaNode(schemaNode, defs)
  if (!normalized) return null

  const oneOf = normalized['oneOf']
  if (Array.isArray(oneOf)) {
    const candidate = oneOf
      .map((entry) => normalizeSchemaNode(asSchemaRecord(entry), defs))
      .find((entry) => entry !== null && schemaCanAcceptSegment(entry, segment, defs))
    return candidate ?? null
  }

  if (typeof segment === 'number') {
    return normalizeSchemaNode(asSchemaRecord(normalized['items']), defs)
  }

  const properties = asSchemaRecord(normalized['properties'])
  if (properties?.[segment] !== undefined) {
    return normalizeSchemaNode(asSchemaRecord(properties[segment]), defs)
  }

  return normalizeSchemaNode(asSchemaRecord(normalized['additionalProperties']), defs)
}

function schemaCanAcceptSegment(
  schemaNode: JsonSchemaRecord,
  segment: string | number,
  defs: JsonSchemaRecord | null,
): boolean {
  const normalized = normalizeSchemaNode(schemaNode, defs)
  if (!normalized) return false

  if (typeof segment === 'number') {
    return normalized['items'] !== undefined || normalized['type'] === 'array'
  }

  const properties = asSchemaRecord(normalized['properties'])
  return Boolean(
    normalized['type'] === 'object'
    || properties?.[segment] !== undefined
    || normalized['additionalProperties'] !== undefined,
  )
}

function listRequiredKeys(schemaNode: JsonSchemaRecord | null): string[] {
  if (!schemaNode || !Array.isArray(schemaNode['required'])) return []
  return schemaNode['required'].filter((entry): entry is string => typeof entry === 'string')
}

function readSchemaString(schemaNode: JsonSchemaRecord | null, key: 'title' | 'description'): string {
  const value = schemaNode?.[key]
  return typeof value === 'string' ? value : ''
}

function readSchemaEnum(schemaNode: JsonSchemaRecord | null): string[] {
  if (!schemaNode || !Array.isArray(schemaNode['enum'])) return []
  return schemaNode['enum'].filter((entry): entry is string => typeof entry === 'string')
}

function emptySchemaInfo(): JsonSchemaInfo {
  return { title: '', description: '', required: false, enumValues: [] }
}

function asSchemaRecord(value: unknown): JsonSchemaRecord | null {
  return isJsonObject(value) ? value : null
}
