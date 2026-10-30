import {DataViewFilterLocal} from '../../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {DataViewFilterCodec} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'

export function buildFormalModels(entries: Record<string, readonly string[]>) {
  return Object.entries(entries).map(([name, fields]) => ({
    id: `${name}-model`, name, metaName: name, sourceType: 'table', sourceId: 'DB', sourceName: name,
    primaryKey: name === 'Base_UserInfo' ? 'ID' : 'rowid', businessMain: false, raw: {},
    fields: fields.map((field, order) => ({id: field, modelId: `${name}-model`, name: field, canonicalName: field,
      primaryKey: field === (name === 'Base_UserInfo' ? 'ID' : 'rowid'), description: field, type: 'string',
      output: true, computed: false, order, orderType: '', raw: {}})),
  })) satisfies Array<Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>
}

export class StructuredCatalogHttp extends HttpClientBase {
  requests: RequestConfig[] = []
  posts: Array<{url: string; data: unknown}> = []
  rowsByTable: Record<string, Record<string, unknown>[]> = {}
  constructor(tables: Record<string, Record<string, unknown>[]>) {super(); this.rowsByTable = tables}
  override post<T>(url: string, data?: unknown): Promise<T> {
    this.posts.push({url, data})
    if (url.includes('GetView')) return Promise.resolve({Code: 200, Result: {data: {tables: []}}} as T)
    if (url.includes('ViewData/GetView')) return Promise.resolve({Code: 200, Result: {data: {nodes: []}}} as T)
    if (url.includes('GetCodeDesignDetail')) return Promise.resolve({CodeName: '测试编码'} as T)
    if (url.includes('DataWorkFlowDesign/read')) return Promise.resolve({Code: 200, Result: {nodes: [], connectors: []}} as T)
    return Promise.resolve({Code: 200, Result: {}} as T)
  }
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const body = config.data as {Table: Array<{Name: string; Filter?: unknown}>}
    const name = body.Table[0]!.Name
    let rows = this.rowsByTable[name] ?? []
    if (body.Table[0]?.Filter) {
      const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(body.Table[0].Filter))
      rows = rows.filter(row => filter.matches(row))
    }
    return {data: {Code: 200, Result: {primaryKeyField: name === 'Base_UserInfo' ? 'ID' : 'rowid', allowAdd: true,
      lingma_sys_key: 'table-key', data: {Items: rows.map(row => ({...row, lingma_sys_key: 'row-key',
        lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}})), Count: rows.length}}},
      status: 200, statusText: 'OK', headers: {}}
  }
}
