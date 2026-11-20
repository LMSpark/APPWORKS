/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererVirtualCard/virtual-card-paging
 * 职责：支撑 RendererVirtualCard（r-virtual-card）在 table-level/data-view-container 中的运行时协作，补齐配置、状态或渲染器之间的连接逻辑。
 * 边界：只覆盖当前组件目录 containers/data-views 的局部能力，不定义全局页面模型，也不越级操作业务数据源。
 * AI用途：需要判断 renderer virtual card 的组件分层、辅助类型或内部接线时，用本模块作为局部语义入口。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { RequestState, type DataRow, type DataView } from '@spark-appworks/spark-data'

/** 虚拟卡片视口组件对分页逻辑暴露的滚动能力。 */
type VirtualCardViewportExpose = {
  /** 将视口滚动到指定像素位置。 */
  setScrollTop(value: number): void
  /** 返回当前视口高度。 */
  viewportHeight(): number
  /** 返回当前视口滚动位置。 */
  viewportScrollTop(): number
}

/** 只读取滚轮纵向位移的分页事件。 */
type WheelPageEvent = {
  /** 滚轮纵向滚动距离，正数向后翻页。 */
  deltaY: number
}

/** r-virtual-card 虚拟分页、缓存和预加载策略配置。 */
type VirtualCardPagingOptions = {
  /** 视口组件 ref，用于读取和设置滚动位置。 */
  viewportRef: Ref<VirtualCardViewportExpose | null>
  /** 当前解析出的 DataView。 */
  resolvedView: ComputedRef<DataView | null>
  /** 当前 DataView 行数据。 */
  rows: ComputedRef<readonly DataRow[]>
  /** 当前查询总条数。 */
  total: ComputedRef<number>
  /** DataView 当前页码。 */
  page: ComputedRef<number>
  /** DataView 当前分页大小。 */
  pageSize: ComputedRef<number>
  /** DataView 当前请求状态。 */
  requestState: ComputedRef<RequestState>
  /** 桌面端单页虚拟高度。 */
  pageHeight: () => number
  /** 移动端单页虚拟高度。 */
  mobilePageHeight: () => number
  /** 切换移动端页高的视口宽度阈值。 */
  mobileBreakpoint: () => number
  /** 当前页前后额外渲染的页数。 */
  overscanPages: () => number
  /** 当前页前后预加载的页数。 */
  prefetchPages: () => number
  /** 内存中最多保留的页缓存数量。 */
  maxCachedPages: () => number
  /** 滚动停止后等待加载的毫秒数。 */
  settleDelay: () => number
  /** 滚轮累计多少像素至少跳一页。 */
  wheelStepPx: () => number
  /** 单次滚轮最多跳过的页数。 */
  maxWheelJumpPages: () => number
  /** 通知外层切换到指定页。 */
  dispatchPageChange: (page: number) => Promise<void>
}

const numberFormat = new Intl.NumberFormat('zh-CN')

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toPositiveInteger(value: unknown, fallback = 1): number {
  const next = Number.parseInt(String(value), 10)
  return Number.isFinite(next) && next > 0 ? next : fallback
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function replaceSetValue<T>(target: Ref<Set<T>>, nextValue: Set<T>): void {
  target.value = nextValue
}

export function formatVirtualCardNumber(value: number): string {
  return numberFormat.format(value)
}

export function useVirtualCardPaging(options: VirtualCardPagingOptions) {
  const scrollTop = ref(0)
  const viewportHeight = ref(0)
  const isDragging = ref(false)
  const programmaticScroll = ref(false)
  const lastLoadTarget = ref(1)
  const lastWheelJumpPages = ref(0)
  const pageRowsCache = shallowRef(new Map<number, DataRow[]>())
  const pendingPages = shallowRef(new Set<number>())
  const notice = ref('')

  let dragTimer = 0
  let loadTimer = 0
  let resizeTimer = 0
  let wheelTimer = 0
  let wheelDelta = 0
  let wheelStartAt = 0
  let wheelLastAt = 0

  const normalizedPageHeight = computed(() => Math.max(1, toFiniteNumber(options.pageHeight(), 540)))
  const normalizedMobilePageHeight = computed(() => Math.max(1, toFiniteNumber(options.mobilePageHeight(), 850)))
  const normalizedMobileBreakpoint = computed(() => Math.max(1, toFiniteNumber(options.mobileBreakpoint(), 700)))
  const pageHeight = ref(normalizedPageHeight.value)
  const pageSize = computed(() => Math.max(1, Math.trunc(toFiniteNumber(options.pageSize.value, 1))))
  const prefetchPages = computed(() => Math.max(0, Math.trunc(toFiniteNumber(options.prefetchPages(), 0))))
  const usesLocalRowsPaging = computed(() => {
    const rowCount = options.rows.value.length
    if (rowCount <= pageSize.value) return false
    const explicitTotal = options.total.value
    return explicitTotal <= 0 || explicitTotal <= rowCount
  })
  const totalItems = computed(() => {
    const explicitTotal = options.total.value
    if (explicitTotal > 0) return explicitTotal
    return options.rows.value.length
  })
  const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)))
  const virtualHeight = computed(() => totalPages.value * pageHeight.value)
  const scrollSpacerHeight = computed(() =>
    virtualHeight.value + Math.max(0, viewportHeight.value - pageHeight.value)
  )
  const currentPage = computed(() => pageFromScroll(scrollTop.value))
  const firstItemNumber = computed(() => Math.min(totalItems.value, (currentPage.value - 1) * pageSize.value + 1))
  const lastItemNumber = computed(() =>
    Math.min(firstItemNumber.value + pageSize.value - 1, totalItems.value)
  )
  const progressText = computed(() => {
    const maxScroll = Math.max(1, scrollSpacerHeight.value - viewportHeight.value)
    const ratio = clamp((scrollTop.value / maxScroll) * 100, 0, 100)
    return `${ratio.toFixed(2)}%`
  })
  const visiblePages = computed(() => {
    const overscan = Math.max(0, Math.trunc(options.overscanPages()))
    const first = pageFromScroll(Math.max(0, scrollTop.value - pageHeight.value * overscan))
    const last = pageFromScroll(scrollTop.value + viewportHeight.value + pageHeight.value * overscan)
    const pages: number[] = []

    for (let page = first; page <= last; page += 1) {
      pages.push(page)
    }

    return pages
  })
  const cachedPages = computed(() => [...pageRowsCache.value.keys()].sort((a, b) => a - b))
  const pendingPageNumbers = computed(() => [...pendingPages.value].sort((a, b) => a - b))
  const wheelStatusText = computed(() => {
    if (!lastWheelJumpPages.value) return '滚轮按速度跳页'
    return `滚轮跳 ${formatVirtualCardNumber(lastWheelJumpPages.value)} 页`
  })
  const loadPolicyText = computed(() => {
    if (isDragging.value) return '停稳后加载目标页'
    if (usesLocalRowsPaging.value && prefetchPages.value > 0) {
      return `本地预热第 ${formatVirtualCardNumber(lastLoadTarget.value)} 页附近`
    }
    return `加载第 ${formatVirtualCardNumber(lastLoadTarget.value)} 页`
  })

  function computePageHeight(): number {
    if (typeof window === 'undefined') return normalizedPageHeight.value
    return window.innerWidth <= normalizedMobileBreakpoint.value
      ? normalizedMobilePageHeight.value
      : normalizedPageHeight.value
  }

  function updatePageHeight(): void {
    pageHeight.value = computePageHeight()
  }

  function refreshViewportHeight(height?: number): void {
    viewportHeight.value = height ?? options.viewportRef.value?.viewportHeight() ?? 0
  }

  function pageFromScroll(value: number): number {
    const lastPageTop = Math.max(0, (totalPages.value - 1) * pageHeight.value)
    if (value >= lastPageTop - 1) return totalPages.value
    return clamp(Math.floor(value / pageHeight.value) + 1, 1, totalPages.value)
  }

  function rowsForPage(page: number): readonly DataRow[] {
    if (usesLocalRowsPaging.value) {
      return localRowsForPage(page)
    }
    const cached = pageRowsCache.value.get(page)
    return cached ?? []
  }

  function localRowsForPage(page: number): readonly DataRow[] {
    const start = (page - 1) * pageSize.value
    return options.rows.value.slice(start, start + pageSize.value)
  }

  function isPagePending(page: number): boolean {
    return pendingPages.value.has(page)
  }

  function pageStatus(page: number): string {
    if (usesLocalRowsPaging.value) {
      return `本地切片 ${formatVirtualCardNumber(rowsForPage(page).length)} 条`
    }
    const cached = pageRowsCache.value.get(page)
    if (cached) return `已加载 ${formatVirtualCardNumber(cached.length)} 条`
    if (isPagePending(page)) return 'DataView 加载中'
    if (isDragging.value) return '拖动中暂不请求'
    return '等待停稳后请求'
  }

  function markDragging(): void {
    isDragging.value = true
    window.clearTimeout(dragTimer)
    window.clearTimeout(loadTimer)
  }

  function scheduleSettledLoad(delay: number): void {
    window.clearTimeout(dragTimer)
    window.clearTimeout(loadTimer)
    dragTimer = window.setTimeout(() => {
      isDragging.value = false
    }, delay)
    loadTimer = window.setTimeout(() => {
      const targetPage = currentPage.value
      isDragging.value = false
      void scrollToPage(targetPage, false)
    }, delay + 40)
  }

  function handleViewportScroll(nextScrollTop: number): void {
    scrollTop.value = nextScrollTop
    if (programmaticScroll.value) {
      programmaticScroll.value = false
      return
    }

    markDragging()
    scheduleSettledLoad(Math.max(0, Math.trunc(options.settleDelay())))
  }

  function handleWheelPage(event: WheelPageEvent): void {
    const now = performance.now()
    const directionChanged = Math.sign(wheelDelta) !== Math.sign(event.deltaY)
    if (wheelStartAt === 0 || now - wheelLastAt > 140 || directionChanged) {
      wheelDelta = 0
      wheelStartAt = now
    }

    wheelDelta += event.deltaY
    wheelLastAt = now
    window.clearTimeout(wheelTimer)
    wheelTimer = window.setTimeout(flushWheelJump, 70)
  }

  function flushWheelJump(): void {
    if (!wheelDelta) return

    const direction = wheelDelta > 0 ? 1 : -1
    const duration = Math.max(80, wheelLastAt - wheelStartAt)
    const distance = Math.abs(wheelDelta)
    const speed = distance / duration
    const distancePages = Math.max(1, Math.ceil(distance / Math.max(1, options.wheelStepPx())))
    const speedMultiplier = speed >= 12 ? 4 : speed >= 6 ? 3 : speed >= 2.5 ? 2 : 1
    const pageStep = clamp(distancePages * speedMultiplier, 1, Math.max(1, options.maxWheelJumpPages()))
    const targetPage = clamp(currentPage.value + direction * pageStep, 1, totalPages.value)
    const jumpedPages = Math.abs(targetPage - currentPage.value)

    wheelDelta = 0
    wheelStartAt = 0
    wheelLastAt = 0
    lastWheelJumpPages.value = jumpedPages

    if (targetPage !== currentPage.value) {
      void scrollToPage(targetPage, false)
    }
  }

  function handleResize(): void {
    const page = currentPage.value
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      updatePageHeight()
      void nextTick(() => {
        refreshViewportHeight()
        void scrollToPage(page, false)
      })
    }, 80)
  }

  async function scrollToPage(page: number, keepDragging = false): Promise<void> {
    const targetPage = clamp(toPositiveInteger(page, 1), 1, totalPages.value)
    const targetTop = Math.min(
      (targetPage - 1) * pageHeight.value,
      scrollSpacerHeight.value - viewportHeight.value
    )
    const nextScrollTop = Math.max(0, targetTop)
    const currentViewportTop = options.viewportRef.value?.viewportScrollTop() ?? 0
    const willScroll = Math.round(currentViewportTop) !== Math.round(nextScrollTop)

    scrollTop.value = nextScrollTop
    programmaticScroll.value = !keepDragging && willScroll
    options.viewportRef.value?.setScrollTop(nextScrollTop)

    if (keepDragging) {
      markDragging()
      scheduleSettledLoad(Math.max(0, Math.trunc(options.settleDelay())))
      return
    }

    isDragging.value = false
    await loadPageWindow(targetPage)
  }

  async function loadPageWindow(centerPage: number): Promise<void> {
    const targetPage = clamp(centerPage, 1, totalPages.value)
    lastLoadTarget.value = targetPage

    if (usesLocalRowsPaging.value) {
      cacheLocalPageWindow(targetPage)
      await options.dispatchPageChange(targetPage)
      return
    }

    await loadRemotePage(targetPage)
  }

  async function loadRemotePage(page: number): Promise<void> {
    const view = options.resolvedView.value
    if (!view) return
    const targetPage = clamp(page, 1, totalPages.value)
    lastLoadTarget.value = targetPage

    setPagePending(targetPage, true)
    await options.dispatchPageChange(targetPage)

    try {
      if (targetPage === view.page) {
        if (options.requestState.value === RequestState.Loading || options.requestState.value === RequestState.Preparing) return
        if (options.rows.value.length > 0) {
          cachePageRows(targetPage, options.rows.value)
          setPagePending(targetPage, false)
          return
        }
        await view.refresh()
        return
      }

      await view.setPage(targetPage)
    } catch (error) {
      setPagePending(targetPage, false)
      notice.value = error instanceof Error ? error.message : String(error)
    }
  }

  function cachePageRows(page: number, rows: readonly DataRow[]): void {
    const nextCache = new Map(pageRowsCache.value)
    nextCache.set(page, [...rows])
    pageRowsCache.value = trimCache(nextCache, page)
  }

  function cacheLocalPageWindow(centerPage: number): void {
    const nextCache = new Map(pageRowsCache.value)
    for (const page of pageWindow(centerPage)) {
      nextCache.set(page, [...localRowsForPage(page)])
      setPagePending(page, false)
    }
    pageRowsCache.value = trimCache(nextCache, centerPage)
  }

  function pageWindow(centerPage: number): number[] {
    const targetPage = clamp(centerPage, 1, totalPages.value)
    const radius = prefetchPages.value
    const pages: number[] = []

    for (let page = targetPage - radius; page <= targetPage + radius; page += 1) {
      if (page >= 1 && page <= totalPages.value) pages.push(page)
    }

    return pages
  }

  function trimCache(source: Map<number, DataRow[]>, anchorPage: number): Map<number, DataRow[]> {
    const maxCachedPages = Math.max(1, Math.trunc(options.maxCachedPages()))
    if (source.size <= maxCachedPages) return source

    const keepPages = [...source.keys()]
      .sort((a, b) => Math.abs(a - anchorPage) - Math.abs(b - anchorPage))
      .slice(0, maxCachedPages)
    const keepSet = new Set(keepPages)
    const nextCache = new Map<number, DataRow[]>()
    for (const [page, rows] of source.entries()) {
      if (keepSet.has(page)) nextCache.set(page, rows)
    }
    return nextCache
  }

  function setPagePending(page: number, pending: boolean): void {
    const nextPending = new Set(pendingPages.value)
    if (pending) {
      nextPending.add(page)
    } else {
      nextPending.delete(page)
    }
    replaceSetValue(pendingPages, nextPending)
  }

  function clearCache(): void {
    pageRowsCache.value = new Map()
    pendingPages.value = new Set()
    notice.value = ''
    void loadPageWindow(currentPage.value)
  }

  function cacheCurrentRows(): void {
    const rows = options.rows.value
    if (rows.length === 0) return
    if (usesLocalRowsPaging.value) {
      cacheLocalPageWindow(currentPage.value)
      return
    }
    cachePageRows(options.page.value, rows)
    setPagePending(options.page.value, false)
  }

  watch(
    options.rows,
    () => {
      cacheCurrentRows()
    },
    { immediate: true },
  )

  watch(
    options.requestState,
    (state) => {
      if (state === RequestState.Loaded || state === RequestState.Failed) {
        setPagePending(options.page.value, false)
      }
      if (state === RequestState.Loaded) {
        cacheCurrentRows()
      }
    },
  )

  watch(
    totalPages,
    (nextTotalPages) => {
      if (currentPage.value <= nextTotalPages) return
      void scrollToPage(nextTotalPages, false)
    },
  )

  onMounted(() => {
    updatePageHeight()
    void nextTick(() => {
      refreshViewportHeight()
      cacheCurrentRows()
    })
    window.addEventListener('resize', handleResize)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
    window.clearTimeout(dragTimer)
    window.clearTimeout(loadTimer)
    window.clearTimeout(resizeTimer)
    window.clearTimeout(wheelTimer)
  })

  return {
    pageHeight,
    scrollTop,
    viewportHeight,
    isDragging,
    notice,
    lastLoadTarget,
    totalItems,
    totalPages,
    scrollSpacerHeight,
    currentPage,
    firstItemNumber,
    lastItemNumber,
    progressText,
    visiblePages,
    cachedPages,
    pendingPageNumbers,
    loadPolicyText,
    wheelStatusText,
    refreshViewportHeight,
    handleViewportScroll,
    handleWheelPage,
    rowsForPage,
    isPagePending,
    pageStatus,
    scrollToPage,
    clearCache,
  }
}
