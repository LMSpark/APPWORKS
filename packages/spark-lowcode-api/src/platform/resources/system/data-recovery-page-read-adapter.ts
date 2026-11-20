/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/system/data-recovery-page-read-adapter
 * 职责：将软删除数据接口的分页映射为正式来源入参pageParam，并按原回执总数判断下一页。
 * 边界：不读取角色、不改写恢复记录、不持有页面行数组或权限副本；表、库入参由级联写入本次查询上下文。
 */
import type {DataSpaceModelReadAdapter} from '../../data-space/runtime/data-space-model-binding'

/** 正式场景、模型ID与查询名称共同定位一个软删除数据来源。 */
type DataRecoveryPageIdentity=Readonly<{scenarioId:string;modelId:string;modelName:string}>
export class DataRecoveryPageReadAdapter implements DataSpaceModelReadAdapter{
 readonly kind='paged-read'
 readonly #identity:DataRecoveryPageIdentity
 constructor(identity:DataRecoveryPageIdentity){this.#identity=Object.freeze({...identity})}
 async execute(input:Parameters<DataSpaceModelReadAdapter['execute']>[0]):ReturnType<DataSpaceModelReadAdapter['execute']>{
  const {view,params,read}=input,identity=this.#identity,model=view.dataTable?.modelBinding
  if(view.dataSet?.scenarioId!==identity.scenarioId||model?.modelId!==identity.modelId||model.modelName!==identity.modelName)throw Error('DATA_RECOVERY_PAGE_IDENTITY: 软删除数据正式身份不符')
  if(params.pagination==='none'||params.allPages||params.parentResult||params.tree||params.children||view.treeConfig
   ||params.filter||params.sort||params.outputType&&params.outputType!=='Table'||view.queryConfig.cacheType&&view.queryConfig.cacheType!=='none')throw Error('DATA_RECOVERY_PAGE_QUERY: 软删除数据只支持无结果缓存的平面分页读取')
  const context=params.context??view.queryContext,page=params.page??view.page,size=params.pageSize??view.pageSize
  if(!['table','dbname','dbid'].every(key=>['string','number'].includes(typeof context[key])&&String(context[key]).trim()!=='')||Object.hasOwn(context,'pageParam')
   ||!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(size)||size<1||size>1000)throw Error('DATA_RECOVERY_PAGE_INPUT: 数据表、数据库或分页输入无效')
  const {context:_context,...captured}=params
  // 接口忽略请求体PageParam，以来源入参pageParam分页；原生分页保留以接受回执总数而非完整集合校验。
  const result=await read({...captured,page,pageSize:size,pagination:'paged',sourceInputMode:'direct',context:{...context,pageParam:{index:page,size}}})
  if(view.destroyed||view.dataSet.destroyed)throw Error('DATA_RECOVERY_PAGE_STALE: 本次软删除数据视图已释放')
  return{result}
 }
}
