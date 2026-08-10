/**
 * @module @spark-appworks/spark-ai:agent/native-runtime/native-script-context
 * 职责：构建 native script 可访问的受控上下文，封装路径上下文、动作调用、回调和失败结果。
 * 边界：只暴露白名单脚本能力，不泄露浏览器全局对象、不绕过 Host 工具审批，也不直接修改业务存储。
 * AI用途：编写或审查 AI 生成脚本时，用本模块确认脚本能调用哪些 API、错误如何返回。
 */
import { readJsonProperty } from '@spark-appworks/spark-json-document'
import { JsonSchemaValidator, type JsonParams, type JsonSchemaValidateOptions } from '@spark-appworks/spark-json-document'
import { AiAgentToolResult, type AiAgentRuntimeHostContext } from '../tool-runtime'
import type { AiApiActionMetadata, AiApiObjectMetadata, AiApiResultApiRef } from '../../class-model'

type MethodTarget = Readonly<Record<string, unknown>>
/** Script Callback 的语义模型。 */
type ScriptCallback = (...args: readonly unknown[]) => unknown
/** Script Action Arg 的语义模型。 */
type ScriptActionArg = JsonParams | ScriptCallback
/** Ai Native Path Context 的运行上下文。 */
type AiNativePathContext = Readonly<{
  /** 从 root 到当前 API 对象的路径段（属性/action 名序列）。 */
  segments: readonly string[]
  /** 可选 Host 运行时上下文，供 takesContext action 注入。 */
  host?: AiAgentRuntimeHostContext
}>
type ApiMethod = (first: AiNativePathContext | JsonParams, second?: JsonParams) => unknown

type ApiProxyState = Readonly<{
  value: Promise<unknown>
  api: AiApiObjectMetadata
  resolved: ResolvedValue
  validateOptions: JsonSchemaValidateOptions
}>

type ResolvedValue = {
  settled: boolean
  value?: unknown
}

/** Ai Api Script Context Command 的命令参数。 */
export type AiApiScriptContextCommand = Readonly<{
  /** 业务实例对象，作为 script 上下文的 root target。 */
  instance: unknown
  /** 该实例对应的 API 对象元数据（actions/attributes 白名单）。 */
  api: AiApiObjectMetadata
  /** 路径与 Host 上下文，供 action 调用链传递。 */
  ctx: AiNativePathContext
  /** 参数校验选项，控制 schema 校验严格度。 */
  validateOptions?: JsonSchemaValidateOptions
}>

/** Execute Ai Api Action Command 的命令参数。 */
export type ExecuteAiApiActionCommand = Readonly<{
  /** 接收 action 调用的业务 target 对象。 */
  target: unknown
  /** 待执行的 API action 元数据。 */
  action: AiApiActionMetadata
  /** script 传入的参数或 callback，归一化前原始形态。 */
  args: ScriptActionArg
  /** 路径与 Host 上下文，供 takesContext action 使用。 */
  ctx: AiNativePathContext
  /** 参数校验选项，控制 schema 校验严格度。 */
  validateOptions?: JsonSchemaValidateOptions
}>

type ExecuteAiApiActionValueCommand = Readonly<{
  target: unknown
  action: AiApiActionMetadata
  args: ScriptActionArg
  ctx: AiNativePathContext
  validateOptions: JsonSchemaValidateOptions
}>

type WrapAsyncApiActionCommand = Readonly<{
  target: unknown
  action: AiApiActionMetadata
  args: JsonParams
  ctx: AiNativePathContext
  validateOptions: JsonSchemaValidateOptions
}>

type CreateResolvedApiSurfaceCommand = Readonly<{
  target: unknown
  api: AiApiObjectMetadata
  ctx: AiNativePathContext
  options: ApiProxyOptions
  validateOptions: JsonSchemaValidateOptions
}>

type CallApiActionInScriptCommand = Readonly<{
  target: unknown
  action: AiApiActionMetadata
  args: JsonParams
  ctx: AiNativePathContext
  validateOptions: JsonSchemaValidateOptions
}>

type WrapResultApisCommand = Readonly<{
  value: unknown
  resultApis: readonly AiApiResultApiRef[]
  ctx: AiNativePathContext
  validateOptions: JsonSchemaValidateOptions
}>

type CreateResultProxyCommand = Readonly<{
  value: Promise<unknown>
  resultApis: readonly AiApiResultApiRef[]
  path: readonly string[]
  ctx: AiNativePathContext
  validateOptions: JsonSchemaValidateOptions
}>

type CreateResolvedResultProxyCommand = Readonly<{
  value: unknown
  resultApis: readonly AiApiResultApiRef[]
  path: readonly string[]
  ctx: AiNativePathContext
  validateOptions: JsonSchemaValidateOptions
}>

type CreateResultPathSurfaceCommand = CreateResultProxyCommand & Readonly<{
  options: ApiProxyOptions
}>

type CreateResolvedResultPathSurfaceCommand = Readonly<{
  value: unknown
  resultApis: readonly AiApiResultApiRef[]
  path: readonly string[]
  ctx: AiNativePathContext
  options: ApiProxyOptions
  validateOptions: JsonSchemaValidateOptions
}>

type CallApiMethodCommand = Readonly<{
  method: ApiMethod
  target: MethodTarget
  action: AiApiActionMetadata
  ctx: AiNativePathContext
  args: JsonParams
}>

type ApiProxyOptions = Readonly<{
  /** true：可被 await；false：await 解包后的 facade，不再暴露 then 以免 Promise 递归采纳。 */
  awaitable: boolean
}>

export function createAiApiScriptContext(
  command: AiApiScriptContextCommand,
): Readonly<Record<string, unknown>> {
  const validateOptions = command.validateOptions ?? {}
  const proxy = createApiProxy(
    createApiProxyState(Promise.resolve(command.instance), command.api, validateOptions),
    command.ctx,
  )
  const context: Record<string, unknown> = {}
  for (const action of command.api.actions) {
    context[action.name] = (...args: readonly unknown[]) => {
      const fn = readScriptProxyProperty(proxy, action.name)
      if (!isScriptCallable(fn)) {
        throw new Error(`${command.api.kind}.${action.name} script proxy is not callable`)
      }
      return fn(...args)
    }
  }
  for (const attribute of command.api.attributes ?? []) {
    Object.defineProperty(context, attribute.name, {
      enumerable: true,
      get: () => readScriptProxyProperty(proxy, attribute.name),
    })
  }
  return context
}

export async function executeAiApiAction(
  command: ExecuteAiApiActionCommand,
): Promise<AiAgentToolResult<unknown>> {
  return await executeAiApiActionValue({
    target: command.target,
    action: command.action,
    args: command.args,
    ctx: command.ctx,
    validateOptions: command.validateOptions ?? {},
  })
}

function executeAiApiActionValue(
  command: ExecuteAiApiActionValueCommand,
): AiAgentToolResult<unknown> | Promise<AiAgentToolResult<unknown>> {
  const normalizedArgs = normalizeScriptActionArgs(command.action, command.args)
  const validation = JsonSchemaValidator.validateDeserializedParams(
    normalizedArgs,
    command.action.paramsSchema,
    command.validateOptions,
  )
  if (!validation.ok) {
    return AiAgentToolResult.failCode(
      'SCHEMA_VALIDATION_FAILED',
      `${command.action.name} 参数不符合 paramsSchema: ${validation.issues.map(issue => issue.message).join('; ')}`,
      '先读取 model_action_guide 或脚本上下文对应方法的 paramsSchema，再按 schema 修正参数。',
    )
  }
  if (!isMethodTarget(command.target)) {
    return AiAgentToolResult.failCode(
      'FUNCTION_NOT_IMPLEMENTED',
      `${command.action.name} 未实现方法 "${command.action.methodName}"`,
      '检查业务 class 是否实现了 ClassModel 声明的 methodName。',
    )
  }
  const method = command.target[command.action.methodName]
  if (!isApiMethod(method)) {
    return AiAgentToolResult.failCode(
      'FUNCTION_NOT_IMPLEMENTED',
      `${command.action.name} 未实现方法 "${command.action.methodName}"`,
      '检查业务 class 是否实现了 ClassModel 声明的 methodName。',
    )
  }
  const raw = callApiMethod({
    method,
    target: command.target,
    action: command.action,
    ctx: command.ctx,
    args: normalizedArgs,
  })
  if (isPromiseLike(raw)) {
    return Promise.resolve(raw).then(value => wrapRawActionResult(value))
  }
  return wrapRawActionResult(raw)
}

async function wrapAsyncApiActionValue(command: WrapAsyncApiActionCommand): Promise<unknown> {
  return unwrapActionResult(command.action.name, await executeAiApiAction({
    target: command.target,
    action: command.action,
    args: command.args,
    ctx: command.ctx,
    validateOptions: command.validateOptions,
  }))
}

function wrapRawActionResult(raw: unknown): AiAgentToolResult<unknown> {
  if (raw instanceof AiAgentToolResult) return raw
  return AiAgentToolResult.ok(raw)
}

/** Ai Api Script Action Failure 的语义模型。 */
export class AiApiScriptActionFailure extends Error {
    /** 创建 Ai Api Script Action Failure 实例。 */
public constructor(
    public readonly actionName: string,
    public readonly result: AiAgentToolResult<unknown>,
  ) {
    const first = result.checks?.[0]
    super(first === undefined ? `${actionName} failed` : `${first.code}: ${first.message}`)
  }
}

function createApiProxy(state: ApiProxyState, ctx: AiNativePathContext): unknown {
  return createApiSurface(state, ctx, { awaitable: true })
}

function createApiProxyState(
  value: Promise<unknown>,
  api: AiApiObjectMetadata,
  validateOptions: JsonSchemaValidateOptions,
): ApiProxyState {
  const resolved: ResolvedValue = { settled: false }
  void value.then(target => {
    resolved.settled = true
    resolved.value = target
  })
  return { value, api, resolved, validateOptions }
}

function createApiSurface(
  state: ApiProxyState,
  ctx: AiNativePathContext,
  options: ApiProxyOptions,
): unknown {
  return new Proxy({}, {
    get(_target, property) {
      if (options.awaitable && property === 'then') {
        return (onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) => state.value.then(
          target => onFulfilled?.(createResolvedApiSurface({
            target,
            api: state.api,
            ctx,
            options: { awaitable: false },
            validateOptions: state.validateOptions,
          })),
          onRejected,
        )
      }
      if (options.awaitable && property === 'catch') {
        return (onRejected?: ((reason: unknown) => unknown) | null) => state.value.then(
          target => createResolvedApiSurface({
            target,
            api: state.api,
            ctx,
            options: { awaitable: false },
            validateOptions: state.validateOptions,
          }),
        ).catch(onRejected)
      }
      if (options.awaitable && property === 'finally') {
        return (onFinally?: (() => void) | null) => state.value.then(
          target => createResolvedApiSurface({
            target,
            api: state.api,
            ctx,
            options: { awaitable: false },
            validateOptions: state.validateOptions,
          }),
        ).finally(onFinally)
      }
      if (property === 'then' || property === 'catch' || property === 'finally') {
        return undefined
      }
      if (typeof property !== 'string') return undefined

      const action = state.api.actions.find(candidate => candidate.name === property)
      if (action !== undefined) {
        return (...args: readonly unknown[]) => {
          const normalizedArgs = normalizeScriptActionArgList(action, args)
          if (state.resolved.settled) {
            return wrapResultApis({
              value: callApiActionInScriptValue({
                target: state.resolved.value,
                action,
                args: normalizedArgs,
                ctx,
                validateOptions: state.validateOptions,
              }),
              resultApis: action.resultApis ?? [],
              ctx,
              validateOptions: state.validateOptions,
            })
          }
          return wrapResultApis({
            value: state.value.then(target => wrapAsyncApiActionValue({
              target,
              action,
              args: normalizedArgs,
              ctx,
              validateOptions: state.validateOptions,
            })),
            resultApis: action.resultApis ?? [],
            ctx,
            validateOptions: state.validateOptions,
          })
        }
      }

      const propertyApi = resolvePropertyApi(state.api, property)
      if (state.resolved.settled) {
        const propertyValue = readJsonProperty(state.resolved.value, property)
        return propertyApi === undefined
          ? propertyValue
          : createResolvedApiSurface({
            target: propertyValue,
            api: propertyApi,
            ctx,
            options,
            validateOptions: state.validateOptions,
          })
      }

      return createApiSurface(
        createApiProxyState(
          state.value.then(target => readJsonProperty(target, property)),
          propertyApi ?? state.api,
          state.validateOptions,
        ),
        ctx,
        options,
      )
    },
  })
}

function createResolvedApiSurface(command: CreateResolvedApiSurfaceCommand): unknown {
  return new Proxy({}, {
    get(_target, property) {
      if (command.options.awaitable && property === 'then') {
        return (onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) => Promise.resolve(command.target).then(
          () => onFulfilled?.(createResolvedApiSurface({
            target: command.target,
            api: command.api,
            ctx: command.ctx,
            options: { awaitable: false },
            validateOptions: command.validateOptions,
          })),
          onRejected,
        )
      }
      if (command.options.awaitable && property === 'catch') {
        return (onRejected?: ((reason: unknown) => unknown) | null) => Promise.resolve(
          createResolvedApiSurface({
            target: command.target,
            api: command.api,
            ctx: command.ctx,
            options: { awaitable: false },
            validateOptions: command.validateOptions,
          }),
        ).catch(onRejected)
      }
      if (command.options.awaitable && property === 'finally') {
        return (onFinally?: (() => void) | null) => Promise.resolve(
          createResolvedApiSurface({
            target: command.target,
            api: command.api,
            ctx: command.ctx,
            options: { awaitable: false },
            validateOptions: command.validateOptions,
          }),
        ).finally(onFinally)
      }
      if (property === 'then' || property === 'catch' || property === 'finally') {
        return undefined
      }
      if (typeof property !== 'string') return undefined

      const action = command.api.actions.find(candidate => candidate.name === property)
      if (action !== undefined) {
        return (...args: readonly unknown[]) => wrapResultApis({
          value: callApiActionInScriptValue({
            target: command.target,
            action,
            args: normalizeScriptActionArgList(action, args),
            ctx: command.ctx,
            validateOptions: command.validateOptions,
          }),
          resultApis: action.resultApis ?? [],
          ctx: command.ctx,
          validateOptions: command.validateOptions,
        })
      }

      const propertyValue = readJsonProperty(command.target, property)
      const propertyApi = resolvePropertyApi(command.api, property)
      if (propertyApi !== undefined) {
        return createResolvedApiSurface({
          target: propertyValue,
          api: propertyApi,
          ctx: command.ctx,
          options: command.options,
          validateOptions: command.validateOptions,
        })
      }
      return propertyValue
    },
  })
}

function callApiActionInScriptValue(command: CallApiActionInScriptCommand): unknown {
  const result = executeAiApiActionValue({
    target: command.target,
    action: command.action,
    args: command.args,
    ctx: command.ctx,
    validateOptions: command.validateOptions,
  })
  if (isPromiseLike(result)) {
    return result.then(value => unwrapActionResult(command.action.name, value))
  }
  return unwrapActionResult(command.action.name, result)
}

function unwrapActionResult(actionName: string, result: AiAgentToolResult<unknown>): unknown {
  if (!result.ok) {
    throw new AiApiScriptActionFailure(actionName, result)
  }
  return result.data
}

function wrapResultApis(command: WrapResultApisCommand): unknown {
  if (command.resultApis.length === 0) return command.value
  if (!isPromiseLike(command.value)) {
    return createResolvedResultProxy({
      value: command.value,
      resultApis: command.resultApis,
      path: [],
      ctx: command.ctx,
      validateOptions: command.validateOptions,
    })
  }
  return createResultProxy({
    value: Promise.resolve(command.value),
    resultApis: command.resultApis,
    path: [],
    ctx: command.ctx,
    validateOptions: command.validateOptions,
  })
}

function createResolvedResultProxy(command: CreateResolvedResultProxyCommand): unknown {
  return createResolvedResultPathSurface({
    value: command.value,
    resultApis: command.resultApis,
    path: command.path,
    ctx: command.ctx,
    options: { awaitable: true },
    validateOptions: command.validateOptions,
  })
}

function createResultProxy(command: CreateResultProxyCommand): unknown {
  return createResultPathSurface({
    value: command.value,
    resultApis: command.resultApis,
    path: command.path,
    ctx: command.ctx,
    options: { awaitable: true },
    validateOptions: command.validateOptions,
  })
}

function createResultPathSurface(command: CreateResultPathSurfaceCommand): unknown {
  const api = command.resultApis.find(ref => samePath(ref.resultPath, command.path))?.api
  if (api !== undefined) {
    return createApiSurface(
      createApiProxyState(command.value, api, command.validateOptions),
      command.ctx,
      command.options,
    )
  }
  return new Proxy({}, {
    get(_target, property) {
      if (command.options.awaitable && property === 'then') {
        return (onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) => command.value.then(
          target => onFulfilled?.(createResolvedResultPathSurface({
            value: target,
            resultApis: command.resultApis,
            path: command.path,
            ctx: command.ctx,
            options: { awaitable: false },
            validateOptions: command.validateOptions,
          })),
          onRejected,
        )
      }
      if (command.options.awaitable && property === 'catch') {
        return (onRejected?: ((reason: unknown) => unknown) | null) => command.value.then(
          target => createResolvedResultPathSurface({
            value: target,
            resultApis: command.resultApis,
            path: command.path,
            ctx: command.ctx,
            options: { awaitable: false },
            validateOptions: command.validateOptions,
          }),
        ).catch(onRejected)
      }
      if (command.options.awaitable && property === 'finally') {
        return (onFinally?: (() => void) | null) => command.value.then(
          target => createResolvedResultPathSurface({
            value: target,
            resultApis: command.resultApis,
            path: command.path,
            ctx: command.ctx,
            options: { awaitable: false },
            validateOptions: command.validateOptions,
          }),
        ).finally(onFinally)
      }
      if (property === 'then' || property === 'catch' || property === 'finally') {
        return undefined
      }
      if (typeof property !== 'string') return undefined
      const nextPath = [...command.path, property]
      return createResultPathSurface({
        value: command.value.then(target => readJsonProperty(target, property)),
        resultApis: command.resultApis,
        path: nextPath,
        ctx: command.ctx,
        options: command.options,
        validateOptions: command.validateOptions,
      })
    },
  })
}

function createResolvedResultPathSurface(command: CreateResolvedResultPathSurfaceCommand): unknown {
  const api = command.resultApis.find(ref => samePath(ref.resultPath, command.path))?.api
  if (api !== undefined) {
    return createResolvedApiSurface({
      target: command.value,
      api,
      ctx: command.ctx,
      options: command.options,
      validateOptions: command.validateOptions,
    })
  }
  return new Proxy({}, {
    get(_target, property) {
      if (command.options.awaitable && property === 'then') {
        return (onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) => Promise.resolve(command.value).then(
          () => onFulfilled?.(createResolvedResultPathSurface({
            value: command.value,
            resultApis: command.resultApis,
            path: command.path,
            ctx: command.ctx,
            options: { awaitable: false },
            validateOptions: command.validateOptions,
          })),
          onRejected,
        )
      }
      if (command.options.awaitable && property === 'catch') {
        return (onRejected?: ((reason: unknown) => unknown) | null) => Promise.resolve(
          createResolvedResultPathSurface({
            value: command.value,
            resultApis: command.resultApis,
            path: command.path,
            ctx: command.ctx,
            options: { awaitable: false },
            validateOptions: command.validateOptions,
          }),
        ).catch(onRejected)
      }
      if (command.options.awaitable && property === 'finally') {
        return (onFinally?: (() => void) | null) => Promise.resolve(
          createResolvedResultPathSurface({
            value: command.value,
            resultApis: command.resultApis,
            path: command.path,
            ctx: command.ctx,
            options: { awaitable: false },
            validateOptions: command.validateOptions,
          }),
        ).finally(onFinally)
      }
      if (property === 'then' || property === 'catch' || property === 'finally') {
        return undefined
      }
      if (typeof property !== 'string') return undefined
      const nextPath = [...command.path, property]
      return createResolvedResultPathSurface({
        value: readJsonProperty(command.value, property),
        resultApis: command.resultApis,
        path: nextPath,
        ctx: command.ctx,
        options: command.options,
        validateOptions: command.validateOptions,
      })
    },
  })
}

function resolvePropertyApi(api: AiApiObjectMetadata, property: string): AiApiObjectMetadata | undefined {
  const attributeApi = api.attributes?.find(attribute => attribute.name === property)?.api
  if (attributeApi !== undefined) return attributeApi
  for (const action of api.actions) {
    const found = action.resultApis?.find(ref => ref.resultPath.length === 1 && ref.resultPath[0] === property)
    if (found !== undefined) return found.api
  }
  return undefined
}

function readScriptProxyProperty(proxy: unknown, property: string): unknown {
  if (proxy === null || (typeof proxy !== 'object' && typeof proxy !== 'function')) {
    return undefined
  }
  return Reflect.get(proxy, property)
}

function isMethodTarget(value: unknown): value is MethodTarget {
  return value !== null && typeof value === 'object'
}

function isScriptCallable(value: unknown): value is ScriptCallback {
  return typeof value === 'function'
}

function isApiMethod(value: unknown): value is ApiMethod {
  return typeof value === 'function'
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (value === null) return false
  if (typeof value !== 'object' && typeof value !== 'function') return false
  return typeof Reflect.get(value, 'then') === 'function'
}

function callApiMethod(command: CallApiMethodCommand): unknown {
  const mutatorRun = readMutatorRunArgument(command.action, command.args)
  if (mutatorRun !== undefined) {
    return Reflect.apply(command.method, command.target, [mutatorRun])
  }
  if (actionRequiresRun(command.action)) {
    const runValue = command.args['run']
    if (runValue !== undefined && typeof runValue !== 'function') {
      return AiAgentToolResult.failCode(
        'SCHEMA_VALIDATION_FAILED',
        `${command.action.name}.run must be a function, received ${typeof runValue}.`,
        `在 model_script 中 ${command.action.name} 需要传 callback；见 model_action_guide 与 RECOVERY_HINT。`,
      )
    }
    return AiAgentToolResult.failCode(
      'SCHEMA_VALIDATION_FAILED',
      `${command.action.name} requires a callback argument; compatible { run } must be a function.`,
      `${command.action.name} 需要 callback 参数；见 model_action_guide（ClassModel 知识索引）与 RECOVERY_HINT。`,
    )
  }
  if (command.action.takesContext === true) return command.method.call(command.target, command.ctx, command.args)
  if (command.action.takesContext === false) {
    return Reflect.apply(command.method, command.target, projectPositionalArgs(command.action, command.args))
  }
  return command.method.length >= 2
    ? command.method.call(command.target, command.ctx, command.args)
    : command.method.call(command.target, command.args)
}

function actionRequiresRun(action: AiApiActionMetadata): boolean {
  return action.paramsSchema.required?.includes('run') === true
    || action.paramsSchema.properties?.['run'] !== undefined
}

function readMutatorRunArgument(
  action: AiApiActionMetadata,
  args: JsonParams,
): ScriptCallback | undefined {
  if (!actionRequiresRun(action)) return undefined
  const runValue = args['run']
  return typeof runValue === 'function'
    ? runValue
    : undefined
}

function projectPositionalArgs(action: AiApiActionMetadata, args: JsonParams): readonly unknown[] {
  const properties = action.paramsSchema.properties
  if (properties === undefined) return []
  return Object.keys(properties).map(name => args[name])
}

function normalizeScriptActionArgList(
  action: AiApiActionMetadata,
  args: readonly unknown[],
): JsonParams {
  if (args.length === 0) return normalizeScriptActionArgs(action, {})
  if (args.length === 1) return normalizeScriptActionArgs(action, args[0])
  return normalizePositionalScriptArgs(action, args)
}

/** model_script 常把 mutator 回调和原生对象参数直接传入；这里归一化为 ClassModel paramsSchema。 */
function normalizeScriptActionArgs(
  action: AiApiActionMetadata,
  args: unknown,
): JsonParams {
  if (typeof args === 'function') {
    if (actionRequiresRun(action)) return paramsFromRecord({ run: args })
    return {}
  }
  const paramNames = actionParamNames(action)
  const paramName = paramNames[0]
  if (paramName !== undefined && paramNames.length === 1 && shouldWrapSingleNativeArgument(action, args)) {
    return paramsFromRecord({ [paramName]: args })
  }
  return isJsonParams(args) ? args : {}
}

function normalizePositionalScriptArgs(
  action: AiApiActionMetadata,
  args: readonly unknown[],
): JsonParams {
  const paramNames = actionParamNames(action)
  if (paramNames.length === 0) return {}
  const next: Record<string, unknown> = {}
  for (let index = 0; index < Math.min(args.length, paramNames.length); index += 1) {
    const paramName = paramNames[index]
    if (paramName !== undefined) next[paramName] = args[index]
  }
  return paramsFromRecord(next)
}

function paramsFromRecord(record: Record<string, unknown>): JsonParams {
  return isJsonParams(record) ? record : {}
}

function isJsonParams(value: unknown): value is JsonParams {
  return isRecord(value)
}

function shouldWrapSingleNativeArgument(action: AiApiActionMetadata, args: unknown): boolean {
  const paramNames = actionParamNames(action)
  const paramName = paramNames[0]
  if (paramName === undefined) return false
  if (actionRequiresRun(action) && paramNames.length === 1 && paramName === 'run') {
    return false
  }
  if (isRecord(args) && Object.prototype.hasOwnProperty.call(args, paramName)) return false
  const propertySchema = action.paramsSchema.properties?.[paramName]
  if (propertySchema === undefined) return false
  if (!isRecord(args)) return true
  return schemaAcceptsObject(propertySchema)
}

function schemaAcceptsObject(schema: unknown): boolean {
  if (schema === true) return true
  if (!isRecord(schema)) return false
  const type = schema['type']
  if (type === 'object') return true
  return Array.isArray(type) && type.includes('object')
}

function actionParamNames(action: AiApiActionMetadata): string[] {
  return Object.keys(action.paramsSchema.properties ?? {})
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index])
}
