import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {WorkflowTriggerCondition} from '@/lowcode/resources/structured-config/workflow-definition/trigger-condition'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {WORKFLOW,topicModels,topicTexts} from '../catalog/formal-topic.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(p=>p.dispose()))
async function fixture(){
 const http=new ApiBackend();http.records={Base_WorkflowDefinition:[{rowid:'W1',tblid:'T1',tblName:'Orders',filter:'keep'}],Base_TblField:[{rowid:'F1',tblid:'T1',enname:'Count',cnname:'数量',DataType:'INT'},{rowid:'F2',tblid:'T1',enname:'At',cnname:'时间',DataType:'DATETIME'},{rowid:'OTHER',tblid:'T2',enname:'Secret',cnname:'其他表',DataType:'VARCHAR'}]}
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(WORKFLOW,topicTexts[WORKFLOW]!),space:{dataSpaceId:WORKFLOW,name:'工作流目录'},models:topicModels(WORKFLOW),relations:[]}).dataSet
 const page=new PageRuntime({pageId:'condition-test',scenarioIds:[WORKFLOW],loadScenario:async()=>ds});pages.push(page);await page.load()
 const edit=ds.getView('Base_WorkflowDefinition','edit')!;edit.queryContext={definitionId:'W1'};await edit.refresh()
 return{ds,http,edit}
}
describe('workflow trigger condition field directory',()=>{
 it('queries only the current trigger table and projects typed field metadata without modifying the definition',async()=>{
  const f=await fixture();await WorkflowTriggerCondition.load(f.ds,'W1')
  expect(WorkflowTriggerCondition.columns(f.ds,'W1')).toEqual([{name:'Count',label:'数量',type:'int'},{name:'At',label:'时间',type:'datetime'}])
  expect(WorkflowTriggerCondition.functionContext(f.ds,'W1')).toEqual({tables:[{name:'Orders',fields:[{name:'Count',label:'数量'},{name:'At',label:'时间'}]}]})
  expect(f.edit.getEditingRow('W1')?.['filter']).toBe('keep');expect(f.http.saves).toEqual([])
 })
 it('rejects a previous table directory after the definition draft changes target',async()=>{
  const f=await fixture();await WorkflowTriggerCondition.load(f.ds,'W1');f.edit.updateEditingValue('W1','tblid','T2')
  expect(()=>WorkflowTriggerCondition.columns(f.ds,'W1')).toThrow('触发表')
  await WorkflowTriggerCondition.load(f.ds,'W1');expect(WorkflowTriggerCondition.columns(f.ds,'W1')).toEqual([{name:'Secret',label:'其他表',type:'varchar'}]);expect(f.http.saves).toEqual([])
 })
 it('rejects duplicate field names and unreadable metadata without inventing defaults',async()=>{
  const f=await fixture();f.http.records['Base_TblField']!.push({rowid:'DUP',tblid:'T1',enname:'Count',cnname:'重复',DataType:'INT'})
  await WorkflowTriggerCondition.load(f.ds,'W1');expect(()=>WorkflowTriggerCondition.columns(f.ds,'W1')).toThrow('重复')
  const fields=f.ds.getView('Base_TblField')!,access=fields.fieldAccess.bind(fields)
  vi.spyOn(fields,'fieldAccess').mockImplementation((row,field)=>field==='DataType'?{...access(row,field),read:'invisible'}:access(row,field))
  expect(()=>WorkflowTriggerCondition.columns(f.ds,'W1')).toThrow('不可读');expect(f.http.saves).toEqual([])
 })
 it('does not accept a delayed directory completion after another trigger table has loaded',async()=>{
  const f=await fixture();await WorkflowTriggerCondition.load(f.ds,'W1')
  const fields=f.ds.getView('Base_TblField')!;let release!:()=>void
  vi.spyOn(fields,'refresh').mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve}))
  const old=WorkflowTriggerCondition.load(f.ds,'W1'),rejection=expect(old).rejects.toThrow('已变化')
  f.edit.updateEditingValue('W1','tblid','T2');await WorkflowTriggerCondition.load(f.ds,'W1');release();await rejection
  expect(WorkflowTriggerCondition.columns(f.ds,'W1').map(c=>c.name)).toEqual(['Secret']);expect(f.http.saves).toEqual([])
 })
 it('keeps the original condition when no fields are returned and rejects an unreadable target identity',async()=>{
  const f=await fixture();f.http.records['Base_TblField']=[];await WorkflowTriggerCondition.load(f.ds,'W1')
  expect(WorkflowTriggerCondition.columns(f.ds,'W1')).toEqual([]);expect(f.edit.getEditingRow('W1')?.['filter']).toBe('keep')
  const access=f.edit.fieldAccess.bind(f.edit);vi.spyOn(f.edit,'fieldAccess').mockImplementation((row,field)=>field==='tblid'?{...access(row,field),read:'invisible'}:access(row,field))
  await expect(WorkflowTriggerCondition.load(f.ds,'W1')).rejects.toThrow('不可读');expect(f.http.saves).toEqual([])
 })
})
