<!--
@module @spark-appworks/spark-component:components/containers/data-views/RendererList/RendererList
职责：实现 RendererList（r-list）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 table-level/data-view-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer list 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div :class="['renderer-list-layout', `renderer-list-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-list-toolbar', toolbarClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in visibleToolbarConfigs"
          :key="nodeId(action) ?? `r-list-toolbar-${index}`"
          :config="action"
        />
    </div>

    <DataViewMetaBar
      :rows="dataState.rows.value"
      :columns="dataState.columns.value"
      :selected-rows="dataState.selectedRows.value"
      :total="dataState.total.value"
      :page="dataState.page.value"
      :page-size="dataState.pageSize.value"
      :request-state="dataState.requestState.value"
      :mutating="dataState.mutating.value"
      :loading-error="dataState.loadingError.value"
      :mutating-error="dataState.mutatingError.value"
      :aggregate-result="dataState.aggregateResult.value"
      :selection-aggregate-result="dataState.selectionAggregateResult.value"
      :show-data-view-meta="props.showDataViewMeta !== false"
      :show-aggregate-summary="props.showAggregateSummary !== false"
      :show-selection-summary="props.showSelectionSummary !== false"
    />

    <div class="renderer-list-main renderer-list" :style="listStyle" v-bind="listPropsValue">
        <template v-if="showListItems">
          <div
            v-for="(row, index) in rows"
            :key="getItemKey(row, index)"
            class="renderer-list-cell"
            :style="itemGridStyle"
          >
            <div
              :class="['renderer-list-item-shell', `renderer-list-item-shell--${itemActionsPositionValue}`]"
              @click="handleItemClick(row, index, $event)"
            >
              <div
                v-if="showItemActionsLeft"
                :class="['renderer-list-item-actions', itemActionsClassValue]"
              >
                <RendererHostScope :row="row">
                  <SparkComponentRenderer :config="rawItemActionsToolbarConfig" />
                </RendererHostScope>
              </div>

              <div :class="itemClass" :style="itemStyle">
                <component :is="itemBodyWrapperTag" v-bind="itemBodyWrapperAttrs">
                  <div class="renderer-list-item-body" :style="itemContentGridStyle">
                    <RendererHostScope :row="row">
                      <div
                        v-for="(child, childIndex) in itemContentChildren"
                        :key="nodeId(child) ?? `r-list-item-child-${childIndex}`"
                        class="renderer-list-grid-item"
                        :style="getItemContentChildGridStyle(child)"
                      >
                        <SparkComponentRenderer :config="child" />
                      </div>
                    </RendererHostScope>
                    <slot
                      v-if="!itemContentChildren.length"
                      v-bind="getRowScope(row, index)"
                    />
                  </div>
                </component>
              </div>

              <div
                v-if="showItemActionsRight"
                :class="['renderer-list-item-actions', itemActionsClassValue]"
              >
                <RendererHostScope :row="row">
                  <SparkComponentRenderer :config="rawItemActionsToolbarConfig" />
                </RendererHostScope>
              </div>
            </div>
          </div>
        </template>
        <div v-else-if="emptyText" class="renderer-list-empty">{{ emptyText }}</div>
        <slot v-else v-bind="getDefaultScope()" />
      </div>
    <el-pagination
      v-if="showPagination"
      class="renderer-list-pagination"
      background
      layout="total, sizes, prev, pager, next, jumper"
      :total="dataState.total.value"
      :current-page="dataState.page.value"
      :page-size="dataState.pageSize.value"
      :page-sizes="[10, 20, 50, 100]"
      @current-change="handlePageChange"
      @size-change="handlePageSizeChange"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 列表容器，绑定 DataView.rows 以 CSS Grid 网格卡片布局渲染数据项，支持项选择和操作区域。
 * @category container
 * @binding dataViewKey-driven
 * @notes 使用结构化 `toolbar` / `actions` 区域声明工具栏与列表项操作
 */
import { computed, toRef, useSlots } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  DATA_SOURCE,
  MODULE_CONTEXT,
} from '../../../internal'
import type { RListProps } from './RendererList.props'
import { type SparkNode, type DataView, type DataRow, getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'
import type { RendererListApi } from './types'
import { useContainerToolbar, useContainerModuleContext } from '../../runtime/container-ui'
import { useContainerDataSource } from '../view-data-source'
import { useContainerGrid } from '../../runtime/container-layout'
import { createRowScope, createToolbarScope } from '../../support/scopeFactories'
import { createRendererListZeroCode } from './zero-code'
import RendererHostScope from '../../support/RendererHostScope.vue'
import DataViewMetaBar from '../DataViewMetaBar.vue'

const props = withDefaults(defineProps<RListProps>(), {
  type: 'r-list',
  columns: 1,
  minItemWidth: '',
  rowKey: 'id',
  emptyText: '暂无数据',
  itemClass: '',
  itemStyle: () => ({}),
  useCard: false,
  cardShadow: 'hover',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
  itemRowSpan: 1,
})
const listPropsValue = computed<Record<string, unknown>>(() => ({ ...(props.listProps ?? {}) }))
const slots = useSlots()
const hasDefaultSlot = slots['default'] !== undefined

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)
const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

const dataState = useContainerDataSource({
  externalDataSource: toRef(props, 'dataSource'),
  dataViewKey: toRef(props, 'dataViewKey'),
  sparkConsume,
  provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererList',
})
const { rows } = dataState
const showPagination = computed(() => props.showPagination !== false && dataState.total.value > 0)

const toolbarNode = computed(() => props.toolbar)
const actionsNode = computed(() => props.actions)
const mergedChildren = computed(() => getSparkNodeChildren(props.children))

const showListItems = computed(
  () => rows.value.length > 0 && (mergedChildren.value.length > 0 || hasDefaultSlot)
)

const itemActionConfigs = computed(() => getSparkNodeChildren(actionsNode.value?.children))
const itemActionsPositionValue = computed<'left' | 'right'>(() => {
  const position = actionsNode.value?.position
  return position === 'left' || position === 'right' ? position : 'right'
})
const itemActionsClassValue = computed(() => {
  const className = actionsNode.value?.class
  return typeof className === 'string' ? className : ''
})
const showItemActionsLeft = computed(
  () => itemActionConfigs.value.length > 0 && itemActionsPositionValue.value === 'left'
)
const showItemActionsRight = computed(
  () => itemActionConfigs.value.length > 0 && itemActionsPositionValue.value === 'right'
)

const itemBodyWrapperTag = computed(() => props.useCard ? 'el-card' : 'div')
const itemBodyWrapperAttrs = computed<Record<string, unknown>>(() => {
  if (!props.useCard) return {}
  return {
    shadow: props.cardShadow,
    class: 'renderer-list-card',
  }
})

const normalizedGridGap = computed(() => {
  const value = props.gridGap
  return typeof value === 'number' ? `${value}px` : value
})

const normalizedItemColSpan = computed(() => {
  if (typeof props.itemColSpan === 'number' && Number.isFinite(props.itemColSpan)) {
    return Math.max(1, Math.trunc(props.itemColSpan))
  }
  if ((props.columns ?? 1) > 1) {
    return Math.max(1, Math.floor((props.gridColumns ?? 24) / (props.columns ?? 1)))
  }
  return props.gridColumns ?? 24
})

const normalizedItemRowSpan = computed(() => {
  if (typeof props.itemRowSpan === 'number' && Number.isFinite(props.itemRowSpan)) {
    return Math.max(1, Math.trunc(props.itemRowSpan))
  }
  return 1
})

const listStyle = computed<Record<string, string>>(() => {
  return {
    display: 'grid',
    gap: normalizedGridGap.value ?? '0',
    gridTemplateColumns: `repeat(${Math.max(props.gridColumns ?? 24, 1)}, minmax(0, 1fr))`,
    gridAutoRows: props.gridAutoRows ?? 'minmax(32px, auto)',
    alignItems: 'start',
  }
})

const itemGridStyle = computed<Record<string, string | number>>(() => ({
  gridColumn: `span ${normalizedItemColSpan.value} / span ${normalizedItemColSpan.value}`,
  gridRow: `span ${normalizedItemRowSpan.value} / span ${normalizedItemRowSpan.value}`,
  minWidth: 0,
}))

const rawItemActionsToolbarConfig = computed<SparkNode>(() => ({
  type: 'r-toolbar',
  children: itemActionConfigs.value,
}))

const {
  visibleToolbarConfigs,
  toolbarPositionValue,
  toolbarClassValue,
  showToolbar,
} = useContainerToolbar({
  toolbarNode,
})

const {
  gridChildren: itemContentChildren,
  gridStyle: itemContentGridStyle,
  getChildGridStyle: getItemContentChildGridStyle,
} = useContainerGrid({
  children: () => mergedChildren.value,
  columns: () => props.gridColumns,
  gap: () => props.gridGap,
  autoRows: () => props.gridAutoRows,
})

// ── r-list 包装 API ──────────────────────────────────────────────────────

const {
  dispatch,
  listApi,
}: {
  dispatch: (eventName: string, ...args: unknown[]) => Promise<{ cancel: boolean }>
  listApi: RendererListApi
} = createRendererListZeroCode({
  props,
  resolvedView: dataState.resolvedView,
  rows,
})

registerApi(listApi)

function getItemKey(row: DataRow, index: number): string | number {
  const keyValue = row[props.rowKey]
  if (typeof keyValue === 'string' || typeof keyValue === 'number') return keyValue
  return `${props.rowKey}-${index}`
}

function scopeBase() {
  return {
    dataSource: dataState.resolvedView.value,
    moduleContext: moduleContext.value,
  }
}

function getRowScope(row: DataRow, index: number) {
  return createRowScope({
    ...scopeBase(),
    row,
    index,
  })
}

async function handleItemClick(row: DataRow, index: number, event: Event) {
  await dispatch('item-click', row, index, event)
}

function handlePageChange(page: number) {
  dataState.resolvedView.value?.setPage(page)
}

function handlePageSizeChange(size: number) {
  dataState.resolvedView.value?.setPageSize(size)
}

function getDefaultScope() {
  return createToolbarScope(scopeBase(), {
    rows: rows.value,
  })
}
</script>

<style scoped>
.renderer-list-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-list-layout--top,
.renderer-list-layout--bottom {
  flex-direction: column;
}

.renderer-list-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-list-layout--right {
  flex-direction: row-reverse;
}

.renderer-list-main {
  min-width: 0;
  flex: 1;
}

.renderer-list {
  width: 100%;
}

.renderer-list-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-list-layout--left .renderer-list-toolbar,
.renderer-list-layout--right .renderer-list-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-list-cell {
  min-width: 0;
}

.renderer-list-item-shell {
  display: flex;
  gap: 8px;
  min-width: 0;
  align-items: stretch;
}

.renderer-list-item-shell--right {
  flex-direction: row;
}

.renderer-list-item-shell--left {
  flex-direction: row-reverse;
}

.renderer-list-item-actions {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 8px;
  flex-shrink: 0;
}

.renderer-list-card {
  height: 100%;
}

.renderer-list-item-body {
  width: 100%;
}

.renderer-list-grid-item {
  min-width: 0;
}

.renderer-list-empty {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fafafa;
}

.renderer-list-pagination {
  justify-content: flex-end;
}
</style>
