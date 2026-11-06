import {afterEach, describe, expect, it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceDesignApi} from '../../../design/data-space-design-api'
import {DataSpaceRuntimeApi} from '../../data-space-runtime-api'
import {DataSpaceQueryCache} from '../../query/data-space-query-cache'
import {DataSpaceQueryContext} from '../../query/data-space-query-context'
import {DataSpaceQueryTable} from '../../protocol/data-space-query-table'

const identity = {scenarioId: 'SPACE', metaName: 'NestedView'}
const credential = 'RAW_CHILD_CREDENTIAL'
const hiddenValue = 'SECRET_CHILD_VALUE'
const nested = {children: [{rowid: 'CHILD', value: hiddenValue,
  lingma_sys_key: credential, lingma_sys_params: {h: ['value'], m: ['phone'], e: ['value']}}]}
function response(payload: unknown = nested, caption = 'Before') {
  return {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: true, lingma_sys_key: 'ROOT_TABLE', data: {Items: [
    {rowid: 'ROOT', caption, payload, lingma_sys_key: 'ROOT_ROW', lingma_sys_params: {e: ['caption'], d: true}},
  ], Count: 1}}}
}
function context(payload: unknown) {
  return new DataSpaceQueryContext({identity, scope: 'SCOPE', readScope: () => 'SCOPE',
    snapshot: new DataSpaceQueryTable(identity).applyResult(response(payload))})
}
class NestedHttp extends HttpClientBase {
  calls = 0
  value: unknown = response()
  protected override async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls++
    return {data: this.value, status: 200, statusText: 'OK', headers: {}}
  }
}
const sets: DataSet[] = []
afterEach(() => sets.splice(0).forEach(set => set.destroy()))
function setup() {
  const formal = DataSpaceDesignApi.projectModel({rowid: 'MODEL', Name: 'NestedView', Type: '视图',
    MetaName: 'LogicalResource', PrimaryKeyFields: 'rowid'}, [
    {rowid: 'KEY', dataModelId: 'MODEL', Name: 'rowid', FieldType: 'string', IsOutput: 1},
    {rowid: 'CAPTION', dataModelId: 'MODEL', Name: 'caption', FieldType: 'string', IsOutput: 1},
    {rowid: 'PAYLOAD', dataModelId: 'MODEL', Name: 'payload', FieldType: 'json', IsOutput: 1},
  ], 'rowid')
  const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: {InternalConfig: {tableName: 'InternalConfig',
    resourceType: 'logical-view', modelBinding: {modelId: 'MODEL', modelName: 'NestedView'},
    columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'caption', type: 'string'}, {name: 'payload', type: 'json'}],
    views: {default: {queryConfig: {cacheType: 'page'}}}}}})
  sets.push(ds)
  const http = new NestedHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
  const view = ds.getView('InternalConfig')!
  runtime.bindModelView(view, formal)
  return {ds, view, http}
}

describe('public query result boundary for unowned nested authorization', () => {
  it.each([
    {children: [{lingma_sys_key: credential}]},
    {Items: [{lingma_sys_params: {h: ['secret']}}]},
    {deep: {object: {lingma_sys_key: credential}}},
    {children: [{lingma_sys_key: ''}]},
    {children: [{lingma_sys_key: null}]},
    {children: [{lingma_sys_params: null}]},
    {children: [{lingma_sys_params: {}}]},
  ])('rejects descendant platform permission members before publishing rows %j', payload => {
    expect(() => context(payload)).toThrow('SPARK_NESTED_RESULT_UNSUPPORTED')
  })

  it('reports the field path without credential or child business values', () => {
    let error: unknown
    try {context(nested)} catch (cause) {error = cause}
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain('payload')
    expect(message).toContain('children')
    expect(message).toContain('[0]')
    expect(message).toContain('$[0]["payload"]["children"][0]["lingma_sys_key"]')
    expect(message).not.toContain(credential)
    expect(message).not.toContain(hiddenValue)
  })

  it('preserves ordinary JSON and top-level signed row permissions', () => {
    const json = {groups: [{id: 1, token: 'ordinary business key', params: {enabled: false}}], empty: null,
      documentation: '{"lingma_sys_key":"literal text example"}'}
    const result = context(json)
    expect(result.rows[0]?.['payload']).toEqual(json)
    expect(result.rows[0]).not.toHaveProperty('lingma_sys_key')
    expect(result.rows[0]).not.toHaveProperty('lingma_sys_params')
    expect(result.editActionState('ROOT')).toBe('enabled')
    expect(result.allowAdd).toBe(true)
  })

  it('rejects direct runtime queries independently of output mode or formal source binding', async () => {
    const http = new NestedHttp(), runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    for (const outputType of ['Table', 'Join', 'Navigation', 'HierarchyData']) {
      await expect(runtime.query(identity, {outputType})).rejects.toThrow('SPARK_NESTED_RESULT_UNSUPPORTED')
    }
    expect(http.calls).toBe(4)
  })

  it('rejects logical-view ingestion, preserves the last successful view and does not cache rejection', async () => {
    const {view, http} = setup()
    http.value = response({items: [{name: 'plain JSON'}]})
    await view.loadFromServer()
    const before = structuredClone(view.rows.map(row => ({...row}))), columns = view.columns
    const current = view.rows[0]!
    view.setCurrentRow(current); view.setSelectedRows([current])
    view.queryContext = {attempt: 2}
    http.value = response()
    await expect(view.loadFromServer()).rejects.toThrow('SPARK_NESTED_RESULT_UNSUPPORTED')
    expect(view.rows).toEqual(before)
    expect(() => view.readSnapshot()).toThrow('DATA_VIEW_READ_RESULT')
    expect(view.columns).toEqual(columns)
    expect(view.currentRow).toBe(current)
    expect(view.selectedRows).toEqual([current])
    http.value = response({items: [{name: 'accepted replacement'}]}, 'After')
    await view.loadFromServer()
    expect(view.rows[0]?.['caption']).toBe('After')
    expect(http.calls).toBe(3)
  })

  it('never caches a result that failed its public context boundary', async () => {
    const http = new NestedHttp(), cache = new DataSpaceQueryCache({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    const request = {identity, cache: {page: {}, definition: 'formal', isCurrent: () => true}}
    await expect(cache.query(request)).rejects.toThrow('SPARK_NESTED_RESULT_UNSUPPORTED')
    http.value = response({items: ['valid JSON']})
    expect((await cache.query(request)).rows[0]?.['payload']).toEqual({items: ['valid JSON']})
    expect(http.calls).toBe(2)
    cache.dispose()
  })

  it('keeps nonpublished response fields outside the public projection boundary', () => {
    const result = new DataSpaceQueryContext({identity, scope: 'SCOPE', readScope: () => 'SCOPE', resultKind: 'join',
      columns: [{name: 'rowid', type: 'string'}, {name: 'caption', type: 'string'}],
      snapshot: new DataSpaceQueryTable(identity).applyResult(response())})
    expect(result.rows).toEqual([{rowid: 'ROOT', caption: 'Before'}])
    expect(result.readFieldAccess(result.rows[0]!, 'payload')).toBe('invisible')
  })
})


describe('formal view explicit unpaged query', () => {
  it('publishes unknown Count without silently requesting a page', async () => {
    const {view, http} = setup()
    view.queryConfig = {pagination: 'none', maxRows: 5}
    http.value = {Code: 200, Result: {data: [{rowid: 'ROOT', caption: 'Unpaged'}]}}
    await view.loadFromServer()
    expect(view.rows).toHaveLength(1)
    expect(view.countReported).toBe(false)
    expect(view.readSnapshot().countReported).toBe(false)
    await expect(view.loadFromServer({page: 1})).rejects.toThrow('pagination')
    expect(http.calls).toBe(1)
  })
})


describe('unpaged source auxiliary reads', () => {
  it('uses an explicitly paged complete option query without changing source preferences', async () => {
    const {view, http} = setup()
    view.queryConfig = {pagination: 'none', maxRows: 5}
    http.value = response({plain: true})
    expect(await view.queryOptionRows({fields: ['caption']})).toEqual([{caption: 'Before'}])
    expect(view.queryConfig.pagination).toBe('none')
    expect(http.calls).toBe(1)
  })
})
