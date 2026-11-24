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
export function reportPendingReason(views: readonly DataView[], allowRetainedDraft = false): string | undefined {
  if (views.some(view => view.hasUnconfirmedSave)) return `存在${UNCONFIRMED_HINT}`
  if (views.some(view => view.mutating)) return '报表保存仍在执行'
  if (!allowRetainedDraft && views.some(view => view.hasPendingSavedRowPermissions
    || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) {
    return '报表存在待处理修改，请先处理原记录'
  }
  return undefined
}

function owner(views: readonly DataView[]): DataSet {
  const dataSet = views[0]?.dataSet
  if (!dataSet || views.some(view => view.dataSet !== dataSet)) throw new Error('报表修改缺少同一DataSet')
  return dataSet
}

function originalViewMatches(view: DataView, item: Readonly<{tableName: string; viewId: string}>): boolean {
  return item.tableName === view.tableName && item.viewId === view.viewId
}

/** 只按原DataSet日志处理明确未生效的捕获；日志无法确认草稿完全相同时时保留后续编辑。 */
function discardNotApplied(dataSet: DataSet, reason: string): Error {
  const journal = dataSet.saveJournal
  if (journal.currentRecoverableAction === 'verify-original-receipt') return new Error(`${reason}；${UNCONFIRMED_HINT}`)
  if (journal.currentRecoverableAction !== 'discard-not-applied') {
    return new Error(`${reason}；原保存仍待由SPARK Data核验或继续，请勿重复提交`)
  }
  const partiallyApplied = journal.views.some(item => item.state === 'applied')
  try {
    dataSet.discardSaveJournalNotApplied()
  } catch (cause) {
    let releaseError:unknown
    if(journal.batchId){
      try{dataSet.releaseSettledSaveJournal(journal.batchId)}
      catch(error){releaseError=error}
    }
    return new Error(`${reason}；原未生效草稿已保留，后续编辑未被覆盖或丢弃：${cause instanceof Error ? cause.message : String(cause)}`
      +`${releaseError===undefined?'':`；原批次释放未确认：${releaseError instanceof Error?releaseError.message:String(releaseError)}`}`)
  }
  return new Error(`${reason}；${partiallyApplied ? '原提交部分已确认生效；' : ''}已撤销原捕获中明确未生效的本地修改，请按刷新后的服务端数据核对`)
}

/** 同批提交多个视图；只有全部目标确认后才返回回执。 */
export async function commitReportChanges({label, targets}: ReportSaveRequest): Promise<DataSetSaveChangesResult> {
  const dataSet = owner(targets.map(target => target.view))
  const selection={views:targets.map(target=>
    ({tableName:target.view.tableName,viewId:target.view.viewId,ids:[...target.ids]}))}
  dataSet.prepareSaveJournal(selection)
  let result: Awaited<ReturnType<DataSet['saveChanges']>>
  try {
    result = await dataSet.saveChanges(selection)
  } catch (cause) {
    throw discardNotApplied(dataSet, `${label}失败：${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (!result.success || !result.data) {
    const receipts = result.data?.viewResults.map(item =>
      `${item.tableName}：删除${item.deletedCount}、更新${item.savedCount}、失败${item.failedCount + item.failedEditingRows}`).join('；')
    throw discardNotApplied(dataSet, `${label}未全部成功：${result.error?.message ?? result.message ?? '缺少回执'}${receipts ? `（${receipts}）` : ''}`)
  }
  return result.data
}

/** 只沿原DataSet日志及捕获批核验；确认、部分确认和明确未生效均不重发请求。 */
export async function verifyReportSaves(views: readonly DataView[]): Promise<string> {
  const pending = views.filter(view => view.hasUnconfirmedSave)
  if (pending.length === 0) return '没有待核验的报表保存'
  const dataSet = owner(pending)
  const original = dataSet.saveJournal
  const unknownViews = original.views.filter(item => item.state === 'unknown')
  if (!original.batchId || unknownViews.length === 0
    || unknownViews.some(item => !pending.some(view => originalViewMatches(view, item)))) {
    throw new Error(`原保存捕获已变化或不属于当前报表操作；${UNCONFIRMED_HINT}`)
  }
  let verified: Awaited<ReturnType<DataSet['verifySaveJournal']>>
  try {
    verified = await dataSet.verifySaveJournal()
  } catch (cause) {
    throw new Error(`核验原保存结果：${cause instanceof Error ? cause.message : String(cause)}；${UNCONFIRMED_HINT}`)
  }
  if (verified.batchId !== original.batchId) {
    throw new Error(`原保存批次已被替换，当前结果不能接管；${UNCONFIRMED_HINT}`)
  }
  if (verified.currentRecoverableAction === 'verify-original-receipt') {
    const detail = verified.originalError?.message
    throw new Error(`原保存结果仍未确认${detail ? `：${detail}` : ''}；${UNCONFIRMED_HINT}`)
  }
  if (verified.currentRecoverableAction === 'discard-not-applied') {
    const partiallyApplied = verified.views.some(item => item.state === 'applied')
    try {
      const settled = dataSet.discardSaveJournalNotApplied()
      if (!settled.completed && settled.currentRecoverableAction !== 'none') {
        throw new Error('原保存日志仍有未完成阶段')
      }
    } catch (cause) {
      dataSet.releaseSettledSaveJournal(original.batchId)
      throw new Error(`原保存已确认未生效；后续编辑已作为独立草稿保留：${cause instanceof Error ? cause.message : String(cause)}`)
    }
    return partiallyApplied ? '原保存结果部分已确认生效；明确未生效的原草稿已撤销'
      : '原保存结果已确认未生效，原草稿已撤销'
  }
  if (verified.completed && verified.currentRecoverableAction === 'none') {
    return '原保存结果已确认'
  }
  throw new Error(`原保存结果已核验，但仍有原阶段待处理，请按SPARK Data恢复动作继续；${UNCONFIRMED_HINT}`)
}
