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
