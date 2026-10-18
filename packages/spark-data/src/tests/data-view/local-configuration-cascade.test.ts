import {describe, expect, it} from 'vitest'
import {DataSet} from '../../dataset'
import {DataViewFilter} from '../../query/filter/data-view-filter'

function fixture(formal = false) {
  const dataSet = DataSet.fromJson({dataSetName: 'metadata', scenarioId: 'META', tables: {
    Definition: {tableName: 'Definition', resourceType: 'static-data',
      ...(formal ? {modelBinding: {modelId: 'M', modelName: 'Definition'}} : {}), columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'model', type: 'string'},
      {name: 'view', type: 'string'}, {name: 'label', type: 'string'},
    ], views: {default: {commitMode: 'staged', rows: [{id: 'a', model: 'A', view: 'list'},
      {id: 'b', model: 'B', view: 'list', label: 'old'}]}}},
    Fields: {tableName: 'Fields', resourceType: 'static-data', columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'model', type: 'string'},
      {name: 'view', type: 'string'}, {name: 'name', type: 'string'},
    ], views: {default: {rows: [{id: '1', model: 'A', view: 'list', name: 'title'},
      {id: '2', model: 'A', view: 'detail', name: 'private'}, {id: '3', model: 'B', view: 'list', name: 'caption'}],
    valueField: 'name', queryContext: {model: '', view: ''}, filterExpression: {logic: 'and', filters: [
      {field: 'model', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'model'}},
      {field: 'view', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'view'}},
    ]}}}},
  }, viewCascades: [{kind: 'field', cascadeId: 'label-fields', tableName: 'Definition', viewId: 'default',
    targetField: 'label', valueFormat: 'native', valuePolicy: {mode: 'retain'},
    parents: ['model', 'view'].map(field => ({tableName: 'Definition', viewId: 'default', field, parameter: field})),
    optionsView: {tableName: 'Fields', viewId: 'default'}}]})
  return {dataSet, definition: dataSet.getView('Definition', 'default')!, options: dataSet.getView('Fields', 'default')!}
}

describe('native local configuration cascades', () => {
  it('binds explicit JSON inputs without interpreting function-shaped constants or changing the definition', () => {
    const filter = DataViewFilter.group({logic: 'or', filters: [
      {field: 'id', operator: 'in', value: {Type: 'GetInputParam', ParamName: 'ids'}},
      {field: 'payload', operator: 'eq', value: {Type: 'GetConstValue', Value: {Type: 'GetInputParam', ParamName: 'literal'}}},
    ]})
    const before = filter.serialize()
    const ids = [0, false, 'a,b']
    expect(filter.bindInputParams({ids}).toJSON()).toMatchObject({filters: [
      {value: {Type: 'GetConstValue', Value: ids}},
      {value: {Type: 'GetConstValue', Value: {Type: 'GetInputParam', ParamName: 'literal'}}},
    ]})
    expect(filter.serialize()).toBe(before)
    for (const value of [undefined, Number.NaN, new Date(), new Array(2)]) {
      expect(() => filter.bindInputParams({ids: value})).toThrow('GetInputParam')
    }
    expect(() => filter.bindInputParams(Object.create({ids}))).toThrow('GetInputParam')
  })

  it('allows staged local configuration editing without granting remote writes or option fallback', async () => {
    const {dataSet, definition, options} = fixture()
    try {
      expect(definition.fieldAccess(definition.rows[0]!, 'label')).toMatchObject({read: 'visible', write: 'allowed'})
      expect(definition.fieldAccess(definition.rows[0]!, 'id').write).toBe('denied')
      expect(definition.fieldAccess(definition.rows[0]!, '_pk').write).toBe('denied')
      expect(options.fieldAccess(options.rows[0]!, 'name').write).toBe('denied')
      definition.dataTable!.crudConfig = {timeout: 2000}
      expect(definition.fieldAccess(definition.rows[0]!, 'label').write).toBe('denied')
      definition.dataTable!.crudConfig = undefined
      expect(definition.fieldAccess(definition.rows[0]!, 'unknown').read).toBe('invisible')
      expect(await options.queryOptionRows({fields: ['name'], context: {model: 'A', view: 'detail'}})).toEqual([{name: 'private'}])
      await expect(options.queryOptionRows({fields: ['unknown']})).rejects.toThrow('DATA_VIEW_OPTIONS_FIELD')
      options.dataTable!.api = {list: '/api/example'}
      await expect(options.queryOptionRows({fields: ['name']})).rejects.toThrow('DATA_VIEW_OPTIONS_UNBOUND')
      dataSet.destroy()
      await expect(options.queryOptionRows({fields: ['name']})).rejects.toThrow()
    } finally {dataSet.destroy()}
  })
  it.each(['api', 'model', 'query'] as const)('does not expose local editing for a staged view with a %s owner', kind => {
    const {dataSet, definition} = fixture(kind !== 'api')
    try {
      if (kind === 'api') definition.dataTable!.api = {update: '/api/example'}
      if (kind === 'query') definition.bindQueryExecutor({executeQuery: async () => {throw new Error('must not query')}})
      expect(definition.fieldAccess(definition.rows[0]!, 'label')).toMatchObject({read: 'invisible', write: 'denied'})
    } finally {dataSet.destroy()}
  })
  it('uses both input values, preserves an absent definition and retains an invalid saved reference', async () => {
    const {dataSet, definition, options} = fixture()
    try {
      const address = {tableName: 'Definition', viewId: 'default', field: 'label'}
      definition.setCurrentRowById('a')
      const before = options.toJson()
      expect(await dataSet.refreshFieldCascade(address)).toMatchObject({status: 'ready', valueStatus: 'empty', options: [{name: 'title'}]})
      expect(definition.getEditingRow('a')).not.toHaveProperty('label')
      definition.setCurrentRowById('b')
      expect(await dataSet.refreshFieldCascade(address)).toMatchObject({status: 'ready', valueStatus: 'invalid', options: [{name: 'caption'}]})
      expect(definition.getEditingRow('b')?.['label']).toBe('old')
      expect(definition.hasEditingChanges()).toBe(false)
      expect(options.toJson()).toEqual(before)
    } finally {dataSet.destroy()}
  })

  it('does not treat an unqueried formal model as local permission after changing resourceType', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'S', dataSetName: 'S', tables: {
      Formal: {tableName: 'Formal', resourceType: 'static-data', modelBinding: {modelId: 'M', modelName: 'Formal'},
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {rows: [{id: 'x'}]}}},
    }})
    try {
      const view = dataSet.getView('Formal', 'default')!
      expect(view.fieldAccess(view.rows[0]!, 'id')).toMatchObject({read: 'invisible', write: 'denied'})
      await expect(view.queryOptionRows({fields: ['id']})).rejects.toThrow('DATA_VIEW_OPTIONS_UNBOUND')
    } finally {dataSet.destroy()}
  })
})
