import { describe, expect, it } from 'vitest'
import { DataViewFilter } from '@spark-appworks/spark-data'
import { encodeDataSpaceQueryOptions } from '../query/data-space-query-options'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../query/data-space-query-context'
import { DataSpaceQueryResource } from '../query/data-space-query-resource'
import { DataSpaceQueryCache } from '../query/data-space-query-cache'
import { DataSpaceRequest } from '../protocol/data-space-request'
import { collectDataSpaceQueryPages } from '../protocol/data-space-pagination'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'

class DataSpaceRequestFixtureHttp extends HttpClientBase {
  public calls: RequestConfig[] = []
  public response: unknown = { Code: 200, Result: { data: { Items: [], Count: 0 }, allowAdd: false } }
  public afterRequest?: () => void
  public beforeResponse?: () => Promise<void>

  public constructor() { super({ retry: 3 }) }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    this.afterRequest?.()
    await this.beforeResponse?.()
    return { data: this.response, status: 200, statusText: 'OK', headers: {} }
  }
}

describe('SPARK model query flight cache', () => {
  it('merges equal in-flight options independent of object property order, including singleFlight false', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const cache = new DataSpaceQueryCache({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    const identity = { scenarioId: 'SCENE', metaName: 'Orders' }
    const first = cache.query(identity, { page: { index: 1, size: 20 }, singleFlight: false })
    const second = cache.query(identity, { singleFlight: false, page: { size: 20, index: 1 } })
    const third = cache.query(identity, { page: { index: 1, size: 20 } })
    expect(await first).toBe(await second)
    expect(await first).toBe(await third)
    expect(http.calls).toHaveLength(1)
    await cache.query(identity, { page: { index: 1, size: 20 }, singleFlight: false })
    expect(http.calls).toHaveLength(2)
  })

  it('keeps different filter values and scenario/model identities on separate flights', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const cache = new DataSpaceQueryCache({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    const identity = { scenarioId: 'SCENE', metaName: 'Orders' }
    await Promise.all([
      cache.query(identity, { filter: DataViewFilter.condition({ field: 'active', operator: 'eq', value: false }) }),
      cache.query(identity, { filter: DataViewFilter.condition({ field: 'active', operator: 'eq', value: true }) }),
      cache.query({ ...identity, scenarioId: 'OTHER' }),
      cache.query({ ...identity, metaName: 'OtherModel' }),
    ])
    expect(http.calls).toHaveLength(4)
  })

  it('clears a failed flight so a later query reaches the server again', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    http.response = { Code: 403, Message: 'denied' }
    const cache = new DataSpaceQueryCache({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    const identity = { scenarioId: 'SCENE', metaName: 'Orders' }
    const results = await Promise.allSettled([cache.query(identity), cache.query(identity)])
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected'])
    expect(http.calls).toHaveLength(1)
    http.response = { Result: { data: [], allowAdd: false } }
    await cache.query(identity)
    expect(http.calls).toHaveLength(2)
  })

  it('does not reuse an old scope flight or let its cleanup remove the new scope flight', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    let token = 'S1'
    let releaseOld = () => {}
    let releaseNew = () => {}
    const oldGate = new Promise<void>(resolve => { releaseOld = resolve })
    const newGate = new Promise<void>(resolve => { releaseNew = resolve })
    http.beforeResponse = () => http.calls.length === 1 ? oldGate : newGate
    const cache = new DataSpaceQueryCache({ http, readScope: () => ({ token, headers: {} }) })
    const identity = { scenarioId: 'SCENE', metaName: 'Orders' }
    const old = cache.query(identity)
    const oldRejected = expect(old).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    token = 'S2'
    const next = cache.query(identity)
    releaseOld()
    await oldRejected
    const joined = cache.query(identity)
    releaseNew()
    expect(await next).toBe(await joined)
    expect(http.calls).toHaveLength(2)
  })

  it('invalidates every retained scenario context and rejects calls after disposal', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const cache = new DataSpaceQueryCache({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    const first = await cache.query({ scenarioId: 'SCENE', metaName: 'Orders' })
    const other = await cache.query({ scenarioId: 'OTHER', metaName: 'Orders' })
    cache.invalidate()
    expect(() => first.rows).toThrow('SPARK_QUERY_CONTEXT_STALE')
    expect(() => other.rows).toThrow('SPARK_QUERY_CONTEXT_STALE')
    await cache.query({ scenarioId: 'SCENE', metaName: 'Orders' })
    cache.dispose()
    await expect(cache.query({ scenarioId: 'SCENE', metaName: 'Orders' })).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(http.calls).toHaveLength(3)
  })
})

describe('SPARK model query execution owner', () => {
  it('executes model GetData and publishes data together with its private permission context', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    http.response = { Code: 0, Result: { primaryKeyField: 'OrderKey', allowAdd: true,
      data: { Items: [{ OrderKey: 0, name: 'first', lingma_sys_key: 'row-token',
        lingma_sys_params: { e: ['name'], r: ['name'], d: true } }], Count: 12 } } }
    const resource = new DataSpaceQueryResource({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    const context = await resource.query({ scenarioId: 'SCENE', metaName: 'Orders' }, { page: { index: 2, size: 20 } })
    expect(http.calls[0]).toMatchObject({ headers: { 'x-FormKey': 'SCENE' },
      data: { Table: [{ Name: 'Orders' }], PageParam: { index: 2, size: 20 } } })
    expect(context.rows).toEqual([{ OrderKey: 0, name: 'first' }])
    expect(context.total).toBe(12)
    expect(context.fieldAccess(0, 'name')).toMatchObject({ write: 'allowed', required: true })
    expect(context.deleteActionState(0)).toBe('enabled')
    expect(context.allowAdd).toBe(true)
  })

  it('reuses the first all-pages response and uses the original owner default of 500', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    http.afterRequest = () => {
      const index = http.calls.length
      http.response = { Code: 200, Result: { primaryKeyField: 'id', allowAdd: true,
        data: { Items: Array.from({ length: index === 1 ? 500 : 1 }, (_, offset) => ({ id: (index - 1) * 500 + offset })), Count: 501 } } }
    }
    const resource = new DataSpaceQueryResource({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    const context = await resource.query({ scenarioId: 'SCENE', metaName: 'Orders' }, { allPages: true })
    expect(http.calls.map(call => call.data)).toEqual([1, 2].map(index => ({
      Table: [{ Name: 'Orders', OutputType: 'Table', Filter: null, inputParams: [], DISTINCT: false, IsBusinessMain: 1 }],
      PageParam: { index, size: 500 },
    })))
    expect(context.rows).toHaveLength(501)
    expect(context.total).toBe(501)
  })

  it('preserves original final-page metadata without adding cross-page metadata rejection', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    http.afterRequest = () => {
      const index = http.calls.length
      http.response = { Result: { primaryKeyField: index === 1 ? 'firstKey' : 'lastKey', allowAdd: index === 2,
        data: { Items: [{ firstKey: index + 100, lastKey: index, lingma_sys_params: { e: ['name'] } }], Count: 2 } } }
    }
    const resource = new DataSpaceQueryResource({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    const context = await resource.query({ scenarioId: 'SCENE', metaName: 'Orders' }, { allPages: true, page: { index: 9, size: 1 } })
    expect(http.calls.map(call => Reflect.get(call.data ?? {}, 'PageParam'))).toEqual([{ index: 1, size: 1 }, { index: 2, size: 1 }])
    expect(context.rows).toHaveLength(2)
    expect(context.rowKey(context.rows[0] ?? {})).toBe(1)
    expect(context.allowAdd).toBe(true)
  })

  it('requires backend total for paging while preserving unpaged row-count fallback', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    http.response = { Result: { data: [{ id: 1 }] } }
    const resource = new DataSpaceQueryResource({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    await expect(resource.query({ scenarioId: 'SCENE', metaName: 'Orders' }, { page: { index: 1, size: 20 } })).rejects.toThrow('后端总数')
    expect((await resource.query({ scenarioId: 'SCENE', metaName: 'Orders' })).total).toBe(1)
  })

  it('rejects invalid all-pages limits before issuing GetData', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const resource = new DataSpaceQueryResource({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    await expect(resource.query({ scenarioId: 'SCENE', metaName: 'Orders' }, { allPages: true, maxRows: 0 })).rejects.toThrow('maxRows')
    expect(http.calls).toHaveLength(0)
  })

  it('keeps all page inputs on the captured query despite caller changes during a request', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const selection = { ids: [0] }
    const options = { allPages: true, page: { index: 1, size: 1 }, fields: ['name'],
      inputParams: [{ name: 'selection', value: selection }] }
    http.afterRequest = () => {
      http.response = { Result: { data: { Items: [{ id: http.calls.length }], Count: 2 } } }
      if (http.calls.length === 1) {
        selection.ids.push(9)
        options.fields.push('changed')
        options.page.size = 20
      }
    }
    const resource = new DataSpaceQueryResource({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    await resource.query({ scenarioId: 'SCENE', metaName: 'Orders' }, options)
    expect(http.calls[1]?.data).toMatchObject({ PageParam: { index: 2, size: 1 },
      Table: [{ Fields: [{ Name: 'name', IsOutput: true }], inputParams: [{ Name: 'selection', Value: { ids: [0] } }] }] })
  })

  it('refuses to publish a response invalidated during the actual HTTP execution', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const resource = new DataSpaceQueryResource({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    http.afterRequest = () => resource.invalidate()
    await expect(resource.query({ scenarioId: 'SCENE', metaName: 'Orders' })).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    delete http.afterRequest
    await expect(resource.query({ scenarioId: 'SCENE', metaName: 'Orders' })).resolves.toBeInstanceOf(DataSpaceQueryContext)
  })

  it('rejects a stale later page and does not publish partial data', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    let token = 'S1'
    http.afterRequest = () => {
      http.response = { Result: { data: { Items: [{ id: http.calls.length }], Count: 2 } } }
      if (http.calls.length === 2) token = 'S2'
    }
    const resource = new DataSpaceQueryResource({ http, readScope: () => ({ token, headers: {} }) })
    await expect(resource.query({ scenarioId: 'SCENE', metaName: 'Orders' }, { allPages: true, page: { index: 1, size: 1 } }))
      .rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(http.calls).toHaveLength(2)
  })

  it('invalidates published contexts and refuses new queries after disposal', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const resource = new DataSpaceQueryResource({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    const context = await resource.query({ scenarioId: 'SCENE', metaName: 'Orders' })
    resource.invalidate()
    expect(() => context.rows).toThrow('SPARK_QUERY_CONTEXT_STALE')
    const next = await resource.query({ scenarioId: 'SCENE', metaName: 'Orders' })
    resource.dispose()
    expect(() => next.rows).toThrow('SPARK_QUERY_CONTEXT_STALE')
    await expect(resource.query({ scenarioId: 'SCENE', metaName: 'Orders' })).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(http.calls).toHaveLength(2)
  })
})

describe('SPARK complete page collection', () => {
  it('collects exact pages from one and retains each raw row permission token', async () => {
    const calls: number[] = []
    const rows = [{ id: 0, lingma_sys_key: 'first' }, { id: 1, lingma_sys_key: 'second' }, { id: 2, lingma_sys_key: 'third' }]
    const result = await collectDataSpaceQueryPages(async page => {
      calls.push(page.index)
      return { rows: rows.slice((page.index - 1) * page.size, page.index * page.size), total: '3' }
    }, { pageSize: 2, key: row => row.id })
    expect(calls).toEqual([1, 2])
    expect(result).toEqual({ rows, total: 3 })
  })

  it('queries an empty collection once using the source helper defaults', async () => {
    const calls: unknown[] = []
    expect(await collectDataSpaceQueryPages(async page => { calls.push(page); return { rows: [], total: 0 } }))
      .toEqual({ rows: [], total: 0 })
    expect(calls).toEqual([{ index: 1, size: 1000 }])
  })

  it.each([undefined, null, -1, 1.5, 'bad', '1.5', 50001])('rejects missing, invalid or excessive total %s', async total => {
    await expect(collectDataSpaceQueryPages(async () => ({ rows: [], total }))).rejects.toThrow('total')
  })

  it.each([0, 1, 3])('rejects a page of %s rows when exactly two are required', async length => {
    await expect(collectDataSpaceQueryPages(async () => ({ rows: Array.from({ length }, (_, id) => ({ id })), total: 4 }),
      { pageSize: 2 })).rejects.toThrow('页边界')
  })

  it('rejects total changing between pages instead of returning partial rows', async () => {
    await expect(collectDataSpaceQueryPages(async page => ({ rows: [{ id: page.index }], total: page.index === 1 ? 2 : 3 }),
      { pageSize: 1 })).rejects.toThrow('total 已变化')
  })

  it('rejects repeated declared keys across pages', async () => {
    await expect(collectDataSpaceQueryPages(async () => ({ rows: [{ id: 0 }], total: 2 }),
      { pageSize: 1, key: row => row.id })).rejects.toThrow('主键重复')
  })

  it.each([undefined, '', '   ', false, 1.5])('rejects invalid declared keys %s', async id => {
    await expect(collectDataSpaceQueryPages(async () => ({ rows: [{ id }], total: 1 }),
      { key: row => row.id })).rejects.toThrow('主键无效')
  })

  it('rejects cancellation and stale scope before publishing a fetched page', async () => {
    const controller = new AbortController()
    await expect(collectDataSpaceQueryPages(async () => {
      controller.abort(new Error('cancel-page'))
      return { rows: [], total: 0 }
    }, { signal: controller.signal })).rejects.toThrow('cancel-page')
    let current = true
    await expect(collectDataSpaceQueryPages(async () => {
      current = false
      return { rows: [], total: 0 }
    }, { assertCurrent: () => { if (!current) throw new Error('stale-page') } })).rejects.toThrow('stale-page')
  })
})

describe('SPARK query option parity', () => {
  it('maps every ordinary query input to the original wire options', () => {
    expect(encodeDataSpaceQueryOptions({
      filter: DataViewFilter.condition({ field: 'status', operator: 'eq', value: false }),
      sort: [{ field: 'amount', direction: 'desc' }, { field: 'name', direction: 'asc' }],
      page: { index: 2, size: 1000 }, allPages: true, maxRows: 5000,
      inputParams: [{ name: 'active', value: false }, { name: 'limit', value: 0 }],
      fields: ['name', { name: 'amount', alias: 'total', group: 1, expression: 'SUM(amount)',
        order: 2, orderType: 'descending', valueFun: { Type: 'GetTableField', Field: 'Orders.amount' } },
      { name: 'internal', isOutput: false }], outputType: 'Table', singleFlight: true,
    })).toEqual({
      filter: { Type: 'cond', Field: 'status', Operator: 'equal', Value: null, ValueFun: { Type: 'GetConstValue', Value: false } },
      sortFields: [{ Field: 'amount', OrderType: 'descending', Order: 0 }, { Field: 'name', OrderType: 'ascending', Order: 1 }],
      pageIndex: 2, pageSize: 1000, allPages: true, maxRows: 5000,
      inputParams: [{ Name: 'active', Value: false }, { Name: 'limit', Value: 0 }],
      fields: [{ Name: 'name', IsOutput: true }, { Name: 'amount', AsName: 'total', Group: 1,
        Expression: 'SUM(amount)', IsOutput: true, Order: 2, OrderType: 'descending',
        ValueFun: { Type: 'GetTableField', Field: 'Orders.amount' } }, { Name: 'internal', IsOutput: false }],
      outputType: 'Table',
    })
  })

  it('does not invent paging, projection, parameters or filters', () => {
    expect(encodeDataSpaceQueryOptions({})).toEqual({})
    expect(encodeDataSpaceQueryOptions({ fields: [], sort: [], inputParams: [], filter: null })).toEqual({})
  })

  it.each([
    { index: 0, size: 20 }, { index: -1, size: 20 }, { index: 1.5, size: 20 },
    { index: NaN, size: 20 }, { index: 1, size: 0 }, { index: 1, size: -1 },
    { index: 1, size: 1001 }, { index: 1, size: 1.5 }, { index: 1, size: Infinity },
  ])('rejects invalid explicit paging %j before a request', page => {
    expect(() => encodeDataSpaceQueryOptions({ page })).toThrow(RangeError)
  })

  it.each(['child', 'parent'] as const)('maps explicit %s node queries', mode => {
    expect(encodeDataSpaceQueryOptions({ tree: { keyField: ' id ', parentField: ' pid ', nodeId: ' ROOT ', mode } }))
      .toEqual({ outputType: 'SelfRefData', tree: { keyField: 'id', parentField: 'pid', nodeid: 'ROOT', hasChildField: 'hasChild', type: mode } })
  })

  it('keeps explicit tree child-presence field and selects child mode by default', () => {
    expect(encodeDataSpaceQueryOptions({ tree: { keyField: 'id', parentField: 'pid', nodeId: '0', hasChildrenField: 'hasChildren' } }))
      .toEqual({ outputType: 'SelfRefData', tree: { keyField: 'id', parentField: 'pid', nodeid: '0', hasChildField: 'hasChildren', type: 'child' } })
  })

  it.each(['keyField', 'parentField', 'nodeId', 'hasChildrenField'] as const)('rejects blank tree %s', key => {
    const tree = { keyField: 'id', parentField: 'pid', nodeId: '0', hasChildrenField: 'hasChild', [key]: ' ' }
    expect(() => encodeDataSpaceQueryOptions({ tree })).toThrow(key)
  })

  it('rejects conflicting or incomplete tree output', () => {
    expect(() => encodeDataSpaceQueryOptions({ outputType: 'SelfRefData' })).toThrow()
    expect(() => encodeDataSpaceQueryOptions({ outputType: 'Table', tree: { keyField: 'id', parentField: 'pid', nodeId: '0' } })).toThrow()
  })

  it('preserves explicit null and zero projection attributes', () => {
    expect(encodeDataSpaceQueryOptions({ fields: [{ name: 'amount', alias: null, group: 0,
      expression: null, order: 0, orderType: null, valueFun: null, isOutput: false }] }))
      .toEqual({ fields: [{ Name: 'amount', AsName: null, Group: 0, Expression: null,
        Order: 0, OrderType: null, ValueFun: null, IsOutput: false }] })
  })

  it('rejects runtime tree shapes and modes outside the contract', () => {
    const options = { tree: { keyField: 'id', parentField: 'pid', nodeId: '0' } }
    Reflect.set(options.tree, 'mode', 'all')
    expect(() => encodeDataSpaceQueryOptions(options)).toThrow('mode')
    Reflect.set(options, 'tree', null)
    expect(() => encodeDataSpaceQueryOptions(options)).toThrow('tree')
    Reflect.set(options, 'tree', [])
    expect(() => encodeDataSpaceQueryOptions(options)).toThrow('tree')
  })
})

describe('SPARK GetData execution boundary', () => {
  it('preserves the raw HTTP envelope through the base client', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    http.response = { protocolVersion: 4, ok: true, data: { Items: [], Count: 0 }, context: { requestId: 'fixture' } }
    const request = new DataSpaceRequest({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    expect(await request.query({ table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} }))
      .toEqual(http.response)
  })

  it('does not retry transport failure despite HTTP client defaults', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    http.afterRequest = () => { throw new Error('fixture transport failure') }
    const request = new DataSpaceRequest({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    await expect(request.query({ table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} }))
      .rejects.toThrow('fixture transport failure')
    expect(http.calls).toHaveLength(1)
  })

  it('rejects a missing request scope and a scope that changes before sending', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const command = { table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} }
    const missing = new DataSpaceRequest({ http, readScope: () => ({ token: ' ', headers: {} }) })
    await expect(missing.query(command)).rejects.toThrow('scope token')
    let revision = 0
    const changed = new DataSpaceRequest({ http, readScope: () => ({ token: String(++revision), headers: {} }) })
    await expect(changed.query(command)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(http.calls).toHaveLength(0)
  })

  it('canonicalizes a matching scenario header into a single reserved key', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const request = new DataSpaceRequest({ http, readScope: () => ({ token: 'S1', headers: { 'X-FormKey': 'SCENE' } }) })
    await request.query({ table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} })
    expect(http.calls[0]?.headers).toEqual({ 'x-FormKey': 'SCENE' })
  })

  it.each([0, 200, '0', '200'])('preserves the complete successful code %s envelope', async Code => {
    const http = new DataSpaceRequestFixtureHttp()
    http.response = { Code, Result: { data: { Items: [], Count: 0 }, allowAdd: false }, Message: 'ok' }
    const request = new DataSpaceRequest({ http, readScope: () => ({ token: 'S1', headers: { 'X-AppId': 'APP' } }) })
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    expect(await request.query({ table, options: {} })).toEqual(http.response)
    expect(http.calls).toHaveLength(1)
    expect(http.calls[0]).toMatchObject({ url: '/api/DataOperation/GetData', method: 'POST', retry: 0,
      cache: false, meta: { rawEnvelope: true }, headers: { 'X-AppId': 'APP', 'x-FormKey': 'SCENE' }, data: table.buildRequest({}) })
  })

  it('decodes JSON-string envelopes without discarding metadata', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    http.response = JSON.stringify(JSON.stringify({ Code: 0, Result: { allowAdd: false }, Message: 'ok' }))
    const request = new DataSpaceRequest({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    expect(await request.query({ table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} }))
      .toEqual({ Code: 0, Result: { allowAdd: false }, Message: 'ok' })
  })

  it('rejects business failures and does not retry', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    http.response = { Code: 403, Message: 'denied', Result: null }
    const request = new DataSpaceRequest({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    await expect(request.query({ table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} })).rejects.toThrow('denied')
    expect(http.calls).toHaveLength(1)
  })

  it('rejects a response whose execution scope changed during the request', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    let token = 'S1'
    http.afterRequest = () => { token = 'S2' }
    const request = new DataSpaceRequest({ http, readScope: () => ({ token, headers: {} }) })
    await expect(request.query({ table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} })).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })

  it('invalidates prior generations and can execute a later generation', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const request = new DataSpaceRequest({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    http.afterRequest = () => request.invalidate()
    const command = { table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} }
    await expect(request.query(command)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    delete http.afterRequest
    await expect(request.query(command)).resolves.toEqual(http.response)
    request.dispose()
    await expect(request.query(command)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(http.calls).toHaveLength(2)
  })

  it('rejects a conflicting scenario header before sending', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const request = new DataSpaceRequest({ http, readScope: () => ({ token: 'S1', headers: { 'X-FormKey': 'OTHER' } }) })
    await expect(request.query({ table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} })).rejects.toThrow('scenario')
    expect(http.calls).toHaveLength(0)
  })

  it('honors cancellation before sending and before publishing', async () => {
    const http = new DataSpaceRequestFixtureHttp()
    const request = new DataSpaceRequest({ http, readScope: () => ({ token: 'S1', headers: {} }) })
    const command = { table: new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' }), options: {} }
    const before = new AbortController()
    before.abort(new Error('cancel-before'))
    await expect(request.query({ ...command, signal: before.signal })).rejects.toThrow('cancel-before')
    expect(http.calls).toHaveLength(0)
    const during = new AbortController()
    http.afterRequest = () => during.abort(new Error('cancel-during'))
    await expect(request.query({ ...command, signal: during.signal })).rejects.toThrow('cancel-during')
  })
})

describe('SPARK scenario model request parity', () => {
  it('addresses rows by the singular primary key echoed by GetData, including response aliases', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const snapshot = table.applyResult({ Code: 200, Result: { primaryKeyField: 'OrderKey',
      data: { Items: [{ OrderKey: 0, id: 'unrelated', lingma_sys_params: { e: ['name'] } }], Count: 1 } } })
    expect(snapshot.primaryKey).toBe('OrderKey')
    const context = new DataSpaceQueryContext({ identity: table.identity, snapshot, scope: 'scope', readScope: () => 'scope' })
    expect(context.rowKey(context.rows[0] ?? {})).toBe(0)
    expect(context.editActionState(0)).toBe('enabled')
    expect(context.editActionState('unrelated')).toBe('hidden')
  })

  it('registers backend primary key, independent add permission and reported total', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const result = table.applyResult({ Code: 200, Result: { primaryKeyFields: 'OrderId',
      allowAdd: true, lingma_sys_key: 'add-token', data: { Items: [{ OrderId: 0 }], Count: '12' } } })
    expect(result).toMatchObject({ rows: [{ OrderId: 0 }], primaryKey: 'OrderId', total: 12,
      countReported: true, allowAdd: true, systemKey: 'add-token' })
  })

  it('keeps an empty metadata-bearing response empty', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    expect(table.applyResult({ Result: { data: null, primaryKeyField: 'id', allowAdd: true } }))
      .toMatchObject({ rows: [], primaryKey: 'id', total: 0, countReported: false, allowAdd: true })
  })

  it('preserves business Result fields instead of mistaking them for response envelopes', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const row = { id: '1', Result: { score: 3 }, name: 'business' }
    expect(table.applyResult({ Result: { data: row } }).rows).toEqual([row])
  })

  it('unwraps nested service data and rejects nested explicit errors', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    expect(table.applyResult({ Result: { data: { Code: 200, Message: 'ok', Result: { Items: [{ id: '1' }] } } } }).rows)
      .toEqual([{ id: '1' }])
    expect(() => table.applyResult({ Result: { data: { Code: 403, Message: 'denied', Result: null } } })).toThrow('denied')
  })

  it('freezes each query snapshot and does not retain prior add permission or token', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const row = { id: '1', lingma_sys_params: { e: ['name'] } }
    const first = table.applyResult({ Result: { data: [row], allowAdd: true, lingma_sys_key: 'token' } })
    row.id = 'changed'
    row.lingma_sys_params.e.length = 0
    expect(first.rows[0]).toEqual({ id: '1', lingma_sys_params: { e: ['name'] } })
    expect(Object.isFrozen(first.rows[0])).toBe(true)
    expect(table.applyResult({ Result: { data: [] } })).toMatchObject({ rows: [], allowAdd: false, systemKey: '' })
  })

  it.each([{ count: -1 }, { count: 1.5 }, { count: 'bad' }, { count: null }])
    ('uses row count only when the reported count is invalid $count', ({ count }) => {
      const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
      expect(table.applyResult({ Result: { data: { Items: [{ id: 1 }], Count: count } } }))
        .toMatchObject({ total: 1, countReported: false })
    })

  it('uses the registered model Name without physical source or guessed primary key', () => {
    const table = new DataSpaceQueryTable({ scenarioId: ' SCENE ', metaName: ' Orders ' })
    expect(table.identity).toEqual({ scenarioId: 'SCENE', metaName: 'Orders' })
    expect(table.buildRequest({})).toEqual({ Table: [{ Name: 'Orders', OutputType: 'Table',
      Filter: null, inputParams: [], DISTINCT: false, IsBusinessMain: 1 }] })
    expect(Object.isFrozen(table.identity)).toBe(true)
  })

  it('projects sorting onto output fields and adds a non-output sort field', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    expect(table.buildRequest({ fields: ['Amount'], sort: [{ field: 'amount', direction: 'desc' },
      { field: 'updatedAt', direction: 'asc' }], page: { index: 2, size: 50 } })).toEqual({
      Table: [{ Name: 'Orders', OutputType: 'Table', Filter: null, inputParams: [], DISTINCT: false, IsBusinessMain: 1,
        Fields: [{ Name: 'Amount', IsOutput: true, Order: 2, OrderType: 'descending' },
          { Name: 'updatedAt', AsName: 'updatedAt', IsOutput: false, Order: 1, OrderType: 'ascending' }] }],
      PageParam: { index: 2, size: 50 },
    })
  })

  it('keeps all output columns when sorting is supplied without projection', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    expect(table.buildRequest({ sort: [{ field: 'amount', direction: 'desc' }] }).Table[0]).not.toHaveProperty('Fields')
  })

  it('puts tree controls and paging on the outer GetData request', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Departments' })
    expect(table.buildRequest({ tree: { keyField: 'id', parentField: 'pid', nodeId: '0' }, page: { index: 1, size: 50 } }))
      .toEqual({ Table: [{ Name: 'Departments', OutputType: 'SelfRefData', Filter: null,
        inputParams: [], DISTINCT: false, IsBusinessMain: 1 }], PageParam: { index: 1, size: 50 },
      keyField: 'id', parentField: 'pid', nodeid: '0', hasChildField: 'hasChild', type: 'child' })
  })

  it('does not retain inputs from a prior request on the same handle', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const options = { fields: ['amount'], inputParams: [{ name: 'limit', value: 0 }],
      filter: DataViewFilter.condition({ field: 'active', operator: 'eq', value: false }) }
    const request = table.buildRequest(options)
    expect(request.Table[0]).toHaveProperty('inputParams', [{ Name: 'limit', Value: 0 }])
    expect(request.Table[0]).toHaveProperty('Filter.ValueFun.Value', false)
    options.fields.push('name')
    expect(request.Table[0]).toHaveProperty('Fields', [{ Name: 'amount', IsOutput: true }])
    expect(table.buildRequest({}).Table[0]).toEqual({ Name: 'Orders', OutputType: 'Table', Filter: null,
      inputParams: [], DISTINCT: false, IsBusinessMain: 1 })
  })

  it('captures nested projection value functions independently of later caller edits', () => {
    const valueFun = { Type: 'GetConstValue', Value: { enabled: false, limits: [0, 20] } }
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const first = table.buildRequest({ fields: [{ name: 'settings', valueFun }] })
    valueFun.Value.enabled = true
    valueFun.Value.limits.push(50)
    expect(first.Table[0]).toHaveProperty('Fields', [{ Name: 'settings', IsOutput: true,
      ValueFun: { Type: 'GetConstValue', Value: { enabled: false, limits: [0, 20] } } }])
    expect(table.buildRequest({ fields: [{ name: 'settings', valueFun }] }).Table[0])
      .toHaveProperty('Fields', [{ Name: 'settings', IsOutput: true,
        ValueFun: { Type: 'GetConstValue', Value: { enabled: true, limits: [0, 20, 50] } } }])
  })

  it('uses the validated numeric page rather than the unnormalized caller values', () => {
    const page = { index: 1, size: 50 }
    Reflect.set(page, 'index', '2')
    Reflect.set(page, 'size', '20')
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    expect(table.buildRequest({ page }).PageParam).toEqual({ index: 2, size: 20 })
  })

  it('captures object input parameters without changing explicit scalar values', () => {
    const selection = { ids: [0, 1], settings: { enabled: false } }
    const options = { inputParams: [{ name: 'selection', value: selection },
      { name: 'blank', value: '' }, { name: 'none', value: null },
      { name: 'zero', value: 0 }, { name: 'disabled', value: false }] }
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const first = table.buildRequest(options)
    selection.ids.push(2)
    selection.settings.enabled = true
    expect(first.Table[0]).toHaveProperty('inputParams', [
      { Name: 'selection', Value: { ids: [0, 1], settings: { enabled: false } } },
      { Name: 'blank', Value: '' }, { Name: 'none', Value: null },
      { Name: 'zero', Value: 0 }, { Name: 'disabled', Value: false },
    ])
    expect(table.buildRequest(options).Table[0]).toHaveProperty('inputParams.0.Value',
      { ids: [0, 1, 2], settings: { enabled: true } })
  })

  it.each([{ scenarioId: '', metaName: 'Orders' }, { scenarioId: 'SCENE', metaName: ' ' }])
    ('rejects missing explicit identity %j', identity => {
      expect(() => new DataSpaceQueryTable(identity)).toThrow()
    })
})
