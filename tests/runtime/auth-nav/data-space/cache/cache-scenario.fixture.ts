import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'

/** 实服只读已核的正式身份/输出投影；HTTP结果仍为测试夹具，不冒称实服响应。 */
export function cacheScenarioModels():Awaited<ReturnType<DataSpaceDesignApi['readModel']>>[]{
 return [
  {id:'84e3c2b4-0df0-4b5d-b148-885c7c812baf',name:'缓存过滤条件',fields:['txt','val','rowid','ordIdx'],sourceType:'字典',inputs:[]},
  {id:'4f22a823-4da7-472c-8b0e-5dc8a7c23b18',name:'获取缓存信息',fields:['cacheKey','cacheValue'],sourceType:'接口',inputs:['prefix','page','size']},
  {id:'2f47b3e2-f619-4330-b355-4f217fc5cfd5',name:'根据键删除缓存中的值',fields:['Code','Type','Result','Time','Extras','Message'],sourceType:'接口',inputs:['key']},
 ].map(model=>({id:model.id,name:model.name,metaName:model.name,sourceName:model.name,sourceId:'FORMAL_SOURCE',sourceType:model.sourceType,primaryKey:'',businessMain:false,raw:{},sourceInputBindings:model.inputs.map(name=>({id:name,name})),fields:model.fields.map(name=>({id:name,modelId:model.id,name,canonicalName:name,type:'varchar',primaryKey:false,description:name,output:true,computed:false,order:0,orderType:'',raw:{}}))}))
}
