import {describe, expect, it} from 'vitest'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace} from '@spark-appworks/spark-project-model'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
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
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200,
      Result: config.url === '/api/DataOperation/GetData' ? this.query : this.receipt}}
  }
}

type SubmitRuntime = Readonly<{http: SubmitHttp; runtime: DataSpaceRuntimeApi}>

function fixture() {
  let stored: string | null = null
  const workspace = () => new ProjectWorkspace({projectId: 'APP',
    pageFiles: {readPageFile: async () => {throw new Error('unexpected page file')}},
    blueprint: {loadRoot: async () => ({children: []})},
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
