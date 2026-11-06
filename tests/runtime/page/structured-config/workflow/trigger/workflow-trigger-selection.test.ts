import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {applyWorkflowTriggerSelection} from '@/lowcode/resources/structured-config/workflow-definition/trigger/trigger-selection'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {WORKFLOW,topicModels,topicTexts} from '../../catalog/formal-topic.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(p=>p.dispose()))
async function fixture(){
 const http=new ApiBackend();http.primaryKeys['_base_dbInfo']='Id'
 http.records={Base_WorkflowDefinition:[{rowid:'W1',name:'流程',status:'2',version:'1',dbName:'old_db',tblName:'OldTable',tblid:'OLD',filter:'old-filter'}],workflowStatus:[{rowid:'S2',val:'2',txt:'停用'}],_base_dbInfo:[{Id:'D1',Name:'physical_db',Remark:'显示名称'},{Id:'D2',Name:'other_db'}],_Base_TblList:[{rowid:'T1',dbid:'D1',tblname:'Orders',tbldesc:'订单'},{rowid:'T2',dbid:'D2',tblname:'Other',tbldesc:'另一表'}]}
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(WORKFLOW,topicTexts[WORKFLOW]!),space:{dataSpaceId:WORKFLOW,name:'工作流目录'},models:topicModels(WORKFLOW),relations:[]}).dataSet
 const page=new PageRuntime({pageId:'trigger-test',scenarioIds:[WORKFLOW],loadScenario:async()=>ds});pages.push(page);await page.load()
 const edit=ds.getView('Base_WorkflowDefinition','edit')!,db=ds.getView('_base_dbInfo')!,tables=ds.getView('_Base_TblList')!
 edit.queryContext={definitionId:'W1'};await edit.refresh();await db.refresh()
 db.setSelectedRows([db.rows.find(row=>row['Id']==='D1')!]);await tables.refresh()
 tables.setSelectedRows([tables.rows.find(row=>row['rowid']==='T1')!])
 return{ds,http,edit,db,tables}
}
describe('workflow trigger selection',()=>{
 it('accepts an unchanged selection without an empty checkpoint or disturbing unrelated drafts',async()=>{
  const f=await fixture();applyWorkflowTriggerSelection(f.ds,'W1')
  f.edit.updateEditingValue('W1','name','keep-draft')
  const checkpoint=vi.spyOn(f.edit,'createEditingCheckpoint'),write=vi.spyOn(f.edit,'updateEditingValue')
  const before={...f.edit.getEditingRow('W1')}
  expect(()=>applyWorkflowTriggerSelection(f.ds,'W1')).not.toThrow()
  expect(checkpoint).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled()
  expect(f.edit.getEditingRow('W1')).toEqual(before);expect(f.http.saves).toEqual([])
 })
 it('writes the database name and table identity atomically to the original edit view, clears filter and cancels back',async()=>{
  const f=await fixture();f.edit.updateEditingValue('W1','name','unrelated-draft')
  applyWorkflowTriggerSelection(f.ds,'W1')
  expect(f.edit.getEditingRow('W1')).toMatchObject({name:'unrelated-draft',dbName:'physical_db',tblName:'Orders',tblid:'T1',filter:''})
  expect(f.http.saves).toEqual([])
  f.edit.discardPendingChanges(['W1']);expect(f.edit.getEditingRow('W1')).toMatchObject({dbName:'old_db',tblName:'OldTable',tblid:'OLD',filter:'old-filter'})
 })
 it('rejects a table from the previously selected database without changing the target',async()=>{
  const f=await fixture(),before={...f.edit.getEditingRow('W1')}
  f.db.setSelectedRows([f.db.rows.find(row=>row['Id']==='D2')!])
  expect(()=>applyWorkflowTriggerSelection(f.ds,'W1')).toThrow()
  expect(f.edit.getEditingRow('W1')).toEqual(before);expect(f.http.saves).toEqual([])
 })
 it('checks every changed target field before writing any part of the mapping',async()=>{
  const f=await fixture(),before={...f.edit.getEditingRow('W1')},access=f.edit.fieldAccess.bind(f.edit)
  vi.spyOn(f.edit,'fieldAccess').mockImplementation((row,field)=>field==='filter'?{...access(row,field),write:'denied'}:access(row,field))
  expect(()=>applyWorkflowTriggerSelection(f.ds,'W1')).toThrow('不可写')
  expect(f.edit.getEditingRow('W1')).toEqual(before);expect(f.http.saves).toEqual([])
 })
 it('restores only the mapping checkpoint when a field write fails, preserving unrelated draft fields',async()=>{
  const f=await fixture();f.edit.updateEditingValue('W1','name','keep-draft')
  const before={...f.edit.getEditingRow('W1')},write=f.edit.updateEditingValue.bind(f.edit)
  vi.spyOn(f.edit,'updateEditingValue').mockImplementation((id,field,value)=>{if(field==='filter')throw Error('field callback rejected');return write(id,field,value)})
  expect(()=>applyWorkflowTriggerSelection(f.ds,'W1')).toThrow('field callback rejected')
  expect(f.edit.getEditingRow('W1')).toEqual(before);expect(f.http.saves).toEqual([])
 })
 it('rejects the previous page selection after a new query result replaces it',async()=>{
  const f=await fixture(),before={...f.edit.getEditingRow('W1')}
  f.http.records['_Base_TblList']=[{rowid:'T3',dbid:'D1',tblname:'Another',tbldesc:'下一页'}]
  f.tables.page=2;await f.tables.refresh()
  expect(()=>applyWorkflowTriggerSelection(f.ds,'W1')).toThrow()
  expect(f.edit.getEditingRow('W1')).toEqual(before);expect(f.http.saves).toEqual([])
 })
})
