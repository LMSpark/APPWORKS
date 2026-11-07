import {afterEach,describe,expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {HttpResponse,RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createExcelCatalogBindings,startExcelSchemeCreation,saveExcelSchemeCreation,cancelExcelSchemeCreation,readExcelSchemeCreation,endExcelSchemeCreation} from '@/lowcode/resources/semi-structured/excel-import/catalog/creation'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {EXCEL,topicModels,topicTexts} from './formal-topic.fixture'

class Service extends ApiBackend{
 allocations:RequestConfig[]=[]
 allocationBody:unknown={Code:200,Result:'EXCEL-002'}
 rejectWriteback=false
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  if(request.url.startsWith('/api/Codeing/GetCodeString/')){this.allocations.push(request);if(this.rejectWriteback)this.rejectNextSave=true;return{data:this.allocationBody,status:200,statusText:'OK',headers:{}}}
  return super.executeRequest(request)
 }
}
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(existing?:Service){
 const http=existing??new Service(),scope={token:'scope',headers:{'X-AppId':'APP','tenant-id':'tenant'}},config=new ScenarioViewConfig(EXCEL,topicTexts[EXCEL]!)
 if(!existing)http.records={Base_Import_solution:[{rowid:'OLD',solutionName:'原方案',coding:''}],Base_DataSet:[{rowid:'SPACE',Name:'目标空间'}],Base_UserInfo:[]}
 const runtime=new DataSpaceRuntimeApi({http,readScope:()=>scope}),bindings=createExcelCatalogBindings({config,http,readScope:()=>scope,assertCurrent:()=>undefined})
 const {dataSet:ds}=new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space:{dataSpaceId:EXCEL,name:'Excel'},models:topicModels(EXCEL),relations:[],...bindings});sets.push(ds)
 const list=ds.getView('Base_Import_solution')!,target=ds.getView('Base_Import_solution','editorTarget')!,command=ds.getView('BusinessCodeAssignment')!
 await list.refresh();await ds.getView('Base_DataSet')!.refresh()
 const start=async()=>{const id=await startExcelSchemeCreation(ds);list.updateEditingValue(id,'solutionName','新方案');list.updateEditingValue(id,'dataSetId','SPACE');return id}
 return{ds,http,list,target,command,start,scope}
}
describe('Excel scheme creation through declared native views',()=>{
 it('cancels the native Added input without any allocation or backend write',async()=>{
  const f=await fixture(),id=await f.start();expect(readExcelSchemeCreation(f.ds)?.id).toBe(id);cancelExcelSchemeCreation(f.ds)
  expect(f.list.rows.some(row=>f.list.getPkKey(row)===id)).toBe(false);expect(f.http.saves).toEqual([]);expect(f.http.allocations).toEqual([])
 })
 it('confirms the original Added, assigns once, and writes coding only to the same row',async()=>{
  const f=await fixture(),id=await f.start();await saveExcelSchemeCreation(f.ds)
  expect(f.http.saves).toHaveLength(2);expect(f.http.saves[0]).toMatchObject({added:[{rowid:id,solutionName:'新方案',dataSetId:'SPACE'}],changed:[]});expect(f.http.saves[1]).toMatchObject({added:[],changed:[{rowid:id,coding:'EXCEL-002'}]})
  expect(Object.keys(f.http.saves[1]!.changed[0]!).sort()).toEqual(['coding','rowid'])
  expect(f.http.allocations).toHaveLength(1);expect(f.http.allocations[0]?.url).toContain(`/${id}/A3A38857F7584319844A826EF9AAA881`)
  expect(f.target.rows[0]).toMatchObject({rowid:id,coding:'EXCEL-002'});expect(readExcelSchemeCreation(f.ds)?.phase).toBe('complete')
 })
 it('recovers only the original unknown Added before allowing a later allocation',async()=>{
  const f=await fixture();await f.start();f.http.failAfterWrite=true;await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow();expect(f.http.allocations).toHaveLength(0)
  await saveExcelSchemeCreation(f.ds);expect(f.http.allocations).toHaveLength(0);expect(f.http.saves).toHaveLength(1)
  await saveExcelSchemeCreation(f.ds);expect(f.http.allocations).toHaveLength(1);expect(f.http.saves).toHaveLength(2)
 })
 it('retains the confirmed code after failed writeback and command refresh without allocating again',async()=>{
  const f=await fixture(),id=await f.start();f.http.rejectWriteback=true
  await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow();await f.command.refresh();expect(readExcelSchemeCreation(f.ds)?.id).toBe(id)
  await saveExcelSchemeCreation(f.ds);expect(f.http.allocations).toHaveLength(1);expect(f.http.records['Base_Import_solution']!.find(row=>row['rowid']===id)?.['coding']).toBe('EXCEL-002')
 })
 it('keeps malformed allocation unknown and forbids cancel or a second allocation',async()=>{
  const f=await fixture();await f.start();f.http.allocationBody={Code:500,Message:'failed'};await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow()
  expect(()=>cancelExcelSchemeCreation(f.ds)).toThrow();await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow();expect(f.http.allocations).toHaveLength(1)
  await expect(endExcelSchemeCreation(f.ds)).rejects.toThrow();expect(f.command.hasUnconfirmedSave).toBe(true)
 })
 it('does not infer allocation permission from a historical empty coding field',async()=>{
  const f=await fixture();await f.command.refresh();await expect(f.command.addRow({rowId:'OLD',ruleId:'A3A38857F7584319844A826EF9AAA881'})).rejects.toThrow();expect(f.http.allocations).toEqual([])
 })
 it('only rereads after an acknowledged Added whose independent read failed',async()=>{
  const f=await fixture();await f.start();f.http.beforeDefinitionRead=async table=>{if(table==='Base_Import_solution'&&f.http.saves.length)throw Error('read unavailable')}
  await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow();expect(readExcelSchemeCreation(f.ds)?.phase).toBe('created');expect(f.http.allocations).toEqual([])
  delete f.http.beforeDefinitionRead;await saveExcelSchemeCreation(f.ds);expect(f.http.saves.filter(save=>save.added.length)).toHaveLength(1);expect(f.http.allocations).toHaveLength(1)
 })
 it('rejects another dirty field before retrying a known coding writeback',async()=>{
  const f=await fixture(),id=await f.start();f.http.rejectWriteback=true;await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow()
  f.target.updateEditingValue(id,'transform_enabled',1);await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow('不能夹带');expect(f.http.saves).toHaveLength(1);expect(f.http.allocations).toHaveLength(1)
 })
 it('rereads a known failed writeback and refuses a different persisted coding',async()=>{
  const f=await fixture(),id=await f.start();f.http.rejectWriteback=true;await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow()
  f.http.records['Base_Import_solution']!.find(row=>row['rowid']===id)!['coding']='EXTERNAL'
  await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow('冲突');expect(f.http.records['Base_Import_solution']!.find(row=>row['rowid']===id)?.['coding']).toBe('EXTERNAL');expect(f.http.allocations).toHaveLength(1)
 })
 it('only verifies an unknown coding writeback before independently confirming it',async()=>{
  const f=await fixture();await f.start();f.http.beforeSave=async()=>{if(f.http.allocations.length){delete f.http.beforeSave;f.http.failAfterWrite=true}}
  await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow();expect(f.http.saves).toHaveLength(2)
  await saveExcelSchemeCreation(f.ds);expect(f.http.saves).toHaveLength(2);expect(f.http.allocations).toHaveLength(1);expect(readExcelSchemeCreation(f.ds)?.phase).toBe('writeback')
  await saveExcelSchemeCreation(f.ds);expect(readExcelSchemeCreation(f.ds)?.phase).toBe('complete');expect(f.http.saves).toHaveLength(2)
 })
 it('independently reopens the persisted result without minting a new creation proof',async()=>{
  const f=await fixture(),id=await f.start();await saveExcelSchemeCreation(f.ds);const reopened=await fixture(f.http)
  expect(reopened.list.rows.find(row=>reopened.list.getPkKey(row)===id)).toMatchObject({solutionName:'新方案',coding:'EXCEL-002'});expect(readExcelSchemeCreation(reopened.ds)).toBeUndefined()
  await reopened.command.refresh();await expect(reopened.command.addRow({rowId:id,ruleId:'A3A38857F7584319844A826EF9AAA881'})).rejects.toThrow();expect(f.http.allocations).toHaveLength(1)
 })
 it('rejects a changed execution scope before creating or allocating anything else',async()=>{
  const f=await fixture(),id=await f.start();f.scope.headers['X-AppId']='OTHER';expect(readExcelSchemeCreation(f.ds)?.id).toBe(id);await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow('原实例');expect(f.http.saves).toEqual([]);expect(f.http.allocations).toEqual([])
 })
 it('rejects synchronous extra editing triggered by the first coding stage without discarding it',async()=>{
  const f=await fixture(),id=await f.start();let injected=false
  const off=f.ds.onAnyViewChange({editingFieldChanged:()=>{if(!injected&&f.target.getEditingRow(id)?.['coding']==='EXCEL-002'){injected=true;f.target.updateEditingValue(id,'description','late-other-field')}}})
  await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow('不能夹带');off();expect(f.http.saves).toHaveLength(1);expect(f.target.getEditingRow(id)?.['description']).toBe('late-other-field');expect(f.http.allocations).toHaveLength(1)
 })
 it('can explicitly retain a known saved scheme after coding conflict without resetting its allocation',async()=>{
  const f=await fixture(),id=await f.start();f.http.rejectWriteback=true;await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow();f.http.records['Base_Import_solution']!.find(row=>row['rowid']===id)!['coding']='EXTERNAL'
  await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow('冲突');await endExcelSchemeCreation(f.ds);expect(readExcelSchemeCreation(f.ds)?.phase).toBe('retained');expect(f.http.saves).toHaveLength(1);expect(f.http.allocations).toHaveLength(1)
  await expect(f.command.addRow({rowId:id,ruleId:'A3A38857F7584319844A826EF9AAA881'})).rejects.toThrow()
 })
 it.each(['read-failure','later-input'] as const)('preserves an undispatched command until ending is fully checked: %s',async mode=>{
  const f=await fixture();await f.start();let changed=false
  const off=f.ds.onAnyViewChange({rowsChanged:()=>{if(!changed&&f.command.rows.length){changed=true;f.target.queryContext={importConfigId:'OTHER'}}}})
  await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow();off();expect(f.http.allocations).toEqual([]);const id=f.command.rows[0]?.['commandId'];expect(typeof id).toBe('string')
  f.http.beforeDefinitionRead=async table=>{if(table!=='Base_Import_solution')return;if(mode==='read-failure')throw Error('end read failed');f.command.updateEditingValue(String(id),'ruleId','LATER')}
  await expect(endExcelSchemeCreation(f.ds)).rejects.toThrow();expect(f.command.dirtyTracking.isPendingCreate(String(id))).toBe(true);delete f.http.beforeDefinitionRead
  if(mode==='read-failure'){await endExcelSchemeCreation(f.ds);expect(readExcelSchemeCreation(f.ds)?.phase).toBe('retained')}
  else expect(f.command.getEditingRow(String(id))?.['ruleId']).toBe('LATER')
  expect(f.http.allocations).toEqual([])
 })
 it('can locally retain a confirmed Added when subsequent reads and the execution scope are unavailable',async()=>{
  const f=await fixture();await f.start();f.http.beforeDefinitionRead=async table=>{if(table==='Base_Import_solution'&&f.http.saves.length)throw Error('offline')};await expect(saveExcelSchemeCreation(f.ds)).rejects.toThrow();expect(readExcelSchemeCreation(f.ds)?.phase).toBe('created')
  const reads=f.http.reads.length;f.scope.headers['X-AppId']='OTHER';await endExcelSchemeCreation(f.ds);expect(readExcelSchemeCreation(f.ds)?.phase).toBe('retained');expect(f.http.reads).toHaveLength(reads);expect(f.http.saves).toHaveLength(1);expect(f.http.allocations).toEqual([])
 })
})
