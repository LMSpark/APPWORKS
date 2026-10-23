/**
 * @module app:lowcode/resources/database/database-catalog-object-view-ops
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
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  if (!result.success) {
    if (!view.hasUnconfirmedSave) view.discardPendingChanges([id])
    throw new Error(result.message ?? '删除失败')
  }
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}
