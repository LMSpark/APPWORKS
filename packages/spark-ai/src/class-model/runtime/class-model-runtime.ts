/**
 * @module @spark-appworks/spark-ai:class-model/runtime/class-model-runtime
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 class-model-runtime 能力，围绕 ClassModelScriptCommand、ClassModelRuntimeOptions、ClassModelToolArgs 等 8 个公开契约 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/runtime/class-model-runtime 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { JsonValue } from '@spark-appworks/spark-json-document'
import type { ClassModelDocument, ComponentClassModelLayer, ComponentClassModelLevel } from '../class-model/types'
import {
  ClassModelKnowledgeService,
  type ClassModelKnowledgeProvider,
} from '../knowledge'
import { listClassModelToolSpecs, type ClassModelToolSpec } from '../tools/class-model-tool-specs'
import { CLASS_MODEL_TOOL_NAMES, isClassModelToolName, type ClassModelToolName } from '../tools'

/** Class Model Script Command 的命令参数。 */
export type ClassModelScriptCommand = Readonly<{
  /** 待执行的 model_script 源码字符串。 */
  script: string
  /** 可选 Host 上下文，注入 script 执行环境。 */
  host?: unknown
}>

/** Class Model Runtime Options 的调用配置。 */
export type ClassModelRuntimeOptions = Readonly<{
  /** 内存 ClassModelDocument；未提供 knowledge 时用于默认 provider。 */
  document?: ClassModelDocument
  /** 知识查询 provider；可替换为 Web Worker 远程实现。 */
  knowledge?: ClassModelKnowledgeProvider
  /** script 工具的唯一执行入口，承接 model_script 调用。 */
  scriptExecutor: ClassModelScriptExecutor
}>

/** Class Model Tool Args 的语义模型。 */
export type ClassModelToolArgs = Readonly<Record<string, JsonValue>>

export type { ClassModelToolSpec } from '../tools/class-model-tool-specs'

const COMPONENT_LEVELS = new Set<ComponentClassModelLevel>([
  'table-level',
  'row-level',
  'container',
  'field-level',
  'display',
  'infrastructure',
])

const COMPONENT_LAYERS = new Set<ComponentClassModelLayer>([
  'data-view-container',
  'row-scope',
  'layout-container',
  'zone-container',
  'data-field',
  'field-support',
  'data-display',
  'static-display',
  'editor',
  'support',
])

/** Class Model Tool Result 的返回结果。 */
export type ClassModelToolResult = Readonly<{
  /** 工具是否执行成功。 */
  ok: boolean
  /** 成功时的业务数据载荷。 */
  data?: JsonValue
  /** 结构化检查项（error/warn/info），失败时通常非空。 */
  checks?: readonly ClassModelToolCheck[]
  /** 可选运行状态快照，供后续 turn 或 UI 读取。 */
  state?: Readonly<Record<string, unknown>>
}>

/** Class Model Tool Check 的语义模型。 */
export type ClassModelToolCheck = Readonly<{
  /** 检查等级：error 阻断，warn/info 提示。 */
  level: 'error' | 'warn' | 'info'
  /** 稳定检查码，供恢复提示与 UI 识别。 */
  code: string
  /** 面向用户或日志的检查说明。 */
  message: string
  /** 可选修复提示。 */
  hint?: string
}>

/** Class Model Script Executor Result 的返回结果。 */
export type ClassModelScriptExecutorResult = JsonValue | ClassModelToolResult

/** Class Model Script Executor 的语义模型。 */
export type ClassModelScriptExecutor =
  (command: ClassModelScriptCommand) => ClassModelScriptExecutorResult | Promise<ClassModelScriptExecutorResult>

/**
 * DtsTypeDeclarationModel tool runtime。
 *
 * 这是 DtsTypeDeclarationModel 的运行时投影，唯一执行入口由 scriptExecutor 承接。
 * runtime 主要负责执行：暴露 7 个 OpenAI tools、校验参数、调度脚本执行器。
 * DtsTypeDeclarationModel 查询、索引和 guide 投影属于 knowledge 边界，可替换成 Web Worker provider。
 */
export class ClassModelRuntime {
  private readonly knowledge: ClassModelKnowledgeProvider
  private readonly scriptExecutor: ClassModelScriptExecutor

    /** 创建 Class Model Runtime 实例。 */
public constructor(options: ClassModelRuntimeOptions) {
    this.knowledge = options.knowledge ?? createDefaultKnowledgeProvider(options)
    this.scriptExecutor = options.scriptExecutor
  }

    /** 读取 Tools。 */
public getTools(): readonly ClassModelToolSpec[] {
    return listClassModelToolSpecs()
  }

    /** 执行 execute Tool 操作。 */
public async executeTool(
    toolName: string,
    rawArgs: ClassModelToolArgs,
    host?: unknown,
  ): Promise<ClassModelToolResult> {
    if (!isClassModelToolName(toolName)) {
      return failResult(
        'UNKNOWN_CLASS_MODEL_TOOL',
        `工具 "${toolName}" 未在 DtsTypeDeclarationModel 工具闭集中定义。`,
        `可用工具: ${Object.values(CLASS_MODEL_TOOL_NAMES).join(', ')}`,
      )
    }

    try {
      return await this.route(toolName, rawArgs, host)
    } catch (error) {
      if (error instanceof ClassModelToolArgsError) {
        return failResult('INVALID_CLASS_MODEL_TOOL_ARGS', error.message, '请按工具 schema 补齐参数后重试。')
      }
      throw error
    }
  }

  private async route(
    toolName: ClassModelToolName,
    args: ClassModelToolArgs,
    host?: unknown,
  ): Promise<ClassModelToolResult> {
    switch (toolName) {
      case CLASS_MODEL_TOOL_NAMES.query: {
        rejectUnknownArgs(toolName, args, [
          'kind',
          'keyword',
          'componentName',
          'componentType',
          'componentLevel',
          'componentLayer',
          'componentDirectory',
          'includeMembers',
        ])
        return okResult(await this.knowledge.query({
          ...optionalStringProperty(args, 'kind'),
          ...optionalStringProperty(args, 'keyword'),
          ...optionalStringProperty(args, 'componentName'),
          ...optionalStringProperty(args, 'componentType'),
          ...optionalComponentLevelProperty(args, 'componentLevel'),
          ...optionalComponentLayerProperty(args, 'componentLayer'),
          ...optionalStringProperty(args, 'componentDirectory'),
          includeMembers: args['includeMembers'] === true,
        }))
      }
      case CLASS_MODEL_TOOL_NAMES.modelGuide: {
        rejectUnknownArgs(toolName, args, ['kind'])
        return okResult(await this.knowledge.modelGuide({
          kind: requireString(args, 'kind'),
        }))
      }
      case CLASS_MODEL_TOOL_NAMES.attributeGuide: {
        rejectUnknownArgs(toolName, args, ['kind', 'attributeName'])
        return okResult(await this.knowledge.attributeGuide({
          kind: requireString(args, 'kind'),
          attributeName: requireString(args, 'attributeName'),
        }))
      }
      case CLASS_MODEL_TOOL_NAMES.actionGuide: {
        rejectUnknownArgs(toolName, args, ['kind', 'actionName'])
        return okResult(await this.knowledge.methodGuide({
          kind: requireString(args, 'kind'),
          methodName: requireString(args, 'actionName'),
        }))
      }
      case CLASS_MODEL_TOOL_NAMES.script: {
        rejectUnknownArgs(toolName, args, ['script'])
        return normalizeScriptExecutionResult(await this.scriptExecutor({
          script: requireString(args, 'script'),
          ...(host === undefined ? {} : { host }),
        }))
      }
      case CLASS_MODEL_TOOL_NAMES.humanQuestion: {
        rejectUnknownArgs(toolName, args, ['context', 'reason', 'missingFacts', 'candidateOptions'])
        return okResult({
          awaitingHuman: true,
          context: requireString(args, 'context'),
          reason: requireString(args, 'reason'),
          ...optionalStringArrayProperty(args, 'missingFacts'),
          ...optionalStringArrayProperty(args, 'candidateOptions'),
        })
      }
      case CLASS_MODEL_TOOL_NAMES.agentComplete: {
        rejectUnknownArgs(toolName, args, ['summary'])
        const summary = requireString(args, 'summary').trim()
        return okResult({
          completed: true,
          summary,
        }, undefined, {
          agentLifecycle: 'complete',
          finalAssistantMessage: summary,
        })
      }
    }
  }
}

class ClassModelToolArgsError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ClassModelToolArgsError'
  }
}

function createDefaultKnowledgeProvider(options: ClassModelRuntimeOptions): ClassModelKnowledgeProvider {
  if (options.document === undefined) {
    throw new Error('ClassModelRuntime requires either knowledge provider or ClassModelDocument.')
  }
  return new ClassModelKnowledgeService({
    document: options.document,
  })
}

function okResult(
  data: JsonValue,
  checks?: readonly ClassModelToolCheck[],
  state?: Readonly<Record<string, unknown>>,
): ClassModelToolResult {
  return {
    ok: true,
    data,
    ...(checks === undefined || checks.length === 0 ? {} : { checks }),
    ...(state === undefined ? {} : { state }),
  }
}

function failResult(code: string, message: string, hint?: string): ClassModelToolResult {
  return {
    ok: false,
    checks: [{
      level: 'error',
      code,
      message,
      ...(hint === undefined ? {} : { hint }),
    }],
  }
}

function normalizeScriptExecutionResult(result: ClassModelScriptExecutorResult): ClassModelToolResult {
  return isClassModelToolResult(result) ? result : okResult(result)
}

function isClassModelToolResult(value: ClassModelScriptExecutorResult): value is ClassModelToolResult {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof Reflect.get(value, 'ok') === 'boolean'
}

function requireString(args: ClassModelToolArgs, key: string): string {
  const value = optionalString(args, key)
  if (value === undefined) throw new ClassModelToolArgsError(`参数 "${key}" 缺失或非字符串。`)
  return value
}

function rejectUnknownArgs(
  toolName: ClassModelToolName,
  args: ClassModelToolArgs,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys)
  const extra = Object.keys(args).filter(key => !allowed.has(key)).sort()
  if (extra.length === 0) return
  const allowedText = allowedKeys.length === 0 ? '(none)' : allowedKeys.join(', ')
  throw new ClassModelToolArgsError(
    `工具 "${toolName}" 不接受参数: ${extra.join(', ')}。允许参数: ${allowedText}。`,
  )
}

function optionalString(args: ClassModelToolArgs, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function optionalStringProperty(args: ClassModelToolArgs, key: string): Record<string, string> {
  const value = optionalString(args, key)
  return value === undefined ? {} : { [key]: value }
}

function optionalComponentLevelProperty(
  args: ClassModelToolArgs,
  key: string,
): { componentLevel?: ComponentClassModelLevel } {
  const value = optionalString(args, key)
  if (value === undefined) return {}
  if (!isComponentClassModelLevel(value)) {
    throw new ClassModelToolArgsError(`参数 "${key}" 必须是组件层级之一: ${[...COMPONENT_LEVELS].join(', ')}。`)
  }
  return { componentLevel: value }
}

function optionalComponentLayerProperty(
  args: ClassModelToolArgs,
  key: string,
): { componentLayer?: ComponentClassModelLayer } {
  const value = optionalString(args, key)
  if (value === undefined) return {}
  if (!isComponentClassModelLayer(value)) {
    throw new ClassModelToolArgsError(`参数 "${key}" 必须是组件分层之一: ${[...COMPONENT_LAYERS].join(', ')}。`)
  }
  return { componentLayer: value }
}

function isComponentClassModelLevel(value: string): value is ComponentClassModelLevel {
  return [...COMPONENT_LEVELS].some(level => level === value)
}

function isComponentClassModelLayer(value: string): value is ComponentClassModelLayer {
  return [...COMPONENT_LAYERS].some(layer => layer === value)
}

function optionalStringArrayProperty(args: ClassModelToolArgs, key: string): Record<string, readonly string[]> {
  const value = args[key]
  if (value === undefined) return {}
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new ClassModelToolArgsError(`参数 "${key}" 必须是字符串数组。`)
  }
  return { [key]: value }
}
