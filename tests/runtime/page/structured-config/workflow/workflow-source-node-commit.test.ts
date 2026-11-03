import {afterEach,describe,expect,it,vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {openWorkflowQuerySourceNodeCommit} from '@/lowcode/resources/structured-config/workflow-definition/query-source-node-commit'
import {workflowSourceEditFixture} from './workflow-source-edit.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
const output=[{rowid:'ITEMS',pid:null,Name:'items',FieldType:'Array',isParent:true,keep:{future:true}},{rowid:'COUNT',pid:null,Name:'Count',FieldType:'int',isParent:false},
 {rowid:'F',pid:'ITEMS',Name:'code',Description:'编码',FieldType:'varchar',isParent:false,custom:'keep'}]
async function fixture(){
 const f=await workflowSourceEditFixture(pages),record=f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!
 Object.assign(record,{name:'keep-name',description:'keep-description',input_mapping:'[]',config:'{"PageParam":{"index":1,"size":1}}',output_mapping:JSON.stringify(output)});await f.nodes.refresh()
 const before=f.nodes.readSnapshot().rows.find(row=>row['rowid']==='QUERY')!,fields=f.ds.getView('Base_DataModel_Field')!.readSnapshot().rows
 const input={dataSet:f.ds,workflowId:'W',nodeId:'QUERY',fromModelId:'MODEL',modelId:'FORK',nodeBefore:before,fieldsBefore:fields,fieldIds:[{from:'F',to:'FF'}],removedIds:[] as string[],assertCurrent(){}}
 return{...f,before,input,open:()=>openWorkflowQuerySourceNodeCommit(input)}
}
describe('workflow source confirmed node commit',()=>{
 it('performs no write when the confirmed source and existing output need no node delta',async()=>{
  const f=await fixture(),owner=openWorkflowQuerySourceNodeCommit({...f.input,modelId:'MODEL',fieldIds:[]})
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
