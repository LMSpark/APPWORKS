// @vitest-environment node
import {afterEach,expect,it} from 'vitest'
import {DataSpaceRuntimeApi,DataSet,bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import * as Api from '@/platform-adapters/api'
import {HttpClientBase,isRecord,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'

type Enterprise={rowid:string;ShortName:string;CheckState:string}
const initializationPath = '/api/Enterprise/initEnt'
class EnterpriseHttp extends HttpClientBase{
 enterprises:Enterprise[]=[{rowid:'E1',ShortName:'acme',CheckState:'0'},{rowid:'E2',ShortName:'beta',CheckState:'1'}]
 editable=['CheckState'];posts:unknown[]=[];completeOnPost=true;failure:'none'|'forbidden'|'lost'='none'
 invalidateAfterAcceptance = false
 invalidateBeforeTransport = false
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  if(request.url===initializationPath){
   this.posts.push(request.params)
   if(this.failure==='forbidden')return{status:200,statusText:'OK',headers:{},data:{Code:403,Message:'只有主租户可以初始化企业'}}
   if(this.completeOnPost)this.enterprises=this.enterprises.map(item=>isRecord(request.params)&&item.ShortName===request.params['entShortName']?{...item,CheckState:'1'}:item)
   if(this.failure==='lost')throw Error('lost receipt')
   return{status:200,statusText:'OK',headers:{},data:{Code:200,Type:'success',Result:'初始化任务提交成功，请耐心等待'}}
  }
  const body=request.data;if(!isRecord(body)||!Array.isArray(body['Table'])||!isRecord(body['Table'][0]))throw Error('bad request')
  const text=JSON.stringify(body['Table'][0]),targeted=this.enterprises.filter(item=>text.includes(`"${item.rowid}"`))
  const rows=(targeted.length?targeted:this.enterprises).map(item=>({...item,lingma_sys_params:{r:[],e:this.editable,h:[],m:[],d:false}}))
  return{status:200,statusText:'OK',headers:{},data:{Code:200,Result:{primaryKeyField:'rowid',allowAdd:false,data:{Items:rows}}}}
 }
}
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(configure:(http:EnterpriseHttp)=>void=()=>undefined){
 const filter={field:'rowid',operator:'eq',value:{Type:'GetInputParam',ParamName:'enterpriseId'}}
 const ds=DataSet.fromJson({scenarioId:'5914',tables:{
  enterpriseRows:{modelBinding:{modelId:'ENT',modelName:'Base_Enterprise_Info'},
   columns:[{name:'rowid',type:'string',isPrimaryKey:true},{name:'ShortName',type:'string'},{name:'CheckState',type:'string'}],
   views:{default:{autoLoad:false,commitMode:'staged',queryConfig:{pagination:'none'}},
    initializationReadback:{autoLoad:false,filterExpression:filter,queryConfig:{pagination:'none'}}}},
  EnterpriseInitializationRequest:{resourceType:'command',resourceId:Api.EnterpriseInitializationResource.resourceId,
   columns:[{name:'commandId',type:'string',isPrimaryKey:true},{name:'enterpriseId',type:'string'},{name:'outcome',type:'string'}],
   views:{default:{autoLoad:false,commitMode:'staged',queryConfig:{pagination:'none'}}}}}})
 sets.push(ds)
 const http=new EnterpriseHttp();configure(http)
 const readScope=()=>({token:'scope',headers:{}}),runtime=new DataSpaceRuntimeApi({http,readScope})
 const formal:Awaited<ReturnType<Api.DataSpaceDesignApi['readModel']>>={id:'ENT',name:'Base_Enterprise_Info',metaName:'Base_Enterprise_Info',
  sourceName:'Base_Enterprise_Info',sourceId:'DB',sourceType:'表',primaryKey:'rowid',businessMain:false,raw:{},
  fields:['rowid','ShortName','CheckState'].map(name=>({id:name,modelId:'ENT',name,canonicalName:name,type:'varchar',primaryKey:name==='rowid',
   description:name,output:true,computed:false,order:0,orderType:'',raw:{}}))}
 const list=ds.getView('enterpriseRows')!,readback=ds.getView('enterpriseRows','initializationReadback')!,command=ds.getView('EnterpriseInitializationRequest')!
 runtime.bindModelView(list,formal);runtime.bindModelView(readback,formal)
 const binding=new Api.EnterpriseInitializationResource({list,readback,http,readScope,assertCurrent:()=>{
  if (http.invalidateBeforeTransport) throw Error('fixture scope changed before transport')
  if (http.invalidateAfterAcceptance && http.posts.length > 0) throw Error('fixture scope changed after transport')
 }}).binding(command)
 bindDataSetCommandSubmit(command,binding)
 await list.refresh();await command.refresh()
 return{list,command,http,binding,save:()=>ds.saveChanges({views:[{tableName:'EnterpriseInitializationRequest',viewId:'default'}]})}
}

it('submits one initialization for a pending enterprise and confirms it by rereading CheckState',async()=>{
 const f=await fixture();await f.command.addRow({enterpriseId:'E1'});expect(f.http.posts).toEqual([])
 await f.save()
 expect(f.http.posts).toEqual([{entShortName:'acme'}]);expect(f.command.rows[0]).toMatchObject({enterpriseId:'E1',outcome:'confirmed'})
})
it('keeps an accepted but unfinished initialization unknown and confirms it later without resending',async()=>{
 const f=await fixture(http=>{http.completeOnPost=false});await f.command.addRow({enterpriseId:'E1'})
 await expect(f.save()).rejects.toThrow('结果未知');expect(f.command.hasUnconfirmedSave).toBe(true)
 await expect(f.save()).rejects.toThrow('结果未知');expect(f.http.posts).toHaveLength(1)
 f.http.enterprises=f.http.enterprises.map(item=>item.rowid==='E1'?{...item,CheckState:'1'}:item)
 await f.save();expect(f.http.posts).toHaveLength(1);expect(f.command.hasUnconfirmedSave).toBe(false)
 expect(f.binding.allowAbandonUnconfirmed).toBe(false)
})
it('treats a lost receipt as unknown and never repeats the request',async()=>{
 const f=await fixture(http=>{http.failure='lost';http.completeOnPost=false});await f.command.addRow({enterpriseId:'E1'})
 await expect(f.save()).rejects.toThrow('禁止重发');await expect(f.save()).rejects.toThrow('结果未知')
 expect(f.http.posts).toHaveLength(1);expect(f.command.hasUnconfirmedSave).toBe(true)
})
it('returns a rejected dispatch to a cancellable state',async()=>{
 const f=await fixture(http=>{http.failure='forbidden'});await f.command.addRow({enterpriseId:'E1'})
 await expect(f.save()).rejects.toThrow('主租户');expect(f.command.hasUnconfirmedSave).toBe(false)
 f.command.discardPendingChanges();expect(f.command.rows).toEqual([])
})
it.each([
 ['an already admitted enterprise','E2',(_http:EnterpriseHttp)=>undefined,'ENTERPRISE_INIT_STATE'],
 ['a non-writable audit state','E1',(http:EnterpriseHttp)=>{http.editable=[]},'ENTERPRISE_INIT_PERMISSION'],
 ['an enterprise outside the list','E9',(_http:EnterpriseHttp)=>undefined,'ENTERPRISE_INIT_SOURCE'],
])('refuses %s before staging',async(_label,enterpriseId,configure,code)=>{
 const f=await fixture(configure)
 await expect(f.command.addRow({enterpriseId})).rejects.toThrow(code);expect(f.command.rows).toEqual([]);expect(f.http.posts).toEqual([])
})
it('rejects a source changed after capture before dispatch',async()=>{
 const f=await fixture();await f.command.addRow({enterpriseId:'E1'});f.list.rows[0]!['ShortName']='other'
 await expect(f.save()).rejects.toThrow(/DATA_VIEW_READ_ROW|ENTERPRISE_INIT/);expect(f.http.posts).toEqual([])
})

it('classifies a request interceptor rejection as unsent', async () => {
  const f = await fixture()
  f.http.interceptors.request.use({onRequest: request => {
    if (request.url === initializationPath) throw Error('fixture rejected before transport')
    return request
  }})
  await f.command.addRow({enterpriseId: 'E1'})
  await expect(f.save()).rejects.toThrow('fixture rejected before transport')
  expect(f.http.posts).toHaveLength(0)
  expect(f.command.hasUnconfirmedSave).toBe(false)
  expect(f.command.dataSet?.saveJournal.views).toMatchObject([{state: 'not-applied'}])
})

it('retains the original batch when the guard changes after acceptance', async () => {
  const f = await fixture(http => { http.invalidateAfterAcceptance = true })
  await f.command.addRow({enterpriseId: 'E1'})
  await expect(f.save()).rejects.toThrow('fixture scope changed after transport')
  expect(f.http.posts).toHaveLength(1)
  expect(f.command.hasUnconfirmedSave).toBe(true)
  expect(f.command.dataSet?.saveJournal.views).toMatchObject([{state: 'unknown'}])
  f.http.invalidateAfterAcceptance = false
  await f.save()
  expect(f.http.posts).toHaveLength(1)
  expect(f.command.hasUnconfirmedSave).toBe(false)
})

it('rechecks the original scope immediately before transport', async () => {
  const f = await fixture()
  f.http.interceptors.request.use({onRequest: request => {
    if (request.url === initializationPath) f.http.invalidateBeforeTransport = true
    return request
  }})
  await f.command.addRow({enterpriseId: 'E1'})
  await expect(f.save()).rejects.toThrow('fixture scope changed before transport')
  expect(f.http.posts).toHaveLength(0)
  expect(f.command.hasUnconfirmedSave).toBe(false)
})
