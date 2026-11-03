import {afterEach, describe, expect, it} from 'vitest'
import {DataSet, DataViewQuery} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceDesignApi} from '../../design/data-space-design-api'
import {DataSpaceRuntimeApi} from '../data-space-runtime-api'

class JoinHttp extends HttpClientBase {
  readonly calls: RequestConfig[] = []
  rowExtras: Record<string, unknown> = {}
  nestedRowExtras?: readonly Record<string, unknown>[]
  beforeResponse?: () => void
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    this.beforeResponse?.()
    return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: true, data: {Items: [
      {orderId: 'P', caption: 'Parent', detailId: 'C1', detailName: 'One', ...this.rowExtras, ...this.nestedRowExtras?.[0]},
      {orderId: 'P', caption: 'Parent', detailId: 'C2', detailName: 'Two', ...this.rowExtras, ...this.nestedRowExtras?.[1]},
    ], Count: 2}}}, status: 200, statusText: 'OK', headers: {}}
  }
}
const sets: DataSet[] = []
afterEach(() => sets.splice(0).forEach(set => set.destroy()))
function setup(override: Record<string, unknown> = {}, fieldOverride: Record<string, unknown> = {}, keyAlias = 'detailId') {
  const root = DataSpaceDesignApi.projectModel({rowid: 'ROOT', Name: 'Orders', Type: '数据库表', MetaName: 'PhysicalOrders',
    DbId: 'DB', ShortName: 'p', PrimaryKeyFields: 'rowid'}, [
    {rowid: 'RK', dataModelId: 'ROOT', Name: 'rowid', AsName: 'orderId', FieldType: 'string', IsOutput: 1},
    {rowid: 'RN', dataModelId: 'ROOT', Name: 'Name', AsName: 'caption', FieldType: 'string', IsOutput: 1},
  ], 'rowid')
  const child = DataSpaceDesignApi.projectModel({rowid: 'CHILD', Name: 'Details', Type: '数据库表', MetaName: 'PhysicalDetails',
    DbId: 'DB', ShortName: 'c', PId: 'Orders', JoinType: 'LEFT', JoinFilter: 'c.parentId=p.rowid', PrimaryKeyFields: 'rowid', ...override}, [
    {rowid: 'CK', dataModelId: 'CHILD', Name: 'rowid', AsName: keyAlias, FieldType: 'string', IsOutput: 1},
    {rowid: 'CN', dataModelId: 'CHILD', Name: 'title', AsName: 'detailName', FieldType: 'string', IsOutput: 1, ...fieldOverride},
  ], 'rowid')
  const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: {RootConfig: {tableName: 'RootConfig', resourceType: 'database-table',
    modelBinding: {modelId: 'ROOT', modelName: 'Orders'}, columns: [{name: 'orderId', type: 'string', isPrimaryKey: true},
      {name: 'caption', type: 'string', label: 'Parent caption'}], views: {default: {}, sibling: {}}},
  DetailConfig: {tableName: 'DetailConfig', resourceType: 'database-table', modelBinding: {modelId: 'CHILD', modelName: 'Details'},
    columns: [{name: keyAlias, type: 'string', isPrimaryKey: true}, {name: String(fieldOverride['AsName'] ?? 'detailName'), type: 'string', label: 'Detail caption'}], views: {default: {}}}}})
  sets.push(ds)
  const http = new JoinHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
  const view = ds.getView('RootConfig')!, childView = ds.getView('DetailConfig')!
  runtime.bindModelView(view, root); runtime.bindModelView(childView, child)
  view.queryConfig = {outputType: 'Join', children: [{modelName: 'Details', fields: ['detailId', 'detailName'],
    filter: {field: 'detailName', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'search'}}}]}
  view.queryContext = {search: 'One'}
  return {ds, view, runtime, http, root}
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
