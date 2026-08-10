/**
 * @module @spark-appworks/spark-ai:class-model/class-model/json-schema-emit
 * 职责：组装 Draft 2020-12 JSON Schema 文档的共享原语，统一 title、description、$defs 和审计入口。
 * 边界：只做 schema 结构 emit 与 finalize，不读取 TypeScript AST、不访问文件系统、不投影 DtsTypeDeclarationModel。
 * AI用途：排查 class-model schema 文档格式或 $defs 合并规则时，用本模块确认最终 schema 形态。
 */
import type { JsonSchema } from '@spark-appworks/spark-json-document'
import {
  JSON_SCHEMA_DRAFT_2020_12,
  assertDraft2020Schema,
  attachJsonSchemaDefs,
  extractJsonSchemaLocalDefs,
  standardizeJsonSchema,
  type StandardJsonSchema,
  type StandardJsonSchemaObject,
} from '@spark-appworks/spark-json-document'

/** 从 JSDoc 字段提取 description；空白则省略。 */
export function modelDescription(jsdoc: string): string | undefined {
  const trimmed = jsdoc.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/** 判断 attribute 是否必填（readable 且 writable）。 */
export function isWritableRequiredAttribute(
  readable: boolean,
  writable: boolean,
): boolean {
  return readable && writable
}

function titleDescription(input: Readonly<{
  title: string
  description?: string
}>): Readonly<{ title: string; description?: string }> {
  return input.description === undefined
    ? { title: input.title }
    : { title: input.title, description: input.description }
}

/** 从 inline schema 提取 const 或单值 enum（enum 成员投影用）。 */
export function extractConstOrSingleEnumValue(
  schema: JsonSchema | StandardJsonSchema,
): string | number | boolean | null | undefined {
  if (typeof schema === 'boolean') return undefined

  if (schema.const !== undefined) {
    return schema.const
  }

  const enumValues = schema.enum
  if (!Array.isArray(enumValues) || enumValues.length !== 1) return undefined
  const onlyValue: unknown = enumValues[0]
  if (
    typeof onlyValue === 'string'
    || typeof onlyValue === 'number'
    || typeof onlyValue === 'boolean'
    || onlyValue === null
  ) {
    return onlyValue
  }
  return undefined
}

function collectLocalDefRefs(
  value: unknown,
  refs: Set<string>,
  includeDefs: boolean,
): void {
  if (typeof value === 'boolean') return
  if (!isUnknownRecord(value)) return
  const record = value

  const ref = record['$ref']
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    refs.add(ref.slice('#/$defs/'.length))
  }

  for (const [key, child] of Object.entries(record)) {
    if (!includeDefs && key === '$defs') continue
    if (key === '$schema') continue
    collectLocalDefRefs(child, refs, includeDefs)
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectReferencedDefs(
  schema: StandardJsonSchemaObject,
  pool: Readonly<Record<string, StandardJsonSchema>>,
): Record<string, StandardJsonSchema> {
  const referenced = new Set<string>()
  collectLocalDefRefs(schema, referenced, false)

  const result: Record<string, StandardJsonSchema> = {}
  for (const name of referenced) {
    const definition = pool[name]
    if (definition !== undefined) {
      result[name] = definition
    }
  }
  return result
}

/**
 * 将 draft 文档 finalize 为标准 Draft 2020-12 JSON Schema：
 * 抽取本地 $defs → 标准化 → 附加外部池中被引用的 $defs → 再标准化 → 审计。
 */
export function finalizeDraft2020SchemaDocument(
  draft: StandardJsonSchemaObject,
  label: string,
): StandardJsonSchemaObject {
  const extracted = extractJsonSchemaLocalDefs(draft)
  const defPool = Object.fromEntries(
    Object.entries(extracted.defs).map(([name, definition]) => [
      name,
      standardizeJsonSchema(definition),
    ]),
  )

  const standardized = standardizeJsonSchema(extracted.schema)
  if (typeof standardized === 'boolean') {
    throw new Error(`jsonSchema("${label}") produced boolean schema root`)
  }

  const withHeader: StandardJsonSchemaObject = standardized.$schema === undefined
    ? { $schema: JSON_SCHEMA_DRAFT_2020_12, ...standardized }
    : standardized

  const referenced = collectReferencedDefs(withHeader, defPool)
  const attached = Object.keys(referenced).length === 0
    ? withHeader
    : standardizeJsonSchema(attachJsonSchemaDefs(withHeader, referenced))

  if (typeof attached === 'boolean') {
    throw new Error(`jsonSchema("${label}") produced boolean schema after attach`)
  }

  const finalized: StandardJsonSchemaObject = attached.$schema === undefined
    ? { $schema: JSON_SCHEMA_DRAFT_2020_12, ...attached }
    : attached

  try {
    assertDraft2020Schema(finalized)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`jsonSchema("${label}") produced non-Draft-2020-12 output:\n${detail}`)
  }

  return finalized
}

/** 组装 object 形态 JSON Schema draft。 */
export function buildObjectJsonSchema(input: Readonly<{
  title: string
  description?: string
  properties?: Record<string, StandardJsonSchema>
  required?: readonly string[]
}>): StandardJsonSchemaObject {
  const hasProperties = input.properties !== undefined && Object.keys(input.properties).length > 0
  const required = input.required ?? []

  return {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    type: 'object',
    title: input.title,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(hasProperties
      ? {
          properties: input.properties,
          ...(required.length === 0 ? {} : { required: [...required] }),
          additionalProperties: false,
        }
      : {}),
  }
}

/** 组装 enum / const 形态 JSON Schema draft。 */
export function buildEnumJsonSchema(input: Readonly<{
  title: string
  description?: string
  values: ReadonlyArray<string | number | boolean | null>
}>): StandardJsonSchemaObject {
  if (input.values.length === 0) {
    return buildObjectJsonSchema(titleDescription(input))
  }

  if (input.values.length === 1) {
    const value = input.values[0]
    if (value === undefined) return buildObjectJsonSchema(titleDescription(input))
    return {
      $schema: JSON_SCHEMA_DRAFT_2020_12,
      title: input.title,
      ...(input.description === undefined ? {} : { description: input.description }),
      const: value,
    }
  }

  return {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    title: input.title,
    ...(input.description === undefined ? {} : { description: input.description }),
    enum: [...input.values],
  }
}

/** 将 type body 包装为独立 Draft 2020-12 draft（内联 $defs 由 finalize 统一处理）。 */
export function buildStandaloneTypeSchema(input: Readonly<{
  title: string
  description?: string
  body: StandardJsonSchema
}>): StandardJsonSchemaObject {
  if (typeof input.body === 'boolean') {
    return buildObjectJsonSchema(titleDescription(input))
  }

  const { schema: bodyWithoutDefs } = extractJsonSchemaLocalDefs(input.body)
  const normalizedBody = standardizeJsonSchema(bodyWithoutDefs)
  if (typeof normalizedBody === 'boolean') {
    return buildObjectJsonSchema(titleDescription(input))
  }

  const description = input.description
    ?? (typeof normalizedBody.description === 'string' ? normalizedBody.description : undefined)

  const result: Record<string, unknown> = {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    ...normalizedBody,
    title: input.title,
  }
  if (description !== undefined) {
    result['description'] = description
  }
  return result
}

/** 组装 function 形态 JSON Schema draft（params + return）。 */
export function buildFunctionJsonSchema(input: Readonly<{
  title: string
  description?: string
  paramsSchema?: StandardJsonSchemaObject
  returnSchema?: StandardJsonSchema
}>): StandardJsonSchemaObject {
  if (input.paramsSchema === undefined) {
    return buildObjectJsonSchema(titleDescription(input))
  }

  return buildObjectJsonSchema({
    ...titleDescription(input),
    properties: {
      params: input.paramsSchema,
      return: input.returnSchema === undefined ? true : standardizeJsonSchema(input.returnSchema),
    },
  })
}
