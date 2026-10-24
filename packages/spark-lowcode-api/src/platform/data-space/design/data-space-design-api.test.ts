import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { DataViewFilter, DataViewFilterCodec, DataViewFilterLocal } from '@spark-appworks/spark-data'
import { describe, expect, it, vi } from 'vitest'

import { LowcodeApi } from '../../../lowcode-api.js'
import { DataSpaceDesignApi } from './data-space-design-api.js'
import { encodeDataSpaceResourceType, parseDataSpaceResourceType } from '../data-space-resource-type-wire.js'

it('decodes metadata query relations with the same formal contract, without mutating wire rows', () => {
  const row = {rowid: 'R', dataSetId: 'S', parentModId: 'P', childModId: 'C', parentTable: 'Parents', childTable: 'Children',
    filter: JSON.stringify({Type: 'and', Filters: [
      {Type: 'cond', Field: 'active', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: false}},
    ]}), depType: 'selectedRows', cascadeDel: '1'}
  const original = structuredClone(row), decoded = DataSpaceDesignApi.decodeRelations([row])
  expect(decoded[0]).toMatchObject({sourceRelationId: 'R', dataSpaceId: 'S', parentModelId: 'P', childModelId: 'C',
    parentResourceName: 'Parents', childResourceName: 'Children', dependencyType: 'selectedRows', cascadeDelete: true})
  expect(decoded[0]!.filterExpression.toJSON()).toEqual({logic: 'and', filters: [{field: 'active', operator: 'eq', value: false}]})
  expect(row).toEqual(original); expect(Object.isFrozen(decoded)).toBe(true)
  expect(DataSpaceDesignApi.decodeRelations([])).toEqual([])
  expect(() => DataSpaceDesignApi.decodeRelations([{...row, parentModId: ''}])).toThrow('parentModId')
  expect(() => DataSpaceDesignApi.decodeRelations([{...row, filter: 'invalid'}])).toThrow()
})

it('resolves native table resource semantics from the formal source without I/O', () => {
  const model = {id: 'MODEL-1', metaName: 'QueryOrders', name: 'QueryOrders', sourceName: 'physical_orders',
    sourceId: 'DB-1', sourceType: '数据库表', primaryKey: 'rowid', businessMain: false, fields: [], raw: {}}
  expect(DataSpaceDesignApi.resolveTableResource(model)).toEqual({resourceType: 'database-table', resourceId: 'physical_orders'})
  expect(DataSpaceDesignApi.resolveTableResource({sourceType: model.sourceType, sourceName: model.sourceName})).toEqual({resourceType: 'database-table', resourceId: 'physical_orders'})
  expect(model.metaName).toBe('QueryOrders')
  expect(model.sourceId).toBe('DB-1')
})

it.each([
  ['数据库表', 'database-table'], ['表', 'database-table'], ['table', 'database-table'],
  ['数据库视图', 'database-view'], ['视图', 'logical-view'], ['字典', 'dictionary'],
  ['接口', 'third-party-api'], ['JSON', 'json'], ['文件', 'file'],
])('maps formal Type %s to native resource type %s without altering the source name', (sourceType, native) => {
  const model = {id: 'MODEL-1', metaName: 'QueryOrders', name: 'QueryOrders', sourceName: '  source.name  ',
    sourceId: 'DB-1', sourceType, primaryKey: 'rowid', businessMain: false, fields: [], raw: {}}
  expect(DataSpaceDesignApi.resolveTableResource(model)).toEqual({resourceType: native, resourceId: '  source.name  '})
  expect(model.sourceName).toBe('  source.name  ')
})

it.each(['', 'unknown', '__proto__', 'constructor', 'database-table'])('rejects unknown formal Type %s', sourceType => {
  const model = {id: 'MODEL-1', metaName: 'QueryOrders', name: 'QueryOrders', sourceName: 'source',
    sourceId: 'DB-1', sourceType, primaryKey: 'rowid', businessMain: false, fields: [], raw: {}}
  expect(() => DataSpaceDesignApi.resolveTableResource(model)).toThrow('未知正式模型资源类型')
})

it('rejects missing source names and retains legacy wire parse and encode behavior', () => {
  const model = {id: 'MODEL-1', metaName: 'QueryOrders', name: 'QueryOrders', sourceName: ' ',
    sourceId: 'DB-1', sourceType: '数据库表', primaryKey: 'rowid', businessMain: false, fields: [], raw: {}}
  expect(() => DataSpaceDesignApi.resolveTableResource(model)).toThrow('来源名')
  expect(parseDataSpaceResourceType('数据库视图')).toBe('view')
  expect(encodeDataSpaceResourceType('view')).toBe('视图')
  expect(() => parseDataSpaceResourceType('table')).toThrow('未知数据资源类型')
  expect(() => parseDataSpaceResourceType('__proto__')).toThrow('未知数据资源类型')
  expect(() => Reflect.apply(encodeDataSpaceResourceType, undefined, ['__proto__'])).toThrow('未知数据资源类型')
})

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

})

type FormalDesignRow = Readonly<Record<string, unknown>>

class DataSpaceFormalFixtureHttpClient extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly results: unknown[] = []
  readonly tableResults = new Map<string, unknown[]>()
  resolveResult: ((config: RequestConfig) => unknown) | undefined
  beforeResponse: ((tableName: string) => Promise<void>) | undefined
  onResponse: (() => void) | undefined
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const tableName = (config.data as {Table: Array<{Name: string}>}).Table[0]?.Name ?? ''
    const result = this.resolveResult ? this.resolveResult(config) : (this.tableResults.get(tableName) ?? this.results).shift()
    if (result === undefined) throw new Error('Unexpected formal metadata query')
    await this.beforeResponse?.(tableName)
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
const formalSpaceInput = { designScenarioId: 'DESIGN-1', dataSpaceId: 'SPACE-1' }
function formalSpaceRow(change: Record<string, unknown> = {}): FormalDesignRow {
  return { rowid: 'SPACE-1', Name: '  薪资正式空间  ', inputParams: '[secret]',
    lingma_sys_key: 'ROW-KEY', lingma_sys_params: { r: ['rowid', 'Name'] }, ...change }
}
describe('DataSpaceDesignApi formal space definition', () => {
  it('reads only rowid and Name once with the target filter and preserves the formal Name', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([formalSpaceRow()]))
    const space = await formalApi(http).dataSpace.design.readSpaceDefinition(formalSpaceInput)
    expect(space).toEqual({dataSpaceId: 'SPACE-1', name: '  薪资正式空间  '})
    expect(Object.isFrozen(space)).toBe(true)
    expect(http.requests).toHaveLength(1)
    expect(http.requests[0]?.data).toMatchObject({Table: [{Name: 'Base_DataSet',
      Filter: {Field: 'rowid', ValueFun: {Value: 'SPACE-1'}},
      Fields: [{Name: 'rowid', IsOutput: true}, {Name: 'Name', IsOutput: true}]}],
    PageParam: {index: 1, size: 2}})
    expect(http.requests[0]?.headers).toMatchObject({'x-FormKey': 'DESIGN-1'})
  })

  it.each([
    formalResult([]), formalResult([formalSpaceRow()], 2),
    formalResult([formalSpaceRow(), formalSpaceRow()]),
    formalResult([formalSpaceRow({rowid: 'OTHER'})]),
    formalResult([formalSpaceRow({Name: ''})]),
    formalResult([formalSpaceRow({Name: 7})]),
    formalResult([formalSpaceRow({lingma_sys_params: {h: ['Name']}})]),
    formalResult([formalSpaceRow({lingma_sys_params: {r: ['rowid', 'Name'], m: ['Name']}})]),
    formalResult([formalSpaceRow({lingma_sys_params: {h: ['rowid']}})]),
  ])('rejects absent, ambiguous, foreign, invalid or unreadable formal names', async result => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(result)
    await expect(formalApi(http).dataSpace.design.readSpaceDefinition(formalSpaceInput)).rejects.toThrow()
    expect(http.requests).toHaveLength(1)
  })

  it('rejects stale scope and caller guard without delivering the name', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const api = formalApi(http)
    http.results.push(formalResult([formalSpaceRow()]))
    http.onResponse = () => { api.application.clear() }
    await expect(api.dataSpace.design.readSpaceDefinition(formalSpaceInput)).rejects.toThrow('SPARK_EXECUTION_SCOPE')
    const untouched = new DataSpaceFormalFixtureHttpClient()
    await expect(formalApi(untouched).dataSpace.design.readSpaceDefinition({...formalSpaceInput,
      assertCurrent: () => {throw new Error('PAGE_INSTANCE_STALE')}})).rejects.toThrow('PAGE_INSTANCE_STALE')
    expect(untouched.requests).toHaveLength(0)
  })
})
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
  it.each(['complete', 'stale-scope', 'invalid-source'])(
    'reads independent source metadata while model fields are pending and handles %s', async outcome => {
      const http = new DataSpaceFormalFixtureHttpClient()
      const api = formalApi(http)
      let release = () => {}
      const gate = new Promise<void>(resolve => {release = resolve})
      const completed: string[] = []
      http.tableResults.set('Base_DataModel', [formalResult([formalModel()])])
      http.tableResults.set('Base_DataModel_Field', [formalResult(formalFields())])
      http.tableResults.set('View_TblList', [sourceResults()[0]])
      http.tableResults.set('Base_TblField', [outcome === 'invalid-source' ? formalResult([]) : sourceResults()[1]])
      http.beforeResponse = async name => {
        if (name === 'Base_DataModel_Field') await gate
        completed.push(name)
      }
      let settled = false
      const pending = api.dataSpace.design.readModel(formalInput).then(
        model => {settled = true; return {model, error: null}},
        (error: unknown) => {settled = true; return {model: null, error}})
      try {
        await vi.waitFor(() => expect(completed).toContain('Base_TblField'))
        expect(settled).toBe(false)
        if (outcome === 'stale-scope') api.application.clear()
      } finally {release(); await pending}
      const result = await pending
      if (outcome === 'complete') expect(result.model).toMatchObject({primaryKey: 'orderId', fields: formalFields().map(field => ({id: field['rowid']}))})
      else {
        expect(result.model).toBeNull()
        expect(result.error).toBeInstanceOf(Error)
        expect(String(result.error)).toMatch(outcome === 'stale-scope' ? /SPARK_EXECUTION_SCOPE/ : /正式来源/)
      }
      expect(http.requests).toHaveLength(4)
    })

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

  it.each([{property: 'Expression', ruleId: 'RULE-ID'}, {property: 'expression', ruleId: 'RULE-ID'},
    {property: 'Expression', ruleId: 'rowid+1'}])('preserves $property rule IDs without turning source fields or keys into computed outputs: $ruleId', async ({property, ruleId}) => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const fields = formalFields().map(field => ({...field, ValueFun: '', [property]: ruleId}))
    http.results.push(formalResult([formalModel()]), formalResult(fields), ...sourceResults())
    const model = await formalApi(http).dataSpace.design.readModel(formalInput)
    expect(model.primaryKey).toBe('orderId')
    expect(model.fields.every(field => !field.computed)).toBe(true)
    expect(model.fields.map(field => field.raw[property])).toEqual([ruleId, ruleId])
    expect(fields.every(field => field[property] === ruleId)).toBe(true)
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

  it.each(['single', 'batch'])('reads a field-declared dictionary primary key through the %s formal owner', async mode => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([{...formalModel(), Type: '字典', PrimaryKeyFields: ''}]),
      formalResult(formalFields().map(field => field['Name'] === 'rowid' ? {...field, IsPKey: 1} : field)))
    const api = formalApi(http).dataSpace.design
    const model = mode === 'single' ? await api.readModel(formalInput)
      : (await api.readModelBatch({...formalSpaceInput, metaNames: ['Orders']}))[0]
    expect(model?.primaryKey).toBe('orderId')
    expect(model?.fields.find(field => field.name === 'rowid')).toMatchObject({primaryKey: true, output: true, canonicalName: 'orderId'})
    expect(http.requests).toHaveLength(2)
  })

  it.each(['字典', 'JSON', '文件', '数据库视图', '接口', '视图'])('uses the declared field identity instead of inventing rowid for %s', async sourceType => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([{...formalModel(), Type: sourceType, PrimaryKeyFields: null}]),
      formalResult(formalFields().map(field => field['Name'] === 'rowid'
        ? {...field, Name: 'sourceCode', AsName: 'publicCode', IsPKey: '1'} : field)))
    if (sourceType === '接口' || sourceType === '视图') http.results.push(formalResult([]))
    const model = await formalApi(http).dataSpace.design.readModel(formalInput)
    expect(model.primaryKey).toBe('publicCode')
    expect(model.fields.find(field => field.name === 'sourceCode')?.primaryKey).toBe(true)
    for (const request of http.requests) expect(request.data).toMatchObject({
      Table: [{Name: expect.stringMatching(/^Base_DataModel(?:_Field)?$/)}],
    })
  })

  it.each(['single', 'batch'].flatMap(mode => ['not-output', 'computed', 'multiple', 'duplicate', 'alias-collision', 'tenant', 'explicit-mismatch']
    .map(kind => ({mode, kind}))))('rejects $kind field-key evidence through $mode reading', async ({mode, kind}) => {
    const http = new DataSpaceFormalFixtureHttpClient()
    const fields: FormalDesignRow[] = formalFields().map(field => field['Name'] === 'rowid' ? {...field, IsPKey: 1} : {...field})
    const key = fields[0], other = fields[1]
    if (!key || !other) throw new Error('missing field fixture')
    if (kind === 'not-output') fields[0] = {...key, IsOutput: 0}
    if (kind === 'computed') fields[0] = {...key, ValueFun: {Type: 'GetConstValue', Value: 1}}
    if (kind === 'multiple') fields[1] = {...other, IsPKey: 1}
    if (kind === 'duplicate') fields.push({...key, rowid: 'DUPLICATE-KEY'})
    if (kind === 'alias-collision') fields[1] = {...other, AsName: key['AsName']}
    if (kind === 'tenant') fields[0] = {...key, Name: 'lingma_sys_ent'}
    http.results.push(formalResult([{...formalModel(), Type: '字典', PrimaryKeyFields: kind === 'explicit-mismatch' ? 'missingKey' : ''}]),
      formalResult(fields))
    const api = formalApi(http).dataSpace.design
    await expect(mode === 'single' ? api.readModel(formalInput)
      : api.readModelBatch({...formalSpaceInput, metaNames: ['Orders']})).rejects.toThrow('唯一有效输出字段')
  })

  it.each(['model', 'field'])('rejects unreadable %s primary-key evidence through the single formal owner', async kind => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([{...formalModel(), Type: '字典',
      ...(kind === 'model' ? {lingma_sys_params: {h: ['PrimaryKeyFields']}} : {})}]),
    formalResult(formalFields().map(field => field['Name'] === 'rowid'
      ? {...field, IsPKey: 1, ...(kind === 'field' ? {lingma_sys_params: {m: ['IsPKey']}} : {})} : field)))
    await expect(formalApi(http).dataSpace.design.readModel(formalInput)).rejects.toThrow(/不可读|脱敏/)
  })

  it('reads a non-table model with no declared or field primary key as keyless', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult([{ ...formalModel(), Type: '字典', PrimaryKeyFields: '' }]),
      formalResult(formalFields()))
    const model = await formalApi(http).dataSpace.design.readModel(formalInput)
    expect(model.primaryKey).toBe('')
    expect(model.fields.every(field => !field.primaryKey)).toBe(true)
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
    { IsOutput: 0 }, { ValueFun: { Type: 'GetConstValue', Value: 'fake' } }])(
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
    http.tableResults.set('Base_DataModel', [formalResult([formalModel()])])
    http.tableResults.set('Base_DataModel_Field', [formalResult(fields.slice(0, 500), 501), formalResult(fields.slice(500), 501)])
    http.tableResults.set('View_TblList', [sourceResults()[0]])
    http.tableResults.set('Base_TblField', [sourceResults()[1]])
    const model = await formalApi(http).dataSpace.design.readModel(formalInput)
    expect(model.fields).toHaveLength(501)
    expect(http.requests.map(request => request.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({Table: [expect.objectContaining({Name: 'Base_DataModel_Field'})], PageParam: {index: 2, size: 500}}),
    ]))
    expect(http.requests).toHaveLength(5)
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
      http.results.push(formalResult([formalModel()]), result, ...sourceResults())
      await expect(formalApi(http).dataSpace.design.readModel(formalInput)).rejects.toThrow(/正式记录 ID|SPARK 批量查询/)
      expect(http.requests).toHaveLength(4)
    }
  })

  it('honors the caller instance guard before issuing metadata queries', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    await expect(formalApi(http).dataSpace.design.readModel({ ...formalInput,
      assertCurrent: () => { throw new Error('PAGE_INSTANCE_STALE') } })).rejects.toThrow('PAGE_INSTANCE_STALE')
    expect(http.requests).toHaveLength(0)
  })
})

describe('DataSpaceDesignApi formal model batch', () => {
  const batchInput = {...formalSpaceInput, metaNames: ['Orders', 'OtherOrders']}
  const otherModel = () => ({...formalModel(), rowid: 'MODEL-2', Name: 'OtherOrders', Type: 'JSON', PrimaryKeyFields: 'orderId'})
  const otherFields = () => formalFields().map(field => ({...field, rowid: `${String(field['rowid'])}-2`,
    dataModelId: 'MODEL-2', IsPKey: field['Name'] === 'rowid' ? 1 : 0}))
  function batchHttp(fields = [...formalFields(), ...otherFields()]) {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.tableResults.set('Base_DataModel', [formalResult([otherModel(), formalModel()])])
    http.tableResults.set('Base_DataModel_Field', [formalResult(fields)])
    http.tableResults.set('View_TblList', [sourceResults()[0]])
    http.tableResults.set('Base_TblField', [sourceResults()[1]])
    return http
  }

  it('reads selected model and field sets once while preserving source keys and formal contracts', async () => {
    const http = batchHttp()
    const models = await formalApi(http).dataSpace.design.readModelBatch({...batchInput, metaNames: ['OtherOrders', 'Orders', 'Orders']})
    expect(models).toMatchObject([{id: 'MODEL-1', metaName: 'Orders', primaryKey: 'orderId'}, {id: 'MODEL-2', metaName: 'OtherOrders', primaryKey: 'orderId'}])
    expect(models.map(model => model.fields.length)).toEqual([2, 2]); expect(Object.isFrozen(models)).toBe(true)
    expect(http.requests).toHaveLength(4)
    expect(http.requests[0]?.data).toMatchObject({Table: [{Name: 'Base_DataModel', Filter: {Type: 'and', Filters: [
      {Field: 'dataSetId', ValueFun: {Value: 'SPACE-1'}}, {Field: 'Name', Operator: 'in', ValueFun: {Value: ['Orders', 'OtherOrders']}},
    ]}}]})
    expect(http.requests[1]?.data).toMatchObject({Table: [{Name: 'Base_DataModel_Field', Filter: {Filters: [
      {Field: 'dataSetId', ValueFun: {Value: 'SPACE-1'}}, {Field: 'dataModelId', ValueFun: {Value: ['MODEL-1', 'MODEL-2']}}, {Field: 'type', ValueFun: {Value: 'dataModel'}},
    ]}}]})
    expect(http.requests.every(request => request.headers?.['x-FormKey'] === 'DESIGN-1' && request.headers?.['X-AppId'] === 'APP-1')).toBe(true)
  })

  it.each([
    [], [formalModel()], [formalModel(), {...otherModel(), dataSetId: 'OTHER'}],
    [formalModel(), {...otherModel(), Name: 'Unexpected'}], [formalModel(), {...otherModel(), Name: 'Orders'}],
    [formalModel(), {...otherModel(), rowid: 'MODEL-1'}],
  ])('rejects incomplete or ambiguous model sets before field/source reads: %j', async (...rows) => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.results.push(formalResult(rows))
    await expect(formalApi(http).dataSpace.design.readModelBatch(batchInput)).rejects.toThrow()
    expect(http.requests).toHaveLength(1)
  })

  it.each([{dataSetId: 'OTHER'}, {dataModelId: 'UNKNOWN'}, {type: 'inputParams'}])('rejects fields outside the selected definition: %j', async change => {
    const http = batchHttp([{...formalFields()[0], ...change}, ...otherFields()])
    await expect(formalApi(http).dataSpace.design.readModelBatch(batchInput)).rejects.toThrow('归属')
  })

  it.each(['success', 'source-failure', 'scope', 'invalid-source'])('drains all reads while fields are pending: %s', async outcome => {
    const http = batchHttp(), api = formalApi(http)
    let release!: () => void, settled = false
    const gate = new Promise<void>(resolve => {release = resolve})
    http.beforeResponse = async table => {if (table === 'Base_DataModel_Field') await gate}
    if (outcome === 'source-failure') http.tableResults.set('Base_TblField', [formalResult([])])
    if (outcome === 'invalid-source') http.tableResults.set('Base_DataModel', [formalResult([otherModel(), {...formalModel(), DbId: ''}])])
    const pending = api.dataSpace.design.readModelBatch(batchInput).then(
      models => {settled = true; return {models, error: null}}, error => {settled = true; return {models: null, error}})
    try {
      await vi.waitFor(() => expect(http.requests).toHaveLength(outcome === 'invalid-source' ? 2 : 4)); expect(settled).toBe(false)
      if (outcome === 'scope') api.application.clear()
    } finally {release()}
    const result = await pending
    if (outcome === 'success') expect(result.models).toHaveLength(2)
    else expect(String(result.error)).toMatch(outcome === 'scope' ? /SPARK_EXECUTION_SCOPE/ : /正式来源|来源数据库/)
  })

  it.each(['model-hidden', 'field-masked'])('rejects unreadable definitions: %s', async kind => {
    const http = batchHttp()
    if (kind === 'model-hidden') http.tableResults.set('Base_DataModel', [formalResult([otherModel(),
      {...formalModel(), lingma_sys_params: {h: ['Name']}}])])
    else http.tableResults.set('Base_DataModel_Field', [formalResult([...otherFields(), ...formalFields().map(field =>
      ({...field, lingma_sys_params: {m: ['Name']}}))])])
    await expect(formalApi(http).dataSpace.design.readModelBatch(batchInput)).rejects.toThrow('不可读取或脱敏')
  })

  it('rejects incomplete field pages and accepts an explicit empty set without requests', async () => {
    const http = batchHttp()
    http.tableResults.set('Base_DataModel_Field', [formalResult(formalFields(), 501)])
    await expect(formalApi(http).dataSpace.design.readModelBatch(batchInput)).rejects.toThrow()
    const empty = new DataSpaceFormalFixtureHttpClient(), api = formalApi(empty)
    expect(await api.dataSpace.design.readModelBatch({...batchInput, metaNames: []})).toEqual([])
    await expect(api.dataSpace.design.readModelBatch({...batchInput, assertCurrent: () => {throw new Error('STALE_CALLER')}})).rejects.toThrow('STALE_CALLER')
    expect(empty.requests).toHaveLength(0)
  })

  it('preserves interface source input mappings separately from output fields in a batch', async () => {
    const http = new DataSpaceFormalFixtureHttpClient()
    http.tableResults.set('Base_DataModel', [formalResult([{...otherModel(), Type: '接口'}])])
    http.tableResults.set('Base_DataModel_Field', [formalResult(otherFields()), formalResult([
      {rowid: 'INPUT', dataSetId: 'SPACE-1', dataModelId: 'MODEL-2', type: 'inputParams', Name: 'customer',
        ValueFun: JSON.stringify({Type: 'GetInputParam', ParamName: 'customerId'})},
    ])])
    const models = await formalApi(http).dataSpace.design.readModelBatch({...batchInput, metaNames: ['OtherOrders']})
    expect(models[0]?.fields).toHaveLength(2)
    expect(models[0]?.sourceInputBindings).toEqual([{id: 'INPUT', name: 'customer', valueFunction: {Type: 'GetInputParam', ParamName: 'customerId'}}])
    expect(http.requests).toHaveLength(3)
  })

  it('shares equivalent in-flight sets but reads fresh definitions after completion', async () => {
    const http = batchHttp(), api = formalApi(http)
    const results = await Promise.all([api.dataSpace.design.readModelBatch(batchInput),
      api.dataSpace.design.readModelBatch({...batchInput, metaNames: [...batchInput.metaNames].reverse()})])
    expect(results[0]).toEqual(results[1]); expect(http.requests).toHaveLength(4)
    const fresh = batchHttp()
    for (const [table, values] of fresh.tableResults) http.tableResults.set(table, values)
    await api.dataSpace.design.readModelBatch(batchInput)
    expect(http.requests).toHaveLength(8)
  })

  it('collects all field pages before splitting them by verified model identity', async () => {
    const http = batchHttp()
    const fields = [...formalFields(), ...otherFields(), ...Array.from({length: 499}, (_, index) => ({
      ...formalFields()[1], rowid: `EXTRA-${index}`, Name: `extra${index}`,
    }))]
    http.tableResults.set('Base_DataModel_Field', [formalResult(fields.slice(0, 500), fields.length), formalResult(fields.slice(500), fields.length)])
    const models = await formalApi(http).dataSpace.design.readModelBatch(batchInput)
    expect(models.map(model => model.fields.length)).toEqual([501, 2])
    expect(http.requests).toHaveLength(5)
  })
})

describe('DataSpaceDesignApi batched source keys', () => {
  function fixture(count = 2) {
    const models = Array.from({length: count}, (_, index) => ({...formalModel(), rowid: `M-${index}`,
      Name: `Model${index}`, DbId: `DB-${index}`, MetaName: `Table${index}`, PrimaryKeyFields: `key${index}`}))
    const definitions = models.map((model, index) => ({rowid: `D-${index}`, dataSetId: 'SPACE-1', dataModelId: model.rowid,
      type: 'dataModel', Name: `key${index}`, AsName: `id${index}`, IsOutput: 1, IsPKey: 0}))
    const sources = models.map((model, index) => ({rowid: `S-${index}`, dbid: model.DbId, tblname: model.MetaName}))
    const fields: Array<Record<string, unknown>> = sources.flatMap((source, index) => [
      {rowid: `K-${index}`, tblid: source.rowid, enname: `key${index}`, IsPKey: 1},
      {rowid: `T-${index}`, tblid: source.rowid, enname: 'lingma_sys_ent', IsPKey: 1},
    ])
    const tables: Record<string, readonly FormalDesignRow[]> = {Base_DataModel: models, Base_DataModel_Field: definitions,
      View_TblList: sources, Base_TblField: fields}
    const http = new DataSpaceFormalFixtureHttpClient()
    http.resolveResult = config => {
      const request = config.data as {Table: Array<{Name: string; Filter: unknown}>; PageParam: {index: number; size: number}}
      const table = request.Table[0]
      const records = table ? tables[table.Name] : undefined
      if (!table || !records) throw new Error('Unexpected source-key fixture query')
      const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(table.Filter))
      const rows = records.filter(row => filter.matches(row))
        .sort((left, right) => String(left['rowid']).localeCompare(String(right['rowid'])))
      const offset = (request.PageParam.index - 1) * request.PageParam.size
      return formalResult(rows.slice(offset, offset + request.PageParam.size), rows.length)
    }
    return {http, models, definitions, sources, fields, tables,
      input: {...formalSpaceInput, metaNames: models.map(model => model.Name)}}
  }

  it('reads eleven distinct source keys in two scoped queries, preserving every model column identity', async () => {
    const {http, input} = fixture(11)
    const models = await formalApi(http).dataSpace.design.readModelBatch(input)
    expect(models).toHaveLength(11)
    for (const model of models) {
      const suffix = model.id.slice(2)
      expect(model).toMatchObject({primaryKey: `id${suffix}`, fields: [{id: `D-${suffix}`, modelId: model.id,
        name: `key${suffix}`, canonicalName: `id${suffix}`, primaryKey: true}]})
    }
    expect(http.requests).toHaveLength(4)
    expect(http.requests.every(request => request.headers?.['x-FormKey'] === 'DESIGN-1'
      && request.headers?.['X-AppId'] === 'APP-1')).toBe(true)
  })

  it('keeps database and table names paired without including cross-product sources', async () => {
    const {http, input, sources} = fixture()
    sources.push({rowid: 'DECOY-A', dbid: 'DB-0', tblname: 'Table1'},
      {rowid: 'DECOY-B', dbid: 'DB-1', tblname: 'Table0'})
    const models = await formalApi(http).dataSpace.design.readModelBatch(input)
    expect(models.map(model => model.primaryKey)).toEqual(['id0', 'id1'])
    expect(http.requests).toHaveLength(4)
  })

  it('reuses one physical source for distinct models without merging their field identities', async () => {
    const {http, input, models, definitions, sources, fields} = fixture()
    const second = models[1], secondField = definitions[1]
    if (!second || !secondField) throw new Error('Missing shared source fixture')
    second.DbId = 'DB-0'; second.MetaName = 'Table0'; second.PrimaryKeyFields = 'key0'; secondField.Name = 'key0'
    sources.splice(1); fields.splice(2)
    const result = await formalApi(http).dataSpace.design.readModelBatch(input)
    expect(result.map(model => ({id: model.id, key: model.primaryKey, field: model.fields[0]?.id})))
      .toEqual([{id: 'M-0', key: 'id0', field: 'D-0'}, {id: 'M-1', key: 'id1', field: 'D-1'}])
    expect(http.requests).toHaveLength(4)
  })

  it('keeps identical table names in different databases attached to their own source key', async () => {
    const {http, input, models, sources} = fixture()
    const second = models[1], secondSource = sources[1]
    if (!second || !secondSource) throw new Error('Missing database fixture')
    second.MetaName = 'Table0'; secondSource.tblname = 'Table0'
    const result = await formalApi(http).dataSpace.design.readModelBatch(input)
    expect(result.map(model => ({database: model.sourceId, key: model.primaryKey})))
      .toEqual([{database: 'DB-0', key: 'id0'}, {database: 'DB-1', key: 'id1'}])
    expect(http.requests).toHaveLength(4)
  })

  it('collects a source catalog spanning two pages without querying the entire directory', async () => {
    const {http, input, sources} = fixture(501)
    sources.push({rowid: 'UNRELATED', dbid: 'OUTSIDE', tblname: 'NotSelected'})
    const models = await formalApi(http).dataSpace.design.readModelBatch(input)
    expect(models).toHaveLength(501)
    const requests = http.requests.filter(request => (request.data as {Table: Array<{Name: string}>}).Table[0]?.Name === 'View_TblList')
    expect(requests).toHaveLength(2)
    expect(requests.map(request => (request.data as {PageParam: {index: number}}).PageParam.index)).toEqual([1, 2])
    expect(http.requests).toHaveLength(9)
  })

  it('collects all source field pages and reads fresh source keys on the next call', async () => {
    const {http, input, fields} = fixture()
    fields.push(...Array.from({length: 499}, (_, index) => ({rowid: `EXTRA-${index}`, tblid: 'S-0', enname: `value${index}`, IsPKey: 0})))
    const api = formalApi(http), models = await api.dataSpace.design.readModelBatch(input)
    expect(models.map(model => model.primaryKey)).toEqual(['id0', 'id1'])
    const fieldRequests = http.requests.filter(request => (request.data as {Table: Array<{Name: string}>}).Table[0]?.Name === 'Base_TblField')
    expect(fieldRequests).toHaveLength(2)
    expect(fieldRequests.map(request => (request.data as {PageParam: {index: number}}).PageParam.index)).toEqual([1, 2])
    const key = fields.find(field => field['rowid'] === 'K-1')
    if (!key) throw new Error('Missing key fixture')
    key['IsPKey'] = 0
    await expect(api.dataSpace.design.readModelBatch(input)).rejects.toThrow('正式来源')
  })

  it.each(['missing-source', 'duplicate-source', 'missing-key', 'multiple-keys', 'foreign-field'])(
    'rejects the whole batch when one source is invalid: %s', async kind => {
      const {http, input, sources, fields, tables} = fixture()
      if (kind === 'missing-source') sources.splice(1)
      if (kind === 'duplicate-source') sources.push({rowid: 'DUP', dbid: 'DB-1', tblname: 'Table1'})
      if (kind === 'missing-key') tables['Base_TblField'] = fields.filter(row => row['rowid'] !== 'K-1')
      if (kind === 'multiple-keys') fields.push({rowid: 'OTHER-KEY', tblid: 'S-1', enname: 'another', IsPKey: 1})
      if (kind === 'foreign-field') {
        const original = http.resolveResult
        http.resolveResult = config => (config.data as {Table: Array<{Name: string}>}).Table[0]?.Name === 'Base_TblField'
          ? formalResult([...fields, {rowid: 'FOREIGN', tblid: 'OTHER', enname: 'key', IsPKey: 1}]) : original?.(config)
      }
      await expect(formalApi(http).dataSpace.design.readModelBatch(input)).rejects.toThrow(/来源/)
    })

  it.each(['foreign-source', 'duplicate-source-id', 'duplicate-field-id', 'incomplete-source', 'incomplete-fields'])(
    'rejects malformed combined responses: %s', async kind => {
      const {http, input, sources, fields} = fixture()
      const original = http.resolveResult
      http.resolveResult = config => {
        const table = (config.data as {Table: Array<{Name: string}>}).Table[0]?.Name
        if (table === 'View_TblList') {
          if (kind === 'foreign-source') return formalResult([...sources, {rowid: 'FOREIGN', dbid: 'OTHER', tblname: 'Table0'}])
          if (kind === 'duplicate-source-id') return formalResult(sources.map(source => ({...source, rowid: 'DUP'})))
          if (kind === 'incomplete-source') return formalResult(sources, 501)
        }
        if (table === 'Base_TblField') {
          if (kind === 'duplicate-field-id') return formalResult(fields.map(field => ({...field, rowid: 'DUP'})))
          if (kind === 'incomplete-fields') return formalResult(fields, 501)
        }
        return original?.(config)
      }
      await expect(formalApi(http).dataSpace.design.readModelBatch(input)).rejects.toThrow()
    })

  it('rejects a changed request scope while a combined source-field query is pending', async () => {
    const {http, input} = fixture(), api = formalApi(http)
    let release = () => {}
    const gate = new Promise<void>(resolve => {release = resolve})
    http.beforeResponse = async table => {if (table === 'Base_TblField') await gate}
    const pending = api.dataSpace.design.readModelBatch(input).then(models => ({models, error: null}),
      (error: unknown) => ({models: null, error}))
    try {
      await vi.waitFor(() => expect(http.requests.some(request =>
        (request.data as {Table: Array<{Name: string}>}).Table[0]?.Name === 'Base_TblField')).toBe(true))
      api.application.clear()
    } finally {release()}
    expect((await pending).error).toEqual(expect.objectContaining({message: expect.stringMatching(/SPARK_EXECUTION_SCOPE/)}))
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

describe('DataTable formal field AI generation metadata', () => {
  const modelRow = {rowid: 'MODEL-AI', dataSetId: 'SPACE-AI', Name: 'AiRows', Type: '数据库表',
    MetaName: 'AI_ROWS', DbId: 'DB-AI', PrimaryKeyFields: 'rowid'}
  const fieldBase = {dataSetId: 'SPACE-AI', dataModelId: 'MODEL-AI', type: 'dataModel',
    FieldType: '字符串', IsOutput: 1, IsPKey: 0}

  function projectField(value: unknown, include = true) {
    const field = {...fieldBase, rowid: 'FIELD-AI', Name: 'title', AsName: 'titleAlias'}
    const rawField = include ? {...field, allowAIAdd: value} : field
    return DataSpaceDesignApi.projectModel(modelRow, [
      {...fieldBase, rowid: 'FIELD-PK', Name: 'rowid', IsPKey: 1}, rawField,
    ], 'rowid').fields.find(item => item.canonicalName === 'titleAlias')
  }

  it.each([
    [1, true], ['1', true], [0, false], ['0', false], [null, false], [undefined, false],
  ])('normalizes formal DB allowAIAdd=%j to the DataTable field boolean %s', (value, expected) => {
    const actual = value === undefined ? projectField(undefined, false) : projectField(value)
    expect(actual).toMatchObject({allowAIAdd: expected})
  })

  it.each([2, '2', true, false, 'true', 'false', -1, {}, []])(
    'rejects invalid formal DB allowAIAdd=%j instead of coercing it to an access flag', value => {
      expect(() => projectField(value)).toThrow(/allowAIAdd/)
    })
})
