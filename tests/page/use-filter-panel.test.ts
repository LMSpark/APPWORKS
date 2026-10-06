import { effectScope, nextTick, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { CrudApi, DataViewFilterTree, DataRow, TableResourceType } from '@spark-appworks/spark-data'
import { useFilterPanel, type FilterPanelState } from '../../packages/spark-component/src/components/containers/runtime/container-filter'
import type { SparkNode } from '@spark-appworks/spark-data'

type FilterViewLike = {
  rows: DataRow[]
  columns?: Array<{ name: string }>
  getColumn?: (name: string) => unknown
  filterExpression?: DataViewFilterTree
  setFilter: (expr: DataViewFilterTree | undefined) => Promise<void>
  executeFilter: (expr: DataViewFilterTree | undefined) => Promise<void>
  refresh: () => Promise<void>
  dataTable?: {
    api?: CrudApi
    resourceType?: TableResourceType
  }}

function createView(options?: {
  rows?: DataRow[]
  columns?: Array<{ name: string }>
  filterExpression?: DataViewFilterTree
  api?: CrudApi
  resourceType?: TableResourceType
}) {
  const setFilter = vi.fn<(expr: DataViewFilterTree | undefined) => Promise<void>>().mockResolvedValue()
  const executeFilter = vi.fn<(expr: DataViewFilterTree | undefined) => Promise<void>>().mockResolvedValue()
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
  it('invalid input predicates remain visible and do not execute a partial query', async () => {
    const { view, setFilter } = createView({ resourceType: 'static-data' })
    const { scope, api } = await mountTableFilters(view, [{ type: 'r-text', props: { field: 'Name', filterOperator: 'obsolete' } }])
    api.filterModel['Name'] = 'keep this draft'
    await nextTick()
    await Promise.resolve()
    expect(api.filterError.value).toContain('运算符')
    expect(api.filterModel['Name']).toBe('keep this draft')
    expect(await api.searchFilters()).toBe(false)
    expect(setFilter).not.toHaveBeenCalled()
    scope.stop()
  })

  it('reports a rejected result replacement without reporting search success', async () => {
    const { view } = createView({ resourceType: 'static-data' })
    view.executeFilter = vi.fn().mockRejectedValue(new Error('未保存修改'))
    const { scope, api } = await mountTableFilters(view, [{ type: 'r-text', props: { field: 'Name' } }])
    api.filterModel['Name'] = 'draft'
    await nextTick()
    expect(await api.searchFilters()).toBe(false)
    expect(api.filterError.value).toContain('未保存修改')
    scope.stop()
  })
  it('无筛选配置时不会覆盖视图自带 filterExpression', async () => {
    const { view, setFilter, refresh } = createView({
      rows: [{ id: 1, status: '草稿' }],
      filterExpression: {
        field: 'status',
        operator: 'eq',
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
          filterOperator: 'eq',
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
      operator: 'eq',
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
          filterOperator: 'eq',
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
      operator: 'eq',
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
      operator: 'gte',
      value: 100,
    })
    expect(api.activeFilterCount.value).toBe(1)

    api.filterModel['amount'] = [undefined, 200]
    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenLastCalledWith({
      field: 'amount',
      operator: 'lte',
      value: 200,
    })

    api.filterModel['amount'] = [100, 200]
    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenLastCalledWith({
      logic: 'and',
      filters: [{ field: 'amount', operator: 'gte', value: 100 }, { field: 'amount', operator: 'lte', value: 200 }],
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
          filterOperator: 'gte',
          filterValueRefField: 'minTotal',
        },
        children: [],
      },
    ]

    const { scope, api } = await mountTableFilters(view, filterChildren)

    expect(setFilter).toHaveBeenCalledWith({
      field: 'total',
      operator: 'gte',
      value: { Type: 'GetTableField', Field: 'minTotal' },
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
          filterOperator: 'gte',
          filterValueRefField: 'minTotal',
        },
        children: [],
      },
      {
        type: 'r-select',
        props: {
          field: 'status',
          filterOperator: 'eq',
        },
        children: [],
      },
    ]

    const { scope, api } = await mountTableFilters(view, filterChildren)
    api.filterModel['status'] = '草稿'

    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenLastCalledWith({
      logic: 'and',
      filters: [
        {
          field: 'total',
          operator: 'gte',
          value: { Type: 'GetTableField', Field: 'minTotal' },
        },
        {
          field: 'status',
          operator: 'eq',
          value: '草稿',
        },
      ],
    })

    await api.resetFilters()

    expect(setFilter).toHaveBeenLastCalledWith({
      field: 'total',
      operator: 'gte',
      value: { Type: 'GetTableField', Field: 'minTotal' },
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
          filterOperator: 'gte',
          filterValueRefField: 'missingField',
        },
        children: [],
      },
    ]

    await expect(mountTableFilters(view, filterChildren)).rejects.toThrow('不存在的字段')
  })
})
