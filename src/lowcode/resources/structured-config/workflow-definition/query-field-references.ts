/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-field-references
 * 职责：显式字段结构命令按当前工作流读取正式依赖，拒绝尚有引用的变更。
 * 边界：不改写引用、不执行表达式，不为普通保存加载全空间；常量内部不是引用。
 * AI用途：源字段结构变化时复用正式依赖查询与首轮守卫，核对合并字段及连接引用。
 */
import {DataViewFilterCodec,RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {workflowQueryFieldScope,workflowQueryDraftSignature,readWorkflowFieldValue as read} from './query-field-context'
import {workflowMergeFormalInputs} from './merge-inputs'
type Change=Readonly<{before:DataRow;after?:DataRow}>
function output(row:DataRow):string{const alias=row['AsName'];return typeof alias==='string'&&alias.length>0?alias:String(row['Name'])}
function document(value:unknown):unknown{return value===null||value===undefined||value===''?null:typeof value==='string'?parseJsonDocument(value):value}
function filter(value:unknown){
 if(value!==null&&value!==undefined&&typeof value!=='string')throw Error('正式过滤定义格式无法核定')
 return DataViewFilterCodec.parseStored(value)
}
/** 只在删除、改名或撤销已有输出时调用；每次重新读取正式依赖，不保存权限或引用快照。 */
export async function assertWorkflowFieldStructureChanges(dataSet:DataSet,workflowId:string,nodeId:string,changes:readonly Change[],options:Readonly<{scope?:'model'|'node-output'}>={}):Promise<void>{
 if(!changes.length)return
 const initial=workflowQueryFieldScope(dataSet,workflowId,nodeId),{nodes,fields,models,edges,modelId}=initial
 const contexts=JSON.stringify([nodes.queryContext,fields.queryContext,models.queryContext,edges.queryContext])
 const draft=workflowQueryDraftSignature([nodes,fields,models,edges])
 const nodeOutputOnly=options.scope==='node-output'
 const consumers=nodeOutputOnly?[nodeId]:nodes.rows.filter(row=>read(nodes,row,'node_config')===modelId&&['query','copy'].includes(String(read(nodes,row,'node_type')))).map(row=>String(nodes.getPkKey(row)))
 const references=new Set<string>(),removedIds=new Set(changes.filter(change=>!change.after).map(change=>String(change.before['rowid'])))
 const affected=changes.map(change=>({id:String(change.before['rowid']),name:String(change.before['Name']),
  checkName:!nodeOutputOnly&&(!change.after||change.before['Name']!==change.after['Name']),
  outputName:output(change.before),checkOutput:!change.after||output(change.before)!==output(change.after)||Number(change.before['IsOutput'])===1&&Number(change.after['IsOutput'])!==1||nodeOutputOnly&&change.before['FieldType']!==change.after['FieldType'],
  params:new Set(!change.after||output(change.before)!==output(change.after)||Number(change.before['IsOutput'])===1&&Number(change.after['IsOutput'])!==1||nodeOutputOnly&&change.before['FieldType']!==change.after['FieldType']
   ?consumers.map(id=>`${id}.${output(change.before)}`):[])}))
 const views:DataView[]=[]
 function guard():void{
  const current=workflowQueryFieldScope(dataSet,workflowId,nodeId)
  if(current.modelId!==modelId||[nodes,fields,models,edges].some(view=>view.hasUnconfirmedSave)
   ||JSON.stringify([nodes.queryContext,fields.queryContext,models.queryContext,edges.queryContext])!==contexts
   ||workflowQueryDraftSignature([nodes,fields,models,edges])!==draft)throw Error('字段引用检查目标、草稿或原提交状态已变化；保留当前修改')
 }
 function visit(value:unknown,location:string,fieldNames:ReadonlySet<string>=new Set()):void{
  if(Array.isArray(value)){value.forEach((child,index)=>visit(child,`${location}[${index}]`,fieldNames));return}
  if(!isRecord(value))return
  if(value['Type']==='GetConstValue')return
  if(value['Type']==='GetTableField'&&!nodeOutputOnly)throw Error(`GetTableField关联字段引用合同尚未核定: ${location}`)
  if(value['Type']==='GetInputParam'){
   if(affected.some(change=>change.params.has(String(value['ParamName']))))references.add(location)
   return
  }
  if(value['Type']==='GetExpData')throw Error(`字段引用尚不能从不透明表达式核定: ${location}`)
  if(typeof value['field']==='string'&&fieldNames.has(value['field']))references.add(`${location}.field`)
  for(const [key,child] of Object.entries(value))visit(child,`${location}.${key}`,fieldNames)
 }
 function mergeReferences(mergeNodeId:string,location:string):void{
  const bindings=workflowMergeFormalInputs({dataSet,workflowId,nodeId:mergeNodeId}),params=new Set(affected.flatMap(change=>[...change.params]))
  const sourceIds=new Set(bindings.map(binding=>String(binding['rowid'])))
  const reference=(path:string):void=>{references.add(`合并输入仍被引用：${path}`)}
  for(const binding of bindings){
   const sourceId=String(binding['rowid']),declared:unknown[]=Array.isArray(binding['Fields'])?binding['Fields']:[]
   if(consumers.includes(sourceId))for(const field of declared)if(isRecord(field)&&affected.some(change=>change.checkOutput&&(field['rowid']===change.id||field['Name']===change.outputName)))reference(`${location}[${sourceId}].Fields`)
   if(binding['pid']===null||binding['pid']===undefined||binding['pid']==='')continue
   const join=document(binding['JoinFilter']);if(join===null)continue
   DataViewFilterCodec.decode(join)
   function condition(value:unknown,path:string):void{
    if(!isRecord(value))throw Error(`合并连接协议无法核定：${path}`)
    const type=value['Type']
    if(type==='and'||type==='or'){
     if(!Array.isArray(value['Filters']))throw Error(`合并连接组损坏：${path}`)
     value['Filters'].forEach((child:unknown,index:number)=>condition(child,`${path}.Filters[${index}]`));return
    }
    if(type!=='cond'||typeof value['Field']!=='string')throw Error(`合并连接条件损坏：${path}`)
    const field=value['Field'].includes('.')?value['Field']:`${sourceId}.${value['Field']}`
    if(params.has(field))reference(`${path}.Field`)
    const fun=value['ValueFun'];if(!isRecord(fun))throw Error(`合并连接值函数损坏：${path}`)
    if(fun['Type']==='GetConstValue'||fun['Type']==='SystemData')return
    if(fun['Type']==='GetInputParam'){
     const name=fun['ParamName'];if(typeof name!=='string'||!name.trim()||name!==name.trim())throw Error(`合并输入参数身份无法核定：${path}`)
     if(params.has(name))reference(`${path}.ValueFun`);return
    }
    if(fun['Type']==='GetTableField'){
     const key=fun['Field'],parts=typeof key==='string'?key.split('.'):[]
     if(typeof key!=='string'||parts.length!==2||!sourceIds.has(parts[0]??'')||!parts[1]?.trim()||parts[1]!==parts[1].trim())throw Error(`合并连接字段身份无法核定：${path}`)
     if(params.has(key))reference(`${path}.ValueFun`);return
    }
    throw Error(`合并连接值函数协议尚未核定：${path}`)
   }
   condition(join,`${location}[${sourceId}].JoinFilter`)
  }
 }
 async function query(name:string,columns:string[]):Promise<DataView>{
  const source=dataSet.getView(name,name==='Base_DataModel_Relation'?'asParent':'default')
  if(!source)throw Error(`字段引用缺少正式视图: ${name}`)
  const view=source.createQueryView(`workflowFieldReferences_${crypto.randomUUID().replaceAll('-','')}`);views.push(view)
  const owner=name==='Base_DataSet'?'rowid':'dataSetId'
  view.filterExpression={field:owner,operator:'eq',value:workflowId};view.queryConfig={...view.queryConfig,fields:columns,allPages:true}
  await view.refresh();guard()
  if(view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total)throw Error(`字段依赖未完整读取: ${name}`)
  const ids=new Set<string>()
  for(const row of view.rows){
   const id=read(view,row,'rowid')
   if(read(view,row,owner)!==workflowId||typeof id!=='string'||ids.has(id)||view.getPkKey(row)!==id)throw Error('字段依赖身份或归属不符')
   ids.add(id)
  }
  const first=view.rows[0]
  if(name==='Base_DataSet'&&(view.rows.length!==1||!first||read(view,first,'Type')!=='workflow'))throw Error('字段依赖缺少唯一工作流参数定义')
  return view
 }
 try{
  guard()
  const results=await Promise.allSettled([
   query('Base_DataModel',['rowid','dataSetId','Filter','JoinFilter']),
   query('Base_DataModel_Field',['rowid','dataSetId','dataModelId','Name','AsName','FieldType','IsPKey','IsOutput','ValueFun']),
   query('Base_DataModel_Relation',['rowid','dataSetId','parentModId','childModId','filter']),
   query('Base_DataSet',['rowid','Type','inputParams']),
  ])
  for(const result of results)if(result.status==='rejected')throw result.reason
  const fieldView=views.find(view=>view.tableName==='Base_DataModel_Field')
  for(const change of changes){
   const matches=fieldView?.rows.filter(row=>row['rowid']===change.before['rowid'])??[],row=matches[0]
   if(!fieldView||matches.length!==1||!row||['dataSetId','dataModelId','Name','AsName','FieldType','IsPKey','IsOutput'].some(key=>read(fieldView,row,key)!==change.before[key]))throw Error('正式字段已变化，请重新读取后处理结构修改')
   if(!nodeOutputOnly&&(!change.after?fieldView.deleteActionState(row)!=='enabled':['Name','AsName','IsOutput'].some(key=>change.before[key]!==change.after?.[key]&&fieldView.fieldAccess(row,key).write!=='allowed')))throw Error('当前正式查询不再允许该字段结构操作：权限已变化')
  }
  for(const view of views)for(const row of view.rows){
   const id=String(view.getPkKey(row)),location=`${view.tableName}[${id}]`
   if(view.tableName==='Base_DataModel'){
    for(const key of ['Filter','JoinFilter']){const parsed=filter(read(view,row,key));if(parsed)visit(parsed.toJSON(),`${location}.${key}`,new Set(id===modelId?affected.filter(change=>change.checkName).map(change=>change.name):[]))}
   }else if(view.tableName==='Base_DataModel_Field'){
    if(nodeOutputOnly||!removedIds.has(id))visit(document(read(view,row,'ValueFun')),`${location}.ValueFun`)
   }else if(view.tableName==='Base_DataSet')visit(document(read(view,row,'inputParams')),`${location}.inputParams`)
   else{
    const source=read(view,row,'parentModId'),parsed=filter(read(view,row,'filter'))
    if(parsed)visit(parsed.toJSON(),`${location}.filter`,new Set(consumers.includes(String(source))?affected.filter(change=>change.checkOutput).map(change=>change.outputName):source===modelId?affected.filter(change=>change.checkName).map(change=>change.name):[]))
   }
  }
  for(const row of edges.rows)visit(document(read(edges,row,'params')),`连线[${String(edges.getPkKey(row))}].params`)
  const descendants=new Set(consumers)
  let changed=true
  while(changed){changed=false;for(const edge of edges.rows){const source=String(read(edges,edge,'sourceID')),target=String(read(edges,edge,'targetID'));if(descendants.has(source)&&!descendants.has(target)){descendants.add(target);changed=true}}}
  for(const row of nodes.rows){
   const id=String(nodes.getPkKey(row)),type=read(nodes,row,'node_type'),position=String(read(nodes,row,'position_type'))
   for(const key of ['input_mapping','config']){
    const value=document(read(nodes,row,key)),knownMerge=descendants.has(id)&&type==='merge'&&key==='input_mapping'
    if(knownMerge)mergeReferences(id,`节点[${id}].${key}`);else visit(value,`节点[${id}].${key}`)
    const staticCopyTarget=descendants.has(id)&&type==='copy'&&key==='config'&&isRecord(value)&&Object.entries(value).every(([name,item])=>
     ['targetDbName','targetTableName','size','text'].includes(name)&&(item===null||['string','number','boolean'].includes(typeof item)))
    if(descendants.has(id)&&!['0','2'].includes(position)&&type!=='query'&&!staticCopyTarget&&!knownMerge&&value!==null&&JSON.stringify(value)!=='[]'&&JSON.stringify(value)!=='{}')throw Error(`下游节点输入协议尚未核定: ${id}.${key}`)
   }
  }
  guard()
  if(references.size)throw Error(`字段仍被引用，请先明确清除并保存引用：${[...references].join('；')}`)
 }finally{for(const view of views)if(!view.destroyed)view.dataTable?.destroyView(view.viewId)}
}
