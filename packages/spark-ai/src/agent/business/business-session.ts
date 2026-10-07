/**
 * @module @spark-appworks/spark-ai:agent/business/business-session
 * 职责：编排一次业务会话的生命周期，把 registration、task、sessionStore、transport 回调和 tool loop 串成可运行 session。
 * 边界：负责 session 层启动、消息发送和状态保存，不定义业务输入契约，也不实现具体工具 schema。
 * AI用途：排查用户消息进入工具循环、会话记录落库或 turn 回调触发顺序时，优先从本模块建立调用链。
 */

import type { JsonParams } from '@spark-appworks/spark-json-document'
import { AiAgentToolLoopRunner } from '../tool-loop/tool-loop-runner'
import {
  createAiAgentScopeFromTarget,
  createAiAgentSessionIdFromTarget,
  latestUserInput,
  normalizeAiAgentTarget,
  toAiAgentRuntimeScope,
} from './business-scope'
import type { AiAgentChatRequest, AiAgentTurnMeta } from '../conversation/chat/chat-types'
import type { AiAgentSessionRecord, AiAgentStartSessionResult } from '../conversation/session/session-types'
import {
  createAiAgentTask,
  type AiAgentTask,
  type AiAgentTaskChatOptions,
} from './business-task'
import type { AiAgentOptions } from './host/host-options'
import type { AiAgentLifecycleDirective } from './lifecycle-types'
import type { AiAgentRegistration } from './registration-types'
import type {
  AiAgentRuntimeContext,
  AiAgentScope,
  AiAgentTarget,
} from './scope-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 内部类型
// ═══════════════════════════════════════════════════════════════

/** 消息发送的输入参数 */
type AiAgentSendInput = Readonly<{
  request: AiAgentChatRequest
  turn: AiAgentTurnMeta
  scope: AiAgentScope
}>

/** Ai Agent Run Command 的命令参数。 */
export type AiAgentRunCommand<TInput extends JsonParams = JsonParams> = Readonly<{
  /** Host 配置（含 registry、turnCallbacks、maxToolRounds），用于创建 session 和 tool-loop。 */
  options: AiAgentOptions<TInput>
  /** 业务注册 kindID，runAiAgent 据此从 registry 查找 AiAgentRegistration。 */
  kindID: string
  /** 业务输入，经 inputContract.normalize 归一化后生成 task。 */
  input: TInput
  /** 可选的额外对话选项（如额外 systemPrompt），与 task.toChatRequest 合并后传入 send。 */
  chat?: AiAgentTaskChatOptions
}>

/** Ai Agent Run Result 的返回结果。 */
export type AiAgentRunResult<TInput extends JsonParams = JsonParams> = Readonly<{
  /** 已构造的 task，含归一化输入、scope、编排计划和 toChatRequest 方法。 */
  task: AiAgentTask<TInput>
  /** 已启动并完成首轮 send 的业务会话，可用于后续 send/stop/getSessionRecord。 */
  session: AiAgentSession
}>

/** 选中的业务（registration + scope 对） */
class SelectedAiAgentBusiness {
  public constructor(
    public readonly registration: AiAgentRegistration,
    public readonly scope: AiAgentScope,
  ) {}
}

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 消息发送状态管理
// ═══════════════════════════════════════════════════════════════

/**
 * 消息发送状态。
 * 缓存当前选中的业务，避免每次 send 都重新查找 registration。
 * 场景切换时（scope 变化）自动清除缓存并重新选择。
 */
class AiAgentMessageSendState {
  private selectedBusiness: SelectedAiAgentBusiness | null = null

  public get selected(): SelectedAiAgentBusiness | null {
    return this.selectedBusiness
  }

  /** 清除选中状态（业务切换时调用） */
  public clearSelected = (): void => {
    this.selectedBusiness = null
  }

  /** 设置选中业务 */
  public setSelected(registration: AiAgentRegistration, scope: AiAgentScope): void {
    this.selectedBusiness = new SelectedAiAgentBusiness(registration, scope)
  }

  /** 向当前选中业务的 sessionStore 追加用户消息 */
  public appendUserMessage(scope: AiAgentRuntimeContext, content: string): void {
    this.selectedBusiness?.registration.sessionStore.appendMessage({
      ...scope,
      role: 'user',
      content,
      source: 'ui',
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 辅助函数
// ═══════════════════════════════════════════════════════════════

/** 判定两个 scope 是否指向同一个业务实例 */
function isSameScope(left: AiAgentScope, right: AiAgentScope): boolean {
  return left.businessRegistrationId === right.businessRegistrationId
    && left.businessInstanceId === right.businessInstanceId
    && left.instanceId === right.instanceId
}

/** 规范化 turn 元数据：生成 turnId、记录时间戳 */
function normalizeTurn(request: AiAgentChatRequest): AiAgentTurnMeta {
  const now = new Date().toISOString()
  return {
    turnId: globalThis.crypto.randomUUID(),
    seq: 1,
    baseRevision: Math.max(0, request.historyMsgs.length - 1),
    queuedAt: now,
    startedAt: now,
    maxParallelTurns: 1,
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 消息发送编排
// ═══════════════════════════════════════════════════════════════

/**
 * 消息发送编排器。
 * 负责：解析 scope → 查找 registration → 提取用户消息 → 启动工具循环。
 */
class AiAgentMessageSender {
  private readonly toolLoopRunner: AiAgentToolLoopRunner

  public constructor(private readonly options: AiAgentOptions) {
    this.toolLoopRunner = new AiAgentToolLoopRunner(options.turnCallbacks, options.maxToolRounds)
  }

  /** 发送消息的主入口 */
  public async send(input: AiAgentSendInput, state: AiAgentMessageSendState): Promise<void> {
    const { request, turn, scope } = input
    const selected = await this.resolveSelectedBusiness(scope, state)
    state.setSelected(selected.registration, selected.scope)

    // 提取最新用户消息并写入 sessionStore
    const latestUser = latestUserInput(request)
    if (latestUser !== '') {
      state.appendUserMessage(toAiAgentRuntimeScope(selected.scope), latestUser)
    }

    // 启动工具循环（AI 推理 + 工具调用 + 生命周期判断）
    await this.toolLoopRunner.runToolLoop({
      registration: selected.registration,
      scope: selected.scope,
      request,
      turn,
      clearSelected: state.clearSelected,
    })
  }

  /**
   * 解析选中的业务。
   * 若当前缓存的 scope 匹配 → 复用；
   * 否则清除缓存 → 从 registry 重新查找 → 启动注册会话。
   */
  private async resolveSelectedBusiness(
    scope: AiAgentScope,
    state: AiAgentMessageSendState,
  ): Promise<SelectedAiAgentBusiness> {
    if (state.selected !== null && isSameScope(state.selected.scope, scope)) {
      return state.selected
    }
    state.clearSelected()
    const registration = this.options.registry.get(scope.businessRegistrationId)
    if (registration === undefined) {
      throw new Error(`AI business registration is not registered: ${scope.businessRegistrationId}`)
    }
    await startAiAgentRegistrationSession(registration, toAiAgentRuntimeScope(scope))
    return new SelectedAiAgentBusiness(registration, scope)
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 业务会话
// ═══════════════════════════════════════════════════════════════

/**
 * 业务会话。
 *
 * 业务层推荐通过 AiAgent.run[alias](input) 进入；本类承载 Host 内部 session 状态。
 *
 * 属性：
 *   target     — 业务定位
 *   scope      — 业务作用域
 *   sessionId  — 后端会话 ID（kind + 顶层实例 ID）
 */
// AI_AGENT_TRACE[host-session-entry]: 实时业务会话经 AiAgent.run 进入 AI Host。
// AI_AGENT_REFACTOR_SOURCE[host-session-entry]: sessionId 来自业务 kind + 实例 id；turn 隔离继续在 send/transport 层传递。
export class AiAgentSession {
    /** 目标对象。 */
public readonly target: AiAgentTarget
    /** 业务作用域。 */
public readonly scope: AiAgentScope
    /** session Id 标识。 */
public readonly sessionId: string

  private readonly senderCore: AiAgentMessageSender
  private readonly state = new AiAgentMessageSendState()

    /** 创建 Ai Agent Session 实例。 */
public constructor(
    private readonly options: AiAgentOptions,
    targetInput: AiAgentTarget,
  ) {
    this.target = normalizeAiAgentTarget(targetInput)
    this.scope = createAiAgentScopeFromTarget(this.target)
    this.sessionId = createAiAgentSessionIdFromTarget(this.target)
    this.senderCore = new AiAgentMessageSender(options)
  }

  /** 启动会话：创建/接入 sessionStore 记录 + 生成工具规约 */
  public async start(): Promise<void> {
    if (this.state.selected !== null && isSameScope(this.state.selected.scope, this.scope)) return
    const registration = this.resolveRegistration()
    await startAiAgentRegistrationSession(registration, toAiAgentRuntimeScope(this.scope))
    this.state.setSelected(registration, this.scope)
  }

  /** 获取当前会话记录：Agent 能力诊断和再次接入会话的读取起点 */
  public getSessionRecord(): AiAgentSessionRecord | null {
    const registration = this.state.selected?.registration
      ?? this.options.registry.get(this.scope.businessRegistrationId)
    return registration?.sessionStore.getSession(toAiAgentRuntimeScope(this.scope)) ?? null
  }

  /** 停止当前业务会话：标记 sessionStore，并触发业务结束回调。 */
  public async stop(reason = 'manual-stop'): Promise<AiAgentSessionRecord | null> {
    const registration = this.state.selected?.registration ?? this.resolveRegistration()
    const runtimeContext = toAiAgentRuntimeScope(this.scope)
    const stopped = registration.sessionStore.stopSession(runtimeContext, reason)
    if (stopped !== null) {
      const directive: AiAgentLifecycleDirective = { status: 'abort', reason }
      await registration.onEndBusinessInstance?.(runtimeContext, directive)
    }
    this.state.clearSelected()
    return stopped
  }

  /** 发送消息：提取用户输入 → AI 推理 → 工具调用 */
  public async send(request: AiAgentChatRequest): Promise<void> {
    await this.senderCore.send({
      request,
      turn: request.turn ?? normalizeTurn(request),
      scope: this.scope,
    }, this.state)
  }

  /** 从 registry 查找当前 scope 对应的 registration */
  private resolveRegistration(): AiAgentRegistration {
    const registration = this.options.registry.get(this.scope.businessRegistrationId)
    if (registration === undefined) {
      throw new Error(`AI business registration is not registered: ${this.scope.businessRegistrationId}`)
    }
    return registration
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 6 节 · 工厂函数与会话启动
// ═══════════════════════════════════════════════════════════════

/** 工厂函数：创建业务会话 */
export function createAiAgentSession(
  options: AiAgentOptions,
  targetInput: AiAgentTarget,
): AiAgentSession {
  return new AiAgentSession(options, targetInput)
}

/**
 * 一站式运行已注册业务。
 *
 * 用于 AiAgent 门面按 alias 解析出 kindID 后，创建 task、启动 session 并发送首轮请求。
 */
export async function runAiAgent<TInput extends JsonParams = JsonParams>(
  command: AiAgentRunCommand<TInput>,
): Promise<AiAgentRunResult<TInput>> {
  const task = createAiAgentTask(command.options.registry, command.kindID, command.input)
  const session = createAiAgentSession(command.options, task.target)
  await session.start()
  await session.send(task.toChatRequest(command.chat))
  return { task, session }
}

/**
 * 启动注册会话。
 *
 * 执行步骤：
 * 1. 调用 registration.onStartSession() 生命周期回调
 * 2. 调用 sessionStore.startSession() 创建会话记录
 * 3. 直接使用 ClassModel 固定协议工具规约
 * 4. 返回 AiAgentStartSessionResult（含 session + tools）
 */
// AI_AGENT_TRACE[agent-session-start]: startAiAgentRegistrationSession 负责调用业务 onStartSession，并投影固定 module 工具。
// AI_AGENT_REFACTOR_SOURCE[tool-schema-projection]: runtime 是 LLM function schema 的来源；业务壳层不要手写工具 schema。
export async function startAiAgentRegistrationSession<TInput extends JsonParams>(
  registration: AiAgentRegistration<TInput>,
  context: AiAgentRuntimeContext,
): Promise<AiAgentStartSessionResult> {
  const sessionStore = registration.sessionStore
  await registration.onStartSession?.(context)
  const session = sessionStore.startSession(context)
  const tools = registration.runtime.getTools()
  return {
    status: 'Started',
    instanceId: context.instanceId,
    moduleId: context.moduleId,
    moduleInstanceId: context.moduleInstanceId,
    session,
    tools,
  }
}
