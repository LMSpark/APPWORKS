import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {bindFileResourceAdapter, getOrCreateFileResourceView} from '../../query/file-resource-adapter'

function setup() {
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', tables: {Files: {resourceType: 'file', resourceId: 'files',
    columns: [{name: 'key', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string'}, {name: 'revision', type: 'string'}], views: {default: {commitMode: 'staged'}}}}})
  const read = vi.fn(async () => ({text: 'original', revision: 'v1'})), write = vi.fn(async () => undefined)
  const input = {dataSet, tableName: 'Files', viewId: 'document', resourceId: 'files',
    columns: dataSet.getTable('Files')!.columns, contentField: 'text', revisionField: 'revision',
    queryContext: {file: 'A'}, target: (view: {queryContext: Record<string, unknown>}) => ({key: String(view.queryContext['file']), fields: {}}),
    transport: {read, write, isUnknown: () => false}}
  return {dataSet, input, read, write}
}

describe('file resource assembly identity', () => {
  it.each([{contentField: 'key'}, {revisionField: 'text'}, {revisionField: 'key'}])('rejects overlapping content/revision/primary fields (%j)', fields => {
    const f = setup()
    try {
      const table = f.dataSet.getTable('Files')!, views = [...table.viewList]
      expect(() => getOrCreateFileResourceView({...f.input, ...fields})).toThrow('FILE_RESOURCE')
      expect(table.viewList).toEqual(views)
    } finally { f.dataSet.destroy() }
  })

  it.each([false, true])('restores original registration and context if the first target rejects (existing=%s)', existing => {
    const f = setup()
    try {
      const table = f.dataSet.getTable('Files')!, view = existing ? table.getOrCreateView('document') : undefined
      if (view) view.queryContext = {file: 'old', unrelated: 'keep'}
      const context = view?.queryContext, views = [...table.viewList]
      expect(() => getOrCreateFileResourceView({...f.input, target: () => {throw new Error('invalid target')}})).toThrow('invalid target')
      expect(table.viewList).toEqual(views)
      if (view) expect(view.queryContext).toBe(context)
      expect(f.read).not.toHaveBeenCalled()
    } finally { f.dataSet.destroy() }
  })

  it('preserves the original context and result on same-target reassembly', async () => {
    const f = setup()
    try {
      const view = getOrCreateFileResourceView(f.input)
      await view.refresh()
      view.queryContext = {...view.queryContext, unrelated: 'keep'}
      const context = view.queryContext, row = view.rows[0]
      expect(getOrCreateFileResourceView({...f.input, transport: {...f.input.transport}})).toBe(view)
      expect(view.queryContext).toBe(context)
      expect(view.rows[0]).toBe(row)
      expect(view.queryContext['unrelated']).toBe('keep')
      expect(f.read).toHaveBeenCalledOnce()
    } finally { f.dataSet.destroy() }
  })

  it.each([false, true])('rejects an effective view primary key different from the file table (bound=%s)', async bound => {
    const f = setup()
    try {
      const view = bound ? getOrCreateFileResourceView(f.input) : f.dataSet.getTable('Files')!.getOrCreateView('document')
      if (bound) await view.refresh()
      view.primaryKey = 'text'
      if (bound) view.clearAll()
      const context = view.queryContext, rows = view.rows, beforeReads = f.read.mock.calls.length
      const replacement = vi.fn(async () => ({text: 'wrong owner', revision: 'new'}))
      expect(() => getOrCreateFileResourceView({...f.input, transport: {...f.input.transport, read: replacement}})).toThrow('FILE_RESOURCE')
      expect(view.queryContext).toBe(context)
      expect(view.rows).toBe(rows)
      expect(f.read).toHaveBeenCalledTimes(beforeReads)
      expect(replacement).not.toHaveBeenCalled()
      if (bound) {
        view.primaryKey = 'key'
        await view.refresh()
        expect(f.read).toHaveBeenCalledTimes(beforeReads + 1)
        expect(replacement).not.toHaveBeenCalled()
      }
    } finally { f.dataSet.destroy() }
  })

  it.each(['replace-view', 'replace-table', 'remove-table'] as const)('only rolls back its own registration after a target callback (%s)', operation => {
    const f = setup()
    try {
      if (operation !== 'replace-view') f.dataSet.removeTable('Files')
      const error = new Error('target callback failed')
      let replacement: unknown
      expect(() => getOrCreateFileResourceView({...f.input, target: view => {
        if (operation === 'replace-view') {
          const table = f.dataSet.getTable('Files')!
          table.destroyView(view.viewId)
          replacement = table.getOrCreateView(view.viewId)
        } else {
          f.dataSet.removeTable('Files')
          if (operation === 'replace-table') replacement = f.dataSet.addTable('Files', [...f.input.columns])
        }
        throw error
      }})).toThrow(error)
      if (operation === 'replace-view') expect(f.dataSet.getView('Files', 'document')).toBe(replacement)
      else expect(f.dataSet.getTable('Files')).toBe(replacement)
    } finally { f.dataSet.destroy() }
  })

  it('does not replace the original transport when a new guard rejects', async () => {
    const f = setup()
    try {
      const view = getOrCreateFileResourceView(f.input)
      await view.refresh()
      const replacement = vi.fn(async () => ({text: 'wrong', revision: 'wrong'}))
      expect(() => getOrCreateFileResourceView({...f.input, transport: {...f.input.transport, read: replacement},
        assertCurrent: () => {throw new Error('new scope expired')}})).toThrow('new scope expired')
      await view.refresh()
      expect(view.loadingError).toBeNull()
      expect(f.read).toHaveBeenCalledTimes(2)
      expect(replacement).not.toHaveBeenCalled()
    } finally { f.dataSet.destroy() }
  })

  it('rejects a numeric primary key that cannot preserve a string file target', () => {
    const f = setup()
    try {
      f.dataSet.removeTable('Files')
      expect(() => getOrCreateFileResourceView({...f.input, columns: f.input.columns.map(column => column.name === 'key' ? {...column, type: 'int'} : column)})).toThrow('FILE_RESOURCE')
      expect(f.dataSet.getTable('Files')).toBeUndefined()
    } finally { f.dataSet.destroy() }
  })

  it('rejects a repeated guard that replaces the original view without throwing', () => {
    const f = setup()
    try {
      const view = getOrCreateFileResourceView(f.input), table = f.dataSet.getTable('Files')!
      let replacement: unknown
      expect(() => getOrCreateFileResourceView({...f.input, assertCurrent: () => {
        table.destroyView('document')
        replacement = table.getOrCreateView('document')
      }})).toThrow()
      expect(view.destroyed).toBe(true)
      expect(table.getView('document')).toBe(replacement)
      expect(f.read).not.toHaveBeenCalled()
    } finally { f.dataSet.destroy() }
  })

  it('rejects a first binding whose configuration listener replaces the original view', () => {
    const f = setup()
    try {
      const table = f.dataSet.getTable('Files')!, view = table.getOrCreateView('document')
      let replacement: unknown
      view.events.on('configChanged', () => {
        table.destroyView('document')
        replacement = table.getOrCreateView('document')
      })
      expect(() => getOrCreateFileResourceView(f.input)).toThrow()
      expect(table.getView('document')).toBe(replacement)
      expect(f.read).not.toHaveBeenCalled()
    } finally { f.dataSet.destroy() }
  })

  it('does not occupy a direct binding after invalid fields are rejected', async () => {
    const f = setup()
    try {
      const view = f.dataSet.getTable('Files')!.getOrCreateView('document')
      view.queryContext = {file: 'A'}
      expect(() => bindFileResourceAdapter(view, {...f.input, contentField: 'missing'})).toThrow('FILE_RESOURCE')
      expect(f.read).not.toHaveBeenCalled()
      expect(() => bindFileResourceAdapter(view, f.input)).not.toThrow()
      await view.refresh()
      expect(view.loadingError).toBeNull()
      expect(f.read).toHaveBeenCalledOnce()
    } finally { f.dataSet.destroy() }
  })

  it('rejects another resource before modifying the table or registering a view', () => {
    const f = setup()
    try {
      const table = f.dataSet.getTable('Files')!, views = [...table.viewList]
      expect(() => getOrCreateFileResourceView({...f.input, resourceId: 'other'})).toThrow('FILE_RESOURCE_IDENTITY')
      expect(table.resourceId).toBe('files')
      expect(table.viewList).toEqual(views)
      expect(f.read).not.toHaveBeenCalled()
    } finally { f.dataSet.destroy() }
  })

  it('rejects a target switch without changing the original context or readable result', async () => {
    const f = setup()
    try {
      const view = getOrCreateFileResourceView(f.input)
      await view.refresh()
      const context = view.queryContext, row = view.rows[0]!
      expect(() => getOrCreateFileResourceView({...f.input, queryContext: {file: 'B'}})).toThrow('FILE_RESOURCE_IDENTITY')
      expect(view.queryContext).toBe(context)
      expect(view.queryContext).toEqual({file: 'A'})
      expect(view.fieldAccess(row, 'text').read).toBe('visible')
      await view.refresh()
      expect(view.loadingError).toBeNull()
    } finally { f.dataSet.destroy() }
  })

  it('rejects a missing content column before registering the requested view', () => {
    const f = setup()
    try {
      const table = f.dataSet.getTable('Files')!, views = [...table.viewList]
      expect(() => getOrCreateFileResourceView({...f.input, contentField: 'missing'})).toThrow('FILE_RESOURCE')
      expect(table.viewList).toEqual(views)
    } finally { f.dataSet.destroy() }
  })

  it('rejects a foreign query owner without applying requested context', () => {
    const f = setup()
    try {
      const view = f.dataSet.getTable('Files')!.getOrCreateView('document')
      const executor = {executeQuery: async () => {throw new Error('original owner')}}
      view.bindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: 'files'}})
      view.queryContext = {file: 'original'}
      const context = view.queryContext
      expect(() => getOrCreateFileResourceView(f.input)).toThrow()
      expect(view.queryContext).toBe(context)
      expect(() => view.assertCanBindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: 'files'}})).not.toThrow()
      expect(f.read).not.toHaveBeenCalled()
    } finally { f.dataSet.destroy() }
  })
})
