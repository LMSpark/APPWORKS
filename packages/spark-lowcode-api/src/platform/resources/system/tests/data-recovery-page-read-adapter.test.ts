import {afterEach,expect,it} from 'vitest'
import * as Api from '@spark-appworks/spark-lowcode-api'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase,isRecord,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
const envelope=['Code','Type','Message','Result']
class RecoveryHttp extends HttpClientBase{
 readonly requests:RequestConfig[]=[]
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  this.requests.push(request)
  const body=request.data;if(!isRecord(body)||!Array.isArray(body['Table'])||!isRecord(body['Table'][0]))throw Error('bad query')
  const inputs=body['Table'][0]['inputParams'];if(!Array.isArray(inputs))throw Error('missing inputs')
  const values=Object.fromEntries(inputs.filter(isRecord).map(item=>[String(item['Name']),item['Value']])),paging=values['pageParam']
  if(!isRecord(paging))throw Error('missing pageParam')
  const index=Number(paging['index']),size=Number(paging['size']),records=['A','B','C'].map(id=>({id,title:`deleted ${id}`}))
  return{status:200,statusText:'OK',headers:{},data:{Code:200,Result:{data:{Code:200,Message:'操作成功',Type:'success',Result:{Count:3,hasNextPage:index*size<3,Items:records.slice((index-1)*size,index*size)}}}}}
 }
}
function fixture(context:Record<string,unknown>={table:'pmp_work_item',dbname:'pmp',dbid:'DB'}){
 const ds=DataSet.fromJson({scenarioId:'SPACE',tables:{Deleted:{modelBinding:{modelId:'DELETED',modelName:'获取软删除的数据'},columns:envelope.map(name=>({name,type:'string'})),
  views:{default:{pageSize:2,autoLoad:false,queryContext:context,queryConfig:{pagination:'paged',cacheType:'none',sourceInputMode:'direct'}}}}}});sets.push(ds)
 const view=ds.getView('Deleted')!,http=new RecoveryHttp(),runtime=new Api.DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const model:Awaited<ReturnType<Api.DataSpaceDesignApi['readModel']>>={id:'DELETED',metaName:'获取软删除的数据',name:'获取软删除的数据',sourceName:'GetDeleted',sourceId:'PROVIDER',sourceType:'接口',primaryKey:'',businessMain:false,raw:{},
  sourceInputBindings:['table','dbname','dbid','pageParam'].map(name=>({id:name,name})),
  fields:envelope.map(name=>({id:name,modelId:'DELETED',name,canonicalName:name,type:'varchar',primaryKey:false,description:name,output:true,computed:false,order:0,orderType:'',raw:{}}))}
 runtime.bindModelView(view,model,{adapter:new Api.DataRecoveryPageReadAdapter({scenarioId:'SPACE',modelId:'DELETED',modelName:'获取软删除的数据'})})
 return{view,http}
}
it('maps native pages to the pageParam source input and keeps dynamic table fields of the envelope result',async()=>{
 const f=fixture();await f.view.refresh()
 expect(f.view.rows.map(row=>row['id'])).toEqual(['A','B']);expect(f.view.rows[0]?.['title']).toBe('deleted A');expect(f.view.total).toBe(3);expect(f.view.countReported).toBe(true)
 expect(f.http.requests[0]?.data).toMatchObject({Table:[{inputParams:[{Name:'table',Value:'pmp_work_item'},{Name:'dbname',Value:'pmp'},{Name:'dbid',Value:'DB'},{Name:'pageParam',Value:{index:1,size:2}}]}]})
 await f.view.setPage(2);expect(f.view.rows.map(row=>row['id'])).toEqual(['C']);expect(f.http.requests).toHaveLength(2)
 expect(f.http.requests[1]?.data).toMatchObject({Table:[{inputParams:[{},{},{},{Name:'pageParam',Value:{index:2,size:2}}]}]})
})
it('rejects a query before the table and database inputs are complete',async()=>{
 const f=fixture({table:'pmp_work_item',dbname:'',dbid:'DB'})
 await expect(f.view.loadFromServer()).rejects.toThrow('DATA_RECOVERY_PAGE_INPUT');expect(f.http.requests).toHaveLength(0)
})
