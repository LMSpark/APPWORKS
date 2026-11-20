/**
 * @module @spark-appworks/spark-ai:agent/native-runtime/native-script-runner
 * 职责：执行 native script 命令，连接 schema defs、脚本上下文和运行结果，让 ClassModel 脚本在本地安全落地。
 * 边界：负责受控执行和结果包装，不负责 LLM 对话、不决定工具选择，也不保存会话。
 * AI用途：排查 model_script 执行失败、参数 schema 或返回值映射时，用本模块定位运行链路。
 */
import type {
  JsonSchema,
  JsonSchemaValidateOptions,
  JsonValue,
} from '@spark-appworks/spark-json-document'
import type { AiAgentRuntimeHostContext } from '../tool-runtime'
import { AiAgentToolResult } from '../tool-runtime'
import {
  resolveRuntimeApiMetadataJson,
  validateApiObjectMetadata,
  type AiRuntimeApiMetadataJson,
} from '../../class-model'
import { executeModuleScript } from './native-script-sandbox'
import { createAiApiScriptContext } from './native-script-context'

/** Ai Native Runtime Schema Defs 的语义模型。 */
export type AiNativeRuntimeSchemaDefs = Readonly<Record<string, JsonSchema>>

/** Ai Native Script Context Command 的命令参数。 */
export type AiNativeScriptContextCommand<TInstance = unknown> = Readonly<{
  /** 脚本执行时 this 绑定的业务根实例；脚本通过 this.xxx 访问实例上的 API 方法 */
  instance: TInstance
  /** ClassModel API 元数据 JSON，声明脚本可调用的 API 对象及其方法签名 */
  metadata: AiRuntimeApiMetadataJson
  /** 宿主运行上下文，提供平台级服务（如路径解析）注入；省略时脚本无宿主依赖 */
  host?: AiAgentRuntimeHostContext
  /** 命名 JSON Schema 定义集，供脚本内校验函数按 $ref 引用；省略时校验不支持外部 schema */
  schemaDefs?: AiNativeRuntimeSchemaDefs
}>

/** Ai Native Script Run Command 的命令参数。 */
export type AiNativeScriptRunCommand<TInstance = unknown> =
  AiNativeScriptContextCommand<TInstance> & Readonly<{
    /** LLM 生成的 JavaScript async function body，脚本沙箱直接执行此文本；禁止包含 TS/JSX/import/export/函数包裹 */
    script: string
  }>

export function createAiNativeScriptContext(
  command: AiNativeScriptContextCommand,
): Readonly<Record<string, unknown>> {
  const metadata = resolveRuntimeApiMetadataJson(command.metadata)
  validateApiObjectMetadata(metadata.rootApi)
  return createAiApiScriptContext({
    instance: command.instance,
    api: metadata.rootApi,
    ctx: createNativePathContext(command.host),
    validateOptions: createSchemaValidateOptions(command.schemaDefs),
  })
}

export async function executeAiNativeScript(
  command: AiNativeScriptRunCommand,
): Promise<AiAgentToolResult<JsonValue>> {
  if (command.script.trim().length === 0) {
    return AiAgentToolResult.failCode(
      'SCRIPT_EMPTY',
      'native script body must not be empty.',
      '让 LLM 直接生成 JavaScript async function body，例如 return { ... }；不要生成 TypeScript/TSX/JSX、类型注解、import/export 或函数包裹；this 绑定当前业务根实例。',
    )
  }
  const context = createAiNativeScriptContext(command)
  return await executeModuleScript(command.script, context)
}

function createNativePathContext(host: AiAgentRuntimeHostContext | undefined): Readonly<{
  segments: readonly string[]
  host?: AiAgentRuntimeHostContext
}> {
  return host === undefined
    ? { segments: [] }
    : { segments: [], host }
}

function createSchemaValidateOptions(
  schemaDefs: AiNativeRuntimeSchemaDefs | undefined,
): JsonSchemaValidateOptions {
  return schemaDefs === undefined || Object.keys(schemaDefs).length === 0
    ? {}
    : { schemaDefs }
}
