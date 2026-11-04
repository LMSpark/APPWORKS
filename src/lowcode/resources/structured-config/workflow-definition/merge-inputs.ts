/**
 * @module app:lowcode/resources/structured-config/workflow-definition/merge-inputs
 * 职责：原合并输入的范围核对、连接目录、来源增删及输出配置生成命令。
 * 边界：只读正式图，仅写原DataView的input_mapping/output_mapping；不查询、保存、推导源身份或执行连接。
 * AI用途：以标准组件绑定原JSON、只读候选视图及父链字段目录，不复制业务草稿。
 */
import {DataViewOptionCatalog,RequestState,type DataSet,type DataView,type DataRow,type DataColumn,type DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import {parseJsonDocument,type JsonPath} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {workflowQueryAncestors} from './query-inputs'
import {workflowOutputFields} from './output-fields'
import {assertWorkflowNodeOutputChanges} from './node-output-references'
import {workflowQueryDraftSignature,workflowFieldChanges} from './query-field-context'

/** 本次原生合并输入命令的唯一目标，不承载可编辑业务副本。 */
type Target=Readonly<{
 /** 本次宿主提供的元数据DataSet。 */
 dataSet:DataSet
 /** 正式工作流身份；必须匹配原查询上下文。 */
 workflowId:string
 /** 该流程内的正式合并节点身份。 */
 nodeId:string
}>

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

function scope(input:Target,formal=false){
 const {dataSet,workflowId,nodeId}=input,nodes=dataSet.getView('Base_WorkflowNodeDefinition'),edges=dataSet.getView('Base_WorkflowConnectors')
 if(!nodes||!edges||nodes.mutating||edges.mutating||nodes.hasUnconfirmedSave||edges.hasUnconfirmedSave||edges.hasEditingChanges()||edges.dirtyTracking.hasPendingChanges())throw Error('请先确认或取消合并图的变更')
 const {byId,ancestors}=workflowQueryAncestors(nodes,edges,workflowId,nodeId),node=byId.get(nodeId)
 if(!node||read(nodes,node,'node_type')!=='merge'||String(read(nodes,node,'position_type'))!=='1')throw Error('合并节点身份不符')
 read(nodes,node,'input_mapping')
 if(formal&&(nodes.hasEditingChanges(nodeId)||nodes.dirtyTracking.hasPendingChanges(nodeId)))throw Error('请先保存或取消合并节点的独立修改')
 const effective=formal?node:nodes.getEditingRow(nodeId)??node
 if(effective['rowid']!==nodeId||effective['workflow_id']!==workflowId||effective['node_type']!=='merge'||String(effective['position_type'])!=='1')throw Error('合并节点编辑身份已变化')
 const raw=effective['input_mapping'],parsed:unknown=raw===undefined||raw===null||raw===''?[]:typeof raw==='string'?parseJsonDocument(raw):raw
 if(!Array.isArray(parsed))throw Error('合并输入必须是对象数组')
 const mapping:unknown[]=parsed
 const items=new Map<string,Record<string,unknown>>()
 for(const item of mapping){
  if(!isRecord(item)||typeof item['rowid']!=='string'||!item['rowid']||item['rowid'].includes('.')||items.has(item['rowid']))throw Error('合并输入节点身份缺失或重复')
  const source=byId.get(item['rowid'])
  if(!source||!ancestors.has(item['rowid'])||String(read(nodes,source,'position_type'))!=='1'||!['query','copy'].includes(String(read(nodes,source,'node_type'))))throw Error('合并输入不是已确认输出合同的正式查询祖先')
  if(!formal&&(nodes.hasEditingChanges(item['rowid'])||nodes.dirtyTracking.hasPendingChanges(item['rowid'])))throw Error('请先保存或取消合并来源节点修改')
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
 return {nodes,edges,node,effective,mapping,items,parent,byId,ancestors}
}
/** 引用检查只读原查询中的正式合并绑定，共用同一身份/父链/字段校验，不接纳独立合并草稿。 */
export function workflowMergeFormalInputs(input:Target):ReadonlyArray<Readonly<Record<string,unknown>>>{return[...scope(input,true).items.values()]}
function selected(context:ReturnType<typeof scope>,path:JsonPath):Record<string,unknown>{
 if(path.length!==1||typeof path[0]!=='number'||!Number.isSafeInteger(path[0])||path[0]<0||!Object.hasOwn(context.mapping,path[0]))throw Error('合并输入选择路径已失效')
 const item=context.mapping[path[0]];if(!isRecord(item))throw Error('合并输入不存在');return item
}
/** 精确身份只对应正式祖先节点；目录是配置元信息，不证明服务已支持该连接或输出。 */
export function workflowMergeInputPresentation(input:Target&Readonly<{path:JsonPath}>):{
 root:boolean;columns:DataColumn[];functionContext:DataViewFilterFunctionContext
}{
 const context=scope(input),{parent,items}=context,item=selected(context,input.path)
 const chain:Array<Record<string,unknown>>=[];let current:Record<string,unknown>|undefined=item
 while(current){chain.push(current);const id=parent(current);current=id===undefined?undefined:items.get(id)}
 return {root:parent(item)===undefined,columns:fields(item).map(field=>({...field,name:`${String(item['rowid'])}.${field.name}`})),
  functionContext:{tables:chain.map(entry=>({name:String(entry['rowid']),label:typeof entry['Name']==='string'?entry['Name']:String(entry['rowid']),fields:fields(entry).map(field=>({name:field.name,label:field.label??field.name}))}))}}
}

function signature(context:ReturnType<typeof scope>):string{
 return JSON.stringify([context.nodes.queryContext,context.nodes.queryConfig,context.nodes.filterExpression,context.edges.queryContext,context.edges.queryConfig,context.edges.filterExpression,context.nodes.readSnapshot(),context.edges.readSnapshot(),context.effective['input_mapping']])
}
function candidates(context:ReturnType<typeof scope>){
 const choices:Array<{value:string;label:string}>=[]
 for(const id of context.ancestors){
  const row=context.byId.get(id);if(!row||context.items.has(id)||context.nodes.hasEditingChanges(id)||context.nodes.dirtyTracking.hasPendingChanges(id))continue
  if(['node_type','position_type','name','output_mapping'].some(field=>context.nodes.fieldAccess(row,field).read!=='visible'))continue
  if(String(row['position_type'])!=='1'||!['query','copy'].includes(String(row['node_type'])))continue
  if(typeof row['name']!=='string'||!row['name'])continue
  choices.push({value:id,label:row['name']})
 }
 return choices
}
function write(context:ReturnType<typeof scope>,mapping:readonly unknown[]):void{
 if(context.nodes.commitMode!=='staged'||context.nodes.editActionState(context.node)!=='enabled'||context.nodes.fieldAccess(context.node,'input_mapping').write!=='allowed')throw Error('当前查询不允许修改合并输入')
 context.nodes.updateEditingValue(String(context.nodes.getPkKey(context.node)),'input_mapping',JSON.stringify(mapping))
}
function definitionState(dataSet:DataSet):string{
 const watched=['Base_WorkflowNodeDefinition','Base_WorkflowConnectors','Base_DataModel','Base_DataModel_Field','Base_DataModel_Relation','Base_DataSet'].flatMap(name=>{const view=dataSet.getView(name);return view?[view]:[]})
 return JSON.stringify([dataSet.destroyed,workflowQueryDraftSignature(watched),watched.map(view=>[view.destroyed,view.requestState,view.queryConfig,view.filterExpression,view.requestState===RequestState.Loaded&&!view.loadingError?view.readSnapshot():null])])
}
function outputIdentity(sourceId:string,fieldId:string):string{return `${encodeURIComponent(sourceId)}:${encodeURIComponent(fieldId)}`}
function assertOutputOrigin(context:ReturnType<typeof scope>,row:Record<string,unknown>):void{
 const key=row['rowid'],parts=typeof key==='string'?key.split(':'):[]
 if(parts.length!==2)throw Error('输出配置身份不是正式来源限定键；不兼容旧字段ID')
 let sourceId:string,fieldId:string
 try{sourceId=decodeURIComponent(parts[0]??'');fieldId=decodeURIComponent(parts[1]??'')}catch{throw Error('输出配置身份编码无效')}
 if(!sourceId||!fieldId||outputIdentity(sourceId,fieldId)!==key)throw Error('输出配置身份编码无效')
 const source=context.byId.get(sourceId),nodes=context.nodes
 if(!source||!context.ancestors.has(sourceId)||String(read(nodes,source,'position_type'))!=='1'||!['query','copy'].includes(String(read(nodes,source,'node_type')))
  ||nodes.hasEditingChanges(sourceId)||nodes.dirtyTracking.hasPendingChanges(sourceId))throw Error('输出配置来源不是已确认的正式祖先')
 const published=workflowOutputFields({nodeId:sourceId,position:read(nodes,source,'position_type'),nodeType:read(nodes,source,'node_type'),mapping:read(nodes,source,'output_mapping')})
 if(!published.some(field=>field['rowid']===fieldId))throw Error('输出配置字段已不属于来源正式发布目录')
}

function outputPlan(input:Target){
 const context=scope(input),{nodes,node,effective}=context
 const state=()=>{const current=scope(input);return JSON.stringify([signature(current),current.effective['output_mapping'],definitionState(input.dataSet)])}
 const baseline=state()
 const assertCurrent=()=>{if(state()!==baseline)throw Error('合并输出生成目标、草稿或查询已变化；保留当前修改')}
 const original=read(nodes,node,'output_mapping')
 const document=(value:unknown):Array<Record<string,unknown>>=>{
  const parsed:unknown=value===null||value===undefined||value===''?[]:typeof value==='string'?parseJsonDocument(value):value
  if(!Array.isArray(parsed)||!parsed.every(isRecord))throw Error('合并输出必须是对象数组')
  const ids=new Set<string>(),names=new Set<string>()
  for(const row of parsed){
   if(typeof row['rowid']!=='string'||!row['rowid']||ids.has(row['rowid'])||typeof row['Name']!=='string'||!row['Name'].trim()||names.has(row['Name'])
    ||typeof row['FieldType']!=='string'||!row['FieldType'].trim()||row['isParent']!==false||row['pid']!==null)throw Error('合并输出身份、名称或平面结构无法确认')
   ids.add(row['rowid']);names.add(row['Name'])
  }
  return parsed
 }
 const before=document(effective['output_mapping']),formal=document(original)
 for(const row of formal)assertOutputOrigin(context,row)
 const selectedFields:Array<{sourceId:string;field:Record<string,unknown>}>=[]
 for(const [sourceId,item] of context.items){
  const source=context.byId.get(sourceId);if(!source)throw Error('合并来源节点不存在')
  const published=workflowOutputFields({nodeId:sourceId,position:read(nodes,source,'position_type'),nodeType:read(nodes,source,'node_type'),mapping:read(nodes,source,'output_mapping')})
  const declared=item['Fields'];if(!Array.isArray(declared)||!declared.every(isRecord))throw Error('合并输入字段必须是对象数组')
  for(const field of declared){
   const actual=published.find(row=>row['rowid']===field['rowid'])
   if(!actual||actual['Name']!==field['Name']||actual['FieldType']!==field['FieldType'])throw Error('合并来源字段已变化，请重新核对输入')
   if(field['IsOutput']!==0&&field['IsOutput']!==1)throw Error('合并字段输出标志必须是0或1')
   if(field['AsName']!==undefined&&field['AsName']!==null&&typeof field['AsName']!=='string')throw Error('合并输出别名必须是文本')
   if(field['IsOutput']===1)selectedFields.push({sourceId,field})
  }
 }
 const names=new Set<string>(),ids=new Set<string>(),used=new Set<Record<string,unknown>>()
 const output=selectedFields.map(({sourceId,field})=>{
  const name=typeof field['AsName']==='string'&&field['AsName'].trim()?field['AsName']:String(field['Name'])
  if(name!==name.trim()||name.includes('.')||names.has(name))throw Error('合并输出名称无效或重复，请调整别名')
  names.add(name)
  const qualified=outputIdentity(sourceId,String(field['rowid']))
  const existing=before.find(row=>row['rowid']===qualified)
  if(existing)used.add(existing)
  const id=existing?.['rowid']??qualified
  if(ids.has(String(id)))throw Error('合并输出配置身份重复')
  ids.add(String(id))
  return {...existing,rowid:id,pid:null,Name:name,Description:typeof field['Description']==='string'?field['Description']:'',FieldType:field['FieldType'],isParent:false}
 })
 for(const row of before)if(!used.has(row))assertOutputOrigin(context,row)
 return {context,formal,before,output,assertCurrent}
}
/** 从本次输入生成配置目录；只暂存原字段，不发布未经服务验证的合并运行合同。 */
export async function generateWorkflowMergeOutput(input:Target):Promise<void>{
 const {context,formal,output,assertCurrent}=outputPlan(input),{nodes,node}=context
 await assertWorkflowNodeOutputChanges({...input,before:formal,after:output,assertCurrent});assertCurrent()
 if(nodes.commitMode!=='staged'||nodes.editActionState(node)!=='enabled'||nodes.fieldAccess(node,'output_mapping').write!=='allowed')throw Error('当前查询不允许修改合并输出')
 nodes.updateEditingValue(input.nodeId,'output_mapping',JSON.stringify(output))
}

/** 保存前重核原输出与本次输入；不补写目录、不保存，不干预原未知结果恢复。 */
export async function validateWorkflowMergeOutput(input:Target):Promise<void>{
 const current=scope(input)
 const empty=(value:unknown):boolean=>{const parsed:unknown=value===undefined||value===null||value===''?[]:typeof value==='string'?parseJsonDocument(value):value;return Array.isArray(parsed)&&parsed.length===0}
 if(empty(read(current.nodes,current.node,'output_mapping'))&&empty(current.effective['output_mapping']))return
 const {formal,before,output,assertCurrent}=outputPlan(input)
 if(JSON.stringify(before)!==JSON.stringify(output))throw Error('合并输出与当前输入不一致，请重新生成输出模型')
 await assertWorkflowNodeOutputChanges({...input,before:formal,after:before,assertCurrent});assertCurrent()
}

/** 原节点保存前检查所有被修改的合并定义，共用首轮合同；未知结果交回原保存责任方。 */
export async function validateWorkflowMergeNodeChanges(input:Pick<Target,'dataSet'|'workflowId'>):Promise<void>{
 const nodes=input.dataSet.getView('Base_WorkflowNodeDefinition')
 if(!nodes)throw Error('合并保存缺少原节点视图')
 if(nodes.hasUnconfirmedSave)return
 const baseline=definitionState(input.dataSet)
 for(const row of nodes.rows){
  const key=nodes.getPkKey(row);if(typeof key!=='string')throw Error('节点保存身份缺失')
  const changes=workflowFieldChanges(nodes,row,key)
  if(!['input_mapping','output_mapping'].some(field=>Object.hasOwn(changes,field)))continue
  if(read(nodes,row,'node_type')==='merge')await validateWorkflowMergeOutput({...input,nodeId:key})
  if(definitionState(input.dataSet)!==baseline)throw Error('合并节点保存检查期间原定义已变化；保留当前修改')
 }
}

/** 本次来源选择的标准只读目录；业务草稿仍唯一属于原节点DataView。 */
export class WorkflowMergeSourceOptions{
 /** 标准表格绑定的候选视图，value为原节点身份、label为可读标题。 */
 readonly view:DataView
 /** 本次目录完整视图键；不作正式来源模型身份。 */
 readonly dataViewKey:string
 readonly #catalog:DataViewOptionCatalog
 #baseline:string|undefined
 #active=true
 /** 创建本次选项目录，不查询或保存正式记录。@param input 元数据DataSet、流程ID及合并节点ID。 */
 constructor(private readonly input:Target){this.#catalog=new DataViewOptionCatalog(input.dataSet);this.view=this.#catalog.view;this.dataViewKey=this.#catalog.dataViewKey}
 /** 捕获同一图/查询/输入基线并替换只读候选；失败清空，不能继续借用旧选择。 */
 refresh():{error:string}{
  if(!this.#active)return{error:'来源选择已释放'}
  try{const current=scope(this.input);this.#baseline=signature(current);this.#catalog.replace(candidates(current));return{error:''}}
  catch(cause){this.#baseline=undefined;this.#catalog.replace([]);return{error:cause instanceof Error?cause.message:String(cause)}}
 }
 /** 选中源加入根或指定父项下，仅写原输入编辑域；字段采用正式已发布输出，返回原数组新路径。 */
 add(parentPath:JsonPath|null):JsonPath{
  if(!this.#active||!this.#baseline)throw Error('来源选择已释放或尚未读取')
  const current=scope(this.input)
  if(signature(current)!==this.#baseline)throw Error('来源选择的原图或输入已变化，请重新选择')
  const row=this.view.currentRow,id=row&&this.view.fieldAccess(row,'value').read==='visible'?row['value']:undefined
  if(typeof id!=='string'||!candidates(current).some(option=>option.value===id))throw Error('请从当前正式祖先候选选择来源；不能复用来源或生成后缀身份')
  const source=current.byId.get(id);if(!source)throw Error('来源节点不存在')
  const output=workflowOutputFields({nodeId:id,position:read(current.nodes,source,'position_type'),nodeType:read(current.nodes,source,'node_type'),mapping:read(current.nodes,source,'output_mapping')})
  const parent=parentPath===null?undefined:selected(current,parentPath),next={rowid:id,pid:parent?.['rowid']??null,Name:read(current.nodes,source,'name'),JoinType:null,JoinFilter:null,
   Fields:output.map(field=>({rowid:field['rowid'],Name:field['Name'],AsName:field['Name'],Description:typeof field['Description']==='string'?field['Description']:'',FieldType:field['FieldType'],IsOutput:1}))}
  const index=parentPath===null?current.mapping.length:Number(parentPath[0])+1,mapping=[...current.mapping];mapping.splice(index,0,next);write(current,mapping);return[index]
 }
 /** 沿本次同一捕获基线移除指定输入子树；不会删除任何来源业务记录。 */
 remove(path:JsonPath):string[]{
  if(!this.#active||!this.#baseline)throw Error('来源选择已释放或尚未读取')
  if(signature(scope(this.input))!==this.#baseline)throw Error('来源移除的原图或输入已变化，请重新确认')
  return removeWorkflowMergeInput({...this.input,path})
 }
 /** 释放自有目录及捕获基线，不取消、保存或删除正式工作流记录。 */
 dispose():void{if(!this.#active)return;this.#active=false;this.#baseline=undefined;this.#catalog.dispose()}
}

/** 精确删除输入子树；保留条件仍引用被移除输入时拒绝，不删除业务节点、模型或输出目录。 */
export function removeWorkflowMergeInput(input:Target&Readonly<{path:JsonPath}>):string[]{
 const current=scope(input),item=selected(current,input.path),removed=new Set([String(item['rowid'])])
 let changed=true;while(changed){changed=false;for(const row of current.items.values())if(typeof row['pid']==='string'&&removed.has(row['pid'])&&!removed.has(String(row['rowid']))){removed.add(String(row['rowid']));changed=true}}
 function visit(value:unknown):void{
  if(Array.isArray(value)){value.forEach(visit);return}
  if(!isRecord(value)||value['Type']==='GetConstValue')return
  if(value['Type']==='GetExpData')throw Error('保留的合并条件含不透明表达式，不能核定删除引用')
  if(value['Type']==='GetTableField'&&typeof value['Field']==='string'&&removed.has(value['Field'].split('.')[0]??''))throw Error('被移除的合并输入仍被引用，请先修改并确认保留条件')
  for(const child of Object.values(value))visit(child)
 }
 for(const row of current.items.values())if(!removed.has(String(row['rowid']))&&current.parent(row)!==undefined)visit(row['JoinFilter'])
 write(current,current.mapping.filter(row=>isRecord(row)&&!removed.has(String(row['rowid']))));return[...removed]
}
