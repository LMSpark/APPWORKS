import {afterEach, describe, expect, it, vi} from 'vitest'
import {SparkData, type DataSet} from '@spark-appworks/spark-data'

const instances: DataSet[] = []
afterEach(() => {instances.splice(0).forEach(instance => instance.destroy())})
function setup() {
  const dataSet = SparkData.createDataSet({dataSetName: 'Checkpoint', tables: {Items: {tableName: 'Items',
    columns: [{name: 'id', type: 'number', isPrimaryKey: true}, {name: 'name', type: 'string'}, {name: 'note', type: 'string'}],
    views: {default: {rows: [{id: 1, name: 'one', note: 'first'}, {id: 2, name: 'two', note: 'second'}]}}}}})
  instances.push(dataSet)
  const view = dataSet.getView('Items')!
  view.commitMode = 'staged'
  return view
}

describe('DataView editing checkpoints', () => {
  it('cancels a dialog overlay on a stable staged new row without dropping the creation', async () => {
    const view = setup()
    await view.addRow({id: 3, name: 'new', note: ''})
    const checkpoint = view.createEditingCheckpoint(3, ['name'])
    view.updateEditingValue(3, 'name', 'dialog')
    checkpoint.restore()
    expect(view.getEditingRow(3)?.['name']).toBe('new')
    expect(view.dirtyTracking.isPendingCreate(3)).toBe(true)
    const removed = view.createEditingCheckpoint(3, ['name'])
    await view.removeRow(3)
    expect(() => removed.restore()).toThrow(/CHECKPOINT_STALE/)
  })

  it('restores only the scoped fields, retaining preceding and unrelated edits without modifying rows', () => {
    const view = setup()
    view.updateEditingValue(1, 'name', 'before dialog')
    const checkpoint = view.createEditingCheckpoint(1, ['name'])
    view.updateEditingValue(1, 'name', 'inside dialog')
    view.updateEditingValue(1, 'note', 'unrelated same row')
    view.updateEditingValue(2, 'name', 'unrelated row')
    const changed = vi.fn()
    view.events.on('editingFieldChanged', changed)
    checkpoint.restore()
    expect(view.getEditingPatch(1)).toEqual({name: 'before dialog', note: 'unrelated same row'})
    expect(view.getEditingPatch(2)).toEqual({name: 'unrelated row'})
    expect(view.rows[0]?.['name']).toBe('one')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({rowId: 1, field: 'name', previousValue: 'inside dialog', nextValue: 'before dialog'}))
    expect(() => checkpoint.restore()).toThrow(/CHECKPOINT_CLOSED/)
  })

  it('restores all captured fields atomically before notifying value consumers and removes a new patch', () => {
    const view = setup(), checkpoint = view.createEditingCheckpoint(1, ['name', 'note'])
    view.updateEditingValue(1, 'name', 'changed'); view.updateEditingValue(1, 'note', 'changed')
    const values: unknown[] = []
    view.events.on('editingFieldChanged', () => values.push({...view.getEditingRow(1)}))
    checkpoint.restore()
    expect(view.hasEditingChanges()).toBe(false)
    expect(values).toHaveLength(2)
    expect(values.every(row => JSON.stringify(row) === JSON.stringify(view.rows[0]))).toBe(true)
  })

  it('release keeps the original overlay and closes the checkpoint without saving', () => {
    const view = setup(), checkpoint = view.createEditingCheckpoint(1, ['name'])
    view.updateEditingValue(1, 'name', 'accepted')
    checkpoint.release(); checkpoint.release()
    expect(view.getEditingPatch(1)).toEqual({name: 'accepted'})
    expect(view.rows[0]?.['name']).toBe('one')
    expect(() => checkpoint.restore()).toThrow(/CHECKPOINT_CLOSED/)
  })

  it('rejects stale query context without overwriting the current overlay', () => {
    const view = setup(), checkpoint = view.createEditingCheckpoint(1, ['name'])
    view.updateEditingValue(1, 'name', 'keep')
    view.queryContext = {dataSpaceId: 'another'}
    expect(() => checkpoint.restore()).toThrow(/CHECKPOINT_STALE/)
    expect(view.getEditingPatch(1)).toEqual({name: 'keep'})
  })

  it('cannot roll back already applied data or act after destruction', async () => {
    const view = setup(), checkpoint = view.createEditingCheckpoint(1, ['name'])
    view.updateEditingValue(1, 'name', 'applied')
    expect((await view.applyEditingRows([1])).success).toBe(true)
    expect(() => checkpoint.restore()).toThrow(/CHECKPOINT_STALE/)
    expect(view.rows[0]?.['name']).toBe('applied')
    view.destroy()
    expect(() => checkpoint.restore()).toThrow()
  })

  it('requires a real row and known non-key fields', () => {
    const view = setup()
    expect(() => view.createEditingCheckpoint(3, ['name'])).toThrow(/CHECKPOINT_SCOPE/)
    expect(() => view.createEditingCheckpoint(1, [])).toThrow(/CHECKPOINT_SCOPE/)
    expect(() => view.createEditingCheckpoint(1, ['missing'])).toThrow(/CHECKPOINT_SCOPE/)
    expect(() => view.createEditingCheckpoint(1, ['id'])).toThrow(/CHECKPOINT_SCOPE/)
  })
})
