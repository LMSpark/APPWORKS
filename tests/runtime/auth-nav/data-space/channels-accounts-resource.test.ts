import {describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {bindWechatChannelsAccounts} from '@/platform-adapters/resources/integration/mp-open/channels-accounts-resource'

describe('dedicated channels account DataView',()=>{
  class ChannelTransport extends HttpClientBase {
    readonly requests: RequestConfig[] = []
    body: unknown = undefined
    pending: Promise<unknown> | undefined

    protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
      this.requests.push(config)
      const data = this.pending ? await this.pending : this.body
      return {data,status:200,statusText:'OK',headers:{}}
    }
  }
  function fixture() {
    const http=new ChannelTransport()
    const dataSet=DataSet.fromJson({scenarioId:'CHANNEL-FIXTURE',tables:{}})
    let valid=true
    bindWechatChannelsAccounts({dataSet,http,readScope:()=>({token:'fixture',headers:{'X-AppId':'APP'}}),assertCurrent(){
      if (!valid) throw Error('原视频号实例已失效')
    }})
    return {http,dataSet,view:dataSet.getView('WechatChannelsAccounts')!,invalidate(){valid=false}}
  }

  it('uses the dedicated route and only retains its allowed projection',async()=>{
    const {http,dataSet,view}=fixture()
    try {
      http.body={Code:200,Result:[{authorizerAppId:'channel-1',accountType:'CHANNELS',nickName:'视频号',enabled:false,
        principalName:'extra field'}]}
      expect((await view.requestRefresh()).refreshStatus).toBe('read')
      expect(http.requests.map(request=>({url:request.url,method:request.method,scenario:request.headers?.['X-FormKey']})))
        .toEqual([{url:'/api/wechat-open/channels/accounts',method:'GET',scenario:'CHANNEL-FIXTURE'}])
      const row=view.rows[0]!
      const projected = Object.fromEntries(Object.entries(row).filter(([name])=>name!=='_pk'))
      expect(projected).toEqual({authorizerAppId:'channel-1',nickName:'视频号',enabled:false})
      view.captureReadRow(row,['authorizerAppId','nickName','enabled'])()
      expect(view.fieldAccess(row,'enabled').write).toBe('denied')
      expect(view.fieldAccess(row,'principalName').read).toBe('invisible')
    } finally {dataSet.destroy()}
  })

  it('preserves a business denial and accepts a later genuine empty account list',async()=>{
    const {http,dataSet,view}=fixture()
    try {
      http.body={Code:403,Message:'无专用账号列表权限',Result:[]}
      expect((await view.requestRefresh()).refreshStatus).toBe('failed')
      expect(view.loadingError?.message).toBe('无专用账号列表权限')
      expect(()=>view.captureReadResult()).toThrow()
      expect(http.requests).toHaveLength(1)
      http.body={Code:200,Result:[]}
      expect((await view.requestRefresh()).refreshStatus).toBe('read')
      expect(view.total).toBe(0)
      view.captureReadResult()()
      expect(http.requests).toHaveLength(2)
    } finally {dataSet.destroy()}
  })

  it('rejects the same identity twice and a different account type',async()=>{
    const {http,dataSet,view}=fixture()
    try {
      const account={authorizerAppId:'channel-1',accountType:'CHANNELS'}
      http.body={Code:200,Result:[account,{...account}]}
      expect((await view.requestRefresh()).refreshStatus).toBe('failed')
      expect(view.loadingError?.message).toBe('视频号专用账号结果身份不一致')
      http.body={Code:200,Result:[{...account,accountType:'MINIAPP'}]}
      expect((await view.requestRefresh()).refreshStatus).toBe('failed')
      expect(view.rows).toEqual([])
    } finally {dataSet.destroy()}
  })

  it('rejects an otherwise valid list arriving after the owning scope changed',async()=>{
    const {http,dataSet,view,invalidate}=fixture()
    let settle!: (value:unknown)=>void
    http.pending=new Promise(resolve=>{settle=resolve})
    try {
      const read=view.requestRefresh()
      await vi.waitFor(()=>expect(http.requests).toHaveLength(1))
      invalidate()
      settle({Code:200,Result:[{authorizerAppId:'old-account',accountType:'CHANNELS'}]})
      expect((await read).refreshStatus).toBe('failed')
      expect(view.rows).toEqual([])
      expect(view.loadingError?.message).toBe('原视频号实例已失效')
    } finally {dataSet.destroy()}
  })
})
