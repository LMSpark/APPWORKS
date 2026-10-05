import type { LowcodeModelRelationRecord } from '@spark-appworks/spark-lowcode-api'
import { describe, expect, it } from 'vitest'

import type {
  LowcodeAdaptedResource,
  LowcodeFrontendModelAdapterResult,
} from '../../../src/lowcode/data-space/lowcode-frontend-model-adapter'
import { LowcodeModelRelationAdapter } from '../../../src/lowcode/data-space/lowcode-model-relation-adapter'

const parentResource: LowcodeAdaptedResource = {
  resourceId: 'RESOURCE-PARENT',
  resourceName: 'ParentTable',
  resourceType: 'database-table',
  databaseId: 'DATABASE-1',
  databaseName: 'business',
  primaryKeyField: 'id',
  columns: [
    { name: 'id', type: 'integer', isPrimaryKey: true },
    { name: 'tenantId', type: 'string' },
  ],
}

const childResource: LowcodeAdaptedResource = {
  resourceId: 'RESOURCE-CHILD',
  resourceName: 'ChildTable',
  resourceType: 'database-table',
  databaseId: 'DATABASE-1',
  databaseName: 'business',
  primaryKeyField: 'id',
  columns: [
    { name: 'id', type: 'integer', isPrimaryKey: true },
    { name: 'parentId', type: 'integer' },
    { name: 'tenantKey', type: 'string' },
  ],
}

const models: LowcodeFrontendModelAdapterResult = {
  models: [{
    dataSpaceId: 'SPACE-1',
    modelId: 'MODEL-PARENT',
    modelName: '父模型',
    resource: parentResource,
    fieldProjection: [
      { fieldId: 'P-ID', source: 'resource', resourceFieldId: 'R-P-ID', resourceField: 'id', viewField: 'parentKey', type: 'integer', label: 'ID', output: true, sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: true, value: '', valueFunction: '', expression: '' },
      { fieldId: 'P-TENANT', source: 'resource', resourceFieldId: 'R-P-TENANT', resourceField: 'tenantId', viewField: 'tenant', type: 'string', label: '租户', output: true, sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false, value: '', valueFunction: '', expression: '' },
    ],
  }, {
    dataSpaceId: 'SPACE-1',
    modelId: 'MODEL-CHILD',
    modelName: '子模型',
    resource: childResource,
    fieldProjection: [
      { fieldId: 'C-PARENT', source: 'resource', resourceFieldId: 'R-C-PARENT', resourceField: 'parentId', viewField: 'parentRef', type: 'integer', label: '父级', output: true, sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false, value: '', valueFunction: '', expression: '' },
      { fieldId: 'C-TENANT', source: 'resource', resourceFieldId: 'R-C-TENANT', resourceField: 'tenantKey', viewField: 'tenantRef', type: 'string', label: '租户', output: true, sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false, value: '', valueFunction: '', expression: '' },
    ],
  }],
  diagnostics: [],
}

function relation(dependencyType = 'selectedRows'): LowcodeModelRelationRecord {
  return {
    sourceRelationId: 'RELATION-1',
    dataSpaceId: 'SPACE-1',
    parentModelId: 'MODEL-PARENT',
    childModelId: 'MODEL-CHILD',
    parentResourceName: 'ParentTable',
    childResourceName: 'ChildTable',
    filterExpression: JSON.stringify({
      Type: 'and',
      Filters: [{
        Type: 'cond', Field: 'ChildTable.parentId', Operator: 'equal',
        ValueFun: { Type: 'GetTableField', Field: 'ParentTable.id' },
      }, {
        Type: 'cond', Field: 'ChildTable.tenantKey', Operator: 'equal',
        ValueFun: { Type: 'GetTableField', Field: 'ParentTable.tenantId' },
      }],
    }),
    dependencyType,
    cascadeDelete: true,
  }
}

describe('LowcodeModelRelationAdapter', () => {
  it('projects one raw relation into independent resource mappings and DataView bindings', () => {
    const result = new LowcodeModelRelationAdapter().adapt([relation()], models)

    expect(result.diagnostics).toEqual([])
    expect(result.resourceRelations).toMatchObject([{
      sourceRelationId: 'RELATION-1',
      parentTable: 'MODEL-PARENT',
      childTable: 'MODEL-CHILD',
      cascadeDelete: true,
      fieldMappings: [
        { parentResourceField: 'id', childResourceField: 'parentId' },
        { parentResourceField: 'tenantId', childResourceField: 'tenantKey' },
      ],
    }])
    expect(result.viewCascades).toMatchObject([{
      sourceRelationId: 'RELATION-1',
      parentViewId: 'default',
      childViewId: 'default',
      dependencyType: 'selectedRows',
      filterBindings: [
        { sourceField: 'parentKey', targetField: 'parentRef' },
        { sourceField: 'tenant', targetField: 'tenantRef' },
      ],
    }])
    expect(result.resourceRelations[0]).not.toBe(result.viewCascades[0])
  })

  it('blocks unknown depType instead of guessing a trigger', () => {
    const result = new LowcodeModelRelationAdapter().adapt([relation('refresh')], models)

    expect(result.resourceRelations).toEqual([])
    expect(result.viewCascades).toEqual([])
    expect(result.diagnostics).toMatchObject([{
      code: 'unsupported-dependency-type',
      sourceRelationId: 'RELATION-1',
    }])
  })
})
