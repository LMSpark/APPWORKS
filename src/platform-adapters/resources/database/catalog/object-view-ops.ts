/**
 * @module app:lowcode/resources/database/catalog/object-view-ops
 * 职责：_Base_TblList / _Base_ViewList 目录行删除（模型 remove + saveChanges）。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'

function row(view: DataView, id: string) {
  return view.rows.find(item => view.getPkKey(item) === id)
}

export function databaseCatalogCanDeleteRow(view: DataView, id: string): boolean {
  if (!id || view.mutating || view.hasUnconfirmedSave) return false
  const target = row(view, id)
  if (!target) return false
  return view.deleteActionState(target) === 'enabled'
}

export async function databaseCatalogDeleteRow(dataSet: DataSet, view: DataView, id: string): Promise<void> {
  if (!databaseCatalogCanDeleteRow(view, id)) throw new Error('当前不能删除该记录')
  const target = row(view, id)
  if (!target) throw new Error('删除目标已变化')
  await view.removeRow(id)
  if (!view.dirtyTracking.isPendingDelete(id)) throw new Error('原记录未暂存删除')
  const receipt = await dataSet.saveRecord(view, id).catch((cause: unknown) => {
    if (!view.hasUnconfirmedSave) view.discardPendingChanges([id])
    throw cause
  })
  if (receipt.followUpError) throw new Error(`删除已确认，后续处理失败：${receipt.followUpError.message}`, {cause: receipt.followUpError})
  const readback = await view.requestRefresh({defer: false})
  if (readback.refreshStatus !== 'read') {
    throw new Error(`删除已确认，目录回读失败：${readback.error?.message ?? readback.message ?? '未完成本次读取'}`, {cause: readback.error})
  }
}
