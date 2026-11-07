import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../../dataset'
import {
  bindDataSetReadonlyCommandQuery,
  dataSetCommandQueryResultFromLocalRows,
  ensureDataSetFileCommandView,
  ensureDataSetStaticInputTable,
} from '../../../data-set-command/data-set-command-view'

describe('DataSet command view helper', () => {
  it.each(['', '   '])('rejects an empty file resource identity before registering a table: %j', resourceId => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    try {
      expect(() => ensureDataSetFileCommandView({dataSet, tableName: 'Invalid', resourceId,
        columns: [{name: 'id', primary: true}]})).toThrow('DATA_SET_COMMAND_RESOURCE_ID')
      expect(dataSet.getTable('Invalid')).toBeUndefined()
    } finally {dataSet.destroy()}
  })

  it.each(['static-data', 'file'])('rejects duplicate column declarations before creating a %s table', type => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    const columns = [{name: 'id', primary: true}, {name: 'id'}]
    try {
      expect(() => type === 'file'
        ? ensureDataSetFileCommandView({dataSet, tableName: 'Invalid', resourceId: 'resource', columns})
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
        ? ensureDataSetFileCommandView({dataSet, tableName: 'Formal', resourceId: 'document', columns: [{name: 'id', primary: true}]})
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
      expect(() => ensureDataSetFileCommandView({dataSet, tableName: 'Existing', resourceId: 'expected',
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
      const view = ensureDataSetFileCommandView({dataSet, tableName: 'Existing', resourceId: 'document',
        columns: [{name: 'id', primary: true}, {name: 'value'}]})
      expect(() => ensureDataSetFileCommandView({dataSet, tableName: 'Existing', resourceId: 'document',
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

  it('ensure static input and file command view then refresh readonly rows', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    ensureDataSetStaticInputTable(dataSet, 'CmdInput', [{name: 'commandId', primary: true}, {name: 'value'}])
    const input = dataSet.getTable('CmdInput')!
    input.addRows([{commandId: 'default', value: 'x'}])
    const resultView = ensureDataSetFileCommandView({dataSet, tableName: 'CmdResult', resourceId: 'cmd-result', columns: [{name: 'ok', primary: true}]})
    const guard = vi.fn()
    bindDataSetReadonlyCommandQuery(resultView, {
      resource: {resourceType: 'file', resourceId: 'cmd-result'},
      guard,
      loadRows: async () => [{ok: 'yes'}],
    })
    await resultView.refresh()
    expect(guard).toHaveBeenCalled()
    expect(resultView.rows[0]?.['ok']).toBe('yes')
    expect(resultView.fieldAccess(resultView.rows[0]!, 'ok').read).toBe('visible')
    expect(resultView.fieldAccess(resultView.rows[0]!, 'ok').write).toBe('denied')
  })

  it('ensure file command view is idempotent', () => {
    const dataSet = DataSet.fromJson({scenarioId: 'CMD', tables: {}})
    const first = ensureDataSetFileCommandView({dataSet, tableName: 'Once', resourceId: 'once', columns: [{name: 'id', primary: true}]})
    const second = ensureDataSetFileCommandView({dataSet, tableName: 'Once', resourceId: 'once', columns: [{name: 'id', primary: true}]})
    expect(first).toBe(second)
    expect(dataSet.getTable('Once')).toBeTruthy()
  })
})
