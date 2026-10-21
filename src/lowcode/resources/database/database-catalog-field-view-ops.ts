/**
 * @module app:lowcode/resources/database/database-catalog-field-view-ops
 * 职责：Base_TblField 字段目录 staged 保存编排（非 query/save owner）。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_FIELD_VIEW_VIEW,
} from './lowcode-database-table-view'

export type DatabaseCatalogFieldViewId = typeof DATABASE_CATALOG_FIELD_TABLE_VIEW | typeof DATABASE_CATALOG_FIELD_VIEW_VIEW

export function requireDatabaseCatalogFieldView(dataSet: DataSet, viewId: DatabaseCatalogFieldViewId): DataView {
  const view = dataSet.getView(DATABASE_CATALOG_FIELD_MODEL, viewId)
  if (!view) throw new Error('字段目录缺少正式视图')
  if (view.commitMode !== 'staged') throw new Error('字段目录视图必须配置暂存提交')
  return view
}

export function databaseCatalogFieldCanSave(view: DataView): boolean {
  return view.requestState === RequestState.Loaded && !view.loadingError && !view.mutating && !view.hasUnconfirmedSave
    && (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())
}

async function commit(dataSet: DataSet, view: DataView): Promise<void> {
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
  if (!result.success) throw new Error(result.message ?? '字段保存失败')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

export async function databaseCatalogFieldSavePending(dataSet: DataSet, view: DataView): Promise<void> {
  if (view.mutating) throw new Error('字段保存进行中')
  if (view.hasUnconfirmedSave) {
    await commit(dataSet, view)
    return
  }
  if (!databaseCatalogFieldCanSave(view)) return
  await commit(dataSet, view)
}
