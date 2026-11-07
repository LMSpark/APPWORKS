import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {LowcodeApiError,DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {openJsonDocumentView,createJsonDocumentExecutor,JSON_DOCUMENT_COLUMNS,JSON_DOCUMENT_RESOURCE_ID} from '@/lowcode/resources/semi-structured/json-data/document-resource'
import {ApiBackend} from '../api-provider/api-provider.fixture'
import {buildFormalModels} from '../structured-config/catalog/structured-config-catalog.fixture'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(){
 const http=new ApiBackend();http.records={Base_JsonData:[{rowid:'J1',name:'数据',path:'/NewApp/data.json'},{rowid:'J2',name:'另一个',path:null}]}
 const runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const models=buildFormalModels({Base_JsonData:['rowid','name','path']})
 const config=new ScenarioViewConfig('JSON',JSON.stringify({scenarioId:'JSON',tables:{JsonDocumentFile:{resourceType:'file',resourceId:JSON_DOCUMENT_RESOURCE_ID,columns:JSON_DOCUMENT_COLUMNS,views:{default:{autoLoad:false,autoCurrentFirst:true,commitMode:'staged',queryContext:{jsonId:''}}}},Base_JsonData:{modelBinding:{modelId:'Base_JsonData-model',modelName:'Base_JsonData'},views:{default:{queryConfig:{fields:['rowid','name','path']}}}}}}))
 const files=new Map<string,string>([['data.json','{"flag":false,"nested":[[1,null],{}]}']])
 let lose=false,current=true
 const read=vi.fn(async({fileName}:{fileName:string})=>{const text=files.get(fileName);if(text===undefined)throw new LowcodeApiError(404,'文件不存在');return text})
 const upload=vi.fn(async(input:{fileName:string;text:string})=>{files.set(input.fileName,input.text);if(lose){lose=false;throw new Error('lost response')}return {}})
 const createUpload=vi.fn(upload)
 const options={api:{readTextFile:read},fileUpload:{uploadWorkingText:upload,uploadTextVersion:createUpload},assertCurrent:()=>{if(!current)throw new Error('STALE')}}
 const ds=new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space:{dataSpaceId:'JSON',name:'JSON'},models,relations:[],fileExecutors:{JsonDocumentFile:createJsonDocumentExecutor(options)}}).dataSet;sets.push(ds)
 const catalog=ds.getView('Base_JsonData')!;await catalog.refresh()
 return {ds,catalog,read,upload,createUpload,files,lose:()=>{lose=true},stale:()=>{current=false},open:(id='J1',create=false)=>openJsonDocumentView({dataSet:ds,catalog,jsonId:id,...options,...(create?{create:true}:{})})}
}
describe('raw JSON document file through SPARK data',()=>{
 it('reads the proven jsondatapath locator and preserves nested arrays, null and false on scoped file save',async()=>{
  const f=await fixture(),view=f.open();await view.refresh()
  expect(f.read).toHaveBeenCalledWith({appType:'jsondatapath',customPath:'',fileName:'data.json'})
  const next='{"flag":false,"nested":[[1,null],{}],"new":0}'
  view.updateEditingValue('J1','content',next);await f.ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})
  expect(f.upload).toHaveBeenCalledExactlyOnceWith({appType:'jsondatapath',customPath:'',fileName:'data.json',text:next})
  expect(f.files.get('data.json')).toBe(next)
 })
 it('keeps an absent file distinct and never creates it implicitly',async()=>{
  const f=await fixture(),view=f.open('J2');await view.refresh();expect(view.rows).toEqual([]);expect(view.loadingError?.message).toContain('文件不存在');expect(f.upload).not.toHaveBeenCalled()
 })
 it('cancels native edits and refuses stale metadata locator or execution scope',async()=>{
  const f=await fixture(),view=f.open();await view.refresh();view.updateEditingValue('J1','content','{}');view.discardPendingChanges();expect(view.hasEditingChanges()).toBe(false)
  f.stale();await expect(view.loadFromServer({singleFlight:false})).rejects.toThrow('STALE');expect(f.upload).not.toHaveBeenCalled()
 })
 it('recovers a possibly applied raw file save without replaying upload',async()=>{
  const f=await fixture(),view=f.open();await view.refresh();view.updateEditingValue('J1','content','{"saved":true}');f.lose()
  const save=()=>f.ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})
  await expect(save()).rejects.toThrow('lost response');expect(view.hasUnconfirmedSave).toBe(true);await save();expect(f.upload).toHaveBeenCalledTimes(1)
 })
 it('rejects an unreadable metadata target before touching files',async()=>{
  const f=await fixture();expect(()=>f.open('UNKNOWN')).toThrow('JSON_DOCUMENT_TARGET');expect(f.read).not.toHaveBeenCalled()
 })
})

it('creates a file only for the native pending catalog row and commits each source separately',async()=>{
 const f=await fixture();await f.catalog.addRow({name:'新JSON',path:''});const row=f.catalog.dirtyTracking.pendingCreateRows[0];if(!row)throw new Error('Native pending row missing');const id=f.catalog.getPkKey(row);expect(typeof id).toBe('string')
 const view=f.open(String(id),true);await view.refresh();expect(view.loadingError).toBeNull();expect(view.rows).toEqual([]);await view.addRow({content:'{"items":[[],null,false]}'})
 await f.ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]});expect(f.files.get(`${String(id)}.json`)).toBe('{"items":[[],null,false]}');expect(f.createUpload).toHaveBeenCalledTimes(1);expect(f.catalog.dirtyTracking.isPendingCreate(id!)).toBe(true)
 await f.ds.saveChanges({views:[{tableName:'Base_JsonData',viewId:'default',ids:[id!]}]});expect(f.catalog.dirtyTracking.isPendingCreate(id!)).toBe(false)
})
it('rejects create intent for an existing or absent catalog identity before touching a file',async()=>{
 const f=await fixture();expect(()=>f.open('J1',true)).toThrow('JSON_DOCUMENT_CREATE');expect(()=>f.open('J2',true)).toThrow('JSON_DOCUMENT_CREATE');expect(f.read).not.toHaveBeenCalled();expect(f.upload).not.toHaveBeenCalled()
})
it('refuses a pending row that points to another file instead of its own generated identity',async()=>{
 const f=await fixture();await f.catalog.addRow({name:'collision',path:'/NewApp/data.json'});const row=f.catalog.dirtyTracking.pendingCreateRows[0];if(!row)throw new Error('Pending catalog row missing');expect(()=>f.open(String(f.catalog.getPkKey(row)),true)).toThrow('JSON_DOCUMENT_CREATE');expect(f.upload).not.toHaveBeenCalled()
})
it('does not adopt or overwrite a file already occupying the new catalog identity',async()=>{
 const f=await fixture();await f.catalog.addRow({name:'collision',path:''});const row=f.catalog.dirtyTracking.pendingCreateRows[0];if(!row)throw new Error('Pending catalog row missing');const id=String(f.catalog.getPkKey(row));f.files.set(`${id}.json`,'{"existing":true}');const view=f.open(id,true);await view.refresh();expect(view.loadingError?.message).toContain('JSON_DOCUMENT_CREATE_CONFLICT');expect(view.rows).toEqual([]);expect(f.upload).not.toHaveBeenCalled()
})

it('recovers an unknown create on the same named view without replaying or committing catalog metadata',async()=>{
 const f=await fixture();await f.catalog.addRow({name:'new',path:''});const row=f.catalog.dirtyTracking.pendingCreateRows[0];if(!row)throw new Error('Pending catalog row missing');const id=String(f.catalog.getPkKey(row)),view=f.open(id,true);await view.refresh();await view.addRow({content:'{"created":true}'});f.lose();const save=()=>f.ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})
 await expect(save()).rejects.toThrow('lost response');expect(view.hasUnconfirmedSave).toBe(true);expect(f.open(id,true)).toBe(view);await save();expect(f.upload).toHaveBeenCalledTimes(1);expect(f.catalog.dirtyTracking.isPendingCreate(id)).toBe(true)
})
