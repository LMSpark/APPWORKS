import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataViewFilter,DataViewFilterCodec} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
import {openWorkflowNodeRemoval} from '@/lowcode/resources/structured-config/workflow-definition/node-removal'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from './workflow-native-design.fixture'

const pages:PageRuntime[]=[]
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
async function fixture(shared=true,layout:string|null=null){
 const http=new ApiBackend(),uploads:string[]=[]
 http.records={Base_WorkflowDefinition:[{rowid:'W1',name:'Current'}],Base_DataSet:[{rowid:'W1',Type:'workflow',inputParams:'[]'}],
  Base_DataModel:[{rowid:'M1',dataSetId:'W1',Name:'Orders',Filter:''},{rowid:'M2',dataSetId:'W1',Name:'Other',Filter:''}],
  Base_DataModel_Field:[{rowid:'F1',dataSetId:'W1',dataModelId:'M1',Name:'value',AsName:'',type:'dataModel',FieldType:'int',IsOutput:1,IsPKey:0,ValueFun:''},
   {rowid:'F2',dataSetId:'W1',dataModelId:'M2',Name:'request',AsName:'',type:'inputParams',FieldType:'varchar',IsOutput:0,IsPKey:0,ValueFun:''}],
  Base_WorkflowNodeDefinition:[{rowid:'START',workflow_id:'W1',position_type:0,node_type:'query',node_config:'',output_mapping:'[]'},
   {rowid:'A',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M1',input_mapping:'[]',config:'',output_mapping:'[]'},
   {rowid:'B',workflow_id:'W1',position_type:1,node_type:'query',node_config:shared?'M1':'M2',input_mapping:'[]',config:'',output_mapping:'[]'},
   {rowid:'END',workflow_id:'W1',position_type:2,node_type:'query',node_config:'',output_mapping:'[]'}],
  Base_WorkflowConnectors:[{rowid:'SA',workflow_id:'W1',sourceID:'START',targetID:'A',params:'[]'},{rowid:'AB',workflow_id:'W1',sourceID:'A',targetID:'B',params:'[]'},
   {rowid:'BE',workflow_id:'W1',sourceID:'B',targetID:'END',params:'[]'}],
  Base_DataModel_Relation:[{rowid:'CONDITION',dataSetId:'W1',parentModId:'A',childModId:'B',filter:DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'value',operator:'eq',value:1}))}]}
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const file={text:layout,loseReceipt:false,rejectBeforeWrite:false}
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(WORKFLOW_DESIGN,workflowDesignText),space:{dataSpaceId:WORKFLOW_DESIGN,name:'Design'},models:workflowDesignModels(),relations:[],
  fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{readTextFile:async()=>{if(file.text===null)throw new LowcodeApiError(404,'missing');return file.text}},fileUpload:{uploadWorkingText:async input=>{if(file.rejectBeforeWrite){file.rejectBeforeWrite=false;throw Error('layout unavailable')}file.text=input.text;uploads.push(input.text);if(file.loseReceipt){file.loseReceipt=false;throw Error('layout response lost')}return{}}},assertCurrent(){}})}}).dataSet
 const page=new PageRuntime({pageId:'workflow-remove',scenarioIds:[WORKFLOW_DESIGN],scenarioInputs:{[WORKFLOW_DESIGN]:{workflowId:'W1'}},loadScenario:async()=>ds});pages.push(page);await page.load()
 await Promise.all(['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors'].map(name=>ds.getView(name)!.refresh()))
 return{ds,http,file,uploads,open:()=>openWorkflowNodeRemoval({dataSet:ds,workflowId:'W1',nodeId:'A',assertCurrent(){}})}
}
describe('original workflow node removal',()=>{
 it('retains a partially applied scope for diagnosis without upgrading it to complete or replaying deletes',async()=>{
  const f=await fixture(),owner=await f.open();await owner.stage()
  vi.spyOn(f.ds,'saveChanges').mockImplementationOnce(()=>{
   f.http.records['Base_WorkflowNodeDefinition']=f.http.records['Base_WorkflowNodeDefinition']!.filter(row=>row['rowid']!=='A')
   return Promise.resolve({success:false,message:'partial rejection'} as Awaited<ReturnType<typeof f.ds.saveChanges>>)
  })
  await expect(owner.save()).rejects.toThrow('partial rejection')
  await expect(owner.verify(true)).rejects.toThrow('精确保留范围不同')
  expect(owner.getState()).toMatchObject({status:'database',databaseConfirmed:false,summary:{nodeId:'A'}})
  expect(()=>owner.cancel()).toThrow('已派发');expect(f.http.saves).toHaveLength(0)
 })
 it('verifies a lost database receipt without repeating the deletion request',async()=>{
  const f=await fixture(),owner=await f.open();await owner.stage();f.http.failAfterWrite=true
  await expect(owner.save()).rejects.toThrow();const writes=f.http.saves.length
  await owner.verify();expect(owner.getState().status).toBe('complete');expect(f.http.saves).toHaveLength(writes)
 })
 it('checks JoinFilter references in a retained shared model',async()=>{
  const f=await fixture();f.http.records['Base_DataModel']![0]!['JoinFilter']=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'value',operator:'eq',value:{Type:'GetInputParam',ParamName:'A.value'}}))
  await expect(f.open()).rejects.toThrow('JoinFilter');expect(f.http.saves).toHaveLength(0)
 })
 it('retries only the layout after independently proving that its original upload did not apply',async()=>{
  const f=await fixture(true,JSON.stringify({nodes:[{id:'A',x:1,y:2}],edges:[]})),owner=await f.open();await owner.stage();f.file.rejectBeforeWrite=true
  await expect(owner.save()).rejects.toThrow();const writes=f.http.saves.length
  await expect(owner.verify()).rejects.toThrow('未生效')
  if(!owner.getState().canRetryLayout)await expect(owner.verify(true)).rejects.toThrow('未生效')
  expect(owner.getState().canRetryLayout).toBe(true)
  await owner.retryLayout();expect(owner.getState().status).toBe('complete');expect(f.http.saves).toHaveLength(writes);expect(f.uploads).toHaveLength(1)
 })
 it('checks indirect lost ancestors through consumers of a surviving model relation',async()=>{
  const f=await fixture(false)
  f.http.records['Base_DataModel_Relation']!.push({rowid:'SURVIVING_MODEL_RELATION',dataSetId:'W1',parentModId:'M2',childModId:'M2',filter:DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'request',operator:'eq',value:{Type:'GetInputParam',ParamName:'START.rowid'}}))})
  await expect(f.open()).rejects.toThrow('SURVIVING_MODEL_RELATION')
  expect(f.http.saves).toHaveLength(0)
 })
 it('allows explicit readback after an invalid rejection receipt and cancels only when the original database scope is unchanged',async()=>{
  const f=await fixture(),owner=await f.open();await owner.stage()
  vi.spyOn(f.ds,'saveChanges').mockResolvedValueOnce({success:false,message:'known rejection'} as Awaited<ReturnType<typeof f.ds.saveChanges>>)
  await expect(owner.save()).rejects.toThrow('known rejection')
  await expect(owner.verify()).rejects.toThrow('明确选择')
  await expect(owner.verify(true)).rejects.toThrow('未生效')
  expect(owner.getState().status).toBe('not-applied');expect(f.http.saves).toHaveLength(0)
  owner.cancel();expect(owner.getState().status).toBe('cancelled')
 })
 it('checks references in retained shared-model relations',async()=>{
  const f=await fixture()
  f.http.records['Base_DataModel_Relation']!.push({rowid:'SHARED_RELATION',dataSetId:'W1',parentModId:'M1',childModId:'M2',filter:DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'value',operator:'eq',value:{Type:'GetInputParam',ParamName:'A.rowid'}}))})
  await expect(f.open()).rejects.toThrow('SHARED_RELATION')
  expect(f.http.saves).toHaveLength(0)
 })
 it('requires independent readback of retained shared model fields',async()=>{
  const f=await fixture(),owner=await f.open();await owner.stage()
  f.http.beforeSave=()=>{f.http.records['Base_DataModel_Field']![0]!['AsName']='unexpected';return Promise.resolve()}
  await expect(owner.save()).rejects.toThrow('Base_DataModel_Field')
  expect(owner.getState().status).not.toBe('complete')
 })
 it('stages and cancels the exact node, edges and condition without changing a shared model',async()=>{
  const f=await fixture(),owner=await f.open()
  expect(owner.getState().summary).toMatchObject({nodeId:'A',modelId:'M1',deleteModel:false,edgeCount:2,conditionCount:1,fieldCount:0})
  await owner.stage();expect(owner.getState().status).toBe('staged')
  expect(f.http.records['Base_WorkflowNodeDefinition']).toHaveLength(4);expect(f.http.saves).toHaveLength(0)
  owner.cancel();expect(owner.getState().status).toBe('cancelled')
  expect(f.ds.getTable('Base_WorkflowNodeDefinition')!.viewList.every(view=>!view.dirtyTracking.hasPendingChanges())).toBe(true)
 })
 it('deletes a shared consumer and its incident graph records while preserving the remaining model consumer',async()=>{
  const f=await fixture(),owner=await f.open();await owner.stage();await owner.save()
  expect(owner.getState().status).toBe('complete')
  expect(f.http.records['Base_WorkflowNodeDefinition']!.map(row=>row['rowid'])).toEqual(['START','B','END'])
  expect(f.http.records['Base_WorkflowConnectors']!.map(row=>row['rowid'])).toEqual(['BE'])
  expect(f.http.records['Base_DataModel_Relation']).toEqual([])
  expect(f.http.records['Base_DataModel']!.map(row=>row['rowid'])).toEqual(['M1','M2'])
  expect(f.http.records['Base_DataModel_Field']).toHaveLength(2);expect(f.uploads).toHaveLength(0)
 })
 it('deletes the exclusive model, all its fields and model relations along the same DataSet',async()=>{
  const f=await fixture(false)
  f.http.records['Base_DataModel_Relation']!.push({rowid:'MODEL_RELATION',dataSetId:'W1',parentModId:'M1',childModId:'M2',filter:''})
  const owner=await f.open();expect(owner.getState().summary).toMatchObject({deleteModel:true,fieldCount:1,modelRelationCount:1})
  await owner.stage();await owner.save()
  expect(f.http.records['Base_DataModel']!.map(row=>row['rowid'])).toEqual(['M2'])
  expect(f.http.records['Base_DataModel_Field']!.map(row=>row['rowid'])).toEqual(['F2'])
  expect(f.http.records['Base_DataModel_Relation']).toEqual([])
 })
 it('does not treat an expression inside a simultaneously deleted node condition as a surviving model dependency',async()=>{
  const f=await fixture(false)
  f.http.records['Base_DataModel_Relation']![0]!['filter']=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'value',operator:'eq',value:{Type:'GetExpData',Exp:'opaque'}}))
  const owner=await f.open();await owner.stage();await owner.save()
  expect(owner.getState().status).toBe('complete');expect(f.http.records['Base_DataModel_Relation']).toEqual([])
 })
 it('keeps a model used by an existing CRUD node through dataOperateModId',async()=>{
  const f=await fixture(false)
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']![2]!,{node_type:'add',node_config:'',dataOperateModId:'M1'})
  const owner=await f.open();expect(owner.getState().summary?.deleteModel).toBe(false)
  await owner.stage();await owner.save();expect(f.http.records['Base_DataModel']!.some(row=>row['rowid']==='M1')).toBe(true)
  expect(f.http.records['Base_DataModel_Field']!.some(row=>row['rowid']==='F1')).toBe(true)
 })
 it('rejects current delete permission loss before staging and preserves unrelated late edits when cancelling its own deletion',async()=>{
  const f=await fixture(),owner=await f.open();f.http.denyDelete.add('Base_WorkflowConnectors')
  await expect(owner.stage()).rejects.toThrow('不允许删除');expect(f.http.saves).toHaveLength(0);owner.cancel()
  f.http.denyDelete.clear();const next=await f.open();await next.stage()
  const original=f.ds.getView('Base_WorkflowNodeDefinition')!;original.updateEditingValue('B','name','keep-late')
  await expect(next.save()).rejects.toThrow('其他草稿');next.cancel()
  expect(original.getEditingRow('B')?.['name']).toBe('keep-late');expect(f.http.saves).toHaveLength(0)
 })
 it('rejects indirect loss of an ancestor input and succeeds after an explicit surviving path is saved',async()=>{
  const f=await fixture(false)
  f.http.records['Base_DataModel_Field']![1]!['ValueFun']=JSON.stringify({Type:'GetInputParam',ParamName:'START.rowid'})
  await expect(f.open()).rejects.toThrow('F2')
  expect(f.http.saves).toHaveLength(0)
  f.http.records['Base_WorkflowConnectors']!.push({rowid:'SB',workflow_id:'W1',sourceID:'START',targetID:'B',params:'[]'})
  await f.ds.getView('Base_WorkflowConnectors')!.refresh()
  const owner=await f.open();await owner.stage();await owner.save()
  expect(f.http.records['Base_WorkflowConnectors']!.map(row=>row['rowid'])).toEqual(['BE','SB'])
  expect(f.http.records['Base_DataModel_Field']![0]?.['ValueFun']).toContain('START.rowid')
 })
 it('cleans only captured layout identities after database confirmation and recovers an unknown file result without replaying database deletes',async()=>{
  const source=JSON.stringify({keep:{future:true},nodes:[{id:'A',x:1,y:2},{id:'B',x:3,y:4,custom:0}],edges:[{id:'AB'},{id:'HISTORIC',sourceNodeId:'A',custom:'keep'}]})
  const f=await fixture(true,source),owner=await f.open();await owner.stage();f.file.loseReceipt=true
  await expect(owner.save()).rejects.toThrow()
  expect(owner.getState().status).toBe('layout')
  const writes=f.http.saves.length;await owner.verify()
  expect(owner.getState().status).toBe('complete');expect(f.http.saves).toHaveLength(writes);expect(f.uploads).toHaveLength(1)
  expect(JSON.parse(f.file.text!)).toEqual({keep:{future:true},nodes:[{id:'B',x:3,y:4,custom:0}],edges:[{id:'HISTORIC',sourceNodeId:'A',custom:'keep'}]})
 })
})
