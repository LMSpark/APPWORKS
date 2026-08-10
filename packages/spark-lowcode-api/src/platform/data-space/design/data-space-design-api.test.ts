import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../../lowcode-api.js'
import { DATA_SPACE_DESIGN_FORM_KEY } from './data-space-design-api.js'

class DataSpaceDesignFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []
  public modelType = '数据库表'

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const table = ((config.data as { Table: Array<{ Name: string }> }).Table[0]?.Name) ?? ''
    const rows: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
      Base_DataSet: [{
        rowid: 'SPACE-1',
        Name: '薪资核算场景',
        description: '薪资页面与报表共享',
        inputParams: JSON.stringify([{ rowid: 'PARAM-1', Name: '期间', IsBusiness: 1 }]),
      }],
      Base_DataModel: [{
        rowid: 'MODEL-1',
        dataSetId: 'SPACE-1',
        Name: '薪资前端模型',
        Type: this.modelType,
        MetaName: 'PayrollSalary',
        DbId: 'DATABASE-1',
        DbName: 'payroll',
      }],
      Base_DataModel_Field: [{
        rowid: 'FIELD-1',
        dataSetId: 'SPACE-1',
        dataModelId: 'MODEL-1',
        type: 'dataModel',
        Name: 'rowid',
        IsPKey: 1,
      }, {
        rowid: 'FIELD-2',
        dataSetId: 'SPACE-1',
        dataModelId: 'MODEL-1',
        type: 'dataModel',
        Name: 'salary',
        AsName: 'salaryAmount',
      }],
      Base_DataModel_Relation: [],
    }
    return {
      data: { Code: 200, Result: { data: { Items: rows[table] ?? [] } } },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

describe('DataSpaceDesignApi', () => {
  it('reads the data-space and its frontend-model closure through the design context', async () => {
    const http = new DataSpaceDesignFixtureHttpClient()
    const api = new LowcodeApi({ http })

    const snapshot = await api.dataSpace.design.read('SPACE-1')

    expect(http.requests).toHaveLength(4)
    expect(http.requests.every((request) => request.headers?.['x-FormKey'] === DATA_SPACE_DESIGN_FORM_KEY)).toBe(true)
    expect(snapshot).toMatchObject({
      dataSpaceId: 'SPACE-1',
      name: '薪资核算场景',
      inputParameters: [{ parameterId: 'PARAM-1', name: '期间', business: true }],
    })
    expect(snapshot.models[0]?.snapshot()).toMatchObject({
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      resource: {
        databaseId: 'DATABASE-1',
        resourceName: 'PayrollSalary',
        resourceType: 'table',
        primaryKeyField: 'rowid',
      },
      fields: [
        { fieldId: 'FIELD-1', resourceField: 'rowid' },
        { fieldId: 'FIELD-2', resourceField: 'salary', alias: 'salaryAmount' },
      ],
    })
  })

  it('fails fast for an unknown physical resource type', async () => {
    const http = new DataSpaceDesignFixtureHttpClient()
    http.modelType = '未知'
    const api = new LowcodeApi({ http })

    await expect(api.dataSpace.design.read('SPACE-1')).rejects.toThrow('未知数据资源类型')
  })

  it('prepares a governed data-space design command without executing a write', async () => {
    const http = new DataSpaceDesignFixtureHttpClient()
    const api = new LowcodeApi({ http })
    const preimage = await api.dataSpace.design.read('SPACE-1')

    const command = api.dataSpace.design.prepareMutation({
      capability: 'update-field-reference',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      idempotencyKey: 'DESIGN-1',
      preimage,
      change: { fieldId: 'FIELD-2', resourceField: 'salary', alias: 'grossSalary' },
    })

    expect(command).toMatchObject({
      kind: 'data-space-design-mutation',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      risk: 'medium',
      journal: { required: true },
      readback: { required: true, dataSpaceId: 'SPACE-1' },
      compensation: { kind: 'restore-data-space-design-snapshot' },
    })
    expect(http.requests).toHaveLength(4)
  })
})
