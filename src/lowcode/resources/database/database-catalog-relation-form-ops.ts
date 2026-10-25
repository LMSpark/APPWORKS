/**
 * @module app:lowcode/resources/database/database-catalog-relation-form-ops
 * 职责：Base_TblRln 单行编辑会话及多字段关系端点操作；字段值始终由原 DataView 持有。
 */
import {RequestState, type CrudResult, type DataRow, type DataView} from '@spark-appworks/spark-data'

export type DatabaseCatalogTableContext = Readonly<{
  tableId: string
  tableName: string
  dbId: string
}>

export const DATABASE_CATALOG_RELATION_EDIT_FIELDS = [
  'pkdbid', 'pktbid', 'pktable', 'fkdbid', 'fktbid', 'fktable', 'rlname', 'RelshipExp', 'IsCascadeDeletion',
] as const

export type DatabaseCatalogRelationSession = Readonly<{
  rowid: string
  mode: 'add' | 'edit'
  currentRole: 'master' | 'child'
  context: DatabaseCatalogTableContext
  queryIdentity: string
  checkpoint?: {restore(): void; release(): void}
}>

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim()
}

function queryIdentity(view: DataView): string {
  return JSON.stringify({queryContext: view.queryContext, filterExpression: view.filterExpression,
    page: view.page, sortExpression: view.sortExpression})
}

function requireLoaded(view: DataView): void {
  if (view.requestState !== RequestState.Loaded) throw new Error('关系目录查询未完成，不能编辑')
  if (view.loadingError) throw view.loadingError
  if (view.mutating || view.hasUnconfirmedSave) throw new Error('关系目录正在保存或结果未确认')
}

function sourceRow(view: DataView, id: string): DataRow {
  const found = view.rows.find(item => view.getPkKey(item) === id)
  if (!found) throw new Error('所选关系已不在当前列表')
  return found
}

function editingRow(view: DataView, id: string): DataRow {
  const row = view.getEditingRow(id)
  if (!row) throw new Error('关系编辑目标已变化')
  return row
}

function createdRowId(result: DataRow | CrudResult<DataRow>): string {
  if ('rowid' in result && typeof result['rowid'] === 'string') return result['rowid']
  const data = 'data' in result ? result.data : undefined
  return data !== undefined && data !== null && typeof data === 'object'
    && 'rowid' in data && typeof data['rowid'] === 'string' ? data['rowid'] : ''
}

export function databaseCatalogRelationAssertSession(
  view: DataView,
  session: DatabaseCatalogRelationSession,
  context: DatabaseCatalogTableContext,
): DataRow {
  requireLoaded(view)
  return databaseCatalogRelationAssertIdentity(view, session, context)
}

/** Unknown-write recovery may bypass ordinary query/loading guards, but must retain the original target identity. */
export function databaseCatalogRelationAssertIdentity(
  view: DataView,
  session: DatabaseCatalogRelationSession,
  context: DatabaseCatalogTableContext,
): DataRow {
  if (queryIdentity(view) !== session.queryIdentity
    || context.tableId !== session.context.tableId
    || context.dbId !== session.context.dbId
    || context.tableName !== session.context.tableName) {
    throw new Error('表关系编辑目标或查询身份已变化，请重新打开')
  }
  return editingRow(view, session.rowid)
}

export function databaseCatalogRelationInferRole(ctx: DatabaseCatalogTableContext, relationRow: DataRow): 'master' | 'child' {
  const isMaster = text(relationRow['pktbid']) === ctx.tableId
  const isChild = text(relationRow['fktbid']) === ctx.tableId
  if (isMaster === isChild) throw new Error('当前表不唯一匹配此关系端点，不能编辑')
  return isMaster ? 'master' : 'child'
}

export async function databaseCatalogRelationPrepareCreate(
  view: DataView,
  ctx: DatabaseCatalogTableContext,
  currentRole: 'master' | 'child',
): Promise<DatabaseCatalogRelationSession> {
  requireLoaded(view)
  if (view.commitMode !== 'staged') throw new Error('关系视图必须使用暂存提交')
  const result = await view.addRow({
    pkdbid: ctx.dbId,
    pktbid: currentRole === 'master' ? ctx.tableId : '',
    pktable: currentRole === 'master' ? ctx.tableName : '',
    fkdbid: ctx.dbId,
    fktbid: currentRole === 'child' ? ctx.tableId : '',
    fktable: currentRole === 'child' ? ctx.tableName : '',
    rlname: '',
    RelshipExp: '',
    IsCascadeDeletion: 0,
  })
  const createdId = text(createdRowId(result))
  if (!createdId || !view.dirtyTracking.isPendingCreate(createdId)) throw new Error('新增关系行身份无效')
  const created = sourceRow(view, createdId)
  view.setCurrentRowById(createdId)
  view.setSelectedRows([created])
  return {rowid: createdId, mode: 'add', currentRole, context: {...ctx}, queryIdentity: queryIdentity(view)}
}

export function databaseCatalogRelationPrepareEdit(
  view: DataView,
  ctx: DatabaseCatalogTableContext,
  relationId: string,
): DatabaseCatalogRelationSession {
  requireLoaded(view)
  const target = editingRow(view, relationId)
  const currentRole = databaseCatalogRelationInferRole(ctx, target)
  const checkpoint = view.createEditingCheckpoint(relationId, DATABASE_CATALOG_RELATION_EDIT_FIELDS)
  view.setCurrentRowById(relationId)
  view.setSelectedRows([sourceRow(view, relationId)])
  return {rowid: relationId, mode: 'edit', currentRole, context: {...ctx}, queryIdentity: queryIdentity(view), checkpoint}
}

function assertWritable(view: DataView, session: DatabaseCatalogRelationSession, fields: readonly string[]): DataRow {
  const row = editingRow(view, session.rowid)
  for (const field of fields) {
    const access = session.mode === 'add' ? view.newRowFieldAccess(field) : view.fieldAccess(row, field)
    if (access.read !== 'visible' || access.write !== 'allowed') throw new Error(`关系字段 ${field} 当前不可写，未修改任何端点`)
  }
  return row
}

function writeFields(view: DataView, id: string, patch: Readonly<Record<string, unknown>>): void {
  for (const [field, value] of Object.entries(patch)) view.updateEditingValue(id, field, value)
}

export function databaseCatalogRelationSwitchRole(options: Readonly<{
  view: DataView
  session: DatabaseCatalogRelationSession
  context: DatabaseCatalogTableContext
  nextRole: 'master' | 'child'
}>): DatabaseCatalogRelationSession {
  const {view, session, context, nextRole} = options
  const current = databaseCatalogRelationAssertSession(view, session, context)
  if (nextRole === session.currentRole) return session
  const otherPrefix = session.currentRole === 'master' ? 'fk' : 'pk'
  const fields = ['pkdbid', 'pktbid', 'pktable', 'fkdbid', 'fktbid', 'fktable', 'RelshipExp']
  assertWritable(view, session, fields)
  const peerId = text(current[`${otherPrefix}tbid`])
  const keepPeer = peerId.length > 0 && peerId !== context.tableId
  const patch: Record<string, unknown> = nextRole === 'master'
    ? {pkdbid: context.dbId, pktbid: context.tableId, pktable: context.tableName,
      fkdbid: keepPeer ? current[`${otherPrefix}dbid`] : '', fktbid: keepPeer ? peerId : '', fktable: keepPeer ? current[`${otherPrefix}table`] : '',
      RelshipExp: ''}
    : {fkdbid: context.dbId, fktbid: context.tableId, fktable: context.tableName,
      pkdbid: keepPeer ? current[`${otherPrefix}dbid`] : '', pktbid: keepPeer ? peerId : '', pktable: keepPeer ? current[`${otherPrefix}table`] : '',
      RelshipExp: ''}
  writeFields(view, session.rowid, patch)
  return {...session, currentRole: nextRole}
}

export function databaseCatalogRelationChoosePeer(options: Readonly<{
  view: DataView
  session: DatabaseCatalogRelationSession
  context: DatabaseCatalogTableContext
  peerRow: DataRow
}>): void {
  const {view, session, context, peerRow} = options
  databaseCatalogRelationAssertSession(view, session, context)
  const peerId = text(view.getPkKey(peerRow))
  const peerDb = text(peerRow['dbid'])
  const peerName = text(peerRow['tblname'])
  if (peerId.length === 0 || peerId === context.tableId || peerDb !== context.dbId || peerName.length === 0) throw new Error('关系对端必须是当前数据库中另一张已加载物理表')
  const prefix = session.currentRole === 'master' ? 'fk' : 'pk'
  const fields = [`${prefix}dbid`, `${prefix}tbid`, `${prefix}table`, 'RelshipExp']
  assertWritable(view, session, fields)
  writeFields(view, session.rowid, {
    [`${prefix}dbid`]: peerDb,
    [`${prefix}tbid`]: peerId,
    [`${prefix}table`]: peerName,
    RelshipExp: '',
  })
}

export function databaseCatalogRelationCanChangePeer(
  view: DataView | undefined,
  session: DatabaseCatalogRelationSession | undefined,
  context: DatabaseCatalogTableContext | undefined,
): boolean {
  if (!view || !session || !context || view.requestState !== RequestState.Loaded || view.mutating || view.hasUnconfirmedSave) return false
  try {
    const row = databaseCatalogRelationAssertSession(view, session, context)
    const prefix = session.currentRole === 'master' ? 'fk' : 'pk'
    return [`${prefix}dbid`, `${prefix}tbid`, `${prefix}table`, 'RelshipExp']
      .every(field => view.fieldAccess(row, field).read === 'visible' && view.fieldAccess(row, field).write === 'allowed')
  } catch { return false }
}

export function databaseCatalogRelationCancel(view: DataView, session: DatabaseCatalogRelationSession): void {
  if (view.mutating || view.hasUnconfirmedSave) throw new Error('关系保存结果待确认，不能取消编辑')
  if (session.mode === 'add') {
    view.discardPendingChanges([session.rowid])
    view.clearSelectedRows()
  } else {
    session.checkpoint?.restore()
  }
}

export function databaseCatalogRelationRelease(session: DatabaseCatalogRelationSession): void {
  session.checkpoint?.release()
}
