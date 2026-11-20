/**
 * @module @spark-appworks/spark-ai:agent/tool-runtime/tool-runtime-types
 * 职责：定义 AI 工具运行时的工具规格、校验等级、执行结果、知识投影和 inspect 报告等核心类型。
 * 边界：只声明工具运行协议，不实现具体工具、不控制 LLM 循环，也不处理传输层 SSE。
 * AI用途：新增或诊断工具时，用本模块确认 tool spec、tool result 和 runtime host context 的语义。
 */
import type { JsonParams, JsonSchemaObject, JsonValue } from '@spark-appworks/spark-json-document'

/** Ai Agent Tool Check Level 的语义模型。 */
export type AiAgentToolCheckLevel = 'error' | 'warn' | 'info'

/** Ai Agent Tool Check 的语义模型。 */
export class AiAgentToolCheck {
    /** 创建 Ai Agent Tool Check 实例。 */
public constructor(
    public readonly level: AiAgentToolCheckLevel,
    public readonly code: string,
    public readonly message: string,
    public readonly hint?: string,
  ) {}

    /** 错误对象或错误信息。 */
public static error(code: string, message: string, hint?: string): AiAgentToolCheck {
    return new AiAgentToolCheck('error', code, message, hint)
  }

    /** 执行 warn 操作。 */
public static warn(code: string, message: string, hint?: string): AiAgentToolCheck {
    return new AiAgentToolCheck('warn', code, message, hint)
  }

    /** 执行 info 操作。 */
public static info(code: string, message: string, hint?: string): AiAgentToolCheck {
    return new AiAgentToolCheck('info', code, message, hint)
  }
}

/** Ai Agent Tool Result Options 的调用配置。 */
export type AiAgentToolResultOptions<TData> = Readonly<{
  /** 工具是否执行成功。 */
  ok: boolean
  /** 成功时的业务数据载荷。 */
  data?: TData
  /** 结构化检查项（error/warn/info）。 */
  checks?: readonly AiAgentToolCheck[]
  /** 可选运行状态快照。 */
  state?: Record<string, unknown>
}>

/** Ai Agent Tool Result 的返回结果。 */
export class AiAgentToolResult<TData = unknown> {
    /** 工具是否执行成功。 */
public readonly ok: boolean
    /** 成功时的业务数据载荷。 */
public readonly data?: TData
    /** 结构化检查项（error/warn/info）。 */
public readonly checks?: readonly AiAgentToolCheck[]
    /** 当前运行状态。 */
public readonly state?: Record<string, unknown>

    /** 创建 Ai Agent Tool Result 实例。 */
public constructor(options: AiAgentToolResultOptions<TData>) {
    this.ok = options.ok
    if ('data' in options) this.data = options.data
    const checks = nonEmptyChecks(options.checks)
    if (checks !== undefined) this.checks = checks
    if (options.state !== undefined) this.state = options.state
  }

  /** 构造成功的工具执行结果。 */
  public static ok<TData>(
    data?: TData,
    checks?: readonly AiAgentToolCheck[],
    state?: Record<string, unknown>,
  ): AiAgentToolResult<TData> {
    return new AiAgentToolResult({
      ok: true,
      ...(data === undefined ? {} : { data }),
      ...(checks === undefined ? {} : { checks }),
      ...(state === undefined ? {} : { state }),
    })
  }

    /** 执行 fail 操作。 */
public static fail(
    checks: readonly AiAgentToolCheck[],
    state?: Record<string, unknown>,
  ): AiAgentToolResult<never> {
    if (checks.length === 0) {
      throw new Error('AiAgentToolResult.fail requires at least one AiAgentToolCheck')
    }
    return new AiAgentToolResult({
      ok: false,
      checks,
      ...(state === undefined ? {} : { state }),
    })
  }

    /** 执行 fail Code 操作。 */
public static failCode(code: string, message: string, hint?: string): AiAgentToolResult<never> {
    return AiAgentToolResult.fail([AiAgentToolCheck.error(code, message, hint)])
  }

    /** 执行 passthrough Failure 操作。 */
public static passthroughFailure(result: AiAgentToolResult<unknown>): AiAgentToolResult<never> {
    return new AiAgentToolResult({
      ok: false,
      ...(result.checks === undefined ? {} : { checks: result.checks }),
      ...(result.state === undefined ? {} : { state: result.state }),
    })
  }
}

/** Ai Agent Tool Spec 的语义模型。 */
export type AiAgentToolSpec = Readonly<{
  /** OpenAI function tool 类型标识，固定为 'function'。 */
  type: 'function'
  /** function 工具的名称、描述与 JSON Schema 参数。 */
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: JsonSchemaObject
    readonly strict?: boolean
  }
}>

/** Ai Agent Runtime Host Context 的运行上下文。 */
export type AiAgentRuntimeHostContext = Readonly<{
  /** 业务模块 ID。 */
  moduleId: string
  /** 模块实例 ID，区分同模块多实例。 */
  moduleInstanceId: string
  /** 全局实例 ID，跨模块唯一。 */
  instanceId: string
}>

/** Ai Agent Tool Runtime Knowledge Projection 的语义模型。 */
export type AiAgentToolRuntimeKnowledgeProjection = Readonly<{
  /** 注入 LLM system prompt 的知识快照文本。 */
  promptSnapshot: string
}>

/** Ai Agent Tool Runtime Inspect Finding 的语义模型。 */
export type AiAgentToolRuntimeInspectFinding = Readonly<{
  /** 发现项等级：error / warn / info。 */
  level: 'error' | 'warn' | 'info'
  /** 稳定发现码。 */
  code: string
  /** 面向用户或日志的说明。 */
  message: string
  /** 可选修复建议。 */
  fix?: string
}>

/** Ai Agent Tool Runtime Inspect Report 的语义模型。 */
export type AiAgentToolRuntimeInspectReport = Readonly<{
  /** 自检总体状态：ok / warning / error。 */
  status: 'ok' | 'warning' | 'error'
  /** 已注册 root API kind 列表。 */
  rootKinds: readonly string[]
  /** 已加载业务模块数量。 */
  moduleCount: number
  /** 结构化发现项列表。 */
  findings: readonly AiAgentToolRuntimeInspectFinding[]
}>

/** Ai Agent Tool Runtime 的语义模型。 */
export type AiAgentToolRuntime = Readonly<{
  /** 返回当前可用的 OpenAI function tool 规格列表。 */
  getTools(): readonly AiAgentToolSpec[]
  /** 按名称执行工具，传入参数与 Host 上下文。 */
  executeTool(
    toolName: string,
    args: JsonParams,
    host: AiAgentRuntimeHostContext,
  ): Promise<AiAgentToolResult<JsonValue>>
  /** 投影当前知识快照，供 LLM prompt 注入。 */
  projectKnowledge(): AiAgentToolRuntimeKnowledgeProjection
  /** 自检工具运行时配置与注册完整性。 */
  inspect(): AiAgentToolRuntimeInspectReport
}>

function nonEmptyChecks(
  checks: readonly AiAgentToolCheck[] | undefined,
): readonly AiAgentToolCheck[] | undefined {
  return checks === undefined || checks.length === 0 ? undefined : checks
}
