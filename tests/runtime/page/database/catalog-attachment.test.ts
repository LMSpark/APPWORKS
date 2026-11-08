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
  it('applies requested filtering, sorting and paging to the actual complete catalog source', async () => {
    const {dataSet, http, input} = setup()
    attachCatalogCommandViews({...input, tables: {...input.tables, unregisteredDbNames: 'databases'}})
    dataSet.getTable('input')!.rows[0]!['serverId'] = 'S1'
    http.unregisteredDbBody = {Code: 200, Type: 'success', Result: ['A', 'C', 'B', 'D']}
    const view = dataSet.getView('databases')!
    await view.loadFromServer({filter: {field: 'name', operator: 'ne', value: 'D'}, pagination: 'paged', sort: 'name:desc', page: 2, pageSize: 1})
    expect(view.loadingError).toBeNull()
    expect(view.rows).toMatchObject([{name: 'B'}])
    expect(view.total).toBe(3)
    expect(http.requests.map(request => request.url)).toEqual(['/api/Db/getUnregisteredDb/S1'])
  })

  it('uses option filters without replacing the displayed catalog result', async () => {
    const {dataSet, http, input} = setup()
    attachCatalogCommandViews({...input, tables: {...input.tables, unregisteredDbNames: 'databases'}})
    dataSet.getTable('input')!.rows[0]!['serverId'] = 'S1'
    http.unregisteredDbBody = {Code: 200, Type: 'success', Result: ['A', 'B', 'C']}
    const view = dataSet.getView('databases')!
    await view.refresh()
    const row = view.rows[0]
    expect(await view.queryOptionRows({fields: ['name'], filter: {field: 'name', operator: 'eq', value: 'B'}})).toEqual([{name: 'B'}])
    expect(view.rows[0]).toBe(row)
    expect(view.total).toBe(3)
  })

  it('keeps complete default database names and preserves later consumer paging on reattachment', async () => {
    const {dataSet, http, input} = setup(), options = {...input, tables: {...input.tables, unregisteredDbNames: 'databases'}}
    attachCatalogCommandViews(options)
    dataSet.getTable('input')!.rows[0]!['serverId'] = 'S1'
    http.unregisteredDbBody = {Code: 200, Type: 'success', Result: Array.from({length: 31}, (_, index) => `Database-${index}`)}
    const view = dataSet.getView('databases')!
    await view.refresh()
    expect(view.rows).toHaveLength(31)
    view.configure({queryConfig: {pagination: 'paged'}, pageSize: 1})
    attachCatalogCommandViews(options)
    expect(view.queryConfig.pagination).toBe('paged')
    await view.refresh()
    expect(view.rows).toHaveLength(1)
    expect(view.total).toBe(31)
  })

  it.each(['databases', 'tables', 'views'] as const)('accepts the formal %s directory and retains source metadata', async kind => {
    const {dataSet, http, input} = setup()
    attachCatalogCommandViews({...input, tables: {...input.tables, unregisteredDbNames: 'databases'}})
    Object.assign(dataSet.getTable('input')!.rows[0]!, {serverId: 'S1', dbId: 'DB1'})
    const comment = '  中文说明\n原文  '
    const result = kind === 'databases' ? ['Raw'] : [{table_name: 'Raw', table_comment: comment, ...(kind === 'tables' ? {hasDefaultFields: 0} : {})}]
    vi.spyOn(http, 'get').mockResolvedValue({Code: 200, Type: 'success', Result: result})
    const view = dataSet.getView(kind)!
    await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]?.['name']).toBe('Raw')
    if (kind !== 'databases') {
      const field = kind === 'tables' ? 'tableComment' : 'viewComment'
      expect(view.rows[0]?.[field]).toBe(comment)
      expect(view.fieldAccess(view.rows[0]!, field).read).toBe('visible')
      await view.loadFromServer({filter: {field, operator: 'eq', value: comment}})
      expect(view.rows).toHaveLength(1)
    }
    if (kind === 'tables') {
      expect(view.rows[0]?.['hasDefaultFields']).toBe(0)
      expect(view.fieldAccess(view.rows[0]!, 'hasDefaultFields').read).toBe('visible')
    }
  })

  it.each(['databases', 'tables', 'views'] as const)('distinguishes a formal empty %s directory from failed responses', async kind => {
    const {dataSet, http, input} = setup()
    attachCatalogCommandViews({...input, tables: {...input.tables, unregisteredDbNames: 'databases'}})
    Object.assign(dataSet.getTable('input')!.rows[0]!, {serverId: 'S1', dbId: 'DB1'})
    vi.spyOn(http, 'get').mockResolvedValue({Code: 200, Type: 'success', Result: []})
    const view = dataSet.getView(kind)!
    await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(view.rows).toEqual([])
  })

  it.each(['databases', 'tables', 'views'] as const)('rejects a mixed malformed %s collection instead of accepting a subset', async kind => {
    const {dataSet, http, input} = setup()
    attachCatalogCommandViews({...input, tables: {...input.tables, unregisteredDbNames: 'databases'}})
    Object.assign(dataSet.getTable('input')!.rows[0]!, {serverId: 'S1', dbId: 'DB1'})
    const good = kind === 'databases' ? 'Raw' : {table_name: 'Raw', table_comment: 'Original', ...(kind === 'tables' ? {hasDefaultFields: 0} : {})}
    const other = kind === 'databases' ? 'Different' : {table_name: 'Different', table_comment: 'Changed', ...(kind === 'tables' ? {hasDefaultFields: 0} : {})}
    vi.spyOn(http, 'get').mockResolvedValueOnce({Code: 200, Type: 'success', Result: [good]})
      .mockResolvedValueOnce({Code: 200, Type: 'success', Result: [other, null]})
    const view = dataSet.getView(kind)!
    await view.refresh()
    expect(view.rows).toHaveLength(1)
    const rows = view.rows, original = view.rows[0]
    await view.refresh()
    expect(view.loadingError).toBeInstanceOf(Error)
    expect(view.rows).toBe(rows)
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]).toBe(original)
    expect(view.rows[0]?.['name']).toBe('Raw')
    if (kind !== 'databases') expect(view.rows[0]?.[kind === 'tables' ? 'tableComment' : 'viewComment']).toBe('Original')
    expect(view.rows.some(row => row['name'] === 'Different')).toBe(false)
  })

  it.each([[], {Code: '200', Type: 'success', Result: []}, {Code: 0, Type: 'success', Result: []},
    {Code: 200, Type: 'error', Result: []}, {Code: 200, Result: []}, {Code: 200, Type: 'success', Result: null},
    {Code: 200, Type: 'success'}, {Code: 200, Type: 'success', Result: ['Raw']},
    {Code: 200, Type: 'success', Result: [{table_name: 'Raw', hasDefaultFields: 0}]},
    {Code: 200, Type: 'success', Result: [{table_name: 'Raw', table_comment: '', hasDefaultFields: '0'}]},
    {Code: 200, Type: 'success', Result: [{table_name: 'Raw', table_comment: '', hasDefaultFields: 0}, {table_name: 'Raw', table_comment: 'Other', hasDefaultFields: 0}]}])('rejects unsupported table directory wire shape (%j)', async response => {
    const {dataSet, http, attach} = setup()
    attach()
    dataSet.getTable('input')!.rows[0]!['dbId'] = 'DB1'
    vi.spyOn(http, 'get').mockResolvedValue(response)
    const view = dataSet.getView('tables')!
    await view.refresh()
    expect(view.loadingError).toBeInstanceOf(Error)
    expect(view.rows).toEqual([])
  })

  it('preserves a formal refusal diagnostic rather than converting it to an empty directory', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    dataSet.getTable('input')!.rows[0]!['dbId'] = 'DB1'
    vi.spyOn(http, 'get').mockResolvedValue({Code: 500, Type: 'error', Message: 'catalog refusal', Result: null})
    const view = dataSet.getView('tables')!
    await view.refresh()
    expect(view.loadingError).toHaveProperty('message', 'catalog refusal')
  })

  it('does not claim extra table declaration fields as supported directory source output', async () => {
    const {dataSet, http, attach} = setup()
    attach()
    dataSet.getTable('input')!.rows[0]!['dbId'] = 'DB1'
    dataSet.getTable('tables')!.addColumns([{name: 'notSource', type: 'string'}])
    const get = vi.spyOn(http, 'get').mockResolvedValue({Code: 200, Type: 'success', Result: [{table_name: 'Raw', table_comment: '', hasDefaultFields: 0}]})
    const view = dataSet.getView('tables')!
    await view.loadFromServer({fields: ['notSource']}).catch(() => undefined)
    expect(view.loadingError).toBeInstanceOf(Error)
    expect(get).not.toHaveBeenCalled()
  })

  it('rejects an obsolete name-only table declaration instead of silently upgrading it', () => {
    const {dataSet, http, attach} = setup()
    ensureDataSetFileCommandView({dataSet, tableName: 'tables', resourceId: 'database-unregistered-tables', columns: [{name: 'name', primary: true}]})
    expect(attach).toThrow('DATA_SET_COMMAND_COLUMNS_CONFLICT')
    expect(dataSet.getTable('input')).toBeUndefined()
    expect(dataSet.getTable('tables')!.columns.some(column => column.name === 'tableComment')).toBe(false)
    expect(http.requests).toHaveLength(0)
  })

  describe.each(['databases', 'tables', 'views'] as const)('%s exact target names', kind => {
    it.each([false, true])('rejects unsupported edge whitespace before a trim-based downstream can retarget it (collision=%s)', async collision => {
      const {dataSet, http, input} = setup()
      attachCatalogCommandViews({...input, tables: {...input.tables, unregisteredDbNames: 'databases'}})
      Object.assign(dataSet.getTable('input')!.rows[0]!, {serverId: 'S1', dbId: 'DB1'})
      const names = collision ? ['Orders', ' Orders '] : [' Orders ']
      const result = names.map(name => kind === 'databases' ? name : {table_name: name, table_comment: '  preserve comment  ', ...(kind === 'tables' ? {hasDefaultFields: 0} : {})})
      vi.spyOn(http, 'get').mockResolvedValue({Code: 200, Type: 'success', Result: result})
      const view = dataSet.getView(kind)!
      await view.refresh()
      expect(view.loadingError).toBeInstanceOf(Error)
      expect(view.rows).toEqual([])
    })
  })

  it('rejects a foreign last result before creating input or binding the first result', () => {
    const {dataSet, http, attach} = setup()
    const first = ensureDataSetFileCommandView({dataSet, tableName: 'tables', resourceId: 'database-unregistered-tables', columns: [{name: 'name', primary: true}, {name: 'tableComment'}, {name: 'hasDefaultFields', type: 'int'}]})
    const last = ensureDataSetFileCommandView({dataSet, tableName: 'views', resourceId: 'database-unregistered-views', columns: [{name: 'name', primary: true}, {name: 'viewComment'}]})
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
    release({Code: 200, Type: 'success', Result: [{table_name: 'late', table_comment: '', hasDefaultFields: 0}]})
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
    release({Code: 200, Type: 'success', Result: [{table_name: 'DB1-old-table', table_comment: '', hasDefaultFields: 0}]})
    await refresh
    expect(tables.loadingError).toHaveProperty('message', expect.stringContaining('CATALOG_COMMAND_INPUT_CHANGED'))
    expect(tables.rows).toHaveLength(0)
    expect(get.mock.calls.map(call => call[0])).toEqual(['/api/Db/getUnregisteredTable/DB1', '/api/View/getUnregisteredView/DB2'])
  })
})
