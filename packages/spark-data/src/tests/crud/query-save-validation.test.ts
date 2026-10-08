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

describe('formal query-save column validation', () => {
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
