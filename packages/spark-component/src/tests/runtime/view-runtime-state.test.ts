import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { SparkData, type DataView } from '@spark-appworks/spark-data'
import { useDataViewState } from '../../components/containers/data-views/view-runtime-state'

function createView(): DataView {
  const ds = SparkData.createDataSet({
    dataSetName: 'ViewRuntimeStateDS',
    tables: {
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' },
            ],
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
        },
      },
    },
  })
  return ds.getView('Users', 'default')!
}

const waitRowsDebounce = () => new Promise(resolve => setTimeout(resolve, 25))

describe('useDataViewState', () => {
  const scopes: Array<ReturnType<typeof effectScope>> = []

  afterEach(() => {
    for (const scope of scopes.splice(0)) scope.stop()
  })

  it.each(['countReported','nextPageAvailable'] as const)('projects an unavailable query when %s throws without clearing the original draft',member=>{
    const view=createView(),other=createView(),resolvedView=shallowRef<DataView|null>(view),failure=Error('Original query identity expired')
    let invalid=false
    const getter=vi.spyOn(view,member,'get').mockImplementation(()=>{if(invalid)throw failure;return true})
    const scope=effectScope();scopes.push(scope);const state=scope.run(()=>useDataViewState(resolvedView))!
    view.setCurrentRow(view.rows[0]!);view.setSelectedRows([view.rows[0]!]);view.updateEditingValue(1,'name','original draft')
    expect(state.rows.value).toHaveLength(2);expect(state.editingRows.value).toHaveLength(1)
    invalid=true;resolvedView.value=null;resolvedView.value=view
    expect(state.loadingError.value).toBe(failure);expect(state.aggregateError.value).toBeNull()
    expect(state.rows.value).toEqual([]);expect(state.currentRow.value).toBeNull();expect(state.selectedRows.value).toEqual([]);expect(state.editingRows.value).toEqual([])
    expect(state.total.value).toBe(0);expect(state.countReported.value).toBeUndefined();expect(state.nextPageAvailable.value).toBeUndefined();expect(state.resultReplacementBlocked.value).toBe(true)
    expect(()=>view[member]).toThrow(failure);expect(view.rows).toHaveLength(2);expect(view.getEditingRow(1)?.['name']).toBe('original draft')
    resolvedView.value=other;expect(state.loadingError.value).toBeNull();expect(state.rows.value).toHaveLength(2)
    getter.mockRestore();view.dataSet?.destroy();other.dataSet?.destroy()
  })

  it('projects pagination across query configuration and binding changes', () => {
    const view = createView(), other = createView(), resolvedView = shallowRef<DataView | null>(view)
    const scope = effectScope(); scopes.push(scope)
    const state = scope.run(() => useDataViewState(resolvedView))!
    expect(state.paginated.value).toBe(true)
    view.queryConfig = {tree: {keyField: 'id', parentField: 'parentId', nodeId: 'root'}}
    expect(state.paginated.value).toBe(false)
    view.queryConfig = {outputType: 'Table', allPages: true}
    expect(state.paginated.value).toBe(false)
    view.queryConfig = {outputType: 'Table', allPages: false}
    expect(state.paginated.value).toBe(true)
    other.queryConfig = {tree: {keyField: 'id', parentField: 'parentId', nodeId: 'root'}}
    resolvedView.value = other
    expect(state.paginated.value).toBe(false)
    view.queryConfig = {}
    expect(state.paginated.value).toBe(false)
    view.dataSet?.destroy(); other.dataSet?.destroy()
  })

  it('uses DataView domain events instead of getSnapshot', async () => {
    const view = createView()
    const getSnapshot = vi.fn(() => {
      throw new Error('getSnapshot should not be called')
    })
    Object.defineProperty(view, 'getSnapshot', {
      configurable: true,
      value: getSnapshot,
    })

    const resolvedView = shallowRef<DataView | null>(view)
    const scope = effectScope()
    scopes.push(scope)
    const state = scope.run(() => useDataViewState(resolvedView))!

    expect(state.rows.value).toHaveLength(2)
    expect(getSnapshot).not.toHaveBeenCalled()

    view.updateFromServer([{ id: 3, name: 'Cara' }])
    await waitRowsDebounce()
    expect(state.rows.value).toHaveLength(1)
    expect(state.rows.value[0]?.['name']).toBe('Cara')

    view.setCurrentRow(view.rows[0]!)
    expect(state.currentRow.value?.['id']).toBe(3)

    view.setSelectedRows([view.rows[0]!])
    expect(state.selectedRows.value.map(row => row['id'])).toEqual([3])

    view.updateEditingValue(3, 'name', 'Cara Draft')
    expect(state.editingRows.value).toMatchObject([{ id: 3, name: 'Cara Draft' }])

    expect(() => view.applyViewConfig({ page: 2, pageSize: 50 })).toThrow('UNSAVED')
    expect(state.editingRows.value).toMatchObject([{ id: 3, name: 'Cara Draft' }])
    expect(view.discardEditingRows()).toBe(1)
    view.applyViewConfig({ page: 2, pageSize: 50 })
    expect(state.page.value).toBe(2)
    expect(state.pageSize.value).toBe(50)

    expect(getSnapshot).not.toHaveBeenCalled()
  })
})
