import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { DataViewFilter } from '@spark-appworks/spark-data'
import { describe, expect, it } from 'vitest'

import { LowcodeApi } from '../../../lowcode-api.js'
import { DataSpaceDesignApi, DATA_SPACE_DESIGN_FORM_KEY } from './data-space-design-api.js'

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
  it('round trips structured wire filters and rejects damaged stored definitions', () => {
    const wire = {
      Type: 'and', Filters: [
        { Type: 'cond', Field: 'Name', Operator: 'equal', Value: null,
          ValueFun: { Type: 'GetConstValue', Value: 'A' } },
        { Type: 'cond', Field: 'Owner', Operator: 'equal', Value: null,
          ValueFun: { Type: 'GetConstValue', Value: null } },
        { Type: 'or', Filters: [{ Type: 'cond', Field: 'Owner', Operator: 'equal', Value: null,
          ValueFun: { Type: 'GetUserMasterId', refType: 'dep', depLevel: '2', getChildDep: true } }] },
      ],
    }
    const filter = DataSpaceDesignApi.parseFilter(JSON.stringify(wire))
    expect(filter).toBeInstanceOf(DataViewFilter)
    expect(DataSpaceDesignApi.serializeFilter(filter)).toBe(JSON.stringify(wire))
    expect(DataSpaceDesignApi.parseFilter(null)).toBeUndefined()
    expect(DataSpaceDesignApi.parseFilter(undefined)).toBeUndefined()
    expect(DataSpaceDesignApi.parseFilter(' \t ')).toBeUndefined()
    expect(DataSpaceDesignApi.serializeFilter(undefined)).toBe('')
    expect(() => DataSpaceDesignApi.parseFilter('{')).toThrow()
    expect(() => DataSpaceDesignApi.parseFilter('{"Type":"wat"}')).toThrow()
  })

  it('parses one field ValueFun object while preserving unknown types and JSON extension values', () => {
    const valueFunction = {
      Type: 'FutureFunction',
      Value: false,
      Extension: { count: 0, empty: null, flags: [false, 0, null] },
    }
    expect(DataSpaceDesignApi.parseValueFunction(JSON.stringify(valueFunction))).toEqual(valueFunction)
    expect(DataSpaceDesignApi.parseValueFunction(JSON.stringify({ Type: 'GetConstValue', Value: 0 }))?.['Value']).toBe(0)
    expect(DataSpaceDesignApi.parseValueFunction(JSON.stringify({ Type: 'GetConstValue', Value: null }))?.['Value']).toBeNull()
    expect(DataSpaceDesignApi.parseValueFunction(null)).toBeUndefined()
    expect(DataSpaceDesignApi.parseValueFunction(undefined)).toBeUndefined()
    expect(DataSpaceDesignApi.parseValueFunction('  ')).toBeUndefined()
    expect(() => DataSpaceDesignApi.parseValueFunction('{')).toThrow('ValueFun 不是有效 JSON')
    expect(() => DataSpaceDesignApi.parseValueFunction('{"Value":false}')).toThrow('ValueFun 缺少 Type')
    expect(() => DataSpaceDesignApi.parseValueFunction('"plain text"')).toThrow()
  })

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

type FormalDesignRow = Readonly<Record<string, unknown>>

class DataSpaceFormalFixtureHttpClient extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly results: unknown[] = []
  onResponse: (() => void) | undefined
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const result = this.results.shift()
    if (result === undefined) throw new Error('Unexpected formal metadata query')
    this.onResponse?.()
    return { data: { Code: 200, Result: result }, status: 200, statusText: 'OK', headers: {} }
  }
}

function formalApi(http: DataSpaceFormalFixtureHttpClient): LowcodeApi {
  const values = new Map<string, string>()
  const api = new LowcodeApi({ http, sessionStorage: { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } } })
  api.session.save({ accessToken: 'access', refreshToken: 'refresh', accessExpiresAt: Date.now() + 60_000,
    refreshExpiresAt: Date.now() + 120_000, identity: { userId: 'USER-1', account: 'fixture', displayName: 'fixture',
      enterpriseId: 'TENANT-1', enterpriseShortName: 'tenant', role: null, raw: {} },
    enterprise: { id: 'TENANT-1', name: 'tenant', code: 'tenant', shortName: 'tenant', shortCode: 'tenant', raw: {} } })
  api.application.save({ application: { id: 'APP-1', code: 'app', name: 'app', description: '',
    enterpriseId: 'TENANT-1', enterpriseShortName: 'tenant', isDefault: false }, navigationRootId: 'ROOT' })
  return api
}

const formalInput = { designScenarioId: 'DESIGN-1', dataSpaceId: 'SPACE-1', metaName: 'Orders' }
function formalRelation(index = 0): FormalDesignRow {
  return { rowid: `REL-${index}`, dataSetId: 'SPACE-1', parentModId: 'MODEL-1', childModId: 'MODEL-2',
    parentTable: 'Orders', childTable: 'OrderLines', depType: 'currentRow', cascadeDel: 1,
    filter: { Type: 'or', Filters: [
      { Type: 'cond', Field: 'OrderLines.orderId', Operator: 'equal', ValueFun: { Type: 'GetTableField', Field: 'Orders.id' } },
      { Type: 'cond', Field: 'enabled', Operator: 'equal', ValueFun: { Type: 'GetConstValue', Value: false } },
    ] } }
}
function formalModel(): FormalDesignRow {
  return { rowid: 'MODEL-1', dataSetId: 'SPACE-1', Name: 'Orders', Type: '数据库表', MetaName: 'OrderRows',
    DbId: 'DB-1', PrimaryKeyFields: 'rowid', IsBusinessMain: 1,
    Filter: { Type: 'cond', Field: 'enabled', ValueFun: { Type: 'GetConstValue', Value: false } } }
}
function formalFields(): FormalDesignRow[] {
  return [{ rowid: 'FIELD-1', dataSetId: 'SPACE-1', dataModelId: 'MODEL-1', type: 'dataModel',
    Name: 'rowid', AsName: 'orderId', FieldType: '字符串', IsOutput: 1, IsPKey: 0 },
  { rowid: 'FIELD-2', dataSetId: 'SPACE-1', dataModelId: 'MODEL-1', type: 'dataModel',
    Name: 'amount', IsOutput: 1, ValueFun: { Type: 'GetConstValue', Value: 0, Extra: [false, ''] } }]
}
function formalResult(rows: readonly FormalDesignRow[], total = rows.length): unknown {
  return { data: { Items: rows, Count: total } }
}
function sourceResults(): unknown[] {
  return [formalResult([{ rowid: 'SOURCE-1', tblname: 'OrderRows', dbid: 'DB-1' }]),
    formalResult([{ rowid: 'SOURCE-FIELD-1', tblid: 'SOURCE-1', enname: 'rowid', IsPKey: 1 },
      { rowid: 'SOURCE-FIELD-TENANT', tblid: 'SOURCE-1', enname: 'lingma_sys_ent', IsPKey: 1 }])]
}

describe('DataSpaceDesignApi formal relation reader', () => {
  it('collects all relation pages and decodes the full filter without flattening OR', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const rows = Array.from({ length: 501 }, (_, index) => formalRelation(index))
    http.results.push(formalResult(rows.slice(0, 500), 501), formalResult(rows.slice(500), 501))
    const relations = await formalApi(http).dataSpace.design.readRelations(formalInput)
    expect(relations).toHaveLength(501)
    expect(relations[0]).toMatchObject({ sourceRelationId: 'REL-0', dataSpaceId: 'SPACE-1',
      parentModelId: 'MODEL-1', childModelId: 'MODEL-2', cascadeDelete: true })
    expect(relations[0]?.filterExpression.toJSON()).toEqual({ logic: 'or', filters: [
      { field: 'OrderLines.orderId', operator: 'eq', value: { Type: 'GetTableField', Field: 'Orders.id' } },
      { field: 'enabled', operator: 'eq', value: false },
    ] })
    expect(Object.isFrozen(relations)).toBe(true)
    expect(Object.isFrozen(relations[0])).toBe(true)
    expect(http.requests[0]?.data).toMatchObject({ Table: [{ Name: 'Base_DataModel_Relation',
      Filter: { Field: 'dataSetId', ValueFun: { Value: 'SPACE-1' } } }], PageParam: { index: 1, size: 500 } })
    expect(http.requests[1]?.data).toMatchObject({ PageParam: { index: 2, size: 500 } })
    expect(http.requests.every(request => request.headers?.['x-FormKey'] === 'DESIGN-1'
      && request.headers?.['X-AppId'] === 'APP-1')).toBe(true)
  })

  it.each([{ dataSetId: 'FOREIGN' }, { parentModId: '' }, { childModId: '' },
    { filter: { Type: 'and', children: [] } }])('rejects invalid relation ownership or definition %j', async change => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([{ ...formalRelation(), ...change }]))
    await expect(formalApi(http).dataSpace.design.readRelations(formalInput)).rejects.toThrow()
  })

  it('normalizes the backend record identity spelling before projecting relations', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([{ ROWID: 'REL-1', DataSetId: 'SPACE-1', ParentModId: 'MODEL-1',
      ChildModId: 'MODEL-2', ParentTable: 'Orders', ChildTable: 'OrderLines', DepType: 'currentRow',
      cascadeDel: 1, Filter: formalRelation()['filter'] }]))
    expect(await formalApi(http).dataSpace.design.readRelations(formalInput)).toMatchObject([
      { sourceRelationId: 'REL-1', dataSpaceId: 'SPACE-1', parentModelId: 'MODEL-1', childModelId: 'MODEL-2',
        parentResourceName: 'Orders', childResourceName: 'OrderLines', dependencyType: 'currentRow', cascadeDelete: true },
    ])
  })

  it('rejects duplicate or incomplete relation pages', async () => {
    for (const result of [formalResult([formalRelation(), formalRelation()]), formalResult([formalRelation()], 501)]) {
      const http = new DataSpaceFormalFixtureHttpClient()
      http.results.push(result)
      await expect(formalApi(http).dataSpace.design.readRelations(formalInput)).rejects.toThrow()
    }
  })

  it('accepts a complete empty relation set', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([]))
    expect(await formalApi(http).dataSpace.design.readRelations(formalInput)).toEqual([])
  })

  it('rejects late results after the request identity changes', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const api = formalApi(http)
    http.results.push(formalResult([formalRelation()]))
    http.onResponse = () => { api.application.clear() }
    await expect(api.dataSpace.design.readRelations(formalInput)).rejects.toThrow('SPARK_EXECUTION_SCOPE')
  })

  it('checks the page instance before issuing relation queries', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    await expect(formalApi(http).dataSpace.design.readRelations({ ...formalInput,
      assertCurrent: () => { throw new Error('PAGE_INSTANCE_STALE') } })).rejects.toThrow('PAGE_INSTANCE_STALE')
    expect(http.requests).toHaveLength(0)
  })
})

describe('DataSpaceDesignApi relation dependency options', () => {
  it('reads the application dictionary across pages, maps zero values, and sorts by ordIdx', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const api = formalApi(http)
    const laterRows = Array.from({ length: 500 }, (_, index) => ({ rowid: `DEP-${index + 2}`,
      ordIdx: index + 2, txt: `项${index + 2}`, val: index === 0 ? 0 : `V${index + 2}` }))
    http.results.push(formalResult(laterRows, 501), formalResult([{ rowid: 'DEP-1', ordIdx: 1, txt: '第一项', val: 'A' }], 501))

    const options = await api.dataSpace.design.readRelationDependencyOptions()
    expect(options).toHaveLength(501)
    expect(options.slice(0, 2)).toEqual([{ label: '第一项', value: 'A' }, { label: '项2', value: '0' }])
    expect(http.requests).toHaveLength(2)
    expect(http.requests[0]?.url).toBe('/api/DataOperation/GetData')
    expect(http.requests[0]?.headers).toMatchObject({ 'x-FormKey': '', 'X-AppId': 'APP-1' })
    expect(http.requests[0]?.data).toEqual({ Table: [{ Name: '数据关系依赖', Type: '字典',
      PrimaryKeyFields: 'rowid', OutputType: 'Table', Filter: null, inputParams: [],
      DISTINCT: false, IsBusinessMain: 1 }], PageParam: { index: 1, size: 500 } })
    expect(http.requests[1]?.data).toMatchObject({ PageParam: { index: 2, size: 500 } })
  })

  it('rejects stale scope and empty or incomplete dictionary responses', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const api = formalApi(http)
    http.results.push(formalResult([{ ordIdx: 1, txt: '项', val: 'A' }]))
    http.onResponse = () => { api.application.clear() }
    await expect(api.dataSpace.design.readRelationDependencyOptions()).rejects.toThrow(/SPARK_EXECUTION_SCOPE/)

    for (const rows of [[], [{ ordIdx: 1, val: 'A' }], [{ ordIdx: 1, txt: '项' }],
      [{ ordIdx: 1, txt: { unexpected: true }, val: 'A' }], [{ ordIdx: 1, txt: '项', val: { unexpected: true } }]]) {
      const nextHttp = new DataSpaceFormalFixtureHttpClient()
      nextHttp.results.push(formalResult(rows))
      await expect(formalApi(nextHttp).dataSpace.design.readRelationDependencyOptions()).rejects.toThrow()
    }
  })
})

describe('DataSpaceDesignApi selected formal model reader', () => {
  it('resolves equivalent output records once without mutating the formal model and rejects semantic conflicts', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const duplicate = { ...(formalFields()[1] ?? {}), rowid: 'FIELD-2-DUPLICATE',
      ValueFun: { Value: 0, Extra: [false, ''], Type: 'GetConstValue' } }
    http.results.push(formalResult([formalModel()]), formalResult([...formalFields(), duplicate]), ...sourceResults())
    const model = await formalApi(http).dataSpace.design.readModel(formalInput)

    expect(model.fields).toHaveLength(3)
    expect(DataSpaceDesignApi.resolveOutputFields(model).map(field => field.canonicalName)).toEqual(['orderId', 'amount'])
    expect(model.fields).toHaveLength(3)

    const amount = model.fields.find(field => field.name === 'amount')
    if (!amount) throw new Error('missing amount fixture')
    const conflicting = { ...model, fields: [...model.fields, { ...amount,
      id: 'FIELD-2-CONFLICT', description: 'different output semantics' }] }
    expect(() => DataSpaceDesignApi.resolveOutputFields(conflicting)).toThrow('正式模型输出字段重复')
  })

  it.each([
    { label: 'source name', change: { Name: 'amountAlias', AsName: 'amount' } },
    { label: 'type', change: { FieldType: 'decimal' } },
    { label: 'computed status', change: { ValueFun: '' } },
    { label: 'order', change: { Order: 8 } },
    { label: 'Group', change: { Group: 1 } },
    { label: 'Distinct', change: { Distinct: true } },
    { label: 'ValueFun', change: { ValueFun: { Type: 'GetConstValue', Value: 7, Extra: [false, ''] } } },
    { label: 'Value', change: { Value: 'different' } },
  ])('rejects duplicate outputs with different $label semantics', async ({ change }) => {
    const fields = formalFields()
    const source = fields.find(field => field['Name'] === 'amount')
    if (!source) throw new Error('missing amount fixture')
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([formalModel()]), formalResult([...fields,
      { ...source, ...change, rowid: 'FIELD-2-CONFLICT', AsName: 'amount' }]), ...sourceResults())
    const model = await formalApi(http).dataSpace.design.readModel(formalInput)
    expect(() => DataSpaceDesignApi.resolveOutputFields(model)).toThrow('正式模型输出字段重复')
  })

  it('distinguishes a missing raw value from null while comparing semantic JSON independent of key order', async () => {
    const fields = formalFields()
    const source = fields.find(field => field['Name'] === 'amount')
    if (!source) throw new Error('missing amount fixture')
    const withoutValueFun = { ...source }
    delete withoutValueFun['ValueFun']
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([formalModel()]), formalResult([...fields.map(field => field['Name'] === 'amount'
      ? withoutValueFun : field), { ...withoutValueFun, rowid: 'FIELD-2-DUPLICATE',
      ValueFun: null }]), ...sourceResults())
    const model = await formalApi(http).dataSpace.design.readModel(formalInput)
    expect(() => DataSpaceDesignApi.resolveOutputFields(model)).toThrow('正式模型输出字段重复')
  })

  it('reads only the selected model and its source, verifies output key aliases and preserves structured definitions', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([formalModel()]), formalResult(formalFields()), ...sourceResults())
    const model = await formalApi(http).dataSpace.design.readModel(formalInput)
    expect(model).toMatchObject({ id: 'MODEL-1', metaName: 'Orders', sourceName: 'OrderRows', sourceId: 'DB-1',
      primaryKey: 'orderId', fields: [{ canonicalName: 'orderId', primaryKey: true, output: true, computed: false },
        { name: 'amount', computed: true, raw: { ValueFun: { Type: 'GetConstValue', Value: 0, Extra: [false, ''] } } }],
      raw: { Filter: formalModel()['Filter'] } })
    expect(Object.isFrozen(model)).toBe(true)
    expect(http.requests).toHaveLength(4)
    expect(http.requests.every(request => request.url === '/api/DataOperation/GetData'
      && request.headers?.['x-FormKey'] === 'DESIGN-1' && request.headers?.['X-AppId'] === 'APP-1')).toBe(true)
    expect(http.requests[0]?.data).toMatchObject({ PageParam: { index: 1, size: 2 }, Table: [{ Name: 'Base_DataModel',
      Filter: { Type: 'and', Filters: [{ Field: 'dataSetId', ValueFun: { Value: 'SPACE-1' } },
        { Field: 'Name', ValueFun: { Value: 'Orders' } }] } }] })
    expect(http.requests[1]?.data).toMatchObject({ Table: [{ Name: 'Base_DataModel_Field', Filter: { Filters: [
      { Field: 'dataSetId' }, { Field: 'dataModelId', ValueFun: { Value: 'MODEL-1' } }, { Field: 'type' },
    ] } }] })
    expect(http.requests[2]?.data).toMatchObject({ Table: [{ Name: 'View_TblList' }] })
  })

  it('supports non-database sources without consulting a physical catalog', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([{ ...formalModel(), Type: 'JSON', PrimaryKeyFields: 'orderId' }]),
      formalResult(formalFields().map(field => field['Name'] === 'rowid' ? { ...field, IsPKey: 1 } : field)))
    expect((await formalApi(http).dataSpace.design.readModel(formalInput)).primaryKey).toBe('orderId')
    expect(http.requests).toHaveLength(2)
  })

  it.each([{ dataSetId: 'FOREIGN' }, { Name: 'Other' }, { rowid: '' }, { MetaName: '' }])(
    'rejects foreign or invalid selected model identity %j', async change => {
      const http = new DataSpaceFormalFixtureHttpClient()
      http.results.push(formalResult([{ ...formalModel(), ...change }]))
      await expect(formalApi(http).dataSpace.design.readModel(formalInput)).rejects.toThrow()
      expect(http.requests).toHaveLength(1)
    })

  it.each([{ dataModelId: 'FOREIGN' }, { dataSetId: 'FOREIGN' }, { type: 'resource' },
    { IsOutput: 0 }, { Expression: 'rowid+1' }, { ValueFun: { Type: 'GetConstValue', Value: 'fake' } }])(
    'rejects invalid field ownership or primary-key output %j', async change => {
      const http = new DataSpaceFormalFixtureHttpClient()
      const fields = formalFields()
      const key = fields[0]
      if (!key) throw new Error('missing field fixture')
      fields[0] = { ...key, ...change }
      http.results.push(formalResult([formalModel()]), formalResult(fields), ...sourceResults())
      await expect(formalApi(http).dataSpace.design.readModel(formalInput)).rejects.toThrow()
    })

  it('rejects duplicate selected models and incomplete model responses', async () => {
    for (const result of [formalResult([formalModel(), formalModel()]), formalResult([formalModel()], 3),
      { data: { Items: [formalModel()] } }]) {
      const http = new DataSpaceFormalFixtureHttpClient()
      http.results.push(result)
      await expect(formalApi(http).dataSpace.design.readModel(formalInput)).rejects.toThrow()
      expect(http.requests).toHaveLength(1)
    }
  })

  it('collects every model field page before validating the selected key', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const fields = [...formalFields(), ...Array.from({ length: 499 }, (_, index) => ({ rowid: `F-${index}`,
      dataSetId: 'SPACE-1', dataModelId: 'MODEL-1', type: 'dataModel', Name: `extra${index}`, IsOutput: 1 }))]
    http.results.push(formalResult([formalModel()]), formalResult(fields.slice(0, 500), 501),
      formalResult(fields.slice(500), 501), ...sourceResults())
    const model = await formalApi(http).dataSpace.design.readModel(formalInput)
    expect(model.fields).toHaveLength(501)
    expect(http.requests[2]?.data).toMatchObject({ PageParam: { index: 2, size: 500 } })
  })

  it('rejects a late metadata response after request identity changes', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const api = formalApi(http)
    http.results.push(formalResult([formalModel()]))
    http.onResponse = () => { api.application.clear() }
    await expect(api.dataSpace.design.readModel(formalInput)).rejects.toThrow('SPARK_EXECUTION_SCOPE')
    expect(http.requests).toHaveLength(1)
  })

  it.each([
    formalResult([]),
    formalResult([{ rowid: 'SOURCE-1', tblname: 'Wrong', dbid: 'DB-1' }]),
    formalResult([{ rowid: 'SOURCE-1', tblname: 'OrderRows', dbid: 'Other' }]),
    formalResult([{ rowid: 'SOURCE-1', tblname: 'OrderRows', dbid: 'DB-1' }], 2),
  ])('rejects absent, foreign or incomplete formal sources', async result => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([formalModel()]), formalResult(formalFields()), result)
    await expect(formalApi(http).dataSpace.design.readModel(formalInput)).rejects.toThrow('数据库表来源')
    expect(http.requests).toHaveLength(3)
  })

  it.each([
    [{ rowid: 'F-1', tblid: 'FOREIGN', enname: 'rowid', IsPKey: 1 }],
    [{ rowid: 'F-1', tblid: 'SOURCE-1', enname: 'lingma_sys_ent', IsPKey: 1 }],
    [{ rowid: 'F-1', tblid: 'SOURCE-1', enname: 'rowid', IsPKey: 1 },
      { rowid: 'F-2', tblid: 'SOURCE-1', enname: 'code', IsPKey: 1 }],
  ].map(fields => ({fields})))('rejects invalid source field ownership or multiple business keys', async ({fields}) => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([formalModel()]), formalResult(formalFields()), sourceResults()[0], formalResult(fields))
    await expect(formalApi(http).dataSpace.design.readModel(formalInput)).rejects.toThrow()
    expect(http.requests).toHaveLength(4)
  })

  it('rejects output aliases that collide with the verified key', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const fields = formalFields().map(field => field['Name'] === 'amount' ? { ...field, AsName: 'orderId' } : field)
    http.results.push(formalResult([formalModel()]), formalResult(fields), ...sourceResults())
    await expect(formalApi(http).dataSpace.design.readModel(formalInput)).rejects.toThrow('唯一有效输出字段')
  })

  it('rejects duplicate formal field records and incomplete subsequent pages', async () => {
    for (const result of [formalResult([formalFields()[0] ?? {}, formalFields()[0] ?? {}]),
      formalResult(formalFields(), 501)]) {
      const http = new DataSpaceFormalFixtureHttpClient()
      http.results.push(formalResult([formalModel()]), result)
      await expect(formalApi(http).dataSpace.design.readModel(formalInput)).rejects.toThrow()
      expect(http.requests).toHaveLength(2)
    }
  })

  it('honors the caller instance guard before issuing metadata queries', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    await expect(formalApi(http).dataSpace.design.readModel({ ...formalInput,
      assertCurrent: () => { throw new Error('PAGE_INSTANCE_STALE') } })).rejects.toThrow('PAGE_INSTANCE_STALE')
    expect(http.requests).toHaveLength(0)
  })
})

describe('DataSpaceDesignApi formal model list', () => {
  it('discovers actual model Names and delivers each verified formal contract without catalog expansion', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const second = { ...formalModel(), rowid: 'MODEL-2', Name: 'OtherOrders', Type: 'JSON', PrimaryKeyFields: 'orderId' }
    http.results.push(formalResult([formalModel(), second]),
      formalResult([formalModel()]), formalResult(formalFields()), ...sourceResults(),
      formalResult([second]), formalResult(formalFields().map(field => ({ ...field,
        rowid: `${String(field['rowid'])}-2`, dataModelId: 'MODEL-2', IsPKey: field['Name'] === 'rowid' ? 1 : 0 }))))
    const models = await formalApi(http).dataSpace.design.readModels(formalInput)
    expect(models).toMatchObject([{ id: 'MODEL-1', metaName: 'Orders', primaryKey: 'orderId' },
      { id: 'MODEL-2', metaName: 'OtherOrders', primaryKey: 'orderId' }])
    expect(Object.isFrozen(models)).toBe(true)
    expect(http.requests).toHaveLength(7)
    expect(http.requests[0]?.data).toMatchObject({ Table: [{ Name: 'Base_DataModel',
      Filter: { Field: 'dataSetId', ValueFun: { Value: 'SPACE-1' } } }], PageParam: { index: 1, size: 500 } })
    expect(http.requests.every(request => request.url === '/api/DataOperation/GetData'
      && request.headers?.['x-FormKey'] === 'DESIGN-1' && request.headers?.['X-AppId'] === 'APP-1')).toBe(true)
  })

  it('reads all list pages before validating scene ownership and issuing selected queries', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const rows = Array.from({ length: 501 }, (_, index) => ({ ...formalModel(), rowid: `MODEL-${index}`,
      Name: `Model${index}`, dataSetId: index === 500 ? 'FOREIGN' : 'SPACE-1' }))
    http.results.push(formalResult(rows.slice(0, 500), 501), formalResult(rows.slice(500), 501))
    await expect(formalApi(http).dataSpace.design.readModels(formalInput)).rejects.toThrow('归属')
    expect(http.requests).toHaveLength(2)
    expect(http.requests[1]?.data).toMatchObject({ PageParam: { index: 2, size: 500 } })
  })

  it.each([
    [formalModel(), { ...formalModel(), rowid: 'MODEL-2' }],
    [{ ...formalModel(), Name: '' }],
    [formalModel(), formalModel()],
  ].map(rows => ({ rows })))('rejects ambiguous names and invalid identities before loading any model', async ({ rows }) => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult(rows))
    await expect(formalApi(http).dataSpace.design.readModels(formalInput)).rejects.toThrow()
    expect(http.requests).toHaveLength(1)
  })

  it('rejects identity replacement between discovery and formal readback', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([formalModel()]), formalResult([{ ...formalModel(), rowid: 'REPLACED' }]),
      formalResult(formalFields().map(field => ({ ...field, dataModelId: 'REPLACED' }))), ...sourceResults())
    await expect(formalApi(http).dataSpace.design.readModels(formalInput)).rejects.toThrow('身份改变')
  })

  it('accepts an empty complete scene without inventing a default model', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([]))
    expect(await formalApi(http).dataSpace.design.readModels(formalInput)).toEqual([])
    expect(http.requests).toHaveLength(1)
  })

  it('rejects late discovery after the request scope changes', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const api = formalApi(http)
    http.results.push(formalResult([formalModel()]))
    http.onResponse = () => { api.application.clear() }
    await expect(api.dataSpace.design.readModels(formalInput)).rejects.toThrow('SPARK_EXECUTION_SCOPE')
    expect(http.requests).toHaveLength(1)
  })

  it('honors caller instance guards before discovery', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    await expect(formalApi(http).dataSpace.design.readModels({ ...formalInput,
      assertCurrent: () => { throw new Error('PAGE_INSTANCE_STALE') } })).rejects.toThrow('PAGE_INSTANCE_STALE')
    expect(http.requests).toHaveLength(0)
  })
})
