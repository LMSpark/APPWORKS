import { describe, expect, it, vi } from 'vitest'
import { DataSet } from '../../dataset'
import { DataView } from '../../data-view'
import type { DataRow } from '../../types'
import { DataValidator } from '../../validation/validation'

function query(tableName: string, rows: DataRow[]) {
  return {
    rows, total: rows.length,
    assertIdentity(identity: { scenarioId: string; metaName: string }) {
      if (identity.scenarioId !== 'SPACE' || identity.metaName !== tableName) throw new Error('identity mismatch')
    },
    rowKey: (row: DataRow) => row['id'],
    prepareNewRow: (row: DataRow) => ({ ...row, id: 'TEMP' }),
    fieldAccess: () => ({ read: 'visible' as const, write: 'allowed' as const,
      component: 'editable' as const, required: false, writeMode: 'editable' as const }),
    readFieldAccess: () => 'visible' as const,
    addActionState: () => 'enabled' as const, editActionState: () => 'enabled' as const,
    deleteActionState: () => 'enabled' as const, createChildActionState: () => 'enabled' as const,
    viewActionState: () => 'enabled' as const,
  }
}

async function resourceOwners(beforeDatabaseSave: () => Promise<void> = async () => {}, separateOrders = false) {
  const columns = [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'title', type: 'string', required: true}]
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', tables: {
    Items: {modelBinding: {modelId: 'I', modelName: 'Items'}, columns, views: {default: {commitMode: 'staged'}}},
    Orders: {modelBinding: {modelId: 'O', modelName: 'Orders'}, columns, views: {default: {commitMode: 'staged'}}},
    File: {resourceType: 'file', resourceId: 'config', columns, views: {default: {commitMode: 'staged'}}},
  }})
  const stored = new Map(['Items', 'Orders', 'File'].map(name => [name, [{id: '1', title: 'Before'}]]))
  const batches: string[][] = []
  type SaveCommand = Parameters<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>>[0]
  const owner = (database: boolean) => ({
    hasUnconfirmedSave: vi.fn(() => false),
    executeQuery: async (view: DataView) => query(view.tableName, structuredClone(stored.get(view.tableName)!)),
    save: vi.fn(async (command: SaveCommand) => {
      if (database) await beforeDatabaseSave()
      batches.push(command.changes.map(change => change.identity.metaName))
      return command.changes.map(change => {
        const changed = change.changes.changed ?? [], name = change.identity.metaName
        stored.set(name, changed.map(row => ({id: String(row['id']), title: String(row['title'])})))
        return {metaName: name, added: [], deleted: [], changed, changedFields: changed.map(() => ['title']),
          context: query(name, structuredClone(stored.get(name)!))}
      })
    }),
  })
  const items = dataSet.getView('Items')!, orders = dataSet.getView('Orders')!, file = dataSet.getView('File')!
  const database = owner(true)
  const orderOwner = separateOrders ? owner(false) : database, fileOwner = owner(false)
  items.bindQueryExecutor(database); orders.bindQueryExecutor(orderOwner)
  file.bindQueryExecutor(fileOwner, {resource: {resourceType: 'file', resourceId: 'config'}})
  await Promise.all([items.refresh(), orders.refresh(), file.refresh()])
  return {dataSet, items, orders, file, stored, batches, database, orderOwner, fileOwner}
}

describe('formal query-save column validation', () => {
  it.each(['save', 'cancel'] as const)('recovers only an unknown source, then allows the undispatched draft to %s', async action => {
    const f = await resourceOwners(undefined, true), persist = f.orderOwner.save.getMockImplementation()!
    let receipt: Awaited<ReturnType<typeof persist>> | undefined
    f.orderOwner.save.mockImplementation(async command => {
      if (receipt) {const result = receipt; receipt = undefined; return result}
      receipt = await persist(command); throw new Error('receipt lost')
    })
    f.orderOwner.hasUnconfirmedSave.mockImplementation(() => receipt !== undefined)
    try {
      for (const view of [f.items, f.orders, f.file]) view.updateEditingValue('1', 'title', 'Submitted')
      await expect(f.dataSet.saveChanges()).rejects.toThrow('receipt lost')
      expect([f.items.hasUnconfirmedSave, f.orders.hasUnconfirmedSave, f.file.hasUnconfirmedSave]).toEqual([false, true, false])
      f.orders.updateEditingValue('1', 'title', 'Later')
      expect(await f.dataSet.saveChanges()).toMatchObject({success: true, data: {savedCount: 1}})
      expect(f.batches).toEqual([['Items'], ['Orders']])
      expect(f.fileOwner.save).not.toHaveBeenCalled()
      expect(f.orders.getEditingRow('1')?.['title']).toBe('Later')
      expect(f.orders.hasUnconfirmedSave).toBe(false)
      if (action === 'cancel') f.file.discardPendingChanges()
      else expect((await f.dataSet.saveChanges({views: [{tableName: 'File', viewId: 'default'}]})).success).toBe(true)
      expect(f.stored.get('File')?.[0]?.title).toBe(action === 'cancel' ? 'Before' : 'Submitted')
      expect(f.database.save).toHaveBeenCalledOnce()
      expect(f.orders.getEditingRow('1')?.['title']).toBe('Later')
    } finally {f.dataSet.destroy()}
  })

  it.each(['replace', 'nested'] as const)('captures request configuration before awaiting another source: %s', async mode => {
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve}), f = await resourceOwners(() => gate)
    try {
      const transformRequest = (data: unknown) => data, transformResponse = (data: unknown) => data
      const endpoint = {url: '/original', headers: {'x-test': 'original'}, params: {values: ['original']}}
      const policy = {timeout: 1000, transformRequest, transformResponse}, table = f.file.dataTable!
      table.api = {update: endpoint}; table.crudConfig = policy
      f.items.updateEditingValue('1', 'title', 'Item submitted')
      f.file.updateEditingValue('1', 'title', 'File submitted')
      const pending = f.dataSet.saveChanges()
      await vi.waitFor(() => expect(f.database.save).toHaveBeenCalledTimes(1))
      if (mode === 'replace') {
        table.api = {update: {url: '/later', headers: {'x-test': 'later'}, params: {values: ['later']}}}
        table.crudConfig = {timeout: 2000}
      } else {
        endpoint.url = '/later'; endpoint.headers['x-test'] = 'later'; endpoint.params.values[0] = 'later'
        policy.timeout = 2000
      }
      release()
      expect((await pending).success).toBe(true)
      const config = f.fileOwner.save.mock.calls[0]?.[0].changes[0]?.tableConfig
      expect(config).toEqual({api: {update: {url: '/original', headers: {'x-test': 'original'}, params: {values: ['original']}}},
        crudConfig: {timeout: 1000, transformRequest, transformResponse}})
      expect(config?.crudConfig?.transformRequest).toBe(transformRequest)
      expect(config?.crudConfig?.transformResponse).toBe(transformResponse)
      f.file.updateEditingValue('1', 'title', 'Next submission')
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(f.fileOwner.save.mock.calls[1]?.[0].changes[0]?.tableConfig).toMatchObject({
        api: {update: {url: '/later', headers: {'x-test': 'later'}, params: {values: ['later']}}}, crudConfig: {timeout: 2000}})
    } finally {release(); f.dataSet.destroy()}
  })

  it('accepts confirmed sources and stops dispatch after a middle owner fails', async () => {
    const f = await resourceOwners(undefined, true), failure = new Error('order receipt unknown')
    try {
      f.orderOwner.save.mockRejectedValueOnce(failure)
      for (const view of [f.items, f.orders, f.file]) view.updateEditingValue('1', 'title', 'Submitted')
      await expect(f.dataSet.saveChanges()).rejects.toBe(failure)
      expect(f.database.save).toHaveBeenCalledTimes(1)
      expect(f.orderOwner.save).toHaveBeenCalledTimes(1)
      expect(f.fileOwner.save).not.toHaveBeenCalled()
      expect(f.items.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.items.mutatingError).toBeNull()
      expect(f.stored.get('Items')).toEqual([{id: '1', title: 'Submitted'}])
      for (const view of [f.orders, f.file]) {
        // The shared error is not evidence that this source dispatched; only the executor call establishes that here.
        expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
        expect(view.mutatingError).toBe(failure)
        expect(view.mutating).toBe(false)
      }
      expect(f.stored.get('File')).toEqual([{id: '1', title: 'Before'}])
      // A rejected batch has no aggregate success result; the owner must verify an unknown receipt before retrying.
    } finally {f.dataSet.destroy()}
  })

  it('captures all sources before dispatch, batches the same owner and retains later edits for the next submission', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const f = await resourceOwners(() => gate)
    try {
      f.items.updateEditingValue('1', 'title', 'Item submitted')
      f.orders.updateEditingValue('1', 'title', 'Order submitted')
      f.file.updateEditingValue('1', 'title', 'File submitted')
      const pending = f.dataSet.saveChanges()
      await vi.waitFor(() => expect(f.file.mutating).toBe(true))
      expect(() => f.file.discardPendingChanges()).toThrow('DATA_VIEW_DISCARD_BUSY')
      f.file.updateEditingValue('1', 'title', 'File later')
      release()
      expect(await pending).toMatchObject({success: true, data: {savedCount: 3, failedCount: 0}})
      expect(f.batches).toEqual([['Items', 'Orders'], ['File']])
      expect(f.stored.get('File')).toEqual([{id: '1', title: 'File submitted'}])
      expect(f.file.getEditingRow('1')?.['title']).toBe('File later')
      expect(await f.dataSet.saveChanges()).toMatchObject({success: true, data: {savedCount: 1}})
      expect(f.stored.get('File')).toEqual([{id: '1', title: 'File later'}])
      expect(f.batches).toEqual([['Items', 'Orders'], ['File'], ['File']])
    } finally {release(); f.dataSet.destroy()}
  })

  it('preflights invalid file changes before submitting a valid database source', async () => {
    const f = await resourceOwners()
    try {
      f.items.updateEditingValue('1', 'title', 'Item submitted')
      f.file.updateEditingValue('1', 'title', '')
      await expect(f.dataSet.saveChanges()).rejects.toThrow('File@default.title')
      expect(f.batches).toEqual([])
      expect(f.stored.get('Items')).toEqual([{id: '1', title: 'Before'}])
      expect(f.items.getEditingPatch('1')).toEqual({title: 'Item submitted'})
      expect(f.file.getEditingPatch('1')).toEqual({title: ''})
    } finally {f.dataSet.destroy()}
  })

  it('rejects same-scenario views from different running instances before dispatching either owner', async () => {
    const first = await resourceOwners(), second = await resourceOwners()
    try {
      await first.items.editRowById('1', {title: 'Item submitted'})
      await second.file.editRowById('1', {title: 'File submitted'})
      await expect(DataView.saveQueryViews([{view: first.items}, {view: second.file}])).rejects.toThrow('DATA_VIEW_SAVE_OWNER')
      expect(first.batches).toEqual([]); expect(second.batches).toEqual([])
      expect(first.items.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(second.file.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally {first.dataSet.destroy(); second.dataSet.destroy()}
  })

  it.each([false, true])('only submits an explicit undefined when the query owner declares clearing: %s', async clear => {
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'test', tables: {File: {
      resourceType: 'file', resourceId: 'config', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string'}], views: {default: {commitMode: 'staged'}},
    }}})
    try {
      const view = dataSet.getView('File')!
      const context = {...query('File', [{id: '1', text: 'before'}]), ...(clear ? {undefinedChanges: 'clear' as const} : {})}
      const save = vi.fn(async (command: Parameters<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>>[0]) => {
        const changed = command.changes[0]!.changes.changed!
        expect(Object.hasOwn(changed[0]!, 'text')).toBe(true)
        expect(changed[0]?.['text']).toBeUndefined()
        return [{metaName: 'File', added: [], deleted: [], changed, changedFields: [['text']], context: {...context, rows: [{id: '1'}]}}]
      })
      view.bindQueryExecutor({executeQuery: async () => context, save}, {resource: {resourceType: 'file', resourceId: 'config'}})
      await view.refresh(); view.updateEditingValue('1', 'text', undefined)
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(save).toHaveBeenCalledTimes(clear ? 1 : 0)
      if (clear) expect(view.rows[0]?.['text']).toBeUndefined()
      else {await view.refresh(); expect(view.rows[0]?.['text']).toBe('before')}
    } finally {dataSet.destroy()}
  })

  it('validates results before acceptance and ignores a superseded asynchronous validation', async () => {
    const ds=DataSet.fromJson({scenarioId:'SPACE',dataSetName:'Acceptance',tables:{Items:{
      modelBinding:{modelId:'M',modelName:'Items'},columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{autoLoad:false}}}}})
    try {
      const view=ds.getView('Items')!, execute=vi.fn(async()=>query('Items',[{id:'first'}]))
      view.bindQueryExecutor({executeQuery:execute});await view.refresh()
      let release!:()=>void
      const pending=new Promise<void>(resolve=>{release=resolve})
      execute.mockImplementation(async()=>query('Items',[{id:'second'}]))
      view.validateQueryResult=async result=>{if(result.rows[0]?.['id']==='second'){await pending;throw new Error('obsolete validation')}}
      const old=view.refresh();await Promise.resolve();await Promise.resolve()
      execute.mockImplementation(async()=>query('Items',[{id:'third'}]))
      await view.refresh();release();await old
      expect(view.rows[0]?.['id']).toBe('third');expect(view.loadingError).toBeNull()
      view.validateQueryResult=()=>{throw new Error('invalid result')}
      await view.refresh()
      expect(view.loadingError?.message).toBe('invalid result');expect(view.rows[0]?.['id']).toBe('third')
      expect(view.toJson()).not.toHaveProperty('validateQueryResult')
      ds.destroy();expect(view.validateQueryResult).toBeUndefined()
    } finally {ds.destroy()}
  })
  it('saves explicitly bound file resources through the same DataSet change pipeline without a backend model', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'files', tables: {
      File: {tableName: 'File', resourceType: 'file', resourceId: 'pagedata.json',
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string'}], views: {default: {commitMode: 'staged'}}},
    }})
    try {
      const view = dataSet.getView('File')!
      const context = query('File', [{id: '1', text: 'before'}])
      const save = vi.fn(async (command: Parameters<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>>[0]) => {
        expect(command.changes[0]?.identity).toMatchObject({scenarioId: 'SPACE', metaName: 'File',
          resource: {resourceType: 'file', resourceId: 'pagedata.json'}})
        const changed = command.changes[0]!.changes.changed!
        return [{metaName: 'File', added: [], deleted: [], changed, changedFields: [['text']], context: query('File', changed)}]
      })
      view.bindQueryExecutor({executeQuery: async () => context, save}, {
        resource: {resourceType: 'file', resourceId: 'pagedata.json'}, initialResult: context,
      })
      expect(view.dataTable?.modelBinding).toBeUndefined()
      expect(view.rows[0]?.['text']).toBe('before')
      view.updateEditingValue('1', 'text', 'after')
      const saved = await dataSet.saveChanges()
      expect(saved.success).toBe(true)
      expect(save).toHaveBeenCalledTimes(1)
      expect(view.rows[0]?.['text']).toBe('after')
      expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(false)
      await dataSet.saveChanges()
      expect(save).toHaveBeenCalledTimes(1)
    } finally {dataSet.destroy()}
  })

  it('does not infer resource save binding from metadata or permit changed resource identities', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'files', tables: {
      File: {tableName: 'File', resourceType: 'file', resourceId: 'pagedata.json',
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string'}], views: {default: {}}},
    }})
    try {
      const view = dataSet.getView('File')!, context = query('File', [{id: '1', text: 'before'}])
      const save = vi.fn(async () => {throw new Error('must not write')})
      const executor = {executeQuery: async () => context, save}
      expect(() => view.bindQueryExecutor(executor)).toThrow('DATA_VIEW_QUERY_IDENTITY')
      view.bindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: 'pagedata.json'}, initialResult: context})
      view.updateEditingValue('1', 'text', 'after')
      view.dataTable!.resourceId = 'other.json'
      await expect(dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_QUERY_IDENTITY')
      expect(save).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('rejects mixed model/resource identity and a wrong initial result before binding, then allows the valid owner', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'files', tables: {
      Mixed: {tableName: 'Mixed', resourceType: 'file', resourceId: 'pagedata.json',
        modelBinding: {modelId: 'MODEL', modelName: 'Mixed'}, columns: [], views: {default: {}}},
      File: {tableName: 'File', resourceType: 'file', resourceId: 'pagedata.json',
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string'}], views: {default: {}}},
    }})
    try {
      const view = dataSet.getView('File')!, context = query('File', [{id: '1', text: 'before'}])
      const executor = {executeQuery: vi.fn(async () => context)}
      const resource = {resourceType: 'file', resourceId: 'pagedata.json'}
      expect(() => dataSet.getView('Mixed')!.bindQueryExecutor(executor, {resource})).toThrow('DATA_VIEW_QUERY_IDENTITY')
      expect(() => view.bindQueryExecutor(executor, {resource, initialResult: query('Other', [])})).toThrow('identity mismatch')
      expect(view.rows).toEqual([])
      view.bindQueryExecutor(executor, {resource, initialResult: context})
      expect(view.rows[0]?.['text']).toBe('before')
      expect(executor.executeQuery).not.toHaveBeenCalled()
      expect(() => view.bindQueryExecutor(executor, {resource: {resourceId: 'pagedata.json', resourceType: 'file'}})).not.toThrow()
      expect(() => view.bindQueryExecutor(executor, {resource, initialResult: context})).toThrow('DATA_VIEW_QUERY_IDENTITY')
      const derived = view.createQueryView('derived')
      expect(derived.rows).toEqual([])
      expect((await derived.loadFromServer()).success).toBe(true)
      expect(derived.rows[0]?.['text']).toBe('before')
      expect(await view.queryOptionRows({fields: ['id', 'text']})).toEqual([{id: '1', text: 'before'}])
      expect(view.rows[0]?.['text']).toBe('before')
    } finally {dataSet.destroy()}
  })

  it('keeps the old whole-row callback in validate while column-only validation omits it', () => {
    const callback = vi.fn(() => [{ field: 'title', message: 'whole row', code: 'CUSTOM' }])
    const validator = new DataValidator({ columns: [{ name: 'title', type: 'string', required: true }], validate: callback })
    expect(validator.validateColumns({ title: 'Good' }).valid).toBe(true)
    expect(callback).not.toHaveBeenCalled()
    expect(validator.validate({ title: 'Good' }).errors.map(error => error.code)).toEqual(['CUSTOM'])
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('rejects a changed invalid configured field before the query save owner', async () => {
    const dataSet = DataSet.fromJson({ scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'title', type: 'string', required: true, minLength: 2 }], views: { default: {} } },
    } })
    const view = dataSet.getView('Orders')!
    const save = vi.fn(async () => { throw new Error('owner was called') })
    view.bindQueryExecutor({ executeQuery: async () => query('Orders', [{ id: '1', title: 'Before' }]), save })
    await view.loadFromServer()
    view.commitMode = 'staged'
    expect(await view.editRowById('1', { title: '' })).toBe(true)
    await expect(view.saveChanges()).rejects.toThrow('title')
    expect(save).not.toHaveBeenCalled()
    expect(view.rows[0]?.['title']).toBe('')
    dataSet.destroy()
  })

  it('preflights all selected views before applying a valid draft in another model', async () => {
    const dataSet = DataSet.fromJson({ scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {
      Items: { tableName: 'Items', modelBinding: { modelId: 'ITEM', modelName: 'Items' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true }, { name: 'title', type: 'string', required: true }],
        views: { default: {} } },
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true }, { name: 'title', type: 'string', required: true }],
        views: { default: {} } },
    } })
    const items = dataSet.getView('Items')!
    const orders = dataSet.getView('Orders')!
    const save = vi.fn(async () => { throw new Error('owner was called') })
    const executor = { executeQuery: async (view: typeof items) => query(view.tableName, [{ id: '1', title: 'Before' }]), save }
    items.bindQueryExecutor(executor)
    orders.bindQueryExecutor(executor)
    await items.loadFromServer()
    await orders.loadFromServer()
    items.updateEditingValue('1', 'title', 'Valid')
    orders.updateEditingValue('1', 'title', '')
    await expect(dataSet.saveChanges()).rejects.toThrow('Orders@default.title')
    expect(save).not.toHaveBeenCalled()
    expect(items.getEditingPatch('1')).toEqual({ title: 'Valid' })
    expect(orders.getEditingPatch('1')).toEqual({ title: '' })
    expect(items.rows[0]?.['title']).toBe('Before')
    expect(orders.rows[0]?.['title']).toBe('Before')
    expect(items.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(orders.dirtyTracking.hasPendingChanges()).toBe(false)
    dataSet.destroy()
  })

  it('does not rebase an earlier reverted dirty row when a later query-save row fails validation', async () => {
    const dataSet = DataSet.fromJson({ scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {
      Items: { tableName: 'Items', modelBinding: { modelId: 'ITEM', modelName: 'Items' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true }, { name: 'title', type: 'string', required: true }],
        views: { default: {} } },
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true }, { name: 'title', type: 'string', required: true }],
        views: { default: {} } },
    } })
    const items = dataSet.getView('Items')!
    const orders = dataSet.getView('Orders')!
    const save = vi.fn(async () => { throw new Error('owner was called') })
    const executor = { executeQuery: async (view: typeof items) => query(view.tableName, [{ id: '1', title: 'Before' }]), save }
    items.bindQueryExecutor(executor)
    orders.bindQueryExecutor(executor)
    await items.loadFromServer()
    await orders.loadFromServer()
    await items.editRowById('1', { title: 'Temporary' })
    await items.editRowById('1', { title: 'Before' })
    await orders.editRowById('1', { title: '' })
    expect(items.dirtyTracking.isDirty('1')).toBe(true)
    await expect(DataView.saveQueryViews([{ view: items }, { view: orders }])).rejects.toThrow('Orders@default.title')
    expect(items.dirtyTracking.isDirty('1')).toBe(true)
    expect(orders.dirtyTracking.isDirty('1')).toBe(true)
    expect(save).not.toHaveBeenCalled()
    dataSet.destroy()
  })

  it('checks all configured input columns for new rows and leaves deletion values alone', async () => {
    const dataSet = DataSet.fromJson({ scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'title', type: 'string', required: true, minLength: 2 },
          { name: 'amount', type: 'number', min: 0 }], views: { default: {} } },
    } })
    const view = dataSet.getView('Orders')!
    const save = vi.fn(async () => { throw new Error('owner reached') })
    view.bindQueryExecutor({ executeQuery: async () => query('Orders', [{ id: '1', title: '', amount: -1 }]), save })
    await view.loadFromServer()
    await view.addRow({ amount: -2 })
    await expect(view.saveChanges()).rejects.toThrow('Orders@default.title')
    expect(save).not.toHaveBeenCalled()
    expect(view.dirtyTracking.isPendingCreate('TEMP')).toBe(true)
    view.updateRowById('TEMP', { title: 'Good', amount: -2 })
    await expect(view.saveChanges()).rejects.toThrow('Orders@default.amount')
    expect(save).not.toHaveBeenCalled()
    view.updateRowById('TEMP', { amount: 0 })
    await view.removeRow('1')
    await expect(view.saveChanges()).rejects.toThrow('owner reached')
    expect(save).toHaveBeenCalledTimes(1)
    dataSet.destroy()
  })

  it('validates only the updated delta and accepts explicit new values despite a hidden old field', async () => {
    const dataSet = DataSet.fromJson({ scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'title', type: 'string', required: true, minLength: 2 },
          { name: 'amount', type: 'number', min: 0 }], views: { default: {} } },
    } })
    const view = dataSet.getView('Orders')!
    const save = vi.fn(async () => { throw new Error('owner reached') })
    const context = { ...query('Orders', [{ id: '1', title: '', amount: 2 }]),
      fieldAccess: (_key: unknown, field: string) => ({ read: field === 'title' ? 'invisible' as const : 'visible' as const,
        write: 'allowed' as const, component: field === 'title' ? 'hidden' as const : 'editable' as const,
        required: false, writeMode: 'editable' as const }),
      readFieldAccess: (_row: DataRow, field: string) => field === 'title' ? 'invisible' as const : 'visible' as const }
    view.bindQueryExecutor({ executeQuery: async () => context, save })
    await view.loadFromServer()
    expect(view.fieldAccess(view.rows[0] ?? null, 'title').read).toBe('invisible')
    await view.editRowById('1', { amount: 3 })
    await expect(view.saveChanges()).rejects.toThrow('owner reached')
    expect(save).toHaveBeenCalledTimes(1)
    await view.editRowById('1', { title: 'X' })
    await expect(view.saveChanges()).rejects.toThrow('Orders@default.title')
    expect(save).toHaveBeenCalledTimes(1)
    await view.editRowById('1', { title: 'New' })
    await expect(view.saveChanges()).rejects.toThrow('owner reached')
    expect(save).toHaveBeenCalledTimes(2)
    dataSet.destroy()
  })

  it('respects selected row ids and applyEditingRows false without reading an unselected invalid draft', async () => {
    const dataSet = DataSet.fromJson({ scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'title', type: 'string', required: true }], views: { default: {} } },
    } })
    const view = dataSet.getView('Orders')!
    const save = vi.fn(async () => { throw new Error('owner reached') })
    view.bindQueryExecutor({ executeQuery: async () => query('Orders', [
      { id: '1', title: 'Before' }, { id: '2', title: 'Before' },
    ]), save })
    await view.loadFromServer()
    view.updateEditingValue('1', 'title', '')
    await view.editRowById('2', { title: 'Valid' })
    await expect(dataSet.saveChanges({ views: [{ tableName: 'Orders', viewId: 'default', ids: ['2'] }] }))
      .rejects.toThrow('owner reached')
    expect(view.getEditingPatch('1')).toEqual({ title: '' })
    expect(view.rows[0]?.['title']).toBe('Before')
    await expect(dataSet.saveChanges({ applyEditingRows: false })).rejects.toThrow('owner reached')
    expect(save).toHaveBeenCalledTimes(2)
    await expect(dataSet.saveChanges({ views: [{ tableName: 'Orders', viewId: 'default', ids: [] }] }))
      .resolves.toMatchObject({ success: true, data: { savedCount: 0 } })
    expect(save).toHaveBeenCalledTimes(2)
    dataSet.destroy()
  })

  it('ignores computed values and rejects a duplicate original query identity before save', async () => {
    const dataSet = DataSet.fromJson({ scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'amount', type: 'number', min: 0 },
          { name: 'total', type: 'number', computeExpression: 'amount * 2', min: 100 }], views: { default: {} } },
    } })
    const view = dataSet.getView('Orders')!
    const payloads: string[] = []
    const save = vi.fn(async (command: unknown) => { payloads.push(JSON.stringify(command)); throw new Error('owner reached') })
    view.bindQueryExecutor({ executeQuery: async () => query('Orders', [{ id: '1', amount: 1 }]), save })
    await view.loadFromServer()
    await view.editRowById('1', { amount: 2 })
    await expect(view.saveChanges()).rejects.toThrow('owner reached')
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).not.toContain('"total":4')
    dataSet.destroy()

    const duplicate = DataSet.fromJson({ scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {
      Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'amount', type: 'number', min: 0 }], views: { default: {} } },
    } })
    const duplicateView = duplicate.getView('Orders')!
    const duplicateSave = vi.fn(async () => { throw new Error('owner reached') })
    duplicateView.bindQueryExecutor({ executeQuery: async () => query('Orders', [
      { id: '1', amount: 1 }, { id: '1', amount: 1 },
    ]), save: duplicateSave })
    await duplicateView.loadFromServer()
    await duplicateView.editRowById('1', { amount: 2 })
    await expect(duplicateView.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_BASELINE')
    expect(duplicateSave).not.toHaveBeenCalled()
    duplicate.destroy()
  })
})
