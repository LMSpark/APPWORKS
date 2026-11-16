import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {describe, expect, it} from 'vitest'
import {createFlowRunPageClient} from '@/lowcode/resources/system/workflow/manage'

class FlowHttpStub extends HttpClientBase {
  readonly calls: RequestConfig[] = []

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    return {data: {Code: 200, Result: true}, status: 200, statusText: 'OK', headers: {}}
  }
}

describe('FlowRunPageClient.forceBack', () => {
  it('posts FlowForceBack with flowObjId, curStepId and nodeId', async () => {
    const http = new FlowHttpStub()
    const client = createFlowRunPageClient({
      http,
      scenarioId: 'E328FBBF518141973C575D612CD75151',
      readScope: () => ({token: 't', headers: {'X-AppId': 'app'}}),
    })
    await client.forceBack({
      flowObjId: 'WF-1',
      curStepId: 'S1',
      nodeId: 'N-force',
      idea: '强制退回',
    })
    const call = http.calls.find(item => item.url === '/api/Flow/FlowForceBack')
    expect(call).toBeDefined()
    expect(call?.data).toMatchObject({
      flowObjId: 'WF-1',
      curStepId: 'S1',
      nodeId: 'N-force',
      Idea: '强制退回',
    })
  })
})

describe('FlowRunPageClient.canAutoSubmitAfter', () => {
  it('posts CanAutoSubmitAfter with curStepId', async () => {
    const http = new FlowHttpStub()
    const client = createFlowRunPageClient({
      http,
      scenarioId: 'E328FBBF518141973C575D612CD75151',
      readScope: () => ({token: 't', headers: {'X-AppId': 'app'}}),
    })
    await client.canAutoSubmitAfter('STEP-1')
    const call = http.calls.find(item => item.url === '/api/Flow/CanAutoSubmitAfter')
    expect(call?.method).toBe('POST')
    expect(call?.data).toEqual({curStepId: 'STEP-1'})
  })
})

describe('FlowRunPageClient.revokeCurrentStep', () => {
  it('posts FlowRevoke with wfid and curStepID', async () => {
    const http = new FlowHttpStub()
    const client = createFlowRunPageClient({
      http,
      scenarioId: 'E328FBBF518141973C575D612CD75151',
      readScope: () => ({token: 't', headers: {'X-AppId': 'app'}}),
    })
    await client.revokeCurrentStep('WF-1', 'S1')
    const call = http.calls.find(item => item.url === '/api/Flow/FlowRevoke')
    expect(call?.method).toBe('POST')
    expect(call?.params).toMatchObject({wfid: 'WF-1', curStepID: 'S1'})
  })
})

describe('FlowRunPageClient.fetchStepHistory', () => {
  it('GET GetStepHistory with wfId query param', async () => {
    const http = new FlowHttpStub()
    const client = createFlowRunPageClient({
      http,
      scenarioId: 'E328FBBF518141973C575D612CD75151',
      readScope: () => ({token: 't', headers: {'X-AppId': 'app'}}),
    })
    await client.fetchStepHistory('WF-42')
    const call = http.calls.find(item => item.url === '/api/Flow/GetStepHistory')
    expect(call?.method).toBe('GET')
    expect(call?.params).toMatchObject({wfId: 'WF-42'})
  })
})

describe('FlowRunPageClient.backByHistory', () => {
  it('posts an ordinary return without promising a client-selected target', async () => {
    const http = new FlowHttpStub()
    const client = createFlowRunPageClient({
      http,
      scenarioId: 'E328FBBF518141973C575D612CD75151',
      readScope: () => ({token: 't', headers: {'X-AppId': 'app'}}),
    })
    await client.backByHistory({
      flowObjId: 'WF-1',
      curStepId: 'S1',
      nodeId: 'N-prev',
      idea: '请修改',
    })
    const call = http.calls.find(item => item.url === '/api/Flow/FlowBack')
    expect(call).toBeDefined()
    expect(call?.method).toBe('POST')
    expect(call?.data).toMatchObject({
      flowObjId: 'WF-1',
      curStepId: 'S1',
      Idea: '请修改',
    })
    expect(call?.data).not.toHaveProperty('nodeId')
  })
})
