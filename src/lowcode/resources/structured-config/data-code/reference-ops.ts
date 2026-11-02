/**
 * @module app:lowcode/resources/structured-config/data-code/reference-ops
 * 职责：从原生来源视图投影获准读取的表/字段选择，原子写回编码业务表或分类映射。
 * 边界：只消费DataView原查询与编辑检查点，不查询、不持草稿、不提交目录或更改权限。
 * AI用途：引用表选择弹窗确认时复用，保持来源身份、字段读取与目标写入责任清晰。
 */
import {buildDataViewKey, resolveDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
export type CodeTableSelection = Readonly<{TableRowid: string; TableName: string; TextFieldName: string; ValueFieldName: string; description: string}>
type SelectedSource = Readonly<{view: DataView; row: DataRow; projected: DataRow}>
function selectedSource(dataSet: DataSet, model: string, viewId = 'default'): SelectedSource {
  const scenarioId = getBuiltinScenarioResource('businessTableSelector').scenarioId
  if (dataSet.scenarioId !== scenarioId || dataSet.destroyed) throw new Error('引用来源空间身份不匹配')
  const view = resolveDataViewKey(buildDataViewKey(model, viewId, scenarioId), dataSet)
  if (view?.primaryKey !== 'rowid') throw new Error('引用来源视图缺失或身份不匹配')
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
