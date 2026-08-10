import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../lowcode-api.js'
import { PERMISSION_DESIGN_FORM_KEY } from './permission-wire.js'

class PermissionFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url === '/api/Function/GetFormUserFunction') {
      return this.response({ childFun: ['TAG-EDIT'], allowAdd: { 'payroll@Salary': true } })
    }
    const table = ((config.data as { Table: Array<{ Name: string }> }).Table[0]?.Name) ?? ''
    const rows: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
      _Base_FunctionNode: [{ rowid: 'TAG-EDIT', prowid: 'FORM-1', Nodetext: '修改工资', FunCode: 'salary.edit', ordidx: 1 }],
      Base_FunctionDetail: [{
        rowid: 'POLICY-1', FunId: 'TAG-EDIT', ConName: 'Salary', DbName: 'payroll',
        AllowShowFields: 'name,salary', AllowEditFields: 'salary', DesensitizationFields: 'idCard',
      }],
      FunctionNodeAuth: [{
        rowid: 'GRANT-1', pageID: 'FORM-1', functionoption: 'TAG-EDIT', granttype: 0,
        QID: 'ROLE-1', masterId: 'ORG-1', status: 1,
      }],
    }
    return this.response({ data: { Items: rows[table] ?? [] } })
  }

  private response(result: unknown): HttpResponse<unknown> {
    return { data: { Code: 200, Result: result }, status: 200, statusText: 'OK', headers: {} }
  }
}

describe('PermissionApi', () => {
  it('keeps design grants separate from the backend runtime decision', async () => {
    const http = new PermissionFixtureHttpClient()
    const api = new LowcodeApi({ http })

    const design = await api.permission.design.read('FORM-1')
    const runtime = await api.permission.runtime.read('FORM-1')

    expect(design).toMatchObject({
      formKey: 'FORM-1',
      featureTags: [{ tagId: 'TAG-EDIT', title: '修改工资', code: 'salary.edit' }],
      dataObjectPolicies: [{ policyId: 'POLICY-1', editableFields: ['salary'] }],
      grants: [{
        grantId: 'GRANT-1',
        subjectKind: 'role',
        subjectIds: ['ROLE-1'],
        organizationScope: { kind: 'fixed-organization', organizationId: 'ORG-1' },
      }],
    })
    expect(runtime).toEqual({
      formKey: 'FORM-1',
      authorizedFeatureTags: ['TAG-EDIT'],
      allowAddByResource: { 'payroll@Salary': true },
    })
    expect(http.requests.filter((request) => request.url === '/api/DataOperation/GetData')
      .every((request) => request.headers?.['x-FormKey'] === PERMISSION_DESIGN_FORM_KEY)).toBe(true)
    expect(http.requests.at(-1)?.headers?.['x-FormKey']).toBe('FORM-1')
  })

  it('prepares a high-risk permission command with preimage and compensation metadata', async () => {
    const http = new PermissionFixtureHttpClient()
    const api = new LowcodeApi({ http })
    const preimage = await api.permission.design.read('FORM-1')

    const command = api.permission.design.prepareMutation({
      capability: 'remove-object-grant',
      formKey: 'FORM-1',
      targetId: 'GRANT-1',
      idempotencyKey: 'PERMISSION-1',
      preimage,
      change: { reason: '撤销过期授权' },
    })

    expect(command).toMatchObject({
      kind: 'permission-design-mutation',
      formKey: 'FORM-1',
      targetId: 'GRANT-1',
      risk: 'high',
      journal: { required: true },
      readback: { required: true, formKey: 'FORM-1' },
      compensation: { kind: 'restore-permission-design-snapshot' },
    })
    expect(http.requests.every(request => request.url === '/api/DataOperation/GetData')).toBe(true)
  })
})
