/**
 * @module @spark-appworks/spark-component:core/useSparkComponent
 * 职责：维护 @spark-appworks/spark-component 中 core/useSparkComponent 的模块能力，围绕 CapabilityKey、CapabilityContext、LoggerApi 等 11 个公开契约 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 core/useSparkComponent 的声明、导出和使用边界时，从本模块开始。
 */
/**
 * 文件概述：
 * - 统一封装 Spark 组件的上下文创建、能力提供/消费、事件订阅与生命周期清理。
 * - 将 Vue 当前实例的运行时输入归一化为 SparkNode，并接入 Spark 自己的上下文树。
 * - 能力上下文的创建、消费和本地 provider 读取统一收口于 capabilities.ts，本文件只负责 Vue 运行时桥接。
 * - 组件 logger 统一取页面运行时 logger；不再支持通过局部 LOGGER 覆盖形成子树级日志分叉。
 * - 对外暴露 useSparkConsume（只消费）和 useSparkComponent（创建并管理上下文）两个入口。
 */
import { computed, onMounted, onUnmounted, getCurrentInstance } from 'vue'
import * as SparkUtils from '@spark-appworks/spark-utils'
import type {
  CapabilityContext,
  CapabilityKey,
  LoggerApi,
  SparkCapabilityConsumer,
} from '@spark-appworks/spark-utils'
import { PAGE_RUNTIME_SERVICES } from '../runtime'
import { PAGE_COMPONENT_REGISTRY } from './capability-keys.js'
import type { PageComponentRegistry } from './capability-keys.js'
import { DATA_ROW } from './capability-keys.js'

import { sparkBindContextOwner, sparkResolveParentContext, sparkUnbindContextOwner, type SparkRuntimeOwner } from './capability-context.js'
import { type SparkNode, normalizeSparkNode, nodeInputProp, SPARK_NODE_STRUCT_KEYS, nodeId } from '@spark-appworks/spark-data'

// ===== 类型与返回值约定 =====

const {
  createSparkCapabilityConsumer,
  createSparkCapabilityContext,
  isRecord,
  sparkFindNearestProvider,
  sparkFindNearestProviderByKeys,
  sparkProvide,
  sparkRemove,
} = SparkUtils

function toSparkRuntimeOwner(instance: ReturnType<typeof getCurrentInstance>): SparkRuntimeOwner | null {
  if (instance === null) return null
  return instance
}

/**
 * 组件上下文完整返回 — 容器 / 字段 / 页面组件的标准上下文入口。
 *
 * `provider` — provider 查询接口：
 *   - `nearestCapabilityProvider(key)` — 按能力键查最近 provider context
 *   - `nearestCapabilityProviderByKeys(keys)` — 按能力键集合查最近 provider context
 *
 * 容器可通过上下文 type 语义驱动子级渲染模式，子级按需消费并自决。
 * 子级独立自决：收到能力后，自己决定何时消费、如何使用，保持渲染自主权。
 */
export type UseSparkComponentReturn = {
    /** provider 字段。 */
provider: {
    nearestCapabilityProvider<T>(name: CapabilityKey<T>): CapabilityContext | null
    nearestCapabilityProviderByKeys(keys: ReadonlyArray<CapabilityKey<unknown>>): CapabilityContext | null
  }
    /** 是否 is Visible。 */
isVisible: { readonly value: boolean }
    /** 是否 is Disabled。 */
isDisabled: { readonly value: boolean }
    /** resolved Props 字段。 */
resolvedProps: { readonly value: Record<string, unknown> }
    /** spark Provide 字段。 */
sparkProvide: {
    <T>(name: CapabilityKey<T>, implementation: T): void
  }
    /** spark Remove 回调。 */
sparkRemove: <T>(name: CapabilityKey<T>) => void
    /** spark Consume 字段。 */
sparkConsume: SparkCapabilityConsumer
    /** 诊断日志接口。 */
logger: LoggerApi}

/** Use Spark Page Component Return 的语义模型。 */
export type UseSparkPageComponentReturn = UseSparkComponentReturn & {
    /** register Api 回调。 */
registerApi: (api: unknown) => void}

/**
 * 轻量消费返回 — 仅消费能力、查询 provider，不创建自身上下文。
 * 由 `useSparkConsume()` 返回，供只需读取上下文的组件使用。
 */
export type UseSparkCapabilityReaderReturn = {
    /** provider 字段。 */
provider: {
    nearestCapabilityProvider<T>(name: CapabilityKey<T>): CapabilityContext | null
    nearestCapabilityProviderByKeys(keys: ReadonlyArray<CapabilityKey<unknown>>): CapabilityContext | null
  }
    /** spark Consume 字段。 */
sparkConsume: SparkCapabilityConsumer}

/** Use Spark Component Options 的调用配置。 */
export type UseSparkComponentOptions = {
    /** parent Context 字段。 */
parentContext?: CapabilityContext}

/** Host Type Resolver Options 的调用配置。 */
type HostTypeResolverOptions = {
    /** host Types 字段。 */
hostTypes?: readonly string[]}

/** Resolved Host Type 的语义模型。 */
type ResolvedHostType = {
    /** host Type 字段。 */
hostType: string | null
    /** parent Context 字段。 */
parentContext: CapabilityContext | null}

/** Spark Node Input 的输入数据。 */
export type SparkNodeInput = {
    /** 类型标识。 */
type: string
    /** 组件属性集合。 */
props?: Record<string, unknown> | undefined
    /** 子节点集合。 */
children?: SparkNode['children'] | undefined
    /** 唯一标识。 */
id?: string | undefined}

function normalizeHostType(
  type: string,
  options: HostTypeResolverOptions,
): string | null {
  if (options.hostTypes === undefined) {
    return type
  }

  return options.hostTypes.includes(type) ? type : null
}

export function resolveHostTypeFromContext(
  parentContext: CapabilityContext | null,
  options: HostTypeResolverOptions = {},
): ResolvedHostType {
  let currentContext = parentContext

  while (currentContext !== null) {
    const currentType = typeof currentContext.type === 'string' ? currentContext.type : null
    if (currentType === null) {
      currentContext = currentContext.parent ?? null
      continue
    }

    const normalizedType = normalizeHostType(currentType, options)
    if (normalizedType !== null) {
      return {
        hostType: normalizedType,
        parentContext: currentContext,
      }
    }

    currentContext = currentContext.parent ?? null
  }

  return {
    hostType: null,
    parentContext: null,
  }
}

export function useSparkContextScope(
  type: string,
  options?: UseSparkComponentOptions,
): UseSparkComponentReturn {
  return useSparkComponent({ type }, options)
}

// ===== 运行时局部状态 =====

// 仅用于匿名 Spark 节点的本地 id 兜底，保证上下文树里每个节点都有稳定标识。
let _idCounter = 0

// ===== Vue 运行时输入 -> SparkNode 归一化 =====

// Vue 事件监听属性不属于 SparkNode.props 的业务配置，归一化时需要剔除。
function isVueListenerProp(key: string): boolean {
  return /^on[A-Z]/.test(key) || key === 'on'
}

// Vue vnode 内部字段只服务框架运行时，不能混入 Spark 的配置语义。
function isVueInternalVNodeProp(key: string): boolean {
  return key === 'key'
    || key === 'ref'
    || key === 'ref_for'
    || key === 'ref_key'
    || key.startsWith('onVnode')
}

function readRuntimeVNodeProps(instance: ReturnType<typeof getCurrentInstance>): Record<string, unknown> {
  const rawProps = instance?.vnode.props
  if (!rawProps || typeof rawProps !== 'object') return {}

  // 只保留真实传入组件、且应该进入 SparkNode.props 的运行时字段。
  const runtimeProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawProps)) {
    if (SPARK_NODE_STRUCT_KEYS.has(key)) continue
    if (isVueInternalVNodeProp(key) || isVueListenerProp(key)) continue
    runtimeProps[key] = value
  }
  return runtimeProps
}

function readInlineRuntimeProps(configInput: SparkNodeInput): Record<string, unknown> {
  const runtimeProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(configInput)) {
    if (SPARK_NODE_STRUCT_KEYS.has(key)) continue
    runtimeProps[key] = value
  }
  return runtimeProps
}

function buildEffectiveConfig(instance: ReturnType<typeof getCurrentInstance>, configInput: SparkNodeInput): SparkNode {
  // configInput 提供静态配置骨架，vnode.props 负责补齐运行时传参，最终统一走 normalizeSparkNode。
  const inlineProps = readInlineRuntimeProps(configInput)
  const runtimeProps = readRuntimeVNodeProps(instance)
  const base: SparkNode = {
    type: configInput.type,
    ...(configInput.id !== undefined ? { id: configInput.id } : {}),
    ...(configInput.children !== undefined ? { children: configInput.children } : {}),
  }

  const props = {
    ...inlineProps,
    ...(configInput.props ?? {}),
    ...runtimeProps,
  }

  if (Object.keys(props).length > 0) {
    base.props = props
  }

  return normalizeSparkNode(base)
}

// ===== Spark 上下文桥接与能力辅助 =====

// 父上下文解析完全走 Spark 自己维护的 owner -> context 链，不依赖 Vue 的 provide/inject 父链。
// 这样组件即使经过中间包装层，也仍然能沿 Spark 运行时树正确消费能力。
function resolveParentContext(
  currentOwner: SparkRuntimeOwner | null,
  overrideParentContext?: CapabilityContext,
): CapabilityContext | null {
  return sparkResolveParentContext(currentOwner, overrideParentContext)
}

function registerPageComponentInstance(
  registry: PageComponentRegistry | null | undefined,
  context: CapabilityContext,
  props?: Record<string, unknown>,
): void {
  if (!registry) return

  // 页面注册表以 id/type 为主键索引组件，props 仅在存在时附带，避免写入无意义空对象。
  const instanceEntry = props === undefined || Object.keys(props).length === 0
    ? { id: context.id, type: context.type }
    : { id: context.id, type: context.type, props }

  registry.registerInstance(instanceEntry)
}

// ===== 页面级日志桥接 =====

function isLoggerApi(value: unknown): value is LoggerApi {
  if (!isRecord(value)) {
    return false
  }

  return typeof value['debug'] === 'function'
    && typeof value['info'] === 'function'
    && typeof value['warn'] === 'function'
    && typeof value['error'] === 'function'
}

// logger 始终从页面运行时服务取，避免局部子树私自覆盖后形成日志分叉。
function createPageLoggerProxy(context: CapabilityContext): LoggerApi {
  const consumeFromCurrent = createSparkCapabilityConsumer(context)
  const resolveLogger = (): LoggerApi => {
    const pageRuntimeServices = consumeFromCurrent(PAGE_RUNTIME_SERVICES)
    if (!isLoggerApi(pageRuntimeServices?.logger)) {
      throw new Error('[spark] PAGE_RUNTIME_SERVICES.logger is required but missing. Ensure page root provides PAGE_RUNTIME_SERVICES before components log.')
    }
    return pageRuntimeServices.logger
  }

  return {
    debug: (...args: unknown[]) => resolveLogger().debug(...args),
    info: (...args: unknown[]) => resolveLogger().info(...args),
    warn: (...args: unknown[]) => resolveLogger().warn(...args),
    error: (...args: unknown[]) => resolveLogger().error(...args),
  }
}

// ===== DATA_ROW 占位符解析 =====

const PLACEHOLDER_RE = /\$\[([^\]]+)\]/g
const PURE_PLACEHOLDER_RE = /^\$\[([^\]]+)\]$/

function hasPlaceholderString(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('$[')
  if (Array.isArray(value)) return value.some(hasPlaceholderString)
  if (isRecord(value)) {
    return Object.values(value).some(hasPlaceholderString)
  }
  return false
}

function resolveValuePlaceholders(value: unknown, row: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const pureMatch = PURE_PLACEHOLDER_RE.exec(value)
    const pureField = pureMatch?.[1]
    // 纯占位符保持原始值类型；嵌入式占位符则退化为字符串拼接。
    if (pureField !== undefined) return row[pureField]
    if (!value.includes('$[')) return value
    return value.replace(PLACEHOLDER_RE, (_, fieldName: string) => {
      const val = row[fieldName]
      return val === null || val === undefined ? '' : String(val)
    })
  }
  if (Array.isArray(value)) {
    if (!value.some(hasPlaceholderString)) return value
    return value.map(v => resolveValuePlaceholders(v, row))
  }
  if (isRecord(value)) {
    if (!Object.values(value).some(hasPlaceholderString)) return value
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveValuePlaceholders(v, row)
    }
    return result
  }
  return value
}

export function resolvePlaceholderProps(
  props: Record<string, unknown>,
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  // 无 DATA_ROW 或 props 中根本没有占位符时直接复用原对象，避免无意义复制。
  if (!row || !hasPlaceholderString(props)) return props
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    result[key] = resolveValuePlaceholders(value, row)
  }
  return result
}

// ===== 对外入口：只消费能力 =====

/**
 * 轻量能力消费 — 仅沿 parent 链查找能力，不创建自身上下文。
 */
export function useSparkConsume(): UseSparkCapabilityReaderReturn {
  const currentOwner = toSparkRuntimeOwner(getCurrentInstance())
  const parentContext = resolveParentContext(currentOwner)
  return {
    provider: {
      nearestCapabilityProvider: name => sparkFindNearestProvider(parentContext, name, { includeSelf: true }),
      nearestCapabilityProviderByKeys: keys => sparkFindNearestProviderByKeys(parentContext, keys, { includeSelf: true }),
    },
    sparkConsume: createSparkCapabilityConsumer(parentContext),
  }
}

export function useSparkComponent(
  configInput: SparkNodeInput,
  options?: UseSparkComponentOptions
): UseSparkComponentReturn {
  // 先将 Vue 当前实例和 configInput 归一化为 SparkNode，再挂接到父能力上下文之下。
  const currentInstance = getCurrentInstance()
  const currentOwner = toSparkRuntimeOwner(currentInstance)
  const config: SparkNode = buildEffectiveConfig(currentInstance, configInput)
  const contextId = nodeId(config) ?? `spark-${++_idCounter}`
  const parentContext = resolveParentContext(
    currentOwner,
    options?.parentContext,
  )
  const context = createSparkCapabilityContext({ id: contextId, type: config.type }, parentContext)
  const currentProvider: UseSparkComponentReturn['provider'] = {
    nearestCapabilityProvider(name) {
      return sparkFindNearestProvider(context, name)
    },
    nearestCapabilityProviderByKeys(keys) {
      return sparkFindNearestProviderByKeys(context, keys)
    },
  }
  const consumeCapability = createSparkCapabilityConsumer(context)

  if (currentInstance !== null) {
    // 绑定 owner 后，后代组件就能通过当前 Vue 实例回溯到这棵 SparkContext 子树。
    sparkBindContextOwner(currentInstance, context)
  }

  // 页面注册表保存组件实例元信息，供页面级 API、调试和联动能力做反查。
  const pageComponentRegistry = consumeCapability(PAGE_COMPONENT_REGISTRY)
  registerPageComponentInstance(pageComponentRegistry, context, config.props)

  // 统一从归一化配置读取可视/禁用状态，避免 props 来源分散导致语义不一致。
  const logger = createPageLoggerProxy(context)
  const effectiveConfig = computed(() => buildEffectiveConfig(currentInstance, configInput))
  const readNormalizedConfigProp = (propName: string): unknown => {
    return nodeInputProp(effectiveConfig.value, propName)
  }
  const isVisible = computed(() => readNormalizedConfigProp('visible') !== false)
  const isDisabled = computed(() => readNormalizedConfigProp('disabled') === true)

  // props 中若引用了 DATA_ROW 占位符，在这里统一投影为最终给组件消费的运行时 props。
  const resolvedProps = computed(() => {
    const props = effectiveConfig.value.props ?? {}
    const row = consumeCapability(DATA_ROW)
    return resolvePlaceholderProps(props, row)
  })

  // ===== 当前组件暴露给后代的能力读写 =====

  function provideSparkCapability<T>(name: CapabilityKey<T>, implementation: T): void {
    if (implementation === undefined) {
      throw new Error(`[spark] sparkProvide received undefined implementation: ${String(name)}. Use sparkRemove(name) to clear capability explicitly.`)
    }
    sparkProvide(context, name, implementation)
  }

  function removeSparkCapability<T>(name: CapabilityKey<T>): void {
    sparkRemove(context, name)
  }

  function sparkConsume<T>(name: CapabilityKey<T>): T | null {
    const impl = consumeCapability(name)
    return impl
  }

  // ===== 生命周期：初始化日志与上下文清理 =====

  let initialized = false
  const initialize = () => {
    if (initialized) return
    initialized = true
  }

  const destroy = () => {
    initialized = false
    // 只清理当前 context 和注册表引用，不销毁 DataSet 之类外部共享对象。
    pageComponentRegistry?.unregisterInstance(context.id)
    context.capabilities.clear()
    if (currentInstance !== null) {
      sparkUnbindContextOwner(currentInstance)
    }
  }

  onMounted(initialize)
  onUnmounted(destroy)

  return {
    provider: currentProvider,
    isVisible,
    isDisabled,
    resolvedProps,
    sparkProvide: provideSparkCapability,
    sparkRemove: removeSparkCapability,
    sparkConsume,
    logger,
  }
}

// ===== 对外入口：页面级组件扩展 =====

export function useSparkPageComponent(
  configInput: SparkNodeInput,
  options?: UseSparkComponentOptions,
): UseSparkPageComponentReturn {
  // 捕获当前 setup 期间的实例引用，供 registerApi 闭包在 setup 结束前同步使用。
  const currentInstance = getCurrentInstance()
  const component = useSparkComponent(configInput, options)

  function registerApi(api: unknown): void {
    const pageComponentRegistry = component.sparkConsume(PAGE_COMPONENT_REGISTRY)
    if (!pageComponentRegistry) return
    // 重新从 vnode props 解析 config。id 可能为 null（匿名组件），此时用空字符串作 key，
    // getApisByType 按 type 过滤，仍能正确查到。
    const config = buildEffectiveConfig(currentInstance, configInput)
    const id = nodeId(config) ?? ''
    pageComponentRegistry.registerApi({ id, type: config.type, api })
  }

  return {
    ...component,
    registerApi,
  }
}

