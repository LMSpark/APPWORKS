/**
 * @module app:lowcode/resources/database/catalog/table/preview-view-ops
 * 职责：物理表数据预览（builtin tableData 语义 → GetData 物理表描述 + 只读命令 DataView）。
 */
import {
  DataViewLocalQuery,
  ensureDataSetFileCommandView,
  ensureDataSetStaticInputTable,
  type DataRow,
  type DataSet,
  type DataView,
  type DataSetCommandScopeGuard,
} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
} from '../table-view'

export const DATABASE_TABLE_PREVIEW_INPUT_TABLE = 'DatabaseTablePreviewInput'
export const DATABASE_TABLE_PREVIEW_RESULT_TABLE = 'DatabaseTablePreviewRows'
export const DATABASE_VIEW_PREVIEW_INPUT_TABLE = 'DatabaseViewPreviewInput'
export const DATABASE_VIEW_PREVIEW_RESULT_TABLE = 'DatabaseViewPreviewRows'

export type DatabaseCatalogPreviewParams = Readonly<{
  dbId: string
  tableName: string
  tblid: string
  pageIndex?: number
  pageSize?: number
}>

export type DatabaseCatalogViewPreviewParams = Readonly<{
  dbId: string
  viewName: string
  pageIndex?: number
  pageSize?: number
}>

type PreviewFieldDescriptor = Readonly<{
  name: string
  label: string
  fieldType: string
  isPrimaryKey: boolean
}>

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseGetDataPage(response: unknown): {items: DataRow[]; total: number} {
  if (!isRecord(response)) throw new Error('物理表预览响应格式无效')
  if ('Code' in response) {
    const code = response['Code']
    if (typeof code !== 'number') throw new LowcodeApiError(0, 'lowcode 响应缺少数字 Code')
    if (code !== 200) {
      const message = response['Message']
      throw new LowcodeApiError(code,
        typeof message === 'string' && message.trim() !== '' ? message : 'lowcode 请求失败')
    }
  }
  const envelope = 'Code' in response ? response['Result'] : response
  if (!isRecord(envelope)) throw new Error('物理表预览结果无效')
  const data = envelope['data']
  if (!isRecord(data)) throw new Error('物理表预览数据块无效')
  const itemsRaw = data['Items']
  const items = Array.isArray(itemsRaw)
    ? itemsRaw.filter(isRecord).map(row => ({...row}))
    : []
  const total = Number(data['Count'])
  return {items, total: Number.isFinite(total) ? total : items.length}
}

function previewFieldsFromCatalog(dataSet: DataSet, tblid: string): PreviewFieldDescriptor[] {
  if (!tblid) return []
  const fieldView = dataSet.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)
  if (!fieldView) return []
  return fieldView.rows
    .filter(row => scalar(row['tblid']) === tblid && scalar(row['enname']) !== '')
    .map(row => ({
      name: scalar(row['enname']),
      label: scalar(row['cnname']) || scalar(row['enname']),
      fieldType: scalar(row['DataTypeName']) || 'varchar',
      isPrimaryKey: scalar(row['IsPKey']) === '1' || row['IsPKey'] === 1 || row['IsPKey'] === true,
    }))
}

function resolvePrimaryKey(fields: readonly PreviewFieldDescriptor[]): string {
  return fields.find(field => field.isPrimaryKey)?.name ?? 'rowid'
}

function syncPreviewColumns(view: DataView, rows: readonly DataRow[]): void {
  const table = view.dataTable
  if (!table || rows.length === 0) return
  const sample = rows[0]
  if (!sample) return
  const names = Object.keys(sample).filter(key => !key.startsWith('lingma_'))
  table.addColumns(names.map(name => ({name, type: 'string' as const})))
}

type ReadonlyQueryResultInput = Readonly<{view: DataView; rows: readonly DataRow[]; total: number; guard: DataSetCommandScopeGuard}>

function readonlyQueryResult(input: ReadonlyQueryResultInput) {
  input.guard()
  const fields = new Set(input.view.columns.filter(column => column.name !== '_pk' && !column.computeExpression).map(column => column.name))
  const {rows: outputRows, output} = DataViewLocalQuery.select({
    rows: [...input.rows],
    fields,
    primaryKeys: input.view.primaryKey ? [input.view.primaryKey] : [],
    params: {page: 1, allPages: true, treeMode: 'flat'},
  })
  const rowKey = (row: Readonly<DataRow>) => (input.view.primaryKey ? row[input.view.primaryKey] : undefined)
  const keys = new Set(outputRows.map(rowKey))
  const allowed = (key: unknown, field: string) => key !== undefined && keys.has(key) && output.has(field)
  return {
    rows: outputRows,
    total: input.total,
    rowKey,
    assertIdentity: () => input.guard(),
    fieldAccess: (key: unknown, field: string) => ({
      read: allowed(key, field) ? 'visible' as const : 'invisible' as const,
      write: 'denied' as const,
      component: allowed(key, field) ? 'readonly' as const : 'hidden' as const,
      required: false,
      writeMode: 'readonly' as const,
    }),
    readFieldAccess: (row: DataRow, field: string) => (outputRows.includes(row) && output.has(field) ? 'visible' as const : 'invisible' as const),
    addActionState: () => 'hidden' as const,
    editActionState: () => 'hidden' as const,
    deleteActionState: () => 'hidden' as const,
    createChildActionState: () => 'hidden' as const,
    viewActionState: (key: unknown, available = true) => (keys.has(key) ? (available ? 'enabled' as const : 'disabled' as const) : 'hidden' as const),
  }
}

type FetchPhysicalPreviewPageInput = Readonly<{
  http: HttpClientBase
  dataSet: DataSet
  input: DatabaseCatalogPreviewParams
  pageIndex: number
  pageSize: number
}>

async function fetchPhysicalPreviewPage(fetch: FetchPhysicalPreviewPageInput): Promise<{items: DataRow[]; total: number}> {
  const {http, dataSet, input, pageIndex, pageSize} = fetch
  const dbId = input.dbId.trim()
  const tableName = input.tableName.trim()
  if (!dbId || !tableName) throw new Error('缺少数据库或表名，无法预览数据')
  const scenarioId = dataSet.scenarioId?.trim()
  if (!scenarioId) throw new Error('缺少数据空间身份，无法预览物理表')
  const fields = previewFieldsFromCatalog(dataSet, input.tblid.trim())
  const primaryKey = resolvePrimaryKey(fields)
  const descriptor: Record<string, unknown> = {
    Name: tableName,
    Type: '数据库表',
    DbName: dbId,
    DbId: dbId,
    OutputType: 'Table',
    PrimaryKeyFields: primaryKey,
    Filter: null,
    ...(fields.length ? {Fields: fields.map(field => ({...field}))} : {}),
  }
  const response = await http.post<unknown>('/api/DataOperation/GetData', {
    Table: [descriptor],
    PageParam: {index: pageIndex, size: pageSize},
  })
  return parseGetDataPage(response)
}

export function databaseCatalogHasTablePreview(dataSet: DataSet): boolean {
  return Boolean(dataSet.getView(DATABASE_TABLE_PREVIEW_RESULT_TABLE, 'default'))
}

export function requireDatabaseCatalogPreviewView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_TABLE_PREVIEW_RESULT_TABLE, 'default')
  if (!view) throw new Error('物理表预览未装配')
  return view
}

export function databaseCatalogPreviewWriteInput(dataSet: DataSet, params: DatabaseCatalogPreviewParams): void {
  const table = dataSet.getTable(DATABASE_TABLE_PREVIEW_INPUT_TABLE)
  const row = table?.rows[0]
  if (!row) throw new Error('预览命令输入未就绪')
  row['dbId'] = params.dbId.trim()
  row['tableName'] = params.tableName.trim()
  row['tblid'] = params.tblid.trim()
  if (params.pageIndex !== undefined) row['pageIndex'] = String(params.pageIndex)
  if (params.pageSize !== undefined) row['pageSize'] = String(params.pageSize)
}

export async function databaseCatalogPreviewRefresh(
  dataSet: DataSet,
  view: DataView,
  params: DatabaseCatalogPreviewParams,
): Promise<void> {
  databaseCatalogPreviewWriteInput(dataSet, params)
  if (params.pageSize !== undefined) await view.setPageSize(params.pageSize)
  if (params.pageIndex !== undefined) await view.setPage(params.pageIndex)
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

/** 幂等装配物理表预览只读 DataView（同 FormKey，不另建服务器选择）。 */
export function attachDatabaseCatalogTablePreviewView(
  dataSet: DataSet,
  http: HttpClientBase,
  guard: DataSetCommandScopeGuard,
): void {
  if (dataSet.getTable(DATABASE_TABLE_PREVIEW_RESULT_TABLE)) return
  ensureDataSetStaticInputTable(dataSet, DATABASE_TABLE_PREVIEW_INPUT_TABLE, [
    {name: 'commandId', primary: true}, {name: 'dbId'}, {name: 'tableName'}, {name: 'tblid'}, {name: 'pageIndex'}, {name: 'pageSize'},
  ])
  const inputTable = dataSet.getTable(DATABASE_TABLE_PREVIEW_INPUT_TABLE)
  if (!inputTable) throw new Error('预览命令输入表未装配')
  if (inputTable.rows.length === 0) {
    inputTable.addRows([{commandId: 'default', dbId: '', tableName: '', tblid: '', pageIndex: '1', pageSize: '10'}])
  }
  const view = ensureDataSetFileCommandView({dataSet, tableName: DATABASE_TABLE_PREVIEW_RESULT_TABLE, resourceId: 'database-table-preview', columns: [{name: 'rowid', primary: true}]})
  view.bindQueryExecutor({
    localAggregates: false,
    queryColumns: target => target.dataTable?.columns ?? [],
    executeQuery: async (target, params) => {
      guard()
      const inputRow = dataSet.getTable(DATABASE_TABLE_PREVIEW_INPUT_TABLE)?.rows[0]
      if (!inputRow) throw new Error('预览命令输入未就绪')
      const pageIndex = params.page ?? (Number(scalar(inputRow['pageIndex'])) || 1)
      const pageSize = params.pageSize ?? (Number(scalar(inputRow['pageSize'])) || 10)
      const previewParams: DatabaseCatalogPreviewParams = {
        dbId: scalar(inputRow['dbId']),
        tableName: scalar(inputRow['tableName']),
        tblid: scalar(inputRow['tblid']),
        pageIndex,
        pageSize,
      }
      const {items, total} = await fetchPhysicalPreviewPage({http, dataSet, input: previewParams, pageIndex, pageSize})
      guard()
      syncPreviewColumns(target, items)
      return readonlyQueryResult({view: target, rows: items, total, guard})
    },
  }, {resource: {resourceType: 'file', resourceId: 'database-table-preview'}})
}

type FetchViewPreviewPageInput = Readonly<{
  http: HttpClientBase
  dataSet: DataSet
  input: DatabaseCatalogViewPreviewParams
  pageIndex: number
  pageSize: number
}>

async function fetchViewPreviewPage(fetch: FetchViewPreviewPageInput): Promise<{items: DataRow[]; total: number}> {
  const {http, dataSet, input, pageIndex, pageSize} = fetch
  const dbId = input.dbId.trim()
  const viewName = input.viewName.trim()
  if (!dbId || !viewName) throw new Error('缺少数据库或视图名，无法预览数据')
  const scenarioId = dataSet.scenarioId?.trim()
  if (!scenarioId) throw new Error('缺少数据空间身份，无法预览视图')
  const descriptor: Record<string, unknown> = {
    Name: viewName,
    Type: '数据库视图',
    DbName: dbId,
    DbId: dbId,
    OutputType: 'Table',
    PrimaryKeyFields: 'rowid',
    Filter: null,
  }
  const response = await http.post<unknown>('/api/DataOperation/GetData', {
    Table: [descriptor],
    PageParam: {index: pageIndex, size: pageSize},
  })
  return parseGetDataPage(response)
}

export function databaseCatalogHasViewPreview(dataSet: DataSet): boolean {
  return Boolean(dataSet.getView(DATABASE_VIEW_PREVIEW_RESULT_TABLE, 'default'))
}

export function requireDatabaseCatalogViewPreviewView(dataSet: DataSet): DataView {
  const view = dataSet.getView(DATABASE_VIEW_PREVIEW_RESULT_TABLE, 'default')
  if (!view) throw new Error('数据库视图预览未装配')
  return view
}

export function databaseCatalogViewPreviewWriteInput(dataSet: DataSet, params: DatabaseCatalogViewPreviewParams): void {
  const table = dataSet.getTable(DATABASE_VIEW_PREVIEW_INPUT_TABLE)
  const row = table?.rows[0]
  if (!row) throw new Error('视图预览命令输入未就绪')
  row['dbId'] = params.dbId.trim()
  row['viewName'] = params.viewName.trim()
  if (params.pageIndex !== undefined) row['pageIndex'] = String(params.pageIndex)
  if (params.pageSize !== undefined) row['pageSize'] = String(params.pageSize)
}

export async function databaseCatalogViewPreviewRefresh(
  dataSet: DataSet,
  view: DataView,
  params: DatabaseCatalogViewPreviewParams,
): Promise<void> {
  databaseCatalogViewPreviewWriteInput(dataSet, params)
  if (params.pageSize !== undefined) await view.setPageSize(params.pageSize)
  if (params.pageIndex !== undefined) await view.setPage(params.pageIndex)
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

export function attachDatabaseCatalogViewPreviewView(
  dataSet: DataSet,
  http: HttpClientBase,
  guard: DataSetCommandScopeGuard,
): void {
  if (dataSet.getTable(DATABASE_VIEW_PREVIEW_RESULT_TABLE)) return
  ensureDataSetStaticInputTable(dataSet, DATABASE_VIEW_PREVIEW_INPUT_TABLE, [
    {name: 'commandId', primary: true}, {name: 'dbId'}, {name: 'viewName'}, {name: 'pageIndex'}, {name: 'pageSize'},
  ])
  const inputTable = dataSet.getTable(DATABASE_VIEW_PREVIEW_INPUT_TABLE)
  if (!inputTable) throw new Error('视图预览命令输入表未装配')
  if (inputTable.rows.length === 0) {
    inputTable.addRows([{commandId: 'default', dbId: '', viewName: '', pageIndex: '1', pageSize: '10'}])
  }
  const view = ensureDataSetFileCommandView({dataSet, tableName: DATABASE_VIEW_PREVIEW_RESULT_TABLE, resourceId: 'database-view-preview', columns: [{name: 'rowid', primary: true}]})
  view.bindQueryExecutor({
    localAggregates: false,
    queryColumns: target => target.dataTable?.columns ?? [],
    executeQuery: async (target, params) => {
      guard()
      const inputRow = dataSet.getTable(DATABASE_VIEW_PREVIEW_INPUT_TABLE)?.rows[0]
      if (!inputRow) throw new Error('视图预览命令输入未就绪')
      const pageIndex = params.page ?? (Number(scalar(inputRow['pageIndex'])) || 1)
      const pageSize = params.pageSize ?? (Number(scalar(inputRow['pageSize'])) || 10)
      const previewParams: DatabaseCatalogViewPreviewParams = {
        dbId: scalar(inputRow['dbId']),
        viewName: scalar(inputRow['viewName']),
        pageIndex,
        pageSize,
      }
      const {items, total} = await fetchViewPreviewPage({http, dataSet, input: previewParams, pageIndex, pageSize})
      guard()
      syncPreviewColumns(target, items)
      return readonlyQueryResult({view: target, rows: items, total, guard})
    },
  }, {resource: {resourceType: 'file', resourceId: 'database-view-preview'}})
}
