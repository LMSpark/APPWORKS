/**
 * @module @spark-appworks/spark-component:core/capability-context
 * 职责：提供 capability context 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * Spark 运行时上下文锚点表。
 *
 * CapabilityContext 自己形成结构树；
 * 运行时仅保留 owner 链与 pageRoot 锚点，
 * 不再通过 provide/inject 传递父上下文。
 *
 * 两种锚点的设计意图：
 * - OWNER_CONTEXTS：key 是 Vue 组件实例（object）。组件卸载时显式 delete，
 *   实例对象本身也随 Vue 的 GC 路径回收。
 * - PAGE_ROOT_CONTEXTS：key 是页面根 DOM 元素（HTMLElement）。
 *   WeakMap key = DOM 节点，节点从文档移除且无其它引用时 GC 自动回收。
 *   显式 unbind（onUnmounted）作为双保险，不依赖 GC 时机。
 */

import type { CapabilityContext } from '@spark-appworks/spark-utils'

/** Spark Runtime Owner 的语义模型。 */
export type SparkRuntimeOwner = {
    /** parent 字段。 */
parent?: SparkRuntimeOwner | null
    /** page Root 字段。 */
pageRoot?: unknown}

const OWNER_CONTEXTS = new WeakMap<object, CapabilityContext>()
/** key = 页面根 DOM 元素（HTMLElement），DOM 天然防泄漏 */
const PAGE_ROOT_CONTEXTS = new WeakMap<HTMLElement, CapabilityContext>()

export function sparkBindContextOwner(owner: object, context: CapabilityContext): void {
  OWNER_CONTEXTS.set(owner, context)
}

export function sparkUnbindContextOwner(owner: object): void {
  OWNER_CONTEXTS.delete(owner)
}

export function sparkResolveContextOwner(owner: object): CapabilityContext | null {
  return OWNER_CONTEXTS.get(owner) ?? null
}

/** pageRoot 必须是页面根 DOM 元素（HTMLElement）。 */
export function sparkBindPageRootContext(pageRoot: HTMLElement, context: CapabilityContext): void {
  PAGE_ROOT_CONTEXTS.set(pageRoot, context)
}

export function sparkUnbindPageRootContext(pageRoot: HTMLElement): void {
  PAGE_ROOT_CONTEXTS.delete(pageRoot)
}

export function sparkResolvePageRootContext(pageRoot: unknown): CapabilityContext | null {
  if (!(pageRoot instanceof HTMLElement)) return null
  return PAGE_ROOT_CONTEXTS.get(pageRoot) ?? null
}

export function sparkResolveParentContext(
  owner: SparkRuntimeOwner | null,
  overrideHostContext?: CapabilityContext,
): CapabilityContext | null {
  if (overrideHostContext !== undefined) {
    return overrideHostContext
  }

  let currentOwner = owner?.parent ?? null
  while (currentOwner !== null) {
    const boundContext = OWNER_CONTEXTS.get(currentOwner)
    if (boundContext !== undefined) {
      return boundContext
    }
    currentOwner = currentOwner.parent ?? null
  }

  const pageRootContext = sparkResolvePageRootContext(owner?.pageRoot)
  if (pageRootContext !== null) {
    return pageRootContext
  }

  return null
}
