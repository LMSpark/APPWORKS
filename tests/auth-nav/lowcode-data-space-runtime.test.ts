import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import {
  DataSpaceFrontendModel,
  DataSpaceRuntimeApi,
  type DataSpaceDesignSnapshot,
  type LowcodeModelRelationRecord,
} from '@spark-appworks/spark-lowcode-api'
import { RequestState } from '@spark-appworks/spark-data'
import { describe, expect, it } from 'vitest'

import { LowcodeDataSpaceAssembler } from '../../src/lowcode/data-space/lowcode-data-space-assembler'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function field(resourceFieldId: string, name: string, primaryKey = false) {
  return {
    resourceFieldId,
    name,
    label: name,
    dataType: primaryKey ? 'int' : 'varchar',
    dataTypeName: primaryKey ? '整数型' : '字符串型',
    length: '',
    nullable: !primaryKey,
    primaryKey,
    unique: primaryKey,
    system: false,
    defaultValue: '',
    description: '',
    order: 0,
  }
}

function model(input: Readonly<{
  modelId: string
  name: string
  resourceId: string
  resourceName: string
  fields: readonly Readonly<{ id: string; name: string; alias?: string; primaryKey?: boolean }>[]
  relations: readonly LowcodeModelRelationRecord[]
}>): DataSpaceFrontendModel {
  const resourceFields = input.fields.map(item => field(`RESOURCE-${item.id}`, item.name, item.primaryKey === true))
  return new DataSpaceFrontendModel({
    dataSpaceId: 'SPACE-1',
    modelId: input.modelId,
    name: input.name,
    resource: {
      resourceId: input.resourceId,
      databaseId: 'DATABASE-1',
      resourceName: input.resourceName,
      resourceType: 'table',
      primaryKeyField: input.fields.find(item => item.primaryKey === true)?.name ?? 'id',
      databaseName: 'payroll',
      fields: resourceFields,
    },
    fields: input.fields.map(item => ({
      fieldId: item.id,
      resourceFieldId: `RESOURCE-${item.id}`,
      resourceField: item.name,
      alias: item.alias ?? '',
      fieldType: '',
      output: true,
      order: 0,
      orderType: '',
      group: 0,
      distinct: false,
      primaryKey: item.primaryKey === true,
      value: '',
      valueFunction: '',
      expression: '',
    })),
    relations: input.relations,
    query: {
      outputType: 'Table',
      filter: '',
      distinct: false,
      businessMain: true,
      joinType: '',
      joinFilter: '',
      parentModelId: '',
      requestComplete: '',
      hasChildField: '',
      parentField: '',
      foreignKeyFields: '',
      requestType: '',
      shortName: '',
      cacheType: '',
      items: '',
      selfType: '',
      topValue: '',
    },
  })
}

const relation: LowcodeModelRelationRecord = {
  sourceRelationId: 'RELATION-1',
  dataSpaceId: 'SPACE-1',
  parentModelId: 'MODEL-PARENT',
  childModelId: 'MODEL-CHILD',
  parentResourceName: 'Department',
  childResourceName: 'Employee',
  filterExpression: JSON.stringify({
    Type: 'cond',
    Field: 'Employee.departmentId',
    Operator: 'equal',
    ValueFun: { Type: 'GetTableField', Field: 'Department.id' },
  }),
  dependencyType: 'allRows',
  cascadeDelete: false,
}

function design(): DataSpaceDesignSnapshot {
  const parent = model({
    modelId: 'MODEL-PARENT',
    name: '部门模型',
    resourceId: 'RESOURCE-PARENT',
    resourceName: 'Department',
    fields: [{ id: 'FIELD-P-ID', name: 'id', primaryKey: true }],
    relations: [relation],
  })
  const child = model({
    modelId: 'MODEL-CHILD',
    name: '员工模型',
    resourceId: 'RESOURCE-CHILD',
    resourceName: 'Employee',
    fields: [
      { id: 'FIELD-C-ID', name: 'id', primaryKey: true },
      { id: 'FIELD-C-PARENT', name: 'departmentId' },
    ],
    relations: [relation],
  })
  return {
    dataSpaceId: 'SPACE-1',
    name: '组织场景',
    description: '',
    inputParameters: [],
    resources: [parent.resource, child.resource],
    models: [parent, child],
    relations: [relation],
  }
}

class RuntimeFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const request = isRecord(config.data) ? config.data : {}
    const tables = Array.isArray(request['Table']) ? request['Table'] : []
    const table = isRecord(tables[0]) ? tables[0] : {}
    const modelName = typeof table['Name'] === 'string' ? table['Name'] : ''
    const rows = modelName === '部门模型'
      ? [{ id: 7, lingma_sys_key: 'P-7', lingma_sys_params: { r: [], e: [], h: [], m: [], d: false } }]
      : [{ id: 70, departmentId: 7, lingma_sys_key: 'C-70', lingma_sys_params: { r: [], e: ['departmentId'], h: [], m: [], d: false } }]
    return {
      data: {
        Code: 200,
        Result: {
          allowAdd: true,
          lingma_sys_key: modelName === '部门模型' ? 'PARENT' : 'CHILD',
          data: { Items: rows, Count: rows.length },
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

describe('lowcode data-space DataView runtime', () => {
  it('assembles resource tables, model views, relations and backend permission snapshots', async () => {
    const http = new RuntimeFixtureHttpClient()
    const assembler = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi(http), http)
    const assembly = assembler.assemble({
      design: design(),
      formKey: 'FORM-1',
      authorizedFeatureTags: ['employee.read'],
    })

    expect(assembly.diagnostics).toEqual([])
    expect(assembly.dataSet.resourceRelations?.[0]).toMatchObject({
      sourceRelationId: 'RELATION-1',
      parentTable: 'RESOURCE-PARENT',
      childTable: 'RESOURCE-CHILD',
      fieldMappings: [{ parentResourceField: 'id', childResourceField: 'departmentId' }],
    })
    expect(assembly.dataSet.viewCascades?.[0]).toMatchObject({
      sourceRelationId: 'RELATION-1',
      parentViewId: 'MODEL-PARENT',
      childViewId: 'MODEL-CHILD',
      filterBindings: [{ sourceField: 'id', targetField: 'departmentId' }],
    })

    const childView = assembly.dataSet.getView('RESOURCE-CHILD', 'MODEL-CHILD')
    expect(childView).toBeDefined()
    await childView?.requestData()

    expect(http.requests).toHaveLength(2)
    expect(http.requests.every(request => request.headers?.['x-FormKey'] === 'FORM-1')).toBe(true)
    expect(childView?.requestState).toBe(RequestState.Loaded)
    expect(childView?.rows).toMatchObject([{ id: 70, departmentId: 7 }])
    expect(childView?.permissionSnapshot).toMatchObject({
      formKey: 'FORM-1',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-CHILD',
      allowAdd: true,
      authorizedFeatureTags: ['employee.read'],
    })
  })
})
