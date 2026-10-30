import {DataViewFilter, parseDataViewKey, RequestState, type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'

type QueryResultValidator = NonNullable<DataView['validateQueryResult']>
type QueryResult = Parameters<QueryResultValidator>[0]

type ValidationTarget = {
  nodeId: string
  assertCurrent: () => void
  released: boolean
}

type ValidatorSlot = {
  view: DataView
  original: QueryResultValidator | undefined
  dispatcher: QueryResultValidator
  active: ValidationTarget | undefined
  onRequestStateChanged: () => void
}

const validatorSlots = new WeakMap<DataView, ValidatorSlot>()

function requestIsPending(view: DataView): boolean {
  return view.requestState === RequestState.Preparing || view.requestState === RequestState.Loading
}

function restoreValidator(slot: ValidatorSlot): void {
  const {view} = slot
  if (validatorSlots.get(view) !== slot || slot.active !== undefined || requestIsPending(view)) return
  if (!view.destroyed && view.validateQueryResult === slot.dispatcher) view.validateQueryResult = slot.original
  view.events.off('requestStateChanged', slot.onRequestStateChanged)
  validatorSlots.delete(view)
}

function createValidatorSlot(view: DataView): ValidatorSlot {
  const original = view.validateQueryResult
  const slot: ValidatorSlot = {
    view,
    original,
    active: undefined,
    dispatcher: async result => {
      const active = slot.active
      if (active) {
        if (active.released) throw new Error('只读信息查询绑定已释放')
        active.assertCurrent()
      }
      await original?.(result)
      if (active) {
        if (active.released || slot.active !== active) throw new Error('只读信息查询目标已切换')
        active.assertCurrent()
        validateReadonlyRows(result, view, active.nodeId)
      }
    },
    onRequestStateChanged: () => {
      if (slot.active?.released && !requestIsPending(view)) slot.active = undefined
      restoreValidator(slot)
    },
  }
  return slot
}

function validateReadonlyRows(result: QueryResult, view: DataView, nodeId: string): void {
  const {page, pageSize} = view
  if (result.countReported !== true || !Number.isSafeInteger(result.total) || result.total < 0
    || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('只读信息查询分页结果不一致或未返回正式总数')
  }
  const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
  const offset = (page - 1) * pageSize
  const expectedRows = Math.max(0, Math.min(pageSize, result.total - offset))
  if (page > lastPage || result.rows.length !== expectedRows) throw new Error('只读信息查询分页结果不一致')

  const rowIds = new Set<string>()
  for (const row of result.rows) {
    if (result.readFieldAccess(row, 'prowid') !== 'visible' || row['prowid'] !== nodeId) {
      throw new Error('只读信息查询返回了不可读或身份不匹配的导航节点记录')
    }
    const rowId = row['rowid']
    const validRowId = (typeof rowId === 'string' && rowId.trim().length > 0)
      || (typeof rowId === 'number' && Number.isFinite(rowId))
    const rowIdKey = validRowId ? `${typeof rowId}:${String(rowId)}` : ''
    if (result.readFieldAccess(row, 'rowid') !== 'visible' || !validRowId || rowIds.has(rowIdKey)) {
      throw new Error('只读信息查询返回了不可读、空值或重复的 rowid')
    }
    rowIds.add(rowIdKey)
  }
  view.assertResultReplacementAllowed()
}

function registerValidation(view: DataView, target: ValidationTarget): () => void {
  let slot = validatorSlots.get(view)
  if (slot && view.validateQueryResult !== slot.dispatcher) {
    view.events.off('requestStateChanged', slot.onRequestStateChanged)
    validatorSlots.delete(view)
    slot = undefined
  }
  if (!slot) {
    slot = createValidatorSlot(view)
    validatorSlots.set(view, slot)
    view.validateQueryResult = slot.dispatcher
    view.events.on('requestStateChanged', slot.onRequestStateChanged)
  }
  slot.active = target
  let released = false
  return () => {
    if (released) return
    released = true
    target.released = true
    if (slot.active === target) {
      if (!requestIsPending(view)) slot.active = undefined
      restoreValidator(slot)
    }
  }
}

/**
 * Bind one fixed navigation-node target to its declared read-only DataView.
 * Validation runs at the DataView's query-result acceptance boundary, so invalid
 * or stale rows never enter the shared rows collection used by standard paging.
 */
export function bindBlueprintReadonlyView({runtime, binding, nodeId, assertCurrent}: {
  runtime: PageRuntime
  binding: string
  nodeId: string
  assertCurrent: () => void
}): {view: DataView; load: () => Promise<void>; release: () => void} {
  const target = nodeId.trim()
  if (!target) throw new Error('只读信息查询缺少当前导航节点身份')
  const descriptor = parseDataViewKey(binding)
  if (!descriptor?.scope) throw new Error(`只读信息查询绑定身份无效: ${binding}`)
  assertCurrent()
  if (!runtime.isLoaded || runtime.destroyed) throw new Error('只读信息查询 PageRuntime 尚未就绪')
  const view = runtime.resolveView(binding)
  if (!view) throw new Error(`PageRuntime 未解析只读视图 ${binding}`)
  if (view.dataSet?.scenarioId !== descriptor.scope || view.dataTable?.modelBinding?.modelName !== descriptor.tableName
    || view.viewId !== descriptor.viewId) {
    throw new Error('只读信息查询 DataView 绑定身份不匹配')
  }
  view.assertResultReplacementAllowed()

  const validationTarget: ValidationTarget = {nodeId: target, assertCurrent, released: false}
  const unregisterValidation = registerValidation(view, validationTarget)
  let released = false
  const assertBindingCurrent = () => {
    if (released || validationTarget.released || runtime.destroyed || !runtime.isLoaded
      || runtime.resolveView(binding) !== view) throw new Error('只读信息查询绑定已失效')
    assertCurrent()
  }

  return {
    view,
    async load() {
      assertBindingCurrent()
      const filter = view.filterExpression
      if (requestIsPending(view) && filter !== undefined && !('logic' in filter)
        && filter.field === 'prowid' && filter.operator === 'eq' && filter.value === target) return
      view.assertResultReplacementAllowed()
      view.page = 1
      view.resetState()
      view.filterExpression = DataViewFilter.condition({field: 'prowid', operator: 'eq', value: target}).toJSON()
      assertBindingCurrent()
      await view.refresh()
      assertBindingCurrent()
      if (view.loadingError) throw view.loadingError
    },
    release() {
      if (released) return
      released = true
      unregisterValidation()
    },
  }
}
