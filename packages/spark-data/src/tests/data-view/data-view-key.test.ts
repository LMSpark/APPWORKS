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
  type DataRow,
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

async function createValueDataSet(hidden: readonly string[] = [], keys: readonly [string | number, string | number] = ['01', '02']) {
  const rows: DataRow[] = [
    {key: keys[0], code: 'A', text: 'A,B', amount: 0, enabled: false, nullable: null, tags: ['x', 'y'], details: {code: 'D'}},
    {key: keys[1], code: 'B', text: 'A,B', amount: 2, enabled: true, nullable: 'set', tags: [], details: {}},
  ]
  const dataSet = DataSet.fromJson({scenarioId: 'VALUE', dataSetName: 'VALUE', tables: {Items: {
    modelBinding: {modelId: 'MODEL', modelName: 'Items'},
    columns: [{name: 'key', type: typeof keys[0] === 'number' ? 'number' : 'string', isPrimaryKey: true}, {name: 'code', type: 'string'},
      {name: 'text', type: 'string'}, {name: 'amount', type: 'number'}, {name: 'enabled', type: 'boolean'},
      {name: 'nullable', type: 'string'}, {name: 'tags', type: 'array'}, {name: 'details', type: 'object'}],
    views: {default: {autoCurrentFirst: false, autoSelectFirst: false, valueField: 'code', selectionDelimiter: '|'}},
  }}})
  const view = dataSet.getView('Items', 'default')!
  const read = (field: string) => hidden.includes(field) ? 'invisible' as const : 'visible' as const
  view.bindQueryExecutor({executeQuery: async () => ({rows, total: rows.length,
    assertIdentity: identity => {
      if (identity.scenarioId !== 'VALUE' || identity.metaName !== 'Items') throw new Error('query identity mismatch')
    },
    rowKey: row => row['key'],
    fieldAccess: (_key, field) => ({read: read(field), write: 'allowed', required: false,
      component: 'editable', writeMode: 'editable'}),
    readFieldAccess: (_row, field) => read(field),
    addActionState: () => 'hidden', editActionState: () => 'hidden', deleteActionState: () => 'hidden',
    createChildActionState: () => 'hidden', viewActionState: () => 'hidden',
  })})
  await view.loadFromServer()
  return {dataSet, view}
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

describe('native value binding and persisted selection format', () => {
  const selection = {dataViewKey: 'Items@default', dataMember: DataMember.Value}

  it('reads selected primary-key arrays while preserving configured string serialization and assignment', async () => {
    const {dataSet, view} = await createValueDataSet()
    try {
      expect(resolveDataViewMember(selection, dataSet)).toEqual([])
      expect(diagnoseDataViewMember(selection, dataSet).status).toBe('ok')
      view.value = 'B|A'
      expect(view.value).toBe('A|B')
      expect(resolveDataViewMember(selection, dataSet)).toEqual(['01', '02'])
      const binding = resolveDataViewMemberBinding(selection, dataSet)
      expect(binding?.source).toBe(view)
      expect(binding?.value).toEqual(['01', '02'])
      const detached = binding?.value
      if (!Array.isArray(detached)) throw new Error('selection value must be an array')
      detached.pop()
      expect(resolveDataViewMember(selection, dataSet)).toEqual(['01', '02'])
      view.setCurrentRow(view.rows[0] ?? null)
      expect(resolveDataViewMember(selection, dataSet)).toEqual(['01', '02'])
      view.selectionDelimiter = ''
      view.value = 'B'
      expect(view.value).toBe('B')
      expect(resolveDataViewMember(selection, dataSet)).toEqual(['02'])
      view.value = ''
      expect(resolveDataViewMember(selection, dataSet)).toEqual([])
    } finally { dataSet.destroy() }
  })

  it('constructs field values from the pointer and edit overlay without interpreting serialized text', async () => {
    const {dataSet, view} = await createValueDataSet()
    const field = {...selection, dataField: 'text'}
    try {
      expect(resolveDataViewMember(field, dataSet)).toBeUndefined()
      expect(diagnoseDataViewMember(field, dataSet).status).toBe('empty-current-row')
      view.setCurrentRow(view.rows[0] ?? null)
      expect(resolveDataViewMember(field, dataSet)).toBe('A,B')
      expect(resolveDataViewMemberBinding(field, dataSet)?.value).toBe('A,B')
      view.setCurrentRow(view.rows[1] ?? null)
      expect(resolveDataViewMember(field, dataSet)).toBe('A,B')
      view.updateEditingValue('02', 'text', 'Edited')
      expect(resolveDataViewMember(field, dataSet)).toBe('Edited')
      expect(view.rows[1]?.['text']).toBe('A,B')
      view.discardEditingRows(['02'])
      expect(resolveDataViewMember(field, dataSet)).toBe('A,B')
      view.setCurrentRow(view.rows[0] ?? null)
      expect(resolveDataViewMember({...selection, dataField: 'amount'}, dataSet)).toBe(0)
      expect(resolveDataViewMember({...selection, dataField: 'enabled'}, dataSet)).toBe(false)
      expect(resolveDataViewMember({...selection, dataField: 'nullable'}, dataSet)).toBeNull()
      const tags = resolveDataViewMember({...selection, dataField: 'tags'}, dataSet)
      if (!Array.isArray(tags)) throw new Error('field array must remain an array')
      tags.push('detached')
      expect(view.rows[0]?.['tags']).toEqual(['x', 'y'])
      expect(resolveDataViewMember({...selection, dataField: 'details'}, dataSet)).toEqual({code: 'D'})
      expect(resolveDataViewCapabilities({...selection, dataField: 'details'}, dataSet))
        .toEqual({dataSource: view, dataRow: null})
      expect(diagnoseDataViewMember(field, dataSet).status).toBe('ok')
      expect(diagnoseDataViewMember({...selection, dataField: 'missing'}, dataSet).status).toBe('missing-field')
    } finally { dataSet.destroy() }
  })

  it('rejects unreadable values using the same query permissions and reports disposed sources', async () => {
    const {dataSet, view} = await createValueDataSet(['text', 'key'])
    try {
      view.setCurrentRow(view.rows[0] ?? null)
      view.setSelectedRows([view.rows[0]!])
      expect(() => resolveDataViewMember({...selection, dataField: 'text'}, dataSet)).toThrow('DATA_VIEW_VALUE_READ')
      expect(diagnoseDataViewMember({...selection, dataField: 'text'}, dataSet).status).toBe('value-unavailable')
      expect(() => resolveDataViewMember(selection, dataSet)).toThrow('DATA_VIEW_VALUE_READ')
      view.destroy()
      expect(diagnoseDataViewMember(selection, dataSet).status).toBe('value-unavailable')
    } finally { dataSet.destroy() }
  })

  it('preserves numeric zero keys while the legacy primary-key string still round-trips', async () => {
    const {dataSet, view} = await createValueDataSet([], [0, 2])
    try {
      delete view.valueField
      view.value = '2|0'
      expect(view.value).toBe('2|0')
      expect(resolveDataViewMember(selection, dataSet)).toEqual([2, 0])
      view.value = '0'
      expect(view.value).toBe('0')
      expect(resolveDataViewMember(selection, dataSet)).toEqual([0])
    } finally { dataSet.destroy() }
  })
})
