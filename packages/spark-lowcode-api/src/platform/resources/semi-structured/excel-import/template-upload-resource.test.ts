import {afterEach,describe,expect,it} from 'vitest'
import {DataSet,bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import {HttpClientBase,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDesignFileUpload} from '../../../../design/lowcode-design-file-upload.js'
import {ExcelTemplateUploadResource} from './template-upload-resource.js'

const scene='36B01771C627B9BF5CD493DC75B996A1',bytes=new Uint8Array([0,255,1,128])
class Service extends HttpClientBase{
 requests:RequestConfig[]=[]
 failRead=false
 loseAck=false
 body:unknown={Code:200,Result:[{state:'success',filePath:'/tenant/xlsxtemp/actual.xlsx'}]}
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  this.requests.push(request)
  if(request.url==='/api/File/DownFile'){if(this.failRead){this.failRead=false;throw Error('read lost')}return{data:bytes.slice().buffer,status:200,statusText:'OK',headers:{}}}
  if(this.loseAck)throw Error('upload ACK lost')
  return{data:this.body,status:200,statusText:'OK',headers:{}}
 }
}
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
function fixture(){
 const ds=DataSet.fromJson({scenarioId:scene,tables:{TemplateUpload:{resourceType:'command',resourceId:ExcelTemplateUploadResource.resourceId,columns:[{name:'commandId',type:'string',isPrimaryKey:true},{name:'schemeId',type:'string'},{name:'originalName',type:'string'},{name:'size',type:'number'},{name:'templatePath',type:'string'}],views:{default:{autoLoad:false,commitMode:'staged'},other:{autoLoad:false,commitMode:'staged'}}}}});sets.push(ds)
 const http=new Service(),scope={token:'scope',headers:{'X-AppId':'APP','tenant-id':'tenant'}},state={ready:true,published:''},file=new File([bytes],'original.xlsx')
 const resource=new ExcelTemplateUploadResource({upload:new LowcodeDesignFileUpload({http,readScope:()=>scope}),readScope:()=>scope,prepare:()=>({scenarioId:scene,schemeId:'S1',file,assertReady:()=>{if(!state.ready)throw Error('original scheme not ready')},assertUnpublished:path=>{if(state.published===path)throw Error('already published')},assertPublished:path=>{if(state.published!==path)throw Error('path not independently persisted')}})})
 const view=ds.getView('TemplateUpload')!,other=ds.getView('TemplateUpload','other')!;bindDataSetCommandSubmit(view,resource.binding(view));bindDataSetCommandSubmit(other,resource.binding(other))
 const add=async(target=view,id='C1')=>{await target.refresh();return target.addRow({commandId:id,schemeId:'S1',originalName:file.name,size:file.size})}
 const save=()=>ds.saveChanges({views:[{tableName:'TemplateUpload',viewId:'default',ids:['C1']}]})
 return{ds,http,scope,state,file,resource,view,other,add,save}
}
describe('declared Excel template file command',()=>{
 it('creates and cancels native input without uploading',async()=>{const f=fixture();await f.add();expect(()=>f.resource.releaseCancelled(f.view,'C1')).toThrow();f.view.discardPendingChanges(['C1']);f.resource.releaseCancelled(f.view,'C1');expect(f.view.rows).toEqual([]);expect(f.http.requests).toEqual([]);await f.add(f.other,'C2')})
 it('accepts a readonly byte-confirmed receipt and retains it across refresh',async()=>{const f=fixture();await f.add();await f.save();await f.view.refresh();expect(f.view.rows[0]).toMatchObject({commandId:'C1',schemeId:'S1',templatePath:'/tenant/xlsxtemp/actual.xlsx'});expect(f.view.fieldAccess(f.view.rows[0]!,'templatePath').write).toBe('denied');expect(f.http.requests).toHaveLength(2)})
 it('recovers only the original byte read after ACK without a second upload',async()=>{const f=fixture();await f.add();f.http.failRead=true;await expect(f.save()).rejects.toThrow();expect(f.view.hasUnconfirmedSave).toBe(true);expect(f.view.abandonUnconfirmedSave()).toBe(false);await f.save();expect(f.http.requests.filter(request=>request.url==='/api/File/UploadFile')).toHaveLength(1);expect(f.http.requests.filter(request=>request.url==='/api/File/DownFile')).toHaveLength(2)})
 it('never retransmits or cancels an upload whose ACK was completely lost',async()=>{const f=fixture();await f.add();f.http.loseAck=true;await expect(f.save()).rejects.toThrow();await expect(f.save()).rejects.toThrow();f.view.discardPendingChanges(['C1']);expect(f.view.hasUnconfirmedSave).toBe(true);expect(()=>f.resource.releaseCancelled(f.view,'C1')).toThrow();expect(f.http.requests).toHaveLength(1)})
 it('blocks new command IDs and named views for the same active scheme',async()=>{const f=fixture();await f.add();await expect(f.add(f.other,'C2')).rejects.toThrow();expect(f.http.requests).toEqual([])})
 it('rejects original identity or permissions that ceased to be ready before dispatch',async()=>{const f=fixture();await f.add();f.state.ready=false;await expect(f.save()).rejects.toThrow('original scheme');expect(f.http.requests).toEqual([]);expect(f.view.hasUnconfirmedSave).toBe(false)})
 it('releases the original File only after publication is independently confirmed',async()=>{const f=fixture();await f.add();await f.save();expect(()=>f.resource.releasePublished(f.view,'C1')).toThrow();f.state.published='/tenant/xlsxtemp/actual.xlsx';f.resource.releasePublished(f.view,'C1');await f.add(f.other,'C2');expect(f.http.requests).toHaveLength(2)})
 it('does not let a second resource instance reset the same DataSet ownership',()=>{const f=fixture();const second=new ExcelTemplateUploadResource({upload:new LowcodeDesignFileUpload({http:f.http,readScope:()=>f.scope}),readScope:()=>f.scope,prepare:()=>{throw Error('not used')}});expect(()=>second.binding(f.other)).toThrow()})
 it('never admits a File or fabricated output path into the JSON command row',async()=>{const f=fixture();await f.view.refresh();await expect(f.view.addRow({commandId:'BAD',schemeId:'S1',originalName:f.file.name,size:f.file.size,file:f.file})).rejects.toThrow();await expect(f.view.addRow({commandId:'BAD2',schemeId:'S1',originalName:f.file.name,size:f.file.size,templatePath:'fake'})).rejects.toThrow();await f.add();expect(f.http.requests).toEqual([])})
 it('keeps a bad upload ACK unknown without trying to locate or retransmit it',async()=>{const f=fixture();await f.add();f.http.body={Code:200,Result:[{state:'success',filePath:'/foreign/xlsxtemp/actual.xlsx'}]};await expect(f.save()).rejects.toThrow();await expect(f.save()).rejects.toThrow();expect(f.view.hasUnconfirmedSave).toBe(true);expect(f.http.requests).toHaveLength(1)})
 it('rejects a switched application before upload even when the token string is unchanged',async()=>{const f=fixture();await f.add();f.scope.headers['X-AppId']='OTHER';await expect(f.save()).rejects.toThrow();expect(f.http.requests).toEqual([])})
 it('rechecks original business readiness after the async File read and before dispatch',async()=>{const f=fixture();await f.add();Object.defineProperty(f.file,'arrayBuffer',{value:async()=>{f.state.ready=false;return bytes.slice().buffer}});await expect(f.save()).rejects.toThrow();expect(f.http.requests).toEqual([]);expect(f.view.hasUnconfirmedSave).toBe(false);f.view.discardPendingChanges(['C1']);f.resource.releaseCancelled(f.view,'C1')})
})
