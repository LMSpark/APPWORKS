import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../../dataset'
import {ensureDataSetFileCommandView, prepareDataSetReadonlyCommandQuery} from '../../../data-set-command/data-set-command-view'

describe('query binding preflight', () => {
  it('prepares one readonly binding without executing callbacks and retains its resource snapshot', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetFileCommandView({dataSet, tableName: 'result', resourceId: 'result', columns: [{name: 'id', primary: true}]})
      const resource = {resourceType: 'file', resourceId: 'result'}, guard = vi.fn(), loadRows = vi.fn(async () => [{id: 'one'}])
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
      const view = ensureDataSetFileCommandView({dataSet, tableName: 'result', resourceId: 'result', columns: [{name: 'id', primary: true}]})
      const guard = vi.fn(), captureQueryInputs = vi.fn(() => vi.fn()), loadRows = vi.fn(async () => [{id: 'one'}])
      const queryColumns = vi.fn(() => view.dataTable!.columns)
      prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'file', resourceId: 'result'},
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
      const view = ensureDataSetFileCommandView({dataSet, tableName: 'result', resourceId: 'result', columns: [{name: 'id', primary: true}]})
      const loadRows = vi.fn(async () => [{id: 'one'}])
      prepareDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'file', resourceId: 'result'}, guard: () => {}, loadRows}).bind()
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
      const view = ensureDataSetFileCommandView({dataSet, tableName: 'result', resourceId: 'result', columns: [{name: 'id', primary: true}]})
      const executor = {executeQuery: vi.fn(() => Promise.reject(new Error('not executed')))}
      const events = vi.fn()
      view.events.on('configChanged', events)
      view.assertCanBindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: 'result'}})
      expect(executor.executeQuery).not.toHaveBeenCalled()
      expect(events).not.toHaveBeenCalled()
      const other = {executeQuery: () => Promise.reject(new Error('other'))}
      view.bindQueryExecutor(other, {resource: {resourceType: 'file', resourceId: 'result'}})
      expect(() => view.bindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: 'result'}})).toThrow('DATA_VIEW_QUERY_IDENTITY')
      expect(() => view.assertCanBindQueryExecutor(other, {resource: {resourceType: 'file', resourceId: 'result'}})).not.toThrow()
      expect(executor.executeQuery).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('does not retain an invalid candidate resource identity', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'PREFLIGHT', tables: {}})
    try {
      const view = ensureDataSetFileCommandView({dataSet, tableName: 'result', resourceId: 'result', columns: [{name: 'id', primary: true}]})
      const executor = {executeQuery: () => Promise.reject(new Error('unused'))}
      expect(() => view.assertCanBindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: 'wrong'}})).toThrow('DATA_VIEW_QUERY_IDENTITY')
      expect(() => view.bindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: 'result'}})).not.toThrow()
    } finally {dataSet.destroy()}
  })
})
