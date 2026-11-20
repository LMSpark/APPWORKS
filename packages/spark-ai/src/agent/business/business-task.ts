/**
 * @module @spark-appworks/spark-ai:agent/business/business-task
 * 职责：把业务输入转换成 AiAgentTask，生成 target、scope、用户消息、系统提示和 orchestration plan。
 * 边界：只负责 task 构造和输入契约执行，不管理 Host 注册表、不保存 session，也不执行模型调用。
 * AI用途：需要理解业务输入如何变成 Agent 请求时，用本模块核对字段流向。
 */

import {
  JsonSchemaValidator,
  coerceStrictJsonValue,
  type JsonParams,
  type JsonSchemaObject,
  type JsonValue,
} from '@spark-appworks/spark-json-document'
import type { AiAgentChatMessage, AiAgentChatRequest } from '../conversation/chat/chat-types'
import type { AiAgentRegistration } from './registration-types'
import { AiAgentTarget, type AiAgentScope } from './scope-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 内部类型与公共 DTO
// ═══════════════════════════════════════════════════════════════

/** 任务输入：仅允许 JSON 可序列化的键值对 */
type AiAgentTaskInput = Readonly<Record<string, JsonValue>>

/** 编排计划：LLM 对话的 userMessage、systemPrompt 和可选标题/步骤 */
export type AiAgentOrchestrationPlan = Readonly<{
  /** 发送给 LLM 的用户消息，作为对话首条 user role 内容；createAiAgentTask 校验非空。 */
  userMessage: string
  /** 业务级系统提示，与注册 systemPrompt、额外 systemPrompt 拼接后作为 LLM system 消息；createAiAgentTask 校验非空。 */
  systemPrompt: string
  /** 可选的 turn 标题，用于前端展示当前轮次的业务语义。 */
  title?: string
  /** 只读步骤列表；前端可展示为进度指引，tool-loop 不依赖此字段执行。 */
  readonlySteps?: readonly string[]
}>

/** 输入契约：定义一种业务 Task 的输入 schema、归一化函数、scope 和编排生成 */
export type AiAgentInputContract<TInput extends JsonParams = JsonParams> = Readonly<{
  /** 输入参数的 JSON Schema；createAiAgentTask 在 normalize 前后各校验一次，确保归一化结果仍合法。 */
  paramsSchema: JsonSchemaObject
  /** 业务实体标识字段名；其值用于生成 scope.businessInstanceId，需为 TInput 中的非空字符串键。 */
  identityField: keyof TInput & string
  /** 将原始输入归一化为 TInput；业务方可在此做类型转换、默认值填充、字段重命名。 */
  normalize(input: JsonParams): TInput
  /** 从归一化输入生成业务 scope；返回的 businessRegistrationId 必须等于 kindID，否则 createAiAgentTask 抛错。 */
  toScope(normalizedInput: TInput): AiAgentScope
  /** 从归一化输入生成编排计划；返回的 userMessage 和 systemPrompt 不允许为空串。 */
  toOrchestration(normalizedInput: TInput): AiAgentOrchestrationPlan
}>

/** Chat 请求选项（剔除 historyMsgs 和 systemPrompt，由 Task 内部生成） */
export type AiAgentTaskChatOptions = Omit<AiAgentChatRequest, 'historyMsgs' | 'systemPrompt'> & Readonly<{
  /** 额外系统提示片段，与业务 systemPrompt 和编排 systemPrompt 拼接；不传则不拼接。 */
  systemPrompt?: string
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · AiAgentTask 类
// ═══════════════════════════════════════════════════════════════

/** 任务注册表查找接口 */
type AiAgentTaskRegistry<TInput extends JsonParams = JsonParams> = Readonly<{
  /** 按 kindID 查找已注册业务；未找到时返回 undefined，调用方据此抛错。 */
  get(kindID: string): AiAgentRegistration<TInput> | undefined
}>

/**
 * 可执行的 Agent Task。
 *
 * 持有归一化输入、scope 和编排计划。通过 toChatRequest 生成
 * 标准 LLM 对话请求，自动拼接业务 systemPrompt + 编排 systemPrompt。
 */
export class AiAgentTask<TInput extends JsonParams = JsonParams> {
    /** 目标对象。 */
public readonly target: AiAgentTarget

    /** 创建 Ai Agent Task 实例。 */
public constructor(
    public readonly kindID: string,
    public readonly normalizedInput: TInput,
    public readonly scope: AiAgentScope,
    public readonly orchestration: AiAgentOrchestrationPlan,
  ) {
    this.target = new AiAgentTarget(scope.businessRegistrationId, scope.businessInstanceId)
  }

  /** 生成标准 LLM 对话请求，自动拼接多层 systemPrompt */
  public toChatRequest(options: AiAgentTaskChatOptions = {}): AiAgentChatRequest {
    const { systemPrompt: extraSystemPrompt, ...requestOptions } = options
    const systemPrompt = [
      createRegisteredTaskSystemPrompt(this),
      this.orchestration.systemPrompt,
      extraSystemPrompt,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')
    const historyMsgs: readonly AiAgentChatMessage[] = [
      { role: 'user', content: this.orchestration.userMessage },
    ]
    return {
      ...requestOptions,
      historyMsgs,
      ...(systemPrompt.trim().length === 0 ? {} : { systemPrompt }),
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 工厂函数
// ═══════════════════════════════════════════════════════════════

/**
 * 从注册表构造 AiAgentTask。
 *
 * 完整流程：
 *   查注册表 → 类型规整 → normalize 前校验 → normalize → normalize 后校验
 *   → 读取 identity → toScope → scope 一致性断言 → toOrchestration → 非空校验
 *
 * 任何步骤失败均抛错，确保只有合法输入能进入 LLM 对话。
 */
export function createAiAgentTask<TInput extends JsonParams = JsonParams>(
  registry: AiAgentTaskRegistry<TInput>,
  kindID: string,
  input: unknown,
): AiAgentTask<TInput> {
  const normalizedKindID = normalizeRequiredText(kindID, 'kindID')
  const registration = registry.get(normalizedKindID)
  if (registration === undefined) {
    throw new Error(`AI host business kindID is not registered: ${normalizedKindID}`)
  }
  const contract = registration.inputContract
  if (contract === undefined) {
    throw new Error(`AI host business registration missing inputContract: ${normalizedKindID}`)
  }

  const rawInput = coerceInputRecord(input, `${normalizedKindID} input`)
  validateTaskInput(normalizedKindID, contract.paramsSchema, rawInput)
  const normalizedInput = contract.normalize(rawInput)
  validateTaskInput(normalizedKindID, contract.paramsSchema, normalizedInput)

  const identity = readIdentityValue(normalizedKindID, contract, normalizedInput)
  const scope = contract.toScope(normalizedInput)
  assertScopeMatchesInput(normalizedKindID, scope, identity)

  const orchestration = contract.toOrchestration(normalizedInput)
  if (orchestration.userMessage.trim().length === 0) {
    throw new Error(`AI host business task for "${normalizedKindID}" produced an empty userMessage.`)
  }
  if (orchestration.systemPrompt.trim().length === 0) {
    throw new Error(`AI host business task for "${normalizedKindID}" produced an empty orchestration systemPrompt.`)
  }
  return new AiAgentTask(normalizedKindID, normalizedInput, scope, orchestration)
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 内部辅助函数
// ═══════════════════════════════════════════════════════════════

/** 构造注册 Task 的简洁 systemPrompt（含 kindID + businessInstanceId + input 摘要） */
function createRegisteredTaskSystemPrompt(task: AiAgentTask): string {
  const promptInput = createRegisteredTaskPromptInput(task)
  return [
    `kindID=${task.kindID}; businessInstanceId=${task.target.businessInstanceId}; input=${JSON.stringify(promptInput)}。`,
  ].join('\n')
}

/** 生成 prompt 用输入摘要（过滤掉与 userMessage 重复的字段） */
function createRegisteredTaskPromptInput(task: AiAgentTask): AiAgentTaskInput {
  const userMessage = task.orchestration.userMessage.trim()
  const out: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(task.normalizedInput)) {
    if (typeof value === 'string' && value.trim() === userMessage) continue
    out[key] = value
  }
  return out
}

/** 用 JSON Schema 校验 Task 输入 */
function validateTaskInput(
  kindID: string,
  schema: JsonSchemaObject,
  input: AiAgentTaskInput,
): void {
  const validation = JsonSchemaValidator.validateDeserializedParams(input, schema)
  if (!validation.ok) {
    throw new Error(
      `AI host business task input for "${kindID}" failed schema validation: ${JsonSchemaValidator.formatJsonValidationIssues(validation.issues)}`,
    )
  }
}

/** 从归一化输入中读取 identity 字段值 */
function readIdentityValue(
  kindID: string,
  contract: Pick<AiAgentInputContract, 'identityField'>,
  normalizedInput: AiAgentTaskInput,
): string {
  const identityField = normalizeRequiredText(contract.identityField, 'identityField')
  const identity = normalizedInput[identityField]
  if (typeof identity !== 'string' || identity.trim().length === 0) {
    throw new Error(`AI host business task input for "${kindID}" must include non-empty identity field "${identityField}".`)
  }
  return identity.trim()
}

/** 断言 scope 中的 kindID 和 identity 与输入一致 */
function assertScopeMatchesInput(kindID: string, scope: AiAgentScope, identity: string): void {
  if (scope.businessRegistrationId !== kindID) {
    throw new Error(`AI host business task scope kindID mismatch: expected "${kindID}", got "${scope.businessRegistrationId}".`)
  }
  if (scope.businessInstanceId !== identity) {
    throw new Error(`AI host business task scope identity mismatch: expected "${identity}", got "${scope.businessInstanceId}".`)
  }
}

/** 将原始输入规整为 AiAgentTaskInput（仅允许 JSON 可序列化值） */
function coerceInputRecord(input: unknown, label: string): AiAgentTaskInput {
  if (!isPlainRecord(input)) {
    throw new Error(`AI host business task ${label} must be a JSON object.`)
  }
  const out: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(input)) {
    const coerced = coerceStrictJsonValue(value)
    if (coerced === undefined) {
      throw new Error(`AI host business task ${label}.${key} must be JSON-serializable.`)
    }
    out[key] = coerced
  }
  return out
}

/** 判断值是否为普通 JSON 对象（非 null、非数组、非自定义实例） */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Reflect.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 校验必填文本字段（非空串） */
function normalizeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[AiAgentTask] ${fieldName} must be a non-empty string.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`[AiAgentTask] ${fieldName} must not be empty.`)
  }
  return trimmed
}
