import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet, dataSetCommandQueryResultFromLocalRows, ensureDataSetFileCommandView, ensureDataSetStaticInputTable} from '@spark-appworks/spark-data'
import {attachDatabaseDirectoryConnectionTestViews, attachServerConnectionTestViews, captureDatabaseDirectoryConnectionTestTarget, clearDatabaseDirectoryConnectionTest} from '@/lowcode/resources/database/dataset-extensions'
import {DatabaseServerHttp} from './server/resource.fixture'

const sets: DataSet[] = []
type Kind = 'server' | 'directory'
const fields = ['Type', 'ServerName', 'ip_address', 'UserName', 'Password', 'Port']
const columns = (kind: Kind) => [{name: 'commandId', primary: true}, ...fields.map(name => ({name})), ...(kind === 'directory' ? [{name: 'dbName'}] : [])]
function setup(kind: Kind, dependencies = true) {
  const names = ['_base_dbInfo', 'Base_serverInfo']
  const dataSet = DataSet.fromJson({scenarioId: 'CONNECTION-ATTACH', tables: dependencies ? Object.fromEntries(names.map(name => [name, {
    modelBinding: {modelId: name, modelName: name}, columns: ['rowid', 'Name', 'serverId', ...fields].map(field => ({name: field, type: 'string', isPrimaryKey: field === 'rowid'})),
    views: {default: {autoLoad: false}},
  }])) : {}})
  sets.push(dataSet)
  const http = new DatabaseServerHttp()
  const input = {dataSet, http, assertScope: vi.fn(), tables: {commandInput: 'input', testResult: 'result'}}
  const attach = (value = input) => kind === 'server' ? attachServerConnectionTestViews(value) : attachDatabaseDirectoryConnectionTestViews(value)
  const resourceId = kind === 'server' ? 'database-connection-test' : 'database-directory-connection-test'
  return {dataSet, http, input, attach, resourceId}
}
afterEach(() => {sets.splice(0).forEach(ds => ds.destroy()); vi.restoreAllMocks()})

async function directoryTarget() {
  const state = setup('directory'), {dataSet} = state
  const db = dataSet.getView('_base_dbInfo')!, server = dataSet.getView('Base_serverInfo')!
  db.bindQueryExecutor({executeQuery: target => dataSetCommandQueryResultFromLocalRows(target, [{rowid: 'DB1', Name: 'Db', serverId: 'S1'}], () => {})})
  server.bindQueryExecutor({executeQuery: target => dataSetCommandQueryResultFromLocalRows(target, [{rowid: 'S1', Type: 'MYSQL', ServerName: 'Server', ip_address: 'host', Port: '3306'}], () => {})})
  await Promise.all([db.refresh(), server.refresh()])
  state.attach()
  db.setSelectedRows([db.rows[0]!])
  captureDatabaseDirectoryConnectionTestTarget(dataSet, 'DB1')
  const view = dataSet.getView('input')!, row = view.rows[0]!, id = view.getPkKey(row)!
  view.updateEditingValue(id, 'UserName', 'A'); view.updateEditingValue(id, 'Password', 'A')
  return {...state, db, view, row, id, result: dataSet.getView('result')!}
}

describe.each(['server', 'directory'] as const)('%s connection pair', kind => {
  it.each(['foreign-owner', 'wrong-resource'] as const)('rejects an existing %s before creating input', mismatch => {
    const {dataSet, http, attach, resourceId} = setup(kind)
    const result = ensureDataSetFileCommandView({dataSet, tableName: 'result', resourceId: mismatch === 'wrong-resource' ? 'foreign' : resourceId,
      columns: [{name: 'ok', primary: true}]})
    if (mismatch === 'foreign-owner') result.bindQueryExecutor({executeQuery: () => Promise.reject(new Error('foreign'))}, {resource: {resourceType: 'file', resourceId}})
    expect(() => attach()).toThrow()
    expect(dataSet.getTable('input')).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })

  it('rejects aliased table names without occupying input', () => {
    const {dataSet, http, input, attach} = setup(kind)
    expect(() => attach({...input, tables: {commandInput: 'same', testResult: 'same'}})).toThrow()
    expect(dataSet.getTable('same')).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })

  it('rejects an invalid input view key without adding rows or results', () => {
    const {dataSet, http, attach} = setup(kind)
    ensureDataSetStaticInputTable(dataSet, 'input', columns(kind))
    dataSet.getView('input')!.primaryKey = 'Type'
    expect(() => attach()).toThrow()
    expect(dataSet.getTable('input')!.rows).toHaveLength(0)
    expect(dataSet.getTable('result')).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })

  it('rejects a directly destroyed input without changing rows', () => {
    const {dataSet, attach} = setup(kind)
    ensureDataSetStaticInputTable(dataSet, 'input', columns(kind))
    dataSet.getView('input')!.destroy()
    expect(() => attach()).toThrow()
    expect(dataSet.getTable('input')!.rows).toHaveLength(0)
    expect(dataSet.getTable('result')).toBeUndefined()
  })

  it('rejects a changed input name before initializing a replacement', () => {
    const {dataSet, input, attach} = setup(kind)
    attach()
    expect(() => attach({...input, tables: {...input.tables, commandInput: 'replacement'}})).toThrow()
    expect(dataSet.getTable('replacement')).toBeUndefined()
  })

  it('preserves input and current row across normal reattachment', () => {
    const {dataSet, attach} = setup(kind)
    attach()
    const row = dataSet.getTable('input')!.rows[0]!, view = dataSet.getView('input')!
    row['UserName'] = 'typed-user'; row['Password'] = 'typed-secret'
    view.setCurrentRow(null)
    attach()
    expect(dataSet.getTable('input')!.rows[0]).toBe(row)
    expect(view.currentRow).toBeNull()
    expect(row).toMatchObject({UserName: 'typed-user', Password: 'typed-secret'})
  })
})

it('rejects missing directory dependencies before creating command tables', () => {
  const {dataSet, attach} = setup('directory', false)
  expect(() => attach()).toThrow('正式数据库或服务器视图')
  expect(dataSet.getTable('input')).toBeUndefined()
  expect(dataSet.getTable('result')).toBeUndefined()
})

it('rejects incomplete directory dependency fields before creating command tables', () => {
  const {dataSet, attach} = setup('directory')
  const columns = dataSet.getTable('Base_serverInfo')!.columns
  columns.splice(columns.findIndex(column => column.name === 'Port'), 1)
  expect(() => attach()).toThrow('正式数据库或服务器视图')
  expect(dataSet.getTable('input')).toBeUndefined()
  expect(dataSet.getTable('result')).toBeUndefined()
})

it('preserves the captured directory target and typed input when reattached', async () => {
  const {dataSet, http, attach} = setup('directory')
  const db = dataSet.getView('_base_dbInfo')!, server = dataSet.getView('Base_serverInfo')!
  db.bindQueryExecutor({executeQuery: target => dataSetCommandQueryResultFromLocalRows(target, [{rowid: 'DB1', Name: 'Db', serverId: 'S1'}], () => {})})
  server.bindQueryExecutor({executeQuery: target => dataSetCommandQueryResultFromLocalRows(target, [{rowid: 'S1', Type: 'MYSQL', ServerName: 'Server', ip_address: 'host', Port: '3306'}], () => {})})
  await Promise.all([db.refresh(), server.refresh()])
  attach()
  db.setSelectedRows([db.rows[0]!])
  expect(captureDatabaseDirectoryConnectionTestTarget(dataSet, 'DB1')).toBe('Db')
  const view = dataSet.getView('input')!, row = view.rows[0]!, id = view.getPkKey(row)!
  view.updateEditingValue(id, 'UserName', 'typed-user'); view.updateEditingValue(id, 'Password', 'typed-secret')
  attach()
  expect(view.getEditingRow(id)).toMatchObject({UserName: 'typed-user', Password: 'typed-secret'})
  const post = vi.spyOn(http, 'post').mockResolvedValue({Code: 200, Type: 'success', Result: true})
  await dataSet.getView('result')!.refresh()
  expect(dataSet.getView('result')!.loadingError).toBeNull()
  expect(post).toHaveBeenCalledTimes(1)
  expect(post.mock.calls[0]?.[0]).toBe('/api/Db/testConnection?db=Db')
})

it.each([true, {}, {Code: 200, Type: 'success'}, {Code: 500, Type: 'error', Result: false}])('does not turn an invalid server test receipt into false (%j)', async response => {
  const {dataSet, http, attach} = setup('server')
  attach()
  Object.assign(dataSet.getTable('input')!.rows[0]!, {Type: 'MYSQL', ServerName: 'Server', ip_address: 'host', UserName: 'temporary', Password: 'temporary', Port: '3306'})
  vi.spyOn(http, 'post').mockResolvedValue(response)
  const result = dataSet.getView('result')!
  await result.refresh()
  expect(result.loadingError).toBeInstanceOf(Error)
  expect(result.rows).toHaveLength(0)
})

it('accepts an authoritative false server test receipt', async () => {
  const {dataSet, http, attach} = setup('server')
  attach()
  Object.assign(dataSet.getTable('input')!.rows[0]!, {Type: 'MYSQL', ServerName: 'Server', ip_address: 'host', Port: '3306'})
  vi.spyOn(http, 'post').mockResolvedValue({Code: 200, Type: 'success', Result: false})
  const result = dataSet.getView('result')!
  await result.refresh()
  expect(result.loadingError).toBeNull()
  expect(result.rows).toMatchObject([{ok: 'false'}])
})

it('rejects a server result if newer connection input arrived while awaiting it', async () => {
  const {dataSet, http, attach} = setup('server')
  attach()
  const row = dataSet.getTable('input')!.rows[0]!
  Object.assign(row, {Type: 'MYSQL', ServerName: 'Server', ip_address: 'host', UserName: 'A', Password: 'A', Port: '3306'})
  let release: (value: unknown) => void = () => {}
  const pending = new Promise(resolve => {release = resolve})
  const post = vi.spyOn(http, 'post').mockReturnValueOnce(pending)
  const result = dataSet.getView('result')!, query = result.refresh()
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  row['Password'] = 'B'
  release({Code: 200, Type: 'success', Result: true})
  await query
  expect(result.loadingError).toBeInstanceOf(Error)
  expect(result.rows).toHaveLength(0)
  expect(row['Password']).toBe('B')
})

it('does not clear newer directory credentials or unrelated editing when an old test settles', async () => {
  const {http, view, id, result} = await directoryTarget()
  let release: (value: unknown) => void = () => {}
  const post = vi.spyOn(http, 'post').mockReturnValueOnce(new Promise(resolve => {release = resolve}))
  const query = result.refresh()
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  view.updateEditingValue(id, 'Password', 'B')
  view.updateEditingValue(id, 'Port', '4444')
  release({Code: 200, Type: 'success', Result: true})
  await query
  expect(result.loadingError).toBeInstanceOf(Error)
  expect(result.rows).toHaveLength(0)
  expect(view.getEditingRow(id)).toMatchObject({UserName: 'A', Password: 'B', Port: '4444'})
  expect(post).toHaveBeenCalledTimes(1)
})

it('keeps an accepted directory result valid after clearing only its settled credentials', async () => {
  const {http, view, id, result} = await directoryTarget()
  vi.spyOn(http, 'post').mockResolvedValue({Code: 200, Type: 'success', Result: true})
  await result.refresh()
  expect(result.loadingError).toBeNull()
  expect(view.getEditingRow(id)).toMatchObject({UserName: '', Password: ''})
  expect(view.hasEditingChanges(id)).toBe(false)
  expect(result.fieldAccess(result.rows[0]!, 'ok').read).toBe('visible')
})

it.each(['server', 'directory'] as const)('does not let an older %s attempt clear a newer identical request', async kind => {
  const state = kind === 'directory' ? await directoryTarget() : setup('server')
  if (kind === 'server') state.attach()
  const {dataSet, http} = state, view = dataSet.getView('input')!, result = dataSet.getView('result')!
  const row = view.rows[0]!, id = view.getPkKey(row)!
  if (kind === 'server') Object.assign(row, {Type: 'MYSQL', ServerName: 'Server', ip_address: 'host', UserName: 'A', Password: 'A', Port: '3306'})
  const releases: Array<(value: unknown) => void> = []
  const post = vi.spyOn(http, 'post').mockImplementation(() => new Promise(resolve => {releases.push(resolve)}))
  const first = result.refresh()
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  const second = result.refresh()
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2))
  releases[0]!({Code: 200, Type: 'success', Result: true})
  await first
  expect(view.getEditingRow(id)).toMatchObject({UserName: 'A', Password: 'A'})
  releases[1]!({Code: 200, Type: 'success', Result: true})
  await second
  expect(result.loadingError).toBeNull()
  expect(result.rows).toMatchObject([{ok: 'true'}])
  expect(view.getEditingRow(id)).toMatchObject({UserName: '', Password: ''})
  expect(result.fieldAccess(result.rows[0]!, 'ok').read).toBe('visible')
})

it('rebuilds a clean directory pair after both old command tables were explicitly released', async () => {
  const {dataSet, attach} = await directoryTarget()
  const oldInput = dataSet.getView('input')!, oldResult = dataSet.getView('result')!
  dataSet.removeTable('input'); dataSet.removeTable('result')
  expect(oldInput.destroyed && oldResult.destroyed).toBe(true)
  expect(() => attach()).not.toThrow()
  expect(dataSet.getView('input')).not.toBe(oldInput)
  expect(dataSet.getView('result')).not.toBe(oldResult)
  expect(captureDatabaseDirectoryConnectionTestTarget(dataSet, 'DB1')).toBe('Db')
  expect(dataSet.getView('input')!.rows[0]).toMatchObject({UserName: '', Password: ''})
})

it('does not clear a replacement server input row with identical connection values', async () => {
  const {dataSet, http, attach} = setup('server')
  attach()
  const view = dataSet.getView('input')!, result = dataSet.getView('result')!
  Object.assign(view.rows[0]!, {Type: 'MYSQL', ServerName: 'Server', ip_address: 'host', UserName: 'A', Password: 'A', Port: '3306'})
  let release: (value: unknown) => void = () => {}
  const post = vi.spyOn(http, 'post').mockReturnValueOnce(new Promise(resolve => {release = resolve}))
  const query = result.refresh()
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  view.replaceRows([{...view.rows[0]!, commandId: 'new-command'}])
  release({Code: 200, Type: 'success', Result: true})
  await query
  expect(result.loadingError).toBeInstanceOf(Error)
  expect(view.rows[0]).toMatchObject({commandId: 'new-command', UserName: 'A', Password: 'A'})
})

it('rejects one-sided replacement but still permits clearing its own remaining input', async () => {
  const {dataSet, attach, view, id} = await directoryTarget()
  dataSet.removeTable('result')
  expect(() => attach()).toThrow()
  expect(view.getEditingRow(id)).toMatchObject({Password: 'A'})
  expect(() => clearDatabaseDirectoryConnectionTest(dataSet)).not.toThrow()
  expect(view.getEditingRow(id)).toMatchObject({UserName: '', Password: ''})
  expect(dataSet.getView('result')).toBeUndefined()
})

it.each(['server', 'directory'] as const)('isolates a late %s response from a new pair after full release', async kind => {
  const state = kind === 'directory' ? await directoryTarget() : setup('server')
  if (kind === 'server') state.attach()
  const {dataSet, http} = state
  const payload = {Type: 'MYSQL', ServerName: 'Server', ip_address: 'host', UserName: 'A', Password: 'A', Port: '3306'}
  if (kind === 'server') Object.assign(dataSet.getView('input')!.rows[0]!, payload)
  const releases: Array<(value: unknown) => void> = []
  const post = vi.spyOn(http, 'post').mockImplementation(() => new Promise(resolve => {releases.push(resolve)}))
  const first = dataSet.getView('result')!.refresh()
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  dataSet.removeTable('input'); dataSet.removeTable('result')
  state.attach()
  if (kind === 'directory') captureDatabaseDirectoryConnectionTestTarget(dataSet, 'DB1')
  const view = dataSet.getView('input')!, row = view.rows[0]!, id = view.getPkKey(row)!, result = dataSet.getView('result')!
  if (kind === 'server') Object.assign(row, {...payload, UserName: 'B', Password: 'B'})
  else {view.updateEditingValue(id, 'UserName', 'B'); view.updateEditingValue(id, 'Password', 'B')}
  const second = result.refresh()
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2))
  releases[0]!({Code: 200, Type: 'success', Result: true})
  await first
  expect(view.getEditingRow(id)).toMatchObject({UserName: 'B', Password: 'B'})
  releases[1]!({Code: 200, Type: 'success', Result: true})
  await second
  expect(result.loadingError).toBeNull()
  expect(result.rows).toMatchObject([{ok: 'true'}])
  expect(view.getEditingRow(id)).toMatchObject({UserName: '', Password: ''})
})
