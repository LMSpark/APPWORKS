<!--
@module @spark-appworks/spark-component:components/containers/data-views/RendererVirtualCard/RendererVirtualCard
职责：实现 RendererVirtualCard（r-virtual-card）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 table-level/data-view-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer virtual card 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div :class="['renderer-virtual-card-layout', `renderer-virtual-card-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-virtual-card-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="nodeId(action) ?? `r-virtual-card-toolbar-${index}`"
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

    <section class="renderer-virtual-card-main">
      <div v-if="props.showHeader !== false" class="renderer-virtual-card-head">
        <strong>虚拟卡片</strong>
        <span>
          滚动比例 {{ paging.progressText.value }}，记录
          {{ formatVirtualCardNumber(paging.firstItemNumber.value) }}-{{ formatVirtualCardNumber(paging.lastItemNumber.value) }}
        </span>
      </div>

      <div class="renderer-virtual-card-viewport-wrap">
        <div
          v-if="props.showHud !== false"
          class="renderer-virtual-card-hud"
          :class="{ active: paging.isDragging.value }"
        >
          {{ paging.isDragging.value ? '拖动中' : '当前页' }}:
          <strong>第 {{ formatVirtualCardNumber(paging.currentPage.value) }} 页开头</strong>
        </div>

        <div
          ref="viewport"
          class="renderer-virtual-card-viewport"
          tabindex="0"
          aria-label="SPARK 虚拟分页卡片"
          :style="viewportStyle"
          @scroll="onScroll"
          @wheel="onWheel"
        >
          <div class="renderer-virtual-card-spacer" :style="{ height: `${paging.scrollSpacerHeight.value}px` }"></div>

          <section
            v-for="page in paging.visiblePages.value"
            :key="page"
            class="renderer-virtual-card-page"
            :style="getPageStyle(page)"
          >
            <div class="renderer-virtual-card-page-inner">
              <div v-if="props.showPageMeta !== false" class="renderer-virtual-card-page-meta">
                <div class="renderer-virtual-card-page-start">
                  <span>页开头</span>
                  <strong>第 {{ formatVirtualCardNumber(page) }} 页开头</strong>
                </div>
                <span>{{ paging.pageStatus(page) }}</span>
              </div>

              <div class="renderer-virtual-card-grid" :style="cardGridStyle">
                <template v-if="paging.rowsForPage(page).length > 0">
                  <article
                    v-for="(row, index) in paging.rowsForPage(page)"
                    :key="getItemKey(row, index, page)"
                    :class="['renderer-virtual-card-item', props.itemClass]"
                    :style="props.itemStyle"
                    @click="handleItemClick(row, absoluteIndex(page, index), $event)"
                  >
                    <RendererHostScope :row="row">
                      <div v-if="itemContentChildren.length > 0" class="renderer-virtual-card-item-body" :style="itemContentGridStyle">
                        <div
                          v-for="(child, childIndex) in itemContentChildren"
                          :key="nodeId(child) ?? `r-virtual-card-child-${childIndex}`"
                          class="renderer-virtual-card-grid-item"
                          :style="getItemContentChildGridStyle(child)"
                        >
                          <SparkComponentRenderer :config="child" />
                        </div>
                      </div>
                      <slot v-else v-bind="getRowScope(row, absoluteIndex(page, index))">
                        <div class="renderer-virtual-card-fallback">
                          <span class="renderer-virtual-card-index">#{{ formatVirtualCardNumber(absoluteIndex(page, index) + 1) }}</span>
                          <strong>{{ fallbackTitle(row) }}</strong>
                          <p>{{ fallbackNote(row) }}</p>
                        </div>
                      </slot>
                    </RendererHostScope>
                  </article>
                </template>

                <template v-else-if="paging.isPagePending(page) || dataState.resolvedView.value">
                  <article
                    v-for="slot in skeletonCount"
                    :key="`pending-${page}-${slot}`"
                    class="renderer-virtual-card-item renderer-virtual-card-item--pending"
                  >
                    <div class="renderer-virtual-card-skeleton-line medium"></div>
                    <p>第 {{ formatVirtualCardNumber(page) }} 页数据会在停稳后填充。</p>
                    <div class="renderer-virtual-card-skeleton-line short"></div>
                  </article>
                </template>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div v-if="showEmpty" class="renderer-virtual-card-empty">{{ props.emptyText }}</div>
      <div v-if="paging.notice.value" class="renderer-virtual-card-notice">{{ paging.notice.value }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 虚拟分页卡片容器，绑定 DataView.rows 并用滚动比例定位远端分页，拖动停稳后才请求目标页。
 * @category container
 * @binding dataViewKey-driven
 * @notes dataViewKey 使用 table@viewId；children 在每张卡片的 DATA_ROW 作用域下渲染。
 */
import { computed, ref, toRef } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  DATA_SOURCE,
  MODULE_CONTEXT,
} from '../../../internal'
import { type DataRow, type DataView, getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'
import type { RVirtualCardProps } from './RendererVirtualCard.props'
import { useContainerDataSource } from '../view-data-source'
import { useContainerToolbar, useContainerModuleContext } from '../../runtime/container-ui'
import { useContainerGrid } from '../../runtime/container-layout'
import { createRowScope, createToolbarScope } from '../../support/scopeFactories'
import RendererHostScope from '../../support/RendererHostScope.vue'
import DataViewMetaBar from '../DataViewMetaBar.vue'
import { createRendererVirtualCardZeroCode } from './zero-code'
import { formatVirtualCardNumber, useVirtualCardPaging } from './virtual-card-paging'

const props = withDefaults(defineProps<RVirtualCardProps>(), {
  type: 'r-virtual-card',
  rowKey: 'id',
  emptyText: '暂无数据',
  pageHeight: 540,
  mobilePageHeight: 850,
  mobileBreakpoint: 700,
  viewportHeight: 'min(68vh, 660px)',
  minViewportHeight: '420px',
  overscanPages: 1,
  prefetchPages: 1,
  maxCachedPages: 24,
  columns: 2,
  mobileColumns: 1,
  settleDelay: 220,
  wheelStepPx: 180,
  maxWheelJumpPages: 40,
  itemClass: '',
  itemStyle: () => ({}),
  gridColumns: 24,
  gridGap: 12,
  gridAutoRows: 'minmax(32px, auto)',
})

const viewport = ref<HTMLDivElement | null>(null)

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)
const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

const dataState = useContainerDataSource({
  externalDataSource: toRef(props, 'dataSource'),
  dataViewKey: toRef(props, 'dataViewKey'),
  sparkConsume,
  provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererVirtualCard',
})

const toolbarNode = computed(() => props.toolbar)
const mergedChildren = computed(() => getSparkNodeChildren(props.children))

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

const viewportExpose = {
  setScrollTop(value: number): void {
    if (viewport.value) viewport.value.scrollTop = value
  },
  viewportHeight(): number {
    return viewport.value?.clientHeight || 0
  },
  viewportScrollTop(): number {
    return viewport.value?.scrollTop || 0
  },
}

const paging = useVirtualCardPaging({
  viewportRef: computed(() => viewportExpose),
  resolvedView: dataState.resolvedView,
  rows: dataState.rows,
  total: dataState.total,
  page: dataState.page,
  pageSize: dataState.pageSize,
  requestState: dataState.requestState,
  pageHeight: () => props.pageHeight,
  mobilePageHeight: () => props.mobilePageHeight,
  mobileBreakpoint: () => props.mobileBreakpoint,
  overscanPages: () => props.overscanPages,
  prefetchPages: () => props.prefetchPages,
  maxCachedPages: () => props.maxCachedPages,
  settleDelay: () => props.settleDelay,
  wheelStepPx: () => props.wheelStepPx,
  maxWheelJumpPages: () => props.maxWheelJumpPages,
  dispatchPageChange: async (page: number) => {
    await dispatch('page-change', page)
  },
})

const {
  dispatch,
  virtualCardApi,
} = createRendererVirtualCardZeroCode({
  props,
  resolvedView: dataState.resolvedView,
  rows: dataState.rows,
  cachedPages: paging.cachedPages,
  pendingPages: paging.pendingPageNumbers,
  visiblePages: paging.visiblePages,
  currentPage: paging.currentPage,
  totalPages: paging.totalPages,
  progressText: paging.progressText,
  loadPolicyText: paging.loadPolicyText,
  wheelStatusText: paging.wheelStatusText,
  scrollToPage: async (page: number) => {
    await paging.scrollToPage(page)
  },
  clearCache: paging.clearCache,
})

registerApi(virtualCardApi)

const viewportStyle = computed<Record<string, string>>(() => ({
  height: props.viewportHeight,
  minHeight: props.minViewportHeight,
}))

const effectiveColumns = computed(() => {
  const mobile = typeof window !== 'undefined' && window.innerWidth <= props.mobileBreakpoint
  const columns = mobile ? props.mobileColumns : props.columns
  return Math.max(1, Math.trunc(columns))
})

const skeletonCount = computed(() => Math.max(1, dataState.pageSize.value || 1))
const cardGridStyle = computed<Record<string, string>>(() => {
  const rows = Math.max(1, Math.ceil(skeletonCount.value / effectiveColumns.value))
  return {
    display: 'grid',
    gap: normalizeGap(props.gridGap),
    gridTemplateColumns: `repeat(${effectiveColumns.value}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    minHeight: '0',
  }
})
const showEmpty = computed(() =>
  dataState.resolvedView.value !== null
  && paging.totalItems.value === 0
  && dataState.rows.value.length === 0
)

function normalizeGap(value: number | string | undefined): string {
  if (typeof value === 'number') return `${value}px`
  return value ?? '12px'
}

function getPageStyle(page: number): Record<string, string> {
  return {
    height: `${paging.pageHeight.value}px`,
    transform: `translateY(${(page - 1) * paging.pageHeight.value}px)`,
  }
}

function getItemKey(row: DataRow, index: number, page: number): string | number {
  const keyValue = row[props.rowKey]
  if (typeof keyValue === 'string' || typeof keyValue === 'number') return keyValue
  return `${page}-${index}`
}

function absoluteIndex(page: number, index: number): number {
  return (page - 1) * dataState.pageSize.value + index
}

function scopeBase() {
  return {
    dataSource: dataState.resolvedView.value,
    permissionSnapshot: dataState.permissionSnapshot.value,
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

function fallbackTitle(row: DataRow): string {
  const title = row['title'] ?? row['name'] ?? row[props.rowKey]
  return String(title ?? '未命名记录')
}

function fallbackNote(row: DataRow): string {
  const keys = Object.keys(row).filter(key => key !== props.rowKey)
  if (keys.length === 0) return ''
  return keys.slice(0, 3).map(key => `${key}: ${String(row[key])}`).join(' / ')
}

async function handleItemClick(row: DataRow, index: number, event: Event) {
  await dispatch('item-click', row, index, event)
}

function onScroll(): void {
  paging.handleViewportScroll(viewportExpose.viewportScrollTop())
}

function onWheel(event: WheelEvent): void {
  if (event.ctrlKey || event.deltaY === 0) return
  event.preventDefault()
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? paging.pageHeight.value : 1
  paging.handleWheelPage({
    deltaY: event.deltaY * unit,
  })
}

function getDefaultScope() {
  return createToolbarScope(scopeBase(), {
    rows: dataState.rows.value,
  })
}

defineExpose({
  ...virtualCardApi,
  getDefaultScope,
})
</script>

<style scoped>
.renderer-virtual-card-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-virtual-card-layout--top,
.renderer-virtual-card-layout--bottom {
  flex-direction: column;
}

.renderer-virtual-card-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-virtual-card-layout--right {
  flex-direction: row-reverse;
}

.renderer-virtual-card-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-virtual-card-layout--left .renderer-virtual-card-toolbar,
.renderer-virtual-card-layout--right .renderer-virtual-card-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-virtual-card-main {
  min-width: 0;
  flex: 1;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.renderer-virtual-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #dcdfe6;
  background: #f5f7fa;
}

.renderer-virtual-card-head strong {
  font-size: 14px;
}

.renderer-virtual-card-head span {
  color: #606266;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.renderer-virtual-card-viewport-wrap {
  position: relative;
}

.renderer-virtual-card-viewport {
  position: relative;
  overflow: auto;
  background: #fff;
  scrollbar-gutter: stable;
}

.renderer-virtual-card-hud {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  width: max-content;
  max-width: calc(100% - 28px);
  border: 1px solid rgba(64, 158, 255, 0.18);
  border-radius: 999px;
  padding: 8px 14px;
  color: #606266;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 30px rgba(31, 45, 61, 0.12);
  font-size: 13px;
  font-weight: 700;
  pointer-events: none;
}

.renderer-virtual-card-hud strong {
  color: #409eff;
  font-variant-numeric: tabular-nums;
}

.renderer-virtual-card-hud.active {
  color: #fff;
  border-color: #409eff;
  background: #409eff;
}

.renderer-virtual-card-hud.active strong {
  color: #fff;
}

.renderer-virtual-card-spacer {
  width: 1px;
  opacity: 0;
}

.renderer-virtual-card-page {
  position: absolute;
  top: 0;
  left: 0;
  right: 14px;
  padding: 16px;
  will-change: transform;
}

.renderer-virtual-card-page-inner {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  height: 100%;
  border-top: 1px solid #e4e7ed;
  padding-top: 14px;
}

.renderer-virtual-card-page-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #606266;
  font-size: 13px;
}

.renderer-virtual-card-page-start {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.renderer-virtual-card-page-start span {
  color: #337ecc;
  font-size: 12px;
  font-weight: 800;
}

.renderer-virtual-card-page-start strong {
  color: #303133;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.renderer-virtual-card-item {
  display: grid;
  min-width: 0;
  min-height: 0;
  border: 1px solid #e4e7ed;
  border-left: 4px solid #409eff;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(31, 45, 61, 0.06);
  cursor: default;
}

.renderer-virtual-card-item:nth-child(3n + 2) {
  border-left-color: #67c23a;
}

.renderer-virtual-card-item:nth-child(3n) {
  border-left-color: #e6a23c;
}

.renderer-virtual-card-item-body {
  width: 100%;
}

.renderer-virtual-card-grid-item {
  min-width: 0;
}

.renderer-virtual-card-fallback {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.renderer-virtual-card-fallback strong {
  overflow: hidden;
  color: #303133;
  font-size: 16px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.renderer-virtual-card-fallback p {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #606266;
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.renderer-virtual-card-index {
  color: #337ecc;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.renderer-virtual-card-item--pending {
  align-content: space-between;
  color: #909399;
  border-left-color: #c0c4cc;
}

.renderer-virtual-card-item--pending p {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}

.renderer-virtual-card-skeleton-line {
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(90deg, #edf1f6 0%, #dfe7f1 45%, #edf1f6 100%);
  background-size: 220% 100%;
  animation: renderer-virtual-card-shimmer 1.2s linear infinite;
}

.renderer-virtual-card-skeleton-line.short {
  width: 42%;
}

.renderer-virtual-card-skeleton-line.medium {
  width: 70%;
}

.renderer-virtual-card-empty {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  border-top: 1px dashed #dcdfe6;
  background: #fafafa;
}

.renderer-virtual-card-notice {
  padding: 10px 14px;
  color: #f56c6c;
  font-size: 13px;
  line-height: 1.45;
}

@keyframes renderer-virtual-card-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .renderer-virtual-card-skeleton-line {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
</style>
