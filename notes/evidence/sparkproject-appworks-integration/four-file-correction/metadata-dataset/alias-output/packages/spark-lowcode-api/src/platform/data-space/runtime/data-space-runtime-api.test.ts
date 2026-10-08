import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { DataViewFilter, SparkData } from '@spark-appworks/spark-data'
import type { DataView } from '@spark-appworks/spark-data'
import { describe, expect, it, vi } from 'vitest'

import { LowcodeApi } from '../../../lowcode-api.js'
import { DataSpaceFrontendModel } from '../data-space.js'
import type { DataSpaceDesignApi } from '../design/data-space-design-api.js'
import type { LowcodeSession } from '../../lowcode-platform-api.js'
import { DataSpaceQueryContext } from './query/data-space-query-context.js'
import { DataSpaceQueryTable } from './protocol/data-space-query-table.js'

class DataSpaceFixtureHttpClient extends HttpClientBase {
  public requestConfig: RequestConfig | null = null
  public queryRequests: RequestConfig[] = []
  public queryResults: unknown[] = []
  public queryGate: Promise<void> | undefined
  public queryStarted: (() => void) | undefined
  public refreshResult: unknown
  public saveRequests: RequestConfig[] = []
  public saveGate: Promise<void> | undefined
  public saveStarted: (() => void) | undefined
  public saveResult: unknown = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 120 }] }] }
  public result: unknown = {
    primaryKeyField: 'rowid',
    data: {
      Items: [{
        rowid: 'ROW-1',
        salary: 100,
        lingma_sys_key: 'ROW-KEY',
        lingma_sys_params: {
          r: ['salary'],
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
    if (config.url === '/api/DataOperation/GetData') {
      this.queryRequests.push(config)
      this.queryStarted?.()
      await this.queryGate
    }
    if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      this.saveRequests.push(config)
      this.saveStarted?.()
      await this.saveGate
    }
    return {
      data: { Code: 200, Result: config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD' ? this.saveResult
        : config.url === '/api/LoginAuthority/refresh' && this.refreshResult !== undefined
        ? this.refreshResult : config.url === '/api/DataOperation/GetData' && this.queryResults.length > 0
          ? this.queryResults.shift() : this.result },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

function activeApi(http: DataSpaceFixtureHttpClient): LowcodeApi {
  const values = new Map<string, string>()
  const api = new LowcodeApi({ http, sessionStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  } })
  api.session.save({ accessToken: 'access', refreshToken: 'refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: { userId: 'USER-1', account: 'test', displayName: 'test',
      enterpriseId: 'TENANT-1', enterpriseShortName: 'test', role: null, raw: {} },
    enterprise: { id: 'TENANT-1', name: 'test', code: 'test', shortName: 'test',
      shortCode: 'test', raw: {} },
  })
  api.application.save({ application: { id: 'APP-A', code: 'A', name: 'A', description: '',
    enterpriseId: 'TENANT-1', enterpriseShortName: 'test', isDefault: false }, navigationRootId: 'ROOT-A' })
  return api
}

function payrollModel(): DataSpaceFrontendModel {
  return new DataSpaceFrontendModel({
    dataSpaceId: 'DATA-SPACE-1',
    modelId: 'MODEL-1',
    name: '薪资前端模型',
    resource: {
      resourceId: 'RESOURCE-1',
      databaseId: 'DATABASE-1',
      resourceName: 'PayrollSalary',
      resourceType: 'table',
      primaryKeyField: 'rowid',
      databaseName: 'payroll',
      fields: [{
        resourceFieldId: 'RESOURCE-FIELD-ROWID',
        name: 'rowid',
        label: '主键',
        dataType: 'string',
        dataTypeName: '字符串型',
        length: '',
        nullable: false,
        primaryKey: true,
        unique: true,
        system: false,
        defaultValue: '',
        description: '',
        order: 1,
      }, {
        resourceFieldId: 'RESOURCE-FIELD-SALARY',
        name: 'salary',
        label: '薪资',
        dataType: 'decimal',
        dataTypeName: '定点小数',
        length: '',
        nullable: true,
        primaryKey: false,
        unique: false,
        system: false,
        defaultValue: '',
        description: '',
        order: 2,
      }],
    },
    fields: [
      {
        fieldId: 'FIELD-ROWID',
        resourceFieldId: 'RESOURCE-FIELD-ROWID',
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
      }, {
        fieldId: 'FIELD-SALARY',
        resourceFieldId: 'RESOURCE-FIELD-SALARY',
        resourceField: 'salary',
        alias: '',
        fieldType: '',
        output: true,
        order: 0,
        orderType: '',
        group: 0,
        distinct: false,
        primaryKey: false,
        value: '',
        valueFunction: '',
        expression: '',
      },
    ],
    relations: [],
    query: {
      outputType: 'Table',
      filter: JSON.stringify({
        Type: 'cond',
        Field: 'status',
        Operator: 'equal',
        ValueFun: { Type: 'GetConstValue', Value: 'ACTIVE' },
      }),
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

describe('DataSpaceRuntimeApi', () => {
  it('keeps the query lifetime through real token refresh but invalidates identity and application round trips', async () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const http = new DataSpaceFixtureHttpClient()
    http.result = { token: 'new-access', refreshToken: 'new-refresh',
      expire: Date.now() + 60_000, refreshExpire: Date.now() + 120_000 }
    const api = new LowcodeApi({ http, sessionStorage: storage })
    const session: LowcodeSession = {
      accessToken: 'old-access', refreshToken: 'old-refresh',
      accessExpiresAt: 1, refreshExpiresAt: Date.now() + 120_000,
      identity: { userId: 'USER-1', account: 'test', displayName: 'test',
        enterpriseId: 'TENANT-1', enterpriseShortName: 'test', role: null, raw: {} },
      enterprise: { id: 'TENANT-1', name: 'test', code: 'test', shortName: 'test',
        shortCode: 'test', raw: {} },
    }
    api.session.save(session)
    const sessionRevision = api.session.revision
    await api.platform.refreshSession()
    expect(api.session.get()?.accessToken).toBe('new-access')
    expect(api.session.revision).toBe(sessionRevision)
    api.session.save({ ...session, identity: { ...session.identity } })
    expect(api.session.revision).toBeGreaterThan(sessionRevision)
    const replacementRevision = api.session.revision
    api.session.clear()
    api.session.save(session)
    expect(api.session.revision).toBeGreaterThan(replacementRevision)

    const application = { id: 'APP-A', code: 'A', name: 'A', description: '',
      enterpriseId: 'TENANT-1', enterpriseShortName: 'test', isDefault: false }
    api.application.save({ application, navigationRootId: 'ROOT-A' })
    const applicationRevision = api.application.revision
    api.application.save({ application: { ...application }, navigationRootId: 'ROOT-A' })
    expect(api.application.revision).toBe(applicationRevision)
    api.application.save({ application: { ...application, id: 'APP-B' }, navigationRootId: 'ROOT-B' })
    api.application.save({ application, navigationRootId: 'ROOT-A' })
    expect(api.application.revision).toBe(applicationRevision + 2)
  })
  it('queries the registered scenario model and keeps permission wire fields private', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const context = await api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: '薪资前端模型' }, {
      filter: DataViewFilter.condition({ field: 'salary', operator: 'gt', value: 0 }),
      inputParams: [{ name: 'period', value: '2026-08' }, { name: 'enabled', value: false },
        { name: 'offset', value: 0 }, { name: 'keyword', value: '' }],
      sort: [{ field: 'salary', direction: 'desc' }],
      fields: ['rowid', 'salary'],
      page: { index: 1, size: 20 },
    })
    expect(http.requestConfig).toMatchObject({
      url: '/api/DataOperation/GetData', method: 'POST', retry: 0, cache: false,
      headers: { 'x-FormKey': 'FORM-1', Authorization: 'Bearer access',
        'tenant-id': 'test', 'visit-tenant-id': 'test', 'x-FirstFolder': 'test', 'X-AppId': 'APP-A' },
      data: {
        Table: [expect.objectContaining({ Name: '薪资前端模型',
          Filter: expect.objectContaining({ Field: 'salary' }),
          inputParams: [{ Name: 'period', Value: '2026-08' }, { Name: 'enabled', Value: false },
            { Name: 'offset', Value: 0 }, { Name: 'keyword', Value: '' }],
          Fields: expect.arrayContaining([expect.objectContaining({ Name: 'salary', OrderType: 'descending' })]),
        })], PageParam: { index: 1, size: 20 },
      },
    })
    const data = http.requestConfig?.data
    expect(JSON.stringify(data)).not.toMatch(/MetaName|PayrollSalary|PrimaryKeyFields|DbName/)
    expect(context.rows).toEqual([{ rowid: 'ROW-1', salary: 100 }])
    expect(context.total).toBe(1)
    expect(context.countReported).toBe(true)
    expect(context.addActionState()).toBe('enabled')
    expect(context.fieldAccess('ROW-1', 'salary')).toMatchObject({ write: 'allowed', required: true })
    expect(context.fieldAccess('ROW-1', 'secret')).toMatchObject({ read: 'invisible', write: 'denied' })
    expect(context.fieldAccess('ROW-1', 'bankAccount')).toMatchObject({ read: 'masked', write: 'denied' })
    expect(context).not.toHaveProperty('originalRows')
    expect(context).not.toHaveProperty('systemKey')
    expect(() => context.assertIdentity({ scenarioId: 'OTHER', metaName: '薪资前端模型' })).toThrow('SPARK_QUERY_CONTEXT_IDENTITY')
  })

  it('reads keyless query row visibility from the original runtime result row', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const wirePermissions = { e: ['name'], h: ['hidden'], m: ['masked'], d: true }
    http.result = { primaryKeyField: null, allowAdd: true,
      data: { Items: [{ rowid: 'BUSINESS-ID', name: 'Visible', masked: 'Masked', hidden: 'Hidden',
        lingma_sys_params: wirePermissions }], Count: 1 } }
    const api = activeApi(http)
    const context = await api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: 'KeylessPicker' })
    const row = context.rows[0]
    if (!row) throw new Error('keyless fixture row missing')
    wirePermissions.h.push('name')
    expect(row).toEqual({ rowid: 'BUSINESS-ID', name: 'Visible', masked: 'Masked', hidden: 'Hidden' })
    expect(context.rowKey(row)).toBeUndefined()
    expect(context.fieldAccess('BUSINESS-ID', 'name').write).toBe('denied')
    expect(context.editActionState('BUSINESS-ID')).toBe('hidden')
    expect(context.deleteActionState('BUSINESS-ID')).toBe('hidden')
    expect(context.viewActionState('BUSINESS-ID')).toBe('disabled')
    expect(context.readFieldAccess(row, 'name')).toBe('visible')
    expect(context.readFieldAccess(row, 'masked')).toBe('masked')
    expect(context.readFieldAccess(row, 'hidden')).toBe('invisible')
    expect(context.readFieldAccess({ ...row }, 'name')).toBe('invisible')
    expect(() => context.prepareNewRow({ name: 'New' })).toThrow('SPARK_NEW_ROW_KEY')
    expect(() => context.prepareSaveChanges({ changed: [{ ...row, name: 'Changed' }] }))
      .toThrow('SPARK 保存缺少正式主键查询基线')
    expect(() => context.prepareSaveChanges({ deleted: [row] })).toThrow('SPARK 保存缺少正式主键查询基线')
    await expect(api.dataSpace.runtime.save({ changes: [{ identity: { scenarioId: 'FORM-1', metaName: 'KeylessPicker' },
      context, changes: { changed: [{ ...row, name: 'Changed' }] } }] }))
      .rejects.toThrow('SPARK 保存缺少正式主键查询基线')
    expect(http.queryRequests).toHaveLength(1)
    expect(http.saveRequests).toHaveLength(0)

    context.bindFormalModel({ id: 'MODEL', metaName: 'KeylessPicker', name: 'KeylessPicker', sourceName: 'dictionary',
      sourceId: '', sourceType: '字典', primaryKey: '', businessMain: false, raw: {}, fields: [
        { id: 'FIELD', modelId: 'MODEL', name: 'name', canonicalName: 'name', type: 'string', primaryKey: false,
          description: '', output: true, computed: false, order: 0, orderType: '', raw: {} },
      ] })
    expect(context.rowKey(row)).toBeUndefined()
    expect(context.allowAdd).toBe(false)
    expect(context.addActionState()).toBe('hidden')
    expect(context.readFieldAccess(row, 'name')).toBe('visible')
    expect(() => context.prepareSaveChanges({ added: [{ name: 'New' }] })).toThrow('SPARK_MODEL_KEYLESS_READONLY')
    expect(() => context.buildSaveRequest({ added: [{ name: 'New' }] })).toThrow('SPARK_MODEL_KEYLESS_READONLY')
    expect(() => context.buildSaveRequest({ changed: [{ ...row, name: 'New' }] })).toThrow('SPARK_MODEL_KEYLESS_READONLY')
    expect(() => context.buildSaveRequest({ deleted: [row] })).toThrow('SPARK_MODEL_KEYLESS_READONLY')

    const foreignHttp = new DataSpaceFixtureHttpClient()
    foreignHttp.result = { primaryKeyField: null, allowAdd: true,
      data: { Items: [{ rowid: 'BUSINESS-ID', name: 'Visible', lingma_sys_params: { e: ['name'] } }], Count: 1 } }
    const foreign = await activeApi(foreignHttp).dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: 'KeylessPicker' })
    const foreignRow = foreign.rows[0]
    if (!foreignRow) throw new Error('foreign keyless fixture row missing')
    expect(context.readFieldAccess(foreignRow, 'name')).toBe('invisible')

    const application = api.application.get()
    if (!application) throw new Error('fixture application missing')
    api.application.save({ ...application, application: { ...application.application, id: 'APP-B' } })
    expect(() => context.readFieldAccess(row, 'name')).toThrow('SPARK_QUERY_CONTEXT_STALE')
    expect(http.queryRequests).toHaveLength(1)
    expect(http.saveRequests).toHaveLength(0)
  })

  it.each([
    ['deny', 'invisible'],
    ['visible-readonly', 'visible'],
  ] as const)('uses the explicit %s missing-auth policy for keyless row reads', (policy, expected) => {
    const identity = { scenarioId: 'FORM-1', metaName: 'KeylessPicker' }
    const snapshot = new DataSpaceQueryTable(identity).applyResult({ primaryKeyField: null,
      data: { Items: [{ rowid: 'BUSINESS-ID', name: 'No permission payload' }], Count: 1 }, allowAdd: false })
    const context = new DataSpaceQueryContext({ identity, snapshot, scope: 'scope', readScope: () => 'scope',
      missingAuthPolicy: policy })
    const row = context.rows[0]
    if (!row) throw new Error('missing-auth fixture row missing')

    expect(context.readFieldAccess(row, 'name')).toBe(expected)
  })

  it('uses the selected application ID in request headers after switching applications', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const context = api.application.get()
    if (!context) throw new Error('fixture application missing')
    await api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: '薪资前端模型' })
    expect(http.requestConfig?.headers?.['X-AppId']).toBe('APP-A')
    api.application.save({ ...context, application: { ...context.application, id: 'APP-B', code: 'CODE-B' } })
    await api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: '薪资前端模型' })
    expect(http.requestConfig?.headers?.['X-AppId']).toBe('APP-B')
    expect(http.requestConfig?.data).not.toHaveProperty('applicationId')
    expect(http.requestConfig?.data).not.toHaveProperty('tenantId')
    http.result = '{}'
    await api.design.readTextFile({ appType: 'designfile', customPath: 'SysForm/FORM-1', fileName: 'pagedata.json' })
    expect(http.requestConfig?.headers).toMatchObject(api.readRequestScope().headers)
    expect(http.requestConfig?.headers?.['Authorization']).toBe('Bearer access')
  })

  it('uses original SPARK missing-auth semantics only for registered returned rows', async () => {
    const http = new DataSpaceFixtureHttpClient()
    http.result = {
      primaryKeyField: 'rowid', data: { Items: [{ rowid: 'ROW-1' }], Count: 1 },
      allowAdd: false,
    }
    const api = activeApi(http)

    const context = await api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: '薪资前端模型' })
    expect(context.fieldAccess('ROW-1', 'name').write).toBe('allowed')
    expect(context.fieldAccess('UNKNOWN', 'name').write).toBe('denied')
    expect(context.addActionState()).toBe('hidden')
  })

  it('collects every page through the root request owner before publishing a context', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    http.queryResults = [1, 2].map(index => ({ primaryKeyField: 'rowid', allowAdd: false,
      data: { Items: [{ rowid: `ROW-${index}`, salary: index,
        lingma_sys_params: { e: ['salary'] } }], Count: 2 } }))
    const context = await api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: 'Payroll' },
      { allPages: true, page: { index: 1, size: 1 } })
    expect(context.rows.map(row => row['rowid'])).toEqual(['ROW-1', 'ROW-2'])
    expect(context.total).toBe(2)
    expect(http.queryRequests.map(request => request.data)).toEqual([
      expect.objectContaining({ PageParam: { index: 1, size: 1 } }),
      expect.objectContaining({ PageParam: { index: 2, size: 1 } }),
    ])
    expect(http.queryRequests.every(request => request.headers?.['X-AppId'] === 'APP-A'
      && request.headers?.['x-FormKey'] === 'FORM-1')).toBe(true)
    expect(context.fieldAccess('ROW-2', 'salary').write).toBe('allowed')
    http.queryResults = [{ data: { Items: [{ rowid: 'ROW-1' }], Count: 2 }, allowAdd: false },
      { data: { Items: [] }, allowAdd: false }]
    await expect(api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: 'Payroll' },
      { allPages: true, page: { index: 1, size: 1 } })).rejects.toThrow('分页缺少后端总数')
    expect(context.rows).toHaveLength(2)
  })

  it('merges equal flights while keeping scenario and model identities separate', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const identity = { scenarioId: 'FORM-1', metaName: 'Payroll' }
    const [first, same, otherScenario, otherModel] = await Promise.all([
      api.dataSpace.runtime.query(identity), api.dataSpace.runtime.query(identity),
      api.dataSpace.runtime.query({ ...identity, scenarioId: 'FORM-2' }),
      api.dataSpace.runtime.query({ ...identity, metaName: 'Orders' }),
    ])
    expect(first).toBe(same)
    expect(first).not.toBe(otherScenario)
    expect(first).not.toBe(otherModel)
    expect(http.queryRequests).toHaveLength(3)
    await api.dataSpace.runtime.query(identity)
    expect(http.queryRequests).toHaveLength(4)
  })

  it('invalidates retained results and permissions after the selected application changes', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const identity = { scenarioId: 'FORM-1', metaName: 'Payroll' }
    const context = await api.dataSpace.runtime.query(identity)
    const application = api.application.get()
    if (!application) throw new Error('fixture application missing')
    api.application.save({ ...application, application: { ...application.application, id: 'APP-B' } })
    expect(() => context.rows).toThrow('SPARK_QUERY_CONTEXT_STALE')
    expect(() => context.fieldAccess('ROW-1', 'salary')).toThrow('SPARK_QUERY_CONTEXT_STALE')
    const next = await api.dataSpace.runtime.query(identity)
    expect(next.rows).toHaveLength(1)
    expect(http.requestConfig?.headers?.['X-AppId']).toBe('APP-B')
  })

  it('rejects duplicate frontend field identities', () => {
    const snapshot = payrollModel().snapshot()
    const rowidField = snapshot.fields[0]
    const salaryField = snapshot.fields[1]
    if (rowidField === undefined || salaryField === undefined) throw new Error('测试模型字段缺失')
    expect(() => new DataSpaceFrontendModel({
      ...snapshot,
      fields: [
        { ...rowidField, fieldId: 'FIELD-1' },
        { ...salaryField, fieldId: 'FIELD-1' },
      ],
    })).toThrow('fieldId 不能重复')
  })

  it('requires a real session and explicit application before a runtime query', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    api.application.clear()
    await expect(api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: '薪资前端模型' }))
      .rejects.toThrow('明确选中应用')
    api.session.clear()
    await expect(api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: '薪资前端模型' }))
      .rejects.toThrow('有效登录身份')
    expect(http.requestConfig).toBeNull()
  })

  it('allows automatic token refresh through the actual HTTP interceptor', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const session = api.session.get()
    if (!session) throw new Error('fixture session missing')
    api.session.save({ ...session, accessExpiresAt: 1 })
    const revision = api.session.revision
    http.refreshResult = { token: 'renewed-access', refreshToken: 'renewed-refresh',
      expire: Date.now() + 60_000, refreshExpire: Date.now() + 120_000 }
    await expect(api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: '薪资前端模型' })).resolves.toMatchObject({ total: 1 })
    expect(api.session.revision).toBe(revision)
    expect(http.requestConfig?.headers?.['Authorization']).toBe('Bearer renewed-access')
  })

  it.each(['application', 'identity', 'logout'])('rejects a late result after %s changes and allows a fresh query', async change => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const session = api.session.get()
    const application = api.application.get()
    if (!session || !application) throw new Error('fixture identity missing')
    let release: (() => void) | undefined
    http.queryGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.queryStarted = resolve })
    const pending = api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: '薪资前端模型' })
    const rejected = expect(pending).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    await started
    if (change === 'application') {
      api.application.save({ ...application, application: { ...application.application, id: 'APP-B' } })
      api.application.save(application)
    } else if (change === 'identity') {
      api.session.save({ ...session, identity: { ...session.identity } })
    } else {
      api.session.clear()
      api.session.save(session)
    }
    release?.()
    await rejected
    http.queryGate = undefined
    await expect(api.dataSpace.runtime.query({ scenarioId: 'FORM-1', metaName: '薪资前端模型' })).resolves.toMatchObject({ total: 1 })
  })
})


describe('DataSpace runtime save owner', () => {
  const identity = { scenarioId: 'FORM-1', metaName: 'Payroll' }

  it('saves owned query contexts once and registers the actual successor baseline', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const context = await api.dataSpace.runtime.query(identity)
    const accepted = await api.dataSpace.runtime.save({ changes: [{ identity, context,
      changes: { changed: [{ rowid: 'ROW-1', salary: 120, _pk: 'local' }] } }] })
    expect(http.saveRequests).toHaveLength(1)
    expect(http.saveRequests[0]).toMatchObject({ headers: { 'X-AppId': 'APP-A', 'x-FormKey': 'FORM-1' },
      data: [{ TableName: 'Payroll', CrudModel: { Added: [], Deleted: [],
        Changed: [{ rowid: 'ROW-1', salary: 120, lingma_sys_key: 'ROW-KEY' }] } }] })
    expect(accepted[0]?.context.rows).toEqual([{ rowid: 'ROW-1', salary: 120 }])
    expect(context.rows).toEqual([{ rowid: 'ROW-1', salary: 100 }])
    const successor = accepted[0]?.context
    if (!successor) throw new Error('missing successor')
    http.saveResult = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 130 }] }] }
    await expect(api.dataSpace.runtime.save({ changes: [{ identity, context: successor,
      changes: { changed: [{ rowid: 'ROW-1', salary: 130 }] } }] })).resolves.toHaveLength(1)
  })

  it('rejects a context issued by a different runtime owner before writing', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const other = activeApi(new DataSpaceFixtureHttpClient())
    const context = await other.dataSpace.runtime.query(identity)
    await expect(api.dataSpace.runtime.save({ changes: [{ identity, context,
      changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] })).rejects.toThrow('OWNER')
    expect(http.saveRequests).toHaveLength(0)
  })

  it('does not reuse an already submitted baseline but leaves its read data intact', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const context = await api.dataSpace.runtime.query(identity)
    const command = { changes: [{ identity, context, changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] }
    await api.dataSpace.runtime.save(command)
    await expect(api.dataSpace.runtime.save(command)).rejects.toThrow('OWNER')
    expect(context.rows[0]?.['salary']).toBe(100)
    expect(http.saveRequests).toHaveLength(1)
  })

  it('serializes overlapping models and captures queued caller values before waiting', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const firstContext = await api.dataSpace.runtime.query(identity)
    const secondContext = await api.dataSpace.runtime.query(identity)
    let release: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.saveStarted = resolve })
    const first = api.dataSpace.runtime.save({ changes: [{ identity, context: firstContext,
      changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] })
    await started
    const row = { rowid: 'ROW-1', salary: 150 }
    const second = api.dataSpace.runtime.save({ changes: [{ identity, context: secondContext, changes: { changed: [row] } }] })
    row.salary = 999
    expect(http.saveRequests).toHaveLength(1)
    release?.()
    await Promise.all([first, second])
    expect(http.saveRequests).toHaveLength(2)
    expect(http.saveRequests[1]?.data).toMatchObject([{ CrudModel: { Changed: [{ salary: 150 }] } }])
  })

  it('waits for a pending model query before sending its save', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const context = await api.dataSpace.runtime.query(identity)
    let release: (() => void) | undefined
    http.queryGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.queryStarted = resolve })
    const query = api.dataSpace.runtime.query(identity)
    await started
    const save = api.dataSpace.runtime.save({ changes: [{ identity, context,
      changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] })
    await Promise.resolve()
    expect(http.saveRequests).toHaveLength(0)
    release?.()
    await Promise.all([query, save])
    expect(http.saveRequests).toHaveLength(1)
  })

  it('waits for an in-flight save before starting a fresh model query', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const context = await api.dataSpace.runtime.query(identity)
    let release: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.saveStarted = resolve })
    const save = api.dataSpace.runtime.save({ changes: [{ identity, context,
      changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] })
    await started
    const query = api.dataSpace.runtime.query(identity)
    await Promise.resolve()
    expect(http.queryRequests).toHaveLength(1)
    release?.()
    await Promise.all([save, query])
    expect(http.queryRequests).toHaveLength(2)
  })

  it('keeps a rejected baseline available for an explicit later save', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const context = await api.dataSpace.runtime.query(identity)
    const command = { changes: [{ identity, context, changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] }
    http.saveResult = {}
    await expect(api.dataSpace.runtime.save(command)).rejects.toThrow('桶')
    http.saveResult = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 120 }] }] }
    await expect(api.dataSpace.runtime.save(command)).resolves.toHaveLength(1)
    expect(http.saveRequests).toHaveLength(2)
  })

  it('sends two owned models in one same-scenario request', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const otherIdentity = { ...identity, metaName: 'Lines' }
    const context = await api.dataSpace.runtime.query(identity)
    const otherContext = await api.dataSpace.runtime.query(otherIdentity)
    http.saveResult = { maplistedit: [{ orders: [{ rowid: 'ROW-1', salary: 120 }] },
      { lines: [{ rowid: 'ROW-1', salary: 150 }] }] }
    const receipts = await api.dataSpace.runtime.save({ changes: [
      { identity, context, changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } },
      { identity: otherIdentity, context: otherContext, changes: { changed: [{ rowid: 'ROW-1', salary: 150 }] } },
    ] })
    expect(http.saveRequests).toHaveLength(1)
    expect(receipts.map(receipt => [receipt.metaName, receipt.context.rows[0]?.['salary']]))
      .toEqual([['Payroll', 120], ['Lines', 150]])
  })

  it('allows different model saves to run independently', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const otherIdentity = { ...identity, metaName: 'Lines' }
    const context = await api.dataSpace.runtime.query(identity)
    const otherContext = await api.dataSpace.runtime.query(otherIdentity)
    let release: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.saveStarted = resolve })
    const first = api.dataSpace.runtime.save({ changes: [{ identity, context,
      changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] })
    await started
    const second = api.dataSpace.runtime.save({ changes: [{ identity: otherIdentity, context: otherContext,
      changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] })
    await vi.waitFor(() => expect(http.saveRequests).toHaveLength(2))
    release?.()
    await Promise.all([first, second])
  })

  it('cancels a queued save before transport without poisoning the model queue', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const firstContext = await api.dataSpace.runtime.query(identity)
    const context = await api.dataSpace.runtime.query(identity)
    let release: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.saveStarted = resolve })
    const first = api.dataSpace.runtime.save({ changes: [{ identity, context: firstContext,
      changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] })
    await started
    const controller = new AbortController()
    const change = { identity, context, changes: { changed: [{ rowid: 'ROW-1', salary: 150 }] } }
    const queued = api.dataSpace.runtime.save({ changes: [change], signal: controller.signal })
    const rejected = expect(queued).rejects.toThrow()
    controller.abort()
    release?.()
    await first
    await rejected
    expect(http.saveRequests).toHaveLength(1)
    await expect(api.dataSpace.runtime.save({ changes: [change] })).resolves.toHaveLength(1)
    expect(http.saveRequests).toHaveLength(2)
  })

  it('rejects a late save after an application change without publishing its successor', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const api = activeApi(http)
    const context = await api.dataSpace.runtime.query(identity)
    let release: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.saveStarted = resolve })
    const save = api.dataSpace.runtime.save({ changes: [{ identity, context,
      changes: { changed: [{ rowid: 'ROW-1', salary: 120 }] } }] })
    const rejected = expect(save).rejects.toThrow('STALE')
    await started
    const application = api.application.get()
    if (!application) throw new Error('missing application')
    api.application.save({ ...application, application: { ...application.application, id: 'APP-B' } })
    release?.()
    await rejected
    expect(http.saveRequests).toHaveLength(1)
  })
})

function connectedView(http: DataSpaceFixtureHttpClient, bind = true) {
  const api = activeApi(http)
  const ds = SparkData.createDataSet({ dataSetName: 'Payroll', scenarioId: 'FORM-1', tables: {
    Payroll: { tableName: 'Payroll', modelBinding: { modelId: 'MODEL-1', modelName: 'Payroll' },
      columns: [{ name: 'rowid', type: 'string', isPrimaryKey: true }, { name: 'salary', type: 'number' }],
      views: { default: {}, list: { page: 1, pageSize: 20, queryContext: { enabled: false, offset: 0, text: '' } } } },
  } })
  const view = ds.getView('Payroll', 'list')
  if (!view) throw new Error('fixture view missing')
  const executeQuery = vi.spyOn(api.dataSpace.runtime, 'executeQuery')
  const executor = api.dataSpace.runtime
  if (bind) view.bindQueryExecutor(executor)
  return { api, ds, view, executeQuery, executor }
}

function findRow(view: DataView, primaryKey: string | number) {
  return view.rows.find(row => row[view.primaryKey] === primaryKey) ?? null
}

function connectedScenario(http: DataSpaceFixtureHttpClient, separateOwner = false) {
  const api = activeApi(http)
  const ds = SparkData.createDataSet({ dataSetName: 'Payroll', scenarioId: 'FORM-1', tables: {
    Payroll: { tableName: 'Payroll', modelBinding: { modelId: 'MODEL-1', modelName: 'Payroll' },
      columns: [{ name: 'rowid', type: 'string', isPrimaryKey: true }, { name: 'salary', type: 'number' }],
      views: { default: {}, list: { page: 1, pageSize: 20 } } },
    Bonus: { tableName: 'Bonus', modelBinding: { modelId: 'MODEL-2', modelName: 'Bonus' },
      columns: [{ name: 'rowid', type: 'string', isPrimaryKey: true }, { name: 'salary', type: 'number' }],
      views: { default: {}, list: { page: 1, pageSize: 20 } } },
  } })
  const view = ds.getView('Payroll', 'list')
  const second = ds.getView('Bonus', 'list')
  if (!view || !second) throw new Error('fixture views missing')
  view.bindQueryExecutor(api.dataSpace.runtime)
  second.bindQueryExecutor(separateOwner ? activeApi(http).dataSpace.runtime : api.dataSpace.runtime)
  http.saveResult = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 120 }] },
    { physical: [{ rowid: 'ROW-1', salary: 220 }] }] }
  return { api, ds, view, second }
}

describe('DataSet actual SPARK batch save', () => {
  it('sends two model views once and accepts both actual baselines', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http)
    await Promise.all([view.loadFromServer(), second.loadFromServer()])
    await view.editRowById('ROW-1', { salary: 120 })
    await second.editRowById('ROW-1', { salary: 220 })
    const oldFirst = vi.spyOn(view, 'saveChanges')
    const oldSecond = vi.spyOn(second, 'saveChanges')
    await expect(ds.saveChanges()).resolves.toMatchObject({ success: true, data: { savedCount: 2 } })
    expect(http.saveRequests).toHaveLength(1)
    expect(oldFirst).not.toHaveBeenCalled()
    expect(oldSecond).not.toHaveBeenCalled()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(second.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(view.rows[0]?.['salary']).toBe(120)
    expect(second.rows[0]?.['salary']).toBe(220)
    expect(JSON.stringify(http.saveRequests[0]?.data)).not.toContain('_pk')
    ds.destroy()
  })

  it('preserves both models when the batch fails without clearing pending changes', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http)
    await Promise.all([view.loadFromServer(), second.loadFromServer()])
    await view.editRowById('ROW-1', { salary: 120 })
    await second.editRowById('ROW-1', { salary: 220 })
    http.saveResult = {}
    await expect(ds.saveChanges()).rejects.toThrow('桶')
    expect(http.saveRequests).toHaveLength(1)
    for (const target of [view, second]) {
      expect(target.dirtyTracking.isDirty('ROW-1')).toBe(true)
      expect(target.mutating).toBe(false)
      expect(target.mutatingError).not.toBeNull()
    }
    ds.destroy()
  })

  it('applies both models drafts before issuing one batch', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http)
    await Promise.all([view.loadFromServer(), second.loadFromServer()])
    view.updateEditingValue('ROW-1', 'salary', 120)
    second.updateEditingValue('ROW-1', 'salary', 220)
    await expect(ds.saveChanges()).resolves.toMatchObject({ success: true, data: { appliedEditingRows: 2, savedCount: 2 } })
    expect(http.saveRequests).toHaveLength(1)
    expect(view.hasEditingChanges()).toBe(false)
    expect(second.hasEditingChanges()).toBe(false)
    expect(http.saveRequests[0]?.data).toMatchObject([
      { TableName: 'Payroll', CrudModel: { Changed: [{ rowid: 'ROW-1', salary: 120, lingma_sys_key: 'ROW-KEY' }] } },
      { TableName: 'Bonus', CrudModel: { Changed: [{ rowid: 'ROW-1', salary: 220, lingma_sys_key: 'ROW-KEY' }] } },
    ])
    ds.destroy()
  })

  it('accepts different actions and totals in their respective models from one batch', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http)
    await Promise.all([view.loadFromServer(), second.loadFromServer()])
    await view.editRowById('ROW-1', { salary: 120 })
    await second.removeRow('ROW-1')
    http.saveResult = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 120 }] }],
      maplistdelete: [{ physical: [{ rowid: 'ROW-1' }] }] }
    await expect(ds.saveChanges()).resolves.toMatchObject({ success: true, data: { savedCount: 1, deletedCount: 1 } })
    expect(http.saveRequests).toHaveLength(1)
    expect(view.total).toBe(1)
    expect(second.total).toBe(0)
    expect(second.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(second.rows).toEqual([])
    ds.destroy()
  })

  it('requires every selected model baseline before sending any model', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http)
    await view.loadFromServer()
    await view.editRowById('ROW-1', { salary: 120 })
    await expect(second.addRow({ rowid: 'NEW', salary: 220 })).rejects.toThrow('DATA_VIEW_NEW_ROW_OWNER')
    expect(http.saveRequests).toHaveLength(0)
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(true)
    expect(second.dirtyTracking.isPendingCreate('NEW')).toBe(false)
    ds.destroy()
  })

  it('rejects independently owned model contexts even with equal request identities', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http, true)
    await Promise.all([view.loadFromServer(), second.loadFromServer()])
    await view.editRowById('ROW-1', { salary: 120 })
    await second.editRowById('ROW-1', { salary: 220 })
    await expect(ds.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_OWNER')
    expect(http.saveRequests).toHaveLength(0)
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(true)
    expect(second.dirtyTracking.isDirty('ROW-1')).toBe(true)
    ds.destroy()
  })

  it('keeps edits made in both models during the batch and saves them against the successors', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http)
    await Promise.all([view.loadFromServer(), second.loadFromServer()])
    await view.editRowById('ROW-1', { salary: 120 })
    await second.editRowById('ROW-1', { salary: 220 })
    let release: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.saveStarted = resolve })
    const save = ds.saveChanges()
    await started
    expect(view.mutating).toBe(true)
    expect(second.mutating).toBe(true)
    await view.editRowById('ROW-1', { salary: 150 })
    await second.editRowById('ROW-1', { salary: 250 })
    release?.()
    await save
    expect(view.rows[0]?.['salary']).toBe(150)
    expect(second.rows[0]?.['salary']).toBe(250)
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(true)
    expect(second.dirtyTracking.isDirty('ROW-1')).toBe(true)
    http.saveResult = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 150 }] },
      { physical: [{ rowid: 'ROW-1', salary: 250 }] }] }
    await ds.saveChanges()
    expect(http.saveRequests).toHaveLength(2)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(second.dirtyTracking.hasPendingChanges()).toBe(false)
    ds.destroy()
  })

  it('applies selected drafts before the single request and respects empty row selectors', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http)
    await Promise.all([view.loadFromServer(), second.loadFromServer()])
    view.updateEditingValue('ROW-1', 'salary', 120)
    second.updateEditingValue('ROW-1', 'salary', 220)
    http.saveResult = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 120 }] }] }
    await expect(ds.saveChanges({ views: [{ tableName: 'Payroll', viewId: 'list', ids: ['ROW-1'] },
      { tableName: 'Bonus', viewId: 'list', ids: [] }] })).resolves.toMatchObject({
        success: true, data: { appliedEditingRows: 1, savedCount: 1 } })
    expect(second.hasEditingChanges()).toBe(true)
    expect(second.rows[0]?.['salary']).toBe(100)
    expect(http.saveRequests).toHaveLength(1)
    ds.destroy()
  })

  it('omits a reverted model from the batch without requiring a spurious receipt', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http)
    await Promise.all([view.loadFromServer(), second.loadFromServer()])
    await view.editRowById('ROW-1', { salary: 120 })
    await second.editRowById('ROW-1', { salary: 220 })
    await second.editRowById('ROW-1', { salary: 100 })
    http.saveResult = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 120 }] }] }
    await expect(ds.saveChanges()).resolves.toMatchObject({ success: true, data: { savedCount: 1 } })
    expect(http.saveRequests).toHaveLength(1)
    expect(second.dirtyTracking.hasPendingChanges()).toBe(false)
    ds.destroy()
  })

  it('does not apply disabled drafts or send their model', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, second } = connectedScenario(http)
    await Promise.all([view.loadFromServer(), second.loadFromServer()])
    await view.editRowById('ROW-1', { salary: 120 })
    second.updateEditingValue('ROW-1', 'salary', 220)
    http.saveResult = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 120 }] }] }
    await expect(ds.saveChanges({ applyEditingRows: false })).resolves.toMatchObject({
      success: true, data: { appliedEditingRows: 0, savedCount: 1 } })
    expect(second.hasEditingChanges()).toBe(true)
    expect(second.rows[0]?.['salary']).toBe(100)
    expect(http.saveRequests).toHaveLength(1)
    ds.destroy()
  })

  it('rejects same-model views and a transaction requirement before applying drafts', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, executor } = connectedView(http)
    const other = ds.getView('Payroll', 'default')
    if (!other) throw new Error('fixture second view missing')
    other.bindQueryExecutor(executor)
    await Promise.all([view.loadFromServer(), other.loadFromServer()])
    view.updateEditingValue('ROW-1', 'salary', 120)
    other.updateEditingValue('ROW-1', 'salary', 220)
    await expect(ds.saveChanges()).rejects.toThrow('DATA_SET_SAVE_MODEL_CONFLICT')
    await expect(ds.saveChanges({ mode: 'transaction' })).rejects.toThrow('TRANSACTION_UNSUPPORTED')
    expect(view.hasEditingChanges()).toBe(true)
    expect(other.hasEditingChanges()).toBe(true)
    expect(http.saveRequests).toHaveLength(0)
    await expect(ds.saveChanges({ views: [{ tableName: 'Payroll', viewId: 'list' }] }))
      .resolves.toMatchObject({ success: true, data: { appliedEditingRows: 1, savedCount: 1 } })
    expect(other.getEditingPatch('ROW-1')).toEqual({ salary: 220 })
    expect(http.saveRequests).toHaveLength(1)
    ds.destroy()
  })
})

describe('DataView original query execution boundary', () => {
  it('maps equivalent repeated output fields to one formal request field', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { api, ds, view } = connectedView(http)
    const model: Awaited<ReturnType<DataSpaceDesignApi['readModel']>> = {
      id: 'MODEL-1', metaName: 'Payroll', name: 'Payroll', sourceName: 'PayrollSalary', sourceId: 'RESOURCE-1',
      sourceType: 'table', primaryKey: 'rowid', businessMain: true, raw: {}, fields: [
        { id: 'KEY', modelId: 'MODEL-1', name: 'rowid', canonicalName: 'rowid', type: 'string', primaryKey: true,
          description: '', output: true, computed: false, order: 0, orderType: '', raw: {} },
        { id: 'SALARY', modelId: 'MODEL-1', name: 'salary', canonicalName: 'salary', type: 'number', primaryKey: false,
          description: '', output: true, computed: false, order: 1, orderType: '', raw: {} },
        { id: 'SALARY-DUP', modelId: 'MODEL-1', name: 'salary', canonicalName: 'salary', type: 'number', primaryKey: false,
          description: '', output: true, computed: false, order: 1, orderType: '', raw: {} },
      ],
    }
    api.dataSpace.runtime.bindModelView(view, model)

    await view.loadFromServer({ fields: ['salary'] })

    expect(http.queryRequests[0]?.data).toMatchObject({ Table: [{ Fields: [{ Name: 'salary', AsName: 'salary' }] }] })
    ds.destroy()
  })

  it.each(['update', 'delete'])('keeps %s pending instead of using a legacy CRUD endpoint', async operation => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    const table = ds.getTable('Payroll')
    if (!table) throw new Error('fixture table missing')
    table.setApi({ update: { url: '/legacy-update', method: 'POST' }, delete: { url: '/legacy-delete', method: 'POST' } })
    await view.loadFromServer()
    expect(view.commitMode).toBe('immediate')
    const update = vi.spyOn(view.crud, 'updateRecord').mockResolvedValue({ success: true })
    const remove = vi.spyOn(view.crud, 'deleteRecord').mockResolvedValue({ success: true })
    if (operation === 'update') {
      expect(await view.editRowById('ROW-1', { salary: 120 })).toBe(true)
      expect(view.dirtyTracking.dirtyRowIds.has('ROW-1')).toBe(true)
      expect(view.rows[0]?.['salary']).toBe(120)
    } else {
      expect(await view.removeRow('ROW-1')).toBe(true)
      expect(view.dirtyTracking.isPendingDelete('ROW-1')).toBe(true)
      expect(view.dirtyTracking.getPendingDeleteSnapshot('ROW-1')).toMatchObject({ salary: 100 })
    }
    expect(update).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    ds.destroy()
  })

  it('saves through the original owner without legacy dirty execution', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    view.commitMode = 'staged'
    await view.editRowById('ROW-1', { salary: 120 })
    const execute = vi.spyOn(view.dirtyTracking, 'executeChanges').mockResolvedValue({ success: true })
    await expect(view.saveChanges()).resolves.toMatchObject({ success: true, data: { savedCount: 1 } })
    expect(execute).not.toHaveBeenCalled()
    expect(view.dirtyTracking.dirtyRowIds.has('ROW-1')).toBe(false)
    expect(view.rows[0]?.['salary']).toBe(120)
    expect(http.saveRequests).toHaveLength(1)
    ds.destroy()
  })

  it('retains new edits during a save and uses the accepted baseline for the next save', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.editRowById('ROW-1', { salary: 120 })
    let release: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.saveStarted = resolve })
    const save = view.saveChanges()
    await started
    expect(view.mutating).toBe(true)
    await view.editRowById('ROW-1', { salary: 150 })
    release?.()
    await save
    expect(view.mutating).toBe(false)
    expect(view.rows[0]?.['salary']).toBe(150)
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(true)
    http.saveResult = { maplistedit: [{ physical: [{ rowid: 'ROW-1', salary: 150 }] }] }
    await view.saveChanges()
    expect(http.saveRequests[1]?.data).toMatchObject([{ CrudModel: { Changed: [{ salary: 150 }] } }])
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(false)
    ds.destroy()
  })

  it.each([false, true])('confirms only returned fields when normalized to the original: %s', explicitlyReturned => {
    return (async () => {
      const http = new DataSpaceFixtureHttpClient()
      const { ds, view } = connectedView(http)
      await view.loadFromServer()
      await view.editRowById('ROW-1', { salary: 120 })
      http.saveResult = { maplistedit: [{ physical: [explicitlyReturned ? { salary: 100 } : {}] }] }
      await view.saveChanges()
      expect(view.rows[0]?.['salary']).toBe(explicitlyReturned ? 100 : 120)
      expect(view.dirtyTracking.isDirty('ROW-1')).toBe(!explicitlyReturned)
      ds.destroy()
    })()
  })

  it('preserves editing patches entered while the pending business row is saved', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.editRowById('ROW-1', { salary: 120 })
    let release: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.saveStarted = resolve })
    const save = view.saveChanges()
    await started
    view.updateEditingValue('ROW-1', 'salary', 150)
    release?.()
    await save
    expect(view.getEditingPatch('ROW-1')).toEqual({ salary: 150 })
    expect(view.rows[0]?.['salary']).toBe(120)
    expect(view.hasEditingChanges()).toBe(true)
    ds.destroy()
  })

  it('confirms a returned deletion without invoking a separate CRUD route', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.removeRow('ROW-1')
    http.saveResult = { maplistdelete: [{ physical: [{ rowid: 'ROW-1' }] }] }
    await expect(view.saveChanges()).resolves.toMatchObject({ success: true, data: { deletedCount: 1 } })
    expect(view.dirtyTracking.isPendingDelete('ROW-1')).toBe(false)
    expect(view.total).toBe(0)
    ds.destroy()
  })

  it('accepts the actual returned identity for a pending created row', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.addRow({ rowid: 'NEW-INPUT', salary: 200 })
    http.saveResult = { maplistadd: [{ physical: [{ rowid: 'ROW-2', salary: 210 }] }] }
    await expect(view.saveChanges()).resolves.toMatchObject({ success: true, data: { createdCount: 1 } })
    expect(view.rows.find(row => view.getPkKey(row) === 'NEW-INPUT')).toBeUndefined()
    expect(view.rows.find(row => view.getPkKey(row) === 'ROW-2')).toMatchObject({ salary: 210 })
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(JSON.stringify(http.saveRequests[0]?.data)).not.toContain('_pk')
    ds.destroy()
  })

  it('preserves pending changes and releases mutation state after a rejected save', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.editRowById('ROW-1', { salary: 120 })
    http.saveResult = {}
    await expect(view.saveChanges()).rejects.toThrow('桶')
    expect(view.mutating).toBe(false)
    expect(view.mutatingError).toBeInstanceOf(Error)
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(true)
    expect(view.rows[0]?.['salary']).toBe(120)
    ds.destroy()
  })

  it('locally discards an unknown save result then explicitly reads the owner’s current server value', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.editRowById('ROW-1', { salary: 120 })
    http.saveResult = {}
    await expect(view.saveChanges()).rejects.toThrow()

    expect(view.mutating).toBe(false)
    expect(view.rows[0]?.['salary']).toBe(120)
    expect(view.discardPendingChanges()).toBe(1)
    expect(view.rows[0]?.['salary']).toBe(100)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(http.queryRequests).toHaveLength(1)
    expect(http.saveRequests).toHaveLength(1)

    http.queryResults = [{ data: { Items: [] }, allowAdd: false }]
    await view.refresh()
    expect(view.rows[0]?.['salary']).toBe(100)
    await expect(view.editRowById('ROW-1', { salary: 140 })).rejects.toThrow('DATA_VIEW_RESULT_STALE')

    http.result = { primaryKeyField: 'rowid', allowAdd: true, lingma_sys_key: 'TABLE-KEY',
      data: { Items: [{ rowid: 'ROW-1', salary: 130, lingma_sys_key: 'ROW-KEY',
        lingma_sys_params: { r: ['salary'], e: ['salary'], h: ['secret'], m: ['bankAccount'], d: true } }], Count: 1 } }
    await view.refresh()
    expect(view.rows[0]?.['salary']).toBe(130)
    expect(view.fieldAccess(view.rows[0] ?? null, 'salary')).toMatchObject({ read: 'visible', write: 'allowed' })
    expect(http.queryRequests).toHaveLength(3)
    expect(http.saveRequests).toHaveLength(1)
    ds.destroy()
  })

  it('refuses pending discard while an owner query or save is active', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.editRowById('ROW-1', { salary: 120 })
    let releaseSave: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { releaseSave = resolve })
    const saveStarted = new Promise<void>(resolve => { http.saveStarted = resolve })
    const save = view.saveChanges()
    await saveStarted
    expect(() => view.discardPendingChanges()).toThrow('DATA_VIEW_DISCARD_BUSY')
    expect(view.rows[0]?.['salary']).toBe(120)
    releaseSave?.()
    await save

    let releaseQuery: (() => void) | undefined
    http.queryGate = new Promise<void>(resolve => { releaseQuery = resolve })
    const queryStarted = new Promise<void>(resolve => { http.queryStarted = resolve })
    const query = view.loadFromServer()
    await queryStarted
    expect(() => view.discardPendingChanges()).toThrow('DATA_VIEW_DISCARD_BUSY')
    releaseQuery?.()
    await query
    ds.destroy()
  })

  it('discards only selected pending IDs and preserves remaining rows, selection, and permissions', async () => {
    const http = new DataSpaceFixtureHttpClient()
    http.result = { primaryKeyField: 'rowid', allowAdd: true, lingma_sys_key: 'TABLE-KEY',
      data: { Items: [1, 2, 3].map(index => ({ rowid: `ROW-${index}`, salary: index * 100,
        lingma_sys_key: `ROW-KEY-${index}`,
        lingma_sys_params: { r: ['salary'], e: ['salary'], h: ['secret'], m: ['bankAccount'], d: true } })), Count: 3 } }
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    const second = findRow(view, 'ROW-2')
    const third = findRow(view, 'ROW-3')
    if (!second || !third) throw new Error('fixture rows missing')
    view.setCurrentRowById('ROW-2')
    view.setSelectedRows([second, third])
    await view.editRowById('ROW-1', { salary: 150 })
    await view.editRowById('ROW-2', { salary: 250 })
    view.updateEditingValue('ROW-2', 'salary', 275)
    await view.removeRow('ROW-3')
    await view.addRow({ rowid: 'ROW-NEW', salary: 400 })

    expect(view.discardPendingChanges([])).toBe(0)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(view.discardPendingChanges(['ROW-1', 'ROW-1'])).toBe(1)
    expect(findRow(view, 'ROW-1')?.['salary']).toBe(100)
    expect(view.dirtyTracking.isDirty('ROW-2')).toBe(true)
    expect(view.getEditingPatch('ROW-2')).toEqual({ salary: 275 })
    expect(view.currentRow?.['rowid']).toBe('ROW-2')
    expect(view.selectedRows.map(row => row['rowid'])).toEqual(['ROW-2'])

    expect(view.discardPendingChanges(['ROW-3', 'ROW-NEW'])).toBe(2)
    expect(findRow(view, 'ROW-3')?.['salary']).toBe(300)
    expect(findRow(view, 'ROW-NEW')).toBeNull()
    expect(view.currentRow?.['rowid']).toBe('ROW-2')
    expect(view.selectedRows.map(row => row['rowid'])).toEqual(['ROW-2'])
    expect(view.discardPendingChanges()).toBe(1)
    expect(findRow(view, 'ROW-2')?.['salary']).toBe(200)
    expect(view.getEditingPatch('ROW-2')).toBeUndefined()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(view.total).toBe(3)
    expect(view.fieldAccess(findRow(view, 'ROW-2'), 'salary')).toMatchObject({ read: 'visible', write: 'allowed' })
    expect(view.fieldAccess(findRow(view, 'ROW-2'), 'secret')).toMatchObject({ read: 'invisible', write: 'denied' })
    expect(http.queryRequests).toHaveLength(1)
    expect(http.saveRequests).toHaveLength(0)
    ds.destroy()
  })

  it('validates every selected baseline before changing any pending row', async () => {
    const http = new DataSpaceFixtureHttpClient()
    http.result = { primaryKeyField: 'rowid', allowAdd: true, lingma_sys_key: 'TABLE-KEY',
      data: { Items: [
        { rowid: 'ROW-1', salary: 100, lingma_sys_key: 'KEY-1', lingma_sys_params: { e: ['salary'] } },
        { rowid: 'ROW-2', salary: 200, lingma_sys_key: 'KEY-2A', lingma_sys_params: { e: ['salary'] } },
        { rowid: 'ROW-2', salary: 201, lingma_sys_key: 'KEY-2B', lingma_sys_params: { e: ['salary'] } },
      ], Count: 3 } }
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.editRowById('ROW-1', { salary: 150 })
    await view.editRowById('ROW-2', { salary: 250 })
    const pendingRows = view.rows.map(row => ({ ...row }))

    expect(() => view.discardPendingChanges()).toThrow('DATA_VIEW_DISCARD_ROW')
    expect(view.rows).toEqual(pendingRows)
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(true)
    expect(view.dirtyTracking.isDirty('ROW-2')).toBe(true)
    ds.destroy()
  })

  it('synchronizes the configured tree cache after locally discarding an edited parent link', async () => {
    const http = new DataSpaceFixtureHttpClient()
    http.result = { primaryKeyField: 'rowid', allowAdd: true, lingma_sys_key: 'TABLE-KEY',
      data: { Items: [
        { rowid: 'ROOT-A', parentId: null, salary: 1, lingma_sys_key: 'A', lingma_sys_params: { e: ['parentId'] } },
        { rowid: 'ROOT-B', parentId: null, salary: 2, lingma_sys_key: 'B', lingma_sys_params: { e: ['parentId'] } },
        { rowid: 'CHILD', parentId: 'ROOT-A', salary: 3, lingma_sys_key: 'C', lingma_sys_params: { e: ['parentId'] } },
      ], Count: 3 } }
    const { ds, view } = connectedView(http)
    view.treeConfig = { idField: 'rowid', parentIdField: 'parentId' }
    await view.loadFromServer()
    await view.editRowById('CHILD', { parentId: 'ROOT-B' })
    expect(view.treeManager?.getNode('CHILD')?.parentId).toBe('ROOT-B')

    expect(view.discardPendingChanges(['CHILD'])).toBe(1)

    expect(findRow(view, 'CHILD')?.['parentId']).toBe('ROOT-A')
    expect(view.treeManager?.getNode('CHILD')?.parentId).toBe('ROOT-A')
    expect(http.queryRequests).toHaveLength(1)
    expect(http.saveRequests).toHaveLength(0)
    ds.destroy()
  })

  it('rejects a pending delete when the same ID has reappeared in current rows', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.removeRow('ROW-1')
    view.appendRow({ rowid: 'ROW-1', salary: 999 })
    const currentRows = view.rows.map(row => ({ ...row }))

    expect(() => view.discardPendingChanges(['ROW-1'])).toThrow('DATA_VIEW_DISCARD_ROW')

    expect(view.rows).toEqual(currentRows)
    expect(view.dirtyTracking.isPendingDelete('ROW-1')).toBe(true)
    ds.destroy()
  })

  it('clears an overlay left on a removed pending create without touching another pending row', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.addRow({ rowid: 'ROW-NEW', salary: 300 })
    view.updateEditingValue('ROW-NEW', 'salary', 350)
    await view.removeRow('ROW-NEW')
    await view.editRowById('ROW-1', { salary: 120 })

    expect(view.discardPendingChanges(['ROW-NEW'])).toBe(1)

    expect(view.rows.find(row => row['rowid'] === 'ROW-NEW')).toBeUndefined()
    expect(view.hasEditingChanges('ROW-NEW')).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(true)
    expect(findRow(view, 'ROW-1')?.['salary']).toBe(120)
    expect(http.queryRequests).toHaveLength(1)
    expect(http.saveRequests).toHaveLength(0)
    ds.destroy()
  })

  it.each(['edit', 'remove'])('keeps a later %s of a created row after its server identity arrives', async operation => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    await view.addRow({ rowid: 'NEW-INPUT', salary: 200 })
    http.saveResult = { maplistadd: [{ physical: [{ rowid: 'ROW-2', salary: 210 }] }] }
    let release: (() => void) | undefined
    http.saveGate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { http.saveStarted = resolve })
    const save = view.saveChanges()
    await started
    if (operation === 'edit') await view.editRowById('NEW-INPUT', { salary: 250 })
    else await view.removeRow('NEW-INPUT')
    release?.()
    await save
    if (operation === 'edit') {
      expect(view.rows.find(row => view.getPkKey(row) === 'ROW-2')).toMatchObject({ salary: 250 })
      expect(view.dirtyTracking.isDirty('ROW-2')).toBe(true)
    } else {
      expect(view.rows.find(row => view.getPkKey(row) === 'ROW-2')).toBeUndefined()
      expect(view.dirtyTracking.isPendingDelete('ROW-2')).toBe(true)
    }
    ds.destroy()
  })

  it('saves only selected dirty rows and retains unselected changes', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    http.result = { primaryKeyField: 'rowid', data: { Items: [
      { rowid: 'ROW-1', salary: 100, lingma_sys_key: 'one', lingma_sys_params: { e: ['salary'] } },
      { rowid: 'ROW-2', salary: 200, lingma_sys_key: 'two', lingma_sys_params: { e: ['salary'] } },
    ], Count: 2 } }
    await view.loadFromServer()
    await view.editRowById('ROW-1', { salary: 120 })
    await view.editRowById('ROW-2', { salary: 220 })
    await view.saveChanges(['ROW-1'])
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(false)
    expect(view.dirtyTracking.isDirty('ROW-2')).toBe(true)
    expect(http.saveRequests[0]?.data).toMatchObject([{ CrudModel: { Changed: [{ rowid: 'ROW-1', salary: 120 }] } }])
    expect(view.rows[1]?.['salary']).toBe(220)
    ds.destroy()
  })

  it('clears a selected reverted row from the strong baseline without corrupting other save receipts', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    http.result = { primaryKeyField: 'rowid', data: { Items: [
      { rowid: 'ROW-1', salary: 100, lingma_sys_key: 'one', lingma_sys_params: { e: ['salary'] } },
      { rowid: 'ROW-2', salary: 200, lingma_sys_key: 'two', lingma_sys_params: { e: ['salary'] } },
    ], Count: 2 } }
    await view.loadFromServer()
    await view.editRowById('ROW-1', { salary: 120 })
    await view.editRowById('ROW-2', { salary: 220 })
    await view.editRowById('ROW-2', { salary: 200 })
    await expect(view.saveChanges()).resolves.toMatchObject({ success: true, data: { savedCount: 1 } })
    expect(view.dirtyTracking.isDirty('ROW-1')).toBe(false)
    expect(view.dirtyTracking.isDirty('ROW-2')).toBe(false)
    expect(http.saveRequests[0]?.data).toMatchObject([{ CrudModel: { Changed: [{ rowid: 'ROW-1' }] } }])
    ds.destroy()
  })

  it('requires reconstruction when a legacy query has already run', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, executor } = connectedView(http, false)
    vi.spyOn(view.crud, 'list').mockResolvedValue({ success: true, data: [{ rowid: 'ROW-1', salary: 100 }] })
    await view.loadFromServer()
    expect(() => view.bindQueryExecutor(executor)).toThrow('DATA_VIEW_QUERY_IDENTITY')
    expect(view.rows[0]).toMatchObject({ salary: 100 })
    ds.destroy()
  })
  it('loads through the injected owner and projects private original permissions', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, executeQuery, executor } = connectedView(http)
    view.bindQueryExecutor(executor)
    const crud = vi.spyOn(view.crud, 'list')
    expect((await view.loadFromServer()).success).toBe(true)
    expect(crud).not.toHaveBeenCalled()
    expect(executeQuery).toHaveBeenCalledWith(view, expect.objectContaining({
      page: 1, pageSize: 20, context: { enabled: false, offset: 0, text: '' }, viewId: 'list',
    }))
    expect(view.rows[0]).toMatchObject({ rowid: 'ROW-1', salary: 100 })
    expect(view.rows[0]).not.toHaveProperty('lingma_sys_params')
    expect(view).not.toHaveProperty('permissionSnapshot')
    expect(view).not.toHaveProperty('queryResult')
    expect(view.fieldAccess(view.rows[0] ?? null, 'salary')).toMatchObject({ write: 'allowed', required: true })
    expect(view.fieldAccess(view.rows[0] ?? null, 'secret')).toMatchObject({ read: 'invisible', write: 'denied' })
    expect(view.editActionState(view.rows[0] ?? null)).toBe('enabled')
    expect(view.deleteActionState(view.rows[0] ?? null)).toBe('enabled')
    expect(view.createChildActionState(view.rows[0] ?? null)).toBe('hidden')
    expect(view.fieldAccess({ rowid: 'UNKNOWN' }, 'salary').write).toBe('denied')
    expect(view.toJson().rows).toEqual([])

    view.updateEditingValue('ROW-1', 'salary', 120)
    await expect(view.loadFromServer()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(executeQuery).toHaveBeenCalledTimes(1)
    expect(view.getEditingPatch('ROW-1')).toEqual({ salary: 120 })
    ds.destroy()
  })

  it('uses requestData to send current filters and sorting to the owner without a CRUD endpoint', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, executeQuery } = connectedView(http)
    view.filterExpression = { field: 'salary', operator: 'gt', value: 0 }
    view.sortExpression = [{ field: 'salary', direction: 'desc' }]
    await view.requestData()
    expect(executeQuery).toHaveBeenCalledWith(view, expect.objectContaining({
      filter: { field: 'salary', operator: 'gt', value: 0 }, sort: 'salary:desc',
    }))
    expect(view.rows[0]?.['rowid']).toBe('ROW-1')
    expect(http.requestConfig?.data).toMatchObject({ PageParam: { index: 1, size: 20 }, Table: [{
      Name: 'Payroll',
      Filter: { Type: 'cond', Field: 'salary', Operator: 'greaterthan', ValueFun: { Type: 'GetConstValue', Value: 0 } },
      Fields: [{ Name: 'rowid' }, { Name: 'salary', OrderType: 'descending' }],
      inputParams: [{ Name: 'enabled', Value: false }, { Name: 'offset', Value: 0 }, { Name: 'text', Value: '' }],
    }] })
    ds.destroy()
  })

  it.each([{ page: 0 }, { pageSize: 0 }, { fields: [] }, { fields: ['missing'] },
    { sort: 'missing:asc' }, { sort: 'salary:ascending' }, { sort: 'salary:asc,salary:desc' },
    { search: 'ignored' }, { parentId: 'guessed-node' }])('rejects invalid view query parameters before transport: %j', async params => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await expect(view.loadFromServer(params)).rejects.toThrow()
    expect(http.queryRequests).toHaveLength(0)
    ds.destroy()
  })

  it('keeps edits and the old permission baseline when edits arrive during a query', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    const oldRows = view.rows
    let release: (() => void) | undefined
    http.queryGate = new Promise<void>(resolve => { release = resolve })
    const pending = view.loadFromServer()
    view.updateEditingValue('ROW-1', 'salary', 120)
    release?.()
    await expect(pending).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(view.rows).toBe(oldRows)
    expect(view.getEditingPatch('ROW-1')).toEqual({ salary: 120 })
    expect(view.editActionState(view.rows[0] ?? null)).toBe('disabled')
    ds.destroy()
  })

  it('maps projected aliases to model field Names and retains complete value-function payloads', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    const valueFun = { Type: 'GetGroupValue', GroupType: 'sum', Extra: [false, 0, ''] }
    view.fieldProjection = [{ fieldId: 'F-SALARY', source: 'derived', resourceFieldId: null,
      resourceField: 'salary', viewField: 'salaryDisplay', type: 'number', label: 'Salary', output: true,
      sortOrder: 0, sortDirection: null, group: 1, distinct: false, primaryKey: false,
      value: '', valueFunction: JSON.stringify(valueFun), expression: '' }]
    await view.loadFromServer({ fields: ['salaryDisplay'], sort: 'salaryDisplay:desc', filter: {
      logic: 'or', filters: [{ field: 'Related.amount', operator: 'in', value: [false, 0, ''] },
        { field: 'salary', operator: 'gt', value: { Type: 'GetInputParam', Name: 'minimum', Extra: valueFun } }],
    } })
    expect(http.requestConfig?.data).toMatchObject({ Table: [{ Name: 'Payroll', Fields: [{
      Name: 'salary', AsName: 'salaryDisplay', Group: 1, ValueFun: valueFun, OrderType: 'descending',
    }], Filter: { Type: 'or', Filters: [
      { Field: 'Related.amount', Operator: 'in', ValueFun: { Type: 'GetConstValue', Value: [false, 0, ''] } },
      { Field: 'salary', ValueFun: { Type: 'GetInputParam', Name: 'minimum', Extra: valueFun } },
    ] } }] })
    ds.destroy()
  })

  it('requires explicit server tree parameters and collects complete pages through the view owner', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    http.queryResults = [1, 2].map(index => ({ primaryKeyField: 'rowid', allowAdd: false,
      data: { Items: [{ rowid: `ROW-${index}`, salary: index }], Count: 2 } }))
    await view.loadFromServer({ pageSize: 1, allPages: true, maxRows: 2,
      tree: { keyField: 'rowid', parentField: 'parentId', nodeId: 'ROOT', mode: 'child' } })
    expect(view.rows).toHaveLength(2)
    expect(view.total).toBe(2)
    expect(http.queryRequests.map(request => request.data)).toMatchObject([
      { PageParam: { index: 1, size: 1 }, nodeid: 'ROOT', keyField: 'rowid', parentField: 'parentId',
        Table: [{ Name: 'Payroll', OutputType: 'SelfRefData' }] },
      { PageParam: { index: 2, size: 1 }, nodeid: 'ROOT' },
    ])
    ds.destroy()
  })

  it('retains old data after an error and pauses writes until successful recovery', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    await view.loadFromServer()
    const oldRows = view.rows
    http.queryResults = [{ data: { Items: [] }, allowAdd: false }]
    await expect(view.loadFromServer()).rejects.toThrow('分页缺少后端总数')
    expect(view.rows).toBe(oldRows)
    expect(view.fieldAccess(view.rows[0] ?? null, 'salary').write).toBe('denied')
    expect(view.addActionState()).toBe('disabled')
    await view.loadFromServer()
    expect(view.fieldAccess(view.rows[0] ?? null, 'salary').write).toBe('allowed')
    ds.destroy()
  })

  it('rejects stale permissions and local writes after application identity changes', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { api, ds, view } = connectedView(http)
    await view.loadFromServer()
    const application = api.application.get()
    if (!application) throw new Error('fixture application missing')
    api.application.save({ ...application, application: { ...application.application, id: 'APP-B' } })
    expect(() => view.fieldAccess(view.rows[0] ?? null, 'salary')).toThrow('SPARK_QUERY_CONTEXT_STALE')
    expect(() => view.updateEditingValue('ROW-1', 'salary', 120)).toThrow('SPARK_QUERY_CONTEXT_STALE')
    ds.destroy()
  })

  it('ignores a pending result after destruction without exposing its context', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view } = connectedView(http)
    let release: (() => void) | undefined
    http.queryGate = new Promise<void>(resolve => { release = resolve })
    const pending = view.loadFromServer()
    ds.destroy()
    release?.()
    expect((await pending).success).toBe(false)
    expect(view.rows).toEqual([])
    expect(() => view.addActionState()).toThrow()
  })

  it('does not release a shared original context when another view is destroyed', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { ds, view, executor } = connectedView(http)
    const sibling = ds.getView('Payroll', 'default')
    if (!sibling) throw new Error('fixture sibling missing')
    sibling.queryContext = { ...view.queryContext }
    sibling.bindQueryExecutor(executor)
    await Promise.all([view.loadFromServer(), sibling.loadFromServer()])
    expect(http.queryRequests).toHaveLength(1)
    view.destroy()
    expect(sibling.fieldAccess(sibling.rows[0] ?? null, 'salary').write).toBe('allowed')
    expect(sibling.rows[0]?.['rowid']).toBe('ROW-1')
    ds.destroy()
  })

  it('rejects a result from another scenario before replacing data or permissions', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const { api, ds, view, executeQuery } = connectedView(http)
    await view.loadFromServer()
    const rows = view.rows
    http.queryResults = [{ primaryKeyField: 'rowid', allowAdd: false,
      data: { Items: [{ rowid: 'OTHER', salary: 0, lingma_sys_params: { e: [] } }], Count: 1 } }]
    executeQuery.mockImplementation(() => api.dataSpace.runtime.query({ scenarioId: 'OTHER', metaName: 'Payroll' }))
    await expect(view.loadFromServer()).rejects.toThrow('SPARK_QUERY_CONTEXT_IDENTITY')
    expect(view.rows).toBe(rows)
    expect(view.total).toBe(1)
    expect(view.fieldAccess(view.rows[0] ?? null, 'salary')).toMatchObject({ required: true, write: 'denied' })
    ds.destroy()
  })
  it('prepares missing new-row identity from the original query key without component guesses', async () => {
    const http = new DataSpaceFixtureHttpClient()
    const {ds, view} = connectedView(http)
    await view.loadFromServer()
    const first = await view.addRow({salary: 101})
    const second = await view.addRow({salary: 102})
    expect(first).toHaveProperty('rowid', expect.stringMatching(/^[A-F0-9]{32}$/))
    expect(second).toHaveProperty('rowid', expect.stringMatching(/^[A-F0-9]{32}$/))
    expect(first).not.toEqual(second)
    expect(view.dirtyTracking.pendingCreateIds.size).toBe(2)
    const explicit = await view.addRow({rowid: 'EXPLICIT', salary: 103})
    expect(explicit).toHaveProperty('rowid', 'EXPLICIT')
    ds.destroy()
  })

})

// 正式树模型使用后端 ParentField/TopValue，输出别名只用于业务行。
describe('formal tree child-add credentials', () => {
  async function fixture(rows: readonly Record<string, unknown>[], raw = { ParentField: 'ParentID', TopValue: 'ROOT' }) {
    const http = new DataSpaceFixtureHttpClient()
    http.result = { primaryKeyField: 'rowid', allowAdd: true, lingma_sys_key: 'TABLE-KEY',
      data: { Items: rows, Count: rows.length } }
    const api = activeApi(http)
    const identity = { scenarioId: 'TREE-SCENE', metaName: 'TreeModel' }
    const context = await api.dataSpace.runtime.query(identity)
    context.bindFormalModel({ id: 'TREE-MODEL', metaName: 'TreeModel', name: 'TreeModel', sourceName: 'physical',
      sourceId: 'DB', sourceType: 'table', primaryKey: 'nodeId', businessMain: true, raw,
      fields: [['rowid', 'nodeId'], ['ParentID', 'parentId'], ['Title', 'title']].map(([name, canonicalName], index) => ({
        id: String(index), modelId: 'TREE-MODEL', name: name ?? '', canonicalName: canonicalName ?? '', type: 'string',
        primaryKey: index === 0, description: '', output: true, computed: false, order: index, orderType: '', raw: {},
      })) })
    return { http, api, identity, context }
  }

  it('sends the unique original parent token through the actual runtime save owner', async () => {
    const { http, api, identity, context } = await fixture([
      { nodeId: 'P1', parentId: 'ROOT', lingma_sys_key: 'PARENT-ONE', lingma_sys_params: { c: true } },
      { nodeId: 'P2', parentId: 'ROOT', lingma_sys_key: 'PARENT-TWO', lingma_sys_params: { c: true } },
    ])
    http.saveResult = { maplistadd: [{ physical: [{ rowid: 'C1', ParentID: 'P2', Title: 'child' }] }] }
    const receipts = await api.dataSpace.runtime.save({ changes: [{ identity, context,
      changes: { added: [{ nodeId: 'C1', parentId: 'P2', title: 'child', _pk: 'front', lingma_sys_key: 'FORGED' }] } }] })
    expect(http.saveRequests[0]?.data).toEqual([{ TableName: 'TreeModel', CrudModel: {
      Added: [{ rowid: 'C1', ParentID: 'P2', Title: 'child', lingma_sys_key: 'PARENT-TWO' }], Changed: [], Deleted: [],
    } }])
    expect(receipts[0]?.added).toEqual([{ nodeId: 'C1', parentId: 'P2', title: 'child' }])
    expect(context.rows[1]).not.toHaveProperty('lingma_sys_key')
  })

  it.each([undefined, null, '', '   ', 'ROOT'])('keeps root additions on the table credential for parent %s', async parentId => {
    const { context } = await fixture([])
    expect(context.buildSaveRequest({ added: [{ nodeId: 'NEW', parentId }] })[0]?.CrudModel.Added[0])
      .toMatchObject({ rowid: 'NEW', lingma_sys_key: 'TABLE-KEY' })
  })

  it.each([false, undefined, 'true'])('rejects a parent without explicit c=true: %s', async c => {
    const { http, api, identity, context } = await fixture([
      { nodeId: 'P', lingma_sys_key: 'PARENT', lingma_sys_params: { c } },
    ])
    await expect(api.dataSpace.runtime.save({ changes: [{ identity, context,
      changes: { added: [{ nodeId: 'NEW', parentId: 'P' }] } }] })).rejects.toThrow('SPARK_CHILD_ADD_PARENT')
    expect(http.saveRequests).toHaveLength(0)
  })

  it.each(['missing', 'duplicate', 'missing-token', 'unacknowledged'])('rejects %s parent credentials before HTTP', async kind => {
    const parent = { nodeId: 'P', lingma_sys_key: 'PARENT', lingma_sys_params: { c: true } }
    const rows = kind === 'duplicate' ? [parent, { ...parent }] : kind === 'missing-token'
      ? [{ nodeId: 'P', lingma_sys_params: { c: true } }] : kind === 'missing' || kind === 'unacknowledged' ? [] : [parent]
    const { http, api, identity, context } = await fixture(rows)
    const added = kind === 'unacknowledged' ? [{ nodeId: 'P', parentId: 'ROOT' }, { nodeId: 'NEW', parentId: 'P' }]
      : [{ nodeId: 'NEW', parentId: 'P' }]
    await expect(api.dataSpace.runtime.save({ changes: [{ identity, context, changes: { added } }] }))
      .rejects.toThrow('SPARK_CHILD_ADD_PARENT')
    expect(http.saveRequests).toHaveLength(0)
  })

  it('rejects a self-parent instead of borrowing its original credential', async () => {
    const { context } = await fixture([{ nodeId: 'P', lingma_sys_key: 'PARENT', lingma_sys_params: { c: true } }])
    expect(() => context.buildSaveRequest({ added: [{ nodeId: 'P', parentId: 'P' }] })).toThrow('SPARK_CHILD_ADD_PARENT')
  })

  it('uses the actual formal topValue without assuming zero is a root', async () => {
    const { context } = await fixture([{ nodeId: 0, lingma_sys_key: 'ZERO-PARENT', lingma_sys_params: { c: true } }])
    expect(context.buildSaveRequest({ added: [{ nodeId: 'NEW', parentId: 0 }] })[0]?.CrudModel.Added[0])
      .toMatchObject({ ParentID: 0, lingma_sys_key: 'ZERO-PARENT' })
  })

  it('uses an explicitly configured zero topValue as the root marker', async () => {
    const { context } = await fixture([], { ParentField: 'ParentID', TopValue: '0' })
    expect(context.buildSaveRequest({ added: [{ nodeId: 'NEW', parentId: 0 }] })[0]?.CrudModel.Added[0])
      .toMatchObject({ ParentID: 0, lingma_sys_key: 'TABLE-KEY' })
  })

  it('requires a fresh parent query after its create receipt supplies no signed c credential', async () => {
    const { http, api, identity, context } = await fixture([])
    http.saveResult = { maplistadd: [{ physical: [{ rowid: 'P', ParentID: 'ROOT' }] }] }
    const [receipt] = await api.dataSpace.runtime.save({ changes: [{ identity, context,
      changes: { added: [{ nodeId: 'P', parentId: 'ROOT' }] } }] })
    if (!receipt) throw new Error('fixture parent receipt missing')
    await expect(api.dataSpace.runtime.save({ changes: [{ identity, context: receipt.context,
      changes: { added: [{ nodeId: 'CHILD', parentId: 'P' }] } }] })).rejects.toThrow('SPARK_CHILD_ADD_PARENT')
    expect(http.saveRequests).toHaveLength(1)
  })
})
