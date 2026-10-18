/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTable/zero-code
 * 职责：封装 RendererTable（r-table）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 table-level/data-view-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer table 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import { isDataRow, type DataView, type DataRow } from '@spark-appworks/spark-data'
import { toRaw } from 'vue'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import { getSelectedRows } from '../../../../page/actions/index.js'
import { createContainerCrudContext, getNativeRefValue } from '../zero-code-shared.js'
import { toDataRecord } from '../data-row-utils.js'
import type { RendererTableApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition */

/** r-table 运行时需要调用的 Element Plus table 原生能力集合。 */
export type NativeTableLike = {
  /** 清空 UI 层多选状态。 */
  clearSelection?: () => void
  /** 设置指定行在 UI 层的选中状态。 */
  toggleRowSelection?: (row: DataRow, selected?: boolean) => void
  /** 设置 UI 层当前行；传 null 清空当前行。 */
  setCurrentRow?: (row: DataRow | null) => void
  /** 重新计算表格列宽和布局。 */
  doLayout?: () => void
}

/** 创建 r-table zero-code API 和事件桥接所需的运行时输入。 */
type RendererTableZeroCodeOptions = {
  /** r-table 的组件属性集合，包含事件回调和配置透传。 */
  props: Readonly<Record<string, unknown>>
  /** 当前解析出的 DataView。 */
  resolvedView: ValueRef<DataView | null>
  /** Element Plus table 原生组件 ref。 */
  nativeTableRef: ValueRef<NativeTableLike | null>
  /** 当前行变更的来源 id，用于避免 DataView selection 回环。 */
  currentRowOriginatorId?: string
  /** 多选变更的来源 id，用于避免 DataView selection 回环。 */
  selectedRowsOriginatorId?: string
  /** 表格运行时诊断日志。 */
  logger: LoggerApi
}

function toDataRows(value: unknown): DataRow[] {
  return Array.isArray(value) ? value.filter(isDataRow).map(row => toRaw(row)) : []
}

function isNativeTableLike(value: unknown): value is NativeTableLike {
  if (typeof value !== 'object' || value === null) return false
  const clearSelection = Reflect.get(value, 'clearSelection')
  const toggleRowSelection = Reflect.get(value, 'toggleRowSelection')
  const setCurrentRow = Reflect.get(value, 'setCurrentRow')
  const doLayout = Reflect.get(value, 'doLayout')
  return (clearSelection === undefined || typeof clearSelection === 'function')
    && (toggleRowSelection === undefined || typeof toggleRowSelection === 'function')
    && (setCurrentRow === undefined || typeof setCurrentRow === 'function')
    && (doLayout === undefined || typeof doLayout === 'function')
}

function stripSyntheticTreeName<T>(value: T, textField: string | undefined): T
function stripSyntheticTreeName(value: unknown, textField: string | undefined): unknown {
  if (textField === undefined || textField === 'name') return value

  if (Array.isArray(value)) {
    let changed = false
    const nextValue = value.map(item => {
      const nextItem = stripSyntheticTreeName(item, textField)
      if (nextItem !== item) changed = true
      return nextItem
    })
    return changed ? nextValue : value
  }

  const record = toDataRecord(value)
  if (!record) return value

  const entries = Object.entries(record)
  const duplicatedLabelEntry = entries.find(([key]) => key === textField)
  const hasDuplicatedLabel = duplicatedLabelEntry !== undefined
  const duplicatedLabel = duplicatedLabelEntry?.[1]
  let changed = false
  const nextValue: Record<string, unknown> = {}

  for (const [key, entryValue] of entries) {
    if (key === 'name' && hasDuplicatedLabel && Object.is(duplicatedLabel, entryValue)) {
      changed = true
      continue
    }
    const nextEntryValue = stripSyntheticTreeName(entryValue, textField)
    if (nextEntryValue !== entryValue) changed = true
    nextValue[key] = nextEntryValue
  }

  return changed ? nextValue : value
}

function sanitizeTreePayload<T>(value: T, view: DataView | null | undefined): T
function sanitizeTreePayload(value: unknown, view: DataView | null | undefined): unknown {
  return stripSyntheticTreeName(value, view?.treeConfig?.textField)
}

export function createRendererTableZeroCode(options: RendererTableZeroCodeOptions) {
  const {
    props,
    resolvedView,
    nativeTableRef,
    currentRowOriginatorId,
    selectedRowsOriginatorId,
  } = options

  const { dispatch, baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
    eventDefaults: {
      'current-change': {
        systemDefault: (currentRow: unknown) => {
          resolvedView.value?.selection.setCurrentRow(
            isDataRow(currentRow) ? toRaw(currentRow) : null,
            currentRowOriginatorId,
          )
        },
      },
      'row-click': {
        systemDefault: (row: unknown) => {
          if (!isDataRow(row)) return
          resolvedView.value?.selection.setCurrentRow(
            toRaw(row),
            currentRowOriginatorId,
          )
        },
      },
      'selection-change': {
        systemDefault: (selection: unknown) => {
          resolvedView.value?.selection.setSelectedRows(
            toDataRows(selection),
            selectedRowsOriginatorId,
          )
        },
      },
    },
  })

  function getNativeTable() {
    return getNativeRefValue(nativeTableRef, isNativeTableLike)
  }

  const tableApi: RendererTableApi = {
    ...baseMethods,
    getValue() {
      return resolvedView.value?.getSelectedValues() ?? []
    },
    getRows() {
      return resolvedView.value?.rows ?? []
    },
    getSelectedRows() {
      return resolvedView.value ? getSelectedRows(resolvedView.value) : []
    },
    async query() {
      const view = resolvedView.value
      if (!view) return
      if (typeof view.refresh === 'function') {
        await view.refresh()
      }
    },
    async loadTreeNested(rootId, limit, depthLimit) {
      const view = resolvedView.value
      if (!view) return null
      const result = await view.loadTreeNested(rootId, limit, depthLimit)
      return sanitizeTreePayload(result, view)
    },
    async loadTreeChildren(parentId, limit) {
      const view = resolvedView.value
      if (!view) return []
      const result = await view.loadTreeChildren(parentId, limit)
      return sanitizeTreePayload(result, view)
    },
    async loadTreePath(id) {
      const view = resolvedView.value
      if (!view) return null
      const result = await view.loadTreePath(id)
      return sanitizeTreePayload(result, view)
    },
    async expandToNode(key) {
      const view = resolvedView.value
      if (!view) return
      await view.expandTreeToNode(key)
      tableApi.setCurrentRowById(key)
    },
    async moveNode(nodeId, newParentId, index) {
      const view = resolvedView.value
      if (!view) return null
      const result = await view.moveTreeNode(nodeId, newParentId, index)
      return sanitizeTreePayload(result, view)
    },
    async searchTreeNested(keyword, limit) {
      const view = resolvedView.value
      if (!view) return []
      const result = await view.searchTreeNested(keyword, limit)
      return sanitizeTreePayload(result, view)
    },
    // DataView-first: watcher in RendererTable.vue syncs to nativeTableRef
    setCurrentRow(row) {
      const targetRow = row ? toRaw(row) : null
      resolvedView.value?.selection.setCurrentRow(targetRow)
    },
    setCurrentRowById(id) {
      const view = resolvedView.value
      if (!view) return false
      return view.selection.setCurrentRowById(id ?? null)
    },
    setSelectedRows(rows) {
      resolvedView.value?.selection.setSelectedRows(rows.map(row => toRaw(row)))
    },
    setSelectedRowsById(ids) {
      return resolvedView.value?.selection.setSelectedRowsById(ids) ?? 0
    },
    clearSelectedRows() {
      resolvedView.value?.selection.clearSelectedRows()
    },
    clearUiSelection() {
      getNativeTable()?.clearSelection?.()
    },
    toggleUiRowSelection(row, selected = true) {
      getNativeTable()?.toggleRowSelection?.(row, selected)
    },
    doLayout() {
      getNativeTable()?.doLayout?.()
    },
    getNativeTable() {
      return getNativeTable()
    },
  }

  return {
    dispatch,
    tableApi,
  }
}
