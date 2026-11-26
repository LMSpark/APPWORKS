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
