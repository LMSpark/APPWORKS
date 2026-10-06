import { describe, it, expect, vi } from 'vitest'
import { SparkData } from '@spark-appworks/spark-data'
import { RequestState } from '../types'
import { TreeManager } from '../tree-manager'
import type { CrudResult, DataRow, QueryParams } from '../types'

function viewCascade(
  parent: string,
  child: string,
  state = 'allRows',
  sourceField = 'id',
  targetField = 'parentId',
) {
  return {
    parentTable: parent,
    parentViewId: 'default',
    childTable: child,
    childViewId: 'default',
    filterBindings: [{ sourceField, targetField }],
    dependencyType: state,
  }
}

describe('DataView.requestData orchestration', () => {
  it.each(['editing', 'dirty'])('rejects nested tree queries before transport with %s changes', async change => {
    const ds = SparkData.createDataSet({ dataSetName: 'NestedUnsaved', tables: {
      T: { tableName: 'T', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'name', type: 'string' }],
        views: { default: { rows: [{ id: 1, name: 'original' }] } } },
    } })
    const view = ds.getView('T', 'default')!
    const manager = new TreeManager({ config: {} })
    view.treeManager = manager
    const fetch = vi.spyOn(manager, 'fetchNested').mockResolvedValue([])
    view.requestState = RequestState.Loaded
    const error = new Error('previous diagnostic')
    view.loadingError = error
    if (change === 'editing') view.updateEditingValue(1, 'name', 'draft')
    else await view.editRowById(1, { name: 'draft' })
    const rows = view.rows

    await expect(view.loadTreeNested()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(fetch).not.toHaveBeenCalled()
    expect(view.rows).toBe(rows)
    expect(view.requestState).toBe(RequestState.Loaded)
    expect(view.loadingError).toBe(error)
    if (change === 'editing') expect(view.getEditingPatch(1)).toEqual({ name: 'draft' })
    else expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
    fetch.mockRestore()
    ds.destroy()
  })

  it('retains edits made during a query failure and permits explicit discard before recovery', async () => {
    const ds = SparkData.createDataSet({ dataSetName: 'InFlightEditingFailure', tables: {
      T: { tableName: 'T', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'name', type: 'string' }],
        views: { default: { rows: [] } }, api: { list: { url: '/test/query' } } },
    } })
    const view = ds.getView('T', 'default')!
    const list = vi.spyOn(view.crud, 'list').mockResolvedValueOnce({ success: true, data: [{ id: 1, name: 'original' }] })
    await view.loadFromServer()
    let release: ((result: CrudResult<DataRow[]>) => void) | undefined
    list.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    const pending = view.loadFromServer()
    view.updateEditingValue(1, 'name', 'draft')
    release?.({ success: false })
    await pending
    expect(view.rows[0]).toMatchObject({ name: 'original' })
    expect(view.getEditingPatch(1)).toEqual({ name: 'draft' })
    await expect(view.refresh()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    await expect(view.saveChanges()).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    expect(view.getEditingPatch(1)).toEqual({ name: 'draft' })
    expect(view.discardEditingRows()).toBe(1)
    list.mockResolvedValueOnce({ success: true, data: [{ id: 1, name: 'current' }] })
    await view.refresh()
    expect(view.updateEditingValue(1, 'name', 'new draft')).toMatchObject({ name: 'new draft' })
    list.mockRestore()
    ds.destroy()
  })

  it('does not restore writes by clearing failed data; a successful empty query does restore them', async () => {
    const ds = SparkData.createDataSet({ dataSetName: 'FailedEmptyQuery', tables: {
      T: { tableName: 'T', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
        views: { default: { rows: [] } }, api: { list: { url: '/test/query' } } },
    } })
    const view = ds.getView('T', 'default')!
    const list = vi.spyOn(view.crud, 'list').mockResolvedValueOnce({ success: false })
    await view.loadFromServer()
    view.clearAll()
    expect(view.requestState).toBe(RequestState.Idle)
    await expect(view.addRow({ id: 1 })).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    list.mockResolvedValueOnce({ success: true, data: [] })
    await view.refresh()
    await expect(view.addRow({ id: 1 })).resolves.toMatchObject({ id: 1 })
    list.mockRestore()
    ds.destroy()
  })

  it.each(['rejection', 'failed-result'])('retains failed query data read-only until a successful retry after $0', async outcome => {
    const ds = SparkData.createDataSet({ dataSetName: 'RetryReadOnly', tables: {
      T: { tableName: 'T', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'name', type: 'string' }],
        views: { default: { rows: [] } }, api: { list: { url: '/test/query' } } },
    } })
    const view = ds.getView('T', 'default')!
    const list = vi.spyOn(view.crud, 'list').mockResolvedValueOnce({ success: true, data: [{ id: 1, name: 'previous' }] })
    await view.loadFromServer()
    const retainedRows = view.rows
    const retainedSelection = view.currentRow
    if (outcome === 'rejection') {
      list.mockRejectedValueOnce(new Error('Query unavailable'))
      await expect(view.loadFromServer()).rejects.toThrow('Query unavailable')
    } else {
      list.mockResolvedValueOnce({ success: false, message: 'Query unavailable' })
      await expect(view.loadFromServer()).resolves.toMatchObject({ success: false })
    }
    expect(view.requestState).toBe(RequestState.Failed)
    expect(view.rows).toBe(retainedRows)
    expect(view.currentRow).toBe(retainedSelection)
    expect(() => view.updateEditingValue(1, 'name', 'blocked')).toThrow('DATA_VIEW_RESULT_STALE')
    expect(() => view.appendRow({ id: 2 })).toThrow('DATA_VIEW_RESULT_STALE')
    expect(() => view.updateRowById(1, { name: 'blocked' })).toThrow('DATA_VIEW_RESULT_STALE')
    expect(() => view.deleteRowById(1)).toThrow('DATA_VIEW_RESULT_STALE')
    await expect(view.addRow({ id: 2 })).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(view.editRowById(1, { name: 'blocked' })).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(view.removeRow(1)).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(view.applyEditingRows()).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(view.saveChanges()).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(view.moveTreeNode(1, null)).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    expect(view.hasEditingChanges()).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    let release: ((result: CrudResult<DataRow[]>) => void) | undefined
    list.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    const retry = view.refresh()
    expect(view.requestState).toBe(RequestState.Loading)
    expect(() => view.updateEditingValue(1, 'name', 'still-blocked')).toThrow('DATA_VIEW_RESULT_STALE')
    release?.({ success: true, data: [{ id: 1, name: 'current' }] })
    await retry
    expect(view.requestState).toBe(RequestState.Loaded)
    expect(view.rows[0]).toMatchObject({ name: 'current' })
    expect(view.updateEditingValue(1, 'name', 'edited')).toMatchObject({ name: 'edited' })
    list.mockRestore()
    ds.destroy()
  })

  it('blocks all held CRUD write delegates before service execution after a query failure', async () => {
    const ds = SparkData.createDataSet({ dataSetName: 'HeldCrud', tables: {
      T: { tableName: 'T', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
        views: { default: { rows: [] } }, api: { list: { url: '/test/query' } } },
    } })
    const view = ds.getView('T', 'default')!
    const crud = view.crud
    const service = view.crudService
    if (!service) throw new Error('Missing fixture service')
    const writes = [vi.spyOn(service, 'create'), vi.spyOn(service, 'update'), vi.spyOn(service, 'delete'),
      vi.spyOn(service, 'batchCreate'), vi.spyOn(service, 'batchUpdate'), vi.spyOn(service, 'batchDelete')]
    for (const write of writes) write.mockResolvedValue({ success: false, message: 'Unexpected write' })
    const list = vi.spyOn(crud, 'list').mockResolvedValue({ success: false })
    await view.loadFromServer()
    await expect(crud.createRecord({ id: 1 })).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(crud.updateRecord(1, {})).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(crud.deleteRecord(1)).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(crud.batchCreateRecords([{ id: 1 }])).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(crud.batchUpdateRecords([{ id: 1 }])).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    await expect(crud.batchDeleteRecords([1])).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    for (const write of writes) { expect(write).not.toHaveBeenCalled(); write.mockRestore() }
    expect(view.mutating).toBe(false)
    expect(view.mutatingError).toBeNull()
    list.mockRestore()
    ds.destroy()
  })

  it('rejects a new request on a destroyed view without changing its state', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'DestroyedEntry',
      tables: {
        T: {
          tableName: 'T', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: { default: { rows: [] } }, api: { list: { url: '/test/query' } },
        },
      },
    })
    const view = ds.getView('T', 'default')!
    const list = vi.spyOn(view.crud, 'list')
    view.destroy()
    await expect(view.requestData()).rejects.toThrow('has been destroyed')
    expect(view.requestState).toBe(RequestState.Idle)
    expect(view.loadingError).toBeNull()
    expect(list).not.toHaveBeenCalled()
    list.mockRestore()
  })

  it.each([
    { entry: 'load', outcome: 'success' },
    { entry: 'load', outcome: 'failure' },
    { entry: 'request', outcome: 'success' },
    { entry: 'request', outcome: 'failure' },
  ])('ignores a late query $outcome after destruction through $entry', async ({ entry, outcome }) => {
    const ds = SparkData.createDataSet({
      dataSetName: 'DestroyedQuery',
      tables: {
        T: {
          tableName: 'T',
          columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: { default: { rows: [] } },
          api: { list: { url: '/test/query', method: 'POST' } },
        },
      },
    })
    const view = ds.getView('T', 'default')!
    let complete: ((result: CrudResult<DataRow[]>) => void) | undefined
    let fail: ((error: Error) => void) | undefined
    const response = new Promise<CrudResult<DataRow[]>>((resolve, reject) => {
      complete = resolve
      fail = reject
    })
    const list = vi.spyOn(view.crud, 'list').mockReturnValue(response)
    const pending = entry === 'load' ? view.loadFromServer() : view.requestData()
    expect(view.requestState).toBe(RequestState.Loading)
    view.destroy()

    if (outcome === 'success') complete!({ success: true, data: [{ id: 1 }] })
    else fail!(new Error('Late query failure'))

    if (entry === 'load') {
      await expect(pending).resolves.toEqual({ success: false, message: 'Request superseded' })
    } else {
      await expect(pending).resolves.toBeUndefined()
    }
    expect(view.isDestroyed()).toBe(true)
    expect(view.rows).toEqual([])
    expect(view.requestState).toBe(RequestState.Idle)
    expect(view.loadingError).toBeNull()
    expect(view).not.toHaveProperty('permissionSnapshot')
    list.mockRestore()
  })

  it('does not start a child query after destruction while waiting for its parent', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'DestroyedDependency',
      tables: {
        Parents: {
          tableName: 'Parents', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: { default: { rows: [] } }, api: { list: { url: '/test/parents' } },
        },
        Children: {
          tableName: 'Children', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: { default: { rows: [] } }, api: { list: { url: '/test/children' } },
        },
      },
      viewCascades: [viewCascade('Parents', 'Children')],
    })
    const parent = ds.getView('Parents', 'default')!
    const child = ds.getView('Children', 'default')!
    let complete: ((result: CrudResult<DataRow[]>) => void) | undefined
    const response = new Promise<CrudResult<DataRow[]>>(resolve => { complete = resolve })
    const parentList = vi.spyOn(parent.crud, 'list').mockReturnValue(response)
    const childList = vi.spyOn(child.crud, 'list')
    const pending = child.requestData()
    expect(child.requestState).toBe(RequestState.Preparing)
    child.destroy()
    complete!({ success: true, data: [{ id: 1 }] })
    await expect(pending).resolves.toBeUndefined()
    expect(parentList).toHaveBeenCalledOnce()
    expect(childList).not.toHaveBeenCalled()
    expect(child.requestState).toBe(RequestState.Idle)
    expect(child.loadingError).toBeNull()
    parentList.mockRestore()
    childList.mockRestore()
  })

  it('should load parents first then child and update requestState', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'OrchDS',
      tables: {
        Parents: { tableName: 'Parents', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [] } } },
        Children: { tableName: 'Children', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [] } } }
      },
      resourceRelations: [
        { parentTable: 'Parents', childTable: 'Children', childField: 'parentId' }
      ],
      viewCascades: [
        viewCascade('Parents', 'Children')
      ]
    })

    const pView = ds.getView('Parents', 'default')!
    const cView = ds.getView('Children', 'default')!

    const pSpy = vi.spyOn(pView, 'loadFromServer').mockImplementation(async () => {
      pView.rows.splice(0, pView.rows.length, { id: 11 })
      pView.requestState = RequestState.Loaded
      return { success: true, data: pView.rows }
    })

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async (params?: QueryParams) => {
      expect(params).toBeDefined()
      expect(params?.filter).toEqual({ field: 'parentId', operator: 'eq', value: 11 })
      cView.rows.splice(0, cView.rows.length, { id: 101, parentId: 11 })
      cView.requestState = RequestState.Loaded
      return { success: true, data: cView.rows }
    })

    expect(pView.requestState).toBe(RequestState.Idle)
    expect(cView.requestState).toBe(RequestState.Idle)

    await cView.requestData()

    expect(pSpy).toHaveBeenCalledOnce()
    expect(cSpy).toHaveBeenCalledOnce()
    expect(pView.requestState).toBe(RequestState.Loaded)
    expect(cView.requestState).toBe(RequestState.Loaded)

    pSpy.mockRestore(); cSpy.mockRestore()
  })

  it('should not load child if parent dependency remains unsatisfied', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'OrchDS2',
      tables: {
        Parents: { tableName: 'Parents', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [] } } },
        Children: { tableName: 'Children', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [] } } }
      },
      resourceRelations: [
        { parentTable: 'Parents', childTable: 'Children', childField: 'parentId' }
      ],
      viewCascades: [
        viewCascade('Parents', 'Children')
      ]
    })

    const pView = ds.getView('Parents', 'default')!
    const cView = ds.getView('Children', 'default')!

    // parent load succeeds, but returns no rows
    const pSpy = vi.spyOn(pView, 'loadFromServer').mockImplementation(async () => {
      pView.requestState = RequestState.Loaded
      return { success: true, data: [] }
    })
    const cSpy = vi.spyOn(cView, 'loadFromServer')

    await cView.requestData()

    // parent was called but since parentRows empty, child should NOT be called
    expect(pSpy).toHaveBeenCalled()
    expect(cSpy).not.toHaveBeenCalled()
    // child dependency failed → requestState=Failed
    expect(cView.requestState).toBe(RequestState.Failed)

    pSpy.mockRestore(); cSpy.mockRestore()
  })

  it('respects relation parentField/childField mapping when building params', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'OrchDS3',
      tables: {
        Parents: { tableName: 'Parents', columns: [{ name: 'uuid', type: 'string', isPrimaryKey: true }], views: { default: { rows: [] } } },
        Children: { tableName: 'Children', columns: [{ name: 'id', type: 'number' }, { name: 'parentUuid', type: 'string' }], views: { default: { rows: [] } } }
      },
      resourceRelations: [
        {
          parentTable: 'Parents', childTable: 'Children',
          parentField: 'uuid', childField: 'parentUuid',
        }
      ],
      viewCascades: [
        viewCascade('Parents', 'Children', 'currentRow', 'uuid', 'parentUuid')
      ],
    })

    const pView = ds.getView('Parents', 'default')!
    const cView = ds.getView('Children', 'default')!

    const pSpy = vi.spyOn(pView, 'loadFromServer').mockImplementation(async () => {
      pView.rows.splice(0, pView.rows.length, { uuid: 'p-1' })
      // 直接写 _currentRowId，避免 setCurrentRow 触发 currentRowChanged 干扰编排
      pView._currentRowId = pView.getPkKey(pView.rows[0]!) ?? null
      pView.requestState = RequestState.Loaded
      return { success: true, data: pView.rows }
    })

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async (params?: QueryParams) => {
      expect(params).toBeDefined()
      expect(params?.filter).toEqual({ field: 'parentUuid', operator: 'eq', value: 'p-1' })
      cView.rows.splice(0, cView.rows.length, { id: 101, parentUuid: 'p-1' })
      cView.requestState = RequestState.Loaded
      return { success: true, data: cView.rows }
    })

    await cView.requestData()

    expect(pSpy).toHaveBeenCalled()
    expect(cSpy).toHaveBeenCalled()

    pSpy.mockRestore(); cSpy.mockRestore()
  })

  it('POST list endpoints should merge relation constraints into remote filter AST', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'OrchRemoteFilterAST',
      tables: {
        Parents: {
          tableName: 'Parents',
          columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: { default: { rows: [] } },
        },
        Children: {
          tableName: 'Children',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'parentId', type: 'number' },
            { name: 'amount', type: 'number' },
            { name: 'threshold', type: 'number' },
          ],
          views: {
            default: {
              rows: [],
              filterExpression: {
                field: 'amount',
                operator: 'gte',
                value: { Type: 'GetTableField', Field: 'threshold' },
              },
            },
          },
          api: { list: { url: '/test/children/query', method: 'POST' } },
        },
      },
      resourceRelations: [
        { parentTable: 'Parents', childTable: 'Children', parentField: 'id', childField: 'parentId' },
      ],
      viewCascades: [
        viewCascade('Parents', 'Children'),
      ],
    })

    const pView = ds.getView('Parents', 'default')!
    const cView = ds.getView('Children', 'default')!

    pView.rows.splice(0, pView.rows.length, { id: 11 }, { id: 12 })
    pView.requestState = RequestState.Loaded

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async (params?: QueryParams) => {
      expect(params).toBeDefined()
      expect(params?.page).toBe(1)
      expect(params?.pageSize).toBe(20)
      expect(params?.filter).toEqual({
        logic: 'and',
        filters: [
          { field: 'parentId', operator: 'in', value: [11, 12] },
          { field: 'amount', operator: 'gte', value: { Type: 'GetTableField', Field: 'threshold' } },
        ],
      })
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] }
    })

    await cView.requestData()

    expect(cSpy).toHaveBeenCalledOnce()
    cSpy.mockRestore()
  })

  it('step 4.4: triggers children BR after successful load (3-level cascade)', async () => {
    // 三层级联：A → B → C
    // 调用 A.requestData()
    // A 加载成功后 step 4.4 触发 B 的 C，B 成功后 step 4.4 触发 C 的 C
    const ds = SparkData.createDataSet({
      dataSetName: 'ThreeLevel',
      tables: {
        A: { tableName: 'A', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [] } } },
        B: { tableName: 'B', columns: [{ name: 'id', type: 'number' }, { name: 'aId', type: 'number' }], views: { default: { rows: [] } }, api: { list: { url: '/test/b', method: 'GET' } } },
        C: { tableName: 'C', columns: [{ name: 'id', type: 'number' }, { name: 'bId', type: 'number' }], views: { default: { rows: [] } }, api: { list: { url: '/test/c', method: 'GET' } } }
      },
      resourceRelations: [
        { parentTable: 'A', childTable: 'B', childField: 'aId' },
        { parentTable: 'B', childTable: 'C', childField: 'bId' },
      ],
      viewCascades: [
        viewCascade('A', 'B', 'allRows', 'id', 'aId'),
        viewCascade('B', 'C', 'allRows', 'id', 'bId'),
      ]
    })

    const aView = ds.getView('A', 'default')!
    const bView = ds.getView('B', 'default')!
    const cView = ds.getView('C', 'default')!

    const aSpy = vi.spyOn(aView, 'loadFromServer').mockImplementation(async () => {
      aView.rows.splice(0, aView.rows.length, { id: 1 })
      aView.requestState = RequestState.Loaded
      aView.events.emit('rowsChanged')
      return { success: true, data: aView.rows }
    })

    const bSpy = vi.spyOn(bView, 'loadFromServer').mockImplementation(async (params?: QueryParams) => {
      expect(params).toBeDefined()
      expect(params?.filter).toEqual({ field: 'aId', operator: 'eq', value: 1 })
      bView.rows.splice(0, bView.rows.length, { id: 10, aId: 1 })
      bView.requestState = RequestState.Loaded
      bView.events.emit('rowsChanged')
      return { success: true, data: bView.rows }
    })

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async (params?: QueryParams) => {
      expect(params).toBeDefined()
      expect(params?.filter).toEqual({ field: 'bId', operator: 'eq', value: 10 })
      cView.rows.splice(0, cView.rows.length, { id: 100, bId: 10 })
      cView.requestState = RequestState.Loaded
      return { success: true, data: cView.rows }
    })

    // 只调用 A 的 C — 期望 B 和 C 被 step 4.4 自动级联触发
    await aView.requestData()

    // A 立即完成
    expect(aSpy).toHaveBeenCalledOnce()
    expect(aView.requestState).toBe(RequestState.Loaded)

    // B 和 C 是 fire-and-forget，等待微任务队列冲刷
    await new Promise(r => setTimeout(r, 50))

    expect(bSpy).toHaveBeenCalledOnce()
    expect(bView.requestState).toBe(RequestState.Loaded)
    expect(cSpy).toHaveBeenCalledOnce()
    expect(cView.requestState).toBe(RequestState.Loaded)

    aSpy.mockRestore(); bSpy.mockRestore(); cSpy.mockRestore()
  })

  it('step 4.1: sets requestState to Preparing before calling loadFromServer', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'StateDS',
      tables: {
        T: { tableName: 'T', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [] } } }
      }
    })

    const view = ds.getView('T', 'default')!
    let capturedState: RequestState | undefined

    vi.spyOn(view, 'loadFromServer').mockImplementation(async () => {
      // requestData 在调 loadFromServer 之前处于 Preparing 阶段
      capturedState = view.requestState
      view.requestState = RequestState.Loaded
      return { success: true }
    })

    await view.requestData()

    // 进入 loadFromServer 时 requestData 编排阶段尚未结束 → Preparing
    expect(capturedState).toBe(RequestState.Preparing)
    expect(view.requestState).toBe(RequestState.Loaded)
  })

  it('idempotent: returns immediately if requestState !== 0', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'IdempotentDS',
      tables: {
        T: { tableName: 'T', columns: [{ name: 'id', type: 'number' }], views: { default: { rows: [] } } }
      }
    })

    const view = ds.getView('T', 'default')!
    const spy = vi.spyOn(view, 'loadFromServer')

    // 设置 requestState=Loaded（已完成）
    view.requestState = RequestState.Loaded
    await view.requestData()
    expect(spy).not.toHaveBeenCalled()

    // 设置 requestState=Preparing（准备中）
    view.requestState = RequestState.Preparing
    await view.requestData()
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })
})
