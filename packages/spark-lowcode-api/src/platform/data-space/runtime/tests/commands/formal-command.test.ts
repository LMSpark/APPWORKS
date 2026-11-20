import {afterEach,expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceRuntimeApi} from '../../data-space-runtime-api'
import type {DataSpaceDesignApi} from '../../../design/data-space-design-api'
const dataSets:DataSet[]=[]
afterEach(()=>dataSets.splice(0).forEach(dataSet=>dataSet.destroy()))
class CommandHttp extends HttpClientBase{
 readonly requests:RequestConfig[]=[]
 hold?:Promise<void>
 fail=false
 constructor(){super({retry:3})}
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  this.requests.push(request);await this.hold;if(this.fail)throw Error('command transport failure')
  return{status:200,statusText:'OK',headers:{},data:{Code:200,Result:{primaryKeyField:null,allowAdd:false,data:{Items:[{Code:'200',lingma_sys_params:{r:[],e:[]}}]}}}}
 }
}
function fixture(command=true){
 const model:Awaited<ReturnType<DataSpaceDesignApi['readModel']>>={id:'MODEL',metaName:'ServiceCommand',name:'ServiceCommand',sourceName:'ActualServiceCommand',sourceId:'PROVIDER',sourceType:'接口',primaryKey:'',businessMain:false,raw:{},sourceInputBindings:[{id:'PARAM',name:'key'}],fields:[{id:'OUTPUT',modelId:'MODEL',name:'Code',canonicalName:'Code',type:'varchar',primaryKey:false,description:'result',output:true,computed:false,order:0,orderType:'',raw:{}}]}
 const ds=DataSet.fromJson({scenarioId:'SPACE',tables:{Command:{modelBinding:{modelId:model.id,modelName:model.metaName},columns:[{name:'Code',type:'string'}],views:{default:{autoLoad:false,queryConfig:{pagination:'none',sourceInputMode:'direct'}},other:{autoLoad:false,queryConfig:{pagination:'none',sourceInputMode:'direct'}}}}}});dataSets.push(ds)
 const view=ds.getView('Command')!,http=new CommandHttp();let token='scope'
 const runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token,headers:{'X-AppId':'APP'}})})
 runtime.bindModelView(view,model,command?{adapter:{kind:'command'}}:{})
 return{view,http,runtime,model,expire:()=>{token='expired'}}
}
it('gates ordinary, derived and direct query execution before any service dispatch',async()=>{
 const f=fixture()
 await expect(f.view.loadFromServer()).rejects.toThrow('SPARK_MODEL_COMMAND')
 await expect(f.view.createQueryView('derived').loadFromServer()).rejects.toThrow('SPARK_MODEL_COMMAND')
 await expect(f.runtime.executeQuery(f.view,{pagination:'none',sourceInputMode:'direct',context:{key:'K'}})).rejects.toThrow('SPARK_MODEL_COMMAND')
 expect(f.http.requests).toHaveLength(0)
})
it('dispatches two independent equal commands once each without read-flight merging',async()=>{
 const f=fixture();let release!:()=>void;f.http.hold=new Promise<void>(resolve=>{release=resolve})
 const first=f.runtime.executeModelCommand(f.view,{key:'K'}),second=f.runtime.executeModelCommand(f.view,{key:'K'})
 await new Promise(resolve=>setTimeout(resolve,0));expect(f.http.requests).toHaveLength(2)
 release();const results=await Promise.all([first,second]);expect(results[0]).not.toBe(results[1])
 for(const request of f.http.requests){expect(request.retry).toBe(0);expect(request.cache).toBe(false);expect(request.data).toMatchObject({Table:[{Name:'ServiceCommand',inputParams:[{Name:'key',Value:'K'}]}]});expect(request.data).not.toHaveProperty('PageParam')}
})
it('keeps transport failures to one request even when the HTTP default retry is three',async()=>{
 const f=fixture();f.http.fail=true
 await expect(f.runtime.executeModelCommand(f.view,{key:'K'})).rejects.toThrow();expect(f.http.requests).toHaveLength(1)
})
it('rejects missing formal source input before dispatch',async()=>{
 const f=fixture();await expect(f.runtime.executeModelCommand(f.view,{})).rejects.toThrow('SPARK_SOURCE_INPUT');expect(f.http.requests).toHaveLength(0)
})
it('rejects an ordinary read binding before dispatch',async()=>{
 const f=fixture(false);await expect(f.runtime.executeModelCommand(f.view,{key:'K'})).rejects.toThrow('SPARK_MODEL_COMMAND');expect(f.http.requests).toHaveLength(0)
})
it('rejects a changed request scope before dispatch',async()=>{
 const f=fixture();f.expire();await expect(f.runtime.executeModelCommand(f.view,{key:'K'})).rejects.toThrow('STALE');expect(f.http.requests).toHaveLength(0)
})
it('retains the immutable formal binding and dispatches its registered model identity',async()=>{
 const f=fixture();expect(Reflect.set(f.view.dataTable!,'modelBinding',{modelId:'OTHER',modelName:'OtherCommand'})).toBe(false)
 await f.runtime.executeModelCommand(f.view,{key:'K'});expect(f.http.requests[0]?.data).toMatchObject({Table:[{Name:'ServiceCommand'}]})
})
it('binds another declared view in the same command mode without permitting a mode change',async()=>{
 const f=fixture(),other=f.view.dataTable!.getView('other')!
 f.runtime.bindModelView(other,f.model,{adapter:{kind:'command'}})
 await expect(other.loadFromServer()).rejects.toThrow('SPARK_MODEL_COMMAND')
 expect(()=>f.runtime.bindModelView(other,f.model)).toThrow('SPARK_MODEL_BINDING_OPTIONS');expect(f.http.requests).toHaveLength(0)
})
it('captures legal view policy without forwarding cache or UI policy as query parameters',async()=>{
 const f=fixture();f.view.queryConfig={...f.view.queryConfig,cacheType:'none',autoQuery:false}
 await f.runtime.executeModelCommand(f.view,{key:'K'});expect(f.http.requests).toHaveLength(1)
 expect(JSON.stringify(f.http.requests[0]?.data)).not.toContain('cacheType');expect(JSON.stringify(f.http.requests[0]?.data)).not.toContain('autoQuery')
})
