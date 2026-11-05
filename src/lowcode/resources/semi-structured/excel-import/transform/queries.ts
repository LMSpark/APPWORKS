/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/queries
 * 职责：通过原DataSet的独立查询视图读取转换校验所需正式元数据。
 * 边界：不保存、不更改浏览视图，不读取来源业务行；每次完整回读后释放临时视图。
 */
import {RequestState,type DataSet,type DataRow,type DataViewFilterTree} from '@spark-appworks/spark-data'
/** 本次精确元数据查询及原实例守卫。 */
export type ExcelTransformQuery=Readonly<{
 /** 原宿主已装配的数据空间。 */
 dataSet:DataSet
 /** 正式模型名称。 */
 table:string
 /** 复用已声明的命名视图，默认default。 */
 viewId?:string
 /** 本次必要且必须可读的字段。 */
 fields:readonly string[]
 /** 覆盖临时视图筛选，不继承用户正在浏览的对象。 */
 filter:DataViewFilterTree
 /** 每次异步前后验证原实例。 */
 check():void
}>
/** 返回完整可读投影；不泄露权限凭据，也不将缺失字段当作空值。 */
export async function readExcelTransformRows(input:ExcelTransformQuery):Promise<DataRow[]>{
 input.check()
 const original=input.dataSet.getView(input.table,input.viewId??'default')
 if(!original||original.dataTable?.modelBinding?.modelName!==input.table)throw Error('转换引用缺少正式模型视图')
 const view=original.createQueryView(`excelTransformReference_${crypto.randomUUID().replaceAll('-','')}`)
 try{
  view.treeMode='flat';view.sortExpression=[];view.filterExpression=input.filter;view.queryConfig={fields:[...input.fields],allPages:true}
  await view.refresh();input.check()
  if(view.loadingError)throw view.loadingError
  if(view.requestState!==RequestState.Loaded||!view.countReported||view.total!==view.rows.length)throw Error('转换引用未取得完整正式查询结果')
  return view.rows.map(row=>Object.fromEntries(input.fields.map(field=>{
   if(view.fieldAccess(row,field).read!=='visible'||row[field]===undefined)throw Error(`转换引用字段不可读或缺失: ${input.table}.${field}`)
   return [field,row[field]]
  })))
 }finally{view.dataTable?.destroyView(view.viewId)}
}
