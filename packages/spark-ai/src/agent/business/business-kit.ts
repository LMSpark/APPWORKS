/**
 * @module @spark-appworks/spark-ai:agent/business/business-kit
 * 职责：构建业务级 AI 输入契约，把 businessId、paramsSchema、identity/message 字段、systemPrompt、title 和 readonlySteps 标准化成 AiAgentInputContract。
 * 边界：只处理输入校验、scope 创建和 orchestration 文案组装，不创建会话、不执行工具，也不持久化业务状态。
 * AI用途：注册新的业务模块入口时，用本模块确认输入字段如何转成会话 scope、用户消息和系统提示。
 */
import type {
  JsonParams,
  JsonSchemaObject,
} from '@spark-appworks/spark-json-document'
import { createAiAgentScope } from './business-scope'
import type {
  AiAgentInputContract,
  AiAgentOrchestrationPlan,
} from './business-task'

/** Ai Business Id Options 的调用配置。 */
export type AiBusinessIdOptions = Readonly<{
  /** 业务模块唯一标识，对应 scope.businessRegistrationId，与 registration.moduleId 一致。 */
  businessId: string
}>

/** Ai Business Input Options 的调用配置。 */
export type AiBusinessInputOptions<TInput extends JsonParams = JsonParams> = Readonly<{
  /** 输入参数的 JSON Schema，用于 normalize 前后双次校验。 */
  paramsSchema: JsonSchemaObject
  /** 实体标识字段名，其值用于生成 scope.businessInstanceId。 */
  identityField: keyof TInput & string
  /** 用户消息字段名，其值作为 LLM 首轮 user message 内容。 */
  messageField: keyof TInput & string
  /** 自定义归一化函数；不传则默认 require 输入已通过 paramsSchema 校验。 */
  normalize?: (input: JsonParams) => TInput
  /** 系统提示，支持静态文本或从输入动态生成；空串会 throw。 */
  systemPrompt: string | ((input: TInput) => string)
  /** 可选 turn 标题，支持静态文本或从输入动态生成。 */
  title?: string | ((input: TInput) => string | undefined)
  /** 可选只读步骤列表，支持静态数组或从输入动态生成。 */
  readonlySteps?: readonly string[] | ((input: TInput) => readonly string[] | undefined)
}>

/** Create Simple Input Contract Options 的调用配置。 */
export type CreateSimpleInputContractOptions<TInput extends JsonParams = JsonParams> =
  AiBusinessIdOptions & AiBusinessInputOptions<TInput>

export function createSimpleInputContract<TInput extends JsonParams = JsonParams>(
  options: CreateSimpleInputContractOptions<TInput>,
): AiAgentInputContract<TInput> {
  const businessId = normalizeBusinessId(options)
  const identityField = normalizeInputField(options.identityField, 'identityField')
  const messageField = normalizeInputField(options.messageField, 'messageField')
  return {
    paramsSchema: options.paramsSchema,
    identityField,
    normalize: options.normalize ?? defaultNormalize,
    toScope: (input) => {
      const identity = readRequiredString(input, identityField, 'identityField')
      return createAiAgentScope(businessId, identity)
    },
    toOrchestration: (input) => {
      const userMessage = readRequiredString(input, messageField, 'messageField')
      const systemPrompt = resolveTextOption(options.systemPrompt, input, 'systemPrompt')
      const title = resolveOptionalTextOption(options.title, input)
      const readonlySteps = resolveOptionalTextListOption(options.readonlySteps, input)
      const plan: AiAgentOrchestrationPlan = {
        userMessage,
        systemPrompt,
        ...(title === undefined ? {} : { title }),
        ...(readonlySteps === undefined ? {} : { readonlySteps }),
      }
      return plan
    },
  }
}

function normalizeBusinessId(options: AiBusinessIdOptions): string {
  return normalizeRequiredText(options.businessId, 'businessId')
}

function defaultNormalize<TInput extends JsonParams>(input: JsonParams): TInput {
  if (isSchemaValidatedInput<TInput>(input)) return input
  throw new Error('[AiAgentInputContract] input must match paramsSchema before normalization.')
}

function isSchemaValidatedInput<TInput extends JsonParams>(input: JsonParams): input is TInput {
  void input
  return true
}

function normalizeInputField<TInput extends JsonParams>(
  field: keyof TInput & string,
  label: string,
): keyof TInput & string {
  normalizeRequiredText(field, label)
  return field
}

function normalizeRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[AiAgentInputContract] ${field} must be a non-empty string.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`[AiAgentInputContract] ${field} must not be empty.`)
  }
  return trimmed
}

function readRequiredString<TInput extends JsonParams>(
  input: TInput,
  field: keyof TInput & string,
  label: string,
): string {
  const value = input[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[AiAgentInputContract] ${label} "${field}" must be a non-empty string.`)
  }
  return value.trim()
}

function resolveTextOption<TInput extends JsonParams>(
  value: string | ((input: TInput) => string),
  input: TInput,
  label: string,
): string {
  const resolved = typeof value === 'function' ? value(input) : value
  return normalizeRequiredText(resolved, label)
}

function resolveOptionalTextOption<TInput extends JsonParams>(
  value: string | ((input: TInput) => string | undefined) | undefined,
  input: TInput,
): string | undefined {
  if (value === undefined) return undefined
  const resolved = typeof value === 'function' ? value(input) : value
  if (resolved === undefined) return undefined
  return normalizeRequiredText(resolved, 'title')
}

function resolveOptionalTextListOption<TInput extends JsonParams>(
  value: readonly string[] | ((input: TInput) => readonly string[] | undefined) | undefined,
  input: TInput,
): readonly string[] | undefined {
  if (value === undefined) return undefined
  const resolved = typeof value === 'function' ? value(input) : value
  if (resolved === undefined) return undefined
  const out = resolved.map((item) => normalizeRequiredText(item, 'readonlySteps'))
  return out.length === 0 ? undefined : out
}
