import { describe, expect, it } from 'vitest'
import { DataMember, SparkData } from '@spark-appworks/spark-data'
import {
  resolveDataViewCapabilities,
  resolveDataViewKey,
} from '@spark-appworks/spark-data'

describe('spark-component DataView resolver', () => {
  function createDataSet() {
    return SparkData.createDataSet({
      dataSetName: 'ResolverDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }],
            },
          },
        },
      },
    })
  }

  it('returns the target view for valid keys', () => {
    const dataSet = createDataSet()
    const view = resolveDataViewKey('Users@default', dataSet)

    expect(view).toBe(dataSet.getView('Users', 'default'))
  })

  it('resolves rows member as dataSource capability without a row context', () => {
    const dataSet = createDataSet()
    const view = dataSet.getView('Users', 'default')
    view?.selection.setCurrentRow(view.rows[0] ?? null)
    const caps = resolveDataViewCapabilities({
      dataViewKey: 'Users@default',
      dataMember: DataMember.Rows,
    }, dataSet)

    expect(caps.dataSource).toBe(view)
    expect(caps.dataRow).toBeNull()
  })

  it('resolves currentRow member as row capability while preserving source', () => {
    const dataSet = createDataSet()
    const view = dataSet.getView('Users', 'default')
    view?.selection.setCurrentRow(view.rows[0] ?? null)
    const caps = resolveDataViewCapabilities({
      dataViewKey: 'Users@default',
      dataMember: DataMember.CurrentRow,
    }, dataSet)

    expect(caps.dataSource).toBe(view)
    expect(caps.dataRow).toMatchObject({ id: 1, name: 'Alice' })
  })

  it('returns null for missing dataset, empty key, or invalid keys', () => {
    const dataSet = createDataSet()

    expect(resolveDataViewKey(undefined, dataSet)).toBeUndefined()
    expect(resolveDataViewKey('', dataSet)).toBeUndefined()
    expect(resolveDataViewKey('Users', dataSet)).toBeUndefined()
    expect(resolveDataViewKey(['Users', 'missingView'].join('@'), dataSet)).toBeUndefined()
    expect(resolveDataViewKey('Missing@default', dataSet)).toBeUndefined()
    expect(resolveDataViewKey('Users@default', null)).toBeUndefined()
  })
})
