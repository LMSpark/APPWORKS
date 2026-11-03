/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-inputs
 * 职责：按当前工作流正式连线定位祖先，提供已核定开始参数、查询叶字段及模型过滤字段。
 * 边界：只读原DataView及其权限；不猜测items路径，不执行值函数，不修改定义。
 */
import {RequestState,DataViewOptionCatalog,DataViewFilter,DataViewFilterCodec,type DataSet,type DataView,type DataRow,type DataColumn} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord} from '@spark-appworks/spark-utils'
import {workflowOutputFields} from './output-fields'

function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`查询输入定义不可读: ${field}`)
 return row[field]
}
function loaded(dataSet:DataSet,table:string,workflowId:string):DataView{
 const view=dataSet.getView(table)
 const pending=table==='Base_DataModel_Field'&&view?view.dirtyTracking.pendingDeleteIds.size-view.dirtyTracking.pendingCreateIds.size:0
 if(!view||view.destroyed||view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length+pending!==view.total||view.queryContext['workflowId']!==workflowId)throw Error('查询输入的正式视图未完整读取或目标已变化')
 return view
}
function identity(view:DataView,row:DataRow):string{
 const id=read(view,row,'rowid')
 if(typeof id!=='string'||!id.trim()||view.getPkKey(row)!==id)throw Error('查询输入记录身份无效')
 return id
}
/** 尚未改绑节点时使用的正式模型范围；不覆盖节点记录或制造临时模型身份。 */
export type WorkflowQueryModelProjection=Readonly<{fromModelId:string;modelId:string;models:DataView;fields:DataView}>
function projectedViews(dataSet:DataSet,workflowId:string,projection:WorkflowQueryModelProjection):void{
 if(!projection.fromModelId.trim()||!projection.modelId.trim())throw Error('查询输入拟切换身份缺失')
 const fieldView=projection.fields,ids=fieldView.queryContext['modelIds'],filter=fieldView.filterExpression
 const fullFilter=filter&&'logic'in filter&&filter.logic==='and'&&filter.filters.length===2&&[
  ['dataSetId','eq','dataSpaceId'],['dataModelId','in','modelIds'],
 ].every(([field,operator,param])=>filter.filters.some(item=>'field'in item&&item.field===field&&item.operator===operator&&isRecord(item.value)&&item.value['Type']==='GetInputParam'&&item.value['ParamName']===param))
 if(!Array.isArray(ids)||ids.length!==1||ids[0]!==projection.modelId||!fullFilter||fieldView.queryConfig.allPages!==true||fieldView.queryConfig.distinct===true||fieldView.queryConfig.tree!==undefined)throw Error('查询输入拟切换字段归属或查询范围不完整')
 for(const [view,table] of [[projection.models,'Base_DataModel'],[projection.fields,'Base_DataModel_Field']] as const){
  const pending=view===projection.fields?view.dirtyTracking.pendingDeleteIds.size-view.dirtyTracking.pendingCreateIds.size:0
  if(view.dataSet!==dataSet||view.destroyed||dataSet.getView(table,view.viewId)!==view||view.tableName!==table||view.dataTable?.modelBinding?.modelName!==table||view.hasUnconfirmedSave
   ||view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length+pending!==view.total||view.queryContext['dataSpaceId']!==workflowId
   ||view.queryContext['workflowId']!==undefined&&view.queryContext['workflowId']!==workflowId)throw Error('查询输入拟切换正式视图未完整读取或归属已变化')
 }
}
/** 原查询输入与显式删除共用祖先合同；只投影捕获的删除ID，不改图、不自动补边。 */
export function workflowQueryAncestors(nodes:DataView,edges:DataView,workflowId:string,nodeId:string,
 projection:Readonly<{nodes:readonly string[];edges:readonly string[]}>={nodes:[],edges:[]}):Readonly<{byId:ReadonlyMap<string,DataRow>;ancestors:ReadonlySet<string>}>{
 if(!workflowId.trim()||!nodes.dataSet||nodes.dataSet!==edges.dataSet||nodes.dataSet.destroyed)throw Error('查询输入图实例或目标已失效')
 for(const view of [nodes,edges])if(view.destroyed||view.loadingError||view.requestState!==RequestState.Loaded||view.queryContext['workflowId']!==workflowId
  ||view.rows.length+view.dirtyTracking.pendingDeleteIds.size-view.dirtyTracking.pendingCreateIds.size!==view.total)throw Error('查询输入图未完整读取或目标已变化')
 const all=new Map<string,DataRow>(),byId=new Map<string,DataRow>(),omittedNodes=new Set(projection.nodes),omittedEdges=new Set(projection.edges)
 for(const row of nodes.rows){const id=identity(nodes,row);if(all.has(id)||read(nodes,row,'workflow_id')!==workflowId)throw Error('查询输入节点归属或身份不唯一');all.set(id,row);if(!omittedNodes.has(id))byId.set(id,row)}
 if(projection.nodes.some(id=>!all.has(id))||!byId.has(nodeId))throw Error('查询输入目标或删除节点不存在')
 const parents=new Map<string,Set<string>>(),edgeIds=new Set<string>()
 for(const row of edges.rows){
  const id=identity(edges,row),source=read(edges,row,'sourceID'),target=read(edges,row,'targetID')
  if(edgeIds.has(id)||read(edges,row,'workflow_id')!==workflowId||typeof source!=='string'||typeof target!=='string'||!all.has(source)||!all.has(target))throw Error('查询输入连接端点缺失或归属不符')
  edgeIds.add(id);if(omittedEdges.has(id))continue
  if(!byId.has(source)||!byId.has(target))throw Error('删除投影仍保留已删除节点的连线端点')
  const set=parents.get(target)??new Set<string>();set.add(source);parents.set(target,set)
 }
 if(projection.edges.some(id=>!edgeIds.has(id)))throw Error('删除连线身份不存在')
 const ancestors=new Set<string>(),visiting=new Set<string>()
 function visit(id:string):void{if(visiting.has(id))throw Error('查询输入祖先路径存在环');if(ancestors.has(id))return;visiting.add(id);for(const parent of parents.get(id)??[])visit(parent);visiting.delete(id);if(id!==nodeId)ancestors.add(id)}
 visit(nodeId);return{byId,ancestors}
}
/** 候选值遵循顶层GetInputParam两段合同；查询目录的items叶字段按实际平面行投影，合成根不作为运行参数。 */
export function workflowQueryInputPresentation(dataSet:DataSet,workflowId:string,nodeId:string,projection?:WorkflowQueryModelProjection):{
 inputs:Array<{value:string;label:string}>;columns:DataColumn[];diagnostics:string[]
}{
 if(dataSet.destroyed||!workflowId.trim()||!nodeId.trim())throw Error('查询输入目标已失效')
 const definition=loaded(dataSet,'Base_WorkflowDefinition',workflowId),nodes=loaded(dataSet,'Base_WorkflowNodeDefinition',workflowId),edges=loaded(dataSet,'Base_WorkflowConnectors',workflowId)
 if(projection)projectedViews(dataSet,workflowId,projection)
 const models=projection?.models??loaded(dataSet,'Base_DataModel',workflowId),fields=projection?.fields??loaded(dataSet,'Base_DataModel_Field',workflowId)
 if(definition.rows.length!==1||!definition.rows[0]||identity(definition,definition.rows[0])!==workflowId)throw Error('查询输入工作流身份不唯一')
 const {byId,ancestors}=workflowQueryAncestors(nodes,edges,workflowId,nodeId)
 const target=byId.get(nodeId),selected=projection?models.rows.filter(row=>models.getPkKey(row)===projection.modelId):models.rows,model=selected[0]
 if(!target||!['query','copy'].includes(String(read(nodes,target,'node_type')))||selected.length!==1||!model
  ||read(models,model,'dataSetId')!==workflowId||read(nodes,target,'node_config')!==(projection?.fromModelId??identity(models,model)))throw Error('查询输入模型归属不符')
 if(projection&&(nodes.hasEditingChanges(nodeId)||nodes.dirtyTracking.hasPendingChanges(nodeId)||models.dirtyTracking.isPendingCreate(projection.modelId)||models.dirtyTracking.isPendingDelete(projection.modelId)))throw Error('拟切换节点存在独立改绑草稿或模型尚未正式确认')
 const columns:DataColumn[]=[],columnNames=new Set<string>()
 for(const row of fields.rows){
  identity(fields,row)
  if(read(fields,row,'dataSetId')!==workflowId||read(fields,row,'dataModelId')!==identity(models,model))throw Error('查询输入字段归属不符')
  const kind=read(fields,row,'type')
  if(kind==='inputParams')continue
  if(kind!=='dataModel')throw Error('查询字段用途尚未承接')
  const fieldId=fields.getPkKey(row),effective=fieldId===undefined?row:fields.getEditingRow(fieldId)??row
  for(const field of ['Name','FieldType','description'])read(fields,row,field)
  const name=effective['Name'],type=effective['FieldType'],description=effective['description']
  if(name===''&&fieldId!==undefined&&fields.dirtyTracking.isPendingCreate(fieldId))continue
  if(typeof name!=='string'||!name.trim()||columnNames.has(name)||typeof type!=='string'||!type.trim())throw Error('过滤字段名称或类型缺失或重复')
  columnNames.add(name);columns.push({name,type:type.toLowerCase(),label:typeof description==='string'&&description?description:name})
 }
 const inputs:Array<{value:string;label:string}>=[],diagnostics:string[]=[],values=new Set<string>()
 for(const id of ancestors){
  const node=byId.get(id);if(!node)throw Error('祖先节点身份缺失')
  if(nodes.hasEditingChanges(id)||nodes.dirtyTracking.hasPendingChanges(id))throw Error('祖先节点仍有未保存修改')
  const position=read(nodes,node,'position_type'),name=read(nodes,node,'name'),raw=read(nodes,node,'output_mapping')
  const start=String(position)==='0',query=String(position)==='1'&&read(nodes,node,'node_type')==='query'
  if(!start&&!query){diagnostics.push(`节点 ${typeof name==='string'?name:id} 的输出尚待执行合同验证`);continue}
  const output=workflowOutputFields({nodeId:id,position,nodeType:start?'query':read(nodes,node,'node_type'),mapping:raw})
  if(query&&!output.length){diagnostics.push(`节点 ${typeof name==='string'?name:id} 缺少查询输出目录`);continue}
  for(const item of output){
   const field=item['Name'] as string
   const value=`${id}.${field}`
   if(values.has(value))throw Error('开始输出参数名称重复')
   values.add(value);inputs.push({value,label:`${typeof name==='string'&&name?name:id} · ${typeof item['Description']==='string'&&item['Description']?item['Description']:field}`})
  }
 }
 return {inputs,columns,diagnostics}
}

/** 来源入参和模型Filter由模型共享；新引用只可选择所有实际查询消费者共同拥有的已核定输入。 */
export function workflowQuerySharedInputPresentation(dataSet:DataSet,workflowId:string,nodeId:string,projection?:WorkflowQueryModelProjection){
 const state=workflowQueryInputPresentation(dataSet,workflowId,nodeId,projection),nodes=loaded(dataSet,'Base_WorkflowNodeDefinition',workflowId),model=projection?projection.models.rows.find(row=>projection.models.getPkKey(row)===projection.modelId):dataSet.getView('Base_DataModel')?.rows[0]
 if(!model)throw Error('查询输入模型缺失')
 if(projection&&projection.modelId!==projection.fromModelId){
  if(nodes.rows.some(row=>identity(nodes,row)!==nodeId&&(read(nodes,row,'node_config')===projection.modelId||read(nodes,row,'dataOperateModId')===projection.modelId)))throw Error('隔离模型已有其他消费者，不能采用单节点祖先输入')
  return state
 }
 const modelId=model['rowid'],consumers=nodes.rows.filter(row=>['query','copy'].includes(String(read(nodes,row,'node_type')))&&read(nodes,row,'node_config')===modelId)
 let inputs=state.inputs
 const diagnostics=[...state.diagnostics]
 for(const row of consumers){
  const id=identity(nodes,row);if(id===nodeId)continue
  const other=workflowQueryInputPresentation(dataSet,workflowId,id,projection),values=new Set(other.inputs.map(item=>item.value))
  inputs=inputs.filter(item=>values.has(item.value));diagnostics.push(...other.diagnostics)
 }
 if(consumers.length>1)diagnostics.push('当前模型由多个节点共享，仅显示全部消费者共同可用的输入')
 return {...state,inputs,diagnostics:[...new Set(diagnostics)]}
}

/** 只校验实际修改的ValueFun及Filter，原未修改函数原文不参与重写；解析和候选校验复用正式数据层。 */
export function validateWorkflowQueryInputChanges(dataSet:DataSet,workflowId:string,nodeId:string,input:Readonly<{values?:readonly unknown[];filter?:unknown}>,projection?:WorkflowQueryModelProjection):void{
 const state=workflowQuerySharedInputPresentation(dataSet,workflowId,nodeId,projection),context=DataViewFilter.editorContext({inputParams:state.inputs})
 for(const value of input.values??[]){
  if(typeof value!=='string')throw Error('ValueFun必须保存为值函数字符串')
  if(value==='')continue
  const expression=DataSpaceDesignApi.parseValueFunction(value)
  if(!expression)throw Error('值函数不能为空白，请明确清空')
  const parsed=DataViewFilter.parse({field:'ValueFun',operator:'eq',value:expression})
  if(!parsed.ok)throw Error(parsed.issues.map(issue=>issue.message).join('；'))
  const issues=parsed.value.validate({fields:[{name:'ValueFun',type:'text'}],valueFunctions:context})
  if(issues.length)throw Error(issues.map(issue=>issue.message).join('；'))
 }
 if(Object.hasOwn(input,'filter')){
  if(input.filter!==null&&input.filter!==undefined&&typeof input.filter!=='string')throw Error('查询条件必须保存为SPARK JSON文本')
  const filter=DataViewFilterCodec.parseStored(input.filter)
  const issues=filter?.validate({fields:DataViewFilter.fields(state.columns),valueFunctions:context})??[]
  if(issues.length)throw Error(issues.map(issue=>issue.message).join('；'))
 }
}

/** 本次查询节点的候选投影；定义与草稿仍属于原视图，临时目录只供标准组件绑定读取。 */
export class WorkflowQueryInputs{
 readonly view:DataView
 readonly dataViewKey:string
 readonly #catalog:DataViewOptionCatalog
 constructor(private readonly dataSet:DataSet,private readonly workflowId:string,private readonly nodeId:string){
  this.#catalog=new DataViewOptionCatalog(dataSet)
  this.view=this.#catalog.view
  this.dataViewKey=this.#catalog.dataViewKey
 }
 /** 每次从原视图重算，失效时先清空候选；目录更新不回写业务定义或自动选择参数。 */
 refresh(){
  try{
   const state=workflowQuerySharedInputPresentation(this.dataSet,this.workflowId,this.nodeId)
   this.#catalog.replace(state.inputs)
   return {...state,error:''}
  }catch(cause){
   this.#catalog.replace([])
   return {inputs:[],columns:[],diagnostics:[],error:cause instanceof Error?cause.message:String(cause)}
  }
 }
 /** 释放本次临时投影，保留原工作流定义与所有编辑覆盖。 */
 dispose():void{this.#catalog.dispose()}
}
