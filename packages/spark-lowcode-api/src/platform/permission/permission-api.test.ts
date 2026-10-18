import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../lowcode-api.js'
import { PERMISSION_DESIGN_FORM_KEY } from './permission-wire.js'

type GrantTypeFixture = Readonly<{ label: string; input: unknown }>

class PermissionFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []
  public grantRows: readonly Record<string, unknown>[] = [{
    rowid: 'GRANT-1', pageID: 'FORM-1', functionoption: 'TAG-EDIT', granttype: 0,
    QID: 'SUBJECT-1', masterId: 'ORG-1', status: 1,
  }]
  public allowAdd = true

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url === '/api/Function/GetFormUserFunction') {
      return this.response({ childFun: ['TAG-EDIT'], allowAdd: { 'payroll@Salary': this.allowAdd } })
    }
    const table = ((config.data as { Table: Array<{ Name: string }> }).Table[0]?.Name) ?? ''
    const rows: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
      _Base_FunctionNode: [{ rowid: 'TAG-EDIT', prowid: 'FORM-1', Nodetext: '修改工资', FunCode: 'salary.edit', ordidx: 1 }],
      Base_FunctionDetail: [{
        rowid: 'POLICY-1', FunId: 'TAG-EDIT', ConName: 'Salary', DbName: 'payroll',
        AllowShowFields: 'name,salary', AllowEditFields: 'salary', DesensitizationFields: 'idCard',
      }],
      FunctionNodeAuth: this.grantRows,
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
        rawGrantType: 0,
        subjectIds: ['SUBJECT-1'],
        organizationScope: { kind: 'fixed-organization', organizationId: 'ORG-1' },
      }],
    })
    expect(design.grants).toEqual([{
      grantId: 'GRANT-1', pageId: 'FORM-1', featureTagIds: ['TAG-EDIT'],
      subjectIds: ['SUBJECT-1'], organizationScope: { kind: 'fixed-organization', organizationId: 'ORG-1' },
      businessId: '', enabled: true, rawGrantType: 0,
    }])
    expect(design.diagnostics).toEqual([])
    expect(runtime).toEqual({
      formKey: 'FORM-1',
      authorizedFeatureTags: ['TAG-EDIT'],
      allowAddByResource: { 'payroll@Salary': true },
    })
    expect(http.requests.filter((request) => request.url === '/api/DataOperation/GetData')
      .every((request) => request.headers?.['x-FormKey'] === PERMISSION_DESIGN_FORM_KEY)).toBe(true)
    expect(http.requests.at(-1)?.headers?.['x-FormKey']).toBe('FORM-1')
  })

  it.each([
    { input: 0, expected: 0 }, { input: 1, expected: 1 }, { input: 2, expected: 2 },
    { input: '0', expected: 0 }, { input: '1', expected: 1 }, { input: '2', expected: 2 },
    { input: ' 0 ', expected: 0 },
  ])('preserves a valid backend grant code $input without diagnostics', async ({ input, expected }) => {
    const http = new PermissionFixtureHttpClient()
    http.grantRows = [{ rowid: 'GRANT-1', pageID: 'FORM-1', granttype: input }]
    const design = await new LowcodeApi({ http }).permission.design.read('FORM-1')
    expect(design.grants[0]?.rawGrantType).toBe(expected)
    expect(design.diagnostics).toEqual([])
  })

  it.each<GrantTypeFixture>([
    { label: 'missing', input: undefined }, { label: 'null', input: null },
    { label: 'empty text', input: '' }, { label: 'blank text', input: ' \t ' },
    { label: 'false', input: false }, { label: 'true', input: true },
    { label: 'empty array', input: [] }, { label: 'numeric array', input: [0] },
    { label: 'object', input: {} }, { label: 'numeric object', input: { valueOf: (): number => 0 } },
    { label: 'NaN', input: NaN }, { label: 'infinity', input: Infinity },
    { label: 'negative infinity', input: -Infinity }, { label: 'invalid text', input: 'invalid' },
    { label: 'infinity text', input: 'Infinity' },
  ])('retains and diagnoses $label granttype instead of manufacturing code zero', async ({ input }) => {
    const http = new PermissionFixtureHttpClient()
    http.grantRows = [{ rowid: 'GRANT-1', pageID: 'FORM-1', granttype: input, QID: 'SUBJECT-1' }]
    const design = await new LowcodeApi({ http }).permission.design.read('FORM-1')
    expect(design.grants).toHaveLength(1)
    expect(design.grants[0]).toMatchObject({ grantId: 'GRANT-1', rawGrantType: null, subjectIds: ['SUBJECT-1'] })
    expect(design.diagnostics).toEqual(['授权 GRANT-1 的 granttype 无法解析'])
  })

  it.each([
    { input: 9, expected: 9 }, { input: '9', expected: 9 }, { input: -1, expected: -1 },
    { input: 0.5, expected: 0.5 }, { input: Number.MAX_VALUE, expected: Number.MAX_VALUE },
  ])('retains an unknown finite grant code $input with a diagnostic', async ({ input, expected }) => {
    const http = new PermissionFixtureHttpClient()
    http.grantRows = [{ rowid: 'GRANT-1', pageID: 'FORM-1', granttype: input }]
    const design = await new LowcodeApi({ http }).permission.design.read('FORM-1')
    expect(design.grants[0]).toMatchObject({ grantId: 'GRANT-1', rawGrantType: expected })
    expect(design.diagnostics).toEqual(['授权 GRANT-1 的 granttype 无法解析'])
  })

  it('keeps every grant and associates diagnostics with the offending records', async () => {
    const http = new PermissionFixtureHttpClient()
    http.grantRows = [
      { rowid: 'VALID', pageID: 'FORM-1', granttype: 0 },
      { rowid: 'UNKNOWN', pageID: 'FORM-1', granttype: 9 },
      { rowid: 'MISSING', pageID: 'FORM-1' },
    ]
    const design = await new LowcodeApi({ http }).permission.design.read('FORM-1')
    expect(design.grants.map(grant => [grant.grantId, grant.rawGrantType])).toEqual([
      ['VALID', 0], ['UNKNOWN', 9], ['MISSING', null],
    ])
    expect(design.diagnostics).toEqual([
      '授权 UNKNOWN 的 granttype 无法解析', '授权 MISSING 的 granttype 无法解析',
    ])
  })

  it.each([
    { label: 'fixed organization', fields: { masterId: 'ORG-1' }, expected: { kind: 'fixed-organization', organizationId: 'ORG-1' } },
    { label: 'business field', fields: { mastervaluefield: 'departmentId' }, expected: { kind: 'business-field-organization', field: 'departmentId' } },
    { label: 'unscoped', fields: {}, expected: { kind: 'unscoped' } },
    { label: 'fixed organization precedence', fields: { masterId: 'ORG-1', mastervaluefield: 'departmentId' }, expected: { kind: 'fixed-organization', organizationId: 'ORG-1' } },
  ])('preserves $label and the grant facts', async ({ fields, expected }) => {
    const http = new PermissionFixtureHttpClient()
    http.grantRows = [{
      rowid: 'GRANT-1', pageID: 'FORM-1', granttype: 1, functionoption: 'TAG-EDIT,TAG-VIEW',
      QID: ['SUBJECT-1', 'SUBJECT-2'], businessId: 'BUSINESS-1', status: 0, ...fields,
    }]
    const design = await new LowcodeApi({ http }).permission.design.read('FORM-1')
    expect(design.grants).toEqual([{
      grantId: 'GRANT-1', pageId: 'FORM-1', rawGrantType: 1, featureTagIds: ['TAG-EDIT', 'TAG-VIEW'],
      subjectIds: ['SUBJECT-1', 'SUBJECT-2'], businessId: 'BUSINESS-1', enabled: false,
      organizationScope: expected,
    }])
  })

  it('does not turn design grant facts into runtime permission', async () => {
    const http = new PermissionFixtureHttpClient()
    http.allowAdd = false
    const api = new LowcodeApi({ http })
    const before = await api.permission.runtime.read('FORM-1')
    http.grantRows = [
      { rowid: 'FIRST', pageID: 'FORM-1', granttype: 0, status: 1 },
      { rowid: 'SECOND', pageID: 'FORM-1', granttype: 2, status: 1 },
      { rowid: 'THIRD', pageID: 'FORM-1', granttype: 9, status: 1 },
    ]
    await api.permission.design.read('FORM-1')
    const after = await api.permission.runtime.read('FORM-1')
    expect(before).toEqual({
      formKey: 'FORM-1', authorizedFeatureTags: ['TAG-EDIT'], allowAddByResource: { 'payroll@Salary': false },
    })
    expect(after).toEqual(before)
  })

  it('prepares a high-risk permission command with preimage and compensation metadata', async () => {
    const http = new PermissionFixtureHttpClient()
    const api = new LowcodeApi({ http })
    const preimage = await api.permission.design.read('FORM-1')
    const requestCount = http.requests.length

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
    expect(command.preimage).toBe(preimage)
    expect(command.compensation.preimage).toBe(preimage)
    expect(command.change).toEqual({ reason: '撤销过期授权' })
    expect(http.requests).toHaveLength(requestCount)
    expect(http.requests.every(request => request.url === '/api/DataOperation/GetData')).toBe(true)
  })

  it('prepares grant updates with the same facts and preimage without sending a write', async () => {
    const http = new PermissionFixtureHttpClient()
    const api = new LowcodeApi({ http })
    const preimage = await api.permission.design.read('FORM-1')
    const grant = preimage.grants[0]
    if (!grant) throw new Error('fixture grant missing')
    const change = { ...grant, subjectIds: ['SUBJECT-2'], rawGrantType: 9 }
    const requestCount = http.requests.length
    const command = api.permission.design.prepareMutation({
      capability: 'upsert-object-grant', formKey: 'FORM-1', idempotencyKey: 'UPDATE-1', preimage, change,
    })
    expect(command).toMatchObject({
      kind: 'permission-design-mutation', capability: 'upsert-object-grant', targetId: 'GRANT-1',
      formKey: 'FORM-1', idempotencyKey: 'UPDATE-1', risk: 'high',
      journal: { required: true }, readback: { required: true, formKey: 'FORM-1' },
    })
    expect(command.change).toBe(change)
    expect(command.preimage).toBe(preimage)
    expect(command.compensation.preimage).toBe(preimage)
    expect(http.requests).toHaveLength(requestCount)
  })

  it.each([
    { formKey: 'OTHER-FORM', targetId: 'GRANT-1', error: 'FormKey 不一致' },
    { formKey: 'FORM-1', targetId: 'UNKNOWN-GRANT', error: '对象授权不存在' },
  ])('rejects a command with $formKey / $targetId without sending a write', async ({ formKey, targetId, error }) => {
    const http = new PermissionFixtureHttpClient()
    const api = new LowcodeApi({ http })
    const preimage = await api.permission.design.read('FORM-1')
    const requestCount = http.requests.length
    expect(() => api.permission.design.prepareMutation({
      capability: 'remove-object-grant', formKey, targetId, idempotencyKey: 'REMOVE-1', preimage,
      change: { reason: '撤销过期授权' },
    })).toThrow(error)
    expect(http.requests).toHaveLength(requestCount)
  })
})
