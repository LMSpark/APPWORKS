import {afterEach, describe, expect, it} from 'vitest'
import {DataFieldMember, SparkData, type DataSet} from '@spark-appworks/spark-data'

const instances: DataSet[] = []
afterEach(() => {instances.splice(0).forEach(instance => instance.destroy())})
function setup(config: unknown) {
  const dataSet = SparkData.createDataSet({dataSetName: 'Member', tables: {Ent: {tableName: 'Ent',
    columns: [{name: 'id', type: 'number', isPrimaryKey: true}, {name: 'cfg', type: 'string'}],
    views: {default: {rows: [{id: 1, cfg: config}]}}}}})
  instances.push(dataSet)
  return dataSet.getView('Ent')!
}

describe('DataView JSON field member', () => {
  it('merges one member into the source field and keeps other members', () => {
    const view = setup('{"keep":1,"landing":"a"}')
    view.updateEditingMember(1, {field: 'cfg', path: ['landing'], value: 'b'})
    expect(JSON.parse(String(view.getEditingRow(1)?.['cfg']))).toEqual({keep: 1, landing: 'b'})
    expect(view.readFieldMember(view.getEditingRow(1)!, {field: 'cfg', path: ['landing']})).toBe('b')
    expect(view.getEditingPatch(1)).toHaveProperty('cfg')
  })

  it('starts an empty source from an object and removes a member with undefined', () => {
    const view = setup(null)
    view.updateEditingMember(1, {field: 'cfg', path: ['landing'], value: 'x'})
    expect(view.getEditingRow(1)?.['cfg']).toBe('{"landing":"x"}')
    view.updateEditingMember(1, {field: 'cfg', path: ['landing'], value: undefined})
    expect(view.getEditingRow(1)?.['cfg']).toBeNull()
    expect(view.hasEditingChanges(1)).toBe(false)
  })

  it('drops the patch when the merged member equals the original value', () => {
    const view = setup('{"a":1,"b":2}')
    view.updateEditingMember(1, {field: 'cfg', path: ['a'], value: 3})
    view.updateEditingMember(1, {field: 'cfg', path: ['a'], value: 1})
    expect(view.getEditingRow(1)?.['cfg']).toBe('{"a":1,"b":2}')
    expect(view.hasEditingChanges(1)).toBe(false)
  })

  it('keeps native objects native and fails on malformed sources or missing parents', () => {
    expect(DataFieldMember.merge({a: {b: 1}}, {path: ['a', 'b'], value: 2, format: 'native'})).toEqual({a: {b: 2}})
    expect(() => DataFieldMember.read('not-json', {path: ['a']})).toThrow('DATA_FIELD_MEMBER')
    expect(() => DataFieldMember.read('3', {path: ['a']})).toThrow('DATA_FIELD_MEMBER')
    expect(() => DataFieldMember.merge('{}', {path: ['a', 'b'], value: 1})).toThrow('DATA_FIELD_MEMBER')
    expect(() => setup('{"a":1}').updateEditingMember(1, {field: 'cfg', path: [], value: 1})).toThrow('DATA_FIELD_MEMBER')
  })
})
