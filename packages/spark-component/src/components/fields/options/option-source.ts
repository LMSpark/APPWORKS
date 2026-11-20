/**
 * @module @spark-appworks/spark-component:components/fields/options/option-source
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/options/option-source 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/options/option-source 的声明、导出和使用边界时，从本模块开始。
 */
import { SparkData, DataTreeField, type DataRow, type DataView, type FlatTreeNode, type NestedTreeNode } from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'

/** 选项视图的输出字段及已核验的临时级联结果；不承载业务查询或权限副本。 */
type OptionSourceOptions = {
  /** 选项显示字段；不可读时整项不进入候选集。 */
  labelField: string
  /** 显式的标题回退字段；按各字段当次权限读取。 */
  labelFields?: readonly string[]
  /** 连接多个非空标题；省略时使用首个可读标题。 */
  labelJoiner?: string
  /** 显式值字段；省略时复用视图的valueField或主键。 */
  valueField?: string
  /** 按调用方显式配置修剪文本值；只影响选项投影，不修改视图记录。 */
  trimValue?: boolean
  /** 嵌套选项的子节点字段。 */
  childrenField: string
  /** loadOptionRows已核验的本次级联结果，省略时读取正式视图。 */
  rows?: readonly DataRow[]
}

/** 正式选项视图与业务字段分别消费各自权限；临时级联结果已由loadOptionRows核验。 */
function readableRows(view: DataView, rows: readonly DataRow[], options: OptionSourceOptions): DataRow[] {
  const values = options.valueField ?? view.valueField ?? view.primaryKey
  const required = [...(options.labelFields ? [] : [options.labelField]), ...(Array.isArray(values) ? values : [values])]
  if (options.labelFields && (!Array.isArray(options.labelFields) || !options.labelFields.length
    || options.labelFields.some(field => typeof field !== 'string' || !field.trim()))) {
    throw new Error('FIELD_OPTION_LABEL: 标题字段必须为非空列表')
  }
  if (options.labelJoiner !== undefined && (typeof options.labelJoiner !== 'string' || !options.labelFields)) {
    throw new Error('FIELD_OPTION_LABEL: 标题连接符需要标题字段列表')
  }
  const tree = view.treeConfig
  if(tree){
    for(const field of [tree.idField,tree.parentIdField,tree.orderField]){
      if(field!==undefined)required.push(DataTreeField.source(field))
    }
  }
  const identityFields = [...(Array.isArray(values) ? values : [values]), view.primaryKey,
    ...(tree ? [tree.idField ?? view.primaryKey, DataTreeField.source(tree.parentIdField ?? 'parentId')] : [])]
  if (options.labelJoiner !== undefined && identityFields.includes(options.labelField)) {
    throw new Error('FIELD_OPTION_LABEL: 组合标题显示字段不能覆盖选项身份')
  }
  return rows.flatMap(row => {
    if (required.some(field => view.fieldAccess(row, field).read !== 'visible')) return []
    const id = view.getPkKey(row)
    const editing = options.rows === undefined && id !== undefined ? view.getEditingRow(id) : null
    const current = editing === null ? row : {...row, ...editing,
      ...(Array.isArray(row[options.childrenField]) ? {[options.childrenField]: row[options.childrenField]} : {})}
    const result: DataRow = {}
    for (const [field, value] of Object.entries(current)) {
      if (field === options.childrenField && Array.isArray(value)) {
        result[field] = readableRows(view, value.filter(isRecord), options)
      } else if (view.fieldAccess(row, field).read === 'visible') result[field] = value
    }
    if (options.trimValue && typeof values === 'string') {
      const value = current[values]
      if (value === null || value === undefined) return []
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return []
        result[values] = trimmed
      }
    }
    if (options.labelFields) {
      const labels: string[] = []
      for (const field of options.labelFields) {
        const read = view.fieldAccess(row, field).read
        if (read === 'masked') {labels.splice(0, labels.length, '••••'); break}
        if (read !== 'visible') continue
        const raw = current[field]
        if (raw === null || raw === undefined) continue
        if (!['string','number','boolean'].includes(typeof raw)) throw new Error('FIELD_OPTION_LABEL: 标题不是标量值')
        const label = String(raw).trim()
        if (!label) continue
        labels.push(label)
        if (options.labelJoiner === undefined) break
      }
      result[options.labelField] = labels.join(options.labelJoiner ?? '') || (typeof values === 'string' ? String(result[values] ?? '') : '')
    }
    return [result]
  })
}

export function buildOptionSourceFromView(
  view: DataView,
  options: OptionSourceOptions,
): unknown[] {
  const {labelField, childrenField} = options
  const rows = options.rows === undefined ? readableRows(view, view.rows, options) : [...options.rows]
  const validateLabels=(items:readonly DataRow[]):void=>{
    for(const row of items){
      const value=row[labelField]
      if(value!==null&&value!==undefined&&!['string','number','boolean'].includes(typeof value))throw new Error('FIELD_OPTION_LABEL: 标题不是标量值')
      const children=row[childrenField]
      if(Array.isArray(children))validateLabels(children.filter(isRecord))
    }
  }
  validateLabels(rows)
  const treeConfig = view.treeConfig
  if (rows.some(row => Array.isArray(row[childrenField]))) {
    const sort=(items:readonly DataRow[]):DataRow[]=>DataTreeField.sort(items.map(row=>{
      const children=row[childrenField]
      return Array.isArray(children)?{...row,[childrenField]:sort(children.filter(isRecord))}:row
    }),treeConfig?.orderField)
    return sort(rows)
  }

  if (!treeConfig) return rows

  const idField = treeConfig.idField ?? view.primaryKey
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? labelField

  const origins=new Map<string|number,DataRow|null>()
  const seedNodes: FlatTreeNode[] = rows.flatMap(row => {
    const seed=DataTreeField.project(row,{...treeConfig,idField,parentIdField,textField})
    if(!seed)return []
    origins.set(seed.id,origins.has(seed.id)?null:row)
    return [seed]
  })

  if (seedNodes.length === 0) return rows

  const nested=SparkData.createTreeManager({
    ...treeConfig,
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree()
  const restore=(nodes:readonly NestedTreeNode[]):DataRow[]=>nodes.flatMap(node=>{
    const source=origins.get(node.id)
    if(!source)return []
    return [{...source,[childrenField]:restore(node.children)}]
  })
  return restore(nested)
}
