/**
 * @module app:lowcode/resources/database/catalog/table/field-view-ops
 * 职责：Base_TblField 字段目录 staged 保存编排（非 query/save owner）。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  type DATABASE_CATALOG_FIELD_TABLE_VIEW,
  type DATABASE_CATALOG_FIELD_VIEW_VIEW,
} from '../table-view'

export type DatabaseCatalogFieldViewId = typeof DATABASE_CATALOG_FIELD_TABLE_VIEW | typeof DATABASE_CATALOG_FIELD_VIEW_VIEW

export function requireDatabaseCatalogFieldView(dataSet: DataSet, viewId: DatabaseCatalogFieldViewId): DataView {
  const view = dataSet.getView(DATABASE_CATALOG_FIELD_MODEL, viewId)
  if (!view) throw new Error('字段目录缺少正式视图')
  if (view.commitMode !== 'staged') throw new Error('字段目录视图必须配置暂存提交')
  return view
}

export function databaseCatalogStagedViewCanSave(view: DataView): boolean {
  return view.requestState === RequestState.Loaded && !view.loadingError && !view.mutating && !view.hasUnconfirmedSave
    && (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())
}

export function databaseCatalogFieldCanSave(view: DataView): boolean {
  return databaseCatalogStagedViewCanSave(view)
}

/** 在本次已查询表下准备字段草稿；物理加列仍由原 DataSet 保存处理。 */
export async function databaseCatalogFieldBeginCreate(input: Readonly<{fields: DataView; tables: DataView}>): Promise<void> {
  const {fields, tables} = input
  const selected = tables.getSelectedValues()
  const table = tables.rows.find(row => tables.getPkKey(row) === selected[0])
  if (selected.length !== 1 || !table || fields.dataSet !== tables.dataSet
    || fields.viewId !== 'tableFields' || fields.requestState !== RequestState.Loaded
    || fields.loadingError || fields.mutating || fields.hasUnconfirmedSave) throw new Error('新增字段目标或查询尚未就绪')
  if (fields.addActionState() !== 'enabled') throw new Error('当前查询不允许新增字段')
  const created = await fields.addRow({tblid: selected[0], enname: '', cnname: ''})
  if ('success' in created) throw new Error('新增字段未生成草稿')
  const id = fields.getPkKey(created)
  if (id === undefined) throw new Error('新增字段缺少身份')
  fields.setCurrentRowById(id)
  fields.setSelectedRows([created])
}

export function databaseCatalogDesignCanSave(fieldView: DataView, objectView?: DataView, extraViews: readonly DataView[] = []): boolean {
  return [fieldView, objectView, ...extraViews].some(view =>
    view && !view.mutating && (view.hasUnconfirmedSave || databaseCatalogStagedViewCanSave(view)))
}

export async function databaseCatalogFieldSavePending(dataSet: DataSet, view: DataView): Promise<void> {
  await databaseCatalogDesignSavePending({dataSet, fieldView: view})
}

export type DatabaseCatalogDesignSavePendingInput = Readonly<{
  dataSet: DataSet
  fieldView: DataView
  objectView?: DataView
  extraViews?: readonly DataView[]
}>

export async function databaseCatalogDesignSavePending(input: DatabaseCatalogDesignSavePendingInput): Promise<void> {
  const {dataSet, fieldView, objectView, extraViews = []} = input
  const views = [fieldView, ...(objectView ? [objectView] : []), ...extraViews]
  if (views.some(view => view.mutating)) throw new Error('设计保存进行中')
  const receiptViews = views.filter(view => view.hasUnconfirmedSave)
  if (receiptViews.length > 0) {
    const {batchId} = dataSet.saveJournal
    if (!batchId) throw new Error('缺少原设计保存批次')
    const result = await dataSet.verifySaveJournalAndRead({batchId, receiptViews, readbackViews: []})
    if (result.settlement === 'partial') throw new Error('部分设计修改已确认，其他修改未应用')
    if (result.settlement !== 'confirmed') {
      throw result.verificationError ?? result.journal.originalError ?? new Error('原设计保存未完整确认')
    }
    return
  }
  const targets = views.filter(databaseCatalogStagedViewCanSave)
  if (targets.length === 0) return
  const result = await dataSet.saveChanges({views: targets.map(view => ({tableName: view.tableName, viewId: view.viewId}))})
  const receipt = result.data
  if (!receipt) throw result.error ?? new Error(result.message ?? '缺少设计保存回执')
  const confirmed = receipt.createdCount + receipt.savedCount + receipt.deletedCount
  const complete = result.success && !receipt.failedCount && !receipt.failedEditingRows && targets.every(view =>
    receipt.viewResults.some(item => item.tableName === view.tableName && item.viewId === view.viewId
      && item.createdCount + item.savedCount + item.deletedCount > 0 && !item.failedCount && !item.failedEditingRows))
  if (!complete) {
    if (confirmed > 0) throw new Error('部分设计修改已确认，其余视图未取得完整回执')
    if (result.success && !receipt.failedCount && !receipt.failedEditingRows) throw new Error('本次未提交设计修改')
    throw result.error ?? new Error(result.message ?? '设计保存失败')
  }
  if (receipt.followUpError) throw new Error(`设计修改已确认，后续处理失败：${receipt.followUpError.message}`, {cause: receipt.followUpError})
  for (const view of targets) {
    const readback = await view.requestRefresh({defer: false})
    if (readback.refreshStatus !== 'read') {
      throw new Error(`设计修改已确认，目录回读失败：${readback.error?.message ?? readback.message ?? '未完成本次读取'}`, {cause: readback.error})
    }
  }
}
