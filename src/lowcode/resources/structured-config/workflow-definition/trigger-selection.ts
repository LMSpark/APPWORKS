/**
 * @module app:lowcode/resources/structured-config/workflow-definition/trigger-selection
 * 职责：确认当前数据库及表选择，原子写回定义编辑视图并清除旧条件。
 * 边界：只消费原DataView身份、权限和检查点；不查询、不持草稿、不保存或触发流程。
 */
import {RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import configuration from '../../../../../config/pages/structured-config/workflow-catalog/pagedata.json'
function selected(dataSet:DataSet,name:string){
 const view=dataSet.getView(name)
 if(view?.requestState!==RequestState.Loaded||view.loadingError||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('触发表来源尚未就绪或正在编辑')
 const ids=view.getSelectedValues(),snapshot=view.readSnapshot()
 if(ids.length!==1)throw Error('请选择唯一的数据库及触发表')
 const row=view.rows.find(item=>view.getPkKey(item)===ids[0]),projected=snapshot.rows.find(item=>view.getPkKey(item)===ids[0])
 if(!row||!projected)throw Error('触发表来源选择已失效')
 return{view,row,projected}
}
function text(source:{view:DataView;row:DataRow;projected:Readonly<DataRow>},field:string):string{
 if(source.view.fieldAccess(source.row,field).read!=='visible')throw Error(`触发表来源字段不可读：${field}`)
 const value=source.projected[field]
 if(typeof value!=='string'||!value.trim())throw Error(`触发表来源字段缺失：${field}`)
 return value
}
/** 只读投影当前唯一候选，不读取旧页缓存或未确认来源草稿。 */
export function projectWorkflowTriggerSelection(dataSet:DataSet):Readonly<Record<string,string>>{
 if(dataSet.destroyed||dataSet.scenarioId!==configuration.scenarioId)throw Error('工作流触发表所属空间已变化')
 const database=selected(dataSet,'_base_dbInfo'),table=selected(dataSet,'_Base_TblList')
 if(database.view.primaryKey!=='Id'||table.view.primaryKey!=='rowid'||text(table,'dbid')!==text(database,'Id'))throw Error('所选触发表不属于当前数据库')
 return{dbName:text(database,'Name'),tblName:text(table,'tblname'),tblid:text(table,'rowid'),filter:''}
}
/** 仅确认选择写入当前定义草稿；同表再次确认也按参考语义清空filter，打开或取消不调用此命令。 */
export function applyWorkflowTriggerSelection(dataSet:DataSet,definitionId:string):void{
 if(dataSet.destroyed||dataSet.scenarioId!==configuration.scenarioId)throw Error('工作流触发表所属空间已变化')
 const target=dataSet.getView('Base_WorkflowDefinition','edit'),row=target?.currentRow
 if(!target||target.dataTable?.modelBinding?.modelName!=='Base_WorkflowDefinition'||!row||target.rows.length!==1||target.getPkKey(row)!==definitionId
  ||target.queryContext['definitionId']!==definitionId||target.hasUnconfirmedSave||target.mutating||target.requestState!==RequestState.Loaded)throw Error('工作流触发表编辑目标已变化')
 const mapping=projectWorkflowTriggerSelection(dataSet)
 const current=target.getEditingRow(definitionId),fields:string[]=[]
 for(const [field,value] of Object.entries(mapping)){
  const access=target.fieldAccess(row,field)
  if(access.read!=='visible')throw Error(`工作流触发表目标字段不可读：${field}`)
  if(current?.[field]===value)continue
  if(access.write!=='allowed')throw Error(`工作流触发表目标字段不可写：${field}`)
  fields.push(field)
 }
 if(fields.length===0)return
 const checkpoint=target.createEditingCheckpoint(definitionId,fields)
 try{for(const field of fields)target.updateEditingValue(definitionId,field,mapping[field]);checkpoint.release()}
 catch(cause){checkpoint.restore();checkpoint.release();throw cause}
}
