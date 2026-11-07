import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet, ensureDataSetFileCommandView, ensureDataSetStaticInputTable} from '@spark-appworks/spark-data'
import {attachCatalogCommandViews} from '@/lowcode/resources/database/dataset-extensions'
import {DatabaseTableViewHttp} from './catalog/table-view.fixture'

const sets: DataSet[] = []
const inputColumns = [{name: 'commandId', primary: true}, {name: 'serverId'}, {name: 'dbId'}, {name: 'addDefaultFields'}, {name: 'batchId'}]
function setup() {
  const dataSet = DataSet.fromJson({scenarioId: 'CATALOG-ATTACH', tables: {}})
  sets.push(dataSet)
  const http = new DatabaseTableViewHttp()
  const input = {dataSet, http, assertScope: vi.fn(), tables: {commandInput: 'input', unregisteredTableNames: 'tables', unregisteredViewNames: 'views'}}
  return {dataSet, http, input, attach: () => attachCatalogCommandViews(input)}
}
afterEach(() => sets.splice(0).forEach(ds => ds.destroy()))

describe('catalog group binding preflight', () => {
  it('rejects a foreign last result before creating input or binding the first result', () => {
    const {dataSet, http, attach} = setup()
    const first = ensureDataSetFileCommandView({dataSet, tableName: 'tables', resourceId: 'database-unregistered-tables', columns: [{name: 'name', primary: true}]})
    const last = ensureDataSetFileCommandView({dataSet, tableName: 'views', resourceId: 'database-unregistered-views', columns: [{name: 'name', primary: true}]})
    last.bindQueryExecutor({executeQuery: () => Promise.reject(new Error('foreign'))},
      {resource: {resourceType: 'file', resourceId: 'database-unregistered-views'}})
    expect(attach).toThrow('DATA_VIEW_QUERY_IDENTITY')
    expect(dataSet.getTable('input')).toBeUndefined()
    expect(() => first.bindQueryExecutor({executeQuery: () => Promise.reject(new Error('still unbound'))},
      {resource: {resourceType: 'file', resourceId: 'database-unregistered-tables'}})).not.toThrow()
    expect(http.requests).toHaveLength(0)
  })

  it.each([
    {commandInput: 'same', unregisteredTableNames: 'same', unregisteredViewNames: 'views'},
    {commandInput: 'input', unregisteredTableNames: 'same', unregisteredViewNames: 'same'},
    {commandInput: '', unregisteredTableNames: 'tables'},
    {commandInput: 'input', unregisteredTableNames: ''},
    {commandInput: 'input', unregisteredTableNames: 'tables', unregisteredViewNames: 'bad@name'},
  ])('rejects invalid or aliased names before occupying any table (%j)', tables => {
    const {dataSet, http, input} = setup()
    expect(() => attachCatalogCommandViews({...input, tables})).toThrow()
    expect(Object.keys(dataSet.toJson().tables)).toHaveLength(0)
    expect(http.requests).toHaveLength(0)
  })

  it('rejects changed input identity before initializing a replacement', () => {
    const {dataSet, http, input, attach} = setup()
    attach()
    expect(() => attachCatalogCommandViews({...input, tables: {...input.tables, commandInput: 'new-input'}})).toThrow('CATALOG_COMMAND_INPUT_IDENTITY')
    expect(dataSet.getTable('new-input')).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })

  it('preserves the captured batch, current row and edited input on normal reattachment', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    const table = dataSet.getTable('input')!, view = dataSet.getView('input')!, row = table.rows[0]!
    row['dbId'] = 'DB1'
    const batch = row['batchId']
    view.setCurrentRow(null)
    attach()
    expect(row['batchId']).toBe(batch)
    expect(view.currentRow).toBeNull()
    expect(table.rows[0]).toBe(row)
    await dataSet.getView('tables')!.refresh()
    expect(dataSet.getView('tables')!.loadingError).toBeNull()
    expect(http.requests.map(request => request.url)).toEqual(['/api/Db/getUnregisteredTable/DB1'])
  })

  it('rejects an invalid effective input key without mutating its rows or creating a result', () => {
    const {dataSet, http, attach} = setup()
    ensureDataSetStaticInputTable(dataSet, 'input', inputColumns)
    const view = dataSet.getView('input')!, mode = view.commitMode
    view.primaryKey = 'dbId'
    expect(attach).toThrow()
    expect(dataSet.getTable('input')!.rows).toHaveLength(0)
    expect(view.commitMode).toBe(mode)
    expect(dataSet.getTable('tables')).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })

  it('does not assemble into a destroyed data set', () => {
    const {dataSet, http, attach} = setup()
    dataSet.destroy()
    expect(attach).toThrow()
    expect(dataSet.getTable('input')).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })

  it('adds a later result without resetting the existing input instance', () => {
    const {dataSet, input, attach} = setup()
    attachCatalogCommandViews({...input, tables: {commandInput: 'input', unregisteredTableNames: 'tables'}})
    const view = dataSet.getView('input')!, row = dataSet.getTable('input')!.rows[0]!, batch = row['batchId']
    row['dbId'] = 'DB1'
    view.setCurrentRow(null)
    attach()
    expect(view.currentRow).toBeNull()
    expect(row['batchId']).toBe(batch)
    expect(row['dbId']).toBe('DB1')
    expect(dataSet.getView('views')).toBeDefined()
  })

  it('does not repair a missing captured input or query through a same-name replacement', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    dataSet.removeTable('input')
    expect(attach).toThrow('CATALOG_COMMAND_INPUT_IDENTITY')
    expect(dataSet.getTable('input')).toBeUndefined()
    ensureDataSetStaticInputTable(dataSet, 'input', inputColumns)
    dataSet.getTable('input')!.addRows([{commandId: 'default', dbId: 'DB2'}])
    await dataSet.getView('tables')!.refresh()
    expect(dataSet.getView('tables')!.loadingError).toHaveProperty('message', expect.stringContaining('CATALOG_COMMAND_INPUT_IDENTITY'))
    expect(http.requests).toHaveLength(0)
  })

  it('rejects a response when the captured input default is replaced while HTTP is pending', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    const table = dataSet.getTable('input')!
    table.rows[0]!['dbId'] = 'DB1'
    let release: (value: unknown) => void = () => {throw new Error('not started')}
    const pending = new Promise<unknown>(resolve => {release = resolve})
    const get = vi.spyOn(http, 'get').mockReturnValueOnce(pending)
    const result = dataSet.getView('tables')!, refresh = result.refresh()
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    table.destroyView('default')
    table.addView('default')
    release(['late'])
    await refresh
    expect(result.loadingError).toHaveProperty('message', expect.stringContaining('CATALOG_COMMAND_INPUT_IDENTITY'))
    expect(result.rows).toHaveLength(0)
    expect(get.mock.calls[0]?.[0]).toBe('/api/Db/getUnregisteredTable/DB1')
  })

  it.each([false, true])('rejects a directly destroyed input default before changing the group (initialized=%s)', initialized => {
    const {dataSet, http, input} = setup()
    if (initialized) attachCatalogCommandViews({...input, tables: {commandInput: 'input', unregisteredTableNames: 'tables'}})
    else ensureDataSetStaticInputTable(dataSet, 'input', inputColumns)
    const view = dataSet.getView('input')!, rows = structuredClone(dataSet.getTable('input')!.rows)
    view.destroy()
    expect(dataSet.getView('input')).toBe(view)
    expect(() => attachCatalogCommandViews(input)).toThrow()
    expect(dataSet.getTable('input')!.rows).toEqual(rows)
    expect(dataSet.getTable('views')).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })

  it('rejects an old table result after the sibling view query changes the shared target', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    const row = dataSet.getTable('input')!.rows[0]!
    row['dbId'] = 'DB1'
    let release: (value: unknown) => void = () => {throw new Error('not started')}
    const pending = new Promise<unknown>(resolve => {release = resolve})
    const get = vi.spyOn(http, 'get').mockReturnValueOnce(pending)
    const tables = dataSet.getView('tables')!, refresh = tables.refresh()
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    row['dbId'] = 'DB2'
    const views = dataSet.getView('views')!
    await views.refresh()
    expect(views.loadingError).toBeNull()
    release(['DB1-old-table'])
    await refresh
    expect(tables.loadingError).toHaveProperty('message', expect.stringContaining('CATALOG_COMMAND_INPUT_CHANGED'))
    expect(tables.rows).toHaveLength(0)
    expect(get.mock.calls.map(call => call[0])).toEqual(['/api/Db/getUnregisteredTable/DB1', '/api/View/getUnregisteredView/DB2'])
  })
})
