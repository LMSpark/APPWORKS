/**
 * @module @spark-appworks/spark-json-document:schema/schema-attach
 * 职责：提供 JSON Document/schema 处理中的 schema attach 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * Attach document-level $defs to a schema root for AJV 2020 $ref resolution.
 */

import { isRecord } from '@spark-appworks/spark-utils'
import type { JsonSchema } from './schema-types'

export function attachJsonSchemaDefs(
  schema: unknown,
  defs?: Readonly<Record<string, JsonSchema>>,
): unknown {
  if (defs === undefined || Object.keys(defs).length === 0) return schema
  if (!isRecord(schema)) {
    return {
      allOf: [schema],
      $defs: { ...defs },
    }
  }
  const existing = schema['$defs']
  const mergedDefs = isRecord(existing)
    ? { ...defs, ...existing }
    : { ...defs }

  // Draft 2020-12 允许 $ref 旁边有 sibling，但本项目的 schema audit
  // 约定 $ref 必须是唯一关键字，避免 LLM/运行时消费者解释不一致。
  // 因此根节点是 $ref 时用 allOf 承载引用，再挂 document/local $defs。
  if (typeof schema['$ref'] === 'string') {
    return {
      allOf: [{ $ref: schema['$ref'] }],
      $defs: mergedDefs,
    }
  }

  return { ...schema, $defs: mergedDefs }
}
