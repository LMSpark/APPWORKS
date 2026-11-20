import {afterEach,expect,it} from 'vitest'
import {DataSet,bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import * as Api from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase,isRecord,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'

type Row=Record<string,string>
class InterfaceHttp extends HttpClientBase{
 interfaces:Row[]=[{rowid:'I1',ProviderID:'P1',Name:'weather',RequestType:'Body/Json',resultPath:'$.data'},{rowid:'I2',ProviderID:'P1',Name:'upload',RequestType:'FormData',resultPath:''}]
 params:Row[]=[{parid:'A',pid:'I1',parname:'city',parzdtype:'string',testvalue:'wuhan'},{parid:'B',pid:'I1',parname:'opts',parzdtype:'object',testvalue:'{"unit":"c"}'},
  {parid:'C',pid:'I2',parname:'name',parzdtype:'string',testvalue:'a.txt'}]
 calls:RequestConfig[]=[];failure:'none'|'rejected'|'lost'='none'
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  if(request.url?.startsWith('/api/dataInterface/callApi/')){
   this.calls.push(request)
   if(this.failure==='rejected')return{status:200,statusText:'OK',headers:{},data:{Code:500,Message:'接口未登记'}}
   if(this.failure==='lost')throw Error('lost receipt')
   return{status:200,statusText:'OK',headers:{},data:{Code:200,Result:{temp:20}}}
  }
  const body=request.data;if(!isRecord(body)||!Array.isArray(body['Table'])||!isRecord(body['Table'][0]))throw Error('bad request')
  const source=body['Table'][0]['Name']==='Base_DataServiceInterface'?this.interfaces:this.params
  const rows=source.map(item=>({...item,lingma_sys_params:{r:[],e:Object.keys(item),h:[],m:[],d:false}}))
  return{status:200,statusText:'OK',headers:{},data:{Code:200,Result:{primaryKeyField:source===this.interfaces?'rowid':'parid',allowAdd:true,data:{Items:rows}}}}
 }
}
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
const formal=(id:string,name:string,primaryKey:string,fields:string[]):Awaited<ReturnType<Api.DataSpaceDesignApi['readModel']>>=>({id,name,metaName:name,
 sourceName:name,sourceId:'DB',sourceType:'表',primaryKey,businessMain:false,raw:{},
 fields:fields.map(field=>({id:field,modelId:id,name:field,canonicalName:field,type:'varchar',primaryKey:field===primaryKey,
  description:field,output:true,computed:false,order:0,orderType:'',raw:{}}))})
async function fixture(configure:(http:InterfaceHttp)=>void=()=>undefined){
 const view={autoLoad:false,commitMode:'staged',queryConfig:{pagination:'none'}}
 const ifields=['rowid','ProviderID','Name','RequestType','resultPath'],pfields=['parid','pid','parname','parzdtype','testvalue']
 const ds=DataSet.fromJson({scenarioId:'EC84',tables:{
  Base_DataServiceInterface:{modelBinding:{modelId:'I',modelName:'Base_DataServiceInterface'},columns:ifields.map(name=>({name,type:'string',isPrimaryKey:name==='rowid'})),views:{default:view}},
  _Base_ParamList:{modelBinding:{modelId:'P',modelName:'_Base_ParamList'},columns:pfields.map(name=>({name,type:'string',isPrimaryKey:name==='parid'})),views:{default:view}},
  InterfaceCallRequest:{resourceType:'command',resourceId:Api.RegisteredInterfaceCallResource.resourceId,
   columns:[{name:'commandId',type:'string',isPrimaryKey:true},{name:'interfaceId',type:'string'},{name:'resultFilter',type:'string'},{name:'result',type:'string'}],
   views:{default:view}}}})
 sets.push(ds)
 const http=new InterfaceHttp();configure(http)
 const readScope=()=>({token:'scope',headers:{}}),runtime=new Api.DataSpaceRuntimeApi({http,readScope})
 const interfaces=ds.getView('Base_DataServiceInterface')!,parameters=ds.getView('_Base_ParamList')!,command=ds.getView('InterfaceCallRequest')!
 runtime.bindModelView(interfaces,formal('I','Base_DataServiceInterface','rowid',ifields));runtime.bindModelView(parameters,formal('P','_Base_ParamList','parid',pfields))
 const binding=new Api.RegisteredInterfaceCallResource({interfaces,parameters,http,readScope,assertCurrent:()=>undefined}).binding(command)
 bindDataSetCommandSubmit(command,binding)
 await interfaces.refresh();await parameters.refresh();await command.refresh()
 return{interfaces,parameters,command,http,binding,save:()=>ds.saveChanges({views:[{tableName:'InterfaceCallRequest',viewId:'default'}]})}
}

it('calls a json interface once with current test values and keeps the output text as the receipt',async()=>{
 const f=await fixture()
 f.parameters.updateEditingValue('A','testvalue','beijing')
 await f.command.addRow({interfaceId:'I1',resultFilter:'$.data'});expect(f.http.calls).toEqual([])
 await f.save()
 expect(f.http.calls).toHaveLength(1)
 expect(f.http.calls[0]).toMatchObject({url:'/api/dataInterface/callApi/Body',params:{qy_provider:'P1',qy_api:'weather'},
  data:{qy_client_param:{city:'beijing',opts:{unit:'c'}},qy_is_filter:'$.data'}})
 expect(f.command.rows[0]).toMatchObject({interfaceId:'I1',result:JSON.stringify({temp:20},null,2)})
})
it('sends form fields and the result filter as FormData for a FormData interface',async()=>{
 const f=await fixture();await f.command.addRow({interfaceId:'I2'});await f.save()
 const data=f.http.calls[0]?.data
 expect(f.http.calls[0]?.url).toBe('/api/dataInterface/callApi/FormData')
 expect(data instanceof FormData?[...data.entries()]:data).toEqual([['name','a.txt'],['qy_is_filter','$']])
})
it('refuses unsaved interface identity and invalid json test values before staging',async()=>{
 const f=await fixture(http=>{http.params[1]={...http.params[1]!,testvalue:'{bad'}})
 await expect(f.command.addRow({interfaceId:'I1'})).rejects.toThrow('不是有效JSON')
 f.interfaces.updateEditingValue('I2','Name','renamed')
 await expect(f.command.addRow({interfaceId:'I2'})).rejects.toThrow('INTERFACE_CALL_SOURCE')
 expect(f.command.rows).toEqual([]);expect(f.http.calls).toEqual([])
})
it('keeps a rejected call failed and never resends it',async()=>{
 const f=await fixture(http=>{http.failure='rejected'});await f.command.addRow({interfaceId:'I1'})
 await expect(f.save()).rejects.toThrow('接口未登记');await expect(f.save()).rejects.toThrow('已失败')
 expect(f.http.calls).toHaveLength(1);expect(f.command.hasUnconfirmedSave).toBe(false)
 f.command.discardPendingChanges();expect(f.command.rows).toEqual([])
})
it('treats a lost receipt as unknown, never resends it and allows abandoning it',async()=>{
 const f=await fixture(http=>{http.failure='lost'});await f.command.addRow({interfaceId:'I1'})
 await expect(f.save()).rejects.toThrow('不重新发送');await expect(f.save()).rejects.toThrow('结果未知')
 expect(f.http.calls).toHaveLength(1);expect(f.command.hasUnconfirmedSave).toBe(true);expect(f.binding.allowAbandonUnconfirmed).toBe(true)
})
