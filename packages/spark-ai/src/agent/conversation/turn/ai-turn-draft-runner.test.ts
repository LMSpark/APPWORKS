import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {AiTurnDraftRunner} from './ai-turn-draft-runner.js'
import {AiTurnResource} from './ai-turn-resource.js'

class Http extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly responses: unknown[] = []
  beforeResponse?: (config: RequestConfig) => Promise<void>
  constructor() { super({retry: 0, retryDelay: 0}) }
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (this.beforeResponse) await this.beforeResponse(config)
    const response = this.responses.shift()
    if (response === undefined) throw new Error(`Unexpected request ${config.method} ${config.url}`)
    return {data: {Code: 200, Result: response}, status: 200, statusText: 'OK', headers: {}}
  }
}
const sets: DataSet[] = []
afterEach(() => sets.splice(0).forEach(set => set.destroy()))
function gate() {
  let release: () => void = () => { throw Error('Delay was not initialized') }
  const waiting = new Promise<void>(resolve => {release = resolve})
  return {waiting, release}
}

function fixture() {
  const dataSet = DataSet.fromJson({scenarioId: 'AI-DRAFT', tables: {}}); sets.push(dataSet)
  const http = new Http(), turnResource = new AiTurnResource({dataSet, http, guard: () => undefined})
  const runner = new AiTurnDraftRunner({dataSet, turnResource, agentId: 'A1', pollIntervalMs: 1})
  const turn = (status: string, draft: string | null = null) => ({id: 'T1', conversationId: 'C1', agentId: 'A1', status, assistantDraft: draft, errorCode: null, errorMessage: status === 'FAILED' ? '模型失败' : null})
  const accepted = () => { http.responses.push([{id: 'A1', agentName: 'a', description: null}], {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null}) }
  return {dataSet, http, runner, turnResource, turn, accepted}
}

describe('AiTurnDraftRunner', () => {
  it('creates one turn through DataSet.saveChanges and polls the turns view until completion', async () => {
    const f = fixture(); f.accepted(); f.http.responses.push(f.turn('RUNNING'), f.turn('COMPLETED', '{"rows":[]}'))
    await expect(f.runner.run('生成')).resolves.toBe('{"rows":[]}')
    expect(f.http.requests.map(request => `${request.method} ${request.url}`)).toEqual(['GET /api/ai/v1/agents', 'POST /api/ai/v1/turns', 'GET /api/ai/v1/turns/T1', 'GET /api/ai/v1/turns/T1'])
    expect(f.http.requests[1]!.data).toMatchObject({agentId: 'A1', message: '生成'})
    expect(f.runner.busy).toBe(false)
  })
  it('rejects an unconfigured agent before creating any turn', async () => {
    const f = fixture(); f.http.responses.push([{id: 'OTHER', agentName: null, description: null}])
    await expect(f.runner.run('生成')).rejects.toThrow('Agent目录'); expect(f.http.requests).toHaveLength(1)
  })
  it('surfaces failed turns and empty drafts without returning content', async () => {
    const f = fixture(); f.accepted(); f.http.responses.push(f.turn('FAILED'))
    await expect(f.runner.run('生成')).rejects.toThrow('模型失败')
    f.accepted(); f.http.responses.push({...f.turn('COMPLETED', ' '), id: 'T1'})
    await expect(f.runner.run('生成')).rejects.toThrow('没有返回内容')
  })
  it('sends a formal cancellation for the known turn when aborted', async () => {
    const f = fixture(), controller = new AbortController(); f.accepted()
    f.http.responses.push(f.turn('RUNNING'), true)
    const run = f.runner.run('生成', controller.signal)
    await new Promise(resolve => setTimeout(resolve, 0)); controller.abort()
    await expect(run).rejects.toThrow('AI生成已取消')
    expect(f.http.requests.at(-1)).toMatchObject({method: 'POST', url: '/api/ai/v1/turns/T1/cancel'})
  })
  it.each(['query', 'local draft'] as const)('does not dispatch a creation cancelled while waiting for the %s', async boundary => {
    const f = fixture(), controller = new AbortController(), entered = gate(), resume = gate()
    f.accepted()
    f.http.responses.push(true)
    const view = f.turnResource.requests
    if (boundary === 'query') {
      const refresh = view.refresh.bind(view)
      vi.spyOn(view, 'refresh').mockImplementationOnce(async () => {
        entered.release()
        await resume.waiting
        await refresh()
      })
    } else {
      const addRow = view.addRow.bind(view)
      vi.spyOn(view, 'addRow').mockImplementationOnce(async input => {
        const staged = await addRow(input)
        entered.release()
        await resume.waiting
        return staged
      })
    }

    const run = f.runner.run('生成', controller.signal)
    await entered.waiting
    controller.abort()
    resume.release()
    await expect(run).rejects.toThrow('AI生成已取消')

    expect(f.http.requests.map(request => `${request.method} ${request.url}`)).toEqual(['GET /api/ai/v1/agents'])
    expect(view.rows).toHaveLength(0)
    expect(view.dirtyTracking.pendingCreateIds.size).toBe(0)
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(f.runner.busy).toBe(false)
  })
  it.each(['known', 'unknown'] as const)('preserves %s creation semantics if cancelled after dispatch', async receipt => {
    const f = fixture(), controller = new AbortController(), entered = gate(), resume = gate()
    const createPath = '/api/ai/v1/turns'
    f.http.beforeResponse = async config => {
      if (config.method !== 'POST' || config.url !== createPath) return
      entered.release()
      await resume.waiting
    }
    if (receipt === 'known') { f.accepted(); f.http.responses.push(true) }
    else f.http.responses.push([{id: 'A1', agentName: 'a', description: null}], {status: 'QUEUED'})

    const run = f.runner.run('生成', controller.signal)
    await entered.waiting
    controller.abort()
    resume.release()

    const expectedRequests = ['GET /api/ai/v1/agents', `POST ${createPath}`]
    if (receipt === 'known') {
      await expect(run).rejects.toThrow('AI生成已取消')
      expectedRequests.push('POST /api/ai/v1/turns/T1/cancel')
    } else {
      await expect(run).rejects.toThrow(/待核验/)
      await expect(f.runner.run('不重放')).rejects.toThrow(/待核验/)
    }
    expect(f.http.requests.map(request => `${request.method} ${request.url}`)).toEqual(expectedRequests)
    expect(f.runner.hasUnconfirmedSave).toBe(receipt === 'unknown')
    expect(f.runner.busy).toBe(false)
  })
  it('rejects concurrent runs and empty messages', async () => {
    const f = fixture(); await expect(f.runner.run(' ')).rejects.toThrow('不能为空')
    f.accepted(); f.http.responses.push(f.turn('COMPLETED', 'x'))
    const first = f.runner.run('a'); await expect(f.runner.run('b')).rejects.toThrow('正在进行'); await first
  })
})
