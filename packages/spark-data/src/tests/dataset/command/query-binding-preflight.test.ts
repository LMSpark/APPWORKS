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
