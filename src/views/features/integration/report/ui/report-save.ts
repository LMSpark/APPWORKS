/**
 * @module app:views/features/integration/report/ui/report-save
 * 职责：报表多记录修改（删除、启动版本、绑定模型）的提交前检查、同批提交与失败收敛。
 * 边界：只经调用方DataView所属DataSet提交；结果未确认时保留原捕获交目录核验，明确失败才撤销本地修改，不重发、不承诺事务。
 */
import type {DataSet, DataSetSaveChangesResult, DataView} from '@spark-appworks/spark-data'

export type ReportSaveTarget = Readonly<{view: DataView; ids: ReadonlyArray<string | number>}>
type ReportSaveRequest = Readonly<{label: string; targets: readonly ReportSaveTarget[]}>

export const UNCONFIRMED_HINT = '结果未确认，请在报表目录点击“核验原保存结果”，勿重复操作'

/** 有未确认提交、在途保存或其他待处理修改时返回原因；新操作不能叠加在原状态上。 */
export function reportPendingReason(views: readonly DataView[]): string | undefined {
  if (views.some(view => view.hasUnconfirmedSave)) return `存在${UNCONFIRMED_HINT}`
  if (views.some(view => view.mutating)) return '报表保存仍在执行'
  if (views.some(view => view.hasPendingSavedRowPermissions || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) {
    return '报表存在待处理修改，请先处理原记录'
  }
  return undefined
}

function owner(targets: readonly ReportSaveTarget[]): DataSet {
  const dataSet = targets[0]?.view.dataSet
  if (!dataSet || targets.some(target => target.view.dataSet !== dataSet)) throw new Error('报表修改缺少同一DataSet')
  return dataSet
}

/** 明确失败时撤销本次本地修改并返回带处理说明的错误；仍未确认时保留原捕获。 */
function settle(targets: readonly ReportSaveTarget[], reason: string): Error {
  if (targets.some(target => target.view.hasUnconfirmedSave)) return new Error(`${reason}；${UNCONFIRMED_HINT}`)
  try {
    for (const target of targets) target.view.discardPendingChanges(target.ids)
  } catch (cause) {
    return new Error(`${reason}；撤销本地修改失败：${cause instanceof Error ? cause.message : String(cause)}`)
  }
  return new Error(`${reason}；已撤销本地修改，请按刷新后的服务端数据核对`)
}

/** 同批提交多个视图；只有全部目标确认后才返回回执。 */
export async function commitReportChanges({label, targets}: ReportSaveRequest): Promise<DataSetSaveChangesResult> {
  const dataSet = owner(targets)
  let result: Awaited<ReturnType<DataSet['saveChanges']>>
  try {
    result = await dataSet.saveChanges({views: targets.map(target =>
      ({tableName: target.view.tableName, viewId: target.view.viewId, ids: [...target.ids]}))})
  } catch (cause) {
    throw settle(targets, `${label}失败：${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (!result.success || !result.data) {
    const receipts = result.data?.viewResults.map(item =>
      `${item.tableName}：删除${item.deletedCount}、更新${item.savedCount}、失败${item.failedCount + item.failedEditingRows}`).join('；')
    throw settle(targets, `${label}未全部成功：${result.error?.message ?? result.message ?? '缺少回执'}${receipts ? `（${receipts}）` : ''}`)
  }
  return result.data
}

/** 由原保存入口核验报表视图上未确认的提交；来源证明未生效或部分失败时撤销本地修改。 */
export async function verifyReportSaves(views: readonly DataView[]): Promise<string> {
  const pending = views.filter(view => view.hasUnconfirmedSave)
  if (pending.length === 0) return '没有待核验的报表保存'
  const targets = pending.map(view => ({view, ids: [...view.dirtyTracking.pendingCreateIds, ...view.dirtyTracking.dirtyRowIds,
    ...view.dirtyTracking.pendingDeleteIds]}))
  const dataSet = owner(targets)
  let result: Awaited<ReturnType<DataSet['saveChanges']>>
  try {
    result = await dataSet.saveChanges({views: pending.map(view => ({tableName: view.tableName, viewId: view.viewId}))})
  } catch (cause) {
    throw settle(targets, `核验原保存结果：${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (!result.success) throw settle(targets, `原保存未全部生效：${result.error?.message ?? result.message ?? '缺少回执'}`)
  return '原保存结果已确认'
}
