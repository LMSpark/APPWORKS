import {describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const model: FormalModel = {id: 'MODEL', name: 'Orders', metaName: 'Orders', sourceName: 'PhysicalOrders',
  sourceId: 'DB', sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {},
  fields: ['id', 'title'].map(name => ({id: `FIELD-${name}`, modelId: 'MODEL', name, canonicalName: name,
    type: 'string', primaryKey: name === 'id', description: name, output: true, computed: false,
    order: 0, orderType: '', raw: {}}))}

class SubmitHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  query: unknown = {primaryKeyField: 'id', allowAdd: false, data: {Items: [{id: 'A', title: 'Before',
    lingma_sys_key: 'SIGNED', lingma_sys_params: {r: ['id', 'title'], e: ['title'], d: true}}], Count: 1}}
  receipt: unknown = {maplistedit: [{PhysicalOrders: [{id: 'A', title: 'Accepted'}]}]}
  queryResponse?: (config: RequestConfig) => Promise<unknown>
  saveResponse?: () => Promise<unknown>
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200,
      Result: Array.isArray(config.data) ? this.saveResponse ? await this.saveResponse() : this.receipt
        : this.queryResponse ? await this.queryResponse(config) : this.query}}
  }
}

type SubmitRuntime = Readonly<{http: SubmitHttp; runtime: DataSpaceRuntimeApi}>

function fixture() {
  let stored: string | null = null
  const workspace = () => new ProjectWorkspace({projectId: 'APP',
    pageFiles: {readPageFile: async () => {throw new Error('unexpected page file')}},
    blueprint: {},
    scenarioViews: {readScope: () => 'SCOPE', readText: async () => stored,
      writeText: async (_id, text) => {stored = text}},
  })
  const text = (configuration: Record<string, unknown> = {}) => JSON.stringify({scenarioId: 'SPACE', tables: {
    Orders: {modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, ...configuration,
      views: {default: {commitMode: 'staged'}, detail: {commitMode: 'staged'}}},
  }})
  const reopen = async (shared?: SubmitRuntime) => {
    const owner = workspace()
    const file = await owner.loadScenarioViews({scenarioId: 'SPACE'})
    const http = shared?.http ?? new SubmitHttp()
    const runtime = shared?.runtime ?? new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {'X-AppId': 'APP'}})})
    const {dataSet} = new LowcodeDataSpaceAssembler(runtime, http).assemble({config: file.value,
      space: {dataSpaceId: 'SPACE', name: 'Orders space'}, models: [model], relations: []})
    return {owner, file, http, runtime, dataSet, view: dataSet.getView('Orders', 'detail')!, table: dataSet.getTable('Orders')!}
  }
  const save = async (configuration: Record<string, unknown>) => {
    const owner = workspace()
    const file = await owner.createScenarioViews({scenarioId: 'SPACE', text: text(configuration)})
    await owner.saveScenarioViews({scenarioId: 'SPACE'})
    expect(file.isDirty).toBe(false)
    return reopen()
  }
  return {save, reopen, text}
}

describe('persisted DataTable submission configuration', () => {
  it('saves only the changed row from one page without querying unopened views or deleting unloaded rows', async () => {
    const f = await fixture().save({})
    try {
      f.http.query = {primaryKeyField: 'id', allowAdd: false, data: {Items: [
        {id: 'A', title: 'Before', lingma_sys_key: 'SIGNED', lingma_sys_params: {r: ['id', 'title'], e: ['title'], d: true}},
        {id: 'B', title: 'Untouched', lingma_sys_key: 'SIGNED-B', lingma_sys_params: {r: ['id', 'title'], e: ['title'], d: true}},
      ], Count: 100}}
      const unopened = f.dataSet.getView('Orders', 'default')!
      const unused = f.dataSet.addTable('UnopenedMetadata', [{name: 'id', type: 'string', isPrimaryKey: true}]).getOrCreateView('default')
      const unreadState = [unopened.requestState, unused.requestState]
      await f.view.loadFromServer({page: 1, pageSize: 2})
      expect(f.view.rows).toHaveLength(2)
      expect(f.view.total).toBe(100)
      f.view.updateEditingValue('A', 'title', 'Changed')

      await expect(f.dataSet.saveChanges()).resolves.toMatchObject({success: true,
        data: {createdCount: 0, savedCount: 1, deletedCount: 0, failedCount: 0}})
      expect(f.http.requests).toHaveLength(2)
      expect(f.http.requests[1]).toMatchObject({url: '/api/DataOperation/BatchTableOperateRequestByCRUD'})
      expect(f.http.requests[1]?.data).toEqual([{TableName: 'Orders', CrudModel: {
        Added: [], Changed: [{id: 'A', title: 'Changed', lingma_sys_key: 'SIGNED'}], Deleted: [],
      }}])
      expect(f.view.rows.find(row => row['id'] === 'B')?.['title']).toBe('Untouched')
      expect(f.view.rows.find(row => row['id'] === 'A')?.['title']).toBe('Accepted')
      expect(f.view.total).toBe(100)
      expect([unopened.requestState, unused.requestState]).toEqual(unreadState)
      expect(unopened.rows).toEqual([])
      expect(unused.rows).toEqual([])
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.file.isDirty).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it('applies the shared table timeout to the default formal query', async () => {
    const f = await fixture().save({crudConfig: {timeout: 1234}})
    try {
      await f.view.loadFromServer()
      expect(f.http.requests[0]).toMatchObject({url: '/api/DataOperation/GetData', timeout: 1234})
      expect(f.view.rows[0]?.['title']).toBe('Before')
    } finally {f.dataSet.destroy()}
  })

  it('saves and reopens the list endpoint then retains formal query permissions and signed submission', async () => {
    const f = await fixture().save({api: {list: {url: '/api/orders/list', method: 'POST',
      headers: {'X-Query-Profile': 'editor'}, params: {source: 'design'}}}, crudConfig: {timeout: 4321}})
    try {
      await f.view.loadFromServer()
      expect(f.http.requests[0]).toMatchObject({url: '/api/orders/list', method: 'POST', timeout: 4321,
        params: {source: 'design'}, headers: {'X-AppId': 'APP', 'x-FormKey': 'SPACE', 'x-query-profile': 'editor'},
        retry: 0, cache: false, data: {OutputFieldMode: 'REQUEST', Table: [{Name: 'Orders'}]}})
      expect(f.view.fieldAccess(f.view.rows[0]!, 'title').write).toBe('allowed')
      await f.view.editRowById('A', {title: 'Changed'})
      await expect(f.view.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
      expect(f.http.requests.at(-1)).toMatchObject({url: '/api/DataOperation/BatchTableOperateRequestByCRUD',
        data: [{TableName: 'Orders', CrudModel: {Changed: [{id: 'A', title: 'Changed', lingma_sys_key: 'SIGNED'}]}}]})
      expect(f.view.rows[0]?.['title']).toBe('Accepted')
    } finally {f.dataSet.destroy()}
  })
  it('captures one list configuration for every page and applies later changes only to a new query', async () => {
    const f = await fixture().save({api: {list: {url: '/api/first', params: {revision: 1}}}, crudConfig: {timeout: 1000}})
    try {
      let page = 0
      f.http.queryResponse = async request => {
        page++
        const body = request.data
        expect(isRecord(body) && body['PageParam']).toBeTruthy()
        if (page === 1) {
          f.table.setApi({list: {url: '/api/next', params: {revision: 2}}})
          f.table.setCrudConfig({timeout: 2000})
        }
        return {primaryKeyField: 'id', allowAdd: false, data: {Items: [{id: String(page), title: `Page ${page}`,
          lingma_sys_key: `SIGNED-${page}`, lingma_sys_params: {e: ['title']}}], Count: 2}}
      }
      await f.view.loadFromServer({allPages: true, pageSize: 1})
      expect(f.view.rows.map(row => row['id'])).toEqual(['1', '2'])
      expect(f.http.requests).toHaveLength(2)
      for (const request of f.http.requests) {
        expect(request).toMatchObject({url: '/api/first', timeout: 1000, params: {revision: 1}})
      }
      expect(f.dataSet.getView('Orders', 'default')?.rows).toEqual([])
      delete f.http.queryResponse
      await f.view.loadFromServer()
      expect(f.http.requests.at(-1)).toMatchObject({url: '/api/next', timeout: 2000, params: {revision: 2}})
      expect(f.file.getText()).toContain('/api/first')
      expect(f.file.isDirty).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it.each(['equivalent', 'url', 'headers', 'params', 'timeout'] as const)('isolates in-flight queries by effective %s configuration', async difference => {
    const storage = fixture()
    const first = await storage.save({api: {list: {url: '/api/list', headers: {'X-Profile': 'one'},
      params: {a: 1, b: 2}}}, crudConfig: {timeout: 1000}})
    const second = await storage.reopen(first)
    const pending: Array<(value: unknown) => void> = []
    const loads: Promise<unknown>[] = []
    try {
      second.table.setApi({list: {url: difference === 'url' ? '/api/other' : '/api/list', method: 'POST',
        headers: {'x-profile': difference === 'headers' ? 'two' : 'one'},
        params: {b: 2, a: difference === 'params' ? 2 : 1}}})
      second.table.setCrudConfig({timeout: difference === 'timeout' ? 2000 : 1000})
      first.http.queryResponse = () => new Promise(resolve => {pending.push(resolve)})
      loads.push(first.view.loadFromServer(), second.view.loadFromServer())
      const count = difference === 'equivalent' ? 1 : 2
      await vi.waitFor(() => expect(pending).toHaveLength(count))
      pending.forEach((resolve, index) => resolve({primaryKeyField: 'id', allowAdd: false, data: {
        Items: [{id: 'A', title: `Result ${index}`, lingma_sys_key: `SIGNED-${index}`, lingma_sys_params: {e: ['title']}}], Count: 1}}))
      await Promise.all(loads)
      expect(first.http.requests).toHaveLength(count)
      expect(first.view.rows[0]?.['title']).toBe('Result 0')
      expect(second.view.rows[0]?.['title']).toBe(`Result ${count - 1}`)
      expect(first.view.rows[0]).not.toBe(second.view.rows[0])
      await first.view.editRowById('A', {title: 'Changed'})
      await first.view.saveChanges()
      expect(first.http.requests.at(-1)?.data).toMatchObject([{CrudModel: {Changed: [
        {id: 'A', title: 'Changed', lingma_sys_key: 'SIGNED-0'},
      ]}}])
    } finally {
      pending.forEach(resolve => resolve(first.http.query))
      await Promise.allSettled(loads)
      first.dataSet.destroy(); second.dataSet.destroy()
    }
  })

  it('keeps old results non-writable after a configured query failure and recovers through a fresh query', async () => {
    const f = await fixture().save({api: {list: {url: '/api/list'}}})
    try {
      await f.view.loadFromServer()
      const original = f.view.rows
      f.http.queryResponse = async () => {throw new Error('query failed')}
      await expect(f.view.loadFromServer()).rejects.toThrow('query failed')
      expect(f.http.requests).toHaveLength(2)
      expect(f.view.rows).toBe(original)
      expect(f.view.fieldAccess(original[0]!, 'title').write).toBe('denied')
      await expect(f.view.editRowById('A', {title: 'Forbidden'})).rejects.toThrow('DATA_VIEW_RESULT_STALE')
      delete f.http.queryResponse
      await f.view.loadFromServer()
      expect(f.view.fieldAccess(f.view.rows[0]!, 'title').write).toBe('allowed')
    } finally {f.dataSet.destroy()}
  })

  it('captures the query route before waiting for an in-flight save', async () => {
    const f = await fixture().save({api: {list: {url: '/api/before'}}})
    let release: ((value: unknown) => void) | undefined
    const operations: Promise<unknown>[] = []
    try {
      await f.view.loadFromServer()
      await f.view.editRowById('A', {title: 'Changed'})
      f.http.saveResponse = () => new Promise(resolve => {release = resolve})
      operations.push(f.view.saveChanges())
      await vi.waitFor(() => expect(release).toBeDefined())
      const other = f.dataSet.getView('Orders', 'default')!
      operations.push(other.loadFromServer())
      f.table.setApi({list: {url: '/api/after'}})
      release!(f.http.receipt)
      await Promise.all(operations)
      expect(f.http.requests.map(request => request.url)).toEqual([
        '/api/before', '/api/DataOperation/BatchTableOperateRequestByCRUD', '/api/before',
      ])
      await other.loadFromServer()
      expect(f.http.requests.at(-1)?.url).toBe('/api/after')
    } finally {
      release?.(f.http.receipt)
      await Promise.allSettled(operations)
      f.dataSet.destroy()
    }
  })

  it('retains returned field restrictions at a configured list endpoint', async () => {
    const f = await fixture().save({api: {list: {url: '/api/list'}}})
    try {
      f.http.query = {primaryKeyField: 'id', allowAdd: false, data: {Items: [{id: 'A', title: 'Hidden',
        lingma_sys_key: 'SIGNED', lingma_sys_params: {h: ['title'], e: []}}], Count: 1}}
      await f.view.loadFromServer()
      expect(f.view.fieldAccess(f.view.rows[0]!, 'title')).toMatchObject({read: 'invisible', write: 'denied'})
      expect(f.view.rows[0]).not.toHaveProperty('lingma_sys_key')
    } finally {f.dataSet.destroy()}
  })

  it('restores the default list route after removing configuration and reopening its file', async () => {
    const storage = fixture()
    const before = await storage.save({api: {list: {url: '/api/list'}}, crudConfig: {timeout: 1234}})
    try {
      before.file.setText(storage.text())
      await before.owner.saveScenarioViews({scenarioId: 'SPACE'})
      const after = await storage.reopen()
      try {
        await after.view.loadFromServer()
        expect(after.http.requests[0]?.url).toBe('/api/DataOperation/GetData')
        expect(after.http.requests[0]?.timeout).toBeUndefined()
        expect(before.table.api?.list?.url).toBe('/api/list')
      } finally {after.dataSet.destroy()}
    } finally {before.dataSet.destroy()}
  })

  it('rejects a runtime list header that collides with a current request header before I/O', async () => {
    const http = new SubmitHttp()
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {'X-Profile': 'runtime'}})})
    const storage = fixture()
    const created = await storage.save({})
    const f = await storage.reopen({http, runtime})
    try {
      f.table.setApi({list: {url: '/api/list', headers: {'x-profile': 'override'}}})
      await expect(f.view.loadFromServer()).rejects.toThrow('不能覆盖运行请求头')
      expect(http.requests).toHaveLength(0)
    } finally {created.dataSet.destroy(); f.dataSet.destroy()}
  })

  it('saves and reopens table configuration then uses it for an actual signed model update', async () => {
    const storage = fixture()
    const runtime = await storage.save({api: {update: {url: '/api/orders/save', method: 'POST',
      headers: {'X-Save-Profile': 'editor'}, params: {source: 'design'}}}, crudConfig: {timeout: 4321}})
    const other = await storage.reopen()
    try {
      expect(runtime.table.api?.update?.url).toBe('/api/orders/save')
      expect(runtime.view.dataTable).toBe(runtime.dataSet.getView('Orders', 'default')?.dataTable)
      expect(runtime.table.api).not.toBe(other.table.api)
      await runtime.view.loadFromServer()
      expect(await runtime.view.editRowById('A', {title: 'Changed'})).toBe(true)
      await expect(runtime.view.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
      expect(runtime.http.requests.at(-1)).toMatchObject({url: '/api/orders/save', method: 'POST', timeout: 4321,
        params: {source: 'design'}, headers: {'X-AppId': 'APP', 'x-FormKey': 'SPACE', 'x-save-profile': 'editor'},
        retry: 0, cache: false,
        data: [{TableName: 'Orders', CrudModel: {Added: [], Changed: [{id: 'A', title: 'Changed', lingma_sys_key: 'SIGNED'}], Deleted: []}}]})
      expect(runtime.view.rows[0]?.['title']).toBe('Accepted')
      expect(runtime.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(other.table.api?.update?.url).toBe('/api/orders/save')
    } finally {runtime.dataSet.destroy(); other.dataSet.destroy()}
  })

  it.each(['create', 'delete'] as const)('uses the %s endpoint and its actual action receipt', async operation => {
    const runtime = await fixture().save({api: {[operation]: {url: `/api/orders/${operation}`, method: 'POST'}}})
    try {
      runtime.http.query = {primaryKeyField: 'id', allowAdd: true, lingma_sys_key: 'TABLE-SIGNED',
        data: {Items: [{id: 'A', title: 'Before', lingma_sys_key: 'SIGNED',
          lingma_sys_params: {r: ['id', 'title'], e: ['title'], d: true}}], Count: 1}}
      await runtime.view.loadFromServer()
      if (operation === 'create') {
        await runtime.view.addRow({id: 'B', title: 'Created'})
        runtime.http.receipt = {maplistadd: [{PhysicalOrders: [{id: 'B', title: 'Created'}]}]}
      } else {
        await runtime.view.removeRow('A')
        runtime.http.receipt = {maplistdelete: [{PhysicalOrders: [{id: 'A'}]}]}
      }
      await expect(runtime.dataSet.saveChanges()).resolves.toMatchObject({success: true,
        data: operation === 'create' ? {createdCount: 1} : {deletedCount: 1}})
      const request = runtime.http.requests.at(-1)
      expect(request?.url).toBe(`/api/orders/${operation}`)
      expect(JSON.stringify(request?.data)).toContain(operation === 'create' ? 'TABLE-SIGNED' : 'SIGNED')
      expect(runtime.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(runtime.view.rows).toHaveLength(operation === 'create' ? 2 : 0)
    } finally {runtime.dataSet.destroy()}
  })

  it('rejects incompatible active routes before any write and retains all pending changes', async () => {
    const runtime = await fixture().save({api: {create: {url: '/api/create'}, update: {url: '/api/update'}}})
    try {
      runtime.http.query = {primaryKeyField: 'id', allowAdd: true, lingma_sys_key: 'TABLE-SIGNED',
        data: {Items: [{id: 'A', title: 'Before', lingma_sys_key: 'SIGNED', lingma_sys_params: {e: ['title']}}], Count: 1}}
      await runtime.view.loadFromServer()
      await runtime.view.addRow({id: 'B', title: 'Created'})
      await runtime.view.editRowById('A', {title: 'Changed'})
      await expect(runtime.view.saveChanges()).rejects.toThrow('SPARK_SAVE_CONFIG_CONFLICT')
      expect(runtime.http.requests).toHaveLength(1)
      expect(runtime.view.dirtyTracking.isPendingCreate('B')).toBe(true)
      expect(runtime.view.dirtyTracking.isDirty('A')).toBe(true)
      runtime.table.setApi({create: {url: '/api/both'}, update: {url: '/api/both'}})
      runtime.http.receipt = {maplistadd: [{PhysicalOrders: [{id: 'B', title: 'Created'}]}],
        maplistedit: [{PhysicalOrders: [{id: 'A', title: 'Accepted'}]}]}
      await expect(runtime.view.saveChanges()).resolves.toMatchObject({success: true, data: {createdCount: 1, savedCount: 1}})
      expect(runtime.http.requests.at(-1)?.url).toBe('/api/both')
    } finally {runtime.dataSet.destroy()}
  })

  it('uses the submitting table when two instances share an in-flight query context', async () => {
    const storage = fixture()
    const first = await storage.save({api: {update: {url: '/api/first'}}})
    const second = await storage.reopen(first)
    try {
      second.table.setApi({update: {url: '/api/second'}})
      await Promise.all([first.view.loadFromServer(), second.view.loadFromServer()])
      expect(first.http.requests).toHaveLength(1)
      await first.view.editRowById('A', {title: 'Changed'})
      await first.view.saveChanges()
      expect(first.http.requests.at(-1)?.url).toBe('/api/first')
      expect(second.table.api?.update?.url).toBe('/api/second')
    } finally {first.dataSet.destroy(); second.dataSet.destroy()}
  })

  it('keeps dirty changes after an invalid receipt and uses table configuration on a subsequent accepted baseline', async () => {
    const runtime = await fixture().save({api: {update: {url: '/api/orders/save'}}, crudConfig: {retryCount: 0, validateData: true}})
    try {
      await runtime.view.loadFromServer()
      await runtime.view.editRowById('A', {title: 'Changed'})
      runtime.http.receipt = {}
      await expect(runtime.view.saveChanges()).rejects.toThrow()
      expect(runtime.http.requests).toHaveLength(2)
      expect(runtime.view.dirtyTracking.isDirty('A')).toBe(true)
      expect(runtime.view.hasUnconfirmedSave).toBe(true)
      const writes = runtime.http.requests.filter(request => request.url === '/api/orders/save').length
      await expect(runtime.view.saveChanges()).rejects.toThrow('SPARK_SAVE_NOT_APPLIED')
      expect(runtime.http.requests.filter(request => request.url === '/api/orders/save')).toHaveLength(writes)
      expect(runtime.view.dirtyTracking.isDirty('A')).toBe(true)
      runtime.http.receipt = {maplistedit: [{PhysicalOrders: [{id: 'A', title: 'Accepted'}]}]}
      await runtime.view.saveChanges()
      runtime.table.setApi({update: {url: '/api/next'}})
      await runtime.view.editRowById('A', {title: 'Next'})
      runtime.http.receipt = {maplistedit: [{PhysicalOrders: [{id: 'A', title: 'Next'}]}]}
      await runtime.view.saveChanges()
      expect(runtime.http.requests.at(-1)?.url).toBe('/api/next')
      expect(runtime.view.rows[0]?.['title']).toBe('Next')
    } finally {runtime.dataSet.destroy()}
  })

  it('removes persisted submission configuration and restores the default owner route on reopen', async () => {
    const storage = fixture()
    const previous = await storage.save({api: {update: {url: '/api/custom'}}, crudConfig: {timeout: 1234}})
    try {
      previous.file.setText(storage.text())
      await previous.owner.saveScenarioViews({scenarioId: 'SPACE'})
      const current = await storage.reopen()
      try {
        expect(current.table.api).toBeUndefined()
        expect(current.table.crudConfig).toBeUndefined()
        await current.view.loadFromServer()
        await current.view.editRowById('A', {title: 'Changed'})
        await current.view.saveChanges()
        expect(current.http.requests.at(-1)?.url).toBe('/api/DataOperation/BatchTableOperateRequestByCRUD')
        expect(previous.table.api?.update?.url).toBe('/api/custom')
      } finally {current.dataSet.destroy()}
    } finally {previous.dataSet.destroy()}
  })

  it('captures request configuration before the async save queue and rejects non-JSON runtime parameters', async () => {
    const runtime = await fixture().save({api: {update: {url: '/api/captured', params: {version: 1}}}})
    try {
      await runtime.view.loadFromServer()
      await runtime.view.editRowById('A', {title: 'Changed'})
      const saving = runtime.view.saveChanges()
      runtime.table.setApi({update: {url: '/api/later', params: {version: 2}}})
      await saving
      expect(runtime.http.requests.at(-1)).toMatchObject({url: '/api/captured', params: {version: 1}})
      await runtime.view.editRowById('A', {title: 'Later'})
      runtime.table.setApi({update: {url: '/api/later', params: {date: new Date(0)}}})
      await expect(runtime.view.saveChanges()).rejects.toThrow('JSON')
      expect(runtime.http.requests).toHaveLength(2)
      expect(runtime.view.dirtyTracking.isDirty('A')).toBe(true)
    } finally {runtime.dataSet.destroy()}
  })

  it.each([
    {api: {update: {url: 'https://external.invalid/save'}}},
    {api: {update: {url: '/api/save', method: 'DELETE'}}},
    {api: {update: {url: '/api/save', headers: {'x-AppId': 'OTHER'}}}},
    {api: {update: {url: '/api/save', headers: {Authorization: 'credential'}}}},
    {api: {list: {url: 'https://external.invalid/list'}}},
    {api: {list: {url: '/api/list', method: 'GET'}}},
    {api: {list: {url: '/api/{scenario}/list'}}},
    {api: {list: {url: '/api/list', headers: {'x-FormKey': 'OTHER'}}}},
    {api: {transaction: {url: '/api/save'}}},
    {crudConfig: {retryCount: 1}}, {crudConfig: {validateData: false}}, {crudConfig: {timeout: 0}},
    {crudConfig: {transformRequest: 'function-code'}},
  ])('rejects unsupported configuration without changing the file or runtime: %j', async invalid => {
    const storage = fixture()
    const runtime = await storage.save({})
    try {
      const original = runtime.file.getText()
      expect(() => runtime.file.setText(storage.text(invalid))).toThrow()
      expect(runtime.file.getText()).toBe(original)
      expect(runtime.file.isDirty).toBe(false)
      expect(runtime.http.requests).toHaveLength(0)
    } finally {runtime.dataSet.destroy()}
  })
})
