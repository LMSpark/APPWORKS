/**
 * @module app:lowcode/resources/structured-config/data-code/reference-ops
 * 职责：从原生来源视图投影获准读取的表/字段选择，原子写回编码业务表或分类映射。
 * 边界：通过正式来源DataView读取引用，不持草稿、不提交目录或更改权限。
 * AI用途：引用表选择弹窗确认时复用，保持来源身份、字段读取与目标写入责任清晰。
 */
import {buildDataViewKey, RequestState, resolveDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
export type CodeTableSelection = Readonly<{TableRowid: string; TableName: string; TextFieldName: string; ValueFieldName: string; description: string}>
export type CodeStoredReference = Readonly<{tableId: string; tableName: string; textField: string; valueField: string}>
type CodeStoredReferenceRestore = Readonly<{dataSet: DataSet; reference: CodeStoredReference; kind: 'class' | 'business'; check: () => void}>
type SelectedSource = Readonly<{view: DataView; row: DataRow; projected: DataRow}>
function sourceView(dataSet: DataSet, model: string, viewId = 'default'): DataView {
  const scenarioId = getBuiltinScenarioResource('businessTableSelector').scenarioId
  if (dataSet.scenarioId !== scenarioId || dataSet.destroyed) throw new Error('引用来源空间身份不匹配')
  const view = resolveDataViewKey(buildDataViewKey(model, viewId, scenarioId), dataSet)
  if (view?.primaryKey !== 'rowid' || view.dataTable?.modelBinding?.modelName !== model) throw new Error('引用来源视图缺失或身份不匹配')
  return view
}
function selectedSource(dataSet: DataSet, model: string, viewId = 'default'): SelectedSource {
  const view = sourceView(dataSet, model, viewId)
  const snapshot = view.readSnapshot(), ids = view.getSelectedValues()
  if (ids.length !== 1) throw new Error('请选择唯一来源记录')
  const row = view.rows.find(candidate => view.getPkKey(candidate) === ids[0]), projected = snapshot.rows.find(candidate => candidate['rowid'] === ids[0])
  if (!row || !projected) throw new Error('所选来源已失效或身份不可读')
  return {view, row, projected}
}
function visible(source: SelectedSource, field: string, optional = false): string {
  if (source.view.fieldAccess(source.row, field).read !== 'visible') {
    if (optional) return ''
    throw new Error('引用来源字段不可读')
  }
  const value = source.projected[field]
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (optional) return ''
  throw new Error('引用来源缺少必要身份或字段')
}
/** 读取当前编辑覆盖，不将未保存的显示字段或来源应用当作已存引用。 */
export function readCodeStoredReference(view: DataView, kind: 'class' | 'business'): CodeStoredReference | undefined {
  const model = kind === 'business' ? 'Base_CodeDesign' : 'Base_CodeClassTable', row = view.currentRow
  if (view.dataSet?.scenarioId !== getBuiltinScenarioResource('dataCodeEditor').scenarioId || view.dataTable?.modelBinding?.modelName !== model || !row) {
    throw new Error('编码引用目标不存在或身份不匹配')
  }
  const id = view.getPkKey(row)
  if (id === undefined) throw new Error('编码引用目标缺少记录身份')
  const editing = view.getEditingRow(id) ?? row
  const read = (field: string): string => {
    if (view.fieldAccess(row, field).read !== 'visible') throw new Error(`编码引用字段不可读：${field}`)
    const value = editing[field]
    if (value === null || value === undefined) return ''
    if (typeof value !== 'string') throw new Error(`编码引用字段无效：${field}`)
    return value
  }
  const reference = kind === 'business'
    ? {tableId: read('BusTableRowid'), tableName: read('BusTableName'), textField: '', valueField: read('KeyFields')}
    : {tableId: read('TableRowid'), tableName: read('TableName'), textField: read('TextFieldName'), valueField: read('ValueFieldName')}
  if (!reference.tableId) {
    if (reference.tableName || reference.textField || reference.valueField) throw new Error('编码引用缺少表身份')
    return undefined
  }
  return reference
}
async function loadStoredView(view: DataView, check: () => void): Promise<void> {
  check(); await view.refresh(); check()
  if (view.loadingError) throw view.loadingError
  if (view.requestState !== RequestState.Loaded || !view.countReported || view.total !== view.rows.length || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) {
    throw new Error('编码引用未取得完整正式结果')
  }
  view.readSnapshot()
}
function pickStored(view: DataView, row: DataRow, check: () => void): void {
  check(); view.setCurrentRow(row); check(); view.setSelectedRows([row]); check()
}
/** 按已存表主键和字段名恢复独立命名视图，不反推数据库或应用。 */
export async function restoreCodeStoredReference(input: CodeStoredReferenceRestore): Promise<void> {
  const {dataSet, reference, kind, check} = input
  const table = sourceView(dataSet, '_Base_TblList', 'storedObject')
  for (const id of ['storedTableText', 'storedTableValue']) {
    const fields = sourceView(dataSet, 'Base_TblField', id)
    check(); fields.clearSelectedRows(); fields.setCurrentRow(null)
  }
  check(); table.clearSelectedRows(); table.setCurrentRow(null)
  table.filterExpression = {field: 'rowid', operator: 'eq', value: reference.tableId}
  await loadStoredView(table, check)
  const row = table.rows[0]
  if (table.rows.length !== 1 || !row || table.getPkKey(row) !== reference.tableId) throw new Error('已存引用表不存在或身份不唯一')
  const projected = table.readSnapshot().rows[0]
  if (!projected) throw new Error('已存引用表身份不可读')
  const selected = {view: table, row, projected}
  if (visible(selected, 'rowid') !== reference.tableId) throw new Error('已存引用表身份不匹配')
  visible(selected, 'tblname')
  pickStored(table, row, check)
  const columns = kind === 'business' ? [['storedTableValue', reference.valueField]] : [['storedTableText', reference.textField], ['storedTableValue', reference.valueField]]
  for (const [viewId, fieldName] of columns) {
    if (!viewId || fieldName === undefined) throw new Error('编码引用字段配置无效')
    const fields = sourceView(dataSet, 'Base_TblField', viewId)
    await loadStoredView(fields, check)
    const snapshot = fields.readSnapshot(), names = new Set<string>(), matches: DataRow[] = []
    for (const field of fields.rows) {
      const projectedField = snapshot.rows.find(candidate => candidate['rowid'] === fields.getPkKey(field))
      if (!projectedField) throw new Error('已存引用字段身份不可读')
      const candidate = {view: fields, row: field, projected: projectedField}, name = visible(candidate, 'enname')
      if (visible(candidate, 'tblid') !== reference.tableId || names.has(name.toLowerCase())) throw new Error('已存引用字段归属错误或名称不唯一')
      names.add(name.toLowerCase())
      if (name === fieldName) matches.push(field)
    }
    if (fieldName) {
      const match = matches[0]
      if (matches.length !== 1 || !match) throw new Error(`已存引用字段不存在或不可读：${fieldName}`)
      pickStored(fields, match, check)
    }
  }
}
/** 投影已存表上的显式字段选择；业务表不保存显示字段。 */
export function projectCodeStoredSelection(dataSet: DataSet, kind: 'class' | 'business', storedName?: string): CodeTableSelection {
  const table = selectedSource(dataSet, '_Base_TblList', 'storedObject')
  const value = selectedSource(dataSet, 'Base_TblField', 'storedTableValue')
  const text = kind === 'class' ? selectedSource(dataSet, 'Base_TblField', 'storedTableText') : undefined
  const tableId = visible(table, 'rowid')
  if (table.view.currentRow !== table.row || visible(value, 'tblid') !== tableId || text && visible(text, 'tblid') !== tableId) throw new Error('引用字段不属于当前表')
  const physicalName = visible(table, 'tblname'), tableName = storedName === undefined || storedName === '' ? physicalName : storedName
  const valueField = visible(value, 'enname'), textField = text ? visible(text, 'enname') : ''
  return {TableRowid: tableId, TableName: tableName, TextFieldName: textField, ValueFieldName: valueField,
    description: text ? `表：${tableName}，引用字段：${visible(text, 'cnname', true) || textField}，引用表过滤字段：${visible(value, 'cnname', true) || valueField}` : ''}
}
/** @param dataSet 同一PageRuntime按需装配的正式来源空间。 @returns 已核当前查询和权限的五项分类引用映射。 */
export function projectCodeReferenceSelection(dataSet: DataSet): CodeTableSelection {
  const app = selectedSource(dataSet, 'Base_AppSystemList'), database = selectedSource(dataSet, 'Base_AppAndSource_Relation')
  const table = selectedSource(dataSet, '_Base_TblList'), text = selectedSource(dataSet, 'Base_TblField', 'textFields'), value = selectedSource(dataSet, 'Base_TblField', 'valueFields')
  if (visible(database, 'sysid') !== visible(app, 'rowid') || database.view.currentRow !== database.row || table.view.currentRow !== table.row) throw new Error('引用来源选择目标已改变')
  const tableId = visible(table, 'rowid')
  if (visible(text, 'tblid') !== tableId || visible(value, 'tblid') !== tableId) throw new Error('引用字段不属于所选表')
  const tableName = visible(table, 'tblname'), textField = visible(text, 'enname'), valueField = visible(value, 'enname')
  return {TableRowid: tableId, TableName: tableName, TextFieldName: textField, ValueFieldName: valueField,
    description: `表：${tableName}，引用字段：${visible(text, 'cnname', true) || textField}，引用表过滤字段：${visible(value, 'cnname', true) || valueField}`}
}
/** @param view 原分类视图。 @param classId 捕获的分类身份。 @param selection 获准读取的正式来源映射；仅暂存，不保存。 */
export function applyCodeClassReference(view: DataView, classId: string | number, selection: CodeTableSelection): void {
  applyCodeMapping(view, {id: classId, modelName: 'Base_CodeClassTable'}, {TableRowid: selection.TableRowid, TableName: selection.TableName,
    TextFieldName: selection.TextFieldName, ValueFieldName: selection.ValueFieldName, description: selection.description})
}
/** @param view 原编码主视图。 @param designId 捕获的主记录身份。 @param selection 原来源选择；只暂存业务表身份、物理名称及主键字段名，不改编码规则。 */
export function applyCodeBusinessTable(view: DataView, designId: string | number, selection: CodeTableSelection): void {
  applyCodeMapping(view, {id: designId, modelName: 'Base_CodeDesign'}, {BusTableRowid: selection.TableRowid, BusTableName: selection.TableName, KeyFields: selection.ValueFieldName})
}
function applyCodeMapping(view: DataView, target: {id: string | number; modelName: string}, mapping: Readonly<Record<string, string>>): void {
  const row = view.currentRow
  if (view.dataSet?.scenarioId !== getBuiltinScenarioResource('dataCodeEditor').scenarioId || view.dataTable?.modelBinding?.modelName !== target.modelName
    || !row || view.getPkKey(row) !== target.id || view.hasUnconfirmedSave || view.mutating) throw new Error('编码映射目标已改变或保存未确认')
  const fields = Object.keys(mapping)
  for (const field of fields) {
    const access = view.fieldAccess(row, field)
    if (access.read !== 'visible' || access.write !== 'allowed') throw new Error('当前编码映射字段不可读写')
    if (typeof mapping[field] !== 'string' || !mapping[field].trim()) throw new Error('引用映射不完整')
  }
  const checkpoint = view.createEditingCheckpoint(target.id, fields)
  try {for (const field of fields) view.updateEditingValue(target.id, field, mapping[field]); checkpoint.release()}
  catch (cause) {checkpoint.restore(); checkpoint.release(); throw cause}
}
