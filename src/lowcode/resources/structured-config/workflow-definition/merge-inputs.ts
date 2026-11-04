/**
 * @module app:lowcode/resources/structured-config/workflow-definition/merge-inputs
 * 职责：从原节点JSON及正式流程图提供选中合并输入的连接配置目录。
 * 边界：只读元数据与权限，不创建草稿、查询、保存、推导源身份或执行连接。
 * AI用途：标准过滤组件绑定原input_mapping子路径，复用当前输入与父链字段目录。
 */
import type {DataSet,DataView,DataRow,DataColumn,DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import {parseJsonDocument,type JsonPath} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {workflowQueryAncestors} from './query-inputs'

function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`合并配置字段不可读: ${field}`)
 return row[field]
}
function fields(item:Record<string,unknown>):DataColumn[]{
 if(!Array.isArray(item['Fields']))throw Error('合并输入字段必须是数组')
 const ids=new Set<string>(),names=new Set<string>()
 return item['Fields'].map(field=>{
  if(!isRecord(field)||typeof field['rowid']!=='string'||!field['rowid']||ids.has(field['rowid'])
   ||typeof field['Name']!=='string'||!field['Name'].trim()||field['Name'].includes('.')||names.has(field['Name'])
   ||typeof field['FieldType']!=='string'||!field['FieldType'].trim())throw Error('合并输入字段身份、名称或类型缺失或重复')
  ids.add(field['rowid']);names.add(field['Name'])
  return {name:field['Name'],label:typeof field['Description']==='string'&&field['Description']?field['Description']:field['Name'],type:field['FieldType'].toLowerCase()}
 })
}

/** 精确身份只对应正式祖先节点；目录是配置元信息，不证明服务已支持该连接或输出。 */
export function workflowMergeInputPresentation(input:Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;path:JsonPath}>):{
 root:boolean;columns:DataColumn[];functionContext:DataViewFilterFunctionContext
}{
 const {dataSet,workflowId,nodeId,path}=input,nodes=dataSet.getView('Base_WorkflowNodeDefinition'),edges=dataSet.getView('Base_WorkflowConnectors')
 if(!nodes||!edges||nodes.hasUnconfirmedSave||edges.hasUnconfirmedSave||edges.hasEditingChanges()||edges.dirtyTracking.hasPendingChanges())throw Error('请先确认或取消合并图的变更')
 const {byId,ancestors}=workflowQueryAncestors(nodes,edges,workflowId,nodeId),node=byId.get(nodeId)
 if(!node||read(nodes,node,'node_type')!=='merge'||String(read(nodes,node,'position_type'))!=='1')throw Error('合并节点身份不符')
 read(nodes,node,'input_mapping')
 const effective=nodes.getEditingRow(nodeId)??node
 if(effective['workflow_id']!==workflowId||effective['node_type']!=='merge'||String(effective['position_type'])!=='1')throw Error('合并节点编辑身份已变化')
 const raw=effective['input_mapping'],mapping=raw===undefined||raw===null||raw===''?[]:typeof raw==='string'?parseJsonDocument(raw):raw
 if(!Array.isArray(mapping)||path.length!==1||typeof path[0]!=='number'||!Number.isSafeInteger(path[0])||path[0]<0||!Object.hasOwn(mapping,path[0]))throw Error('合并输入选择路径已失效')
 const items=new Map<string,Record<string,unknown>>()
 for(const item of mapping){
  if(!isRecord(item)||typeof item['rowid']!=='string'||!item['rowid']||item['rowid'].includes('.')||items.has(item['rowid']))throw Error('合并输入节点身份缺失或重复')
  const source=byId.get(item['rowid'])
  if(!source||!ancestors.has(item['rowid'])||String(read(nodes,source,'position_type'))!=='1'||!['query','copy'].includes(String(read(nodes,source,'node_type'))))throw Error('合并输入不是已确认输出合同的正式查询祖先')
  if(nodes.hasEditingChanges(item['rowid'])||nodes.dirtyTracking.hasPendingChanges(item['rowid']))throw Error('请先保存或取消合并来源节点修改')
  fields(item);items.set(item['rowid'],item)
 }
 const parent=(item:Record<string,unknown>):string|undefined=>{
  const value=item['pid'];if(value===null||value===undefined||value==='')return undefined
  if(typeof value!=='string'||!items.has(value))throw Error('合并输入父节点不存在')
  return value
 }
 for(const item of items.values()){
  const seen=new Set<unknown>();let current:Record<string,unknown>|undefined=item
  while(current){if(seen.has(current['rowid']))throw Error('合并输入父链存在循环');seen.add(current['rowid']);const id=parent(current);current=id===undefined?undefined:items.get(id)}
 }
 const selected:unknown=mapping[path[0]]
 if(!isRecord(selected))throw Error('合并输入不存在')
 const chain:Array<Record<string,unknown>>=[];let current:Record<string,unknown>|undefined=selected
 while(current){chain.push(current);const id=parent(current);current=id===undefined?undefined:items.get(id)}
 return {root:parent(selected)===undefined,columns:fields(selected).map(field=>({...field,name:`${String(selected['rowid'])}.${field.name}`})),
  functionContext:{tables:chain.map(item=>({name:String(item['rowid']),label:typeof item['Name']==='string'?item['Name']:String(item['rowid']),fields:fields(item).map(field=>({name:field.name,label:field.label??field.name}))}))}}
}
