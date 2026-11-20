/**
 * @module app:lowcode/resources/structured-config/workflow-definition/execution/execution-contract
 * 职责：保持一次工作流命令打开时的正式定义与执行来源合同。
 * 边界：只保留不可编辑的校验签名，所有正式读取仍由原DataView完成；不执行命令或重建输入。
 */
import {RequestState,type DataSet,type DataView} from '@spark-appworks/spark-data'

type Input=Readonly<{dataSet:DataSet;workflowId:string;guard:()=>void;views?:readonly DataView[];nodeId?:string}>
type Snapshot=Readonly<{view:DataView;fields:readonly string[];signature:string;scope:string}>
/** 一次打开或提交准备的读取核对；失败的pass不封存、替换或扩大首轮来源。 */
export type WorkflowExecutionPass=Readonly<{assertCurrent():void;acceptSource(key:string,signature:string):void;finish():void}>

function signature(view:DataView,fields:readonly string[],nodeId?:string):string{
  const ids=new Set<string|number>()
  const rows=view.rows.filter(row=>nodeId===undefined||view.getPkKey(row)===nodeId).map(row=>{
   const id=view.getPkKey(row)
   if(id===undefined||ids.has(id))throw Error('执行图记录缺少唯一正式身份')
   ids.add(id)
   const values=fields.map(field=>{
    if(view.fieldAccess(row,field).read!=='visible')throw Error(`执行图字段不可读: ${field}`)
    return[field,Object.hasOwn(row,field),row[field]===undefined?{undefined:true}:{value:row[field]}]
   })
   return{id,values}
  }).sort((a,b)=>String(a.id).localeCompare(String(b.id)))
  return JSON.stringify({fields,rows})
}

/** 一次原命令的定义与来源证据，生命周期由命令绑定持有，独立于面板挂载。 */
export class WorkflowExecutionContract{
 readonly #snapshots:readonly Snapshot[]
 #sources:ReadonlyMap<string,string>|undefined
 constructor(private readonly input:Input){
  input.guard()
  const views=input.views??['Base_WorkflowDefinition','Base_WorkflowNodeDefinition','Base_WorkflowConnectors'].map(name=>{
   const view=input.dataSet.getView(name);if(!view)throw Error(`执行图缺少正式视图: ${name}`);return view
  })
  this.#snapshots=views.map(view=>{
   this.complete(view)
   const fields=[...(view.queryConfig.fields??view.columns.filter(column=>!column.isComputed&&!column.computeExpression).map(column=>column.name))]
   return{view,fields,scope:this.scope(view),signature:this.signature(view,fields)}
  })
 }
 private complete(view:DataView):void{
  const {dataSet,workflowId}=this.input
  if(dataSet.destroyed||view.destroyed||view.dataSet!==dataSet||dataSet.getView(view.tableName,view.viewId)!==view
   ||view.requestState!==RequestState.Loaded||view.loadingError||view.queryContext['workflowId']!==workflowId
   ||view.rows.length!==view.total||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('执行图尚未完整读取或仍有定义修改')
 }
 private scope(view:DataView):string{return JSON.stringify([view.queryContext,view.queryConfig,view.filterExpression])}
 private signature(view:DataView,fields:readonly string[]):string{return signature(view,fields,this.input.nodeId)}
 /** 对本次正式来源结果按身份与声明字段生成不可编辑的比较证据。 */
 static sourceSignature(view:DataView):string{
  return signature(view,view.queryConfig.fields??view.columns.filter(column=>!column.isComputed&&!column.computeExpression).map(column=>column.name))
 }

 /** 同值刷新可继续；原视图、范围、可读性、投影及正式值变化均拒绝。 */
 assertCurrent():void{
  this.input.guard()
  for(const snapshot of this.#snapshots){
   this.complete(snapshot.view)
   if(this.scope(snapshot.view)!==snapshot.scope)throw Error(`测试参数查询上下文已变化，请取消本次输入并重新打开: ${snapshot.view.tableName}`)
   if(this.signature(snapshot.view,snapshot.fields)!==snapshot.signature)throw Error(`正式执行定义已变化，请取消本次输入并重新打开: ${snapshot.view.tableName}`)
  }
 }
 /** 独立正式回读与打开时基线比较，不接纳为新基线，不替换宿主结果。 */
 async refresh():Promise<void>{
  this.assertCurrent()
  for(const snapshot of this.#snapshots){
   const current=snapshot.view.createQueryView(`executionContract_${crypto.randomUUID().replaceAll('-','')}`)
   try{
    current.queryConfig={...current.queryConfig,fields:[...snapshot.fields],allPages:true}
    if(this.input.nodeId!==undefined)current.filterExpression={logic:'and',filters:[{field:'workflow_id',operator:'eq',value:this.input.workflowId},{field:'rowid',operator:'eq',value:this.input.nodeId}]}
    await current.refresh();this.assertCurrent();this.complete(current)
    if(this.signature(current,snapshot.fields)!==snapshot.signature)throw Error(`正式执行定义已变化，请取消本次输入并重新打开: ${snapshot.view.tableName}`)
   }finally{if(!this.input.dataSet.destroyed)current.dataTable?.destroyView(current.viewId)}
  }
 }
 /** 打开阶段仅成功完成后封存；提交阶段只能完整比较原来源键和值。 */
 begin(mode:'capture'|'verify'):WorkflowExecutionPass{
  this.assertCurrent()
  if(mode==='capture'&&this.#sources!==undefined||mode==='verify'&&this.#sources===undefined)throw Error('执行来源缺少可用首轮合同或已经封存')
  const seen=new Map<string,string>(),original=this.#sources
  let closed=false,failed=false
  const check=()=>{this.assertCurrent();if(closed||failed)throw Error('执行来源核对轮次已结束或失败')}
  return{
   assertCurrent:()=>this.assertCurrent(),
   acceptSource:(key,sourceSignature)=>{
    check()
    if(!key||seen.has(key)&&seen.get(key)!==sourceSignature||mode==='verify'&&(!original?.has(key)||original.get(key)!==sourceSignature)){failed=true;throw Error(`执行来源与首轮合同不符: ${key}`)}
    seen.set(key,sourceSignature)
   },
   finish:()=>{
    check();closed=true
    if(mode==='capture'){
     if(this.#sources!==undefined)throw Error('执行来源首轮合同已经封存')
     this.#sources=new Map(seen)
    }else if(original?.size!==seen.size||[...original.keys()].some(key=>!seen.has(key)))throw Error('执行来源核对不完整，不能执行')
   },
  }
 }
}
