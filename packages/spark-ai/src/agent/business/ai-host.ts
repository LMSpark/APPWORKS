/**
 * @module @spark-appworks/spark-ai:agent/business/ai-host
 * 职责：提供 AI Agent 的 Host 门面，统一管理业务注册、alias/moduleId 映射、dry-run 诊断和 run 入口。
 * 边界：负责把外部业务调用编排到 registry、task 和 session，不直接实现工具循环、传输回调或业务输入契约。
 * AI用途：定位业务入口如何被注册、校验、运行或诊断时，先读本模块确认 Host 对外承诺和向下委托关系。
 */

import { defineCapability, isCallable, isRecord } from '@spark-appworks/spark-utils'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import { AiAgentRegistry } from './business-registry'
import { runAiAgent, type AiAgentSession } from './business-session'
import {
  createAiAgentTask,
  type AiAgentOrchestrationPlan,
  type AiAgentTask,
  type AiAgentTaskChatOptions,
} from './business-task'
import type { AiAgentTurnCallbacks } from '../transport/transport-types'
import type { AiAgentRegistration } from './registration-types'
import type { AiAgentOptions } from './host-options'
import type { AiAgentScope } from './scope-types'
import type { AiAgentSessionRecord } from '../session/session-types'
import type { AiAgentToolRuntimeInspectReport } from '../tool-runtime'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 公共类型 — Host 构造、运行、注册的输入/输出类型
// ═══════════════════════════════════════════════════════════════

/** Host 构造选项：必须提供 turnCallbacks（APP 层 I/O 回调），可选 maxToolRounds 安全阀 */
export type CreateAiAgentHostOptions = Readonly<{
  /** APP 层 I/O 回调：spark-ai 通过此接口执行 turn、追加消息，不自行发起网络请求 */
  turnCallbacks: AiAgentTurnCallbacks
  /** 单次 run 中工具循环最大轮数安全阀，超出后强制终止；省略则使用 spark-ai 内部默认值 */
  maxToolRounds?: number
}>

/** Host.run() 的返回值：包含创建的 task 和 session */
export type AiAgentHostRunResult = Readonly<{
  /** 本次 run 创建的任务描述（含 scope、orchestration、normalizedInput） */
  task: AiAgentTask
  /** 本次 run 创建的会话（持有 turn 交互历史与 sessionStore） */
  session: AiAgentSession
  /** 业务层扩展数据，由具体业务在 run 完成后注入额外结果（如生成文件路径等） */
  resultExtras?: Readonly<Record<string, unknown>>
}>

/** 泛型注册表映射：alias → registration，供泛型类型推断使用 */
export type AiAgentHostEntryMap = Record<string, AiAgentRegistration>

/** 从 registration 泛型参数中提取输入类型 */
export type AiAgentHostRegistrationInput<TRegistration> =
  TRegistration extends AiAgentRegistration<infer TInput> ? TInput : JsonParams

/** ensure 命令：延迟创建 registration 的工厂指令 */
export type AiAgentHostEnsureCommand<TInput extends JsonParams = JsonParams> = Readonly<{
  /** 延迟创建的 registration 所属业务模块标识，必须与 create() 返回的 registration.moduleId 一致 */
  moduleId: string
  /** 延迟工厂：仅在 alias 不存在时调用，返回的 registration.moduleId 必须与命令的 moduleId 匹配 */
  create: () => AiAgentRegistration<TInput>
}>

/** 已注册业务的摘要信息，用于 listRegistrations() 输出和启动日志 */
export type AiAgentHostRegistrationSummary = Readonly<{
  /** 业务注册别名，Host.run() 通过此别名查找并调度业务 */
  alias: string
  /** 业务模块标识，对应 registry 中的唯一 key */
  moduleId: string
  /** 业务人类可读名称 */
  name: string
  /** 业务人类可读描述 */
  description: string
  /** runtime inspect 检测到的根类型 kind 列表（如 class / interface / enum） */
  rootKinds: readonly string[]
  /** runtime inspect 检测到的模块数量（含子模块） */
  moduleCount: number
  /** runtime inspect 状态：healthy / degraded / broken，反映 ClassModel 工具是否完整可用 */
  status: AiAgentToolRuntimeInspectReport['status']
}>

/** 已注册业务的详细信息，在 describe() 中返回，含完整 runtime inspect 报告 */
export type AiAgentHostRegistrationDescription = AiAgentHostRegistrationSummary & Readonly<{
  /** 完整的 runtime inspect 报告，包含 findings、moduleCount、rootKinds 等诊断数据 */
  inspectReport: AiAgentToolRuntimeInspectReport
}>

/** dry-run 诊断条目：校验注册、输入契约、scope、orchestration 和工具清单时产出的单条诊断 */
export type AiAgentHostDryRunDiagnostic = Readonly<{
  /** 诊断级别：error 表示无法运行，warn 表示可运行但有风险，info 表示纯信息 */
  level: 'error' | 'warn' | 'info'
  /** 诊断代码标识，如 DRY_RUN_FAILED / RUNTIME_INSPECT_OK，用于程序化匹配 */
  code: string
  /** 诊断人类可读消息 */
  message: string
  /** 可选的修复建议，引导用户解决该诊断问题 */
  fix?: string
}>

/** 编排计划摘要，在 dryRun 结果中提供，用于快速了解本轮 run 的 prompt/step 规模 */
export type AiAgentHostOrchestrationSummary = Readonly<{
  /** 编排计划标题，可能为空 */
  title?: string
  /** 用户消息字符长度，用于估算 token 消耗 */
  userMessageLength: number
  /** 系统提示词字符长度，用于估算 token 消耗 */
  systemPromptLength: number
  /** 只读步骤数量（不修改业务数据的预处理步骤） */
  readonlyStepCount: number
}>

/** Ai Agent Host Dry Run Result 的返回结果。 */
export type AiAgentHostDryRunResult = Readonly<
  | {
    ok: true
    alias: string
    moduleId: string
    normalizedInput: JsonParams
    scope: AiAgentScope
    orchestration: AiAgentOrchestrationPlan
    orchestrationSummary: AiAgentHostOrchestrationSummary
    tools: readonly string[]
    inspectReport: AiAgentToolRuntimeInspectReport
    diagnostics: readonly AiAgentHostDryRunDiagnostic[]
  }
  | {
    ok: false
    alias: string
    error: Readonly<{
      message: string
    }>
    diagnostics: readonly AiAgentHostDryRunDiagnostic[]
  }
>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 内部状态类型 — Host 实例的运行时状态
// ═══════════════════════════════════════════════════════════════

/** Host 实例的内部状态，包含注册表和别名映射 */
type AiAgentHostState = {
  readonly registry: AiAgentRegistry
  readonly aliasToModuleId: Map<string, string>
  readonly moduleIdToAlias: Map<string, string>
  readonly turnCallbacks: AiAgentTurnCallbacks
  readonly maxToolRounds?: number
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · AiAgentHost 类 — AI 业务宿主编排器
// ═══════════════════════════════════════════════════════════════

/**
 * AI 业务宿主编排器。
 *
 * 对外暴露核心方法：
 *   register(alias, registration) — 注册一个业务（别名 + 注册项）
 *   ensure(alias, command)        — 幂等注册（已存在则跳过，否则调用 factory 创建）
 *   has(alias)                    — 检查别名是否已注册
 *   dryRun(alias, input)          — 验证输入契约和 runtime inspect，不调用 LLM
 *   run(alias, input, chat?)      — 运行一个已注册业务（创建 task → 启动 session → 发送消息）
 *
 * 泛型参数 TEntries 支持链式类型推断：每次 register/ensure 返回新的类型窄化实例。
 */
export class AiAgentHost<TEntries extends AiAgentHostEntryMap = {}> {
  private readonly state: AiAgentHostState

  /** 用共享 host state 构造不可变门面实例；外部必须通过 create/register/ensure 创建或窄化 Host。 */
  private constructor(state: AiAgentHostState) {
    this.state = state
  }

  /** 静态工厂：创建 Host 实例 */
  public static create(options: CreateAiAgentHostOptions): AiAgentHost {
    return new AiAgentHost(createAiAgentHostState(options))
  }

  /**
   * 注册一个业务。
   *
   * 流程：规范化别名 → 查重（重复抛错）→ 写入 registry + 双向映射 → 返回新实例。
   * 返回类型窄化后的新 Host 实例，旧实例不受影响。
   */
  public register<K extends string, TInput extends JsonParams>(
    alias: K,
    registration: AiAgentRegistration<TInput>,
  ): AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>> {
    const normalizedAlias = normalizeAlias(alias)
    if (this.state.aliasToModuleId.has(normalizedAlias)) {
      throw new Error(`Duplicate AI host run alias: ${normalizedAlias}`)
    }
    this.state.registry.register(registration)
    this.state.aliasToModuleId.set(normalizedAlias, registration.moduleId)
    this.state.moduleIdToAlias.set(registration.moduleId, normalizedAlias)

    return new AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>>(this.state)
  }

  /**
   * 幂等注册（确保存在）。
   *
   * 三种情况：
   *   1. alias 已绑定到相同 moduleId → 跳过（幂等）
   *   2. alias 已绑定到不同 moduleId → 抛错
   *   3. alias 不存在 → 调用 command.create() 创建并注册
   */
  public ensure<K extends string, TInput extends JsonParams>(
    alias: K,
    command: AiAgentHostEnsureCommand<TInput>,
  ): AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>> {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = normalizeRequiredText(command.moduleId, 'moduleId')
    const existingModuleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (existingModuleId !== undefined) {
      if (existingModuleId !== moduleId) {
        throw new Error(`AI host run alias "${normalizedAlias}" is already bound to moduleId "${existingModuleId}", not "${moduleId}".`)
      }
      return new AiAgentHost<TEntries & Record<K, AiAgentRegistration<TInput>>>(this.state)
    }

    const existingAlias = this.state.moduleIdToAlias.get(moduleId)
    if (existingAlias !== undefined) {
      throw new Error(`AI host business moduleId "${moduleId}" is already bound to alias "${existingAlias}".`)
    }
    if (this.state.registry.get(moduleId) !== undefined) {
      throw new Error(`AI host business moduleId "${moduleId}" is already registered without alias "${normalizedAlias}".`)
    }

    const registration = command.create()
    if (registration.moduleId !== moduleId) {
      throw new Error(`AI agent ensure moduleId mismatch: expected "${moduleId}", got "${registration.moduleId}".`)
    }
    return this.register(alias, registration)
  }

  /** 检查别名是否已注册 */
  public has(alias: string): boolean {
    return this.state.aliasToModuleId.has(normalizeAlias(alias))
  }

  /** 列出 Host 当前暴露的业务入口，用于启动日志、控制台和接入自检。 */
  public listRegistrations(): readonly AiAgentHostRegistrationSummary[] {
    const summaries: AiAgentHostRegistrationSummary[] = []
    for (const [alias, moduleId] of this.state.aliasToModuleId.entries()) {
      const registration = this.state.registry.get(moduleId)
      if (registration === undefined) continue
      summaries.push(summarizeRegistration(alias, registration))
    }
    return summaries
  }

  /** 查看单个 alias 的注册详情和 runtime.inspect() 结果。 */
  public describe(alias: string): AiAgentHostRegistrationDescription | undefined {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (moduleId === undefined) return undefined
    const registration = this.state.registry.get(moduleId)
    if (registration === undefined) return undefined
    const inspectReport = registration.runtime.inspect()
    return {
      ...summarizeRegistration(normalizedAlias, registration, inspectReport),
      inspectReport,
    }
  }

  /** 列出已注册业务的会话记录。传 alias 时只返回该业务，不传则聚合当前 Host 所有业务。 */
  public listSessions(alias?: string): readonly AiAgentSessionRecord[] {
    if (alias !== undefined) {
      return this.requireRegistration(alias).sessionStore.listSessions()
    }

    const sessions: AiAgentSessionRecord[] = []
    for (const moduleId of this.state.moduleIdToAlias.keys()) {
      const registration = this.state.registry.get(moduleId)
      if (registration === undefined) continue
      sessions.push(...registration.sessionStore.listSessions())
    }
    return sessions.sort(compareSessionsByStartedAt)
  }

  /** 删除一个 alias 及其绑定的业务注册项，主要用于测试、热更新和调试面板。 */
  public unregister(alias: string): AiAgentHost {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (moduleId === undefined) return new AiAgentHost(this.state)
    this.state.aliasToModuleId.delete(normalizedAlias)
    this.state.moduleIdToAlias.delete(moduleId)
    this.state.registry.delete(moduleId)
    return new AiAgentHost(this.state)
  }

  /** 只验证注册、输入契约、scope、orchestration 和工具清单，不调用 LLM。 */
  public dryRun(alias: string, args: unknown): AiAgentHostDryRunResult {
    try {
      const normalizedAlias = normalizeAlias(alias)
      const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
      if (moduleId === undefined) {
        throw new Error(`AI host run alias is not registered: ${normalizedAlias}`)
      }
      const registration = this.state.registry.get(moduleId)
      if (registration === undefined) {
        throw new Error(`AI host business moduleId is not registered: ${moduleId}`)
      }
      const task = createAiAgentTask(this.state.registry, moduleId, args)
      const inspectReport = registration.runtime.inspect()
      return {
        ok: true,
        alias: normalizedAlias,
        moduleId,
        normalizedInput: task.normalizedInput,
        scope: task.scope,
        orchestration: task.orchestration,
        orchestrationSummary: summarizeOrchestration(task.orchestration),
        tools: registration.runtime.getTools().map((tool) => tool.function.name),
        inspectReport,
        diagnostics: diagnosticsFromInspectReport(inspectReport),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        alias,
        error: {
          message,
        },
        diagnostics: [{
          level: 'error',
          code: 'DRY_RUN_FAILED',
          message,
        }],
      }
    }
  }

  /**
   * 运行一个已注册业务。
   *
   * 这是外部系统触发 AI 能力的主入口。
   * 流程：解析 alias → 查找 moduleId → 委托 runAiAgent() 执行完整的
   * "创建 task → 启动 session → 发送首轮消息" 流程。
   */
  /** 按已知 alias 运行注册业务，并使用该 alias 推断输入类型。 */
  public async run<K extends keyof TEntries & string>(
    alias: K,
    args: AiAgentHostRegistrationInput<TEntries[K]>,
    chat?: AiAgentTaskChatOptions,
  ): Promise<AiAgentHostRunResult>
  /** 按动态 alias 运行注册业务。 */
  public async run<TInput extends JsonParams = JsonParams>(
    alias: string,
    args: TInput,
    chat?: AiAgentTaskChatOptions,
  ): Promise<AiAgentHostRunResult>
  public async run(
    alias: string,
    args: JsonParams,
    chat?: AiAgentTaskChatOptions,
  ): Promise<AiAgentHostRunResult> {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (moduleId === undefined) {
      throw new Error(`AI host run alias is not registered: ${normalizedAlias}`)
    }
    return runAiAgent({
      options: this.createRunOptions(),
      kindID: moduleId,
      input: args,
      ...(chat === undefined ? {} : { chat }),
    })
  }

  /** 从当前 Host 状态构造 AiAgentOptions（注入 registry + turnCallbacks） */
  private createRunOptions(): AiAgentOptions {
    const options: AiAgentOptions = {
      registry: this.state.registry,
      turnCallbacks: this.state.turnCallbacks,
    }
    if (this.state.maxToolRounds !== undefined) {
      return { ...options, maxToolRounds: this.state.maxToolRounds }
    }
    return options
  }

  private requireRegistration(alias: string): AiAgentRegistration {
    const normalizedAlias = normalizeAlias(alias)
    const moduleId = this.state.aliasToModuleId.get(normalizedAlias)
    if (moduleId === undefined) {
      throw new Error(`AI host run alias is not registered: ${normalizedAlias}`)
    }
    const registration = this.state.registry.get(moduleId)
    if (registration === undefined) {
      throw new Error(`AI host business moduleId is not registered: ${moduleId}`)
    }
    return registration
  }

}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 工厂函数与 Capability 定义
// ═══════════════════════════════════════════════════════════════

/** AI Host 的 capability 标记常量 */
export const AI_AGENT_HOST = defineCapability<AiAgentHost>('spark:capability:ai-agent-host', isAiAgentHost)

/** 便捷工厂：创建 AiAgentHost 实例 */
export function createAiAgentHost(options: CreateAiAgentHostOptions): AiAgentHost {
  return AiAgentHost.create(options)
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 内部辅助函数 — 状态创建、类型守卫、字符串规范化
// ═══════════════════════════════════════════════════════════════

/** 从 CreateAiAgentHostOptions 构造内部状态对象 */
function createAiAgentHostState(options: CreateAiAgentHostOptions): AiAgentHostState {
  const state: AiAgentHostState = {
    registry: new AiAgentRegistry(),
    aliasToModuleId: new Map<string, string>(),
    moduleIdToAlias: new Map<string, string>(),
    turnCallbacks: options.turnCallbacks,
  }
  if (options.maxToolRounds !== undefined) {
    return { ...state, maxToolRounds: options.maxToolRounds }
  }
  return state
}

function summarizeRegistration(
  alias: string,
  registration: AiAgentRegistration,
  report = registration.runtime.inspect(),
): AiAgentHostRegistrationSummary {
  return {
    alias,
    moduleId: registration.moduleId,
    name: registration.name,
    description: registration.description,
    rootKinds: report.rootKinds,
    moduleCount: report.moduleCount,
    status: report.status,
  }
}

function summarizeOrchestration(orchestration: AiAgentOrchestrationPlan): AiAgentHostOrchestrationSummary {
  return {
    ...(orchestration.title === undefined ? {} : { title: orchestration.title }),
    userMessageLength: orchestration.userMessage.length,
    systemPromptLength: orchestration.systemPrompt.length,
    readonlyStepCount: orchestration.readonlySteps?.length ?? 0,
  }
}

function diagnosticsFromInspectReport(report: AiAgentToolRuntimeInspectReport): readonly AiAgentHostDryRunDiagnostic[] {
  if (report.findings.length > 0) {
    return report.findings.map((finding) => ({
      level: finding.level,
      code: finding.code,
      message: finding.message,
      ...(finding.fix === undefined ? {} : { fix: finding.fix }),
    }))
  }
  return [{
    level: 'info',
    code: 'RUNTIME_INSPECT_OK',
    message: `ClassModel runtime inspect passed: moduleCount=${report.moduleCount}; rootKinds=[${report.rootKinds.join(', ')}]`,
  }]
}

function compareSessionsByStartedAt(left: AiAgentSessionRecord, right: AiAgentSessionRecord): number {
  return left.startedAt - right.startedAt
}

/** 类型守卫：判断一个值是否为 AiAgentHost 实例（通过 duck typing 检测核心方法） */
function isAiAgentHost(value: unknown): value is AiAgentHost {
  if (!isRecord(value)) return false
  return isCallable(value['register'])
    && isCallable(value['ensure'])
    && isCallable(value['has'])
    && isCallable(value['dryRun'])
    && isCallable(value['run'])
    && isCallable(value['listSessions'])
}

/** 规范化别名：trim + 禁止首尾空白 */
function normalizeAlias(value: string): string {
  const normalized = normalizeRequiredText(value, 'alias')
  if (normalized !== value) {
    throw new Error('AI host alias must not include surrounding whitespace.')
  }
  return normalized
}

/** 规范化必填文本字段：非空字符串 + 去空白 */
function normalizeRequiredText(value: string, fieldName: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`AI host ${fieldName} must not be empty.`)
  }
  return trimmed
}
