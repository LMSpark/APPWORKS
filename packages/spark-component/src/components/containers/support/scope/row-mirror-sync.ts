/**
 * @module @spark-appworks/spark-component:components/containers/support/scope/row-mirror-sync
 * 职责：维护 @spark-appworks/spark-component 中 components/containers/support/row-mirror-sync 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/containers/support/row-mirror-sync 的声明、导出和使用边界时，从本模块开始。
 */
import type { DataRow } from '@spark-appworks/spark-data'

export function syncReactiveRow(
  target: DataRow,
  source: DataRow | null | undefined,
): void {
  const incoming = source ?? {}
  const incomingKeys = new Set(Object.keys(incoming))

  for (const key of Object.keys(target)) {
    if (!incomingKeys.has(key)) {
      target[key] = undefined
    }
  }

  for (const key of incomingKeys) {
    if (target[key] !== incoming[key]) {
      target[key] = incoming[key]
    }
  }
}
