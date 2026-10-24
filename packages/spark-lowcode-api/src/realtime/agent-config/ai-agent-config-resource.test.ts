import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {describe, expect, it, vi} from 'vitest'

type Row = Record<string, unknown>
type QueuedResponse = Readonly<{kind: 'value'; value: unknown}> | Readonly<{kind: 'factory'; run: () => Promise<unknown>}>

class AiAgentConfigHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly responses: QueuedResponse[] = []

  constructor() { super({retry: 2, retryDelay: 0}) }

  respond(value: unknown): void { this.responses.push({kind: 'value', value}) }

  respondAsync(run: () => Promise<unknown>): void { this.responses.push({kind: 'factory', run}) }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const response = this.responses.shift()
    if (response === undefined) throw new Error(`Unexpected request ${config.method} ${config.url}`)
    const result = response.kind === 'factory' ? await response.run() : response.value
    const envelope = typeof result === 'object' && result !== null && 'Code' in result
      ? result : {Code: 200, Result: result}
    return {data: envelope, status: 200, statusText: 'OK', headers: {}}
  }
}

function enqueueHttpError(http: AiAgentConfigHttp, status: number, body: unknown): void {
  http.respondAsync(async () => {
    const config = http.requests.at(-1)
    if (config === undefined) throw new Error('HTTP error fixture requires a dispatched request')
    throw Object.assign(new Error(`HTTP ${status}`), {name: 'RequestError', config, status, response: body})
  })
}

const validAgent = (): Row => ({
  agentName: 'SPARK 通用 AI 批量录入',
  agentPrompt: 'Return only JSON entries using the permitted fields.',
  aiModelId: 'model-001',
  callModelName: 'deepseek-chat',
  enabled: 1,
  functionIds: '',
  maxToolRounds: 1,
  enableSubtask: 0,
  requireApproval: 0,
})

async function fixture() {
  const {AiAgentConfigResource} = await import('./ai-agent-config-resource')
  const dataSet = DataSet.fromJson({scenarioId: 'AI-AGENT-CONFIG', tables: {}})
  const http = new AiAgentConfigHttp()
  let current = true
  const guard = vi.fn(() => { if (!current) throw new Error('Agent config scope expired') })
  const resource = new AiAgentConfigResource({dataSet, http, guard})
  const invalidate = () => { current = false }
  const selector = (view: {tableName: string; viewId: string}) => ({views: [{tableName: view.tableName, viewId: view.viewId}]})
  return {dataSet, http, guard, resource, invalidate, selector}
}

async function stageCreate(requests: {refresh(): Promise<unknown>; addRow(row: Row): Promise<Row>}, values: Row = validAgent()): Promise<Row> {
  await requests.refresh()
  return requests.addRow(values)
}

function agentReadback(id: string, overrides: Row = {}): Row {
  return {
    id,
    agentName: 'SPARK 通用 AI 批量录入',
    agentPrompt: 'Return only JSON entries using the permitted fields.',
    aiModelId: 'model-001',
    callModelName: 'deepseek-chat',
    enabled: 1,
    functionIds: '',
    maxToolRounds: 1,
    enableSubtask: 0,
    requireApproval: 0,
    description: 'private description',
    tools: [{id: 'PRIVATE-TOOL'}],
    password: 'never expose',
    tenantId: 'TENANT-1',
    ...overrides,
  }
}

describe('AiAgentConfigResource native DataSet contract', () => {
  it('creates through the selected command view, keeps operationId local, and returns the formal Agent ID', async () => {
    const f = await fixture()
    try {
      const input = await stageCreate(f.resource.requests)
      expect(input['operationId']).toEqual(expect.any(String))
      expect(input['operationId']).not.toBe('AGENT-1')
      for (const field of ['agentName', 'agentPrompt', 'aiModelId', 'callModelName', 'enabled', 'functionIds',
        'maxToolRounds', 'enableSubtask', 'requireApproval']) {
        expect(f.resource.requests.fieldAccess(input, field).write).toBe('allowed')
      }
      expect(f.resource.requests.fieldAccess(input, 'agentId').write).toBe('denied')
      expect(f.http.requests).toHaveLength(0)

      f.http.respond('AGENT-1')
      const saved = await f.dataSet.saveChanges(f.selector(f.resource.requests))
      expect(saved.success).toBe(true)
      expect(f.http.requests).toHaveLength(1)
      expect(f.http.requests[0]).toMatchObject({method: 'POST', url: '/api/ai-agent/create', retry: 0})
      const createRequest = f.http.requests[0]
      if (createRequest === undefined) throw new Error('Expected one Agent create request')
      expect(createRequest.data).toEqual(validAgent())
      expect(createRequest.data).not.toHaveProperty('id')
      expect(createRequest.data).not.toHaveProperty('operationId')
      expect(createRequest.data).not.toHaveProperty('idempotencyKey')
      expect(f.resource.requests.rows[0]).toMatchObject({operationId: input['operationId'], agentId: 'AGENT-1'})
    } finally { f.dataSet.destroy() }
  })

  it('reads the selected Agent ID through the readonly configuration view and exposes only approved fields', async () => {
    const f = await fixture()
    try {
      await f.resource.configuration.refresh()
      expect(f.http.requests).toHaveLength(0)
      f.resource.configuration.queryContext = {agentId: 'AGENT-1'}
      f.http.respond(agentReadback('AGENT-1'))
      await f.resource.configuration.refresh()
      expect(f.http.requests).toHaveLength(1)
      expect(f.http.requests[0]).toMatchObject({method: 'GET', url: '/api/ai-agent/get', params: {id: 'AGENT-1'}})
      expect(f.resource.configuration.rows).toEqual([expect.objectContaining({
        id: 'AGENT-1', agentName: 'SPARK 通用 AI 批量录入',
        agentPrompt: 'Return only JSON entries using the permitted fields.', aiModelId: 'model-001',
        callModelName: 'deepseek-chat', enabled: 1, functionIds: '', maxToolRounds: 1, enableSubtask: 0,
        requireApproval: 0,
      })])
      const configRow = f.resource.configuration.rows[0]
      if (configRow === undefined) throw new Error('Expected one Agent configuration row')
      expect(f.resource.configuration.fieldAccess(configRow, 'agentPrompt').write).toBe('denied')
      for (const field of ['tools', 'password', 'tenantId', 'description']) {
        expect(f.resource.configuration.rows[0]).not.toHaveProperty(field)
        expect(f.resource.configuration.columns.map(column => column.name)).not.toContain(field)
      }
    } finally { f.dataSet.destroy() }
  })

  it('preserves nullable optional settings from the formal Agent configuration without inventing defaults', async () => {
    const f = await fixture()
    try {
      f.resource.configuration.queryContext = {agentId: 'AGENT-NULLABLE'}
      f.http.respond(agentReadback('AGENT-NULLABLE', {
        callModelName: null, functionIds: null, maxToolRounds: null, enableSubtask: null, requireApproval: null,
      }))
      await f.resource.configuration.refresh()
      expect(f.resource.configuration.loadingError).toBeNull()
      expect(f.resource.configuration.rows).toEqual([expect.objectContaining({
        id: 'AGENT-NULLABLE', agentName: 'SPARK 通用 AI 批量录入',
        agentPrompt: 'Return only JSON entries using the permitted fields.', aiModelId: 'model-001', enabled: 1,
        callModelName: null, functionIds: null, maxToolRounds: null, enableSubtask: null, requireApproval: null,
      })])
    } finally { f.dataSet.destroy() }
  })

  it('does not accept or emit rows from an Agent GET that becomes stale while requestRefresh is deferred', async () => {
    const f = await fixture()
    let releaseFirst: ((value: unknown) => void) | undefined
    const rowChanges: string[][] = []
    f.resource.configuration.events.on('rowsChanged', () => {
      rowChanges.push(f.resource.configuration.rows.map(row => String(row['id'])))
    })
    f.resource.configuration.queryContext = {agentId: 'AGENT-1'}
    f.http.respondAsync(() => new Promise(resolve => { releaseFirst = resolve }))
    f.http.respond(agentReadback('AGENT-2'))
    try {
      const firstLoad = f.resource.configuration.refresh()
      await vi.waitFor(() => expect(f.http.requests).toHaveLength(1))

      f.resource.configuration.queryContext = {agentId: 'AGENT-2'}
      const deferredRefresh = await f.resource.configuration.requestRefresh()
      expect(deferredRefresh.success).toBe(true)
      expect(f.resource.configuration.refreshPending).toBe(true)

      const release = releaseFirst
      if (release === undefined) throw new Error('Expected pending Agent-1 configuration response')
      release(agentReadback('AGENT-1'))
      await firstLoad

      await vi.waitFor(() => expect(f.http.requests).toHaveLength(2))
      await vi.waitFor(() => expect(f.resource.configuration.rows).toEqual([expect.objectContaining({id: 'AGENT-2'})]))
      expect(f.http.requests.map(request => request.params)).toEqual([{id: 'AGENT-1'}, {id: 'AGENT-2'}])
      expect(rowChanges).not.toContainEqual(['AGENT-1'])
      expect(rowChanges.at(-1)).toEqual(['AGENT-2'])
    } finally { f.dataSet.destroy() }
  })

  it('fails a stale Agent GET when the target changes without registering a refresh', async () => {
    const f = await fixture()
    let releaseFirst: ((value: unknown) => void) | undefined
    const rowChanges: string[][] = []
    f.resource.configuration.events.on('rowsChanged', () => {
      rowChanges.push(f.resource.configuration.rows.map(row => String(row['id'])))
    })
    f.resource.configuration.queryContext = {agentId: 'AGENT-1'}
    f.http.respondAsync(() => new Promise(resolve => { releaseFirst = resolve }))
    try {
      const load = f.resource.configuration.refresh()
      await vi.waitFor(() => expect(f.http.requests).toHaveLength(1))

      f.resource.configuration.queryContext = {agentId: 'AGENT-2'}
      const release = releaseFirst
      if (release === undefined) throw new Error('Expected pending Agent-1 configuration response')
      release(agentReadback('AGENT-1'))
      await load

      expect(f.http.requests).toHaveLength(1)
      expect(f.resource.configuration.loadingError).toBeInstanceOf(Error)
      expect(f.resource.configuration.loadingError?.message).toContain('目标已改变')
      expect(f.resource.configuration.rows).toEqual([])
      expect(rowChanges).not.toContainEqual(['AGENT-1'])
    } finally { f.dataSet.destroy() }
  })

  it.each([
    ['missing id', {id: null}],
    ['invalid agent name', {agentName: null}],
    ['blank system prompt', {agentPrompt: '  '}],
    ['invalid model id type', {aiModelId: 123}],
    ['invalid enabled type', {enabled: '1'}],
    ['invalid enabled value', {enabled: 2}],
  ])('rejects formal readback with %s instead of coercing core settings', async (_caseName, overrides) => {
    const f = await fixture()
    try {
      f.resource.configuration.queryContext = {agentId: 'AGENT-EXPECTED'}
      f.http.respond(agentReadback('AGENT-EXPECTED', overrides))
      await f.resource.configuration.refresh()
      expect(f.http.requests).toHaveLength(1)
      expect(f.resource.configuration.loadingError).toBeInstanceOf(Error)
      expect(f.resource.configuration.rows).toEqual([])
    } finally { f.dataSet.destroy() }
  })

  it.each([
    ['missing system prompt', {agentPrompt: ''}],
    ['non-string functionIds', {functionIds: ['tool-1']}],
    ['unknown input field', {unexpected: 'must not reach service'}],
    ['invalid enabled flag', {enabled: 2}],
    ['invalid max tool rounds', {maxToolRounds: 0}],
    ['invalid subtask flag', {enableSubtask: 2}],
    ['invalid approval flag', {requireApproval: 2}],
  ])('rejects %s locally before HTTP', async (_caseName, override) => {
    const f = await fixture()
    try {
      let rejected = false
      try {
        await stageCreate(f.resource.requests, {...validAgent(), ...override})
        await f.dataSet.saveChanges(f.selector(f.resource.requests))
      } catch { rejected = true }
      expect(rejected).toBe(true)
      expect(f.http.requests).toHaveLength(0)
      expect(f.resource.requests.hasUnconfirmedSave).toBe(false)
      expect(f.resource.requests.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally { f.dataSet.destroy() }
  })

  it('keeps a definite service refusal editable without marking the create unknown', async () => {
    const f = await fixture()
    try {
      await stageCreate(f.resource.requests)
      f.http.respond({Code: 1004, Message: 'Agent unavailable'})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow()
      expect(f.http.requests).toHaveLength(1)
      expect(f.resource.requests.hasUnconfirmedSave).toBe(false)
      expect(f.resource.requests.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally { f.dataSet.destroy() }
  })

  it.each([
    ['HTTP 500', 'http-500'],
    ['AjaxResult Code 500', 'ajax-500'],
    ['timeout', 'timeout'],
    ['malformed success acknowledgement', 'malformed-ack'],
  ])('retains unknown create capture after %s and never re-POSTs or guesses an Agent ID', async (_caseName, failure) => {
    const f = await fixture()
    try {
      const input = await stageCreate(f.resource.requests)
      if (failure === 'http-500') enqueueHttpError(f.http, 500, {Code: 500, Message: 'server failure'})
      else if (failure === 'ajax-500') f.http.respond({Code: 500, Message: 'server failure'})
      else if (failure === 'timeout') f.http.respondAsync(async () => { throw new Error('socket timeout') })
      else f.http.respond({id: 'AGENT-1'})

      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow()
      expect(f.resource.requests.hasUnconfirmedSave).toBe(true)
      const count = f.http.requests.length
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow()
      expect(f.http.requests).toHaveLength(count)
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(1)
      expect(f.http.requests.some(request => request.method === 'GET')).toBe(false)
      expect(f.http.requests.some(request => String(request.url).includes(String(input['operationId'])))).toBe(false)
      expect(f.resource.requests.rows[0]).not.toHaveProperty('agentId')
    } finally { f.dataSet.destroy() }
  })

  it('rejects a formal Agent readback whose id differs from queryContext.agentId', async () => {
    const f = await fixture()
    try {
      f.resource.configuration.queryContext = {agentId: 'AGENT-EXPECTED'}
      f.http.respond(agentReadback('AGENT-OTHER'))
      await f.resource.configuration.refresh()
      expect(f.http.requests).toHaveLength(1)
      expect(f.resource.configuration.loadingError).toBeInstanceOf(Error)
      expect(f.resource.configuration.rows).toEqual([])
    } finally { f.dataSet.destroy() }
  })

  it.each(['AiAgentConfigCreate', 'AiAgentConfig'])(
    'rejects existing resource table %s without partially adding the other resource table', async conflictName => {
      const {AiAgentConfigResource} = await import('./ai-agent-config-resource')
      const dataSet = DataSet.fromJson({scenarioId: 'AI-AGENT-CONFIG-COLLISION', tables: {}})
      const http = new AiAgentConfigHttp()
      dataSet.addTable(conflictName, [{name: 'existingId', type: 'string', isPrimaryKey: true}])
      try {
        expect(() => new AiAgentConfigResource({dataSet, http, guard: () => undefined})).toThrow()
        const otherName = conflictName === 'AiAgentConfigCreate' ? 'AiAgentConfig' : 'AiAgentConfigCreate'
        expect(dataSet.getTable(otherName)).toBeUndefined()
        expect(dataSet.getTable(conflictName)).toBeDefined()
        expect(http.requests).toHaveLength(0)
      } finally { dataSet.destroy() }
    })

  it('keeps a dispatched create unknown when its scope changes before the acknowledgement', async () => {
    const f = await fixture()
    let release: ((value: unknown) => void) | undefined
    f.http.respondAsync(() => new Promise(resolve => { release = resolve }))
    try {
      await stageCreate(f.resource.requests)
      const save = f.dataSet.saveChanges(f.selector(f.resource.requests))
      await vi.waitFor(() => expect(f.http.requests).toHaveLength(1))
      f.invalidate()
      const complete = release
      if (complete === undefined) throw new Error('Expected pending create response')
      complete('AGENT-1')
      await expect(save).rejects.toThrow()
      expect(f.resource.requests.hasUnconfirmedSave).toBe(true)
      expect(f.resource.requests.rows[0]).not.toHaveProperty('agentId')
      expect(f.http.requests).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('saves only the selected Agent configuration command and leaves unrelated DataSet changes pending', async () => {
    const f = await fixture()
    const business = f.dataSet.addTable('BusinessRows', [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'value', type: 'string'},
    ])
    business.resourceType = 'static-data'
    const businessView = f.dataSet.getView('BusinessRows', 'default')
    if (businessView === undefined) throw new Error('Business DataView fixture was not created')
    try {
      await businessView.refresh()
      await businessView.addRow({id: 'B-1', value: 'draft'})
      await stageCreate(f.resource.requests)
      f.http.respond('AGENT-1')
      await f.dataSet.saveChanges(f.selector(f.resource.requests))
      expect(f.http.requests).toHaveLength(1)
      expect(f.http.requests[0]).toMatchObject({method: 'POST', url: '/api/ai-agent/create'})
      expect(businessView.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(businessView.rows).toEqual([expect.objectContaining({id: 'B-1', value: 'draft'})])
    } finally { f.dataSet.destroy() }
  })
})
