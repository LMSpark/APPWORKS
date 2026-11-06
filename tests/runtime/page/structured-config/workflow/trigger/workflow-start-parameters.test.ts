import {afterEach,describe,expect,it} from 'vitest'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import type {HttpResponse,RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout/layout-resource'
import {workflowStartParameterAdapter,saveWorkflowStartParameters} from '@/lowcode/resources/structured-config/workflow-definition/trigger/start-parameters'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from '../workflow-native-design.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
const original={rowid:'P1',Name:'code',Description:'保留说明',FieldType:'string',Value:'0',ValueFun:{kind:'literal',value:false},NodeName:'开始',extra:{keep:0}}
class RestrictedBackend extends ApiBackend{
 constructor(private readonly denied:string|undefined){super()}
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  const response=await super.executeRequest(request)
  if(request.url==='/api/DataOperation/GetData'&&this.denied){
   const body=response.data as {Result:{data:{Items:Array<{lingma_sys_params:{e:string[]}}>}}}
   for(const row of body.Result.data.Items)row.lingma_sys_params.e=row.lingma_sys_params.e.filter(field=>field!==this.denied)
  }
  return response
 }
}
async function fixture(denied?:string){
 const http=new RestrictedBackend(denied)
 http.records={Base_DataSet:[{rowid:'W1',Type:'workflow',inputParams:JSON.stringify([original])},{rowid:'W2',Type:'workflow',inputParams:'[]'}],Base_WorkflowDefinition:[{rowid:'W1'}],Base_WorkflowNodeDefinition:[{rowid:'N1',workflow_id:'W1',position_type:'0',name:'开始',output_mapping:JSON.stringify([{rowid:'P1',Name:'code',keep:false}])},{rowid:'N2',workflow_id:'W2',position_type:'0',name:'其他开始'}]}
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(WORKFLOW_DESIGN,workflowDesignText),space:{dataSpaceId:WORKFLOW_DESIGN,name:'工作流设计'},models:workflowDesignModels(),relations:[],fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{removeFile:async()=>{throw Error('unexpected layout delete')},readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>{throw Error('unexpected upload')}},assertCurrent:()=>{}})}}).dataSet
 const page=new PageRuntime({pageId:'workflow-inputs',scenarioIds:[WORKFLOW_DESIGN],scenarioInputs:{[WORKFLOW_DESIGN]:{workflowId:'W1'}},loadScenario:async()=>ds});pages.push(page);await page.load()
 const params=ds.getView('Base_DataSet')!,start=ds.getView('Base_WorkflowNodeDefinition','start')!
 await Promise.all([params.refresh(),start.refresh()]);if(params.loadingError)throw params.loadingError;if(start.loadingError)throw start.loadingError
 return{http,ds,params,start}
}
describe('workflow start parameter contract',()=>{
 it('adapts only the confirmed row without clearing metadata or unknown values',()=>{
  const adapter=workflowStartParameterAdapter('新开始')
  expect(adapter.read(original)).toEqual(original)
  expect(adapter.write({...original,Value:'false'},original)).toEqual({...original,Value:'false'})
  const added=adapter.write({Name:'new',Value:'  '},undefined)
  expect(added).toMatchObject({Name:'new',Value:'  ',Description:'',ValueFun:null,NodeName:'新开始',FieldType:'string'})
  expect(added['rowid']).toEqual(expect.any(String))
 })
 it('loads only the workflow record and saves params plus start output without changing other node drafts',async()=>{
  const f=await fixture();expect(f.params.rows.map(row=>row['rowid'])).toEqual(['W1']);expect(f.start.rows.map(row=>row['rowid'])).toEqual(['N1'])
  const nodes=f.ds.getView('Base_WorkflowNodeDefinition')!;await nodes.refresh();nodes.updateEditingValue('N1','name','另存名称')
  f.params.updateEditingValue('W1','inputParams',JSON.stringify([{...original,Value:'changed'}]))
  expect((await saveWorkflowStartParameters(f.ds,'W1')).success).toBe(true)
  expect(f.http.saves.map(save=>save.table)).toEqual(['Base_DataSet','Base_WorkflowNodeDefinition'])
  expect(f.http.saves[1]?.changed[0]).not.toHaveProperty('name')
  expect(JSON.parse(String(f.http.records['Base_DataSet']![0]!['inputParams']))).toEqual([{...original,Value:'changed'}])
  expect(JSON.parse(String(f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']))).toEqual([{rowid:'P1',pid:null,Name:'code',Description:'保留说明',FieldType:'string',isParent:false,keep:false}])
  expect(f.http.records['Base_DataSet']![1]!['inputParams']).toBe('[]');expect(nodes.hasEditingChanges('N1')).toBe(true)
 })
 it.each(['[{}]','[{"Name":"x","rowid":"a"},{"Name":"x","rowid":"b"}]','{}','[null]','[{"Name":"x","rowid":"a"},{"Name":"y","rowid":"a"}]'])('rejects invalid parameters without submitting %s',async text=>{
  const f=await fixture();f.params.updateEditingValue('W1','inputParams',text)
  await expect(saveWorkflowStartParameters(f.ds,'W1')).rejects.toThrow();expect(f.http.saves).toEqual([]);expect(f.start.hasEditingChanges()).toBe(false)
 })
 it('cancels edits and leaves both persisted records unchanged',async()=>{
  const f=await fixture();f.params.updateEditingValue('W1','inputParams','[]');f.params.discardPendingChanges()
  expect(JSON.parse(String(f.params.rows[0]!['inputParams']))).toEqual([original]);expect(f.http.saves).toEqual([])
 })
 it('recovers an unknown save through its original owner without replaying or regenerating mappings',async()=>{
  const f=await fixture();f.params.updateEditingValue('W1','inputParams',JSON.stringify([{...original,Value:'changed'}]));f.http.failAfterWrite=true
  await expect(saveWorkflowStartParameters(f.ds,'W1')).rejects.toThrow()
  const count=f.http.saves.length;expect(count).toBeGreaterThan(0)
  await saveWorkflowStartParameters(f.ds,'W1');expect(f.http.saves).toHaveLength(count)
  // Recovery confirms only the original captured submission; remaining output edits need an explicit subsequent save.
  if(f.start.hasEditingChanges())await saveWorkflowStartParameters(f.ds,'W1')
  expect(f.http.saves.filter(save=>save.table==='Base_DataSet')).toHaveLength(1)
 })
 it('rejects mismatched targets and multiple start nodes without writes',async()=>{
  const f=await fixture();await expect(saveWorkflowStartParameters(f.ds,'W2')).rejects.toThrow();expect(f.http.saves).toEqual([])
  f.http.records['Base_WorkflowNodeDefinition']!.push({rowid:'N3',workflow_id:'W1',position_type:'0'});await f.start.refresh()
  await expect(saveWorkflowStartParameters(f.ds,'W1')).rejects.toThrow();expect(f.http.saves).toEqual([])
 })
 it.each(['parameters','start'])('rejects stale %s query identity without staging outputs or writing',async target=>{
  const f=await fixture(),view=target==='parameters'?f.params:f.start
  view.queryContext={...view.queryContext,workflowId:'W2'}
  await expect(saveWorkflowStartParameters(f.ds,'W1')).rejects.toThrow()
  expect(f.http.saves).toEqual([]);expect(f.start.hasEditingChanges()).toBe(false)
 })
 it('removes deleted parameters from downstream output while preserving the remaining identities',async()=>{
  const f=await fixture();f.params.updateEditingValue('W1','inputParams','[]')
  expect((await saveWorkflowStartParameters(f.ds,'W1')).success).toBe(true)
  expect(f.http.records['Base_DataSet']![0]!['inputParams']).toBe('[]')
  expect(f.http.records['Base_WorkflowNodeDefinition']![0]!['output_mapping']).toBe('[]')
 })
 it.each([123,false,{}])('refuses to replace an existing non-string parameter identity %j',async rowid=>{
  const adapter=workflowStartParameterAdapter('开始'),param={...original,rowid}
  expect(()=>adapter.write({...param,Value:'changed'},param)).toThrow()
  const f=await fixture(),before=JSON.stringify(f.http.records)
  const text=JSON.stringify([{...param,Value:'changed'}]);f.params.updateEditingValue('W1','inputParams',text)
  await expect(saveWorkflowStartParameters(f.ds,'W1')).rejects.toThrow()
  expect(f.http.saves).toEqual([]);expect(JSON.stringify(f.http.records)).toBe(before)
  expect(f.params.getEditingRow('W1')?.['inputParams']).toBe(text)
 })
 it.each(['inputParams','output_mapping'])('honors formal query field denial for %s before mutating either record',async field=>{
  const f=await fixture(field)
  await expect(saveWorkflowStartParameters(f.ds,'W1')).rejects.toThrow('当前查询不允许保存开始参数及输出')
  expect(f.http.saves).toEqual([]);expect(f.params.hasEditingChanges()).toBe(false);expect(f.start.hasEditingChanges()).toBe(false)
 })
})
