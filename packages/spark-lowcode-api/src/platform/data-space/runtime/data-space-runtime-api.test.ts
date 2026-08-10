import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../../lowcode-api.js'
import { DataSpaceFrontendModel } from '../data-space.js'

class DataSpaceFixtureHttpClient extends HttpClientBase {
  public requestConfig: RequestConfig | null = null
  public result: unknown = {
    data: {
      Items: [{
        rowid: 'ROW-1',
        salary: 100,
        lingma_sys_key: 'ROW-KEY',
        lingma_sys_params: {
          r: ['employee'],
          e: ['salary'],
          h: ['secret'],
          m: ['bankAccount'],
          d: true,
        },
      }],
      Count: 1,
    },
    allowAdd: true,
    lingma_sys_key: 'TABLE-KEY',
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requestConfig = config
    return {
      data: { Code: 200, Result: this.result },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

function payrollModel(): DataSpaceFrontendModel {
  return new DataSpaceFrontendModel({
    dataSpaceId: 'DATA-SPACE-1',
    modelId: 'MODEL-1',
    name: '薪资前端模型',
    resource: {
      resourceId: 'RESOURCE-1',
      resourceName: 'PayrollSalary',
      resourceType: 'table',
      primaryKeyField: 'rowid',
    },
    fields: [
      { fieldId: 'FIELD-ROWID', resourceField: 'rowid' },
      { fieldId: 'FIELD-SALARY', resourceField: 'salary' },
    ],
    relations: [],
  })
}

describe('DataSpaceRuntimeApi', () => {
  it('keeps FormKey separate from DataSpace and atomically preserves backend permission facts', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = new LowcodeApi({ http })
    const snapshot = await api.dataSpace.runtime.query({
      formKey: 'FORM-1',
      model: payrollModel(),
      pageIndex: 1,
      pageSize: 20,
    })

    expect(http.requestConfig).toMatchObject({
      url: '/api/DataOperation/GetData',
      method: 'POST',
      headers: { 'x-FormKey': 'FORM-1' },
      data: {
        Table: [expect.objectContaining({
          Name: 'PayrollSalary',
          Type: '数据库表',
          PrimaryKeyFields: 'rowid',
        })],
        PageParam: { index: 1, size: 20 },
      },
    })
    expect(snapshot).toMatchObject({
      formKey: 'FORM-1',
      dataSpaceId: 'DATA-SPACE-1',
      modelId: 'MODEL-1',
      total: 1,
      allowAdd: true,
      systemKey: 'TABLE-KEY',
      rows: [{
        rowid: 'ROW-1',
        lingma_sys_key: 'ROW-KEY',
        lingma_sys_params: {
          r: ['employee'],
          e: ['salary'],
          h: ['secret'],
          m: ['bankAccount'],
          d: true,
        },
      }],
    })
    expect(snapshot.originalRows[0]).toMatchObject({ rowid: 'ROW-1', lingma_sys_key: 'ROW-KEY' })
  })

  it('fails closed when a row has no backend permission result', async () => {
    const http = new DataSpaceFixtureHttpClient()
    http.result = {
      data: { Items: [{ rowid: 'ROW-1' }], Count: 1 },
      allowAdd: false,
    }
    const api = new LowcodeApi({ http })

    await expect(api.dataSpace.runtime.query({ formKey: 'FORM-1', model: payrollModel() }))
      .rejects.toThrow('运行数据行缺少后端权限')
  })

  it('rejects duplicate frontend field identities', () => {
    expect(() => new DataSpaceFrontendModel({
      ...payrollModel().snapshot(),
      fields: [
        { fieldId: 'FIELD-1', resourceField: 'rowid' },
        { fieldId: 'FIELD-1', resourceField: 'salary' },
      ],
    })).toThrow('fieldId 不能重复')
  })

  it('prepares a bounded CRUD command from the permission preimage', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = new LowcodeApi({ http })
    const model = payrollModel()
    const preimage = await api.dataSpace.runtime.query({ formKey: 'FORM-1', model })

    const command = api.dataSpace.runtime.prepareMutation({
      formKey: 'FORM-1',
      model,
      preimage,
      idempotencyKey: 'SAVE-1',
      changes: {
        added: [{ rowid: 'ROW-2', salary: 200 }],
        changed: [{ primaryKey: 'ROW-1', values: { salary: 120 } }],
        deleted: [{ primaryKey: 'ROW-1' }],
      },
    })

    expect(command).toMatchObject({
      kind: 'data-space-runtime-mutation',
      formKey: 'FORM-1',
      dataSpaceId: 'DATA-SPACE-1',
      modelId: 'MODEL-1',
      idempotencyKey: 'SAVE-1',
      added: [{ rowid: 'ROW-2', salary: 200, lingma_sys_key: 'TABLE-KEY' }],
      changed: [{ rowid: 'ROW-1', salary: 120, lingma_sys_key: 'ROW-KEY' }],
      deleted: [{ rowid: 'ROW-1', lingma_sys_key: 'ROW-KEY' }],
      risk: 'medium',
      journal: { required: true },
      readback: {
        required: true,
        formKey: 'FORM-1',
        dataSpaceId: 'DATA-SPACE-1',
        modelId: 'MODEL-1',
      },
      compensation: { kind: 'restore-data-space-runtime-snapshot' },
    })
  })

  it('rejects mutation outside the frontend model or backend final permission', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = new LowcodeApi({ http })
    const model = payrollModel()
    const preimage = await api.dataSpace.runtime.query({ formKey: 'FORM-1', model })

    expect(() => api.dataSpace.runtime.prepareMutation({
      formKey: 'FORM-1',
      model,
      preimage,
      idempotencyKey: 'SAVE-2',
      changes: { changed: [{ primaryKey: 'ROW-1', values: { secret: 'x' } }] },
    })).toThrow('字段 secret 不属于前端模型')

    expect(() => api.dataSpace.runtime.prepareMutation({
      formKey: 'FORM-1',
      model,
      preimage,
      idempotencyKey: 'SAVE-3',
      changes: { changed: [{ primaryKey: 'ROW-1', values: { rowid: 'ROW-2' } }] },
    })).toThrow('主键 rowid 只能通过 primaryKey 定位')
  })
})
