import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
import {openWorkflowQueryModelCreate} from '@/lowcode/resources/structured-config/workflow-definition/query-model-create'
import {openWorkflowQueryNodeCreate} from '@/lowcode/resources/structured-config/workflow-definition/query-node-create'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from './workflow-native-design.fixture'

const pages:PageRuntime[]=[]
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
const source={type:'json' as const,id:'J1',name:'Orders',description:'',dbid:'',databaseName:'',providerId:''}
const prepared={source,model:{Type:'JSON',MetaName:'J1',description:'',DbId:'',DbName:'',JoinType:'',ForeignKeyFields:'',JoinFilter:'',PId:''},
 fields:[{type:'dataModel' as const,Name:'value',description:'值',FieldType:'varchar',IsPKey:0,IsOutput:1,AsName:'',ValueFun:'',Expression:'',allowAIAdd:0,OrderType:'',Order:0,Group:0}]}
async function fixture(){
 const http=new ApiBackend()
 http.records={Base_WorkflowDefinition:[{rowid:'W1',name:'Current'},{rowid:'W2',name:'Other'}],
  Base_DataSet:[{rowid:'W1',Type:'workflow',inputParams:'[]'}],
  Base_DataModel:[{rowid:'M1',dataSetId:'W1',Name:'Orders'},{rowid:'M2',dataSetId:'W2',Name:'Other'}],Base_DataModel_Field:[]}
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(WORKFLOW_DESIGN,workflowDesignText),space:{dataSpaceId:WORKFLOW_DESIGN,name:'Design'},models:workflowDesignModels(),relations:[],
  fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>{throw Error('unexpected upload')}},assertCurrent(){}})}}).dataSet
 const page=new PageRuntime({pageId:'query-create',scenarioIds:[WORKFLOW_DESIGN],scenarioInputs:{[WORKFLOW_DESIGN]:{workflowId:'W1'}},loadScenario:async()=>ds})
 pages.push(page);await page.load();await ds.getView('Base_WorkflowDefinition')!.refresh()
 const reader={query:vi.fn(async()=>({rows:[source],total:1})),prepare:vi.fn(async()=>structuredClone(prepared))}
 return{http,ds,reader}
}
describe('workflow query model creation in the original DataSet',()=>{
 it('creates a query node with its confirmed model and output identities, without saving an unrelated node draft',async()=>{
  const {ds,http,reader}=await fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N0',workflow_id:'W1',name:'Kept'},{rowid:'N2',workflow_id:'W2',name:'Other'}]
  await nodes.refresh();nodes.updateEditingValue('N0','name','unrelated node draft')
  const owner=await openWorkflowQueryNodeCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})
  await owner.model.preview(source)
  const id=await owner.save(),node=http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']===id)!
  expect(node).toMatchObject({workflow_id:'W1',position_type:1,node_type:'query',name:'Orders（1）',node_config:owner.modelId,input_mapping:'[]',config:''})
  const field=http.records['Base_DataModel_Field']![0]!
  expect(JSON.parse(String(node['output_mapping']))).toEqual([
   expect.objectContaining({Name:'items',pid:null,isParent:true}),expect.objectContaining({Name:'Count',FieldType:'int'}),
   expect.objectContaining({rowid:field['rowid'],Name:'value',FieldType:'varchar',pid:expect.any(String)}),
  ])
  expect(nodes.getEditingRow('N0')?.['name']).toBe('unrelated node draft')
  expect(http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='N0')?.['name']).toBe('Kept')
  expect(http.saves.map(save=>save.table)).toEqual(['Base_DataModel','Base_DataModel_Field','Base_WorkflowNodeDefinition'])
  expect(owner.pending).toBe(false)
  await owner.save();expect(http.saves).toHaveLength(3)
 })
 it('verifies an unknown node creation without creating another model, field or node',async()=>{
  const {ds,http,reader}=await fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!
  await nodes.refresh()
  const owner=await openWorkflowQueryNodeCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})
  await owner.model.preview(source)
  http.beforeSave=async()=>{if(http.saves.length===2)http.failAfterWrite=true}
  await expect(owner.save()).rejects.toThrow()
  expect(owner.modelId).toEqual(expect.any(String));expect(owner.nodeId).toEqual(expect.any(String))
  expect(owner.pending).toBe(true);expect(nodes.hasUnconfirmedSave).toBe(true)
  const id=await owner.save()
  expect(id).toBe(owner.nodeId);expect(owner.pending).toBe(false)
  expect(http.saves).toHaveLength(3);expect(http.records['Base_WorkflowNodeDefinition']).toHaveLength(1)
 })
 it('keeps the original node locked after an unknown submission is independently proven not applied',async()=>{
  const {ds,http,reader}=await fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!
  await nodes.refresh()
  const owner=await openWorkflowQueryNodeCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})
  await owner.model.preview(source)
  let nodeDispatches=0
  http.beforeSave=async()=>{if(http.saves.length===2){nodeDispatches++;throw Error('transport failed before node write')}}
  await expect(owner.save()).rejects.toThrow();expect(nodeDispatches).toBe(1)
  await expect(owner.save()).rejects.toThrow('SPARK_SAVE_NOT_APPLIED')
  expect(nodes.hasUnconfirmedSave).toBe(false)
  await expect(owner.save()).rejects.toThrow('未生效')
  expect(nodeDispatches).toBe(1);expect(owner.nodeId).toEqual(expect.any(String));expect(owner.modelId).toEqual(expect.any(String))
  expect(owner.nodeNotApplied).toBe(true);expect(owner.pending).toBe(true)
  const nodeId=owner.nodeId
  http.beforeSave=async()=>{nodeDispatches++}
  expect(await owner.resubmitNotApplied()).toBe(nodeId)
  expect(nodeDispatches).toBe(2);expect(http.saves).toHaveLength(3)
 })
 it.each(['name','dataOperateModId'])('does not verify or submit a node with a later edit to %s',async field=>{
  const {ds,http,reader}=await fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!
  await nodes.refresh()
  const owner=await openWorkflowQueryNodeCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})
  await owner.model.preview(source)
  http.beforeSave=async()=>{if(http.saves.length===2)http.failAfterWrite=true}
  await expect(owner.save()).rejects.toThrow()
  nodes.updateEditingValue(owner.nodeId!,field,'later edit')
  await expect(owner.save()).rejects.toThrow('原创建意图')
  expect(http.saves).toHaveLength(3);expect(nodes.getEditingRow(owner.nodeId!)?.[field]).toBe('later edit')
 })
 it('only reads again when node acknowledgement succeeded but the independent readback failed',async()=>{
  const {ds,http,reader}=await fixture()
  await ds.getView('Base_WorkflowNodeDefinition')!.refresh()
  const owner=await openWorkflowQueryNodeCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})
  await owner.model.preview(source)
  const refresh=DataView.prototype.refresh
  let fail=true
  vi.spyOn(DataView.prototype,'refresh').mockImplementation(async function(this:DataView,...args){
   if(this.viewId.startsWith('queryNodeVerify:')&&fail){fail=false;throw Error('independent read unavailable')}
   return refresh.apply(this,args)
  })
  await expect(owner.save()).rejects.toThrow('independent read unavailable')
  expect(http.saves).toHaveLength(3);expect(owner.pending).toBe(true)
  expect(await owner.save()).toBe(owner.nodeId)
  expect(http.saves).toHaveLength(3);expect(owner.pending).toBe(false)
 })
 it('refuses node creation permission before committing any source model',async()=>{
  const {ds,http,reader}=await fixture()
  http.denyAdd.add('Base_WorkflowNodeDefinition');await ds.getView('Base_WorkflowNodeDefinition')!.refresh()
  await expect(openWorkflowQueryNodeCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})).rejects.toThrow('新增')
  expect(http.saves).toEqual([]);expect(reader.prepare).not.toHaveBeenCalled()
 })
 it('previews, cancels, creates and independently reads the query model and owned fields without loading the selected-model workspace',async()=>{
  const {ds,http,reader}=await fixture(),selected=ds.getView('Base_DataModel')!
  const selectedState=selected.requestState
  const host=await openWorkflowQueryModelCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})
  expect(host).not.toHaveProperty('createArray')
  await host.preview(source)
  expect(host.getState().preview?.name).toBe('Orders（1）')
  expect(host.getState().preview?.prepared.model).toMatchObject({requestType:'query'})
  host.discard();expect(http.saves).toEqual([])
  await host.preview(source)
  const id=await host.save()
  expect(http.records['Base_DataModel']?.find(row=>row['rowid']===id)).toMatchObject({Name:'Orders（1）',dataSetId:'W1',requestType:'query',MetaName:'J1'})
  expect(http.records['Base_DataModel_Field']).toEqual([expect.objectContaining({dataModelId:id,dataSetId:'W1',Name:'value',type:'dataModel'})])
  expect(http.saves.map(save=>save.table)).toEqual(['Base_DataModel','Base_DataModel_Field'])
  expect(selected.requestState).toBe(selectedState);expect(selected.rows).toEqual([])
  expect(ds.getView('Base_DataModel_Field')!.rows).toEqual([])
  expect(http.records['Base_DataModel']?.find(row=>row['rowid']==='M2')).toEqual({rowid:'M2',dataSetId:'W2',Name:'Other'})
 })
 it('rejects another workflow and an absent same-ID parameter space before any write',async()=>{
  const {ds,http,reader}=await fixture()
  await expect(openWorkflowQueryModelCreate({dataSet:ds,workflowId:'W2',sources:reader,assertCurrent(){}})).rejects.toThrow('工作流')
  http.records['Base_DataSet']=[]
  await expect(openWorkflowQueryModelCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})).rejects.toThrow('参数定义')
  expect(http.saves).toEqual([]);expect(reader.prepare).not.toHaveBeenCalled()
 })
 it('preserves a pending parameter draft and consumes original model create permissions',async()=>{
  const {ds,http,reader}=await fixture(),params=ds.getView('Base_DataSet')!
  await params.refresh();params.updateEditingValue('W1','inputParams','[{"Name":"kept"}]')
  await expect(openWorkflowQueryModelCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})).rejects.toThrow('请先处理')
  expect(params.getEditingRow('W1')?.['inputParams']).toBe('[{"Name":"kept"}]')
  params.discardPendingChanges();http.denyAdd.add('Base_DataModel')
  const owner=await openWorkflowQueryModelCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})
  await owner.preview(source)
  await expect(owner.save()).rejects.toThrow('不允许新增')
  expect(http.saves).toEqual([])
 })
 it('rejects a late source preview after the workflow context changes',async()=>{
  const {ds,http,reader}=await fixture()
  const owner=await openWorkflowQueryModelCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})
  reader.prepare.mockImplementation(async()=>{
   ds.getView('Base_WorkflowDefinition')!.queryContext={workflowId:'W2'}
   return structuredClone(prepared)
  })
  await expect(owner.preview(source)).rejects.toThrow('目标已变化')
  expect(http.saves).toEqual([])
  expect(ds.getView('Base_DataModel','modelCatalog')!.dirtyTracking.hasPendingChanges()).toBe(false)
 })
 it('does not retarget the directory if a concurrent draft appears while parameters load',async()=>{
  const {ds,http,reader}=await fixture(),params=ds.getView('Base_DataSet')!,models=ds.getView('Base_DataModel','modelCatalog')!
  models.queryContext={dataSpaceId:'W1'};await models.refresh()
  const refresh=params.refresh.bind(params)
  vi.spyOn(params,'refresh').mockImplementation(async()=>{
   const result=await refresh()
   models.updateEditingValue('M1','description','concurrent draft')
   return result
  })
  await expect(openWorkflowQueryModelCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})).rejects.toThrow('请先处理')
  expect(models.getEditingRow('M1')?.['description']).toBe('concurrent draft')
  expect(http.saves).toEqual([])
 })
})
