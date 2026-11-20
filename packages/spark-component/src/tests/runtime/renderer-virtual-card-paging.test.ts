import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { RequestState, SparkData, type DataRow, type DataView } from '@spark-appworks/spark-data'
import { useVirtualCardPaging } from '../../components/containers/data-views/RendererVirtualCard/virtual-card-paging'

type ViewportExpose = {
  setScrollTop(value: number): void
  viewportHeight(): number
  viewportScrollTop(): number
}

type PagingHarness = {
  view: DataView
  page: ReturnType<typeof ref<number>>
  rows: ReturnType<typeof shallowRef<DataRow[]>>
  total: ReturnType<typeof ref<number>>
  pageSize: ReturnType<typeof ref<number>>
  viewportTop: ReturnType<typeof ref<number>>
  dispatchPageChange: ReturnType<typeof vi.fn>
  setPageMock: ReturnType<typeof vi.fn>
  paging: ReturnType<typeof useVirtualCardPaging>
}

function createView(): DataView {
  const ds = SparkData.createDataSet({
    dataSetName: 'RendererVirtualCardDS',
    tables: {
      Cards: {
        tableName: 'Cards',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'title', type: 'string' },
        ],
        views: {
          default: {
            rows: [
              { id: 1, title: 'Card 1' },
              { id: 2, title: 'Card 2' },
            ],
            pageSize: 2,
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
        },
      },
    },
  })
  const view = ds.getView('Cards', 'default')
  if (!view) throw new Error('Cards@default view missing')
  view.total = 8
  return view
}

function mountHarness(options: { maxCachedPages?: number; prefetchPages?: number; settleDelay?: number } = {}) {
  const state: {
    harness?: PagingHarness
    wrapper?: VueWrapper
  } = {}

  const Host = defineComponent({
    setup() {
      const view = createView()
      const page = ref(view.page)
      const rows = shallowRef<DataRow[]>([...view.rows])
      const total = ref(view.total)
      const pageSize = ref(view.pageSize)
      const requestState = ref<RequestState>(RequestState.Loaded)
      const viewportTop = ref(0)
      const viewport: ViewportExpose = {
        setScrollTop(value: number) {
          viewportTop.value = value
        },
        viewportHeight() {
          return 100
        },
        viewportScrollTop() {
          return viewportTop.value
        },
      }
      const viewportRef = shallowRef<ViewportExpose | null>(viewport)
      const dispatchPageChange = vi.fn(async () => {})
      const setPageMock = vi.fn(async (nextPage: number) => {
        page.value = nextPage
        view.page = nextPage
      })
      view.setPage = async (nextPage: number) => {
        await setPageMock(nextPage)
      }
      const paging = useVirtualCardPaging({
        viewportRef,
        resolvedView: computed(() => view),
        rows: computed(() => rows.value),
        total: computed(() => total.value),
        page: computed(() => page.value),
        pageSize: computed(() => pageSize.value),
        requestState: computed(() => requestState.value),
        pageHeight: () => 100,
        mobilePageHeight: () => 100,
        mobileBreakpoint: () => 700,
        overscanPages: () => 1,
        prefetchPages: () => options.prefetchPages ?? 1,
        maxCachedPages: () => options.maxCachedPages ?? 24,
        settleDelay: () => options.settleDelay ?? 20,
        wheelStepPx: () => 180,
        maxWheelJumpPages: () => 40,
        dispatchPageChange,
      })

      state.harness = {
        view,
        page,
        rows,
        total,
        pageSize,
        viewportTop,
        dispatchPageChange,
        setPageMock,
        paging,
      }

      return () => h('div')
    },
  })

  state.wrapper = mount(Host)
  const mountedHarness = state.harness
  const mountedWrapper = state.wrapper
  if (!mountedHarness || !mountedWrapper) throw new Error('Renderer virtual card harness failed to mount')

  return {
    harness: mountedHarness,
    unmount() {
      mountedWrapper.unmount()
    },
  }
}

describe('useVirtualCardPaging', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('defers DataView page loading until scroll settles', async () => {
    vi.useFakeTimers()
    const { harness, unmount } = mountHarness({ settleDelay: 20 })

    harness.paging.handleViewportScroll(200)

    expect(harness.paging.currentPage.value).toBe(3)
    expect(harness.setPageMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(70)

    expect(harness.dispatchPageChange).toHaveBeenCalledWith(3)
    expect(harness.setPageMock).toHaveBeenCalledWith(3)
    expect(harness.viewportTop.value).toBe(200)

    unmount()
  })

  it('caches loaded pages and trims to the configured cache limit', async () => {
    const { harness, unmount } = mountHarness({ maxCachedPages: 2 })

    await nextTick()
    expect(harness.paging.cachedPages.value).toEqual([1])

    harness.page.value = 2
    harness.rows.value = [{ id: 3, title: 'Card 3' }]
    await nextTick()
    expect(harness.paging.cachedPages.value).toEqual([1, 2])

    harness.page.value = 4
    harness.rows.value = [{ id: 7, title: 'Card 7' }]
    await nextTick()

    expect(harness.paging.cachedPages.value).toEqual([2, 4])
    expect(harness.paging.rowsForPage(1)).toEqual([])
    expect(harness.paging.rowsForPage(4)).toMatchObject([{ id: 7, title: 'Card 7' }])

    unmount()
  })

  it('slices full local rows without mutating the DataView page', async () => {
    const { harness, unmount } = mountHarness()

    harness.total.value = 5
    harness.pageSize.value = 2
    harness.rows.value = [
      { id: 1, title: 'Card 1' },
      { id: 2, title: 'Card 2' },
      { id: 3, title: 'Card 3' },
      { id: 4, title: 'Card 4' },
      { id: 5, title: 'Card 5' },
    ]
    await nextTick()

    expect(harness.paging.rowsForPage(2)).toMatchObject([
      { id: 3, title: 'Card 3' },
      { id: 4, title: 'Card 4' },
    ])

    await harness.paging.scrollToPage(2)

    expect(harness.dispatchPageChange).toHaveBeenCalledWith(2)
    expect(harness.setPageMock).not.toHaveBeenCalled()

    unmount()
  })

  it('prefetches a local page window without mutating the DataView page', async () => {
    const { harness, unmount } = mountHarness({ maxCachedPages: 3, prefetchPages: 1 })

    harness.total.value = 6
    harness.pageSize.value = 2
    harness.rows.value = [
      { id: 1, title: 'Card 1' },
      { id: 2, title: 'Card 2' },
      { id: 3, title: 'Card 3' },
      { id: 4, title: 'Card 4' },
      { id: 5, title: 'Card 5' },
      { id: 6, title: 'Card 6' },
    ]
    await nextTick()

    await harness.paging.scrollToPage(2)

    expect(harness.paging.cachedPages.value).toEqual([1, 2, 3])
    expect(harness.paging.rowsForPage(3)).toMatchObject([
      { id: 5, title: 'Card 5' },
      { id: 6, title: 'Card 6' },
    ])
    expect(harness.paging.loadPolicyText.value).toContain('本地预热第 2 页附近')
    expect(harness.dispatchPageChange).toHaveBeenCalledWith(2)
    expect(harness.setPageMock).not.toHaveBeenCalled()

    unmount()
  })
})
