/**
 * @module app:lowcode/resources/integration/api-management/queries
 * 职责：在原实例上精确读取接口定义引用；不读取接口响应或执行接口。
 * 边界：只创建短生命周期查询视图，返回公开字段，不复制权限凭据或保存状态。
 */
import {RequestState,type DataSet,type DataRow,type DataTable,type DataViewFilterTree} from '@spark-appworks/spark-data'
/** 精确业务身份条件；不把空白身份或内部表键转成另一种资源身份。 */
export const apiEqual=(field:string,value:string):DataViewFilterTree=>({field,operator:'eq',value})
/** 显式组合本次引用命令的必要身份条件。 */
export const apiAnd=(...filters:DataViewFilterTree[]):DataViewFilterTree=>({logic:'and',filters})
/** 通过唯一正式模型名称定位所属表，内部表键不代替模型身份。 */
export function apiDefinitionTable(dataSet:DataSet,name:string):DataTable|undefined{
 const matches=Object.values(dataSet.tables).filter(table=>table.modelBinding?.modelName===name)
 if(matches.length>1)throw Error(`API_REFERENCE_MODEL: ${name}正式模型不唯一`)
 return matches[0]
}
/** 本次正式定义查询及原执行范围。 */
export type ApiDefinitionQuery=Readonly<{
 /** 原宿主持有的空间实例，不另行装配。 */
 dataSet:DataSet
 /** 正式模型名称，不能用内部表键或物理来源名替代。 */
 modelName:string
 /** 本次必须可读的正式字段，不复制权限凭据。 */
 fields:readonly string[]
 /** 仅按本次命令明确身份限制的筛选。 */
 filter:DataViewFilterTree
 /** 异步前后核原宿主、空间与查询范围。 */
 check():void
}>
/** 原数据空间上的完整正式投影；等待前后由调用方核原范围。 */
export async function readApiDefinitionRows(input:ApiDefinitionQuery):Promise<DataRow[]>{
 const {dataSet,modelName,fields,filter,check}=input
 check()
 const original=apiDefinitionTable(dataSet,modelName)?.getView('default')
 if(!original||original.dataTable?.modelBinding?.modelName!==modelName)throw Error(`API_REFERENCE_MODEL: 缺少正式模型 ${modelName}`)
 const view=original.createQueryView(`apiDefinitionReference_${crypto.randomUUID().replaceAll('-','')}`)
 try{
  view.treeMode='flat';view.sortExpression=[];view.filterExpression=filter;view.queryConfig={fields:[...fields],allPages:true}
  await view.refresh();check()
  if(view.loadingError)throw view.loadingError
  if(view.requestState!==RequestState.Loaded||!view.countReported||view.total!==view.rows.length)throw Error('API_REFERENCE_INCOMPLETE: 未取得完整正式引用结果')
  return view.rows.map(row=>Object.fromEntries(fields.map(field=>{
   if(view.fieldAccess(row,field).read!=='visible'||!Object.hasOwn(row,field)||row[field]===undefined)throw Error(`API_REFERENCE_FIELD: ${modelName}.${field}不可读或缺失`)
   return[field,row[field]]
  })))
 }finally{if(!dataSet.destroyed)view.dataTable?.destroyView(view.viewId)}
}
