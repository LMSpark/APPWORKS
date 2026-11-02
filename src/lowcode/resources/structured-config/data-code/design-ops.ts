/**
 * @module app:lowcode/resources/structured-config/data-code/design-ops
 * 编码定义的领域编译与提交范围；查询、草稿、权限及提交仍由正式DataSet/DataView负责。
 */
import type {DataRow, DataSet, DataView} from '@spark-appworks/spark-data'

const SCENE = '868E62F90DB8118C74CDC9F6BCA61157'
const text = (value: unknown): string => String(value ?? '').trim()
function editableRow(view: DataView, row: DataRow): DataRow {
  const key = view.getPkKey(row)
  return key === undefined ? row : view.getEditingRow(key) ?? row
}
/** @param dataSet 本次编码设计实例。 @param value 节点类型值。 @returns 当前获准读取的类型标题，未解析时为空。 */
export function codeNodeTypeLabel(dataSet: DataSet, value: unknown): string {
  const types = dataSet.getView('Dict_CodeNodeType')
  const row = types?.rows.find(item => types.fieldAccess(item, 'val').read === 'visible' && text(item['val']) === text(value))
  return row && types?.fieldAccess(row, 'txt').read === 'visible' ? text(row['txt']) : ''
}
/** @param dataSet 本次编码设计实例。 @param row 当前节点。 @returns 是否为正式类型字典中的固定字符串节点。 */
export function isFixedCodeNode(dataSet: DataSet, row: Readonly<DataRow>): boolean {
  return codeNodeTypeLabel(dataSet, row['NodeType']).includes('固定字符串')
}

const sequenceFields = {Name: '名称', Incre: '增量', StartNo: '开始段', EndNo: '结束段', Format: '起始值-最大值'}

/**
 * 仅提交分类目录本次变更，未知结果由原DataView核验，不夹带主设计或节点。
 * @param dataSet 当前编码设计实例。 @returns 原分类视图的保存结果。
 */
export async function saveCodeClasses(dataSet: DataSet) {
  if (dataSet.scenarioId !== SCENE) throw new Error('编码设计场景身份不匹配')
  const view = dataSet.getView('Base_CodeClassTable')
  if (!view) throw new Error('分类目录视图缺失')
  if (!view.hasUnconfirmedSave) for (const row of view.rows) {
    const id = view.getPkKey(row)
    if (id === undefined || !view.hasEditingChanges(id) && !view.dirtyTracking.hasPendingChanges(id)) continue
    const effective = editableRow(view, row)
    for (const [field, label] of Object.entries({Name: '分类名称', BusTableName: '业务表名', BusFilterField: '业务表过滤字段',
      TableRowid: '引用表', TableName: '引用表名', TextFieldName: '引用字段', ValueFieldName: '引用表过滤字段'})) {
      if (view.fieldAccess(row, field).read !== 'visible') throw new Error('分类规则字段不可读')
      const value = effective[field]
      if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
    }
  }
  return dataSet.saveChanges({views: [{tableName: 'Base_CodeClassTable', viewId: 'default'}]})
}

/**
 * 将已保存分类的引用映射复制到当前编码段，不提交目录或设计。
 * @param dataSet 当前编码设计实例。 @param nodeId 原节点主键。 @param classId 已保存分类主键。
 */
export function selectCodeClass(dataSet: DataSet, nodeId: string | number, classId: string | number): void {
  if (dataSet.scenarioId !== SCENE) throw new Error('编码设计场景身份不匹配')
  const nodes = dataSet.getView('Base_CodeNodeDesign'), catalog = dataSet.getView('Base_CodeClassTable'), main = dataSet.getView('Base_CodeDesign')
  const row = nodes?.currentRow, owner = main?.rows[0]
  if (!nodes || !catalog || main?.rows.length !== 1 || !owner || !row || nodes.getPkKey(row) !== nodeId) throw new Error('编码段目标已改变，请重新打开')
  if (nodes.hasUnconfirmedSave || main.hasUnconfirmedSave) throw new Error('请先核验设计保存结果')
  catalog.assertResultReplacementAllowed()
  if (nodes.fieldAccess(row, 'CodeDesignID').read !== 'visible' || row['CodeDesignID'] !== main.getPkKey(owner)) throw new Error('编码节点不属于当前设计')
  if (nodes.fieldAccess(row, 'NodeType').read !== 'visible' || codeNodeTypeLabel(dataSet, editableRow(nodes, row)['NodeType']) !== '分类字符串') throw new Error('当前编码段不是分类字符串')
  const selected = catalog.rows.find(item => catalog.getPkKey(item) === classId)
  if (!selected) throw new Error('请选择已保存的分类规则')
  const read = (field: string): string => {
    if (catalog.fieldAccess(selected, field).read !== 'visible') throw new Error('分类规则字段不可读')
    const value = selected[field]
    if (typeof value !== 'string' || !value.trim()) throw new Error('分类规则缺少名称、引用表或字段映射，请先维护目录')
    return value.trim()
  }
  const name = read('Name'), mapping = {BusFilterField: read('BusFilterField'), RefTableId: read('TableRowid'), RefTableName: read('TableName'),
    RefTableValueField: read('TextFieldName'), RefTableFilterField: read('ValueFieldName')}
  for (const field of ['CodeNodeDesignJson', 'ParameterName']) {
    const access = nodes.fieldAccess(row, field)
    if (access.read !== 'visible' || access.write !== 'allowed') throw new Error('当前编码段规则不可读写')
  }
  const raw = editableRow(nodes, row)['CodeNodeDesignJson']
  let original: unknown = {}
  try {if (raw !== undefined && raw !== null && raw !== '') original = typeof raw === 'string' ? JSON.parse(raw) : null}
  catch {throw new Error('编码节点规则JSON无效，请先纠正')}
  if (original === null || typeof original !== 'object' || Array.isArray(original)) throw new Error('编码节点规则必须是JSON对象')
  const checkpoint = nodes.createEditingCheckpoint(nodeId, ['CodeNodeDesignJson', 'ParameterName'])
  try {
    nodes.updateEditingValue(nodeId, 'CodeNodeDesignJson', JSON.stringify({...original, ...mapping}))
    nodes.updateEditingValue(nodeId, 'ParameterName', name)
    checkpoint.release()
  } catch (cause) {checkpoint.restore(); checkpoint.release(); throw cause}
}

function sequenceValues(view: DataView, row: DataRow): Record<keyof typeof sequenceFields, string> {
  const value = (field: keyof typeof sequenceFields): string => {
    if (view.fieldAccess(row, field).read !== 'visible') throw new Error('顺序号规则字段不可读')
    const raw = row[field]
    if (typeof raw !== 'string' || !raw.trim()) throw new Error(`${sequenceFields[field]}不能为空`)
    return raw.trim()
  }
  return {Name: value('Name'), Incre: value('Incre'), StartNo: value('StartNo'), EndNo: value('EndNo'), Format: value('Format')}
}

/** @param dataSet 本次编码实例。 @returns 仅独立顺序号目录的保存回执；未知提交只沿原入口核验。 */
export async function saveCodingSequences(dataSet: DataSet) {
  if (dataSet.scenarioId !== SCENE) throw new Error('编码设计场景身份不匹配')
  const view = dataSet.getView('Base_CodingSequence')
  if (!view) throw new Error('顺序号目录视图缺失')
  if (!view.hasUnconfirmedSave) for (const row of view.rows) {
    const id = view.getPkKey(row)
    if (id !== undefined && (view.hasEditingChanges(id) || view.dirtyTracking.hasPendingChanges(id))) sequenceValues(view, editableRow(view, row))
  }
  return dataSet.saveChanges({views: [{tableName: 'Base_CodingSequence', viewId: 'default'}]})
}

/**
 * 从已保存目录选择规则，原子更新当前节点的规则及参数名称；不提交目录或主设计。
 * @param dataSet 本次真实编码实例。 @param nodeId 当前节点主键。 @param sequenceId 当前目录行主键。
 */
export function selectCodingSequence(dataSet: DataSet, nodeId: string | number, sequenceId: string | number): void {
  if (dataSet.scenarioId !== SCENE) throw new Error('编码设计场景身份不匹配')
  const nodes = dataSet.getView('Base_CodeNodeDesign'), sequences = dataSet.getView('Base_CodingSequence'), row = nodes?.currentRow
  if (!nodes || !sequences || !row || nodes.getPkKey(row) !== nodeId) throw new Error('编码段目标已改变，请重新打开')
  sequences.assertResultReplacementAllowed()
  if (nodes.hasUnconfirmedSave || dataSet.getView('Base_CodeDesign')?.hasUnconfirmedSave) throw new Error('请先核验设计保存结果')
  if (nodes.fieldAccess(row, 'NodeType').read !== 'visible' || codeNodeTypeLabel(dataSet, editableRow(nodes, row)['NodeType']) !== '顺序号串') throw new Error('当前编码段不是顺序号串')
  const selected = sequences.rows.find(item => sequences.getPkKey(item) === sequenceId)
  if (!selected) throw new Error('请选择已保存的顺序号规则')
  const values = sequenceValues(sequences, selected)
  for (const field of ['CodeNodeDesignJson', 'ParameterName']) {
    const access = nodes.fieldAccess(row, field)
    if (access.read !== 'visible' || access.write !== 'allowed') throw new Error('当前编码段规则不可读写')
  }
  const raw = editableRow(nodes, row)['CodeNodeDesignJson']
  let original: unknown = {}
  try {if (raw !== undefined && raw !== null && raw !== '') original = typeof raw === 'string' ? JSON.parse(raw) : null}
  catch {throw new Error('编码节点规则JSON无效，请先纠正')}
  if (original === null || typeof original !== 'object' || Array.isArray(original)) throw new Error('编码节点规则必须是JSON对象')
  const checkpoint = nodes.createEditingCheckpoint(nodeId, ['CodeNodeDesignJson', 'ParameterName'])
  try {
    nodes.updateEditingValue(nodeId, 'CodeNodeDesignJson', JSON.stringify({...original, Format: values.Format, StartNo: values.StartNo, EndNo: values.EndNo, Incre: values.Incre}))
    nodes.updateEditingValue(nodeId, 'ParameterName', `${values.Name}(开始段:${values.StartNo},结束段:${values.EndNo})`)
    checkpoint.release()
  } catch (cause) {checkpoint.restore(); checkpoint.release(); throw cause}
}

/**
 * 只对节点变更执行领域编译；名称等主记录单独修改不重写已有编码描述。
 * @param dataSet 含正式主定义、节点及类型视图的本次实例。
 * @returns 主定义与节点的正式保存回执；不提交独立规则目录。
 */
export async function saveDataCodeDesign(dataSet: DataSet) {
  if (dataSet.scenarioId !== SCENE) throw new Error('编码设计场景身份不匹配')
  const main = dataSet.getView('Base_CodeDesign'), nodes = dataSet.getView('Base_CodeNodeDesign')
  if (!main || !nodes) throw new Error('编码设计缺少正式主记录或节点视图')
  const mainRow = main.rows[0]
  if (main.rows.length !== 1 || mainRow === undefined) throw new Error('当前应用下未找到唯一编码设计')
  const mainKey = main.getPkKey(mainRow)
  if (mainKey === undefined) throw new Error('编码设计缺少正式主键')
  const views = [{tableName: 'Base_CodeDesign', viewId: 'default'}, {tableName: 'Base_CodeNodeDesign', viewId: 'default'}]
  if (main.hasUnconfirmedSave || nodes.hasUnconfirmedSave) return dataSet.saveChanges({views})
  if (nodes.hasEditingChanges() || nodes.dirtyTracking.hasPendingChanges()) {
    const effective = nodes.rows.map(row => editableRow(nodes, row))
    const writes: Array<{id: string | number; value: string}> = []
    for (const row of effective) {
      if (text(row['CodeDesignID']) !== text(mainKey)) throw new Error('编码节点不属于当前设计')
      for (const field of ['NodeNo', 'NodeType', 'ParameterName']) {
        if (nodes.fieldAccess(row, field).read !== 'visible') throw new Error('当前编码节点字段不可读，不能编译描述')
      }
      const key = nodes.getPkKey(row)
      if (key === undefined) throw new Error('编码节点缺少正式主键')
      if (!isFixedCodeNode(dataSet, row) || !nodes.hasEditingChanges(key)) continue
      if (nodes.fieldAccess(row, 'CodeNodeDesignJson').read !== 'visible') throw new Error('编码节点规则不可读')
      const original = text(row['CodeNodeDesignJson'])
      let parsed: unknown
      try {parsed = original ? JSON.parse(original) : {}}
      catch {throw new Error('编码节点规则JSON无效，请先纠正')}
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('编码节点规则必须是JSON对象')
      if (nodes.fieldAccess(row, 'CodeNodeDesignJson').write !== 'allowed') throw new Error('编码节点规则不可写')
      writes.push({id: key, value: JSON.stringify({...parsed, ConstString: text(row['ParameterName'])})})
    }
    const description = [...effective].sort((a, b) => Number(a['NodeNo']) - Number(b['NodeNo'])).map(row => {
      const label = codeNodeTypeLabel(dataSet, row['NodeType'])
      if (!label) throw new Error('编码节点类型未在当前字典中解析')
      return `${label}(${text(row['ParameterName'])})`
    }).join('+')
    if (main.fieldAccess(mainRow, 'CodeDescription').write !== 'allowed') throw new Error('编码描述不可写')
    for (const write of writes) nodes.updateEditingValue(write.id, 'CodeNodeDesignJson', write.value)
    main.updateEditingValue(mainKey, 'CodeDescription', description)
  }
  return dataSet.saveChanges({views})
}
