import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet, DataViewQuery} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceDesignApi} from '../../../design/data-space-design-api'
import {DataSpaceRuntimeApi} from '../../data-space-runtime-api'
import {captureDataSpaceViewQuery} from '../../query/data-space-query-options'

class JoinHttp extends HttpClientBase {
  readonly calls: RequestConfig[] = []
  rowExtras: Record<string, unknown> = {}
  nestedRowExtras?: readonly Record<string, unknown>[]
  responseGate?: Promise<void>
  beforeResponse?: () => void
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    this.beforeResponse?.()
    await this.responseGate
    return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: true, data: {Items: [
      {orderId: 'P', caption: 'Parent', detailId: 'C1', detailName: 'One', ...this.rowExtras, ...this.nestedRowExtras?.[0]},
      {orderId: 'P', caption: 'Parent', detailId: 'C2', detailName: 'Two', ...this.rowExtras, ...this.nestedRowExtras?.[1]},
    ], Count: 2}}}, status: 200, statusText: 'OK', headers: {}}
  }
}
const sets: DataSet[] = []
afterEach(() => sets.splice(0).forEach(set => set.destroy()))
function setup(override: Record<string, unknown> = {}, fieldOverride: Record<string, unknown> = {}, keyAlias = 'detailId', rootKeyAlias = 'orderId') {
  const root = DataSpaceDesignApi.projectModel({rowid: 'ROOT', Name: 'Orders', Type: '数据库表', MetaName: 'PhysicalOrders',
    DbId: 'DB', ShortName: 'p', PrimaryKeyFields: 'rowid'}, [
    {rowid: 'RK', dataModelId: 'ROOT', Name: 'rowid', AsName: rootKeyAlias, FieldType: 'string', IsOutput: 1},
    {rowid: 'RN', dataModelId: 'ROOT', Name: 'Name', AsName: 'caption', FieldType: 'string', IsOutput: 1},
  ], 'rowid')
  const child = DataSpaceDesignApi.projectModel({rowid: 'CHILD', Name: 'Details', Type: '数据库表', MetaName: 'PhysicalDetails',
    DbId: 'DB', ShortName: 'c', PId: 'Orders', JoinType: 'LEFT', JoinFilter: 'c.parentId=p.rowid', PrimaryKeyFields: 'rowid', ...override}, [
    {rowid: 'CK', dataModelId: 'CHILD', Name: 'rowid', AsName: keyAlias, FieldType: 'string', IsOutput: 1},
    {rowid: 'CN', dataModelId: 'CHILD', Name: 'title', AsName: 'detailName', FieldType: 'string', IsOutput: 1, ...fieldOverride},
  ], 'rowid')
  const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: {RootConfig: {tableName: 'RootConfig', resourceType: 'database-table',
    modelBinding: {modelId: 'ROOT', modelName: 'Orders'}, columns: [{name: rootKeyAlias, type: 'string', isPrimaryKey: true},
      {name: 'caption', type: 'string', label: 'Parent caption'}], views: {default: {}, sibling: {}}},
  DetailConfig: {tableName: 'DetailConfig', resourceType: 'database-table', modelBinding: {modelId: 'CHILD', modelName: 'Details'},
    columns: [{name: keyAlias, type: 'string', isPrimaryKey: true}, {name: String(fieldOverride['AsName'] ?? 'detailName'), type: 'string', label: 'Detail caption'}], views: {default: {}}}}})
  sets.push(ds)
  let scope = 'SCOPE'
  const http = new JoinHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: scope, headers: {}})})
  const view = ds.getView('RootConfig')!, childView = ds.getView('DetailConfig')!
  runtime.bindModelView(view, root); runtime.bindModelView(childView, child)
  view.queryConfig = {outputType: 'Join', children: [{modelName: 'Details', fields: ['detailId', 'detailName'],
    filter: {field: 'detailName', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'search'}}}]}
  view.queryContext = {search: 'One'}
  return {ds, view, runtime, http, root, formalChild: child, setScope: (next: string) => {scope = next}}
}

describe('public DataView explicit Join query', () => {
  it('resolves formal model names rather than internal table keys and binds flat result columns', async () => {
    const {ds, view, http} = setup()
    const before = JSON.stringify(ds.toJson())
    await view.loadFromServer()
    const request = http.calls[0]?.data as {Table: Record<string, unknown>[]}
    expect(request.Table[0]).toMatchObject({Name: 'Orders', OutputType: 'Join', ChildTables: [{Name: 'Details',
      IsBusinessMain: 0, ChildTables: [], Fields: [{Name: 'rowid'}, {Name: 'title'}],
      Filter: {Field: 'title', ValueFun: {Type: 'GetConstValue', Value: 'One'}}}]})
    expect(view.resultKind).toBe('join')
    expect(view.rows.map(row => row['detailId'])).toEqual(['C1', 'C2'])
    expect(view.columns.map(column => column.name)).toEqual(['orderId', 'caption', 'detailId', 'detailName'])
    expect(view.getColumn('detailName')?.label).toBe('Detail caption')
    expect(view.getColumn('detailName')).not.toBe(ds.getTable('DetailConfig')!.columns[1])
    expect(view.primaryKey).toBe('')
    expect(ds.getView('RootConfig', 'sibling')!.getColumn('detailName')).toBeUndefined()
    expect(JSON.stringify(ds.toJson())).toBe(before)
  })

  it.each([{DbId: 'OTHER'}, {PId: 'ROOT'}, {JoinType: ''}, {JoinFilter: ''}, {Type: '字典'}])(
    'rejects invalid formal child source before dispatch %j', async override => {
      const {view, http} = setup(override)
      await expect(view.loadFromServer()).rejects.toThrow(/SPARK_JOIN/)
      expect(http.calls).toHaveLength(0)
    })

  it('rejects an internal child table key and unknown child output before dispatch', async () => {
    const {view, http} = setup()
    for (const child of [{modelName: 'DetailConfig', fields: ['detailId']}, {modelName: 'Details', fields: ['title']}]) {
      view.queryConfig = {outputType: 'Join', children: [child]}
      await expect(view.loadFromServer()).rejects.toThrow(/SPARK_JOIN/)
    }
    expect(http.calls).toHaveLength(0)
  })

  it('keeps child result columns out of subsequent root requests and reuses an identical page cache', async () => {
    const {view, http} = setup()
    view.queryConfig = {...view.queryConfig, cacheType: 'page'}
    await view.loadFromServer()
    await view.loadFromServer()
    expect(http.calls).toHaveLength(1)
    view.queryContext = {search: 'Two'}
    await view.loadFromServer()
    expect(http.calls).toHaveLength(2)
    expect(http.calls[1]?.data).toMatchObject({Table: [{Fields: [{Name: 'rowid'}, {Name: 'Name'}], ChildTables: [
      {Filter: {ValueFun: {Value: 'Two'}}},
    ]}]})
  })

  it('rejects a removed child table during response and while reading an accepted context', async () => {
    const {ds, view, http, runtime} = setup()
    const context = await runtime.executeQuery(view, DataViewQuery.capture(view.queryConfig))
    const child = ds.tables['DetailConfig']!
    delete ds.tables['DetailConfig']
    expect(() => context.rows).toThrow('SPARK_JOIN_STALE')
    ds.tables['DetailConfig'] = child
    http.beforeResponse = () => {delete ds.tables['DetailConfig']}
    await expect(view.loadFromServer()).rejects.toThrow('SPARK_JOIN_STALE')
    ds.tables['DetailConfig'] = child
  })

  it('does not expose undeclared response fields through the formal result context', async () => {
    const {view, runtime, http} = setup()
    http.rowExtras = {undeclared: 'not in this projection'}
    const context = await runtime.executeQuery(view, DataViewQuery.capture(view.queryConfig))
    expect(context.rows[0]).not.toHaveProperty('undeclared')
    expect(context.readFieldAccess(context.rows[0]!, 'undeclared')).toBe('invisible')
  })

  it.each([{ShortName: 'p'}])('rejects conflicting formal graph %j', async override => {
    const {view, http} = setup(override)
    await expect(view.loadFromServer()).rejects.toThrow(/SPARK_JOIN/)
    expect(http.calls).toHaveLength(0)
  })

  it('rejects a root cycle and a child aggregate before dispatch', async () => {
    const first = setup()
    first.view.queryConfig = {outputType: 'Join', children: [{modelName: 'Orders', fields: ['orderId']}]}
    await expect(first.view.loadFromServer()).rejects.toThrow('SPARK_JOIN_CYCLE')
    expect(first.http.calls).toHaveLength(0)
    const second = setup({}, {Group: 1})
    await expect(second.view.loadFromServer()).rejects.toThrow('SPARK_JOIN_AGGREGATE')
    expect(second.http.calls).toHaveLength(0)
  })

  it('does not inject an omitted root key into a child output with the same physical key name', async () => {
    const {view, http} = setup({}, {}, 'rowid')
    view.queryConfig = {outputType: 'Join', fields: ['caption'], children: [{modelName: 'Details', fields: ['rowid']}]}
    http.rowExtras = {rowid: 'child-value'}
    await view.loadFromServer()
    expect(http.calls[0]?.data).toMatchObject({Table: [{Fields: [{Name: 'Name'}], ChildTables: [{Fields: [{Name: 'rowid'}]}]}]})
    expect(view.columns.map(column => column.name)).toEqual(['caption', 'rowid'])
    expect(view.rows[0]).toMatchObject({caption: 'Parent', rowid: 'child-value'})
    expect(view.rows[0]).not.toHaveProperty('orderId')
  })

  it('keeps exact-row hidden and masked state without granting signed Join mutations', async () => {
    const {view, runtime, http} = setup()
    http.rowExtras = {lingma_sys_key: 'SIGNED', lingma_sys_params: {e: ['detailName'], h: ['caption'], m: ['detailName'], d: true}}
    const context = await runtime.executeQuery(view, DataViewQuery.capture(view.queryConfig))
    const row = context.rows[0]!
    expect(context.readFieldAccess(row, 'caption')).toBe('invisible')
    expect(context.readFieldAccess(row, 'detailName')).toBe('masked')
    expect(context.readFieldAccess({...row}, 'detailName')).toBe('invisible')
    expect(context.allowAdd).toBe(false)
    expect(() => context.prepareSaveChanges({deleted: [row]})).toThrow('SPARK_JOIN_RESULT_READONLY')
  })

  it('keeps simultaneous named-view projections independent when one view is released', async () => {
    const {ds, view, runtime, root} = setup()
    const second = ds.getView('RootConfig', 'sibling')!
    runtime.bindModelView(second, root)
    second.queryConfig = view.queryConfig
    second.queryContext = view.queryContext
    const contexts = await Promise.all([runtime.executeQuery(view, DataViewQuery.capture(view.queryConfig)),
      runtime.executeQuery(second, DataViewQuery.capture(second.queryConfig))])
    view.destroy()
    expect(() => contexts[0]!.rows).toThrow('SPARK_JOIN_STALE')
    expect(contexts[1]!.rows).toHaveLength(2)
  })

  it('maps and captures a grandchild filter and leaf descriptor through the same public query', async () => {
    const {ds, view, http, runtime} = setup()
    const formal = DataSpaceDesignApi.projectModel({rowid: 'GRAND', Name: 'Products', Type: '数据库表', DbId: 'DB',
      MetaName: 'PhysicalProducts', ShortName: 'g', PId: 'Details', JoinType: 'INNER', JoinFilter: 'g.parentId=c.rowid', PrimaryKeyFields: 'rowid'}, [
      {rowid: 'GK', dataModelId: 'GRAND', Name: 'rowid', AsName: 'productId', FieldType: 'string', IsOutput: 1},
      {rowid: 'GN', dataModelId: 'GRAND', Name: 'title', AsName: 'productLabel', FieldType: 'string', IsOutput: 1},
    ], 'rowid')
    const table = ds.addTableFromJson({tableName: 'ProductConfig', resourceType: 'database-table',
      modelBinding: {modelId: 'GRAND', modelName: 'Products'}, columns: [{name: 'productId', type: 'string', isPrimaryKey: true},
        {name: 'productLabel', type: 'string'}], views: {default: {}}})
    runtime.bindModelView(table.getView('default')!, formal)
    const child = view.queryConfig.children![0]!
    view.queryConfig = {...view.queryConfig, children: [{...child, children: [{modelName: 'Products', fields: ['productId', 'productLabel'],
      filter: {field: 'productLabel', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'search'}}}]}]}
    http.rowExtras = {productId: 'G', productLabel: 'One'}
    await view.loadFromServer()
    expect(http.calls[0]?.data).toMatchObject({Table: [{ChildTables: [{Name: 'Details', ChildTables: [{Name: 'Products',
      IsBusinessMain: 0, ChildTables: [], Fields: [{Name: 'rowid'}, {Name: 'title'}], Filter: {Field: 'title', ValueFun: {Value: 'One'}}}]}]}]})
    expect(view.columns.map(column => column.name)).toEqual(['orderId', 'caption', 'detailId', 'detailName', 'productId', 'productLabel'])
    expect(view.rows[0]?.['productLabel']).toBe('One')
  })
})


describe('formal nested graph owner', () => {
  it.each(['Navigation', 'HierarchyData'] as const)('publishes independent child results through %s DataView', async outputType => {
    const {view, http} = setup()
    view.queryConfig = DataViewQuery.parse({outputType, pagination: 'none', children: [{modelName: 'Details', fields: ['detailId', 'detailName']}]})
    http.rowExtras = {[outputType === 'Navigation' ? 'Details' : 'Items']: [{detailId: 'C', detailName: 'child',
      lingma_sys_key: 'CHILD', lingma_sys_params: {m: ['detailName'], e: ['detailName']}}]}
    await view.loadFromServer()
    expect(view.resultKind).toBe(outputType === 'Navigation' ? 'navigation' : 'hierarchy')
    expect(view.primaryKey).toBe('')
    expect(view.columns.map(column => column.name)).toEqual(['orderId', 'caption'])
    const child = view.readChildResult('Details')
    expect(child.rows[0]?.['detailId']).toBe('C')
    expect(child.readFieldAccess(child.rows[0]!, 'detailName')).toBe('masked')
    expect(child.resultPrimaryKey).toBe('')
    const request = http.calls[0]?.data as {Table: Record<string, unknown>[]}
    expect(request.Table[0]).toMatchObject({OutputType: outputType, ChildTables: [{Name: 'Details', OutputType: outputType}]})
    expect(http.calls).toHaveLength(1)
  })
})


it('keeps nested SQL source and field namespaces per model rather than applying flat Join limits', async () => {
  const {view, http} = setup({ShortName: 'p', DbId: 'OTHER'}, {}, 'orderId')
  view.queryConfig = {outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Details', fields: ['orderId', 'detailName']}]}
  http.rowExtras = {Details: [{orderId: 'C', detailName: 'Child'}]}
  await view.loadFromServer()
  expect(view.readChildResult('Details').rows[0]?.['orderId']).toBe('C')
  expect(http.calls).toHaveLength(1)
})


it('keeps a formal Foreign-only nested plan distinct from flat SQL Join requirements', async () => {
  const {view, http} = setup({JoinType: '', JoinFilter: '', ForeignKeyFields: 'parentId'})
  view.queryConfig = {outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Details', fields: ['detailId']}]}
  http.rowExtras = {Details: []}
  await view.loadFromServer()
  expect(view.readChildResult('Details').rows).toEqual([])
  expect(http.calls).toHaveLength(1)
})


it('does not invent a Foreign metadata member as a nested relation contract', async () => {
  const {view, http} = setup({JoinType: '', JoinFilter: '', Foreign: 'parentId'})
  view.queryConfig = {outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Details', fields: ['detailId']}]}
  await expect(view.loadFromServer()).rejects.toThrow('RELATION')
  expect(http.calls).toHaveLength(0)
})


it.each(['Join', 'Navigation'])('requires an actual database identity rather than the PId source fallback for %s', async outputType => {
  const {view, http} = setup({DbId: ''})
  view.queryConfig = DataViewQuery.parse({outputType, pagination: 'none', children: [{modelName: 'Details', fields: ['detailId']}]})
  await expect(view.loadFromServer()).rejects.toThrow('SOURCE')
  expect(http.calls).toHaveLength(0)
})


it('uses exact original parent references for duplicate keys and refuses stale parent reads', async () => {
  const {view, http} = setup()
  view.queryConfig = {outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Details', fields: ['detailId']}]}
  http.nestedRowExtras = [{Details: [{detailId: 'FIRST'}]}, {Details: [{detailId: 'SECOND'}]}]
  await view.loadFromServer()
  expect(view.readChildResult('Details').rows[0]?.['detailId']).toBe('FIRST')
  view.setCurrentRow(view.rows[1]!)
  const second = view.readChildResult('Details')
  expect(second.rows[0]?.['detailId']).toBe('SECOND')
  view.queryContext = {search: 'changed'}
  expect(() => view.readChildResult('Details')).toThrow('READ_RESULT')
  view.destroy()
  expect(() => second.rows).toThrow('STALE')
})


it('binds a named child view to the current parent result without a second HTTP query', async () => {
  const {ds, view, http} = setup()
  view.queryConfig = {outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Details', fields: ['detailId', 'detailName']}]}
  http.nestedRowExtras = [{Details: [{detailId: 'FIRST', detailName: 'One'}]}, {Details: [{detailId: 'SECOND', detailName: 'Two'}]}]
  const child = ds.getView('DetailConfig')!
  child.queryConfig = DataViewQuery.parse({pagination: 'none', parentResult: {dataViewKey: 'SPACE@Orders@default', childModelName: 'Details'}})
  await child.requestData()
  expect(child.readSnapshot().rows[0]?.['detailId']).toBe('FIRST')
  expect(child.resultKind).toBe('navigation')
  expect(child.primaryKey).toBe('')
  expect(http.calls).toHaveLength(1)
  view.setCurrentRow(view.rows[1]!)
  expect(() => child.readSnapshot()).toThrow()
  await child.requestData()
  expect(child.readSnapshot().rows[0]?.['detailId']).toBe('SECOND')
  expect(http.calls).toHaveLength(1)
})


function parentResultViews(autoQuery = true) {
  const fixture = setup(), {ds, view, http} = fixture
  view.queryConfig = {outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Details', fields: ['detailId', 'detailName']}]}
  http.nestedRowExtras = [{Details: [{detailId: 'FIRST', detailName: 'One'}]}, {Details: [{detailId: 'SECOND', detailName: 'Two'}]}]
  const child = ds.getView('DetailConfig')!
  child.queryConfig = {pagination: 'none', autoQuery, parentResult: {dataViewKey: 'SPACE@Orders@default', childModelName: 'Details'}}
  return {...fixture, child}
}
describe('named parent-result lifecycle', () => {
  it('keeps manual children stale until explicit refresh and accepts an empty parent', async () => {
    const {view, child, http} = parentResultViews(false)
    await child.requestData()
    view.setCurrentRow(view.rows[1]!)
    expect(child.rows).toEqual([])
    expect(() => child.readSnapshot()).toThrow()
    await child.refresh()
    expect(child.readSnapshot().rows[0]?.['detailId']).toBe('SECOND')
    view.setCurrentRow(null)
    await child.refresh()
    expect(child.readSnapshot().rows).toEqual([])
    expect(child.countReported).toBe(false)
    expect(child.primaryKey).toBe('')
    expect(http.calls).toHaveLength(1)
  })
  it('waits for a direct in-flight parent query without duplicating HTTP', async () => {
    const {view, child, http} = parentResultViews()
    let release: (() => void) | undefined
    http.responseGate = new Promise<void>(resolve => {release = resolve})
    const parent = view.loadFromServer(), derived = child.loadFromServer()
    await Promise.resolve()
    expect(http.calls).toHaveLength(1)
    release?.(); await Promise.all([parent, derived])
    expect(child.readSnapshot().rows[0]?.['detailId']).toBe('FIRST')
    expect(http.calls).toHaveLength(1)
  })
  it('rejects a parent switch during asynchronous child validation', async () => {
    const {view, child, http} = parentResultViews(false)
    await view.loadFromServer()
    let release: (() => void) | undefined, entered: (() => void) | undefined
    const ready = new Promise<void>(resolve => {entered = resolve})
    child.validateQueryResult = () => {entered?.(); return new Promise<void>(resolve => {release = resolve})}
    const pending = child.loadFromServer()
    await ready
    view.setCurrentRow(view.rows[1]!)
    release?.()
    await expect(pending).rejects.toThrow('PARENT_STALE')
    expect(child.rows).toEqual([])
    child.validateQueryResult = undefined
    await child.refresh()
    expect(child.readSnapshot().rows[0]?.['detailId']).toBe('SECOND')
    expect(http.calls).toHaveLength(1)
  })
  it('does not invalidate parent cache or another child consumer when one child is refreshed or destroyed', async () => {
    const {view, child, runtime, http} = parentResultViews()
    view.queryConfig = {...view.queryConfig, cacheType: 'page'}
    const other = child.createQueryView('other')
    await child.requestData(); await other.requestData()
    const invalidate = vi.spyOn(runtime, 'invalidateQueryCache'), release = vi.spyOn(runtime, 'releaseQueryCache')
    await child.refresh()
    expect(invalidate).not.toHaveBeenCalled()
    child.destroy()
    expect(release).not.toHaveBeenCalled()
    expect(other.readSnapshot().rows[0]?.['detailId']).toBe('FIRST')
    await view.loadFromServer()
    expect(http.calls).toHaveLength(1)
  })
  it('clears old children on parent failure without retrying parent HTTP', async () => {
    const {view, child, http} = parentResultViews()
    await child.requestData()
    http.beforeResponse = () => {throw new Error('parent unavailable')}
    await view.refresh()
    expect(child.rows).toEqual([])
    expect(() => child.readSnapshot()).toThrow()
    const calls = http.calls.length
    await child.refresh()
    expect(http.calls).toHaveLength(calls)
    expect(() => child.readSnapshot()).toThrow()
  })
  it('releases a parent dependency before its listeners disappear', async () => {
    const {view, child} = parentResultViews()
    await child.requestData()
    view.destroy()
    expect(child.rows).toEqual([])
    expect(() => child.readSnapshot()).toThrow()
  })
  it.each(['filter', 'sort', 'fields'] as const)('rejects an independent child %s before any HTTP', async key => {
    const {child, http} = parentResultViews()
    const params = key === 'filter' ? {filter: {field: 'detailId', operator: 'eq' as const, value: 'C'}}
      : key === 'sort' ? {sort: 'detailId:asc'} : {fields: ['detailId']}
    await expect(child.loadFromServer(params)).rejects.toThrow(/PARENT_QUERY|parentResult/)
    expect(http.calls).toHaveLength(0)
  })
  it('rejects cross-space, wrong model and cyclic parent bindings before HTTP', () => {
    const {child, view, http} = parentResultViews()
    for (const parentResult of [
      {dataViewKey: 'OTHER@Orders@default', childModelName: 'Details'},
      {dataViewKey: 'SPACE@Orders@default', childModelName: 'Orders'},
    ]) expect(() => {child.queryConfig = {pagination: 'none', parentResult}}).toThrow(/PARENT/)
    child.queryConfig = {pagination: 'none', parentResult: {dataViewKey: 'SPACE@Orders@default', childModelName: 'Details'}}
    expect(() => {view.queryConfig = {pagination: 'none', parentResult: {dataViewKey: 'SPACE@Details@default', childModelName: 'Orders'}}}).toThrow('CYCLE')
    expect(http.calls).toHaveLength(0)
  })
  it.each(['h', 'm'] as const)('consumes child %s independently of the parent and rejects all mutations', async permission => {
    const {child, http} = parentResultViews()
    http.rowExtras = {lingma_sys_key: 'PARENT', lingma_sys_params: {h: ['caption']}}
    http.nestedRowExtras = [{Details: [{detailId: 'C', detailName: 'Private', lingma_sys_key: 'CHILD',
      lingma_sys_params: {[permission]: ['detailName'], e: ['detailName'], d: true}}]}, {Details: []}]
    await child.requestData()
    const row = child.readSnapshot().rows[0]!
    if (permission === 'h') expect(row).not.toHaveProperty('detailName')
    else expect(row['detailName']).toBe('••••')
    expect(row).not.toHaveProperty('lingma_sys_key')
    expect(child.addActionState()).not.toBe('enabled')
    await expect(child.editRowById('C', {detailName: 'Changed'})).rejects.toThrow()
    expect(() => child.deleteRowById('C')).toThrow()
    expect(http.calls).toHaveLength(1)
  })
})


it.each([{context: {search: 'ignored'}}, {projection: []}])('does not silently ignore an independent derived query input %j', async params => {
  const {child, http} = parentResultViews()
  await expect(child.loadFromServer(params)).rejects.toThrow('PARENT_QUERY')
  expect(http.calls).toHaveLength(0)
})


it('retains the latest automatic parent change while an earlier child acceptance is pending', async () => {
  const {view, child, http} = parentResultViews(false)
  await view.loadFromServer()
  child.queryConfig = {...child.queryConfig, autoQuery: true}
  let release: (() => void) | undefined, entered: (() => void) | undefined, first = true
  const ready = new Promise<void>(resolve => {entered = resolve})
  child.validateQueryResult = () => {
    if (!first) return
    first = false; entered?.()
    return new Promise<void>(resolve => {release = resolve})
  }
  const pending = child.loadFromServer()
  await ready
  view.setCurrentRow(view.rows[1]!)
  release?.()
  await expect(pending).rejects.toThrow('PARENT_STALE')
  await vi.waitFor(() => expect(child.readSnapshot().rows[0]?.['detailId']).toBe('SECOND'))
  expect(http.calls).toHaveLength(1)
})

it('keeps a valid parent binding and its subscriptions after an invalid configuration is rejected', async () => {
  const {view, child, http} = parentResultViews()
  await child.requestData()
  const before = child.toJson().queryConfig
  expect(() => {child.queryConfig = {pagination: 'none', parentResult: {dataViewKey: 'WRONG@Orders@default', childModelName: 'Details'}}}).toThrow('PARENT_SCOPE')
  expect(child.toJson().queryConfig).toEqual(before)
  view.setCurrentRow(view.rows[1]!)
  expect(child.rows).toEqual([])
  await child.requestData()
  expect(child.readSnapshot().rows[0]?.['detailId']).toBe('SECOND')
  expect(http.calls).toHaveLength(1)
})


it('rejects a separately configured child projection before querying its parent', async () => {
  const {child, http} = parentResultViews()
  child.fieldProjection = child.fieldProjection.slice(0, 1)
  await expect(child.loadFromServer()).rejects.toThrow('PARENT_QUERY')
  expect(http.calls).toHaveLength(0)
})


it('compares default projection metadata without depending on object property order', async () => {
  const {child, http} = parentResultViews()
  child.fieldProjection = child.fieldProjection.map(field => {
    const {viewField, resourceField, ...rest} = field
    return {viewField, resourceField, ...rest}
  })
  await child.requestData()
  expect(child.readSnapshot().rows[0]?.['detailId']).toBe('FIRST')
  expect(http.calls).toHaveLength(1)
})

it('does not issue upstream queries for a conflicting independent query cascade', async () => {
  const {ds, child, http} = parentResultViews()
  ds.addCascade({parentTable: 'RootConfig', parentViewId: 'default', childTable: 'DetailConfig', childViewId: 'default',
    filterBindings: [{sourceField: 'orderId', targetField: 'detailId'}]})
  await expect(child.requestData()).rejects.toThrow('PARENT_QUERY')
  expect(http.calls).toHaveLength(0)
})


it('preserves a current child result when only the parent autoQuery preference changes', async () => {
  const {view, child, http} = parentResultViews()
  await child.requestData()
  view.queryConfig = {...view.queryConfig, autoQuery: false}
  expect(child.readSnapshot().rows[0]?.['detailId']).toBe('FIRST')
  expect(http.calls).toHaveLength(1)
})


it('restores a configured parent-result DataSet before any view owner is bound', () => {
  const {ds} = parentResultViews()
  const restored = DataSet.fromJson(ds.toJson())
  sets.push(restored)
  expect(restored.getView('DetailConfig')!.queryConfig.parentResult?.dataViewKey).toBe('SPACE@Orders@default')
})


it('preserves the parent query error when projection and native rows change before query acceptance', async () => {
  const {view, child} = parentResultViews(false)
  await view.loadFromServer()
  const pending = child.loadFromServer()
  child.fieldProjection = child.fieldProjection.slice(0, 1)
  const nativeRow = {detailId: 'LOCAL', detailName: 'Unsent'}
  child.rows.push(nativeRow)
  await expect(pending).rejects.toThrow('PARENT_QUERY')
  expect(child.rows[0]).toBe(nativeRow)
})

it('rejects child projection changes during asynchronous acceptance and after publication', async () => {
  const {view, child, http} = parentResultViews(false)
  await view.loadFromServer()
  let release: (() => void) | undefined, entered: (() => void) | undefined
  const ready = new Promise<void>(resolve => {entered = resolve})
  child.validateQueryResult = () => {entered?.(); return new Promise<void>(resolve => {release = resolve})}
  const pending = child.loadFromServer()
  await ready
  const original = child.fieldProjection
  child.fieldProjection = original.slice(0, 1)
  release?.()
  await expect(pending).rejects.toThrow('PARENT_QUERY')
  expect(child.rows).toEqual([])
  child.fieldProjection = original; child.validateQueryResult = undefined
  await child.refresh()
  expect(() => {child.filterExpression = {field: 'detailId', operator: 'eq', value: 'ignored'}}).toThrow('PARENT_QUERY')
  expect(child.readSnapshot().rows[0]?.['detailId']).toBe('FIRST')
  expect(http.calls).toHaveLength(1)
})


it('rejects independent child sort and filter commands before changing accepted state', async () => {
  const {child, http} = parentResultViews(false)
  await child.requestData()
  const assertOriginal = child.captureReadRow(child.rows[0]!,['detailId','detailName']), before = JSON.stringify(child.toJson())
  for (const run of [
    () => child.setSort([{field: 'detailName', direction: 'asc'}]),
    () => child.setSort(undefined),
    () => child.setFilter({field: 'detailName', operator: 'eq', value: 'One'}),
    () => child.executeFilter(undefined),
  ]) {
    await expect(run()).rejects.toThrow('DATA_VIEW_PARENT_QUERY')
    expect(JSON.stringify(child.toJson())).toBe(before)
    expect(assertOriginal).not.toThrow()
    expect(child.rows[0]?.['detailId']).toBe('FIRST')
    expect(http.calls).toHaveLength(1)
  }
})


it('restores named parentResult views before their DataTable and DataSet are attached', () => {
  const {ds} = parentResultViews(false)
  const json = ds.toJson()
  for (const table of Object.values(json.tables)) {
    const saved = table.views.default!
    table.views = {default: {}, smoke: {...saved, viewId: 'smoke', ...(saved.queryConfig?.parentResult ? {
      queryConfig: {...saved.queryConfig, parentResult: {...saved.queryConfig.parentResult, dataViewKey: 'SPACE@Orders@smoke'}},
    } : {})}}
  }
  json.tables = Object.fromEntries(Object.entries(json.tables).reverse())
  const restored = DataSet.fromJson(json)
  try {
    const child = restored.getView('DetailConfig', 'smoke')!
    expect(child.dataTable).toBe(restored.getTable('DetailConfig'))
    expect(child.dataSet).toBe(restored)
    expect(child.queryConfig.parentResult?.dataViewKey).toBe('SPACE@Orders@smoke')
  } finally {restored.destroy()}
})


it.each(['scope', 'missing', 'identity', 'cycle'] as const)('still rejects invalid named parentResult %s after native attachment', kind => {
  const {ds} = parentResultViews(false), json = ds.toJson()
  for (const table of Object.values(json.tables)) {
    const saved = table.views.default!
    table.views = {default: {}, smoke: {...saved, viewId: 'smoke', ...(saved.queryConfig?.parentResult ? {
      queryConfig: {...saved.queryConfig, parentResult: {...saved.queryConfig.parentResult, dataViewKey: 'SPACE@Orders@smoke'}},
    } : {})}}
  }
  const child = json.tables['DetailConfig']!.views['smoke']!, parent = json.tables['RootConfig']!.views['smoke']!
  const source = child.queryConfig!.parentResult!
  if (kind === 'scope') child.queryConfig = {...child.queryConfig, parentResult: {...source, dataViewKey: 'OTHER@Orders@smoke'}}
  if (kind === 'missing') child.queryConfig = {...child.queryConfig, parentResult: {...source, dataViewKey: 'SPACE@Orders@missing'}}
  if (kind === 'identity') child.queryConfig = {...child.queryConfig, parentResult: {...source, childModelName: 'Other'}}
  if (kind === 'cycle') parent.queryConfig = {pagination: 'none', autoQuery: false, parentResult: {dataViewKey: 'SPACE@Details@smoke', childModelName: 'Orders'}}
  expect(() => DataSet.fromJson(json)).toThrow(kind === 'scope' ? 'PARENT_SCOPE' : kind === 'identity' ? 'PARENT_MODEL' : kind === 'cycle' ? 'PARENT_CYCLE' : 'PARENT_SOURCE')
})


it('captures parameterized definition filters without binding missing runtime inputs', () => {
  const {view, http} = setup()
  view.queryContext = {}
  const filter = {field: 'caption', operator: 'eq' as const, value: {Type: 'GetInputParam' as const, ParamName: 'rootSearch'}}
  view.filterExpression = filter
  const params = {...DataViewQuery.capture(view.queryConfig), filter}
  const before = JSON.stringify(view.toJson())
  const captured = captureDataSpaceViewQuery(view, params, {bindInputParams: false})
  expect(captured.options.filter?.toJSON()).toEqual(filter)
  expect(captured.options.children?.[0]?.filter).toMatchObject({value: {Type: 'GetInputParam', ParamName: 'search'}})
  expect(() => captureDataSpaceViewQuery(view, params)).toThrow()
  expect(JSON.stringify(view.toJson())).toBe(before)
  expect(http.calls).toHaveLength(0)
})

it('validates a named child definition against its own parent nested plan without querying rows', () => {
  const {ds, view, child, runtime, http} = parentResultViews(false)
  view.queryContext = {}
  const before = JSON.stringify(ds.toJson())
  expect(() => runtime.validateQueryDefinitions(ds)).not.toThrow()
  expect(JSON.stringify(ds.toJson())).toBe(before)
  expect(http.calls).toHaveLength(0)
  view.queryConfig = {outputType: 'Table', pagination: 'none'}
  expect(() => runtime.validateQueryDefinitions(ds)).toThrow('SPARK_PARENT_PLAN')
  expect(child.requestState).toBe(0)
  expect(http.calls).toHaveLength(0)
})


it.each(['Table', 'Join'] as const)('does not borrow a sibling nested plan when the named parent is %s', outputType => {
  const {ds, view, child, runtime, http, root} = parentResultViews(false)
  const sibling = ds.getView('RootConfig', 'sibling')!
  runtime.bindModelView(sibling, root)
  sibling.queryConfig = view.queryConfig
  view.queryConfig = {outputType, pagination: 'none'}
  expect(() => runtime.validateQueryDefinitions(ds)).toThrow('SPARK_PARENT_PLAN')
  child.queryConfig = {...child.queryConfig, parentResult: {dataViewKey: 'SPACE@Orders@sibling', childModelName: 'Details'}}
  expect(() => runtime.validateQueryDefinitions(ds)).not.toThrow()
  expect(http.calls).toHaveLength(0)
})

it.each(['Navigation', 'HierarchyData'] as const)('inherits an effective grandchild plan through a derived parent in %s', outputType => {
  const {ds, view, child, runtime, http} = parentResultViews(false)
  const formal = DataSpaceDesignApi.projectModel({rowid: 'GRAND', Name: 'Products', Type: '数据库表', DbId: 'DB',
    MetaName: 'PhysicalProducts', ShortName: 'g', PId: 'Details', JoinType: 'INNER', JoinFilter: 'g.parentId=c.rowid', PrimaryKeyFields: 'rowid'}, [
    {rowid: 'GK', dataModelId: 'GRAND', Name: 'rowid', AsName: 'productId', FieldType: 'string', IsOutput: 1},
  ], 'rowid')
  const table = ds.addTableFromJson({tableName: 'ProductConfig', resourceType: 'database-table',
    modelBinding: {modelId: 'GRAND', modelName: 'Products'}, columns: [{name: 'productId', type: 'string', isPrimaryKey: true}],
    views: {default: {}}})
  const leaf = table.getView('default')!
  runtime.bindModelView(leaf, formal)
  view.queryConfig = {outputType, pagination: 'none', children: [{modelName: 'Details', fields: ['detailId'],
    children: [{modelName: 'Products', fields: ['productId'], filter: {field: 'productId', operator: 'eq',
      value: {Type: 'GetInputParam', ParamName: 'missingDesignInput'}}}]}]}
  view.queryContext = {}
  leaf.queryConfig = {pagination: 'none', parentResult: {dataViewKey: 'SPACE@Details@default', childModelName: 'Products'}}
  const before = JSON.stringify(ds.toJson())
  expect(() => runtime.validateQueryDefinitions(ds)).not.toThrow()
  expect(JSON.stringify(ds.toJson())).toBe(before)
  leaf.queryConfig = {pagination: 'none', parentResult: {dataViewKey: 'SPACE@Orders@default', childModelName: 'Products'}}
  expect(() => runtime.validateQueryDefinitions(ds)).toThrow('SPARK_PARENT_PLAN')
  expect(child.requestState).toBe(0)
  expect(http.calls).toHaveLength(0)
})


it('rejects stale application scope during definition validation without requests or config changes', () => {
  const {ds, runtime, http, setScope} = parentResultViews(false)
  const before = JSON.stringify(ds.toJson())
  setScope('OTHER_APPLICATION')
  expect(() => runtime.validateQueryDefinitions(ds)).toThrow('SPARK_EXECUTION_SCOPE_STALE')
  expect(JSON.stringify(ds.toJson())).toBe(before)
  expect(http.calls).toHaveLength(0)
})


it('checks nested path collisions against implicitly restored root keys in both preparation paths', async () => {
  const {ds, view, runtime, http} = setup({}, {}, 'detailId', 'Details')
  view.queryConfig = {outputType: 'Navigation', pagination: 'none', fields: ['caption'],
    children: [{modelName: 'Details', fields: ['detailId']}]}
  const before = JSON.stringify(ds.toJson())
  expect(() => runtime.validateQueryDefinitions(ds)).toThrow('SPARK_NESTED_PATH')
  await expect(view.loadFromServer()).rejects.toThrow('SPARK_NESTED_PATH')
  expect(JSON.stringify(ds.toJson())).toBe(before)
  expect(http.calls).toHaveLength(0)
})


it('keeps mapped runtime values out of definition validation and ignores unrelated ordinary mappings', async () => {
  const fixture = setup(), {http, root, formalChild} = fixture
  const ds = DataSet.fromJson(fixture.ds.toJson()); sets.push(ds)
  const view = ds.getView('RootConfig')!
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
  runtime.bindModelView(ds.getView('DetailConfig')!, formalChild)
  runtime.bindModelView(view, {...root, sourceInputBindings: [{id: 'INPUT', name: 'source',
    valueFunction: {Type: 'GetInputParam', ParamName: 'requiredRuntimeValue'}}]})
  const table = ds.addTableFromJson({tableName: 'Unrelated', resourceType: 'api',
    modelBinding: {modelId: 'UNRELATED', modelName: 'OtherApi'}, columns: [{name: 'id', type: 'string'}], views: {default: {}}})
  const unrelated = DataSpaceDesignApi.projectModel({rowid: 'UNRELATED', Name: 'OtherApi', Type: '接口', MetaName: 'GetOther', PrimaryKeyFields: 'id'}, [
    {rowid: 'UF', dataModelId: 'UNRELATED', Name: 'id', FieldType: 'string', IsOutput: 1},
  ], 'id')
  runtime.bindModelView(table.getView('default')!, {...unrelated, sourceInputBindings: [{id: 'UNSET', name: 'unconfigured'}]})
  const before = JSON.stringify(ds.toJson())
  expect(() => runtime.validateQueryDefinitions(ds)).not.toThrow()
  await expect(view.loadFromServer()).rejects.toThrow('SPARK_SOURCE_INPUT')
  expect(JSON.stringify(ds.toJson())).toBe(before)
  expect(http.calls).toHaveLength(0)
})
