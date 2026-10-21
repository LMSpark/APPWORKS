import {afterEach, describe, expect, it, vi} from 'vitest'
import {createRequest} from '@spark-appworks/spark-utils'
import {DataSet} from '../../dataset'
import {DataView} from '../../data-view'
import {RequestState} from '../../types'
import {DataViewQuery} from '../../query/data-view-query'
import type {QueryParams} from '../../types'

const sets: DataSet[] = []
afterEach(() => sets.splice(0).forEach(ds => ds.destroy()))
const tree = {keyField: 'id', parentField: 'parentId', nodeId: 'root', mode: 'child' as const}
function fixture() {
  const ds = DataSet.fromJson({dataSetName: 'Queries', tables: {Nodes: {tableName: 'Nodes',
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'parentId', type: 'string'}],
    views: {default: {}, other: {}}}}})
  sets.push(ds)
  const view = ds.getView('Nodes', 'default')!
  return {ds, view, load: vi.spyOn(view, 'loadFromServer').mockResolvedValue({success: true})}
}

describe('DataView owns query configuration', () => {
  it('validates and roundtrips cache lifetime without sending cache policy as query parameters', () => {
    const {view} = fixture()
    for (const cacheType of ['none', 'page', 'browser'] as const) {
      view.queryConfig = {cacheType}
      expect(DataView.fromJson(view.toJson(), 'Nodes', 'other').queryConfig).toEqual({cacheType})
      expect(DataViewQuery.capture(view.queryConfig)).toEqual({})
    }
    expect(() => DataViewQuery.parse({cacheType: 'localStorage'})).toThrow('cacheType')
  })
  it('rejects enabling result cache on an executor or tree API without the cache protocol', async () => {
    const {view, load} = fixture()
    load.mockRestore()
    view.queryConfig = {cacheType: 'browser'}
    await expect(view.loadFromServer()).rejects.toThrow('DATA_VIEW_QUERY_CACHE_UNSUPPORTED')
    await expect(view.loadTreeNested()).rejects.toThrow('DATA_VIEW_QUERY_CACHE_UNSUPPORTED')
  })
  it.each(['GET', 'POST'] as const)('uses one view configuration through the DataTable API HTTP boundary: %s', async method => {
    const filter = {field: 'id', operator: 'ne' as const, value: 'excluded'}
    const ds = DataSet.fromJson({dataSetName: 'Queries', tables: {Items: {
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}],
      api: {list: {url: '/items', method, pagination: {pageParam: 'pageIndex', sizeParam: 'limit', sortParam: 'orderBy'}}},
      views: {default: {filterExpression: filter, sortExpression: [{field: 'id', direction: 'desc'}], pageSize: 7},
        compact: {pageSize: 3, sortExpression: [{field: 'id', direction: 'asc'}]}},
    }}})
    sets.push(ds)
    const client = createRequest()
    const get = vi.spyOn(client, 'get').mockResolvedValue({rows: [], total: 40})
    const post = vi.spyOn(client, 'post').mockResolvedValue({rows: [], total: 40})
    ds.setSharedHttpClient(client)
    const calls = () => method === 'GET' ? get.mock.calls.map(call => call[1]) : post.mock.calls.map(call => (call[1] as {query: unknown}).query)
    const view = ds.getView('Items')!, compact = ds.getView('Items', 'compact')!
    view.page = 2
    await view.loadFromServer()
    expect(calls()[0]).toMatchObject({page: 2, pageIndex: 2, pageSize: 7, limit: 7, sort: 'id:desc', orderBy: 'id:desc', filter})
    await view.refresh()
    expect(calls()[1]).toEqual(calls()[0])
    const derived = view.createQueryView('derived')
    await derived.loadFromServer(); await compact.loadFromServer()
    expect(calls()[2]).toMatchObject({pageIndex: 1, limit: 7, orderBy: 'id:desc', filter})
    expect(calls()[3]).toMatchObject({pageIndex: 1, limit: 3, orderBy: 'id:asc'})
    expect(calls()[3]).not.toHaveProperty('filter')
    await view.loadFromServer({page: 4, pageSize: 2, sort: 'id:asc', filter: {field: 'id', operator: 'eq', value: 'override'}})
    expect(calls()[4]).toMatchObject({pageIndex: 4, limit: 2, orderBy: 'id:asc', filter: {field: 'id', operator: 'eq', value: 'override'}})
    expect(view.page).toBe(2); expect(view.pageSize).toBe(7); expect(view.filterExpression).toEqual(filter)
    await view.loadFromServer()
    expect(calls()[5]).toEqual(calls()[0])
    await view.setPage(3); await view.setPageSize(5); await view.setSort([{field: 'id', direction: 'asc'}])
    expect(calls()[6]).toMatchObject({pageIndex: 3, limit: 7, orderBy: 'id:desc', filter})
    expect(calls()[7]).toMatchObject({pageIndex: 1, limit: 5, orderBy: 'id:desc', filter})
    expect(calls()[8]).toMatchObject({pageIndex: 1, limit: 5, orderBy: 'id:asc', filter})
    expect(calls()).toHaveLength(9)
    expect(method === 'GET' ? post : get).not.toHaveBeenCalled()
    expect(compact.pageSize).toBe(3); expect(derived.pageSize).toBe(7)
  })

  it('uses the configured filter for direct loads and derived views without page-side parameter copying', async () => {
    const ds = DataSet.fromJson({dataSetName: 'Queries', scenarioId: 'Queries', tables: {Nodes: {
      modelBinding: {modelId: 'Nodes', modelName: 'Nodes'}, columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}},
    }}})
    sets.push(ds)
    const view = ds.getView('Nodes')!
    const seen: QueryParams[] = []
    view.bindQueryExecutor({executeQuery: async (_view, params) => {
      seen.push(params)
      return {rows: [], total: 0, assertIdentity: () => undefined, rowKey: row => row['id'],
        fieldAccess: () => ({read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}),
        readFieldAccess: () => 'visible', addActionState: () => 'disabled', editActionState: () => 'disabled',
        deleteActionState: () => 'disabled', createChildActionState: () => 'disabled', viewActionState: () => 'enabled'}
    }})
    const filter = {field: 'id', operator: 'eq' as const, value: 'owned'}
    view.filterExpression = filter
    const derived = view.createQueryView('filtered')
    await view.loadFromServer(); await derived.loadFromServer()
    await derived.setPage(2); await derived.setSort([{field: 'id', direction: 'asc'}])
    expect(seen).toHaveLength(4)
    for (const params of seen) expect(params.filter).toEqual(filter)
    await derived.loadFromServer({filter: {field: 'id', operator: 'eq', value: 'explicit'}})
    expect(seen.at(-1)?.filter).toEqual({field: 'id', operator: 'eq', value: 'explicit'})
    expect(derived.filterExpression).toEqual(filter)
  })
  it('preserves explicit source input interpretation in the view and every request', async () => {
    const {view, load} = fixture()
    view.queryConfig = {sourceInputMode: 'direct'}
    await view.refresh(); await view.setPage(2); await view.setSort([{field: 'id', direction: 'asc'}])
    for (const [params] of load.mock.calls) expect(params).toMatchObject({sourceInputMode: 'direct'})
    const restored = DataView.fromJson(view.toJson(), 'Nodes', 'restored')
    expect(restored.queryConfig).toEqual({sourceInputMode: 'direct'}); restored.destroy()
    expect(() => DataViewQuery.parse({sourceInputMode: 'guess'})).toThrow('sourceInputMode')
    expect(() => DataViewQuery.parse({sourceInputMode: null})).toThrow('sourceInputMode')
  })
  const lookup = {field: 'id', sourceViewKey: 'Queries@Users@default', matchField: 'name', valueField: 'code'}
  it.each([null, {}, [null], [{...lookup, unknown: true}], [{...lookup, matchField: ''}],
    [{...lookup, valueField: 1}], [{...lookup, sourceViewKey: 'Users@default'}], [lookup, lookup]])('rejects invalid lookup configuration %j', filterLookups => {
    expect(() => DataViewQuery.parse({filterLookups})).toThrow('filterLookups')
  })
  it('copies lookup declarations, checks target fields and excludes them from backend options', () => {
    const input = {filterLookups: [{...lookup}]}
    const parsed = DataViewQuery.parse(input)
    input.filterLookups[0]!.matchField = 'changed'
    expect(parsed.filterLookups?.[0]?.matchField).toBe('name')
    expect(Object.isFrozen(parsed.filterLookups?.[0])).toBe(true)
    expect(DataViewQuery.capture(parsed)).toEqual({})
    expect(() => DataViewQuery.validateFields(parsed, new Set(['other']))).toThrow('filterLookups')
  })
  it('applies lookup filters to static configuration rows and restores all rows on reset', async () => {
    const ds = DataSet.fromJson({dataSetName: 'Queries', scenarioId: 'Queries', tables: {
      Items: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}],
        views: {default: {rows: [{id: 'A'}, {id: 'B'}], queryConfig: {filterLookups: [lookup]}}}},
      Users: {resourceType: 'static-data', columns: [{name: 'code', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}],
        views: {default: {rows: [{code: 'A', name: '张三'}, {code: 'B', name: '李四'}]}}},
    }})
    sets.push(ds)
    const view = ds.getView('Items')!, source = ds.getView('Users')!
    const rows = source.rows
    expect(await source.queryOptionRows({fields: ['code', 'name'], filter: {field: 'name', operator: 'contains', value: '张'}})).toEqual([{code: 'A', name: '张三'}])
    const apply = vi.spyOn(view, 'applyInMemoryCascade')
    await view.executeFilter({field: 'id', operator: 'contains', value: '张'})
    expect(view.loadingError).toBeNull()
    expect(apply).toHaveBeenCalledWith({field: 'id', operator: 'in', value: ['A']})
    expect(view.rows.map(row => row['id'])).toEqual(['A'])
    expect(source.rows).toBe(rows)
    expect(view.filterExpression).toEqual({field: 'id', operator: 'contains', value: '张'})
    vi.spyOn(source, 'queryOptionRows').mockRejectedValueOnce(new Error('lookup failed'))
    await view.refresh()
    expect(view.loadingError?.message).toBe('lookup failed')
    await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(view.rows.map(row => row['id'])).toEqual(['A'])
    await view.executeFilter(undefined)
    expect(view.rows.map(row => row['id'])).toEqual(['A', 'B'])
  })
  it('preserves a complete SelfRef output without inventing a node query', async () => {
    const {view, load} = fixture()
    view.queryConfig = {outputType: 'SelfRefData', maxRows: 30}
    await view.refresh()
    expect(load.mock.calls[0]?.[0]).toMatchObject({outputType: 'SelfRefData', maxRows: 30})
    expect(load.mock.calls[0]?.[0]).not.toHaveProperty('tree')
    const restored = DataView.fromJson(view.toJson(), 'Nodes', 'restored')
    expect(restored.queryConfig).toEqual(view.queryConfig)
    restored.destroy()
  })
  it('keeps the same query shape through filter, sort, page and refresh, isolated from sibling views', async () => {
    const {ds, view, load} = fixture()
    view.queryConfig = {outputType: 'SelfRefData', tree, allPages: false, maxRows: 70, fields: ['id', 'parentId']}
    await view.refresh()
    await view.executeFilter({field: 'id', operator: 'ne', value: 'excluded'})
    await view.setSort([{field: 'id', direction: 'desc'}])
    await view.setPage(2)
    await view.setPageSize(5)
    expect(load).toHaveBeenCalledTimes(5)
    for (const [params] of load.mock.calls) expect(params).toMatchObject(view.queryConfig)
    expect(load.mock.calls[3]?.[0]).toMatchObject({page: 2, sort: 'id:desc', filter: {field: 'id', operator: 'ne', value: 'excluded'}})
    expect(ds.getView('Nodes', 'other')!.queryConfig).toEqual({})
    const restored = DataView.fromJson(view.toJson(), 'Nodes', 'restored')
    expect(restored.queryConfig).toEqual(view.queryConfig)
    restored.destroy()
  })

  it('does not reset request state when only autoQuery changes', () => {
    const {view} = fixture()
    view.queryConfig = {outputType: 'Table'}
    const afterSemantic = view.requestState
    view.queryConfig = {outputType: 'Table', autoQuery: true}
    expect(view.requestState).toBe(afterSemantic)
    view.queryConfig = {outputType: 'Join'}
    expect(view.requestState).toBe(RequestState.Idle)
    expect(DataViewQuery.differsOnlyInAutoQuery({autoQuery: true}, {})).toBe(true)
  })

  it('copies nested configuration and preserves explicit false, with empty configuration restoring defaults', async () => {
    const {view, load} = fixture(), config = {tree: {...tree}, allPages: false, fields: ['id']}
    view.queryConfig = config
    config.tree.nodeId = 'changed outside'
    config.fields.push('parentId')
    expect(view.queryConfig.fields).toEqual(['id'])
    expect(Object.isFrozen(view.queryConfig.fields)).toBe(true)
    expect(view.queryConfig.tree?.nodeId).toBe('root')
    expect(Object.isFrozen(view.queryConfig.tree)).toBe(true)
    view.queryConfig = {}
    await view.refresh()
    expect(load.mock.calls[0]?.[0]).not.toHaveProperty('tree')
    expect(view.toJson()).not.toHaveProperty('queryConfig')
  })

  it.each([{autoQuery: 'false'}, {autoQuery: 0}, {autoQuery: null}, {allPages: 'true'}, {maxRows: 0}, {outputType: 1}, {tree: {...tree, mode: 'other'}},
    {tree: {...tree, nodeId: ''}}, {tree: {...tree, extra: 1}},
    {outputType: 'Table', tree}, {token: 'forbidden'}, {fields: []}, {fields: ['id', 'id']}, {fields: ['']}, {fields: [1]}])('rejects invalid configuration atomically: %j', config => {
    const {view} = fixture()
    view.queryConfig = {outputType: 'Table', allPages: false}
    const before = view.queryConfig, state = view.requestState
    expect(() => Reflect.set(view, 'queryConfig', config)).toThrow()
    expect(view.queryConfig).toBe(before)
    expect(view.requestState).toBe(state)
  })

  it('uses current configuration in direct loads and refuses a late response after configuration changes', async () => {
    const {view, load} = fixture()
    load.mockRestore()
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {release = resolve})
    const seen: QueryParams[] = []
    vi.spyOn(view.crud, 'list').mockImplementation(async params => {
      if (params) seen.push(params)
      await gate
      return {success: true, data: [{id: 'old'}]}
    })
    view.queryConfig = {outputType: 'Join'}
    const pending = view.loadFromServer()
    view.queryConfig = {outputType: 'Table'}
    release?.()
    expect((await pending).success).toBe(false)
    expect(seen[0]?.outputType).toBe('Join')
    expect(view.rows).toEqual([])
  })
})
