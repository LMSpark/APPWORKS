import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet, ensureDataSetFileCommandView, ensureDataSetStaticInputTable, type DataView} from '@spark-appworks/spark-data'
import * as preview from '@/lowcode/resources/database/catalog/table/preview-view-ops'
import {DatabaseTableViewHttp} from '../table-view.fixture'

const sets: DataSet[] = []
type Kind = 'table' | 'view'
type Params = preview.DatabaseCatalogPreviewParams & preview.DatabaseCatalogViewPreviewParams
const initial: Params = {dbId: 'DB1', tableName: 'Orders', tblid: 'T1', viewName: 'OrderView', pageIndex: 2, pageSize: 1}
function setup(kind: Kind) {
  const dataSet = DataSet.fromJson({scenarioId: 'PREVIEW-BINDING', tables: {}})
  sets.push(dataSet)
  const http = new DatabaseTableViewHttp(), guard = vi.fn()
  const inputName = kind === 'table' ? preview.DATABASE_TABLE_PREVIEW_INPUT_TABLE : preview.DATABASE_VIEW_PREVIEW_INPUT_TABLE
  const resultName = kind === 'table' ? preview.DATABASE_TABLE_PREVIEW_RESULT_TABLE : preview.DATABASE_VIEW_PREVIEW_RESULT_TABLE
  const resourceId = kind === 'table' ? 'database-table-preview' : 'database-view-preview'
  const attach = (client = http, scope = guard) => kind === 'table'
    ? preview.attachDatabaseCatalogTablePreviewView(dataSet, client, scope) : preview.attachDatabaseCatalogViewPreviewView(dataSet, client, scope)
  const refresh = (view: DataView, params: Params = initial) => kind === 'table'
    ? preview.databaseCatalogPreviewRefresh(dataSet, view, params) : preview.databaseCatalogViewPreviewRefresh(dataSet, view, params)
  const write = (params: Params = initial) => kind === 'table' ? preview.databaseCatalogPreviewWriteInput(dataSet, params) : preview.databaseCatalogViewPreviewWriteInput(dataSet, params)
  return {dataSet, http, guard, inputName, resultName, resourceId, attach, refresh, write}
}
afterEach(() => {sets.splice(0).forEach(ds => ds.destroy()); vi.restoreAllMocks()})

describe.each(['table', 'view'] as const)('%s preview binding', kind => {
  it.each(['foreign-owner', 'wrong-resource', 'destroyed-result', 'result-key'] as const)('rejects %s before occupying input', conflict => {
    const {dataSet, inputName, resultName, resourceId, attach, http} = setup(kind)
    const result = ensureDataSetFileCommandView({dataSet, tableName: resultName, resourceId: conflict === 'wrong-resource' ? 'foreign' : resourceId,
      columns: [{name: 'rowid', primary: true}]})
    if (conflict === 'foreign-owner') result.bindQueryExecutor({executeQuery: () => Promise.reject(new Error('foreign'))}, {resource: {resourceType: 'file', resourceId}})
    if (conflict === 'destroyed-result') result.destroy()
    if (conflict === 'result-key') result.primaryKey = 'wrong'
    expect(() => attach()).toThrow()
    expect(dataSet.getTable(inputName)).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })

  it('rejects a destroyed input before adding rows or result', () => {
    const {dataSet, inputName, resultName, attach} = setup(kind)
    const fields = kind === 'table' ? ['dbId', 'tableName', 'tblid'] : ['dbId', 'viewName']
    ensureDataSetStaticInputTable(dataSet, inputName, [{name: 'commandId', primary: true}, ...fields.map(name => ({name}))])
    dataSet.getView(inputName)!.destroy()
    expect(() => attach()).toThrow()
    expect(dataSet.getTable(inputName)!.rows).toHaveLength(0)
    expect(dataSet.getTable(resultName)).toBeUndefined()
  })

  it('binds a matching unbound result and queries exactly the requested service page once', async () => {
    const {dataSet, inputName, resultName, resourceId, http, attach, refresh} = setup(kind)
    const view = ensureDataSetFileCommandView({dataSet, tableName: resultName, resourceId, columns: [{name: 'rowid', primary: true}]})
    attach()
    await refresh(view)
    expect(http.requests.map(request => request.url)).toEqual(['/api/DataOperation/GetData'])
    expect(http.requests[0]?.data).toMatchObject({PageParam: {index: 2, size: 1}})
    expect(view.rows).toHaveLength(1)
    expect(view.total).toBe(2)
    expect(dataSet.getTable(inputName)!.columns.map(column => column.name)).not.toContain('pageIndex')
    expect(dataSet.getTable(inputName)!.columns.map(column => column.name)).not.toContain('pageSize')
  })

  it('uses one request when both page index and size are supplied to a fresh binding', async () => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    await refresh(dataSet.getView(resultName)!)
    expect(http.requests).toHaveLength(1)
    expect(http.requests[0]?.data).toMatchObject({PageParam: {index: 2, size: 1}})
  })

  it('preserves the original rejection with explicit paging and does not retry or change authority', async () => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    const failure = new Error('formal query denied'), post = vi.spyOn(http, 'post').mockRejectedValue(failure)
    await expect(refresh(dataSet.getView(resultName)!)).rejects.toBe(failure)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[0]).toBe('/api/DataOperation/GetData')
  })

  it('rejects a foreign result before writing input or changing its paging', async () => {
    const state = setup(kind), other = setup(kind)
    state.attach(); other.attach()
    const before = structuredClone(state.dataSet.getTable(state.inputName)!.rows)
    const foreign = other.dataSet.getView(other.resultName)!, page = foreign.page, size = foreign.pageSize
    await expect(state.refresh(foreign)).rejects.toThrow('PREVIEW_BINDING_IDENTITY')
    expect(state.dataSet.getTable(state.inputName)!.rows).toEqual(before)
    expect([foreign.page, foreign.pageSize]).toEqual([page, size])
    expect([...state.http.requests, ...other.http.requests]).toHaveLength(0)
  })

  it('rejects same-name input replacement at the public write boundary', () => {
    const {dataSet, inputName, attach, write} = setup(kind)
    attach()
    dataSet.removeTable(inputName)
    const fields = kind === 'table' ? ['dbId', 'tableName', 'tblid'] : ['dbId', 'viewName']
    ensureDataSetStaticInputTable(dataSet, inputName, [{name: 'commandId', primary: true}, ...fields.map(name => ({name}))])
    dataSet.getTable(inputName)!.addRows([{commandId: 'replacement', dbId: 'B'}])
    expect(() => write()).toThrow('PREVIEW_BINDING_IDENTITY')
    expect(dataSet.getTable(inputName)!.rows[0]).toMatchObject({dbId: 'B'})
  })

  it('does not report a released binding as usable', () => {
    const {dataSet, attach} = setup(kind)
    attach()
    dataSet.destroy()
    const has = kind === 'table' ? preview.databaseCatalogHasTablePreview : preview.databaseCatalogHasViewPreview
    expect(has(dataSet)).toBe(false)
  })

  it('resets to page one when only page size is supplied, with one query', async () => {
    const {dataSet, resultName, http, attach, refresh} = setup(kind)
    attach()
    const view = dataSet.getView(resultName)!
    await refresh(view)
    const {pageIndex: _page, ...sizeOnly} = initial
    const before = http.requests.length
    await refresh(view, {...sizeOnly, pageSize: 2})
    expect(view.page).toBe(1)
    expect(view.pageSize).toBe(2)
    expect(http.requests.slice(before)).toHaveLength(1)
    expect(http.requests.at(-1)?.data).toMatchObject({PageParam: {index: 1, size: 2}})
  })

  it('rejects an invalid page before changing target, page or HTTP', async () => {
    const {dataSet, inputName, resultName, http, attach, refresh} = setup(kind)
    attach()
    const view = dataSet.getView(resultName)!, rows = structuredClone(dataSet.getTable(inputName)!.rows), page = view.page, size = view.pageSize
    await expect(refresh(view, {...initial, pageSize: 0})).rejects.toThrow('正整数')
    expect(dataSet.getTable(inputName)!.rows).toEqual(rows)
    expect([view.page, view.pageSize]).toEqual([page, size])
    expect(http.requests).toHaveLength(0)
  })

  it('retains the original binding, paging and result columns across normal reattachment', async () => {
    const {dataSet, inputName, resultName, http, guard, attach, refresh} = setup(kind)
    attach()
    const view = dataSet.getView(resultName)!
    await refresh(view)
    const columns = view.columns.map(column => column.name), row = dataSet.getTable(inputName)!.rows[0]
    const replacement = new DatabaseTableViewHttp(), replacementGuard = vi.fn()
    attach(replacement, replacementGuard)
    expect([view.page, view.pageSize]).toEqual([2, 1])
    expect(dataSet.getTable(inputName)!.rows[0]).toBe(row)
    expect(view.columns.map(column => column.name)).toEqual(columns)
    const before = http.requests.length
    await refresh(view)
    expect(http.requests.slice(before)).toHaveLength(1)
    expect(replacement.requests).toHaveLength(0)
    expect(guard).toHaveBeenCalled()
  })

  it('does not publish an old response column or re-dispatch after a newer refresh', async () => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    const view = dataSet.getView(resultName)!, replies: Array<(value: unknown) => void> = []
    const post = vi.spyOn(http, 'post').mockImplementation(() => replies.length < 2
      ? new Promise(resolve => {replies.push(resolve)}) : Promise.reject(new Error('UNEXPECTED_EXTRA_PREVIEW_REQUEST')))
    const first = refresh(view).catch(error => error)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const second = refresh(view, {...initial, dbId: 'DB2', pageIndex: 1}).catch(error => error)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    replies[1]!({Code: 200, Result: {primaryKeyField: 'rowid', data: {Items: [{rowid: 'B', NewOnly: 'new'}], Count: 4}}})
    await second
    replies[0]!({Code: 200, Result: {primaryKeyField: 'rowid', data: {Items: [{rowid: 'A', OldOnly: 'old'}], Count: 9}}})
    await first
    expect(view.columns.some(column => column.name === 'OldOnly')).toBe(false)
    expect(view.rows).toMatchObject([{rowid: 'B', NewOnly: 'new'}])
    expect(view.total).toBe(4)
    expect(post).toHaveBeenCalledTimes(2)
    expect(view.page).toBe(1)
  })

  it.each([{Items: []}, {Items: [], Count: null}, {Items: [], Count: ''}, {Items: [], Count: '2'}, {Items: [], Count: -1},
    {Items: [], Count: 1.5}, {Count: 0}, {Items: [null], Count: 1}])('rejects an invalid service page instead of inventing a total (%j)', async data => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    http.physicalPreviewResponseOverride = {Code: 200, Result: {primaryKeyField: 'rowid', data}}
    const view = dataSet.getView(resultName)!
    await expect(refresh(view)).rejects.toThrow()
    expect(view.rows).toHaveLength(0)
    expect(view.columns.some(column => column.name === 'OldOnly')).toBe(false)
  })

  it.each(['Id', 'AliasId', null])('consumes the actual result key without inventing rowid (%j)', async key => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    const item = key ? {[key]: 'one', Name: 'Readable'} : {Name: 'Readable'}
    http.physicalPreviewResponseOverride = {Code: 200, Result: {primaryKeyField: key, data: {Items: [item], Count: 1}}}
    const view = dataSet.getView(resultName)!
    await refresh(view)
    expect(view.primaryKey).toBe(key ?? '')
    expect(view.fieldAccess(view.rows[0]!, 'Name').read).toBe('visible')
    expect(view.fieldAccess(view.rows[0]!, 'Name').write).toBe('denied')
    expect(view.getPkKey(view.rows[0]!)).toBe(key ? 'one' : undefined)
    expect(view.rows[0]).not.toHaveProperty('rowid')
    expect(() => attach()).not.toThrow()
    expect(view.dataTable!.columns.some(column => column.name === 'Name')).toBe(false)
  })

  it.each([['A', 'A'], [1, '1'], ['', 'B'], [' ', 'B']])('keeps colliding or blank reported keys as readable unkeyed rows (%j)', async (...ids) => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    http.physicalPreviewResponseOverride = {Code: 200, Result: {primaryKeyField: 'Id',
      data: {Items: ids.map((Id, index) => ({Id, Name: `Row ${index}`})), Count: ids.length}}}
    const view = dataSet.getView(resultName)!
    await refresh(view, {...initial, pageIndex: 1, pageSize: 10})
    expect(view.reportedPrimaryKey).toBe('Id')
    expect(view.primaryKey).toBe('')
    expect(view.rows).toHaveLength(2)
    for (const row of view.rows) {
      expect(view.getPkKey(row)).toBeUndefined()
      expect(view.fieldAccess(row, 'Name').read).toBe('visible')
      expect(view.fieldAccess(row, 'Name').write).toBe('denied')
      expect(view.viewActionState(row)).toBe('hidden')
    }
  })

  it.each([false, true])('keeps displayed permissions after an auxiliary query (failure=%s)', async fails => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    http.physicalPreviewResponseOverride = {Code: 200, Result: {primaryKeyField: 'Id', data: {Items: [{Id: 'one', Name: 'Original'}], Count: 1}}}
    const view = dataSet.getView(resultName)!
    await refresh(view, {...initial, pageIndex: 1, pageSize: 10})
    const row = view.rows[0]!
    if (fails) vi.spyOn(http, 'post').mockRejectedValue(new Error('auxiliary failed'))
    const result = view.queryOptionRows({fields: ['Name']})
    if (fails) await expect(result).rejects.toThrow()
    else expect(await result).toEqual([{Name: 'Original'}])
    expect(view.rows[0]).toBe(row)
    expect(view.fieldAccess(row, 'Name').read).toBe('visible')
  })

  it('does not let an auxiliary query cancel a pending display query', async () => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    const response = (Name: string) => ({Code: 200, Result: {primaryKeyField: 'Id', data: {Items: [{Id: 'one', Name}], Count: 1}}})
    http.physicalPreviewResponseOverride = response('Original')
    const view = dataSet.getView(resultName)!
    await refresh(view, {...initial, pageIndex: 1, pageSize: 10})
    let release: (value: unknown) => void = () => {}
    const post = vi.spyOn(http, 'post').mockReturnValueOnce(new Promise(resolve => {release = resolve})).mockResolvedValueOnce(response('Option'))
    const main = view.refresh()
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(await view.queryOptionRows({fields: ['Name']})).toEqual([{Name: 'Option'}])
    release(response('Updated'))
    await main
    expect(view.loadingError).toBeNull()
    expect(view.rows[0]).toMatchObject({Name: 'Updated'})
  })

  it('does not turn absent keys into a valid literal string key', async () => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    vi.spyOn(http, 'post').mockResolvedValue({Code: 200, Result: {primaryKeyField: 'Id', data: {Items: [{Id: 'undefined', Name: 'Literal'}, {Id: 'null', Name: 'Other'}], Count: 2}}})
    const view = dataSet.getView(resultName)!
    await refresh(view, {...initial, pageIndex: 1})
    expect(view.viewActionState(view.rows[0]!)).toBe('enabled')
    expect(view.viewActionState({})).toBe('hidden')
    expect(view.viewActionState({Id: null})).toBe('hidden')
    expect(view.fieldAccess({}, 'Name').read).toBe('invisible')
    expect(view.fieldAccess({Id: null}, 'Name').read).toBe('invisible')
  })

  it('does not report an outer refresh as loaded while a direct newer refresh is pending', async () => {
    const {dataSet, http, resultName, attach, refresh} = setup(kind)
    attach()
    const replies: Array<(value: unknown) => void> = [], view = dataSet.getView(resultName)!
    const post = vi.spyOn(http, 'post').mockImplementation(() => new Promise(resolve => {replies.push(resolve)}))
    const first = refresh(view, {...initial, pageIndex: 1}).catch(error => error)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const direct = view.refresh()
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    replies[0]!({Code: 200, Result: {primaryKeyField: 'rowid', data: {Items: [{rowid: 'A'}], Count: 2}}})
    expect(await first).toHaveProperty('message', expect.stringContaining('替代'))
    replies[1]!({Code: 200, Result: {primaryKeyField: 'rowid', data: {Items: [{rowid: 'B'}], Count: 2}}})
    await direct
    expect(view.rows).toMatchObject([{rowid: 'B'}])
  })
})
