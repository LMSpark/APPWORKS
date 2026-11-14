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

describe('FlowRunPageClient.backByHistory', () => {
  it('posts FlowBack with flowObjId, curStepId and nodeId', async () => {
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
      nodeId: 'N-prev',
      Idea: '请修改',
    })
  })
})