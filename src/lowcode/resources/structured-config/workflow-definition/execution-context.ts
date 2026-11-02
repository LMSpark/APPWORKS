/**
 * @module app:lowcode/resources/structured-config/workflow-definition/execution-context
 * 职责：执行命令按需读取正式连线条件，捕获可达节点和可证明必经的结果。
 * 边界：原DataView持有定义，不执行条件、不假设条件分支都命中，不参与普通保存。
 */
import {DataViewFilterCodec,RequestState,type DataSet,type DataView,type DataRow,type DataViewFilterTree} from '@spark-appworks/spark-data'
import type {WorkflowExecutionGraph} from '@spark-appworks/spark-lowcode-api'
function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`执行图字段不可读: ${field}`)
 return row[field]
}
function complete(view:DataView|undefined,workflowId:string):DataView{
 if(!view||view.destroyed||view.loadingError||view.requestState!==RequestState.Loaded||view.queryContext['workflowId']!==workflowId
  ||view.rows.length!==view.total||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('执行图尚未完整读取或仍有定义修改')
 return view
}
/** 执行专用条件查询由原关系视图派生；不替换页面正在维护的连线条件或模型关系。 */
export class WorkflowExecutionContext{
 readonly #conditions:DataView
 constructor(private readonly ds:DataSet,private readonly workflowId:string,private readonly guard:()=>void){
  const source=ds.getView('Base_DataModel_Relation','asParent')
  if(!source)throw Error('执行图缺少正式关系视图')
  this.#conditions=source.createQueryView(`workflowExecution_${crypto.randomUUID().replaceAll('-','')}`)
 }
 private structure(){
  this.guard()
  const definition=complete(this.ds.getView('Base_WorkflowDefinition'),this.workflowId),nodes=complete(this.ds.getView('Base_WorkflowNodeDefinition'),this.workflowId),edges=complete(this.ds.getView('Base_WorkflowConnectors'),this.workflowId)
  const root=definition.rows[0]
  if(definition.rows.length!==1||!root||read(definition,root,'rowid')!==this.workflowId)throw Error('执行图工作流身份不唯一')
  const ids=new Set<string>(),starts:string[]=[],ends=new Set<string>()
  for(const row of nodes.rows){
   const id=read(nodes,row,'rowid'),position=String(read(nodes,row,'position_type'))
   if(typeof id!=='string'||!id||ids.has(id)||nodes.getPkKey(row)!==id||read(nodes,row,'workflow_id')!==this.workflowId||!['0','1','2'].includes(position))throw Error('执行节点身份、位置或归属不符')
   ids.add(id);if(position==='0')starts.push(id);if(position==='2')ends.add(id)
  }
  const start=starts[0];if(starts.length!==1||!start||!ends.size)throw Error('完整测试需要唯一开始节点及结束节点')
  const links:Array<{source:string;target:string}>=[],edgeIds=new Set<string>(),pairs=new Set<string>()
  for(const row of edges.rows){
   const id=read(edges,row,'rowid'),source=read(edges,row,'sourceID'),target=read(edges,row,'targetID')
   if(typeof id!=='string'||!id||edgeIds.has(id)||edges.getPkKey(row)!==id||read(edges,row,'workflow_id')!==this.workflowId
    ||typeof source!=='string'||typeof target!=='string'||!ids.has(source)||!ids.has(target))throw Error('执行连线身份或归属不符')
   const pair=JSON.stringify([source,target]);if(pairs.has(pair)||source===target||target===start||ends.has(source))throw Error('执行图连线重复或边界无效')
   pairs.add(pair);edgeIds.add(id);links.push({source,target})
  }
  const nodeIds:string[]=[],visiting=new Set<string>(),seen=new Set<string>()
  function visit(id:string):void{
   if(visiting.has(id))throw Error('执行图存在环')
   if(seen.has(id))return
   visiting.add(id);nodeIds.push(id)
   for(const link of links.filter(candidate=>candidate.source===id))visit(link.target)
   visiting.delete(id);seen.add(id)
  }
  visit(start)
  if(seen.size!==ids.size)throw Error('执行图存在不可达节点，请先完成正式连接')
  return {start,nodeIds,links,pairs}
 }
 /** 只在显式整流测试前读取本图端点条件，不扩大普通保存的装载范围。 */
 async load():Promise<void>{
  const graph=this.structure(),view=this.#conditions
  if(view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('执行条件查询仍有修改')
  view.queryContext={...view.queryContext,workflowId:this.workflowId}
  const pairs:DataViewFilterTree[]=graph.links.map(({source,target})=>({logic:'and',filters:[{field:'parentModId',operator:'eq',value:source},{field:'childModId',operator:'eq',value:target}]}))
  view.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:this.workflowId},{logic:'or',filters:pairs}]}
  await view.refresh();this.capture()
 }
 /** 图完整性与分支可证性分别表达；不在前端求值服务端条件。 */
 capture():WorkflowExecutionGraph{
  const graph=this.structure(),view=complete(this.#conditions,this.workflowId),conditions=new Map<string,boolean>(),ids=new Set<string>()
  for(const row of view.rows){
   const id=read(view,row,'rowid'),source=read(view,row,'parentModId'),target=read(view,row,'childModId'),pair=JSON.stringify([source,target])
   if(typeof id!=='string'||!id||ids.has(id)||view.getPkKey(row)!==id||read(view,row,'dataSetId')!==this.workflowId||!graph.pairs.has(pair))throw Error('执行条件身份或端点归属不符')
   if(conditions.has(pair))throw Error('同一连线端点存在多条条件')
   const raw=read(view,row,'filter');if(raw!==null&&raw!==undefined&&typeof raw!=='string')throw Error('执行条件格式无效')
   DataViewFilterCodec.parseStored(raw);conditions.set(pair,typeof raw==='string'&&raw.trim()!=='');ids.add(id)
  }
  const required=new Set([graph.start])
  let changed=true
  while(changed){
   changed=false
   for(const id of graph.nodeIds){
    const incoming=graph.links.filter(link=>link.target===id)
    if(!required.has(id)&&incoming.length&&incoming.every(link=>required.has(link.source)&&conditions.get(JSON.stringify([link.source,link.target]))!==true)){required.add(id);changed=true}
   }
  }
  return {workflowId:this.workflowId,nodeIds:graph.nodeIds,requiredNodeIds:graph.nodeIds.filter(id=>required.has(id)),conditional:[...conditions.values()].some(Boolean)}
 }
 dispose():void{if(!this.ds.destroyed)this.#conditions.dataTable?.destroyView(this.#conditions.viewId)}
}
