import {describe, expect, it} from 'vitest'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {CodeSequenceRange} from '../code-sequence-range.js'
import {CodeInitializationClient} from '../initialization-client.js'

class Service extends HttpClientBase {
  body: unknown = {Code:200,Result:[{'1':'A',min:'001',max:'999',InitVal:'003',rowid:null}]}
  requests: RequestConfig[]=[]
  beforeReturn?:()=>void
  protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>> {
    this.requests.push(request);this.beforeReturn?.()
    return {data:this.body,status:200,statusText:'OK',headers:{}}
  }
}
describe('code initialization service and sequence value contract',()=>{
  it.each([
    ['001-999',2,'005','003'],['001-999',2,'001',null],
    ['1-999',3,'12','9'],['00-FF',2,'10','0E'],['00-FF',2,'00',null],
    ['A-Z',2,'D','B'],['A-Z',1,'A',null],['a-z',1,'z','y'],
    ['AA-ZZ',2,'BB','AZ'],['aa-zz',1,'ba','az'],
    ['001-999',-2,'005','007'],['A-z',1,'[','Z'],['Ba-Yz',1,'Ca','Bz'],['0-FF',1,'10','0F'],
  ])('maps desired %s next value with increment %s without always subtracting one',(format,increment,next,previous)=>{
    expect(new CodeSequenceRange(String(format),Number(increment)).previous(String(next))).toBe(previous)
  })
  it.each([['001-999',0,'003'],['001-999',1,'1000'],['001-999',1,'3'],['A-Z',1,'a'],['ZZ-AA',1,'BB']])(
    'rejects an invalid range, increment or desired next value', (format,increment,value)=>{
      expect(()=>new CodeSequenceRange(String(format),Number(increment)).previous(String(value))).toThrow()
    })
  it('uses the confirmed GET contract and keeps combination columns without manufacturing permissions',async()=>{
    const http=new Service(),scope={token:'scope',headers:{'X-AppId':'A','X-FormKey':'OTHER'}}
    const client=new CodeInitializationClient(http,{scenarioId:'S',readScope:()=>scope})
    const result=await client.read({codeId:'C',nodeId:'N',date:''})
    expect(result).toEqual([{'1':'A',min:'001',max:'999',InitVal:'003',rowid:null}])
    expect(http.requests[0]).toMatchObject({method:'GET',url:'/api/Codeing/CodeInitDataList',params:{codeid:'C',nodeid:'N',date:''},headers:{'X-AppId':'A','X-FormKey':'S'}})
    expect(result[0]).not.toHaveProperty('lingma_sys_params')
  })
  it('rejects a response from an execution scope that changed while awaiting the service',async()=>{
    const http=new Service();let token='old'
    http.beforeReturn=()=>{token='new'}
    const client=new CodeInitializationClient(http,{scenarioId:'S',readScope:()=>({token,headers:{'X-AppId':'A'}})})
    await expect(client.read({codeId:'C',nodeId:'N',date:''})).rejects.toThrow('STALE')
  })
  it('rejects malformed rows and formal service rejections without treating them as an empty result',async()=>{
    const http=new Service(),client=new CodeInitializationClient(http,{scenarioId:'S',readScope:()=>({token:'scope',headers:{'X-AppId':'A'}})})
    http.body={Code:200,Result:[null]};await expect(client.read({codeId:'C',nodeId:'N',date:''})).rejects.toThrow()
    http.body={Code:1003,Message:'配置不可用'};await expect(client.read({codeId:'C',nodeId:'N',date:''})).rejects.toThrow('配置不可用')
    const requestCount=http.requests.length
    await expect(client.read({codeId:'',nodeId:'N',date:''})).rejects.toThrow()
    expect(http.requests).toHaveLength(requestCount)
  })
})
