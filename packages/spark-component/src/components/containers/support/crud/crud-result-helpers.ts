/**
 * @module @spark-appworks/spark-component:components/containers/support/crud/crud-result-helpers
 * 职责：提供 crud result helpers 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * CrudResult 类型守卫与工具函数。
 *
 * builtin-action-handler.ts 和 page/actions/action-executor.ts 共享。
 */
import type { CrudResult, DataRow } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

export function isCrudResult<T>(value: unknown): value is CrudResult<T> {
  return isRecord(value)
    && 'success' in value
    && typeof value['success'] === 'boolean'
}

export function isCrudSuccess<T>(value: boolean | DataRow | CrudResult<T>): boolean {
  return isCrudResult(value) ? value.success : value !== false
}

export function getCrudErrorMessage<T>(value: CrudResult<T>, fallback: string): string {
  return value.message ?? value.error?.message ?? fallback
}
