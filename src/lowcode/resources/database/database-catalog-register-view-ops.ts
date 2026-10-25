/**
 * @module app:lowcode/resources/database/database-catalog-register-view-ops
 * 职责：`POST /Table/registerTable/{dbid}`、`POST /View/registerView/{dbid}` 写命令编排。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_CATALOG_COMMAND_INPUT_TABLE,
  DATABASE_TABLE_REGISTER_TABLE,
  DATABASE_VIEW_REGISTER_TABLE,
} from './lowcode-database-table-view'
import {RegistrationDefaultFieldsNotAppliedError} from './lowcode-database-dataset-extensions'

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

function requireCommandInputView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_CATALOG_COMMAND_INPUT_TABLE, 'default')
  if (!view) throw new Error('目录命令输入视图缺失')
  return view
}

async function commitCommand(dataSet: DataSet, view: DataView, id?: string): Promise<void> {
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ...(id ? {ids: [id]} : {})}]})
  if (!result.success) throw new Error(result.message ?? '注册命令提交失败')
}

async function verifyUnknownCommand(dataSet: DataSet, view: DataView): Promise<void> {
  if (!view.hasUnconfirmedSave) throw new Error('没有待核验的注册命令')
  await commitCommand(dataSet, view)
}

async function submitCommandRow(dataSet: DataSet, view: DataView, id: string): Promise<void> {
  view.updateEditingValue(id, 'registrationStatus', '结果待核验')
  try {
    await commitCommand(dataSet, view, id)
  } catch (error) {
    if (!view.hasUnconfirmedSave) {
      const requiresNewBatch = error instanceof RegistrationDefaultFieldsNotAppliedError
      view.updateEditingValue(id, 'registrationDisposition', requiresNewBatch ? 'cancel-required' : 'retryable')
      view.updateEditingValue(id, 'registrationStatus', requiresNewBatch
        ? '默认字段补齐未执行，请取消此项并新开批次'
        : '明确失败，可重试')
    }
    throw error
  }
}

type RegisterTableItemOptions = Readonly<{
  dataSet: DataSet
  dbId: string
  item: DatabaseCatalogRegisterTableItem
  batchKey: string
}>

async function registerTableItem(options: RegisterTableItemOptions): Promise<string | undefined> {
  const {dataSet, dbId, item, batchKey} = options
  const tableName = item.tableName.trim()
  if (!tableName) throw new Error('表名不能为空')
  const view = requireDatabaseTableRegisterView(dataSet)
  const option = item.addDefaultFields ? '1' : '0'
  const existing = view.rows.find(row => scalar(row['dbid']) === dbId.trim() && scalar(row['tableName']) === tableName
    && scalar(row['batchKey']) === batchKey)
  if (existing) {
    const id = view.getPkKey(existing)
    if (typeof id !== 'string' && typeof id !== 'number') throw new Error('注册命令行身份无效')
    const captured = view.getEditingRow(id) ?? existing
    if (scalar(captured['registrationDisposition']) === 'cancel-required') {
      throw new Error('本批次默认字段补齐已明确未执行；请取消此项并新开批次')
    }
    if (scalar(existing['batchKey']) !== batchKey && scalar(existing['addDefaultFields']) !== option) {
      throw new Error('此表已用不同默认字段选项登记，不能把本次选项视为已完成')
    }
    if (!view.dirtyTracking.isPendingCreate(id) && !view.dirtyTracking.hasPendingChanges(id)) return undefined
    if (scalar(existing['batchKey']) !== batchKey) throw new Error('未完成注册批次与当前选择不一致')
    return String(id)
  }
  if (view.requestState === RequestState.Idle) {
    await view.refresh()
    if (view.loadingError) throw view.loadingError
  }
  const row = await view.addRow({dbid: dbId.trim(), tableName, tableComment: item.tableComment.trim(), addDefaultFields: option, batchKey, registrationStatus: '待提交'})
  const id = view.getPkKey(row)
  if (typeof id !== 'string' || !id) throw new Error('注册命令行身份无效')
  return id
}

type RegisterViewItemOptions = Readonly<{
  dataSet: DataSet
  dbId: string
  item: DatabaseCatalogRegisterViewItem
  batchKey: string
}>

async function registerViewItem(options: RegisterViewItemOptions): Promise<string | undefined> {
  const {dataSet, dbId, item, batchKey} = options
  const viewName = item.viewName.trim()
  if (!viewName) throw new Error('视图名不能为空')
  const view = requireDatabaseViewRegisterView(dataSet)
  const existing = view.rows.find(row => scalar(row['dbid']) === dbId.trim() && scalar(row['viewName']) === viewName
    && scalar(row['batchKey']) === batchKey)
  if (existing) {
    const id = view.getPkKey(existing)
    if (typeof id !== 'string' && typeof id !== 'number') throw new Error('注册命令行身份无效')
    if (!view.dirtyTracking.isPendingCreate(id) && !view.dirtyTracking.hasPendingChanges(id)) return undefined
    if (scalar(existing['batchKey']) !== batchKey) throw new Error('未完成注册批次与当前选择不一致')
    return String(id)
  }
  if (view.requestState === RequestState.Idle) {
    await view.refresh()
    if (view.loadingError) throw view.loadingError
  }
  const row = await view.addRow({dbid: dbId.trim(), viewName, viewComment: item.viewComment.trim(), batchKey, registrationStatus: '待提交'})
  const id = view.getPkKey(row)
  if (typeof id !== 'string' || !id) throw new Error('注册命令行身份无效')
  return id
}

function scalar(value: unknown): string {return value === null || value === undefined ? '' : String(value).trim()}

async function refreshCatalog(dataSet: DataSet, model: string): Promise<void> {
  const catalog = dataSet.getView(model, 'default')
  if (!catalog) return
  await catalog.refresh()
  if (catalog.loadingError) throw catalog.loadingError
}

function registrationBatchId(dataSet: DataSet): string {
  const input = dataSet.getView(DATABASE_CATALOG_COMMAND_INPUT_TABLE, 'default')
  const row = input?.rows[0]
  const batchId = scalar(row?.['batchId'])
  if (!batchId) throw new Error('注册批次身份缺失')
  return batchId
}

/** 新对话框开启新批次；本地命令输入行携带身份，完成刷新重试仍复用该身份。 */
export async function databaseCatalogBeginRegistrationBatch(dataSet: DataSet): Promise<void> {
  const activeViews = [requireDatabaseTableRegisterView(dataSet), requireDatabaseViewRegisterView(dataSet)]
  if (activeViews.some(view => view.hasUnconfirmedSave || view.dirtyTracking.hasPendingChanges())) {
    throw new Error('已有未完成注册批次，不能开始新批次')
  }
  await databaseCatalogSettleCommandInput(dataSet)
  const view = requireCommandInputView(dataSet)
  const row = view.rows[0]
  const id = row ? view.getPkKey(row) : undefined
  if (typeof id !== 'string' && typeof id !== 'number') throw new Error('注册批次输入行身份无效')
  if (!view.updateRowById(id, {batchId: crypto.randomUUID()})) throw new Error('注册批次身份更新失败')
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
  const names = items.map(item => item.tableName.trim())
  if (names.some(name => !name)) throw new Error('表名不能为空')
  if (new Set(names).size !== names.length) throw new Error('本批次包含重复表名')
  const view = requireDatabaseTableRegisterView(dataSet)
  if (view.hasUnconfirmedSave) throw new Error('上次注册结果尚未确认，请先核验')
  const batchKey = JSON.stringify({batchId: registrationBatchId(dataSet), db, items: items.map(item => ({name: item.tableName.trim(), comment: item.tableComment.trim(), addDefaultFields: item.addDefaultFields}))})
  const pendingIds = [...view.dirtyTracking.pendingCreateIds]
  if (pendingIds.length > 0 && pendingIds.some(id => scalar(view.rows.find(row => view.getPkKey(row) === id)?.['batchKey']) !== batchKey)) {
    throw new Error('已有未完成注册批次；请按原选择和选项继续')
  }
  const ids: string[] = []
  for (const item of items) {
    const id = await registerTableItem({dataSet, dbId: db, item, batchKey})
    if (id) ids.push(id)
  }
  for (const id of ids) await submitCommandRow(dataSet, view, id)
  await databaseCatalogSettleCommandInput(dataSet)
  await refreshCatalog(dataSet, DATABASE_CATALOG_TABLE_MODEL)
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
  const names = items.map(item => item.viewName.trim())
  if (names.some(name => !name)) throw new Error('视图名不能为空')
  if (new Set(names).size !== names.length) throw new Error('本批次包含重复视图名')
  const view = requireDatabaseViewRegisterView(dataSet)
  if (view.hasUnconfirmedSave) throw new Error('上次注册结果尚未确认，请先核验')
  const batchKey = JSON.stringify({batchId: registrationBatchId(dataSet), db, items: items.map(item => ({name: item.viewName.trim(), comment: item.viewComment.trim()}))})
  const pendingIds = [...view.dirtyTracking.pendingCreateIds]
  if (pendingIds.length > 0 && pendingIds.some(id => scalar(view.rows.find(row => view.getPkKey(row) === id)?.['batchKey']) !== batchKey)) {
    throw new Error('已有未完成注册批次；请按原选择继续')
  }
  const ids: string[] = []
  for (const item of items) {
    const id = await registerViewItem({dataSet, dbId: db, item, batchKey})
    if (id) ids.push(id)
  }
  for (const id of ids) await submitCommandRow(dataSet, view, id)
  await databaseCatalogSettleCommandInput(dataSet)
  await refreshCatalog(dataSet, DATABASE_CATALOG_VIEW_MODEL)
}

/** 显式核验原 capture；查询失败继续保留未知，不会重放写命令。 */
export async function databaseCatalogVerifyTableRegistration(dataSet: DataSet): Promise<void> {
  await verifyUnknownCommand(dataSet, requireDatabaseTableRegisterView(dataSet))
}

/** 显式核验原 capture；查询失败继续保留未知，不会重放写命令。 */
export async function databaseCatalogVerifyViewRegistration(dataSet: DataSet): Promise<void> {
  await verifyUnknownCommand(dataSet, requireDatabaseViewRegisterView(dataSet))
}

/** 明确丢弃本地已知未完成命令行；结果未知时绝不提供放弃路径。 */
export async function databaseCatalogDiscardPendingRegistration(dataSet: DataSet, kind: 'table' | 'view'): Promise<void> {
  const view = kind === 'table' ? requireDatabaseTableRegisterView(dataSet) : requireDatabaseViewRegisterView(dataSet)
  if (view.hasUnconfirmedSave) throw new Error('结果未知的命令必须先核验，不能丢弃')
  view.discardPendingChanges()
  await databaseCatalogSettleCommandInput(dataSet)
}

/** 将命令参数 DataView 的本地编辑应用到本地行，清除临时脏标记且保留所选选项。 */
export async function databaseCatalogSettleCommandInput(dataSet: DataSet): Promise<void> {
  const view = requireCommandInputView(dataSet)
  const row = view.rows[0]
  const id = row ? view.getPkKey(row) : undefined
  if ((typeof id !== 'string' && typeof id !== 'number') || !view.hasEditingChanges(id)) return
  const result = await view.applyEditingRows([id])
  if (!result.success) throw new Error(result.message ?? '默认字段选项未能应用到命令输入行')
  view.dirtyTracking.clearDirty(id)
}
