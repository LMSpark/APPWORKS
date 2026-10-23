/**
 * @module app:lowcode/resources/database/database-catalog-field-view-ops
 * 职责：Base_TblField 字段目录 staged 保存编排（非 query/save owner）。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  type DATABASE_CATALOG_FIELD_TABLE_VIEW,
  type DATABASE_CATALOG_FIELD_VIEW_VIEW,
} from './lowcode-database-table-view'

export type DatabaseCatalogFieldViewId = typeof DATABASE_CATALOG_FIELD_TABLE_VIEW | typeof DATABASE_CATALOG_FIELD_VIEW_VIEW

export function requireDatabaseCatalogFieldView(dataSet: DataSet, viewId: DatabaseCatalogFieldViewId): DataView {
  const view = dataSet.getView(DATABASE_CATALOG_FIELD_MODEL, viewId)
  if (!view) throw new Error('字段目录缺少正式视图')
  if (view.commitMode !== 'staged') throw new Error('字段目录视图必须配置暂存提交')
  return view
}

export function databaseCatalogStagedViewCanSave(view: DataView): boolean {
  return view.requestState === RequestState.Loaded && !view.loadingError && !view.mutating && !view.hasUnconfirmedSave
    && (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())
}

export function databaseCatalogFieldCanSave(view: DataView): boolean {
  return databaseCatalogStagedViewCanSave(view)
}

export function databaseCatalogDesignCanSave(fieldView: DataView, objectView?: DataView, extraViews: readonly DataView[] = []): boolean {
  if (databaseCatalogStagedViewCanSave(fieldView)) return true
  if (objectView && databaseCatalogStagedViewCanSave(objectView)) return true
  return extraViews.some(view => databaseCatalogStagedViewCanSave(view))
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

export type DatabaseCatalogDesignSavePendingInput = Readonly<{
  dataSet: DataSet
  fieldView: DataView
  objectView?: DataView
  extraViews?: readonly DataView[]
}>

export async function databaseCatalogDesignSavePending(input: DatabaseCatalogDesignSavePendingInput): Promise<void> {
  const {dataSet, fieldView, objectView} = input
  const extraViews = input.extraViews ?? []
  const stagedExtras = extraViews.filter(view => databaseCatalogStagedViewCanSave(view))
  if (fieldView.mutating || objectView?.mutating || stagedExtras.some(view => view.mutating)) throw new Error('设计保存进行中')
  if (fieldView.hasUnconfirmedSave || objectView?.hasUnconfirmedSave || extraViews.some(view => view.hasUnconfirmedSave)) {
    if (fieldView.hasUnconfirmedSave) await commit(dataSet, fieldView)
    if (objectView?.hasUnconfirmedSave) await commit(dataSet, objectView)
    for (const view of extraViews) {
      if (view.hasUnconfirmedSave) await commit(dataSet, view)
    }
    return
  }
  const targets = [
    ...(databaseCatalogStagedViewCanSave(fieldView) ? [fieldView] : []),
    ...(objectView && databaseCatalogStagedViewCanSave(objectView) ? [objectView] : []),
    ...stagedExtras,
  ]
  if (targets.length === 0) return
  const result = await dataSet.saveChanges({views: targets.map(view => ({tableName: view.tableName, viewId: view.viewId}))})
  if (!result.success) throw new Error(result.message ?? '设计保存失败')
  for (const view of targets) {
    await view.refresh()
    if (view.loadingError) throw view.loadingError
  }
}
