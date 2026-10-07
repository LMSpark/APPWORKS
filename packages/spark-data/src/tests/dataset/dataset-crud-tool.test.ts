import { describe, expect, it } from 'vitest'
import { DataSetCrudTool, SparkData } from '@spark-appworks/spark-data'

describe('DataSetCrudTool', () => {
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

  it('should support resource relation and DataView cascade CRUD including ambiguous pair disambiguation', () => {
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

    tool.createResourceRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' })
    tool.createResourceRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'code', childField: 'orderCode' })

    expect(() => tool.getResourceRelation({ parentTable: 'Orders', childTable: 'Items' })).toThrow(/ambiguous/)

    tool.deleteResourceRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'code', childField: 'orderCode' })
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
    expect(tool.getCascade(cascadeSelector)?.dependencyType).toBe('currentRow')

    tool.updateCascade({
      ...cascadeSelector,
      updates: {
        dependencyType: 'selectedRows',
        autoLoad: false,
      },
    })
    expect(tool.getCascade(cascadeSelector)?.dependencyType).toBe('selectedRows')

    tool.deleteCascade(cascadeSelector)
    expect(tool.getCascade(cascadeSelector)).toBeUndefined()
  })

  it('should keep resource mappings and DataView cascade bindings aligned when a column is renamed', () => {
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
      parentField: 'customerKey',
      fieldMappings: [{ parentResourceField: 'customerKey', childResourceField: 'customerId' }],
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

  it('SparkData namespace should expose createDataSetCrudTool factory', () => {
    const tool = SparkData.createDataSetCrudTool('NamespaceDS')

    expect(tool).toBeInstanceOf(DataSetCrudTool)
    expect(tool.dataSetName).toBe('NamespaceDS')
  })
})
