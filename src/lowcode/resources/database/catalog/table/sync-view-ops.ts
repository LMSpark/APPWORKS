/**
 * @module app:lowcode/resources/database/catalog/table/sync-view-ops
 * 职责：`POST /Table/SyncMetaData/{dbid}/{tableid}` 写命令与未登记视图只读查询编排。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_COMMAND_INPUT_TABLE,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_TABLE_SYNC_META_TABLE,
  DATABASE_UNREGISTERED_VIEW_NAMES_TABLE,
} from '../table-view'

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

export function requireDatabaseTableSyncMetaView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_TABLE_SYNC_META_TABLE, 'default')
  if (!view) throw new Error('同步元数据命令视图缺失')
  return view
}

export async function databaseCatalogQueryUnregisteredViewNames(dataSet: DataSet, dbId: string): Promise<readonly string[]> {
  const inputRow = dataSet.getTable(DATABASE_CATALOG_COMMAND_INPUT_TABLE)?.rows[0]
  if (!inputRow) throw new Error('目录命令输入未就绪')
  inputRow['dbId'] = dbId.trim()
  const view = dataSet.getView(DATABASE_UNREGISTERED_VIEW_NAMES_TABLE, 'default')
  if (!view) throw new Error('未登记视图查询视图缺失')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
  return view.rows.map(row => scalar(row['name'])).filter(Boolean)
}

async function commitSync(dataSet: DataSet, syncView: DataView, id: string): Promise<void> {
  const result = await dataSet.saveChanges({views: [{tableName: syncView.tableName, viewId: syncView.viewId, ids: [id]}]})
  if (!result.success) throw new Error(result.message ?? '同步元数据失败')
}

/**
 * 对选中物理表执行一次同步元数据写命令，成功后刷新字段目录视图。
 */
export type DatabaseCatalogSyncTableMetadataInput = Readonly<{
  dataSet: DataSet
  dbId: string
  tableId: string
  fieldView: DataView
}>

export async function databaseCatalogSyncTableMetadata(input: DatabaseCatalogSyncTableMetadataInput): Promise<void> {
  const {dataSet, fieldView} = input
  const db = input.dbId.trim()
  const table = input.tableId.trim()
  if (!db || !table) throw new Error('同步元数据缺少数据库或表 ID')
  const syncView = requireDatabaseTableSyncMetaView(dataSet)
  if (syncView.hasUnconfirmedSave) throw new Error('上次同步结果尚未确认，请先核验')
  if (syncView.mutating) throw new Error('同步进行中')
  if (syncView.dirtyTracking.hasPendingChanges() || syncView.hasEditingChanges()) syncView.discardPendingChanges()
  await syncView.refresh()
  if (syncView.loadingError) throw syncView.loadingError
  const created = await syncView.addRow({dbid: db, tableid: table})
  const id = syncView.getPkKey(created)
  if (typeof id !== 'string' || !id) throw new Error('同步元数据命令行身份无效')
  try {
    await commitSync(dataSet, syncView, id)
  } catch (error) {
    if (syncView.hasUnconfirmedSave) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- 保存抛错后仍可能未确认
      await commitSync(dataSet, syncView, id)
    } else {
      throw error
    }
  }
  if (fieldView.viewId === DATABASE_CATALOG_FIELD_TABLE_VIEW) {
    const parent = dataSet.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    const parentRow = parent?.rows.find(item => parent.getPkKey(item) === table)
    if (parent && parentRow) parent.setSelectedRows([parentRow])
  }
  await fieldView.refresh()
  if (fieldView.loadingError) throw fieldView.loadingError
}
