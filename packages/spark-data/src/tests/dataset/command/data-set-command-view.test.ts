import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../../dataset'
import type {DataColumn} from '../../../types'
import {
  bindDataSetReadonlyCommandQuery,
  dataSetCommandQueryResultFromLocalRows,
  ensureDataSetResourceView,
  ensureDataSetStaticInputTable,
} from '../../../data-set-command/data-set-command-view'

describe('DataSet command view helper', () => {
  it.each(['file', 'command', 'service-query', 'logical-view'])('requires and retains an explicit semantic resource kind (%s)', resourceType => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    try {
      const input = {dataSet, tableName: 'Semantic', resource: {resourceType, resourceId: 'resource'}, columns: [{name: 'id', primary: true}]}
      const view = ensureDataSetResourceView(input)
      expect(view.dataTable?.resourceType).toBe(resourceType)
      expect(view.dataTable?.resourceId).toBe('resource')
      expect(ensureDataSetResourceView(input)).toBe(view)
    } finally {dataSet.destroy()}
  })

  it.each(['', '   ', ' service-query', 'service-query '])('rejects an invalid type before registering any view (%j)', resourceType => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    try {
      expect(() => ensureDataSetResourceView({dataSet, tableName: 'Invalid', resource: {resourceType, resourceId: 'resource'},
        columns: [{name: 'id', primary: true}]})).toThrow('DATA_SET_RESOURCE_IDENTITY')
      expect(dataSet.getTable('Invalid')).toBeUndefined()
    } finally {dataSet.destroy()}
  })

  it.each(['command', 'service-query', 'logical-view'])('never relabels an existing file to %s with the same ID', resourceType => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    try {
      const input = {dataSet, tableName: 'Existing', resource: {resourceType: 'file', resourceId: 'same'}, columns: [{name: 'id', primary: true}]}
      const view = ensureDataSetResourceView(input), table = view.dataTable
      expect(() => ensureDataSetResourceView({...input, resource: {resourceType, resourceId: 'same'}})).toThrow('DATA_SET_COMMAND_RESOURCE_CONFLICT')
      expect(view.dataTable).toBe(table)
      expect(table?.resourceType).toBe('file')
      expect(table?.viewList).toEqual([view])
    } finally {dataSet.destroy()}
  })

  it('rejects registration after DataSet release without reviving a default view', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    dataSet.destroy()
    try {
      expect(() => ensureDataSetResourceView({dataSet, tableName: 'Late', resource: {resourceType: 'service-query', resourceId: 'late'},
        columns: [{name: 'id', primary: true}]})).toThrow('DATA_SET_RESOURCE_DESTROYED')
      expect(dataSet.getTable('Late')).toBeUndefined()
    } finally {dataSet.getTable('Late')?.destroy()}
  })

  it('rejects a released default instead of returning or replacing it', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    try {
      const input = {dataSet, tableName: 'Existing', resource: {resourceType: 'service-query', resourceId: 'existing'}, columns: [{name: 'id', primary: true}]}
      const original = ensureDataSetResourceView(input)
      original.destroy()
      expect(() => ensureDataSetResourceView(input)).toThrow('DATA_SET_RESOURCE_VIEW_STALE')
      expect(dataSet.getView('Existing')).toBe(original)
      expect(original.destroyed).toBe(true)
    } finally {dataSet.destroy()}
  })

  it('uses only the command primary declaration when structural metadata contains isPrimaryKey', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    const columns: DataColumn[] = [{name: 'id', type: 'string', isPrimaryKey: true}]
    try {
      const input = {dataSet, tableName: 'Typed', resource: {resourceType: 'file', resourceId: 'typed'}, columns}
      const view = ensureDataSetResourceView(input)
      expect(() => ensureDataSetResourceView(input)).not.toThrow()
      expect(view.columns.find(column => column.name === 'id')?.isPrimaryKey).not.toBe(true)
    } finally {dataSet.destroy()}
  })

  it('preserves declared enum and validation metadata without string coercion', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    const columns = [{name: 'id', primary: true}, {name: 'kind', type: 'enum', required: true,
      label: 'Kind', enumOptions: [{value: 'A', label: 'Option A'}]}]
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'Typed', resource: {resourceType: 'file', resourceId: 'typed'}, columns})
      expect(view.columns.find(column => column.name === 'kind')).toMatchObject({type: 'enum', required: true,
        label: 'Kind', enumOptions: [{value: 'A', label: 'Option A'}]})
      expect(() => ensureDataSetResourceView({dataSet, tableName: 'Typed', resource: {resourceType: 'file', resourceId: 'typed'}, columns})).not.toThrow()
      dataSet.getTable('Typed')!.columns.find(column => column.name === 'kind')!.required = false
      expect(() => ensureDataSetResourceView({dataSet, tableName: 'Typed', resource: {resourceType: 'file', resourceId: 'typed'}, columns}))
        .toThrow('DATA_SET_COMMAND_COLUMNS_CONFLICT')
    } finally {dataSet.destroy()}
  })

  it.each(['', '   '])('rejects an empty file resource identity before registering a table: %j', resourceId => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    try {
      expect(() => ensureDataSetResourceView({dataSet, tableName: 'Invalid', resource: {resourceType: 'file', resourceId},
        columns: [{name: 'id', primary: true}]})).toThrow('DATA_SET_RESOURCE_IDENTITY')
      expect(dataSet.getTable('Invalid')).toBeUndefined()
    } finally {dataSet.destroy()}
  })

  it.each(['static-data', 'file'])('rejects duplicate column declarations before creating a %s table', type => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    const columns = [{name: 'id', primary: true}, {name: 'id'}]
    try {
      expect(() => type === 'file'
        ? ensureDataSetResourceView({dataSet, tableName: 'Invalid', resource: {resourceType: 'file', resourceId: 'resource'}, columns})
        : ensureDataSetStaticInputTable(dataSet, 'Invalid', columns)).toThrow('DATA_SET_COMMAND_COLUMNS_CONFLICT')
      expect(dataSet.getTable('Invalid')).toBeUndefined()
    } finally {dataSet.destroy()}
  })

  it.each(['static-data', 'file'])('rejects a formally bound model even with matching %s columns', resourceType => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {Formal: {
      resourceType, ...(resourceType === 'file' ? {resourceId: 'document'} : {}),
      modelBinding: {modelId: 'M', modelName: 'Formal'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {autoLoad: false}},
    }}})
    try {
      const ensure = () => resourceType === 'file'
        ? ensureDataSetResourceView({dataSet, tableName: 'Formal', resource: {resourceType: 'file', resourceId: 'document'}, columns: [{name: 'id', primary: true}]})
        : ensureDataSetStaticInputTable(dataSet, 'Formal', [{name: 'id', primary: true}])
      expect(ensure).toThrow('DATA_SET_COMMAND_RESOURCE_CONFLICT')
      expect(dataSet.getTable('Formal')?.modelBinding?.modelId).toBe('M')
    } finally {dataSet.destroy()}
  })

  it.each([
    {resourceType: 'static-data', resourceId: 'named-source', columns: [{name: 'id', type: 'string', isPrimaryKey: true}], error: 'RESOURCE'},
    {resourceType: 'static-data', columns: [{name: 'id', type: 'number', isPrimaryKey: true}], error: 'COLUMNS'},
    {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'other', type: 'string', isPrimaryKey: true}], error: 'COLUMNS'},
    {resourceType: 'static-data', columns: [{name: 'id', type: 'string'}], error: 'COLUMNS'},
  ])('rejects an incompatible static input declaration: %j', ({error, ...definition}) => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {Input: {
      ...definition, views: {default: {autoLoad: false}},
    }}})
    try {
      expect(() => ensureDataSetStaticInputTable(dataSet, 'Input', [{name: 'id', primary: true}]))
        .toThrow(`DATA_SET_COMMAND_${error}_CONFLICT`)
    } finally {dataSet.destroy()}
  })

  it.each([
    {resourceType: 'static-data', resourceId: 'expected'},
    {resourceType: 'file', resourceId: 'another-resource'},
  ])('rejects a same-name file command resource conflict: %j', resource => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {Existing: {
      ...resource, columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {autoLoad: false}},
    }}})
    const table = dataSet.getTable('Existing')!
    try {
      expect(() => ensureDataSetResourceView({dataSet, tableName: 'Existing', resource: {resourceType: 'file', resourceId: 'expected'},
        columns: [{name: 'id', primary: true}]})).toThrow('DATA_SET_COMMAND_RESOURCE_CONFLICT')
      expect(dataSet.getTable('Existing')).toBe(table)
      expect(table.resourceType).toBe(resource.resourceType)
      expect(table.resourceId).toBe(resource.resourceId)
    } finally {dataSet.destroy()}
  })

  it('does not reuse a file resource as a static command input', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {Existing: {
      resourceType: 'file', resourceId: 'document', columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {autoLoad: false}},
    }}})
    try {
      expect(() => ensureDataSetStaticInputTable(dataSet, 'Existing', [{name: 'id', primary: true}]))
        .toThrow('DATA_SET_COMMAND_RESOURCE_CONFLICT')
      expect(dataSet.getTable('Existing')?.resourceId).toBe('document')
    } finally {dataSet.destroy()}
  })

  it.each([
    [{name: 'missing'}],
    [{name: 'value', primary: true}],
  ])('rejects a missing required column or a different primary key: %j', column => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    try {
      const view = ensureDataSetResourceView({dataSet, tableName: 'Existing', resource: {resourceType: 'file', resourceId: 'document'},
        columns: [{name: 'id', primary: true}, {name: 'value'}]})
      expect(() => ensureDataSetResourceView({dataSet, tableName: 'Existing', resource: {resourceType: 'file', resourceId: 'document'},
        columns: [column]})).toThrow('DATA_SET_COMMAND_COLUMNS_CONFLICT')
      expect(dataSet.getView('Existing')).toBe(view)
    } finally {dataSet.destroy()}
  })

  it('reuses matching resources with extra columns without replacing static input rows', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    try {
      ensureDataSetStaticInputTable(dataSet, 'Input', [{name: 'id', primary: true}, {name: 'value'}])
      const table = dataSet.getTable('Input')!
      table.addRows([{id: 'original', value: 'kept'}])
      ensureDataSetStaticInputTable(dataSet, 'Input', [{name: 'id', primary: true}])
      expect(dataSet.getTable('Input')).toBe(table)
      expect(table.rows[0]).toMatchObject({id: 'original', value: 'kept'})
    } finally {dataSet.destroy()}
  })

  it('queries a local derived resource with readonly fields and an explicit scope guard', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'local-options', tables: {Targets: {
      resourceType: 'static-data', resourceId: 'navigation-targets',
      columns: [{name: 'value', type: 'string', isPrimaryKey: true}, {name: 'label', type: 'string'}],
      views: {default: {autoLoad: false}},
    }}})
    const view = dataSet.getView('Targets')!
    let current = true
    let rows = [{value: 'cfg:orders', label: 'Orders'}]
    const guard = () => {if (!current) throw new Error('target scope changed')}
    view.bindQueryExecutor({
      queryColumns: target => target.columns,
      executeQuery: target => dataSetCommandQueryResultFromLocalRows(target, rows, guard),
    }, {resource: {resourceType: 'static-data', resourceId: 'navigation-targets'}})
    try {
      await view.refresh()
      expect(view.loadingError).toBeNull()
      expect(view.rows).toMatchObject(rows)
      expect(view.dataTable?.modelBinding).toBeUndefined()
      expect(view.fieldAccess(view.rows[0]!, 'label')).toMatchObject({read: 'visible', write: 'denied'})
      rows = [{value: 'cfg:billing', label: 'Billing'}]
      await view.refresh()
      expect(view.rows.map(row => row['value'])).toEqual(['cfg:billing'])
      current = false
      expect(() => view.fieldAccess(view.rows[0]!, 'label')).toThrow('target scope changed')
    } finally {dataSet.destroy()}
  })

  it('creates static input and a service query view then refreshes readonly rows', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    ensureDataSetStaticInputTable(dataSet, 'CmdInput', [{name: 'commandId', primary: true}, {name: 'value'}])
    const input = dataSet.getTable('CmdInput')!
    input.addRows([{commandId: 'default', value: 'x'}])
    const resultView = ensureDataSetResourceView({dataSet, tableName: 'CmdResult', resource: {resourceType: 'service-query', resourceId: 'cmd-result'}, columns: [{name: 'ok', primary: true}]})
    const guard = vi.fn()
    bindDataSetReadonlyCommandQuery(resultView, {
      resource: {resourceType: 'service-query', resourceId: 'cmd-result'},
      guard,
      loadRows: async () => [{ok: 'yes'}],
    })
    await resultView.refresh()
    expect(guard).toHaveBeenCalled()
    expect(resultView.rows[0]?.['ok']).toBe('yes')
    expect(resultView.fieldAccess(resultView.rows[0]!, 'ok').read).toBe('visible')
    expect(resultView.fieldAccess(resultView.rows[0]!, 'ok').write).toBe('denied')
  })

  it('creates an explicit file resource view idempotently', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    const first = ensureDataSetResourceView({dataSet, tableName: 'Once', resource: {resourceType: 'file', resourceId: 'once'}, columns: [{name: 'id', primary: true}]})
    const second = ensureDataSetResourceView({dataSet, tableName: 'Once', resource: {resourceType: 'file', resourceId: 'once'}, columns: [{name: 'id', primary: true}]})
    expect(first).toBe(second)
    expect(dataSet.getTable('Once')).toBeTruthy()
  })
})
