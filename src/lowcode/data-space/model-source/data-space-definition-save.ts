/**
 * @module app:lowcode/data-space/model-source/data-space-definition-save
 * 职责：组合模型和字段的原有保存阶段，统一通过DataSet提交。
 * 边界：不持有业务数据、权限或请求实现；各定义owner负责领域校验，原数据层负责提交回执。
 * AI用途：模型工作区统一保存，所有阶段预检通过后才应用并派发一个批次。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'

export type DataSpaceDefinitionCapture = Readonly<{
  tableName: string
  viewId: string
  ids: readonly string[]
  view: DataView
  queryContext: string
  createdCount: number
  savedCount: number
  deletedCount: number
}>

export type DataSpaceDefinitionCaptureBatch = {
  readonly targets: readonly DataSpaceDefinitionCapture[]
  verified: boolean
  /** Proof of how the original operation was resolved; capture disappearance alone proves nothing. */
  resolution?: 'confirmed' | 'not-applied' | 'accepted-current'
  receiptInvalid?: boolean
  acceptedCurrent?: boolean
  discarded?: boolean
}

export type DataSpaceDefinitionRecoveryOptions = Readonly<{
  acceptCurrentOnInvalidReceipt?: boolean
  discardLocalChanges?: boolean
}>

/** 同一模型定义owner提供的单次保存阶段，不能跨实例拼接。 */
export type DataSpaceDefinitionSavePart = {
  /** 原元数据实例。 */
  dataSet: DataSet
  /** 被维护的空间。 */
  targetId: string
  /** 被维护的模型。 */
  modelId: string
  /** 校验完整草稿及依赖，不提交。 */
  prepare(): Promise<void>
  /** 将已经校验的编辑覆盖应用到原视图。 */
  apply(): Promise<void>
  /** 派发前再次检查权限、身份及预检快照。 */
  check(): void | Promise<void>
  /** 返回原DataSet保存范围；不含记录值。 */
  targets(): Array<{tableName: string; viewId: string; ids: string[]}>
  /** 派发时使旧目标投影失效。 */
  dispatched(capture: DataSpaceDefinitionCaptureBatch): void
  /** 消费原数据层确认；仅领域结构命令执行必要的关联核验。 */
  confirm(): Promise<void>
  /** 整个联合批次全部完成领域核验后清理临时身份元信息。 */
  settled?(): void
  /** 按最后已执行阶段保留可恢复状态。 */
  failed(stage: 'preparing' | 'applying' | 'dispatched' | 'confirmed'): void
}

/** Original selector draft signature, including native diffs whose editing overlay was already applied. */
export function definitionTargetDraftSignature(view: DataView, ids: readonly string[]): string {
  return JSON.stringify(ids.map(id => {
    const row = view.dirtyTracking.getPendingDeleteSnapshot(id) ?? view.getEditingRow(id)
      ?? view.rows.find(item => String(view.getPkKey(item)) === id)
    return [id, view.getEditingPatch(id), row ? view.dirtyTracking.getDiff(id, row) : undefined,
      view.dirtyTracking.isPendingCreate(id), view.dirtyTracking.isPendingDelete(id)]
  }))
}

/** 一次原DataSet保存；失败不回滚已派发写入，也不自动重放。 */
export class DataSpaceDefinitionSave {
  /** 核对同一实例/空间/模型，依次预检、应用并消费原DataSet提交结果。 */
  static async run(parts: readonly DataSpaceDefinitionSavePart[]): Promise<void> {
    const first = parts[0]
    if (!first) return
    if (parts.some(part => part.dataSet !== first.dataSet || part.targetId !== first.targetId || part.modelId !== first.modelId)) {
      throw new Error('定义批次必须属于同一数据空间实例和模型')
    }
    let stage: Parameters<DataSpaceDefinitionSavePart['failed']>[0] = 'preparing'
    try {
      for (const part of parts) await part.prepare()
      stage = 'applying'
      for (const part of parts) await part.apply()
      for (const part of parts) await part.check()
      const views: ReturnType<DataSpaceDefinitionSavePart['targets']> = []
      for (const target of parts.flatMap(part => part.targets())) {
        const existing = views.find(view => view.tableName === target.tableName && view.viewId === target.viewId)
        if (new Set(target.ids).size !== target.ids.length || existing && target.ids.some(id => existing.ids.includes(id))) throw new Error('定义批次记录身份重复，不能重复提交同一草稿')
        if (existing) existing.ids.push(...target.ids)
        else views.push({...target, ids: [...target.ids]})
      }
      if (!views.length) return
      const capture = views.map(target => {
        const view = first.dataSet.getView(target.tableName, target.viewId)
        if (!view || view.destroyed) throw new Error('定义批次原视图已失效，不能派发')
        const ids = [...target.ids], createdCount = ids.filter(id => view.dirtyTracking.isPendingCreate(id)).length
        const deletedCount = ids.filter(id => view.dirtyTracking.isPendingDelete(id)).length
        return {...target, ids, view, queryContext: JSON.stringify(view.queryContext), createdCount, deletedCount,
          savedCount: ids.length - createdCount - deletedCount}
      })
      const batch: DataSpaceDefinitionCaptureBatch = {targets: capture, verified: false}
      stage = 'dispatched'; parts.forEach(part => part.dispatched(batch))
      const saved = await first.dataSet.saveChanges({applyEditingRows: false, views})
      try {assertDefinitionReceipt(saved, batch)} catch (cause) {batch.receiptInvalid = true; throw cause}
      batch.verified = true
      batch.resolution = 'confirmed'
      stage = 'confirmed'
      for (const part of parts) await part.confirm()
      parts.forEach(part => part.settled?.())
    } catch (cause) {parts.forEach(part => part.failed(stage)); throw cause}
  }
}

function assertDefinitionReceipt(result: Awaited<ReturnType<DataSet['saveChanges']>>, batch: DataSpaceDefinitionCaptureBatch): void {
  const data = result.data
  const targets = batch.targets
  if (!result.success || data?.viewCount !== targets.length || data.viewResults.length !== targets.length
    || data.failedEditingRows !== 0 || data.failedCount !== 0 || data.failedViews.length !== 0) {
    throw new Error(result.message ? `定义保存回执未确认原联合批次全部目标：${result.message}` : '定义保存回执未确认原联合批次全部目标')
  }
  for (const target of targets) {
    const matches = data.viewResults.filter(view => view.tableName === target.tableName && view.viewId === target.viewId)
    if (matches.length !== 1) throw new Error(`定义保存回执与原目标不匹配：${target.tableName}@${target.viewId}`)
    const receipt = matches[0]
    if (receipt === undefined) throw new Error(`定义保存回执与原目标不匹配：${target.tableName}@${target.viewId}`)
    if (receipt.createdCount !== target.createdCount || receipt.savedCount !== target.savedCount
      || receipt.deletedCount !== target.deletedCount || receipt.failedCount !== 0 || receipt.failedIds.length !== 0 || receipt.failedEditingRows !== 0) {
      throw new Error(`定义保存回执与原目标不匹配：${target.tableName}@${target.viewId}`)
    }
  }
}

/** 只核验协调器原批次；不会加入后来编辑或DataSet中的其他视图。 */
export async function verifyDataSpaceDefinitionCapture(dataSet: DataSet, batch: DataSpaceDefinitionCaptureBatch, acceptCurrent = false): Promise<'already-confirmed' | 'confirmed' | 'not-applied' | 'accepted-current'> {
  const capture = batch.targets
  if (!capture.length) throw new Error('缺少原定义批次身份，不能核验未知结果')
  for (const target of capture) {
    const current = dataSet.getView(target.tableName, target.viewId)
    if (current !== target.view || current.destroyed || JSON.stringify(current.queryContext) !== target.queryContext) {
      throw new Error('原定义批次视图或查询上下文已变化，未知结果仍保留')
    }
  }
  const hasCapture = () => capture.some(target => target.view.hasUnconfirmedSave)
  const watchEdits = () => {
    const edited = new Set<DataView>(), listeners = new Map<DataView, (event: unknown) => void>()
    for (const view of new Set(capture.map(target => target.view))) {
      const listener = () => edited.add(view)
      view.events.on('editingFieldChanged', listener); listeners.set(view, listener)
    }
    return {edited, dispose: () => listeners.forEach((listener, view) => view.events.off('editingFieldChanged', listener))}
  }
  if (batch.receiptInvalid && !hasCapture()) {
    if (!acceptCurrent) throw new Error('原定义回执无效；请明确选择读取并采用当前正式结果')
    const byView = new Map<DataView, Set<string>>()
    for (const target of capture) {
      const ids = byView.get(target.view) ?? new Set<string>()
      target.ids.forEach(id => ids.add(id)); byView.set(target.view, ids)
    }
    for (const [view, ids] of byView) {
      const outside = view.rows.some(row => {
        const id = view.getPkKey(row)
        return id !== undefined && !ids.has(String(id)) && (view.hasEditingChanges(id) || view.dirtyTracking.hasPendingChanges(id))
      }) || [...view.dirtyTracking.pendingDeleteIds].some(id => !ids.has(String(id)))
      if (outside || view.hasUnconfirmedSave || view.mutating || view.requestState === RequestState.Loading) {
        throw new Error('回执无效；原视图存在范围外草稿或请求，不能刷新覆盖，请先处理后重新读取当前正式结果')
      }
    }
    const guard = watchEdits()
    try {
      // An explicit accept-current action authorizes these original targets as a unit. Discard every
      // target synchronously before the first await so a later view cannot lose an intervening edit.
      for (const [view, ids] of byView) view.discardPendingChanges([...ids])
      for (const [view] of byView) {
        if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) {
          throw new Error('读取当前正式结果期间出现新草稿；已保留修改，请重新明确选择采用当前结果')
        }
        const result = await view.loadFromServer({...(view.filterExpression ? {filter: view.filterExpression} : {}), allPages: true, maxRows: 50000})
        if (!result.success) throw new Error(result.message ?? '读取当前正式结果失败；定义核验状态仍保留')
        const target = capture.find(item => item.view === view)
        if (!target) throw new Error('读取期间原定义批次视图身份缺失；定义核验状态仍保留')
        if (dataSet.getView(target.tableName, target.viewId) !== view || view.destroyed || JSON.stringify(view.queryContext) !== target.queryContext) {
          throw new Error('读取期间原定义视图或查询上下文已变化；定义核验状态仍保留')
        }
        if (guard.edited.size || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) {
          throw new Error('读取当前正式结果期间出现新草稿；已保留修改，请重新明确选择采用当前结果')
        }
      }
    } finally {guard.dispose()}
    batch.acceptedCurrent = true
    batch.discarded = true
    delete batch.receiptInvalid
    batch.verified = true
    batch.resolution = 'accepted-current'
    return 'accepted-current'
  }
  if (batch.resolution === 'confirmed') {batch.verified = true; return 'already-confirmed'}
  if (batch.resolution === 'not-applied') return 'not-applied'
  if (batch.resolution === 'accepted-current') return 'accepted-current'
  if (batch.verified || !hasCapture()) throw new Error('原定义捕获已消失但没有有效回执证明；未知结果仍保留')
  const guard = watchEdits()
  try {
    const result = await dataSet.saveChanges({applyEditingRows: false, views: capture.map(({tableName, viewId, ids}) => ({tableName, viewId, ids: [...ids]}))})
    try {assertDefinitionReceipt(result, batch)} catch (cause) {batch.receiptInvalid = true; throw cause}
    if (hasCapture()) throw new Error(result.message ?? '原定义批次尚未完整核验')
    delete batch.receiptInvalid
    batch.verified = true
    batch.resolution = 'confirmed'
    if (guard.edited.size) throw new Error('原定义核验期间出现新字段编辑；修改已保留，请重新核验')
    return 'confirmed'
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    if (message.startsWith('SPARK_SAVE_NOT_APPLIED:') && !hasCapture()) {
      batch.verified = true
      batch.resolution = 'not-applied'
      return 'not-applied'
    }
    throw cause
  } finally {guard.dispose()}
}

/** Complete workspace recovery: verify the original batch first, then synchronously discard only its captured ids. */
export async function verifyAndDiscardDataSpaceDefinitionCapture(dataSet: DataSet, batch: DataSpaceDefinitionCaptureBatch,
  options: DataSpaceDefinitionRecoveryOptions = {}): Promise<'already-confirmed' | 'confirmed' | 'not-applied' | 'accepted-current'> {
  const signatures = batch.targets.map(target => [target, definitionTargetDraftSignature(target.view, target.ids)] as const)
  const outcome = await verifyDataSpaceDefinitionCapture(dataSet, batch,
    (options.acceptCurrentOnInvalidReceipt ?? true) && batch.receiptInvalid === true)
  const discardLocalChanges = options.discardLocalChanges ?? true
  if (outcome !== 'accepted-current') {
    const hasTargetChanges = batch.targets.some(target => target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id)))
    if ((outcome === 'confirmed' || outcome === 'already-confirmed') && hasTargetChanges && !discardLocalChanges) {
      throw new Error('原定义提交已确认，但目标仍有本地新修改；请明确选择放弃本地新修改并核验')
    }
    for (const [target, signature] of signatures) {
      const currentSignature = definitionTargetDraftSignature(target.view, target.ids)
      if (outcome === 'not-applied' && currentSignature !== signature) {
        throw new Error('完整批次核验期间原目标草稿发生变化；保留修改，请重新核验')
      }
      if ((outcome === 'confirmed' || outcome === 'already-confirmed') && hasTargetChanges && currentSignature !== signature
        && target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id))) {
        throw new Error('完整批次核验后原目标出现新草稿；保留修改，请重新选择放弃本地新修改并核验')
      }
    }
    const byView = new Map<DataView, Set<string>>()
    for (const target of batch.targets) {
      const ids = byView.get(target.view) ?? new Set<string>()
      target.ids.forEach(id => ids.add(id)); byView.set(target.view, ids)
    }
    for (const [view, ids] of byView) view.discardPendingChanges([...ids])
    batch.discarded = true
  }
  return outcome
}
