/**
 * @module app:lowcode/resources/structured-config/workflow-definition/connectors
 * 职责：正式工作流连线的端点/环校验与原DataView新增、精确保存。
 * 边界：连线不是布局；不复制节点或草稿，未知提交仅沿原DataSet核验，不重复新增。
 */
import {RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`连线定义字段不可读: ${field}`)
 return row[field]
}
function scope(ds:DataSet,workflowId:string){
 const definition=ds.getView('Base_WorkflowDefinition'),nodes=ds.getView('Base_WorkflowNodeDefinition'),edges=ds.getView('Base_WorkflowConnectors')
 if(ds.destroyed||!workflowId.trim()||!definition||!nodes||!edges)throw Error('连线工作区已失效')
 for(const view of [definition,nodes,edges])if(view.destroyed||view.mutating||view.loadingError||view.requestState!==RequestState.Loaded
  ||view.queryContext['workflowId']!==workflowId||view.rows.length+view.dirtyTracking.pendingDeleteIds.size-view.dirtyTracking.pendingCreateIds.size!==view.total)throw Error('连线工作区未完整读取或归属已变化')
 const root=definition.rows[0]
 if(definition.rows.length!==1||!root||read(definition,root,'rowid')!==workflowId||definition.getPkKey(root)!==workflowId)throw Error('连线流程身份不唯一')
 return {nodes,edges}
}
function validate(ds:DataSet,workflowId:string,edge:Readonly<{source:string|number;target:string|number}>,existingId?:string){
 const {nodes,edges}=scope(ds,workflowId),byId=new Map<string|number,DataRow>()
 for(const row of nodes.rows){
  const id=nodes.getPkKey(row)
  if(id===undefined||read(nodes,row,'rowid')!==id||byId.has(id)||read(nodes,row,'workflow_id')!==workflowId)throw Error('节点身份或归属不唯一')
  byId.set(id,row)
 }
 const source=byId.get(edge.source),target=byId.get(edge.target)
 if(!source||!target)throw Error('连线端点归属不符')
 if(edge.source===edge.target)throw Error('不能连接节点自身')
 if(String(read(nodes,target,'position_type'))==='0')throw Error('不能连接到开始节点')
 if(String(read(nodes,source,'position_type'))==='2')throw Error('结束节点不能添加下游连线')
 if(nodes.hasEditingChanges(edge.source)||nodes.dirtyTracking.hasPendingChanges(edge.source)||nodes.hasEditingChanges(edge.target)||nodes.dirtyTracking.hasPendingChanges(edge.target))throw Error('请先保存或取消端点节点的修改')
 const links=new Map<string|number,Set<string|number>>(),ids=new Set<string|number>()
 for(const row of edges.rows){
  const id=edges.getPkKey(row),from=read(edges,row,'sourceID'),to=read(edges,row,'targetID')
  if(id===undefined||read(edges,row,'rowid')!==id||ids.has(id)||read(edges,row,'workflow_id')!==workflowId
   ||typeof from!=='string'&&typeof from!=='number'||typeof to!=='string'&&typeof to!=='number'||!byId.has(from)||!byId.has(to))throw Error('原连线身份、端点或归属不符')
  ids.add(id);if(id===existingId)continue
  if(from===edge.source&&to===edge.target)throw Error('相同端点连线重复')
  const children=links.get(from)??new Set<string|number>();children.add(to);links.set(from,children)
 }
 const seen=new Set<string|number>()
 function reaches(id:string|number):boolean{
  if(id===edge.source)return true
  if(seen.has(id))return false
  seen.add(id);return [...links.get(id)??[]].some(reaches)
 }
 if(reaches(edge.target))throw Error('连线将形成环')
 return {nodes,edges}
}
/** 只编排当前正式连接器视图；新增先形成可取消草稿，保存由显式命令触发。 */
export class WorkflowConnectors{
 static async add(ds:DataSet,workflowId:string,edge:Readonly<{source:string|number;target:string|number}>):Promise<string>{
  const {edges}=validate(ds,workflowId,edge)
  if(edges.hasUnconfirmedSave||edges.hasEditingChanges()||edges.dirtyTracking.hasPendingChanges())throw Error('请先处理原连线修改或未知提交')
  if(edges.addActionState()!=='enabled')throw Error('当前查询不允许新增连线')
  const result=await edges.addRow({sourceID:edge.source,targetID:edge.target,name:'',description:'',params:'[]'})
  const row=edges.rows.find(candidate=>edges.getPkKey(candidate)===edges.getPkKey(result as DataRow)),id=row&&edges.getPkKey(row)
  if(!row||typeof id!=='string'||read(edges,row,'workflow_id')!==workflowId)throw Error('新增连线未获得当前流程正式身份')
  scope(ds,workflowId);edges.setCurrentRow(row);return id
 }
 static async save(ds:DataSet,workflowId:string,edgeId:string){
  const {edges}=scope(ds,workflowId),options={views:[{tableName:edges.tableName,viewId:edges.viewId,ids:[edgeId]}]}
  if(edges.hasUnconfirmedSave)return ds.saveChanges(options)
  const row=edges.rows.find(candidate=>edges.getPkKey(candidate)===edgeId)
  if(!row)throw Error('当前连线不存在')
  const effective=edges.getEditingRow(edgeId)??row,source=read(edges,row,'sourceID'),target=read(edges,row,'targetID')
  if(effective['sourceID']!==source||effective['targetID']!==target||effective['workflow_id']!==workflowId)throw Error('请取消不支持的连线端点修改')
  if(typeof source!=='string'&&typeof source!=='number'||typeof target!=='string'&&typeof target!=='number')throw Error('连线端点无效')
  if(edges.dirtyTracking.isPendingCreate(edgeId))validate(ds,workflowId,{source,target},edgeId)
  return ds.saveChanges(options)
 }
}
