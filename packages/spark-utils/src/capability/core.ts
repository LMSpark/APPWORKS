/**
 * @module @spark-appworks/spark-utils:capability/core
 * 职责：提供框架无关的 core 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * Spark 能力系统核心 —— 框架无关的原语。
 *
 * 本模块刻意保持对 UI、DOM、路由、数据层的零依赖。
 * 提供能力键类型、上下文树定义，以及 provide / consume 原语。
 */

// ==================== 类型定义 ====================

/** 能力值读取器：把运行时 unknown 显式校验为能力类型。 */
export type CapabilityReader<T> = {
  (value: unknown): value is T}

/** 带运行时校验的能力键。 */
export class CapabilityKey<T> {
    /** token 字段。 */
readonly token: symbol

    /** 创建 Capability Key 实例。 */
constructor(
    readonly name: string,
    private readonly reader: CapabilityReader<T>,
  ) {
    this.token = Symbol.for(name)
  }

    /** 执行 read 操作。 */
read(value: unknown): T | null {
    return this.reader(value) ? value : null
  }

    /** 执行 to String 操作。 */
toString(): string {
    return this.name
  }
}

/** 未具体化类型的能力名（用于 Map 的 key）。 */
export type CapabilityName = CapabilityKey<unknown>

/** 能力消费函数签名：给定键返回实现或 null。 */
export type SparkCapabilityConsumer = {
  <T>(name: CapabilityKey<T>): T | null}

/**
 * 能力类型映射表（模块增强入口）。
 *
 * 各包通过 TypeScript module augmentation 扩展此映射，实现编译期的能力类型安全。
 * 扩展此接口，实现编译期的能力类型安全。
 */
export interface CapabilityTypeMap {}

/** 能力树节点：持有本地能力 Map，以及指向父节点的可选链。 */
export type CapabilityContext = {
  /** 当前能力上下文节点 ID，用于调试、日志和父子链定位。 */
  id: string
  /** 当前上下文类型，例如 renderer/component/page，用于区分能力节点来源。 */
  type: string
  /** 父级能力上下文；消费能力时会沿此链向上查找。 */
  parent?: CapabilityContext
  /** 当前节点本地提供的能力实现表，key 为 CapabilityKey。 */
  capabilities: Map<CapabilityName, unknown>}

// ==================== 原语函数 ====================

/**
 * 创建一个带运行时校验的能力键。
 */
export function defineCapability<T>(name: string, reader: CapabilityReader<T>): CapabilityKey<T> {
  return new CapabilityKey(name, reader)
}

/** 向上下文本地 capabilities map 写入实现。 */
export function sparkProvide<T>(ctx: CapabilityContext, name: CapabilityKey<T>, impl: T): void {
  ctx.capabilities.set(name, impl)
}

/** 从上下文本地 capabilities map 删除能力键。 */
export function sparkRemove(ctx: CapabilityContext, name: CapabilityKey<unknown>): void {
  ctx.capabilities.delete(name)
}

/** 沿父链向上查找能力实现，找不到返回 null。 */
export function sparkConsume<T>(ctx: CapabilityContext, name: CapabilityKey<T>): T | null {
  let current: CapabilityContext | undefined = ctx
  while (current) {
    const impl = current.capabilities.get(name)
    if (impl !== undefined) {
      const value = name.read(impl)
      if (value === null) {
        throw new TypeError(`[spark] capability "${name.name}" failed runtime validation`)
      }
      return value
    }
    current = current.parent
  }
  return null
}

/** 创建一个新的能力上下文节点，可选挂接父节点。 */
export function createSparkCapabilityContext(
  config: { id: string; type: string },
  parent?: CapabilityContext | null,
): CapabilityContext {
  const context: CapabilityContext = {
    id: config.id,
    type: config.type,
    capabilities: new Map<CapabilityName, unknown>(),
  }
  if (parent !== undefined && parent !== null) {
    context.parent = parent
  }
  return context
}

/** 允许 ctx 为 null/undefined 的安全版 sparkConsume。 */
export function consumeSparkCapability<T>(
  context: CapabilityContext | null | undefined,
  name: CapabilityKey<T>,
): T | null {
  if (!context) return null
  return sparkConsume(context, name)
}

/** 创建绑定到指定上下文的消费函数（闭包形式）。 */
export function createSparkCapabilityConsumer(
  context: CapabilityContext | null,
): SparkCapabilityConsumer {
  return <T>(name: CapabilityKey<T>): T | null => consumeSparkCapability(context, name)
}

/** 仅读取本层 capabilities map 中指定键，不向上查找。 */
export function getSparkCapabilityProvider(
  context: CapabilityContext,
  name: CapabilityKey<unknown>,
): unknown {
  return context.capabilities.get(name)
}
