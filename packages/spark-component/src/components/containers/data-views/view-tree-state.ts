/**
 * @module @spark-appworks/spark-component:components/containers/data-views/view-tree-state
 * 职责：支撑 view-tree-state（未注册组件类型）在 table-level/data-view-container 中的运行时协作，补齐配置、状态或渲染器之间的连接逻辑。
 * 边界：只覆盖当前组件目录 containers/data-views 的局部能力，不定义全局页面模型，也不越级操作业务数据源。
 * AI用途：需要判断 view tree state 的组件分层、辅助类型或内部接线时，用本模块作为局部语义入口。
 */
import { computed, shallowRef, toRaw } from 'vue'
import type { ComputedRef } from 'vue'
import {
  SparkData,
  type DataView,
  type DataRow,
  type TreeConfig,
  sortDataRowsByExpression,
} from '@spark-appworks/spark-data'
import type { RendererTreeNode } from './RendererTree/zero-code'
import type { DataViewState } from './view-runtime-state.js'
import {syncReactiveRow, resolveReactiveRow, resolveDataViewRow} from '../support/scope/row-mirror-sync'
import {
  resolveTreeNodeText,
  toDataRecord,
  toMutableRows,
} from './data-row-utils.js'

/** 树形视图态（RendererTree 专用扩展）。 */
export type RendererTreeViewState = DataViewState & {
    /** 树形节点数组（已嵌套 children），供 RendererTree 组件直接渲染。 */
    treeData: ComputedRef<RendererTreeNode[]>
    /** 从当前 DataView 重新构建树显示投影。 */
    refreshTreeData: () => void
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
type TreeRowOrigins = {view: DataView | null | undefined; field: string; invalid: boolean; rows: ReadonlyMap<string | number, DataRow | null>}

/** 仅在本次投影构造时关联原对象；重复树键不产生可执行行身份。 */
function collectTreeOrigins(view: DataView | null | undefined, field: string): TreeRowOrigins {
  const rows = new Map<string | number, DataRow | null>()
  let invalid = false
  view?.visitRowsDeep(row => {
    const key = view.getPkKey(row)
    const edited = key === undefined ? null : view.getEditingRow(key)
    if (edited && !Object.is(edited[field], row[field])) invalid = true
    const id = row[field]
    if (typeof id === 'string' || typeof id === 'number') rows.set(id, rows.has(id) ? null : row)
  })
  return {view, field, invalid, rows}
}

/** 仅新构造的无标记投影可用本轮唯一树ID；已知失效来源不得按相同字段重新认领。 */
function resolveTreeOrigin(row: DataRow, origins: TreeRowOrigins): DataRow | null {
  if (origins.invalid) return null
  const candidate = resolveReactiveRow(row)
  if (!candidate) return null
  const native = resolveDataViewRow(origins.view, row)
  if (native) return native
  if (toRaw(candidate) !== toRaw(row)) return null
  const id = row[origins.field]
  return typeof id === 'string' || typeof id === 'number' ? origins.rows.get(id) ?? null : null
}

type TreeSeedBuildResult = {
  seedNodes: TreeManagerSeedNode[]
  hasParentLink: boolean}

function toTreeRows(rows: readonly DataRow[], origins?: TreeRowOrigins): RendererTreeNode[] {
  return rows.map(row => toRendererTreeNode(row, origins))
}

function toRendererTreeNode(row: DataRow, origins?: TreeRowOrigins): RendererTreeNode {
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
      .map(child => toRendererTreeNode(child, origins))
  }
  if (origins) {
    const sourceRow = resolveTreeOrigin(row, origins)
    syncReactiveRow(node, node, {sourceRow})
  }
  return node
}

function toDataRow(record: Record<string, unknown>): DataRow {
  const row: DataRow = {}
  syncReactiveRow(row, record)
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

/** 表格原生嵌套行判定；呈现及不支持树的交互共用，不以缺少treeConfig推断平面结果。 */
export function isAlreadyNested(rows: readonly unknown[]): boolean {
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

function buildNestedTreeRows(
  fields: TreeFieldNames,
  seedNodes: TreeManagerSeedNode[],
  treeConfig?: TreeConfig,
): DataRow[] {
  const nestedRows = SparkData.createTreeManager({
    ...treeConfig,
    idField: fields.idField,
    parentIdField: fields.parentIdField,
    textField: fields.textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree()
  return toDataRows(nestedRows)
}

function sortTreeProjectionRows(
  view: DataView,
  rows: DataRow[],
  origins: TreeRowOrigins,
): DataRow[] {
  const expression = view.sortExpression
  if (!expression?.length || origins.invalid) return rows.map(toDataRow)
  const canReadExpression = rows.every(row => {
    const formalRow = resolveTreeOrigin(row, origins)
    return formalRow !== null && expression.every(sort => view.fieldAccess(formalRow, sort.field).read === 'visible')
  })
  const sorted = canReadExpression ? sortDataRowsByExpression(rows, view.columns, expression) : [...rows]

  return sorted.map(row => {
    const children = row['children']
    if (!Array.isArray(children)) return row
    const childRows = children.map(toDataRecord).filter((record): record is Record<string, unknown> => record !== null).map(toDataRow)
    const copy = toDataRow(row)
    copy['children'] = sortTreeProjectionRows(view, childRows, origins)
    return copy
  })
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
    const origins = collectTreeOrigins(view, treeConfig.idField ?? primaryKey ?? 'id')
    return toTreeRows(toDataRows(view.treeManager.buildNestedTree()), origins)
  }

  const fields = resolveTreeFieldNames(treeConfig, primaryKey)
  if (!fields) return toMutableRows(rows)

  const { seedNodes, hasParentLink } = buildTreeSeedNodes(rows, fields)
  if (seedNodes.length === 0 || !hasParentLink) return toMutableRows(rows)

  return toTreeRows(buildNestedTreeRows(fields, seedNodes, treeConfig), collectTreeOrigins(view, fields.idField))
}

/** Renderer Tree View State Options 的调用配置。 */
type RendererTreeViewStateOptions = {
    /** 已有的 DataView 状态（rows / treeConfig / resolvedView 等）。 */
dataState: DataViewState
}

export function useRendererTreeViewState(options: RendererTreeViewStateOptions): RendererTreeViewState {
  const { rows, treeConfig } = options.dataState
  const projectionRevision = shallowRef(0)
  const refreshTreeData = () => {
    projectionRevision.value += 1
  }

  const treeIdField = computed<string>(() => treeConfig.value?.idField ?? 'id')

  const treeData = computed<RendererTreeNode[]>(() => {
    projectionRevision.value
    const view = options.dataState.resolvedView.value
    const primaryKey = view?.primaryKey
    const formalTreeIdField = view?.treeConfig?.idField ?? (primaryKey === '' || primaryKey === undefined ? 'id' : primaryKey)
    const origins = collectTreeOrigins(view, formalTreeIdField)
    const editedRows = options.dataState.editingRows.value
    let sourceRows = rows.value
    if (view && editedRows.length > 0) {
      sourceRows = rows.value.map(row => {
        const key = view.getPkKey(row)
        const display = key === undefined ? row : view.getEditingRow(key) ?? row
        const mirror: DataRow = {}
        syncReactiveRow(mirror, display, {sourceRow: row})
        return mirror
      })
    }
    const resolvedRows = toTreeRows(sourceRows, origins)
    if (resolvedRows.length === 0) return []
    if (isAlreadyNested(resolvedRows)) {
      const sorted = view ? sortTreeProjectionRows(view, resolvedRows.map(toDataRow), origins) : resolvedRows
      return toTreeRows(sorted, origins)
    }
    if (!treeConfig.value) {
      const sorted = view ? sortTreeProjectionRows(view, resolvedRows.map(toDataRow), origins) : resolvedRows
      return toTreeRows(sorted, origins)
    }

    if (view?.treeManager && editedRows.length === 0) {
      return toTreeRows(sortTreeProjectionRows(view, toDataRows(view.treeManager.buildNestedTree()), origins), origins)
    }

    const fields = resolveTreeFieldNames(treeConfig.value, treeIdField.value)
    if (!fields) return toTreeRows(resolvedRows, origins)

    const { seedNodes } = buildTreeSeedNodes(resolvedRows, fields)
    const nestedRows = buildNestedTreeRows(fields, seedNodes, treeConfig.value)
    const orderedRows = view ? sortTreeProjectionRows(view, nestedRows, origins) : nestedRows
    return toTreeRows(orderedRows, origins)
  })

  return {
    ...options.dataState,
    treeData,
    refreshTreeData,
    treeIdField,
  }
}
