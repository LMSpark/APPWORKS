/**
 * @module app:lowcode/resources/database/database-catalog-relation-form-ops
 * 职责：Base_TblRln 新增/编辑草稿（模型 save，非写命令）。
 */
import type {CrudResult, DataRow, DataSet, DataView} from '@spark-appworks/spark-data'
import {databaseCatalogRelationRefreshForTable} from './database-catalog-relation-view-ops'

export type DatabaseCatalogTableContext = Readonly<{
  tableId: string
  tableName: string
  dbId: string
}>

export type DatabaseCatalogRelationFormDraft = Readonly<{
  rowid: string
  mode: 'add' | 'edit'
  currentRole: 'master' | 'child'
  pkdbid: string
  pktbid: string
  pktable: string
  fkdbid: string
  fktbid: string
  fktable: string
  rlname: string
  IsCascadeDeletion: string
}>

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim()
}

function rowidFromAddRow(created: DataRow | CrudResult<DataRow>): string {
  if ('rowid' in created && typeof created['rowid'] === 'string') return created['rowid']
  const data = 'data' in created ? created.data : undefined
  if (data !== undefined && data !== null && typeof data === 'object' && 'rowid' in data && typeof data['rowid'] === 'string') return data['rowid']
  return ''
}

function cascadeFlag(value: unknown): string {
  if (value === true || value === 1 || value === '1') return '1'
  return '0'
}

function row(view: DataView, id: string): DataRow | undefined {
  return view.rows.find(item => view.getPkKey(item) === id)
}

export function databaseCatalogRelationInferRole(ctx: DatabaseCatalogTableContext, relationRow: DataRow): 'master' | 'child' {
  const tableId = ctx.tableId
  const pktbid = text(relationRow['pktbid'])
  const fktbid = text(relationRow['fktbid'])
  if (pktbid === tableId) return 'master'
  if (fktbid === tableId) return 'child'
  return 'child'
}

export function databaseCatalogRelationDraftFromRow(
  relationRow: DataRow,
  mode: 'add' | 'edit',
  currentRole: 'master' | 'child',
): DatabaseCatalogRelationFormDraft {
  const rowid = text(relationRow['rowid'])
  if (!rowid) throw new Error('关系行缺少主键')
  return {
    rowid,
    mode,
    currentRole,
    pkdbid: text(relationRow['pkdbid']),
    pktbid: text(relationRow['pktbid']),
    pktable: text(relationRow['pktable']),
    fkdbid: text(relationRow['fkdbid']),
    fktbid: text(relationRow['fktbid']),
    fktable: text(relationRow['fktable']),
    rlname: text(relationRow['rlname']),
    IsCascadeDeletion: cascadeFlag(relationRow['IsCascadeDeletion']),
  }
}

export function databaseCatalogRelationValidateDraft(draft: DatabaseCatalogRelationFormDraft): void {
  if (!text(draft.pktbid)) throw new Error('请选择主表')
  if (!text(draft.fktbid)) throw new Error('请选择从表')
  if (draft.pktbid === draft.fktbid) throw new Error('主表与从表不能相同')
  if (!text(draft.rlname)) throw new Error('请填写关系表达式')
}

export async function databaseCatalogRelationPrepareCreate(
  view: DataView,
  ctx: DatabaseCatalogTableContext,
  currentRole: 'master' | 'child',
): Promise<DatabaseCatalogRelationFormDraft> {
  if (view.mutating || view.hasUnconfirmedSave) throw new Error('关系目录正在保存或结果未确认')
  const created = await view.addRow({
    pkdbid: ctx.dbId,
    fkdbid: ctx.dbId,
    rlname: '',
    IsCascadeDeletion: '0',
    ...(currentRole === 'master'
      ? {pktbid: ctx.tableId, pktable: ctx.tableName, fktbid: '', fktable: ''}
      : {fktbid: ctx.tableId, fktable: ctx.tableName, pktbid: '', pktable: ''}),
  })
  const rowid = rowidFromAddRow(created)
  if (!rowid) throw new Error('新增关系行的身份无效')
  const current = row(view, rowid)
  if (!current) throw new Error('新增关系行未进入视图')
  view.setCurrentRowById(rowid)
  view.setSelectedRows([current])
  return databaseCatalogRelationDraftFromRow(current, 'add', currentRole)
}

export function databaseCatalogRelationPrepareEdit(
  view: DataView,
  ctx: DatabaseCatalogTableContext,
  relationId: string,
): DatabaseCatalogRelationFormDraft {
  const target = row(view, relationId)
  if (!target) throw new Error('所选关系已不在当前列表')
  view.setCurrentRowById(relationId)
  view.setSelectedRows([target])
  const currentRole = databaseCatalogRelationInferRole(ctx, target)
  return databaseCatalogRelationDraftFromRow(target, 'edit', currentRole)
}

export function databaseCatalogRelationPeerTableId(draft: DatabaseCatalogRelationFormDraft): string {
  return draft.currentRole === 'master' ? draft.fktbid : draft.pktbid
}

export function databaseCatalogRelationWithPeerTable(
  draft: DatabaseCatalogRelationFormDraft,
  peer: Readonly<{rowid: string; tblname: string; dbid: string}>,
): DatabaseCatalogRelationFormDraft {
  const peerId = text(peer.rowid)
  const peerName = text(peer.tblname)
  const peerDb = text(peer.dbid)
  if (draft.currentRole === 'master') {
    return {...draft, fkdbid: peerDb, fktbid: peerId, fktable: peerName}
  }
  return {...draft, pkdbid: peerDb, pktbid: peerId, pktable: peerName}
}

export async function databaseCatalogRelationApplyDraft(view: DataView, draft: DatabaseCatalogRelationFormDraft): Promise<void> {
  databaseCatalogRelationValidateDraft(draft)
  const target = row(view, draft.rowid)
  if (!target) throw new Error('关系编辑目标已变化')
  await view.editRowById(draft.rowid, {
    pkdbid: draft.pkdbid,
    pktbid: draft.pktbid,
    pktable: draft.pktable,
    fkdbid: draft.fkdbid,
    fktbid: draft.fktbid,
    fktable: draft.fktable,
    rlname: draft.rlname,
    IsCascadeDeletion: draft.IsCascadeDeletion,
  })
}

export function databaseCatalogRelationCancelDraft(view: DataView, draft: DatabaseCatalogRelationFormDraft): void {
  if (view.mutating) throw new Error('保存进行中，不能取消')
  if (draft.mode === 'add') {
    view.discardPendingChanges([draft.rowid])
    view.clearSelectedRows()
  }
}

export type DatabaseCatalogRelationSaveDraftInput = Readonly<{
  dataSet: DataSet
  view: DataView
  draft: DatabaseCatalogRelationFormDraft
  refreshTableId: string
}>

export async function databaseCatalogRelationSaveDraft(input: DatabaseCatalogRelationSaveDraftInput): Promise<void> {
  const {dataSet, view, draft, refreshTableId} = input
  if (view.mutating) throw new Error('关系保存进行中')
  await databaseCatalogRelationApplyDraft(view, draft)
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [draft.rowid]}]})
  if (!result.success) throw new Error(result.message ?? '保存表关系失败')
  await databaseCatalogRelationRefreshForTable(view, refreshTableId)
}
