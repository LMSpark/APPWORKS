import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {describe, expect, it} from 'vitest'
import {createFlowAppendUserClient} from '@/lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-client'

class FlowHttpStub extends HttpClientBase {
  readonly calls: RequestConfig[] = []
  postResult = true

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    if (config.url === '/api/Flow/GetExeUsers') {
      return {data: {Code: 200, Result: [{maxNum: 2, minNum: 1, allowChange: '0', userList: [{UserId: 'U1', UserName: '甲'}]}]}, status: 200, statusText: 'OK', headers: {}}
    }
    return {data: {Code: 200, Result: this.postResult}, status: 200, statusText: 'OK', headers: {}}
  }
}

describe('flow append user client', () => {
  const scope = {token: 't1', headers: {'X-AppId': 'APP-1', Authorization: 'Bearer t1'}}
  const context = {
    rowid: 'STEP',
    WFOBJID: 'WF',
    SendNodeModelId: 'N1',
    ReceiveNodeModelId: 'N2',
    LastStepID: 'L1',
    TITLE: '',
  }

  it('calls GetExeUsers with query params and parses config', async () => {
    const http = new FlowHttpStub()
    const client = createFlowAppendUserClient({
      http,
      scenarioId: 'E328',
      readScope: () => scope,
    })
    const configs = await client.getExecutionUsers(context)
    expect(configs).toHaveLength(1)
    expect(configs[0]).toMatchObject({userList: [{UserId: 'U1'}]})
    expect(http.calls[0]?.params).toMatchObject({wfId: 'WF', upNodeId: 'N1', nodeId: 'N2'})
  })

  it('posts FlowAddReceiveUser with body list', async () => {
    const http = new FlowHttpStub()
    const client = createFlowAppendUserClient({http, scenarioId: 'E328', readScope: () => scope})
    await client.addReceiveUsers(context, ['U1:甲'])
    const post = http.calls.find(call => call.url === '/api/Flow/FlowAddReceiveUser')
    expect(post?.params).toEqual({stepId: 'STEP', wfId: 'WF'})
    expect(post?.data).toEqual(['U1:甲'])
  })
  it('does not confirm an explicit negative operation result', async () => {
    const http = new FlowHttpStub(); http.postResult = false
    const client = createFlowAppendUserClient({http, scenarioId: 'E328', readScope: () => scope})
    await expect(client.addReceiveUsers(context, ['U1:甲'])).rejects.toThrow(/未确认/)
  })
})
