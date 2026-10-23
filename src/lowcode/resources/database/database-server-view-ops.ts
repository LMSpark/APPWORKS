/**
 * @module app:lowcode/resources/database/database-server-view-ops
 * 职责：服务器目录页的 DataView 编排（非 query/save owner；后端 owner 仅在装配时 bind 到 DataView）。
 * 注册走 DatabaseServerRegister 写命令视图（/Db/registerServer）；编辑、删除走 Base_serverInfo 目录视图。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CONNECTION_TEST_INPUT_TABLE,
  DATABASE_CONNECTION_TEST_RESULT_TABLE,
  DATABASE_SERVER_MODEL,
  DATABASE_SERVER_REGISTER_TABLE,
} from './lowcode-database-server'

const editFields = ['Type', 'ServerName', 'ip_address', 'Port', 'description'] as const
const registerRequired = [['Type', '请选择类型'], ['ServerName', '请输入服务器名称'], ['ip_address', '请输入服务器IP地址'], ['UserName', '请输入服务器账号']] as const

/** target：注册时为命令视图，编辑时为目录视图。 */
export type DatabaseServerEditState = Readonly<{id: string; mode: 'add' | 'edit'; target: DataView}>

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

export function requireDatabaseServerRegisterView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_SERVER_REGISTER_TABLE, 'default')
  if (!view) throw new Error('服务器目录缺少注册命令视图')
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
  const target = edit.target
  const unconfirmed = target.hasUnconfirmedSave
  const pending = target.hasEditingChanges(edit.id) || target.dirtyTracking.hasPendingChanges()
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

/** 注册入口仍受目录新增权限约束；命令视图每次打开先清空上次接纳的结果。 */
export async function databaseServerBeginCreate(dataSet: DataSet, view: DataView): Promise<DatabaseServerEditState> {
  if (!databaseServerCanCreate(view, undefined)) throw new Error('当前不能注册服务器')
  const register = requireDatabaseServerRegisterView(dataSet)
  if (register.hasUnconfirmedSave) throw new Error('上次注册结果尚未确认，请先核验')
  if (register.dirtyTracking.hasPendingChanges() || register.hasEditingChanges()) register.discardPendingChanges()
  await databaseServerRefresh(register)
  const created = await register.addRow({Type: 'MYSQL', Port: '3306'})
  const id = register.getPkKey(created)
  if (typeof id !== 'string' || !row(register, id)) throw new Error('注册服务器命令行未进入命令视图')
  register.setCurrentRowById(id)
  return {id, mode: 'add', target: register}
}

export function databaseServerBeginEdit(view: DataView): DatabaseServerEditState {
  if (!databaseServerCanEdit(view, undefined)) throw new Error('当前不能编辑此服务器')
  const id = databaseServerSelectedId(view)
  if (!row(view, id)) throw new Error('服务器编辑目标已变化')
  view.setCurrentRowById(id)
  return {id, mode: 'edit', target: view}
}

/** 按主键核对编辑目标：保存被拒后数据层会以新行对象恢复同一主键，不能用对象相等判断目标变化。 */
function editTarget(edit: DatabaseServerEditState, message: string): DataRow {
  const view = edit.target
  const current = view.currentRow
  const target = row(view, edit.id)
  if (!current || !target || view.getPkKey(current) !== edit.id) throw new Error(message)
  return target
}

export function databaseServerCancelEdit(view: DataView, edit: DatabaseServerEditState): DatabaseServerEditState | undefined {
  if (edit.target.hasUnconfirmedSave) throw new Error('请先核验未确认的保存结果')
  if (edit.target.mutating) throw new Error('保存进行中，不能取消')
  const ui = databaseServerEditing(view, edit)
  if (ui?.readbackFailed) return undefined
  editTarget(edit, '服务器编辑目标或查询已变化')
  edit.target.discardPendingChanges([edit.id])
  return undefined
}

async function commit(dataSet: DataSet, view: DataView, id: string): Promise<void> {
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  if (!result.success) throw new Error(result.message ?? '服务器保存失败')
  await databaseServerRefresh(view)
  if (!row(view, id)) throw new Error(`服务器保存回执成功，但重新读取目录未见该记录（${id}），请勿重复提交`)
}

/** 提交或核验注册命令；结果未知时立即按 rowid 核验一次，仍无法确认则保留待核验状态。 */
async function submitRegister(dataSet: DataSet, register: DataView, id: string): Promise<void> {
  const save = () => dataSet.saveChanges({views: [{tableName: register.tableName, viewId: register.viewId, ids: [id]}]})
  const unconfirmed = (): boolean => register.hasUnconfirmedSave
  try {
    const result = await save()
    if (!result.success) throw new Error(result.message ?? '注册服务器失败')
  } catch (cause) {
    if (!unconfirmed()) throw cause
    const reason = cause instanceof Error ? cause.message : String(cause)
    try {
      const verified = await save()
      if (!verified.success) throw new Error(verified.message ?? '注册结果核验失败')
    } catch (verifyCause) {
      if (unconfirmed()) throw new Error(`注册结果未确认（${reason}），请稍后核验，不要重复注册`)
      const detail = verifyCause instanceof Error ? verifyCause.message : String(verifyCause)
      throw new Error(detail.includes('DATA_SET_COMMAND_NOT_APPLIED') ? `${reason}（已核验：服务器未注册）` : detail)
    }
  }
}

async function saveRegister(dataSet: DataSet, view: DataView, edit: DatabaseServerEditState): Promise<void> {
  const register = edit.target
  if (!register.hasUnconfirmedSave) {
    editTarget(edit, '注册目标已变化')
    const value = register.getEditingRow(edit.id) ?? row(register, edit.id)
    if (!value) throw new Error('注册记录已失效')
    for (const [field, message] of registerRequired) if (!scalar(value[field])) throw new Error(message)
  }
  await submitRegister(dataSet, register, edit.id)
  const accepted = register.currentRow
  const id = accepted ? register.getPkKey(accepted) : undefined
  if (typeof id !== 'string') throw new Error('注册回执缺少服务器标识')
  await databaseServerRefresh(view)
  const registered = row(view, id)
  if (!registered) throw new Error(`注册已被后端接纳，但重新读取目录未见该服务器（${id}），请勿重复注册`)
  view.setCurrentRowById(id)
  view.setSelectedRows([registered])
}

export async function databaseServerSaveEdit(dataSet: DataSet, view: DataView, edit: DatabaseServerEditState): Promise<DatabaseServerEditState | undefined> {
  if (edit.target.mutating) throw new Error('当前编辑不能重复提交')
  if (edit.mode === 'add') {
    await saveRegister(dataSet, view, edit)
    return undefined
  }
  const ui = databaseServerEditing(view, edit)
  if (view.hasUnconfirmedSave) {
    await commit(dataSet, view, edit.id)
    return undefined
  }
  if (ui?.readbackFailed) {
    await databaseServerRefresh(view)
    return undefined
  }
  const target = editTarget(edit, '服务器编辑目标或查询已变化')
  const patch = view.getEditingPatch(edit.id) ?? {}
  const value = view.getEditingRow(edit.id)
  if (!value) throw new Error('服务器编辑记录已失效')
  const allowedSet = new Set<string>(editFields)
  if (Object.keys(patch).some(field => !allowedSet.has(field))) throw new Error('服务器保存包含不允许修改的字段')
  if (view.editActionState(target) !== 'enabled') throw new Error('服务器保存权限已变化')
  for (const field of editFields) {
    if (!view.getColumn(field) || !Object.hasOwn(patch, field)) continue
    if (view.fieldAccess(target, field).write !== 'allowed') continue
    const input = value[field]
    if (typeof input !== 'string' && typeof input !== 'number') throw new Error(`字段 ${field} 必须是文本或数字`)
    const text = scalar(input)
    if ((field === 'ServerName' || field === 'ip_address') && !text) throw new Error(field === 'ServerName' ? '请输入服务器名称' : '请输入服务器IP地址')
    if (field === 'Type' && !text) throw new Error('请选择类型')
    if (field === 'Port' && !text) throw new Error('请输入端口')
    if (text !== scalar(input)) view.updateEditingValue(edit.id, field, text)
  }
  if (!view.hasEditingChanges(edit.id)) return undefined
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

/** 连接测试读取注册命令视图中正在录入的参数。 */
export async function databaseServerTestConnection(dataSet: DataSet, edit: DatabaseServerEditState): Promise<boolean> {
  if (edit.mode !== 'add') throw new Error('仅注册时可测试连接')
  editTarget(edit, '连接测试时注册目标已变化')
  const value = edit.target.getEditingRow(edit.id) ?? row(edit.target, edit.id)
  if (!value) throw new Error('连接测试缺少注册参数')
  if (!scalar(value['UserName'])) throw new Error('请输入服务器账号')
  const inputRow = dataSet.getTable(DATABASE_CONNECTION_TEST_INPUT_TABLE)?.rows[0]
  if (!inputRow) throw new Error('连接测试输入未就绪')
  for (const field of ['Type', 'ServerName', 'ip_address', 'UserName', 'Password', 'Port'] as const) {
    inputRow[field] = scalar(value[field])
  }
  const resultView = dataSet.getView(DATABASE_CONNECTION_TEST_RESULT_TABLE, 'default')
  if (!resultView) throw new Error('连接测试结果视图缺失')
  await resultView.refresh()
  if (resultView.loadingError) throw resultView.loadingError
  return resultView.rows[0]?.['ok'] === 'true'
}
