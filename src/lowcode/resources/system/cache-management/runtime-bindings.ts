/**
 * @module app:lowcode/resources/system/cache-management/runtime-bindings
 * 职责：为正式缓存场景的首次装配选择来源分页适配与原生命令绑定。
 * 边界：只解析本次配置和同一DataSet视图，不创建表、查询、草稿或页面owner。
 */
import {CacheDeleteCommandResource,CachePageReadAdapter,type DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '../../../data-space/lowcode-data-space-assembler'

const scenarioId='348D1C50B204C779AABBE2489C5E2FDF'
const formal={
 CacheCategories:{modelId:'84e3c2b4-0df0-4b5d-b148-885c7c812baf',modelName:'缓存过滤条件'},
 CacheEntries:{modelId:'4f22a823-4da7-472c-8b0e-5dc8a7c23b18',modelName:'获取缓存信息'},
 CacheDeleteDefinition:{modelId:'2f47b3e2-f619-4330-b355-4f217fc5cfd5',modelName:'根据键删除缓存中的值'},
} as const
const resourceId='system:cache-delete'
type Input=Readonly<{config:ScenarioViewConfig;runtime:DataSpaceRuntimeApi;assertCurrent:()=>void}>
/** 首次绑定前选择本次资源实例；命令factory执行时才从原DataSet解析兄弟视图。 */
export function createCacheScenarioBindings(input:Input):Pick<LowcodeDataSpaceAssemblerInput,'commandBindings'|'modelAdapters'>{
 if(input.config.scenarioId!==scenarioId)return{}
 input.assertCurrent()
 const tables=input.config.toJSON()['tables']
 if(!isRecord(tables))throw Error('CACHE_SCENARIO_BINDING: 缺少缓存场景定义')
 for(const [name,identity]of Object.entries(formal)){
  const table=tables[name],binding=isRecord(table)?table['modelBinding']:undefined
  if(!isRecord(binding)||binding['modelId']!==identity.modelId||binding['modelName']!==identity.modelName)throw Error(`CACHE_SCENARIO_BINDING: ${name} 正式身份不符`)
 }
 const command=tables['CacheDeleteRequest']
 if(!isRecord(command)||command['resourceType']!=='command'||command['resourceId']!==resourceId)throw Error('CACHE_SCENARIO_BINDING: 删除命令资源身份不符')
 return{
  modelAdapters:{
   [formal.CacheEntries.modelId]:new CachePageReadAdapter({scenarioId,...formal.CacheEntries}),
   [formal.CacheDeleteDefinition.modelId]:{kind:'command'},
  },
  commandBindings:{CacheDeleteRequest:view=>{
   input.assertCurrent()
   const ds=view.dataSet,list=ds?.getView('CacheEntries','default'),definition=ds?.getView('CacheDeleteDefinition','default')
   if(ds?.scenarioId!==scenarioId||view.viewId!=='default'||view.dataTable?.tableName!=='CacheDeleteRequest'||!list||!definition
    ||list.dataTable?.modelBinding?.modelId!==formal.CacheEntries.modelId||list.dataTable.modelBinding.modelName!==formal.CacheEntries.modelName
    ||definition.dataTable?.modelBinding?.modelId!==formal.CacheDeleteDefinition.modelId||definition.dataTable.modelBinding.modelName!==formal.CacheDeleteDefinition.modelName)throw Error('CACHE_SCENARIO_BINDING: 删除命令缺少同实例正式来源')
   return new CacheDeleteCommandResource({list,definition,runtime:input.runtime,resourceId,assertCurrent:input.assertCurrent}).binding(view)
  }},
 }
}
