/**
 * @module app:lowcode/resources/database/database-catalog-db-view-ops
 * 职责：_base_dbInfo 注册/编辑编排（非 query/save owner）。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DATABASE_CATALOG_DB_MODEL} from './lowcode-database-table-view'
import {DATABASE_SERVER_MODEL} from './lowcode-database-server'

const createFields = ['serverId', 'Name', 'Type', 'ServerName', 'SchemaName', 'State', 'Remark'] as const

export type DatabaseCatalogDbEditState = Readonly<{id: string; mode: 'add'; row: DataRow}>

export type DatabaseCatalogDbEditingUi = Readonly<{
  id: string
  mode: 'add'
  unconfirmed: boolean
  readbackFailed: boolean
}>

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value).trim()
  throw new Error('数据库目录字段不是可呈现的标量值')
}

export function requireDatabaseCatalogDbView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_CATALOG_DB_MODEL, 'default')
  if (!view) throw new Error('数据库目录缺少正式视图')
  if (view.commitMode !== 'staged') throw new Error('数据库目录视图必须配置暂存提交')
  return view
}

export function requireDatabaseCatalogServerView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_SERVER_MODEL, 'default')
  if (!view) throw new Error('服务器目录缺少正式视图')
  return view
}

export function databaseCatalogServerSelectedId(view: DataView): string {
  const values = view.getSelectedValues()
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
}

function row(view: DataView, id: string): DataRow | undefined {
  return view.rows.find(item => view.getPkKey(item) === id)
}

export function databaseCatalogDbEditing(view: DataView, edit: DatabaseCatalogDbEditState | undefined): DatabaseCatalogDbEditingUi | undefined {
  if (!edit) return undefined
  const unconfirmed = view.hasUnconfirmedSave
  const pending = view.hasEditingChanges(edit.id) || view.dirtyTracking.hasPendingChanges()
  return {id: edit.id, mode: 'add', unconfirmed, readbackFailed: !unconfirmed && !pending && !!view.loadingError}
}

function idleDb(view: DataView, edit: DatabaseCatalogDbEditState | undefined): boolean {
  return !edit && !view.mutating && view.requestState === RequestState.Loaded && !view.loadingError
    && !view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges()
}

export function databaseCatalogDbCanCreate(dbView: DataView, serverView: DataView, edit: DatabaseCatalogDbEditState | undefined): boolean {
  const serverId = databaseCatalogServerSelectedId(serverView)
  const serverRow = serverId ? row(serverView, serverId) : undefined
  return !!serverRow && idleDb(dbView, edit) && dbView.addActionState() === 'enabled'
}

export async function databaseCatalogDbBeginCreate(dbView: DataView, serverView: DataView): Promise<DatabaseCatalogDbEditState> {
  if (!databaseCatalogDbCanCreate(dbView, serverView, undefined)) throw new Error('当前不能注册数据库')
  const serverId = databaseCatalogServerSelectedId(serverView)
  const serverRow = serverId ? row(serverView, serverId) : undefined
  if (!serverRow) throw new Error('请先选择服务器')
  const serverName = scalar(serverRow['ServerName'])
  const serverType = scalar(serverRow['Type'])
  const created = await dbView.addRow({
    serverId,
    Name: '',
    Type: serverType || 'MYSQL',
    ServerName: serverName,
    SchemaName: 'dbo',
    State: '1',
    Remark: '',
  })
  if (!('rowid' in created) || typeof created['rowid'] !== 'string') throw new Error('新增数据库行的身份无效')
  const id = created['rowid']
  const current = row(dbView, id)
  if (!current) throw new Error('新增数据库行未进入原视图')
  dbView.setCurrentRowById(id)
  dbView.setSelectedRows([current])
  return {id, mode: 'add', row: current}
}

export function databaseCatalogDbCancelEdit(view: DataView, edit: DatabaseCatalogDbEditState): DatabaseCatalogDbEditState | undefined {
  if (view.hasUnconfirmedSave) throw new Error('请先核验未确认的保存结果')
  if (view.mutating) throw new Error('保存进行中，不能取消')
  const ui = databaseCatalogDbEditing(view, edit)
  if (ui?.readbackFailed) return undefined
  if (view.currentRow !== edit.row || !view.rows.includes(edit.row)) throw new Error('数据库编辑目标或查询已变化')
  view.discardPendingChanges([edit.id])
  return undefined
}

async function commit(dataSet: DataSet, view: DataView, id: string): Promise<void> {
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  if (!result.success) throw new Error(result.message ?? '数据库保存失败')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

export async function databaseCatalogDbSaveEdit(
  dataSet: DataSet,
  view: DataView,
  edit: DatabaseCatalogDbEditState,
): Promise<DatabaseCatalogDbEditState | undefined> {
  if (view.mutating) throw new Error('当前编辑不能重复提交')
  const ui = databaseCatalogDbEditing(view, edit)
  if (view.hasUnconfirmedSave) {
    await commit(dataSet, view, edit.id)
    return undefined
  }
  if (ui?.readbackFailed) {
    await view.refresh()
    if (view.loadingError) throw view.loadingError
    return undefined
  }
  if (view.currentRow !== edit.row || !view.rows.includes(edit.row)) throw new Error('数据库编辑目标或查询已变化')
  const patch = view.getEditingPatch(edit.id) ?? {}
  const value = view.getEditingRow(edit.id)
  if (!value) throw new Error('数据库编辑记录已失效')
  const allowedSet = new Set<string>(createFields)
  if (Object.keys(patch).some(field => !allowedSet.has(field))) throw new Error('数据库保存包含不允许修改的字段')
  if (view.addActionState() !== 'enabled') throw new Error('数据库保存权限已变化')
  for (const field of createFields) {
    if (!Object.hasOwn(patch, field) && field !== 'Name') continue
    if (view.fieldAccess(edit.row, field).write !== 'allowed') continue
    const input = value[field]
    if (typeof input !== 'string' && typeof input !== 'number') throw new Error(`字段 ${field} 必须是文本或数字`)
    const text = scalar(input)
    if (field === 'Name' && !text) throw new Error('请填写数据库名称')
    if (text !== scalar(input)) view.updateEditingValue(edit.id, field, text)
  }
  if (!view.hasEditingChanges(edit.id)) return undefined
  await commit(dataSet, view, edit.id)
  return undefined
}
