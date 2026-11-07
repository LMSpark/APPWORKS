/**
 * @module app:lowcode/resources/database/catalog/table/preview-view-ops
 * 职责：物理表数据预览（builtin tableData 语义 → GetData 物理表描述 + 只读命令 SparkData.DataView）。
 */
import * as SparkData from '@spark-appworks/spark-data'
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

type PreviewFieldWire = Readonly<{
  Name: string
  Description: string
  FieldType: string
  IsOutput: true
  AsName: string
  IsPKey: boolean
  Order: number
}>

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type PreviewPage = Readonly<{items: SparkData.DataRow[]; total: number; primaryKey: string | null; columns?: readonly SparkData.DataColumn[] }>

function parseGetDataPage(response: unknown): PreviewPage {
  if (!isRecord(response)) throw new Error('物理表预览响应格式无效')
  const code = response['Code']
  if (typeof code !== 'number') throw new LowcodeApiError(0, 'lowcode 响应缺少数字 Code')
  if (code !== 200) {
    const message = response['Message']
    throw new LowcodeApiError(code, typeof message === 'string' && message.trim() !== '' ? message : 'lowcode 请求失败')
  }
  const envelope = response['Result']
  if (!isRecord(envelope)) throw new Error('物理表预览结果无效')
  const data = envelope['data']
  if (!isRecord(data)) throw new Error('物理表预览数据块无效')
  const items = data['Items'], total = data['Count'], primaryKey = envelope['primaryKeyField']
  if (!Array.isArray(items) || !items.every(isRecord)) throw new Error('预览 Items 必须是记录数组')
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || total < items.length) throw new Error('预览缺少有效的服务端总数')
  if (primaryKey !== null && (typeof primaryKey !== 'string' || !primaryKey.trim())) throw new Error('预览缺少正式来源键声明')
  return {items: items.map(row => ({...row})), total, primaryKey}
}

function isPrimaryKey(value: unknown): boolean {
  return value === 1 || value === '1' || value === true
}

function previewFieldsFromCatalog(dataSet: SparkData.DataSet, tblid: string): PreviewFieldWire[] {
  if (!tblid) return []
  const fieldView = dataSet.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)
  if (!fieldView) return []
  return fieldView.rows
    .filter(row => scalar(row['tblid']) === tblid && scalar(row['enname']) !== '')
    .map((row, index) => {
      const name = scalar(row['enname'])
      return {
        Name: name,
        Description: scalar(row['cnname']),
        FieldType: scalar(row['DataTypeName']) || 'varchar',
        IsOutput: true,
        AsName: scalar(row['AsName']) || name,
        IsPKey: isPrimaryKey(row['IsPKey']),
        Order: index + 1,
      }
    })
}

export type DatabaseCatalogPreviewColumn = Readonly<{name: string; label: string}>

/** 数据页列跟字段目录：字段名是 enname，标题是 cnname。 */
export function databaseCatalogPreviewColumns(dataSet: SparkData.DataSet, tblid: string): DatabaseCatalogPreviewColumn[] {
  const id = tblid.trim()
  if (!id) return []
  const fieldView = dataSet.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)
  if (!fieldView) return []
  return fieldView.rows.flatMap(row => {
    if (scalar(row['tblid']) !== id) return []
    const name = scalar(row['enname'])
    if (!name) return []
    return [{name, label: scalar(row['cnname']) || name}]
  })
}

export function applyDatabaseCatalogPreviewColumns(view: SparkData.DataView, columns: readonly DatabaseCatalogPreviewColumn[]): void {
  const dataSet = view.dataSet
  if (!dataSet) throw new Error('PREVIEW_BINDING_IDENTITY: 预览实例已释放')
  const binding = [...(previewBindings.get(dataSet)?.values() ?? [])].find(item => item.view === view)
  if (!binding) throw new Error('PREVIEW_BINDING_IDENTITY: 字段定义不属于本次预览')
  assertPreviewBinding(binding)
  const table = view.dataTable
  if (!table || columns.length === 0) return
  table.addColumns(columns.map(column => ({name: column.name, type: 'string' as const, label: column.label})))
}

function resolvePrimaryKey(dataSet: SparkData.DataSet, tblid: string): string {
  const fieldView = dataSet.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)
  const primary = fieldView?.rows.find(row => scalar(row['tblid']) === tblid && scalar(row['enname']) !== '' && isPrimaryKey(row['IsPKey']))
  return primary ? scalar(primary['enname']) : 'rowid'
}

type ReadonlyQueryResultInput = Readonly<{view: SparkData.DataView; page: PreviewPage; guard: SparkData.DataSetCommandScopeGuard}>

function readonlyQueryResult(input: ReadonlyQueryResultInput) {
  input.guard()
  const {items, total, primaryKey} = input.page
  const values = primaryKey === null ? [] : items.map(row => row[primaryKey])
  const validKeys = values.every(value => (typeof value === 'string' || typeof value === 'number') && String(value).trim() !== '')
  const key = primaryKey !== null && validKeys && new Set(values.map(String)).size === items.length ? primaryKey : ''
  const metadata = [...(input.page.columns ?? []), ...(input.view.dataTable?.columns ?? [])]
  const names = new Set(items.flatMap(row => Object.keys(row).filter(name => name !== '_pk' && !name.startsWith('lingma_'))))
  const columns: SparkData.DataColumn[] = [...names].map(name => ({name, type: 'string', label: metadata.find(column => column.name === name)?.label ?? name}))
  const fields = new Set(columns.map(column => column.name))
  const {rows: outputRows, output} = SparkData.DataViewLocalQuery.select({rows: [...items], fields,
    primaryKeys: key ? [key] : [], params: {page: 1, allPages: true, treeMode: 'flat'}})
  const rowKey = (row: Readonly<SparkData.DataRow>) => {
    const value = key ? row[key] : undefined
    return (typeof value === 'string' || typeof value === 'number') && String(value).trim() !== '' ? String(value) : undefined
  }
  const keys = new Set(outputRows.map(rowKey).filter(value => value !== undefined))
  const allowed = (value: unknown, field: string) => typeof value === 'string' && keys.has(value) && output.has(field)
  return {
    rows: outputRows, total, countReported: true, columns, resultPrimaryKey: key, reportedPrimaryKey: primaryKey ?? undefined,
    rowKey, assertIdentity: () => input.guard(),
    fieldAccess: (value: unknown, field: string) => ({read: allowed(value, field) ? 'visible' as const : 'invisible' as const,
      write: 'denied' as const, component: allowed(value, field) ? 'readonly' as const : 'hidden' as const,
      required: false, writeMode: 'readonly' as const}),
    readFieldAccess: (row: SparkData.DataRow, field: string) => outputRows.includes(row) && output.has(field) ? 'visible' as const : 'invisible' as const,
    addActionState: () => 'hidden' as const, editActionState: () => 'hidden' as const, deleteActionState: () => 'hidden' as const,
    createChildActionState: () => 'hidden' as const,
    viewActionState: (value: unknown, available = true) => typeof value === 'string' && keys.has(value) ? available ? 'enabled' as const : 'disabled' as const : 'hidden' as const,
  }
}

type FetchPhysicalPreviewPageInput = Readonly<{
  http: HttpClientBase
  dataSet: SparkData.DataSet
  input: DatabaseCatalogPreviewParams
  pageIndex: number
  pageSize: number
}>

async function fetchPhysicalPreviewPage(fetch: FetchPhysicalPreviewPageInput): Promise<PreviewPage> {
  const {http, dataSet, input, pageIndex, pageSize} = fetch
  const dbId = input.dbId.trim()
  const tableName = input.tableName.trim()
  if (!dbId || !tableName) throw new Error('缺少数据库或表名，无法预览数据')
  const scenarioId = dataSet.scenarioId?.trim()
  if (!scenarioId) throw new Error('缺少数据空间身份，无法预览物理表')
  const fields = previewFieldsFromCatalog(dataSet, input.tblid.trim())
  const primaryKey = resolvePrimaryKey(dataSet, input.tblid.trim())
  const payload = {
    Table: [{
      Name: tableName,
      Type: '数据库表',
      DbName: dbId,
      DbId: dbId,
      OutputType: 'Table',
      PrimaryKeyFields: primaryKey,
      Filter: null,
      Fields: fields,
    }],
    PageParam: {index: pageIndex, size: pageSize},
  }
  const page = await postPhysicalPreview(http, payload)
  return {...page, columns: fields.map(field => ({name: field.AsName, label: field.Description || field.AsName, type: 'string'}))}
}

type PhysicalPreviewDescriptor = Readonly<{
  Name: string
  Type: string
  DbName: string
  DbId: string
  OutputType: string
  PrimaryKeyFields: string
  Filter: null
  Fields: readonly PreviewFieldWire[]
}>

type PhysicalPreviewRequest = Readonly<{
  Table: readonly PhysicalPreviewDescriptor[]
  PageParam: Readonly<{index: number; size: number}>
}>

/** 消费正式公开查询结果；拒绝保持原错误，不从文案推导另一种查询授权。 */
async function postPhysicalPreview(http: HttpClientBase, payload: PhysicalPreviewRequest): Promise<PreviewPage> {
  return parseGetDataPage(await http.post<unknown>('/api/DataOperation/GetData', payload))
}

type FetchViewPreviewPageInput = Readonly<{
  http: HttpClientBase
  dataSet: SparkData.DataSet
  input: DatabaseCatalogViewPreviewParams
  pageIndex: number
  pageSize: number
}>

async function fetchViewPreviewPage(fetch: FetchViewPreviewPageInput): Promise<PreviewPage> {
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

type PreviewKind = 'table' | 'view'
type PreviewBinding = {
  dataSet: SparkData.DataSet; kind: PreviewKind; scenarioId: string; guard: SparkData.DataSetCommandScopeGuard
  inputName: string; resultName: string; resourceId: string
  inputTable: NonNullable<ReturnType<SparkData.DataSet['getTable']>>; inputView: SparkData.DataView; inputRow: SparkData.DataRow
  resultTable: NonNullable<ReturnType<SparkData.DataSet['getTable']>>; view: SparkData.DataView
  operation: number
  assertOwner: (view: SparkData.DataView) => void
}
const previewBindings = new WeakMap<SparkData.DataSet, Map<PreviewKind, PreviewBinding>>()

function previewSpec(kind: PreviewKind) {
  return kind === 'table'
    ? {inputName: DATABASE_TABLE_PREVIEW_INPUT_TABLE, resultName: DATABASE_TABLE_PREVIEW_RESULT_TABLE, resourceId: 'database-table-preview', fields: ['dbId', 'tableName', 'tblid']}
    : {inputName: DATABASE_VIEW_PREVIEW_INPUT_TABLE, resultName: DATABASE_VIEW_PREVIEW_RESULT_TABLE, resourceId: 'database-view-preview', fields: ['dbId', 'viewName']}
}

function assertPreviewBinding(binding: PreviewBinding, target: SparkData.DataView = binding.view): void {
  const {dataSet, inputName, resultName, inputTable, inputView, resultTable, view} = binding
  binding.guard()
  if (dataSet.destroyed || dataSet.scenarioId !== binding.scenarioId || inputView.destroyed || view.destroyed || target.destroyed
    || dataSet.getTable(inputName) !== inputTable || dataSet.getView(inputName, 'default') !== inputView
    || inputTable.rows[0] !== binding.inputRow || inputView.primaryKey !== 'commandId'
    || dataSet.getTable(resultName) !== resultTable || dataSet.getView(resultName, 'default') !== view
    || target.dataTable !== resultTable || dataSet.getView(resultName, target.viewId) !== target) {
    throw new Error('PREVIEW_BINDING_IDENTITY: 原预览输入或结果实例已失效')
  }
  SparkData.ensureDataSetStaticInputTable(dataSet, inputName, [{name: 'commandId', primary: true}, ...previewSpec(binding.kind).fields.map(name => ({name}))])
  SparkData.ensureDataSetFileCommandView({dataSet, tableName: resultName, resourceId: binding.resourceId, columns: [{name: 'rowid', primary: true}]})
  binding.assertOwner(target)
}

function requirePreviewBinding(dataSet: SparkData.DataSet, kind: PreviewKind, target?: SparkData.DataView): PreviewBinding {
  const binding = previewBindings.get(dataSet)?.get(kind)
  if (!binding || target && target !== binding.view) throw new Error('PREVIEW_BINDING_IDENTITY: 预览未装配或结果属于其他实例')
  assertPreviewBinding(binding)
  return binding
}

function pageValue(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`预览${label}须为正整数`)
  return value
}

function writePreviewInput(options: Readonly<{dataSet: SparkData.DataSet; kind: PreviewKind; params: DatabaseCatalogPreviewParams | DatabaseCatalogViewPreviewParams}>): PreviewBinding {
  const {dataSet, kind, params} = options, binding = requirePreviewBinding(dataSet, kind)
  binding.view.assertResultReplacementAllowed()
  binding.inputView.assertResultReplacementAllowed()
  const name = kind === 'table' ? 'tableName' in params ? params.tableName.trim() : '' : 'viewName' in params ? params.viewName.trim() : ''
  const dbId = params.dbId.trim()
  if (!dbId || !name) throw new Error('缺少数据库或对象名称，无法预览数据')
  const pageSize = pageValue(params.pageSize ?? binding.view.pageSize, '页大小')
  const page = pageValue(params.pageIndex ?? (params.pageSize !== undefined ? 1 : binding.view.page), '页码')
  const targetField = kind === 'table' ? 'tableName' : 'viewName'
  const tblid = kind === 'table' && 'tblid' in params ? params.tblid.trim() : ''
  if (scalar(binding.inputRow['dbId']) !== dbId || scalar(binding.inputRow[targetField]) !== name
    || kind === 'table' && scalar(binding.inputRow['tblid']) !== tblid) binding.operation++
  binding.inputRow['dbId'] = dbId
  binding.inputRow[kind === 'table' ? 'tableName' : 'viewName'] = name
  if (kind === 'table' && 'tblid' in params) binding.inputRow['tblid'] = params.tblid.trim()
  binding.view.configure({page, pageSize})
  return binding
}

async function refreshPreview(options: Readonly<{dataSet: SparkData.DataSet; view: SparkData.DataView; kind: PreviewKind; params: DatabaseCatalogPreviewParams | DatabaseCatalogViewPreviewParams}>): Promise<void> {
  const {dataSet, view, kind, params} = options
  requirePreviewBinding(dataSet, kind, view)
  const binding = writePreviewInput({dataSet, kind, params}), operation = binding.operation
  const page = view.page, pageSize = view.pageSize
  await view.refresh()
  if (operation !== binding.operation || view.page !== page || view.pageSize !== pageSize || view.requestState === SparkData.RequestState.Loading) throw new Error('PREVIEW_REQUEST_SUPERSEDED: 预览请求已被替代')
  if (view.loadingError) throw view.loadingError
  if (view.requestState !== SparkData.RequestState.Loaded) throw new Error('PREVIEW_REQUEST_SUPERSEDED: 预览请求已被替代')
  assertPreviewBinding(binding)
}

async function queryPreview(options: Readonly<{
  binding: PreviewBinding; target: SparkData.DataView; http: HttpClientBase; params: Parameters<Parameters<SparkData.DataView['bindQueryExecutor']>[0]['executeQuery']>[1]
}>) {
  const {binding, target, http, params} = options
  assertPreviewBinding(binding, target)
  const operation = binding.operation, row = binding.inputRow, id = row['commandId']
  const fields = previewSpec(binding.kind).fields
  const values = fields.map(field => scalar(row[field]))
  const configuredPage = target.page, configuredSize = target.pageSize
  const pageIndex = pageValue(params.page ?? configuredPage, '页码'), pageSize = pageValue(params.pageSize ?? configuredSize, '页大小')
  const assertCurrent = (): void => {
    assertPreviewBinding(binding, target)
    if (binding.operation !== operation || row['commandId'] !== id
      || target.page !== configuredPage || target.pageSize !== configuredSize || fields.some((field, index) => scalar(row[field]) !== values[index])) {
      throw new Error('PREVIEW_REQUEST_SUPERSEDED: 预览查询输入或页码已变化')
    }
  }
  const page = binding.kind === 'table'
    ? await fetchPhysicalPreviewPage({http, dataSet: binding.dataSet, input: {dbId: scalar(row['dbId']), tableName: scalar(row['tableName']), tblid: scalar(row['tblid'])}, pageIndex, pageSize})
    : await fetchViewPreviewPage({http, dataSet: binding.dataSet, input: {dbId: scalar(row['dbId']), viewName: scalar(row['viewName'])}, pageIndex, pageSize})
  assertCurrent()
  return readonlyQueryResult({view: target, page, guard: assertCurrent})
}

function attachPreview(options: Readonly<{dataSet: SparkData.DataSet; http: HttpClientBase; guard: SparkData.DataSetCommandScopeGuard; kind: PreviewKind}>): void {
  const {dataSet, http, guard, kind} = options, spec = previewSpec(kind)
  const previous = previewBindings.get(dataSet)?.get(kind)
  const released = previous?.inputView.destroyed === true && previous.view.destroyed
    && dataSet.getTable(previous.inputName) !== previous.inputTable && dataSet.getTable(previous.resultName) !== previous.resultTable
  if (previous && !released) {assertPreviewBinding(previous); return}
  if (dataSet.destroyed || !dataSet.scenarioId?.trim()) throw new Error('PREVIEW_BINDING_IDENTITY: 预览需要存活的明确数据空间')
  guard()
  const columns = [{name: 'commandId', primary: true}, ...spec.fields.map(name => ({name}))]
  const existingInput = dataSet.getTable(spec.inputName)
  if (existingInput) {
    SparkData.ensureDataSetStaticInputTable(dataSet, spec.inputName, columns)
    const current = dataSet.getView(spec.inputName, 'default'), row = existingInput.rows[0]
    if (current?.destroyed !== false || current.primaryKey !== 'commandId' || existingInput.rows.length > 1
      || row && (typeof row['commandId'] !== 'string' || !row['commandId'].trim())) throw new Error('PREVIEW_BINDING_IDENTITY: 预览输入无效')
  }
  const resource = {resourceType: 'file', resourceId: spec.resourceId}
  const executor: Parameters<SparkData.DataView['bindQueryExecutor']>[0] = {
    localAggregates: false, queryColumns: target => target.dataTable?.columns ?? [],
    executeQuery: (target, params) => queryPreview({binding, target, http, params}),
  }
  const existing = dataSet.getTable(spec.resultName) ? SparkData.ensureDataSetFileCommandView({dataSet, tableName: spec.resultName,
    resourceId: spec.resourceId, columns: [{name: 'rowid', primary: true}]}) : undefined
  if (existing) {
    if (existing.destroyed || existing.primaryKey !== 'rowid') throw new Error('PREVIEW_BINDING_IDENTITY: 预览结果定义无效')
    existing.assertCanBindQueryExecutor(executor, {resource})
  }
  SparkData.ensureDataSetStaticInputTable(dataSet, spec.inputName, columns)
  const inputTable = dataSet.getTable(spec.inputName), inputView = dataSet.getView(spec.inputName, 'default')
  if (!inputTable || !inputView) throw new Error('预览输入装配失败')
  const view = existing ?? SparkData.ensureDataSetFileCommandView({dataSet, tableName: spec.resultName,
    resourceId: spec.resourceId, columns: [{name: 'rowid', primary: true}]})
  const resultTable = dataSet.getTable(spec.resultName)
  if (!resultTable) throw new Error('预览结果装配失败')
  if (!inputTable.rows.length) inputTable.addRows([Object.fromEntries(columns.map(column => [column.name, column.name === 'commandId' ? 'default' : '']))])
  const inputRow = inputTable.rows[0]
  if (!inputRow) throw new Error('预览输入行缺失')
  inputView.commitMode = 'staged'
  const binding: PreviewBinding = {dataSet, kind, scenarioId: dataSet.scenarioId, guard, ...spec, inputTable, inputView, inputRow,
    resultTable, view, operation: 0, assertOwner: target => target.assertCanBindQueryExecutor(executor, {resource})}
  view.bindQueryExecutor(executor, {resource})
  const registry = previewBindings.get(dataSet) ?? new Map<PreviewKind, PreviewBinding>()
  registry.set(kind, binding); previewBindings.set(dataSet, registry)
}

function hasPreview(dataSet: SparkData.DataSet, kind: PreviewKind): boolean {
  try {requirePreviewBinding(dataSet, kind); return true} catch {return false}
}
export function databaseCatalogHasTablePreview(dataSet: SparkData.DataSet): boolean {return hasPreview(dataSet, 'table')}
export function databaseCatalogHasViewPreview(dataSet: SparkData.DataSet): boolean {return hasPreview(dataSet, 'view')}
export function requireDatabaseCatalogPreviewView(dataSet: SparkData.DataSet): SparkData.DataView {return requirePreviewBinding(dataSet, 'table').view}
export function requireDatabaseCatalogViewPreviewView(dataSet: SparkData.DataSet): SparkData.DataView {return requirePreviewBinding(dataSet, 'view').view}
export function databaseCatalogPreviewWriteInput(dataSet: SparkData.DataSet, params: DatabaseCatalogPreviewParams): void {writePreviewInput({dataSet, kind: 'table', params})}
export function databaseCatalogViewPreviewWriteInput(dataSet: SparkData.DataSet, params: DatabaseCatalogViewPreviewParams): void {writePreviewInput({dataSet, kind: 'view', params})}
export function databaseCatalogPreviewRefresh(dataSet: SparkData.DataSet, view: SparkData.DataView, params: DatabaseCatalogPreviewParams): Promise<void> {return refreshPreview({dataSet, view, kind: 'table', params})}
export function databaseCatalogViewPreviewRefresh(dataSet: SparkData.DataSet, view: SparkData.DataView, params: DatabaseCatalogViewPreviewParams): Promise<void> {return refreshPreview({dataSet, view, kind: 'view', params})}
/** 幂等装配公开分页预览；无查询旁路，运行实例释放后才可重新装配。 */
export function attachDatabaseCatalogTablePreviewView(dataSet: SparkData.DataSet, http: HttpClientBase, guard: SparkData.DataSetCommandScopeGuard): void {attachPreview({dataSet, http, guard, kind: 'table'})}
export function attachDatabaseCatalogViewPreviewView(dataSet: SparkData.DataSet, http: HttpClientBase, guard: SparkData.DataSetCommandScopeGuard): void {attachPreview({dataSet, http, guard, kind: 'view'})}
