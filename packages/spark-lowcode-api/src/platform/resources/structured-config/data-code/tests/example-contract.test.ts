import {describe,expect,it} from 'vitest'
import {HttpClientBase,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {CodeExampleClient} from '../example-client.js'

class Service extends HttpClientBase {
  body:unknown={Code:200,Result:'SMOKE20261102001'}
  requests:RequestConfig[]=[]
  beforeReturn?:()=>void
  protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
    this.requests.push(request);this.beforeReturn?.();return{data:this.body,status:200,statusText:'OK',headers:{}}
  }
}
const nodes=[{NodeNo:1,NodeType:2,CodeNodeDesignJson:'{"ConstString":"SMOKE"}'}]
describe('confirmed code example function contract',()=>{
  it('posts only the supplied draft nodes under the current execution scope',async()=>{
    const http=new Service(),client=new CodeExampleClient(http,{scenarioId:'S',readScope:()=>({token:'scope',headers:{'X-AppId':'A'}})})
    expect(await client.read({busTableId:'T/1',nodes})).toBe('SMOKE20261102001')
    expect(http.requests).toHaveLength(1)
    expect(http.requests[0]).toMatchObject({method:'POST',url:'/api/Codeing/TestGetCodeString/T%2F1',data:{codeNodesList:nodes},headers:{'X-AppId':'A','X-FormKey':'S'}})
  })
  it('rejects a response after the same scope object changes tenant or token',async()=>{
    const scope={token:'old',headers:{'X-AppId':'A','tenant-id':'T'}},http=new Service()
    const client=new CodeExampleClient(http,{scenarioId:'S',readScope:()=>scope})
    http.beforeReturn=()=>{scope.headers['tenant-id']='OTHER'}
    await expect(client.read({busTableId:'T',nodes})).rejects.toThrow('STALE')
    http.beforeReturn=()=>{scope.token='new'}
    await expect(client.read({busTableId:'T',nodes})).rejects.toThrow('STALE')
  })
  it('preserves formal rejection and rejects malformed results or missing input without retries',async()=>{
    const http=new Service(),client=new CodeExampleClient(http,{scenarioId:'S',readScope:()=>({token:'scope',headers:{'X-AppId':'A'}})})
    http.body={Code:1003,Message:'业务表数据为空'};await expect(client.read({busTableId:'T',nodes})).rejects.toThrow('业务表数据为空')
    http.body={Code:200,Result:{value:'unconfirmed'}};await expect(client.read({busTableId:'T',nodes})).rejects.toThrow('字符串')
    await expect(client.read({busTableId:'',nodes})).rejects.toThrow()
    await expect(client.read({busTableId:'T',nodes:[]})).rejects.toThrow()
    expect(http.requests).toHaveLength(2)
  })
})
