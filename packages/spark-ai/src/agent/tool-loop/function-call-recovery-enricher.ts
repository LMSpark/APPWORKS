/**
 * @module @spark-appworks/spark-ai:agent/tool-loop/function-call-recovery-enricher
 * 职责：支撑 Agent tool loop 的 function call recovery enricher 能力，处理工具调用、结果映射、诊断事件或 payload 编解码。
 * 边界：只服务单次 turn 内的工具循环，不定义业务注册协议，也不直接管理 UI 或持久化页面状态。
 * AI用途：排查工具调用为什么继续、完成、失败或被映射成回调事件时，用本模块定位 loop 内部语义。
 */
/**
 * FC 失败恢复提示：把 tool result 的 code/msg/fix 映射成 ClassModel
 * 查询、guide 和 model_script 重试步骤，回灌给 LLM 形成失败自修复闭环。
 */
import type { JsonParams } from '@spark-appworks/spark-json-document'
import { CLASS_MODEL_TOOL_NAMES, buildClassModelToolSchemaRecoveryHint, isClassModelToolName } from '../../class-model'
import type {
  AiAgentFunctionCallCheck,
  AiAgentFunctionCallFailure,
  AiAgentFunctionCallResult,
} from '../conversation/session/session-types'

const CLASS_MODEL_TOOL_NAME_SET = new Set<string>(Object.values(CLASS_MODEL_TOOL_NAMES))

const LEGACY_CLASS_MODEL_TOOL_ARG_HINTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  [CLASS_MODEL_TOOL_NAMES.query]: {
    member: '旧字段 member 不可用于 model_query；用 keyword 搜索成员名，或 includeMembers: true 展开成员摘要。',
    select: '旧字段 select 不可用于 model_query；用 includeMembers: true 展开目录。',
    query: '旧字段 query 不可用于 model_query；用 keyword 表达搜索词。',
  },
  [CLASS_MODEL_TOOL_NAMES.attributeGuide]: {
    member: '旧字段 member 不可用于 model_attribute_guide；必须使用 attributeName。',
    name: '旧字段 name 不可用于 model_attribute_guide；必须使用 attributeName。',
    propertyName: '旧字段 propertyName 不可用于 model_attribute_guide；必须使用 attributeName。',
    className: '旧字段 className 不可用于 model_attribute_guide；必须使用 kind。',
    modelName: '旧字段 modelName 不可用于 model_attribute_guide；必须使用 kind。',
  },
  [CLASS_MODEL_TOOL_NAMES.actionGuide]: {
    member: '旧字段 member 不可用于 model_action_guide；必须使用 actionName。',
    name: '旧字段 name 不可用于 model_action_guide；必须使用 actionName。',
    methodName: '旧字段 methodName 不可用于 model_action_guide；必须使用 actionName。',
    action: '旧字段 action 不可用于 model_action_guide；必须使用 actionName。',
    className: '旧字段 className 不可用于 model_action_guide；必须使用 kind。',
    modelName: '旧字段 modelName 不可用于 model_action_guide；必须使用 kind。',
  },
  [CLASS_MODEL_TOOL_NAMES.script]: {
    code: '旧字段 code 不可用于 model_script；必须使用 script。',
    body: '旧字段 body 不可用于 model_script；必须使用 script。',
  },
}

const GLOBAL_ERROR_RECOVERY: Readonly<Record<string, readonly string[]>> = {
  FUNCTION_NOT_DECLARED: [
    '目录恢复：model_query({ kind: "<kind>", includeMembers: true }) 选择真实 actionName。',
    '契约恢复：model_action_guide({ kind: "<kind>", actionName: "<actionName>" }) 读取 paramsSchema / usageRules / failureModes。',
  ],
  ATTRIBUTE_NOT_DECLARED: [
    '目录恢复：model_class_guide({ kind: "<kind>" }) 查看 attributeName 目录。',
    '契约恢复：model_attribute_guide({ kind: "<kind>", attributeName: "<attributeName>" }) 读取 schema 与读写规则。',
  ],
  SCHEMA_VALIDATION_FAILED: [
    '契约恢复：model_action_guide({ kind: "<kind>", actionName: "<actionName>" }) 对照 paramsSchema 与 requiredBeforeCall。',
    '复杂参数恢复：先 model_action_guide/model_attribute_guide 对照 schema，再 model_script 重试。',
  ],
  SCRIPT_EXECUTION_FAILED: [
    '脚本恢复：model_action_guide({ kind: "<kind>", actionName: "<actionName>" }) 核对 usageRules 与 resultApis。',
    'model_script 参数名必须是 script；script 只能是 JavaScript 函数体，不能是 TypeScript/TSX/JSX；this 绑定当前业务根实例。',
  ],
  SCRIPT_ACTION_FAILED: [
    '脚本链式调用返回业务失败：按 tool result 原始 code 修正；必要时 model_action_guide 对照 paramsSchema。',
  ],
  AI_TOOL_REJECTED_BEFORE_EXECUTION: [
    '策略恢复：检查 effectiveDescription / implGate / upstreamContractsSatisfied，必要时 human_question。',
  ],
  TOOL_ARGS_INVALID_JSON: [
    '参数恢复：function.arguments 必须是 JSON object 字符串；先 model_action_guide 读取 paramsSchema 再构造 args。',
  ],
  TOOL_ARGS_NOT_OBJECT: [
    '参数恢复：function.arguments 根节点必须是 object；对照 model_action_guide.paramsSchema 重发 tool_calls。',
  ],
  INVALID_CLASS_MODEL_TOOL_ARGS: [
    '契约恢复：严格按当前工具 schema 重发；model_action_guide 使用 actionName，model_script 使用 script。',
  ],
  INVALID_TOOL_ARGS: [
    '契约恢复：model_action_guide({ kind: "<kind>", actionName: "<actionName>" }) 对照 paramsSchema 与 requiredBeforeCall。',
    'model_script 形状：{ script: "<js body>" }；参数名必须是 script；script 只能是 JavaScript 函数体。',
  ],
  FUNCTION_NOT_FOUND: [
    '目录恢复：model_query({ kind: "<kind>", includeMembers: true }) 列出真实 actionName。',
  ],
  INVALID_GUIDE_REQUEST: [
    'model_action_guide 需要 { kind, actionName }；actionName 必须是业务 action 名。',
  ],
  KIND_NOT_REGISTERED: [
    '目录恢复：model_query({}) 列出已注册 kind；勿猜 kind 名。',
  ],
  UNKNOWN_CLASS_MODEL_TOOL: [
    '工具恢复：只允许 model_query / model_class_guide / model_attribute_guide / model_action_guide / model_script / human_question / agent_complete。',
  ],
}

/** Enrich Function Call Failure Command 的命令参数。 */
export type EnrichFunctionCallFailureCommand = Readonly<{
  /** ClassModel 协议工具名（如 model_query / model_action_guide / model_script），用于匹配协议级恢复策略。 */
  protocolToolName: string
  /** 本次工具调用发送的参数对象，供旧字段名检测和模板插值。 */
  args: JsonParams
  /** 工具调用执行后返回的失败结果，包含 code / fix / checks。 */
  callResult: AiAgentFunctionCallFailure
  /** 当前业务实例 ID；app 层 recovery hook 可用来插值实例级提示。 */
  moduleInstanceId?: string
}>

/** Enrich Function Call Result Options 的调用配置。 */
export type EnrichFunctionCallResultOptions = Readonly<{
  /** 业务方注入的自定义恢复提示回调；接收失败命令，返回追加到 checks 的提示文本数组。 */
  enrichRecoveryHints?: (command: EnrichFunctionCallFailureCommand) => readonly string[]
}>

export function enrichFunctionCallResult(
  command: EnrichFunctionCallFailureCommand,
  options: EnrichFunctionCallResultOptions = {},
): AiAgentFunctionCallResult<unknown> {
  const hints = collectRecoveryHints(command, options)
  if (hints.length === 0) return command.callResult
  return {
    ...command.callResult,
    fix: appendGuideLookupToFix(command.callResult.fix, command),
    checks: mergeChecks(command.callResult.checks, hints.map(toRecoveryCheck)),
  }
}

function collectRecoveryHints(
  command: EnrichFunctionCallFailureCommand,
  options: EnrichFunctionCallResultOptions,
): readonly string[] {
  const context = resolveFailedFunctionContext(command)
  const hints: string[] = []

  appendProtocolRecoveryHints(hints, command)
  appendGlobalRecoveryHints(hints, command.callResult.code, context)
  appendBusinessRecoveryHints(hints, command, options.enrichRecoveryHints)

  return uniqueHints(hints)
}

function appendBusinessRecoveryHints(
  hints: string[],
  command: EnrichFunctionCallFailureCommand,
  enrichRecoveryHints: EnrichFunctionCallResultOptions['enrichRecoveryHints'],
): void {
  if (enrichRecoveryHints === undefined) return
  for (const hint of enrichRecoveryHints(command)) {
    hints.push(hint)
  }
}

function appendProtocolRecoveryHints(
  hints: string[],
  command: EnrichFunctionCallFailureCommand,
): void {
  const toolName = command.protocolToolName
  const code = command.callResult.code

  if (toolName === CLASS_MODEL_TOOL_NAMES.actionGuide) {
    const actionName = readStringArg(command.args, 'actionName')
    if (actionName !== undefined && CLASS_MODEL_TOOL_NAME_SET.has(actionName)) {
      hints.push(`"${actionName}" 是协议工具名，不是 actionName；请 model_query({ includeMembers: true }) 选择业务 action。`)
    }
    if (code === 'FUNCTION_NOT_FOUND') {
      hints.push('actionName 必须是业务 action（如 "<actionName>"），不能是 model_script 等协议工具。')
    }
    return
  }

  if (code === 'INVALID_CLASS_MODEL_TOOL_ARGS' && isClassModelToolName(toolName)) {
    const schemaHint = buildClassModelToolSchemaRecoveryHint(toolName)
    if (schemaHint !== undefined) hints.push(schemaHint)
    appendLegacyClassModelToolArgHints(hints, toolName, command.args)
  }
  if (code === 'INVALID_CLASS_MODEL_TOOL_ARGS' && toolName === CLASS_MODEL_TOOL_NAMES.script) {
    hints.push('model_script 只接受 script 字段；请按工具 schema 重写参数。')
  }
}

function appendLegacyClassModelToolArgHints(
  hints: string[],
  toolName: string,
  args: JsonParams,
): void {
  const toolHints = LEGACY_CLASS_MODEL_TOOL_ARG_HINTS[toolName]
  if (toolHints === undefined) return
  for (const key of Object.keys(args).sort()) {
    const hint = toolHints[key]
    if (hint !== undefined) hints.push(hint)
  }
}

function appendGlobalRecoveryHints(
  hints: string[],
  code: string,
  context: FailedFunctionContext,
): void {
  const templates = GLOBAL_ERROR_RECOVERY[code]
  if (templates === undefined) return
  for (const template of templates) {
    hints.push(substituteRecoveryTemplate(template, context))
  }
}

function resolveFailedFunctionContext(
  command: EnrichFunctionCallFailureCommand,
): FailedFunctionContext {
  if (command.protocolToolName === CLASS_MODEL_TOOL_NAMES.actionGuide) {
    const kind = readStringArg(command.args, 'kind')
    const actionName = readStringArg(command.args, 'actionName')
    return buildFailedFunctionContext({
      ...(kind === undefined ? {} : { kind }),
      ...(actionName === undefined ? {} : { actionName }),
    })
  }
  return {}
}

function buildFailedFunctionContext(
  input: Readonly<{
    kind?: string
    actionName?: string
    attributeName?: string
  }>,
): FailedFunctionContext {
  return {
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    ...(input.actionName === undefined ? {} : { actionName: input.actionName }),
    ...(input.attributeName === undefined ? {} : { attributeName: input.attributeName }),
  }
}

type FailedFunctionContext = Readonly<{
  kind?: string
  actionName?: string
  attributeName?: string
}>

function readStringArg(args: JsonParams, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function substituteRecoveryTemplate(template: string, context: FailedFunctionContext): string {
  return template
    .replaceAll('<kind>', context.kind ?? '<kind>')
    .replaceAll('<actionName>', context.actionName ?? '<actionName>')
    .replaceAll('<attributeName>', context.attributeName ?? '<attributeName>')
}

function appendGuideLookupToFix(
  fix: string,
  command: EnrichFunctionCallFailureCommand,
): string {
  const context = resolveFailedFunctionContext(command)
  if (context.kind === undefined || context.actionName === undefined) return fix
  const lookup = `model_action_guide({ kind: "${context.kind}", actionName: "${context.actionName}" })`
  if (fix.includes('model_action_guide')) return fix
  return `${fix} 反查指南：${lookup}。`
}

function toRecoveryCheck(hint: string): AiAgentFunctionCallCheck {
  return {
    level: 'info',
    code: 'RECOVERY_HINT',
    message: hint,
    hint,
  }
}

function mergeChecks(
  existing: readonly AiAgentFunctionCallCheck[] | undefined,
  recoveryChecks: readonly AiAgentFunctionCallCheck[],
): readonly AiAgentFunctionCallCheck[] {
  const merged = [...(existing ?? [])]
  const seen = new Set(merged.map(check => check.message))
  for (const check of recoveryChecks) {
    if (seen.has(check.message)) continue
    seen.add(check.message)
    merged.push(check)
  }
  return merged
}

function uniqueHints(values: readonly string[]): readonly string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = value.trim()
    if (normalized.length === 0 || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}
