<!--
@module @spark-appworks/spark-component:components/containers/data-views/RendererTable/RendererTable
职责：作为表格父组件，按自身类型和数据上下文渲染页面声明的标准子组件；页面结构只有子组件。
边界：负责 table-level/data-view-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer table 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <!-- 布局壳：工具栏 / 过滤区 / 表格主体，方向由 toolbarPositionValue 决定 -->
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <SparkComponentRenderer v-if="toolbarNode" :config="toolbarNode" />
    <SparkComponentRenderer v-if="filterSparkNode" :config="filterSparkNode" />
    <DataViewMetaBar
      :rows="dataState.rows.value"
      :columns="dataState.columns.value"
      :selected-rows="dataState.selectedRows.value"
      :total="dataState.total.value"
      :paginated="dataState.paginated.value"
      :page="dataState.page.value"
      :page-size="dataState.pageSize.value"
      :request-state="dataState.requestState.value"
      :mutating="dataState.mutating.value"
      :loading-error="dataState.loadingError.value"
      :mutating-error="dataState.mutatingError.value"
      :aggregate-result="dataState.aggregateResult.value"
      :aggregate-error="dataState.aggregateError.value"
      :selection-aggregate-result="dataState.selectionAggregateResult.value"
      :show-data-view-meta="props.showDataViewMeta !== false"
      :show-aggregate-summary="props.showAggregateSummary !== false"
      :show-selection-summary="props.showSelectionSummary !== false"
    />

    <el-table
      ref="nativeTableRef"
      class="renderer-table-main"
      :data="rows"
      v-bind="elTableProps"
      v-loading="isLoading"
      :row-class-name="tableRowClassName"
      @current-change="handleCurrentChange"
      @row-click="handleRowClick"
      @selection-change="handleSelectionChange"
      @sort-change="handleSortChange"
    >
        <!-- 列区必须直接是 el-table 的子级，不可引入透明包装层 -->
        <el-table-column
          v-if="isMultiSelect"
          type="selection"
          :width="52"
          :resizable="tableColumnResizable"
        />

        <!-- 行操作列（左） -->
        <el-table-column
          v-if="hasLeftActions"
          label="操作"
          :width="220"
          :resizable="tableColumnResizable"
          header-align="center"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions">
              <RendererHostScope :row="toScopeRow(scope.row)" :children="actionScopeChildren" />
            </div>
          </template>
        </el-table-column>

        <!-- 配置子组件由当前父容器渲染；组合子组件在本容器内投影为单元格内容 -->
        <template
          v-for="(child, index) in normalizedContentChildNodes"
          :key="nodeId(child) ?? `r-table-child-${index}`"
        >
          <el-table-column
            v-if="child.type === 'r-column-group'"
            :label="rowFragmentLabel(child)"
            :width="rowFragmentStringOrNumberProp(child, 'width')"
            :min-width="rowFragmentStringOrNumberProp(child, 'minWidth')"
            :resizable="rowFragmentResizable(child)"
            :align="rowFragmentStringProp(child, 'align')"
            :header-align="rowFragmentStringProp(child, 'headerAlign')"
            :class-name="rowFragmentStringProp(child, 'class')"
          >
            <template #default="scope">
              <RendererHostScope :row="toScopeRow(scope.row)" :children="rowFragmentChildren(child)" />
            </template>
          </el-table-column>

          <SparkComponentRenderer
            v-else
            :config="child"
          />
        </template>

        <!-- Vue 模板声明标准子组件，与配置 children 共享当前父容器上下文 -->
        <slot />

        <!-- 行操作列（右，默认） -->
        <el-table-column
          v-if="hasRightActions"
          label="操作"
          :width="220"
          :resizable="tableColumnResizable"
          header-align="center"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions">
              <RendererHostScope :row="toScopeRow(scope.row)" :children="actionScopeChildren" />
            </div>
          </template>
        </el-table-column>
    </el-table>

    <el-pagination
      v-if="showPagination"
      class="renderer-table-pagination"
      background
      :layout="props.pagination?.showJumper === false ? 'total, sizes, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
      :total="dataState.total.value"
      :current-page="dataState.page.value"
      :page-size="dataState.pageSize.value"
      :page-sizes="props.pagination?.pageSizes ?? [10, 20, 50, 100]"
      @current-change="handlePageChange"
      @size-change="handlePageSizeChange"
    />
  </div>
</template>
<script setup lang="ts">
/**
 * @description 数据表格容器，支持工具栏/筛选区/行操作等区域，自动同步当前行和选中行状态。
 * @category container
 * @binding dataViewKey-driven
 * @notes 页面只声明标准子组件 children，子组件依据父组件类型及数据上下文渲染
 * @notes 结构化区域使用 props.toolbar / props.filter / props.actions，不再使用 dock 分流
 * @notes highlightCurrentRow 必须显式声明才生效
 * @notes 提示词模板（可提取）：默认包含 toolbar/filter/actions 三块，具体动作模板见对应 props 注释。
 * @notes 提示词模板（数据绑定）：dataViewKey 使用 数据空间ID@模型名称@视图名称；统计输出使用绑定 dataMember 和 dataField 的 display 子组件。
 */
import { computed, nextTick, provide, ref, toRaw, toRef, watch } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  DATA_SOURCE,
} from '../../../internal'
import type { RTableProps, TableRowClassContext } from './RendererTable.props'
import * as SparkData from '@spark-appworks/spark-data'
import type { SparkNode, DataRow, DataView } from '@spark-appworks/spark-data'
import { createRendererTableZeroCode, type NativeTableLike } from './zero-code'
import { toSortDirection, type ElementPlusTableSortOrder } from './types'
import { useContainerDataSource } from '../view-data-source'
import { buildTreeTableRows } from '../view-tree-state'
import { useContainerToolbar } from '../../runtime/container-ui'
import { sparkColumnToAutoFieldNode } from '../../runtime/column-auto-field.js'
import RendererHostScope from '../../support/scope/RendererHostScope.vue'
import DataViewMetaBar from '../DataViewMetaBar.vue'
import { TABLE_COLUMN_RESIZABLE_KEY } from '../../../fields/context/tableColumnContext'
import { toDataRecord } from '../data-row-utils'

const { DataMember, RequestState, getSparkNodeChildren, nodeInputProps, nodeId } = SparkData

// ── 输入 props 与子组件预处理 ─────────────────────────────────────────

const props = withDefaults(defineProps<RTableProps>(), {
  type: 'r-table',
  showPagination: true,
})

// ── 能力注入与 DataView 解析（dataViewKey 优先，回落外部 dataSource）、向下提供 DATA_SOURCE ─────────────
const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)

const dataState = useContainerDataSource({
  externalDataSource: toRef(props, 'dataSource'),
  dataViewKey: toRef(props, 'dataViewKey'),
  sparkConsume,
  provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererTable',
})

const explicitContentChildNodes = computed(() => getSparkNodeChildren(props.children))

const contentSourceChildNodes = computed<SparkNode[]>(() => {
  if (explicitContentChildNodes.value.length > 0 || props.autoColumns === false) {
    return explicitContentChildNodes.value
  }
  return dataState.columns.value
    .filter(column => column.isComputed !== true)
    .map(column => sparkColumnToAutoFieldNode(column, 'table'))
})

const normalizedContentChildNodes = computed<SparkNode[]>(() => {
  return contentSourceChildNodes.value.map((rawNode) => {
    const sourceProps = nodeInputProps(rawNode)
    const field = sourceProps['field'] ?? sourceProps['fieldName'] ?? sourceProps['prop'] ?? sourceProps['property']
    return (
      rawNode.type === 'r-column-group'
      || sourceProps['sortable'] !== undefined
      || typeof field !== 'string'
      || field.trim().length === 0
    )
      ? rawNode
      : { ...rawNode, props: { ...sourceProps, sortable: true } }
  })
})

const {toolbarConfig: toolbarNode, toolbarPositionValue} = useContainerToolbar({
  toolbarNode: () => {
    const toolbar = props.toolbar
    if (!toolbar) return undefined
    const dataViewKey = toolbar.dataViewKey || props.dataViewKey
    return {...toolbar, ...(dataViewKey !== undefined ? {dataViewKey} : {}),
      dataMember: toolbar.dataMember ?? DataMember.CurrentRow}
  },
})

const {toolbarConfig: actionsNode} = useContainerToolbar({toolbarNode: () => props.actions})

const actionScopeChildren = computed<SparkNode[]>(() => {
  return actionsNode.value ? [actionsNode.value] : []
})

const hasLeftActions = computed(
  () => actionsNode.value !== undefined && props.actions?.position === 'left'
)
const hasRightActions = computed(
  () => actionsNode.value !== undefined && (props.actions?.position ?? 'right') === 'right'
)

const filterSparkNode = computed<SparkNode | undefined>(() => {
  const filter = props.filter
  if (filter === undefined) return undefined
  const { type: _type, id, children, class: userClass, dataViewKey: existingDataViewKey, ...rest } = filter
  const resolvedDataViewKey = (existingDataViewKey !== undefined && existingDataViewKey !== '')
    ? existingDataViewKey
    : props.dataViewKey
  return {
    type: 'r-filter',
    ...(id !== undefined ? { id } : {}),
    props: {
      autoFitMinWidth: '220px',
      itemSpan: 1,
      ...rest,
      ...(resolvedDataViewKey !== undefined ? { dataViewKey: resolvedDataViewKey } : {}),
      class: ['renderer-table-filter-panel', userClass].filter(Boolean).join(' '),
    },
    children: children ?? [],
  }
})

// row-fragment 列元信息统一从 props 读取（title/width/minWidth/align/...），以下为类型安全读取工具。
function rowFragmentRawProp(node: SparkNode, key: string): unknown {
  return nodeInputProps(node)[key]
}

function rowFragmentLabel(node: SparkNode): string {
  return String(rowFragmentRawProp(node, 'title') ?? '')
}

function rowFragmentStringProp(node: SparkNode, key: string): string | undefined {
  const value = rowFragmentRawProp(node, key)
  return typeof value === 'string' ? value : undefined
}

function rowFragmentStringOrNumberProp(node: SparkNode, key: string): string | number | undefined {
  const value = rowFragmentRawProp(node, key)
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function rowFragmentBooleanProp(node: SparkNode, key: string): boolean | undefined {
  const value = rowFragmentRawProp(node, key)
  return typeof value === 'boolean' ? value : undefined
}

function rowFragmentChildren(node: SparkNode): SparkNode[] {
  return getSparkNodeChildren(node.children)
}

function toScopeRow(value: unknown): DataRow | undefined {
  return toDataRecord(value) ?? undefined
}

// ── 基础 el-table props：resizable 默认 true，且与 border 联动 ──────────────────────────
const baseElTableProps = computed<Record<string, unknown>>(() => {
  const resolvedResizable = props.resizable ?? true
  const resolvedBorder = resolvedResizable === true
    ? true
    : (props.border ?? true)

  return {
    ...(props.stripe !== undefined ? { stripe: props.stripe } : {}),
    ...(props.highlightCurrentRow !== undefined ? { highlightCurrentRow: props.highlightCurrentRow } : {}),
    ...(props.rowKey !== undefined ? { rowKey: props.rowKey } : {}),
    ...(props.maxHeight !== undefined ? {maxHeight: props.maxHeight} : {}),
    border: resolvedBorder,
    resizable: resolvedResizable,
  }
})

const tableColumnResizable = computed(() => {
  const value = baseElTableProps.value['resizable']
  return typeof value === 'boolean' ? value : true
})

provide(TABLE_COLUMN_RESIZABLE_KEY, tableColumnResizable)

function rowFragmentResizable(node: SparkNode): boolean {
  return rowFragmentBooleanProp(node, 'resizable') ?? tableColumnResizable.value
}

const DEFAULT_TABLE_TREE_PROPS: Readonly<Record<string, unknown>> = Object.freeze({
  children: 'children',
  hasChildren: 'hasChildren',
})

// ── 筛选区透传：r-filter 自治 DataView 同步与 filterModel ─────────────────────────────
const rows = computed(() => buildTreeTableRows({
  view: dataState.resolvedView.value,
  rows: dataState.rows.value,
  treeConfig: dataState.treeConfig.value,
  primaryKey: dataState.primaryKey.value,
}))
const isLoading = computed(() => dataState.requestState.value === RequestState.Loading)
const showPagination = computed(() => props.showPagination !== false && dataState.paginated.value && dataState.total.value > 0)

function handlePageChange(page: number) {
  dataState.resolvedView.value?.setPage(page)
}

function handlePageSizeChange(size: number) {
  dataState.resolvedView.value?.setPageSize(size)
}
const { currentRow, isMultiSelect, selectedRows } = dataState

const tableRowKeyValue = computed(() =>
  dataState.primaryKey.value
  ?? dataState.treeConfig.value?.idField
)

const tableTreePropsValue = computed<Record<string, unknown> | undefined>(() => {
  if (!dataState.treeConfig.value) return undefined
  return DEFAULT_TABLE_TREE_PROPS
})

const elTableProps = computed<Record<string, unknown>>(() => {
  const result = { ...baseElTableProps.value }

  if (!dataState.treeConfig.value) return result

  if (result['rowKey'] === undefined && tableRowKeyValue.value) {
    result['rowKey'] = tableRowKeyValue.value
  }

  if (result['treeProps'] === undefined && tableTreePropsValue.value) {
    result['treeProps'] = tableTreePropsValue.value
  }

  return result
})

const selectedRowIdSet = computed<Set<string | number>>(() => {
  const keyField = dataState.primaryKey.value
  const ids = new Set<string | number>()
  if (typeof keyField !== 'string' || keyField.length === 0) return ids
  for (const row of dataState.selectedRows.value) {
    const key = row[keyField]
    if (typeof key === 'string' || typeof key === 'number') ids.add(key)
  }
  return ids
})

const selectedRowRefSet = computed<Set<DataRow>>(() => new Set(dataState.selectedRows.value))

function isSelectedRow(row: DataRow): boolean {
  const keyField = dataState.primaryKey.value
  if (typeof keyField === 'string' && keyField.length > 0) {
    const key = row[keyField]
    if ((typeof key === 'string' || typeof key === 'number') && selectedRowIdSet.value.has(key)) return true
  }
  return selectedRowRefSet.value.has(toRaw(row))
}

// ── 零代码 API 桥接：filter API 已下放给 r-filter，这里仅保留 view.refresh()/选择态等 ───────────
const nativeTableRef = ref<NativeTableLike | null>(null)

const {
  dispatch,
  tableApi,
} = createRendererTableZeroCode({
  props,
  resolvedView: dataState.resolvedView,
  nativeTableRef,
  logger,
})

registerApi(tableApi)

watch(
  currentRow,
  async (row) => {
    await nextTick()
    nativeTableRef.value?.setCurrentRow?.(row ?? null)
  },
)

// 将 DataView.selectedRows 反写到 el-table 原生 checkbox，防止外部设置选中态（如 autoSelectFirst）时勾选框不亮
let _isSyncingSelection = false
watch(
  [selectedRows, rows],
  async () => {
    if (_isSyncingSelection) return
    // 在 nextTick 之前先置标志，阻止 el-table 随 :data 更新而内部触发的 selection-change 写入 DataView
    _isSyncingSelection = true
    try {
      await nextTick()
      const table = nativeTableRef.value
      if (!table) return
      table.clearSelection?.()
      for (const row of rows.value) {
        if (isSelectedRow(row)) {
          table.toggleRowSelection?.(row, true)
        }
      }
    } finally {
      _isSyncingSelection = false
    }
  },
  { immediate: true },
)

/**
 * 合并标准选择样式与调用方的纯呈现样式；不改变数据或选择。
 */
function tableRowClassName(context: TableRowClassContext) {
  return [isSelectedRow(context.row) ? 'spark-selection-row' : '', props.rowClassName?.(context) ?? ''].filter(Boolean).join(' ')
}

// ============================================================================
// 分区 8：原生事件 -> 零代码调度器
// ============================================================================

/** 当前行变化事件桥接。 */
async function handleCurrentChange(currentRow: DataRow | null, oldCurrentRow?: DataRow | null) {
  // el-table 在 :data 替换行对象后以 null 报告失去旧引用；DataView 仍持有有效指针时由 currentRow watch 反写，不清空 DataView。
  const view = dataState.resolvedView.value, held = view?.currentRow
  if (!currentRow && held && view.rows.includes(held)) return
  await dispatch('current-change', currentRow ?? null, oldCurrentRow)
}

/** 行点击事件桥接。 */
async function handleRowClick(row: DataRow, column?: unknown, event?: Event) {
  if (!row) return
  await dispatch('row-click', row, column, event)
}

/** 多选变更事件桥接。 */
async function handleSelectionChange(selection: DataRow[]) {
  if (_isSyncingSelection) return
  await dispatch('selection-change', Array.isArray(selection) ? selection : [])
}

/** 处理排序变化（服务端排序）；Element Plus order → SortDirection */
async function handleSortChange({ prop, order }: { prop: string | null, order: ElementPlusTableSortOrder | null }) {
  if (!dataState.resolvedView.value) return
  if (!prop || !order) {
    await dataState.resolvedView.value.setSort(undefined)
  } else {
    await dataState.resolvedView.value.setSort([{
      field: prop,
      direction: toSortDirection(order),
    }])
  }
}

</script>

<style scoped>
/* ── 布局骨架 ───────────────────────────────────────────────────────────── */

.renderer-table-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-table-layout--top,
.renderer-table-layout--bottom {
  flex-direction: column;
}

.renderer-table-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-table-layout--left,
.renderer-table-layout--right {
  align-items: flex-start;
}

.renderer-table-layout--right {
  flex-direction: row-reverse;
}

/* 表格主体：允许在 flex 容器中收缩，避免横向内容把外层撑爆。 */
.renderer-table-main {
  min-width: 0;
  flex: 1;
}

.renderer-table-filter-panel {
  width: 100%;
}

.renderer-table-pagination {
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  white-space: normal;
}

.renderer-table-pagination :deep(> *) {
  margin-left: 0;
}

.renderer-table-pagination :deep(.el-pager) {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
}

/* 表头视觉强化：提升层次感与可读性。 */
.renderer-table-main {
  --spark-table-header-bg: linear-gradient(180deg, var(--el-fill-color-extra-light) 0%, var(--el-fill-color-light) 100%);
  --spark-table-header-bg-hover: var(--el-fill-color);
  --spark-table-header-text: var(--el-text-color-primary);
  --spark-table-header-border: var(--el-border-color-lighter);
  --spark-table-current-row-bg: var(--el-color-primary-light-9);
  --spark-table-current-row-bg-hover: var(--el-color-primary-light-8);
  --spark-table-selection-row-bg: var(--el-color-success-light-9);
  --spark-table-selection-row-bg-hover: var(--el-color-success-light-8);
  --el-table-current-row-bg-color: var(--spark-table-current-row-bg);
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell) {
  background: var(--spark-table-header-bg);
  color: var(--spark-table-header-text);
  border-bottom: 1px solid var(--spark-table-header-border);
  height: 44px;
  font-weight: 600;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell .cell) {
  letter-spacing: 0.02em;
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell.is-sortable:hover) {
  background: var(--spark-table-header-bg-hover);
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell:first-child) {
  border-top-left-radius: 10px;
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell:last-child) {
  border-top-right-radius: 10px;
}

/* 当前行/勾选行高亮：提升行态辨识度。 */
.renderer-table-main :deep(.el-table__body tr.current-row > td.el-table__cell) {
  background-color: var(--spark-table-current-row-bg) !important;
}

.renderer-table-main :deep(.el-table__body tr.current-row:hover > td.el-table__cell) {
  background-color: var(--spark-table-current-row-bg-hover) !important;
}

.renderer-table-main :deep(.el-table__body tr.spark-selection-row > td.el-table__cell) {
  background-color: var(--spark-table-selection-row-bg) !important;
}

.renderer-table-main :deep(.el-table__body tr.spark-selection-row:hover > td.el-table__cell) {
  background-color: var(--spark-table-selection-row-bg-hover) !important;
}

/* 左右侧工具栏布局时，工具栏内部也改为纵向堆叠。 */
.renderer-table-layout--left .renderer-table-toolbar :deep(.renderer-toolbar-lane),
.renderer-table-layout--right .renderer-table-toolbar :deep(.renderer-toolbar-lane) {
  grid-auto-flow: row;
  grid-auto-rows: max-content;
}

</style>

