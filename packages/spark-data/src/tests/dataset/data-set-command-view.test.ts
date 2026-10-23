import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {
  bindDataSetReadonlyCommandQuery,
  ensureDataSetFileCommandView,
  ensureDataSetStaticInputTable,
} from '../../data-set-command/data-set-command-view'

describe('DataSet command view helper', () => {
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
