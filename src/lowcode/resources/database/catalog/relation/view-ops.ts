/**
 * @module app:lowcode/resources/database/catalog/relation/view-ops
 * 职责：Base_TblRln 按当前表 ID 查询（OR pktbid/fktbid）及目录删除。
 */
import {DataViewFilter, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_RELATION_MODEL,
  DATABASE_CATALOG_RELATION_TABLE_VIEW,
} from '../table-view'
import {databaseCatalogCanDeleteRow, databaseCatalogDeleteRow} from '../object-view-ops'

export function databaseCatalogHasRelationCatalog(dataSet: DataSet): boolean {
  return Boolean(dataSet.getView(DATABASE_CATALOG_RELATION_MODEL, DATABASE_CATALOG_RELATION_TABLE_VIEW))
}

export function requireDatabaseCatalogRelationView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_CATALOG_RELATION_MODEL, DATABASE_CATALOG_RELATION_TABLE_VIEW)
  if (!view) throw new Error('表关系目录未装配（Base_TblRln）')
  if (view.commitMode !== 'staged') throw new Error('表关系视图必须配置暂存提交')
  return view
}

export async function databaseCatalogRelationRefreshForTable(view: DataView, tableId: string): Promise<void> {
  const id = tableId.trim()
  if (!id) throw new Error('缺少表 ID，无法查询表关系')
  const filter = DataViewFilter.group({
    logic: 'or',
    filters: [
      {field: 'pktbid', operator: 'eq', value: id},
      {field: 'fktbid', operator: 'eq', value: id},
    ],
  })
  await view.setFilter(filter.toJSON())
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

export function databaseCatalogRelationCanDeleteSelected(view: DataView): boolean {
  const id = view.getSelectedValues()[0]
  return typeof id === 'string' && databaseCatalogCanDeleteRow(view, id)
}

export async function databaseCatalogRelationDeleteSelected(dataSet: DataSet, view: DataView): Promise<void> {
  const id = view.getSelectedValues()[0]
  if (typeof id !== 'string') throw new Error('请先选择要删除的关系')
  await databaseCatalogDeleteRow(dataSet, view, id)
  view.clearSelectedRows()
}
