/**
 * @module app:lowcode/resources/semi-structured/excel-import/target-selection
 * 职责：投影本次正式来源选择及Excel字段类型，暂存至原配置和映射视图。
 * 边界：不查询、不保存、不持有业务草稿；所有变更和取消仍由原DataView负责。
 * AI用途：Excel配置页确认目标表时复用正式来源选择，保留物理名称、字段类型及原生取消责任。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {validateExcelTargetReferences} from './target-references'

/** 来源字段到正式Excel映射的必要成员；列号独立于数据库字段顺序。 */
export type ExcelTargetField = Readonly<{
  /** 正式来源字段物理名称。 */
  name: string
  /** 可读来源标题，无标题时使用物理名称。 */
  title: string
  /** 正式Excel类型：0文本、1数值、2日期时间。 */
  type: number
  /** Excel列索引；新映射为空，不能从数据库字段顺序猜测。 */
  index: string
}>
/** 同一次正式来源选择的只读投影，不是编辑真源。 */
export type ExcelTarget = Readonly<{
  /** 本次来源所属正式应用。 */
  applicationId: string
  /** 来源应用可读名称。 */
  applicationName: string
  /** 正式数据库名称@物理表名称。 */
  table: string
  /** 目标标题及完整物理路径。 */
  description: string
  /** 当前表完整正式来源字段的必要映射。 */
  fields: readonly ExcelTargetField[]
}>
/** 本次来源替换的原生编辑范围；不保存记录值或提供独立提交通道。 */
export type ExcelTargetStaging = Readonly<{
  /** 被替换的配置身份。 */
  nodeId: string | number
  /** 本次删除与新增的全部字段身份。 */
  fieldIds: ReadonlyArray<string | number>
  /** 本次待删除的原字段身份，值基线由原DataView保管。 */
  oldFieldIds: ReadonlyArray<string | number>
  /** 派发前恢复来源字段与本次字段集合，保留范围外编辑。 */
  cancel(): void
  /** 联合提交确认后释放局部检查点。 */
  release(): void
}>
const sourceScene = '34BDBE645F461A3D83282A941D6037F4'
function ready(view: DataView | undefined): DataView {
  if (!view || view.destroyed || view.requestState !== RequestState.Loaded || view.loadingError || view.mutating || view.hasUnconfirmedSave) throw new Error('Excel来源查询尚未就绪')
  return view
}
function text(view: DataView, row: DataRow, input: string | Readonly<{name: string; optional: true}>): string {
  const name = typeof input === 'string' ? input : input.name, optional = typeof input !== 'string'
  if (view.fieldAccess(row, name).read !== 'visible') {if (optional) return ''; throw new Error(`Excel来源字段不可读: ${name}`)}
  const value = row[name]
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (optional) return ''
  throw new Error(`Excel来源缺少身份或类型: ${name}`)
}
function selected(view: DataView, requireCurrent = false): DataRow {
  const values = view.getSelectedValues(), row = view.rows.find(candidate => view.getPkKey(candidate) === values[0])
  const projected = view.readSnapshot().rows.find(candidate => candidate['rowid'] === values[0])
  if (values.length !== 1 || !row || !projected || requireCurrent && view.currentRow !== row) throw new Error('请选择唯一Excel来源记录')
  return projected
}
/** @param dataSet 本次PageRuntime按需加载的34B来源。 @returns 经身份、归属和读取权限核对的物理目标及完整字段映射。 */
export function projectExcelTarget(dataSet: DataSet): ExcelTarget {
  if (dataSet.destroyed || dataSet.scenarioId !== sourceScene) throw new Error('Excel来源空间身份不匹配')
  const apps = ready(dataSet.getView('Base_AppSystemList')), databases = ready(dataSet.getView('Base_AppAndSource_Relation'))
  const tables = ready(dataSet.getView('_Base_TblList')), fields = ready(dataSet.getView('Base_TblField', 'excelFields'))
  for (const view of [apps, databases, tables, fields]) if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()
    || view.dataTable?.modelBinding?.modelName !== view.tableName) throw new Error('Excel来源必须来自正式模型结果，不能使用来源草稿')
  const app = selected(apps), database = selected(databases, true), table = selected(tables, true)
  const applicationId = text(apps, app, 'rowid'), tableId = text(tables, table, 'rowid')
  const cascades = dataSet.getParentCascades(tables.tableName, tables.viewId)
  const cascade = cascades[0]
  if (text(databases, database, 'sysid') !== applicationId || cascades.length !== 1 || cascade?.parentTable !== databases.tableName || cascade.parentViewId !== databases.viewId || cascade.autoLoad !== true
    || JSON.stringify(cascade.filterBindings) !== JSON.stringify([{sourceField: 'conid', targetField: 'dbid', operator: 'eq'}])
    || JSON.stringify(dataSet.resolveCascadeFilter(cascade)) !== JSON.stringify({field: 'dbid', operator: 'eq', value: text(databases, database, 'conid')})) throw new Error('Excel目标数据库查询范围已变化')
  if (!tables.readSnapshot().rows.some(row => row['rowid'] === tableId)) throw new Error('Excel目标不属于本次正式数据库查询')
  if (!fields.countReported || fields.total !== fields.rows.length) throw new Error('Excel目标字段尚未完整查询')
  const physical = `${text(databases, database, 'conName')}@${text(tables, table, 'tblname')}`
  const names = new Set<string>(), ids = new Set<string>()
  const mappings = fields.rows.map(row => {
    if (text(fields, row, 'tblid') !== tableId) throw new Error('Excel来源字段不属于所选表')
    const name = text(fields, row, 'enname'), id = text(fields, row, 'rowid')
    if (names.has(name.toLowerCase()) || ids.has(id)) throw new Error('Excel来源字段身份或名称重复')
    names.add(name.toLowerCase()); ids.add(id)
    const type = text(fields, row, 'DataType').toLowerCase()
    return {name, title: text(fields, row, {name: 'cnname', optional: true}) || name, index: '', type: /date|time/.test(type) ? 2 : /int|decimal|numeric|number|float|double|real|money/.test(type) ? 1 : 0}
  })
  if (!mappings.length) throw new Error('所选目标没有可映射字段')
  const description = text(tables, table, {name: 'tbldesc', optional: true})
  return {applicationId, applicationName: text(apps, app, 'AppName'), table: physical, description: description ? `${description}[${physical}]` : physical, fields: mappings}
}

/**
 * @param input 原配置/映射视图和本次来源投影；assertCurrent在每次异步边界校验原弹窗目标。
 * @returns 原DataView中的精确变更范围；调用方沿DataSet保存或取消，不另存草稿。
 */
export async function stageExcelTarget(input: Readonly<{nodes: DataView; fields: DataView; nodeId: string | number; selection: ExcelTarget; assertCurrent: () => void}>): Promise<ExcelTargetStaging> {
  const {nodes, fields, nodeId, selection} = input
  input.assertCurrent(); ready(nodes); ready(fields)
  if (nodes.commitMode !== 'staged' || fields.commitMode !== 'staged') throw new Error('Excel目标及字段必须使用正式暂存视图')
  const row = nodes.currentRow, names = ['relatedappid', 'relatedAppName', 'table', 'tableDesc']
  if (nodes.dataSet !== fields.dataSet || nodes.dataSet?.scenarioId !== '0F93B82141CF40852021D704B0E30BF4' || nodes.tableName !== 'Base_ImportData_Config' || fields.tableName !== 'Base_ImportData_Field'
    || !row || nodes.getPkKey(row) !== nodeId) throw new Error('Excel来源确认目标已变化')
  const layoutText=nodes.getEditingRow(nodeId)?.['sheet_layout_json']
  if(typeof layoutText==='string'&&layoutText.trim()){
    const layout=parseJsonDocument(layoutText)
    if(!Array.isArray(layout)&&Boolean(layout['enabled']))throw new Error('相对版式启用时不能使用经典映射换源，请在版式定义中修改目标')
  }
  if (fields.hasEditingChanges() || fields.dirtyTracking.hasPendingChanges()) throw new Error('请先保存或取消已有字段修改')
  if (!fields.countReported || fields.rows.length !== fields.total) throw new Error('当前配置字段尚未完整查询')
  const originalFields=new Map(fields.rows.map(field=>[fields.getPkKey(field),field]))
  const oldIds = fields.rows.map(field => {
    const id = fields.getPkKey(field)
    if (id === undefined || field['configid'] !== nodeId || fields.fieldAccess(field, 'configid').read !== 'visible' || fields.deleteActionState(field) !== 'enabled') throw new Error('当前字段归属或删除权限不足')
    return id
  })
  const rules = ready(nodes.dataSet.getView('Base_Import_Transform_Rule'))
  if (!rules.countReported || rules.rows.length !== rules.total || rules.hasEditingChanges() || rules.dirtyTracking.hasPendingChanges()) throw new Error('请先完整读取并处理当前配置规则修改')
  if (nodes.rows.length + nodes.dirtyTracking.pendingDeleteIds.size - nodes.dirtyTracking.pendingCreateIds.size !== nodes.total) throw new Error('配置父子范围尚未完整读取')
  const children = nodes.rows.filter(child => child['pid'] === nodeId)
  for (const child of children) if (['pid', 'parentField'].some(name => nodes.fieldAccess(child, name).read !== 'visible') || nodes.hasEditingChanges(nodes.getPkKey(child)) || nodes.dirtyTracking.hasPendingChanges(nodes.getPkKey(child))) throw new Error('直接子配置引用不可读或存在尚未处理的修改')
  for (const rule of rules.rows) if (['id', 'config_id', 'source_field', 'target_field', 'condition_json', 'config_json', 'rule_type'].some(name => rules.fieldAccess(rule, name).read !== 'visible') || rule['config_id'] !== nodeId) throw new Error('当前规则引用归属不可核验')
  for (const name of ['table', 'foreignKeyField', 'filters', 'sorted', 'sheet_layout_json']) if (nodes.fieldAccess(row, name).read !== 'visible') throw new Error('当前配置引用不可读')
  validateExcelTargetReferences({node: nodes.getEditingRow(nodeId) ?? row, oldFields: fields.rows.map(field => text(fields, field, 'name')), children, rules: rules.readSnapshot().rows, selection})
  for (const name of names) if (nodes.fieldAccess(row, name).read !== 'visible' || nodes.fieldAccess(row, name).write !== 'allowed') throw new Error('当前目标字段不可读写')
  if (fields.addActionState() !== 'enabled') throw new Error('当前配置不允许新增字段')
  const checkpoint = nodes.createEditingCheckpoint(nodeId, names), added: Array<string | number> = [], removed=new Set<string|number>()
  const original = row, originalSelection = JSON.stringify(selection)
  const current = () => {
    input.assertCurrent(); if (nodes.currentRow !== original || JSON.stringify(selection) !== originalSelection) throw new Error('Excel来源确认目标已变化')
    const currentFields=new Map(fields.rows.map(field=>[fields.getPkKey(field),field]))
    for(const id of oldIds)if(!removed.has(id)&&(currentFields.get(id)!==originalFields.get(id)||fields.hasEditingChanges(id)||fields.dirtyTracking.hasPendingChanges(id)))throw new Error('原字段在来源暂存期间已变化，修改已保留')
  }
  try {
    for (const mapping of selection.fields) {
      current()
      const addedRow = await fields.addRow({...mapping, isDict: 0})
      const id = fields.getPkKey(addedRow)
      if (id === undefined) throw new Error('Excel新增映射缺少正式身份')
      added.push(id); current()
      if (fields.rows.find(candidate => fields.getPkKey(candidate) === id)?.['configid'] !== nodeId) throw new Error('Excel新增映射不属于原配置')
    }
    for (const id of oldIds) {current(); removed.add(id); if(await fields.removeRow(id)!==true)throw new Error('原字段未完整暂存删除'); current()}
    for (const [name, value] of Object.entries({relatedappid: selection.applicationId, relatedAppName: selection.applicationName, table: selection.table, tableDesc: selection.description})) {
      current(); nodes.updateEditingValue(nodeId, name, value)
    }
    let closed = false
    return {nodeId, fieldIds: [...oldIds, ...added], oldFieldIds: oldIds, cancel: () => {
      if (closed) throw new Error('原Excel来源替换已收尾')
      fields.discardPendingChanges([...oldIds, ...added]); checkpoint.restore(); checkpoint.release(); closed = true
    }, release: () => {checkpoint.release(); closed = true}}
  } catch (cause) {
    fields.discardPendingChanges([...[...removed].filter(id=>fields.dirtyTracking.pendingDeleteIds.has(id)), ...added]); checkpoint.restore(); checkpoint.release(); throw cause
  }
}
