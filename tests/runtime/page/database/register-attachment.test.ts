import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {attachServerRegisterView, attachTableRegisterCommandView, attachViewRegisterCommandView} from '@/lowcode/resources/database/dataset-extensions'
import {DATABASE_SERVER_REGISTER_COLUMNS} from '@/lowcode/resources/database/server/catalog-metadata'
import {DatabaseTableViewHttp} from './catalog/table-view.fixture'

const sets: DataSet[] = []
type Kind = 'server' | 'table' | 'view'
function attach(kind: Kind, dataSet: DataSet, http: DatabaseTableViewHttp, guard = () => {}) {
  const input = {dataSet, http, assertScope: guard, register: 'register'}
  if (kind === 'server') attachServerRegisterView({...input, catalog: 'catalog', columns: structuredClone(DATABASE_SERVER_REGISTER_COLUMNS)})
  else if (kind === 'table') attachTableRegisterCommandView({...input, catalogModel: 'catalog'})
  else attachViewRegisterCommandView({...input, catalogModel: 'catalog'})
}
function setup(kind: Kind) {
  const original = DataSet.fromJson({scenarioId: 'REGISTER-ATTACH', tables: {}})
  sets.push(original)
  const http = new DatabaseTableViewHttp()
  attach(kind, original, http)
  // Only empty declarations are copied; this is not unknown-save recovery.
  const dataSet = DataSet.fromJson(JSON.parse(JSON.stringify(original.toJson())))
  sets.push(dataSet)
  return {dataSet, http, attach: () => attach(kind, dataSet, http)}
}
afterEach(() => sets.splice(0).forEach(ds => ds.destroy()))

describe.each(['server', 'table', 'view'] as const)('%s registration attachment', kind => {
  it.each(['resource', 'type', 'primary', 'view-key'] as const)('rejects existing %s mismatch before changing state', mismatch => {
    const {dataSet, http, attach} = setup(kind)
    const table = dataSet.getTable('register')!, view = dataSet.getView('register')!, mode = view.commitMode
    if (mismatch === 'resource') table.resourceId = 'foreign-command'
    if (mismatch === 'type') table.columns.find(column => column.name === 'rowid')!.type = 'number'
    if (mismatch === 'primary') table.columns.find(column => column.name !== 'rowid')!.isPrimaryKey = true
    if (mismatch === 'view-key') view.primaryKey = kind === 'server' ? 'ServerName' : 'dbid'
    expect(attach).toThrow(/(CONFLICT|IDENTITY)/)
    expect(view.commitMode).toBe(mode)
    expect(http.requests).toHaveLength(0)
  })

  it('rejects an unrelated owner with the same declared resource', () => {
    const {dataSet, http, attach} = setup(kind)
    const view = dataSet.getView('register')!, table = dataSet.getTable('register')!, mode = view.commitMode
    view.bindQueryExecutor({executeQuery: () => Promise.reject(new Error('foreign'))},
      {resource: {resourceType: 'file', resourceId: table.resourceId!}})
    expect(attach).toThrow('DATA_VIEW_QUERY_IDENTITY')
    expect(view.commitMode).toBe(mode)
    expect(http.requests).toHaveLength(0)
  })

  it('binds matching unbound declarations and preserves original callbacks on repeat', async () => {
    const {dataSet, http} = setup(kind), guard = vi.fn()
    attach(kind, dataSet, http, guard)
    const replacement = vi.fn()
    attach(kind, dataSet, http, replacement)
    const view = dataSet.getView('register')!
    await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(guard).toHaveBeenCalled()
    expect(replacement).not.toHaveBeenCalled()
    const row = await view.addRow(kind === 'server'
      ? {Type: 'MYSQL', ServerName: 'fixture', ip_address: 'fixture', UserName: 'fixture'}
      : {dbid: 'DB1', tableName: 'fixture', viewName: 'fixture'})
    expect(view.getPkKey(row)).toEqual(expect.any(String))
    expect(view.getPkKey(row)).not.toBe('DB1')
    expect(http.requests).toHaveLength(0)
  })

  it('rejects a missing default without recreating it', () => {
    const {dataSet, http, attach} = setup(kind)
    dataSet.getTable('register')!.destroyView('default')
    expect(attach).toThrow('命令视图缺失')
    expect(dataSet.getView('register')).toBeUndefined()
    expect(http.requests).toHaveLength(0)
  })
})

it('preserves server enum/required declarations and rejects an incompatible enum', () => {
  const {dataSet, http, attach} = setup('server')
  const column = dataSet.getTable('register')!.columns.find(item => item.name === 'Type')!
  expect(column).toMatchObject({type: 'enum', required: true, enumOptions: DATABASE_SERVER_REGISTER_COLUMNS[1]!.enumOptions})
  column.enumOptions = [{value: 'OTHER', label: 'Other'}]
  expect(attach).toThrow('DATA_SET_COMMAND_COLUMNS_CONFLICT')
  expect(http.requests).toHaveLength(0)
})

it.each(['missing-key', 'not-primary', 'duplicate'] as const)('rejects invalid server columns before creating a table (%s)', invalid => {
  const dataSet = DataSet.fromJson({scenarioId: 'REGISTER-ATTACH', tables: {}}), http = new DatabaseTableViewHttp()
  sets.push(dataSet)
  const columns = structuredClone(DATABASE_SERVER_REGISTER_COLUMNS)
  if (invalid === 'missing-key') columns.shift()
  if (invalid === 'not-primary') columns[0]!.isPrimaryKey = false
  if (invalid === 'duplicate') columns.push({...columns[1]!})
  const input = {dataSet, http, register: 'register', catalog: 'catalog', assertScope: () => {}}
  expect(() => attachServerRegisterView({...input, columns})).toThrow(/CONFLICT/)
  expect(dataSet.getTable('register')).toBeUndefined()
  expect(() => attachServerRegisterView({...input, columns: DATABASE_SERVER_REGISTER_COLUMNS})).not.toThrow()
  expect(http.requests).toHaveLength(0)
})

it('does not share mutable enum members with the caller declaration', () => {
  const dataSet = DataSet.fromJson({scenarioId: 'REGISTER-ATTACH', tables: {}}), http = new DatabaseTableViewHttp()
  sets.push(dataSet)
  const columns = structuredClone(DATABASE_SERVER_REGISTER_COLUMNS)
  const input = {dataSet, http, register: 'register', catalog: 'catalog', columns, assertScope: () => {}}
  attachServerRegisterView(input)
  const runtimeColumn = dataSet.getTable('register')!.columns.find(column => column.name === 'Type')!
  Object.assign(runtimeColumn.enumOptions![0]!, {value: 'OTHER'})
  expect(columns.find(column => column.name === 'Type')!.enumOptions![0]!.value).toBe('MYSQL')
  expect(() => attachServerRegisterView(input)).toThrow('DATA_SET_COMMAND_COLUMNS_CONFLICT')
  expect(http.requests).toHaveLength(0)
})
