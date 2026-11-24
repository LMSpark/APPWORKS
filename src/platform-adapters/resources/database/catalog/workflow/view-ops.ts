/**
 * @module app:platform-adapters/resources/database/catalog/workflow/view-ops
 * 职责：Base_WorkflowDefinition 按表级查询级联查询；用户条件只由标准 DataView filter 追加。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_WORKFLOW_MODEL,
  DATABASE_CATALOG_WORKFLOW_TABLE_VIEW,
} from '../table-view'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim()
}

export function databaseCatalogHasWorkflowCatalog(dataSet: DataSet): boolean {
  return Boolean(dataSet.getView(DATABASE_CATALOG_WORKFLOW_MODEL, DATABASE_CATALOG_WORKFLOW_TABLE_VIEW))
}

export function requireDatabaseCatalogWorkflowView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_CATALOG_WORKFLOW_MODEL, DATABASE_CATALOG_WORKFLOW_TABLE_VIEW)
  if (!view) throw new Error('工作流定义未装配（Base_WorkflowDefinition）')
  return view
}

export async function databaseCatalogWorkflowRefreshForTable(view: DataView, tableId: string): Promise<void> {
  const id = tableId.trim()
  if (!id) throw new Error('缺少表 ID，无法查询工作流')
  const dataSet = view.dataSet
  if (!dataSet) throw new Error('工作流 DataView 缺少数据空间 owner')
  const tableView = dataSet.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
  const selected=tableView?.getSelectedValues()
  if(!tableView||selected?.length!==1||text(selected[0])!==id){
    throw new Error('工作流查询的表级来源已变化，请重新选择表')
  }
  const cascade = dataSet.getParentCascades(view.tableName, view.viewId).find(item =>
    item.parentTable === DATABASE_CATALOG_TABLE_MODEL && item.parentViewId === 'default'
    && item.filterBindings.length === 1 && item.filterBindings[0]?.targetField === 'tblid'
    && (item.filterBindings[0].operator ?? 'eq') === 'eq')
  if (!cascade) {
    throw new Error('工作流查询缺少有效 tblid 表级约束')
  }
  const resolved = dataSet.resolveCascadeFilter(cascade)
  if (!resolved||'logic' in resolved || resolved.field !== 'tblid' || resolved.operator !== 'eq'
    || text(resolved.value) !== id) {
    throw new Error('工作流查询 tblid 约束与当前表不一致')
  }
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}
