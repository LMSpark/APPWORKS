/**
 * @module @spark-appworks/spark-ai:agent/business/class-model-agent-adapter
 * 职责：把业务 class、DTS ClassModel bundle 和知识服务适配为 Agent 可注册的 ClassModel 7-tool runtime。
 * 边界：只做 ClassModel 业务注册适配，不恢复旧动态模块路径路由，也不绕过统一工具闭集直接调用函数。
 * AI用途：新增或排查 ClassModel 驱动的业务 Agent 时，用本模块确认 metadata、runtime 和 registration 的接线方式。
 */

import { coerceJsonValue, type JsonParams, type JsonSchemaObject, type JsonValue } from '@spark-appworks/spark-json-document'
import {
  auditClassModelReflectionConnectivity,
  collectClassModelFailureModeRecoveryHints,
  createDtsBundleClassModelKnowledgeProvider,
  createClassModelDocumentFromRuntimeApiMetadata,
  listAttributeReachableKinds,
  resolveRuntimeApiMetadataJson,
  validateApiObjectMetadata,
  ClassModelRuntime,
  CLASS_MODEL_TOOL_NAMES,
  type AiRuntimeApiMetadataJson,
  type ClassModelDocument,
  type ClassModelReflectionConnectivityIssue,
  type ClassModelKnowledgeProvider,
  type ClassModelToolCheck,
  type ClassModelToolResult,
  type ClassModelToolSpec,
} from '../../class-model'
import {
  executeDtsNativeScript,
  executeAiNativeScript,
} from '../native-runtime'
import { DefaultAiAgentSessionStore } from '../session/default-session-store'
import type { AiAgentSessionStore } from '../session/session-types'
import {
  AiAgentToolCheck,
  AiAgentToolResult,
  type AiAgentRuntimeHostContext,
  type AiAgentToolRuntime,
  type AiAgentToolRuntimeInspectReport,
  type AiAgentToolRuntimeKnowledgeProjection,
  type AiAgentToolSpec,
} from '../tool-runtime'
import type {
  AiAgentAfterFunctionCallOptions,
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentLifecycleDirective,
} from './lifecycle-types'
import type { AiAgentHost } from './ai-host'
import type { AiAgentInputContract } from './business-task'
import {
  AiAgentRegistration,
  type AiAgentRegistrationOptions,
  type AiAgentToolLoopNudgeContext,
} from './registration-types'
import type { EnrichFunctionCallFailureCommand } from '../tool-loop/function-call-recovery-enricher'
import { AiAgentRuntimeContext } from './scope-types'

/** Class Model Agent Adapter Constructor 的语义模型。 */
type ClassModelAgentAdapterConstructor<T> = new (...args: never[]) => T

/** agent_complete 调用领域完成方法时的输入。 */
export type ClassModelAgentCompleteActionOptions = AiAgentRuntimeContext & Readonly<{
  /** LLM 传入的任务完成摘要，来自 agent_complete({ summary }) 并经 trim 校验。 */
  summary: string
  /** agent_complete 原始工具参数，含 summary 及后续 schema 扩展字段。 */
  args: JsonParams
}>

/**
 * agent_complete 领域完成方法可返回的结构化检查项。
 *
 * 字段：
 *   level   — 严重级别：error / warn / info
 *   code    — 机器可读检查码
 *   message — 人可读说明
 *   hint    — 可选修复提示
 */
export type ClassModelAgentCompleteCheck = Readonly<{
  /** 检查严重级别：error 阻断完成，warn/info 仅提示。 */
  level: 'error' | 'warn' | 'info'
  /** 机器可读检查码，写入 tool result checks 供 LLM 定位问题。 */
  code: string
  /** 人可读检查说明，描述未完成项或风险提示。 */
  message: string
  /** 可选修复提示，引导 LLM 补查知识或补执行 model_script。 */
  hint?: string
}>

/**
 * agent_complete 领域完成方法通过时的返回形态。
 *
 * 字段：
 *   ok                    — 固定 true，表示领域模型接受完成
 *   completed             — 可选，显式标记业务目标已达成
 *   summary               — 可选，覆盖 LLM 传入的完成摘要
 *   finalAssistantMessage — 可选，发送给用户的最终助手消息
 *   data                  — 可选，附加业务数据写入 tool result
 *   checks                — 可选，附带 info/warn 级检查项
 */
export type ClassModelAgentCompleteAccepted = Readonly<{
  /** 固定 true，表示领域模型接受 agent_complete 请求。 */
  ok: true
  /** 显式标记业务目标已达成；省略时由 normalize 逻辑默认为 completed。 */
  completed?: boolean
  /** 完成摘要，写入 tool result 的 summary 字段；省略时使用 LLM 传入的 summary。 */
  summary?: string
  /** 发送给用户的最终助手消息，替代 LLM 当前轮次的输出。 */
  finalAssistantMessage?: string
  /** 附加业务数据，合并进 agent_complete 成功 tool result。 */
  data?: JsonValue
  /** 附带 info/warn 级检查项，不回灌失败但供 LLM 阅读。 */
  checks?: readonly ClassModelAgentCompleteCheck[]
}>

/**
 * agent_complete 领域完成方法拒绝完成时的返回形态。
 *
 * 字段：
 *   ok                   — 固定 false
 *   code / msg / message — 失败码与说明（msg 与 message 二选一）
 *   fix                  — 给 LLM 的修正建议
 *   checks               — 结构化检查项
 *   requiredCapabilities — 需补齐的业务能力，runtime 会翻译为知识恢复路径
 *   missingFacts         — 当前缺失的业务事实
 *   nextStep             — 建议的下一步操作
 */
export type ClassModelAgentCompleteRejected = Readonly<{
  /** 固定 false，表示领域模型拒绝 agent_complete 请求。 */
  ok: false
  /** 机器可读拒绝码，默认 AGENT_COMPLETE_REJECTED。 */
  code?: string
  /** 拒绝原因（短消息），写入 tool result 的 msg 字段。 */
  msg?: string
  /** 拒绝原因（长说明），与 msg 二选一，normalize 时优先 msg。 */
  message?: string
  /** 给 LLM 的修正建议，写入 tool result 的 fix 字段。 */
  fix?: string
  /** 结构化检查项，合并进失败 tool result 的 checks。 */
  checks?: readonly ClassModelAgentCompleteCheck[]
  /** 领域模型需要的业务能力名；AI runtime 会用 ClassModel 知识体系翻译成 guide/script 恢复路径。 */
  requiredCapabilities?: readonly string[]
  /** 当前缺失的业务事实列表，供 LLM 补查或补执行。 */
  missingFacts?: readonly string[]
  /** 建议的下一步操作，缺省时 fix 字段会回退使用此值。 */
  nextStep?: string
}>

/** agent_complete 领域完成方法的返回结果。 */
export type ClassModelAgentCompleteActionResult =
  | AiAgentToolResult<JsonValue>
  | ClassModelAgentCompleteAccepted
  | ClassModelAgentCompleteRejected
  | JsonValue

/** Class Model Agent Adapter Register Command 的命令参数。 */
export type ClassModelAgentAdapterRegisterCommand<T> = Readonly<{
  /** 目标 Agent Host，registration 将注册到其 alias 路由表。 */
  host: AiAgentHost
  /** Host 内的业务别名，供 createSession / chat 路由到该 ClassModel Agent。 */
  alias: string
  /** 业务根模型构造函数，用于实例化或 resolveInstance 缺省构造。 */
  moduleClass: ClassModelAgentAdapterConstructor<T>
  /** 可选 AiRuntimeApiMetadataJson；提供时走 metadata-native 路径，否则走 DTS manifest 路径。 */
  metadata?: AiRuntimeApiMetadataJson
  /** ClassModel Agent 注册选项，含生命周期钩子、知识源和 agent_complete 配置。 */
  options: ClassModelAgentAdapterRegisterOptions<T>
}>

/** Class Model Agent Adapter Registration Command 的命令参数。 */
export type ClassModelAgentAdapterRegistrationCommand<T> = Readonly<{
  /** 业务根模型构造函数，用于实例化或 resolveInstance 缺省构造。 */
  moduleClass: ClassModelAgentAdapterConstructor<T>
  /** 可选 AiRuntimeApiMetadataJson；提供时走 metadata-native 路径，否则走 DTS manifest 路径。 */
  metadata?: AiRuntimeApiMetadataJson
  /** ClassModel Agent 注册选项，含生命周期钩子、知识源和 agent_complete 配置。 */
  options: ClassModelAgentAdapterRegisterOptions<T>
}>

/** Class Model Agent Adapter Register Options 的调用配置。 */
export type ClassModelAgentAdapterRegisterOptions<T> = Readonly<{
  /** 业务模块唯一标识；省略时使用 metadata.rootApi.kind 或 rootClassName。 */
  moduleId?: string
  /** 预构造的业务根实例；与 resolveInstance 二选一，resolveInstance 优先。 */
  instance?: T
  /** moduleClass 构造函数参数；instance 与 resolveInstance 均未提供时用于 Reflect.construct。 */
  constructArgs?: readonly unknown[]
  /** 按运行时上下文动态解析业务实例；用于多 tenant / 多 session 实例隔离。 */
  resolveInstance?: (context: AiAgentRuntimeContext) => T
  /** metadata 文档级 $defs；运行时 paramsSchema $ref 由 AJV 2020 解析。 */
  jsonSchemaDefs?: Readonly<Record<string, JsonSchemaObject>>
  /** DTS-native 模式的 manifest URL；无 metadata 时必填，供 executeDtsNativeScript 加载契约。 */
  dtsClassModelManifestUrl?: string
  /** 自定义 manifest JSON 拉取函数；省略时使用默认 fetch。 */
  dtsClassModelFetchJson?: (url: string) => Promise<unknown>
  /** 根模型 className/kind；无 metadata 时用于 DTS 路径和 promptSnapshot。 */
  rootClassName?: string
  /** 自定义 ClassModel 知识提供者；省略且无 document 时自动创建 DTS bundle provider。 */
  knowledge?: ClassModelKnowledgeProvider
  /** 注册化输入契约，校验新任务入口参数并生成 LLM 编排规则。 */
  inputContract?: AiAgentInputContract
  /** 会话历史持久化存储；省略时使用 DefaultAiAgentSessionStore（内存）。 */
  sessionStore?: AiAgentSessionStore
  /** 动态系统提示生成器；每次会话轮次开始前调用，返回值拼接到 LLM 系统消息末尾。 */
  systemPrompt?: (instance: T, context: AiAgentRuntimeContext) => string | undefined
  /** 工具调用前置处理器；reject/abort 不会执行 ClassModel runtime 工具。 */
  beforeFunctionCall?: (
    instance: T,
    options: AiAgentBeforeFunctionCallOptions,
  ) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
  /** 工具调用后置处理器；返回 continue/complete/abort 决定工具循环后续行为。 */
  afterFunctionCall?: (
    instance: T,
    options: AiAgentAfterFunctionCallOptions,
  ) => AiAgentLifecycleDirective | Promise<AiAgentLifecycleDirective>
  /** agent_complete 对应的领域模型方法名；配置后必须在业务实例上实现。 */
  agentCompleteMethodName?: string
  /** agent_complete 的自定义领域动作；优先级高于 agentCompleteMethodName。 */
  agentCompleteAction?: (
    instance: T,
    options: ClassModelAgentCompleteActionOptions,
  ) => ClassModelAgentCompleteActionResult | Promise<ClassModelAgentCompleteActionResult>
  /** 会话启动回调；createSession 时调用一次，可初始化业务实例状态。 */
  onStartSession?: (instance: T, context: AiAgentRuntimeContext) => void | Promise<void>
  /** 业务实例结束回调；endInstance 时调用，directive 携带 complete/abort 指令。 */
  onEndBusinessInstance?: (
    instance: T,
    context: AiAgentRuntimeContext,
    directive: AiAgentLifecycleDirective,
  ) => void | Promise<void>
  /** 模块实例释放回调；清理外部资源（WebSocket、临时文件等）。 */
  releaseModuleInstance?: (instance: T, moduleInstanceId: string) => void
  /** tool-loop 回合纠偏；业务 SOP 由 app 层注入，内核只保留协议级 nudge。 */
  toolLoopNudge?: (context: AiAgentToolLoopNudgeContext) => string | undefined
  /** 视为“已进入执行阶段”的工具名集合；默认仅 model_script。 */
  executionToolNames?: ReadonlySet<string>
  /** 扩展 plan-without-tool 检测关键词（小写匹配 LLM 输出文本）。 */
  planWithoutToolMarkers?: readonly string[]
  /** FC 失败恢复：在 ClassModel 默认 hints 之外补充业务域 RECOVERY_HINT。 */
  enrichRecoveryHints?: (command: EnrichFunctionCallFailureCommand) => readonly string[]
}>

/** Class Model Agent Adapter 的语义模型。 */
export class ClassModelAgentAdapter {
    /** 执行 register 操作。 */
public static register<T>(command: ClassModelAgentAdapterRegisterCommand<T>): AiAgentHost {
    const registration = ClassModelAgentAdapter.createRegistration({
      moduleClass: command.moduleClass,
      ...(command.metadata === undefined ? {} : { metadata: command.metadata }),
      options: command.options,
    })
    return command.host.register(command.alias, registration)
  }

    /** 创建 Registration。 */
public static createRegistration<T>(
    command: ClassModelAgentAdapterRegistrationCommand<T>,
  ): AiAgentRegistration {
    const metadata = command.metadata === undefined
      ? undefined
      : resolveRuntimeApiMetadataJson(command.metadata)
    if (metadata !== undefined) validateApiObjectMetadata(metadata.rootApi)
    const rootClassName = metadata?.rootApi.kind ?? command.options.rootClassName ?? command.moduleClass.name

    const instance = command.options.resolveInstance === undefined
      ? command.options.instance ?? constructModuleInstance(command.moduleClass, command.options.constructArgs ?? [])
      : command.options.instance
    const document = metadata === undefined
      ? undefined
      : createClassModelDocumentFromRuntimeApiMetadata({
          module: metadata,
          ...(command.options.jsonSchemaDefs === undefined ? {} : { schemaDefs: command.options.jsonSchemaDefs }),
        })
    const runtime = new ClassModelAgentToolRuntime({
      ...(metadata === undefined ? {} : { metadata }),
      ...(document === undefined ? {} : { document }),
      rootClassName,
      options: command.options,
      moduleClass: command.moduleClass,
      ...(instance === undefined ? {} : { instance }),
    })

    const lifecycleOptions = command.options
    const systemPrompt = bindInstanceLifecycle(lifecycleOptions, instance, lifecycleOptions.systemPrompt)
    const beforeFunctionCall = bindInstanceLifecycle(lifecycleOptions, instance, lifecycleOptions.beforeFunctionCall)
    const afterFunctionCall = bindInstanceLifecycle(lifecycleOptions, instance, lifecycleOptions.afterFunctionCall)
    const onStartSession = bindInstanceLifecycle(lifecycleOptions, instance, lifecycleOptions.onStartSession)
    const registrationOptions: AiAgentRegistrationOptions = {
      moduleId: command.options.moduleId ?? rootClassName,
      name: metadata?.rootApi.name ?? rootClassName,
      description: metadata?.rootApi.description ?? rootClassName,
      runtime,
      sessionStore: command.options.sessionStore ?? new DefaultAiAgentSessionStore(),
      onEndBusinessInstance: async (context: AiAgentRuntimeContext, directive: AiAgentLifecycleDirective) => {
        const resolved = resolveLifecycleInstance(lifecycleOptions, instance, context)
        if (resolved !== undefined) {
          await lifecycleOptions.onEndBusinessInstance?.(resolved, context, directive)
        }
      },
      releaseModuleInstance: (moduleInstanceId: string) => {
        const resolved = resolveLifecycleInstance(
          lifecycleOptions,
          instance,
          createRuntimeContextForModuleInstance(command.options.moduleId ?? rootClassName, moduleInstanceId),
        )
        if (resolved !== undefined) {
          lifecycleOptions.releaseModuleInstance?.(resolved, moduleInstanceId)
        }
      },
      ...(command.options.inputContract === undefined ? {} : { inputContract: command.options.inputContract }),
      ...(systemPrompt === undefined ? {} : { systemPrompt }),
      ...(beforeFunctionCall === undefined ? {} : { beforeFunctionCall }),
      ...(afterFunctionCall === undefined ? {} : { afterFunctionCall }),
      ...(onStartSession === undefined ? {} : { onStartSession }),
      ...(command.options.toolLoopNudge === undefined ? {} : { toolLoopNudge: command.options.toolLoopNudge }),
      ...(command.options.executionToolNames === undefined ? {} : { executionToolNames: command.options.executionToolNames }),
      ...(command.options.planWithoutToolMarkers === undefined ? {} : { planWithoutToolMarkers: command.options.planWithoutToolMarkers }),
      enrichRecoveryHints: buildClassModelEnrichRecoveryHints(metadata, command.options.enrichRecoveryHints),
    }
    return new AiAgentRegistration(registrationOptions)
  }
}

function buildClassModelEnrichRecoveryHints(
  metadata: AiRuntimeApiMetadataJson | undefined,
  enrichRecoveryHints?: (command: EnrichFunctionCallFailureCommand) => readonly string[],
): (command: EnrichFunctionCallFailureCommand) => readonly string[] {
  return command => {
    const hints = metadata === undefined
      ? []
      : collectClassModelFailureModeRecoveryHints(metadata, {
          callResult: {
            code: command.callResult.code,
            msg: command.callResult.msg,
          },
          ...(command.moduleInstanceId === undefined ? {} : { moduleInstanceId: command.moduleInstanceId }),
        })
    return enrichRecoveryHints === undefined ? hints : [...hints, ...enrichRecoveryHints(command)]
  }
}

type ClassModelAgentToolRuntimeOptions<T> = Readonly<{
  metadata?: AiRuntimeApiMetadataJson
  document?: ClassModelDocument
  rootClassName: string
  options: ClassModelAgentAdapterRegisterOptions<T>
  instance?: T
  moduleClass: ClassModelAgentAdapterConstructor<T>
}>

class ClassModelAgentToolRuntime<T> implements AiAgentToolRuntime {
  private readonly runtime: ClassModelRuntime

  public constructor(private readonly adapterOptions: ClassModelAgentToolRuntimeOptions<T>) {
    const knowledge = resolveClassModelRuntimeKnowledge(adapterOptions)
    this.runtime = new ClassModelRuntime({
      ...(adapterOptions.document === undefined ? {} : { document: adapterOptions.document }),
      ...(knowledge === undefined ? {} : { knowledge }),
      scriptExecutor: async command => {
        const host = readRuntimeHostContext(command.host)
        const instance = this.resolveInstance(toRuntimeContext(host))
        if (adapterOptions.metadata === undefined) {
          const manifestUrl = requireDtsClassModelManifestUrl(adapterOptions)
          const result = await executeDtsNativeScript({
            instance,
            manifestUrl,
            rootClassName: adapterOptions.rootClassName,
            host,
            ...(adapterOptions.options.dtsClassModelFetchJson === undefined
              ? {}
              : { fetchJson: adapterOptions.options.dtsClassModelFetchJson }),
            script: command.script,
          })
          return toClassModelToolResult(result)
        }
        const result = await executeAiNativeScript({
          instance,
          metadata: adapterOptions.metadata,
          host,
          ...(adapterOptions.options.jsonSchemaDefs === undefined
            ? {}
            : { schemaDefs: adapterOptions.options.jsonSchemaDefs }),
          script: command.script,
        })
        return toClassModelToolResult(result)
      },
    })
  }

  public getTools(): readonly AiAgentToolSpec[] {
    return this.runtime.getTools().map(toAgentToolSpec)
  }

  public async executeTool(
    toolName: string,
    args: Readonly<Record<string, JsonValue>>,
    host: AiAgentRuntimeHostContext,
  ): Promise<AiAgentToolResult<JsonValue>> {
    if (toolName === CLASS_MODEL_TOOL_NAMES.agentComplete) {
      return await this.executeAgentComplete(args, host)
    }
    const result = await this.runtime.executeTool(toolName, args, host)
    return toAgentToolResult(result)
  }

  public projectKnowledge(): AiAgentToolRuntimeKnowledgeProjection {
    return {
      promptSnapshot: this.adapterOptions.document === undefined
        ? createDtsNativePromptSnapshot(this.adapterOptions.rootClassName)
        : createClassModelPromptSnapshot(this.adapterOptions.document),
    }
  }

  public inspect(): AiAgentToolRuntimeInspectReport {
    if (this.adapterOptions.document === undefined) {
      return {
        status: 'ok',
        rootKinds: [this.adapterOptions.rootClassName],
        moduleCount: 1,
        findings: [],
      }
    }
    const findings = auditClassModelReflectionConnectivity(this.adapterOptions.document).map((issue: ClassModelReflectionConnectivityIssue) => ({
      level: issue.code === 'REFLECTION_KIND_UNREACHABLE_VIA_ATTRIBUTES' ? 'warn' as const : 'info' as const,
      code: issue.code,
      message: issue.message,
    }))
    return {
      status: findings.some(finding => finding.level === 'warn') ? 'warning' : 'ok',
      rootKinds: [this.adapterOptions.document.rootKind],
      moduleCount: this.adapterOptions.document.module.apiRegistry === undefined
        ? 1
        : Object.keys(this.adapterOptions.document.module.apiRegistry).length + 1,
      findings,
    }
  }

  private resolveInstance(context: AiAgentRuntimeContext): T {
    if (this.adapterOptions.options.resolveInstance !== undefined) {
      return this.adapterOptions.options.resolveInstance(context)
    }
    if (this.adapterOptions.instance !== undefined) return this.adapterOptions.instance
    return constructModuleInstance(
      this.adapterOptions.moduleClass,
      this.adapterOptions.options.constructArgs ?? [],
    )
  }

  private async executeAgentComplete(
    args: Readonly<Record<string, JsonValue>>,
    host: AiAgentRuntimeHostContext,
  ): Promise<AiAgentToolResult<JsonValue>> {
    const parsed = parseAgentCompleteArgs(args)
    if (!parsed.ok) return parsed.result

    const context = toRuntimeContext(host)
    const instance = this.resolveInstance(context)
    const actionOptions: ClassModelAgentCompleteActionOptions = {
      ...context,
      summary: parsed.summary,
      args,
    }
    const action = this.adapterOptions.options.agentCompleteAction
    if (action !== undefined) {
      return normalizeAgentCompleteActionResult(
        await action(instance, actionOptions),
        parsed.summary,
        createAgentCompleteKnowledgeRecoveryContext(this.adapterOptions),
      )
    }

    const configuredMethodName = this.adapterOptions.options.agentCompleteMethodName
    const methodName = configuredMethodName ?? findDefaultAgentCompleteMethodName(instance)
    if (methodName === undefined) {
      return AiAgentToolResult.ok({
        completed: true,
        summary: parsed.summary,
      })
    }
    const method = readAgentCompleteMethod(instance, methodName)
    if (method === undefined) {
      return AiAgentToolResult.failCode(
        'AGENT_COMPLETE_METHOD_NOT_IMPLEMENTED',
        `agent_complete 对应的领域方法 "${methodName}" 未实现。`,
        '在业务模型上实现该方法，或修正 ClassModelAgentAdapter.options.agentCompleteMethodName。',
      )
    }
    const raw = await callAgentCompleteMethod({
      instance,
      method,
      context,
      args,
      summary: parsed.summary,
    })
    return normalizeAgentCompleteActionResult(
      raw,
      parsed.summary,
      createAgentCompleteKnowledgeRecoveryContext(this.adapterOptions),
    )
  }
}

type ParsedAgentCompleteArgs = Readonly<{
  ok: true
  summary: string
}> | Readonly<{
  ok: false
  result: AiAgentToolResult<JsonValue>
}>

type AgentCompleteMethod = (...args: readonly unknown[]) => unknown

type CallAgentCompleteMethodCommand<T> = Readonly<{
  instance: T
  method: AgentCompleteMethod
  context: AiAgentRuntimeContext
  args: Readonly<Record<string, JsonValue>>
  summary: string
}>

type AgentCompleteKnowledgeRecoveryContext = Readonly<{
  rootKind: string
  metadata?: AiRuntimeApiMetadataJson
}>

function parseAgentCompleteArgs(
  args: Readonly<Record<string, JsonValue>>,
): ParsedAgentCompleteArgs {
  const extra = Object.keys(args).filter(key => key !== 'summary').sort()
  if (extra.length > 0) {
    return {
      ok: false,
      result: AiAgentToolResult.failCode(
        'INVALID_CLASS_MODEL_TOOL_ARGS',
        `工具 "${CLASS_MODEL_TOOL_NAMES.agentComplete}" 不接受参数: ${extra.join(', ')}。允许参数: summary。`,
        '按 agent_complete schema 重发：agent_complete({ summary: "..." })。',
      ),
    }
  }
  const summary = args['summary']
  if (typeof summary !== 'string' || summary.trim().length === 0) {
    return {
      ok: false,
      result: AiAgentToolResult.failCode(
        'INVALID_CLASS_MODEL_TOOL_ARGS',
        '参数 "summary" 缺失或非字符串。',
        '按 agent_complete schema 重发：agent_complete({ summary: "..." })。',
      ),
    }
  }
  return { ok: true, summary: summary.trim() }
}

function findDefaultAgentCompleteMethodName(instance: unknown): string | undefined {
  for (const methodName of ['agentComplete', 'completeAgent', 'completeAiAgent']) {
    if (readAgentCompleteMethod(instance, methodName) !== undefined) return methodName
  }
  return undefined
}

function readAgentCompleteMethod(instance: unknown, methodName: string): AgentCompleteMethod | undefined {
  if (!isMethodContainer(instance)) return undefined
  const method = instance[methodName]
  return isAgentCompleteMethod(method) ? method : undefined
}

function callAgentCompleteMethod<T>(
  command: CallAgentCompleteMethodCommand<T>,
): unknown {
  if (command.method.length >= 2) {
    return Reflect.apply(command.method, command.instance, [command.context, command.args])
  }
  return Reflect.apply(command.method, command.instance, [{
    summary: command.summary,
    moduleId: command.context.moduleId,
    moduleInstanceId: command.context.moduleInstanceId,
    instanceId: command.context.instanceId,
  }])
}

function normalizeAgentCompleteActionResult(
  raw: unknown,
  fallbackSummary: string,
  knowledgeContext: AgentCompleteKnowledgeRecoveryContext,
): AiAgentToolResult<JsonValue> {
  if (raw instanceof AiAgentToolResult) {
    if (!raw.ok) return AiAgentToolResult.passthroughFailure(raw)
    return AiAgentToolResult.ok(
      normalizeAgentCompleteSuccessData(raw.data, fallbackSummary),
      raw.checks,
      raw.state,
    )
  }

  if (raw === false) {
    return rejectAgentComplete({
      code: 'AGENT_COMPLETE_REJECTED',
      message: '领域模型拒绝完成。',
      fix: '读取 agent_complete tool result，补查缺失知识或补执行 model_script 后再次 agent_complete。',
    })
  }

  if (isUnknownRecord(raw)) {
    if (raw['ok'] === false || raw['completed'] === false) {
      const checks = readAgentCompleteChecks(raw['checks'])
      const requiredCapabilities = readStringArrayRecordField(raw, 'requiredCapabilities')
      const missingFacts = readStringArrayRecordField(raw, 'missingFacts')
      const nextStep = readStringRecordField(raw, 'nextStep')
      const knowledgeLookups = collectAgentCompleteKnowledgeLookups({
        context: knowledgeContext,
        ...(requiredCapabilities === undefined ? {} : { requiredCapabilities }),
      })
      return rejectAgentComplete({
        code: readStringRecordField(raw, 'code') ?? 'AGENT_COMPLETE_REJECTED',
        message: readStringRecordField(raw, 'msg')
          ?? readStringRecordField(raw, 'message')
          ?? '领域模型拒绝完成。',
        fix: readStringRecordField(raw, 'fix')
          ?? readStringRecordField(raw, 'nextStep')
          ?? '读取 agent_complete tool result，补查缺失知识或补执行 model_script 后再次 agent_complete。',
        ...(checks === undefined ? {} : { checks }),
        ...(requiredCapabilities === undefined ? {} : { requiredCapabilities }),
        ...(missingFacts === undefined ? {} : { missingFacts }),
        ...(nextStep === undefined ? {} : { nextStep }),
        ...(knowledgeLookups.length === 0 ? {} : { knowledgeLookups }),
      })
    }
    if (raw['ok'] === true) {
      const summary = readStringRecordField(raw, 'summary')
        ?? readStringRecordField(raw, 'finalAssistantMessage')
        ?? fallbackSummary
      return AiAgentToolResult.ok(
        normalizeAgentCompleteSuccessData(raw['data'] ?? raw, summary),
        readAgentCompleteChecks(raw['checks']),
      )
    }
  }

  return AiAgentToolResult.ok(normalizeAgentCompleteSuccessData(raw, fallbackSummary))
}

function normalizeAgentCompleteSuccessData(raw: unknown, summary: string): JsonValue {
  if (isUnknownRecord(raw)) {
    return {
      completed: true,
      summary,
      ...raw,
    }
  }
  if (raw === undefined) {
    return {
      completed: true,
      summary,
    }
  }
  const result = coerceJsonValue(raw)
  if (result === undefined) {
    return {
      completed: true,
      summary,
    }
  }
  return {
    completed: true,
    summary,
    result,
  }
}

function rejectAgentComplete(input: Readonly<{
  code: string
  message: string
  fix: string
  checks?: readonly AiAgentToolCheck[]
  requiredCapabilities?: readonly string[]
  missingFacts?: readonly string[]
  nextStep?: string
  knowledgeLookups?: readonly string[]
}>): AiAgentToolResult<JsonValue> {
  const checks = [
    AiAgentToolCheck.error(input.code, input.message, input.fix),
    ...agentCompleteInfoChecks(input),
    ...(input.checks ?? []),
  ]
  return AiAgentToolResult.fail(checks, {
    agentComplete: 'rejected',
    ...(input.requiredCapabilities === undefined ? {} : { requiredCapabilities: input.requiredCapabilities }),
    ...(input.missingFacts === undefined ? {} : { missingFacts: input.missingFacts }),
    ...(input.nextStep === undefined ? {} : { nextStep: input.nextStep }),
    ...(input.knowledgeLookups === undefined ? {} : { knowledgeLookups: input.knowledgeLookups }),
  })
}

function agentCompleteInfoChecks(input: Readonly<{
  requiredCapabilities?: readonly string[]
  missingFacts?: readonly string[]
  nextStep?: string
  knowledgeLookups?: readonly string[]
}>): readonly AiAgentToolCheck[] {
  const checks: AiAgentToolCheck[] = []
  if (input.requiredCapabilities !== undefined && input.requiredCapabilities.length > 0) {
    checks.push(AiAgentToolCheck.info(
      'AGENT_COMPLETE_REQUIRED_CAPABILITIES',
      `领域模型要求补齐能力: ${input.requiredCapabilities.join('；')}`,
    ))
  }
  if (input.missingFacts !== undefined && input.missingFacts.length > 0) {
    checks.push(AiAgentToolCheck.info(
      'AGENT_COMPLETE_MISSING_FACTS',
      `当前缺失数据: ${input.missingFacts.join('；')}`,
    ))
  }
  if (input.nextStep !== undefined && input.nextStep.trim().length > 0) {
    checks.push(AiAgentToolCheck.info(
      'AGENT_COMPLETE_NEXT_STEP',
      input.nextStep,
    ))
  }
  if (input.knowledgeLookups !== undefined && input.knowledgeLookups.length > 0) {
    checks.push(AiAgentToolCheck.info(
      'AGENT_COMPLETE_KNOWLEDGE_LOOKUP',
      `知识恢复: ${input.knowledgeLookups.join('；')}`,
      '先按知识恢复查询 ClassModel 契约，再通过 model_script 代理调用领域模型方法。',
    ))
  }
  return checks
}

function createAgentCompleteKnowledgeRecoveryContext<T>(
  adapterOptions: ClassModelAgentToolRuntimeOptions<T>,
): AgentCompleteKnowledgeRecoveryContext {
  return {
    rootKind: adapterOptions.rootClassName,
    ...(adapterOptions.metadata === undefined ? {} : { metadata: adapterOptions.metadata }),
  }
}

function collectAgentCompleteKnowledgeLookups(input: Readonly<{
  context: AgentCompleteKnowledgeRecoveryContext
  requiredCapabilities?: readonly string[]
}>): readonly string[] {
  const capabilities = input.requiredCapabilities ?? []
  const lookups: string[] = []
  for (const capability of capabilities) {
    for (const actionRef of resolveCapabilityActionRefs(input.context, capability)) {
      lookups.push(
        `model_action_guide({ kind: "${actionRef.kind}", actionName: "${actionRef.actionName}" })`,
      )
    }
  }
  return uniqueStrings(lookups)
}

function resolveCapabilityActionRefs(
  context: AgentCompleteKnowledgeRecoveryContext,
  capability: string,
): ReadonlyArray<Readonly<{ kind: string; actionName: string }>> {
  const parsed = parseCapabilityRef(capability)
  if (parsed !== undefined) return [parsed]

  const metadata = context.metadata
  if (metadata !== undefined) {
    const refs: Array<Readonly<{ kind: string; actionName: string }>> = []
    for (const api of collectMetadataApis(metadata)) {
      const action = api.actions.find(candidate =>
        candidate.name === capability || candidate.methodName === capability)
      if (action !== undefined) refs.push({ kind: api.kind, actionName: action.name })
    }
    if (refs.length > 0) return refs
  }

  return [{ kind: context.rootKind, actionName: capability }]
}

function parseCapabilityRef(value: string): Readonly<{ kind: string; actionName: string }> | undefined {
  const normalized = value.trim()
  const separator = normalized.indexOf('.')
  if (separator <= 0 || separator >= normalized.length - 1) return undefined
  return {
    kind: normalized.slice(0, separator),
    actionName: normalized.slice(separator + 1),
  }
}

function collectMetadataApis(
  metadata: AiRuntimeApiMetadataJson,
): ReadonlyArray<AiRuntimeApiMetadataJson['rootApi']> {
  return [metadata.rootApi, ...Object.values(metadata.apiRegistry ?? {})]
}

function readAgentCompleteChecks(value: unknown): readonly AiAgentToolCheck[] | undefined {
  if (!Array.isArray(value)) return undefined
  const checks = value
    .map(readAgentCompleteCheck)
    .filter((check): check is AiAgentToolCheck => check !== undefined)
  return checks.length === 0 ? undefined : checks
}

function readAgentCompleteCheck(value: unknown): AiAgentToolCheck | undefined {
  if (!isUnknownRecord(value)) return undefined
  const level = value['level']
  const code = readStringRecordField(value, 'code')
  const message = readStringRecordField(value, 'message')
  if ((level !== 'error' && level !== 'warn' && level !== 'info') || code === undefined || message === undefined) {
    return undefined
  }
  return new AiAgentToolCheck(
    level,
    code,
    message,
    readStringRecordField(value, 'hint'),
  )
}

function isMethodContainer(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
}

function isAgentCompleteMethod(value: unknown): value is AgentCompleteMethod {
  return typeof value === 'function'
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readStringRecordField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : undefined
}

function readStringArrayRecordField(value: Record<string, unknown>, key: string): readonly string[] | undefined {
  const field = value[key]
  if (!Array.isArray(field)) return undefined
  const items = field
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(item => item.length > 0)
  return items.length === 0 ? undefined : items
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function resolveClassModelRuntimeKnowledge<T>(
  adapterOptions: ClassModelAgentToolRuntimeOptions<T>,
): ClassModelKnowledgeProvider | undefined {
  if (adapterOptions.options.knowledge !== undefined) return adapterOptions.options.knowledge
  if (adapterOptions.document !== undefined) return undefined
  return createDtsBundleClassModelKnowledgeProvider({
    dtsClassModelManifestUrl: requireDtsClassModelManifestUrl(adapterOptions),
    rootClassName: adapterOptions.rootClassName,
    ...(adapterOptions.options.dtsClassModelFetchJson === undefined
      ? {}
      : { fetchJson: adapterOptions.options.dtsClassModelFetchJson }),
  })
}

function requireDtsClassModelManifestUrl<T>(
  adapterOptions: ClassModelAgentToolRuntimeOptions<T>,
): string {
  const manifestUrl = adapterOptions.options.dtsClassModelManifestUrl?.trim()
  if (manifestUrl === undefined || manifestUrl.length === 0) {
    throw new Error('DTS-native ClassModel runtime requires dtsClassModelManifestUrl.')
  }
  return manifestUrl
}

function toClassModelToolResult(result: AiAgentToolResult<JsonValue>): ClassModelToolResult {
  return {
    ok: result.ok,
    ...(result.data === undefined ? {} : { data: result.data }),
    ...(result.checks === undefined ? {} : { checks: result.checks.map(toClassModelToolCheck) }),
    ...(result.state === undefined ? {} : { state: result.state }),
  }
}

function toClassModelToolCheck(check: AiAgentToolCheck): ClassModelToolCheck {
  return {
    level: check.level,
    code: check.code,
    message: check.message,
    ...(check.hint === undefined ? {} : { hint: check.hint }),
  }
}

function toAgentToolResult(result: ClassModelToolResult): AiAgentToolResult<JsonValue> {
  return new AiAgentToolResult({
    ok: result.ok,
    ...(result.data === undefined ? {} : { data: result.data }),
    ...(result.checks === undefined ? {} : { checks: result.checks.map(toAgentToolCheck) }),
    ...(result.state === undefined ? {} : { state: result.state }),
  })
}

function toAgentToolCheck(check: ClassModelToolCheck): AiAgentToolCheck {
  return new AiAgentToolCheck(
    check.level,
    check.code,
    check.message,
    check.hint,
  )
}

function toAgentToolSpec(tool: ClassModelToolSpec): AiAgentToolSpec {
  return {
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  }
}

function createClassModelPromptSnapshot(document: ClassModelDocument): string {
  const kinds = listAttributeReachableKinds(document)
  return [
    'ClassModel 工具闭集：model_query, model_class_guide, model_attribute_guide, model_action_guide, model_script, human_question, agent_complete。',
    `根模型 kind="${document.rootKind}"；属性链可达模型（与 model_query 一致）: ${kinds.join(', ')}。`,
    'model_query 只列 attribute.api 属性链可达 kind；动作入口与 callback 契约用 model_action_guide（含 resultApis）。',
    '工具参数必须按当前 schema：model_query 只接受 kind / keyword / componentName / componentType / componentLevel / componentLayer / componentDirectory / includeMembers；model_attribute_guide 只接受 kind / attributeName；model_action_guide 只接受 kind / actionName。',
    '执行前先用 model_query({ keyword, includeMembers: true })、model_query({ componentLevel: "field-level" }) 或 model_query({ kind, includeMembers: true }) 定位真实 kind 和成员名；不要使用旧参数 member / select / query / code。',
    '读写或调用前用 model_attribute_guide/model_action_guide 查看 schema、usageRules、failureModes。',
    '唯一执行入口是 model_script({ script })；script 必须是 JavaScript async function body，this 绑定当前业务根实例，沿原生对象链调用。',
    'script 禁止 TypeScript/TSX/JSX/import/export/类型注解/interface/type，也不要包 async function/function。',
    '任务完成必须调用 agent_complete({ summary })；agent_complete 会执行领域模型完成方法，失败时读取 tool result 的 fix/checks 后补查或补执行。',
    '所有执行都通过 model_script，不要绕过 ClassModel 工具闭集。',
  ].join('\n')
}

function readRuntimeHostContext(value: unknown): AiAgentRuntimeHostContext {
  if (!isRuntimeHostContext(value)) {
    throw new Error('ClassModel script executor requires Agent host context.')
  }
  return value
}

function isRuntimeHostContext(value: unknown): value is AiAgentRuntimeHostContext {
  return value !== null
    && typeof value === 'object'
    && typeof Reflect.get(value, 'moduleId') === 'string'
    && typeof Reflect.get(value, 'moduleInstanceId') === 'string'
    && typeof Reflect.get(value, 'instanceId') === 'string'
}

function toRuntimeContext(host: AiAgentRuntimeHostContext): AiAgentRuntimeContext {
  return new AiAgentRuntimeContext(host.moduleId, host.moduleInstanceId, host.instanceId)
}

function createDtsNativePromptSnapshot(rootClassName: string): string {
  return [
    'ClassModel 工具闭集：model_query, model_class_guide, model_attribute_guide, model_action_guide, model_script, human_question, agent_complete。',
    `根模型 className="${rootClassName}"；知识来源为 generated/dts-class-model。`,
    '工具参数必须按当前 schema：model_query 只接受 kind / keyword / componentName / componentType / componentLevel / componentLayer / componentDirectory / includeMembers；model_attribute_guide 只接受 kind / attributeName；model_action_guide 只接受 kind / actionName。',
    '执行前先用 model_query({ keyword, includeMembers: true })、model_query({ componentLevel: "field-level" }) 或 model_query({ kind, includeMembers: true }) 定位真实 kind 和成员名；不要使用旧参数 member / select / query / code。',
    '读写或调用前用 model_attribute_guide/model_action_guide 查看 schema。',
    '唯一执行入口是 model_script({ script })；script 必须是 JavaScript async function body，this 绑定当前业务根实例，沿原生对象链调用。',
    'script 禁止 TypeScript/TSX/JSX/import/export/类型注解/interface/type，也不要包 async function/function。',
    '任务完成必须调用 agent_complete({ summary })；agent_complete 会执行领域模型完成方法，失败时读取 tool result 的 fix/checks 后补查或补执行。',
    '所有执行都通过 model_script，不要绕过 ClassModel 工具闭集。',
  ].join('\n')
}

function constructModuleInstance<T>(
  moduleClass: ClassModelAgentAdapterConstructor<T>,
  args: readonly unknown[],
): T {
  const instance: unknown = Reflect.construct(moduleClass, [...args])
  if (!isConstructedModuleInstance<T>(instance)) {
    throw new Error('Failed to construct module instance.')
  }
  return instance
}

function isConstructedModuleInstance<T>(value: unknown): value is T {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
}

function bindOptionalLifecycle<T, TArgs extends readonly unknown[], TResult>(
  instance: T,
  callback: ((instance: T, ...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  return callback === undefined ? undefined : (...args) => callback(instance, ...args)
}

function bindInstanceLifecycle<T, TArgs extends readonly unknown[], TResult>(
  options: ClassModelAgentAdapterRegisterOptions<T>,
  instance: T | undefined,
  callback: ((instance: T, ...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  if (callback === undefined) return undefined
  if (instance !== undefined) return bindOptionalLifecycle(instance, callback)
  if (options.resolveInstance === undefined) return undefined
  return (...args: TArgs) => {
    const resolved = resolveLifecycleInstance(options, instance, readRuntimeContextFromLifecycleArgs(args))
    if (resolved === undefined) {
      throw new Error('ClassModelAgentAdapter lifecycle callback requires a resolvable module instance.')
    }
    return callback(resolved, ...args)
  }
}

function resolveLifecycleInstance<T>(
  options: ClassModelAgentAdapterRegisterOptions<T>,
  instance: T | undefined,
  context: AiAgentRuntimeContext,
): T | undefined {
  if (instance !== undefined) return instance
  if (options.resolveInstance === undefined) return undefined
  return options.resolveInstance(context)
}

function readRuntimeContextFromLifecycleArgs(args: readonly unknown[]): AiAgentRuntimeContext {
  const candidate = args[0]
  if (candidate instanceof AiAgentRuntimeContext) {
    return candidate
  }
  const contextFields = readRuntimeContextFields(candidate)
  if (contextFields !== null) {
    return new AiAgentRuntimeContext(
      contextFields.moduleId,
      contextFields.moduleInstanceId,
      contextFields.instanceId,
    )
  }
  throw new Error('ClassModelAgentAdapter lifecycle callback expected AiAgentRuntimeContext as the first argument.')
}

function readRuntimeContextFields(value: unknown): Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
}> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const moduleId = readReflectStringField(value, 'moduleId')
  const moduleInstanceId = readReflectStringField(value, 'moduleInstanceId')
  const instanceId = readReflectStringField(value, 'instanceId')
  if (moduleId === null || moduleInstanceId === null || instanceId === null) {
    return null
  }
  return { moduleId, moduleInstanceId, instanceId }
}

function readReflectStringField(value: object, key: string): string | null {
  const field: unknown = Reflect.get(value, key)
  return typeof field === 'string' ? field : null
}

function createRuntimeContextForModuleInstance(moduleId: string, moduleInstanceId: string): AiAgentRuntimeContext {
  return new AiAgentRuntimeContext(moduleId, moduleInstanceId, moduleInstanceId)
}
