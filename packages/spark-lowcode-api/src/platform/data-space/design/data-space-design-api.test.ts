import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../../lowcode-api.js'
import { DATA_SPACE_DESIGN_FORM_KEY } from './data-space-design-api.js'

class DataSpaceDesignFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []
  public modelType = '数据库表'
  public modelResourceName = 'PayrollSalary'

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const table = ((config.data as { Table: Array<{ Name: string }> }).Table[0]?.Name) ?? ''
    const catalogRows: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
      Base_serverInfo: [{ rowid: 'SERVER-1', Type: 'MYSQL', ServerName: '主库' }],
      _base_dbInfo: [{ Id: 'DATABASE-1', serverId: 'SERVER-1', Name: 'payroll', Type: 'MYSQL' }],
      _Base_TblList: [{ rowid: 'RESOURCE-1', dbid: 'DATABASE-1', tblname: 'PayrollSalary', tbldesc: '薪资资源' }],
      _Base_ViewList: [],
      Base_TblField: [{
        rowid: 'RESOURCE-FIELD-1',
        tblid: 'RESOURCE-1',
        tblname: 'PayrollSalary',
        enname: 'rowid',
        cnname: '主键',
        DataTypeName: '字符串型',
        IsNill: 0,
        IsPKey: 1,
      }, {
        rowid: 'RESOURCE-FIELD-2',
        tblid: 'RESOURCE-1',
        tblname: 'PayrollSalary',
        enname: 'salary',
        cnname: '薪资',
        DataTypeName: '定点小数',
        IsNill: 1,
      }],
    }
    if (config.url === '/api/DataOperation/GetBaseData') {
      return {
        data: { Code: 200, Result: { Items: catalogRows[table] ?? [] } },
        status: 200,
        statusText: 'OK',
        headers: {},
      }
    }
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
        MetaName: this.modelResourceName,
        DbId: 'DATABASE-1',
        DbName: 'payroll',
        IsBusinessMain: 1,
        OutputType: 'Table',
      }, {
        rowid: 'MODEL-2',
        dataSetId: 'SPACE-1',
        Name: '薪资只读视图',
        Type: this.modelType,
        MetaName: this.modelResourceName,
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
        IsOutput: 1,
        Order: 2,
        OrderType: 'descending',
      }, {
        rowid: 'FIELD-3',
        dataSetId: 'SPACE-1',
        dataModelId: 'MODEL-2',
        type: 'dataModel',
        Name: 'rowid',
        IsPKey: 1,
      }],
      Base_DataModel_Relation: [{
        rowid: 'RELATION-1',
        dataSetId: 'SPACE-1',
        childModId: 'MODEL-2',
        parentModId: 'MODEL-1',
        childTable: 'PayrollSalary',
        parentTable: 'PayrollSalary',
        depType: 'refresh',
        filter: JSON.stringify({
          Type: 'cond',
          Field: 'PayrollSalary.rowid',
          Operator: 'equal',
          ValueFun: { Type: 'GetTableField', Field: 'PayrollSalary.rowid' },
        }),
      }],
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

    const snapshot = await api.dataSpace.design.read({
      dataSpaceId: 'SPACE-1',
      catalogFormKeys: 'FORM-DBMS',
    })

    expect(http.requests).toHaveLength(9)
    expect(http.requests.filter((request) => request.url === '/api/DataOperation/GetData')
      .every((request) => request.headers?.['x-FormKey'] === DATA_SPACE_DESIGN_FORM_KEY)).toBe(true)
    expect(http.requests.filter((request) => request.url === '/api/DataOperation/GetBaseData')
      .every((request) => request.headers?.['x-FormKey'] === 'FORM-DBMS')).toBe(true)
    expect(snapshot).toMatchObject({
      dataSpaceId: 'SPACE-1',
      name: '薪资核算场景',
      inputParameters: [{ parameterId: 'PARAM-1', name: '期间', business: true }],
      resources: [{ resourceId: 'RESOURCE-1', resourceName: 'PayrollSalary' }],
      relations: [{
        sourceRelationId: 'RELATION-1',
        dataSpaceId: 'SPACE-1',
        parentModelId: 'MODEL-1',
        childModelId: 'MODEL-2',
        parentResourceName: 'PayrollSalary',
        childResourceName: 'PayrollSalary',
        dependencyType: 'refresh',
      }],
    })
    expect(snapshot.models).toHaveLength(2)
    expect(snapshot.models[0]?.snapshot()).toMatchObject({
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      resource: {
        resourceId: 'RESOURCE-1',
        databaseId: 'DATABASE-1',
        resourceName: 'PayrollSalary',
        resourceType: 'table',
        primaryKeyField: 'rowid',
        fields: [
          { resourceFieldId: 'RESOURCE-FIELD-1', name: 'rowid' },
          { resourceFieldId: 'RESOURCE-FIELD-2', name: 'salary' },
        ],
      },
      fields: [
        { fieldId: 'FIELD-1', resourceFieldId: 'RESOURCE-FIELD-1', resourceField: 'rowid' },
        {
          fieldId: 'FIELD-2',
          resourceFieldId: 'RESOURCE-FIELD-2',
          resourceField: 'salary',
          alias: 'salaryAmount',
          output: true,
          order: 2,
          orderType: 'descending',
        },
      ],
      query: { businessMain: true, outputType: 'Table' },
    })
  })

  it('fails fast for an unknown physical resource type', async () => {
    const http = new DataSpaceDesignFixtureHttpClient()
    http.modelType = '未知'
    const api = new LowcodeApi({ http })

    await expect(api.dataSpace.design.read({
      dataSpaceId: 'SPACE-1',
      catalogFormKeys: 'FORM-DBMS',
    })).rejects.toThrow('未知数据资源类型')
  })

  it('fails fast when the backend resource identity cannot be read back', async () => {
    const http = new DataSpaceDesignFixtureHttpClient()
    http.modelResourceName = 'MissingSalary'
    const api = new LowcodeApi({ http })

    await expect(api.dataSpace.design.read({
      dataSpaceId: 'SPACE-1',
      catalogFormKeys: 'FORM-DBMS',
    })).rejects.toThrow('数据资源未解析')
  })

  it('prepares a governed data-space design command without executing a write', async () => {
    const http = new DataSpaceDesignFixtureHttpClient()
    const api = new LowcodeApi({ http })
    const preimage = await api.dataSpace.design.read({
      dataSpaceId: 'SPACE-1',
      catalogFormKeys: 'FORM-DBMS',
    })

    const command = api.dataSpace.design.prepareMutation({
      capability: 'update-field-reference',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      idempotencyKey: 'DESIGN-1',
      preimage,
      change: {
        fieldId: 'FIELD-2',
        resourceFieldId: 'RESOURCE-FIELD-2',
        resourceField: 'salary',
        alias: 'grossSalary',
        fieldType: '',
        output: true,
        order: 2,
        orderType: 'descending',
        group: 0,
        distinct: false,
        primaryKey: false,
        value: '',
        valueFunction: '',
        expression: '',
      },
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
    expect(http.requests).toHaveLength(9)
  })
})
