/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/save/data-space-save-order
 * 职责：校验显式 CRUD 动作顺序。
 * 边界：顺序必须完整且无重复，不偷偷补齐或重新排序。
 * AI用途：保留调用方明确指定的动作顺序。
 */
const actions = ['added', 'changed', 'deleted'] as const
/** 统一保存的新增、更新、删除动作标识。 */
type DataSpaceSaveAction = typeof actions[number]

function isSaveAction(value: unknown): value is DataSpaceSaveAction {
  return value === 'added' || value === 'changed' || value === 'deleted'
}

/** 显式 actionOrder 在任何保存 I/O 前校验并捕获，不授权或重排业务变更。 */
export function snapshotDataSpaceSaveActionOrder(value: unknown): readonly DataSpaceSaveAction[] {
  if (!Array.isArray(value) || value.length !== actions.length) {
    throw new Error('SPARK API actionOrder 必须完整排列 added、changed、deleted 三种动作')
  }
  const order = value.filter(isSaveAction)
  if (order.length !== actions.length || new Set(order).size !== actions.length) {
    throw new Error('SPARK API actionOrder 必须是 added、changed、deleted 的无重复完整排列')
  }
  return Object.freeze(order)
}
