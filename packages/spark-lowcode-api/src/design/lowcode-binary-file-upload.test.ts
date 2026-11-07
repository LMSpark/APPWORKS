import {describe,expect,it} from 'vitest'
import {HttpClientBase,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDesignFileUpload} from './lowcode-design-file-upload.js'

const scene='36B01771C627B9BF5CD493DC75B996A1',content=new Uint8Array([0,255,1,128,13,10])
class Service extends HttpClientBase{
 requests:RequestConfig[]=[]
 body:unknown={Code:200,Result:[{state:'success',fileName:'原模板.xlsx',filePath:'/tenant/xlsxtemp/原模板_renamed.xlsx'}]}
 download:ArrayBuffer=content.slice().buffer
 failDownload=false
 afterUpload?:()=>void
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  this.requests.push(request)
  if(request.url==='/api/File/DownFile'){if(this.failDownload){this.failDownload=false;throw Error('read unavailable')}return{data:this.download,status:200,statusText:'OK',headers:{}}}
  this.afterUpload?.();return{data:this.body,status:200,statusText:'OK',headers:{}}
 }
}
function fixture(name='原模板.xlsx'){
 const http=new Service(),scope={token:'scope',headers:{'X-AppId':'APP','tenant-id':'tenant'}},sdk=new LowcodeDesignFileUpload({http,readScope:()=>scope}),file=new File([content],name)
 const upload=()=>sdk.uploadBinaryVersion({file,scenarioId:scene,appType:'xlsxtemp',customPath:'xlsxtemp',fieldName:'files'})
 return{http,scope,sdk,file,upload}
}
describe('original binary file ACK and independent verification',()=>{
 it.each(['原模板.xlsx','原模板.XLS'])('preserves binary input and uses actual renamed locator for %s',async name=>{
  const f=fixture(name),actual=name.endsWith('.XLS')?'原模板_renamed.XLS':'原模板_renamed.xlsx'
  f.http.body={Code:200,Result:[{state:'success',fileName:name,filePath:`/tenant/xlsxtemp/${actual}`}]}
  const receipt=await f.upload();expect(receipt).toEqual({templatePath:`/tenant/xlsxtemp/${actual}`,locator:{appType:'xlsxtemp',customPath:'xlsxtemp',fileName:actual,isCrossEnterprise:false}});expect(f.http.requests).toHaveLength(1)
  const request=f.http.requests[0]!,form=request.data as FormData
  expect(request).toMatchObject({url:'/api/File/UploadFile',method:'POST',retry:0,cache:false,headers:{'X-AppId':'APP','X-FormKey':scene}})
  expect(form.get('appType')).toBe('xlsxtemp');expect(form.get('customPath')).toBe('xlsxtemp');expect(form.get('isReplace')).toBe('false');expect(form.get('isCrossEnt')).toBe('false');expect(form.get('newName')).toBe(name);expect(form.get('file')).toBeNull()
  const file=form.get('files') as File;expect(file.name).toBe(name);expect(new Uint8Array(await file.arrayBuffer())).toEqual(content)
  await f.sdk.verifyBinaryVersion({receipt,file:f.file});expect(f.http.requests[1]).toMatchObject({url:'/api/File/DownFile',data:{appType:'xlsxtemp',customPath:'xlsxtemp',fileName:actual,isCrossEnt:false}})
 })
 it.each([
  {Code:0,Result:[]},{Code:200,Result:[]},{Code:200,Result:[{state:'failed',filePath:'/tenant/xlsxtemp/a.xlsx'}]},
  {Code:200,Result:[{state:'success',filePath:'/other/xlsxtemp/a.xlsx'}]},
  {Code:200,Result:[{state:'success',filePath:'/tenant/xlsxtemp/../a.xlsx'}]},
  {Code:200,Result:[{state:'success',filePath:'https://example.com/a.xlsx'}]},
  {Code:200,Result:[{state:'success',filePath:'/tenant/xlsxtemp/child/a.xlsx'}]},
 ])('keeps a dispatched invalid ACK unconfirmed without downloading: %j',async body=>{
  const f=fixture();f.http.body=body;await expect(f.upload()).rejects.toMatchObject({fileResourceMutationMayHaveApplied:true});expect(f.http.requests).toHaveLength(1)
 })
 it('keeps the original ACK when the first byte read fails and never uploads on verification',async()=>{
  const f=fixture(),receipt=await f.upload();f.http.failDownload=true;await expect(f.sdk.verifyBinaryVersion({receipt,file:f.file})).rejects.toThrow('read unavailable')
  await f.sdk.verifyBinaryVersion({receipt,file:f.file});expect(f.http.requests.filter(request=>request.url==='/api/File/UploadFile')).toHaveLength(1);expect(f.http.requests.filter(request=>request.url==='/api/File/DownFile')).toHaveLength(2)
 })
 it('does not accept different byte content or reconstruct a receipt from its public strings',async()=>{
  const f=fixture(),receipt=await f.upload();f.http.download=new Uint8Array([0,255]).buffer;await expect(f.sdk.verifyBinaryVersion({receipt,file:f.file})).rejects.toThrow('回读不一致')
  const reads=f.http.requests.length;await expect(f.sdk.verifyBinaryVersion({receipt:{...receipt},file:f.file})).rejects.toThrow();expect(f.http.requests).toHaveLength(reads)
 })
 it('rejects a different File handle and a changed execution scope without extra IO',async()=>{
  const f=fixture(),receipt=await f.upload();await expect(f.sdk.verifyBinaryVersion({receipt,file:new File([content],f.file.name)})).rejects.toThrow();f.scope.headers['X-AppId']='OTHER';await expect(f.sdk.verifyBinaryVersion({receipt,file:f.file})).rejects.toThrow();expect(f.http.requests).toHaveLength(1)
 })
 it('does not confirm an upload ACK after an application switch with the same token',async()=>{
  const f=fixture();f.http.afterUpload=()=>{f.scope.headers['X-AppId']='OTHER'};await expect(f.upload()).rejects.toMatchObject({fileResourceMutationMayHaveApplied:true});expect(f.http.requests).toHaveLength(1)
 })
 it('rejects non-Excel input and missing tenant identity before dispatch',async()=>{
  const f=fixture('not-a-template.txt');await expect(f.upload()).rejects.toThrow();expect(f.http.requests).toEqual([])
  const valid=fixture();valid.scope.headers['tenant-id']='';await expect(valid.upload()).rejects.toThrow();expect(valid.http.requests).toEqual([])
 })
})
