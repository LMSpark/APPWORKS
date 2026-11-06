/**
 * @module app:lowcode/resources/structured-config/workflow-definition/trigger/trigger-condition
 * 职责：按定义原编辑视图的触发表身份读取字段元数据，供标准条件编辑器消费。
 * 边界：不编辑条件、不保存、不执行过滤；不把目录记录变成第二份字段真源。
 */
import {RequestState,type DataSet,type DataView,type DataRow,type DataColumn,type DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import configuration from '../../../../../../config/pages/structured-config/workflow-catalog/pagedata.json'
function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`触发表字段不可读：${field}`)
 return row[field]
}
export class WorkflowTriggerCondition{
 /** 当前定义的有效触发表ID；空值保持为空，不回退其他流程或同名表。 */
 static tableId(ds:DataSet,id:string):string{
  const view=ds.getView('Base_WorkflowDefinition','edit'),row=view?.currentRow
  if(ds.destroyed||ds.scenarioId!==configuration.scenarioId||view?.requestState!==RequestState.Loaded||view.rows.length!==1||!row||view.getPkKey(row)!==id||view.queryContext['definitionId']!==id)throw Error('触发表条件定义目标已变化')
  read(view,row,'tblid')
  const value=view.getEditingRow(id)?.['tblid']
  if(value===null||value===undefined||value==='')return ''
  if(typeof value!=='string'||!value.trim())throw Error('触发表身份无效')
  return value
 }
 static async load(ds:DataSet,id:string):Promise<void>{
  const tableId=this.tableId(ds,id),fields=ds.getView('Base_TblField')
  if(!tableId)throw Error('请先选择触发表')
  if(!fields)throw Error('触发表字段目录视图缺失')
  fields.queryContext={triggerTableId:tableId};await fields.refresh()
  if(fields.loadingError)throw fields.loadingError
  if(this.tableId(ds,id)!==tableId)throw Error('触发表已变化，旧字段目录不再使用')
 }
 static columns(ds:DataSet,id:string):DataColumn[]{
  const tableId=this.tableId(ds,id),fields=ds.getView('Base_TblField')
  if(!tableId||fields?.requestState!==RequestState.Loaded||fields.loadingError||fields.queryContext['triggerTableId']!==tableId)throw Error('触发表字段目录尚未就绪')
  const names=new Set<string>()
  return fields.readSnapshot().rows.map(row=>{
   const name=read(fields,row,'enname'),label=read(fields,row,'cnname'),type=read(fields,row,'DataType')
   if(typeof name!=='string'||!name.trim()||typeof type!=='string'||!type.trim())throw Error('触发表字段名称或类型缺失')
   if(names.has(name))throw Error('触发表字段名称重复');names.add(name)
   return{name,label:typeof label==='string'&&label?label:name,type:type.toLowerCase()}
  })
 }
 /** 值函数编辑目录使用当前触发表名称及已确认字段；只描述输入，不宣称服务端支持执行。 */
 static functionContext(ds:DataSet,id:string):DataViewFilterFunctionContext{
  this.tableId(ds,id)
  const view=ds.getView('Base_WorkflowDefinition','edit'),row=view?.currentRow
  if(!view||!row)throw Error('触发条件定义目标已失效')
  read(view,row,'tblName')
  const name=view.getEditingRow(id)?.['tblName']
  if(typeof name!=='string'||!name.trim())throw Error('触发表名称缺失，不能构造值函数字段目录')
  return{tables:[{name,fields:this.columns(ds,id).map(column=>({name:column.name,label:column.label??column.name}))}]}
 }
}
