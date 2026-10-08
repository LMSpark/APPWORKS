import { describe, expect, it } from 'vitest'
import { DataSetCrudTool, DataSet, SparkData } from '@spark-appworks/spark-data'

function createValueCascadeTool() {
  return DataSetCrudTool.fromJson({dataSetName: 'ValueCrud', tables: {
    Orders: {columns: [{name: 'id', type: 'string', isPrimaryKey: true},
      {name: 'country', type: 'string'}, {name: 'city', type: 'string'}], views: {default: {}, edit: {}}},
    Cities: {columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'code', type: 'string'}],
      views: {default: {}, choices: {valueField: 'code', selectionDelimiter: '|'}}},
  }})
}

const valueCascade = {kind: 'field' as const, cascadeId: 'city', tableName: 'Orders', viewId: 'edit',
  targetField: 'city', valueFormat: 'selection-string' as const,
  parents: [{tableName: 'Orders', viewId: 'edit', field: 'country', parameter: 'countryId'}],
  optionsView: {tableName: 'Cities', viewId: 'choices'}, valuePolicy: {mode: 'retain' as const}}

describe('DataSetCrudTool', () => {
  it('maintains value cascades by identity with serialized value configuration and undo/redo', () => {
    const tool = createValueCascadeTool()
    try {
      expect(tool.createCascade({cascade: valueCascade})).toEqual(valueCascade)
      expect(tool.listCascades()).toEqual([valueCascade])
      expect(tool.listCascades({kind: 'field'})).toEqual([valueCascade])
      expect(tool.listCascades({kind: 'query'})).toEqual([])
      expect(tool.listCascades({parentTable: 'Orders', childTable: 'Cities'})).toEqual([valueCascade])
      expect(tool.getCascade({cascadeId: 'city'})).toEqual(valueCascade)
      expect(tool.dataSet.getCascade({cascadeId: 'city'})).toEqual(valueCascade)
      const updated = tool.updateCascade({cascadeId: 'city', updates: {
        valuePolicy: {mode: 'retain-valid', clearValue: ''}}})
      expect(updated).toMatchObject({valueFormat: 'selection-string', valuePolicy: {mode: 'retain-valid', clearValue: ''}})
      expect(tool.undo()).toBe(true)
      expect(tool.getCascade({cascadeId: 'city'})).toEqual(valueCascade)
      expect(tool.redo()).toBe(true)
      expect(tool.getCascade({cascadeId: 'city'})).toEqual(updated)
      tool.deleteCascade({cascadeId: 'city'})
      expect(tool.listCascades()).toEqual([])
      expect(tool.getCascade({cascadeId: 'city'})).toBeUndefined()
      expect(tool.undo()).toBe(true)
      expect(tool.getCascade({cascadeId: 'city'})).toEqual(updated)
      expect(tool.redo()).toBe(true)
      expect(tool.listCascades()).toEqual([])
      expect(tool.getView({tableName: 'Cities', viewId: 'choices'})).toMatchObject({valueField: 'code', selectionDelimiter: '|'})
    } finally { tool.dataSet.destroy() }
  })

  it('rejects invalid value-cascade edits without changing configuration, live views or history', () => {
    const tool = createValueCascadeTool()
    try {
      tool.createCascade({cascade: valueCascade})
      const snapshot = tool.toJson()
      const cursor = tool.historyCursor
      const target = tool.getView({tableName: 'Orders', viewId: 'edit'})
      const invalid = [
        {optionsView: {tableName: 'Cities', viewId: 'missing'}},
        {targetField: 'missing'}, {targetField: 'id'},
        {parents: [{tableName: 'Orders', viewId: 'edit', field: 'city', parameter: 'self'}]},
        {valuePolicy: {mode: 'clear', clearValue: []}},
        {kind: 'query'}, {kind: undefined}, {filterBindings: []}, {rowMode: 'editing-row'},
      ]
      for (const updates of invalid) {
        expect(() => Reflect.apply(tool.updateCascade, tool, [{cascadeId: 'city', updates}])).toThrow()
        expect(tool.toJson()).toEqual(snapshot)
        expect(tool.historyCursor).toBe(cursor)
        expect(tool.getView({tableName: 'Orders', viewId: 'edit'})).toBe(target)
      }
      expect(() => tool.createCascade({cascade: valueCascade})).toThrow(/DUPLICATE/)
      expect(() => tool.createCascade({cascade: {...valueCascade, cascadeId: 'another'}})).toThrow(/DUPLICATE/)
      expect(() => tool.deleteCascade({cascadeId: 'missing'})).toThrow(/not found/)
      expect(tool.historyCursor).toBe(cursor)
      expect(tool.undo()).toBe(true)
      expect(tool.listCascades()).toEqual([])
      expect(() => tool.createCascade({cascade: {...valueCascade, targetField: 'missing'}})).toThrow()
      expect(tool.canRedo).toBe(true)
      expect(tool.redo()).toBe(true)
      expect(tool.getCascade({cascadeId: 'city'})).toEqual(valueCascade)
    } finally { tool.dataSet.destroy() }
  })

  it('requires a unique selector and rejects query and field configuration mixing', () => {
    const tool = createValueCascadeTool()
    const endpoints = {parentTable: 'Orders', parentViewId: 'edit', childTable: 'Cities', childViewId: 'choices'}
    try {
      tool.createCascade({cascade: valueCascade})
      tool.createCascade({cascade: {...endpoints, cascadeId: 'query-a', filterBindings: [{sourceField: 'country', targetField: 'code'}]}})
      tool.createCascade({cascade: {...endpoints, cascadeId: 'query-b', filterBindings: [{sourceField: 'id', targetField: 'id'}]}})
      const before = tool.toJson()
      const cursor = tool.historyCursor
      expect(() => tool.getCascade(endpoints)).toThrow(/ambiguous/)
      expect(() => tool.deleteCascade(endpoints)).toThrow(/ambiguous/)
      expect(tool.getCascade({...endpoints, cascadeId: 'query-b'})).toMatchObject({cascadeId: 'query-b'})
      expect(tool.getCascade({...endpoints, cascadeId: 'city'})).toBeUndefined()
      expect(() => tool.updateCascade({cascadeId: 'query-a', updates: {kind: 'field'}})).toThrow()
      expect(() => tool.updateCascade({cascadeId: 'query-a', updates: {targetField: 'city'}})).toThrow()
      expect(() => tool.updateCascade({cascadeId: 'query-a', updates: {cascadeId: 'city'}})).toThrow()
      expect(() => tool.getCascade({cascadeId: ''})).toThrow()
      expect(() => Reflect.apply(tool.getCascade, tool, [{}])).toThrow()
      expect(tool.toJson()).toEqual(before)
      expect(tool.historyCursor).toBe(cursor)
    } finally { tool.dataSet.destroy() }
  })

  it('returns the created query even when two legacy definitions share endpoints without identities', () => {
    const tool = createValueCascadeTool()
    const endpoints = {parentTable: 'Orders', parentViewId: 'edit', childTable: 'Cities', childViewId: 'choices'}
    try {
      tool.createCascade({cascade: {...endpoints, filterBindings: [{sourceField: 'country', targetField: 'code'}]}})
      expect(tool.createCascade({cascade: {...endpoints, filterBindings: [{sourceField: 'id', targetField: 'id'}]}}))
        .toMatchObject({filterBindings: [{sourceField: 'id', targetField: 'id'}]})
      expect(tool.listCascades({kind: 'query'})).toHaveLength(2)
      expect(() => tool.getCascade(endpoints)).toThrow(/ambiguous/)
      expect(tool.undo()).toBe(true)
      expect(tool.getCascade(endpoints)).toMatchObject({filterBindings: [{sourceField: 'country', targetField: 'code'}]})
    } finally { tool.dataSet.destroy() }
  })

  it('constructor should create an empty DataSet with the provided name', () => {
    const tool = new DataSetCrudTool('ToolDS')

    expect(tool.dataSetName).toBe('ToolDS')
    expect(tool.listTables()).toHaveLength(0)
    expect(tool.dataSet.dataSetName).toBe('ToolDS')
  })

  it('should support table, view and row CRUD from one facade', async () => {
    const tool = new DataSetCrudTool('UsersDS')

    tool.createTable({
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
      resourceType: 'database-table',
      resourceId: 'crm.users',
      businessCategory: 'master',
      views: {
        default: {
          rows: [{ id: 1, name: 'Alice' }],
          autoCurrentFirst: false,
        },
      },
    })

    expect(tool.getTable('Users')?.resourceType).toBe('database-table')
    expect(tool.getTable('Users')?.resourceId).toBe('crm.users')
    expect(tool.getTable('Users')?.businessCategory).toBe('master')

    tool.createView({ tableName: 'Users', viewId: 'grid', config: { pageSize: 50 } })
    expect(tool.getView({ tableName: 'Users', viewId: 'grid' })?.pageSize).toBe(50)

    await tool.createRow({ tableName: 'Users', data: { id: 2, name: 'Bob' } })
    expect(tool.listRows({ tableName: 'Users' })).toHaveLength(2)
    expect(tool.getTable('Users')?.rows).toHaveLength(2)

    await tool.updateRow({ tableName: 'Users', id: 2, data: { name: 'Bobby' } })
    expect(tool.getRow({ tableName: 'Users', id: 2 })?.['name']).toBe('Bobby')

    await tool.deleteRow({ tableName: 'Users', id: 1 })
    expect(tool.getRow({ tableName: 'Users', id: 1 })).toBeUndefined()
    expect(tool.getTable('Users')?.rows).toHaveLength(1)

    tool.updateView({ tableName: 'Users', viewId: 'grid', updates: { page: 3 } })
    expect(tool.getView({ tableName: 'Users', viewId: 'grid' })?.page).toBe(3)

    tool.deleteView({ tableName: 'Users', viewId: 'grid' })
    expect(tool.getView({ tableName: 'Users', viewId: 'grid' })).toBeUndefined()
  })

  it('should support batch row CRUD from one facade', async () => {
    const tool = new DataSetCrudTool('BatchRowsDS')

    tool.createTable({
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
      views: {
        default: {
          rows: [{ id: 1, name: 'Alice' }],
          autoCurrentFirst: false,
        },
      },
    })

    const createResult = await tool.createRows({ tableName: 'Users', items: [
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Carol' },
    ] })
    expect(createResult.success).toBe(true)
    expect(createResult.data?.successCount).toBe(2)
    expect(tool.listRows({ tableName: 'Users' })).toHaveLength(3)

    const updateResult = await tool.updateRows({ tableName: 'Users', items: [
      { id: 2, data: { name: 'Bobby' } },
      { id: 3, data: { name: 'Caroline' } },
    ] })
    expect(updateResult.success).toBe(true)
    expect(updateResult.data?.failureCount).toBe(0)
    expect(tool.getRow({ tableName: 'Users', id: 2 })?.['name']).toBe('Bobby')
    expect(tool.getRow({ tableName: 'Users', id: 3 })?.['name']).toBe('Caroline')

    const deleteResult = await tool.deleteRows({ tableName: 'Users', ids: [1, 3] })
    expect(deleteResult.success).toBe(true)
    expect(deleteResult.data?.successCount).toBe(2)
    expect(tool.getRow({ tableName: 'Users', id: 1 })).toBeUndefined()
    expect(tool.getRow({ tableName: 'Users', id: 3 })).toBeUndefined()
    expect(tool.getTable('Users')?.rows).toHaveLength(1)
  })

  it('should support column CRUD and refresh DataView column cache and validator', () => {
    const tool = new DataSetCrudTool('SchemaDS')
    tool.createTable({
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
    })

    const table = tool.getTable('Users')!
    const view = tool.getView({ tableName: 'Users', viewId: 'default' })!
    const initialColumnCount = tool.listColumns('Users').length

    tool.createColumn({ tableName: 'Users', column: { name: 'email', type: 'string' } })
    tool.updateColumn({ tableName: 'Users', columnName: 'name', updates: { label: 'User Name' } })

    expect(tool.listColumns('Users')).toHaveLength(initialColumnCount + 1)
    expect(tool.getColumn({ tableName: 'Users', columnName: 'email' })).toBeDefined()
    expect(view.getColumn('email')).toBeDefined()
    expect(tool.getColumn({ tableName: 'Users', columnName: 'name' })?.label).toBe('User Name')
    expect(view.getColumn('name')?.label).toBe('User Name')
    expect(table.validator?.isValid({ id: 1, name: 'Alice', email: 'a@test.dev' })).toBe(true)

    tool.deleteColumn({ tableName: 'Users', columnName: 'email' })
    expect(tool.getColumn({ tableName: 'Users', columnName: 'email' })).toBeUndefined()
    expect(view.getColumn('email')).toBeUndefined()
  })

  it('should support table semantic metadata planning fields', () => {
    const tool = new DataSetCrudTool('MetaDS')

    tool.createTable({
      tableName: 'StatusOptions',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'label', type: 'string' },
      ],
      resourceType: 'static-data',
      resourceId: 'common.order-status',
    })

    tool.updateTable({
      tableName: 'StatusOptions',
      resourceType: 'logical-view',
      resourceId: null,
      businessCategory: 'reference',
    })

    const table = tool.getTable('StatusOptions')
    expect(table?.resourceType).toBe('logical-view')
    expect(table?.resourceId).toBeUndefined()
    expect(table?.businessCategory).toBe('reference')

    const exported = tool.toJson().tables['StatusOptions']
    expect(exported?.resourceType).toBe('logical-view')
    expect(exported?.resourceId).toBeUndefined()
    expect(exported?.businessCategory).toBe('reference')
  })

  it('should support resource relation and DataView cascade CRUD including relationId disambiguation', () => {
    const tool = new DataSetCrudTool('RelationDS')

    tool.createTable({
      tableName: 'Orders',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'code', type: 'string' },
      ],
    })
    tool.createTable({
      tableName: 'Items',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'orderId', type: 'number' },
        { name: 'orderCode', type: 'string' },
      ],
    })

    tool.createResourceRelation({ relationId: 'order-id', parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' })
    tool.createResourceRelation({ relationId: 'order-code', parentTable: 'Orders', childTable: 'Items', parentField: 'code', childField: 'orderCode' })

    expect(() => tool.getResourceRelation({ parentTable: 'Orders', childTable: 'Items' })).toThrow(/ambiguous/)
    const updatedRelation = tool.updateResourceRelation({selector: {parentTable: 'Orders', childTable: 'Items', relationId: 'order-code'}, updates: {relationName: 'by-code'}})
    expect(updatedRelation.relationId).toBe('order-code')
    expect(updatedRelation.relationName).toBe('by-code')

    tool.deleteResourceRelation({ parentTable: 'Orders', childTable: 'Items', relationId: 'order-code' })
    expect(tool.listResourceRelations({ parentTable: 'Orders', childTable: 'Items' })).toHaveLength(1)

    tool.createCascade({
      cascade: {
        parentTable: 'Orders',
        parentViewId: 'default',
        childTable: 'Items',
        childViewId: 'default',
        filterBindings: [{ sourceField: 'id', targetField: 'orderId' }],
        dependencyType: 'currentRow',
        autoLoad: true,
      },
    })
    const cascadeSelector = {
      parentTable: 'Orders',
      parentViewId: 'default',
      childTable: 'Items',
      childViewId: 'default',
    }
    expect(tool.getCascade(cascadeSelector)).toMatchObject({dependencyType: 'currentRow'})

    tool.updateCascade({
      ...cascadeSelector,
      updates: {
        dependencyType: 'selectedRows',
        autoLoad: false,
      },
    })
    expect(tool.getCascade(cascadeSelector)).toMatchObject({dependencyType: 'selectedRows'})

    tool.deleteCascade(cascadeSelector)
    expect(tool.getCascade(cascadeSelector)).toBeUndefined()
  })

  it('maintains field-cascade target, parent and option references through the shared CRUD facade', () => {
    const tool = DataSetCrudTool.fromJson({dataSetName: 'FieldCrud', tables: {
      Orders: {tableName: 'Orders', columns: [{name: 'id', type: 'string', isPrimaryKey: true},
        {name: 'country', type: 'string'}, {name: 'city', type: 'string'}],
      views: {default: {}, edit: {}}},
      Cities: {tableName: 'Cities', columns: [{name: 'id', type: 'string', isPrimaryKey: true},
        {name: 'caption', type: 'string'}], views: {default: {}, choices: {valueField: 'id', labelField: 'caption'}}},
    }, viewCascades: [
      {cascadeId: 'query', parentTable: 'Orders', parentViewId: 'edit', childTable: 'Cities', childViewId: 'choices',
        filterBindings: [{sourceField: 'country', targetField: 'caption'}]},
      {kind: 'field', cascadeId: 'city-by-country', tableName: 'Orders', viewId: 'edit', valueFormat: 'native',
        targetField: 'city', parents: [{tableName: 'Orders', viewId: 'edit', field: 'country', parameter: 'countryId'}],
        optionsView: {tableName: 'Cities', viewId: 'choices'},
        valuePolicy: {mode: 'retain-valid', clearValue: null}},
    ]})
    expect(tool.listCascades()).toHaveLength(2)
    expect(tool.listCascades({kind: 'query'})).toHaveLength(1)
    expect(tool.listCascades({kind: 'field'})).toHaveLength(1)
    expect(tool.getCascade({parentTable: 'Orders', parentViewId: 'edit', childTable: 'Cities', childViewId: 'choices'})?.cascadeId)
      .toBe('query')
    expect(() => tool.deleteColumn({tableName: 'Orders', columnName: 'city'})).toThrow('viewCascades')
    expect(() => tool.deleteColumn({tableName: 'Cities', columnName: 'id'})).toThrow('viewCascades')
    expect(() => tool.deleteView({tableName: 'Orders', viewId: 'edit'})).toThrow('viewCascades')
    expect(() => tool.deleteView({tableName: 'Cities', viewId: 'choices'})).toThrow('viewCascades')
    expect(() => tool.deleteTable('Cities')).toThrow('viewCascades')
    tool.renameColumn({tableName: 'Orders', columnName: 'country', newColumnName: 'nation'})
    tool.renameColumn({tableName: 'Orders', columnName: 'city', newColumnName: 'location'})
    tool.renameColumn({tableName: 'Cities', columnName: 'caption', newColumnName: 'name'})
    tool.renameTable({tableName: 'Orders', newTableName: 'Purchases'})
    tool.renameTable({tableName: 'Cities', newTableName: 'Places'})
    expect(tool.toJson().viewCascades).toMatchObject([
      {parentTable: 'Purchases', childTable: 'Places',
        filterBindings: [{sourceField: 'nation', targetField: 'name'}]},
      {tableName: 'Purchases', targetField: 'location', parents: [{field: 'nation', parameter: 'countryId'}],
        optionsView: {tableName: 'Places', viewId: 'choices'}},
    ])
    expect(DataSet.fromJson(tool.toJson()).toJson().viewCascades).toEqual(tool.toJson().viewCascades)
  })

  it('protects and renames cross-view input bindings without treating them as fields on the target', () => {
    const tool = DataSetCrudTool.fromJson({dataSetName: 'Inputs', tables: {
      Regions: {columns: [{name: 'id', type: 'number', isPrimaryKey: true}, {name: 'code', type: 'string'}],
        views: {default: {}, input: {}, selected: {}}},
      Orders: {columns: [{name: 'id', type: 'number', isPrimaryKey: true}, {name: 'city', type: 'string'}],
        views: {default: {}, edit: {}}},
      Cities: {columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, choices: {}}},
    }, viewCascades: [{kind: 'field', cascadeId: 'cross', tableName: 'Orders', viewId: 'edit', targetField: 'city',
      valueFormat: 'native', parents: [{tableName: 'Regions', viewId: 'input', field: 'code', parameter: 'region'},
        {tableName: 'Regions', viewId: 'selected', parameter: 'ids'}],
      optionsView: {tableName: 'Cities', viewId: 'choices'}, valuePolicy: {mode: 'retain'}}]})
    try {
      const before = tool.toJson()
      expect(() => tool.deleteTable('Regions')).toThrow('viewCascades')
      expect(() => tool.deleteView({tableName: 'Regions', viewId: 'input'})).toThrow('viewCascades')
      expect(() => tool.deleteView({tableName: 'Regions', viewId: 'selected'})).toThrow('viewCascades')
      expect(() => tool.deleteColumn({tableName: 'Regions', columnName: 'code'})).toThrow('viewCascades')
      expect(() => tool.deleteColumn({tableName: 'Regions', columnName: 'id'})).toThrow('viewCascades')
      expect(tool.toJson()).toEqual(before)
      tool.renameColumn({tableName: 'Regions', columnName: 'code', newColumnName: 'regionCode'})
      tool.renameTable({tableName: 'Regions', newTableName: 'Areas'})
      expect(tool.toJson().viewCascades).toMatchObject([{tableName: 'Orders', targetField: 'city', parents: [
        {tableName: 'Areas', viewId: 'input', field: 'regionCode', parameter: 'region'},
        {tableName: 'Areas', viewId: 'selected', parameter: 'ids'},
      ]}])
      expect(tool.undo()).toBe(true)
      expect(tool.toJson().viewCascades).toMatchObject([{parents: [{tableName: 'Regions'}, {tableName: 'Regions'}]}])
      expect(tool.redo()).toBe(true)
      expect(tool.toJson().viewCascades).toMatchObject([{parents: [{tableName: 'Areas'}, {tableName: 'Areas'}]}])
    } finally { tool.dataSet.destroy() }
  })

  it('should keep the canonical relation expression and DataView cascade bindings aligned when a column is renamed', () => {
    const tool = DataSetCrudTool.fromJson({
      dataSetName: 'RenameDS',
      tables: {
        Customers: {
          columns: [{ name: 'id', type: 'string', isPrimaryKey: true }],
          views: {
            default: {},
            customerModel: {
              fieldProjection: [{
                fieldId: 'customer-id',
                source: 'resource',
                resourceFieldId: 'customer-id',
                resourceField: 'id',
                viewField: 'id',
                type: 'string',
                label: '客户 ID',
                output: true,
                sortOrder: 0,
                sortDirection: null,
                group: false,
                distinct: false,
                primaryKey: true,
                value: '',
                valueFunction: '',
                expression: '',
              }],
            },
          },
        },
        Orders: {
          columns: [{ name: 'customerId', type: 'string' }],
          views: { default: {}, orderModel: {} },
        },
      },
      resourceRelations: [{
        parentTable: 'Customers',
        childTable: 'Orders',
        parentField: 'id',
        childField: 'customerId',
        fieldMappings: [{ parentResourceField: 'id', childResourceField: 'customerId' }],
      }],
      viewCascades: [{
        parentTable: 'Customers',
        parentViewId: 'customerModel',
        childTable: 'Orders',
        childViewId: 'orderModel',
        filterBindings: [{ sourceField: 'id', targetField: 'customerId' }],
      }],
    })

    tool.renameColumn({ tableName: 'Customers', columnName: 'id', newColumnName: 'customerKey' })

    expect(tool.dataSet.resourceRelations?.[0]).toMatchObject({
      filterExpression: {logic: 'and', filters: [{logic: 'and', filters: [
        {field: 'customerId', operator: 'is-not-null'},
        {field: 'customerId', operator: 'eq', value: {Type: 'GetTableField', Field: 'customerKey'}},
      ]}]},
    })
    expect(tool.dataSet.viewCascades?.[0]?.filterBindings).toEqual([
      { sourceField: 'customerKey', targetField: 'customerId' },
    ])
    expect(tool.getView({ tableName: 'Customers', viewId: 'customerModel' })?.fieldProjection).toMatchObject([
      { resourceField: 'customerKey', viewField: 'customerKey' },
    ])
  })

  it('should reject deleting a column referenced by a resource relation or DataView cascade', () => {
    const tool = new DataSetCrudTool('DeleteGuardDS')
    tool.createTable({ tableName: 'Parents', columns: [{ name: 'id', type: 'string' }] })
    tool.createTable({ tableName: 'Children', columns: [{ name: 'parentId', type: 'string' }] })
    tool.createResourceRelation({
      parentTable: 'Parents',
      childTable: 'Children',
      parentField: 'id',
      childField: 'parentId',
    })

    expect(() => tool.deleteColumn({ tableName: 'Parents', columnName: 'id' })).toThrow(/resourceRelations/)
  })

  it('rejects invalid legacy fields atomically and blocks structure changes for unknown value functions', () => {
    const tool = new DataSetCrudTool('RelationValidationDS')
    tool.createTable({tableName: 'Parents', columns: [{name: 'id', type: 'string'}]})
    tool.createTable({tableName: 'Children', columns: [{name: 'parentId', type: 'string'}]})
    tool.createTable({tableName: 'Third', columns: [{name: 'id', type: 'string'}]})
    const before = tool.dataSet.toJson()
    expect(() => tool.createResourceRelation({parentTable: 'Parents', childTable: 'Children', parentField: 'missing', childField: 'parentId'})).toThrow(/legacy parent field does not exist/)
    expect(tool.dataSet.toJson()).toEqual(before)
    tool.createResourceRelation({parentTable: 'Parents', childTable: 'Children', filterExpression: {
      field: 'parentId', operator: 'eq', value: {Type: 'FutureLookup', RefTableName: 'Parents', RefFieldName: 'id'},
    }})
    expect(DataSet.fromJson(tool.toJson()).resourceRelations).toEqual(tool.dataSet.resourceRelations)
    const relationBeforeRename = tool.dataSet.toJson()
    expect(() => tool.renameColumn({tableName: 'Parents', columnName: 'id', newColumnName: 'parentKey'})).toThrow(/unresolvable value function/)
    expect(tool.dataSet.toJson()).toEqual(relationBeforeRename)
    expect(() => tool.deleteTable('Third')).toThrow(/unresolvable value function/)
    expect(tool.dataSet.toJson()).toEqual(relationBeforeRename)
  })

  it('does not rewrite matching keys inside explicit constant values', () => {
    const tool = new DataSetCrudTool('RelationConstantDS')
    tool.createTable({tableName: 'Parents', columns: [{name: 'id', type: 'string'}]})
    tool.createTable({tableName: 'Children', columns: [{name: 'parentId', type: 'string'}]})
    tool.createResourceRelation({parentTable: 'Parents', childTable: 'Children', filterExpression: {
      field: 'parentId', operator: 'eq', value: {Type: 'GetConstValue', Value: {RefTableName: 'Parents', Field: 'id'}},
    }})
    tool.renameColumn({tableName: 'Parents', columnName: 'id', newColumnName: 'parentKey'})
    expect(tool.dataSet.resourceRelations?.[0]?.filterExpression).toEqual({
      field: 'parentId', operator: 'eq', value: {Type: 'GetConstValue', Value: {RefTableName: 'Parents', Field: 'id'}},
    })
  })

  it('should maintain both sides of a self-relation leaf and known third-table function fields', () => {
    const tool = new DataSetCrudTool('RelationReferenceDS')
    tool.createTable({tableName: 'Nodes', columns: [{name: 'parentId', type: 'string'}, {name: 'lookup', type: 'string'}]})
    tool.createTable({tableName: 'Lookup', columns: [{name: 'key', type: 'string'}]})
    tool.createTable({tableName: 'Third', columns: [{name: 'key', type: 'string'}]})
    tool.createResourceRelation({parentTable: 'Nodes', childTable: 'Nodes', filterExpression: {logic: 'and', filters: [
      {field: 'Nodes.parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'Nodes.parentId'}},
      {field: 'lookup', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Third', RefFieldName: 'key', FkFieldName: 'key'}},
      {field: 'lookup', operator: 'eq', value: {Type: 'GetGroupData', GroupTableName: 'Third', GroupField: 'key', Field: 'key'}},
    ]}})

    tool.renameColumn({tableName: 'Nodes', columnName: 'parentId', newColumnName: 'parentKey'})
    tool.renameColumn({tableName: 'Third', columnName: 'key', newColumnName: 'lookupKey'})
    expect(tool.dataSet.resourceRelations?.[0]?.filterExpression).toEqual({logic: 'and', filters: [
      {field: 'Nodes.parentKey', operator: 'eq', value: {Type: 'GetTableField', Field: 'Nodes.parentKey'}},
      {field: 'lookup', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Third', RefFieldName: 'lookupKey', FkFieldName: 'lookupKey'}},
      {field: 'lookup', operator: 'eq', value: {Type: 'GetGroupData', GroupTableName: 'Third', GroupField: 'lookupKey', Field: 'lookupKey'}},
    ]})
    tool.renameTable({tableName: 'Nodes', newTableName: 'RenamedNodes'})
    expect(tool.dataSet.resourceRelations?.[0]).toMatchObject({parentTable: 'RenamedNodes', childTable: 'RenamedNodes', filterExpression: {logic: 'and', filters: [
      {field: 'RenamedNodes.parentKey', operator: 'eq', value: {Type: 'GetTableField', Field: 'RenamedNodes.parentKey'}},
      {field: 'lookup', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Third', RefFieldName: 'lookupKey', FkFieldName: 'lookupKey'}},
      {field: 'lookup', operator: 'eq', value: {Type: 'GetGroupData', GroupTableName: 'Third', GroupField: 'lookupKey', Field: 'lookupKey'}},
    ]}})
    expect(DataSet.fromJson(tool.toJson()).resourceRelations?.[0]?.filterExpression).toEqual(tool.dataSet.resourceRelations?.[0]?.filterExpression)
    expect(() => tool.deleteColumn({tableName: 'RenamedNodes', columnName: 'parentKey'})).toThrow(/resourceRelations/)

    tool.createResourceRelation({parentTable: 'RenamedNodes', childTable: 'Lookup', filterExpression: {
      field: 'key', operator: 'eq', value: {Type: 'GetExpData', refTableName: 'Lookup', Exp: 'lookupKey'},
    }})
    expect(() => tool.renameColumn({tableName: 'Lookup', columnName: 'key', newColumnName: 'renamedAgain'})).toThrow(/unresolvable value function/)
    expect(() => tool.deleteColumn({tableName: 'Lookup', columnName: 'key'})).toThrow(/resourceRelations|unresolvable value function/)
    expect(tool.getTable('Lookup')?.columns.some(column => column.name === 'key')).toBe(true)
    expect(() => tool.deleteTable('Third')).toThrow(/resourceRelations/)
    expect(tool.getTable('Third')?.columns.some(column => column.name === 'lookupKey')).toBe(true)
  })

  it('maintains qualified third-table GetTableField references without changing bare parent fields or constants', () => {
    const tool = new DataSetCrudTool('AncestorReferenceDS')
    tool.createTable({tableName: 'Parents', columns: [{name: 'id', type: 'string'}]})
    tool.createTable({tableName: 'Children', columns: [{name: 'parentId', type: 'string'}]})
    tool.createTable({tableName: 'Ancestor', columns: [{name: 'key', type: 'string'}]})
    tool.createResourceRelation({parentTable: 'Parents', childTable: 'Children', filterExpression: {logic: 'and', filters: [
      {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}},
      {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'Ancestor.key'}},
      {field: 'parentId', operator: 'eq', value: {Type: 'GetConstValue', Value: 'Ancestor.key'}},
    ]}})
    const beforeDelete = tool.dataSet.toJson()
    expect(() => tool.deleteColumn({tableName: 'Ancestor', columnName: 'key'})).toThrow(/resourceRelations/)
    expect(() => tool.deleteTable('Ancestor')).toThrow(/resourceRelations/)
    expect(tool.dataSet.toJson()).toEqual(beforeDelete)
    tool.renameColumn({tableName: 'Ancestor', columnName: 'key', newColumnName: 'ancestorKey'})
    tool.renameTable({tableName: 'Ancestor', newTableName: 'StableAncestor'})
    expect(tool.dataSet.resourceRelations?.[0]?.filterExpression).toEqual({logic: 'and', filters: [
      {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}},
      {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'StableAncestor.ancestorKey'}},
      {field: 'parentId', operator: 'eq', value: {Type: 'GetConstValue', Value: 'Ancestor.key'}},
    ]})
    expect(DataSet.fromJson(tool.toJson()).resourceRelations).toEqual(tool.dataSet.resourceRelations)
    expect(() => tool.deleteColumn({tableName: 'StableAncestor', columnName: 'ancestorKey'})).toThrow(/resourceRelations/)
    expect(() => tool.deleteTable('StableAncestor')).toThrow(/resourceRelations/)
  })

  it('does not confuse dotted table-name prefixes in qualified GetTableField references', () => {
    const tool = new DataSetCrudTool('DottedAncestorDS')
    tool.createTable({tableName: 'Parents', columns: [{name: 'id', type: 'string'}]})
    tool.createTable({tableName: 'Children', columns: [{name: 'parentId', type: 'string'}]})
    tool.createTable({tableName: 'Ancestor', columns: [{name: 'key', type: 'string'}]})
    tool.createTable({tableName: 'Ancestor.Part', columns: [{name: 'key', type: 'string'}]})
    tool.createResourceRelation({parentTable: 'Parents', childTable: 'Children', filterExpression: {
      field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'Ancestor.Part.key'},
    }})
    tool.renameTable({tableName: 'Ancestor', newTableName: 'RenamedAncestor'})
    expect(tool.dataSet.resourceRelations?.[0]?.filterExpression).toEqual({
      field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'Ancestor.Part.key'},
    })
    tool.deleteColumn({tableName: 'RenamedAncestor', columnName: 'key'})
    tool.deleteTable('RenamedAncestor')
    expect(() => tool.deleteColumn({tableName: 'Ancestor.Part', columnName: 'key'})).toThrow(/resourceRelations/)
    expect(() => tool.deleteTable('Ancestor.Part')).toThrow(/resourceRelations/)
    tool.renameTable({tableName: 'Ancestor.Part', newTableName: 'StablePart'})
    expect(tool.dataSet.resourceRelations?.[0]?.filterExpression).toEqual({
      field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'StablePart.key'},
    })
  })

  it('SparkData namespace should expose createDataSetCrudTool factory', () => {
    const tool = SparkData.createDataSetCrudTool('NamespaceDS')

    expect(tool).toBeInstanceOf(DataSetCrudTool)
    expect(tool.dataSetName).toBe('NamespaceDS')
  })
})
