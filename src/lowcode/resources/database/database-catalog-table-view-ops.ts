/**
 * @module app:lowcode/resources/database/database-catalog-table-view-ops
 * 职责：_Base_TblList 注册表编排（非 query/save owner）。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_COMMAND_INPUT_TABLE,
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_UNREGISTERED_TABLE_NAMES_TABLE,
} from './lowcode-database-table-view'

const createFields = ['dbid', 'tblname', 'tbldesc', 'schemaName', 'status'] as const

export type DatabaseCatalogTableEditState = Readonly<{id: string; mode: 'add'; row: DataRow}>

export type DatabaseCatalogTableEditingUi = Readonly<{
  id: string
  mode: 'add'
  unconfirmed: boolean
  readbackFailed: boolean
}>

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value).trim()
  throw new Error('数据表目录字段不是可呈现的标量值')
}

export function requireDatabaseCatalogTableView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
  if (!view) throw new Error('数据表目录缺少正式视图')
  if (view.commitMode !== 'staged') throw new Error('数据表目录视图必须配置暂存提交')
  return view
}

export function requireDatabaseCatalogDbViewForTable(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_CATALOG_DB_MODEL, 'default')
  if (!view) throw new Error('数据库目录缺少正式视图')
  return view
}

export function databaseCatalogDbSelectedId(view: DataView): string {
  const values = view.getSelectedValues()
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
}

function row(view: DataView, id: string): DataRow | undefined {
  return view.rows.find(item => view.getPkKey(item) === id)
}

export function databaseCatalogTableEditing(view: DataView, edit: DatabaseCatalogTableEditState | undefined): DatabaseCatalogTableEditingUi | undefined {
  if (!edit) return undefined
  const unconfirmed = view.hasUnconfirmedSave
  const pending = view.hasEditingChanges(edit.id) || view.dirtyTracking.hasPendingChanges()
  return {id: edit.id, mode: 'add', unconfirmed, readbackFailed: !unconfirmed && !pending && !!view.loadingError}
}

function idleTable(view: DataView, edit: DatabaseCatalogTableEditState | undefined): boolean {
  return !edit && !view.mutating && view.requestState === RequestState.Loaded && !view.loadingError
    && !view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges()
}

export function databaseCatalogTableCanCreate(tableView: DataView, dbView: DataView, edit: DatabaseCatalogTableEditState | undefined): boolean {
  const dbId = databaseCatalogDbSelectedId(dbView)
  const dbRow = dbId ? row(dbView, dbId) : undefined
  return !!dbRow && idleTable(tableView, edit) && tableView.addActionState() === 'enabled'
}

export async function databaseCatalogTableBeginCreate(tableView: DataView, dbView: DataView): Promise<DatabaseCatalogTableEditState> {
  if (!databaseCatalogTableCanCreate(tableView, dbView, undefined)) throw new Error('当前不能注册数据表')
  const dbId = databaseCatalogDbSelectedId(dbView)
  const dbRow = dbId ? row(dbView, dbId) : undefined
  if (!dbRow) throw new Error('请先选择数据库')
  const schemaName = scalar(dbRow['SchemaName']) || 'dbo'
  const created = await tableView.addRow({
    dbid: dbId,
    tblname: '',
    tbldesc: '',
    schemaName,
    status: '1',
  })
  if (!('rowid' in created) || typeof created['rowid'] !== 'string') throw new Error('新增数据表行的身份无效')
  const id = created['rowid']
  const current = row(tableView, id)
  if (!current) throw new Error('新增数据表行未进入原视图')
  tableView.setCurrentRowById(id)
  tableView.setSelectedRows([current])
  return {id, mode: 'add', row: current}
}

export function databaseCatalogTableCancelEdit(view: DataView, edit: DatabaseCatalogTableEditState): DatabaseCatalogTableEditState | undefined {
  if (view.hasUnconfirmedSave) throw new Error('请先核验未确认的保存结果')
  if (view.mutating) throw new Error('保存进行中，不能取消')
  const ui = databaseCatalogTableEditing(view, edit)
  if (ui?.readbackFailed) return undefined
  if (view.currentRow !== edit.row || !view.rows.includes(edit.row)) throw new Error('数据表编辑目标或查询已变化')
  view.discardPendingChanges([edit.id])
  return undefined
}

async function commit(dataSet: DataSet, view: DataView, id: string): Promise<void> {
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  if (!result.success) throw new Error(result.message ?? '数据表保存失败')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

export async function databaseCatalogTableSaveEdit(
  dataSet: DataSet,
  view: DataView,
  edit: DatabaseCatalogTableEditState,
): Promise<DatabaseCatalogTableEditState | undefined> {
  if (view.mutating) throw new Error('当前编辑不能重复提交')
  const ui = databaseCatalogTableEditing(view, edit)
  if (view.hasUnconfirmedSave) {
    await commit(dataSet, view, edit.id)
    return undefined
  }
  if (ui?.readbackFailed) {
    await view.refresh()
    if (view.loadingError) throw view.loadingError
    return undefined
  }
  if (view.currentRow !== edit.row || !view.rows.includes(edit.row)) throw new Error('数据表编辑目标或查询已变化')
  const patch = view.getEditingPatch(edit.id) ?? {}
  const value = view.getEditingRow(edit.id)
  if (!value) throw new Error('数据表编辑记录已失效')
  const allowedSet = new Set<string>(createFields)
  if (Object.keys(patch).some(field => !allowedSet.has(field))) throw new Error('数据表保存包含不允许修改的字段')
  if (view.addActionState() !== 'enabled') throw new Error('数据表保存权限已变化')
  for (const field of createFields) {
    if (!Object.hasOwn(patch, field) && field !== 'tblname') continue
    if (view.fieldAccess(edit.row, field).write !== 'allowed') continue
    const input = value[field]
    if (typeof input !== 'string' && typeof input !== 'number') throw new Error(`字段 ${field} 必须是文本或数字`)
    const text = scalar(input)
    if (field === 'tblname' && !text) throw new Error('请填写表名')
    if (text !== scalar(input)) view.updateEditingValue(edit.id, field, text)
  }
  if (!view.hasEditingChanges(edit.id)) return undefined
  await commit(dataSet, view, edit.id)
  return undefined
}

export async function databaseCatalogQueryUnregisteredTableNames(dataSet: DataSet, dbId: string): Promise<readonly string[]> {
  const inputRow = dataSet.getTable(DATABASE_CATALOG_COMMAND_INPUT_TABLE)?.rows[0]
  if (!inputRow) throw new Error('目录命令输入未就绪')
  inputRow['dbId'] = dbId.trim()
  const view = dataSet.getView(DATABASE_UNREGISTERED_TABLE_NAMES_TABLE, 'default')
  if (!view) throw new Error('未登记表查询视图缺失')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
  return view.rows.map(item => scalar(item['name'])).filter(Boolean)
}
