/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/system/cache-page-read-adapter
 * 职责：将缓存来源分页映射到原正式读取，并实际探测下一页。
 * 边界：不读取角色、不保存缓存值、不持有页面行数组或权限副本；只返回原查询结果。
 */
import type {DataSpaceModelReadAdapter} from '../../data-space/runtime/data-space-model-binding'

/** 正式场景、模型ID与查询名称共同定位一个缓存列表来源。 */
type CachePageIdentity=Readonly<{scenarioId:string;modelId:string;modelName:string}>
export class CachePageReadAdapter implements DataSpaceModelReadAdapter{
 readonly kind='paged-read'
 readonly #identity:CachePageIdentity
 constructor(identity:CachePageIdentity){this.#identity=Object.freeze({...identity})}
 async execute(input:Parameters<DataSpaceModelReadAdapter['execute']>[0]):ReturnType<DataSpaceModelReadAdapter['execute']>{
  const {view,params,read}=input,identity=this.#identity,model=view.dataTable?.modelBinding
  if(view.dataSet?.scenarioId!==identity.scenarioId||model?.modelId!==identity.modelId||model.modelName!==identity.modelName)throw Error('CACHE_PAGE_IDENTITY: 缓存列表正式身份不符')
  if(params.pagination==='none'||params.allPages||params.parentResult||params.tree||params.children||view.treeConfig
   ||params.filter||params.sort||params.outputType&&params.outputType!=='Table'||view.queryConfig.cacheType&&view.queryConfig.cacheType!=='none')throw Error('CACHE_PAGE_QUERY: 缓存来源只支持无结果缓存的平面分页读取')
  const context=params.context??view.queryContext,prefix=context['prefix'],page=params.page??view.page,size=params.pageSize??view.pageSize
  if(typeof prefix!=='string'||!prefix.trim()||!Number.isSafeInteger(page)||page<1||page>=Number.MAX_SAFE_INTEGER
   ||!Number.isSafeInteger(size)||size<1||size>1000||Object.hasOwn(context,'page')||Object.hasOwn(context,'size'))throw Error('CACHE_PAGE_INPUT: 缓存类型和唯一原生分页输入无效')
  const signature=JSON.stringify([view.queryContext,view.queryConfig,view.page,view.pageSize,view.filterExpression,view.sortExpression])
  const guard=()=>{
   if(view.destroyed||view.dataSet?.destroyed||JSON.stringify([view.queryContext,view.queryConfig,view.page,view.pageSize,view.filterExpression,view.sortExpression])!==signature)throw Error('CACHE_PAGE_STALE: 本次缓存分类或分页已变化')
  }
  const {page:_page,pageSize:_size,context:_context,...captured}=params
  const load=async(index:number)=>{
   guard();const result=await read({...captured,pagination:'none',sourceInputMode:'direct',context:{prefix,page:String(index),size:String(size)}});guard();return result
  }
  const result=await load(page),probe=await load(page+1)
  guard()
  return{result,nextPageAvailable:probe.rows.length>0}
 }
}
