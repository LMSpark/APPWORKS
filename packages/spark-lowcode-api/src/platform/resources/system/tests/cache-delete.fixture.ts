import {DataSet} from '@spark-appworks/spark-data'
import * as Api from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase,isRecord,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
type CacheDeleteFixtureOptions=Readonly<{keyless?:boolean;allowDelete?:boolean}>
export class CacheDeleteHttp extends HttpClientBase{
 keys=['A','B'];deletes=0;lostReceipt=false;keyless=false;allowDelete=true
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  const body=request.data;if(!isRecord(body)||!Array.isArray(body['Table'])||!isRecord(body['Table'][0]))throw Error('bad request')
  const table=body['Table'][0]
  let rows:Record<string,unknown>[]
  if(table['Name']==='CacheInfo')rows=this.keys.map(cacheKey=>({
   ...(this.keyless?{}:{sourceId:`ROW-${cacheKey}`}),cacheKey,lingma_sys_params:{r:[],e:[],d:this.allowDelete},
  }))
  else if(table['Name']==='DeleteCache'){
   const inputs=table['inputParams'];if(!Array.isArray(inputs))throw Error('missing inputs')
   const key=inputs.filter(isRecord).find(item=>item['Name']==='key')?.['Value'];this.deletes++;this.keys=this.keys.filter(value=>value!==key)
   if(this.lostReceipt)throw Error('lost receipt')
   rows=[{Code:'200',Type:'success',lingma_sys_params:{r:[],e:[]}}]
  }else throw Error('unexpected model')
  const primaryKeyField=table['Name']==='CacheInfo'&&!this.keyless?'sourceId':null
  return{status:200,statusText:'OK',headers:{},data:{Code:200,Result:{primaryKeyField,allowAdd:false,data:{Items:rows}}}}
 }
}
export async function cacheDeleteFixture(options:CacheDeleteFixtureOptions={}){
 const keyless=options.keyless===true
 const ds=DataSet.fromJson({scenarioId:'SPACE',tables:{List:{modelBinding:{modelId:'LIST',modelName:'CacheInfo'},columns:[...(keyless?[]:[{name:'sourceId',type:'string',isPrimaryKey:true}]),{name:'cacheKey',type:'string'}],views:{default:{autoLoad:false,queryConfig:{pagination:'none'}}}},Definition:{modelBinding:{modelId:'DELETE',modelName:'DeleteCache'},columns:[{name:'Code',type:'string'},{name:'Type',type:'string'}],views:{default:{autoLoad:false,queryConfig:{pagination:'none',sourceInputMode:'direct',cacheType:'none'}}}},Request:{resourceType:'command',resourceId:'cache-delete',columns:[{name:'commandId',type:'string',isPrimaryKey:true},{name:'key',type:'string'},{name:'outcome',type:'string'}],views:{default:{autoLoad:false,commitMode:'staged',queryConfig:{pagination:'none'}}}}}})
 const http=new CacheDeleteHttp(),runtime=new Api.DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 http.keyless=keyless;http.allowDelete=options.allowDelete!==false
 const formal=(id:string,name:string,names:string[]):Awaited<ReturnType<Api.DataSpaceDesignApi['readModel']>>=>({id,name,metaName:name,sourceName:name,sourceId:'PROVIDER',sourceType:'接口',primaryKey:id==='LIST'&&!keyless?'sourceId':'',businessMain:false,raw:{},...(id==='DELETE'?{sourceInputBindings:[{id:'KEY',name:'key'}]}:{}),fields:names.map(name=>({id:name,modelId:id,name,canonicalName:name,type:'varchar',primaryKey:id==='LIST'&&!keyless&&name==='sourceId',description:name,output:true,computed:false,order:0,orderType:'',raw:{}}))})
 const list=ds.getView('List')!,definition=ds.getView('Definition')!,command=ds.getView('Request')!
 runtime.bindModelView(list,formal('LIST','CacheInfo',keyless?['cacheKey']:['sourceId','cacheKey']));runtime.bindModelView(definition,formal('DELETE','DeleteCache',['Code','Type']),{adapter:{kind:'command'}})
 const resource=new Api.CacheDeleteCommandResource({list,definition,runtime,resourceId:'cache-delete',assertCurrent:()=>undefined}),binding=resource.binding(command)
 const {bindDataSetCommandSubmit}=await import('@spark-appworks/spark-data');bindDataSetCommandSubmit(command,binding)
 await list.refresh();list.setCurrentRow(list.rows[0]!);await command.refresh()
 return{ds,list,definition,command,http,binding,save:()=>ds.saveChanges({views:[{tableName:'Request',viewId:'default'}]})}
}
