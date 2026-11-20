/**
 * @module @spark-appworks/spark-ai:class-model/metadata/json-schema-dereference
 * 职责：维护 @spark-appworks/spark-ai 中 class-model/metadata/json-schema-dereference 的 AI 运行时语义。
 * 边界：只服务 spark-ai 包内部的 Agent/DtsTypeDeclarationModel 能力，不直接耦合应用页面或 Vue 组件。
 * AI用途：定位 spark-ai 公共 API、运行时协议或知识索引字段时，用本模块作为语义入口。
 */
/**
 * Runtime API metadata schema inlining — delegates JSON Schema logic to spark-json-document.
 */

import {
  dereferenceSchemaSlotsInValue,
  type JsonSchemaDefs,
} from '@spark-appworks/spark-json-document'

import type { AiRuntimeApiMetadataJson } from './ai-api-object-metadata-schema'

const RUNTIME_API_METADATA_SCHEMA_SLOT_KEYS = ['paramsSchema', 'resultSchema', 'schema'] as const

export function dereferenceRuntimeApiMetadataSchemas(
  module: AiRuntimeApiMetadataJson,
  defs: JsonSchemaDefs | undefined,
): AiRuntimeApiMetadataJson {
  if (defs === undefined || Object.keys(defs).length === 0) return module
  const visited = dereferenceSchemaSlotsInValue(module, defs, RUNTIME_API_METADATA_SCHEMA_SLOT_KEYS)
  if (!isAiRuntimeApiMetadataJson(visited)) {
    throw new Error('dereferenceRuntimeApiMetadataSchemas produced invalid runtime API metadata.')
  }
  return visited
}

function isAiRuntimeApiMetadataJson(value: unknown): value is AiRuntimeApiMetadataJson {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const schemaVersion: unknown = Reflect.get(value, 'schemaVersion')
  if (schemaVersion !== 1 && schemaVersion !== 2) return false
  const rootApi: unknown = Reflect.get(value, 'rootApi')
  return rootApi !== null && typeof rootApi === 'object' && !Array.isArray(rootApi)
}
