/**
 * @module app:lowcode/resources/structured-config/workflow-definition/execution/execution-context
 * 职责：执行命令按需读取正式连线条件，捕获可达节点和可证明必经的结果。
 * 边界：原DataView持有定义，不执行条件、不假设条件分支都命中，不参与普通保存。
 */
import {DataViewFilterCodec,RequestState,type DataSet,type DataView,type DataRow,type DataViewFilterTree} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi,type WorkflowExecutionGraph} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'
import {isRecord} from '@spark-appworks/spark-utils'
import {validateWorkflowConditionFilter} from '../connector-condition'
import {validateWorkflowQueryInputChanges} from '../fields/query-inputs'
import {readWorkflowCopyTarget} from '../source/copy-target'
import {workflowMergeFormalInputs} from '../fields/merge-inputs'
function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`执行图字段不可读: ${field}`)
 return row[field]
}
function complete(view:DataView|undefined,workflowId:string):DataView{
 if(!view||view.destroyed||view.loadingError||view.requestState!==RequestState.Loaded||view.queryContext['workflowId']!==workflowId
  ||view.rows.length!==view.total||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('执行图尚未完整读取或仍有定义修改')
 return view
}
function formalSignature(view:DataView,nodeId?:string):string{
 const columns=view.queryConfig.fields??view.columns.map(column=>column.name)
 return JSON.stringify(view.rows.filter(row=>nodeId===undefined||view.getPkKey(row)===nodeId).map(row=>columns.map(field=>[field,read(view,row,field)])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))
}
function validWorkflowKey(value:unknown):boolean{return typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&Boolean(value.trim())}
/** 单节点实际输入须含所引用祖先行；整流在服务端产生中间输入，未提供时只核正式定义。 */
function checkActualWorkflowInput(input:unknown,expression:unknown,key=false):void{
 if(input===undefined||!isRecord(expression)||expression['Type']!=='GetInputParam')return
 const parts=typeof expression['ParamName']==='string'?expression['ParamName'].split('.'):[],ancestor=parts[0],field=parts[1]
 const rows=isRecord(input)&&ancestor?input[ancestor]:undefined
 if(parts.length!==2||!field||!Array.isArray(rows)||!rows.length||rows.some(row=>!isRecord(row)||!Object.hasOwn(row,field)||row[field]===undefined||key&&!validWorkflowKey(row[field])))throw Error('操作实际输入缺少祖先行、字段或有效主键输入')
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
 /** 本次显示的正式投影须仍与服务端一致；私有查询不替换页面结果或草稿。 */
 private async checkFormal(source:DataView,nodeId?:string):Promise<void>{
  const signature=(view:DataView)=>formalSignature(view,nodeId)
  const before=signature(source),context=JSON.stringify(source.queryContext),current=source.createQueryView(`executionFormal_${crypto.randomUUID().replaceAll('-','')}`)
  try{
   current.queryConfig={...current.queryConfig,allPages:true}
   if(nodeId!==undefined)current.filterExpression={logic:'and',filters:[{field:'workflow_id',operator:'eq',value:this.workflowId},{field:'rowid',operator:'eq',value:nodeId}]}
   await current.refresh();this.guard();complete(source,this.workflowId)
   if(current.loadingError||current.requestState!==RequestState.Loaded||current.rows.length!==current.total||JSON.stringify(source.queryContext)!==context||signature(source)!==before||signature(current)!==before)throw Error(`正式执行定义已变化，请刷新后重新测试: ${source.tableName}`)
  }finally{current.dataTable?.destroyView(current.viewId)}
 }
 /** 所有后续查询始终对照同一首轮合同；页面同步刷新不能重置本命令基线。 */
 private executionContract(){
  const contract=['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors'].map(name=>{const view=complete(this.ds.getView(name),this.workflowId);return{view,signature:formalSignature(view),context:JSON.stringify([view.queryContext,view.queryConfig,view.filterExpression])}})
  const check=()=>{for(const item of contract)if(formalSignature(complete(item.view,this.workflowId))!==item.signature||JSON.stringify([item.view.queryContext,item.view.queryConfig,item.view.filterExpression])!==item.context)throw Error(`正式执行定义已变化，请刷新后重新测试: ${item.view.tableName}`)}
  return {check,refresh:async()=>{check();for(const item of contract){await this.checkFormal(item.view);check()}}}
 }
 /** copy沿正式来源模型及目标表查询预检；不在浏览器复制行，不猜测字段转换或执行结果。 */
 private async validateCopyNode(nodeId:string,input?:unknown):Promise<void>{
  const contract=this.executionContract(),nodes=complete(this.ds.getView('Base_WorkflowNodeDefinition'),this.workflowId)
  const node=nodes.rows.find(row=>nodes.getPkKey(row)===nodeId)
  if(!node)throw Error('迁移节点不存在')
  const modelId=read(nodes,node,'node_config'),modelSource=this.ds.getView('Base_DataModel','modelCatalog'),fieldSource=this.ds.getView('Base_DataModel_Field','modelInputFields')
  if(typeof modelId!=='string'||!modelId||!modelSource||!fieldSource)throw Error('迁移来源模型或字段视图缺失')
  const owned:DataView[]=[],suffix=crypto.randomUUID().replaceAll('-','')
  const check=()=>{
   this.guard();contract.check()
   if(nodes.rows.find(row=>nodes.getPkKey(row)===nodeId)!==node||read(nodes,node,'node_type')!=='copy'||read(nodes,node,'node_config')!==modelId)throw Error('迁移执行目标已变化')
   for(const source of [modelSource,fieldSource])for(const view of source.dataTable?.viewList??[])
    if(view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('迁移来源定义仍有未处理修改')
  }
  try{
   check();await contract.refresh();check()
   const models=modelSource.createQueryView(`copyExecuteModels_${suffix}`),fields=fieldSource.createQueryView(`copyExecuteFields_${suffix}`);owned.push(models,fields)
   models.queryContext={dataSpaceId:this.workflowId,workflowId:this.workflowId,modelId}
   models.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:this.workflowId},{field:'rowid',operator:'eq',value:modelId}]}
   fields.queryContext={dataSpaceId:this.workflowId,workflowId:this.workflowId,modelIds:[modelId]}
   const results=await Promise.allSettled([models.refresh(),fields.refresh()]);check()
   for(const result of results)if(result.status==='rejected')throw result.reason
   complete(models,this.workflowId);complete(fields,this.workflowId)
   const model=models.rows[0]
   if(models.rows.length!==1||!model||models.getPkKey(model)!==modelId||read(models,model,'dataSetId')!==this.workflowId||read(models,model,'requestType')!=='copy')throw Error('迁移来源模型身份、归属或requestType不符')
   if(read(models,model,'Type')!=='数据库表')throw Error('当前迁移来源执行合同尚未核定')
   const dbid=read(models,model,'DbId'),tableName=read(models,model,'MetaName'),databaseName=read(models,model,'DbName')
   if(typeof dbid!=='string'||typeof tableName!=='string'||typeof databaseName!=='string')throw Error('迁移来源物理表身份缺失')
   const source=await LowcodeDataSpaceModelSourceReader.readTableTarget(this.ds,{dbid,name:tableName,databaseName},check)
   const actual=new Map(source.fields.map(field=>[field.Name,field])),ids=new Set<string>(),names=new Set<string>(),values:unknown[]=[]
   for(const row of fields.rows){
    const id=read(fields,row,'rowid'),kind=read(fields,row,'type'),name=read(fields,row,'Name'),fieldType=read(fields,row,'FieldType'),value=read(fields,row,'ValueFun')
    if(typeof id!=='string'||!id||ids.has(id)||fields.getPkKey(row)!==id||read(fields,row,'dataSetId')!==this.workflowId||read(fields,row,'dataModelId')!==modelId||!['dataModel','inputParams'].includes(String(kind)))throw Error('迁移来源字段身份或用途不符')
    if(typeof name!=='string'||!name.trim()||names.has(`${kind}:${name}`))throw Error('迁移来源字段名称缺失或重复')
    ids.add(id);names.add(`${kind}:${name}`)
    if(kind==='dataModel'&&fieldType!=='计算字段'&&actual.get(name)?.FieldType.toLowerCase()!==String(fieldType).toLowerCase())throw Error('迁移来源字段与正式物理表不符')
    if(value!==''&&value!==null&&value!==undefined)values.push(value)
   }
   const filter=read(models,model,'Filter')
   validateWorkflowQueryInputChanges({dataSet:this.ds,workflowId:this.workflowId,nodeId,input:{values,filter},projection:{fromModelId:modelId,modelId,models,fields}})
   for(const value of values)if(typeof value==='string')checkActualWorkflowInput(input,DataSpaceDesignApi.parseValueFunction(value))
   if(typeof filter==='string'){
    const parsed=DataViewFilterCodec.parseStored(filter)
    const visit=(tree:DataViewFilterTree):void=>{if('logic'in tree)tree.filters.forEach(visit);else checkActualWorkflowInput(input,tree.value)}
    if(parsed)visit(parsed.toJSON())
   }
   await readWorkflowCopyTarget(this.ds,read(nodes,node,'config'),check);check()
   await this.checkFormal(models);check();await this.checkFormal(fields);check();await contract.refresh();check()
  }finally{for(const view of owned)if(!this.ds.destroyed)view.dataTable?.destroyView(view.viewId)}
 }
 /** 显式执行前按需核对节点的正式操作定义。 */
 async validateNode(nodeId:string,input?:unknown):Promise<void>{
  this.guard()
  const nodes=complete(this.ds.getView('Base_WorkflowNodeDefinition'),this.workflowId),node=nodes.rows.find(row=>nodes.getPkKey(row)===nodeId)
  if(!node||read(nodes,node,'workflow_id')!==this.workflowId)throw Error('执行节点身份或归属不符')
  await this.checkFormal(nodes,nodeId)
  const operation=read(nodes,node,'node_type')
  if(operation==='merge'){
   if(workflowMergeFormalInputs({dataSet:this.ds,workflowId:this.workflowId,nodeId}).length===0)throw Error('合并输入尚未配置，不能执行未完成节点')
   return
  }
  if(operation==='query'&&String(read(nodes,node,'position_type'))==='1'){
   const source=read(nodes,node,'node_config')
   if(typeof source!=='string'||!source.trim())throw Error('查询来源模型尚未配置，不能执行未完成节点')
  }
  if(operation==='copy'){await this.validateCopyNode(nodeId,input);return}
  if(!['add','edit','delete'].includes(String(operation)))return
  const contract=this.executionContract(),checkInputContract=()=>contract.refresh()
  await checkInputContract()
  const modelId=read(nodes,node,'dataOperateModId')
  if(typeof modelId!=='string'||!modelId.trim())throw Error('操作目标模型缺失')
  const modelSource=this.ds.getView('Base_DataModel','modelCatalog'),fieldSource=this.ds.getView('Base_DataModel_Field','modelInputFields')
  if(!modelSource||!fieldSource)throw Error('操作执行缺少正式模型或字段视图')
  const owned:DataView[]=[]
  const check=()=>{
   this.guard()
   if(complete(nodes,this.workflowId).rows.find(row=>nodes.getPkKey(row)===nodeId)!==node
    ||read(nodes,node,'dataOperateModId')!==modelId||read(nodes,node,'node_type')!==operation)throw Error('操作执行目标已变化')
   for(const source of [modelSource,fieldSource])for(const view of source.dataTable?.viewList??[])
    if(view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('操作定义仍有未处理修改')
  }
  try{
   check()
   const suffix=crypto.randomUUID().replaceAll('-',''),models=modelSource.createQueryView(`operationExecuteModels_${suffix}`);owned.push(models)
   const fields=fieldSource.createQueryView(`operationExecuteFields_${suffix}`);owned.push(fields)
   models.queryContext={dataSpaceId:this.workflowId,workflowId:this.workflowId,modelId}
   models.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:this.workflowId},{field:'rowid',operator:'eq',value:modelId}]}
   fields.queryContext={dataSpaceId:this.workflowId,workflowId:this.workflowId,modelIds:[modelId]}
   const results=await Promise.allSettled([models.refresh(),fields.refresh()]);check()
   for(const result of results)if(result.status==='rejected')throw result.reason
   complete(models,this.workflowId);complete(fields,this.workflowId)
   const model=models.rows[0]
   if(models.rows.length!==1||!model||models.getPkKey(model)!==modelId||read(models,model,'dataSetId')!==this.workflowId)throw Error('操作目标模型身份或归属不符')
   if(read(models,model,'requestType')!==operation)throw Error('操作节点与模型requestType不符')
   if(read(models,model,'Type')!=='数据库表')throw Error('操作目标来源执行合同尚未核定')
   for(const key of ['DbName','MetaName'])if(typeof read(models,model,key)!=='string'||!String(read(models,model,key)).trim())throw Error(`操作目标缺少${key}`)
   const names=new Set<string>(),ids=new Set<string>(),values:unknown[]=[],mapped=new Map<string,unknown>()
   for(const row of fields.rows){
    const id=read(fields,row,'rowid'),name=read(fields,row,'Name'),value=read(fields,row,'ValueFun')
    if(typeof id!=='string'||!id||ids.has(id)||fields.getPkKey(row)!==id||read(fields,row,'dataSetId')!==this.workflowId||read(fields,row,'dataModelId')!==modelId||read(fields,row,'type')!=='inputParams')throw Error('操作输入字段身份或归属不符')
    if(typeof name!=='string'||!name.trim()||names.has(name.toLowerCase()))throw Error('操作输入字段名称缺失或重复')
    ids.add(id);names.add(name.toLowerCase())
    if(value!==''&&value!==null&&value!==undefined)values.push(value)
    mapped.set(name.toLowerCase(),value)
   }
   if(!values.length)throw Error('操作至少需要一个显式值函数')
   const filter=read(models,model,'Filter')
   if(filter!==null&&filter!==undefined&&typeof filter!=='string')throw Error('操作过滤条件必须是SPARK JSON文本')
   validateWorkflowQueryInputChanges({dataSet:this.ds,workflowId:this.workflowId,nodeId,input:{values,...operation==='add'?{}:{filter}},projection:{fromModelId:modelId,modelId,models,fields}})
   const dbid=read(models,model,'DbId')
   if(typeof dbid!=='string')throw Error('操作目标缺少数据库ID')
   const source=await LowcodeDataSpaceModelSourceReader.readTableTarget(this.ds,{dbid,name:String(read(models,model,'MetaName')),databaseName:String(read(models,model,'DbName'))},check)
   const sourceNames=source.fields.map(field=>field.Name.toLowerCase().replace(/^row_id$/u,'rowid'))
   if(new Set(sourceNames).size!==sourceNames.length)throw Error('操作来源存在服务字段别名歧义')
   const actual=new Map(source.fields.map(field=>[field.Name.toLowerCase(),field]))
   for(const row of fields.rows){const field=actual.get(String(read(fields,row,'Name')).toLowerCase());if(field?.FieldType.toLowerCase()!==String(read(fields,row,'FieldType')).toLowerCase())throw Error('操作输入字段与真实来源名称或类型不符')}
   const primary=DataSpaceDesignApi.resolveSourcePrimaryKey(source.fields.map(field=>({name:field.Name,primaryKey:field.IsPKey===1}))),keyValue=mapped.get(primary.toLowerCase())
   const checkInput=(expression:unknown,key=false):void=>checkActualWorkflowInput(input,expression,key)
   for(const [name,value] of mapped)if(typeof value==='string'&&value.trim())checkInput(DataSpaceDesignApi.parseValueFunction(value),name===primary.toLowerCase())
   const parsedFilter=DataViewFilterCodec.parseStored(filter)
   if(operation!=='add'){
    if(parsedFilter){
     const visit=(tree:DataViewFilterTree):void=>{if('logic'in tree){if(!tree.filters.length)throw Error('操作过滤条件不允许空条件组');tree.filters.forEach(visit)}else checkInput(tree.value)}
     visit(parsedFilter.toJSON())
     if(keyValue!==''&&keyValue!==null&&keyValue!==undefined)throw Error('过滤操作不允许输入值函数覆盖真实主键')
    }else{
     if(typeof keyValue!=='string'||!keyValue.trim())throw Error('无过滤条件的编辑或删除需要明确主键输入值函数')
     const expression=DataSpaceDesignApi.parseValueFunction(keyValue)
     if(expression?.Type==='GetConstValue'&&!validWorkflowKey(expression['Value']))throw Error('操作主键常量必须是非空标量')
    }
   }
   check();await checkInputContract();check()
  }finally{for(const view of owned)if(!this.ds.destroyed)view.dataTable?.destroyView(view.viewId)}
 }
 /** 只在显式整流测试前读取本图端点条件，不扩大普通保存的装载范围。 */
 async load(input?:unknown):Promise<void>{
  for(const name of ['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors'])await this.checkFormal(complete(this.ds.getView(name),this.workflowId))
  const graph=this.structure(),view=this.#conditions
  if(input!==undefined){
   if(!Array.isArray(input)||input.some(row=>!isRecord(row)))throw Error('整流启动参数须为完整业务行数组')
   if(input.length){
    const definition=complete(this.ds.getView('Base_WorkflowDefinition'),this.workflowId),root=definition.rows[0]
    if(!root)throw Error('执行图工作流身份不唯一')
    if(read(definition,root,'activeType')!=='time'&&read(definition,root,'tableOperate')!=='delete'){
     if(['dbName','tblName'].some(key=>typeof read(definition,root,key)!=='string'||!String(read(definition,root,key)).trim()))throw Error('启动数据回读缺少数据库或触发表，请先配置触发表或使用无启动行的测试输入')
    }
   }
  }
  const nodes=complete(this.ds.getView('Base_WorkflowNodeDefinition'),this.workflowId),original=[...nodes.rows]
  for(const id of graph.nodeIds)await this.validateNode(id)
  if(nodes.rows.length!==original.length||nodes.rows.some((row,index)=>row!==original[index]))throw Error('执行图节点在操作校验期间已变化')
  if(view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('执行条件查询仍有修改')
  view.queryContext={...view.queryContext,workflowId:this.workflowId}
  const pairs:DataViewFilterTree[]=graph.links.map(({source,target})=>({logic:'and',filters:[{field:'parentModId',operator:'eq',value:source},{field:'childModId',operator:'eq',value:target}]}))
  view.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:this.workflowId},{logic:'or',filters:pairs}]}
  await view.refresh()
  if(nodes.rows.length!==original.length||nodes.rows.some((row,index)=>row!==original[index]))throw Error('执行图节点在条件读取期间已变化')
  for(const name of ['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors'])await this.checkFormal(complete(this.ds.getView(name),this.workflowId))
  this.capture()
 }
 /** 图完整性与分支可证性分别表达；不在前端求值服务端条件。 */
 capture():WorkflowExecutionGraph{
  const graph=this.structure(),view=complete(this.#conditions,this.workflowId),conditions=new Map<string,boolean>(),ids=new Set<string>()
  for(const row of view.rows){
   const id=read(view,row,'rowid'),source=read(view,row,'parentModId'),target=read(view,row,'childModId'),pair=JSON.stringify([source,target])
   if(typeof id!=='string'||!id||ids.has(id)||view.getPkKey(row)!==id||read(view,row,'dataSetId')!==this.workflowId||!graph.pairs.has(pair))throw Error('执行条件身份或端点归属不符')
   if(conditions.has(pair))throw Error('同一连线端点存在多条条件')
   const raw=read(view,row,'filter');if(raw!==null&&raw!==undefined&&typeof raw!=='string')throw Error('执行条件格式无效')
   const parsed=DataViewFilterCodec.parseStored(raw);if(parsed)validateWorkflowConditionFilter(parsed)
   conditions.set(pair,typeof raw==='string'&&raw.trim()!=='');ids.add(id)
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
