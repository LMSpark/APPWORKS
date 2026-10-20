/**
 * @module app:lowcode/resources/database/database-server-view-ops
 * 职责：服务器目录页的 DataView 编排（非 query/save owner；后端 owner 仅在装配时 bind 到 DataView）。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DATABASE_SERVER_MODEL} from './lowcode-database-server'

const createFields = ['Type', 'ServerName', 'ip_address', 'Port', 'description', 'UserName', 'Password'] as const
const editFields = ['Type', 'ServerName', 'ip_address', 'Port', 'description'] as const

export type DatabaseServerEditState = Readonly<{id: string; mode: 'add' | 'edit'; row: DataRow}>

export type DatabaseServerEditingUi = Readonly<{
  id: string
  mode: 'add' | 'edit'
  unconfirmed: boolean
  readbackFailed: boolean
}>

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value).trim()
  throw new Error('服务器目录字段不是可呈现的标量值')
}

export function requireDatabaseServerView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_SERVER_MODEL, 'default')
  if (!view) throw new Error('服务器目录缺少正式视图')
  if (view.commitMode !== 'staged') throw new Error('服务器目录视图必须配置暂存提交')
  view.autoSelectFirst = false
  view.autoCurrentFirst = false
  return view
}

export function databaseServerSelectedId(view: DataView): string {
  const values = view.getSelectedValues()
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
}

function row(view: DataView, id: string): DataRow | undefined {
  return view.rows.find(item => view.getPkKey(item) === id)
}

export function databaseServerEditing(view: DataView, edit: DatabaseServerEditState | undefined): DatabaseServerEditingUi | undefined {
  if (!edit) return undefined
  const unconfirmed = view.hasUnconfirmedSave
  const pending = view.hasEditingChanges(edit.id) || view.dirtyTracking.hasPendingChanges()
  return {id: edit.id, mode: edit.mode, unconfirmed, readbackFailed: !unconfirmed && !pending && !!view.loadingError}
}

function idle(view: DataView, edit: DatabaseServerEditState | undefined): boolean {
  return !edit && !view.mutating && view.requestState === RequestState.Loaded && !view.loadingError
    && !view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges()
}

export function databaseServerCanCreate(view: DataView, edit: DatabaseServerEditState | undefined): boolean {
  return idle(view, edit) && view.addActionState() === 'enabled'
}

export function databaseServerCanEdit(view: DataView, edit: DatabaseServerEditState | undefined): boolean {
  const id = databaseServerSelectedId(view)
  const target = id ? row(view, id) : undefined
  return idle(view, edit) && !!target && view.editActionState(target) === 'enabled'
    && editFields.some(field => view.fieldAccess(target, field).write === 'allowed')
}

export function databaseServerCanDelete(view: DataView, edit: DatabaseServerEditState | undefined): boolean {
  const id = databaseServerSelectedId(view)
  const target = id ? row(view, id) : undefined
  return idle(view, edit) && !!target && view.deleteActionState(target) === 'enabled'
}

export async function databaseServerRefresh(view: DataView): Promise<void> {
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

export async function databaseServerBeginCreate(view: DataView): Promise<DatabaseServerEditState> {
  if (!databaseServerCanCreate(view, undefined)) throw new Error('当前不能注册服务器')
  const created = await view.addRow({Type: 'MYSQL', ServerName: '', ip_address: '', Port: '3306', description: '', UserName: '', Password: ''})
  if (!('rowid' in created) || typeof created['rowid'] !== 'string') throw new Error('新增服务器行的身份无效')
  const id = created['rowid']
  const current = row(view, id)
  if (!current) throw new Error('新增服务器行未进入原视图')
  view.setCurrentRowById(id)
  view.setSelectedRows([current])
  return {id, mode: 'add', row: current}
}

export function databaseServerBeginEdit(view: DataView): DatabaseServerEditState {
  if (!databaseServerCanEdit(view, undefined)) throw new Error('当前不能编辑此服务器')
  const id = databaseServerSelectedId(view)
  const target = row(view, id)
  if (!target) throw new Error('服务器编辑目标已变化')
  view.setCurrentRowById(id)
  return {id, mode: 'edit', row: target}
}

export function databaseServerCancelEdit(view: DataView, edit: DatabaseServerEditState): DatabaseServerEditState | undefined {
  if (view.hasUnconfirmedSave) throw new Error('请先核验未确认的保存结果')
  if (view.mutating) throw new Error('保存进行中，不能取消')
  const ui = databaseServerEditing(view, edit)
  if (ui?.readbackFailed) return undefined
  if (view.currentRow !== edit.row || !view.rows.includes(edit.row)) throw new Error('服务器编辑目标或查询已变化')
  view.discardPendingChanges([edit.id])
  return undefined
}

async function commit(dataSet: DataSet, view: DataView, id: string): Promise<void> {
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  if (!result.success) throw new Error(result.message ?? '服务器保存失败')
  await databaseServerRefresh(view)
}

export async function databaseServerSaveEdit(dataSet: DataSet, view: DataView, edit: DatabaseServerEditState): Promise<DatabaseServerEditState | undefined> {
  if (view.mutating) throw new Error('当前编辑不能重复提交')
  const ui = databaseServerEditing(view, edit)
  if (view.hasUnconfirmedSave) {
    await commit(dataSet, view, edit.id)
    return undefined
  }
  if (ui?.readbackFailed) {
    await databaseServerRefresh(view)
    return undefined
  }
  if (view.currentRow !== edit.row || !view.rows.includes(edit.row)) throw new Error('服务器编辑目标或查询已变化')
  const allowed = edit.mode === 'add' ? createFields : editFields
  const patch = view.getEditingPatch(edit.id) ?? {}
  const value = view.getEditingRow(edit.id)
  if (!value) throw new Error('服务器编辑记录已失效')
  const allowedSet = new Set<string>(allowed)
  if (Object.keys(patch).some(field => !allowedSet.has(field))) throw new Error('服务器保存包含不允许修改的字段')
  if (edit.mode === 'add' ? view.addActionState() !== 'enabled' : view.editActionState(edit.row) !== 'enabled') {
    throw new Error('服务器保存权限已变化')
  }
  for (const field of allowed) {
    if (edit.mode !== 'add' && !Object.hasOwn(patch, field)) continue
    if (view.fieldAccess(edit.row, field).write !== 'allowed') continue
    const input = value[field]
    if (field === 'Password' && edit.mode === 'edit' && (input === '' || input === null || input === undefined)) continue
    if (typeof input !== 'string' && typeof input !== 'number') throw new Error(`字段 ${field} 必须是文本或数字`)
    const text = scalar(input)
    if ((field === 'ServerName' || field === 'ip_address') && !text) throw new Error(field === 'ServerName' ? '请输入服务器名称' : '请输入主机地址')
    if (field === 'Type' && !text) throw new Error('请选择数据库类型')
    if (field === 'Port' && !text) throw new Error('请输入端口')
    if (text !== scalar(input)) view.updateEditingValue(edit.id, field, text)
  }
  if (edit.mode === 'edit' && !view.hasEditingChanges(edit.id)) return undefined
  await commit(dataSet, view, edit.id)
  return undefined
}

export async function databaseServerDeleteSelected(dataSet: DataSet, view: DataView): Promise<void> {
  if (!databaseServerCanDelete(view, undefined)) throw new Error('当前不能删除此服务器')
  const id = databaseServerSelectedId(view)
  const target = row(view, id)
  if (!target) throw new Error('删除目标已变化')
  await view.removeRow(id)
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  if (!result.success) {
    if (!view.hasUnconfirmedSave) view.discardPendingChanges([id])
    throw new Error(result.message ?? '删除服务器失败')
  }
  await databaseServerRefresh(view)
}

export {databaseServerTestConnection} from './database-server-connection-test'
