import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../../dataset'
import type {DataRow} from '../../../types'
import {bindDataSetCommandSubmit, ensureDataSetFileCommandView,type BindCommandSubmitOptions} from '../../../data-set-command/data-set-command-view'

class TransportFailure extends Error {}

function setup(overrides: Partial<Pick<BindCommandSubmitOptions,'submit'|'verify'|'onPrepareInput'|'allowAbandonUnconfirmed'>> & {retainConfirmedOnRefresh?:boolean} = {}) {
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
    ...(overrides.allowAbandonUnconfirmed===undefined?{}:{allowAbandonUnconfirmed:overrides.allowAbandonUnconfirmed}),
    ...(overrides.retainConfirmedOnRefresh===undefined?{}:{retainConfirmedOnRefresh:overrides.retainConfirmedOnRefresh}),
    ...(overrides.onPrepareInput?{onPrepareInput:overrides.onPrepareInput}:{}),
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
  it('retains an acknowledged readonly receipt across refresh without submitting again when requested',async()=>{
    const f=setup({retainConfirmedOnRefresh:true});await addInput(f.view,{ServerName:'allocated-code'});await f.save();await f.view.refresh()
    expect(f.view.rows).toHaveLength(1);expect(f.view.rows[0]).toMatchObject({rowid:'K1',ServerName:'allocated-code'});expect(f.view.fieldAccess(f.view.rows[0]!,'ServerName').write).toBe('denied')
    await f.save();expect(f.submit).toHaveBeenCalledTimes(1);expect(f.verify).not.toHaveBeenCalled();expect(f.view.hasEditingChanges()).toBe(false)
    f.dataSet.destroy()
  })
  it('keeps explicit reset-on-refresh semantics for commands without retained receipts',async()=>{
    const f=setup();await addInput(f.view,{ServerName:'one-run'});await f.save();await f.view.refresh();expect(f.view.rows).toEqual([]);expect(f.submit).toHaveBeenCalledTimes(1);f.dataSet.destroy()
  })
  it('captures a readonly independent input after generating its local command id',async()=>{
    const capture=vi.fn((row:Readonly<DataRow>)=>{expect(row['rowid']).toBe('K1');expect(Reflect.set(row,'ServerName','changed')).toBe(false)})
    const {view,submit}=setup({onPrepareInput:capture})
    const row=await addInput(view,{ServerName:'S'})
    expect(capture).toHaveBeenCalledOnce();expect(row['ServerName']).toBe('S');expect(submit).not.toHaveBeenCalled()
  })
  it('rejects preparation before accepting any row or dispatching a command',async()=>{
    const {view,submit}=setup({onPrepareInput:()=>{throw Error('invalid intent')}});await view.refresh()
    await expect(view.addRow({ServerName:'S'})).rejects.toThrow('invalid intent')
    expect(view.rows).toEqual([]);expect(view.dirtyTracking.hasPendingChanges()).toBe(false);expect(submit).not.toHaveBeenCalled()
  })
  it('rejects asynchronous preparation instead of accepting a late capture',async()=>{
    const {view,submit}=setup({onPrepareInput:async()=>undefined});await view.refresh()
    await expect(view.addRow({ServerName:'S'})).rejects.toThrow('DATA_SET_COMMAND_PREPARE_SYNC')
    expect(view.rows).toEqual([]);expect(submit).not.toHaveBeenCalled()
  })
  it('checks the original lifecycle guard again after preparation',async()=>{
    let invalidate=()=>undefined
    const f=setup({onPrepareInput:()=>invalidate()});await f.view.refresh()
    invalidate=()=>{f.guard.mockImplementation(()=>{throw Error('expired scope')})}
    await expect(f.view.addRow({ServerName:'S'})).rejects.toThrow('expired scope');expect(f.view.rows).toEqual([])
  })
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
  it('preserves an unconfirmable original command when abandonment is disabled',async()=>{
    const f=setup({allowAbandonUnconfirmed:false,submit:async()=>{throw new TransportFailure('lost')},verify:async()=>{throw new TransportFailure('still unknown')}})
    const row=await addInput(f.view,{ServerName:'S'})
    await expect(f.save()).rejects.toThrow('lost')
    expect(f.view.abandonUnconfirmedSave()).toBe(false)
    await expect(f.view.discardAndReload()).rejects.toThrow()
    expect(f.view.hasUnconfirmedSaveFor([String(row['rowid'])])).toBe(true)
    expect(f.view.dirtyTracking.pendingCreateIds.has(String(row['rowid']))).toBe(true)
    await expect(f.save()).rejects.toThrow('still unknown')
    expect(f.submit).toHaveBeenCalledTimes(1);expect(f.verify).toHaveBeenCalledTimes(1)
  })
  it('retains explicit abandonment for resources that provide that recovery contract',async()=>{
    const f=setup({submit:async()=>{throw new TransportFailure('lost')}})
    await addInput(f.view,{ServerName:'S'});await expect(f.save()).rejects.toThrow('lost')
    expect(f.view.abandonUnconfirmedSave()).toBe(true);expect(f.view.hasUnconfirmedSave).toBe(false)
    expect(f.submit).toHaveBeenCalledTimes(1)
  })

})
