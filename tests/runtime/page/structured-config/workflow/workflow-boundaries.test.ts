import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {WorkflowBoundaryCompletion,workflowBoundaryState} from '@/lowcode/resources/structured-config/workflow-definition/boundaries'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {WORKFLOW_DESIGN,workflowDesignModels,workflowDesignText} from './workflow-native-design.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
async function fixture(positions:number[]=[]){
 const http=new ApiBackend()
 http.records={Base_WorkflowDefinition:[{rowid:'W1',name:'Current'}],Base_DataSet:[{rowid:'W1',Type:'workflow',inputParams:'[]'}],Base_WorkflowNodeDefinition:positions.map((position,index)=>({rowid:`N${index}`,workflow_id:'W1',position_type:position,node_type:'API_CALL',name:position===0?'开始':'结束',node_config:'',dataOperateModId:'',input_mapping:'[]',output_mapping:'[]',config:''})),Base_WorkflowConnectors:[]}
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(WORKFLOW_DESIGN,workflowDesignText),space:{dataSpaceId:WORKFLOW_DESIGN,name:'Design'},models:workflowDesignModels(),relations:[],fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{removeFile:async()=>{throw Error('unexpected layout delete')},readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>({})},assertCurrent(){}})}}).dataSet
 const page=new PageRuntime({pageId:'boundaries',scenarioIds:[WORKFLOW_DESIGN],scenarioInputs:{[WORKFLOW_DESIGN]:{workflowId:'W1'}},loadScenario:async()=>ds});pages.push(page);await page.load()
 await Promise.all(['Base_WorkflowDefinition','Base_WorkflowNodeDefinition'].map(name=>ds.getView(name)!.refresh()))
 let command:WorkflowBoundaryCompletion|undefined;const input={dataSet:ds,workflowId:'W1'}
 return{http,ds,input,get command(){command??=WorkflowBoundaryCompletion.open(input);return command},reset(){command=undefined},nodes:ds.getView('Base_WorkflowNodeDefinition')!}
}
describe('workflow boundaries on original node DataView',()=>{
 it('does not expose finish-current when the owned payload cannot be fully read',async()=>{
  const f=await fixture([0]);await f.command.stage();const create=f.nodes.createQueryView.bind(f.nodes)
  vi.spyOn(f.nodes,'createQueryView').mockImplementation((...args)=>{const fresh=create(...args),access=fresh.fieldAccess.bind(fresh);vi.spyOn(fresh,'fieldAccess').mockImplementation((row,key)=>f.http.saves.length&&key==='name'?{...access(row,key),read:'invisible'}:access(row,key));return fresh})
  await expect(f.command.save()).rejects.toThrow('不可读');expect(f.command.canFinishCurrent).toBe(false);expect(f.command.complete).toBe(false)
 })
 it('rejects concurrent staging and staging after cancellation',async()=>{
  const f=await fixture();const first=f.command.stage();await expect(f.command.stage()).rejects.toThrow('已暂存或失败');await first;expect(f.command.ids).toHaveLength(2)
  const other=await fixture();other.command.cancel();await expect(other.command.stage()).rejects.toThrow('已暂存或失败')
 })
 it('explicitly accepts current formal rows after an invalid acknowledgement without replay',async()=>{
  const f=await fixture([0]);await f.command.stage();const save=f.ds.saveChanges.bind(f.ds)
  vi.spyOn(f.ds,'saveChanges').mockImplementationOnce(async options=>{const result=await save(options);if(!result.data)throw Error('missing test receipt');return{...result,data:{...result.data,viewCount:99}}})
  await expect(f.command.save()).rejects.toThrow('回执');expect(f.command.canAcceptCurrent).toBe(true);const count=f.http.saves.length
  await f.command.acceptCurrent();expect(f.command.confirmed).toBe(true);expect(f.http.saves).toHaveLength(count)
 })
 it('keeps explicit resolution for invalid receipts whose current formal payload differs',async()=>{
  const f=await fixture([0]);await f.command.stage();const save=f.ds.saveChanges.bind(f.ds)
  vi.spyOn(f.ds,'saveChanges').mockImplementationOnce(async options=>{const result=await save(options);if(!result.data)throw Error('missing test receipt');return{...result,data:{...result.data,viewCount:99}}})
  await expect(f.command.save()).rejects.toThrow('回执');f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['position_type']===2)!['name']='远端改名'
  await expect(f.command.acceptCurrent()).rejects.toThrow('独立回读');expect(f.command.confirmed).toBe(false);expect(f.command.canFinishCurrent).toBe(true)
  const count=f.http.saves.length;f.command.finishCurrent();expect(f.command.complete).toBe(true);expect(f.command.confirmed).toBe(false);expect(f.http.saves).toHaveLength(count)
 })
 it('explicitly abandons an original batch proven not applied, without replay',async()=>{
  const f=await fixture([0]);await f.command.stage();f.http.beforeSave=async()=>{throw Error('not delivered')}
  await expect(f.command.save()).rejects.toThrow();delete f.http.beforeSave
  await expect(f.command.save()).rejects.toThrow('确认未生效');expect(f.command.canDiscardNotApplied).toBe(true)
  await f.command.discardNotApplied();expect(f.nodes.rows.map(row=>row['rowid'])).toEqual(['N0']);expect(f.http.saves).toHaveLength(0)
 })
 it('rechecks all new boundary fields in the fresh formal query before dispatch',async()=>{
  const f=await fixture([0]);await f.command.stage();const create=f.nodes.createQueryView.bind(f.nodes)
  vi.spyOn(f.nodes,'createQueryView').mockImplementation((...args)=>{const fresh=create(...args);const access=fresh.newRowFieldAccess.bind(fresh);vi.spyOn(fresh,'newRowFieldAccess').mockImplementation(key=>key==='node_type'?{...access(key),write:'denied'}:access(key));return fresh})
  await expect(f.command.save()).rejects.toThrow('边界字段: node_type');expect(f.http.saves).toHaveLength(0);expect(f.command.canCancel).toBe(true)
 })
 it.each([null,'',' ',false,'invalid'])('rejects malformed node position %j instead of treating it as start',async value=>{
  const f=await fixture([0]);f.http.records['Base_WorkflowNodeDefinition']![0]!['position_type']=value;await f.nodes.refresh()
  expect(()=>workflowBoundaryState(f.input)).toThrow('节点位置不是正式');expect(f.http.saves).toHaveLength(0)
 })
 it('saves only this command ids and leaves a later end draft untouched',async()=>{
  const f=await fixture([0]);await f.command.stage();const own=[...f.command.ids]
  await f.nodes.addRow({workflow_id:'W1',position_type:2,node_type:'API_CALL',name:'后来结束'})
  const other=f.nodes.rows.find(row=>row['name']==='后来结束')!,otherId=String(other['rowid']);await f.command.save()
  expect(f.http.records['Base_WorkflowNodeDefinition']!.map(row=>row['rowid'])).toEqual(['N0',...own]);expect(f.nodes.dirtyTracking.isPendingCreate(otherId)).toBe(true)
 })
 it('cancels only this command ids and preserves a later end draft',async()=>{
  const f=await fixture([0]);await f.command.stage();await f.nodes.addRow({workflow_id:'W1',position_type:2,node_type:'API_CALL',name:'后来结束'})
  f.command.cancel();expect(f.nodes.rows.map(row=>row['name'])).toEqual(['开始','后来结束']);expect(f.http.saves).toHaveLength(0)
 })
 it('retains partial staging identity for cancellation and refuses incomplete save',async()=>{
  const f=await fixture(),original=f.nodes.addRow.bind(f.nodes)
  vi.spyOn(f.nodes,'addRow').mockImplementationOnce(original).mockRejectedValueOnce(Error('second add failed'))
  await expect(f.command.stage()).rejects.toThrow('second add failed');expect(f.command.ids).toHaveLength(1)
  await expect(f.command.save()).rejects.toThrow('尚未全部暂存');expect(f.http.saves).toHaveLength(0);f.command.cancel();expect(f.nodes.rows).toHaveLength(0)
 })
 it('retains a readback handle after acknowledgement and rechecks without creation permission or replay',async()=>{
  const f=await fixture([0]);await f.command.stage();const original=f.http.request.bind(f.http);let offline=true
  vi.spyOn(f.http,'request').mockImplementation(async config=>{if(config.url==='/api/DataOperation/GetData'&&f.http.saves.length&&offline){throw Error('readback offline')}return original(config)})
  await expect(f.command.save()).rejects.toThrow();expect(f.command.complete).toBe(false);expect(f.command.submitted).toBe(true);const count=f.http.saves.length
  offline=false;f.http.denyAdd.add('Base_WorkflowNodeDefinition');await f.command.save();expect(f.command.confirmed).toBe(true);expect(f.http.saves).toHaveLength(count)
 })
 it('checks the exact new boundary payload on independent readback',async()=>{
  const f=await fixture([0]);await f.command.stage();const original=f.http.request.bind(f.http);let changed=false
  vi.spyOn(f.http,'request').mockImplementation(async config=>{if(config.url==='/api/DataOperation/GetData'&&f.http.saves.length&&!changed){changed=true;f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['position_type']===2)!['node_type']='query'}return original(config)})
  await expect(f.command.save()).rejects.toThrow();expect(f.command.confirmed).toBe(false);expect(f.command.submitted).toBe(true);expect(f.command.canFinishCurrent).toBe(true);f.command.finishCurrent();expect(f.command.complete).toBe(true);expect(f.command.confirmed).toBe(false)
 })
 it('verifies the original unknown boundary save without replaying either creation',async()=>{
  const f=await fixture();await f.command.stage();f.http.failAfterWrite=true
  await expect(f.command.save()).rejects.toThrow();expect(f.nodes.hasUnconfirmedSave).toBe(true)
  expect(()=>f.command.cancel()).toThrow('核验');const count=f.http.saves.length
  await f.command.save();expect(f.http.saves).toHaveLength(count);expect(f.nodes.hasUnconfirmedSave).toBe(false);expect(f.http.records['Base_WorkflowNodeDefinition']).toHaveLength(2)
 })
 it('rejects node edits arriving while a fresh boundary check is pending',async()=>{
  const f=await fixture([0]);await f.command.stage()
  const original=f.http.request.bind(f.http);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
  const spy=vi.spyOn(f.http,'request').mockImplementation(async config=>{if(config.url==='/api/DataOperation/GetData')await gate;return original(config)})
  const saving=f.command.save();await Promise.resolve();f.nodes.updateEditingValue('N0','name','迟到修改');release()
  await expect(saving).rejects.toThrow('节点修改已变化');expect(f.http.saves).toHaveLength(0);spy.mockRestore()
 })
 it('reads without writes, stages both boundaries, cancels and saves exact original ids',async()=>{
  const f=await fixture();expect(workflowBoundaryState(f.input).missing).toEqual([0,2]);expect(f.http.saves).toHaveLength(0)
  await f.command.stage();expect(f.http.saves).toHaveLength(0);expect(f.nodes.rows.map(row=>row['node_type'])).toEqual(['API_CALL','API_CALL'])
  f.command.cancel();f.reset();expect(f.nodes.rows).toHaveLength(0)
  await f.command.stage();const ids=f.nodes.rows.map(row=>row['rowid']);await f.command.save()
  expect(f.http.records['Base_WorkflowNodeDefinition']!.map(row=>row['rowid'])).toEqual(ids);expect(f.http.saves).toHaveLength(1)
  await f.nodes.refresh();expect(workflowBoundaryState(f.input).missing).toEqual([]);f.reset();await f.command.stage();expect(f.http.saves).toHaveLength(1)
 })
 it('preserves multiple existing ends and creates only the missing start',async()=>{
  const f=await fixture([2,2]);await f.command.stage();await f.command.save()
  expect(f.http.records['Base_WorkflowNodeDefinition']!.map(row=>row['position_type'])).toEqual([2,2,0])
 })
 it('rejects duplicate starts without writes',async()=>{
  const f=await fixture([0,0]);expect(()=>workflowBoundaryState(f.input)).toThrow('开始节点不唯一');expect(()=>f.command).toThrow('开始节点不唯一');expect(f.http.saves).toHaveLength(0)
 })
 it('refuses a boundary added remotely after staging and retains the original pending id',async()=>{
  const f=await fixture([0]);await f.command.stage();const pending=f.nodes.rows[1]!['rowid']
  f.http.records['Base_WorkflowNodeDefinition']!.push({rowid:'REMOTE',workflow_id:'W1',position_type:2,node_type:'API_CALL'})
  await expect(f.command.save()).rejects.toThrow('正式边界已变化');expect(f.http.saves).toHaveLength(0);expect(f.nodes.dirtyTracking.isPendingCreate(String(pending))).toBe(true)
 })
 it('does not stage over unrelated node edits or save them with boundaries',async()=>{
  const f=await fixture([0]);f.nodes.updateEditingValue('N0','name','本地名称')
  await expect(f.command.stage()).rejects.toThrow('节点修改');expect(f.nodes.rows).toHaveLength(1);expect(f.http.saves).toHaveLength(0)
 })
})
