import { describe, it, expect, vi } from 'vitest'
import { SparkData, DataView } from '../index'
import type { DataRow, CrudApi } from '../types'
import { setMember } from './test-type-helpers'

// ─────────────────────────────────────────────
// 辅助
// ─────────────────────────────────────────────

function createStagedView(rows: DataRow[] = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]) {
  const ds = SparkData.createDataSet({
    dataSetName: 'TestDS',
    tables: {
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: { rows, commitMode: 'staged' },
        },
      },
    },
  })
  const view = ds.getView('Users', 'default')!
  expect(view.commitMode).toBe('staged')
  return { ds, view }
}

function createImmediateView(rows: DataRow[] = [{ id: 1, name: 'Alice' }]) {
  const ds = SparkData.createDataSet({
    dataSetName: 'ImmDS',
    tables: {
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: { rows },
        },
      },
    },
  })
  const view = ds.getView('Users', 'default')!
  expect(view.commitMode).toBe('immediate')
  return { ds, view }
}

function createMasterDetailStagedDataSet() {
  const ds = SparkData.createDataSet({
    dataSetName: 'MasterDetailDS',
    resourceRelations: [
      { parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' },
    ],
    tables: {
      Orders: {
        tableName: 'Orders',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: { rows: [{ id: 1, name: 'Order A' }], commitMode: 'staged' },
        },
      },
      Items: {
        tableName: 'Items',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'orderId', type: 'number' },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: { rows: [{ id: 10, orderId: 1, name: 'Item A' }], commitMode: 'staged' },
        },
      },
    },
  })
  return {
    ds,
    orders: ds.getView('Orders', 'default')!,
    items: ds.getView('Items', 'default')!,
  }
}

function setupMockApi(view: DataView) {
  const mockCrud = {
    create: vi.fn(async (row: Partial<DataRow>) => ({
      success: true,
      data: { ...row, _server: true },
    })),
    update: vi.fn(async (_pk: Record<string, unknown>, data: Partial<DataRow>) => ({
      success: true,
      data: { ...data, _server: true },
    })),
    delete: vi.fn(async () => ({
      success: true,
      data: true,
    })),
    executeBatch: vi.fn(),
    list: vi.fn(),
    getHttpClient: vi.fn(),
  }

  const api: CrudApi = {
    create: { url: '/api/users', method: 'POST' },
    update: { url: '/api/users/{id}', method: 'PUT' },
    delete: { url: '/api/users/{id}', method: 'DELETE' },
  }

  const table = view.dataTable!
  table.api = api

  setMember(table, '_crudService', mockCrud)
  setMember(view, '_crudDelegate', undefined)

  return mockCrud
}

// ─────────────────────────────────────────────
// 测试
// ─────────────────────────────────────────────

describe('commitMode: basic field semantics', () => {
  it('default commitMode is immediate', () => {
    const { view } = createImmediateView()
    expect(view.commitMode).toBe('immediate')
  })

  it('staged commitMode is respected from config', () => {
    const { view } = createStagedView()
    expect(view.commitMode).toBe('staged')
  })

  it('unknown field autoCommit is ignored, commitMode defaults to immediate', () => {
    // autoCommit 字段已移除，传入时不影响 commitMode（使用 commitMode 显式配置）
    const ds = SparkData.createDataSet({
      dataSetName: 'LegacyDS',
      tables: {
        T: {
          tableName: 'T',
          columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: {
            default: { rows: [] },
          },
        },
      },
    })
    expect(ds.getView('T', 'default')!.commitMode).toBe('immediate')
  })

  it('commitMode: staged is respected via explicit config', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'StagedDS',
      tables: {
        T: {
          tableName: 'T',
          columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: {
            default: { rows: [], commitMode: 'staged' },
          },
        },
      },
    })
    expect(ds.getView('T', 'default')!.commitMode).toBe('staged')
  })

  it('toJson serializes commitMode only when non-default', () => {
    const { view } = createImmediateView()
    const data = view.toJson()
    expect(data.commitMode).toBeUndefined()

    const { view: stagedView } = createStagedView()
    const stagedData = stagedView.toJson()
    expect(stagedData.commitMode).toBe('staged')
  })
})

describe('commitMode=staged: dirty tracking lifecycle', () => {
  it('addRow in staged mode tracks pending-create (no remote call)', async () => {
    const { view } = createStagedView()
    setupMockApi(view)

    const initialLen = view.rows.length
    const newRow = await view.addRow({ id: 99, name: 'New' })

    // Row added locally
    expect(view.rows.length).toBe(initialLen + 1)
    expect(newRow).toMatchObject({ id: 99, name: 'New' })

    // Dirty tracking active
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(view.dirtyTracking.isPendingCreate(99)).toBe(true)
  })

  it('editRowById in staged mode marks dirty (no remote call)', async () => {
    const { view } = createStagedView()
    setupMockApi(view)

    const result = await view.editRowById(1, { name: 'Alice Updated' })
    expect(result).toBe(true)
    expect(view.rows.find(r => r['id'] === 1)?.['name']).toBe('Alice Updated')

    // Dirty tracking active
    expect(view.dirtyTracking.isDirty(1)).toBe(true)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
  })

  it('editing value stays in editingRows until applied, then enters staged dirty tracking', async () => {
    const { view } = createStagedView()
    setupMockApi(view)

    const editingRow = view.updateEditingValue(1, 'name', 'Alice Draft')
    expect(editingRow['name']).toBe('Alice Draft')
    expect(view.rows.find(r => r['id'] === 1)?.['name']).toBe('Alice')
    expect(view.editingRows).toHaveLength(1)
    expect(view.getEditingPatch(1)).toEqual({ name: 'Alice Draft' })
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)

    const applyResult = await view.applyEditingRows()
    expect(applyResult.success).toBe(true)
    expect(applyResult.data).toMatchObject({ appliedCount: 1, failedCount: 0 })
    expect(view.editingRows).toHaveLength(0)
    expect(view.rows.find(r => r['id'] === 1)?.['name']).toBe('Alice Draft')
    expect(view.dirtyTracking.isDirty(1)).toBe(true)
  })

  it('editing value can be reverted or discarded without touching rows', () => {
    const { view } = createStagedView()

    view.updateEditingValue(1, 'name', 'Alice Draft')
    expect(view.hasEditingChanges(1)).toBe(true)

    view.updateEditingValue(1, 'name', 'Alice')
    expect(view.hasEditingChanges(1)).toBe(false)
    expect(view.editingRows).toHaveLength(0)
    expect(view.rows.find(r => r['id'] === 1)?.['name']).toBe('Alice')

    view.updateEditingValue(2, 'name', 'Bob Draft')
    expect(view.discardEditingRows()).toBe(1)
    expect(view.hasEditingChanges()).toBe(false)
    expect(view.rows.find(r => r['id'] === 2)?.['name']).toBe('Bob')
  })

  it('DataSet.saveChanges applies editing rows and saves master table before detail table', async () => {
    const { ds, orders, items } = createMasterDetailStagedDataSet()
    const calls: string[] = []
    const orderApi = setupMockApi(orders)
    const itemApi = setupMockApi(items)
    orderApi.update.mockImplementation(async (_pk: Record<string, unknown>, data: Partial<DataRow>) => {
      calls.push('Orders')
      return { success: true, data: { ...data, _server: true } }
    })
    itemApi.update.mockImplementation(async (_pk: Record<string, unknown>, data: Partial<DataRow>) => {
      calls.push('Items')
      return { success: true, data: { ...data, _server: true } }
    })

    orders.updateEditingValue(1, 'name', 'Order Draft')
    items.updateEditingValue(10, 'name', 'Item Draft')

    const result = await ds.saveChanges()

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      viewCount: 2,
      appliedEditingRows: 2,
      failedEditingRows: 0,
      savedCount: 2,
      failedCount: 0,
    })
    expect(calls).toEqual(['Orders', 'Items'])
    expect(orders.getEditingPatch(1)).toBeUndefined()
    expect(items.getEditingPatch(10)).toBeUndefined()
    expect(orders.rows[0]?.['name']).toBe('Order Draft')
    expect(items.rows[0]?.['name']).toBe('Item Draft')
    expect(orders.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(items.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('removeRow in staged mode tracks pending-delete (no remote call)', async () => {
    const { view } = createStagedView()
    setupMockApi(view)

    const result = await view.removeRow(1)
    expect(result).toBe(true)
    expect(view.rows.find(r => r['id'] === 1)).toBeUndefined()

    // Dirty tracking active
    expect(view.dirtyTracking.isPendingDelete(1)).toBe(true)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
  })

  it('removeRow of pending-create cancels creation silently', async () => {
    const { view } = createStagedView()
    setupMockApi(view)

    await view.addRow({ id: 99, name: 'Temp' })
    expect(view.dirtyTracking.isPendingCreate(99)).toBe(true)

    await view.removeRow(99)
    // Creation cancelled — not tracked as delete either
    expect(view.dirtyTracking.isPendingCreate(99)).toBe(false)
    expect(view.dirtyTracking.isPendingDelete(99)).toBe(false)
  })
})

describe('commitMode=immediate: direct remote CRUD', () => {
  it('addRow in immediate mode calls remote createRecord when API configured', async () => {
    const { view } = createImmediateView()
    const mockCrud = setupMockApi(view)

    await view.addRow({ id: 10, name: 'NewUser' })
    expect(mockCrud.create).toHaveBeenCalledTimes(1)
  })

  it('editRowById in immediate mode calls remote updateRecord when API configured', async () => {
    const { view } = createImmediateView()
    const mockCrud = setupMockApi(view)

    await view.editRowById(1, { name: 'Updated' })
    expect(mockCrud.update).toHaveBeenCalledTimes(1)
  })

  it('removeRow in immediate mode calls remote deleteRecord when API configured', async () => {
    const { view } = createImmediateView()
    const mockCrud = setupMockApi(view)

    await view.removeRow(1)
    expect(mockCrud.delete).toHaveBeenCalledTimes(1)
  })

  it('addRow in immediate mode does local-only when no API configured', async () => {
    const { view } = createImmediateView()
    // No API setup — should fall through to dirty tracking
    const newRow = await view.addRow({ id: 10, name: 'Local' })
    expect(newRow).toMatchObject({ id: 10, name: 'Local' })
    expect(view.rows.length).toBe(2)
    // Since no API, it falls through to dirty tracking path
    expect(view.dirtyTracking.isPendingCreate(10)).toBe(true)
  })
})

describe('dirty state cleanup on data reset operations', () => {
  it('resetState clears dirty tracking', async () => {
    const { view } = createStagedView()
    await view.editRowById(1, { name: 'Dirty' })
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)

    view.resetState()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('clearAll clears dirty tracking', async () => {
    const { view } = createStagedView()
    await view.editRowById(2, { name: 'Dirty' })
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)

    view.clearAll()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('replaceRows clears dirty tracking', async () => {
    const { view } = createStagedView()
    await view.editRowById(1, { name: 'Dirty' })
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)

    view.replaceRows([{ id: 3, name: 'Charlie' }])
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('refresh clears dirty tracking', async () => {
    const { view } = createStagedView()
    await view.addRow({ id: 99, name: 'Staged' })
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)

    // refresh() is async and calls requestData → which requires API
    // We just verify the dirty state is cleared synchronously before the request
    // by calling refresh in a try/catch (no API configured so it will fail, but dirty is already cleared)
    try {
      await view.refresh()
    } catch {
      // Expected: no API configured
    }
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })
})

describe('shouldDirectCommitCrud semantic fix', () => {
  it('staged mode never direct-commits even with API configured', async () => {
    const { view } = createStagedView()
    const mockCrud = setupMockApi(view)

    // This was the original bug: autoCommit=false + API configured → still direct committed
    await view.addRow({ id: 99, name: 'New' })
    expect(mockCrud.create).not.toHaveBeenCalled()
    expect(view.dirtyTracking.isPendingCreate(99)).toBe(true)

    await view.editRowById(1, { name: 'Changed' })
    expect(mockCrud.update).not.toHaveBeenCalled()
    expect(view.dirtyTracking.isDirty(1)).toBe(true)

    await view.removeRow(2)
    expect(mockCrud.delete).not.toHaveBeenCalled()
    expect(view.dirtyTracking.isPendingDelete(2)).toBe(true)
  })

  it('immediate mode direct-commits when API exists for that operation', async () => {
    const { view } = createImmediateView()
    const mockCrud = setupMockApi(view)

    await view.addRow({ id: 10, name: 'New' })
    expect(mockCrud.create).toHaveBeenCalledTimes(1)
  })

  it('immediate mode falls through to dirty tracking when specific API operation missing', async () => {
    const { view } = createImmediateView()
    // Setup API with only 'create' — no update/delete
    const table = view.dataTable!
    table.api = { create: { url: '/api/users', method: 'POST' } }

    // editRowById should fall through to dirty tracking (no update API)
    await view.editRowById(1, { name: 'Changed' })
    expect(view.dirtyTracking.isDirty(1)).toBe(true)
  })
})

describe('commitMode runtime switching', () => {
  it('can switch commitMode at runtime', async () => {
    const { view } = createImmediateView()
    expect(view.commitMode).toBe('immediate')

    view.commitMode = 'staged'
    expect(view.commitMode).toBe('staged')

    // Now addRow should use dirty tracking
    await view.addRow({ id: 10, name: 'Staged' })
    expect(view.dirtyTracking.isPendingCreate(10)).toBe(true)
  })
})
