/**
 * @module app:views/features/integration/report/ui/report-save
 * 职责：报表多记录修改（删除、启动版本、绑定模型）的提交前检查、同批提交与失败收敛。
 * 边界：只经调用方DataView所属DataSet提交；结果未确认时保留原捕获交目录核验，明确失败才撤销本地修改，不重发、不承诺事务。
 */
import type {DataRow, DataSet, DataSetSaveChangesResult, DataView} from '@spark-appworks/spark-data'

export type ReportSaveTarget = Readonly<{view: DataView; ids: ReadonlyArray<string | number>}>
type ReportSaveRequest = Readonly<{label: string; kind: 'delete' | 'update'; targets: readonly ReportSaveTarget[]}>

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
function discardNotApplied(dataSet: DataSet, batchId: string | null, reason: string): Error {
  const journal = dataSet.saveJournal
  if (!batchId || journal.batchId !== batchId) return new Error(`${reason}；原保存批次已变化，保留当前草稿`)
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

/**
 * 同值仅从当前正式原行确认。其余字段交给原视图的编辑权限处理。
 * @param view 原查询所属的报表数据视图。
 * @param row 当前视图中的正式原行。
 * @param values 本次操作声明的目标字段值。
 * @returns 是否暂存了至少一个字段。
 */
export function stageReportUpdate(view: DataView, row: DataRow, values: Readonly<Record<string, unknown>>): boolean {
  const id = view.getPkKey(row)
  if (id === undefined) throw new Error('报表修改缺少正式主键')
  let changed = false
  for (const [field, value] of Object.entries(values)) {
    if (view.fieldAccess(row, field).read === 'visible' && Object.is(row[field], value)) {
      try {
        view.captureReadRow(row, [field])()
        continue
      } catch {
        // 未证明同值时仍由原视图校验编辑，回执决定是否确认。
      }
    }
    view.updateEditingValue(id, field, value)
    changed = true
  }
  return changed
}

/** 同批提交多个视图；只有全部目标确认后才返回回执。 */
export async function commitReportChanges({label, kind, targets}: ReportSaveRequest): Promise<DataSetSaveChangesResult> {
  const dataSet = owner(targets.map(target => target.view))
  const required = targets.filter(target => target.ids.length > 0)
  const selection={views:required.map(target=>
    ({tableName:target.view.tableName,viewId:target.view.viewId,ids:[...target.ids]}))}
  const batchId = dataSet.prepareSaveJournal(selection).batchId
  let result: Awaited<ReturnType<DataSet['saveChanges']>>
  try {
    result = await dataSet.saveChanges(selection)
  } catch (cause) {
    throw discardNotApplied(dataSet, batchId, `${label}失败：${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (!result.success || !result.data) {
    const receipts = result.data?.viewResults.map(item =>
      `${item.tableName}：删除${item.deletedCount}、更新${item.savedCount}、失败${item.failedCount + item.failedEditingRows}`).join('；')
    throw discardNotApplied(dataSet, batchId, `${label}未全部成功：${result.error?.message ?? result.message ?? '缺少回执'}${receipts ? `（${receipts}）` : ''}`)
  }
  if (!batchId || dataSet.saveJournal.batchId !== batchId) throw new Error(`${label}缺少本次原报表批次，未确认结果`)
  const batch = result.data
  const counts = required.map(target => {
    const receipt = batch.viewResults.find(item => item.tableName === target.view.tableName && item.viewId === target.view.viewId)
    const expected = new Set(target.ids).size
    const written = receipt ? (kind === 'delete' ? receipt.deletedCount : receipt.savedCount) : 0
    const total = receipt ? receipt.createdCount + receipt.savedCount + receipt.deletedCount : 0
    return {all: written === expected && total === written, total}
  })
  if (!counts.some(item => item.total > 0)) throw new Error(`${label}没有已确认的报表保存回执`)
  if (!counts.every(item => item.all)) throw new Error(`${label}不完整，报表保存仅部分确认，请核对原报表与版本`)
  return batch
}

/** 回读调用方声明的视图，保留已获回执，并说明本次读取失败或延期。 */
export async function reportSaveReadback(views: readonly DataView[], scope: string): Promise<string | undefined> {
  const results = await Promise.allSettled(views.map(view => view.requestRefresh()))
  const errors = results.flatMap(result => {
    if (result.status === 'rejected') {
      return [result.reason instanceof Error ? result.reason.message : String(result.reason)]
    }
    return result.value.success ? [] : [result.value.message ?? '原读取视图已失效']
  })
  if (errors.length > 0) return `${scope}回读失败：${errors.join('；')}`
  if (results.some(result => result.status === 'fulfilled' && result.value.refreshStatus === 'deferred')) {
    return `${scope}回读已延期`
  }
  return undefined
}
