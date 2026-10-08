import { describe, it, expect, vi } from 'vitest'
import { SparkData, RequestState } from '@spark-appworks/spark-data'
import type { CrudResult, DataRow } from '@spark-appworks/spark-data'

async function values(hidden?: string, remote = true) {
  const ds = SparkData.fromJson({scenarioId: 'Values', dataSetName: 'Values', tables: {
    Parent: {modelBinding: {modelId: 'P', modelName: 'Parent'},
      columns: [{name: 'id', type: 'number', isPrimaryKey: true}, {name: 'region', type: 'string'}],
      views: {default: {autoCurrentFirst: true}}},
    Child: {columns: [{name: 'id', type: 'number', isPrimaryKey: true}, {name: 'region', type: 'string'}],
      ...(remote ? {api: {list: {url: '/test/child', method: 'GET'}}} : {}), views: {default: {}}},
  }})
  const source = ds.getView('Parent', 'default')!
  source.bindQueryExecutor({executeQuery: async () => ({
    rows: [{id: 1, region: 'A'}, {id: 2, region: 'A'}], total: 2,
    assertIdentity: identity => {
      if (identity.scenarioId !== 'Values' || identity.metaName !== 'Parent') throw new Error('query identity mismatch')
    }, rowKey: row => row['id'],
    fieldAccess: (_key, field) => ({read: hidden === field ? 'invisible' : 'visible', write: 'allowed',
      required: false, component: 'editable', writeMode: 'editable'}),
    readFieldAccess: (_row, field) => hidden === field ? 'invisible' : 'visible',
    addActionState: () => 'hidden', editActionState: () => 'hidden', deleteActionState: () => 'hidden',
    createChildActionState: () => 'hidden', viewActionState: () => 'hidden',
  })})
  await source.loadFromServer()
  return ds
}

const fieldCascade = {parentTable: 'Parent', parentViewId: 'default', childTable: 'Child', childViewId: 'default',
  filterBindings: [{sourceField: 'region', targetField: 'region'}]}
const selectionCascade = {...fieldCascade, filterBindings: [{targetField: 'id'}]}

describe('query cascade native values', () => {
  it('resolves the edited field value without collecting parent rows', async () => {
    const ds = await values()
    try {
      ds.getView('Parent', 'default')!.updateEditingValue(1, 'region', 'B')
      expect(ds.resolveCascadeFilter(fieldCascade)).toEqual({field: 'region', operator: 'eq', value: 'B'})
    } finally { ds.destroy() }
  })

  it('resolves selected primary-key arrays including an explicit empty selection', async () => {
    const ds = await values()
    try {
      const source = ds.getView('Parent', 'default')!
      source.setSelectedRows(source.rows)
      expect(ds.resolveCascadeFilter(selectionCascade)).toEqual({field: 'id', operator: 'in', value: [1, 2]})
      source.setSelectedRows([])
      expect(ds.resolveCascadeFilter(selectionCascade)).toEqual({field: 'id', operator: 'in', value: []})
    } finally { ds.destroy() }
  })

  it('rejects unreadable input and obsolete row dependency configurations', async () => {
    const ds = await values('region')
    try {
      expect(() => ds.resolveCascadeFilter(fieldCascade)).toThrow('DATA_VIEW_VALUE_READ')
      for (const dependencyType of ['currentRow', 'selectedRows', 'allRows', 'pagedRows']) {
        expect(() => ds.addCascade({...fieldCascade, dependencyType})).toThrow('QUERY_CASCADE_CONFIG')
        expect(() => SparkData.fromJson({...ds.toJson(), viewCascades: [{...fieldCascade, dependencyType}]})).toThrow('viewCascades')
      }
      expect(ds.viewCascades).toBeUndefined()
    } finally { ds.destroy() }
  })

  it('does not requery on equal pointer or selection changes but does on an edited value', async () => {
    const ds = await values()
    const child = ds.getView('Child', 'default')!
    const list = vi.spyOn(child.crud, 'list').mockResolvedValue({success: true, data: []})
    try {
      ds.addCascade(fieldCascade)
      await child.requestData()
      expect(list).toHaveBeenCalledOnce()
      const source = ds.getView('Parent', 'default')!
      source.setCurrentRow(source.rows[1]!)
      source.setSelectedRows(source.rows)
      await Promise.resolve()
      expect(list).toHaveBeenCalledOnce()
      source.updateEditingValue(2, 'region', 'B')
      await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2))
      expect(list.mock.calls[1]?.[0]?.filter).toEqual({field: 'region', operator: 'eq', value: 'B'})
    } finally { list.mockRestore(); ds.destroy() }
  })

  it('queries array values and empty arrays without reacting to unrelated pointer changes', async () => {
    const ds = await values()
    const child = ds.getView('Child', 'default')!
    const list = vi.spyOn(child.crud, 'list').mockResolvedValue({success: true, data: []})
    try {
      ds.addCascade(selectionCascade)
      const source = ds.getView('Parent', 'default')!
      source.setSelectedRows(source.rows)
      await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())
      expect(list.mock.calls[0]?.[0]?.filter).toEqual({field: 'id', operator: 'in', value: [1, 2]})
      source.setCurrentRow(source.rows[1]!)
      await Promise.resolve()
      expect(list).toHaveBeenCalledOnce()
      source.setSelectedRows([])
      await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2))
      expect(list.mock.calls[1]?.[0]?.filter).toEqual({field: 'id', operator: 'in', value: []})
    } finally { list.mockRestore(); ds.destroy() }
  })

  it('merges all input constraints and the child filter for static results', async () => {
    const ds = await values(undefined, false)
    try {
      ds.getTable('Child')!.rows = [{id: 1, region: 'A'}, {id: 2, region: 'A'}, {id: 3, region: 'B'}]
      ds.getView('Parent', 'default')!.setSelectedRows(ds.getView('Parent', 'default')!.rows)
      ds.addCascade({...fieldCascade, autoLoad: false})
      ds.addCascade({...selectionCascade, autoLoad: false})
      const child = ds.getView('Child', 'default')!
      child.configure({filterExpression: {field: 'id', operator: 'gte', value: 2}})
      await child.requestData()
      expect(child.rows).toMatchObject([{id: 2, region: 'A'}])
      ds.getView('Parent', 'default')!.updateEditingValue(1, 'region', 'B')
      await child.refresh()
      expect(child.rows).toEqual([])
    } finally { ds.destroy() }
  })

  it('reads every input again after waiting for another parent query', async () => {
    const ds = await values()
    const slow = ds.getTable('Parent')!.addView('slow')
    slow.configure({autoCurrentFirst: true})
    let finish: (() => void) | undefined
    const gate = new Promise<void>(resolve => {finish = resolve})
    const query = vi.fn(async () => {
      await gate
      return {
        rows: [{id: 9, region: 'X'}], total: 1,
        assertIdentity: () => {}, rowKey: (row: DataRow) => row['id'],
        fieldAccess: () => ({read: 'visible' as const, write: 'denied' as const,
          required: false, component: 'readonly' as const, writeMode: 'readonly' as const}),
        readFieldAccess: () => 'visible' as const,
        addActionState: () => 'hidden' as const, editActionState: () => 'hidden' as const,
        deleteActionState: () => 'hidden' as const, createChildActionState: () => 'hidden' as const,
        viewActionState: () => 'hidden' as const,
      }
    })
    slow.bindQueryExecutor({executeQuery: query})
    const child = ds.getView('Child', 'default')!
    const list = vi.spyOn(child.crud, 'list').mockResolvedValue({success: true, data: []})
    try {
      ds.addCascade(fieldCascade)
      ds.addCascade({...selectionCascade, parentViewId: 'slow', filterBindings: [{sourceField: 'id', targetField: 'id'}]})
      const pending = child.requestData()
      await vi.waitFor(() => expect(query).toHaveBeenCalledOnce())
      ds.getView('Parent', 'default')!.updateEditingValue(1, 'region', 'B')
      finish?.()
      await pending
      expect(list).toHaveBeenCalledOnce()
      expect(list.mock.calls[0]?.[0]?.filter).toEqual({logic: 'and', filters: [
        {field: 'region', operator: 'eq', value: 'B'}, {field: 'id', operator: 'eq', value: 9},
      ]})
    } finally { finish?.(); list.mockRestore(); ds.destroy() }
  })

  it('keeps the newest input result when earlier responses arrive last', async () => {
    const ds = await values()
    const child = ds.getView('Child', 'default')!
    let first: ((result: CrudResult<DataRow[]>) => void) | undefined
    let second: ((result: CrudResult<DataRow[]>) => void) | undefined
    const list = vi.spyOn(child.crud, 'list')
      .mockReturnValueOnce(new Promise(resolve => {first = resolve}))
      .mockReturnValueOnce(new Promise(resolve => {second = resolve}))
    try {
      ds.addCascade(fieldCascade)
      const source = ds.getView('Parent', 'default')!
      source.updateEditingValue(1, 'region', 'B')
      await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())
      source.updateEditingValue(1, 'region', 'C')
      await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2))
      second?.({success: true, data: [{id: 2, region: 'C'}]})
      await vi.waitFor(() => expect(child.rows[0]?.['region']).toBe('C'))
      first?.({success: true, data: [{id: 1, region: 'B'}]})
      await Promise.resolve(); await Promise.resolve()
      expect(child.rows[0]?.['region']).toBe('C')
    } finally { list.mockRestore(); ds.destroy() }
  })

  it('invalidates a pending response when its input becomes unavailable', async () => {
    const ds = await values()
    const child = ds.getView('Child', 'default')!
    let finish: ((result: CrudResult<DataRow[]>) => void) | undefined
    const list = vi.spyOn(child.crud, 'list').mockReturnValue(new Promise(resolve => {finish = resolve}))
    try {
      ds.addCascade(fieldCascade)
      const source = ds.getView('Parent', 'default')!
      source.updateEditingValue(1, 'region', 'B')
      await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())
      source.setCurrentRow(null)
      finish?.({success: true, data: [{id: 1, region: 'B'}]})
      await Promise.resolve(); await Promise.resolve()
      expect(child.rows).toEqual([])
      expect(child.requestState).toBe(RequestState.Idle)
    } finally { list.mockRestore(); ds.destroy() }
  })

  it('preserves unsaved child edits when a parent value requests replacement', async () => {
    const ds = await values()
    const child = ds.getView('Child', 'default')!
    const list = vi.spyOn(child.crud, 'list').mockResolvedValue({success: true, data: [{id: 1, region: 'A'}]})
    try {
      ds.addCascade(fieldCascade)
      await child.requestData()
      child.updateEditingValue(1, 'region', 'draft')
      ds.getView('Parent', 'default')!.updateEditingValue(1, 'region', 'B')
      await vi.waitFor(() => expect(child.loadingError?.message).toContain('DATA_VIEW_UNSAVED_CHANGES'))
      expect(list).toHaveBeenCalledOnce()
      expect(child.getEditingPatch(1)).toEqual({region: 'draft'})
      expect(child.rows[0]?.['region']).toBe('A')
      expect(child.requestState).toBe(RequestState.Loaded)
    } finally { list.mockRestore(); ds.destroy() }
  })
})
