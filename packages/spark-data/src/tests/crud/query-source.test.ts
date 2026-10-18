import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {DataView} from '../../data-view'
import {RequestState} from '../../types'

function fixture() {
  const ds = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'sources', tables: {File: {
    resourceType: 'file', resourceId: 'config', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string'}],
    views: {default: {commitMode: 'staged'}, other: {commitMode: 'staged'}},
  }}})
  const view = ds.getView('File')!, other = ds.getView('File', 'other')!
  let remote = 'remote', text = 'before', gate: Promise<void> | undefined, fail = false
  let queryGate: Promise<void> | undefined, queryFailure = false
  const applied = vi.fn()
  const source = {
    views: () => view.dataTable!.viewList,
    preview: async () => {await gate; return {version: 1, content: remote}},
    adopt: async (_view: DataView, snapshot: {version: string | number | null; content: string | null}, hooks: {assertCurrent(): void; beforeApply(): void}) => {
      await gate
      if (fail) throw new Error('read failed')
      if (snapshot.content !== remote) throw new Error('remote changed')
      hooks.assertCurrent(); hooks.beforeApply(); text = remote; applied()
    },
  }
  const executor = {source, executeQuery: vi.fn(async () => {
    await queryGate
    if (queryFailure) throw new Error('query failed')
    return {
    rows: [{id: '1', text}], total: 1,
    assertIdentity: () => undefined, rowKey: (row: Readonly<Record<string, unknown>>) => row['id'],
    fieldAccess: () => ({read: 'visible' as const, write: 'allowed' as const, component: 'editable' as const, required: false, writeMode: 'editable' as const}),
    readFieldAccess: () => 'visible' as const, addActionState: () => 'enabled' as const, editActionState: () => 'enabled' as const,
    deleteActionState: () => 'enabled' as const, createChildActionState: () => 'enabled' as const, viewActionState: () => 'enabled' as const,
  }})}
  for (const item of [view, other]) item.bindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: 'config'}})
  return {ds, view, other, source, applied, executor, stored: (value: string) => {text = value},
    holdQuery: (value?: Promise<void>) => {queryGate = value}, failQuery: (value: boolean) => {queryFailure = value},
    remote: (value: string) => {remote = value}, fail: () => {fail = true}, wait: (value: Promise<void>) => {gate = value}}
}

describe('query column ownership', () => {
  it('uses the bound query catalogue for derived views without querying or persisting it', () => {
    const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: {File: {resourceType: 'file', resourceId: 'config',
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string'},
        {name: 'display', type: 'string', computeExpression: 'text + "!"'}], views: {default: {}}}}})
    const view = ds.getView('File')!, executeQuery = vi.fn(async () => {throw new Error('unexpected query')})
    const queryColumns = vi.fn((source: DataView) => source.dataTable!.columns.filter(column => column.name === 'text'))
    try {
      view.bindQueryExecutor({queryColumns, executeQuery}, {resource: {resourceType: 'file', resourceId: 'config'}})
      const derived = view.createQueryView('derived')
      for (const current of [view, derived]) {
        expect(current.queryColumns.map(column => column.name)).toEqual(['text'])
        expect(queryColumns).toHaveBeenLastCalledWith(current)
        expect(current.toJson()).not.toHaveProperty('queryColumns')
      }
      expect(view.dataTable!.columns.map(column => column.name)).toContain('id')
      expect(executeQuery).not.toHaveBeenCalled()
      derived.destroy(); expect(() => derived.queryColumns).toThrow()
    } finally {ds.destroy()}
  })

  it('retains ordinary source columns without treating computed columns as query inputs', () => {
    const f = fixture()
    try {
      f.view.dataTable!.addColumns([{name: 'display', type: 'string', computeExpression: 'text + "!"'}])
      expect(f.view.queryColumns.map(column => column.name)).toEqual(['id', 'text'])
      expect(f.executor.executeQuery).not.toHaveBeenCalled()
    } finally {f.ds.destroy()}
  })
})

describe('requested refresh lifecycle', () => {
  it.each(['editing', 'staged'] as const)('coalesces refresh requests while %s changes remain and refreshes after cancellation', async mode => {
    const f = fixture()
    try {
      await f.view.refresh(); f.stored('persisted')
      if (mode === 'editing') f.view.updateEditingValue('1', 'text', 'draft')
      else await f.view.editRowById('1', {text: 'draft'})
      expect((await f.view.requestRefresh()).success).toBe(true)
      await f.view.requestRefresh()
      expect(f.view.refreshPending).toBe(true)
      expect(f.executor.executeQuery).toHaveBeenCalledTimes(1)
      expect(f.view.getEditingRow('1')?.['text']).toBe('draft')
      expect(f.view.toJson()).not.toHaveProperty('refreshPending')
      f.view.discardPendingChanges()
      await vi.waitFor(() => expect(f.view.rows[0]?.['text']).toBe('persisted'))
      expect(f.executor.executeQuery).toHaveBeenCalledTimes(2)
      expect(f.view.refreshPending).toBe(false)
    } finally {f.ds.destroy()}
  })

  it.each(['destroy', 'query-config', 'input'] as const)('cancels deferred work after %s changes', async kind => {
    const f = fixture()
    try {
      await f.view.refresh(); f.view.updateEditingValue('1', 'text', 'draft')
      await f.view.requestRefresh()
      if (kind === 'destroy') f.view.destroy()
      else {
        f.view.discardPendingChanges()
        if (kind === 'query-config') f.view.queryConfig = {allPages: true}
        else f.view.queryContext = {target: 'OTHER'}
      }
      await Promise.resolve(); await Promise.resolve()
      expect(f.executor.executeQuery).toHaveBeenCalledTimes(1)
      expect(f.view.refreshPending).toBe(false)
    } finally {f.ds.destroy()}
  })

  it('waits for a submission to finish before refreshing the original view', async () => {
    const f = fixture()
    try {
      await f.view.refresh(); f.view._trackMutating(1); f.stored('persisted')
      await f.view.requestRefresh()
      expect(f.executor.executeQuery).toHaveBeenCalledTimes(1)
      f.view._trackMutating(-1)
      await vi.waitFor(() => expect(f.view.rows[0]?.['text']).toBe('persisted'))
    } finally {f.ds.destroy()}
  })

  it('queues one fresh query after an in-flight query instead of restarting it', async () => {
    const f = fixture(); let release!: () => void
    try {
      await f.view.refresh(); f.holdQuery(new Promise(resolve => {release = resolve}))
      const loading = f.view.refresh()
      await f.view.requestRefresh(); await f.view.requestRefresh()
      expect(f.executor.executeQuery).toHaveBeenCalledTimes(2)
      f.stored('persisted'); release(); await loading
      await vi.waitFor(() => expect(f.executor.executeQuery).toHaveBeenCalledTimes(3))
      expect(f.view.rows[0]?.['text']).toBe('persisted')
    } finally {release?.(); f.ds.destroy()}
  })

  it('keeps a requested refresh while the original query waits for a parent view', async () => {
    const f = fixture(); let release!: () => void
    try {
      await f.other.refresh()
      f.ds.addCascade({parentTable: 'File', parentViewId: 'other', childTable: 'File', childViewId: 'default',
        filterBindings: [{sourceField: 'id', targetField: 'id'}]})
      await f.view.refresh()
      f.holdQuery(new Promise(resolve => {release = resolve}))
      const parent = f.other.refresh(), loading = f.view.refresh()
      expect(f.view.requestState).toBe(RequestState.Preparing)
      const queries = f.executor.executeQuery.mock.calls.length
      await f.view.requestRefresh()
      release(); await parent; await loading
      await vi.waitFor(() => expect(f.executor.executeQuery).toHaveBeenCalledTimes(queries + 2))
      expect(f.view.refreshPending).toBe(false)
      expect(f.view.requestState).toBe(RequestState.Loaded)
    } finally {release?.(); f.ds.destroy()}
  })

  it('exposes deferred query failure and retries only after another explicit request', async () => {
    const f = fixture()
    try {
      await f.view.refresh(); f.view.updateEditingValue('1', 'text', 'draft')
      await f.view.requestRefresh(); f.failQuery(true); f.view.discardPendingChanges()
      await vi.waitFor(() => expect(f.view.requestState).toBe(RequestState.Failed))
      expect(f.view.loadingError?.message).toBe('query failed'); expect(f.view.refreshPending).toBe(false)
      expect(f.executor.executeQuery).toHaveBeenCalledTimes(2)
      expect((await f.view.requestRefresh()).success).toBe(false)
      f.failQuery(false); f.stored('retried')
      expect((await f.view.requestRefresh()).success).toBe(true)
      expect(f.view.rows[0]?.['text']).toBe('retried')
    } finally {f.ds.destroy()}
  })

  it('keeps a query failure visible when editing also begins during the query and does not retry on cancellation', async () => {
    const f = fixture(); let release!: () => void
    try {
      await f.view.refresh(); f.holdQuery(new Promise(resolve => {release = resolve}))
      const loading = f.view.requestRefresh()
      f.view.updateEditingValue('1', 'text', 'later'); f.failQuery(true); release()
      expect((await loading).success).toBe(false)
      expect(f.view.getEditingRow('1')?.['text']).toBe('later')
      expect(f.view.loadingError?.message).toBe('query failed')
      expect(f.view.refreshPending).toBe(false)
      f.view.discardPendingChanges()
      await Promise.resolve(); await Promise.resolve()
      expect(f.executor.executeQuery).toHaveBeenCalledTimes(2)
      expect(f.view.requestState).toBe(RequestState.Failed)
    } finally {release?.(); f.ds.destroy()}
  })

  it('preserves edits made while a requested refresh is loading and completes after cancellation', async () => {
    const f = fixture(); let release!: () => void
    try {
      await f.view.refresh(); f.holdQuery(new Promise(resolve => {release = resolve})); f.stored('persisted')
      const loading = f.view.requestRefresh()
      f.view.updateEditingValue('1', 'text', 'later'); release()
      expect((await loading).success).toBe(true)
      expect(f.view.getEditingRow('1')?.['text']).toBe('later'); expect(f.view.refreshPending).toBe(true)
      f.view.discardPendingChanges()
      await vi.waitFor(() => expect(f.view.rows[0]?.['text']).toBe('persisted'))
    } finally {release?.(); f.ds.destroy()}
  })
})

describe('DataView source lifecycle', () => {
  it('reads source history without changing edits and rejects snapshots while any same-source view is dirty', async () => {
    const f = fixture()
    const create = vi.fn(async (_view: DataView, hooks: {assertCurrent(): void}) => {hooks.assertCurrent()})
    Object.assign(f.source, {history: {list: async () => [{version: 2, label: '2__config', lastModified: null}],
      preview: async (_view: DataView, version: string | number) => `version-${version}`, create}})
    try {
      await f.other.refresh(); f.other.updateEditingValue('1', 'text', 'draft')
      expect(await f.view.listSourceVersions()).toEqual([{version: 2, label: '2__config', lastModified: null}])
      expect(await f.view.previewSourceVersion(2)).toBe('version-2')
      expect(f.other.getEditingRow('1')?.['text']).toBe('draft')
      await expect(f.view.createSourceVersion()).rejects.toThrow('DIRTY')
      expect(create).not.toHaveBeenCalled()
      f.other.discardPendingChanges()
      await f.view.createSourceVersion()
      expect(create).toHaveBeenCalledOnce()
      expect(f.view.rows).toEqual([])
    } finally {f.ds.destroy()}
  })

  it.each(['edit-undo', 'query-input', 'destroy'] as const)('rejects history snapshot after asynchronous %s before the adapter writes', async change => {
    const f = fixture(); let release!: () => void
    const pending = new Promise<void>(resolve => {release = resolve})
    const written = vi.fn()
    Object.assign(f.source, {history: {list: async () => [], preview: async () => '',
      create: async (_view: DataView, hooks: {assertCurrent(): void}) => {await pending; hooks.assertCurrent(); written()}}})
    try {
      await f.other.refresh()
      const creation = f.view.createSourceVersion()
      const rejected = expect(creation).rejects.toThrow()
      if (change === 'edit-undo') {f.other.updateEditingValue('1', 'text', 'draft'); f.other.discardPendingChanges()}
      else if (change === 'query-input') f.other.queryContext = {target: 'changed'}
      else f.ds.destroy()
      release(); await rejected
      expect(written).not.toHaveBeenCalled()
    } finally {release(); f.ds.destroy()}
  })

  it('rejects a late historical preview after its source input changes', async () => {
    const f = fixture(); let release!: (value: string) => void
    Object.assign(f.source, {history: {list: async () => [], preview: async () => new Promise<string>(resolve => {release = resolve}),
      create: async () => {}}})
    try {
      const rejected = expect(f.view.previewSourceVersion(1)).rejects.toThrow('STALE')
      f.view.queryContext = {target: 'new'}; release('old')
      await rejected
      expect(f.view.rows).toEqual([])
    } finally {f.ds.destroy()}
  })

  it('previews without changing rows or edits and only discards approved views after successful adoption', async () => {
    const f = fixture()
    try {
      await f.view.refresh(); f.view.updateEditingValue('1', 'text', 'draft')
      const snapshot = await f.view.previewSource()
      expect(snapshot).toEqual({version: 1, content: 'remote'})
      expect(f.view.hasEditingChanges()).toBe(true); expect(f.view.rows[0]?.['text']).toBe('before')
      await f.view.adoptSource(snapshot, {discardViews: [f.view]})
      expect(f.applied).toHaveBeenCalledTimes(1); expect(f.view.hasEditingChanges()).toBe(false)
      await f.view.refresh(); expect(f.view.rows[0]?.['text']).toBe('remote')
      expect(f.other.rows).toEqual([])
    } finally {f.ds.destroy()}
  })

  it.each(['read', 'changed'] as const)('preserves edits when source validation fails: %s', async reason => {
    const f = fixture()
    try {
      await f.view.refresh(); f.view.updateEditingValue('1', 'text', 'draft')
      const snapshot = await f.view.previewSource()
      if (reason === 'read') f.fail(); else f.remote('newer')
      await expect(f.view.adoptSource(snapshot, {discardViews: [f.view]})).rejects.toThrow()
      expect(f.view.hasEditingChanges()).toBe(true); expect(f.applied).not.toHaveBeenCalled()
    } finally {f.ds.destroy()}
  })

  it('rejects unapproved edits and cancellation outside the source group', async () => {
    const f = fixture(), external = fixture()
    try {
      await f.other.refresh(); f.other.updateEditingValue('1', 'text', 'other draft')
      const snapshot = await f.view.previewSource()
      await expect(f.view.adoptSource(snapshot, {discardViews: [f.view]})).rejects.toThrow('File@other')
      await expect(f.view.adoptSource(snapshot, {discardViews: [f.other, external.view]})).rejects.toThrow('IDENTITY')
      expect(f.other.hasEditingChanges()).toBe(true); expect(f.applied).not.toHaveBeenCalled()
    } finally {f.ds.destroy(); external.ds.destroy()}
  })

  it.each(['edit', 'undo', 'query', 'refresh', 'dispose', 'identity', 'added-view'] as const)('rejects asynchronous %s before discarding', async change => {
    const f = fixture()
    try {
      await f.view.refresh(); f.view.updateEditingValue('1', 'text', 'draft')
      const snapshot = await f.view.previewSource()
      let release!: () => void
      f.wait(new Promise<void>(resolve => {release = resolve}))
      const rejection = expect(f.view.adoptSource(snapshot, {discardViews: [f.view]})).rejects.toThrow()
      if (change === 'edit' || change === 'undo') {
        f.view.updateEditingValue('1', 'text', 'new draft')
        if (change === 'undo') f.view.updateEditingValue('1', 'text', 'draft')
      } else if (change === 'query') f.other.queryContext = {target: 'other'}
      else if (change === 'refresh') await f.other.refresh()
      else if (change === 'dispose') f.ds.destroy()
      else if (change === 'identity') f.view.dataTable!.resourceId = 'other'
      else f.view.createQueryView('new')
      release(); await rejection
      expect(f.applied).not.toHaveBeenCalled()
      if (change !== 'dispose') expect(f.view.hasEditingChanges()).toBe(true)
    } finally {f.ds.destroy()}
  })

  it('rejects a stale preview without touching loaded rows', async () => {
    const f = fixture()
    try {
      let release!: () => void
      f.wait(new Promise<void>(resolve => {release = resolve}))
      const rejection = expect(f.view.previewSource()).rejects.toThrow()
      f.view.queryContext = {target: 'changed'}
      release(); await rejection
      expect(f.view.rows).toEqual([])
    } finally {f.ds.destroy()}
  })

  it('requires an explicitly supported source; ordinary query executors gain no implicit capability', async () => {
    const f = fixture()
    try {
      const view = f.ds.getTable('File')!.addView('plain')
      await expect(view.previewSource()).rejects.toThrow('UNSUPPORTED')
      await expect(view.adoptSource({version: 1, content: 'remote'})).rejects.toThrow('UNSUPPORTED')
      await expect(f.view.listSourceVersions()).rejects.toThrow('UNSUPPORTED')
      await expect(f.view.previewSourceVersion(1)).rejects.toThrow('UNSUPPORTED')
      await expect(f.view.createSourceVersion()).rejects.toThrow('UNSUPPORTED')
    } finally {f.ds.destroy()}
  })
})
