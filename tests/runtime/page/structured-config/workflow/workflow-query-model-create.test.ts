import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataView,DataViewFilter,DataViewFilterCodec} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
import {openWorkflowQueryModelCreate} from '@/lowcode/resources/structured-config/workflow-definition/query-model-create'
import {openWorkflowQueryNodeCreate} from '@/lowcode/resources/structured-config/workflow-definition/query-node-create'
import {saveWorkflowQueryFields,cancelWorkflowQueryFields} from '@/lowcode/resources/structured-config/workflow-definition/query-fields'
import {WorkflowConnectors} from '@/lowcode/resources/structured-config/workflow-definition/connectors'
import {WorkflowExecutionContext} from '@/lowcode/resources/structured-config/workflow-definition/execution-context'
import {WorkflowComputedFields} from '@/lowcode/resources/structured-config/workflow-definition/query-computed-fields'
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
 it.each(['remove','save'])('preserves late field edits while async structure checks run: %s',async action=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M1',output_mapping:'[]'}]
  http.records['Base_DataModel_Field']=[{rowid:'C',dataSetId:'W1',dataModelId:'M1',type:'dataModel',FieldType:'计算字段',Name:'oldName',AsName:'',description:'',IsPKey:0,IsOutput:1,ValueFun:'',Expression:'',allowAIAdd:0}]
  models.queryContext={workflowId:'W1',modelId:'M1'};await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  let release=()=>{},entered=()=>{}
  const gate=new Promise<void>(resolve=>{release=resolve}),waiting=new Promise<void>(resolve=>{entered=resolve})
  http.interceptors.request.use({onRequest:async request=>{
   const body=request.data as {Table?:Array<{Name?:string}>}|undefined
   if(request.url==='/api/DataOperation/GetData'&&body?.Table?.[0]?.Name==='Base_DataModel_Relation'){entered();await gate}
   return request
  }})
  if(action==='save')fields.updateEditingValue('C','Name','firstName')
  const running=action==='remove'?WorkflowComputedFields.remove(ds,'W1','N1','C'):saveWorkflowQueryFields(ds,'W1','N1')
  const rejected=expect(running).rejects.toThrow('变化')
  await waiting;fields.updateEditingValue('C',action==='remove'?'description':'Name','lateEdit');release();await rejected
  expect(fields.getEditingRow('C')?.[action==='remove'?'description':'Name']).toBe('lateEdit')
  expect(fields.dirtyTracking.pendingDeleteIds.size).toBe(0);expect(http.saves).toHaveLength(0)
  expect(nodes.hasEditingChanges('N1')).toBe(false)
 })
 it('renames a confirmed computed field from the original dirty baseline and keeps its output identity',async()=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M1',output_mapping:'[]'}]
  http.records['Base_DataModel_Field']=[{rowid:'C',dataSetId:'W1',dataModelId:'M1',type:'dataModel',FieldType:'计算字段',Name:'oldName',AsName:'',description:'',IsPKey:0,IsOutput:1,ValueFun:'',Expression:'',allowAIAdd:0}]
  models.queryContext={workflowId:'W1',modelId:'M1'};await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  fields.updateEditingValue('C','Name','newName');await WorkflowComputedFields.confirm(ds,'W1','N1','C')
  expect(fields.rows[0]?.['Name']).toBe('newName');expect(http.saves).toHaveLength(0)
  await saveWorkflowQueryFields(ds,'W1','N1')
  expect(http.records['Base_DataModel_Field']![0]).toMatchObject({rowid:'C',Name:'newName'})
  expect(JSON.parse(String(http.records['Base_WorkflowNodeDefinition']![0]?.['output_mapping']))).toContainEqual(expect.objectContaining({rowid:'C',Name:'newName'}))
 })
 it('protects connector conditions that reference a computed output alias rather than its physical field name',async()=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M1',output_mapping:'[]'},
   {rowid:'N4',workflow_id:'W1',position_type:2,node_type:'query',node_config:'',output_mapping:'[]'}]
  http.records['Base_WorkflowConnectors']=[{rowid:'EDGE',workflow_id:'W1',sourceID:'N1',targetID:'N4'}]
  http.records['Base_DataModel_Field']=[{rowid:'C',dataSetId:'W1',dataModelId:'M1',type:'dataModel',FieldType:'计算字段',Name:'physicalName',AsName:'resultAlias',description:'',IsPKey:0,IsOutput:1,ValueFun:'',Expression:'',allowAIAdd:0}]
  http.records['Base_DataModel_Relation']=[{rowid:'CONDITION',dataSetId:'W1',parentModId:'N1',childModId:'N4',filter:DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'resultAlias',operator:'eq',value:0}))}]
  models.queryContext={workflowId:'W1',modelId:'M1'};fields.filterExpression={field:'dataModelId',operator:'eq',value:'M1'}
  await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  await expect(WorkflowComputedFields.remove(ds,'W1','N1','C')).rejects.toThrow('CONDITION')
  fields.updateEditingValue('C','AsName','nextAlias')
  await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow('CONDITION')
  expect(fields.getEditingRow('C')?.['AsName']).toBe('nextAlias');expect(http.saves).toHaveLength(0)
  await cancelWorkflowQueryFields(ds,'W1','N1')
  fields.updateEditingValue('C','Name','nextPhysicalName');await WorkflowComputedFields.confirm(ds,'W1','N1','C')
  await saveWorkflowQueryFields(ds,'W1','N1')
  expect(http.records['Base_DataModel_Field']![0]).toMatchObject({Name:'nextPhysicalName',AsName:'resultAlias'})
  expect(http.records['Base_DataModel_Relation']![0]!['filter']).toBe(DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'resultAlias',operator:'eq',value:0})))
 })
 it('rejects deleting a computed field with a downstream parameter reference, ignores matching constant text, and cancels or saves the original deletion with output synchronization',async()=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_DataModel']!.push({rowid:'M4',dataSetId:'W1',Name:'Downstream'})
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M1',output_mapping:JSON.stringify([
   {rowid:'ROOT',pid:null,Name:'items',FieldType:'Array',isParent:true},{rowid:'COUNT',pid:null,Name:'Count',FieldType:'int',isParent:false},{rowid:'C',pid:'ROOT',Name:'calc',FieldType:'计算字段',isParent:false}])},
   {rowid:'N4',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M4',output_mapping:'[]'}]
  http.records['Base_WorkflowConnectors']=[{rowid:'EDGE',workflow_id:'W1',sourceID:'N1',targetID:'N4'}]
  http.records['Base_DataModel_Field']=[{rowid:'C',dataSetId:'W1',dataModelId:'M1',type:'dataModel',FieldType:'计算字段',Name:'calc',AsName:'',description:'',IsPKey:0,IsOutput:1,ValueFun:'',Expression:'',allowAIAdd:0},
   {rowid:'INPUT',dataSetId:'W1',dataModelId:'M4',type:'inputParams',Name:'request',ValueFun:JSON.stringify({Type:'GetInputParam',ParamName:'N1.calc'})}]
  models.queryContext={workflowId:'W1',modelId:'M1'};fields.filterExpression={field:'dataModelId',operator:'eq',value:'M1'}
  await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  await expect(WorkflowComputedFields.remove(ds,'W1','N1','C')).rejects.toThrow('INPUT')
  expect(fields.dirtyTracking.pendingDeleteIds.size).toBe(0);expect(http.saves).toHaveLength(0)
  http.records['Base_DataModel_Field']![1]!['ValueFun']=JSON.stringify({Type:'GetTableField',Field:'calc'})
  await expect(WorkflowComputedFields.remove(ds,'W1','N1','C')).rejects.toThrow('GetTableField')
  http.records['Base_DataModel_Field']![1]!['ValueFun']=JSON.stringify({Type:'GetConstValue',Value:{Type:'GetInputParam',ParamName:'N1.calc'}})
  http.records['Base_DataSet']![0]!['inputParams']=JSON.stringify([{Name:'legacy',ValueFun:{Type:'GetInputParam',ParamName:'N1.calc'}}])
  await expect(WorkflowComputedFields.remove(ds,'W1','N1','C')).rejects.toThrow('inputParams')
  http.records['Base_DataSet']![0]!['inputParams']='[]'
  http.records['Base_DataModel_Field']![0]!['Name']='changed-concurrently'
  await expect(WorkflowComputedFields.remove(ds,'W1','N1','C')).rejects.toThrow('变化')
  http.records['Base_DataModel_Field']![0]!['Name']='calc'
  http.denyDelete.add('Base_DataModel_Field')
  await expect(WorkflowComputedFields.remove(ds,'W1','N1','C')).rejects.toThrow('权限')
  http.denyDelete.clear()
  await WorkflowComputedFields.remove(ds,'W1','N1','C')
  expect(fields.dirtyTracking.pendingDeleteIds.has('C')).toBe(true)
  await cancelWorkflowQueryFields(ds,'W1','N1');expect(fields.rows[0]?.['rowid']).toBe('C');expect(http.saves).toHaveLength(0)
  await WorkflowComputedFields.remove(ds,'W1','N1','C');await saveWorkflowQueryFields(ds,'W1','N1')
  expect(http.records['Base_DataModel_Field']!.map(row=>row['rowid'])).toEqual(['INPUT'])
  expect(JSON.parse(String(http.records['Base_WorkflowNodeDefinition']![0]?.['output_mapping']))).toEqual([
   expect.objectContaining({rowid:'ROOT',Name:'items'}),expect.objectContaining({rowid:'COUNT',Name:'Count'})])
 })
 it('keeps an unfinished computed dialog row in the original view and rejects saving until its required name is valid',async()=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',node_type:'query',node_config:'M1',output_mapping:'[]'}]
  models.queryContext={workflowId:'W1',modelId:'M1'};await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  const id=await WorkflowComputedFields.begin(ds,'W1','N1')
  expect(fields.rows[0]).toMatchObject({rowid:id,Name:'',FieldType:'计算字段',IsOutput:0})
  await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow('名称')
  expect(http.saves).toHaveLength(0)
  await cancelWorkflowQueryFields(ds,'W1','N1');expect(fields.rows).toHaveLength(0)
 })
 it('stages a computed field in the original query view, cancels without writes, and saves its output with a stable native identity',async()=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',node_type:'query',node_config:'M1',output_mapping:'[]'}]
  models.queryContext={workflowId:'W1',modelId:'M1'};await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  const values={Name:'computedZero',description:'零',ValueFun:JSON.stringify({Type:'GetConstValue',Value:0}),IsOutput:1 as const}
  const cancelled=await WorkflowComputedFields.add(ds,'W1','N1',values)
  expect(fields.dirtyTracking.isPendingCreate(cancelled)).toBe(true);expect(http.saves).toHaveLength(0)
  await cancelWorkflowQueryFields(ds,'W1','N1');expect(fields.rows).toHaveLength(0);expect(http.saves).toHaveLength(0)
  const id=await WorkflowComputedFields.add(ds,'W1','N1',values)
  await saveWorkflowQueryFields(ds,'W1','N1')
  expect(http.records['Base_DataModel_Field']).toEqual([expect.objectContaining({rowid:id,dataSetId:'W1',dataModelId:'M1',Name:'computedZero',FieldType:'计算字段',type:'dataModel',IsPKey:0,ValueFun:values.ValueFun})])
  expect(JSON.parse(String(http.records['Base_WorkflowNodeDefinition']![0]?.['output_mapping']))).toContainEqual(expect.objectContaining({rowid:id,Name:'computedZero',FieldType:'计算字段'}))
  await expect(WorkflowComputedFields.add(ds,'W1','N1',values)).rejects.toThrow('名称')
  const pendingNode=vi.spyOn(nodes,'hasUnconfirmedSave','get').mockReturnValue(true)
  await expect(WorkflowComputedFields.add(ds,'W1','N1',{...values,Name:'other'})).rejects.toThrow('核验')
  expect(fields.dirtyTracking.pendingCreateIds.size).toBe(0)
  pendingNode.mockRestore()
 })
 it('preserves the computed field native identity and original output batch when its save response is lost',async()=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',node_type:'query',node_config:'M1',output_mapping:'[]'}]
  models.queryContext={workflowId:'W1',modelId:'M1'};await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  const id=await WorkflowComputedFields.add(ds,'W1','N1',{Name:'zero',description:'',ValueFun:JSON.stringify({Type:'GetConstValue',Value:0}),IsOutput:1})
  http.failAfterWrite=true;await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow()
  const writes=http.saves.length
  await expect(cancelWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow('核验')
  http.failAfterWrite=false;await saveWorkflowQueryFields(ds,'W1','N1')
  expect(http.saves).toHaveLength(writes);expect(http.records['Base_DataModel_Field']).toHaveLength(1)
  expect(http.records['Base_DataModel_Field']![0]?.['rowid']).toBe(id)
  expect(fields.hasUnconfirmedSave).toBe(false)
 })
 it('allows additive query outputs with downstream edges but preserves the guard for removing or renaming existing outputs',async()=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',node_type:'query',node_config:'M1',output_mapping:JSON.stringify([
   {rowid:'ROOT',pid:null,Name:'items',FieldType:'Array',isParent:true},{rowid:'COUNT',pid:null,Name:'Count',FieldType:'int',isParent:false},
   {rowid:'F1',pid:'ROOT',Name:'code',FieldType:'varchar',isParent:false}])}]
  http.records['Base_WorkflowConnectors']=[{rowid:'EDGE',workflow_id:'W1',sourceID:'N1',targetID:'NEXT'}]
  http.records['Base_DataModel_Field']=['F1','F2'].map((rowid,index)=>({rowid,dataSetId:'W1',dataModelId:'M1',Name:index?'rowid':'code',AsName:'',type:'dataModel',FieldType:'varchar',IsOutput:index?0:1,IsPKey:0,description:''}))
  models.queryContext={workflowId:'W1',modelId:'M1'};await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  fields.updateEditingValue('F2','IsOutput',1);await saveWorkflowQueryFields(ds,'W1','N1')
  expect(JSON.parse(String(http.records['Base_WorkflowNodeDefinition']![0]?.['output_mapping']))).toEqual(expect.arrayContaining([expect.objectContaining({rowid:'F1',Name:'code'}),expect.objectContaining({rowid:'F2',Name:'rowid'})]))
  const writes=http.saves.length
  fields.updateEditingValue('F1','AsName','renamed');await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow('下游')
  await cancelWorkflowQueryFields(ds,'W1','N1')
  fields.updateEditingValue('F1','IsOutput',0);await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow('下游')
  expect(http.saves).toHaveLength(writes)
 })
 it.each(['is-null','is-not-null'] as const)('refuses an existing %s connector condition before dispatch while preserving its original definition',async operator=>{
  const {ds,http}=await fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'START',workflow_id:'W1',position_type:0,node_type:'query'},{rowid:'END',workflow_id:'W1',position_type:2,node_type:'query'}]
  http.records['Base_WorkflowConnectors']=[{rowid:'E',workflow_id:'W1',sourceID:'START',targetID:'END'}]
  const filter=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'existingField',operator}))
  http.records['Base_DataModel_Relation']=[{rowid:'C',dataSetId:'W1',parentModId:'START',childModId:'END',filter}]
  await Promise.all([nodes.refresh(),edges.refresh()]);const context=new WorkflowExecutionContext(ds,'W1',()=>{})
  await expect(context.load()).rejects.toThrow('运算符')
  expect(http.records['Base_DataModel_Relation']![0]!['filter']).toBe(filter);expect(http.saves).toHaveLength(0);context.dispose()
 })
 it('captures the saved execution graph and distinguishes mandatory results from conditional branches',async()=>{
  const {ds,http}=await fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'START',workflow_id:'W1',position_type:0},{rowid:'A',workflow_id:'W1',position_type:1},{rowid:'END',workflow_id:'W1',position_type:2}]
  http.records['Base_WorkflowConnectors']=[{rowid:'SA',workflow_id:'W1',sourceID:'START',targetID:'A'},{rowid:'AE',workflow_id:'W1',sourceID:'A',targetID:'END'}]
  http.records['Base_DataModel_Relation']=[];await nodes.refresh();await edges.refresh()
  const context=new WorkflowExecutionContext(ds,'W1',()=>{})
  await context.load();expect(context.capture()).toEqual({workflowId:'W1',nodeIds:['START','A','END'],requiredNodeIds:['START','A','END'],conditional:false})
  http.records['Base_DataModel_Relation']=[{rowid:'R',dataSetId:'W1',parentModId:'START',childModId:'A',filter:DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'flag',operator:'eq',value:false}))}]
  await context.load();expect(context.capture()).toEqual({workflowId:'W1',nodeIds:['START','A','END'],requiredNodeIds:['START'],conditional:true})
  http.records['Base_DataModel_Relation']!.push({...http.records['Base_DataModel_Relation']![0],rowid:'DUPLICATE'})
  await expect(context.load()).rejects.toThrow('多条条件')
  context.dispose();expect(ds.getView('Base_DataModel_Relation','asParent')).toBeDefined()
 })
 it('creates and cancels formal connectors in the original view, rejects duplicate/cyclic endpoints, and preserves an unknown save',async()=>{
  const {ds,http}=await fixture(),nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'START',workflow_id:'W1',position_type:0,node_type:'query'},
   {rowid:'A',workflow_id:'W1',position_type:1,node_type:'query'},{rowid:'B',workflow_id:'W1',position_type:1,node_type:'query'}]
  http.records['Base_WorkflowConnectors']=[];await nodes.refresh();await edges.refresh()
  const cancelled=await WorkflowConnectors.add(ds,'W1',{source:'START',target:'A'})
  expect(edges.dirtyTracking.isPendingCreate(cancelled)).toBe(true);expect(http.saves).toEqual([])
  edges.discardPendingChanges([cancelled]);expect(edges.rows).toEqual([])
  const id=await WorkflowConnectors.add(ds,'W1',{source:'START',target:'A'})
  http.failAfterWrite=true
  await expect(WorkflowConnectors.save(ds,'W1',id)).rejects.toThrow()
  expect(edges.hasUnconfirmedSave).toBe(true);expect(http.saves).toHaveLength(1)
  await WorkflowConnectors.save(ds,'W1',id);expect(http.saves).toHaveLength(1)
  await expect(WorkflowConnectors.add(ds,'W1',{source:'START',target:'A'})).rejects.toThrow('重复')
  await expect(WorkflowConnectors.add(ds,'W1',{source:'A',target:'A'})).rejects.toThrow('自身')
  await expect(WorkflowConnectors.add(ds,'W1',{source:'A',target:'START'})).rejects.toThrow('开始')
  http.records['Base_WorkflowConnectors']!.push({rowid:'AB',workflow_id:'W1',sourceID:'A',targetID:'B',params:'[]'})
  await edges.refresh()
  await expect(WorkflowConnectors.add(ds,'W1',{source:'B',target:'A'})).rejects.toThrow('环')
  await expect(WorkflowConnectors.add(ds,'W1',{source:'OTHER',target:'B'})).rejects.toThrow('归属')
 })
 it('preserves undeclared source parameter types during query model planning instead of assuming varchar',async()=>{
  const {ds,reader,http}=await fixture()
  const command=await openWorkflowQueryModelCreate({dataSet:ds,workflowId:'W1',sources:reader,assertCurrent(){}})
  await command.preview(source)
  expect(reader.prepare).toHaveBeenCalledWith(source,ds,{missingInputType:'preserve'})
  expect(http.saves).toEqual([])
  command.discard()
 })
 it('saves source ValueFun and model Filter together, recovers the original unknown batch before changed ancestor validation, and cancels both scopes',async()=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'START',workflow_id:'W1',position_type:0,node_type:'query',name:'开始',node_config:'',output_mapping:JSON.stringify([{rowid:'P',pid:null,Name:'code',Description:'编码',FieldType:'string',isParent:false}])},
   {rowid:'N1',workflow_id:'W1',position_type:1,node_type:'query',node_config:'M1',name:'查询',output_mapping:JSON.stringify([{rowid:'ITEMS',pid:null,Name:'items',Description:'数据项',FieldType:'Array',isParent:true},{rowid:'COUNT',pid:null,Name:'Count',Description:'数据总数',FieldType:'int',isParent:false},{rowid:'F1',pid:'ITEMS',Name:'code',Description:'编码',FieldType:'varchar',isParent:false}]),input_mapping:'keep input',config:'keep config'}]
  http.records['Base_WorkflowConnectors']=[{rowid:'E',workflow_id:'W1',sourceID:'START',targetID:'N1'}]
  http.records['Base_DataModel_Field']=[{rowid:'F1',dataSetId:'W1',dataModelId:'M1',Name:'code',AsName:'',type:'dataModel',FieldType:'varchar',description:'编码',IsOutput:1,IsPKey:0,ValueFun:''},
   {rowid:'INPUT',dataSetId:'W1',dataModelId:'M1',Name:'request',AsName:'',type:'inputParams',FieldType:'varchar',description:'来源入参',IsOutput:0,IsPKey:0,ValueFun:''}]
  models.queryContext={workflowId:'W1',modelId:'M1'};await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  const filter=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'code',operator:'eq',value:{Type:'GetInputParam',ParamName:'START.code'}}))
  fields.updateEditingValue('INPUT','ValueFun',JSON.stringify({Type:'GetConstValue',Value:0}));models.updateEditingValue('M1','Filter',filter)
  http.failAfterWrite=true;await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow()
  const writes=http.saves.length;expect(writes).toBe(2)
  http.failAfterWrite=false;edges.replaceRows([]);edges.total=0
  await saveWorkflowQueryFields(ds,'W1','N1');expect(http.saves).toHaveLength(writes)
  expect(http.records['Base_DataModel']![0]?.['Filter']).toBe(filter)
  expect(http.records['Base_DataModel_Field']!.find(row=>row['rowid']==='INPUT')?.['ValueFun']).toBe(JSON.stringify({Type:'GetConstValue',Value:0}))
  expect(http.records['Base_WorkflowNodeDefinition']![1]).toMatchObject({input_mapping:'keep input',config:'keep config'})
  models.updateEditingValue('M1','Filter','');fields.updateEditingValue('INPUT','ValueFun',JSON.stringify({Type:'GetConstValue',Value:false}))
  await cancelWorkflowQueryFields(ds,'W1','N1');expect(models.hasEditingChanges()).toBe(false);expect(fields.hasEditingChanges()).toBe(false)
 })
 it('saves selected field changes and every shared query-node output while preserving other node drafts',async()=>{
  const {ds,http}=await fixture(),models=ds.getView('Base_DataModel')!,fields=ds.getView('Base_DataModel_Field')!,nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
  const mapping=(root:string)=>JSON.stringify([{rowid:root,pid:null,Name:'items',Description:'数据项',FieldType:'Array',isParent:true},
   {rowid:`${root}C`,pid:null,Name:'Count',Description:'数据总数',FieldType:'int',isParent:false},
   {rowid:'F1',pid:root,Name:'name',Description:'名称',FieldType:'varchar',isParent:false,custom:'keep'}])
  http.records['Base_WorkflowNodeDefinition']=[{rowid:'N1',workflow_id:'W1',node_type:'query',node_config:'M1',output_mapping:mapping('R1')},
   {rowid:'N2',workflow_id:'W1',node_type:'query',node_config:'M1',output_mapping:mapping('R2')},
   {rowid:'N3',workflow_id:'W1',node_type:'query',node_config:'M3',name:'unchanged',output_mapping:'[]'}]
  http.records['Base_DataModel_Field']=[{rowid:'F1',dataSetId:'W1',dataModelId:'M1',Name:'name',AsName:'',type:'dataModel',FieldType:'varchar',IsOutput:1,description:'名称'}]
  models.queryContext={workflowId:'W1',modelId:'M1'};await models.refresh();await Promise.all([nodes.refresh(),edges.refresh(),fields.refresh()])
  fields.updateEditingValue('F1','AsName','title');nodes.updateEditingValue('N3','name','other draft')
  await saveWorkflowQueryFields(ds,'W1','N1')
  expect(http.records['Base_DataModel_Field']![0]?.['AsName']).toBe('title')
  for(const id of ['N1','N2'])expect(JSON.parse(String(http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']===id)?.['output_mapping']))[2]).toMatchObject({rowid:'F1',Name:'title',custom:'keep'})
  expect(nodes.getEditingRow('N3')?.['name']).toBe('other draft')
  expect(http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='N3')?.['name']).toBe('unchanged')
  expect(http.saves.map(save=>save.table).sort()).toEqual(['Base_DataModel_Field','Base_WorkflowNodeDefinition'].sort())
  const originalAccess=nodes.fieldAccess.bind(nodes)
  const nodeAccess=vi.spyOn(nodes,'fieldAccess').mockImplementation((row,field)=>{
   const access=originalAccess(row,field)
   return field==='output_mapping'?{...access,write:'denied',writeMode:'readonly'}:access
  })
  fields.updateEditingValue('F1','Order',1)
  await saveWorkflowQueryFields(ds,'W1','N1')
  expect(http.saves.at(-1)?.table).toBe('Base_DataModel_Field')
  nodeAccess.mockRestore()
  fields.updateEditingValue('F1','description','changed description')
  http.failAfterWrite=true
  await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow()
  const writes=http.saves.length
  http.failAfterWrite=false
  http.records['Base_DataModel_Field']![0]!['description']='名称'
  await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow('SPARK_SAVE_UNVERIFIABLE')
  expect(http.saves).toHaveLength(writes)
  http.records['Base_DataModel_Field']![0]!['description']='changed description'
  await saveWorkflowQueryFields(ds,'W1','N1')
  expect(http.saves).toHaveLength(writes)
  expect(fields.hasEditingChanges()||fields.dirtyTracking.hasPendingChanges()).toBe(false)
  expect(nodes.getEditingRow('N3')?.['name']).toBe('other draft')
  fields.updateEditingValue('F1','description','cancel derived output')
  vi.spyOn(ds,'saveChanges').mockRejectedValueOnce(Error('before dispatch'))
  await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow('before dispatch')
  expect(nodes.hasEditingChanges('N1')).toBe(true)
  await cancelWorkflowQueryFields(ds,'W1','N1')
  expect(nodes.hasEditingChanges('N1')).toBe(false)
  expect(fields.hasEditingChanges()).toBe(false)
  expect(nodes.getEditingRow('N3')?.['name']).toBe('other draft')
  nodes.updateEditingValue('N2','name','affected draft')
  fields.updateEditingValue('F1','AsName','later')
  await expect(saveWorkflowQueryFields(ds,'W1','N1')).rejects.toThrow('其他修改')
  expect(fields.getEditingRow('F1')?.['AsName']).toBe('later')
  expect(nodes.getEditingRow('N2')?.['name']).toBe('affected draft')
  expect(http.saves).toHaveLength(writes)
  await cancelWorkflowQueryFields(ds,'W1','N1')
  expect(fields.hasEditingChanges()).toBe(false)
  expect(nodes.getEditingRow('N2')?.['name']).toBe('affected draft')
 })
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
