import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'

const dataSets: DataSet[] = []
afterEach(() => dataSets.splice(0).forEach(ds => ds.destroy()))
function fixture() {
  const ds = DataSet.fromJson({dataSetName: 'Requests', scenarioId: 'SPACE', tables: {
    Parent: {tableName: 'Parent', resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}],
      views: {default: {rows: [{id: 'A'}], autoCurrentFirst: true}}},
    Child: {tableName: 'Child', columns: [{name: 'id', type: 'string', isPrimaryKey: true}],
      views: {default: {pageSize: 2, filterExpression: {field: 'id', operator: 'ne', value: 'X'}}}},
  }, viewCascades: [{cascadeId: 'C', parentTable: 'Parent', parentViewId: 'default', childTable: 'Child', childViewId: 'default',
    filterBindings: [{sourceField: 'id', targetField: 'id'}], autoLoad: false}]})
  dataSets.push(ds)
  const parent = ds.getView('Parent', 'default')!, child = ds.getView('Child', 'default')!
  const load = vi.spyOn(child, 'loadFromServer').mockResolvedValue({success: true})
  return {ds, parent, child, load}
}

describe('DataView configured complete read', () => {
  it('captures the child options before waiting for its parent and preserves both filters', async () => {
    const {parent, child, load} = fixture()
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {release = resolve})
    const request = parent.requestData.bind(parent)
    const parentRequest = vi.spyOn(parent, 'requestData').mockImplementation(async () => {await gate; await request()})
    const options = {allPages: true, maxRows: 50}
    child.queryConfig = options
    const pending = child.refresh()
    options.allPages = false; options.maxRows = 1
    expect(load).not.toHaveBeenCalled()
    release?.(); await pending
    expect(parentRequest).toHaveBeenCalledWith()
    expect(load).toHaveBeenCalledWith(expect.objectContaining({allPages: true, maxRows: 50, pageSize: 2,
      filter: {logic: 'and', filters: [{field: 'id', operator: 'eq', value: 'A'}, {field: 'id', operator: 'ne', value: 'X'}]}}))
    expect(child.toJson().queryConfig).toEqual({allPages: true, maxRows: 50})
    expect(parent.queryConfig).toEqual({})
    await child.refresh()
    expect(load.mock.calls.at(-1)?.[0]).toMatchObject({allPages: true, maxRows: 50})
    child.queryConfig = {}
    await child.refresh()
    expect(load.mock.calls.at(-1)?.[0]).not.toHaveProperty('allPages')
    expect(load.mock.calls.at(-1)?.[0]).not.toHaveProperty('maxRows')
  })

  it('also forwards explicit options through an idle requestData call', async () => {
    const {child, load} = fixture()
    child.queryConfig = {allPages: false, maxRows: 7}
    await child.requestData()
    expect(load.mock.calls[0]?.[0]).toMatchObject({allPages: false, maxRows: 7})
  })

  it.each([{allPages: 'true'}, {allPages: null}, {maxRows: 0}, {maxRows: 1.5}, {maxRows: NaN}, {maxRows: '50'}, {maxRows: Number.MAX_SAFE_INTEGER + 1}])(
    'rejects invalid options without restarting the existing request: %j', async options => {
      const {child, load} = fixture()
      await child.refresh()
      const count = load.mock.calls.length
      const state = child.requestState
      expect(() => Reflect.set(child, 'queryConfig', options)).toThrow('queryConfig')
      expect(child.requestState).toBe(state)
      expect(load).toHaveBeenCalledTimes(count)
    })

  it('does not dispatch a superseded query after awaiting a cascade parent', async () => {
    const {parent, child, load} = fixture()
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {release = resolve})
    const request = parent.requestData.bind(parent)
    vi.spyOn(parent, 'requestData').mockImplementation(async () => {await gate; await request()})
    child.queryConfig = {outputType: 'Join'}
    const pending = child.refresh()
    child.queryConfig = {outputType: 'Table'}
    release?.(); await pending
    expect(load).not.toHaveBeenCalled()
    await child.refresh()
    expect(load).toHaveBeenCalledWith(expect.objectContaining({outputType: 'Table'}))
  })
})
