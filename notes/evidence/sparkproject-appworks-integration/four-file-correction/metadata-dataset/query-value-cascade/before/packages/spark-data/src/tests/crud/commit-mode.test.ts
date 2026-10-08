import { describe, it, expect, vi } from 'vitest'
import { SparkData, DataView, RequestState } from '../../index'
import type { DataRow, CrudApi, CrudResult } from '../../types'
import { setMember } from '../test-type-helpers'

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
      { parentTable: 'Orders', childTable: 'Items', filterExpression: {logic: 'and', filters: [{field: 'orderId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}]} },
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

describe('unsaved change protection on data replacement', () => {
  it.each([false, true])('refuses configuration changes before applying a partial config, editing=%s', async (editing) => {
    const { view } = createStagedView()
    if (editing) view.updateEditingValue(1, 'name', 'Draft')
    else await view.editRowById(1, { name: 'Dirty' })
    expect(() => view.configure({
      page: 9, pageSize: 50, queryContext: { search: false },
      filterExpression: { field: 'name', operator: 'eq', value: 'Bob' },
    })).toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(view.page).toBe(1)
    expect(view.pageSize).toBe(20)
    expect(view.queryContext).toEqual({})
    expect(view.filterExpression).toBeUndefined()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(!editing)
    if (editing) expect(view.getEditingPatch(1)).toEqual({ name: 'Draft' })
  })

  it.each(['page', 'pageSize', 'sort', 'filter', 'executeFilter'].flatMap(entry =>
    [false, true].map(editing => ({ entry, editing }))))
    ('rejects $entry before changing query inputs, editing=$editing', async ({ entry, editing }) => {
      const { view } = createStagedView()
      if (editing) view.updateEditingValue(1, 'name', 'Draft')
      else await view.editRowById(1, { name: 'Dirty' })
      view.page = 3
      view.pageSize = 10
      const rows = view.rows.map(row => ({ ...row }))
      const changed = vi.fn()
      view.events.on('configChanged', changed)
      const pending = entry === 'page' ? view.setPage(4)
        : entry === 'pageSize' ? view.setPageSize(50)
        : entry === 'sort' ? view.setSort([{ field: 'name', direction: 'asc' }])
        : entry === 'filter' ? view.setFilter({ field: 'name', operator: 'eq', value: 'Alice' })
        : view.executeFilter(undefined)
      await expect(pending).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
      expect(view.page).toBe(3)
      expect(view.pageSize).toBe(10)
      expect(view.sortExpression).toBeUndefined()
      expect(view.filterExpression).toBeUndefined()
      expect(view.rows).toEqual(rows)
      expect(changed).not.toHaveBeenCalled()
      expect(view.dirtyTracking.hasPendingChanges()).toBe(!editing)
      if (editing) expect(view.getEditingPatch(1)).toEqual({ name: 'Draft' })
    })

  it.each(['request', 'load'])('rejects a dirty $entry before issuing a query', async (entry) => {
    const { view } = createStagedView()
    await view.editRowById(1, { name: 'Dirty' })
    const list = vi.spyOn(view.crud, 'list').mockResolvedValue({ success: true, data: [] })
    await expect(entry === 'request' ? view.requestData() : view.loadFromServer())
      .rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(list).not.toHaveBeenCalled()
    expect(view.requestState).toBe(RequestState.Idle)
    expect(view.rows[0]?.['name']).toBe('Dirty')
    list.mockRestore()
  })

  it.each([false, true])('parent clearing preserves an unsaved child, editing=%s', async (editing) => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ProtectedCascade',
      tables: {
        Parents: {
          tableName: 'Parents', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: { default: { rows: [{ id: 1 }], autoCurrentFirst: false, autoSelectFirst: false } },
        },
        Children: {
          tableName: 'Children', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'name', type: 'string' }],
          views: { default: { rows: [{ id: 10, name: 'Original' }], commitMode: 'staged', autoCurrentFirst: false, autoSelectFirst: false } },
        },
      },
      viewCascades: [{
        parentTable: 'Parents', parentViewId: 'default', childTable: 'Children', childViewId: 'default',
        dependencyType: 'allRows', filterBindings: [{ sourceField: 'id', targetField: 'id' }], autoLoad: false,
      }],
    })
    const parent = ds.getView('Parents', 'default')!
    const child = ds.getView('Children', 'default')!
    if (editing) child.updateEditingValue(10, 'name', 'Draft')
    else await child.editRowById(10, { name: 'Dirty' })
    expect(() => parent.clearAll()).not.toThrow()
    await Promise.resolve()
    expect(parent.rows).toEqual([])
    expect(child.rows[0]?.['name']).toBe(editing ? 'Original' : 'Dirty')
    expect(child.dirtyTracking.hasPendingChanges()).toBe(!editing)
    if (editing) expect(child.getEditingPatch(10)).toEqual({ name: 'Draft' })
    ds.destroy()
  })

  it.each([
    { entry: 'reset', editing: false }, { entry: 'reset', editing: true },
    { entry: 'clear', editing: false }, { entry: 'clear', editing: true },
  ])('$entry refuses clearing with editing=$editing', async ({ entry, editing }) => {
    const { view } = createStagedView()
    if (editing) view.updateEditingValue(1, 'name', 'Draft')
    else await view.editRowById(1, { name: 'Dirty' })
    const rows = view.rows.map(row => ({ ...row }))
    view.requestState = RequestState.Loaded
    expect(() => entry === 'reset' ? view.resetState() : view.clearAll()).toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(view.rows).toEqual(rows)
    expect(view.requestState).toBe(RequestState.Loaded)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(!editing)
    if (editing) expect(view.getEditingPatch(1)).toEqual({ name: 'Draft' })
  })

  it('destroy releases pending and editing rows through internal cleanup', async () => {
    const { view } = createStagedView()
    await view.editRowById(1, { name: 'Dirty' })
    view.updateEditingValue(2, 'name', 'Draft')
    expect(() => view.destroy()).not.toThrow()
    expect(view.isDestroyed()).toBe(true)
    expect(view.rows).toEqual([])
    expect(view.hasEditingChanges()).toBe(false)
  })

  it.each([
    { entry: 'replace', editing: false }, { entry: 'replace', editing: true },
    { entry: 'server', editing: false }, { entry: 'server', editing: true },
  ])('$entry refuses result replacement with editing=$editing', async ({ entry, editing }) => {
    const { view } = createStagedView()
    if (editing) view.updateEditingValue(1, 'name', 'Draft')
    else await view.editRowById(1, { name: 'Dirty' })
    view.total = 2
    view.setCurrentRow(view.rows[0]!)
    const rows = view.rows.map(row => ({ ...row }))
    const replace = () => entry === 'replace'
      ? view.replaceRows([{ id: 3, name: 'Charlie' }])
      : view.updateFromServer({ rows: [{ id: 3, name: 'Charlie' }], total: 1, page: 2 })
    expect(replace).toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(view.rows).toEqual(rows)
    expect(view.total).toBe(2)
    expect(view.page).toBe(1)
    expect(view.currentRow?.['id']).toBe(1)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(!editing)
    if (editing) expect(view.getEditingPatch(1)).toEqual({ name: 'Draft' })
  })

  it.each([false, true])('retains edits made while a query is pending, editing=%s', async (editing) => {
    const { view } = createStagedView()
    let complete: ((result: CrudResult<DataRow[]>) => void) | undefined
    const response = new Promise<CrudResult<DataRow[]>>(resolve => { complete = resolve })
    const list = vi.spyOn(view.crud, 'list').mockReturnValue(response)
    const pending = view.loadFromServer()
    if (editing) view.updateEditingValue(1, 'name', 'Draft')
    else await view.editRowById(1, { name: 'Dirty' })
    complete!({ success: true, data: [{ id: 3, name: 'Server' }] })
    await expect(pending).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(view.rows.map(row => row['id'])).toEqual([1, 2])
    expect(view.dirtyTracking.hasPendingChanges()).toBe(!editing)
    if (editing) expect(view.getEditingPatch(1)).toEqual({ name: 'Draft' })
    else expect(view.rows[0]?.['name']).toBe('Dirty')
    list.mockRestore()
  })

  it.each(['create', 'update', 'delete', 'editing'])('refresh refuses unsaved %s without changing rows or request state', async (operation) => {
    const { view } = createStagedView()
    if (operation === 'create') await view.addRow({ id: 99, name: 'Staged' })
    else if (operation === 'update') await view.editRowById(1, { name: 'Changed' })
    else if (operation === 'delete') await view.removeRow(2)
    else view.updateEditingValue(1, 'name', 'Draft')
    view.requestState = RequestState.Loaded
    const rows = view.rows.map(row => ({ ...row }))
    const request = vi.spyOn(view, 'requestData').mockResolvedValue()

    await expect(view.refresh()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(request).not.toHaveBeenCalled()
    expect(view.requestState).toBe(RequestState.Loaded)
    expect(view.rows).toEqual(rows)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(operation !== 'editing')
    expect(view.hasEditingChanges()).toBe(operation === 'editing')
    if (operation === 'editing') expect(view.getEditingPatch(1)).toEqual({ name: 'Draft' })
    request.mockRestore()
  })

  it('refresh proceeds after saving staged changes', async () => {
    const { view } = createStagedView()
    const api = setupMockApi(view)
    await view.editRowById(1, { name: 'Saved' })
    expect((await view.saveChanges()).success).toBe(true)
    expect(api.update).toHaveBeenCalledOnce()
    const request = vi.spyOn(view, 'requestData').mockResolvedValue()
    await view.refresh()
    expect(request).toHaveBeenCalledOnce()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    request.mockRestore()
  })

  it('refresh proceeds after explicitly discarding editing rows', async () => {
    const { view } = createStagedView()
    view.updateEditingValue(1, 'name', 'Draft')
    expect(view.discardEditingRows()).toBe(1)
    const request = vi.spyOn(view, 'requestData').mockResolvedValue()
    await view.refresh()
    expect(request).toHaveBeenCalledOnce()
    expect(view.hasEditingChanges()).toBe(false)
    request.mockRestore()
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
