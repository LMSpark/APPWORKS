import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {LowcodeApiError,DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {openJsonDocumentView} from '@/lowcode/resources/semi-structured/json-data/document-resource'
import {ApiBackend} from '../api-provider/api-provider.fixture'
import {buildFormalModels} from '../structured-config/catalog/structured-config-catalog.fixture'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(){
 const http=new ApiBackend();http.records={Base_JsonData:[{rowid:'J1',name:'数据',path:'/NewApp/data.json'},{rowid:'J2',name:'另一个',path:null}]}
 const runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const models=buildFormalModels({Base_JsonData:['rowid','name','path']})
 const config=new ScenarioViewConfig('JSON',JSON.stringify({scenarioId:'JSON',tables:{Base_JsonData:{modelBinding:{modelId:'Base_JsonData-model',modelName:'Base_JsonData'},views:{default:{queryConfig:{fields:['rowid','name','path']}}}}}}))
 const ds=new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space:{dataSpaceId:'JSON',name:'JSON'},models,relations:[]}).dataSet;sets.push(ds)
 const catalog=ds.getView('Base_JsonData')!;await catalog.refresh()
 const files=new Map<string,string>([['data.json','{"flag":false,"nested":[[1,null],{}]}']])
 let lose=false,current=true
 const read=vi.fn(async({fileName}:{fileName:string})=>{const text=files.get(fileName);if(text===undefined)throw new LowcodeApiError(404,'文件不存在');return text})
 const upload=vi.fn(async(input:{fileName:string;text:string})=>{files.set(input.fileName,input.text);if(lose){lose=false;throw new Error('lost response')}return {}})
 const options={api:{readTextFile:read},fileUpload:{uploadWorkingText:upload},assertCurrent:()=>{if(!current)throw new Error('STALE')}}
 return {ds,catalog,read,upload,files,lose:()=>{lose=true},stale:()=>{current=false},open:(id='J1')=>openJsonDocumentView({dataSet:ds,catalog,jsonId:id,...options})}
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
