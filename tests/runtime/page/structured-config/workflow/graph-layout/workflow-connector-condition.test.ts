import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {DataViewFilter,DataViewFilterCodec} from '@spark-appworks/spark-data'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout/layout-resource'
import {WorkflowConnectorCondition} from '@/lowcode/resources/structured-config/workflow-definition/connector-condition'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText,workflowDesignCommandBindings} from '../workflow-native-design.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
const filter=DataViewFilterCodec.serializeStored(DataViewFilter.group({logic:'or',filters:[{field:'Count',operator:'eq',value:0},{field:'Count',operator:'eq',value:false},{field:'Count',operator:'eq',value:''}]}))
async function fixture(){
 const http=new ApiBackend()
 http.records={Base_WorkflowDefinition:[{rowid:'W1'}],Base_WorkflowNodeDefinition:[{rowid:'N1',workflow_id:'W1',position_type:0,node_type:'query',name:'来源',output_mapping:JSON.stringify([{rowid:'P1',Name:'Count',Description:'数量',FieldType:'int'}])},{rowid:'N2',workflow_id:'W1',name:'目标'},{rowid:'NX',workflow_id:'W2',name:'其他'}],Base_WorkflowConnectors:[{rowid:'E1',workflow_id:'W1',sourceID:'N1',targetID:'N2'},{rowid:'E2',workflow_id:'W2',sourceID:'NX',targetID:'NX'}],Base_DataModel_Relation:[{rowid:'RM',dataSetId:'W1',parentModId:'M1',childModId:'M2',filter:'原模型关系'},{rowid:'RO',dataSetId:'W1',parentModId:'N2',childModId:'N1',filter:'反向条件'},{rowid:'RW2',dataSetId:'W2',parentModId:'N1',childModId:'N2',filter:'其他流程旧条件'}]}
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(WORKFLOW_DESIGN,workflowDesignText),...workflowDesignCommandBindings(workflowDesignText,http),space:{dataSpaceId:WORKFLOW_DESIGN,name:'工作流设计'},models:workflowDesignModels(),relations:[],fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{removeFile:async()=>{throw Error('unexpected layout delete')},readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>{throw Error('unexpected upload')}},assertCurrent:()=>{}})}}).dataSet
 const page=new PageRuntime({pageId:'condition-test',scenarioIds:[WORKFLOW_DESIGN],scenarioInputs:{[WORKFLOW_DESIGN]:{workflowId:'W1'}},loadScenario:async()=>ds});pages.push(page);await page.load()
 for(const name of ['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors'])await ds.getView(name)!.refresh()
 return{http,ds}
}
describe('workflow connector condition',()=>{
 it('uses published EDIT leaves through the original condition view, including native zero, cancel and reopen',async()=>{
  const f=await fixture(),output=[{rowid:'D',Name:'description',Description:'说明',FieldType:'varchar',pid:null,isParent:false},{rowid:'Z',Name:'flowstate',Description:'流程状态',FieldType:'int',pid:null,isParent:false}]
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']![0]!,{position_type:1,node_type:'edit',output_mapping:JSON.stringify(output)})
  await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()
  const view=await WorkflowConnectorCondition.load(f.ds,'W1','E1'),baseline=structuredClone(f.http.records['Base_DataModel_Relation'])
  expect(WorkflowConnectorCondition.columns(f.ds,'W1','E1')).toEqual([{name:'description',label:'说明',type:'varchar'},{name:'flowstate',label:'流程状态',type:'int'}])
  const row=await WorkflowConnectorCondition.add(f.ds,'W1','E1'),id=view.getPkKey(row)!,value=DataViewFilterCodec.serializeStored(DataViewFilter.group({logic:'and',filters:[{field:'description',operator:'eq',value:'case marker'},{field:'flowstate',operator:'eq',value:0}]}))
  view.updateEditingValue(id,'filter',value);view.discardEditingRows();view.discardPendingChanges()
  expect(f.http.saves).toEqual([]);expect(view.rows).toEqual([])
  const next=await WorkflowConnectorCondition.add(f.ds,'W1','E1'),nextId=view.getPkKey(next)!
  view.updateEditingValue(nextId,'filter',value);expect((await WorkflowConnectorCondition.save(f.ds,'W1','E1')).success).toBe(true)
  expect(f.http.saves.map(save=>save.table)).toEqual(['Base_DataModel_Relation'])
  const reopened=await WorkflowConnectorCondition.load(f.ds,'W1','E1')
  expect(reopened.rows).toHaveLength(1);expect(reopened.rows[0]).toMatchObject({rowid:nextId,parentModId:'N1',childModId:'N2',filter:value})
  reopened.updateEditingValue(nextId,'filter','');reopened.discardEditingRows()
  expect(reopened.getEditingRow(nextId)?.['filter']).toBe(value);expect(f.http.saves).toHaveLength(1)
  expect(f.http.records['Base_DataModel_Relation']!.slice(0,3)).toEqual(baseline)
  expect(f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']).toBe(JSON.stringify(output))
 })
 it.each(['add','delete'])('uses verified %s output leaves through the original condition view',async kind=>{
  const f=await fixture(),output=[{rowid:'P',Name:'rowid',Description:'主键',FieldType:'varchar',pid:null,isParent:false}]
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']![0]!,{position_type:1,node_type:kind,output_mapping:JSON.stringify(output)})
  await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()
  const view=await WorkflowConnectorCondition.load(f.ds,'W1','E1'),baseline=structuredClone(f.http.records['Base_DataModel_Relation'])
  expect(WorkflowConnectorCondition.columns(f.ds,'W1','E1')).toEqual([{name:'rowid',label:'主键',type:'varchar'}])
  const value=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'rowid',operator:'eq',value:'owned-target'}))
  const draft=await WorkflowConnectorCondition.add(f.ds,'W1','E1');view.updateEditingValue(view.getPkKey(draft)!,'filter',value)
  view.discardEditingRows();view.discardPendingChanges();expect(view.rows).toEqual([]);expect(f.http.saves).toEqual([])
  const row=await WorkflowConnectorCondition.add(f.ds,'W1','E1'),id=view.getPkKey(row)!;view.updateEditingValue(id,'filter',value)
  expect((await WorkflowConnectorCondition.save(f.ds,'W1','E1')).success).toBe(true)
  const reopened=await WorkflowConnectorCondition.load(f.ds,'W1','E1')
  expect(reopened.rows).toHaveLength(1);expect(reopened.rows[0]).toMatchObject({rowid:id,parentModId:'N1',childModId:'N2',filter:value})
  expect(f.http.saves.map(save=>save.table)).toEqual(['Base_DataModel_Relation'])
  expect(f.http.records['Base_DataModel_Relation']!.slice(0,3)).toEqual(baseline)
  expect(f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']).toBe(JSON.stringify(output))
 })
 it.each([
  {field:'Count',operator:'in' as const,value:[0,1]},
  {field:'Count',operator:'eq' as const,value:{Type:'GetInputParam',ParamName:'N1.Count'}},
  {field:'items',operator:'eq' as const,value:0},
  {field:'Count',operator:'is-null' as const},
  {field:'Count',operator:'is-not-null' as const},
 ])('refuses unsupported new condition semantics without writing or discarding the draft: %j',async tree=>{
  const f=await fixture(),view=await WorkflowConnectorCondition.load(f.ds,'W1','E1'),row=await WorkflowConnectorCondition.add(f.ds,'W1','E1'),id=view.getPkKey(row)!
  const value=DataViewFilterCodec.serializeStored(DataViewFilter.condition(tree));view.updateEditingValue(id,'filter',value)
  await expect(WorkflowConnectorCondition.save(f.ds,'W1','E1')).rejects.toThrow()
  expect(view.getEditingRow(id)?.['filter']).toBe(value);expect(f.http.saves).toEqual([])
 })
 it('preserves an unchanged legacy condition whose runtime operator has not been verified',async()=>{
  const f=await fixture(),legacy=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'Count',operator:'in',value:[0,1]}))
  f.http.records['Base_DataModel_Relation']!.push({rowid:'RC',dataSetId:'W1',parentModId:'N1',childModId:'N2',filter:legacy})
  await WorkflowConnectorCondition.load(f.ds,'W1','E1');await WorkflowConnectorCondition.save(f.ds,'W1','E1')
  expect(f.http.records['Base_DataModel_Relation']!.find(row=>row['rowid']==='RC')?.['filter']).toBe(legacy);expect(f.http.saves).toEqual([])
 })
 it('uses only actual flat query leaves for connector conditions and keeps the stored output roots intact',async()=>{
  const f=await fixture(),output=[
   {rowid:'I',pid:null,Name:'items',FieldType:'Array',isParent:true},
   {rowid:'C',pid:null,Name:'Count',FieldType:'int',isParent:false},
   {rowid:'F',pid:'I',Name:'resultAlias',Description:'真实结果',FieldType:'varchar',isParent:false},
  ]
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']![0]!,{node_type:'query',position_type:1,output_mapping:JSON.stringify(output)})
  await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh();await WorkflowConnectorCondition.load(f.ds,'W1','E1')
  expect(WorkflowConnectorCondition.columns(f.ds,'W1','E1')).toEqual([{name:'resultAlias',label:'真实结果',type:'varchar'}])
  expect(f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']).toBe(JSON.stringify(output))
  expect(f.http.saves).toEqual([])
 })
 it('preserves existing conditions while diagnosing hierarchical output instead of inventing field paths',async()=>{
  const f=await fixture();f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']=JSON.stringify([{rowid:'C',pid:null,Name:'Count'},{rowid:'I',pid:null,Name:'items',isParent:true},{rowid:'IC',pid:'I',Name:'Count'}])
  f.http.records['Base_DataModel_Relation']!.push({rowid:'RC',dataSetId:'W1',parentModId:'N1',childModId:'N2',filter})
  await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh();await WorkflowConnectorCondition.load(f.ds,'W1','E1')
  const state=WorkflowConnectorCondition.presentation(f.ds,'W1','E1')
  expect(state.row?.['filter']).toBe(filter);expect(state.outputError).toContain('层次');expect(state.columns).toEqual([])
  expect(f.http.saves).toEqual([])
 })
 it.each(['retry','cancel'])('retains a definitely rejected deletion for %s without creating another condition',async action=>{
  const f=await fixture();f.http.records['Base_DataModel_Relation']!.push({rowid:'RC',dataSetId:'W1',parentModId:'N1',childModId:'N2',filter})
  const view=await WorkflowConnectorCondition.load(f.ds,'W1','E1')
  vi.spyOn(f.ds,'saveChanges').mockResolvedValueOnce({success:false,message:'明确拒绝'})
  view.updateEditingValue('RC','filter','')
  expect((await WorkflowConnectorCondition.save(f.ds,'W1','E1')).success).toBe(false)
  expect(view.dirtyTracking.pendingDeleteIds.has('RC')).toBe(true)
  await expect(WorkflowConnectorCondition.add(f.ds,'W1','E1')).rejects.toThrow()
  if(action==='cancel'){
   view.discardPendingChanges();expect(view.rows[0]?.['filter']).toBe(filter);expect(f.http.saves).toEqual([])
  }else{
   expect((await WorkflowConnectorCondition.save(f.ds,'W1','E1')).success).toBe(true)
   expect(f.http.saves).toHaveLength(1);expect(f.http.saves[0]?.deleted).toEqual([expect.objectContaining({rowid:'RC'})])
  }
 })
 it('queries node endpoints separately from model relationships and preserves complete condition values',async()=>{
  const f=await fixture(),view=await WorkflowConnectorCondition.load(f.ds,'W1','E1')
  expect(view.rows).toEqual([])
  expect(WorkflowConnectorCondition.columns(f.ds,'W1','E1')).toEqual([{name:'Count',label:'数量',type:'int'}])
  const baseline=structuredClone(f.http.records['Base_DataModel_Relation'])
  const row=await WorkflowConnectorCondition.add(f.ds,'W1','E1'),id=view.getPkKey(row)!
  expect(row).toMatchObject({dataSetId:'W1',parentModId:'N1',childModId:'N2',parentTable:'来源',childTable:'目标'})
  view.updateEditingValue(id,'filter',filter)
  expect((await WorkflowConnectorCondition.save(f.ds,'W1','E1')).success).toBe(true)
  expect(f.http.saves.map(save=>save.table)).toEqual(['Base_DataModel_Relation'])
  expect(f.http.records['Base_DataModel_Relation']!.slice(0,3)).toEqual(baseline)
  const reopened=await WorkflowConnectorCondition.load(f.ds,'W1','E1')
  expect(reopened.rows[0]?.['filter']).toBe(filter)
  reopened.updateEditingValue(id,'filter','')
  const cleared=await WorkflowConnectorCondition.save(f.ds,'W1','E1')
  expect(cleared.success,JSON.stringify(cleared)).toBe(true)
  expect(f.http.saves[1]?.deleted).toEqual([expect.objectContaining({rowid:id})])
  expect(f.http.records['Base_WorkflowConnectors']).toHaveLength(2)
  expect(f.http.records['Base_DataModel_Relation']).toEqual(baseline)
 })
 it('cancels a new condition and saves an empty new draft without any backend write',async()=>{
  const f=await fixture(),view=await WorkflowConnectorCondition.load(f.ds,'W1','E1')
  await WorkflowConnectorCondition.add(f.ds,'W1','E1');view.discardPendingChanges();expect(view.rows).toEqual([])
  await WorkflowConnectorCondition.add(f.ds,'W1','E1')
  expect((await WorkflowConnectorCondition.save(f.ds,'W1','E1')).success).toBe(true)
  expect(f.http.saves).toEqual([]);expect(view.rows).toEqual([])
 })
 it('rejects duplicate endpoint conditions instead of picking the first',async()=>{
  const f=await fixture();f.http.records['Base_DataModel_Relation']!.push(...['A','B'].map(rowid=>({rowid,dataSetId:'W1',parentModId:'N1',childModId:'N2',filter})))
  await expect(WorkflowConnectorCondition.load(f.ds,'W1','E1')).rejects.toThrow()
  expect(f.http.saves).toEqual([])
 })
 it('rejects a foreign edge or node and a changed condition query target',async()=>{
  const f=await fixture();await expect(WorkflowConnectorCondition.load(f.ds,'W1','E2')).rejects.toThrow()
  const view=await WorkflowConnectorCondition.load(f.ds,'W1','E1');view.queryContext={...view.queryContext,targetNodeId:'NX'}
  await expect(WorkflowConnectorCondition.add(f.ds,'W1','E1')).rejects.toThrow()
  f.http.records['Base_WorkflowConnectors']![0]!['targetID']='NX';await f.ds.getView('Base_WorkflowConnectors')!.refresh()
  await expect(WorkflowConnectorCondition.load(f.ds,'W1','E1')).rejects.toThrow();expect(f.http.saves).toEqual([])
 })
 it('recovers an unknown condition creation without repeating it',async()=>{
  const f=await fixture(),view=await WorkflowConnectorCondition.load(f.ds,'W1','E1'),row=await WorkflowConnectorCondition.add(f.ds,'W1','E1')
  view.updateEditingValue(view.getPkKey(row)!,'filter',filter);f.http.failAfterWrite=true
  await expect(WorkflowConnectorCondition.save(f.ds,'W1','E1')).rejects.toThrow()
  expect(f.http.saves).toHaveLength(1)
  await WorkflowConnectorCondition.save(f.ds,'W1','E1');expect(f.http.saves).toHaveLength(1)
 })
 it('refuses malformed source output and malformed filters without clearing the original records',async()=>{
  const f=await fixture(),view=await WorkflowConnectorCondition.load(f.ds,'W1','E1'),row=await WorkflowConnectorCondition.add(f.ds,'W1','E1')
  view.updateEditingValue(view.getPkKey(row)!,'filter','{broken')
  await expect(WorkflowConnectorCondition.save(f.ds,'W1','E1')).rejects.toThrow()
  f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']='{broken';await f.ds.getView('Base_WorkflowNodeDefinition')!.refresh()
  expect(()=>WorkflowConnectorCondition.columns(f.ds,'W1','E1')).toThrow();expect(f.http.saves).toEqual([])
 })
 it.each(['dataSetId','parentModId','childModId'])('refuses an edited condition identity %s before saving',async field=>{
  const f=await fixture(),view=await WorkflowConnectorCondition.load(f.ds,'W1','E1'),row=await WorkflowConnectorCondition.add(f.ds,'W1','E1'),id=view.getPkKey(row)!
  view.updateEditingValue(id,'filter',filter);view.updateEditingValue(id,field,'foreign-target')
  await expect(WorkflowConnectorCondition.save(f.ds,'W1','E1')).rejects.toThrow()
  expect(f.http.saves).toEqual([])
 })
})
