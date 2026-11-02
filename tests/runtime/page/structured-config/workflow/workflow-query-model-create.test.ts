import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
import {openWorkflowQueryModelCreate} from '@/lowcode/resources/structured-config/workflow-definition/query-model-create'
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
