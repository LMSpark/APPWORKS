// @vitest-environment node
import {expect,it} from 'vitest'
import {HttpClientBase,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {PdfInspectionApi} from './task-api'
class Http extends HttpClientBase{
 requests:RequestConfig[]=[]
 result:unknown={protocolVersion:'2.0',inspectJobId:'JOB',status:'PENDING',fileCount:1}
 protected async executeRequest(config:RequestConfig):Promise<HttpResponse<unknown>>{
  this.requests.push(config);return{data:{Code:200,Result:this.result},status:200,statusText:'OK',headers:{}}
 }
}
const input={requestId:'REQ',configId:'RULE',files:[{fileId:'FILE',appType:'filedata',filePath:'original/ack.pdf'}]}
function fixture(){const http=new Http();let token='scope';const api=new PdfInspectionApi({http,readScope:()=>({token,headers:{'X-AppId':'APP'}})});return{http,api,change:()=>{token='changed'}}}
it('submits the captured request identity and ACK path once',async()=>{
 const {http,api}=fixture();expect(await api.init(input)).toMatchObject({inspectJobId:'JOB',fileCount:1})
 expect(http.requests).toHaveLength(1);expect(http.requests[0]).toMatchObject({url:'/api/File/inspect/init',data:input,headers:{'X-AppId':'APP'}})
})
it('rejects a wrong result protocol without a retry',async()=>{const {api,http}=fixture();http.result={protocolVersion:'1.0'};await expect(api.init(input)).rejects.toThrow();expect(http.requests).toHaveLength(1)})
it('rejects a switched scope before sending a task',async()=>{const f=fixture();f.change();await expect(f.api.init(input)).rejects.toThrow();expect(f.http.requests).toHaveLength(0)})
it('recovers only the original request and rejects a different request receipt',async()=>{
 const {api,http}=fixture();http.result={protocolVersion:'2.0',inspectJobId:'JOB',requestId:'OTHER',status:'PENDING',progress:{total:1,finished:0},files:[]}
 await expect(api.recover('REQ')).rejects.toThrow();expect(http.requests[0]).toMatchObject({url:'/api/File/inspect/recover',data:{requestId:'REQ'}})
 expect(http.requests).toHaveLength(1)
})
it('preserves a server history page and total without requiring a made-up protocol field',async()=>{
 const {api,http}=fixture();http.result={page:2,pageSize:1,total:7,items:[{inspectJobId:'JOB',requestId:'REQ',configId:'RULE',status:'COMPLETED'}]}
 const result=await api.history({page:2,pageSize:1});expect(result.total).toBe(7);expect(result.items).toHaveLength(1)
 expect(http.requests[0]?.data).toEqual({page:2,pageSize:1})
})
it('rejects a wrong service page instead of presenting it under the requested page',async()=>{
 const {api,http}=fixture();http.result={page:1,pageSize:1,total:7,items:[]}
 await expect(api.history({page:2,pageSize:1})).rejects.toThrow('回执页不匹配')
})

const historyItem = {inspectJobId:'JOB',requestId:'REQ',configId:'RULE',status:'COMPLETED'}

it.each([
 {total:1, items:[historyItem]},
 {total:65, items:[historyItem]},
 {total:22, items:[historyItem,{...historyItem,inspectJobId:'OTHER'}]},
])('rejects contradictory history evidence (total $total)',async ({total,items})=>{
 const {api,http}=fixture()
 http.result={page:2,pageSize:20,total,items}
 await expect(api.history({page:2,pageSize:20})).rejects.toThrow('PDF_INSPECTION_PAGE')
 expect(http.requests).toHaveLength(1)
})

it.each([{total:21,items:[historyItem]},{total:1,items:[]}])('accepts a consistent last or out-of-range history page (total $total)',async ({total,items})=>{
 const {api,http}=fixture()
 http.result={page:2,pageSize:20,total,items}
 await expect(api.history({page:2,pageSize:20})).resolves.toMatchObject({total,items})
})

it.each([
 {finished:1,files:[{fileId:'A'}]},
 {finished:2,files:[{fileId:'A'}]},
 {finished:2,files:[{fileId:'A'},{fileId:'A'}]},
 {finished:2,files:[{fileId:'A'},{}]},
])('rejects incomplete or ambiguous completion evidence (finished $finished)',async ({finished,files})=>{
 const {api,http}=fixture()
 http.result={protocolVersion:'2.0',inspectJobId:'JOB',requestId:'REQ',status:'COMPLETED',progress:{total:2,finished},files}
 await expect(api.result('JOB')).rejects.toThrow('PDF_INSPECTION_RECEIPT')
 await expect(api.recover('REQ')).rejects.toThrow('PDF_INSPECTION_RECEIPT')
 expect(http.requests.map(request=>request.url.split('/').at(-1))).toEqual(['result','recover'])
})

it.each(['RUNNING','FAILED','CANCELLED'])('preserves consistent partial file evidence for %s',async status=>{
 const {api,http}=fixture(), files=[{fileId:'zip_entry',sourceFileId:'ARCHIVE'}]
 http.result={protocolVersion:'2.0',inspectJobId:'JOB',requestId:'REQ',status,progress:{total:2,finished:1},files}
 await expect(api.result('JOB')).resolves.toMatchObject({status,files,progress:{total:2,finished:1}})
})
