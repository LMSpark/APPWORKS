<!--
@module @spark-appworks/spark-component:components/containers/zones/RendererFilter
职责：实现 RendererFilter（r-filter）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/zone-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer filter 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div v-if="isPanelMode && standaloneChildren.length > 0" class="renderer-table-filters">
    <div v-if="props.collapsible" class="renderer-table-filters__header">
      <div class="renderer-table-filters__heading">
        <span class="renderer-table-filters__title">筛选条件</span>
        <el-tag
          v-if="activeFilterCount > 0"
          size="small"
          type="info"
          class="renderer-table-filters__count"
        >{{ activeFilterCount }} 项筛选</el-tag>
      </div>
      <button
        type="button"
        class="renderer-table-filters__toggle"
        :class="{ 'is-collapsed': filtersCollapsed }"
        :aria-expanded="!filtersCollapsed"
        @click="handleToggleCollapsed"
      >
        <span class="renderer-table-filters__toggle-icon" aria-hidden="true">></span>
        <span class="renderer-table-filters__toggle-text">{{ filtersCollapsed ? '展开筛选' : '收起筛选' }}</span>
      </button>
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

    <div v-show="!filtersCollapsed" class="renderer-table-filters__content">
      <div class="renderer-table-filters__body">
        <SparkComponentRenderer :config="fieldScopeConfig" />
      </div>
      <div class="renderer-table-filters__actions" :style="resolvedActionsStyle">
        <el-button type="primary" size="small" @click="handleSearch">查询</el-button>
        <el-button size="small" @click="handleReset">重置</el-button>
        <el-tag
          v-if="activeFilterCount > 0 && !props.collapsible"
          size="small"
          type="info"
          class="renderer-table-filters__count"
        >{{ activeFilterCount }} 项筛选</el-tag>
      </div>
    </div>
  </div>

  <div v-else-if="standaloneChildren.length > 0" class="renderer-filter">
    <SparkComponentRenderer
      v-for="(child, i) in standaloneChildren"
      :key="nodeId(child) ?? `r-filter-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 筛选区组件，自治绑定 DataView。独立使用时仅渲染 wrapper 子节点；
 * 当 children 中含有带 `field` 的过滤项节点时进入面板模式，自维护 filterModel
 * 与 DataView.setFilter 同步，无需父容器注入桥接字段。
 */
import { computed, ref, toRef, watch } from 'vue'
import { SUBTREE_FIELD_POLICY } from '../../../permission'
import {
  DATA_SOURCE,
  SparkComponentRenderer,
  useSparkPageComponent,
} from '../../internal'
import { type SparkNode, getSparkNodeChildren, nodeInputProp, nodeId } from '@spark-appworks/spark-data'
import { useContainerDataSource } from '../data-views/view-data-source'
import DataViewMetaBar from '../data-views/DataViewMetaBar.vue'
import { useFilterPanel } from '../runtime/container-filter'
import type { RFilterProps as Props } from './RendererFilter.types'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-filter',
})

const { sparkConsume, sparkProvide, logger } = useSparkPageComponent(props)

// ── 子节点归一化 ─────────────────────────────────────────────────────────
const standaloneChildren = computed(() => getSparkNodeChildren(props.children))

/**
 * 是否进入面板模式：children 中至少有一个带 `field` 的节点视为过滤项。
 * 仅承载 wrapper 子节点（无 field）的情况退回 standalone 渲染。
 */
const isPanelMode = computed(() => {
  return standaloneChildren.value.some((node) => {
    const field = nodeInputProp(node, 'field')
    return typeof field === 'string' && field.trim().length > 0
  })
})

// ── DataView 自治解析 ───────────────────────────────────────────────────
const inheritedDataSource = sparkConsume(DATA_SOURCE)

const dataState = useContainerDataSource({
  dataViewKey: toRef(props, 'dataViewKey'),
  sparkConsume,
  inheritedDataSource,
  skipEffects: true,
})
// 面板模式下必须能解析到 DataView，否则 fail-fast。
watch(
  [isPanelMode, dataState.resolvedView],
  ([panelMode, view]) => {
    if (panelMode && !view) {
      throw new Error(
        'RendererFilter: 面板模式必须能解析到 DataView，请通过 dataViewKey 显式绑定，'
        + '或确保父容器通过 DATA_SOURCE 能力向下注入。',
      )
    }
  },
  { immediate: true },
)

// ── 过滤状态自治（仅面板模式下生效） ────────────────────────────────────
const {
  filterModel,
  activeFilterCount,
  searchFilters,
  resetFilters,
} = useFilterPanel({
  filterChildren: () => isPanelMode.value ? standaloneChildren.value : [],
  dataView: dataState.resolvedView,
  logger,
})

// ── 折叠状态自治 ────────────────────────────────────────────────────────
const filtersCollapsed = ref<boolean>(props.defaultCollapsed ?? false)
watch(() => props.defaultCollapsed, (next) => {
  filtersCollapsed.value = next ?? false
})
function toggleFiltersCollapsed() {
  if (props.collapsible !== true) return
  filtersCollapsed.value = !filtersCollapsed.value
}

// ── 渲染态计算 ──────────────────────────────────────────────────────────
const resolvedGridColumns = computed(() => props.gridColumns ?? 24)
const resolvedGridGap = computed(() => props.gridGap ?? 12)
const resolvedGridAutoRows = computed(() => props.gridAutoRows ?? 'minmax(32px, auto)')

function isWideFilterConfig(config: SparkNode): boolean {
  const filterMode = nodeInputProp(config, 'filterMode')
  if (filterMode === 'range') return true
  return config.type === 'r-multi-select' || config.type === 'r-date'
}

function getSmartAutoFitMinWidth(configs: SparkNode[]): string {
  const count = configs.length
  const hasWideField = configs.some(isWideFilterConfig)

  if (count <= 1) return hasWideField ? '360px' : '320px'
  if (count === 2) return hasWideField ? '300px' : '260px'
  if (count === 3) return hasWideField ? '240px' : '220px'
  if (count === 4) return hasWideField ? '220px' : '200px'
  return hasWideField ? '210px' : '190px'
}

const resolvedAutoFitMinWidth = computed(() => {
  const raw = (props.autoFitMinWidth ?? '').trim()
  if (raw.length > 0) return raw
  return getSmartAutoFitMinWidth(standaloneChildren.value)
})
const resolvedItemSpan = computed(() => props.itemSpan ?? 1)
const resolvedActionSpan = computed(() => {
  const fallback = resolvedItemSpan.value
  const raw = props.actionSpan ?? fallback
  const normalized = Number.isFinite(raw) ? Number(raw) : fallback
  const min = Math.max(1, Math.floor(normalized))
  return Math.min(min, Math.max(1, Math.floor(resolvedGridColumns.value)))
})

const resolvedActionsStyle = computed<Record<string, string>>(() => {
  const minWidthRaw = resolvedAutoFitMinWidth.value
  const gap = typeof resolvedGridGap.value === 'number' ? `${resolvedGridGap.value}px` : `${resolvedGridGap.value}`

  if (minWidthRaw.length > 0) {
    return {
      '--renderer-filter-action-span': String(resolvedActionSpan.value),
      '--renderer-filter-min-width': minWidthRaw,
      '--renderer-filter-gap': gap,
    }
  }

  const widthPercent = Math.max(0, Math.min(100, (resolvedActionSpan.value / Math.max(1, resolvedGridColumns.value)) * 100))
  return {
    width: `${widthPercent}%`,
  }
})

const fieldScopeConfig = computed<SparkNode>(() => ({
  type: 'r-field-scope',
  props: {
    model: filterModel,
    children: standaloneChildren.value,
    gridColumns: resolvedGridColumns.value,
    gridGap: resolvedGridGap.value,
    gridAutoRows: resolvedGridAutoRows.value,
    autoFitMinWidth: resolvedAutoFitMinWidth.value,
    defaultColSpan: resolvedItemSpan.value,
    autoFillLastRow: true,
    labelPosition: 'left',
    labelWidth: '80px',
    compact: true,
  },
}))

// r-filter 下的组件是筛选条件输入，需要始终可写；局部字段策略不改变页面权限模式。
sparkProvide(SUBTREE_FIELD_POLICY, 'unrestricted')

async function handleSearch(): Promise<void> {
  await searchFilters()
}

async function handleReset(): Promise<void> {
  await resetFilters()
}

function handleToggleCollapsed() {
  toggleFiltersCollapsed()
}

// 面向脚本/测试暴露过滤模型与活跃数，便于读取/赋值或断言。
defineExpose({
  filterModel,
  activeFilterCount,
})
</script>

<style scoped>
.renderer-filter {
  width: 100%;
}

.renderer-table-filters {
  width: 100%;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 4px;
  padding: 12px 16px;
}

.renderer-table-filters__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.renderer-table-filters__heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.renderer-table-filters__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}

.renderer-table-filters__toggle {
  border: 1px solid var(--el-border-color, #dcdfe6);
  background: var(--el-bg-color, #ffffff);
  color: var(--el-text-color-regular, #606266);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  line-height: 1.3;
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}

.renderer-table-filters__toggle:hover {
  border-color: var(--el-color-primary-light-5, #79bbff);
  color: var(--el-color-primary, #409eff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.renderer-table-filters__toggle:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5, #79bbff);
  outline-offset: 1px;
}

.renderer-table-filters__toggle-icon {
  display: inline-block;
  width: 10px;
  transform: rotate(90deg);
  transform-origin: 50% 50%;
  transition: transform 0.2s ease;
}

.renderer-table-filters__toggle.is-collapsed .renderer-table-filters__toggle-icon {
  transform: rotate(0deg);
}

.renderer-table-filters__toggle-text {
  font-size: 12px;
  font-weight: 500;
}

.renderer-table-filters__body {
  flex: 1;
  min-width: 0;
}

.renderer-table-filters__content {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.renderer-table-filters__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  margin-left: auto;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-extra-light, #f0f2f5);
  inline-size: calc(
    var(--renderer-filter-action-span, 1) * var(--renderer-filter-min-width, 220px)
    + (var(--renderer-filter-action-span, 1) - 1) * var(--renderer-filter-gap, 12px)
  );
  max-inline-size: 100%;
}

.renderer-table-filters__count {
  margin-left: 4px;
}
</style>
