import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {WORKFLOW_LAYOUT_COLUMNS,WORKFLOW_LAYOUT_RESOURCE_ID,WORKFLOW_LAYOUT_TABLE,createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(initial:string|null='{"nodes":[{"id":"N1","x":1,"y":2}],"edges":[],"keep":false}'){
 let text=initial,failRead=false,loseReceipt=false,current=true
 const reads=vi.fn(async()=>{if(failRead)throw new LowcodeApiError(403,'禁止读取');if(text===null)throw new LowcodeApiError(404,'文件不存在');return text})
 const upload=vi.fn(async(input:{customPath:string;fileName:string;text:string})=>{text=input.text;if(loseReceipt){loseReceipt=false;throw new Error('response lost')}return {}})
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{[WORKFLOW_LAYOUT_TABLE]:{tableName:WORKFLOW_LAYOUT_TABLE,resourceType:'file',resourceId:WORKFLOW_LAYOUT_RESOURCE_ID,columns:[...WORKFLOW_LAYOUT_COLUMNS],views:{default:{commitMode:'staged',autoCurrentFirst:true,queryContext:{workflowId:'W1'}}}}}});sets.push(ds)
 const view=ds.getView(WORKFLOW_LAYOUT_TABLE)!
 view.bindQueryExecutor(createWorkflowLayoutExecutor({api:{readTextFile:reads},fileUpload:{uploadWorkingText:upload},assertCurrent:()=>{if(!current)throw new Error('STALE')}}),{resource:{resourceType:'file',resourceId:WORKFLOW_LAYOUT_RESOURCE_ID}})
 await view.refresh()
 return {ds,view,reads,upload,setText:(next:string|null)=>{text=next},getText:()=>text,failRead:()=>{failRead=true},loseReceipt:()=>{loseReceipt=true},stale:()=>{current=false},save:()=>ds.saveChanges({views:[{tableName:WORKFLOW_LAYOUT_TABLE,viewId:'default'}]})}
}
describe('workflow layout semantic file resource',()=>{
 it('reads the exact SysForm design file and saves only layout through the native file view',async()=>{
  const f=await fixture();expect(f.reads).toHaveBeenCalledWith({appType:'designfile',customPath:'SysForm',fileName:'W1.json'})
  f.view.updateEditingValue('W1','content','{"nodes":[],"edges":[],"keep":false}')
  await f.save();expect(f.upload).toHaveBeenCalledExactlyOnceWith({customPath:'SysForm',fileName:'W1.json',text:'{"nodes":[],"edges":[],"keep":false}'})
  expect(f.view.hasEditingChanges()).toBe(false)
 })
 it('keeps missing, denied and real empty files distinct',async()=>{
  const missing=await fixture(null);expect(missing.view.rows).toEqual([])
  const empty=await fixture('');expect(empty.view.rows[0]?.['content']).toBe('')
  empty.failRead();await expect(empty.view.loadFromServer({singleFlight:false})).rejects.toThrow('禁止读取');expect(empty.view.rows[0]?.['content']).toBe('')
 })
 it('detects concurrent file edits and refuses malformed layout without uploading',async()=>{
  const f=await fixture();f.view.updateEditingValue('W1','content','{"nodes":[],"edges":[]}');f.setText('{"nodes":[],"edges":[],"external":1}')
  await expect(f.save()).rejects.toThrow('FILE_RESOURCE_CONFLICT');expect(f.upload).not.toHaveBeenCalled()
  const bad=await fixture();bad.view.updateEditingValue('W1','content','{"nodes":{},"edges":[]}');await expect(bad.save()).rejects.toThrow('布局');expect(bad.upload).not.toHaveBeenCalled()
 })
 it('verifies an unknown file save without replaying the upload',async()=>{
  const f=await fixture();f.view.updateEditingValue('W1','content','{"nodes":[],"edges":[],"keep":false}');f.loseReceipt()
  await expect(f.save()).rejects.toThrow('response lost');expect(f.view.hasUnconfirmedSave).toBe(true)
  await f.save();expect(f.upload).toHaveBeenCalledTimes(1);expect(f.view.hasUnconfirmedSave).toBe(false)
 })
 it('creates an explicitly missing layout through DataSet and keeps its target immutable',async()=>{
  const f=await fixture(null);await f.view.addRow({content:'{"nodes":[],"edges":[]}'})
  await f.save();expect(f.getText()).toBe('{"nodes":[],"edges":[]}')
  f.view.queryContext={workflowId:'W2'};await expect(f.view.loadFromServer({singleFlight:false})).rejects.toThrow('IDENTITY')
 })
})
