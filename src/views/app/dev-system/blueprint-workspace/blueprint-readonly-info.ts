import {DataViewFilter, parseDataViewKey, type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'

/** Apply a node filter to a declared DataView and retain all result ownership in that view. */
export async function queryBlueprintReadonlyView({runtime,binding,nodeId,assertCurrent}:{runtime:PageRuntime;binding:string;nodeId:string;assertCurrent:()=>void}):Promise<DataView>{
  const target=nodeId.trim()
  if(!target)throw new Error('只读信息查询缺少当前导航节点身份')
  const descriptor=parseDataViewKey(binding)
  if(!descriptor?.scope)throw new Error(`只读信息查询绑定身份无效: ${binding}`)
  assertCurrent()
  const view=runtime.resolveView(binding)
  if(!view)throw new Error(`PageRuntime 未解析只读视图 ${binding}`)
  view.resetState()
  try{
    if(view.dataSet?.scenarioId!==descriptor.scope||view.dataTable?.modelBinding?.modelName!==descriptor.tableName||view.viewId!==descriptor.viewId){
      throw new Error('只读信息查询 DataView 绑定身份不匹配')
    }
    view.filterExpression=DataViewFilter.condition({field:'prowid',operator:'eq',value:target}).toJSON()
    await view.refresh()
    assertCurrent()
    if(view.loadingError)throw view.loadingError
    if(!Number.isSafeInteger(view.total)||view.total<0||!Number.isSafeInteger(view.page)||view.page!==1
      ||!Number.isSafeInteger(view.pageSize)||view.pageSize<1||view.rows.length!==Math.min(view.total,view.pageSize)){
      throw new Error('只读信息查询分页结果不一致')
    }
    const rowIds=new Set<string>()
    for(const row of view.rows){
      if(view.fieldAccess(row,'prowid').read!=='visible'||row['prowid']!==target)throw new Error('只读信息查询返回了不可读或身份不匹配的导航节点记录')
      const rowId=row['rowid']
      const validRowId=(typeof rowId==='string'&&rowId.trim().length>0)||(typeof rowId==='number'&&Number.isFinite(rowId))
      const rowIdKey=validRowId?`${typeof rowId}:${String(rowId)}`:''
      if(view.fieldAccess(row,'rowid').read!=='visible'||!validRowId||rowIds.has(rowIdKey)){
        throw new Error('只读信息查询返回了不可读、空值或重复的 rowid')
      }
      rowIds.add(rowIdKey)
    }
    return view
  }catch(error){
    view.resetState()
    throw error
  }
}
