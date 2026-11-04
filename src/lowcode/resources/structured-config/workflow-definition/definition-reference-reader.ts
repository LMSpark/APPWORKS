/**
 * @module app:lowcode/resources/structured-config/workflow-definition/definition-reference-reader
 * 职责：字段与节点输出结构命令共用正式定义依赖读取及释放。
 * 边界：只读元数据查询，不加载业务行、不保存、不重置调用方首轮合同。
 * AI用途：在显式结构命令中读取完整正式依赖，复用原DataView查询权限与身份。
 */
import {RequestState,type DataSet,type DataView} from '@spark-appworks/spark-data'
import {readWorkflowFieldValue as read} from './query-field-context'

/** 本次正式依赖读取的工作流与首轮守卫。 */
type ReaderInput=Readonly<{
  /** 宿主本次元数据实例。 */
  dataSet:DataSet
  /** 正式工作流定义身份。 */
  workflowId:string
  /** 原命令首轮身份、上下文及草稿守卫。 */
  assertCurrent:()=>void
 }>

/** 显式结构检查本次拥有的查询视图集合，不能作为业务数据或可编辑真源。 */
export class WorkflowDefinitionReferenceReader{
 /** 本次创建的只读查询视图，仅供检查与finally释放。 */
 readonly views:DataView[]=[]
 /** 捕获同一工作流与调用方守卫，不持有权限副本。 */
 constructor(private readonly input:ReaderInput){ }
 /** 按正式归属读取全部定义行；调用方指定本命令实际检查的字段。 */
 async query(name:string,columns:string[]):Promise<DataView>{
  this.input.assertCurrent()
  const source=this.input.dataSet.getView(name,name==='Base_DataModel_Relation'?'asParent':'default')
  if(!source)throw Error(`字段引用缺少正式视图: ${name}`)
  const view=source.createQueryView(`workflowFieldReferences_${crypto.randomUUID().replaceAll('-','')}`);this.views.push(view)
  const owner=name==='Base_DataSet'?'rowid':['Base_WorkflowNodeDefinition','Base_WorkflowConnectors'].includes(name)?'workflow_id':'dataSetId'
  view.filterExpression={field:owner,operator:'eq',value:this.input.workflowId};view.queryConfig={...view.queryConfig,fields:columns,allPages:true}
  await view.refresh();this.input.assertCurrent()
  if(view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total)throw Error(`字段依赖未完整读取: ${name}`)
  const ids=new Set<string>()
  for(const row of view.rows){
   const id=read(view,row,'rowid')
   if(read(view,row,owner)!==this.input.workflowId||typeof id!=='string'||!id||ids.has(id)||view.getPkKey(row)!==id)throw Error('字段依赖身份或归属不符')
   ids.add(id)
  }
  const first=view.rows[0]
  if(name==='Base_DataSet'&&(view.rows.length!==1||!first||read(view,first,'Type')!=='workflow'))throw Error('字段依赖缺少唯一工作流参数定义')
  return view
 }
 /** 只释放本次查询，不能取消或销毁宿主编辑视图。 */
 dispose():void{for(const view of this.views)if(!view.destroyed)view.dataTable?.destroyView(view.viewId)}
}
