import {afterEach,expect,it} from 'vitest'
import * as Api from '@spark-appworks/spark-lowcode-api'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase,isRecord,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
class CacheHttp extends HttpClientBase{
 readonly requests:RequestConfig[]=[]
 before?: (index:number)=>void
 failSecond=false
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  this.requests.push(request);this.before?.(this.requests.length);if(this.failSecond&&this.requests.length===2)throw Error('lookahead failed')
  const body=request.data;if(!isRecord(body)||!Array.isArray(body['Table'])||!isRecord(body['Table'][0]))throw Error('bad query')
  const table=body['Table'][0],inputs=table['inputParams'];if(!Array.isArray(inputs))throw Error('missing inputs')
  const values=Object.fromEntries(inputs.filter(isRecord).map(item=>[String(item['Name']),item['Value']])),page=Number(values['page']),size=Number(values['size'])
  const records=['A','B','C'].map(key=>({cacheKey:key,cacheValue:'opaque',lingma_sys_params:{r:[],e:[],h:['cacheValue']}}))
  return{status:200,statusText:'OK',headers:{},data:{Code:200,Result:{primaryKeyField:null,data:{Items:records.slice((page-1)*size,page*size)}}}}
 }
}
function fixture(){
 const ds=DataSet.fromJson({scenarioId:'SPACE',tables:{Cache:{modelBinding:{modelId:'CACHE',modelName:'CacheInfo'},columns:[{name:'cacheKey',type:'string'},{name:'cacheValue',type:'string'}],views:{default:{pageSize:2,autoLoad:false,queryContext:{prefix:'USER_INFO'},queryConfig:{pagination:'paged',cacheType:'none'}}}}}});sets.push(ds)
 const view=ds.getView('Cache')!,http=new CacheHttp(),runtime=new Api.DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const model:Awaited<ReturnType<Api.DataSpaceDesignApi['readModel']>>={id:'CACHE',metaName:'CacheInfo',name:'CacheInfo',sourceName:'GetCache',sourceId:'PROVIDER',sourceType:'接口',primaryKey:'',businessMain:false,raw:{},sourceInputBindings:['prefix','page','size'].map(name=>({id:name,name})),fields:['cacheKey','cacheValue'].map(name=>({id:name,modelId:'CACHE',name,canonicalName:name,type:'varchar',primaryKey:false,description:name,output:true,computed:false,order:0,orderType:'',raw:{}}))}
 runtime.bindModelView(view,model,{adapter:new Api.CachePageReadAdapter({scenarioId:'SPACE',modelId:'CACHE',modelName:'CacheInfo'})})
 return{view,http}
}
it('maps native pages to source input and confirms lookahead without ingesting probe rows or forging total',async()=>{
 const f=fixture();await f.view.refresh();expect(f.view.rows.map(row=>row['cacheKey'])).toEqual(['A','B']);expect(f.view.nextPageAvailable).toBe(true);expect(f.view.countReported).toBe(false);expect(f.view.primaryKey).toBe('')
 expect(f.view.readSnapshot().rows[0]).not.toHaveProperty('cacheValue');expect(f.http.requests).toHaveLength(2)
 for(const [index,request]of f.http.requests.entries()){
  expect(request.data).not.toHaveProperty('PageParam');expect(request.data).toMatchObject({Table:[{inputParams:[{Name:'prefix',Value:'USER_INFO'},{Name:'page',Value:String(index+1)},{Name:'size',Value:'2'}]}]})
 }
 await f.view.setPage(2);expect(f.view.rows.map(row=>row['cacheKey'])).toEqual(['C']);expect(f.view.nextPageAvailable).toBe(false);expect(f.http.requests).toHaveLength(4)
})
it('does not turn lookahead failure into a false last-page claim',async()=>{
 const f=fixture();f.http.failSecond=true;await expect(f.view.loadFromServer()).rejects.toThrow('lookahead failed');expect(f.view.rows).toEqual([]);expect(f.view.nextPageAvailable).toBeUndefined()
})
it('rejects a changed query input before accepting either page',async()=>{
 const f=fixture();f.http.before=index=>{if(index===1)f.view.queryContext={prefix:'CHANGED'}}
 await expect(f.view.loadFromServer()).rejects.toThrow('CACHE_PAGE_STALE');expect(f.http.requests).toHaveLength(1);expect(f.view.rows).toEqual([])
})
