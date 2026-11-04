/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-field-context
 * 职责：查询字段命令共用原视图及目标身份。
 * 边界：不复制行、权限或编辑状态；仅字段视图计入原生待新增/删除数量。
 */
import {RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import {definitionTargetDraftSignature} from '@/lowcode/data-space/model-source/data-space-definition-save'
/** 捕获原视图的身份集合和原生delta；异步检查不允许把迟到覆盖夹带进旧派生结果。 */
export function workflowQueryDraftSignature(views:readonly DataView[]):string{
 return JSON.stringify(views.map(view=>{
  const ids=[...new Set([...view.rows.map(row=>view.getPkKey(row)),...view.dirtyTracking.pendingDeleteIds].map(id=>{if(typeof id!=='string')throw Error('查询配置记录身份缺失');return id}))].sort()
  return [view.tableName,view.viewId,view.queryContext,definitionTargetDraftSignature(view,ids)]
 }))
}
export function readWorkflowFieldValue(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`查询字段配置不可读: ${field}`)
 return row[field]
}
export function workflowFieldChanges(view:DataView,row:DataRow,id:string):Record<string,unknown>{
 return {...Object.fromEntries(Object.entries(view.dirtyTracking.getDiff(id,row)).map(([key,diff])=>[key,diff.to])),...view.getEditingPatch(id)}
}
function workflowModelFieldScope(input:Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;operation:boolean;repairRequestType?:boolean}>){
 const {dataSet,workflowId,nodeId,operation,repairRequestType=false}=input
 if(dataSet.destroyed||!workflowId.trim()||!nodeId.trim())throw Error('查询配置目标已失效')
 const loaded=(name:string)=>{
  const view=dataSet.getView(name),fieldView=name==='Base_DataModel_Field'
  if(!view||view.destroyed||view.mutating||view.loadingError||view.requestState!==RequestState.Loaded
   ||view.rows.length+(fieldView?view.dirtyTracking.pendingDeleteIds.size-view.dirtyTracking.pendingCreateIds.size:0)!==view.total)throw Error('查询配置尚未完整读取')
  if(view.queryContext['workflowId']!==workflowId)throw Error('查询配置目标已变化')
  return view
 }
 const nodes=loaded('Base_WorkflowNodeDefinition'),fields=loaded('Base_DataModel_Field'),models=loaded('Base_DataModel'),edges=loaded('Base_WorkflowConnectors')
 const node=nodes.rows.find(row=>nodes.getPkKey(row)===nodeId),model=models.rows[0]
 if(!node||models.rows.length!==1||!model||readWorkflowFieldValue(nodes,node,'workflow_id')!==workflowId||!(operation?['add','edit','delete']:['query']).includes(String(readWorkflowFieldValue(nodes,node,'node_type'))))throw Error('当前不是所属工作流的唯一查询节点模型')
 const modelId=readWorkflowFieldValue(nodes,node,operation?'dataOperateModId':'node_config')
 if(operation&&!repairRequestType&&readWorkflowFieldValue(models,model,'requestType')!==readWorkflowFieldValue(nodes,node,'node_type'))throw Error('操作节点与模型requestType不符')
 if(typeof modelId!=='string'||!modelId||models.getPkKey(model)!==modelId||readWorkflowFieldValue(models,model,'dataSetId')!==workflowId)throw Error('查询模型归属不符')
 return {nodes,fields,models,edges,node,model,modelId}
}

/** 查询字段沿原node_config定位，不接受操作目标。 */
export function workflowQueryFieldScope(dataSet:DataSet,workflowId:string,nodeId:string){return workflowModelFieldScope({dataSet,workflowId,nodeId,operation:false})}
/** 操作字段沿dataOperateModId定位，模型requestType必须与节点一致。 */
export function workflowOperationFieldScope(dataSet:DataSet,workflowId:string,nodeId:string){return workflowModelFieldScope({dataSet,workflowId,nodeId,operation:true})}
/** 显式换目标可修复旧requestType；仍核对同一节点及模型真实身份，不放宽执行或普通保存。 */
export function workflowOperationSourceScope(dataSet:DataSet,workflowId:string,nodeId:string){return workflowModelFieldScope({dataSet,workflowId,nodeId,operation:true,repairRequestType:true})}
