import {afterEach, describe, expect, it, vi} from 'vitest'
import {SparkData, DataSetCrudTool, RequestState, type DataSet, type DataViewQueryCascade} from '@spark-appworks/spark-data'

const datasets: DataSet[] = []
afterEach(() => datasets.splice(0).forEach(ds => ds.destroy()))
function fixture() {
  const ds = SparkData.fromJson({scenarioId: 'query-inputs', dataSetName: 'query-inputs', tables: {
    Inputs: {resourceType: 'static-data', columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'context', type: 'string'},
      {name: 'mode', type: 'string'}, {name: 'key', type: 'string'}, {name: 'parent', type: 'string'},
      {name: 'node', type: 'string'}, {name: 'size', type: 'number'},
    ], views: {default: {commitMode: 'staged'}}},
    Range: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true},
      {name: 'all', type: 'boolean'}, {name: 'limit', type: 'number'}], views: {default: {commitMode: 'staged'}}},
    Result: {columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'parent', type: 'string'}],
      api: {list: {url: '/query', method: 'GET'}}, views: {default: {queryContext: {fixed: 1}, queryConfig: {fields: ['id', 'parent']}}}},
  }})
  datasets.push(ds)
  const source = ds.getView('Inputs', 'default')!, range = ds.getView('Range', 'default')!, child = ds.getView('Result', 'default')!
  source.replaceRows([{id: 'input', context: '{"flag":false,"ids":[0,"A"]}', mode: 'Table', key: 'id', parent: 'parent', node: 'root', size: 2}])
  source.setCurrentRowById('input')
  range.replaceRows([{id: 'range', all: false, limit: 50}]); range.setCurrentRowById('range')
  const list = vi.spyOn(child.crud, 'list').mockResolvedValue({success: true, data: [{id: 'one', parent: ''}], total: 5})
  return {ds, source, range, child, list}
}
const cascade: DataViewQueryCascade = {parentTable: 'Inputs', parentViewId: 'default', childTable: 'Result', childViewId: 'default',
  filterBindings: [], inputBindings: [
    {sourceField: 'context', target: 'queryContext', format: 'json'},
    {sourceField: 'size', target: 'pageSize'},
    {sourceField: 'mode', target: 'queryConfig.outputType', omitEmpty: true},
    {sourceField: 'key', target: 'queryConfig.tree.keyField', when: {field: 'mode', equals: 'SelfRefData'}},
    {sourceField: 'parent', target: 'queryConfig.tree.parentField', when: {field: 'mode', equals: 'SelfRefData'}},
    {sourceField: 'node', target: 'queryConfig.tree.nodeId', when: {field: 'mode', equals: 'SelfRefData'}},
  ]}

describe('query cascade configuration inputs', () => {
  it('defers multiple parent inputs in manual mode, queries the latest values explicitly and preserves the policy', async () => {
    const {ds, source, range, child, list} = fixture()
    child.queryConfig = {...child.queryConfig, autoQuery: false}
    ds.addCascade(cascade)
    ds.addCascade({parentTable: 'Range', parentViewId: 'default', childTable: 'Result', childViewId: 'default',
      filterBindings: [], inputBindings: [{sourceField: 'all', target: 'queryConfig.allPages'}]})
    source.updateEditingValue('input', 'size', 3)
    range.updateEditingValue('range', 'all', true)
    await Promise.resolve()
    expect(list).not.toHaveBeenCalled()
    await child.refresh()
    expect(child.queryConfig).toMatchObject({autoQuery: false, allPages: true, outputType: 'Table'})
    expect(child.pageSize).toBe(3)
    const count = list.mock.calls.length
    source.updateEditingValue('input', 'size', 1)
    await Promise.resolve()
    expect(list).toHaveBeenCalledTimes(count)
    expect(child.rows).toEqual([])
    await child.refresh()
    expect(child.pageSize).toBe(1)
    const reopened = SparkData.fromJson(ds.toJson()); datasets.push(reopened)
    expect(reopened.getView('Result')?.queryConfig.autoQuery).toBe(false)
    child.queryConfig = {...child.queryConfig, autoQuery: true}
    source.updateEditingValue('input', 'size', 2)
    await vi.waitFor(() => expect(child.pageSize).toBe(2))
    expect(list.mock.calls.length).toBeGreaterThan(count)
  })

  it('invalidates an old in-flight result when a manual filter parent changes', async () => {
    const {ds, source, child, list} = fixture()
    child.queryConfig = {...child.queryConfig, autoQuery: false}
    const filters = {...cascade, filterBindings: [{sourceField: 'key', targetField: 'id'}]}
    delete filters.inputBindings
    ds.addCascade(filters)
    let finish!: (result: {success: boolean; data: {id: string}[]; total: number}) => void
    list.mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const request = child.refresh()
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())
    source.updateEditingValue('input', 'key', 'new')
    finish({success: true, data: [{id: 'stale'}], total: 1})
    await request
    expect(list).toHaveBeenCalledOnce()
    expect(child.rows).toEqual([])
    await child.refresh()
    expect(list.mock.calls.at(-1)?.[0]?.filter).toEqual({field: 'id', operator: 'eq', value: 'new'})
  })

  it('combines optional search values, gates inactive sources, resets page and survives serialization', async () => {
    const {ds, source, child, list} = fixture()
    const search: DataViewQueryCascade = {...cascade, when: [{field: 'mode', equals: 'Table'}],
      filterBindings: [{sourceField: 'key', targetField: 'id', operator: 'contains', omitEmpty: true},
        {sourceField: 'node', targetField: 'parent', operator: 'contains', omitEmpty: true}], inputBindings: []}
    delete search.inputBindings
    ds.addCascade(search)
    await child.refresh()
    expect(list.mock.calls.at(-1)?.[0]?.filter).toEqual({logic: 'and', filters: [
      {field: 'id', operator: 'contains', value: 'id'}, {field: 'parent', operator: 'contains', value: 'root'}]})
    await child.setPage(2)
    source.updateEditingValue('input', 'node', '')
    await vi.waitFor(() => expect(list.mock.calls.at(-1)?.[0]?.filter).toEqual({field: 'id', operator: 'contains', value: 'id'}))
    expect(child.page).toBe(1)
    source.updateEditingValue('input', 'mode', 'Other')
    await vi.waitFor(() => expect(child.rows).toEqual([]))
    const count = list.mock.calls.length
    source.updateEditingValue('input', 'key', 'new')
    await child.refresh()
    expect(list).toHaveBeenCalledTimes(count)
    source.updateEditingValue('input', 'mode', 'Table')
    await vi.waitFor(() => expect(list.mock.calls.at(-1)?.[0]?.filter).toEqual({field: 'id', operator: 'contains', value: 'new'}))
    const reopened = SparkData.fromJson(ds.toJson()); datasets.push(reopened)
    expect(reopened.viewCascades).toEqual(ds.viewCascades)
    const tool = DataSetCrudTool.fromDataSet(ds)
    try {
      expect(() => tool.deleteColumn({tableName: 'Inputs', columnName: 'mode'})).toThrow('viewCascades')
      tool.renameColumn({tableName: 'Inputs', columnName: 'mode', newColumnName: 'category'})
      expect(tool.toJson().viewCascades?.[0]).toMatchObject({when: [{field: 'category', equals: 'Table'}], filterBindings: search.filterBindings})
    } finally {tool.dataSet.destroy()}
  })

  it('creates isolated query views with configuration and the same executor, without copying query permissions or rows', async () => {
    const {ds, source} = fixture()
    source.primaryKey = 'context'
    const a = source.createQueryView('pickerA'), b = source.createQueryView('pickerB')
    expect(a.primaryKey).toBe('context')
    expect(a.dataTable).toBe(source.dataTable)
    expect(a.rows).toEqual([]); expect(b.rows).toEqual([])
    expect(a.queryConfig).toEqual(source.queryConfig)
    a.page = 3
    expect(b.page).toBe(1)
    expect(() => source.createQueryView('pickerA')).toThrow()
    source.dataTable!.destroyView(a.viewId)
    expect(a.destroyed).toBe(true); expect(b.destroyed).toBe(false)
    expect(ds.getView('Inputs', 'default')).toBe(source)
  })
  it('keeps source/condition references on rename and rejects deleting a referenced input', () => {
    const {ds} = fixture()
    ds.addCascade(cascade)
    const tool = DataSetCrudTool.fromDataSet(ds)
    expect(() => tool.deleteColumn({tableName: 'Inputs', columnName: 'mode'})).toThrow('viewCascades')
    tool.renameColumn({tableName: 'Inputs', columnName: 'mode', newColumnName: 'queryMode'})
    const next = tool.toJson().viewCascades?.[0]
    expect(next).toMatchObject({inputBindings: expect.arrayContaining([
      {sourceField: 'queryMode', target: 'queryConfig.outputType', omitEmpty: true},
      {sourceField: 'key', target: 'queryConfig.tree.keyField', when: {field: 'queryMode', equals: 'SelfRefData'}},
    ])})
    tool.dataSet.destroy()
  })
  it('combines multiple parent fields/views and retains native configuration through filtering, sorting and paging', async () => {
    const {ds, source, range, child, list} = fixture()
    ds.addCascade(cascade)
    ds.addCascade({...cascade, parentTable: 'Range', inputBindings: [
      {sourceField: 'all', target: 'queryConfig.allPages'},
      {sourceField: 'limit', target: 'queryConfig.maxRows', when: {field: 'all', equals: true}},
    ]})
    await child.refresh()
    expect(child.queryConfig).toEqual({fields: ['id', 'parent'], outputType: 'Table', allPages: false})
    expect(child.queryContext).toEqual({fixed: 1, flag: false, ids: [0, 'A']})
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({pageSize: 2, outputType: 'Table'})
    await child.setPage(2)
    expect(list.mock.calls.at(-1)?.[0]?.page).toBe(2)
    await child.setSort([{field: 'id', direction: 'desc'}])
    await child.executeFilter({field: 'id', operator: 'eq', value: 'one'})
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({outputType: 'Table', fields: ['id', 'parent'], pageSize: 2})
    source.updateEditingValue('input', 'mode', 'SelfRefData')
    await vi.waitFor(() => expect(child.queryConfig.tree?.nodeId).toBe('root'))
    range.updateEditingValue('range', 'all', true)
    await vi.waitFor(() => expect(child.queryConfig.maxRows).toBe(50))
    range.updateEditingValue('range', 'all', false)
    source.updateEditingValue('input', 'mode', 'Table')
    source.updateEditingValue('input', 'context', '{}')
    await vi.waitFor(() => expect(child.queryContext).toEqual({fixed: 1}))
    expect(child.queryConfig.tree).toBeUndefined(); expect(child.queryConfig.maxRows).toBeUndefined()
    expect(child.queryConfig.fields).toEqual(['id', 'parent'])
    const reopened = SparkData.fromJson(ds.toJson()); datasets.push(reopened)
    expect(reopened.viewCascades).toEqual(ds.viewCascades)
  })

  it('rejects incomplete/invalid input atomically and recovers without another page query implementation', async () => {
    const {ds, source, child, list} = fixture()
    ds.addCascade(cascade); await child.refresh()
    const config = child.queryConfig, count = list.mock.calls.length
    source.updateEditingValue('input', 'context', '{')
    await vi.waitFor(() => expect(child.requestState).toBe(RequestState.Failed))
    expect(list).toHaveBeenCalledTimes(count); expect(child.queryConfig).toBe(config)
    source.updateEditingValue('input', 'size', 0)
    source.updateEditingValue('input', 'context', '{}')
    await vi.waitFor(() => expect(child.loadingError?.message).toContain('pageSize'))
    expect(child.queryConfig).toBe(config)
    source.updateEditingValue('input', 'size', 3)
    await vi.waitFor(() => expect(child.requestState).toBe(RequestState.Loaded))
    expect(list.mock.calls.at(-1)?.[0]?.pageSize).toBe(3)
  })

  it('rejects ambiguous targets and invalid paths at definition time', () => {
    const {ds} = fixture()
    expect(() => ds.addCascade({...cascade, inputBindings: [{sourceField: 'mode', target: 'queryConfig.outputType'},
      {sourceField: 'context', target: 'queryConfig.outputType'}]})).toThrow('QUERY_CASCADE_INPUT')
    expect(() => ds.addCascade({...cascade, inputBindings: [{sourceField: 'missing', target: 'pageSize'}]})).toThrow('missing')
  })

  it('recovers after invalid JSON is restored to the previous value and protects hidden inputs', async () => {
    const {ds, source, child, list} = fixture()
    ds.addCascade(cascade); await child.refresh()
    const original = source.currentRow!['context'], count = list.mock.calls.length
    source.updateEditingValue('input', 'context', '[')
    await vi.waitFor(() => expect(child.requestState).toBe(RequestState.Failed))
    source.updateEditingValue('input', 'context', original)
    await vi.waitFor(() => expect(child.requestState).toBe(RequestState.Loaded))
    expect(list).toHaveBeenCalledTimes(count + 1)
    const access = source.fieldAccess.bind(source)
    vi.spyOn(source, 'fieldAccess').mockImplementation((row, field) => ({...access(row, field), read: field === 'context' ? 'invisible' : 'visible'}))
    await child.refresh()
    expect(child.loadingError?.message).toContain('DATA_VIEW_VALUE_READ')
    expect(list).toHaveBeenCalledTimes(count + 1)
  })

  it('ignores late responses and leaves the original result permission/edit guard in control', async () => {
    const {ds, source, child, list} = fixture()
    ds.addCascade(cascade); await child.refresh()
    let finish: ((value: {success: boolean; data: {id: string}[]}) => void) | undefined
    list.mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    source.updateEditingValue('input', 'size', 3)
    await vi.waitFor(() => expect(finish).toBeDefined())
    source.updateEditingValue('input', 'size', 4)
    await vi.waitFor(() => expect(child.requestState).toBe(RequestState.Loaded))
    finish!({success: true, data: [{id: 'obsolete'}]})
    await Promise.resolve(); await Promise.resolve()
    expect(child.rows[0]?.['id']).toBe('one'); expect(child.pageSize).toBe(4)
    const count = list.mock.calls.length
    child.commitMode = 'staged'; child.updateEditingValue('one', 'parent', 'draft')
    source.updateEditingValue('input', 'size', 5)
    await vi.waitFor(() => expect(child.loadingError?.message).toContain('UNSAVED'))
    expect(list).toHaveBeenCalledTimes(count)
    expect(child.getEditingRow('one')?.['parent']).toBe('draft')
  })

  it('keeps inactive parent values, batches preparation to the latest inputs and releases subscriptions', async () => {
    const {ds, source, child, list} = fixture()
    ds.addCascade(cascade); await child.refresh()
    const count = list.mock.calls.length
    source.updateEditingValue('input', 'node', 'retained')
    await Promise.resolve(); await Promise.resolve()
    expect(list).toHaveBeenCalledTimes(count)
    source.updateEditingValue('input', 'mode', 'SelfRefData')
    source.updateEditingValue('input', 'node', 'latest')
    source.updateEditingValue('input', 'size', 7)
    await vi.waitFor(() => expect(child.requestState).toBe(RequestState.Loaded))
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({pageSize: 7, tree: {nodeId: 'latest'}})
    const last = list.mock.calls.length
    child.destroy()
    source.updateEditingValue('input', 'size', 8)
    await Promise.resolve(); await Promise.resolve()
    expect(list).toHaveBeenCalledTimes(last)
  })
})
