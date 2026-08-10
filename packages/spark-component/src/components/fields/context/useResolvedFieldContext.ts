/**
 * @module @spark-appworks/spark-component:components/fields/context/useResolvedFieldContext
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/context/useResolvedFieldContext 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/context/useResolvedFieldContext 的声明、导出和使用边界时，从本模块开始。
 */
import { computed, getCurrentInstance } from 'vue'
import type { CapabilityContext } from '@spark-appworks/spark-utils'
import { type SparkRuntimeOwner, sparkResolveParentContext } from '../../../core/capability-context.js'

// 这里不再为 JS 基础类型保留导出别名，字段渲染模式直接使用 string。

/**
 * 字段渲染模式 — 与容器 type 名解耦的语义标签。
 *
 * 约定值：'table' | 'form' | 'tree' | 'detail'。
 * 字段根据最近宿主 type 推导渲染模式，不再依赖独立 fieldMode 能力键。
 */
function inferModeFromHostType(hostType: string | null): string | null {
  if (hostType === null) return null
  if (hostType === 'r-field-scope' || hostType.endsWith('-field-scope')) return null
  if (hostType === 'r-filter' || hostType.includes('filter-panel')) return 'form'
  if (hostType.includes('table')) return 'table'
  if (hostType.includes('tree')) return 'tree'
  if (hostType.includes('form')) return 'form'
  if (hostType.includes('detail')) return 'detail'
  return null
}

function resolveModeFromContextChain(start: CapabilityContext | null): string {
  let current = start
  while (current !== null) {
    const mode = inferModeFromHostType(typeof current.type === 'string' ? current.type : null)
    if (mode !== null) return mode
    current = current.parent ?? null
  }
  return 'detail'
}

function isSparkRuntimeOwner(value: unknown): value is SparkRuntimeOwner {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

export function useResolvedFieldContext() {
  const instance = getCurrentInstance()
  const currentOwner = isSparkRuntimeOwner(instance) ? instance : null
  return computed<string>(() => {
    const parentContext = sparkResolveParentContext(currentOwner)
    return resolveModeFromContextChain(parentContext)
  })
}
