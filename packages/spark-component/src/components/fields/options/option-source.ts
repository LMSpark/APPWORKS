/**
 * @module @spark-appworks/spark-component:components/fields/options/option-source
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/options/option-source 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/options/option-source 的声明、导出和使用边界时，从本模块开始。
 */
import { SparkData, type DataRow, type DataView, type FlatTreeNode } from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'

/** 选项视图的输出字段及已核验的临时级联结果；不承载业务查询或权限副本。 */
type OptionSourceOptions = {
  /** 选项显示字段；不可读时整项不进入候选集。 */
  labelField: string
  /** 显式的标题回退字段；按各字段当次权限读取。 */
  labelFields?: readonly string[]
  /** 显式值字段；省略时复用视图的valueField或主键。 */
  valueField?: string
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
  return rows.flatMap(row => {
    if (required.some(field => view.fieldAccess(row, field).read !== 'visible')) return []
    const result: DataRow = {}
    for (const [field, value] of Object.entries(row)) {
      if (field === options.childrenField && Array.isArray(value)) {
        result[field] = readableRows(view, value.filter(isRecord), options)
      } else if (view.fieldAccess(row, field).read === 'visible') result[field] = value
    }
    if (options.labelFields) {
      let label = ''
      for (const field of options.labelFields) {
        const read = view.fieldAccess(row, field).read
        if (read === 'masked') {label = '••••'; break}
        if (read !== 'visible') continue
        const raw = row[field]
        if (raw === null || raw === undefined) continue
        if (!['string','number','boolean'].includes(typeof raw)) throw new Error('FIELD_OPTION_LABEL: 标题不是标量值')
        label = String(raw).trim()
        if (label) break
      }
      result[options.labelField] = label || (typeof values === 'string' ? String(row[values] ?? '') : '')
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
  if (rows.some(row => Array.isArray(row[childrenField]))) {
    return rows
  }

  const treeConfig = view.treeConfig
  if (!treeConfig) return rows

  // 优先复用 DataView 内部已同步的 TreeManager
  if (options.rows === undefined && view.treeManager) {
    return readableRows(view, view.treeManager.buildNestedTree(), options)
  }

  const idField = treeConfig.idField ?? view.primaryKey
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? labelField

  const seedNodes: FlatTreeNode[] = rows.flatMap(row => {
    const rawId = row[idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      return []
    }

    const rawParentId = row[parentIdField]
    const parentId = typeof rawParentId === 'string' || typeof rawParentId === 'number'
      ? rawParentId
      : rawParentId === null || rawParentId === undefined
        ? null
        : String(rawParentId)

    const rawText = row[textField]

    return [{
      ...row,
      id: rawId,
      parentId,
      name: typeof rawText === 'string'
        ? rawText
        : String(rawText ?? rawId),
    }]
  })

  if (seedNodes.length === 0) return rows

  return SparkData.createTreeManager({
    ...treeConfig,
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree()
}
