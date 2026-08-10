/**
 * @module @spark-appworks/spark-component:components/containers/runtime/container-layout
 * 职责：提供 container layout 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */

import { computed, toValue } from 'vue'
import type { CSSProperties, ComputedRef, MaybeRefOrGetter } from 'vue'

import { type SparkNode, getSparkNodeChildren, nodeInputProp } from '@spark-appworks/spark-data'

// ============================================================
// § 布局常量
// ============================================================

/** CSS Grid 默认列数（总分割数）。 */
const DEFAULT_GRID_COLUMNS = 24
/** 网格间距默认值。 */
const DEFAULT_GRID_GAP = '0px'
/** 行高模板：最小 32px，超大内容自动伸展。 */
const DEFAULT_AUTO_ROWS = 'minmax(32px, auto)'
/** auto-fit 最多生成的网格轨道数（防止过度细分）。 */
const AUTO_FIT_MAX_TRACKS = 4
/** 列跨度属性名列表（优先级递减）。 */
const DEFAULT_COL_SPAN_KEYS = ['colSpan', 'gridColSpan', 'span'] as const
/** 行跨度属性名列表。 */
const DEFAULT_ROW_SPAN_KEYS = ['rowSpan', 'gridRowSpan'] as const

// ============================================================
// § 内部工具函数
// ============================================================

/**
 * 将值转换为有限整数。
 * - number：截断为整数；string：parseInt；其他：undefined。
 */
function toFiniteInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * 将值转换为非空字符串，空/null/非字符串时返回 fallback。
 */
function toNonEmptyString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

/**
 * 将值转换为正整数（最小值 1）。
 */
function toPositiveInteger(value: unknown, fallback: number): number {
  return Math.max(1, toFiniteInteger(value) ?? fallback)
}

/**
 * 从节点获取首个非 undefined 的属性值（按 keys 优先级递减查询）。
 */
function getFirstNodeInput(child: SparkNode, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = nodeInputProp(child, key)
    if (value !== undefined) return value
  }
  return undefined
}

/**
 * 从节点获取跨度值（列或行），并标准化为正整数。
 */
function getSpanValue(child: SparkNode, keys: readonly string[], fallback: number): number {
  return normalizeSpan(getFirstNodeInput(child, keys), fallback)
}

/**
 * 检查节点是否显式声明了跨度属性。
 */
function hasNodeInputOverride(child: SparkNode, keys: readonly string[]): boolean {
  return getFirstNodeInput(child, keys) !== undefined
}

/**
 * 在 auto-fit 模式下，将原始跨度缩放为适合目标轨道数的跨度。
 *
 * 算法：目标轨道 = min(元素数, AUTO_FIT_MAX_TRACKS)，基础跨度 = 列数 / 目标轨道，
 * 输出 = round(原始跨度 / 基础跨度)。
 */
function normalizeAutoFitSpan(rawSpan: number, totalColumns: number, childCount: number): number {
  const safeColumns = Math.max(1, Math.floor(totalColumns))
  const safeChildCount = Math.max(1, Math.floor(childCount))
  const targetColumns = Math.min(safeChildCount, AUTO_FIT_MAX_TRACKS)
  const baseSpan = Math.max(1, Math.floor(safeColumns / targetColumns))
  return Math.max(1, Math.round(rawSpan / baseSpan))
}

/**
 * 计算 auto-fit 模式下的实际轨道数（上限 AUTO_FIT_MAX_TRACKS）。
 */
function getAutoFitTrackCount(childCount: number): number {
  return Math.max(1, Math.min(Math.floor(childCount), AUTO_FIT_MAX_TRACKS))
}

/**
 * 将 UseContainerGridOptions 解析为运行时布局参数快照。
 */
function resolveGridOptions(options: UseContainerGridOptions) {
  const children = toValue(options.children)
  const columns = toPositiveInteger(toValue(options.columns ?? DEFAULT_GRID_COLUMNS), DEFAULT_GRID_COLUMNS)
  const autoFitMinWidth = toNonEmptyString(toValue(options.autoFitMinWidth ?? ''))
  const hasAutoFit = autoFitMinWidth.length > 0
  const defaultColSpanValue = toValue(options.defaultColSpan)
  const defaultColSpan = defaultColSpanValue ?? DEFAULT_GRID_COLUMNS
  return {
    children,
    columns,
    autoFitMinWidth,
    hasAutoFit,
    defaultColSpanValue,
    defaultColSpan,
    gridTemplateColumns: hasAutoFit
      ? `repeat(auto-fit, minmax(${autoFitMinWidth}, 1fr))`
      : `repeat(${columns}, minmax(0, 1fr))`,
  }
}

/**
 * 计算最后一行元素的最终列跨度（用于 autoFillLastRow 功能）。
 *
 * - auto-fit 模式：按轨道数自适应
 * - 固定列数模式：不满行时均摊剩余列数
 */
function resolveLastRowColSpan(params: {
  enabled: boolean | undefined
  index: number | undefined
  childrenLength: number
  columns: number
  colSpan: number
  hasAutoFit: boolean
  hasExplicitColSpan: boolean
}): number {
  const { enabled, index, childrenLength, columns, colSpan, hasAutoFit, hasExplicitColSpan } = params
  if (!enabled || index === undefined) return colSpan

  if (hasAutoFit) {
    const trackCount = getAutoFitTrackCount(childrenLength)
    const baseSpan = hasExplicitColSpan ? Math.max(1, colSpan) : 1
    const itemsPerRow = Math.max(1, Math.floor(trackCount / baseSpan))
    const remainder = childrenLength % itemsPerRow
    const lastRowItemCount = remainder === 0 ? itemsPerRow : remainder
    const lastRowStartIndex = childrenLength - lastRowItemCount
    if (index < lastRowStartIndex) return colSpan
    if (lastRowItemCount === 1) return trackCount
    if (lastRowItemCount === 2 && trackCount % 2 === 0) return Math.max(baseSpan, trackCount / 2)
    return hasExplicitColSpan ? colSpan : 1
  }

  const itemsPerRow = Math.max(1, Math.floor(columns / colSpan))
  const lastRowStartIndex = Math.floor(childrenLength / itemsPerRow) * itemsPerRow
  if (index < lastRowStartIndex) return colSpan
  const lastRowItemCount = childrenLength - lastRowStartIndex
  return lastRowItemCount > 0 && lastRowItemCount < itemsPerRow
    ? Math.ceil(columns / lastRowItemCount)
    : colSpan
}

// ============================================================
// § 公共布局工具
// ============================================================

/**
 * 标准化 CSS gap 值。
 * - number → `${n}px`；非空 string → 保留；其他 → '0px'。
 */
export function normalizeGridGap(value: unknown): string {
  if (typeof value === 'number') return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return DEFAULT_GRID_GAP
}

/**
 * 标准化跨度为正整数（最小值 1）。
 */
export function normalizeSpan(value: unknown, fallback: number): number {
  return toPositiveInteger(value, fallback)
}

// ============================================================
// § useContainerGrid
// ============================================================

/** `useContainerGrid` 输入选项。 */
export type UseContainerGridOptions = {
  /** 子节点数组（响应式 getter 或 ref）。 */
  children: MaybeRefOrGetter<SparkNode[]>
  /** 网格列数（默认 24）。 */
  columns?: MaybeRefOrGetter<number>
  /** 网格间距（默认 0px，可为数字/CSS 字符串）。 */
  gap?: MaybeRefOrGetter<number | string>
  /** 行高模板（默认 minmax(32px, auto)）。 */
  autoRows?: MaybeRefOrGetter<string>
  /** auto-fit 最小宽度（如 '200px'），设置则启用 auto-fit 模式。 */
  autoFitMinWidth?: MaybeRefOrGetter<string>
  /** 默认列跨度（子节点未指定时使用）。 */
  defaultColSpan?: MaybeRefOrGetter<number>
  /** 最后一行不满时自动拉宽所有子元素以填满行宽。 */
  autoFillLastRow?: boolean}

/** `useContainerGrid` 返回状态。 */
export type ContainerGridState = {
  /** 网格容器的 CSS 样式对象（display: grid + gridTemplateColumns 等）。 */
  gridStyle: ComputedRef<CSSProperties>
  /** 计算子元素的 CSS 样式（传入节点和索引）。 */
  getChildGridStyle: (child: SparkNode, index?: number) => CSSProperties
  /** 过滤后的子节点数组（供模板 v-for 遍历）。 */
  gridChildren: ComputedRef<SparkNode[]>}

/**
 * 将容器 children + 布局配置投影为 CSS Grid 样式。
 *
 * 工作流程：
 * 1. `resolveGridOptions` 将响应式选项解析为快照（computed 缓存）
 * 2. `gridStyle` 构建 display:grid + gridTemplateColumns + gap + autoRows
 * 3. `getChildGridStyle` 为每个子节点计算 gridColumn / gridRow span
 * 4. 可选 `autoFillLastRow`：最后一行不满时均摊列宽
 */
export function useContainerGrid(options: UseContainerGridOptions): ContainerGridState {
  const resolvedGridOptions = computed(() => resolveGridOptions(options))

  const gridStyle = computed<CSSProperties>(() => {
    const resolved = resolvedGridOptions.value
    return {
      display: 'grid',
      gridTemplateColumns: resolved.gridTemplateColumns,
      gap: normalizeGridGap(toValue(options.gap ?? DEFAULT_GRID_GAP)),
      gridAutoRows: toValue(options.autoRows ?? DEFAULT_AUTO_ROWS) || DEFAULT_AUTO_ROWS,
      alignItems: 'start',
    }
  })

  function getChildGridStyle(child: SparkNode, index?: number): CSSProperties {
    const resolved = resolvedGridOptions.value
    const rawColSpan = getSpanValue(child, DEFAULT_COL_SPAN_KEYS, resolved.defaultColSpan)
    const hasExplicitColSpan =
      hasNodeInputOverride(child, DEFAULT_COL_SPAN_KEYS) || resolved.defaultColSpanValue !== undefined
    const colSpan = resolved.hasAutoFit
      ? normalizeAutoFitSpan(rawColSpan, resolved.columns, resolved.children.length)
      : rawColSpan
    const rowSpan = getSpanValue(child, DEFAULT_ROW_SPAN_KEYS, 1)
    const finalColSpan = resolveLastRowColSpan({
      enabled: options.autoFillLastRow,
      index,
      childrenLength: resolved.children.length,
      columns: resolved.columns,
      colSpan,
      hasAutoFit: resolved.hasAutoFit,
      hasExplicitColSpan,
    })

    const childGridStyle: CSSProperties = {
      gridRow: `span ${rowSpan} / span ${rowSpan}`,
      minWidth: 0,
    }

    if (!resolved.hasAutoFit || hasExplicitColSpan || finalColSpan > 1) {
      childGridStyle.gridColumn = `span ${finalColSpan} / span ${finalColSpan}`
    }

    return childGridStyle
  }

  return {
    gridStyle,
    getChildGridStyle,
    gridChildren: computed(() => resolvedGridOptions.value.children),
  }
}

// ============================================================
// § useCompositeItemGrid
// ============================================================

/** Use Composite Item Grid Options 的调用配置。 */
type UseCompositeItemGridOptions = {
    /** 子节点集合。 */
children?: () => SparkNode['children'] | undefined
  /** 复合容器内容区 class；空值会被标准化为空字符串。 */
  bodyClass?: () => string | null | undefined
  /** 复合容器内容区列数；字符串/数字都会被标准化为正整数。 */
  gridColumns?: () => string | number | null | undefined
  /** 复合容器内容区自动行高；仅接受有效字符串。 */
  gridAutoRows?: () => string | null | undefined
  /** 复合容器内容区间距；数字转 px，字符串按 CSS 原样透传。 */
  gridGap?: () => string | number | null | undefined}

/** `useCompositeItemGrid` 返回状态。 */
export type CompositeItemGridState = {
    /** content Children 字段。 */
contentChildren: ComputedRef<SparkNode[]>
    /** content Body Class 字段。 */
contentBodyClass: ComputedRef<string>
    /** content Grid Style 字段。 */
contentGridStyle: ComputedRef<CSSProperties>
    /** get Content Child Grid Style 回调。 */
getContentChildGridStyle: (child: SparkNode, index?: number) => CSSProperties}

/**
 * 复合容器（Tabs / Collapse 等）内容区布局适配。
 *
 * 对 `useContainerGrid` 的薄包装：
 * - 规范化 children（getSparkNodeChildren）
 * - 规范化 bodyClass（非空字符串）
 * - 代理 columns / gap / autoRows 到底层 useContainerGrid
 */
export function useCompositeItemGrid(options: UseCompositeItemGridOptions): CompositeItemGridState {
  const contentChildren = computed<SparkNode[]>(() => {
    const children = options.children?.()
    return getSparkNodeChildren(children)
  })

  const contentBodyClass = computed(() => {
    const bodyClass = options.bodyClass?.()
    return toNonEmptyString(bodyClass)
  })

  const {
    gridStyle: contentGridStyle,
    getChildGridStyle: getContentChildGridStyle,
  } = useContainerGrid({
    children: () => contentChildren.value,
    columns: () => toFiniteInteger(options.gridColumns?.()) ?? DEFAULT_GRID_COLUMNS,
    gap: () => {
      const value = options.gridGap?.()
      return typeof value === 'number' || typeof value === 'string' ? value : 0
    },
    autoRows: () => {
      const value = options.gridAutoRows?.()
      return typeof value === 'string' ? value : ''
    },
  })

  return {
    contentChildren,
    contentBodyClass,
    contentGridStyle,
    getContentChildGridStyle,
  }
}
