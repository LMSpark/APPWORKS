import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import type {DataRow} from '../../types'
import {bindDataSetCommandSubmit, ensureDataSetFileCommandView} from '../../data-set-command/data-set-command-view'

class TransportFailure extends Error {}

function setup(overrides: Partial<{
  submit: (row: DataRow) => Promise<DataRow>
  verify: (row: DataRow) => Promise<DataRow | undefined>
}> = {}) {
  const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
  const view = ensureDataSetFileCommandView({
    dataSet,
    tableName: 'Register',
    resourceId: 'register',
    columns: [{name: 'rowid', primary: true}, {name: 'ServerName'}, {name: 'Password'}, {name: 'note'}],
  })
  const submit = vi.fn(overrides.submit ?? (async (row: DataRow) => ({rowid: row['rowid'], ServerName: row['ServerName']})))
  const verify = vi.fn(overrides.verify ?? (async (_row: DataRow): Promise<DataRow | undefined> => undefined))
  const guard = vi.fn()
  let next = 0
  bindDataSetCommandSubmit(view, {
    resource: {resourceType: 'file', resourceId: 'register'},
    guard,
    inputFields: ['ServerName', 'Password'],
    createKey: () => `K${++next}`,
    submit,
    verify,
    isUnconfirmed: error => error instanceof TransportFailure,
  })
  const save = () => dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
  return {dataSet, view, submit, verify, guard, save}
}

async function addInput(view: ReturnType<typeof setup>['view'], values: Record<string, string>): Promise<DataRow> {
  await view.refresh()
  const created = await view.addRow(values)
  if (!('rowid' in created)) throw new Error('addRow 未返回行')
  return created
}

describe('DataSet command submit helper', () => {
  it('submits one added input row and accepts the command receipt', async () => {
    const {view, submit, guard, save} = setup()
    await view.refresh()
    expect(view.rows).toEqual([])
    expect(view.addActionState()).toBe('enabled')
    const row = await addInput(view, {ServerName: 'S', Password: 'p'})
    expect(row['rowid']).toBe('K1')
    expect(view.fieldAccess(row, 'ServerName')).toMatchObject({write: 'allowed', component: 'editable'})
    expect(view.fieldAccess(row, 'Password').write).toBe('allowed')
    expect(view.fieldAccess(row, 'note').write).toBe('denied')

    const result = await save()
    expect(result.success).toBe(true)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0]?.[0]).toMatchObject({rowid: 'K1', ServerName: 'S', Password: 'p'})
    expect(guard).toHaveBeenCalled()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    const accepted = view.rows[0]!
    expect(accepted['rowid']).toBe('K1')
    expect(view.fieldAccess(accepted, 'ServerName').write).toBe('denied')
  })

  it('keeps the input row when the command is definitely rejected', async () => {
    const {view, submit, save} = setup({submit: async () => { throw new Error('连接失败') }})
    await addInput(view, {ServerName: 'S'})
    await expect(save()).rejects.toThrow('连接失败')
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('verifies an unconfirmed submit on the next save without replaying it', async () => {
    const {view, submit, verify, save} = setup({
      submit: async () => { throw new TransportFailure('timeout') },
      verify: async row => ({rowid: row['rowid'], ServerName: 'S'}),
    })
    await addInput(view, {ServerName: 'S'})
    await expect(save()).rejects.toThrow('timeout')
    expect(view.hasUnconfirmedSave).toBe(true)

    const result = await save()
    expect(result.success).toBe(true)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(verify.mock.calls[0]?.[0]).toMatchObject({rowid: 'K1'})
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('reports a verified non-applied command and allows an explicit resubmit', async () => {
    let attempt = 0
    const {view, submit, verify, save} = setup({
      submit: async row => {
        attempt += 1
        if (attempt === 1) throw new TransportFailure('network')
        return {rowid: row['rowid'], ServerName: row['ServerName']}
      },
    })
    await addInput(view, {ServerName: 'S'})
    await expect(save()).rejects.toThrow('network')
    await expect(save()).rejects.toThrow('DATA_SET_COMMAND_NOT_APPLIED')
    expect(verify).toHaveBeenCalledTimes(1)
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)

    expect((await save()).success).toBe(true)
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it('rejects submitting more than one command row at once', async () => {
    const {view, submit, save} = setup()
    await addInput(view, {ServerName: 'A'})
    await view.addRow({ServerName: 'B'})
    await expect(save()).rejects.toThrow('DATA_SET_COMMAND_SINGLE_ROW')
    expect(submit).not.toHaveBeenCalled()
  })
})
