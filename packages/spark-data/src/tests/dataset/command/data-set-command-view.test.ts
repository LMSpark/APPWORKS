import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../../dataset'
import {
  bindDataSetReadonlyCommandQuery,
  dataSetCommandQueryResultFromLocalRows,
  ensureDataSetFileCommandView,
  ensureDataSetStaticInputTable,
} from '../../../data-set-command/data-set-command-view'

describe('DataSet command view helper', () => {
  it('queries a local derived resource with readonly fields and an explicit scope guard', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'local-options', tables: {Targets: {
      resourceType: 'static-data', resourceId: 'navigation-targets',
      columns: [{name: 'value', type: 'string', isPrimaryKey: true}, {name: 'label', type: 'string'}],
      views: {default: {autoLoad: false}},
    }}})
    const view = dataSet.getView('Targets')!
    let current = true
    let rows = [{value: 'cfg:orders', label: 'Orders'}]
    const guard = () => {if (!current) throw new Error('target scope changed')}
    view.bindQueryExecutor({
      queryColumns: target => target.columns,
      executeQuery: target => dataSetCommandQueryResultFromLocalRows(target, rows, guard),
    }, {resource: {resourceType: 'static-data', resourceId: 'navigation-targets'}})
    try {
      await view.refresh()
      expect(view.loadingError).toBeNull()
      expect(view.rows).toMatchObject(rows)
      expect(view.dataTable?.modelBinding).toBeUndefined()
      expect(view.fieldAccess(view.rows[0]!, 'label')).toMatchObject({read: 'visible', write: 'denied'})
      rows = [{value: 'cfg:billing', label: 'Billing'}]
      await view.refresh()
      expect(view.rows.map(row => row['value'])).toEqual(['cfg:billing'])
      current = false
      expect(() => view.fieldAccess(view.rows[0]!, 'label')).toThrow('target scope changed')
    } finally {dataSet.destroy()}
  })

  it('ensure static input and file command view then refresh readonly rows', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    ensureDataSetStaticInputTable(dataSet, 'CmdInput', [{name: 'commandId', primary: true}, {name: 'value'}])
    const input = dataSet.getTable('CmdInput')!
    input.addRows([{commandId: 'default', value: 'x'}])
    const resultView = ensureDataSetFileCommandView({dataSet, tableName: 'CmdResult', resourceId: 'cmd-result', columns: [{name: 'ok', primary: true}]})
    const guard = vi.fn()
    bindDataSetReadonlyCommandQuery(resultView, {
      resource: {resourceType: 'file', resourceId: 'cmd-result'},
      guard,
      loadRows: async () => [{ok: 'yes'}],
    })
    await resultView.refresh()
    expect(guard).toHaveBeenCalled()
    expect(resultView.rows[0]?.['ok']).toBe('yes')
    expect(resultView.fieldAccess(resultView.rows[0]!, 'ok').read).toBe('visible')
    expect(resultView.fieldAccess(resultView.rows[0]!, 'ok').write).toBe('denied')
  })

  it('ensure file command view is idempotent', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    const first = ensureDataSetFileCommandView({dataSet, tableName: 'Once', resourceId: 'once', columns: [{name: 'id', primary: true}]})
    const second = ensureDataSetFileCommandView({dataSet, tableName: 'Once', resourceId: 'once', columns: [{name: 'id', primary: true}]})
    expect(first).toBe(second)
    expect(dataSet.getTable('Once')).toBeTruthy()
  })
})
