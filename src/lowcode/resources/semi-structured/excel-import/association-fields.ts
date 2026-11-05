/**
 * @module app:lowcode/resources/semi-structured/excel-import/association-fields
 * 职责：消费已保存的直接父节点和本节点映射选项，并成组编辑关联名称与描述。
 * 边界：不查询、不保存、不复制草稿；来源为原命名DataView，标准组件直接绑定原命名选项视图。
 * AI用途：编辑父外键时核对候选归属和读取权限，沿原节点成组更新字段名及描述。
 */
import {buildDataViewKey, RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
/** 两个关联分别消费父节点或当前节点的正式映射。 */
type Kind = 'parentField' | 'foreignKeyField'
/** 本次实例内的关联选项及成组业务编辑，持久化仍由原DataSet承接。 */
export class ExcelAssociationFields {
  /** 标准父字段选择器的完整视图键。 */
  readonly parentKey: string
  /** 标准本节点外键选择器的完整视图键。 */
  readonly foreignKey: string
  /** @param dataSet 当前Excel设计实例；不得传入参考来源或其他方案实例。 */
  constructor(private readonly dataSet: DataSet) {
    if (dataSet.scenarioId !== '0F93B82141CF40852021D704B0E30BF4' || dataSet.destroyed) throw new Error('Excel关联需要本次正式设计实例')
    this.parentKey = buildDataViewKey('Base_ImportData_Field', 'parentFields', dataSet.scenarioId)
    this.foreignKey = buildDataViewKey('Base_ImportData_Field', 'foreignKeyFields', dataSet.scenarioId)
  }
  private nodes(): DataView {const view = this.dataSet.getView('Base_ImportData_Config'); if (!view || this.dataSet.destroyed) throw new Error('Excel关联实例已失效'); return view}
  private projection(kind: Kind): Array<{value: string; label: string; descriptionReadable: boolean}> {
    const nodes = this.nodes(), node = nodes.currentRow
    if (!node) return []
    if (['schemeid', 'rowid', ...(kind === 'parentField' ? ['pid'] : [])].some(field => nodes.fieldAccess(node, field).read !== 'visible')) throw new Error('关联节点身份不可读')
    const scheme = nodes.queryContext['importConfigId']
    if (node['schemeid'] !== scheme) throw new Error('关联节点不属于当前方案')
    const parent = kind === 'parentField', parentNode = this.dataSet.getView('Base_ImportData_Config', 'parentNode')
    const owner = parent ? node['pid'] : nodes.getPkKey(node)
    if (parent && (owner === undefined || owner === null || owner === '' || owner === scheme)) return []
    if (parent) {
      if (parentNode?.requestState !== RequestState.Loaded || parentNode.loadingError || !parentNode.countReported || parentNode.total !== 1 || parentNode.rows.length !== 1) return []
      const parentRow = parentNode.readSnapshot().rows[0]
      if (!parentRow || parentRow['rowid'] !== owner || parentRow['schemeid'] !== scheme) return []
    }
    const source = this.dataSet.getView('Base_ImportData_Field', parent ? 'parentFields' : 'foreignKeyFields')
    if (!source || source.loadingError || source.requestState !== RequestState.Loaded || !source.countReported || source.total !== source.rows.length) return []
    return source.rows.flatMap(row => {
      if (['configid','name'].some(field => source.fieldAccess(row,field).read !== 'visible')) return []
      if (row['configid'] !== owner || typeof row['name'] !== 'string' || !row['name'].trim()) throw new Error('关联候选字段归属或名称异常')
      const titleRead = source.fieldAccess(row,'title').read
      return [{value: row['name'], label: titleRead === 'visible' && typeof row['title'] === 'string' && row['title'].trim() ? row['title'] : row['name'], descriptionReadable: titleRead !== 'masked'}]
    })
  }
  /** @param input 关联种类与所选英文名；空字符串表示同时清空名称及描述。 */
  select(input: Readonly<{nodeId: unknown; kind: Kind; value: unknown}>): void {
    const nodes = this.nodes(), row = nodes.currentRow, id = row ? nodes.getPkKey(row) : undefined
    if (!row || id === undefined || id !== input.nodeId || typeof input.value !== 'string') throw new Error('关联编辑的原节点或字段名已失效')
    const options = this.projection(input.kind), selected = options.filter(option => option.value === input.value)
    if (input.value !== '' && selected.length !== 1) throw new Error('关联字段不属于当前正式可选范围')
    if (selected.some(option => !option.descriptionReadable)) throw new Error('关联字段标题被脱敏，不能用占位符保存描述')
    const description = `${input.kind}Desc`, fields = [input.kind, description]
    if (fields.some(field => nodes.fieldAccess(row, field).write !== 'allowed')) throw new Error('当前节点不允许成组修改关联字段及描述')
    const checkpoint = nodes.createEditingCheckpoint(id, fields)
    try {nodes.updateEditingValue(id, input.kind, input.value); if(nodes.currentRow!==row)throw new Error('关联编辑期间节点已切换'); nodes.updateEditingValue(id, description, selected[0]?.label ?? '')}
    catch (cause) {checkpoint.restore(); throw cause}
    finally {checkpoint.release()}
  }
}
