import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {LowcodeApiError,LowcodeDesignApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase,type RequestConfig,type HttpResponse} from '@spark-appworks/spark-utils'
import {WORKFLOW_LAYOUT_COLUMNS,WORKFLOW_LAYOUT_RESOURCE_ID,WORKFLOW_LAYOUT_TABLE,createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(initial:string|null='{"nodes":[{"id":"N1","x":1,"y":2}],"edges":[],"keep":false}'){
 let text=initial,failRead=false,loseReceipt=false,loseDeleteReceipt=false,denyRemove=false,denyDeleteReadback=false,current=true
 const reads=vi.fn(async()=>{if(failRead)throw new LowcodeApiError(403,'禁止读取');if(text===null)throw new LowcodeApiError(404,'文件不存在');return text})
 const upload=vi.fn(async(input:{customPath:string;fileName:string;text:string})=>{text=input.text;if(loseReceipt){loseReceipt=false;throw new Error('response lost')}return {}})
 const deleteRequests:RequestConfig[]=[]
 class DeleteThenDeniedList extends HttpClientBase{protected override async executeRequest(config:RequestConfig):Promise<HttpResponse<unknown>>{deleteRequests.push(config);if(config.url==='/api/File/RemoveFile')text=null;return{data:config.url==='/api/File/RemoveFile'?{Code:200}:{Code:403,Message:'listing denied after delete'},status:200,statusText:'OK',headers:{}}}}
 const remove=vi.fn(async(locator:{appType:string;customPath:string;fileName:string})=>{if(denyDeleteReadback)return new LowcodeDesignApi({http:new DeleteThenDeniedList(),readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})}).removeFile(locator);if(denyRemove)throw new LowcodeApiError(403,'禁止删除');text=null;if(loseDeleteReceipt){loseDeleteReceipt=false;throw Error('delete response lost')}})
 const ds=DataSet.fromJson({scenarioId:'SCENE',tables:{[WORKFLOW_LAYOUT_TABLE]:{tableName:WORKFLOW_LAYOUT_TABLE,resourceType:'file',resourceId:WORKFLOW_LAYOUT_RESOURCE_ID,columns:[...WORKFLOW_LAYOUT_COLUMNS],views:{default:{commitMode:'staged',autoCurrentFirst:true,queryContext:{workflowId:'W1'}}}}}});sets.push(ds)
 const view=ds.getView(WORKFLOW_LAYOUT_TABLE)!
 view.bindQueryExecutor(createWorkflowLayoutExecutor({api:{readTextFile:reads,removeFile:remove},fileUpload:{uploadWorkingText:upload},assertCurrent:()=>{if(!current)throw new Error('STALE')}}),{resource:{resourceType:'file',resourceId:WORKFLOW_LAYOUT_RESOURCE_ID}})
 await view.refresh()
 return {ds,view,reads,upload,remove,deleteRequests,denyDeleteReadback:()=>{denyDeleteReadback=true},loseDeleteReceipt:()=>{loseDeleteReceipt=true},denyRemove:()=>{denyRemove=true},setText:(next:string|null)=>{text=next},getText:()=>text,failRead:()=>{failRead=true},loseReceipt:()=>{loseReceipt=true},stale:()=>{current=false},save:()=>ds.saveChanges({views:[{tableName:WORKFLOW_LAYOUT_TABLE,viewId:'default'}]})}
}
describe('workflow layout semantic file resource',()=>{
 it('cancels deletion locally then deletes only the captured SysForm file through the original DataSet',async()=>{
  const f=await fixture();expect(f.view.deleteActionState(f.view.rows[0]!)).toBe('enabled');await f.view.removeRow('W1');f.view.discardPendingChanges();expect(f.remove).not.toHaveBeenCalled();expect(f.getText()).not.toBeNull();await f.view.removeRow('W1');await f.save();expect(f.remove).toHaveBeenCalledExactlyOnceWith({appType:'designfile',customPath:'SysForm',fileName:'W1.json'});expect(f.upload).not.toHaveBeenCalled();expect(f.getText()).toBeNull();expect(f.view.rows).toEqual([])
 })
 it('rejects a stale file deletion baseline without calling the delete transport',async()=>{
  const f=await fixture();await f.view.removeRow('W1');const foreign='{"nodes":[],"edges":[],"external":1}';f.setText(foreign);await expect(f.save()).rejects.toThrow('FILE_RESOURCE_CONFLICT');expect(f.remove).not.toHaveBeenCalled();expect(f.getText()).toBe(foreign)
 })
 it('verifies a lost deletion response without dispatching deletion twice',async()=>{
  const f=await fixture();await f.view.removeRow('W1');f.loseDeleteReceipt();await expect(f.save()).rejects.toThrow('delete response lost');expect(f.view.hasUnconfirmedSave).toBe(true);expect(f.getText()).toBeNull();await f.save();expect(f.remove).toHaveBeenCalledTimes(1);expect(f.view.hasUnconfirmedSave).toBe(false);expect(f.view.rows).toEqual([])
 })
 it('keeps deletion pending after the real API delete succeeds but its listing is denied, then verifies without replay',async()=>{
  const f=await fixture();await f.view.removeRow('W1');f.denyDeleteReadback();await expect(f.save()).rejects.toThrow('核验');expect(f.getText()).toBeNull();expect(f.view.hasUnconfirmedSave).toBe(true);await f.save();expect(f.view.hasUnconfirmedSave).toBe(false);expect(f.view.rows).toEqual([]);expect(f.remove).toHaveBeenCalledTimes(1);expect(f.deleteRequests.map(request=>request.url)).toEqual(['/api/File/RemoveFile','/api/File/list'])
 })
 it('keeps a denied deletion known and preserves the original file',async()=>{
  const f=await fixture();const original=f.getText();await f.view.removeRow('W1');f.denyRemove();await expect(f.save()).rejects.toThrow('禁止删除');expect(f.remove).toHaveBeenCalledTimes(1);expect(f.view.hasUnconfirmedSave).toBe(false);expect(f.getText()).toBe(original);expect(f.upload).not.toHaveBeenCalled()
 })
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
