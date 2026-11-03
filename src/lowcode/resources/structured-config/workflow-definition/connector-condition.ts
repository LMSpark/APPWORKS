/**
 * @module app:lowcode/resources/structured-config/workflow-definition/connector-condition
 * 职责：按流程及连接器的节点端点维护条件，提供源节点输出字段目录。
 * 边界：不把模型关系改成节点条件，不持有草稿、不执行过滤或工作流；读写和未知回执归原DataView。
 */
import {DataViewFilter,DataViewFilterCodec,getDataViewFilterFieldOperators,getDataViewFilterFunctionDefinitions,RequestState,type DataSet,type DataView,type DataRow,type DataColumn,type DataViewFilterOperator,type DataViewFilterTree} from '@spark-appworks/spark-data'
import {workflowOutputFields} from './output-fields'

const table='Base_DataModel_Relation',viewId='connector'
const allowedOperators:readonly DataViewFilterOperator[]=['eq','ne','gt','lt']
const functionContext={definitions:getDataViewFilterFunctionDefinitions(DataViewFilter.editorContext({})).filter(definition=>definition.type!=='GetConstValue').map(definition=>({...definition,enabled:()=>false}))}
/** 设计时可带真实字段目录；显式执行仍核已存定义的服务运算/常量合同，不求值或改写原条件。 */
export function validateWorkflowConditionFilter(filter:DataViewFilter,columns?:readonly DataColumn[]):void{
 if(columns){const issues=filter.validate({fields:DataViewFilter.fields(columns).map(field=>({...field,operators:getDataViewFilterFieldOperators(field).filter(operator=>allowedOperators.includes(operator))}))})
  if(issues.length)throw Error(issues.map(issue=>`${issue.path}: ${issue.message}`).join('\n'))}
 function visit(tree:DataViewFilterTree):void{
  if('logic' in tree){tree.filters.forEach(visit);return}
  if(!allowedOperators.includes(tree.operator))throw Error(`工作流连线执行不支持运算符 ${tree.operator}；原条件保留，请修改已验证的条件后再执行`)
  if(tree.value!==undefined&&tree.value!==null&&!['string','number','boolean'].includes(typeof tree.value))throw Error('连线条件当前只支持标量常量；该执行路径不能解析祖先参数或其他值函数')
 }
 visit(filter.toJSON())
}
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
  const entries=workflowOutputFields({nodeId:String(nodes.getPkKey(source)),position:read(nodes,source,'position_type'),nodeType:read(nodes,source,'node_type'),mapping:raw})
  return entries.map(value=>{
   const name=value['Name'] as string
   return{name,label:typeof value['Description']==='string'&&value['Description']?value['Description']:name,type:typeof value['FieldType']==='string'?value['FieldType'].toLowerCase():'string'}
  })
 }
 static presentation(dataSet:DataSet,workflowId:string,edgeId:string|number){
  const context=scope(dataSet,workflowId,edgeId),row=loaded(context)
  let columns:DataColumn[]=[],outputError=''
  try{columns=this.columns(dataSet,workflowId,edgeId)}catch(cause){outputError=cause instanceof Error?cause.message:String(cause)}
  return{row,columns,outputError,functionContext,allowedOperators}
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
  const columns=this.columns(dataSet,workflowId,edgeId)
  const row=loaded(context);if(!row)throw Error('当前连线没有条件记录')
  const id=view.getPkKey(row);if(id===undefined)throw Error('条件身份缺失')
  const value=view.getEditingRow(id)?.['filter']
  if(view.fieldAccess(row,'filter').read!=='visible')throw Error('连线条件不可读')
  if(value!==undefined&&value!==null&&typeof value!=='string')throw Error('连线条件必须是SPARK JSON文本')
  const parsed=DataViewFilterCodec.parseStored(value)
  if(parsed&&(view.dirtyTracking.isPendingCreate(id)||value!==row['filter']||Object.hasOwn(view.dirtyTracking.getDiff(id,row),'filter')))validateWorkflowConditionFilter(parsed,columns)
  if(!parsed)await view.removeRow(id)
  return dataSet.saveChanges(options)
 }
}
