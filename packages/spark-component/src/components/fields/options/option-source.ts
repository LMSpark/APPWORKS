/**
 * @module @spark-appworks/spark-component:components/fields/options/option-source
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/options/option-source 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/options/option-source 的声明、导出和使用边界时，从本模块开始。
 */
import { SparkData, type DataRow, type DataView, type FlatTreeNode } from '@spark-appworks/spark-data'

type OptionSourceOptions = {labelField: string; childrenField: string; rows?: readonly DataRow[]}

export function buildOptionSourceFromView(
  view: DataView,
  options: OptionSourceOptions,
): unknown[] {
  const {labelField, childrenField} = options
  const rows = options.rows === undefined ? view.rows : [...options.rows]
  if (rows.some(row => Array.isArray(row[childrenField]))) {
    return rows
  }

  const treeConfig = view.treeConfig
  if (!treeConfig) return rows

  // 优先复用 DataView 内部已同步的 TreeManager
  if (options.rows === undefined && view.treeManager) {
    return view.treeManager.buildNestedTree()
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
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree()
}
