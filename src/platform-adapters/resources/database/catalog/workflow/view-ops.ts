/**
 * @module app:lowcode/resources/database/catalog/workflow/view-ops
 * 职责：Base_WorkflowDefinition 按 tblid 及可选条件查询（模型 query）。
 */
import {DataViewFilter, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_WORKFLOW_MODEL,
  DATABASE_CATALOG_WORKFLOW_TABLE_VIEW,
} from '../table-view'

export type DatabaseCatalogWorkflowQuery = Readonly<{
  name?: string
  workflowKey?: string
  description?: string
  status?: string
}>

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

export async function databaseCatalogWorkflowRefreshForTable(
  view: DataView,
  tableId: string,
  query: DatabaseCatalogWorkflowQuery = {},
): Promise<void> {
  const id = tableId.trim()
  if (!id) throw new Error('缺少表 ID，无法查询工作流')
  type WorkflowFilterCond = Readonly<{field: string; operator: 'eq' | 'contains'; value: string}>
  const filters: WorkflowFilterCond[] = [
    {field: 'tblid', operator: 'eq', value: id},
  ]
  const name = text(query.name)
  if (name) filters.push({field: 'name', operator: 'contains', value: name})
  const workflowKey = text(query.workflowKey)
  if (workflowKey) filters.push({field: 'workflow_key', operator: 'contains', value: workflowKey})
  const description = text(query.description)
  if (description) filters.push({field: 'description', operator: 'contains', value: description})
  const status = text(query.status)
  if (status) filters.push({field: 'status', operator: 'eq', value: status})
  const sole = filters[0]
  if (!sole) throw new Error('工作流查询过滤条件无效')
  const filter = filters.length === 1
    ? DataViewFilter.condition(sole)
    : DataViewFilter.group({logic: 'and', filters})
  await view.setFilter(filter.toJSON())
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}
