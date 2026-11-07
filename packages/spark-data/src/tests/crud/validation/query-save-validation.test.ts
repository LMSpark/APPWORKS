import { describe, expect, it, vi } from 'vitest'
import { DataSet, DataSetSavePreflightError } from '../../../dataset'
import { DataView } from '../../../data-view'
import type { DataRow } from '../../../types'
import { DataValidator } from '../../../validation/validation'

function query(tableName: string, rows: readonly DataRow[]) {
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

describe('formal query-save receipt identity', () => {
  type Save = NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>
  type Receipt = Awaited<ReturnType<Save>>[number]

  async function open() {
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', tables: {Items: {
      modelBinding: {modelId: 'I', modelName: 'Items'},
      crudConfig: {timeout: 1000},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'title', type: 'string'}, {name: 'payload', type: 'json'}],
      views: {default: {commitMode: 'staged'}},
    }}})
    const view = dataSet.getView('Items')!
    const initial = [{id: 'A', title: 'Before A', payload: {value: 'original'}}, {id: 'B', title: 'Before B', payload: {value: 'original'}}]
    let sequence = 0
    let transform = (receipt: Receipt): Receipt => receipt
    const save = vi.fn(async (command: Parameters<Save>[0]): Promise<Receipt[]> => command.changes.map(change => {
      const changed = change.changes.changed ?? [], deleted = change.changes.deleted ?? []
      const added = (change.changes.added ?? []).map((row, index) => ({...row, id: `CREATED${index + 1}`}))
      const stored = initial.filter(row => !deleted.some(item => item['id'] === row.id))
        .map(row => changed.find(item => item['id'] === row.id) ?? row)
      return transform({metaName: 'Items', added, changed, deleted, changedFields: changed.map(() => ['title']),
        context: query('Items', [...stored, ...added])})
    }))
    const executor = {save, executeQuery: async () => ({...query('Items', structuredClone(initial)),
      prepareNewRow: (row: Readonly<DataRow>) => ({...row, id: `TEMP${++sequence}`})})}
    view.bindQueryExecutor(executor)
    await view.refresh()
    return {dataSet, view, save, executor, transform: (next: typeof transform) => {transform = next}}
  }

  it.each(['absent', 'false'] as const)('blocks replay after an invalid receipt when source verification is %s', async mode => {
    const f = await open(), abandon = vi.fn()
    let writes = 0
    try {
      if (mode === 'false') Object.assign(f.executor, {hasUnconfirmedSave: () => false, abandonUnconfirmedSave: abandon})
      f.transform(receipt => {writes++; return {...receipt, changed: [{id: 'WRONG', title: 'Invalid'}]}})
      f.view.updateEditingValue('A', 'title', 'Submitted')
      const failure: unknown = await f.dataSet.saveChanges().catch((error: unknown) => error)
      if (!(failure instanceof Error)) throw new Error('invalid receipt must fail')
      f.view.updateEditingValue('B', 'title', 'Later input')
      await f.dataSet.saveChanges().catch(() => undefined)
      expect(writes).toBe(1)
      expect(f.save).toHaveBeenCalledOnce()
      expect(f.view.hasUnconfirmedSaveFor(['A'], failure)).toBe(true)
      expect(f.view.abandonUnconfirmedSave()).toBe(false)
      expect(abandon).not.toHaveBeenCalled()
      await expect(f.dataSet.resolveUnconfirmedSaves()).rejects.toBe(failure)
      await expect(f.view.discardAndReload()).rejects.toThrow()
      expect(f.view.hasUnconfirmedSaveFor(['A'])).toBe(true)
      expect(f.view.getEditingRow('B')?.['title']).toBe('Later input')
      expect(writes).toBe(1)
    } finally {f.dataSet.destroy()}
  })

  it.each(['length', 'identity'] as const)('protects every unaccepted view in the dispatched batch after a bad %s receipt', async fault => {
    const f = await resourceOwners(), persist = f.database.save.getMockImplementation()!
    f.database.save.mockImplementation(async command => {
      const receipts = await persist(command)
      return fault === 'length' ? receipts.slice(0, 1)
        : receipts.map((receipt, index) => index === 0 ? {...receipt, changed: [{id: 'WRONG', title: 'Invalid'}]} : receipt)
    })
    try {
      for (const view of [f.items, f.orders, f.file]) view.updateEditingValue('1', 'title', 'Submitted')
      const failure: unknown = await f.dataSet.saveChanges().catch((error: unknown) => error)
      if (!(failure instanceof Error)) throw new Error('invalid receipt must fail')
      expect(f.items.hasUnconfirmedSaveFor(['1'], failure)).toBe(true)
      expect(f.orders.hasUnconfirmedSaveFor(['1'], failure)).toBe(true)
      expect(f.file.hasUnconfirmedSave).toBe(false)
      expect(f.fileOwner.save).not.toHaveBeenCalled()
      await expect(f.dataSet.saveChanges()).rejects.toBe(failure)
      expect(f.database.save).toHaveBeenCalledOnce()
      expect((await f.dataSet.saveChanges({views: [{tableName: 'File', viewId: 'default'}]})).success).toBe(true)
      expect(f.fileOwner.save).toHaveBeenCalledOnce()
      expect(f.items.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(f.orders.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally {f.dataSet.destroy()}
  })

  it('uses the original capture for source verification and preserves later input', async () => {
    const f = await open(), persist = f.save.getMockImplementation()!
    let pending = false, originalContext: unknown
    let receipts: Awaited<ReturnType<Save>> = [], writes = 0, verifies = 0
    Object.assign(f.executor, {hasUnconfirmedSave: () => pending})
    f.save.mockImplementation(async command => {
      if (!pending) {
        writes++; originalContext = command.changes[0]!.context
        receipts = await persist(command); pending = true
        return receipts.map(receipt => ({...receipt, changed: [{id: 'WRONG', title: 'Invalid'}]}))
      }
      verifies++
      expect(command.changes[0]!.context).toBe(originalContext)
      expect(command.changes[0]!.changes.changed).toMatchObject([{id: 'A', title: 'Submitted'}])
      expect(command.changes[0]!.changes.changed).toHaveLength(1)
      pending = false
      return receipts
    })
    try {
      f.view.updateEditingValue('A', 'title', 'Submitted')
      await expect(f.dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_RECEIPT')
      f.view.updateEditingValue('A', 'title', 'Later A'); f.view.updateEditingValue('B', 'title', 'Later B')
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(writes).toBe(1); expect(verifies).toBe(1)
      expect(f.view.hasUnconfirmedSave).toBe(false)
      expect(f.view.getEditingRow('A')?.['title']).toBe('Later A')
      expect(f.view.getEditingRow('B')?.['title']).toBe('Later B')
    } finally {f.dataSet.destroy()}
  })

  it('allows a new attempt after an explicit source refusal without a returned receipt', async () => {
    const f = await open()
    try {
      f.save.mockRejectedValueOnce(new Error('explicit business refusal'))
      f.view.updateEditingValue('A', 'title', 'Submitted')
      await expect(f.dataSet.saveChanges()).rejects.toThrow('explicit business refusal')
      expect(f.view.hasUnconfirmedSave).toBe(false)
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(f.save).toHaveBeenCalledTimes(2)
    } finally {f.dataSet.destroy()}
  })

  it('keeps the original capture independent from a JavaScript source mutating submitted keys and nested values', async () => {
    const f = await open()
    let pending = false, originalContext: unknown, writes = 0, verifies = 0
    let accepted: Awaited<ReturnType<Save>> = []
    Object.assign(f.executor, {hasUnconfirmedSave: () => pending})
    f.save.mockImplementation(async command => {
      const change = command.changes[0]!, row = change.changes.changed![0]!
      if (!pending) {
        writes++; originalContext = change.context
        const applied = structuredClone(row)
        accepted = [{metaName: 'Items', added: [], deleted: [], changed: [applied], changedFields: [['title']],
          context: query('Items', [applied, {id: 'B', title: 'Before B'}])}]
        Reflect.set(change.identity, 'metaName', 'Other')
        if (!change.tableConfig?.crudConfig) throw new Error('table config fixture missing')
        Reflect.set(change.tableConfig.crudConfig, 'timeout', 999)
        Reflect.set(row, 'id', 'B')
        const payload = row['payload']
        if (typeof payload !== 'object' || payload === null) throw new Error('nested fixture value missing')
        Reflect.set(payload, 'value', 'mutated by source')
        pending = true
        return accepted.map(receipt => ({...receipt, changed: [row]}))
      }
      verifies++
      expect(change.context).toBe(originalContext)
      expect(change.identity.metaName).toBe('Items')
      expect(change.tableConfig?.crudConfig?.timeout).toBe(1000)
      expect(row).toMatchObject({id: 'A', title: 'Submitted', payload: {value: 'original'}})
      pending = false
      return accepted
    })
    try {
      f.view.updateEditingValue('A', 'title', 'Submitted')
      await expect(f.dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_RECEIPT')
      f.view.updateEditingValue('A', 'payload', {value: 'later input'})
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(writes).toBe(1); expect(verifies).toBe(1)
      expect(f.view.getEditingRow('A')?.['payload']).toEqual({value: 'later input'})
    } finally {f.dataSet.destroy()}
  })

  it.each(['changed', 'deleted'] as const)('rejects duplicate %s identities before accepting either submitted row', async action => {
    const f = await open()
    try {
      f.transform(receipt => ({...receipt, [action]: [receipt[action][0]!, receipt[action][0]!]}))
      if (action === 'changed') {
        f.view.updateEditingValue('A', 'title', 'Edited A'); f.view.updateEditingValue('B', 'title', 'Edited B')
      } else {
        await f.view.removeRow('A'); await f.view.removeRow('B')
      }
      await expect(f.dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_RECEIPT')
      const pending = action === 'changed' ? f.view.dirtyTracking.dirtyRowIds : f.view.dirtyTracking.pendingDeleteIds
      expect([...pending].sort()).toEqual(['A', 'B'])
      expect(f.save).toHaveBeenCalledOnce()
    } finally {f.dataSet.destroy()}
  })

  it('rejects duplicate allocated primary keys without replacing local added identities', async () => {
    const f = await open()
    try {
      f.transform(receipt => ({...receipt, added: receipt.added.map(row => ({...row, id: 'SAME'}))}))
      await f.view.addRow({title: 'New A'}); await f.view.addRow({title: 'New B'})
      await expect(f.dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_RECEIPT')
      expect([...f.view.dirtyTracking.pendingCreateIds].sort()).toEqual(['TEMP1', 'TEMP2'])
      expect(f.view.rows.some(row => row['id'] === 'SAME')).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it('rejects an unrelated single-row update receipt while retaining the original edit', async () => {
    const f = await open()
    try {
      f.transform(receipt => ({...receipt, changed: [{id: 'OTHER', title: 'Wrong'}]}))
      f.view.updateEditingValue('A', 'title', 'Edited A')
      await expect(f.dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_RECEIPT')
      expect(f.view.dirtyTracking.dirtyRowIds.has('A')).toBe(true)
      expect(f.view.rows.find(row => row['id'] === 'A')?.['title']).toBe('Edited A')
    } finally {f.dataSet.destroy()}
  })

  it('rejects an allocated key already held by a retained formal row without accepting an earlier update', async () => {
    const f = await open()
    try {
      f.transform(receipt => ({...receipt, added: receipt.added.map(row => ({...row, id: 'A'}))}))
      f.view.updateEditingValue('A', 'title', 'Edited A')
      await f.view.addRow({title: 'New'})
      await expect(f.dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_RECEIPT')
      expect(f.view.rows.map(row => row['id'])).toEqual(['A', 'B', 'TEMP1'])
      expect(f.view.dirtyTracking.dirtyRowIds.has('A')).toBe(true)
      expect(f.view.dirtyTracking.pendingCreateIds.has('TEMP1')).toBe(true)
    } finally {f.dataSet.destroy()}
  })

  it('does not replace another unsaved added row or its selection when saving only one target', async () => {
    const f = await open()
    try {
      f.transform(receipt => ({...receipt, added: receipt.added.map(row => ({...row, id: 'TEMP2'}))}))
      await f.view.addRow({title: 'First'}); const second = await f.view.addRow({title: 'Second'})
      if (!('id' in second)) throw new Error('second added row missing')
      f.view.setCurrentRow(second); f.view.setSelectedRows([second])
      await expect(f.dataSet.saveChanges({views: [{tableName: 'Items', viewId: 'default', ids: ['TEMP1']}]}))
        .rejects.toThrow('DATA_VIEW_SAVE_RECEIPT')
      expect(f.view.rows.map(row => row['id'])).toEqual(['A', 'B', 'TEMP1', 'TEMP2'])
      expect(f.view.currentRow?.['id']).toBe('TEMP2')
      expect(f.view.selectedRows.map(row => row['id'])).toEqual(['TEMP2'])
      expect([...f.view.dirtyTracking.pendingCreateIds].sort()).toEqual(['TEMP1', 'TEMP2'])
    } finally {f.dataSet.destroy()}
  })

  it('can accept a new row using a formal key explicitly deleted by the same batch', async () => {
    const f = await open()
    try {
      f.transform(receipt => ({...receipt, added: receipt.added.map(row => ({...row, id: 'A'}))}))
      await f.view.removeRow('A'); await f.view.addRow({title: 'Replacement'})
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(f.view.rows.map(row => row['id'])).toEqual(['B', 'A'])
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it('rejects an allocation that steals another added identity in the same submitted group', async () => {
    const f = await open()
    try {
      f.transform(receipt => ({...receipt, added: receipt.added.map((row, index) => ({...row, id: index === 0 ? 'TEMP2' : 'CREATED2'}))}))
      await f.view.addRow({title: 'First'}); await f.view.addRow({title: 'Second'})
      await expect(f.dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_RECEIPT')
      expect(f.view.rows.map(row => row['id'])).toEqual(['A', 'B', 'TEMP1', 'TEMP2'])
      expect([...f.view.dirtyTracking.pendingCreateIds].sort()).toEqual(['TEMP1', 'TEMP2'])
    } finally {f.dataSet.destroy()}
  })

  it('accepts an added row whose original unique identity is retained by the service', async () => {
    const f = await open()
    try {
      f.transform(receipt => ({...receipt, added: receipt.added.map(row => ({...row, id: 'TEMP1'}))}))
      await f.view.addRow({title: 'New'})
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(f.view.rows.map(row => row['id'])).toEqual(['A', 'B', 'TEMP1'])
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it('accepts a complete update receipt in a different order', async () => {
    const f = await open()
    try {
      f.transform(receipt => ({...receipt, changed: [...receipt.changed].reverse(), changedFields: [...receipt.changedFields].reverse()}))
      f.view.updateEditingValue('A', 'title', 'Edited A'); f.view.updateEditingValue('B', 'title', 'Edited B')
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.view.rows.map(row => row['title'])).toEqual(['Edited A', 'Edited B'])
    } finally {f.dataSet.destroy()}
  })

  it('accepts distinct allocated primary keys for ordinary added rows', async () => {
    const f = await open()
    try {
      await f.view.addRow({title: 'New A'}); await f.view.addRow({title: 'New B'})
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.view.rows.map(row => row['id'])).toEqual(['A', 'B', 'CREATED1', 'CREATED2'])
    } finally {f.dataSet.destroy()}
  })
})

describe('formal query-save column validation', () => {
  it('preserves absent request policies so sources can apply their defaults', async () => {
    const f = await resourceOwners()
    try {
      f.items.updateEditingValue('1', 'title', 'Submitted')
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      const config = f.database.save.mock.calls[0]?.[0].changes[0]?.tableConfig
      expect(config).toBeDefined()
      expect(Object.hasOwn(config!, 'api')).toBe(false)
      expect(Object.hasOwn(config!, 'crudConfig')).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it.each(['not-array', 'not-string', 'sparse-outer', 'sparse-inner'] as const)('rejects malformed changedFields (%s) before accepting any sibling context', async fault => {
    const f = await resourceOwners(), persist = f.database.save.getMockImplementation()!
    let pending = false, verifies = 0
    let contexts: unknown[] = [], accepted: Awaited<ReturnType<typeof persist>> = []
    f.database.hasUnconfirmedSave.mockImplementation(() => pending)
    f.database.save.mockImplementation(async command => {
      if (!pending) {
        contexts = command.changes.map(change => change.context)
        accepted = await persist(command); pending = true
        const invalid = accepted.map(receipt => ({...receipt}))
        Reflect.set(invalid[1]!, 'changedFields', fault === 'not-array' ? [42] : fault === 'not-string' ? [['title', 42]]
          : fault === 'sparse-outer' ? new Array<string[]>(1) : [new Array<string>(1)])
        return invalid
      }
      verifies++
      command.changes.forEach((change, index) => expect(change.context).toBe(contexts[index]))
      pending = false
      return accepted
    })
    try {
      f.items.updateEditingValue('1', 'title', 'Item submitted'); f.orders.updateEditingValue('1', 'title', 'Order submitted')
      await expect(f.dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_RECEIPT')
      expect(f.items.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(f.orders.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(f.items.hasUnconfirmedSave).toBe(true); expect(f.orders.hasUnconfirmedSave).toBe(true)
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(verifies).toBe(1)
      expect(f.batches).toEqual([['Items', 'Orders']])
    } finally {f.dataSet.destroy()}
  })

  it('does not probe a released source after successful acceptance or leave sibling views mutating', async () => {
    const f = await resourceOwners()
    let released = false, releasedProbes = 0
    Object.assign(f.database, {acknowledgeSave: () => {released = true; return undefined}})
    f.database.hasUnconfirmedSave.mockImplementation(() => {
      if (released) { releasedProbes++; throw new Error('accepted context released') }
      return false
    })
    try {
      f.items.updateEditingValue('1', 'title', 'Item submitted'); f.orders.updateEditingValue('1', 'title', 'Order submitted')
      expect((await f.dataSet.saveChanges()).success).toBe(true)
      expect(releasedProbes).toBe(0)
      expect(f.items.mutating).toBe(false); expect(f.orders.mutating).toBe(false)
      expect(f.items.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.orders.dirtyTracking.hasPendingChanges()).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it('retains each failed batch capture and ends mutating even when the source pending probe throws', async () => {
    const f = await resourceOwners(), persist = f.database.save.getMockImplementation()!
    let probeBroken = false
    f.database.hasUnconfirmedSave.mockImplementation(() => {
      if (probeBroken) throw new Error('pending probe failed')
      return false
    })
    f.database.save.mockImplementation(async command => {
      const receipts = await persist(command); probeBroken = true
      return receipts.slice(0, 1)
    })
    try {
      f.items.updateEditingValue('1', 'title', 'Item submitted'); f.orders.updateEditingValue('1', 'title', 'Order submitted')
      const failure: unknown = await f.dataSet.saveChanges().catch((error: unknown) => error)
      if (!(failure instanceof Error)) throw new Error('invalid receipt must fail')
      expect(failure.message).toContain('DATA_VIEW_SAVE_RECEIPT')
      expect(f.items.mutating).toBe(false); expect(f.orders.mutating).toBe(false)
      expect(f.items.hasUnconfirmedSaveFor(['1'], failure)).toBe(true)
      expect(f.orders.hasUnconfirmedSaveFor(['1'], failure)).toBe(true)
      await expect(f.dataSet.saveChanges()).rejects.toBe(failure)
      expect(f.database.save).toHaveBeenCalledOnce()
    } finally {f.dataSet.destroy()}
  })

  it('does not certify an existing unknown batch as not dispatched when recovery options fail preflight', async () => {
    const f = await resourceOwners(undefined, true)
    f.orderOwner.save.mockImplementation(async () => {throw new Error('receipt lost')})
    f.orderOwner.hasUnconfirmedSave.mockReturnValue(true)
    try {
      f.orders.updateEditingValue('1', 'title', 'Submitted')
      await expect(f.dataSet.saveChanges()).rejects.toThrow('receipt lost')
      expect(f.orders.hasUnconfirmedSave).toBe(true)
      const error = await f.dataSet.saveChanges({mode: 'transaction'}).catch((cause: unknown) => cause)
      expect(error).toBeInstanceOf(Error);expect(error).not.toBeInstanceOf(DataSetSavePreflightError)
      expect(f.orders.hasUnconfirmedSave).toBe(true);expect(f.orderOwner.save).toHaveBeenCalledTimes(1)
    } finally {f.dataSet.destroy()}
  })
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


describe('known mutation error after cancelling local changes', () => {
 it('clears a known mutation error after cancelling all staged changes and notifies bound consumers', async () => {
  const f=await resourceOwners(),failure=new Error('known save refusal')
  try {
   f.file.updateEditingValue('1','title','Rejected')
   f.fileOwner.save.mockRejectedValueOnce(failure)
   await expect(f.dataSet.saveChanges()).rejects.toBe(failure)
   expect(f.file.mutatingError).toBe(failure)
   const changed=vi.fn();f.file.events.on('mutatingChanged',changed)
   expect(f.file.discardPendingChanges()).toBe(1)
   expect(f.file.hasEditingChanges()).toBe(false)
   expect(f.file.dirtyTracking.hasPendingChanges()).toBe(false)
   expect(f.file.mutatingError).toBeNull()
   expect(f.file.mutating).toBe(false)
   expect(changed).toHaveBeenCalledExactlyOnceWith(false)
   expect(f.fileOwner.save).toHaveBeenCalledTimes(1)
  } finally {f.dataSet.destroy()}
 })
 it('retains the error for partial cancellation and clears it when the final pending row is cancelled', async () => {
  const f=await resourceOwners(),failure=new Error('known save refusal')
  try {
   f.stored.get('File')!.push({id:'2',title:'Second'});await f.file.refresh()
   for(const id of ['1','2'])f.file.updateEditingValue(id,'title','Rejected')
   f.fileOwner.save.mockRejectedValueOnce(failure)
   await expect(f.dataSet.saveChanges()).rejects.toBe(failure)
   f.file.discardPendingChanges(['1']);expect(f.file.mutatingError).toBe(failure)
   expect(f.file.dirtyTracking.hasPendingChanges()).toBe(true)
   expect(f.file.getEditingRow('2')?.['title']).toBe('Rejected')
   f.file.discardPendingChanges(['2']);expect(f.file.mutatingError).toBeNull()
  } finally {f.dataSet.destroy()}
 })
 it.each([undefined,[],['missing']])('keeps a prior command error when cancellation has no target (%j)', async ids => {
  const f=await resourceOwners(),failure=new Error('prior command failed')
  try {
   f.file.mutatingError=failure
   expect(f.file.discardPendingChanges(ids)).toBe(0)
   expect(f.file.mutatingError).toBe(failure)
  } finally {f.dataSet.destroy()}
 })
 it.each(['unknown','permissions'] as const)('retains a %s recovery responsibility after cancelling local edits', async recovery => {
  const f=await resourceOwners(),failure=new Error('save recovery remains')
  try {
   f.file.updateEditingValue('1','title','Rejected')
   f.fileOwner.save.mockImplementationOnce(async()=>{if(recovery==='unknown')f.fileOwner.hasUnconfirmedSave.mockReturnValue(true);throw failure})
   await expect(f.dataSet.saveChanges()).rejects.toBe(failure)
   if(recovery==='permissions')vi.spyOn(f.file,'hasPendingSavedRowPermissions','get').mockReturnValue(true)
   f.file.discardPendingChanges()
   expect(f.file.mutatingError).toBe(failure)
   expect(recovery==='unknown'?f.file.hasUnconfirmedSave:f.file.hasPendingSavedRowPermissions).toBe(true)
   expect(f.fileOwner.save).toHaveBeenCalledTimes(1)
  } finally {f.dataSet.destroy()}
 })
 it('retains the error when a discard subscriber creates a new local draft', async () => {
  const f=await resourceOwners(),failure=new Error('known save refusal')
  try {
   f.file.updateEditingValue('1','title','Rejected')
   f.fileOwner.save.mockRejectedValueOnce(failure)
   await expect(f.dataSet.saveChanges()).rejects.toBe(failure)
   f.file.events.on('editingDiscarded',()=>f.file.updateEditingValue('1','title','New draft'))
   f.file.discardPendingChanges()
   expect(f.file.getEditingRow('1')?.['title']).toBe('New draft')
   expect(f.file.mutatingError).toBe(failure)
  } finally {f.dataSet.destroy()}
 })
})
