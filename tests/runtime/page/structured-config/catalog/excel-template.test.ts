import {afterEach,describe,expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {HttpResponse,RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createExcelCatalogBindings,startExcelSchemeCreation,saveExcelSchemeCreation} from '@/lowcode/resources/semi-structured/excel-import/catalog/creation'
import {selectExcelTemplate,cancelExcelTemplate,saveExcelTemplate,readExcelTemplate,retainExcelTemplate} from '@/lowcode/resources/semi-structured/excel-import/catalog/template'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {EXCEL,topicModels,topicTexts} from './formal-topic.fixture'

const bytes=new Uint8Array([0,255,1,128]),sets:DataSet[]=[]
class Service extends ApiBackend{
 files:RequestConfig[]=[]
 failRead=false
 loseAck=false
 normalizeAddedPath=false
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  if(request.url.startsWith('/api/Codeing/GetCodeString/'))return{data:{Code:200,Result:'EXCEL-NEW'},status:200,statusText:'OK',headers:{}}
  if(request.url==='/api/File/UploadFile'){this.files.push(request);if(this.loseAck)throw Error('ACK lost');return{data:{Code:200,Result:[{state:'success',filePath:'/tenant/xlsxtemp/renamed.xlsx'}]},status:200,statusText:'OK',headers:{}}}
  if(request.url==='/api/File/DownFile'){this.files.push(request);if(this.failRead){this.failRead=false;throw Error('download lost')}return{data:bytes.slice().buffer,status:200,statusText:'OK',headers:{}}}
  const result=await super.executeRequest(request)
  if(this.normalizeAddedPath&&request.url==='/api/DataOperation/BatchTableOperateRequestByCRUD')for(const row of this.records['Base_Import_solution']??[])if(row['templatePath']===undefined)row['templatePath']=null
  return result
 }
}
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(){
 const http=new Service(),scope={token:'scope',headers:{'X-AppId':'APP','tenant-id':'tenant'}},config=new ScenarioViewConfig(EXCEL,topicTexts[EXCEL]!)
 http.records={Base_Import_solution:[{rowid:'S1',solutionName:'原方案',coding:'EXCEL1',templatePath:'/tenant/xlsxtemp/old.xlsx'}],Base_DataSet:[],Base_UserInfo:[]}
 const runtime=new DataSpaceRuntimeApi({http,readScope:()=>scope}),bindings=createExcelCatalogBindings({config,http,readScope:()=>scope,assertCurrent:()=>undefined})
 const {dataSet:ds}=new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space:{dataSpaceId:EXCEL,name:'Excel'},models:topicModels(EXCEL),relations:[],...bindings});sets.push(ds)
 const list=ds.getView('Base_Import_solution')!,target=ds.getView('Base_Import_solution','editorTarget')!
 await list.refresh()
 const choose=()=>selectExcelTemplate(ds,'S1',new File([bytes],'original.xlsx'))
 return{http,ds,list,target,scope,choose}
}
describe('Excel template through the original scheme DataView',()=>{
 it('selects, changes and cancels without a request or business draft',async()=>{const f=await fixture();f.choose();f.choose();expect(readExcelTemplate(f.ds)?.phase).toBe('selected');cancelExcelTemplate(f.ds);expect(readExcelTemplate(f.ds)).toBeUndefined();expect(f.http.files).toEqual([]);expect(f.http.saves).toEqual([]);expect(f.list.hasEditingChanges()).toBe(false)})
 it('uploads once and independently confirms only templatePath on the original scheme',async()=>{const f=await fixture();f.choose();await saveExcelTemplate(f.ds);expect(f.http.files).toHaveLength(2);expect(f.http.saves).toHaveLength(1);expect(f.http.saves[0]).toMatchObject({added:[],changed:[{rowid:'S1',templatePath:'/tenant/xlsxtemp/renamed.xlsx'}]});expect(Object.keys(f.http.saves[0]!.changed[0]!).sort()).toEqual(['rowid','templatePath']);expect(readExcelTemplate(f.ds)?.phase).toBe('complete');expect(f.target.rows[0]?.['templatePath']).toBe('/tenant/xlsxtemp/renamed.xlsx')})
 it('recovers ACK byte verification without uploading again or silently writing the scheme',async()=>{const f=await fixture();f.choose();f.http.failRead=true;await expect(saveExcelTemplate(f.ds)).rejects.toThrow();await saveExcelTemplate(f.ds);expect(f.http.saves).toEqual([]);await saveExcelTemplate(f.ds);expect(f.http.files.filter(r=>r.url==='/api/File/UploadFile')).toHaveLength(1);expect(f.http.saves).toHaveLength(1)})
 it('never repeats an upload with completely lost ACK',async()=>{const f=await fixture();f.choose();f.http.loseAck=true;await expect(saveExcelTemplate(f.ds)).rejects.toThrow();await expect(saveExcelTemplate(f.ds)).rejects.toThrow();expect(()=>cancelExcelTemplate(f.ds)).toThrow();expect(f.http.files).toHaveLength(1);expect(f.http.saves).toEqual([])})
 it('rejects pending ordinary edits before uploading',async()=>{const f=await fixture();f.choose();f.list.updateEditingValue('S1','description','待保存');await expect(saveExcelTemplate(f.ds)).rejects.toThrow();expect(f.http.files).toEqual([])})
 it('does not overwrite a different persisted template after known DB failure',async()=>{const f=await fixture();f.choose();f.http.rejectNextSave=true;await expect(saveExcelTemplate(f.ds)).rejects.toThrow();f.http.records['Base_Import_solution']![0]!['templatePath']='/tenant/xlsxtemp/other.xlsx';await expect(saveExcelTemplate(f.ds)).rejects.toThrow();expect(f.http.files.filter(r=>r.url==='/api/File/UploadFile')).toHaveLength(1);expect(f.http.records['Base_Import_solution']![0]?.['templatePath']).toBe('/tenant/xlsxtemp/other.xlsx')})
 it('only verifies an unknown DB write before the final independent read',async()=>{const f=await fixture();f.choose();f.http.failAfterWrite=true;await expect(saveExcelTemplate(f.ds)).rejects.toThrow();await saveExcelTemplate(f.ds);expect(readExcelTemplate(f.ds)?.phase).toBe('publication');expect(f.http.saves).toHaveLength(1);await saveExcelTemplate(f.ds);expect(readExcelTemplate(f.ds)?.phase).toBe('complete');expect(f.http.saves).toHaveLength(1)})
 it('rejects a late unrelated draft without discarding it or writing it with the path',async()=>{const f=await fixture();f.choose();let injected=false;const off=f.ds.onAnyViewChange({editingFieldChanged:()=>{if(!injected&&f.target.getEditingRow('S1')?.['templatePath']==='/tenant/xlsxtemp/renamed.xlsx'){injected=true;f.target.updateEditingValue('S1','description','late')}}});await expect(saveExcelTemplate(f.ds)).rejects.toThrow('不能夹带');off();expect(f.http.saves).toEqual([]);expect(f.target.getEditingRow('S1')?.['description']).toBe('late')})
 it('rejects an application switch before file dispatch',async()=>{const f=await fixture();f.choose();f.scope.headers['X-AppId']='OTHER';await expect(saveExcelTemplate(f.ds)).rejects.toThrow();expect(f.http.files).toEqual([])})
 it('does not upload while the original Added is unknown',async()=>{const f=await fixture(),id=await startExcelSchemeCreation(f.ds);f.list.updateEditingValue(id,'solutionName','新增');selectExcelTemplate(f.ds,id,new File([bytes],'new.xlsx'));f.http.failAfterWrite=true;await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow();await expect(saveExcelTemplate(f.ds)).rejects.toThrow();expect(f.http.files).toEqual([]);expect(f.http.saves).toHaveLength(1)})
 it('freezes the selected original path and refuses a later external replacement before uploading',async()=>{const f=await fixture();f.choose();f.http.records['Base_Import_solution']![0]!['templatePath']='/tenant/xlsxtemp/external.xlsx';await expect(saveExcelTemplate(f.ds)).rejects.toThrow();expect(f.http.files).toEqual([]);expect(f.http.saves).toEqual([])})
 it('clears completed presentation state without cancelling an already published resource',async()=>{const f=await fixture();f.choose();await saveExcelTemplate(f.ds);cancelExcelTemplate(f.ds);expect(readExcelTemplate(f.ds)).toBeUndefined();f.choose();expect(readExcelTemplate(f.ds)?.phase).toBe('selected')})
 it('rejects a mutated command display path before any DB write',async()=>{const f=await fixture();f.choose();f.http.failRead=true;await expect(saveExcelTemplate(f.ds)).rejects.toThrow();await saveExcelTemplate(f.ds);f.ds.getView('TemplateUpload')!.rows[0]!['templatePath']='/tenant/xlsxtemp/fabricated.xlsx';await expect(saveExcelTemplate(f.ds)).rejects.toThrow();expect(f.http.saves).toEqual([])})
 it('can explicitly retain a confirmed but unpublished file without overwriting an external path',async()=>{const f=await fixture();f.choose();f.http.rejectNextSave=true;await expect(saveExcelTemplate(f.ds)).rejects.toThrow();f.http.records['Base_Import_solution']![0]!['templatePath']='/tenant/xlsxtemp/external.xlsx';await retainExcelTemplate(f.ds);expect(readExcelTemplate(f.ds)).toMatchObject({phase:'retained',retainedPath:'/tenant/xlsxtemp/renamed.xlsx'});cancelExcelTemplate(f.ds);expect(readExcelTemplate(f.ds)).toBeUndefined();expect(f.http.records['Base_Import_solution']![0]?.['templatePath']).toBe('/tenant/xlsxtemp/external.xlsx');expect(f.http.files).toHaveLength(2)})
 it('can cancel a native command after a local File read failure before dispatch',async()=>{const f=await fixture(),file=new File([bytes],'bad-local.xlsx');Object.defineProperty(file,'arrayBuffer',{value:async()=>{throw Error('local File unavailable')}});selectExcelTemplate(f.ds,'S1',file);await expect(saveExcelTemplate(f.ds)).rejects.toThrow();expect(readExcelTemplate(f.ds)?.unconfirmed).toBe(false);cancelExcelTemplate(f.ds);expect(readExcelTemplate(f.ds)).toBeUndefined();expect(f.http.files).toEqual([]);f.choose()})
 it('publishes a template chosen during Added when its independently read original path is SQL null',async()=>{const f=await fixture();f.http.normalizeAddedPath=true;const id=await startExcelSchemeCreation(f.ds);f.list.updateEditingValue(id,'solutionName','新增模板方案');selectExcelTemplate(f.ds,id,new File([bytes],'new.xlsx'));await saveExcelSchemeCreation(f.ds);expect(f.target.rows[0]?.['templatePath']).toBeNull();await saveExcelTemplate(f.ds);expect(f.http.files.filter(r=>r.url==='/api/File/UploadFile')).toHaveLength(1);expect(f.http.saves.at(-1)).toMatchObject({added:[],changed:[{rowid:id,templatePath:'/tenant/xlsxtemp/renamed.xlsx'}]});expect(Object.keys(f.http.saves.at(-1)!.changed[0]!).sort()).toEqual(['rowid','templatePath']);await f.target.refresh();expect(f.target.rows[0]?.['templatePath']).toBe('/tenant/xlsxtemp/renamed.xlsx');expect(readExcelTemplate(f.ds)?.phase).toBe('complete')})
})
