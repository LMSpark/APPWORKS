/**
 * @module @spark-appworks/spark-data:data-set-command-view
 * 职责：在运行 DataSet 上幂等装配 static/file 命令表与只读 refresh 查询结果。
 * 边界：不含业务 HTTP；调用方在 executeQuery 内执行远端请求并返回本地行。
 */
import {DataViewLocalQuery} from '../query/data-view-local-query'
import type {DataSet} from '../dataset'
import type {DataView} from '../data-view'
import type {DataColumn, DataRow} from '../types'

export type DataSetCommandColumnSpec = Readonly<{name: string; primary?: boolean}>

export type DataSetCommandScopeGuard = () => void

type QueryResult = Awaited<ReturnType<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>>

export type DataSetCommandRowsLoader = (view: DataView) => Promise<readonly DataRow[]>

export type DataSetCommandResourceIdentity = Readonly<{resourceType: 'file'; resourceId: string}>

export type BindReadonlyCommandQueryOptions = Readonly<{
  resource: DataSetCommandResourceIdentity
  guard: DataSetCommandScopeGuard
  loadRows: DataSetCommandRowsLoader
  queryColumns?: (view: DataView) => readonly DataColumn[]
}>

function columnDefs(columns: ReadonlyArray<DataSetCommandColumnSpec>) {
  return columns.map(column => ({
    name: column.name,
    type: 'string' as const,
    ...(column.primary ? {isPrimaryKey: true} : {}),
  }))
}

/** 幂等创建 static-data 输入表（命令参数行，不参与正式 saveChanges 资源）。 */
export function ensureDataSetStaticInputTable(
  dataSet: DataSet,
  tableName: string,
  columns: ReadonlyArray<DataSetCommandColumnSpec>,
): void {
  if (dataSet.getTable(tableName)) return
  const table = dataSet.addTable(tableName, columnDefs(columns))
  table.resourceType = 'static-data'
}

/** 幂等创建 file 资源命令结果表并返回 default DataView。 */
export function ensureDataSetFileCommandView(
  dataSet: DataSet,
  tableName: string,
  resourceId: string,
  columns: ReadonlyArray<DataSetCommandColumnSpec>,
): DataView {
  if (dataSet.getTable(tableName)) {
    const existing = dataSet.getView(tableName, 'default')
    if (!existing) throw new Error(`命令视图缺失: ${tableName}`)
    return existing
  }
  const table = dataSet.addTable(tableName, columnDefs(columns))
  table.resourceType = 'file'
  table.resourceId = resourceId
  const view = dataSet.getView(tableName, 'default')
  if (!view) throw new Error(`命令视图缺失: ${tableName}`)
  return view
}

/** 将内存行包装为只读查询结果（供命令 DataView.refresh 消费）。 */
export function dataSetCommandQueryResultFromLocalRows(
  view: DataView,
  rows: readonly DataRow[],
  guard: DataSetCommandScopeGuard,
): Promise<QueryResult> {
  guard()
  const fields = new Set(view.columns.filter(column => column.name !== '_pk' && !column.computeExpression).map(column => column.name))
  const {rows: outputRows, total, output} = DataViewLocalQuery.select({
    rows: [...rows],
    fields,
    primaryKeys: view.primaryKey ? [view.primaryKey] : [],
    params: {page: 1, allPages: true, treeMode: 'flat'},
  })
  const rowKey = (row: Readonly<DataRow>) => (view.primaryKey ? row[view.primaryKey] : undefined)
  const keys = new Set(outputRows.map(rowKey))
  const allowed = (key: unknown, field: string) => key !== undefined && keys.has(key) && output.has(field)
  return Promise.resolve({
    rows: outputRows,
    total,
    rowKey,
    assertIdentity: () => guard(),
    fieldAccess: (key, field) => ({
      read: allowed(key, field) ? 'visible' : 'invisible',
      write: 'denied',
      component: allowed(key, field) ? 'readonly' : 'hidden',
      required: false,
      writeMode: 'readonly',
    }),
    readFieldAccess: (row, field) => (outputRows.includes(row) && output.has(field) ? 'visible' : 'invisible'),
    addActionState: () => 'hidden',
    editActionState: () => 'hidden',
    deleteActionState: () => 'hidden',
    createChildActionState: () => 'hidden',
    viewActionState: (key, available = true) => (keys.has(key) ? (available ? 'enabled' : 'disabled') : 'hidden'),
  })
}

/** 绑定只读命令查询：页面通过 DataView.refresh() 触发 loadRows。 */
export function bindDataSetReadonlyCommandQuery(view: DataView, options: BindReadonlyCommandQueryOptions): void {
  const queryColumns = options.queryColumns ?? (target => target.dataTable?.columns ?? [])
  view.bindQueryExecutor({
    localAggregates: false,
    queryColumns,
    executeQuery: async (target, _params) => {
      options.guard()
      const rows = await options.loadRows(target)
      return dataSetCommandQueryResultFromLocalRows(target, rows, options.guard)
    },
  }, {resource: options.resource})
}
