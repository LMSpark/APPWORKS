/**
 * @module @spark-appworks/spark-component:components/containers/support/scope/scopeFactories
 * 职责：维护 @spark-appworks/spark-component 中 components/containers/support/scopeFactories 的模块能力，围绕 BaseScopeContext 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/containers/support/scopeFactories 的声明、导出和使用边界时，从本模块开始。
 */
import type { DataRow } from '@spark-appworks/spark-data'
import type { ContextSnapshot } from '@spark-appworks/spark-utils'

// ── 通用作用域结构 ───────────────────────────────────────────────────────────

/** Base Scope Context 的运行上下文。 */
export type BaseScopeContext<TSource> = {
    /** data Source 字段。 */
dataSource: TSource | null | undefined
    /** module Context 字段。 */
moduleContext?: ContextSnapshot | null | undefined}

// ── 作用域构建辅助函数 ───────────────────────────────────────────────────────

function withBaseScopeContext<TSource, TExtra extends Record<string, unknown>>(
  base: BaseScopeContext<TSource>,
  extra: TExtra,
): BaseScopeContext<TSource> & TExtra {
  return {
    dataSource: base.dataSource,
    moduleContext: base.moduleContext,
    ...extra,
  }
}

// ── 作用域工厂 ───────────────────────────────────────────────────────────────

export function createToolbarScope<TSource>(
  base: BaseScopeContext<TSource>,
  extra: Record<string, unknown>,
) {
  return withBaseScopeContext(base, extra)
}

export function createRowScope<TSource>(params: {
  dataSource: TSource | null | undefined
  moduleContext?: ContextSnapshot | null | undefined
  row: DataRow
  index: number
  extra?: Record<string, unknown>
}) {
  return withBaseScopeContext(params, {
    row: params.row,
    rowIndex: params.index,
    ...(params.extra ?? {}),
  })
}

export function createCurrentRowScope<TSource>(params: {
  dataSource: TSource | null | undefined
  moduleContext?: ContextSnapshot | null | undefined
  row: DataRow
  model?: DataRow
}) {
  return withBaseScopeContext(params, {
    row: params.row,
    model: params.model ?? params.row,
  })
}
