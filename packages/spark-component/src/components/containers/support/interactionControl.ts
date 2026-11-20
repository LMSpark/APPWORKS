/**
 * @module @spark-appworks/spark-component:components/containers/support/interactionControl
 * 职责：维护 @spark-appworks/spark-component 中 components/containers/support/interactionControl 的模块能力，围绕 CancellableControl、InteractionControl、CancelableHandler 等 9 个公开契约 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/containers/support/interactionControl 的声明、导出和使用边界时，从本模块开始。
 */
import type { CrudResult, DataRow } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

// ── 可取消控制器（从 core/cancellable-control 内聚至此） ──────────────────

/** Cancellable Control 的语义模型。 */
export type CancellableControl = {
    /** cancel 字段。 */
cancel: boolean}

export function createCancellableControl(): CancellableControl {
  return { cancel: false }
}

export function isCancellableControl(value: unknown): value is CancellableControl {
  return isRecord(value)
    && 'cancel' in value
    && typeof value['cancel'] === 'boolean'
}

/** Interaction Control 的语义模型。 */
export type InteractionControl = {
    /** cancel 字段。 */
cancel: boolean
}

/** Cancelable Handler 的回调函数契约。 */
export type CancelableHandler<TArgs extends unknown[]> = {
  (...args: [...TArgs, InteractionControl]): void | Promise<void>}

export async function runControlledInteraction<TArgs extends unknown[]>(
  handler: CancelableHandler<TArgs> | undefined,
  args: TArgs,
  defaultAction?: () => void | Promise<void>,
): Promise<InteractionControl> {
  const control = createCancellableControl()
  if (handler) {
    await handler(...args, control)
  }
  if (!control.cancel) {
    await defaultAction?.()
  }
  return control
}

export function createCancelledCrudResult<T>(message: string): CrudResult<T> {
  return {
    success: false,
    message,
  }
}

/** Row Click Handler 的回调函数契约。 */
export type RowClickHandler = CancelableHandler<[DataRow, unknown, Event | undefined]>
/** Row Selection Handler 的回调函数契约。 */
export type RowSelectionHandler = CancelableHandler<[DataRow[]]>
/** Current Row Change Handler 的回调函数契约。 */
export type CurrentRowChangeHandler = CancelableHandler<[DataRow | null, DataRow | null | undefined]>
/** Add Row Handler 的回调函数契约。 */
export type AddRowHandler = CancelableHandler<[Partial<DataRow>]>
/** Edit Row Handler 的回调函数契约。 */
export type EditRowHandler = CancelableHandler<[string | number, Partial<DataRow>]>
/** Remove Row Handler 的回调函数契约。 */
export type RemoveRowHandler = CancelableHandler<[string | number]>
