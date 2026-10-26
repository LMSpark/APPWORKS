import {DataViewFilter, type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'

/** Apply a node filter to a declared DataView and retain all result ownership in that view. */
export async function queryBlueprintReadonlyView({runtime,binding,nodeId,assertCurrent}:{runtime:PageRuntime;binding:string;nodeId:string;assertCurrent:()=>void}):Promise<DataView>{
  const target=nodeId.trim()
  if(!target)throw new Error('只读信息查询缺少当前导航节点身份')
  assertCurrent()
  const view=runtime.resolveView(binding)
  if(!view)throw new Error(`PageRuntime 未解析只读视图 ${binding}`)
  view.resetState()
  try{
    view.filterExpression=DataViewFilter.condition({field:'prowid',operator:'eq',value:target}).toJSON()
    await view.refresh()
    assertCurrent()
    if(view.loadingError)throw view.loadingError
    for(const row of view.rows){
      if(view.fieldAccess(row,'prowid').read!=='visible'||row['prowid']!==target)throw new Error('只读信息查询返回了不可读或身份不匹配的导航节点记录')
    }
    return view
  }catch(error){
    view.resetState()
    throw error
  }
}
