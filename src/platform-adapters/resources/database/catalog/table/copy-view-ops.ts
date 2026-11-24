/**
 * @module app:platform-adapters/resources/database/catalog/table/copy-view-ops
 * 职责：捕获完整表/字段来源，经原 DataView owner 暂存精确副本；unknown 只核原批次，最终读回核对显式主键。
 */
import {DataViewFilter, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {
  DATABASE_CATALOG_COMMAND_INPUT_TABLE,
  DATABASE_CATALOG_COPY_INPUT_VIEW,
  DATABASE_CATALOG_FIELD_COPY_VIEW,
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_TABLE_MODEL,
} from '../table-view'
import {requireDatabaseCatalogFieldView} from './field-view-ops'
import {requireDatabaseCatalogTableView} from './view-ops'

const fieldCopyKeys = [
  'enname', 'cnname', 'DataTypeName', 'DataType', 'DataLen',
  'IsNill', 'IsPKey', 'IsUQ', 'IsSys', 'isGrowth', 'DefaultValue', 'AsName',
  'encryption_rule', 'DesenID', 'Memo', 'ordIdx',
] as const
const sourceFieldKeys = ['rowid', 'tblid', 'tblname', ...fieldCopyKeys] as const
const copyInputFields = {
  sourceTableId: 'copySourceTableId',
  sourceDbId: 'copySourceDbId',
  sourceLabel: 'copySourceLabel',
  tableId: 'copyTableId',
  tableName: 'copyTableName',
  tableDesc: 'copyTableDesc',
} as const

type CopyBeginInput = Readonly<{
  sourceTableId: string
  dbId: string
}>
type CopyReadbackInput = Readonly<{
  dataSet: DataSet
  capture: CopyCapture
  stage: CopyStage
  commandView: DataView
}>

type CopyStage = {
  tablePayload: Readonly<Record<string, string>>
  fieldPayloads: ReadonlyArray<Partial<DataRow>>
  stagedFieldIds: Array<string | number>
  saveAccepted: boolean
  batchId: string
}

type CopyCapture = {
  readonly sourceTableId: string
  readonly dbId: string
  readonly newTableId: string
  readonly tableView: DataView
  readonly tableProofView: DataView
  readonly sourceFieldView: DataView
  readonly sourceFieldProofView: DataView
  readonly stageFieldView: DataView
  readonly sourceTable: DataRow
  readonly sourceFields: DataRow[]
  readonly tableSourceFields: string[]
  stage?: CopyStage
}

const captures = new WeakMap<DataSet, CopyCapture>()

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

function compareName(value: unknown): string {
  return scalar(value).toLowerCase()
}

function copyFieldScalar(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (key === 'IsPKey' || key === 'IsUQ' || key === 'IsSys' || key === 'IsNill'
    || key === 'isGrowth' || key === 'ordIdx' || key === 'DataLen') {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  }
  return value
}

function copyFieldPayload(source: DataRow, tblid: string, tblname: string): Partial<DataRow> {
  const payload: Record<string, unknown> = {tblid, tblname}
  for (const key of fieldCopyKeys) payload[key] = copyFieldScalar(key, source[key])
  return payload
}

function assertNewRowPermission(view: DataView, payload: Partial<DataRow>): void {
  for (const field of Object.keys(payload)) {
    const access = view.newRowFieldAccess(field)
    if (access.read !== 'visible' || access.write !== 'allowed') {
      throw new Error(`当前正式查询不允许新增字段 ${field}`)
    }
  }
  if (view.addActionState() !== 'enabled') throw new Error('当前正式查询不允许新增记录')
}

async function requireCopyInputView(dataSet: DataSet): Promise<DataView> {
  const table = dataSet.getTable(DATABASE_CATALOG_COMMAND_INPUT_TABLE)
  if (!table) throw new Error('目录命令输入视图缺失')
  const view = table.getOrCreateView(DATABASE_CATALOG_COPY_INPUT_VIEW)
  view.commitMode = 'staged'
  if (view.rows.length === 0) {
    await view.refresh()
    if (view.loadingError) throw view.loadingError
  }
  const row = view.rows[0]
  if (!row || typeof view.getPkKey(row) !== 'string') throw new Error('复制表命令输入行身份无效')
  view.setCurrentRow(row)
  return view
}

function copyInputRow(view: DataView): Readonly<{id: string | number; current: DataRow}> {
  const source = view.rows[0]
  const id = source ? view.getPkKey(source) : undefined
  if (!source || (typeof id !== 'string' && typeof id !== 'number')) throw new Error('复制表命令输入行身份无效')
  return {id, current: view.getEditingRow(id) ?? source}
}

function sameCopiedValue(left: unknown, right: unknown, field: string): boolean {
  if (field === 'IsPKey' || field === 'IsUQ' || field === 'IsSys' || field === 'IsNill'
    || field === 'isGrowth' || field === 'ordIdx' || field === 'DataLen') {
    return scalar(left) === scalar(right)
  }
  return JSON.stringify(left) === JSON.stringify(right)
}

function clearCopyInput(view: DataView): void {
  const {id} = copyInputRow(view)
  view.discardEditingRows([id])
  view.updateRowById(id, Object.fromEntries(Object.values(copyInputFields).map(field => [field, ''])))
}

function exactRowKey(row: DataRow): string {
  const id = scalar(row['rowid'])
  if (!id) throw new Error('复制来源字段缺少显式 rowid')
  return id
}

function compareRows(actual: DataRow[], expected: DataRow[], fields: readonly string[]): void {
  const left = [...actual].sort((a, b) => exactRowKey(a).localeCompare(exactRowKey(b)))
  const right = [...expected].sort((a, b) => exactRowKey(a).localeCompare(exactRowKey(b)))
  if (left.length !== right.length) throw new Error('复制来源字段数量已变化，请重新打开复制对话框')
  for (let index = 0; index < right.length; index += 1) {
    const actualRow = left[index], expectedRow = right[index]
    if (!actualRow || !expectedRow || exactRowKey(actualRow) !== exactRowKey(expectedRow)
      || fields.some(field => !sameCopiedValue(actualRow[field], expectedRow[field], field))) {
      throw new Error('复制来源字段已变化，请重新打开复制对话框')
    }
  }
}

async function readSourceTable(view: DataView, tableId: string, fields: readonly string[]): Promise<DataRow> {
  const rows = await view.queryOptionRows({
    fields: [...fields],
    filter: DataViewFilter.condition({field: 'rowid', operator: 'eq', value: tableId}).toJSON(),
  })
  if (rows.length !== 1 || scalar(rows[0]?.['rowid']) !== tableId) {
    throw new Error('复制源表身份不唯一或已变化')
  }
  const row = rows[0]
  if (!row) throw new Error('复制源表身份不唯一或已变化')
  return row
}

async function readSourceFields(view: DataView, tableId: string): Promise<DataRow[]> {
  const rows = await view.queryOptionRows({
    fields: [...sourceFieldKeys],
    filter: DataViewFilter.condition({field: 'tblid', operator: 'eq', value: tableId}).toJSON(),
  })
  if (rows.length === 0 || rows.some(row => scalar(row['tblid']) !== tableId || !scalar(row['rowid']))) {
    throw new Error('源表字段读取不完整，无法复制')
  }
  const ids = rows.map(exactRowKey)
  if (new Set(ids).size !== rows.length) throw new Error('复制源字段 rowid 不唯一')
  return rows
}

async function assertSourceProof(capture: CopyCapture): Promise<void> {
  const currentTable=await readSourceTable(capture.tableProofView,capture.sourceTableId,capture.tableSourceFields)
  if (capture.tableSourceFields.some(field => !sameCopiedValue(currentTable[field], capture.sourceTable[field], field))) {
    throw new Error('复制源表已变化，请重新打开复制对话框')
  }
  compareRows(
    await readSourceFields(capture.sourceFieldProofView,capture.sourceTableId),
    capture.sourceFields,
    sourceFieldKeys,
  )
}

async function configureStageFieldView(view: DataView, newTableId: string): Promise<void> {
  await view.setFilter(DataViewFilter.condition({field: 'tblid', operator: 'eq', value: newTableId}).toJSON())
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

export async function databaseCatalogBeginTableCopy(dataSet: DataSet, input: CopyBeginInput): Promise<void> {
  const sourceTableId = input.sourceTableId.trim()
  const dbId = input.dbId.trim()
  if (!sourceTableId) throw new Error('请先选择要复制的表')
  if (!dbId) throw new Error('请先选择数据库')
  const previous = captures.get(dataSet)
  if (previous?.stage) throw new Error('上次复制尚待核验或清理，请先完成原复制')
  const tableView = requireDatabaseCatalogTableView(dataSet)
  const sourceFieldView = requireDatabaseCatalogFieldView(dataSet, DATABASE_CATALOG_FIELD_TABLE_VIEW)
  const fieldTable = sourceFieldView.dataTable
  if (!fieldTable) throw new Error('复制字段 DataTable owner 缺失')
  const stageFieldView = fieldTable.getOrCreateView(DATABASE_CATALOG_FIELD_COPY_VIEW)
  stageFieldView.commitMode = 'staged'
  if ([tableView, sourceFieldView, stageFieldView].some(view =>
    view.mutating || view.hasUnconfirmedSave || view.dirtyTracking.hasPendingChanges())) {
    throw new Error('目录保存进行中，不能复制表')
  }
  const selectedTableId = tableView.getSelectedValues()[0]
  if (typeof selectedTableId !== 'string' || selectedTableId !== sourceTableId) {
    throw new Error('复制来源必须是当前选中的表')
  }
  const current = tableView.rows.find(item => tableView.getPkKey(item) === sourceTableId)
  if (!current || compareName(current['dbid']) !== compareName(dbId)) throw new Error('源表不存在或不属于当前数据库')
  const schemaField = tableView.columns.find(column => column.name.toLowerCase() === 'schemaname')?.name
  const statusField = tableView.columns.find(column => column.name.toLowerCase() === 'status')?.name
  const tableSourceFields = [...new Set([
    'rowid', 'dbid', 'tblname', 'tbldesc',
    ...(schemaField ? [schemaField] : []),
    ...(statusField ? [statusField] : []),
  ])]
  const tableProofView=tableView.createQueryView(`copy-table-proof-${crypto.randomUUID()}`)
  const sourceFieldProofView=sourceFieldView.createQueryView(`copy-field-proof-${crypto.randomUUID()}`)
  tableProofView.filterExpression=undefined
  sourceFieldProofView.filterExpression=undefined
  try{
    const sourceTable=await readSourceTable(tableProofView,sourceTableId,tableSourceFields)
    const sourceFields=await readSourceFields(sourceFieldProofView,sourceTableId)
    const commandView=await requireCopyInputView(dataSet)
    clearCopyInput(commandView)
    const {id}=copyInputRow(commandView),newTableId=crypto.randomUUID().replaceAll('-', '').toUpperCase()
    commandView.updateRowById(id,{
      [copyInputFields.sourceTableId]:sourceTableId,
      [copyInputFields.sourceDbId]:dbId,
      [copyInputFields.sourceLabel]:scalar(sourceTable['tblname'])||sourceTableId,
      [copyInputFields.tableId]:newTableId,
    })
    captures.set(dataSet,{sourceTableId,dbId,newTableId,tableView,tableProofView,sourceFieldView,sourceFieldProofView,
      stageFieldView,sourceTable,sourceFields,tableSourceFields})
  }catch(error){
    tableProofView.dataTable?.destroyView(tableProofView.viewId)
    sourceFieldProofView.dataTable?.destroyView(sourceFieldProofView.viewId)
    throw error
  }
}

export function databaseCatalogCancelTableCopy(dataSet: DataSet): void {
  const capture = captures.get(dataSet)
  if (capture?.tableView.hasUnconfirmedSave || capture?.stageFieldView.hasUnconfirmedSave) {
    throw new Error('复制结果尚未确认，必须先核验原提交，不能清除')
  }
  if (capture?.stage?.saveAccepted) throw new Error('复制已接纳但尚未读回完成，请先核验原结果，不能清除')
  if (capture?.stage) {
    const journal=dataSet.saveJournal
    if(journal.batchId!==capture.stage.batchId)throw new Error('复制原保存批次已变化，不能清除')
    if(journal.currentRecoverableAction==='discard-not-applied')dataSet.discardSaveJournalNotApplied()
    else if(journal.currentRecoverableAction!=='none')throw new Error('复制原保存尚未确认，必须先核验原提交，不能清除')
    capture.tableView.discardPendingChanges([capture.newTableId])
    capture.stageFieldView.discardPendingChanges(capture.stage.stagedFieldIds)
  }
  const input = dataSet.getView(DATABASE_CATALOG_COMMAND_INPUT_TABLE, DATABASE_CATALOG_COPY_INPUT_VIEW)
  if (input) clearCopyInput(input)
  captures.delete(dataSet)
  capture?.tableProofView.dataTable?.destroyView(capture.tableProofView.viewId)
  capture?.sourceFieldProofView.dataTable?.destroyView(capture.sourceFieldProofView.viewId)
}

async function verifyReadback({dataSet,capture,stage,commandView}:CopyReadbackInput):Promise<string>{
  if (dataSet.destroyed || dataSet.getView(capture.tableView.tableName, capture.tableView.viewId) !== capture.tableView
    || dataSet.getView(capture.stageFieldView.tableName, capture.stageFieldView.viewId) !== capture.stageFieldView) {
    throw new Error('复制表原 DataView owner 已失效')
  }
  const headerFields = [...new Set([
    'rowid', ...Object.keys(stage.tablePayload),
  ])].filter(field => capture.tableView.getColumn(field) !== undefined)
  const headerRows=await capture.tableProofView.queryOptionRows({
    fields: headerFields,
    filter: DataViewFilter.group({logic: 'and', filters: [
      {field: 'dbid', operator: 'eq', value: capture.dbId},
      {field: 'tblname', operator: 'eq', value: stage.tablePayload['tblname'] ?? ''},
    ]}).toJSON(),
  })
  if (headerRows.length !== 1) throw new Error('复制已提交，但表 owner 未返回唯一新表')
  const header = headerRows[0]
  if (!header) throw new Error('复制已提交，但表 owner 未返回唯一新表')
  if (scalar(header['rowid']) !== capture.newTableId) throw new Error('复制已提交，但表 owner 返回的 rowid 与原捕获不一致')
  for (const [field, expected] of Object.entries(stage.tablePayload)) {
    if (!sameCopiedValue(header[field], expected, field)) {
      throw new Error(`复制已提交，但新表字段 ${field} 未通过原 owner 回读`)
    }
  }
  const fieldFields = [...new Set(['rowid', ...stage.fieldPayloads.flatMap(payload => Object.keys(payload))])]
  const verifiedFields = await capture.stageFieldView.queryOptionRows({
    fields: fieldFields,
    filter: DataViewFilter.condition({field: 'tblid', operator: 'eq', value: capture.newTableId}).toJSON(),
  })
  if (verifiedFields.length !== stage.fieldPayloads.length) {
    throw new Error('复制已提交，但字段 owner 未返回完整字段集合')
  }
  const verifiedById = new Map(verifiedFields.map(row => [scalar(row['rowid']), row]))
  if (verifiedById.size !== verifiedFields.length) throw new Error('复制字段 owner 返回重复 rowid')
  for (const [index, payload] of stage.fieldPayloads.entries()) {
    const id = stage.stagedFieldIds[index]
    if (id === undefined) throw new Error('复制字段暂存身份缺失')
    const row = verifiedById.get(scalar(id))
    if (!row) throw new Error('复制已提交，但字段 owner 返回的 rowid 与原暂存身份不一致')
    for (const [field, expected] of Object.entries(payload)) {
      if (!sameCopiedValue(row[field], expected, field)) {
        throw new Error(`复制已提交，但新字段 ${field} 未通过原 owner 回读`)
      }
    }
  }
  captures.delete(dataSet)
  clearCopyInput(commandView)
  capture.tableProofView.dataTable?.destroyView(capture.tableProofView.viewId)
  capture.sourceFieldProofView.dataTable?.destroyView(capture.sourceFieldProofView.viewId)
  return capture.newTableId
}

async function recoverOrVerifyCopy(dataSet: DataSet, capture: CopyCapture, commandView: DataView): Promise<string> {
  const stage = capture.stage
  if (!stage) throw new Error('复制尚未生成提交捕获')
  const recovering = capture.tableView.hasUnconfirmedSave || capture.stageFieldView.hasUnconfirmedSave
  if (recovering) {
    const result = await dataSet.saveChanges({
      views: [
        {tableName: DATABASE_CATALOG_TABLE_MODEL, viewId: capture.tableView.viewId, ids: [capture.newTableId]},
        {tableName: DATABASE_CATALOG_FIELD_MODEL, viewId: capture.stageFieldView.viewId, ids: stage.stagedFieldIds},
      ],
    })
    if (!result.success) throw new Error(result.message ?? '复制原提交核验失败')
    stage.saveAccepted = true
  } else if (!stage.saveAccepted && (
    capture.tableView.dirtyTracking.hasPendingChanges()
    || capture.stageFieldView.dirtyTracking.hasPendingChanges()
  )) {
    throw new Error('复制提交已明确失败，请取消本次草稿后重试')
  }
  return verifyReadback({dataSet,capture,stage,commandView})
}

export async function databaseCatalogVerifyTableCopy(dataSet: DataSet): Promise<string> {
  const capture = captures.get(dataSet)
  if (!capture?.stage) throw new Error('当前复制尚未提交，无可核验结果')
  return recoverOrVerifyCopy(dataSet, capture, await requireCopyInputView(dataSet))
}

export async function databaseCatalogCopyTable(dataSet: DataSet): Promise<string> {
  const capture = captures.get(dataSet)
  if (!capture) throw new Error('复制表来源未捕获，请重新打开复制对话框')
  const commandView = await requireCopyInputView(dataSet)
  if (capture.stage) return recoverOrVerifyCopy(dataSet, capture, commandView)
  const command = copyInputRow(commandView).current
  const newTableName = scalar(command[copyInputFields.tableName])
  const newTableDesc = scalar(command[copyInputFields.tableDesc])
  if (!newTableName) throw new Error('新表名不能为空')
  if (!newTableDesc) throw new Error('新表描述不能为空')
  if (scalar(command[copyInputFields.sourceTableId]) !== capture.sourceTableId
    || scalar(command[copyInputFields.sourceDbId]) !== capture.dbId
    || scalar(command[copyInputFields.tableId]) !== capture.newTableId) {
    throw new Error('复制表输入身份已变化，请重新打开复制对话框')
  }
  if (dataSet.destroyed || dataSet.getView(capture.tableView.tableName, capture.tableView.viewId) !== capture.tableView
    || dataSet.getView(capture.sourceFieldView.tableName, capture.sourceFieldView.viewId) !== capture.sourceFieldView) {
    throw new Error('复制表原 DataView owner 已失效')
  }
  if ([capture.tableView, capture.sourceFieldView, capture.stageFieldView].some(view => view.mutating || view.hasUnconfirmedSave)) {
    throw new Error('目录保存进行中，不能复制表')
  }
  await assertSourceProof(capture)
  const duplicates = await capture.tableProofView.queryOptionRows({
    fields: ['rowid'],
    filter: DataViewFilter.group({logic: 'and', filters: [
      {field: 'dbid', operator: 'eq', value: capture.dbId},
      {field: 'tblname', operator: 'eq', value: newTableName},
    ]}).toJSON(),
  })
  if (duplicates.length > 0) throw new Error('当前数据库中已存在同名表，请重新输入')
  const schemaField = capture.tableView.columns.find(column => column.name.toLowerCase() === 'schemaname')?.name
  const statusField = capture.tableView.columns.find(column => column.name.toLowerCase() === 'status')?.name
  const tablePayload: Readonly<Record<string, string>> = {
    dbid: capture.dbId,
    tblname: newTableName,
    tbldesc: newTableDesc,
    ...(schemaField ? {[schemaField]: scalar(capture.sourceTable[schemaField]) || 'dbo'} : {}),
    ...(statusField ? {[statusField]: scalar(capture.sourceTable[statusField]) || '1'} : {}),
  }
  await configureStageFieldView(capture.stageFieldView, capture.newTableId)
  if (!capture.tableView.supportsExplicitIdentityCreate || !capture.stageFieldView.supportsExplicitIdentityCreate) {
    throw new Error('当前正式查询不支持复制表和字段身份新增')
  }
  assertNewRowPermission(capture.tableView, tablePayload)
  const fieldPayloads = capture.sourceFields.map(source => copyFieldPayload(source, capture.newTableId, newTableName))
  for (const fieldPayload of fieldPayloads) assertNewRowPermission(capture.stageFieldView, fieldPayload)
  await capture.tableView.addRowWithIdentity({field: 'rowid', value: capture.newTableId}, tablePayload)
  const stagedFieldIds: Array<string | number> = []
  try {
    for (const payload of fieldPayloads) {
      const id = crypto.randomUUID().replaceAll('-', '').toUpperCase()
      await capture.stageFieldView.addRowWithIdentity({field: 'rowid', value: id}, payload)
      stagedFieldIds.push(id)
    }
  } catch (error) {
    await capture.tableView.removeRow(capture.newTableId)
    for (const id of stagedFieldIds) await capture.stageFieldView.removeRow(id)
    throw error
  }
  const selection={
    views: [
      {tableName: DATABASE_CATALOG_TABLE_MODEL, viewId: capture.tableView.viewId, ids: [capture.newTableId]},
      {tableName: DATABASE_CATALOG_FIELD_MODEL, viewId: capture.stageFieldView.viewId, ids: stagedFieldIds},
    ],
  }
  let batch:string|null
  try{
    batch=dataSet.prepareSaveJournal(selection).batchId
  }catch(error){
    await capture.tableView.removeRow(capture.newTableId)
    for(const id of stagedFieldIds)await capture.stageFieldView.removeRow(id)
    throw error
  }
  if(!batch)throw new Error('复制表没有有效保存批次')
  capture.stage = {tablePayload, fieldPayloads, stagedFieldIds, saveAccepted:false, batchId:batch}
  const result = await dataSet.saveChanges(selection)
  if (!result.success) throw new Error(result.message ?? '复制表失败')
  capture.stage.saveAccepted = true
  return verifyReadback({dataSet,capture,stage:capture.stage,commandView})
}
