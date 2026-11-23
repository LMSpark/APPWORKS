// @vitest-environment node
import {expect, it} from 'vitest'
import {DataSet, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {ApplicationDictionaryResource, AuthenticatedDictionaryResource} from '../application-resource'

class DictionaryQueryHttp extends HttpClientBase {
  calls: RequestConfig[] = []
  mode = 'complete'
  onResponse = () => {}
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    const index = this.calls.length
    const rows = index === 1 ? Array.from({length: 500}, (_, i) => ({rowid: `R${i}`, val: i, txt: `状态${i}`, ordIdx: i})) : [{rowid: this.mode === 'duplicate' ? 'R0' : 'R500', val: 500, txt: '状态500', ordIdx: 500}]
    if (this.mode === 'invalid-label') Reflect.set(rows[0]!, 'txt', {})
    if (this.mode === 'duplicate-value' && index === 2) Reflect.set(rows[0]!, 'val', '0')
    if (this.mode === 'missing-id') Reflect.deleteProperty(rows[0]!, 'rowid')
    this.onResponse()
    return {data: {Code: 200, Result: {data: {Items: rows, Count: this.mode === 'incomplete' ? 502 : 501}}}, status: 200, statusText: 'OK', headers: {}}
  }
}

it.each(['complete', 'duplicate', 'missing-id', 'incomplete', 'stale', 'invalid-label', 'duplicate-value'])('queries application dictionaries through the original view for %s', async mode => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}}), http = new DictionaryQueryHttp(); http.mode = mode
  let scope = 'scope'
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'State', resource: {resourceType: 'logical-view', resourceId: 'application-dictionary:流程步骤状态'}, columns: [{name: 'rowid', primary: true}, {name: 'val'}, {name: 'txt'}, {name: 'ordIdx', type: 'number'}]})
  const resource = new ApplicationDictionaryResource({http, readScope: () => ({token: scope, headers: {'X-AppId': 'APP', 'X-FormKey': 'OLD', Authorization: 'fixture'}}), name: '流程步骤状态', assertCurrent: () => {}})
  view.queryConfig = {pagination: 'none'}
  bindDataSetReadonlyCommandQuery(view, resource.binding(view))
  if (mode === 'stale') http.onResponse = () => {scope = 'next'}
  try {
    await view.refresh()
    if (mode !== 'complete') {expect(view.loadingError).toBeInstanceOf(Error); expect(view.rows).toEqual([]); return}
    expect(view.loadingError).toBeNull(); expect(view.rows).toHaveLength(501)
    expect(view.rows[0]).toMatchObject({rowid: 'R0', val: 0, txt: '状态0'})
    expect(http.calls[0]?.headers).toEqual({'X-AppId': 'APP', 'x-FormKey': '', Authorization: 'fixture'})
    expect(http.calls[0]?.data).toMatchObject({Table: [{Name: '流程步骤状态', Type: '字典', PrimaryKeyFields: 'rowid'}], PageParam: {index: 1, size: 500}})
    expect(http.calls[1]?.data).toMatchObject({PageParam: {index: 2, size: 500}})
    const proof = view.captureReadResult(); scope = 'next'; expect(() => proof()).toThrow(/SCOPE/)
  } finally {ds.destroy()}
})

it.each(['complete', 'stale', 'application-required'])('keeps authenticated dictionary scope separate: %s', async mode => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}}), http = new DictionaryQueryHttp()
  let token = 'authenticated'
  const application = mode === 'application-required'
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'Types',
    resource: {resourceType: 'logical-view', resourceId: `${application ? 'application' : 'authenticated'}-dictionary:TblField_type`},
    columns: [{name: 'rowid', primary: true}, {name: 'val'}, {name: 'txt'}, {name: 'ordIdx', type: 'number'}]})
  const options = {http, readScope: () => ({token, headers: {}}), name: 'TblField_type'}
  const resource = application ? new ApplicationDictionaryResource(options) : new AuthenticatedDictionaryResource(options)
  view.queryConfig = {pagination: 'none'}
  bindDataSetReadonlyCommandQuery(view, resource.binding(view))
  if (mode === 'stale') http.onResponse = () => {token = 'changed'}
  try {
    await view.refresh()
    if (mode !== 'complete') {
      expect(view.loadingError).toBeInstanceOf(Error)
      expect(view.rows).toEqual([])
      if (application) expect(http.calls).toHaveLength(0)
      return
    }
    expect(view.loadingError).toBeNull()
    expect(view.rows).toHaveLength(501)
    expect(http.calls[0]?.headers).toEqual({'x-FormKey': ''})
    expect(view.addActionState()).not.toBe('enabled')
    const proof = view.captureReadResult()
    token = 'changed'
    expect(() => proof()).toThrow(/SCOPE/)
  } finally {ds.destroy()}
})
