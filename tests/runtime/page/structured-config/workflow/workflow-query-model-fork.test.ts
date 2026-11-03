import {afterEach,describe,expect,it,vi} from 'vitest'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createModelCreateHandle,createModelCreateHost} from '@/lowcode/data-space/model-source/model/lowcode-data-space-model-create-session'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from './workflow-native-design.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
async function fixture(){
 const http=new ApiBackend();http.records={Base_DataModel:[{rowid:'M1',dataSetId:'W1',Name:'Orders',MetaName:'PhysicalOrders',Type:'数据库表',requestType:'query',Filter:''}],Base_DataModel_Field:[
  {rowid:'F1',dataSetId:'W1',dataModelId:'M1',Name:'id',AsName:'stable',type:'dataModel',FieldType:'varchar',IsPKey:1,IsOutput:1,ValueFun:''},
  {rowid:'C1',dataSetId:'W1',dataModelId:'M1',Name:'computed',AsName:'',type:'dataModel',FieldType:'计算字段',IsPKey:0,IsOutput:1,ValueFun:JSON.stringify({Type:'GetTableField',Field:'Orders.id'})}]}
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const config=JSON.parse(workflowDesignText) as {tables:Record<string,unknown>;viewCascades:unknown[];resourceRelations:unknown[]};config.tables=Object.fromEntries(['Base_DataModel','Base_DataModel_Field'].map(name=>[name,config.tables[name]]));config.viewCascades=[];config.resourceRelations=[]
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(WORKFLOW_DESIGN,JSON.stringify(config)),space:{dataSpaceId:WORKFLOW_DESIGN,name:'Design'},models:workflowDesignModels(),relations:[]}).dataSet
 const page=new PageRuntime({pageId:'formal-fork',scenarioIds:[WORKFLOW_DESIGN],loadScenario:async()=>ds});pages.push(page);await page.load()
 const models=ds.getView('Base_DataModel','modelCatalog')!.createQueryView('forkModels'),template=ds.getView('Base_DataModel_Field','modelInputFields')!.createQueryView('forkTemplate')
 for(const view of [models,template]){view.queryContext={...view.queryContext,dataSpaceId:'W1'};view.queryConfig={...view.queryConfig,fields:view.columns.map(column=>column.name).filter(name=>name!=='_pk'&&!name.startsWith('lingma_sys_')),allPages:true}}
 const fields=template.createQueryView('forkOriginalFields');fields.queryContext={dataSpaceId:'W1',modelIds:['M1']}
 await Promise.all([models.refresh(),fields.refresh()])
 const owner=createModelCreateHandle(createModelCreateHost({dataSet:ds,targetId:'W1',sources:undefined,views:{models:models.viewId,fields:template.viewId},lifecycle:{assertCurrent(){},onDispatch(){}}}))
 return{http,ds,models,fields,owner}
}
describe('formal query model fork through original creation owner',()=>{
 it('queries every copied field member on the new model view even when the template omitted that save column',async()=>{
  const f=await fixture(),template=f.ds.getView('Base_DataModel_Field','forkTemplate')!
  template.queryConfig={...template.queryConfig,fields:template.queryConfig.fields!.filter(name=>name!=='ValueFun')}
  const modelId=await f.owner.fork({modelId:'M1',name:'Fork',fields:f.fields})
  expect(f.http.records['Base_DataModel_Field']!.find(row=>row['dataModelId']===modelId&&row['Name']==='computed')?.['ValueFun']).toContain('Fork.id')
  expect(f.http.saves.map(save=>save.table)).toEqual(['Base_DataModel','Base_DataModel_Field'])
 })
 it('cancels a preparing fork by generation and refuses a concurrent fork before creating records',async()=>{
  const f=await fixture(),refresh=DataView.prototype.refresh
  let release=()=>{},entered=()=>{}
  const gate=new Promise<void>(resolve=>{release=resolve}),waiting=new Promise<void>(resolve=>{entered=resolve})
  vi.spyOn(DataView.prototype,'refresh').mockImplementation(async function(this:DataView,...args){const result=await refresh.apply(this,args);if(this===f.models){entered();await gate}return result})
  const pending=f.owner.fork({modelId:'M1',name:'Fork',fields:f.fields})
  await waiting
  await expect(f.owner.fork({modelId:'M1',name:'Second',fields:f.fields})).rejects.toThrow()
  f.owner.discard();release();await expect(pending).rejects.toThrow('已变化')
  expect(f.http.saves).toHaveLength(0)
 })
 it('rejects an incomplete readable projection rather than defaulting omitted business values',async()=>{
  const f=await fixture();f.fields.queryConfig={...f.fields.queryConfig,fields:f.fields.queryConfig.fields!.filter(name=>name!=='ValueFun')}
  await expect(f.owner.fork({modelId:'M1',name:'Fork',fields:f.fields})).rejects.toThrow('投影缺少')
  expect(f.http.saves).toHaveLength(0)
 })
 it('preserves a late edit to the original fields and dispatches no copied definitions',async()=>{
  const f=await fixture(),add=DataView.prototype.addRow
  vi.spyOn(DataView.prototype,'addRow').mockImplementation(async function(this:DataView,...args){const result=await add.apply(this,args);if(this===f.models)f.fields.updateEditingValue('F1','AsName','late-alias');return result})
  await expect(f.owner.fork({modelId:'M1',name:'Fork',fields:f.fields})).rejects.toThrow('查询已变化')
  expect(f.fields.getEditingRow('F1')?.['AsName']).toBe('late-alias');expect(f.http.saves).toHaveLength(0)
  expect(f.models.dirtyTracking.pendingCreateIds.size).toBe(0)
 })
 it('creates fresh model and field identities and rewrites only copied self references',async()=>{
  const f=await fixture(),original=structuredClone(f.http.records)
  const modelId=await f.owner.fork({modelId:'M1',name:'Fork',fields:f.fields})
  expect(modelId).not.toBe('M1');expect(f.owner.getState().fork).toMatchObject({sourceModelId:'M1',modelId,confirmed:true,fieldIds:[{from:'F1',to:expect.any(String)},{from:'C1',to:expect.any(String)}]})
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']==='M1')).toEqual(original['Base_DataModel']![0])
  expect(f.http.records['Base_DataModel_Field']!.filter(row=>row['dataModelId']==='M1')).toEqual(original['Base_DataModel_Field'])
  expect(f.http.records['Base_DataModel']!.find(row=>row['rowid']===modelId)).toMatchObject({Name:'Fork',requestType:'query',MetaName:'PhysicalOrders'})
  expect(f.http.records['Base_DataModel_Field']!.find(row=>row['dataModelId']===modelId&&row['Name']==='computed')?.['ValueFun']).toContain('Fork.id')
  expect(f.http.saves.map(save=>save.table)).toEqual(['Base_DataModel','Base_DataModel_Field'])
 })
 it('retains the original fork identity map across a lost receipt without repeating creation',async()=>{
  const f=await fixture();f.http.failAfterWrite=true
  await expect(f.owner.fork({modelId:'M1',name:'Fork',fields:f.fields})).rejects.toThrow()
  const captured=f.owner.getState().fork,writes=f.http.saves.length
  expect(captured?.modelId).toBeTruthy();expect(captured?.fieldIds).toHaveLength(2)
  await expect(f.owner.verify()).resolves.toMatchObject({confirmed:true,modelId:captured?.modelId})
  expect(f.http.saves).toHaveLength(writes);expect(f.owner.getState().fork).toMatchObject({...captured,confirmed:true})
 })
})
