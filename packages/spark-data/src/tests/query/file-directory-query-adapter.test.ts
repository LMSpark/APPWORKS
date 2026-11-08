import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import type {DataColumn, DataViewFieldProjection} from '../../types'
import {bindFileDirectoryQueryAdapter, type BindFileDirectoryQueryAdapterOptions, type FileResourceTarget} from '../../query/file-resource-adapter'

function fixture(columns: DataColumn[] = [{name: 'fileKey', type: 'string', isPrimaryKey: true}, {name: 'fileName', type: 'string'}]) {
  const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: {Files: {resourceType: 'file', resourceId: 'files', columns,
    views: {default: {autoLoad: false, queryContext: {pageId: 'A', customPath: 'APP/A'}}}}}})
  const view = ds.getView('Files')!
  const list = vi.fn(async () => ['a.json', 'b.json'])
  const options: BindFileDirectoryQueryAdapterOptions = {resourceId: 'files', list,
    target: current => ({key: String(current.queryContext['pageId']), fields: {pageId: current.queryContext['pageId']}})}
  return {ds, view, list, options}
}

function projection(name: string, output: boolean): DataViewFieldProjection {
  return {fieldId: name, source: 'resource', resourceFieldId: name, resourceField: name, viewField: name, type: 'string',
    label: name, output, sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: name === 'fileKey', value: '', valueFunction: '', expression: ''}
}

describe('file directory readonly query contract', () => {
  it.each([
    [{name: 'fileKey', type: 'string', isPrimaryKey: true}],
    [{name: 'fileKey', type: 'string', isPrimaryKey: true}, {name: 'fileName', type: 'number'}],
    [{name: 'fileKey', type: 'string', isPrimaryKey: true}, {name: 'fileName', type: 'string', isComputed: true}],
    [{name: 'fileKey', type: 'string', isPrimaryKey: true, computeExpression: '1'}, {name: 'fileName', type: 'string'}],
  ].map(columns => ({columns: columns as DataColumn[]})))('requires raw declared string fields %#', ({columns}) => {
    const f = fixture(columns)
    try {expect(() => bindFileDirectoryQueryAdapter(f.view, f.options)).toThrow('FILE_DIRECTORY_COLUMNS'); expect(f.list).not.toHaveBeenCalled()}
    finally {f.ds.destroy()}
  })

  it.each([['a.json', 'a.json'], ['a.json', '../b.json'], Array(2), ['a.json', '']].map(names => ({names})))('rejects the entire bad batch before filtering %#', async ({names}) => {
    const f = fixture(); f.list.mockResolvedValue(names)
    try {
      bindFileDirectoryQueryAdapter(f.view, f.options)
      await expect(f.view.loadFromServer({filter: {field: 'fileName', operator: 'eq', value: 'a.json'}, pagination: 'paged', page: 1, pageSize: 1})).rejects.toThrow('FILE_DIRECTORY_NAMES'); expect(f.view.rows).toHaveLength(0)
    } finally {f.ds.destroy()}
  })

  it.each([{pageId: 'B'}, {customPath: 'APP/B'}])('rejects fixed target context overrides before listing %j', async context => {
    const f = fixture()
    try {
      bindFileDirectoryQueryAdapter(f.view, f.options)
      await expect(f.view.queryOptionRows({fields: ['fileName'], context})).rejects.toThrow()
      expect(f.list).not.toHaveBeenCalled()
    } finally {f.ds.destroy()}
  })

  it('retains the old request guard after same-target reattachment', async () => {
    const f = fixture(); let liveA = true, finish: ((names: readonly string[]) => void) | undefined
    const listA = vi.fn(() => new Promise<readonly string[]>(resolve => {finish = resolve}))
    try {
      bindFileDirectoryQueryAdapter(f.view, {...f.options, list: listA, assertCurrent: () => {if (!liveA) throw new Error('scope A stale')}})
      const pending = f.view.refresh(); await vi.waitFor(() => expect(finish).toBeDefined())
      bindFileDirectoryQueryAdapter(f.view, f.options); liveA = false; finish?.(['stale.json'])
      await pending; expect(f.view.rows).toHaveLength(0)
      await f.view.refresh(); expect(f.view.rows.map(row => row['fileName'])).toEqual(['a.json', 'b.json'])
    } finally {f.ds.destroy()}
  })

  it('uses the common readonly contract for named query peers after the original is released', async () => {
    const f = fixture()
    try {
      bindFileDirectoryQueryAdapter(f.view, f.options)
      const peer = f.view.createQueryView('peer')
      f.ds.getTable('Files')!.destroyView('default')
      expect((await peer.loadFromServer()).success).toBe(true)
      expect(peer.rows).toHaveLength(2); expect(peer.addActionState()).toBe('hidden')
    } finally {f.ds.destroy()}
  })

  it('accepts filename itself as the raw string primary key', async () => {
    const f = fixture([{name: 'fileName', type: 'string', isPrimaryKey: true}])
    try {bindFileDirectoryQueryAdapter(f.view, f.options); expect((await f.view.loadFromServer()).success).toBe(true); expect(f.view.rows).toHaveLength(2)}
    finally {f.ds.destroy()}
  })
  it('keeps the original transport when its guard synchronously reattaches the same target', async () => {
    const f = fixture(); let armed = false
    const listA = vi.fn(async () => ['from-A.json'])
    try {
      bindFileDirectoryQueryAdapter(f.view, {...f.options, list: listA, assertCurrent: () => {
        if (armed) {armed = false; bindFileDirectoryQueryAdapter(f.view, f.options)}
      }})
      armed = true
      await f.view.loadFromServer()
      expect(listA).toHaveBeenCalledOnce(); expect(f.list).not.toHaveBeenCalled()
      expect(f.view.rows[0]?.['fileName']).toBe('from-A.json')
      await f.view.loadFromServer(); expect(f.list).toHaveBeenCalledOnce()
    } finally {f.ds.destroy()}
  })

  it('captures a detached target before source callbacks and asynchronous listing', async () => {
    const f = fixture(), fields = {pageId: 'A'}
    let finish: ((names: readonly string[]) => void) | undefined
    const list = vi.fn((_target: FileResourceTarget) => new Promise<readonly string[]>(resolve => {finish = resolve}))
    try {
      bindFileDirectoryQueryAdapter(f.view, {...f.options, target: () => ({key: 'A', fields}), list})
      const pending = f.view.loadFromServer(); await vi.waitFor(() => expect(finish).toBeDefined())
      fields.pageId = 'B'; expect(list.mock.calls[0]?.[0]).toMatchObject({fields: {pageId: 'A'}})
      finish?.(['stale.json']); await expect(pending).rejects.toThrow('FILE_DIRECTORY_VIEW_IDENTITY')
      expect(f.view.rows).toHaveLength(0)
    } finally {f.ds.destroy()}
  })

  it('rejects a required column changed while listing and preserves unrelated extra columns', async () => {
    const f = fixture(); let finish: ((names: readonly string[]) => void) | undefined
    const table = f.ds.getTable('Files')!
    table.addColumns([{name: 'extra', type: 'string'}])
    try {
      bindFileDirectoryQueryAdapter(f.view, {...f.options, list: () => new Promise(resolve => {finish = resolve})})
      const pending = f.view.loadFromServer(); await vi.waitFor(() => expect(finish).toBeDefined())
      table.columns.find(column => column.name === 'fileName')!.isComputed = true
      finish?.(['stale.json']); await expect(pending).rejects.toThrow('FILE_DIRECTORY_COLUMNS')
      expect(f.view.rows).toHaveLength(0)
    } finally {f.ds.destroy()}
  })

  it('allows additional option filter context without replacing displayed rows', async () => {
    const f = fixture()
    try {
      bindFileDirectoryQueryAdapter(f.view, f.options)
      await f.view.loadFromServer({fields: ['fileKey']})
      const rows = f.view.rows
      await expect(f.view.queryOptionRows({fields: ['fileName'], context: {term: 'b'}, filter: {field: 'fileName', operator: 'eq', value: 'b.json'}})).resolves.toEqual([{fileName: 'b.json'}])
      expect(f.view.rows).toBe(rows); expect(f.view.rows[0]).not.toHaveProperty('fileName')
    } finally {f.ds.destroy()}
  })

  it('rejects a peer result after its registered view is replaced with the same name', async () => {
    const f = fixture(); let finish: ((names: readonly string[]) => void) | undefined
    try {
      bindFileDirectoryQueryAdapter(f.view, {...f.options, list: () => new Promise(resolve => {finish = resolve})})
      const peer = f.view.createQueryView('peer'), pending = peer.loadFromServer()
      await vi.waitFor(() => expect(finish).toBeDefined())
      const table = f.ds.getTable('Files')!; table.destroyView('peer')
      const replacement = table.getOrCreateView('peer'); finish?.(['stale.json'])
      expect((await pending).success).toBe(false); expect(replacement.rows).toHaveLength(0)
    } finally {f.ds.destroy()}
  })

  it.each([false, true])('accepts a persisted key-only projection (explicit excluded filename: %s)', async excluded => {
    const f = fixture()
    try {
      f.view.fieldProjection = [projection('fileKey', true), ...(excluded ? [projection('fileName', false)] : [])]
      bindFileDirectoryQueryAdapter(f.view, f.options)
      await f.view.loadFromServer()
      expect(f.view.rows.map(row => row['fileKey'])).toEqual(['a.json', 'b.json'])
      expect(f.view.rows.every(row => !Object.hasOwn(row, 'fileName'))).toBe(true)
      expect(f.view.fieldAccess(f.view.rows[0]!, 'fileName').read).toBe('invisible')
    } finally {f.ds.destroy()}
  })

  it('checks schema again after an external target callback before list dispatch', async () => {
    const f = fixture(); let armed = false, querying = false
    try {
      bindFileDirectoryQueryAdapter(f.view, {...f.options,
        assertCurrent: () => {if (querying) armed = true},
        target: current => {
          if (armed) f.ds.getTable('Files')!.columns.find(column => column.name === 'fileName')!.isComputed = true
          return f.options.target(current)
        }})
      querying = true
      await expect(f.view.loadFromServer()).rejects.toThrow('FILE_DIRECTORY_COLUMNS')
      expect(f.list).not.toHaveBeenCalled()
    } finally {f.ds.destroy()}
  })

  it('rejects a wrong per-request resource mapping before directory IO', async () => {
    const f = fixture()
    try {
      bindFileDirectoryQueryAdapter(f.view, f.options)
      await expect(f.view.loadFromServer({projection: [{...projection('fileName', true), resourceField: 'secret'}]})).rejects.toThrow('FILE_DIRECTORY_COLUMNS')
      expect(f.list).not.toHaveBeenCalled()
    } finally {f.ds.destroy()}
  })

})
