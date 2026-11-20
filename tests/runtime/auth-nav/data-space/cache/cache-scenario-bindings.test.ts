import {afterEach,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase,isRecord,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createCacheScenarioBindings} from '@/lowcode/resources/system/cache-management/runtime-bindings'
import {cacheScenarioModels} from './cache-scenario.fixture'

const scene='348D1C50B204C779AABBE2489C5E2FDF',sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
function config(){return new ScenarioViewConfig(scene,readFileSync('config/pages/system/cache-management/pagedata.json','utf8'))}
class NoNetwork extends HttpClientBase{
 calls=0
 protected override async executeRequest(_request:RequestConfig):Promise<never>{this.calls++;throw Error('Unexpected network')}
}
it('assembles configured cache siblings and a local staged command without fake model identities or service calls',async()=>{
 const http=new NoNetwork(),runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})}),definition=config()
 const bindings=createCacheScenarioBindings({config:definition,runtime,assertCurrent:()=>undefined})
 const result=new LowcodeDataSpaceAssembler(runtime,http).assemble({config:definition,space:{dataSpaceId:scene,name:'缓存管理'},models:cacheScenarioModels(),relations:[],...bindings})
 sets.push(result.dataSet)
 const ds=result.dataSet,list=ds.getView('CacheEntries')!,command=ds.getView('CacheDeleteRequest')!,deleteDefinition=ds.getView('CacheDeleteDefinition')!
 expect(list.primaryKey).toBe('');expect(deleteDefinition.primaryKey).toBe('')
 expect(command.dataTable?.modelBinding).toBeUndefined();expect(command.dataTable?.resourceType).toBe('command')
 await command.refresh();expect(command.rows).toEqual([])
 await expect(deleteDefinition.loadFromServer()).rejects.toThrow('SPARK_MODEL_COMMAND')
 await expect(command.addRow({key:'uncaptured'})).rejects.toThrow('CACHE_DELETE_SOURCE')
 expect(command.rows).toEqual([]);expect(http.calls).toBe(0)
 expect(ds.viewCascades).toEqual(expect.arrayContaining([expect.objectContaining({parentTable:'CacheCategories',childTable:'CacheEntries',inputBindings:[{sourceField:'val',target:'queryContext.prefix'}]})]))
})
it('does not install cache bindings for another scenario',()=>{
 const http=new NoNetwork(),runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{}})})
 expect(createCacheScenarioBindings({config:new ScenarioViewConfig('OTHER',JSON.stringify({scenarioId:'OTHER',tables:{}})),runtime,assertCurrent:()=>undefined})).toEqual({})
})
it('rejects a mismatched declared model before assembly or service reads',()=>{
 const value=structuredClone(config().toJSON()),tables=value['tables'] as Record<string,Record<string,unknown>>
 tables['CacheEntries']!['modelBinding']={modelId:'wrong',modelName:'获取缓存信息'}
 const http=new NoNetwork(),runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{}})})
 expect(()=>createCacheScenarioBindings({config:new ScenarioViewConfig(scene,JSON.stringify(value)),runtime,assertCurrent:()=>undefined})).toThrow('CACHE_SCENARIO_BINDING')
 expect(http.calls).toBe(0)
})

it('uses the configured category cascade and native pages, but rejects keyless deletion',async()=>{
 class CacheHttp extends HttpClientBase{
  requests:RequestConfig[]=[];deletes=0;keys=['A','B','C']
  protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
   this.requests.push(request)
   const body=request.data
   if(!isRecord(body)||!Array.isArray(body['Table'])||!isRecord(body['Table'][0]))throw Error('bad query')
   const table=body['Table'][0]
   let rows:Record<string,unknown>[]
   if(table['Name']==='缓存过滤条件')rows=[{txt:'用户信息',val:'USER_INFO',rowid:'C1',ordIdx:1}]
   else{
    const inputs=table['inputParams']
    if(!Array.isArray(inputs))throw Error('missing original inputs')
    const values=Object.fromEntries(inputs.filter(isRecord).map(item=>[String(item['Name']),item['Value']]))
    if(table['Name']==='获取缓存信息'){
     expect(values['prefix']).toBe('USER_INFO');expect(body).not.toHaveProperty('PageParam')
     const page=Number(values['page']),size=Number(values['size'])
     rows=this.keys.slice((page-1)*size,page*size).map(cacheKey=>({cacheKey,cacheValue:'hidden',lingma_sys_params:{r:[],e:[],h:['cacheValue'],d:true}}))
    }else if(table['Name']==='根据键删除缓存中的值'){
     this.deletes++;this.keys=this.keys.filter(key=>key!==values['key']);rows=[{Code:'200',Type:'success'}]
    }else throw Error('unexpected model')
   }
   return{status:200,statusText:'OK',headers:{},data:{Code:200,Result:{primaryKeyField:null,data:{Items:rows}}}}
  }
 }
 const http=new CacheHttp(),runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})}),definition=config()
 const {dataSet:ds}=new LowcodeDataSpaceAssembler(runtime,http).assemble({config:definition,space:{dataSpaceId:scene,name:'缓存管理'},models:cacheScenarioModels(),relations:[],...createCacheScenarioBindings({config:definition,runtime,assertCurrent:()=>undefined})})
 sets.push(ds)
 const list=ds.getView('CacheEntries')!,categories=ds.getView('CacheCategories')!,command=ds.getView('CacheDeleteRequest')!
 list.pageSize=2
 await categories.refresh()
 await expect.poll(()=>list.rows.map(row=>row['cacheKey'])).toEqual(['A','B'])
 expect(http.requests).toHaveLength(3);expect(list.nextPageAvailable).toBe(true);expect(list.countReported).toBe(false)
 expect(list.readSnapshot().rows[0]).not.toHaveProperty('cacheValue')
 await list.setPage(2)
 expect(list.rows.map(row=>row['cacheKey'])).toEqual(['C']);expect(list.nextPageAvailable).toBe(false);expect(http.requests).toHaveLength(5)
 await list.setPage(1);list.setCurrentRow(list.rows[0]!)
 expect(list.deleteActionState(list.currentRow)).toBe('hidden')
 await command.refresh();await expect(command.addRow({key:'A'})).rejects.toThrow('CACHE_DELETE_PERMISSION')
 expect(command.rows).toEqual([]);expect(http.deletes).toBe(0)
})
