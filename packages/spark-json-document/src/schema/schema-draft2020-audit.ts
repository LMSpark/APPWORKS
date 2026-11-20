/**
 * @module @spark-appworks/spark-json-document:schema/schema-draft2020-audit
 * 职责：提供 JSON 文档和 schema 处理中的 schema-draft2020-audit 能力，围绕 Draft2020AuditIssue 管理 schema 标准化、解析、校验或树策略。
 * 边界：只处理 JSON/schema/tree 抽象，不依赖 SPARK 页面运行时，也不直接操作业务 DataSet。
 * AI用途：生成或校验 JSON 配置结构时，用本模块确认 schema/schema-draft2020-audit 的 schema 语义。
 */
import { isRecord } from '@spark-appworks/spark-utils'

const VALID_SCHEMA_TYPES = new Set([
  'null',
  'boolean',
  'object',
  'array',
  'number',
  'integer',
  'string',
])

const REF_ANNOTATION_SIBLINGS = new Set([
  'title',
  'description',
  '$comment',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
])

/** Draft2020 Audit Issue 的语义模型。 */
export type Draft2020AuditIssue = Readonly<{
  /** 审计问题在 JSON Schema 中的路径，格式为 $.properties.fieldName 等。 */
  path: string
  /** 违反的审计规则标识，如 INVALID_TYPE、REF_TARGET、REDUNDANT_CONST_TYPE 等。 */
  rule: string
  /** 规则违反的详细说明，包含具体的违规内容（如非法类型名、多余字段列表等）。 */
  detail: string
}>

export function auditDraft2020Schema(value: unknown, path = '$'): readonly Draft2020AuditIssue[] {
  const issues: Draft2020AuditIssue[] = []
  visitSchema(value, path, issues)
  return issues
}

export function assertDraft2020Schema(value: unknown, path = '$'): void {
  const issues = auditDraft2020Schema(value, path)
  if (issues.length === 0) return
  const sample = issues.slice(0, 5).map(issue => `${issue.path}: ${issue.rule} (${issue.detail})`).join('\n')
  throw new Error(`Draft 2020-12 audit failed with ${issues.length} issue(s):\n${sample}`)
}

function isAllowedSchemaRef(ref: string): boolean {
  if (ref.includes('#/$defs/')) return true
  const modelMarker = '#/models/'
  const markerIndex = ref.indexOf(modelMarker)
  if (markerIndex >= 0 && ref.endsWith('/jsonSchema')) return true
  return false
}

function visitSchema(value: unknown, path: string, issues: Draft2020AuditIssue[]): void {
  if (typeof value === 'boolean') return
  if (!isRecord(value)) {
    issues.push({ path, rule: 'INVALID_SCHEMA_NODE', detail: 'schema node must be boolean or object' })
    return
  }

  const ref = value['$ref']
  if (typeof ref === 'string') {
    if (!isAllowedSchemaRef(ref)) {
      issues.push({ path, rule: 'REF_TARGET', detail: 'schema $ref must target #/$defs/*, including cross-file refs' })
    }
    const siblings = Object.keys(value).filter(key => key !== '$ref' && !REF_ANNOTATION_SIBLINGS.has(key))
    if (siblings.length > 0) {
      issues.push({ path, rule: 'REF_WITH_STRUCTURAL_SIBLINGS', detail: `$ref may only have annotation siblings; found ${siblings.join(', ')}` })
    }
    return
  }

  const schemaType = value['type']
  if (schemaType === 'function') {
    issues.push({ path, rule: 'INVALID_TYPE', detail: 'function is not a Draft 2020-12 type' })
  }

  if (typeof schemaType === 'string' && !VALID_SCHEMA_TYPES.has(schemaType)) {
    issues.push({ path, rule: 'INVALID_TYPE', detail: schemaType })
  }
  if (Array.isArray(schemaType)) {
    for (const typeName of schemaType) {
      if (typeof typeName !== 'string' || !VALID_SCHEMA_TYPES.has(typeName)) {
        issues.push({ path, rule: 'INVALID_TYPE', detail: String(typeName) })
      }
    }
  }

  if (value['const'] !== undefined && schemaType !== undefined) {
    issues.push({ path, rule: 'REDUNDANT_CONST_TYPE', detail: 'const schemas should not repeat type' })
  }

  if (schemaType === 'null' && value['const'] === null) {
    issues.push({ path, rule: 'REDUNDANT_NULL', detail: 'use type null or const null, not both' })
  }

  const enumValues = value['enum']
  if (schemaType === 'boolean' && Array.isArray(enumValues) && enumValues.length === 2
    && enumValues.includes(false) && enumValues.includes(true)) {
    issues.push({ path, rule: 'REDUNDANT_BOOLEAN_ENUM', detail: 'use { type: boolean } instead' })
  }

  if (Array.isArray(enumValues) && enumValues.length === 1) {
    issues.push({ path, rule: 'ENUM_SINGLE', detail: 'single-value enum should be const' })
  }

  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = value[keyword]
    if (!Array.isArray(branches)) continue
    if (branches.length === 1) {
      issues.push({ path, rule: 'SINGLE_COMBINATOR', detail: `${keyword} must not contain a single branch` })
    }
    if ((keyword === 'anyOf' || keyword === 'oneOf') && isLiteralOnlyCombinator(branches)) {
      issues.push({ path, rule: 'LITERAL_COMBINATOR_ENUM', detail: `${keyword} literal branches should be a single enum or const schema` })
    }
    for (const [index, branch] of branches.entries()) {
      visitSchema(branch, `${path}.${keyword}[${index}]`, issues)
    }
  }

  if (schemaType === 'array' || (Array.isArray(schemaType) && schemaType.includes('array'))) {
    if (value['items'] === undefined && value['prefixItems'] === undefined) {
      issues.push({ path, rule: 'ARRAY_WITHOUT_ITEMS', detail: 'array schemas must declare items or prefixItems' })
    }
  }

  if (typeof ref === 'string' && ref.includes('JsonSchema_')) {
    issues.push({ path, rule: 'LEGACY_PRIMITIVE_REF', detail: ref })
  }

  const properties = value['properties']
  if (properties !== undefined && isRecord(properties)) {
    for (const [name, property] of Object.entries(properties)) {
      visitSchema(property, `${path}.properties.${name}`, issues)
    }
  }

  const items = value['items']
  if (items !== undefined) visitSchema(items, `${path}.items`, issues)
  const prefixItems = value['prefixItems']
  if (Array.isArray(prefixItems)) {
    for (const [index, item] of prefixItems.entries()) {
      visitSchema(item, `${path}.prefixItems[${index}]`, issues)
    }
  }
  const additionalProperties = value['additionalProperties']
  if (additionalProperties !== undefined) {
    visitSchema(additionalProperties, `${path}.additionalProperties`, issues)
  }
  const defs = value['$defs']
  if (defs !== undefined) {
    if (!isRecord(defs)) {
      issues.push({ path: `${path}.$defs`, rule: 'INVALID_DEFS', detail: '$defs must be an object' })
    } else {
      for (const [name, definition] of Object.entries(defs)) {
        visitSchema(definition, `${path}.$defs.${name}`, issues)
      }
    }
  }
  const notSchema = value['not']
  if (notSchema !== undefined) visitSchema(notSchema, `${path}.not`, issues)
}

function isLiteralOnlyCombinator(branches: readonly unknown[]): boolean {
  if (branches.length <= 1) return false
  return branches.every(branch => readLiteralBranchValues(branch) !== undefined)
}

function readLiteralBranchValues(branch: unknown): readonly unknown[] | undefined {
  if (!isRecord(branch)) return undefined
  if (!Object.keys(branch).every(key => key === 'type' || key === 'enum' || key === 'const' || key === 'title' || key === 'description')) {
    return undefined
  }
  if (branch['const'] !== undefined) return [branch['const']]
  if (branch['type'] === 'null') return [null]
  const enumValues = branch['enum']
  if (Array.isArray(enumValues) && enumValues.length > 0) return enumValues.filter(isJsonLiteralValue)
  return undefined
}

function isJsonLiteralValue(value: unknown): value is string | number | boolean | null {
  return typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value === null
}
