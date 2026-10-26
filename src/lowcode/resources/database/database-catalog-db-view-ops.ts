/**
 * @module app:lowcode/resources/database/database-catalog-db-view-ops
 * 职责：_base_dbInfo 单行新增编排（非 query/save owner）。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_COMMAND_INPUT_TABLE,
  DATABASE_CATALOG_DB_MODEL,
} from './lowcode-database-table-view'
import {DATABASE_SERVER_MODEL} from './lowcode-database-server'
import {databaseCatalogDbSelectedId} from './database-catalog-table-view-ops'

const createFields = ['serverId', 'Name', 'Type', 'ServerName', 'SchemaName', 'State', 'Remark'] as const
const existingEditFields = ['Name', 'SchemaName', 'Remark'] as const
export type DatabaseCatalogDbEditState = Readonly<{id: string | number; mode: 'add' | 'edit'; row: DataRow}>

export type DatabaseCatalogDbEditingUi = Readonly<{
  id: string | number
  mode: 'add' | 'edit'
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

export function databaseCatalogDbEditing(view: DataView, edit: DatabaseCatalogDbEditState | undefined): DatabaseCatalogDbEditingUi | undefined {
  if (!edit) return undefined
  const unconfirmed = view.hasUnconfirmedSave
  const pending = view.hasEditingChanges(edit.id) || view.dirtyTracking.hasPendingChanges()
  return {id: edit.id, mode: edit.mode, unconfirmed, readbackFailed: !unconfirmed && !pending && !!view.loadingError}
}

function idleDb(view: DataView, edit: DatabaseCatalogDbEditState | undefined): boolean {
  return !edit && !view.mutating && view.requestState === RequestState.Loaded && !view.loadingError
    && !view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges()
}

function selectedServer(view: DataView): Readonly<{id: string; row: DataRow; name: string; type: string}> | undefined {
  if (view.requestState !== RequestState.Loaded || view.loadingError || view.mutating || view.hasUnconfirmedSave
    || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) return undefined
  const id = databaseCatalogServerSelectedId(view)
  const matches = id ? view.rows.filter(item => String(view.getPkKey(item) ?? '') === id) : []
  const serverRow = matches.length === 1 ? matches[0] : undefined
  if (!serverRow || view.fieldAccess(serverRow, 'ServerName').read !== 'visible' || view.fieldAccess(serverRow, 'Type').read !== 'visible') return undefined
  const name = scalar(serverRow['ServerName'])
  const type = scalar(serverRow['Type'])
  return name && type ? {id, row: serverRow, name, type} : undefined
}

export function databaseCatalogDbCanCreate(dbView: DataView, serverView: DataView, edit: DatabaseCatalogDbEditState | undefined): boolean {
  return !!selectedServer(serverView) && idleDb(dbView, edit) && dbView.addActionState() === 'enabled'
}

export async function databaseCatalogDbBeginCreate(dbView: DataView, serverView: DataView): Promise<DatabaseCatalogDbEditState> {
  if (!databaseCatalogDbCanCreate(dbView, serverView, undefined)) throw new Error('当前不能新增数据库')
  const server = selectedServer(serverView)
  if (!server) throw new Error('当前服务器查询结果或服务器字段权限不可用')
  const created = await dbView.addRow({
    serverId: server.id,
    Name: '',
    Type: server.type,
    ServerName: server.name,
    SchemaName: 'dbo',
    State: '1',
    Remark: '',
  })
  const primaryKey = dbView.getPkKey(created)
  if (typeof primaryKey !== 'string' && typeof primaryKey !== 'number') throw new Error('新增数据库行的正式主键无效')
  const id = primaryKey
  const current = dbView.rows.find(item => dbView.getPkKey(item) === id)
  if (!current) throw new Error('新增数据库行未进入原视图')
  const currentServer = selectedServer(serverView)
  if (currentServer?.id !== server.id || currentServer.row !== server.row) {
    dbView.discardPendingChanges([id])
    throw new Error('服务器选择或查询结果已变化，已取消本次新增')
  }
  dbView.setCurrentRowById(id)
  dbView.setSelectedRows([current])
  return {id, mode: 'add', row: current}
}

function selectedDatabaseRow(view: DataView): DataRow | undefined {
  const values = view.getSelectedValues()
  if (values.length !== 1) return undefined
  const matches = view.rows.filter(row => view.getPkKey(row) === values[0])
  return matches.length === 1 ? matches[0] : undefined
}

export function databaseCatalogDbCanEdit(view: DataView, edit: DatabaseCatalogDbEditState | undefined): boolean {
  if (!idleDb(view, edit) || view.hasUnconfirmedSave) return false
  const target = selectedDatabaseRow(view)
  return !!target && view.editActionState(target) === 'enabled'
    && existingEditFields.some(field => {
      const access = view.fieldAccess(target, field)
      return access.read === 'visible' && access.write === 'allowed'
    })
}

export function databaseCatalogDbBeginEdit(view: DataView, target?: DataRow): DatabaseCatalogDbEditState {
  if (!databaseCatalogDbCanEdit(view, undefined)) throw new Error('当前不能编辑此数据库')
  const selected = selectedDatabaseRow(view)
  if (!selected || target && selected !== target) throw new Error('数据库编辑目标或查询已变化')
  const id = view.getPkKey(selected)
  if (typeof id !== 'string' && typeof id !== 'number') throw new Error('数据库编辑目标缺少正式主键')
  view.setCurrentRowById(id)
  return {id, mode: 'edit', row: selected}
}

export function databaseCatalogDbCancelEdit(view: DataView, edit: DatabaseCatalogDbEditState): DatabaseCatalogDbEditState | undefined {
  if (view.hasUnconfirmedSave) throw new Error('请先核验未确认的保存结果')
  if (view.mutating) throw new Error('保存进行中，不能取消')
  const ui = databaseCatalogDbEditing(view, edit)
  if (ui?.readbackFailed) return undefined
  assertEditTarget(view, edit)
  view.discardPendingChanges([edit.id])
  return undefined
}

function assertEditTarget(view: DataView, edit: DatabaseCatalogDbEditState): DataRow {
  const target = view.rows.find(row => view.getPkKey(row) === edit.id)
  const current = view.currentRow
  if (!target || !current || view.getPkKey(current) !== edit.id) {
    throw new Error('数据库编辑目标或查询已变化')
  }
  return target
}

async function commit(dataSet: DataSet, view: DataView, id: string | number): Promise<void> {
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  if (!result.success) throw new Error(result.message ?? '数据库保存失败')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
  if (!view.rows.some(row => view.getPkKey(row) === id)) throw new Error(`数据库保存回执成功，但重新读取目录未见该记录（${id}），请勿重复提交`)
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
  if (view.requestState !== RequestState.Loaded || view.loadingError) throw new Error('数据库目录尚未加载完成，不能保存')
  const target = assertEditTarget(view, edit)
  const patch = view.getEditingPatch(edit.id) ?? {}
  const value = view.getEditingRow(edit.id)
  if (!value) throw new Error('数据库编辑记录已失效')
  const allowedSet = new Set<string>(edit.mode === 'add' ? createFields : existingEditFields)
  if (Object.keys(patch).some(field => !allowedSet.has(field))) throw new Error('数据库保存包含不允许修改的字段')
  if (edit.mode === 'add') {
    if (view.addActionState() !== 'enabled') throw new Error('数据库保存权限已变化')
    if (view.fieldAccess(target, 'Name').write !== 'allowed') throw new Error('数据库名称字段当前不可写，不能新增')
  } else {
    if (view.editActionState(target) !== 'enabled') throw new Error('数据库保存权限或目标查询已变化')
  }
  const editableFields = edit.mode === 'add' ? createFields : existingEditFields
  for (const field of editableFields) {
    if (!Object.hasOwn(patch, field) && field !== 'Name') continue
    if (view.fieldAccess(target, field).write !== 'allowed') {
      if (Object.hasOwn(patch, field)) throw new Error(`数据库字段 ${field} 当前不可写，不能保存`)
      continue
    }
    if (edit.mode === 'edit' && Object.hasOwn(patch, field) && view.fieldAccess(target, field).read !== 'visible') {
      throw new Error(`数据库字段 ${field} 当前不可读，不能保存`)
    }
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

export async function databaseCatalogQueryUnregisteredDbNames(
  dataSet: DataSet,
  serverId: string,
  tables: Readonly<{commandInput: string; unregisteredDbNames: string}>,
): Promise<readonly string[]> {
  const inputRow = dataSet.getTable(tables.commandInput)?.rows[0]
  if (!inputRow) throw new Error('目录命令输入未就绪')
  inputRow['serverId'] = serverId.trim()
  const view = dataSet.getView(tables.unregisteredDbNames, 'default')
  if (!view) throw new Error('未登记库查询视图缺失')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
  return view.rows.map(item => scalar(item['name'])).filter(Boolean)
}

/** 同步命令视图输入与当前选中数据库；不隐式选择服务器或数据库。 */
export function databaseCatalogSyncCommandInput(dataSet: DataSet, dbView?: DataView): void {
  const inputRow = dataSet.getTable(DATABASE_CATALOG_COMMAND_INPUT_TABLE)?.rows[0]
  if (!inputRow) return
  if (dbView) {
    const selected = dbView.getSelectedValues()
    const selectedRow = selected.length === 1
      ? dbView.rows.find(item => dbView.getPkKey(item) === selected[0])
      : undefined
    const serverId = selectedRow?.['serverId']
    if (typeof serverId === 'string' && serverId.trim()) inputRow['serverId'] = serverId.trim()
    const dbId = databaseCatalogDbSelectedId(dbView)
    if (dbId) inputRow['dbId'] = dbId
  }
}
