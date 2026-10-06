import { describe, expect, it } from 'vitest'
import { snapshotDataSpaceSaveActionOrder } from '../save/data-space-save-order'
import { assertDataSpaceSaveSuccess, readDataSpaceSaveReceipt } from '../save/data-space-save-result'
import { requireDataSpaceMutationInput, failDataSpaceMutationWithoutEffect } from '../save/data-space-save-guard'
import { DataSpaceQueryContext } from '../query/data-space-query-context'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'
import { DataSpaceRequest } from '../protocol/data-space-request'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'

class DataSpaceSaveFixtureHttp extends HttpClientBase {
  public calls: RequestConfig[] = []
  public response: unknown = { Code: 200, Result: { maplistedit: [{ 'db@items': [{ id: 1, value: 'X' }] }] } }
  public afterRequest?: () => void
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    this.afterRequest?.()
    return { data: this.response, status: 200, statusText: 'OK', headers: {} }
  }
}

describe('SPARK same-scenario save request', () => {
  function fixture() {
    const http = new DataSpaceSaveFixtureHttp({ retry: 3 })
    let token = 'scope'
    const request = new DataSpaceRequest({ http, readScope: () => ({ token, headers: { 'X-AppId': 'APP-ID' } }) })
    const change = (metaName = 'Orders', scenarioId = 'SCENE') => {
      const table = new DataSpaceQueryTable({ scenarioId, metaName })
      const context = new DataSpaceQueryContext({ identity: table.identity, scope: token, readScope: () => token,
        snapshot: table.applyResult({ Result: { primaryKeyField: 'id', data: [{ id: 1, lingma_sys_key: 'signed' }] } }) })
      return { identity: table.identity, context, changes: { changed: [{ id: 1, value: 'X', _pk: 'local' }] } }
    }
    return { http, request, change, changeScope: () => { token = 'other' } }
  }

  it('sends different models once with request-level app and scenario headers', async () => {
    const { http, request, change } = fixture()
    http.response = { Code: 200, Result: { maplistedit: [{ 'db@orders': [{ id: 1, value: 'Accepted' }] },
      { 'db@details': [{ id: 1, value: 'Other' }] }] } }
    expect(await request.save({ changes: [change(), change('Lines')] })).toEqual([
      { metaName: 'Orders', added: [], changed: [{ id: 1, value: 'Accepted' }], deleted: [],
        changedFields: [['id', 'value']], context: expect.any(DataSpaceQueryContext) },
      { metaName: 'Lines', added: [], changed: [{ id: 1, value: 'Other' }], deleted: [],
        changedFields: [['id', 'value']], context: expect.any(DataSpaceQueryContext) },
    ])
    expect(http.calls).toHaveLength(1)
    expect(http.calls[0]).toMatchObject({ url: '/api/DataOperation/BatchTableOperateRequestByCRUD', method: 'POST',
      retry: 0, cache: false, meta: { rawEnvelope: true }, headers: { 'X-AppId': 'APP-ID', 'x-FormKey': 'SCENE' },
      data: ['Orders', 'Lines'].map(TableName => ({ TableName,
        CrudModel: { Added: [], Changed: [{ id: 1, value: 'X', lingma_sys_key: 'signed' }], Deleted: [] } })) })
  })

  it('rejects an update without actual differences before transport', async () => {
    const { http, request, change } = fixture()
    const first = change()
    await expect(request.save({ changes: [{ ...first, changes: { changed: [{ id: 1 }] } }] })).rejects.toThrow('未产生实际变更')
    expect(http.calls).toHaveLength(0)
  })

  it.each(['first', 'last'])('rejects an ineffective model at the %s position before sending the other model', async position => {
    const { http, request, change } = fixture()
    const lines = change('Lines')
    const ineffective = { ...lines, changes: { changed: [{ id: 1, _pk: 'local', lingma_sys_key: 'forged' }] } }
    const effective = change()
    http.response = { Code: 200, Result: { maplistedit: [{ physical: [{ id: 1, value: 'X' }] }] } }
    await expect(request.save({ changes: position === 'first' ? [ineffective, effective] : [effective, ineffective] }))
      .rejects.toThrow('Lines 保存未产生实际变更')
    expect(http.calls).toHaveLength(0)
    expect(effective.context.rows).toEqual([{ id: 1 }])
    expect(ineffective.context.rows).toEqual([{ id: 1 }])
  })

  it('merges a returned update patch with the original row and strips permission wire fields', async () => {
    const { http, request, change } = fixture()
    http.response = { Code: 200, Result: { maplistedit: [{ physical: [{ value: 'Accepted',
      lingma_sys_key: 'returned-token', lingma_sys_params: { e: ['value'] }, _pk: 'server-local' }] }] } }
    expect(await request.save({ changes: [change()] })).toEqual([
      { metaName: 'Orders', added: [], changed: [{ id: 1, value: 'Accepted' }], deleted: [],
        changedFields: [['value']], context: expect.any(DataSpaceQueryContext) },
    ])
  })

  it.each(['cross-scenario', 'duplicate-model', 'wrong-context', 'empty', 'empty-rows'])('rejects %s before transport', async mode => {
    const { http, request, change } = fixture()
    const first = change()
    const changes = mode === 'empty' ? [] : mode === 'empty-rows' ? [{ ...first, changes: {} }]
      : mode === 'cross-scenario' ? [first, change('Lines', 'OTHER')]
        : mode === 'duplicate-model' ? [first, change()]
          : [{ ...first, identity: { scenarioId: 'SCENE', metaName: 'Lines' } }]
    await expect(request.save({ changes })).rejects.toThrow()
    expect(http.calls).toHaveLength(0)
  })

  it.each(['scope', 'invalidate', 'dispose', 'abort'])('rejects %s during the request', async mode => {
    const { http, request, change, changeScope } = fixture()
    const controller = new AbortController()
    http.afterRequest = () => {
      if (mode === 'scope') changeScope()
      else if (mode === 'invalidate') request.invalidate()
      else if (mode === 'dispose') request.dispose()
      else controller.abort()
    }
    await expect(request.save({ changes: [change()], signal: controller.signal })).rejects.toThrow()
    expect(http.calls).toHaveLength(1)
  })

  it('rejects stale query context and pre-aborted signals before transport', async () => {
    const { http, request, change } = fixture()
    const first = change()
    first.context.invalidate()
    await expect(request.save({ changes: [first] })).rejects.toThrow('STALE')
    const controller = new AbortController()
    controller.abort()
    await expect(request.save({ changes: [change()], signal: controller.signal })).rejects.toThrow()
    expect(http.calls).toHaveLength(0)
  })

  it('rejects explicit server failure and preserves the query baseline', async () => {
    const { http, request, change } = fixture()
    const first = change()
    http.response = { Code: 200, Extras: [{ target: '更新失败字段', message: [{ value: '不可写' }] }] }
    await expect(request.save({ changes: [first] })).rejects.toThrow('不可写')
    expect(first.context.rows).toEqual([{ id: 1 }])
    expect(first.context.buildSaveRequest(first.changes)[0]?.CrudModel.Changed[0]?.['lingma_sys_key']).toBe('signed')
    expect(http.calls).toHaveLength(1)
  })

  it('rejects a query baseline invalidated while the save is in flight', async () => {
    const { http, request, change } = fixture()
    const first = change()
    http.afterRequest = () => first.context.invalidate()
    await expect(request.save({ changes: [first] })).rejects.toThrow('SPARK_QUERY_CONTEXT_STALE')
    expect(http.calls).toHaveLength(1)
  })

  it('publishes a separate accepted baseline for the next actual save', async () => {
    const { http, request, change } = fixture()
    const original = change()
    const accepted = (await request.save({ changes: [original] }))[0]
    expect(accepted?.context.rows).toEqual([{ id: 1, value: 'X' }])
    expect(original.context.rows).toEqual([{ id: 1 }])
    if (accepted === undefined) throw new Error('missing accepted result')
    await expect(request.save({ changes: [{ ...original, context: accepted.context }] })).rejects.toThrow('未产生实际变更')
    expect(http.calls).toHaveLength(1)
    http.response = { Code: 200, Result: { maplistedit: [{ physical: [{ id: 1, value: 'Next' }] }] } }
    await request.save({ changes: [{ ...original, context: accepted.context, changes: { changed: [{ id: 1, value: 'Next' }] } }] })
    expect(http.calls[1]?.data).toEqual([{ TableName: 'Orders',
      CrudModel: { Added: [], Changed: [{ id: 1, value: 'Next', lingma_sys_key: 'signed' }], Deleted: [] } }])
  })

  it('does not retry a failed mutation even when HTTP defaults allow retries', async () => {
    const { http, request, change } = fixture()
    http.afterRequest = () => { throw new Error('network failed') }
    await expect(request.save({ changes: [change()] })).rejects.toThrow('network failed')
    expect(http.calls).toHaveLength(1)
  })

  it('decodes the raw string save envelope and confirms its actual action rows', async () => {
    const { http, request, change } = fixture()
    http.response = JSON.stringify({ Code: 'success', Result: { maplistedit: [{ 'db@items': [{ id: 1, value: 'Actual' }] }] } })
    expect(await request.save({ changes: [change()] })).toEqual([
      { metaName: 'Orders', added: [], changed: [{ id: 1, value: 'Actual' }], deleted: [],
        changedFields: [['id', 'value']], context: expect.any(DataSpaceQueryContext) },
    ])
  })

  it('rejects conflicting scenario headers before transport', async () => {
    const { http, change } = fixture()
    const request = new DataSpaceRequest({ http,
      readScope: () => ({ token: 'scope', headers: { 'X-FORMKEY': 'OTHER' } }) })
    await expect(request.save({ changes: [change()] })).rejects.toThrow('header')
    expect(http.calls).toHaveLength(0)
  })
})

describe('SPARK save action receipt segments', () => {
  const groups = [[
    { TableName: 'Orders', CrudModel: { Added: [{ a: 1 }], Changed: [], Deleted: [{ id: 3 }] } },
    { TableName: 'Orders', CrudModel: { Added: [{ b: 2 }], Changed: [{ id: 1 }], Deleted: [] } },
  ], [{ TableName: 'Lines', CrudModel: { Added: [], Changed: [{ id: 2 }], Deleted: [] } }]]

  it('joins only the planned model segments and returns actual accepted rows in model order', () => {
    const response = { data: { Code: 200, Result: { data: {
      MAPLISTADD: [{ 'db@physical': [{ id: 10, a: 1 }] }, { 'db@physical': [{ id: 11, b: 2 }] }],
      maplistedit: [{ 'db@physical': [{ id: 1, normalized: true }] }, { 'db@other': [{ id: 2 }] }],
      maplistdelete: [{ 'db@physical': [{ id: 3 }] }],
    } } } }
    expect(readDataSpaceSaveReceipt(response, groups)).toEqual([
      { metaName: 'Orders', added: [{ id: 10, a: 1 }, { id: 11, b: 2 }], changed: [{ id: 1, normalized: true }], deleted: [{ id: 3 }] },
      { metaName: 'Lines', added: [], changed: [{ id: 2 }], deleted: [] },
    ])
  })

  it.each([
    undefined, [], [{ 'db@physical': [] }], [{ 'db@physical': [null] }],
    [{ 'db@physical': [{ id: 1 }, { id: 2 }] }], [{ 'db@physical': 'invalid' }], [false],
  ].map(buckets => ({ buckets })))('rejects missing, malformed or incomplete buckets $buckets', ({ buckets }) => {
    const one = [[{ TableName: 'Orders', CrudModel: { Added: [], Changed: [{ id: 1 }], Deleted: [] } }]]
    expect(() => readDataSpaceSaveReceipt({ Code: 200, Result: { maplistedit: buckets } }, one)).toThrow()
  })

  it('rejects different internal identities within the same model insert segments', () => {
    expect(() => readDataSpaceSaveReceipt({ Result: { maplistadd: [{ a: [{ id: 1 }] }, { b: [{ id: 2 }] }],
      maplistedit: [{ a: [{ id: 1 }] }, { b: [{ id: 2 }] }], maplistdelete: [{ a: [{ id: 3 }] }] } }, groups)).toThrow('身份')
  })

  it('does not treat a successful envelope without row receipts as accepted changes', () => {
    expect(() => readDataSpaceSaveReceipt({ Code: 200, Result: [] }, groups)).toThrow('桶')
  })
})

describe('SPARK save private query baseline', () => {
  function fixture(rows: readonly Record<string, unknown>[] = [
    { id: 0, name: 'Original', lingma_sys_key: 'row-token', lingma_sys_params: { e: ['name'] } },
  ]) {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    let scope = 'scope'
    const context = new DataSpaceQueryContext({ identity: table.identity, scope, readScope: () => scope,
      snapshot: table.applyResult({ Result: { primaryKeyField: 'id', lingma_sys_key: 'model-token', data: rows } }) })
    return { context, changeScope: () => { scope = 'other' } }
  }

  it('uses original model and row tokens, strips caller permission fields and _pk', () => {
    const { context } = fixture()
    const forged = { _pk: 'front-key', lingma_sys_key: 'forged', lingma_sys_params: { e: ['salary'] } }
    expect(context.buildSaveRequest({
      added: [{ id: 1, name: 'Added', ...forged }],
      changed: [{ id: ' 0 ', salary: 100, ...forged }],
      deleted: [{ id: 0, ...forged }],
    })).toEqual([{ TableName: 'Orders', CrudModel: {
      Added: [{ id: 1, name: 'Added', lingma_sys_key: 'model-token' }],
      Changed: [{ id: ' 0 ', salary: 100, lingma_sys_key: 'row-token' }],
      Deleted: [{ id: 0, lingma_sys_key: 'row-token' }],
    } }])
    expect(context.rows).toEqual([{ id: 0, name: 'Original' }])
  })

  it('does not supply a token from another row or from a caller for unknown keys', () => {
    const { context } = fixture()
    expect(context.buildSaveRequest({ changed: [{ id: 'unknown', name: 'X', lingma_sys_key: 'forged' }],
      deleted: [{ id: '', lingma_sys_key: 'forged' }] })).toEqual([{ TableName: 'Orders', CrudModel: {
      Added: [], Changed: [{ id: 'unknown', name: 'X' }], Deleted: [{ id: '' }],
    } }])
  })

  it('rejects ambiguous original row keys', () => {
    const { context } = fixture([{ id: 0, lingma_sys_key: 'a' }, { id: ' 0 ', lingma_sys_key: 'b' }])
    expect(() => context.buildSaveRequest({ changed: [{ id: 0, name: 'X' }] })).toThrow('不唯一')
  })

  it.each(['invalidate', 'scope'])('rejects %s before constructing a save payload', mode => {
    const { context, changeScope } = fixture()
    if (mode === 'invalidate') context.invalidate()
    else changeScope()
    expect(() => context.buildSaveRequest({ added: [{ id: 1 }] })).toThrow('STALE')
  })

  it('segments consecutive heterogeneous insert fields without filling absent values', () => {
    const { context } = fixture()
    const requests = context.buildSaveRequest({ added: [{ a: 1 }, { a: 2, b: null }, { b: 3 }, { a: 4 }],
      changed: [{ id: 0, name: 'X' }], deleted: [{ id: 0 }] })
    expect(requests.map(request => request.CrudModel)).toEqual([
      { Added: [{ a: 1, lingma_sys_key: 'model-token' }, { a: 2, b: null, lingma_sys_key: 'model-token' }],
        Changed: [], Deleted: [{ id: 0, lingma_sys_key: 'row-token' }] },
      { Added: [{ b: 3, lingma_sys_key: 'model-token' }], Changed: [], Deleted: [] },
      { Added: [{ a: 4, lingma_sys_key: 'model-token' }], Changed: [{ id: 0, name: 'X', lingma_sys_key: 'row-token' }], Deleted: [] },
    ])
  })

  it('uses explicit complete action order while retaining insert groups', () => {
    const { context } = fixture()
    const requests = context.buildSaveRequest({ actionOrder: ['deleted', 'added', 'changed'],
      added: [{ a: 1 }, { b: 2 }], changed: [{ id: 0, name: 'X' }], deleted: [{ id: 0 }] })
    expect(requests.map(request => [request.CrudModel.Added.length, request.CrudModel.Changed.length,
      request.CrudModel.Deleted.length])).toEqual([[0, 0, 1], [1, 0, 0], [1, 0, 0], [0, 1, 0]])
  })

  it('captures nested caller values without mutating the caller or query baseline', () => {
    const { context } = fixture()
    const row = { id: 1, detail: { amount: 2 }, _pk: 'local' }
    const request = context.buildSaveRequest({ added: [row] })
    row.detail.amount = 99
    expect(request[0]?.CrudModel.Added[0]).toEqual({ id: 1, detail: { amount: 2 }, lingma_sys_key: 'model-token' })
    expect(row._pk).toBe('local')
  })

  it('does not manufacture a token when the original response omitted it', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const context = new DataSpaceQueryContext({ identity: table.identity, scope: 'scope', readScope: () => 'scope',
      snapshot: table.applyResult({ Result: { primaryKeyField: 'id', data: [{ id: 1 }] } }) })
    expect(context.buildSaveRequest({ added: [{ id: 2 }], changed: [{ id: 1 }], deleted: [{ id: 1 }] }))
      .toEqual([{ TableName: 'Orders', CrudModel: { Added: [{ id: 2 }], Changed: [{ id: 1 }], Deleted: [{ id: 1 }] } }])
  })

  it('plans only actual changed business values without filtering by front-end E', () => {
    const { context } = fixture()
    const prepared = context.prepareSaveChanges({ changed: [{ id: ' 0 ', name: 'Original', salary: 0,
      flag: false, text: '', _pk: 'local', lingma_sys_key: 'forged', lingma_sys_params: { e: ['salary'] } }] })
    expect(prepared.changed).toEqual([{ id: 0, salary: 0, flag: false, text: '' }])
    expect(context.buildSaveRequest(prepared)[0]?.CrudModel.Changed).toEqual([
      { id: 0, salary: 0, flag: false, text: '', lingma_sys_key: 'row-token' },
    ])
  })

  it('compares nested values against the retained original query rather than mutable rows', () => {
    const { context } = fixture([{ id: 0, detail: { amount: 1 }, lingma_sys_key: 'signed' }])
    expect(context.prepareSaveChanges({ changed: [{ id: 0, detail: { amount: 1 }, ignored: undefined }] }).changed).toEqual([])
    expect(context.prepareSaveChanges({ changed: [{ id: 0, detail: { amount: 2 } }] }).changed)
      .toEqual([{ id: 0, detail: { amount: 2 } }])
  })

  it.each(['unknown', ''])('requires a unique original query row for update key %s', id => {
    const { context } = fixture()
    expect(() => context.prepareSaveChanges({ changed: [{ id, name: 'X' }] })).toThrow('查询基线')
  })

  it('projects delete from the unique original query row, ignoring forged caller values', () => {
    const { context } = fixture()
    const prepared = context.prepareSaveChanges({ deleted: [{ id: ' 0 ', name: 'forged', salary: 999, _pk: 'local' }] })
    expect(prepared.deleted).toEqual([{ id: 0, name: 'Original' }])
    expect(context.buildSaveRequest(prepared)[0]?.CrudModel.Deleted).toEqual([
      { id: 0, name: 'Original', lingma_sys_key: 'row-token' },
    ])
  })

  it('rejects duplicate original keys instead of selecting a baseline arbitrarily', () => {
    const { context } = fixture([{ id: 0, name: 'A' }, { id: ' 0 ', name: 'B' }])
    expect(() => context.prepareSaveChanges({ changed: [{ id: 0, name: 'X' }] })).toThrow('查询基线')
  })

  it('rejects the same original row selected for deletion twice', () => {
    const { context } = fixture()
    expect(() => context.prepareSaveChanges({ deleted: [{ id: 0 }, { id: ' 0 ' }] })).toThrow('重复')
  })

  it('resolves update receipt identity from the captured request when the key is omitted', () => {
    const { context } = fixture()
    const result = context.resolveSaveReceipt({ requested: { changed: [{ id: 0, name: 'Submitted' }] },
      receipt: { metaName: 'Orders', added: [], changed: [{ salary: 100, lingma_sys_key: 'forged', _pk: 'local' }], deleted: [] } })
    expect(result.changed).toEqual([{ id: 0, name: 'Original', salary: 100 }])
    expect(context.rows).toEqual([{ id: 0, name: 'Original' }])
  })

  it('rejects a returned update key outside the requested set even if it exists in the query', () => {
    const { context } = fixture([{ id: 0, name: 'A' }, { id: 1, name: 'B' }])
    expect(() => context.resolveSaveReceipt({ requested: { changed: [{ id: 0, name: 'X' }] },
      receipt: { metaName: 'Orders', added: [], changed: [{ id: 1, name: 'X' }], deleted: [] } })).toThrow('身份')
  })

  it('rejects duplicate update receipt identities', () => {
    const { context } = fixture([{ id: 0, name: 'A' }, { id: 1, name: 'B' }])
    expect(() => context.resolveSaveReceipt({ requested: { changed: [{ id: 0 }, { id: 1 }] },
      receipt: { metaName: 'Orders', added: [], changed: [{ id: 0 }, { id: 0 }], deleted: [] } })).toThrow('身份')
  })

  it.each([{}, { id: 'foreign' }])('requires actual deleted row identity %j', deleted => {
    const { context } = fixture()
    expect(() => context.resolveSaveReceipt({ requested: { deleted: [{ id: 0 }] },
      receipt: { metaName: 'Orders', added: [], changed: [], deleted: [deleted] } })).toThrow('身份')
  })

  it('returns consumer-safe added and deleted rows without changing the baseline', () => {
    const { context } = fixture()
    const wire = { lingma_sys_key: 'private', lingma_sys_params: { e: ['name'] }, _pk: 'front' }
    const result = context.resolveSaveReceipt({ requested: { added: [{ id: 1 }], deleted: [{ id: 0 }] },
      receipt: { metaName: 'Orders', added: [{ id: 1, ...wire }], changed: [], deleted: [{ id: 0, ...wire }] } })
    expect(result).toEqual({ metaName: 'Orders', added: [{ id: 1 }], changed: [], deleted: [{ id: 0 }] })
    expect(context.rows).toEqual([{ id: 0, name: 'Original' }])
  })

  it('creates the next save baseline only from actual receipts and retains original credentials', () => {
    const { context } = fixture()
    const accepted = context.acceptSaveReceipt({ requested: { changed: [{ id: 0, name: 'Submitted' }] },
      receipt: { metaName: 'Orders', added: [], changed: [{ id: 0, name: 'Normalized',
        lingma_sys_key: 'forged', lingma_sys_params: { e: ['salary'] } }], deleted: [] } })
    expect(accepted.context).not.toBe(context)
    expect(accepted.context.rows).toEqual([{ id: 0, name: 'Normalized' }])
    expect(context.rows).toEqual([{ id: 0, name: 'Original' }])
    expect(accepted.context.prepareSaveChanges({ changed: [{ id: 0, name: 'Normalized' }] }).changed).toEqual([])
    expect(accepted.context.buildSaveRequest({ changed: [{ id: 0, name: 'Later' }] })[0]?.CrudModel.Changed)
      .toEqual([{ id: 0, name: 'Later', lingma_sys_key: 'row-token' }])
    expect(accepted.context.fieldAccess(0, 'name').write).toBe('allowed')
    expect(accepted.context.fieldAccess(0, 'salary').write).toBe('denied')
  })

  it('distinguishes an omitted update field from an explicit normalization to the original value', () => {
    const { context } = fixture()
    const requested = { changed: [{ id: 0, name: 'Submitted' }] }
    const missing = context.acceptSaveReceipt({ requested,
      receipt: { metaName: 'Orders', added: [], changed: [{}], deleted: [] } })
    const normalized = context.acceptSaveReceipt({ requested,
      receipt: { metaName: 'Orders', added: [], changed: [{ name: 'Original' }], deleted: [] } })
    expect(missing.changed).toEqual(normalized.changed)
    expect(missing.context.rows).toEqual(normalized.context.rows)
    expect(missing.changedFields).toEqual([[]])
    expect(normalized.changedFields).toEqual([['name']])
  })

  it('reports only actual safe returned fields and freezes their evidence', () => {
    const { context } = fixture()
    const returned = { salary: 0, enabled: false, text: '', nullable: null,
      _pk: 'local', lingma_sys_key: 'forged', lingma_sys_params: { e: ['salary'] } }
    const accepted = context.acceptSaveReceipt({ requested: { changed: [{ id: 0, name: 'Submitted' }] },
      receipt: { metaName: 'Orders', added: [], changed: [returned], deleted: [] } })
    expect(accepted.changedFields).toEqual([['salary', 'enabled', 'text', 'nullable']])
    expect(Object.isFrozen(accepted.changedFields)).toBe(true)
    expect(Object.isFrozen(accepted.changedFields[0])).toBe(true)
    expect(accepted.changed[0]).toEqual({ id: 0, name: 'Original', salary: 0, enabled: false, text: '', nullable: null })
  })

  it('keeps explicit returned identities aligned with their own field acknowledgments', () => {
    const { context } = fixture([{ id: 0, name: 'A' }, { id: 1, name: 'B' }])
    const accepted = context.acceptSaveReceipt({ requested: { changed: [{ id: 0, name: 'X' }, { id: 1, name: 'Y' }] },
      receipt: { metaName: 'Orders', added: [], changed: [{ id: 1, salary: 10 }, { id: 0, name: 'X' }], deleted: [] } })
    expect(accepted.changed.map(row => row['id'])).toEqual([1, 0])
    expect(accepted.changedFields).toEqual([['id', 'salary'], ['id', 'name']])
  })

  it('advances additions, deletions and total while retaining unrelated query rows', () => {
    const { context } = fixture([{ id: 0, name: 'Delete' }, { id: 2, name: 'Retain' }])
    const accepted = context.acceptSaveReceipt({ requested: { added: [{ name: 'New' }], deleted: [{ id: 0 }] },
      receipt: { metaName: 'Orders', added: [{ id: 3, name: 'Actual', _pk: 'local', lingma_sys_key: 'forged' }],
        changed: [], deleted: [{ id: 0 }] } })
    expect(accepted.context.rows).toEqual([{ id: 2, name: 'Retain' }, { id: 3, name: 'Actual' }])
    expect(accepted.context.total).toBe(2)
    expect(accepted.context.countReported).toBe(context.countReported)
    expect(accepted.context.buildSaveRequest({ changed: [{ id: 3, name: 'Next' }] })[0]?.CrudModel.Changed)
      .toEqual([{ id: 3, name: 'Next', lingma_sys_key: 'model-token' }])
    expect(context.rows).toHaveLength(2)
  })

  it.each([{}, { id: 0 }, { id: '' }])('rejects missing or colliding new receipt identity %j', row => {
    const { context } = fixture()
    expect(() => context.acceptSaveReceipt({ requested: { added: [{ name: 'New' }] },
      receipt: { metaName: 'Orders', added: [row], changed: [], deleted: [] } })).toThrow('身份')
    expect(context.rows).toEqual([{ id: 0, name: 'Original' }])
  })

  it('rejects duplicate new identities without publishing a successor', () => {
    const { context } = fixture()
    expect(() => context.acceptSaveReceipt({ requested: { added: [{ a: 1 }, { b: 2 }] },
      receipt: { metaName: 'Orders', added: [{ id: 1 }, { id: ' 1 ' }], changed: [], deleted: [] } })).toThrow('身份')
  })

  it('isolates nested receipt values and gives the successor the same request lifetime', () => {
    const { context, changeScope } = fixture()
    const returned = { id: 0, detail: { amount: 2 } }
    const accepted = context.acceptSaveReceipt({ requested: { changed: [{ id: 0, detail: { amount: 2 } }] },
      receipt: { metaName: 'Orders', added: [], changed: [returned], deleted: [] } })
    returned.detail.amount = 99
    expect(accepted.context.rows[0]?.['detail']).toEqual({ amount: 2 })
    expect(Object.isFrozen(accepted.context.rows[0]?.['detail'])).toBe(true)
    changeScope()
    expect(() => accepted.context.rows).toThrow('STALE')
  })
})

describe('SPARK mutation input boundary', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid input count %s with model identity', count => {
    expect(() => requireDataSpaceMutationInput('保存', count, ' Orders ')).toThrow('Orders 保存至少需要一项有效输入')
  })

  it('allows a nonempty input to proceed without deciding field authorization', () => {
    expect(() => requireDataSpaceMutationInput('更新', 1, 'Orders')).not.toThrow()
  })

  it('rejects a submitted update that produced no actual difference', () => {
    expect(() => failDataSpaceMutationWithoutEffect('更新', 'Orders')).toThrow('Orders 更新未产生实际变更')
  })
})

describe('SPARK save response diagnostics', () => {
  it.each([0, 200, '0', '200', 'success'])('accepts explicit successful code %s', Code => {
    expect(() => assertDataSpaceSaveSuccess({ Code, Type: 'success', Result: {} })).not.toThrow()
  })

  it.each([
    { Code: 403 }, { code: 500 }, { Type: 'error' }, { success: false },
    { Result: { Code: 403 } }, { Result: { data: { Success: false } } },
  ])('rejects explicit failure %j', failure => {
    expect(() => assertDataSpaceSaveSuccess({ ...failure, Message: 'denied' })).toThrow('denied')
  })

  it('checks failure messages unless the caller explicitly disables the heuristic', () => {
    const response = { Code: 200, Message: '字段更新失败', Result: {} }
    expect(() => assertDataSpaceSaveSuccess(response)).toThrow('字段更新失败')
    expect(() => assertDataSpaceSaveSuccess(response, { treatErrorMessageAsFailure: false })).not.toThrow()
  })

  it('rejects field failures in the response envelope, including full HTTP responses', () => {
    const response = { data: { Code: 200, Message: '操作成功', Result: {}, Extras: [
      { target: '更新失败字段', message: [{ amount: '不可修改' }] },
      { target: '新增失败字段', message: [{ code: '字段已存在' }] },
    ] } }
    expect(() => assertDataSpaceSaveSuccess(response)).toThrow('更新失败字段：amount：不可修改；新增失败字段：code：字段已存在')
  })

  it.each([
    {}, { target: '未知诊断', message: [] }, { target: '新增失败字段', message: '失败' },
    { target: '更新失败字段', message: ['失败'] }, { target: '删除失败字段', message: [{}] },
  ])('rejects malformed or unknown Extras diagnostics %j', diagnostic => {
    expect(() => assertDataSpaceSaveSuccess({ Code: 200, Extras: [diagnostic] })).toThrow('Extras')
  })

  it('accepts empty diagnostics but does not interpret business Extras as response failures', () => {
    expect(() => assertDataSpaceSaveSuccess({ Code: 200, Extras: '' })).not.toThrow()
    expect(() => assertDataSpaceSaveSuccess({ Code: 200, Extras: [{ target: '新增失败字段', message: [] }] })).not.toThrow()
    const Extras = [{ target: '业务属性', message: '备注' }]
    expect(() => assertDataSpaceSaveSuccess({ Code: 200, Result: { Code: 200, Extras } })).not.toThrow()
    expect(() => assertDataSpaceSaveSuccess({ Extras })).not.toThrow()
  })

  it.each([null, {}, false, 'unexpected'].map(Extras => ({ Extras })))('rejects malformed envelope Extras $Extras', ({ Extras }) => {
    expect(() => assertDataSpaceSaveSuccess({ Code: 200, Extras })).toThrow('Extras')
  })
})

describe('SPARK save action order', () => {
  it.each([
    ['added', 'changed', 'deleted'], ['added', 'deleted', 'changed'],
    ['changed', 'added', 'deleted'], ['changed', 'deleted', 'added'],
    ['deleted', 'added', 'changed'], ['deleted', 'changed', 'added'],
  ])('preserves the complete permutation %s/%s/%s', (...order) => {
    expect(snapshotDataSpaceSaveActionOrder(order)).toEqual(order)
  })

  it.each([
    undefined, null, 'added', [], ['added'], ['added', 'changed'],
    ['added', 'added', 'deleted'], ['added', 'changed', 'other'],
    ['added', 'changed', 'deleted', 'added'], [0, 'changed', 'deleted'],
  ].map(order => ({ order })))('rejects an explicitly invalid order $order', ({ order }) => {
    expect(() => snapshotDataSpaceSaveActionOrder(order)).toThrow('actionOrder')
  })

  it('captures an immutable order before asynchronous save work', () => {
    const order = ['deleted', 'added', 'changed']
    const captured = snapshotDataSpaceSaveActionOrder(order)
    order.reverse()
    expect(captured).toEqual(['deleted', 'added', 'changed'])
    expect(Object.isFrozen(captured)).toBe(true)
    expect(captured).not.toBe(order)
  })
})
