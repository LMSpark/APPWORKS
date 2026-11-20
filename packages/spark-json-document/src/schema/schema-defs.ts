/**
 * @module @spark-appworks/spark-json-document:schema/schema-defs
 * 职责：提供 JSON Document/schema 处理中的 schema defs 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * JSON Schema $defs 工具。
 *
 * 协议边界说明：
 * - 反射/生成阶段允许 schema 片段临时携带本地 $defs。
 * - 运行时文档应把这些定义集中到 document.$defs，再用 #/$defs/* 引用。
 * - 本模块只处理标准 JSON Schema 引用关系，不理解 ClassModel 或 LLM 业务语义。
 */

import { isRecord } from '@spark-appworks/spark-utils'
import { attachJsonSchemaDefs } from './schema-attach'
import { standardizeJsonSchema } from './schema-standardize'
import type { JsonSchema } from './schema-types'

/** Json Schema Local Defs Extraction 的语义模型。 */
export type JsonSchemaLocalDefsExtraction = Readonly<{
  /** 移除 $defs 后的 schema 树（引用 #/$defs/* 的 $ref 仍保留原路径） */
  schema: unknown
  /** 从 schema 树中抽出的所有本地 $defs 定义，按 key 字母序排列；供后续 attachJsonSchemaDefs 合并到文档根 */
  defs: Readonly<Record<string, JsonSchema>>
}>

/**
 * 从任意 schema 树中抽取本地 $defs，并返回移除 $defs 后的 schema。
 *
 * 用于 QueryParams 这类命名类型：当它作为嵌套属性被 $ref 引用时，
 * 本地 $defs 必须先被抽出，否则后续标准化看到 $ref 会早返回并丢失定义。
 */
export function extractJsonSchemaLocalDefs(value: unknown): JsonSchemaLocalDefsExtraction {
  const defs = new Map<string, JsonSchema>()
  const schema = extractSchemaNode(value, defs)
  return {
    schema,
    defs: Object.fromEntries([...defs.entries()].sort(([left], [right]) => left.localeCompare(right))),
  }
}

/**
 * 标准化 schema，同时保留并标准化树内所有本地 $defs。
 */
export function standardizeJsonSchemaWithLocalDefs(value: unknown): JsonSchema {
  const extracted = extractJsonSchemaLocalDefs(value)
  const schema = standardizeJsonSchema(extracted.schema)
  const defs = Object.fromEntries(
    Object.entries(extracted.defs).map(([name, definition]) => [
      name,
      ensureJsonSchema(standardizeJsonSchema(definition)),
    ]),
  )
  return ensureJsonSchema(attachJsonSchemaDefs(schema, defs))
}

/**
 * 查找 #/$defs/* 引用中无法被 defs 解析的名称。
 */
export function findMissingJsonSchemaDefRefs(
  value: unknown,
  defs: Readonly<Record<string, unknown>> | undefined = readDocumentDefs(value),
): readonly string[] {
  const refNames = new Set<string>()
  collectDefRefNames(value, refNames, true)
  const defNames = new Set(Object.keys(defs ?? {}))
  return [...refNames].filter(name => !defNames.has(name)).sort()
}

function extractSchemaNode(value: unknown, defs: Map<string, JsonSchema>): unknown {
  if (Array.isArray(value)) return value.map(item => extractSchemaNode(item, defs))
  if (!isRecord(value)) return value

  const localDefs = value['$defs']
  if (isRecord(localDefs)) {
    for (const [name, definition] of Object.entries(localDefs)) {
      defs.set(name, ensureJsonSchema(extractSchemaNode(definition, defs)))
    }
  }

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === '$defs') continue
    if (key === 'properties' && isRecord(child)) {
      output[key] = Object.fromEntries(
        Object.entries(child).map(([propertyName, propertySchema]) => [
          propertyName,
          extractSchemaNode(propertySchema, defs),
        ]),
      )
      continue
    }
    output[key] = extractSchemaNode(child, defs)
  }
  return output
}

export function ensureJsonSchema(value: unknown): JsonSchema {
  if (typeof value === 'boolean') return value
  return isRecord(value) ? value : true
}

function readDocumentDefs(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(value)) return undefined
  const defs = value['$defs']
  return isRecord(defs) ? defs : undefined
}

function collectDefRefNames(value: unknown, refs: Set<string>, includeDefs: boolean): void {
  if (Array.isArray(value)) {
    for (const item of value) collectDefRefNames(item, refs, includeDefs)
    return
  }
  if (!isRecord(value)) return

  const ref = value['$ref']
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    refs.add(ref.slice('#/$defs/'.length))
  }

  for (const [key, child] of Object.entries(value)) {
    if (!includeDefs && key === '$defs') continue
    collectDefRefNames(child, refs, includeDefs)
  }
}
