import {afterEach,describe,expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDesignFileUpload} from '../../../design/lowcode-design-file-upload.js'
import {RichTextImageUploadResource} from './rich-text-image-upload-resource.js'

const scene='7AB874097A1E8711A42FD845939A6E05',bytes=new Uint8Array([137,80,78,71])
class Service extends HttpClientBase{
 requests:RequestConfig[]=[]
 failRead=false
 loseAck=false
 counter=0
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  this.requests.push(request)
  if(request.url==='/api/File/DownFile'){if(this.failRead){this.failRead=false;throw Error('read lost')}return{data:bytes.slice().buffer,status:200,statusText:'OK',headers:{}}}
  if(this.loseAck)throw Error('upload ACK lost')
  this.counter+=1
  return{data:{Code:200,Result:[{state:'success',filePath:`/tenant/ApplicationFunMan/Prototype/img${this.counter}.png`}]},status:200,statusText:'OK',headers:{}}
 }
}
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
function fixture(){
 const ds=DataSet.fromJson({scenarioId:scene,tables:{}});sets.push(ds)
 const http=new Service(),scope={token:'scope',headers:{'X-AppId':'APP','tenant-id':'tenant'}}
 const resource=new RichTextImageUploadResource({dataSet:ds,upload:new LowcodeDesignFileUpload({http,readScope:()=>scope}),readScope:()=>scope})
 const image=(name='a.png')=>new File([bytes],name)
 const uploads=()=>http.requests.filter(request=>request.url==='/api/File/UploadFile')
 return{ds,http,scope,resource,image,uploads}
}
describe('rich text image upload command resource',()=>{
 it('uploads to the wwwroot prototype area through DataSet.saveChanges and returns the byte-verified path',async()=>{
  const f=fixture()
  await expect(f.resource.upload(f.image())).resolves.toBe('/tenant/ApplicationFunMan/Prototype/img1.png')
  const form=f.uploads()[0]!.data as FormData
  expect(form.get('appType')).toBe('wwwroot');expect(form.get('customPath')).toBe('ApplicationFunMan/Prototype');expect(f.uploads()[0]).toMatchObject({headers:{'X-FormKey':scene}})
  expect(f.http.requests[1]).toMatchObject({url:'/api/File/DownFile',data:{appType:'wwwroot',customPath:'ApplicationFunMan/Prototype',fileName:'img1.png'}})
  expect(f.resource.view.dirtyTracking.hasPendingChanges()).toBe(false);expect(f.resource.hasUnconfirmedUpload).toBe(false)
 })
 it('rejects non-image files and switched scopes before dispatch',async()=>{
  const f=fixture();await expect(f.resource.upload(f.image('a.svg'))).rejects.toThrow();f.scope.headers['X-AppId']='OTHER';await expect(f.resource.upload(f.image())).rejects.toThrow();expect(f.http.requests).toEqual([])
 })
 it('serializes concurrent uploads in call order',async()=>{
  const f=fixture(),[a,b]=await Promise.all([f.resource.upload(f.image('a.png')),f.resource.upload(f.image('b.png'))])
  expect([a,b]).toEqual(['/tenant/ApplicationFunMan/Prototype/img1.png','/tenant/ApplicationFunMan/Prototype/img2.png'])
  const names=f.uploads().map(request=>(request.data as FormData).get('newName'));expect(names).toEqual(['a.png','b.png'])
 })
 it('keeps an ACK-but-unverified upload unknown and only re-verifies it before the next image',async()=>{
  const f=fixture();f.http.failRead=true
  await expect(f.resource.upload(f.image('a.png'))).rejects.toThrow();expect(f.resource.hasUnconfirmedUpload).toBe(true)
  await expect(f.resource.upload(f.image('b.png'))).resolves.toBe('/tenant/ApplicationFunMan/Prototype/img2.png')
  expect(f.uploads()).toHaveLength(2);expect(f.resource.hasUnconfirmedUpload).toBe(false)
 })
 it('never retransmits a lost ACK and refuses further uploads while it stays unknown',async()=>{
  const f=fixture();f.http.loseAck=true
  await expect(f.resource.upload(f.image('a.png'))).rejects.toThrow();f.http.loseAck=false
  await expect(f.resource.upload(f.image('b.png'))).rejects.toThrow('上一张图片上传结果仍未确认')
  expect(f.uploads()).toHaveLength(1);expect(f.resource.hasUnconfirmedUpload).toBe(true)
 })
 it('refuses a second resource on the same DataSet',()=>{
  const f=fixture();expect(()=>new RichTextImageUploadResource({dataSet:f.ds,upload:new LowcodeDesignFileUpload({http:f.http,readScope:()=>f.scope}),readScope:()=>f.scope})).toThrow('表名冲突')
 })
})
