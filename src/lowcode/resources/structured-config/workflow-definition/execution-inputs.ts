/**
 * @module app:lowcode/resources/structured-config/workflow-definition/execution-inputs
 * 职责：从正式开始声明及已核定祖先输出生成测试输入的字段描述和初始参数。
 * 边界：只读本次DataView，不查询、编辑、求值或执行；初始参数直接交原命令视图持有。
 * AI用途：运行测试窗口按原节点ID及实际字段名称绑定input，不把多个声明拆成多条业务行。
 */
import {RequestState,type DataSet,type DataRow,type DataView} from '@spark-appworks/spark-data'
import {parseJsonDocument,type JsonPath} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {workflowQueryAncestors} from './query-inputs'
import {workflowOutputFields,assertWorkflowOutputUnpublished} from './output-fields'
/** 输入字段描述；不持有可编辑测试值。 */
export type WorkflowTestField=Readonly<{
 /** 正式参数或发布字段的身份。 */
 id:string
 /** 实际业务行字段名，保留别名。 */
 name:string
 /** 字段标题。 */
 label:string
 /** 已声明的字段类型。 */
 type:string
}>
/** 同一input字段中一个业务行数组的呈现位置。 */
export type WorkflowTestInputGroup=Readonly<{
 /** 正式来源节点；整流使用固定的呈现标识。 */
 id:string
 /** 来源名称或可读的真实ID。 */
 label:string
 /** 相对原命令input的路径；整流为空路径。 */
 path:JsonPath
 /** 已正式声明的行字段。 */
 fields:readonly WorkflowTestField[]
}>
/** 测试窗口一次打开时读取的声明与初始值。 */
export type WorkflowTestInputPresentation=Readonly<{
 /** 输入位置及正式字段；没有业务运行行副本。 */
 groups:readonly WorkflowTestInputGroup[]
 /** 初始值立即交原命令视图，不作为第二份可编辑状态。 */
 seed:unknown
 /** 原字段声明合同，刷新期间不得重置本次测试。 */
 signature:string
}>
/** 本次测试的原实例、工作流及模式。 */
type Input=Readonly<{
 /** 宿主元数据实例。 */
 dataSet:DataSet
 /** 真实工作流ID。 */
 workflowId:string
 /** 单节点或整流。 */
 mode:'node'|'workflow'
 /** 单节点测试的正式目标。 */
 nodeId?:string
}>
function read(view:DataView,row:DataRow,key:string):unknown{if(view.fieldAccess(row,key).read!=='visible')throw Error(`测试参数字段不可读: ${key}`);return row[key]}
function complete(input:Input,name:string):DataView{
 const view=input.dataSet.getView(name)
 if(input.dataSet.destroyed||!view||view.destroyed||view.requestState!==RequestState.Loaded||view.loadingError||view.queryContext['workflowId']!==input.workflowId||view.rows.length!==view.total||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('测试参数正式定义未完整读取或仍有修改')
 return view
}
function fields(rows:ReadonlyArray<Record<string,unknown>>):WorkflowTestField[]{
 const names=new Set<string>(),ids=new Set<string>()
 return rows.map(row=>{
  const id=row['rowid'],name=row['Name'],type=row['FieldType'],description=row['Description']
  if(typeof id!=='string'||!id||ids.has(id)||typeof name!=='string'||!name.trim()||names.has(name)||typeof type!=='string'||!type.trim())throw Error('测试参数身份、名称或类型缺失或重复，请先确认正式声明')
  ids.add(id);names.add(name);return{id,name,label:typeof description==='string'&&description?description:name,type}
 })
}
/** 生成一次测试输入的声明与初始值；调用方将seed直接放入原requests.input，不另存值副本。
 * @param input 当前实例、工作流及明确的测试模式。
 * @returns 正式字段描述、一次性初始值及声明合同。
 */
export function workflowExecutionInputs(input:Input):WorkflowTestInputPresentation{
 if(input.mode==='workflow'){
  const view=complete(input,'Base_DataSet'),row=view.rows[0]
  if(view.rows.length!==1||!row||view.getPkKey(row)!==input.workflowId||read(view,row,'rowid')!==input.workflowId||read(view,row,'Type')!=='workflow')throw Error('开始参数定义缺失或身份不唯一')
  const raw=read(view,row,'inputParams'),parsed=raw===null||raw===undefined||raw===''?[]:typeof raw==='string'?parseJsonDocument(raw):raw
  if(!Array.isArray(parsed)||!parsed.every(isRecord))throw Error('开始参数不是正式对象数组')
  const columns=fields(parsed),groups:WorkflowTestInputGroup[]=columns.length?[{id:'workflow',label:'测试参数',path:[],fields:columns}]:[]
  const seed=columns.length?[Object.fromEntries(parsed.filter(param=>Object.hasOwn(param,'Value')&&param['Value']!==undefined).map((param):[string,unknown]=>[String(param['Name']),param['Value']]))]:[]
  return{groups,seed,signature:JSON.stringify(groups)}
 }
 const nodeId=input.nodeId;if(!nodeId)throw Error('缺少单节点测试目标')
 const nodes=complete(input,'Base_WorkflowNodeDefinition'),edges=complete(input,'Base_WorkflowConnectors'),graph=workflowQueryAncestors(nodes,edges,input.workflowId,nodeId),groups:WorkflowTestInputGroup[]=[]
 for(const id of graph.ancestors){
  const row=graph.byId.get(id);if(!row)throw Error('祖先节点身份缺失')
  const position=read(nodes,row,'position_type'),nodeType=read(nodes,row,'node_type'),mapping=read(nodes,row,'output_mapping')
  if(nodeType==='merge'){assertWorkflowOutputUnpublished(mapping);continue}
  const columns=fields(workflowOutputFields({nodeId:id,position,nodeType,mapping}))
  if(!columns.length)continue
  const label=nodes.fieldAccess(row,'name').read==='visible'&&typeof row['name']==='string'&&row['name']?row['name']:id
  groups.push({id,label,path:[id],fields:columns})
 }
 return{groups,seed:Object.fromEntries(groups.map((group):[string,unknown]=>[group.id,[{}]])),signature:JSON.stringify(groups)}
}
