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
  const binding = vi.spyOn(view, 'bindQueryExecutor')
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
  const executor = binding.mock.calls[0]![0]
  binding.mockRestore()
  const save = () => dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
  return {dataSet, view, submit, verify, guard, save, executor}
}

async function addInput(view: ReturnType<typeof setup>['view'], values: Record<string, string>): Promise<DataRow> {
  await view.refresh()
  const created = await view.addRow(values)
  if (!('rowid' in created)) throw new Error('addRow 未返回行')
  return created
}

describe('DataSet command submit helper', () => {
  it('calls the acceptance notification with its original executor receiver', async () => {
    const f = setup()
    const original = f.executor.acknowledgeSave!
    const receivers: unknown[] = []
    const notification = vi.spyOn(f.executor, 'acknowledgeSave').mockImplementation(function (this: typeof f.executor, context) {
      receivers.push(this)
      return original(context)
    })
    try {
      await addInput(f.view, {ServerName: 'original'})
      expect((await f.save()).success).toBe(true)
      expect(notification).toHaveBeenCalledOnce()
      expect(receivers).toEqual([f.executor])
      expect(f.view.hasUnconfirmedSave).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it('observes a JavaScript async notification rejection without rejecting an accepted save', async () => {
    const f = setup()
    const original = f.executor.acknowledgeSave!
    Reflect.set(f.executor, 'acknowledgeSave', (context: Parameters<typeof original>[0]) => {
      original(context)
      return Promise.reject(new Error('async notification failed'))
    })
    try {
      await addInput(f.view, {ServerName: 'original'})
      expect((await f.save()).success).toBe(true)
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.submit).toHaveBeenCalledTimes(1)
      await Promise.resolve()
    } finally {f.dataSet.destroy()}
  })

  it('does not turn an accepted save into a failure when the source notification throws', async () => {
    const f = setup()
    const original = f.executor.acknowledgeSave!
    vi.spyOn(f.executor, 'acknowledgeSave').mockImplementation(context => {
      original(context)
      throw new Error('notification failed')
    })
    try {
      await addInput(f.view, {ServerName: 'original'})
      expect((await f.save()).success).toBe(true)
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect((await f.save()).success).toBe(true)
      expect(f.submit).toHaveBeenCalledTimes(1)
    } finally {f.dataSet.destroy()}
  })

  it('does not restore a pending save capture on a destroyed view after an in-flight receipt', async () => {
    let release: (row: DataRow) => void = () => {throw new Error('submit not started')}
    const response = new Promise<DataRow>(resolve => {release = resolve})
    const f = setup({submit: async () => response})
    await addInput(f.view, {ServerName: 'original'})
    const save = f.save()
    const outcome = expect(save).rejects.toThrow()
    await vi.waitFor(() => expect(f.submit).toHaveBeenCalledTimes(1))
    f.dataSet.destroy()
    release({rowid: 'K1'})
    await outcome
    expect(f.view.destroyed).toBe(true)
    expect(f.view.hasUnconfirmedSave).toBe(false)
    expect(f.verify).not.toHaveBeenCalled()
  })

  it('stops before dispatching a second command view when the first command fails', async () => {
    const f = setup({submit: async row => {
      if (row['rowid'] === 'K1') throw new Error('first command rejected')
      return {...row}
    }})
    try {
      const second = f.view.createQueryView('second')
      await addInput(f.view, {ServerName: 'first'})
      await addInput(second, {ServerName: 'second'})
      await expect(f.dataSet.saveChanges()).rejects.toThrow('first command rejected')
      expect(f.submit).toHaveBeenCalledTimes(1)
      expect(second.dirtyTracking.pendingCreateIds.has('K2')).toBe(true)
      expect(second.hasUnconfirmedSave).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it('keeps the first view confirmed and only verifies the second unknown command', async () => {
    const f = setup({submit: async row => {
      if (row['rowid'] === 'K2') throw new TransportFailure('second command unknown')
      return {...row}
    }, verify: async row => ({...row})})
    try {
      const second = f.view.createQueryView('second')
      await addInput(f.view, {ServerName: 'first'})
      await addInput(second, {ServerName: 'second'})
      await expect(f.dataSet.saveChanges()).rejects.toThrow('second command unknown')
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.view.hasUnconfirmedSave).toBe(false)
      expect(second.hasUnconfirmedSaveFor(['K2'])).toBe(true)
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(f.submit).toHaveBeenCalledTimes(2)
      expect(f.verify).toHaveBeenCalledTimes(1)
      expect(f.verify.mock.calls[0]?.[0]).toMatchObject({rowid: 'K2'})
    } finally {f.dataSet.destroy()}
  })

  it('does not dispatch again when scope expires after the adapter receipt but before DataView acceptance', async () => {
    let arm = false, expired = false
    const f = setup({retainConfirmedOnRefresh: true, submit: async row => {arm = true; return {...row}}})
    try {
      await addInput(f.view, {ServerName: 'original'})
      f.guard.mockImplementation(() => {
        if (expired) throw new Error('late scope expiry')
        if (arm) {arm = false; queueMicrotask(() => {expired = true})}
      })
      await expect(f.save()).rejects.toThrow('late scope expiry')
      expect(f.view.hasUnconfirmedSaveFor(['K1'])).toBe(true)
      expired = false
      expect(f.view.abandonUnconfirmedSave()).toBe(false)
      expect((await f.save()).success).toBe(true)
      expect(f.submit).toHaveBeenCalledTimes(1)
      expect(f.verify).not.toHaveBeenCalled()
      await f.view.refresh()
      expect(f.view.rows).toMatchObject([{rowid: 'K1', ServerName: 'original'}])
    } finally {f.dataSet.destroy()}
  })

  it('isolates original command input from mutations by submit and every verification attempt', async () => {
    const f = setup({submit: async row => {row['rowid'] = 'mutated'; row['ServerName'] = 'mutated'; throw new TransportFailure('lost')},
      verify: async row => {row['rowid'] = 'mutated-again'; throw new TransportFailure('still unknown')},
    })
    try {
      await addInput(f.view, {ServerName: 'original'})
      await expect(f.save()).rejects.toThrow('lost')
      await expect(f.save()).rejects.toThrow('still unknown')
      f.verify.mockImplementation(async row => {
        expect(row).toMatchObject({rowid: 'K1', ServerName: 'original'})
        return {...row}
      })
      expect((await f.save()).success).toBe(true)
      expect(f.submit).toHaveBeenCalledTimes(1)
    } finally {f.dataSet.destroy()}
  })

  it('retains an independent confirmed receipt instead of sharing nested adapter state', async () => {
    const receipt = {rowid: 'K1', ServerName: {value: 'confirmed'}}
    const f = setup({retainConfirmedOnRefresh: true, submit: async () => receipt})
    try {
      await addInput(f.view, {ServerName: 'original'})
      await f.save()
      receipt.ServerName.value = 'changed outside'
      await f.view.refresh()
      expect(f.view.rows[0]?.['ServerName']).toEqual({value: 'confirmed'})
    } finally {f.dataSet.destroy()}
  })

  it('retains the original command when its scope expires while a receipt is in flight', async () => {
    let invalidate = () => {}
    const f = setup({retainConfirmedOnRefresh: true,
      submit: async row => {invalidate(); return {...row}},
      verify: async row => ({...row, ServerName: 'confirmed'}),
    })
    try {
      await addInput(f.view, {ServerName: 'original'})
      invalidate = () => {f.guard.mockImplementation(() => {throw new Error('scope expired')})}
      await expect(f.save()).rejects.toThrow('scope expired')
      expect(f.view.hasUnconfirmedSaveFor(['K1'])).toBe(true)
      f.guard.mockReset()
      expect((await f.save()).success).toBe(true)
      expect(f.submit).toHaveBeenCalledTimes(1)
      expect(f.verify).toHaveBeenCalledTimes(1)
      await f.view.refresh()
      expect(f.view.rows).toMatchObject([{rowid: 'K1', ServerName: 'confirmed'}])
    } finally {f.dataSet.destroy()}
  })

  it.each([undefined, 'K2'])('keeps a dispatched command unknown after an invalid receipt key %s', async key => {
    const f = setup({retainConfirmedOnRefresh: true,
      submit: async () => key === undefined ? {} : {rowid: key},
      verify: async row => ({rowid: row['rowid'], ServerName: 'confirmed'}),
    })
    try {
      await addInput(f.view, {ServerName: 'original'})
      await expect(f.save()).rejects.toThrow('DATA_SET_COMMAND_RECEIPT_IDENTITY')
      expect(f.view.hasUnconfirmedSaveFor(['K1'])).toBe(true)
      expect(f.view.rows.some(row => row['rowid'] === 'K2')).toBe(false)
      expect((await f.save()).success).toBe(true)
      expect(f.submit).toHaveBeenCalledTimes(1)
      expect(f.verify).toHaveBeenCalledTimes(1)
      expect(f.verify.mock.calls[0]?.[0]).toMatchObject({rowid: 'K1', ServerName: 'original'})
      await f.view.refresh()
      expect(f.view.rows).toMatchObject([{rowid: 'K1', ServerName: 'confirmed'}])
    } finally {f.dataSet.destroy()}
  })

  it.each([undefined, 'K2'])('preserves the original unknown capture after invalid verification key %s', async key => {
    const f = setup({retainConfirmedOnRefresh: true, submit: async () => {throw new TransportFailure('lost')},
      verify: async () => key === undefined ? {} : {rowid: key},
    })
    try {
      await addInput(f.view, {ServerName: 'original'})
      await expect(f.save()).rejects.toThrow('lost')
      await expect(f.save()).rejects.toThrow('DATA_SET_COMMAND_RECEIPT_IDENTITY')
      expect(f.view.hasUnconfirmedSaveFor(['K1'])).toBe(true)
      f.verify.mockResolvedValue({rowid: 'K1', ServerName: 'confirmed'})
      expect((await f.save()).success).toBe(true)
      expect(f.submit).toHaveBeenCalledTimes(1)
      expect(f.verify).toHaveBeenCalledTimes(2)
      await f.view.refresh()
      expect(f.view.rows).toMatchObject([{rowid: 'K1', ServerName: 'confirmed'}])
    } finally {f.dataSet.destroy()}
  })

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

  it('reports source-proven not-applied through structured DataSet recovery without resubmitting',async()=>{
    const f=setup({submit:async()=>{throw new TransportFailure('lost')}})
    try{
      await addInput(f.view,{ServerName:'S'})
      await expect(f.save()).rejects.toThrow('lost')
      expect(await f.dataSet.resolveUnconfirmedSaves()).toMatchObject({state:'not-applied',views:[{tableName:'Register',state:'not-applied'}]})
      expect(f.submit).toHaveBeenCalledOnce();expect(f.verify).toHaveBeenCalledOnce()
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(true)
    }finally{f.dataSet.destroy()}
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
