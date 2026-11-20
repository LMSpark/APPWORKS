/**
 * @module @spark-appworks/spark-utils:capability/helpers
 * 职责：提供框架无关的 helpers 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * 能力树遍历辅助工具 —— 纯基础设施，无业务语义。
 *
 * 所有函数只操作 CapabilityContext / CapabilityKey 原语，
 * 不引用任何业务类型。
 */

import type { CapabilityContext } from './core.js'
import type { CapabilityKey } from './core.js'
import { consumeSparkCapability } from './core.js'

// ==================== 内部工具 ====================

function hasLocalCapability<T>(ctx: CapabilityContext, key: CapabilityKey<T>): boolean {
  return ctx.capabilities.has(key)
}

// ==================== 公开 API ====================

/**
 * 逐层往上查找最近的"本地声明了指定能力键"的上下文。
 *
 * 只检查每层本地 capabilities map（Map.has），
 * 返回 provider context 本身，而不是能力值。
 *
 * @param ctx           起点上下文
 * @param key           要查找的能力键
 * @param options.includeSelf  是否将 ctx 本层纳入搜索范围（默认 false）
 */
export function sparkFindNearestProvider<T>(
  ctx: CapabilityContext | null | undefined,
  key: CapabilityKey<T>,
  options?: { includeSelf?: boolean },
): CapabilityContext | null {
  if (!ctx) return null
  let current: CapabilityContext | undefined = options?.includeSelf ? ctx : ctx.parent
  while (current) {
    if (hasLocalCapability(current, key)) {
      return current
    }
    current = current.parent
  }
  return null
}

/**
 * 逐层往上查找最近的"本地声明了任一指定能力键"的上下文。
 *
 * @param ctx   起点上下文
 * @param keys  候选键列表（只要命中任意一个即返回）
 */
export function sparkFindNearestProviderByKeys(
  ctx: CapabilityContext | null | undefined,
  keys: ReadonlyArray<CapabilityKey<unknown>>,
  options?: { includeSelf?: boolean },
): CapabilityContext | null {
  if (!ctx) return null
  let current: CapabilityContext | null = options?.includeSelf ? ctx : ctx.parent ?? null
  while (current) {
    for (const key of keys) {
      if (hasLocalCapability(current, key)) {
        return current
      }
    }
    current = current.parent ?? null
  }
  return null
}

/**
 * 从指定 provider context 读取能力。
 *
 * @param provider        目标上下文（通常来自 sparkFindNearestProvider）
 * @param key             能力键
 * @param options.localOnly  true 时只读该层本地（不向上继续消费）
 */
export function sparkConsumeFromProvider<T>(
  provider: CapabilityContext | null | undefined,
  key: CapabilityKey<T>,
  options?: { localOnly?: boolean },
): T | null {
  if (!provider) return null
  if (options?.localOnly) {
    const value = provider.capabilities.get(key)
    if (value === undefined) return null
    const capability = key.read(value)
    if (capability === null) {
      throw new TypeError(`[spark] capability "${key.name}" failed runtime validation`)
    }
    return capability
  }
  return consumeSparkCapability(provider, key)
}
