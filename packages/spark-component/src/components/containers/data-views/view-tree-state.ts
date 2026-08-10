/**
 * @module @spark-appworks/spark-component:components/containers/data-views/view-tree-state
 * 职责：支撑 view-tree-state（未注册组件类型）在 table-level/data-view-container 中的运行时协作，补齐配置、状态或渲染器之间的连接逻辑。
 * 边界：只覆盖当前组件目录 containers/data-views 的局部能力，不定义全局页面模型，也不越级操作业务数据源。
 * AI用途：需要判断 view tree state 的组件分层、辅助类型或内部接线时，用本模块作为局部语义入口。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import {
  SparkData,
  type DataView,
  type DataRow,
  type TreeConfig,
} from '@spark-appworks/spark-data'
import type { RendererTreeNode } from './RendererTree/zero-code'
import type { DataViewState } from './view-runtime-state.js'
import {
  resolveTreeNodeText,
  toDataRecord,
  toMutableRows,
} from './data-row-utils.js'

/** 树形视图态（RendererTree 专用扩展）。 */
export type RendererTreeViewState = DataViewState & {
    /** 树形节点数组（已嵌套 children），供 RendererTree 组件直接渲染。 */
    treeData: ComputedRef<RendererTreeNode[]>
    /** 树 ID 字段名（默认 'id'），用于节点寻址和选中态标识。 */
    treeIdField: ComputedRef<string>}

/** SparkData.createTreeManager 消费的种子节点形状。 */
type TreeManagerSeedNode = Record<string, unknown> & {
  /** 节点唯一标识（字符串或数字）。 */
  id: string | number
  /** 节点显示文本。 */
  name: string
  /** 父节点 ID；null/undefined 表示根节点。 */
  parentId?: string | number | null}

type TreeFieldNames = {
  idField: string
  parentIdField: string
  textField: string}

type TreeSeedBuildResult = {
  seedNodes: TreeManagerSeedNode[]
  hasParentLink: boolean}

function toTreeRows(rows: readonly DataRow[]): RendererTreeNode[] {
  return rows.map(toRendererTreeNode)
}

function toRendererTreeNode(row: DataRow): RendererTreeNode {
  const node: RendererTreeNode = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'children') continue
    node[key] = value
  }
  const children = row['children']
  if (Array.isArray(children)) {
    node.children = children
      .map(toDataRecord)
      .filter((record): record is Record<string, unknown> => record !== null)
      .map(toDataRow)
      .map(toRendererTreeNode)
  }
  return node
}

function toDataRow(record: Record<string, unknown>): DataRow {
  const row: DataRow = {}
  for (const [key, value] of Object.entries(record)) {
    row[key] = value
  }
  return row
}

function toDataRows(records: ReadonlyArray<Record<string, unknown>>): DataRow[] {
  return records.map(toDataRow)
}

function resolveParentId(rawParentId: unknown): string | number | null {
  if (typeof rawParentId === 'string' || typeof rawParentId === 'number') return rawParentId
  if (rawParentId === null || rawParentId === undefined) return null
  return String(rawParentId)
}

function isAlreadyNested(rows: readonly unknown[]): boolean {
  return rows.some(row => {
    const record = toDataRecord(row)
    if (!record) return false
    return Array.isArray(record['children'])
  })
}

function resolveTreeFieldNames(
  treeConfig: TreeConfig,
  primaryKey: string | undefined,
): TreeFieldNames | null {
  const idFieldRaw = treeConfig.idField ?? primaryKey
  if (typeof idFieldRaw !== 'string' || idFieldRaw.length === 0) return null
  return {
    idField: idFieldRaw,
    parentIdField: treeConfig.parentIdField ?? 'parentId',
    textField: treeConfig.textField ?? 'label',
  }
}

function buildTreeSeedNodes(rows: readonly DataRow[], fields: TreeFieldNames): TreeSeedBuildResult {
  const seedNodes: TreeManagerSeedNode[] = []
  let hasParentLink = false

  for (const row of rows) {
    const record = toDataRecord(row)
    if (!record) continue

    const rawId = record[fields.idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') continue

    const parentId = resolveParentId(record[fields.parentIdField])
    if (parentId !== null) hasParentLink = true

    seedNodes.push({
      ...record,
      id: rawId,
      parentId,
      name: resolveTreeNodeText(record, fields.textField, String(record[fields.textField] ?? rawId)),
    })
  }

  return { seedNodes, hasParentLink }
}

function buildNestedTreeRows(fields: TreeFieldNames, seedNodes: TreeManagerSeedNode[]): DataRow[] {
  const nestedRows = SparkData.createTreeManager({
    idField: fields.idField,
    parentIdField: fields.parentIdField,
    textField: fields.textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree()
  return toDataRows(nestedRows)
}

/** Tree Table Rows Input 的输入数据。 */
export type TreeTableRowsInput = Readonly<{
  /** 目标 DataView 实例；若已持有 treeManager 则直接用其 buildNestedTree，否则从 rows + treeConfig 重建。 */
  view: DataView | null | undefined,
  /** 扁平行数据数组（可能已嵌套 children，也可能需要从 parentId 重建树）。 */
  rows: readonly DataRow[],
  /** 树形配置：idField / parentIdField / textField / treeMode，缺省则不构建树。 */
  treeConfig: TreeConfig | undefined,
  /** 主键字段名；当 treeConfig.idField 未指定时作为回退。 */
  primaryKey: string | undefined
}>

export function buildTreeTableRows(input: TreeTableRowsInput): DataRow[] {
  const { view, rows, treeConfig, primaryKey } = input
  if (rows.length === 0) return []
  if (isAlreadyNested(rows)) return toMutableRows(rows)
  if (!treeConfig) return toMutableRows(rows)

  if (view?.treeManager) {
    return toDataRows(view.treeManager.buildNestedTree())
  }

  const fields = resolveTreeFieldNames(treeConfig, primaryKey)
  if (!fields) return toMutableRows(rows)

  const { seedNodes, hasParentLink } = buildTreeSeedNodes(rows, fields)
  if (seedNodes.length === 0 || !hasParentLink) return toMutableRows(rows)

  return buildNestedTreeRows(fields, seedNodes)
}

/** Renderer Tree View State Options 的调用配置。 */
type RendererTreeViewStateOptions = {
    /** 已有的 DataView 状态（rows / treeConfig / resolvedView 等）。 */
dataState: DataViewState}

export function useRendererTreeViewState(options: RendererTreeViewStateOptions): RendererTreeViewState {
  const { rows, treeConfig } = options.dataState

  const treeIdField = computed<string>(() => treeConfig.value?.idField ?? 'id')

  const treeData = computed<RendererTreeNode[]>(() => {
    const resolvedRows = toTreeRows(rows.value)
    if (resolvedRows.length === 0) return []
    if (isAlreadyNested(resolvedRows)) return resolvedRows
    if (!treeConfig.value) return resolvedRows

    const view = options.dataState.resolvedView.value
    if (view?.treeManager) {
      return toTreeRows(toDataRows(view.treeManager.buildNestedTree()))
    }

    const fields = resolveTreeFieldNames(treeConfig.value, treeIdField.value)
    if (!fields) return resolvedRows

    const { seedNodes } = buildTreeSeedNodes(resolvedRows, fields)
    return toTreeRows(buildNestedTreeRows(fields, seedNodes))
  })

  return {
    ...options.dataState,
    treeData,
    treeIdField,
  }
}
