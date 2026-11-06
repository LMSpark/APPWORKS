import {afterEach,describe,expect,it,vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {openWorkflowQuerySourceNodeCommit} from '@/lowcode/resources/structured-config/workflow-definition/query-source-node-commit'
import {workflowSourceEditFixture} from './workflow-source-edit.fixture'
import {LowcodeDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'
const pages:PageRuntime[]=[]
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
const output=[{rowid:'ITEMS',pid:null,Name:'items',FieldType:'Array',isParent:true,keep:{future:true}},{rowid:'COUNT',pid:null,Name:'Count',FieldType:'int',isParent:false},
 {rowid:'F',pid:'ITEMS',Name:'code',Description:'编码',FieldType:'varchar',isParent:false,custom:'keep'}]
async function fixture(){
 const f=await workflowSourceEditFixture(pages),record=f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!
 Object.assign(record,{name:'keep-name',description:'keep-description',input_mapping:'[]',config:'{"PageParam":{"index":1,"size":1}}',output_mapping:JSON.stringify(output)});await f.nodes.refresh()
 const before=f.nodes.readSnapshot().rows.find(row=>row['rowid']==='QUERY')!,fields=f.ds.getView('Base_DataModel_Field')!.readSnapshot().rows
 const expectedSource={model:f.projection.models.readSnapshot().rows.find(row=>row['rowid']==='FORK')!,fields:f.projection.fields.readSnapshot().rows}
 const input={dataSet:f.ds,workflowId:'W',nodeId:'QUERY',fromModelId:'MODEL',modelId:'FORK',expectedSource,nodeBefore:before,fieldsBefore:fields,fieldIds:[{from:'F',to:'FF'}],removedIds:[] as string[],assertCurrent(){}}
 return{...f,before,input,open:()=>openWorkflowQuerySourceNodeCommit(input)}
}
describe('workflow source confirmed node commit',()=>{
 it('accepts the same confirmed field set returned in a different server order during dispatch and readback',async()=>{
  const f=await fixture()
  f.http.records['Base_DataModel_Field']!.push({...f.http.records['Base_DataModel_Field']![1]!,rowid:'FFX',Name:'spare',IsOutput:0})
  await f.projection.fields.refresh()
  const expectedSource={...f.input.expectedSource,fields:f.projection.fields.readSnapshot().rows}
  let reads=0
  f.http.interceptors.response.use({onResponse:response=>{
   const body=response.data as {Result?:{data?:{Items?:Array<Record<string,unknown>>}}},rows=body.Result?.data?.Items
   if(rows?.length===2&&rows.every(row=>row['dataModelId']==='FORK')&&++reads%2===0)rows.reverse()
   return response
  }})
  const owner=openWorkflowQuerySourceNodeCommit({...f.input,expectedSource})
  await owner.complete();expect(owner.getState().complete).toBe(true);expect(f.http.saves).toHaveLength(1)
 })
 it.each(['add','edit','delete'] as const)('commits the %s target and formal flat output together while preserving unrelated fields',async operation=>{
  const f=await fixture(),node=f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!
  Object.assign(node,{node_type:operation,dataOperateModId:'MODEL',node_config:'keep-unrelated-config',output_mapping:'[]'})
  Object.assign(f.http.records['Base_DataModel']!.find(row=>row['rowid']==='FORK')!,{requestType:operation,DbId:'DB',DbName:'database',MetaName:'Target'})
  for(const field of f.http.records['Base_DataModel_Field']!)Object.assign(field,{type:'inputParams',IsOutput:0,IsPKey:1})
  vi.spyOn(LowcodeDataSpaceModelSourceReader,'readTableTarget').mockResolvedValue({source:{type:'table',id:'TABLE',dbid:'DB',databaseName:'database',name:'Target',description:'',providerId:''},fields:[{type:'dataModel',Name:'isolated',FieldType:'varchar',IsPKey:1,IsOutput:1,AsName:'',ValueFun:'',description:'',Expression:'',allowAIAdd:0,OrderType:'',Order:0,Group:0}]})
  await Promise.all([f.nodes.refresh(),f.projection.models.refresh(),f.projection.fields.refresh()]);const before=f.nodes.readSnapshot().rows.find(row=>row['rowid']==='QUERY')!
  const expectedSource={model:f.projection.models.readSnapshot().rows.find(row=>row['rowid']==='FORK')!,fields:f.projection.fields.readSnapshot().rows}
  const owner=openWorkflowQuerySourceNodeCommit({...f.input,operation,nodeBefore:before,expectedSource,fieldsBefore:f.input.fieldsBefore.map(row=>({...row,type:'inputParams',IsOutput:0,IsPKey:1}))})
  await owner.complete();await owner.complete()
  expect(owner.getState().complete).toBe(true)
  expect(f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')).toMatchObject({node_type:operation,dataOperateModId:'FORK',node_config:'keep-unrelated-config',output_mapping:JSON.stringify([{rowid:'FF',pid:null,Name:'isolated',Description:'隔离字段',FieldType:'varchar',isParent:false}]),name:'keep-name',config:'{"PageParam":{"index":1,"size":1}}'})
  expect(f.http.saves.map(save=>save.table)).toEqual(['Base_WorkflowNodeDefinition'])
 })
 it('performs no write when the confirmed source and existing output need no node delta',async()=>{
  const f=await fixture(),owner=openWorkflowQuerySourceNodeCommit({...f.input,modelId:'MODEL',fieldIds:[],expectedSource:{model:f.ds.getView('Base_DataModel')!.readSnapshot().rows.find(row=>row['rowid']==='MODEL')!,fields:f.input.fieldsBefore}})
  await owner.complete();expect(owner.getState().complete).toBe(true);expect(f.http.saves).toHaveLength(0)
 })
 it('preserves edits made after dispatch and discards them only through the explicit original-batch recovery action',async()=>{
  const f=await fixture(),owner=f.open()
  f.http.beforeSave=()=>{f.nodes.updateEditingValue('QUERY','name','later-name');return Promise.resolve()}
  await expect(owner.complete()).rejects.toThrow('后续修改');expect(f.nodes.getEditingRow('QUERY')?.['name']).toBe('later-name')
  const writes=f.http.saves.length;await owner.discardLocalChangesAndVerify()
  expect(owner.getState().complete).toBe(true);expect(f.nodes.hasEditingChanges('QUERY')).toBe(false);expect(f.http.saves).toHaveLength(writes)
 })
 it('uses fresh confirmed fields after sibling invalidation and switches only the original node binding and output identities',async()=>{
  const f=await fixture(),owner=f.open();f.ds.getView('Base_DataModel_Field')!.clearAll();f.projection.fields.clearAll()
  await owner.complete()
  const saved=f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!
  expect(saved).toMatchObject({node_config:'FORK',name:'keep-name',description:'keep-description',input_mapping:'[]',config:f.before['config']})
  expect(JSON.parse(String(saved['output_mapping']))).toEqual([output[0],output[1],{...output[2],rowid:'FF',Description:'隔离字段'}])
  expect(f.http.saves).toHaveLength(1);expect(f.http.saves[0]).toMatchObject({table:'Base_WorkflowNodeDefinition',changed:[{rowid:'QUERY',node_config:'FORK',output_mapping:expect.any(String)}]})
  const writes=f.http.saves.length;await owner.complete();expect(f.http.saves).toHaveLength(writes);expect(owner.getState().complete).toBe(true)
 })
 it('does not repeat node or model writes after a lost node receipt',async()=>{
  const f=await fixture(),owner=f.open();f.http.failAfterWrite=true
  await expect(owner.complete()).rejects.toThrow();expect(owner.getState().complete).toBe(false)
  const writes=f.http.saves.length;await owner.verify();expect(owner.getState().complete).toBe(true);expect(f.http.saves).toHaveLength(writes)
 })
 it('proves an invalid rejection not applied by explicit read and resubmits only the same node when explicitly requested',async()=>{
  const f=await fixture(),owner=f.open();vi.spyOn(f.ds,'saveChanges').mockResolvedValueOnce({success:false,message:'rejected'} as Awaited<ReturnType<typeof f.ds.saveChanges>>)
  await expect(owner.complete()).rejects.toThrow('rejected');await expect(owner.verify()).rejects.toThrow('明确选择')
  await expect(owner.verify(true)).rejects.toThrow('未生效');expect(owner.getState().notApplied).toBe(true);expect(f.http.saves).toHaveLength(0)
  f.nodes.updateEditingValue('QUERY','name','later-name');await expect(owner.resubmitNotApplied()).rejects.toThrow('新修改');expect(f.nodes.getEditingRow('QUERY')?.['name']).toBe('later-name');f.nodes.discardPendingChanges(['QUERY'])
  await owner.resubmitNotApplied();expect(owner.getState().complete).toBe(true);expect(f.http.saves.map(save=>save.table)).toEqual(['Base_WorkflowNodeDefinition'])
 })
 it('preserves an independent target edit and sends no node writes',async()=>{
  const f=await fixture(),owner=f.open();f.nodes.updateEditingValue('QUERY','name','late-name')
  await expect(owner.complete()).rejects.toThrow('修改');expect(f.nodes.getEditingRow('QUERY')?.['name']).toBe('late-name');expect(f.http.saves).toHaveLength(0)
 })
 it('does not discard a later edit when adopting the formal result after an invalid rejected receipt',async()=>{
  const f=await fixture(),owner=f.open();vi.spyOn(f.ds,'saveChanges').mockResolvedValueOnce({success:false,message:'rejected'} as Awaited<ReturnType<typeof f.ds.saveChanges>>)
  await expect(owner.complete()).rejects.toThrow('rejected');f.nodes.updateEditingValue('QUERY','name','later-name')
  await expect(owner.verify(true)).rejects.toThrow('后续修改');expect(f.nodes.getEditingRow('QUERY')?.['name']).toBe('later-name');expect(f.http.saves).toHaveLength(0)
  await expect(owner.discardLocalChangesAndVerify()).rejects.toThrow('未生效');expect(owner.getState().notApplied).toBe(true);expect(f.nodes.hasEditingChanges('QUERY')).toBe(false);expect(f.http.saves).toHaveLength(0)
 })
})
