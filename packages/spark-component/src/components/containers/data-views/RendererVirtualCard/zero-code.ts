/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererVirtualCard/zero-code
 * 职责：封装 RendererVirtualCard（r-virtual-card）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 table-level/data-view-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer virtual card 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import { isDataRow, type DataRow, type DataView } from '@spark-appworks/spark-data'
import { createContainerCrudContext } from '../zero-code-shared.js'
import type { ValueRef } from '../../../shared-types.js'
import type { RendererVirtualCardApi } from './types.js'

/** 创建 r-virtual-card zero-code API 和事件派发桥接所需的运行时输入。 */
type RendererVirtualCardZeroCodeOptions = {
  /** r-virtual-card 的组件属性集合，包含事件回调和配置透传。 */
  props: Readonly<Record<string, unknown>>
  /** 当前解析出的 DataView。 */
  resolvedView: ValueRef<DataView | null>
  /** 当前可见或缓存中的卡片行数据。 */
  rows: ValueRef<readonly DataRow[]>
  /** 已缓存的页码集合。 */
  cachedPages: ValueRef<readonly number[]>
  /** 正在加载的页码集合。 */
  pendingPages: ValueRef<readonly number[]>
  /** 当前视口附近需要渲染的页码集合。 */
  visiblePages: ValueRef<readonly number[]>
  /** 当前滚动位置对应的页码。 */
  currentPage: ValueRef<number>
  /** 当前数据集总页数。 */
  totalPages: ValueRef<number>
  /** 滚动进度文本。 */
  progressText: ValueRef<string>
  /** 当前虚拟分页加载策略说明。 */
  loadPolicyText: ValueRef<string>
  /** 最近一次滚轮跳页状态说明。 */
  wheelStatusText: ValueRef<string>
  /** 滚动到指定页并触发必要加载。 */
  scrollToPage: (page: number) => Promise<void>
  /** 清空分页缓存并重新加载当前页。 */
  clearCache: () => void
}

export function createRendererVirtualCardZeroCode(options: RendererVirtualCardZeroCodeOptions) {
  const {
    props,
    resolvedView,
    rows,
    cachedPages,
    pendingPages,
    visiblePages,
    currentPage,
    totalPages,
    progressText,
    loadPolicyText,
    wheelStatusText,
    scrollToPage,
    clearCache,
  } = options

  const { dispatch, baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
    eventDefaults: {
      'item-click': {
        systemDefault: (row: unknown) => {
          if (isDataRow(row)) {
            resolvedView.value?.setCurrentRow(row)
          }
        },
      },
      'page-change': {},
    },
  })

  const virtualCardApi: RendererVirtualCardApi = {
    ...baseMethods,
    getRows() {
      return [...rows.value]
    },
    getCachedPages() {
      return [...cachedPages.value]
    },
    getPendingPages() {
      return [...pendingPages.value]
    },
    getVisiblePages() {
      return [...visiblePages.value]
    },
    getCurrentPage() {
      return currentPage.value
    },
    getTotalPages() {
      return totalPages.value
    },
    getScrollProgress() {
      return progressText.value
    },
    getLoadPolicyText() {
      return loadPolicyText.value
    },
    getWheelStatusText() {
      return wheelStatusText.value
    },
    async scrollToPage(page) {
      await scrollToPage(page)
    },
    clearCache,
  }

  return {
    dispatch,
    virtualCardApi,
  }
}
