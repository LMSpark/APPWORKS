import {afterEach,describe,expect,it} from 'vitest'
import {DataSet,bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import {HttpClientBase,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {BusinessCodeAssignmentResource} from '../assignment-resource.js'
class Service extends HttpClientBase{
 body:unknown={Code:200,Result:'EXCEL-001'}
 requests:RequestConfig[]=[]
 beforeReturn?:()=>void
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{this.requests.push(request);this.beforeReturn?.();return{data:this.body,status:200,statusText:'OK',headers:{}}}
}
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
function fixture(){
 const ds=DataSet.fromJson({scenarioId:'S',tables:{Allocation:{resourceType:'command',resourceId:BusinessCodeAssignmentResource.resourceId,columns:[{name:'commandId',type:'string',isPrimaryKey:true},{name:'rowId',type:'string'},{name:'ruleId',type:'string'},{name:'code',type:'string'}],views:{default:{autoLoad:false,commitMode:'staged'},other:{autoLoad:false,commitMode:'staged'}}}}});sets.push(ds)
 const http=new Service(),scope={token:'scope',headers:{'X-AppId':'APP','tenant-id':'T'}},state={created:true,current:true}
 const resource=new BusinessCodeAssignmentResource({http,readScope:()=>scope,prepare:()=>{if(!state.created)throw Error('original added receipt missing');return{scenarioId:'S',rowId:'R/1',ruleId:'RULE',assertCurrent:()=>{if(!state.current)throw Error('original target stale')}}}})
 const view=ds.getView('Allocation')!,other=ds.getView('Allocation','other')!;bindDataSetCommandSubmit(view,resource.binding(view));bindDataSetCommandSubmit(other,resource.binding(other))
 const add=async(target=view,id='LOCAL')=>{await target.refresh();return target.addRow({commandId:id,rowId:'R/1',ruleId:'RULE'})}
 const save=()=>ds.saveChanges({views:[{tableName:'Allocation',viewId:'default'}]})
 return{ds,http,scope,state,view,other,add,save}
}
describe('declared one-shot business code assignment',()=>{
 it('assigns only the captured existing row/rule and retains the readonly receipt across refresh',async()=>{
  const f=fixture();await f.add();await f.save();expect(f.http.requests).toHaveLength(1);expect(f.http.requests[0]).toMatchObject({method:'GET',url:'/api/Codeing/GetCodeString/R%2F1/RULE',retry:0,cache:false,headers:{'X-AppId':'APP','X-FormKey':'S'}})
  expect(f.view.rows[0]?.['code']).toBe('EXCEL-001');await f.view.refresh();expect(f.view.rows[0]?.['code']).toBe('EXCEL-001');expect(f.view.fieldAccess(f.view.rows[0]!,'code').write).toBe('denied')
  await f.other.refresh();await expect(f.other.addRow({commandId:'SECOND',rowId:'R/1',ruleId:'RULE'})).rejects.toThrow('原目标已有领码意图');expect(f.http.requests).toHaveLength(1)
 })
 it('rejects allocation without the host original Added receipt before accepting input or sending HTTP',async()=>{
  const f=fixture();f.state.created=false;await expect(f.add()).rejects.toThrow('original added receipt missing');expect(f.view.rows).toEqual([]);expect(f.http.requests).toEqual([])
 })
 it('allows a new local input only after an undispatched input was cancelled',async()=>{
  const f=fixture();await f.add();f.view.discardPendingChanges();await f.add(f.other,'SECOND');expect(f.http.requests).toEqual([])
 })
 it('blocks concurrent intents for the same business row and rule across named views',async()=>{
  const f=fixture();await f.add();await f.other.refresh();await expect(f.other.addRow({commandId:'SECOND',rowId:'R/1',ruleId:'RULE'})).rejects.toThrow('原目标已有领码意图');expect(f.http.requests).toEqual([])
 })
 it('does not allow another resource instance to reset the same DataSet assignment ownership',()=>{
  const f=fixture(),second=new BusinessCodeAssignmentResource({http:f.http,readScope:()=>f.scope,prepare:()=>({scenarioId:'S',rowId:'R/1',ruleId:'RULE',assertCurrent:()=>undefined})})
  expect(()=>second.binding(f.other)).toThrow();expect(f.http.requests).toEqual([])
 })
 it.each([{Code:200,Result:{}},{Code:200,Result:' '},{Code:500,Message:'generation failed'},'EXCEL-001',{Code:0,Result:'not-the-contract'}])('keeps dispatched malformed or rejected responses unknown without allocation replay: %j',async body=>{
  const f=fixture();f.http.body=body;await f.add();await expect(f.save()).rejects.toThrow();expect(f.view.hasUnconfirmedSave).toBe(true);expect(f.view.abandonUnconfirmedSave()).toBe(false)
  await expect(f.save()).rejects.toThrow();await expect(f.view.discardAndReload()).rejects.toThrow();expect(f.http.requests).toHaveLength(1)
 })
 it('checks the original target again before dispatch',async()=>{
  const f=fixture();await f.add();f.state.current=false;await expect(f.save()).rejects.toThrow('original target stale');expect(f.view.hasUnconfirmedSave).toBe(false);expect(f.http.requests).toEqual([])
 })
 it('rejects edited input instead of rebuilding the first capture',async()=>{
  const f=fixture();await f.add();f.view.updateEditingValue('LOCAL','rowId','OTHER');await expect(f.save()).rejects.toThrow();expect(f.http.requests).toEqual([])
 })
 it('keeps a scope-changed successful response unknown and never allocates again',async()=>{
  const f=fixture();await f.add();f.http.beforeReturn=()=>{f.scope.headers['tenant-id']='OTHER'};await expect(f.save()).rejects.toThrow();expect(f.view.hasUnconfirmedSave).toBe(true);await expect(f.save()).rejects.toThrow();expect(f.http.requests).toHaveLength(1)
 })
})
