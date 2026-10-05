import { DataSpaceFrontendModel } from '@spark-appworks/spark-lowcode-api'
import { describe, expect, it } from 'vitest'

import { LowcodeFrontendModelAdapter } from '../../../src/lowcode/data-space/lowcode-frontend-model-adapter'

function model(modelId: string, resourceId = 'RESOURCE-1'): DataSpaceFrontendModel {
  return new DataSpaceFrontendModel({
    dataSpaceId: 'SPACE-1',
    modelId,
    name: modelId,
    resource: {
      resourceId,
      databaseId: 'DATABASE-1',
      resourceName: 'PayrollSalary',
      resourceType: 'table',
      primaryKeyField: 'rowid',
      databaseName: 'payroll',
      fields: [{
        resourceFieldId: 'RESOURCE-FIELD-1',
        name: 'rowid',
        label: '主键',
        dataType: 'varchar',
        dataTypeName: '字符串型',
        length: '36',
        nullable: false,
        primaryKey: true,
        unique: true,
        system: false,
        defaultValue: '',
        description: '',
        order: 1,
      }],
    },
    fields: [{
      fieldId: `${modelId}-FIELD`,
      resourceFieldId: 'RESOURCE-FIELD-1',
      resourceField: 'rowid',
      alias: '',
      fieldType: '',
      output: true,
      order: 0,
      orderType: '',
      group: 0,
      distinct: false,
      primaryKey: true,
      value: '',
      valueFunction: '',
      expression: '',
    }],
    relations: [],
    query: {
      outputType: 'Table', filter: '', distinct: false, businessMain: true,
      joinType: '', joinFilter: '', parentModelId: '', requestComplete: '', hasChildField: '',
      parentField: '', foreignKeyFields: '', requestType: '', shortName: '', cacheType: '',
      items: '', selfType: '', topValue: '',
    },
  })
}

describe('LowcodeFrontendModelAdapter', () => {
  it('keeps one adapted model per modelId even when models share a resource', () => {
    const result = new LowcodeFrontendModelAdapter().adapt([model('MODEL-1'), model('MODEL-2')])

    expect(result.diagnostics).toEqual([])
    expect(result.models.map(item => item.modelId)).toEqual(['MODEL-1', 'MODEL-2'])
    expect(result.models.map(item => item.resource.resourceId)).toEqual(['RESOURCE-1', 'RESOURCE-1'])
    expect(result.models[0]?.resource).toMatchObject({ resourceId: 'RESOURCE-1', primaryKeyField: 'rowid' })
    expect(result.models[0]?.fieldProjection[0]).toMatchObject({
      fieldId: 'MODEL-1-FIELD', resourceFieldId: 'RESOURCE-FIELD-1', viewField: 'rowid',
    })
  })

  it('blocks duplicate modelId instead of inventing a replacement identity', () => {
    const result = new LowcodeFrontendModelAdapter().adapt([model('MODEL-1'), model('MODEL-1')])

    expect(result.models).toEqual([])
    expect(result.diagnostics).toMatchObject([
      { code: 'duplicate-model-id', modelId: 'MODEL-1' },
      { code: 'duplicate-model-id', modelId: 'MODEL-1' },
    ])
  })
})
