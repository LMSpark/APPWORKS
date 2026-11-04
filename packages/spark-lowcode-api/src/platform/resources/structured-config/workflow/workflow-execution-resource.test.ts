import {afterEach,describe,expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {WorkflowExecutionResource} from './workflow-execution-resource'

class Http extends HttpClientBase{
 readonly requests:RequestConfig[]=[]
 response:unknown={Code:200,Result:{workflowId:'W',nodeId:'N',status:'SUCCESS',count:1,output:[{value:0}]}}
 fail=false
 constructor(){super({retry:2,retryDelay:0})}
 protected override async executeRequest(config:RequestConfig):Promise<HttpResponse<unknown>>{
  this.requests.push(config);if(this.fail)throw Error('response lost')
  return {data:this.response,status:200,statusText:'OK',headers:{}}
 }
}
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(graph?:()=>Readonly<{workflowId:string;nodeIds:readonly string[];requiredNodeIds:readonly string[];conditional:boolean}>,prepare=async(_input:Readonly<{mode:'node'|'workflow';nodeId:string}>)=>{}){
 const ds=DataSet.fromJson({scenarioId:'S',tables:{}});sets.push(ds)
 const http=new Http();let scope='current'
 const resource=new WorkflowExecutionResource({dataSet:ds,http,workflowId:'W',prepare,...(graph?{graph}:{}),readScope:()=>({token:scope,headers:{'X-AppId':'APP'}}),guard(){if(scope!=='current')throw Error('stale')}})
 const view=resource.requests;await view.refresh()
 const save=()=>ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})
 return {ds,http,resource,view,save,invalidate:()=>{scope='other'}}
}
describe('native data workflow execution resource',()=>{
 it('passes the captured parsed command input to the pre-dispatch validator',async()=>{
  let captured:unknown
  const {view,save}=await fixture(undefined,async input=>{captured=input})
  await view.addRow({mode:'node',nodeId:'N',input:'{"START":[{"value":0}]}'})
  await save();expect(captured).toMatchObject({mode:'node',nodeId:'N',input:{START:[{value:0}]}})
 })
 it.each(['node','workflow'] as const)('validates %s inside the DataSet command adapter before dispatch',async mode=>{
  const calls:Array<Readonly<{mode:'node'|'workflow';nodeId:string}>>=[]
  const {ds,http,view}=await fixture(undefined,async input=>{calls.push(input);throw Error('invalid saved operation')})
  await view.addRow({mode,nodeId:mode==='node'?'N':'',input:mode==='node'?'{}':'[]'})
  await expect(ds.saveChanges()).rejects.toThrow('invalid saved operation')
  expect(calls).toEqual([{mode,nodeId:mode==='node'?'N':'',input:mode==='node'?{}:[]}]);expect(http.requests).toHaveLength(0);expect(view.hasUnconfirmedSave).toBe(false)
 })
 it('confirms a complete unconditional workflow only when every captured required node reports success',async()=>{
  const {http,view,save}=await fixture(()=>({workflowId:'W',nodeIds:['START','N','END'],requiredNodeIds:['START','N','END'],conditional:false}))
  http.response={Code:200,Result:['START','N','END'].map(nodeId=>({workflowId:'W',nodeId,status:'SUCCESS',count:0,output:[]}))}
  await view.addRow({mode:'workflow',nodeId:'',input:'[{"value":0,"enabled":false}]'});expect((await save()).success).toBe(true)
  expect(view.rows[0]).toMatchObject({outcome:'success',completeness:'complete'})
 })
 it.each([{conditional:false,expected:'partial'},{conditional:true,expected:'unverified'}])('does not claim workflow success from a successful subset: $expected',async({conditional,expected})=>{
  const {http,view,save}=await fixture(()=>({workflowId:'W',nodeIds:['START','N','END'],requiredNodeIds:conditional?['START']:['START','N','END'],conditional}))
  http.response={Code:200,Result:[{workflowId:'W',nodeId:'START',status:'SUCCESS',count:0,output:[]}]}
  await view.addRow({mode:'workflow',nodeId:'',input:'[]'});expect((await save()).success).toBe(true)
  expect(view.rows[0]?.['outcome']).toBe(expected);expect(view.hasUnconfirmedSave).toBe(false)
 })
 it('rejects a same-workflow result for a node outside the captured graph',async()=>{
  const {http,view,save}=await fixture(()=>({workflowId:'W',nodeIds:['N'],requiredNodeIds:['N'],conditional:false}))
  http.response={Code:200,Result:[{workflowId:'W',nodeId:'FOREIGN',status:'SUCCESS',count:0,output:[]}]}
  await view.addRow({mode:'workflow',nodeId:'',input:'[]'})
  await expect(save()).rejects.toThrow('执行结果身份');expect(view.hasUnconfirmedSave).toBe(true)
 })
 it('keeps permission receipts out of the presented execution result while preserving business values',async()=>{
  const {http,view,save}=await fixture()
  http.response={Code:200,Result:{workflowId:'W',nodeId:'N',status:'SUCCESS',count:1,output:[{value:0,lingma_sys_key:'private-receipt',children:[{value:false,lingma_sys_params:{r:['hidden']}}]}]}}
  await view.addRow({mode:'node',nodeId:'N',input:'{}'});expect((await save()).success).toBe(true)
  const text=String(view.rows[0]?.['result']);expect(text).not.toContain('private-receipt');expect(text).not.toContain('lingma_sys_')
  expect(JSON.parse(text).output).toEqual([{value:0,children:[{value:false}]}])
 })
 it('recognizes the explicit nonexistent target rejection without recording an execution unknown',async()=>{
  const {http,view,save}=await fixture();http.response={Code:1003,Message:'[1003] 节点不存在：N',Result:null}
  await view.addRow({mode:'node',nodeId:'N',input:'{}'})
  await expect(save()).rejects.toThrow('节点不存在')
  expect(view.hasUnconfirmedSave).toBe(false);expect(http.requests).toHaveLength(1)
 })
 it('submits the original node input map once through a semantic command resource, preserving zero and false',async()=>{
  const {http,view,save}=await fixture()
  await view.addRow({mode:'node',nodeId:'N',input:JSON.stringify({START:[{value:0,enabled:false,text:'',nullable:null}]})})
  expect((await save()).success).toBe(true)
  expect(http.requests).toHaveLength(1)
  expect(http.requests[0]).toMatchObject({url:'/api/Workflow/runSingleNodeTest',method:'POST',retry:0,data:{workflowId:'W',nodeId:'N',inputParams:{START:[{value:0,enabled:false,text:'',nullable:null}]}}})
  expect(view.dataTable?.resourceType).toBe('workflow-execution')
  expect(view.rows[0]).toMatchObject({outcome:'success'})
  expect(JSON.parse(String(view.rows[0]?.['result']))).toMatchObject({output:[{value:0}]})
 })
 it('keeps unknown execution captured and never repeats POST or claims a readback protocol',async()=>{
  const {http,view,save}=await fixture();http.fail=true
  await view.addRow({mode:'node',nodeId:'N',input:'{}'})
  await expect(save()).rejects.toThrow('结果未知');expect(view.hasUnconfirmedSave).toBe(true)
  await expect(save()).rejects.toThrow('服务未提供');await expect(save()).rejects.toThrow('服务未提供')
  expect(http.requests).toHaveLength(1);expect(view.hasUnconfirmedSave).toBe(true)
 })
 it('preserves one complete start row and exposes failed workflow results without calling them success',async()=>{
  const {http,view,save}=await fixture()
  http.response={Code:200,Result:[{workflowId:'W',nodeId:'N',status:'FAILED',count:0,output:null,errorMsg:'query failed'}]}
  await view.addRow({mode:'workflow',nodeId:'',input:'[{"first":0,"second":false}]'})
  expect((await save()).success).toBe(true)
  expect(http.requests[0]?.data).toEqual({workflowId:'W',startParams:[{first:0,second:false}]})
  expect(view.rows[0]?.['outcome']).toBe('failed')
 })
 it.each(['[]','{"START":[0]}'])('rejects invalid node input %s without a request',async input=>{
  const {http,view,save}=await fixture();await view.addRow({mode:'node',nodeId:'N',input})
  await expect(save()).rejects.toThrow('单节点输入');expect(http.requests).toEqual([]);expect(view.hasUnconfirmedSave).toBe(false)
 })
 it('does not accept a foreign response identity or discard the unknown captured request',async()=>{
  const {http,view,save}=await fixture();http.response={Code:200,Result:{workflowId:'OTHER',nodeId:'N',status:'SUCCESS',count:0,output:[]}}
  await view.addRow({mode:'node',nodeId:'N',input:'{}'})
  await expect(save()).rejects.toThrow('执行结果身份');expect(view.hasUnconfirmedSave).toBe(true)
  await expect(save()).rejects.toThrow('服务未提供');expect(http.requests).toHaveLength(1)
 })
})
