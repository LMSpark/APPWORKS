import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {describe, expect, it, vi} from 'vitest'

type AiTurnResource = import('./ai-turn-resource').AiTurnResource

type Row = Record<string, unknown>

class AiTurnHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly responses: unknown[] = []
  constructor() { super({retry: 2, retryDelay: 0}) }
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const response = this.responses.shift()
    if (response === undefined) throw new Error(`Unexpected request ${config.method} ${config.url}`)
    const result = typeof response === 'function' ? await (response as () => Promise<unknown>)() : response
    const envelope = typeof result === 'object' && result !== null && 'Code' in result
      ? result : {Code: 200, Result: result}
    return {data: envelope, status: 200, statusText: 'OK', headers: {}}
  }
}

function enqueueRequestError(http: AiTurnHttp, status: number, body: unknown): void {
  http.responses.push(async () => {
    const config = http.requests.at(-1)!
    throw Object.assign(new Error(`HTTP ${status}`), {name: 'RequestError', config, status, response: body})
  })
}

async function fixture() {
  const {AiTurnResource} = await import('./ai-turn-resource')
  const dataSet = DataSet.fromJson({scenarioId: 'AI-TURN', tables: {}})
  const http = new AiTurnHttp()
  let valid = true
  const guard = vi.fn(() => { if (!valid) throw new Error('AI turn scope expired') })
  const resource = new AiTurnResource({dataSet, http, guard})
  const invalidate = () => { valid = false }
  const selector = (view: {tableName: string; viewId: string}) => ({views: [{tableName: view.tableName, viewId: view.viewId}]})
  return {dataSet, http, guard, resource, invalidate, selector}
}

async function stageRequest(resource: AiTurnResource, values: Row = {agentId: 'agent-metadata-admin', message: '生成字典候选'}) {
  await resource.requests.refresh()
  return resource.requests.addRow(values)
}

describe('AiTurnResource native DataSet contract', () => {
  it('loads only the allowlisted Agent catalog fields and denies edits', async () => {
    const f = await fixture()
    f.http.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选', agentPrompt: 'secret', tools: ['secret']}])
    try {
      await f.resource.agents.refresh()
      expect(f.http.requests[0]).toMatchObject({method: 'GET', url: '/api/ai/v1/agents'})
      expect(f.resource.agents.rows).toMatchObject([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      expect(f.resource.agents.rows[0]).not.toHaveProperty('agentPrompt')
      expect(f.resource.agents.fieldAccess(f.resource.agents.rows[0]!, 'agentName').write).toBe('denied')
    } finally { f.dataSet.destroy() }
  })

  it.each([null, {}, [{id: '', agentName: 'bad', description: 'bad'}]])('rejects malformed Agent catalog %j', async result => {
    const f = await fixture()
    f.http.responses.push(result)
    try {
      await f.resource.agents.refresh()
      expect(f.resource.agents.loadingError).toBeInstanceOf(Error)
      expect(f.resource.agents.rows).toEqual([])
    } finally { f.dataSet.destroy() }
  })

  it('does not query turn status without queryContext.turnId and encodes a known id', async () => {
    const f = await fixture()
    try {
      await f.resource.turns.refresh()
      expect(f.http.requests).toHaveLength(0)
      f.resource.turns.queryContext = {turnId: 'turn/a b'}
      f.http.responses.push({id: 'turn/a b', conversationId: 'C1', agentId: 'A1', status: 'RUNNING', assistantDraft: null,
        errorCode: null, errorMessage: null})
      await f.resource.turns.refresh()
      expect(f.http.requests[0]).toMatchObject({method: 'GET', url: '/api/ai/v1/turns/turn%2Fa%20b'})
      expect(f.resource.turns.rows[0]).toMatchObject({id: 'turn/a b', status: 'RUNNING', assistantDraft: null})
    } finally { f.dataSet.destroy() }
  })

  it('rejects status identity mismatch and unknown status rather than accepting a result', async () => {
    const f = await fixture()
    f.resource.turns.queryContext = {turnId: 'T1'}
    try {
      f.http.responses.push({id: 'T2', conversationId: 'C1', agentId: 'A1', status: 'RUNNING', assistantDraft: null,
        errorCode: null, errorMessage: null})
      await f.resource.turns.refresh()
      expect(f.resource.turns.loadingError).toBeInstanceOf(Error)
      f.http.responses.push({id: 'T1', conversationId: 'C1', agentId: 'A1', status: 'NOT_A_STATUS', assistantDraft: null,
        errorCode: null, errorMessage: null})
      await f.resource.turns.refresh()
      expect(f.resource.turns.loadingError).toBeInstanceOf(Error)
    } finally { f.dataSet.destroy() }
  })

  it('stages a request without HTTP and submits only the selected command view once', async () => {
    const f = await fixture()
    try {
      const input = await stageRequest(f.resource)
      expect(f.http.requests).toHaveLength(0)
      expect(input).toMatchObject({idempotencyKey: expect.any(String), agentId: 'agent-metadata-admin'})
      f.http.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: '2026-10-24T01:00:00Z'})
      const result = await f.dataSet.saveChanges(f.selector(f.resource.requests))
      expect(result.success).toBe(true)
      expect(f.http.requests).toHaveLength(1)
      expect(f.http.requests[0]).toMatchObject({method: 'POST', url: '/api/ai/v1/turns', data: expect.objectContaining({agentId: 'agent-metadata-admin', message: '生成字典候选'})})
      expect(f.resource.requests.rows[0]).toMatchObject({conversationId: 'C1', turnId: 'T1', status: 'QUEUED'})
      expect(f.resource.requests.fieldAccess(f.resource.requests.rows[0]!, 'message').write).toBe('denied')
      expect(f.resource.requests.rows[0]?.['status']).not.toBe('COMPLETED')
    } finally { f.dataSet.destroy() }
  })

  it('keeps unrelated DataView edits outside request command save', async () => {
    const f = await fixture()
    f.dataSet.addTable('OtherWork', [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'value', type: 'string'}])
    try {
      await stageRequest(f.resource)
      const otherView = f.dataSet.getView('OtherWork', 'default')!
      await otherView.addRow({id: 'O1', value: 'draft'})
      f.http.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await f.dataSet.saveChanges(f.selector(f.resource.requests))
      expect(f.http.requests).toHaveLength(1)
      expect(otherView.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally { f.dataSet.destroy() }
  })

  it('allows an empty staged row for editing, then rejects it locally before HTTP', async () => {
    const f = await fixture()
    try {
      await f.resource.requests.refresh()
      await f.resource.requests.addRow({agentId: '', message: ''})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow()
      expect(f.http.requests).toHaveLength(0)
      expect(f.resource.requests.hasUnconfirmedSave).toBe(false)
      expect(f.resource.requests.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally { f.dataSet.destroy() }
  })

  it('keeps a definite business rejection editable without marking it unknown', async () => {
    const f = await fixture()
    try {
      await stageRequest(f.resource)
      f.http.responses.push({Code: 1004, Message: 'Agent unavailable'})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow()
      expect(f.resource.requests.hasUnconfirmedSave).toBe(false)
      expect(f.resource.requests.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(f.http.requests).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it.each([1004, 500])('treats HTTP 503 with AjaxResult Code %i as unknown and never retries the POST', async code => {
    const f = await fixture()
    try {
      await stageRequest(f.resource)
      enqueueRequestError(f.http, 503, {Code: code, Message: 'server failed after dispatch'})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow()
      expect(f.resource.requests.hasUnconfirmedSave).toBe(true)
      expect(f.http.requests).toHaveLength(1)
      expect(f.http.requests[0]).toMatchObject({retry: 0})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow(/turnId|核验|待核验/)
      expect(f.http.requests).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('treats AjaxResult Code 500 as unknown while retaining Code 1004 as a definite business refusal', async () => {
    const f = await fixture()
    try {
      await stageRequest(f.resource)
      f.http.responses.push({Code: 500, Message: 'server failure'})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow()
      expect(f.resource.requests.hasUnconfirmedSave).toBe(true)
      expect(f.http.requests).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it('preserves unknown create capture and never POSTs or GETs without a trusted turnId', async () => {
    const f = await fixture()
    try {
      await stageRequest(f.resource)
      f.http.responses.push(async () => { throw new Error('socket reset') })
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow()
      expect(f.resource.requests.hasUnconfirmedSave).toBe(true)
      const count = f.http.requests.length
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow(/turnId|核验|待核验/)
      expect(f.http.requests).toHaveLength(count)
      await expect(f.resource.requests.refresh()).rejects.toThrow()
      f.resource.requests.discardPendingChanges()
      expect(f.resource.requests.hasUnconfirmedSave).toBe(true)
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow(/turnId|核验|待核验/)
      expect(f.http.requests).toHaveLength(count)
    } finally { f.dataSet.destroy() }
  })

  it('rejects a caller supplied turnId before HTTP and does not use it as verification identity', async () => {
    const f = await fixture()
    try {
      await stageRequest(f.resource, {idempotencyKey: 'K1', agentId: 'A1', message: 'hello', turnId: 'forged'})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow(/turnId/)
      expect(f.http.requests).toHaveLength(0)
      expect(f.resource.requests.hasUnconfirmedSave).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it('keeps a legal create unknown when ACK is lost and does not use an input ID to verify', async () => {
    const f = await fixture()
    try {
      await stageRequest(f.resource)
      f.http.responses.push(async () => { throw new Error('timeout') })
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow()
      const count = f.http.requests.length
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow(/turnId|核验|待核验/)
      expect(f.http.requests).toHaveLength(count)
      expect(f.http.requests.some(request => String(request.url).includes('/turns/'))).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it('marks a malformed success ACK unknown and preserves its original capture without replay', async () => {
    const f = await fixture()
    try {
      await stageRequest(f.resource)
      f.http.responses.push({conversationId: 'C1', turnId: '', status: 'QUEUED', acceptedAt: null})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow(/待核验/)
      expect(f.resource.requests.hasUnconfirmedSave).toBe(true)
      const count = f.http.requests.length
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).rejects.toThrow(/turnId|核验|待核验/)
      expect(f.http.requests).toHaveLength(count)
    } finally { f.dataSet.destroy() }
  })

  it('uses a known turn id to verify unknown cancellation without replaying cancel', async () => {
    const f = await fixture()
    try {
      await f.resource.cancellations.refresh()
      await f.resource.cancellations.addRow({turnId: 'T1'})
      f.http.responses.push(async () => { throw new Error('timeout') })
      await expect(f.dataSet.saveChanges(f.selector(f.resource.cancellations))).rejects.toThrow()
      expect(f.resource.cancellations.hasUnconfirmedSave).toBe(true)

      f.http.responses.push({id: 'T1', conversationId: 'C1', agentId: 'A1', status: 'RUNNING', assistantDraft: null,
        errorCode: null, errorMessage: null})
      const requestCount = f.http.requests.length
      await expect(f.dataSet.saveChanges(f.selector(f.resource.cancellations))).rejects.toThrow()
      expect(f.http.requests).toHaveLength(requestCount + 1)
      expect(f.http.requests.at(-1)).toMatchObject({method: 'GET', url: '/api/ai/v1/turns/T1'})
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
      expect(f.resource.cancellations.hasUnconfirmedSave).toBe(true)
    } finally { f.dataSet.destroy() }
  })

  it.each([200, 500])('treats cancellation HTTP 503 Code %i as unknown and verifies by GET without replaying POST', async code => {
    const f = await fixture()
    try {
      await f.resource.cancellations.refresh()
      await f.resource.cancellations.addRow({turnId: 'T1'})
      enqueueRequestError(f.http, 503, {Code: code, Result: true})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.cancellations))).rejects.toThrow()
      expect(f.resource.cancellations.hasUnconfirmedSave).toBe(true)
      f.http.responses.push({id: 'T1', conversationId: 'C1', agentId: 'A1', status: 'RUNNING', assistantDraft: null,
        errorCode: null, errorMessage: null})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.cancellations))).rejects.toThrow()
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
      expect(f.http.requests[0]).toMatchObject({retry: 0})
      expect(f.http.requests.at(-1)).toMatchObject({method: 'GET', url: '/api/ai/v1/turns/T1'})
    } finally { f.dataSet.destroy() }
  })

  it('rejects an empty cancellation turnId before HTTP without creating an unknown result', async () => {
    const f = await fixture()
    try {
      await f.resource.cancellations.refresh()
      await f.resource.cancellations.addRow({turnId: ''})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.cancellations))).rejects.toThrow(/turnId/)
      expect(f.http.requests).toHaveLength(0)
      expect(f.resource.cancellations.hasUnconfirmedSave).toBe(false)
      expect(f.resource.cancellations.dirtyTracking.hasPendingChanges()).toBe(true)
    } finally { f.dataSet.destroy() }
  })

  it('keeps an invalidated cancellation scope as a local preflight failure', async () => {
    const f = await fixture()
    try {
      await f.resource.cancellations.refresh()
      await f.resource.cancellations.addRow({turnId: 'T1'})
      f.invalidate()
      await expect(f.dataSet.saveChanges(f.selector(f.resource.cancellations))).rejects.toThrow('scope expired')
      expect(f.http.requests).toHaveLength(0)
      expect(f.resource.cancellations.hasUnconfirmedSave).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it.each([true, false])('records direct cancel ACK %s without claiming an observed terminal status', async requested => {
    const f = await fixture()
    try {
      await f.resource.cancellations.refresh()
      await f.resource.cancellations.addRow({turnId: 'T1'})
      f.http.responses.push(requested)
      await f.dataSet.saveChanges(f.selector(f.resource.cancellations))
      expect(f.resource.cancellations.rows[0]).toMatchObject({requested, observedStatus: null})
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
    } finally { f.dataSet.destroy() }
  })

  it.each([
    {status: 'CANCELLING', requested: true},
    {status: 'CANCELLED', requested: true},
    {status: 'COMPLETED', requested: null},
  ] as const)('records unknown cancel readback $status without inventing request acceptance', async ({status, requested}) => {
    const f = await fixture()
    try {
      await f.resource.cancellations.refresh()
      await f.resource.cancellations.addRow({turnId: 'T1'})
      f.http.responses.push(async () => { throw new Error('timeout') })
      await expect(f.dataSet.saveChanges(f.selector(f.resource.cancellations))).rejects.toThrow()
      f.http.responses.push({id: 'T1', conversationId: 'C1', agentId: 'A1', status, assistantDraft: null,
        errorCode: null, errorMessage: null})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.cancellations))).resolves.toMatchObject({success: true})
      expect(f.http.requests.filter(request => String(request.url).endsWith('/cancel'))).toHaveLength(1)
      expect(f.resource.cancellations.rows[0]).toMatchObject({requested, observedStatus: status})
    } finally { f.dataSet.destroy() }
  })

  it('checks scope before dispatch and after slow responses before accepting them', async () => {
    const f = await fixture()
    try {
      f.invalidate()
      await f.resource.agents.refresh()
      expect(f.resource.agents.loadingError?.message).toContain('scope expired')
      expect(f.http.requests).toHaveLength(0)
    } finally { f.dataSet.destroy() }

    const slow = await fixture()
    let release!: (value: unknown) => void
    slow.http.responses.push(() => new Promise(resolve => { release = resolve }))
    const refresh = slow.resource.agents.refresh()
    await vi.waitFor(() => expect(slow.http.requests).toHaveLength(1))
    slow.invalidate()
    release([{id: 'A1', agentName: 'A', description: 'D'}])
    await refresh
    expect(slow.resource.agents.loadingError).toBeInstanceOf(Error)
    expect(slow.resource.agents.rows).toEqual([])
    slow.dataSet.destroy()
  })

  it('does not accept a slow create ACK after its DataSet scope expires', async () => {
    const f = await fixture()
    let release!: (value: unknown) => void
    f.http.responses.push(() => new Promise(resolve => { release = resolve }))
    try {
      await stageRequest(f.resource)
      const save = f.dataSet.saveChanges(f.selector(f.resource.requests))
      await vi.waitFor(() => expect(f.http.requests).toHaveLength(1))
      f.invalidate()
      release({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      await expect(save).rejects.toThrow(/待核验|作用域失效/)
      expect(f.resource.requests.hasUnconfirmedSave).toBe(true)
      expect(f.resource.requests.rows).toHaveLength(1)
      expect(f.resource.requests.rows[0]).not.toHaveProperty('turnId')
    } finally { f.dataSet.destroy() }
  })

  it('rejects refresh after DataSet destruction before dispatching HTTP', async () => {
    const f = await fixture()
    f.dataSet.destroy()
    await expect(f.resource.agents.refresh()).rejects.toThrow(/destroyed/)
    expect(f.http.requests).toHaveLength(0)
  })

  it('only accepts the latest turn query result after an in-flight target switch', async () => {
    const f = await fixture()
    let releaseFirst!: (value: unknown) => void
    f.http.responses.push(() => new Promise(resolve => { releaseFirst = resolve }))
    try {
      f.resource.turns.queryContext = {turnId: 'T1'}
      const first = f.resource.turns.refresh()
      await vi.waitFor(() => expect(f.http.requests).toHaveLength(1))
      f.resource.turns.queryContext = {turnId: 'T2'}
      f.http.responses.push({id: 'T2', conversationId: 'C2', agentId: 'A2', status: 'RUNNING', assistantDraft: null,
        errorCode: null, errorMessage: null})
      const second = f.resource.turns.refresh()
      await vi.waitFor(() => expect(f.http.requests).toHaveLength(2))
      releaseFirst({id: 'T1', conversationId: 'C1', agentId: 'A1', status: 'RUNNING', assistantDraft: null,
        errorCode: null, errorMessage: null})
      await Promise.allSettled([first, second])
      expect(f.resource.turns.rows).toMatchObject([{id: 'T2', conversationId: 'C2'}])
    } finally { f.dataSet.destroy() }
  })

  it('preserves the first request identity across concurrent save calls without duplicate POST', async () => {
    const f = await fixture()
    let release!: (value: unknown) => void
    f.http.responses.push(() => new Promise(resolve => { release = resolve }))
    try {
      await stageRequest(f.resource)
      const save1 = f.dataSet.saveChanges(f.selector(f.resource.requests))
      await vi.waitFor(() => expect(f.http.requests).toHaveLength(1))
      const save2 = f.dataSet.saveChanges(f.selector(f.resource.requests))
      const settled = Promise.allSettled([save1, save2])
      await Promise.resolve()
      release({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      const outcomes = await settled
      expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1)
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(1)
      expect(f.resource.requests.rows.filter(row => row['turnId'] === 'T1')).toHaveLength(1)
      expect(f.resource.requests.hasUnconfirmedSave).toBe(false)
      await f.resource.requests.refresh()
      await stageRequest(f.resource, {agentId: 'agent-metadata-admin', message: '第二次请求'})
      f.http.responses.push({conversationId: 'C2', turnId: 'T2', status: 'QUEUED', acceptedAt: null})
      await expect(f.dataSet.saveChanges(f.selector(f.resource.requests))).resolves.toMatchObject({success: true})
      expect(f.http.requests.filter(request => request.method === 'POST')).toHaveLength(2)
      expect(f.resource.requests.hasUnconfirmedSave).toBe(false)
    } finally { f.dataSet.destroy() }
  })

  it('refuses conflicting pre-existing command tables without replacing their DataViews', async () => {
    const dataSet = DataSet.fromJson({scenarioId: 'AI-TURN', tables: {
      AiTurnCancel: {columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}}},
    }})
    const existing = dataSet.getView('AiTurnCancel', 'default')
    try {
      const {AiTurnResource} = await import('./ai-turn-resource')
      expect(() => new AiTurnResource({dataSet, http: new AiTurnHttp(), guard: () => undefined})).toThrow()
      expect(dataSet.getView('AiTurnCancel', 'default')).toBe(existing)
      expect(dataSet.getTable('AiTurnAgents')).toBeUndefined()
      expect(dataSet.getTable('AiTurnRequest')).toBeUndefined()
      expect(dataSet.getTable('AiTurnStatus')).toBeUndefined()
    } finally { dataSet.destroy() }
  })
})
