import { effectScope, nextTick, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { CrudApi, FilterExpression, DataRow, TableResourceType } from '@spark-appworks/spark-data'
import { useFilterPanel, type FilterPanelState } from '../../packages/spark-component/src/components/containers/runtime/container-filter'
import type { SparkNode } from '@spark-appworks/spark-data'

type FilterViewLike = {
  rows: DataRow[]
  columns?: Array<{ name: string }>
  getColumn?: (name: string) => unknown
  filterExpression?: FilterExpression
  setFilter: (expr: FilterExpression | undefined) => Promise<void>
  executeFilter: (expr: FilterExpression | undefined) => Promise<void>
  refresh: () => Promise<void>
  dataTable?: {
    api?: CrudApi
    resourceType?: TableResourceType
  }}

function createView(options?: {
  rows?: DataRow[]
  columns?: Array<{ name: string }>
  filterExpression?: FilterExpression
  api?: CrudApi
  resourceType?: TableResourceType
}) {
  const setFilter = vi.fn<(expr: FilterExpression | undefined) => Promise<void>>().mockResolvedValue()
  const executeFilter = vi.fn<(expr: FilterExpression | undefined) => Promise<void>>().mockResolvedValue()
  const refresh = vi.fn<() => Promise<void>>().mockResolvedValue()
  const columnMap = new Map((options?.columns ?? []).map(column => [column.name, column]))
  const view: FilterViewLike = {
    rows: options?.rows ?? [],
    ...(options?.columns !== undefined
      ? {
          columns: options.columns,
          getColumn: (name: string) => columnMap.get(name),
        }
      : {}),
    ...(options?.filterExpression !== undefined ? { filterExpression: options.filterExpression } : {}),
    setFilter,
    executeFilter,
    refresh,
    dataTable: {
      ...(options?.api !== undefined ? { api: options.api } : {}),
      ...(options?.resourceType !== undefined ? { resourceType: options.resourceType } : {}),
    },
  }
  return { view, setFilter, refresh }
}

async function mountTableFilters(view: FilterViewLike, filterChildren: SparkNode[]) {
  const scope = effectScope()
  const logger = {
    error: vi.fn<(message: string, error?: unknown) => void>(),
  }
  const viewRef = shallowRef(view)
  let api: FilterPanelState | undefined

  scope.run(() => {
    api = useFilterPanel({
      filterChildren,
      dataView: () => viewRef.value,
      logger,
    })
  })

  await nextTick()
  await Promise.resolve()
  if (api === undefined) {
    throw new Error('useFilterPanel did not initialize')
  }

  return {
    scope,
    logger,
    api,
  }
}

describe('useFilterPanel', () => {
  it('无筛选配置时不会覆盖视图自带 filterExpression', async () => {
    const { view, setFilter, refresh } = createView({
      rows: [{ id: 1, status: '草稿' }],
      filterExpression: {
        field: 'status',
        op: '==',
        value: '草稿',
      },
      api: {
        list: {
          url: '/voucher/list',
          method: 'GET',
        },
      },
      resourceType: 'database-table',
    })

    const { scope } = await mountTableFilters(view, [])

    expect(setFilter).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    scope.stop()
  })

  it('static-data 视图同步 filterExpression 到 DataView，但不触发 refresh', async () => {
    const { view, setFilter, refresh } = createView({
      rows: [
        { id: 1, status: '草稿', summary: '待处理' },
        { id: 2, status: '已审核', summary: '已完成' },
      ],
      resourceType: 'static-data',
      api: {
        list: {
          url: '/voucher/list',
          method: 'GET',
        },
      },
    })

    const filterChildren = [
      {
        type: 'r-select',
        props: {
          field: 'status',
          filterOperator: '==',
        },
        children: [],
      },
    ]

    const { scope, api } = await mountTableFilters(view, filterChildren)
    api.filterModel['status'] = '草稿'

    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenCalledWith({
      field: 'status',
      op: '==',
      value: '草稿',
    })
    expect(refresh).not.toHaveBeenCalled()
    scope.stop()
  })

  it('远程 list 视图在有筛选配置时仍同步到 DataView', async () => {
    const { view, setFilter, refresh } = createView({
      rows: [{ id: 1, status: '草稿' }],
      api: {
        list: {
          url: '/voucher/list',
          method: 'GET',
        },
      },
      resourceType: 'database-table',
    })

    const filterChildren = [
      {
        type: 'r-select',
        props: {
          field: 'status',
          filterOperator: '==',
        },
        children: [],
      },
    ]

    const { scope, api } = await mountTableFilters(view, filterChildren)
    api.filterModel['status'] = '草稿'

    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenCalledWith({
      field: 'status',
      op: '==',
      value: '草稿',
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('范围筛选会跳过双空值，单边值转换为上下界条件', async () => {
    const { view, setFilter } = createView({
      rows: [{ id: 1, amount: 100 }],
      columns: [
        { name: 'id' },
        { name: 'amount' },
      ],
      resourceType: 'static-data',
    })

    const filterChildren = [
      {
        type: 'r-number',
        props: {
          field: 'amount',
          filterMode: 'range',
        },
        children: [],
      },
    ]

    const { scope, api, logger } = await mountTableFilters(view, filterChildren)
    api.filterModel['amount'] = [undefined, undefined]

    await nextTick()
    await Promise.resolve()

    expect(setFilter).not.toHaveBeenCalled()
    expect(api.activeFilterCount.value).toBe(0)
    expect(logger.error).not.toHaveBeenCalled()

    api.filterModel['amount'] = [100, undefined]
    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenLastCalledWith({
      field: 'amount',
      op: '>=',
      value: 100,
    })
    expect(api.activeFilterCount.value).toBe(1)

    api.filterModel['amount'] = [undefined, 200]
    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenLastCalledWith({
      field: 'amount',
      op: '<=',
      value: 200,
    })

    api.filterModel['amount'] = [100, 200]
    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenLastCalledWith({
      field: 'amount',
      op: 'between',
      value: [100, 200],
    })
    scope.stop()
  })

  it('结构化 ref 常驻条件会同步到 DataView 且不进入过滤条输入模型', async () => {
    const { view, setFilter } = createView({
      rows: [{ id: 1, total: 20, minTotal: 10 }],
      columns: [
        { name: 'id' },
        { name: 'total' },
        { name: 'minTotal' },
      ],
      resourceType: 'static-data',
    })

    const filterChildren = [
      {
        type: 'r-select',
        props: {
          field: 'total',
          filterOperator: '>=',
          filterValueRefField: 'minTotal',
        },
        children: [],
      },
    ]

    const { scope, api } = await mountTableFilters(view, filterChildren)

    expect(setFilter).toHaveBeenCalledWith({
      field: 'total',
      op: '>=',
      value: { kind: 'field', field: 'minTotal' },
    })
    expect(api.filterConfigs.value).toEqual([])
    expect(api.hasFilters.value).toBe(false)
    expect('total' in api.filterModel).toBe(false)
    expect(api.activeFilterCount.value).toBe(0)
    scope.stop()
  })

  it('重置时保留结构化 ref 常驻条件，仅清空用户输入过滤', async () => {
    const { view, setFilter } = createView({
      rows: [{ id: 1, total: 20, minTotal: 10, status: '草稿' }],
      columns: [
        { name: 'id' },
        { name: 'total' },
        { name: 'minTotal' },
        { name: 'status' },
      ],
      resourceType: 'static-data',
    })

    const filterChildren = [
      {
        type: 'r-select',
        props: {
          field: 'total',
          filterOperator: '>=',
          filterValueRefField: 'minTotal',
        },
        children: [],
      },
      {
        type: 'r-select',
        props: {
          field: 'status',
          filterOperator: '==',
        },
        children: [],
      },
    ]

    const { scope, api } = await mountTableFilters(view, filterChildren)
    api.filterModel['status'] = '草稿'

    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenLastCalledWith({
      type: 'and',
      children: [
        {
          field: 'total',
          op: '>=',
          value: { kind: 'field', field: 'minTotal' },
        },
        {
          field: 'status',
          op: '==',
          value: '草稿',
        },
      ],
    })

    await api.resetFilters()

    expect(setFilter).toHaveBeenLastCalledWith({
      field: 'total',
      op: '>=',
      value: { kind: 'field', field: 'minTotal' },
    })
    expect(api.activeFilterCount.value).toBe(0)
    scope.stop()
  })

  it('filterValueRefField 引用不存在字段时会在前端 fail-fast', async () => {
    const { view } = createView({
      rows: [{ id: 1, total: 20 }],
      columns: [
        { name: 'id' },
        { name: 'total' },
      ],
      resourceType: 'static-data',
    })

    const filterChildren = [
      {
        type: 'r-select',
        props: {
          field: 'total',
          filterOperator: '>=',
          filterValueRefField: 'missingField',
        },
        children: [],
      },
    ]

    await expect(mountTableFilters(view, filterChildren)).rejects.toThrow('不存在的字段')
  })
})
