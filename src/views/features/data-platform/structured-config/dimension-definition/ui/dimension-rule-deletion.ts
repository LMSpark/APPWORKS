import {DataViewSaveNotAppliedError, type DataSet, type DataView} from '@spark-appworks/spark-data'

type Id = string | number
type Target = Readonly<{view: DataView; ids: readonly Id[]; context: string}>
type DeleteCommand = Readonly<{rule: DataView; children: readonly DataView[]; id: Id}>

export type DimensionRuleDeletion = {
  id: Id
  dataSet: DataSet
  targets: readonly Target[]
  phase: 'continue' | 'pending' | 'verify' | 'settle' | 'reload' | 'broken' | 'done'
  failure?: Error | undefined
  message: string
}

function assertCurrent(state: DimensionRuleDeletion): void {
  if (state.dataSet.destroyed || state.targets.some(target => target.view.dataSet !== state.dataSet
    || state.dataSet.getView(target.view.tableName, target.view.viewId) !== target.view
    || JSON.stringify(target.view.queryContext) !== target.context)) {
    throw new Error('规则删除的原查询身份已变化')
  }
}
function selectors(targets: readonly Target[]) {
  return targets.map(target => ({tableName: target.view.tableName, viewId: target.view.viewId, ids: [...target.ids]}))
}
function pending(state: DimensionRuleDeletion): Target[] {
  return state.targets.filter(target => target.view.hasUnconfirmedSave)
}
function assertOwned(state: DimensionRuleDeletion): void {
  assertCurrent(state)
  for (const target of state.targets) {
    const tracking = target.view.dirtyTracking
    if (target.view.hasEditingChanges() || tracking.pendingCreateIds.size || tracking.dirtyRowIds.size
      || [...tracking.pendingDeleteIds].some(id => !target.ids.includes(id))) {
      throw new Error('规则删除视图还有其他待处理修改，不能自动丢弃')
    }
  }
}
function describe(cause: unknown): string {return cause instanceof Error ? cause.message : String(cause)}

export async function stageRuleDeletion({rule, children, id}: DeleteCommand): Promise<DimensionRuleDeletion> {
  const dataSet = rule.dataSet
  if (!dataSet || children.some(child => child.dataSet !== dataSet)) throw new Error('规则删除缺少同一DataSet')
  const targets: Target[] = children.map(view => ({view, ids: view.rows.map(row => {
    const childId = view.getPkKey(row)
    if (childId === undefined || String(row['rule_id'] ?? '') !== String(id)) throw new Error('规则子项缺少原生身份或归属不匹配')
    return childId
  }), context: JSON.stringify(view.queryContext)}))
  targets.push({view: rule, ids: [id], context: JSON.stringify(rule.queryContext)})
  if (targets.some(target => new Set(target.ids).size !== target.ids.length)) throw new Error('规则删除目标身份不唯一')
  const state: DimensionRuleDeletion = {id, dataSet, targets, phase: 'continue', message: ''}
  for (const target of targets) target.view.assertResultReplacementAllowed()
  try {
    for (const target of targets) for (const rowId of target.ids) {
      assertCurrent(state)
      if (await target.view.removeRow(rowId) !== true) throw new Error(`记录 ${String(rowId)} 删除准备失败`)
    }
    assertCurrent(state)
    return state
  } catch (cause) {
    assertCurrent(state)
    for (const target of targets) target.view.discardPendingChanges(target.ids)
    throw cause
  }
}

async function reload(state: DimensionRuleDeletion, requireDeleted: boolean): Promise<void> {
  state.phase = 'reload'
  for (const target of state.targets) {
    assertCurrent(state)
    await target.view.refresh()
    if (target.view.loadingError) throw target.view.loadingError
  }
  assertCurrent(state)
  if (requireDeleted) {
    const rule = state.targets.at(-1)
    if (!rule || rule.view.rows.some(row => rule.view.getPkKey(row) === state.id)
      || state.targets.slice(0, -1).some(target => target.view.rows.length > 0)) {
      throw new Error('正式回读仍存在规则或子项')
    }
  }
  state.phase = 'done'
  state.message = requireDeleted ? '规则已删除并回读确认' : `已放弃未保存的本地删除，请核对规则 ${String(state.id)} 的实际结果`
}

function fail(state: DimensionRuleDeletion, cause: unknown): void {
  const unresolved = pending(state)
  if (unresolved.length) {
    if (cause instanceof Error && unresolved.every(target => target.view.hasUnconfirmedSaveFor(target.ids, cause))) {
      state.failure = cause
      state.phase = 'verify'
      state.message = `${describe(cause)}；请核验原删除结果，勿重复提交`
    } else {
      state.phase = 'broken'
      state.message = '待核验删除不属于本次操作，请保留原状态并核对'
    }
  } else {
    state.phase = 'settle'
    state.message = `${describe(cause)}；部分删除可能已生效，请放弃剩余本地修改并回读`
  }
}

export async function submitRuleDeletion(state: DimensionRuleDeletion): Promise<void> {
  if (state.phase !== 'continue') throw new Error('当前不能提交规则删除')
  assertOwned(state)
  const children = state.targets.slice(0, -1).filter(target => target.ids.length)
  const rule = state.targets.at(-1)
  if (!rule) throw new Error('规则删除缺少规则目标')
  const phases = [...(children.length ? [{views: selectors(children)}] : []), {views: selectors([rule])}]
  state.phase = 'pending'
  try {
    const response = await state.dataSet.saveChangesInPhases(phases)
    assertCurrent(state)
    if (!response.success) throw new Error('规则删除未全部确认')
  } catch (cause) {
    fail(state, cause)
    return
  }
  try {await reload(state, true)}
  catch (cause) {state.message = `删除已提交，但回读失败：${describe(cause)}；勿重复删除`}
}

export async function verifyRuleDeletion(state: DimensionRuleDeletion): Promise<void> {
  if (state.phase !== 'verify' || !state.failure) throw new Error('没有本次待核验删除')
  assertOwned(state)
  const unresolved = pending(state)
  if (!unresolved.length || unresolved.some(target => !target.view.hasUnconfirmedSaveFor(target.ids, state.failure))) {
    state.phase = 'broken'
    throw new Error('原删除捕获已变化，不能接管')
  }
  state.phase = 'pending'
  try {
    const response = await state.dataSet.saveChanges({views: selectors(unresolved)})
    assertCurrent(state)
    if (!response.success) throw new Error('原删除未全部确认')
    state.failure = undefined
    if (state.targets.some(target => target.ids.some(id => target.view.dirtyTracking.hasPendingChanges(id)))) {
      state.phase = 'continue'
      state.message = '原删除阶段已确认，剩余删除须由用户明确继续'
      return
    }
  } catch (cause) {
    if (cause instanceof DataViewSaveNotAppliedError && !pending(state).length) {
      state.failure = undefined
      state.phase = 'continue'
      state.message = '原删除未生效；可明确继续删除或放弃本地修改'
      return
    }
    fail(state, cause)
    return
  }
  try {await reload(state, true)}
  catch (cause) {state.message = `删除已提交，但回读失败：${describe(cause)}；勿重复删除`}
}

export async function settleRuleDeletion(state: DimensionRuleDeletion): Promise<void> {
  if (state.phase !== 'settle' && state.phase !== 'continue') throw new Error('当前不能放弃本地删除')
  assertOwned(state)
  if (pending(state).length) throw new Error('原删除结果未确认，不能直接丢弃')
  for (const target of state.targets) target.view.discardPendingChanges(target.ids)
  try {await reload(state, false)}
  catch (cause) {state.phase = 'settle'; state.message = `本地删除已放弃，但回读失败：${describe(cause)}`}
}

export async function abandonRuleDeletion(state: DimensionRuleDeletion): Promise<void> {
  if (state.phase !== 'verify' || !state.failure) throw new Error('没有本次待核验删除')
  assertOwned(state)
  const unresolved = pending(state)
  if (!unresolved.length || unresolved.some(target => !target.view.hasUnconfirmedSaveFor(target.ids, state.failure))) {
    throw new Error('原删除捕获已变化，不能放弃核验')
  }
  let abandoned = false
  try {
    for (const target of unresolved) {
      if (!target.view.abandonUnconfirmedSave()) throw new Error('原来源不支持放弃核验')
      abandoned = true
    }
    state.failure = undefined
    state.phase = 'settle'
    await settleRuleDeletion(state)
  } catch (cause) {
    if (abandoned) state.phase = 'broken'
    throw cause
  }
}

export async function retryRuleDeletionReadback(state: DimensionRuleDeletion): Promise<void> {
  if (state.phase !== 'reload') throw new Error('当前没有待回读的规则删除')
  try {await reload(state, true)}
  catch (cause) {state.message = `删除已提交，但回读失败：${describe(cause)}；勿重复删除`}
}
