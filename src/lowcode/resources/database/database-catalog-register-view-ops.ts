/**
 * @module app:lowcode/resources/database/database-catalog-register-view-ops
 * 职责：`POST /Table/registerTable/{dbid}`、`POST /View/registerView/{dbid}` 写命令编排。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_TABLE_REGISTER_TABLE,
  DATABASE_VIEW_REGISTER_TABLE,
} from './lowcode-database-table-view'

export type DatabaseCatalogRegisterTableItem = Readonly<{
  tableName: string
  tableComment: string
  addDefaultFields: boolean
}>

export type DatabaseCatalogRegisterViewItem = Readonly<{
  viewName: string
  viewComment: string
}>

export function requireDatabaseTableRegisterView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_TABLE_REGISTER_TABLE, 'default')
  if (!view) throw new Error('注册数据表命令视图缺失')
  return view
}

export function requireDatabaseViewRegisterView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_VIEW_REGISTER_TABLE, 'default')
  if (!view) throw new Error('注册视图命令视图缺失')
  return view
}

async function commitCommand(dataSet: DataSet, view: DataView, id: string): Promise<void> {
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  if (!result.success) throw new Error(result.message ?? '注册命令提交失败')
}

async function runRegisterCommand(
  dataSet: DataSet,
  view: DataView,
  row: Record<string, unknown>,
): Promise<void> {
  if (view.hasUnconfirmedSave) throw new Error('上次注册结果尚未确认，请先核验')
  if (view.mutating) throw new Error('注册进行中')
  if (view.dirtyTracking.hasPendingChanges() || view.hasEditingChanges()) view.discardPendingChanges()
  await view.refresh()
  if (view.loadingError) throw view.loadingError
  const created = await view.addRow(row)
  const id = view.getPkKey(created)
  if (typeof id !== 'string' || !id) throw new Error('注册命令行身份无效')
  try {
    await commitCommand(dataSet, view, id)
  } catch (error) {
    if (view.hasUnconfirmedSave) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- 保存抛错后仍可能未确认
      await commitCommand(dataSet, view, id)
    } else {
      throw error
    }
  }
}

async function registerTableItem(
  dataSet: DataSet,
  dbId: string,
  item: DatabaseCatalogRegisterTableItem,
): Promise<void> {
  const tableName = item.tableName.trim()
  if (!tableName) throw new Error('表名不能为空')
  const view = requireDatabaseTableRegisterView(dataSet)
  await runRegisterCommand(dataSet, view, {
    dbid: dbId.trim(),
    tableName,
    tableComment: item.tableComment.trim(),
    addDefaultFields: item.addDefaultFields ? '1' : '0',
  })
  const catalog = dataSet.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
  if (!catalog) return
  await catalog.refresh()
  if (catalog.loadingError) throw catalog.loadingError
}

async function registerViewItem(
  dataSet: DataSet,
  dbId: string,
  item: DatabaseCatalogRegisterViewItem,
): Promise<void> {
  const viewName = item.viewName.trim()
  if (!viewName) throw new Error('视图名不能为空')
  const view = requireDatabaseViewRegisterView(dataSet)
  await runRegisterCommand(dataSet, view, {
    dbid: dbId.trim(),
    viewName,
    viewComment: item.viewComment.trim(),
  })
  const catalog = dataSet.getView(DATABASE_CATALOG_VIEW_MODEL, 'default')
  if (!catalog) return
  await catalog.refresh()
  if (catalog.loadingError) throw catalog.loadingError
}

/** 批量注册物理表（每项一次写命令；与参考 POST 数组语义等价，按项拆分提交）。 */
export async function databaseCatalogRegisterTables(
  dataSet: DataSet,
  dbId: string,
  items: readonly DatabaseCatalogRegisterTableItem[],
): Promise<void> {
  const db = dbId.trim()
  if (!db) throw new Error('请先选择数据库')
  if (items.length === 0) throw new Error('请至少选择一个表')
  for (const item of items) await registerTableItem(dataSet, db, item)
}

/** 批量注册物理视图。 */
export async function databaseCatalogRegisterViews(
  dataSet: DataSet,
  dbId: string,
  items: readonly DatabaseCatalogRegisterViewItem[],
): Promise<void> {
  const db = dbId.trim()
  if (!db) throw new Error('请先选择数据库')
  if (items.length === 0) throw new Error('请至少选择一个视图')
  for (const item of items) await registerViewItem(dataSet, db, item)
}
