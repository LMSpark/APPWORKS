import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../../dataset'
import {ensureDataSetResourceView, prepareDataSetReadonlyCommandQuery} from '../../../data-set-command/data-set-command-view'

describe('query binding preflight', () => {
  it.each([{distinct: true}, {search: 'one'}, {include: ['related']}, {sourceInputMode: 'direct' as const},
    {sourceInputMode: 'mapped' as const}, {parentId: null}, {rootId: 'ROOT'}, {depthLimit: 1}, {limit: 1}, {treeMode: 'nested' as const}])('rejects unsupported local query semantics before capturing or loading (%j)', async params => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}]})
      const loadRows = vi.fn(async () => [{id: 'one'}]), captureQueryInputs = vi.fn(() => vi.fn())
      prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: 'result'}, guard: () => {}, loadRows, captureQueryInputs}).bind()
      if ('treeMode' in params) view.treeMode = params.treeMode
      await view.loadFromServer(params).catch(() => undefined)
      expect(view.loadingError).toBeInstanceOf(Error)
      expect(captureQueryInputs).not.toHaveBeenCalled()
      expect(loadRows).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('captures mutable filtering inputs before awaiting the complete loader', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}]})
      let finish: (rows: readonly Record<string, unknown>[]) => void = () => {throw new Error('not started')}
      const loadRows = vi.fn(() => new Promise<readonly Record<string, unknown>[]>(resolve => {finish = resolve}))
      prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: 'result'}, guard: () => {}, loadRows}).bind()
      const filter = {field: 'id', operator: 'eq' as const, value: 'A'}
      const pending = view.loadFromServer({filter})
      await vi.waitFor(() => expect(loadRows).toHaveBeenCalledOnce())
      filter.value = 'B'
      finish([{id: 'A'}, {id: 'B'}])
      await pending
      expect(view.rows).toMatchObject([{id: 'A'}])
    } finally {dataSet.destroy()}
  })

  it('does not expand output beyond the source query field catalog', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}, {name: 'secret'}]})
      prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: 'result'}, guard: () => {},
        queryColumns: target => target.dataTable!.columns.filter(column => column.name === 'id'), loadRows: async () => [{id: 'A', secret: 'hidden'}]}).bind()
      await view.refresh()
      expect(view.rows[0]).not.toHaveProperty('secret')
      expect(view.fieldAccess(view.rows[0]!, 'secret').read).toBe('invisible')
    } finally {dataSet.destroy()}
  })

  it('can filter on an unprojected source field while keeping it unreadable in output', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'status'}]})
      view.fieldProjection = ['id', 'name'].map(name => ({fieldId: name, source: 'resource' as const, resourceFieldId: null, resourceField: name,
        viewField: name, type: 'string' as const, label: name, output: true, sortOrder: 0, sortDirection: null, group: 0, distinct: false,
        primaryKey: name === 'id', value: '', valueFunction: '', expression: ''}))
      prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: 'result'}, guard: () => {},
        loadRows: async () => [{id: 'A', name: 'One', status: 'active'}, {id: 'B', name: 'Two', status: 'inactive'}]}).bind()
      await view.loadFromServer({filter: {field: 'status', operator: 'eq', value: 'active'}})
      expect(view.rows).toMatchObject([{id: 'A', name: 'One'}])
      expect(view.rows[0]).not.toHaveProperty('status')
      expect(view.fieldAccess(view.rows[0]!, 'status').read).toBe('invisible')
    } finally {dataSet.destroy()}
  })

  it.each([false, true])('never reintroduces a source-excluded field through a primary key override (inFlight=%s)', async inFlight => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}, {name: 'secret'}]})
      let finish: (rows: readonly Record<string, unknown>[]) => void = () => {throw new Error('not started')}
      const loadRows = vi.fn(() => new Promise<readonly Record<string, unknown>[]>(resolve => {finish = resolve}))
      prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: 'result'}, guard: () => {}, loadRows,
        queryColumns: target => target.dataTable!.columns.filter(column => column.name === 'id')}).bind()
      if (!inFlight) view.primaryKey = 'secret'
      const pending = view.refresh()
      if (inFlight) {
        await vi.waitFor(() => expect(loadRows).toHaveBeenCalledOnce())
        view.primaryKey = 'secret'
        finish([{id: 'A', secret: 'hidden'}])
      } else {
        await Promise.resolve()
        expect(loadRows).not.toHaveBeenCalled()
      }
      await pending
      expect(view.loadingError).toBeInstanceOf(Error)
      expect(view.rows).toEqual([])
    } finally {dataSet.destroy()}
  })

  it('prepares one readonly binding without executing callbacks and retains its resource snapshot', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}]})
      const resource = {resourceType: 'service-query', resourceId: 'result'}, guard = vi.fn(), loadRows = vi.fn(async () => [{id: 'one'}])
      const queryColumns = vi.fn(() => view.dataTable!.columns)
      const binding = prepareDataSetReadonlyCommandQuery(view, {resource, guard, loadRows, queryColumns})
      resource.resourceId = 'changed-after-prepare'
      binding.assertCanBind()
      expect(guard).not.toHaveBeenCalled()
      expect(loadRows).not.toHaveBeenCalled()
      expect(queryColumns).not.toHaveBeenCalled()
      binding.bind(); binding.assertCanBind(); binding.bind()
      await view.refresh()
      expect(view.loadingError).toBeNull()
      expect(view.rows).toMatchObject([{id: 'one'}])
      expect(loadRows).toHaveBeenCalledTimes(1)
    } finally {dataSet.destroy()}
  })

  it('rejects bound-only derived reads before capture, callbacks, registration or I/O', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}]})
      const guard = vi.fn(), captureQueryInputs = vi.fn(() => vi.fn()), loadRows = vi.fn(async () => [{id: 'one'}])
      const queryColumns = vi.fn(() => view.dataTable!.columns)
      prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: 'result'},
        derivedQueries: 'bound-view-only', guard, captureQueryInputs, loadRows, queryColumns}).bind()
      expect(() => view.createQueryView('implicit')).toThrow('DATA_VIEW_DERIVED_QUERY_UNSUPPORTED')
      await expect(view.queryOptionRows({fields: ['id']})).rejects.toThrow('DATA_VIEW_DERIVED_QUERY_UNSUPPORTED')
      expect(view.dataTable!.getView('implicit')).toBeUndefined()
      for (const callback of [guard, captureQueryInputs, loadRows, queryColumns]) expect(callback).not.toHaveBeenCalled()
      await view.refresh()
      expect(view.loadingError).toBeNull()
      expect(loadRows).toHaveBeenCalledOnce()
    } finally {dataSet.destroy()}
  })

  it('keeps ordinary read resources available to named views and complete option reads', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}]})
      const loadRows = vi.fn(async () => [{id: 'one'}])
      prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: 'result'}, guard: () => {}, loadRows}).bind()
      await view.refresh()
      const row = view.rows[0], peer = view.createQueryView('peer')
      await peer.refresh()
      expect(peer.loadingError).toBeNull()
      expect(peer.rows).toMatchObject([{id: 'one'}])
      expect(await view.queryOptionRows({fields: ['id']})).toEqual([{id: 'one'}])
      expect(view.rows[0]).toBe(row)
      expect(view.fieldAccess(view.rows[0]!, 'id').read).toBe('visible')
      expect(loadRows).toHaveBeenCalledTimes(3)
    } finally {dataSet.destroy()}
  })

  it('leaves an unbound view, resource and events unchanged and rechecks at binding time', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}]})
      const executor = {executeQuery: vi.fn(() => Promise.reject(new Error('not executed')))}
      const events = vi.fn()
      view.events.on('configChanged', events)
      view.assertCanBindQueryExecutor(executor, {resource: {resourceType: 'service-query', resourceId: 'result'}})
      expect(executor.executeQuery).not.toHaveBeenCalled()
      expect(events).not.toHaveBeenCalled()
      const other = {executeQuery: () => Promise.reject(new Error('other'))}
      view.bindQueryExecutor(other, {resource: {resourceType: 'service-query', resourceId: 'result'}})
      expect(() => view.bindQueryExecutor(executor, {resource: {resourceType: 'service-query', resourceId: 'result'}})).toThrow('DATA_VIEW_QUERY_IDENTITY')
      expect(() => view.assertCanBindQueryExecutor(other, {resource: {resourceType: 'service-query', resourceId: 'result'}})).not.toThrow()
      expect(executor.executeQuery).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('does not retain an invalid candidate resource identity', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'result', resource: {resourceType: 'service-query', resourceId: 'result'}, columns: [{name: 'id', primary: true}]})
      const executor = {executeQuery: () => Promise.reject(new Error('unused'))}
      expect(() => view.assertCanBindQueryExecutor(executor, {resource: {resourceType: 'service-query', resourceId: 'wrong'}})).toThrow('DATA_VIEW_QUERY_IDENTITY')
      expect(() => view.bindQueryExecutor(executor, {resource: {resourceType: 'service-query', resourceId: 'result'}})).not.toThrow()
    } finally {dataSet.destroy()}
  })
})
