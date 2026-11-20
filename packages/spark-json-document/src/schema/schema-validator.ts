/**
 * @module @spark-appworks/spark-json-document:schema/schema-validator
 * 职责：提供 JSON Document/schema 处理中的 schema validator 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */

import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js'
import { isRecord } from '@spark-appworks/spark-utils'
import { attachJsonSchemaDefs } from './schema-attach'
import { ensureJsonSchema } from './schema-defs'
import type { JsonSchema, JsonSchemaObject } from './schema-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 公共类型 — 校验结果
// ═══════════════════════════════════════════════════════════════

/** 单条校验问题 */
export type JsonValidationIssue = {
    /** 资源路径。 */
path: string
    /** 用户可读消息。 */
message: string
}

/** 校验结果：ok + issues 列表 */
export type JsonValidationResult = Readonly<{
  /** 校验是否通过；true 表示无问题，false 表示 issues 中至少有一条校验问题。 */
  ok: boolean
  /** 校验问题列表；ok 为 true 时为空数组，ok 为 false 时包含所有不满足 schema 的诊断条目。 */
  issues: readonly JsonValidationIssue[]
}>

/** 校验选项：文档级 $defs 供 AJV 2020 原生解析 #/$defs/* $ref。 */
export type JsonSchemaValidateOptions = Readonly<{
  /** 附加到 schema 根的 $defs 映射表，键为定义名，值为对应 JSON Schema；用于解析 schema 内部的 #/$defs/* 引用。 */
  schemaDefs?: Readonly<Record<string, JsonSchema>>
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · AJV 实例 — 全局复用，全量错误收集
// ═══════════════════════════════════════════════════════════════

const ajv = new Ajv2020({
  allErrors: true,        // 收集所有错误，不只是第一个
  strict: false,          // 放宽严格模式，允许非标准关键字
  validateSchema: true,   // 编译时校验 schema 自身合法性
})

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 内部类型守卫 — 运行时结构判断
// ═══════════════════════════════════════════════════════════════

/** 是否为 type=object 的标准 JSON Schema 根 */
function isObjectSchemaRoot(value: unknown): value is JsonSchemaObject & { readonly type: 'object' } {
  return isRecord(value) && value['type'] === 'object'
}

function attachSchemaDefs(
  schema: unknown,
  defs?: Readonly<Record<string, JsonSchema>>,
): unknown {
  return attachJsonSchemaDefs(schema, defs)
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · AJV error 参数安全访问器
// ═══════════════════════════════════════════════════════════════

function errorParam(error: ErrorObject, key: string): unknown {
  return isRecord(error.params) ? error.params[key] : undefined
}

function stringParam(error: ErrorObject, key: string): string | undefined {
  const value = errorParam(error, key)
  return typeof value === 'string' ? value : undefined
}

function numberParam(error: ErrorObject, key: string): number | undefined {
  const value = errorParam(error, key)
  return typeof value === 'number' ? value : undefined
}

function unknownArrayParam(error: ErrorObject, key: string): readonly unknown[] | undefined {
  const value = errorParam(error, key)
  return Array.isArray(value) ? value : undefined
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · JsonSchemaValidator — 核心校验器（全 static）
// ═══════════════════════════════════════════════════════════════

/** Json Schema Validator 的语义模型。 */
export class JsonSchemaValidator {
  /** 静态工具类禁止实例化；所有校验入口必须通过 static 方法共享同一个 AJV 2020 实例。 */
  private constructor() {}

  // ── 公共 API ──

  /**
   * 校验反序列化后的 LLM 参数。
   *
   * 调用时序：
   *   1. LLM 返回 function call arguments（JSON 字符串）
   *   2. Host 层 JSON.parse → params
   *   3. FunctionInvoker 调用本方法校验 params 是否符合 function.paramsSchema
   */
  static validateDeserializedParams(
    params: unknown,
    schema: unknown,
    options?: JsonSchemaValidateOptions,
  ): JsonValidationResult {
    const issues: JsonValidationIssue[] = []

    // 步骤 ①：params 必须是普通 JSON 对象
    if (!isRecord(params)) {
      return {
        ok: false,
        issues: [{ path: '$', message: '参数必须是 JSON 对象' }],
      }
    }

    // 步骤 ②：schema 根必须是 type=object
    if (!isObjectSchemaRoot(schema)) {
      return {
        ok: false,
        issues: [{ path: '$', message: 'schema 根节点必须是 type=object 的标准 JSON Schema' }],
      }
    }

    // 步骤 ③④：AJV 编译并校验（$ref 由 AJV 2020 + 文档级 $defs 解析）
    const validate = ajv.compile(ensureJsonSchema(attachSchemaDefs(schema, options?.schemaDefs)))
    if (!validate(params)) {
      issues.push(...(validate.errors ?? []).map(JsonSchemaValidator.issueFromAjvError))
    }

    return {
      ok: issues.length === 0,
      issues,
    }
  }

  /** 校验任意 JSON 值是否符合 JSON Schema。用于属性值与直调 function 参数兜底校验。 */
  static validateJsonValue(
    value: unknown,
    schema: JsonSchema,
    options?: JsonSchemaValidateOptions,
  ): JsonValidationResult {
    const validate = ajv.compile(ensureJsonSchema(attachSchemaDefs(schema, options?.schemaDefs)))
    if (validate(value)) {
      return { ok: true, issues: [] }
    }
    return {
      ok: false,
      issues: (validate.errors ?? []).map(JsonSchemaValidator.issueFromAjvError),
    }
  }

  /**
   * 将校验问题格式化为中文诊断字符串。
   * 默认最多显示 5 条，超出时追加 "另有 N 个问题"。
   */
  static formatJsonValidationIssues(
    issues: readonly JsonValidationIssue[],
    maxCount = 5,
  ): string {
    if (issues.length === 0) return '参数校验通过'
    const head = issues.slice(0, maxCount).map(issue => `${issue.path} ${issue.message}`)
    const suffix = issues.length > maxCount ? `；另有 ${issues.length - maxCount} 个问题` : ''
    return `参数校验失败：${head.join('；')}${suffix}`
  }

  // ── 私有：AJV error → JsonValidationIssue ──

  /** 将 AJV error 对象转换为 JsonValidationIssue */
  private static issueFromAjvError(error: ErrorObject): JsonValidationIssue {
    const path = JsonSchemaValidator.pathFromAjvError(error)
    return {
      path,
      message: JsonSchemaValidator.messageFromAjvError(error),
    }
  }

  // ── 私有：JSON Pointer → $.a.b[0] 路径格式 ──

  /**
   * 从 AJV error 中提取最佳路径表达。
   * - required 错误：在父路径后追加缺失属性名
   * - additionalProperties 错误：在父路径后追加多余属性名
   * - 其他错误：直接转换 instancePath
   */
  private static pathFromAjvError(error: ErrorObject): string {
    if (error.keyword === 'required') {
      const missingProperty = stringParam(error, 'missingProperty')
      return missingProperty === undefined
        ? JsonSchemaValidator.jsonPointerToPath(error.instancePath)
        : `${JsonSchemaValidator.jsonPointerToPath(error.instancePath)}.${missingProperty}`
    }
    if (error.keyword === 'additionalProperties') {
      const additionalProperty = stringParam(error, 'additionalProperty')
      return additionalProperty === undefined
        ? JsonSchemaValidator.jsonPointerToPath(error.instancePath)
        : `${JsonSchemaValidator.jsonPointerToPath(error.instancePath)}.${additionalProperty}`
    }
    return JsonSchemaValidator.jsonPointerToPath(error.instancePath)
  }

  /**
   * JSON Pointer (RFC 6901) → $.a.b[0] 格式。
   * 处理 ~1 → /、~0 → ~ 转义，数字段用 [N] 表达。
   */
  private static jsonPointerToPath(pointer: string): string {
    if (pointer.length === 0) return '$'
    return `$${pointer
      .split('/')
      .slice(1)
      .map((segment) => segment.replace(/~1/gu, '/').replace(/~0/gu, '~'))
      .map((segment) => (/^\d+$/u.test(segment) ? `[${segment}]` : `.${segment}`))
      .join('')}`
  }

  // ── 私有：AJV error keyword → 中文诊断消息 ──

  /**
   * 将 AJV error keyword 映射为 LLM 可理解的中文消息。
   * 这是唯一的中文诊断映射点，便于统一调整措辞。
   */
  private static messageFromAjvError(error: ErrorObject): string {
    // schema: false 表示该字段被显式禁止
    if (error.schema === false || error.message === 'boolean schema is false') return '该字段在 LLM 参数中应省略'

    // 逐 keyword 映射
    if (error.keyword === 'required') return '缺少必填字段'
    if (error.keyword === 'additionalProperties') return '未声明的字段'
    if (error.keyword === 'type') {
      const type = stringParam(error, 'type')
      if (type === 'array') return '应为数组'
      if (type === 'object') return '应为对象'
      if (type === 'string') return '应为字符串'
      if (type === 'number' || type === 'integer') return '应为数字'
      if (type === 'boolean') return '应为布尔值'
      return type === undefined ? '类型不匹配' : `类型不匹配，期望 ${type}`
    }
    if (error.keyword === 'enum') {
      const allowedValues = unknownArrayParam(error, 'allowedValues')
      return Array.isArray(allowedValues)
        ? `必须是以下枚举之一: ${allowedValues.map(item => JSON.stringify(item)).join(' | ')}`
        : '必须是枚举允许值之一'
    }
    if (error.keyword === 'const') {
      const allowedValue = errorParam(error, 'allowedValue')
      return `必须等于 ${JSON.stringify(allowedValue)}`
    }
    if (error.keyword === 'maxLength') return `长度不能超过 ${numberParam(error, 'limit')}`
    if (error.keyword === 'minLength') return `长度不能少于 ${numberParam(error, 'limit')}`
    if (error.keyword === 'minimum') return `数值不能小于 ${numberParam(error, 'limit')}`
    if (error.keyword === 'maximum') return `数值不能大于 ${numberParam(error, 'limit')}`

    // 兜底：使用 AJV 原始消息
    return error.message ?? '不满足 JSON Schema'
  }
}
