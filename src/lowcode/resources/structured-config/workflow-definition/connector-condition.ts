/**
 * @module app:lowcode/resources/structured-config/workflow-definition/connector-condition
 * 职责：按流程及连接器的节点端点维护条件，提供源节点输出字段目录。
 * 边界：不把模型关系改成节点条件，不持有草稿、不执行过滤或工作流；读写和未知回执归原DataView。
 */
import {DataViewFilterCodec,RequestState,type DataSet,type DataView,type DataRow,type DataColumn} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'

const table='Base_DataModel_Relation',viewId='connector'
function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`连线条件字段不可读: ${field}`)
 return row[field]
}
function scope(dataSet:DataSet,workflowId:string,edgeId:string|number){
 const definition=dataSet.getView('Base_WorkflowDefinition'),nodes=dataSet.getView('Base_WorkflowNodeDefinition'),edges=dataSet.getView('Base_WorkflowConnectors'),view=dataSet.getView(table,viewId)
 const root=definition?.rows[0]
 if(!workflowId.trim()||!definition||!nodes||!edges||!view||definition.rows.length!==1||!root||definition.getPkKey(root)!==workflowId)throw Error('连线条件流程身份不唯一')
 if(nodes.queryContext['workflowId']!==workflowId||edges.queryContext['workflowId']!==workflowId||nodes.requestState!==RequestState.Loaded||edges.requestState!==RequestState.Loaded)throw Error('连线条件查询目标已变化')
 const edge=edges.rows.find(row=>edges.getPkKey(row)===edgeId)
 if(!edge||read(edges,edge,'workflow_id')!==workflowId)throw Error('连接器不属于当前流程')
 const sourceId=read(edges,edge,'sourceID'),targetId=read(edges,edge,'targetID'),editing=edges.getEditingRow(edgeId)
 if(editing?.['sourceID']!==sourceId||editing?.['targetID']!==targetId)throw Error('请先保存或取消连线端点修改')
 const source=nodes.rows.find(row=>nodes.getPkKey(row)===sourceId),target=nodes.rows.find(row=>nodes.getPkKey(row)===targetId)
 if(!source||!target||read(nodes,source,'workflow_id')!==workflowId||read(nodes,target,'workflow_id')!==workflowId)throw Error('连线端点不属于当前流程')
 return{view,nodes,edges,edge,source,target,sourceId,targetId,workflowId}
}
function loaded(context:ReturnType<typeof scope>):DataRow|undefined{
 const {view,workflowId,sourceId,targetId}=context
 if(view.requestState!==RequestState.Loaded||view.queryContext['workflowId']!==workflowId||view.queryContext['sourceNodeId']!==sourceId||view.queryContext['targetNodeId']!==targetId)throw Error('条件查询端点已变化，请重新读取')
 if(view.rows.length>1)throw Error('同一节点端点存在多条条件，不能自动选取')
 const row=view.rows[0]
 if(row&&(read(view,row,'dataSetId')!==workflowId||read(view,row,'parentModId')!==sourceId||read(view,row,'childModId')!==targetId))throw Error('条件记录不属于当前连线端点')
 if(row){const key=view.getPkKey(row),editing=key===undefined?undefined:view.getEditingRow(key);if(editing?.['dataSetId']!==workflowId||editing['parentModId']!==sourceId||editing['childModId']!==targetId)throw Error('条件编辑归属已变化，不能移动到其他端点')}
 return row
}
/** 同一正式模型下的专用条件视图；原模型关系视图及连接器记录保持独立。 */
export class WorkflowConnectorCondition{
 static async load(dataSet:DataSet,workflowId:string,edgeId:string|number):Promise<DataView>{
  const context=scope(dataSet,workflowId,edgeId),{view}=context
  view.queryContext={...view.queryContext,workflowId,sourceNodeId:context.sourceId,targetNodeId:context.targetId}
  await view.refresh();if(view.loadingError)throw view.loadingError
  loaded(scope(dataSet,workflowId,edgeId));return view
 }
 static columns(dataSet:DataSet,workflowId:string,edgeId:string|number):DataColumn[]{
  const {nodes,source}=scope(dataSet,workflowId,edgeId),raw=read(nodes,source,'output_mapping')
  const values=raw===null||raw===undefined||raw===''?[]:typeof raw==='string'?parseJsonDocument(raw):raw
  if(!Array.isArray(values))throw Error('源节点输出映射必须是对象数组')
  const names=new Set<string>()
  const entries:readonly unknown[]=values
  if(entries.some(value=>isRecord(value)&&(value['isParent']===true||value['pid']!==undefined&&value['pid']!==null&&value['pid']!=='')))throw Error('层次输出的条件字段运行合同尚未确认；原条件保留')
  return entries.map(value=>{
   if(!isRecord(value)||typeof value['Name']!=='string'||!value['Name'].trim())throw Error('源节点输出字段缺少名称')
   const name=value['Name'];if(names.has(name))throw Error('源节点输出字段名称重复');names.add(name)
   return{name,label:typeof value['Description']==='string'&&value['Description']?value['Description']:name,type:typeof value['FieldType']==='string'?value['FieldType'].toLowerCase():'string'}
  })
 }
 static presentation(dataSet:DataSet,workflowId:string,edgeId:string|number){
  const context=scope(dataSet,workflowId,edgeId),row=loaded(context)
  let columns:DataColumn[]=[],outputError=''
  try{columns=this.columns(dataSet,workflowId,edgeId)}catch(cause){outputError=cause instanceof Error?cause.message:String(cause)}
  const raw=context.nodes.fieldAccess(context.source,'name').read==='visible'?context.source['name']:undefined
  const name=typeof raw==='string'&&raw?raw:'源节点'
  return{row,columns,outputError,functionContext:{tables:[{name,fields:columns.map(column=>({name:column.name,label:column.label??column.name}))}]}}
 }
 static async add(dataSet:DataSet,workflowId:string,edgeId:string|number):Promise<DataRow>{
  const context=scope(dataSet,workflowId,edgeId),{view,nodes,source,target}=context
  if(loaded(context))throw Error('当前连线端点已有条件')
  if(view.hasUnconfirmedSave||view.dirtyTracking.pendingDeleteIds.size)throw Error('请先确认或取消原条件删除')
  this.columns(dataSet,workflowId,edgeId)
  if(view.commitMode!=='staged')throw Error('连线条件必须使用原视图暂存')
  const result=await view.addRow({dataSetId:workflowId,parentModId:context.sourceId,childModId:context.targetId,filter:'',depType:'',cascadeDel:'0',
   parentTable:nodes.fieldAccess(source,'name').read==='visible'?source['name']??'':'',childTable:nodes.fieldAccess(target,'name').read==='visible'?target['name']??'':''})
  const row=view.rows.find(candidate=>view.getPkKey(candidate)===view.getPkKey(result as DataRow))
  if(!row)throw Error('条件草稿未进入原视图');view.setCurrentRow(row);return row
 }
 static async save(dataSet:DataSet,workflowId:string,edgeId:string|number){
  const context=scope(dataSet,workflowId,edgeId),{view}=context
  const options={views:[{tableName:table,viewId}]}
  if(view.hasUnconfirmedSave){loaded({...context,view});return dataSet.saveChanges(options)}
  if(view.dirtyTracking.pendingDeleteIds.size){loaded(context);return dataSet.saveChanges(options)}
  this.columns(dataSet,workflowId,edgeId)
  const row=loaded(context);if(!row)throw Error('当前连线没有条件记录')
  const id=view.getPkKey(row);if(id===undefined)throw Error('条件身份缺失')
  const value=view.getEditingRow(id)?.['filter']
  if(view.fieldAccess(row,'filter').read!=='visible')throw Error('连线条件不可读')
  if(value!==undefined&&value!==null&&typeof value!=='string')throw Error('连线条件必须是SPARK JSON文本')
  const parsed=DataViewFilterCodec.parseStored(value)
  if(!parsed)await view.removeRow(id)
  return dataSet.saveChanges(options)
 }
}
