const actions = ['added', 'changed', 'deleted'] as const

export type DataSpaceSaveAction = typeof actions[number]

function isSaveAction(value: unknown): value is DataSpaceSaveAction {
  return value === 'added' || value === 'changed' || value === 'deleted'
}

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
