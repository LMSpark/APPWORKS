/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-inputs
 * 职责：按当前工作流正式连线定位祖先，提供已核定开始参数、查询叶字段及模型过滤字段。
 * 边界：只读原DataView及其权限；不猜测items路径，不执行值函数，不修改定义。
 */
import {RequestState,DataViewOptionCatalog,DataViewFilter,DataViewFilterCodec,type DataSet,type DataView,type DataRow,type DataColumn} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'

function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`查询输入定义不可读: ${field}`)
 return row[field]
}
function loaded(dataSet:DataSet,table:string,workflowId:string):DataView{
 const view=dataSet.getView(table)
 if(!view||view.destroyed||view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total||view.queryContext['workflowId']!==workflowId)throw Error('查询输入的正式视图未完整读取或目标已变化')
 return view
}
function identity(view:DataView,row:DataRow):string{
 const id=read(view,row,'rowid')
 if(typeof id!=='string'||!id.trim()||view.getPkKey(row)!==id)throw Error('查询输入记录身份无效')
 return id
}
/** 候选值遵循顶层GetInputParam两段合同；查询目录的items叶字段按实际平面行投影，合成根不作为运行参数。 */
export function workflowQueryInputPresentation(dataSet:DataSet,workflowId:string,nodeId:string):{
 inputs:Array<{value:string;label:string}>;columns:DataColumn[];diagnostics:string[]
}{
 if(dataSet.destroyed||!workflowId.trim()||!nodeId.trim())throw Error('查询输入目标已失效')
 const definition=loaded(dataSet,'Base_WorkflowDefinition',workflowId),nodes=loaded(dataSet,'Base_WorkflowNodeDefinition',workflowId),
  edges=loaded(dataSet,'Base_WorkflowConnectors',workflowId),models=loaded(dataSet,'Base_DataModel',workflowId),fields=loaded(dataSet,'Base_DataModel_Field',workflowId)
 if(definition.rows.length!==1||!definition.rows[0]||identity(definition,definition.rows[0])!==workflowId)throw Error('查询输入工作流身份不唯一')
 const byId=new Map<string,DataRow>()
 for(const row of nodes.rows){
  const id=identity(nodes,row)
  if(byId.has(id)||read(nodes,row,'workflow_id')!==workflowId)throw Error('查询输入节点归属或身份不唯一')
  byId.set(id,row)
 }
 const target=byId.get(nodeId),model=models.rows[0]
 if(!target||!['query','copy'].includes(String(read(nodes,target,'node_type')))||models.rows.length!==1||!model
  ||read(models,model,'dataSetId')!==workflowId||identity(models,model)!==read(nodes,target,'node_config'))throw Error('查询输入模型归属不符')
 const columns:DataColumn[]=[],columnNames=new Set<string>()
 for(const row of fields.rows){
  identity(fields,row)
  if(read(fields,row,'dataSetId')!==workflowId||read(fields,row,'dataModelId')!==identity(models,model))throw Error('查询输入字段归属不符')
  const kind=read(fields,row,'type')
  if(kind==='inputParams')continue
  if(kind!=='dataModel')throw Error('查询字段用途尚未承接')
  const name=read(fields,row,'Name'),type=read(fields,row,'FieldType'),description=read(fields,row,'description')
  if(typeof name!=='string'||!name.trim()||columnNames.has(name)||typeof type!=='string'||!type.trim())throw Error('过滤字段名称或类型缺失或重复')
  columnNames.add(name);columns.push({name,type:type.toLowerCase(),label:typeof description==='string'&&description?description:name})
 }
 const parents=new Map<string,Set<string>>(),edgeIds=new Set<string>()
 for(const row of edges.rows){
  const id=identity(edges,row),source=read(edges,row,'sourceID'),targetId=read(edges,row,'targetID')
  if(edgeIds.has(id)||read(edges,row,'workflow_id')!==workflowId||typeof source!=='string'||typeof targetId!=='string'||!byId.has(source)||!byId.has(targetId))throw Error('查询输入连接端点缺失或归属不符')
  edgeIds.add(id);const set=parents.get(targetId)??new Set<string>();set.add(source);parents.set(targetId,set)
 }
 const ancestors=new Set<string>(),visiting=new Set<string>()
 function visit(id:string):void{
  if(visiting.has(id))throw Error('查询输入祖先路径存在环')
  if(ancestors.has(id))return
  visiting.add(id);for(const parent of parents.get(id)??[])visit(parent)
  visiting.delete(id);if(id!==nodeId)ancestors.add(id)
 }
 visit(nodeId)
 const inputs:Array<{value:string;label:string}>=[],diagnostics:string[]=[],values=new Set<string>()
 for(const id of ancestors){
  const node=byId.get(id);if(!node)throw Error('祖先节点身份缺失')
  if(nodes.hasEditingChanges(id)||nodes.dirtyTracking.hasPendingChanges(id))throw Error('祖先节点仍有未保存修改')
  const position=read(nodes,node,'position_type'),name=read(nodes,node,'name'),raw=read(nodes,node,'output_mapping')
  const start=String(position)==='0',query=String(position)==='1'&&read(nodes,node,'node_type')==='query'
  if(!start&&!query){diagnostics.push(`节点 ${typeof name==='string'?name:id} 的输出尚待执行合同验证`);continue}
  const output=raw===undefined||raw===null||raw===''?[]:typeof raw==='string'?parseJsonDocument(raw):raw
  if(!Array.isArray(output)||!output.every(isRecord))throw Error('祖先节点输出必须是对象数组')
  if(query&&!output.length){diagnostics.push(`节点 ${typeof name==='string'?name:id} 缺少查询输出目录`);continue}
  const roots=query?output.filter(item=>item['pid']===null):[],items=roots.find(item=>item['Name']==='items'),count=roots.find(item=>item['Name']==='Count')
  if(query&&(roots.length!==2||!items||!count||items['FieldType']!=='Array'||items['isParent']!==true||count['FieldType']!=='int'||count['isParent']!==false))throw Error('祖先查询输出根结构无法确认')
  const outputIds=new Set<string>()
  for(const item of output){
   const field=item['Name'],outputId=item['rowid']
   if(typeof field!=='string'||!field.trim()||typeof outputId!=='string'||!outputId||outputIds.has(outputId))throw Error('开始输出名称或身份缺失或重复')
   outputIds.add(outputId)
   if(query&&(item===items||item===count))continue
   if(id.includes('.')||field.includes('.'))throw Error('节点或字段名称含点，不能猜测递归路径')
   if(query?(item['pid']!==items?.['rowid']||item['isParent']!==false||typeof item['FieldType']!=='string'||!item['FieldType'].trim()):
    item['isParent']===true||item['pid']!==undefined&&item['pid']!==null&&item['pid']!=='')throw Error('祖先输出不是已核定的字段结构')
   const value=`${id}.${field}`
   if(values.has(value))throw Error('开始输出参数名称重复')
   values.add(value);inputs.push({value,label:`${typeof name==='string'&&name?name:id} · ${typeof item['Description']==='string'&&item['Description']?item['Description']:field}`})
  }
 }
 return {inputs,columns,diagnostics}
}

/** 来源入参和模型Filter由模型共享；新引用只可选择所有实际查询消费者共同拥有的已核定输入。 */
export function workflowQuerySharedInputPresentation(dataSet:DataSet,workflowId:string,nodeId:string){
 const state=workflowQueryInputPresentation(dataSet,workflowId,nodeId),nodes=loaded(dataSet,'Base_WorkflowNodeDefinition',workflowId),model=dataSet.getView('Base_DataModel')?.rows[0]
 if(!model)throw Error('查询输入模型缺失')
 const modelId=model['rowid'],consumers=nodes.rows.filter(row=>['query','copy'].includes(String(read(nodes,row,'node_type')))&&read(nodes,row,'node_config')===modelId)
 let inputs=state.inputs
 const diagnostics=[...state.diagnostics]
 for(const row of consumers){
  const id=identity(nodes,row);if(id===nodeId)continue
  const other=workflowQueryInputPresentation(dataSet,workflowId,id),values=new Set(other.inputs.map(item=>item.value))
  inputs=inputs.filter(item=>values.has(item.value));diagnostics.push(...other.diagnostics)
 }
 if(consumers.length>1)diagnostics.push('当前模型由多个节点共享，仅显示全部消费者共同可用的输入')
 return {...state,inputs,diagnostics:[...new Set(diagnostics)]}
}

/** 只校验实际修改的ValueFun及Filter，原未修改函数原文不参与重写；解析和候选校验复用正式数据层。 */
export function validateWorkflowQueryInputChanges(dataSet:DataSet,workflowId:string,nodeId:string,input:Readonly<{values?:readonly unknown[];filter?:unknown}>):void{
 const state=workflowQuerySharedInputPresentation(dataSet,workflowId,nodeId),context=DataViewFilter.editorContext({inputParams:state.inputs})
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
