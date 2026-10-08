/**
 * DataViewKey / DataMember binding rules.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  DataMember,
  DataSet,
  RequestState,
  SparkData,
  buildDataViewKey,
  diagnoseDataViewKey,
  diagnoseDataViewMember,
  getDataViewIdentity,
  isDataViewKey,
  parseDataViewKey,
  resolveDataViewCapabilities,
  resolveDataViewKey,
  resolveDataViewMember,
  resolveDataViewMemberBinding,
} from '@spark-appworks/spark-data'

function createFixtureDataSet(): DataSet {
  return SparkData.createDataSet({
    dataSetName: 'TestDS',
    tables: {
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number', label: 'ID' },
          { name: 'name', type: 'string', label: '姓名' },
          { name: 'amount', type: 'number', label: '金额' },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '张三', amount: 10 },
              { id: 2, name: '李四', amount: 20 },
            ],
            aggregates: {
              totalAmount: { type: 'sum', field: 'amount' },
            },
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
          grid: {
            rows: [
              { id: 3, name: '王五', amount: 30 },
            ],
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
        },
      },
    },
  })
}

describe('DataViewKey', () => {
  it('parses page-local data view keys', () => {
    expect(parseDataViewKey('Orders@default')).toEqual({
      tableName: 'Orders',
      viewId: 'default',
      raw: 'Orders@default',
    })
    expect(parseDataViewKey('Orders@grid')).toEqual({
      tableName: 'Orders',
      viewId: 'grid',
      raw: 'Orders@grid',
    })
  })

  it('parses scoped data view keys', () => {
    expect(parseDataViewKey('#SharedDS@Orders@grid')).toEqual({
      scope: 'SharedDS',
      tableName: 'Orders',
      viewId: 'grid',
      raw: '#SharedDS@Orders@grid',
      crossPage: true,
    })
  })

  it('rejects member keys and malformed keys', () => {
    const keyWithMember = ['Orders', 'grid', 'rows'].join('@')
    expect(parseDataViewKey(keyWithMember)).toBeNull()
    expect(parseDataViewKey('Orders')).toBeNull()
    expect(parseDataViewKey('#SharedDS@Orders')).toBeNull()
    expect(isDataViewKey('Orders@grid')).toBe(true)
    expect(isDataViewKey(keyWithMember)).toBe(false)
  })

  it('resolves views and diagnoses failures', () => {
    const dataSet = createFixtureDataSet()
    expect(resolveDataViewKey('Users@default', dataSet)?.viewId).toBe('default')
    expect(resolveDataViewKey('Users@grid', dataSet)?.rows).toHaveLength(1)
    expect(diagnoseDataViewKey('Users@default', dataSet).status).toBe('ok')
    expect(diagnoseDataViewKey('Users@missing', dataSet).status).toBe('missing-view')
    expect(diagnoseDataViewKey('Missing@default', dataSet).status).toBe('missing-table')
    expect(diagnoseDataViewKey('Users@default', null).status).toBe('missing-dataset')
  })

  it('builds data view keys', () => {
    expect(buildDataViewKey('Users')).toBe('Users@default')
    expect(buildDataViewKey('Users', 'grid')).toBe('Users@grid')
    expect(buildDataViewKey('Users', 'grid', 'SharedDS')).toBe('#SharedDS@Users@grid')
  })
})

describe('DataMember resolution', () => {
  let dataSet: DataSet

  beforeEach(() => {
    dataSet = createFixtureDataSet()
  })

  it('resolves rows as row arrays, not DataView', () => {
    const rows = resolveDataViewMember({
      dataViewKey: 'Users@default',
      dataMember: DataMember.Rows,
    }, dataSet)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(2)
  })

  it('resolves columns, pagination, request and mutation members', () => {
    expect(resolveDataViewMember({ dataViewKey: 'Users@default', dataMember: DataMember.Columns }, dataSet)).toHaveLength(4)
    expect(resolveDataViewMember({ dataViewKey: 'Users@default', dataMember: DataMember.Total }, dataSet)).toBe(0)
    expect(resolveDataViewMember({ dataViewKey: 'Users@default', dataMember: DataMember.Page }, dataSet)).toBe(1)
    expect(resolveDataViewMember({ dataViewKey: 'Users@default', dataMember: DataMember.PageSize }, dataSet)).toBe(20)
    expect(resolveDataViewMember({ dataViewKey: 'Users@default', dataMember: DataMember.RequestState }, dataSet)).toBe(RequestState.Idle)
    expect(resolveDataViewMember({ dataViewKey: 'Users@default', dataMember: DataMember.Mutating }, dataSet)).toBe(false)
    expect(resolveDataViewMember({ dataViewKey: 'Users@default', dataMember: DataMember.LoadingError }, dataSet)).toBeNull()
    expect(resolveDataViewMember({ dataViewKey: 'Users@default', dataMember: DataMember.MutatingError }, dataSet)).toBeNull()
  })

  it('resolves currentRow and dataField paths', () => {
    const view = dataSet.getView('Users', 'default')!
    view.selection.setCurrentRowById(1)

    expect(resolveDataViewMember({
      dataViewKey: 'Users@default',
      dataMember: DataMember.CurrentRow,
      dataField: 'name',
    }, dataSet)).toBe('张三')
    expect(resolveDataViewMember({
      dataViewKey: 'Users@default',
      dataMember: DataMember.AggregateResult,
      dataField: 'totalAmount',
    }, dataSet)).toBe(30)
  })

  it('returns structured bindings with the owning source', () => {
    const binding = resolveDataViewMemberBinding({
      dataViewKey: 'Users@default',
      dataMember: DataMember.Rows,
    }, dataSet)
    expect(binding?.kind).toBe('value')
    expect(binding?.source.tableName).toBe('Users')
    expect(binding?.descriptor.dataMember).toBe(DataMember.Rows)
    expect(Array.isArray(binding?.value)).toBe(true)
  })

  it('diagnoses dataField paths and empty row states', () => {
    expect(diagnoseDataViewMember({
      dataViewKey: 'Users@default',
      dataMember: DataMember.CurrentRow,
      dataField: 'name',
    }, dataSet).status).toBe('empty-current-row')
    expect(diagnoseDataViewMember({
      dataViewKey: 'Users@default',
      dataMember: DataMember.SelectedRows,
    }, dataSet).status).toBe('empty-selection')

    const view = dataSet.getView('Users', 'default')!
    view.selection.setCurrentRowById(1)
    expect(diagnoseDataViewMember({
      dataViewKey: 'Users@default',
      dataMember: DataMember.CurrentRow,
      dataField: 'missing',
    }, dataSet).status).toBe('missing-field')
    expect(diagnoseDataViewMember({
      dataViewKey: 'Users@default',
      dataMember: DataMember.Rows,
      dataField: 'id',
    }, dataSet).status).toBe('unsupported-data-field')
  })

  it('resolves DataView capabilities', () => {
    const view = dataSet.getView('Users', 'default')!
    view.selection.setCurrentRowById(1)

    const current = resolveDataViewCapabilities({
      dataViewKey: 'Users@default',
      dataMember: DataMember.CurrentRow,
    }, dataSet)
    expect(current.dataSource).toBe(view)
    expect(current.dataRow).toMatchObject({ id: 1, name: '张三' })

    const rows = resolveDataViewCapabilities({
      dataViewKey: 'Users@default',
      dataMember: DataMember.Rows,
    }, dataSet)
    expect(rows.dataSource).toBe(view)
    expect(rows.dataRow).toBeNull()
  })

  it('extracts view identity from parsed keys', () => {
    expect(getDataViewIdentity(parseDataViewKey('#SharedDS@Users@grid')!)).toBe('Users.grid')
  })
})
