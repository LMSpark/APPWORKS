import {describe, expect, it} from 'vitest'
import {effectScope, nextTick, shallowRef} from 'vue'
import {DataSet} from '@spark-appworks/spark-data'
import {useDataViewState} from '@spark-appworks/spark-component'

describe('public DataView state', () => {
  it('observes the original view and releases old bindings on replacement', async () => {
    const ds = DataSet.fromJson({scenarioId: 'state', tables: {
      Items: {columns: [{name: 'id', primary: true}], views: {default: {}}},
    }})
    const first = ds.getView('Items', 'default')!
    const second = ds.getTable('Items')!.addView('second')
    const current = shallowRef(first)
    const scope = effectScope()
    const state = scope.run(() => useDataViewState(current))!
    first.rows.push({id: 'first'})
    first.events.emit('rowsChanged')
    expect(state.rows.value).toBe(first.rows)
    current.value = second
    await nextTick()
    expect(state.rows.value).toBe(second.rows)
    scope.stop()
    ds.destroy()
  })
})
