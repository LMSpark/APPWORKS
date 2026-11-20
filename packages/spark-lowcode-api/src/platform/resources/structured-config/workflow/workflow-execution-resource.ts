/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/workflow/workflow-execution-resource
 * 职责：数据工作流的单节点/整流测试作为真实服务命令接入原DataSet保存链。
 * 边界：执行可能产生业务副作用；不重试、不伪造幂等或核验协议，不把失败节点当成功。
 */
import type {BindCommandSubmitOptions,DataRow,DataView} from '@spark-appworks/spark-data'
import {isRecord,type HttpClientBase} from '@spark-appworks/spark-utils'
import {LowcodeClient} from '../../../../core/lowcode-client'
import {LowcodeApiError} from '../../../../core/lowcode-api-error'

/** 本次执行从正式定义捕获的可达节点与必经结果；条件分支未核定时不能宣称整流完整。 */
export type WorkflowExecutionGraph=Readonly<{workflowId:string;nodeIds:readonly string[];requiredNodeIds:readonly string[];conditional:boolean}>
/** 原命令行的身份及解析后输入；执行目标由本次首轮合同返回。 */
type WorkflowExecutionCommandInput=Readonly<{commandId:string;mode:'node'|'workflow';nodeId:string;input:unknown}>
/** 异步准备后仍须在派发前及回执接纳前复核的原执行合同。 */
type PreparedWorkflowExecution=Readonly<{workflowId:string;graph?:WorkflowExecutionGraph;assertCurrent():void}>
type WorkflowExecutionResourceInput=Readonly<{
 http:HttpClientBase
 /** 同步固定已准备的首轮合同；不接收替代命令行。 */
 onPrepareInput:NonNullable<BindCommandSubmitOptions['onPrepareInput']>
 /** 校验原命令、目标及正式定义，返回本次捕获的目标与执行图。 */
 prepare(input:WorkflowExecutionCommandInput):Promise<PreparedWorkflowExecution>
 readScope:()=>Readonly<{token:string;headers:Readonly<Record<string,string>>}>
 /** 只核本次装配及请求scope；不要求装配时已注入工作流ID或读取定义。 */
 guard():void
}>
class WorkflowExecutionUnknown extends Error{}
function rows(value:unknown):value is Array<Record<string,unknown>> {return Array.isArray(value)&&value.every(isRecord)}
/** 命令行ID只标识本次本地捕获，不作为后端幂等键或执行实例ID。 */
export class WorkflowExecutionResource{
 static readonly resourceId='workflow:execution-test'
 readonly #scope:string
 readonly #client:LowcodeClient
 constructor(private readonly input:WorkflowExecutionResourceInput){
  this.#scope=input.readScope().token
  if(!this.#scope.trim())throw Error('工作流执行scope缺失')
  if(typeof input.prepare!=='function'||typeof input.onPrepareInput!=='function')throw Error('工作流执行缺少首轮合同捕获或正式定义校验')
  this.#client=new LowcodeClient(input.http)
  this.guard()
 }
 private guard():void{
  if(this.input.readScope().token!==this.#scope)throw Error('工作流执行实例或scope已失效')
  this.input.guard()
 }
 /** 为场景已装配的原命令视图提供绑定，不创建表或视图；未知执行不提供放弃后重发能力。 */
 binding(view:DataView):BindCommandSubmitOptions{
  const ds=view.dataSet
  const guard=()=>{
   this.guard()
   if(!ds||ds.destroyed||view.destroyed||ds.getView(view.tableName,view.viewId)!==view
    ||view.dataTable?.resourceType!=='command'||view.dataTable.resourceId!==WorkflowExecutionResource.resourceId
    ||view.primaryKey!=='commandId')throw Error('工作流执行命令资源身份不符或已失效')
  }
  guard()
  return{
   resource:{resourceType:'command',resourceId:WorkflowExecutionResource.resourceId},guard,
   inputFields:['mode','nodeId','input'],createKey:()=>crypto.randomUUID(),allowAbandonUnconfirmed:false,
   onPrepareInput:this.input.onPrepareInput,
   submit:row=>this.submit(row,guard),
   verify:()=>Promise.reject(new WorkflowExecutionUnknown('服务未提供按本次请求查询执行结果的合同；结果仍未知，禁止重跑')),
   isUnconfirmed:error=>error instanceof WorkflowExecutionUnknown,
  }
 }
 private async submit(row:DataRow,guard:()=>void):Promise<DataRow>{
  guard()
  const commandId=row['commandId']
  if(typeof commandId!=='string'||!commandId.trim())throw Error('工作流执行命令身份缺失')
  const mode=row['mode'],nodeId=row['nodeId'],text=row['input']
  if(mode!=='node'&&mode!=='workflow')throw Error('请选择单节点或完整工作流测试')
  if(mode==='workflow'&&nodeId!=='')throw Error('整流测试不能指定节点')
  if(typeof text!=='string')throw Error('执行输入必须为JSON文本')
  const parsed:unknown=JSON.parse(text)
  if(mode==='node'){
   if(typeof nodeId!=='string'||!nodeId.trim()||!isRecord(parsed)||!Object.values(parsed).every(rows))throw Error('单节点输入须为节点ID到业务行数组的映射')
  }else if(!rows(parsed))throw Error('整流启动参数须为完整业务行数组，不能把各字段拆为单独行')
  const prepared=await this.input.prepare({commandId,mode,nodeId:mode==='node'?String(nodeId):'',input:parsed})
  guard();prepared.assertCurrent()
  const workflowId=prepared.workflowId
  if(typeof workflowId!=='string'||!workflowId.trim())throw Error('工作流执行捕获目标缺失')
  const graph=prepared.graph===undefined?undefined:structuredClone(prepared.graph)
  if(graph&&(graph.workflowId!==workflowId||!graph.nodeIds.length||new Set(graph.nodeIds).size!==graph.nodeIds.length
   ||graph.nodeIds.some(id=>typeof id!=='string'||!id)||graph.requiredNodeIds.some(id=>!graph.nodeIds.includes(id))))throw Error('执行图捕获的目标或节点身份不符')
  if(graph&&mode==='node'&&!graph.nodeIds.includes(String(nodeId)))throw Error('测试节点不属于本次执行图')
  const data=mode==='node'?{workflowId,nodeId,inputParams:parsed}:{workflowId,startParams:parsed}
  try{
   const result=await this.#client.requestResult({path:mode==='node'?'/api/Workflow/runSingleNodeTest':'/api/Workflow/runWorkflowTest',
    method:'POST',data,headers:this.input.readScope().headers,retry:0,preserveHttpError:true})
   guard();prepared.assertCurrent()
   const items=mode==='node'?[result]:result
   if(!rows(items)||!items.length)throw Error('执行结果不是预期的节点结果')
   const ids=new Set<string>()
   for(const item of items){
    const id=item['nodeId'],status=item['status'],count=item['count'],output=item['output']
    if(item['workflowId']!==workflowId||typeof id!=='string'||!id||ids.has(id)||mode==='node'&&id!==nodeId||graph&&!graph.nodeIds.includes(id)
     ||!['SUCCESS','FAILED'].includes(String(status))||typeof count!=='number'||!Number.isFinite(count)||count<0
     ||output!==null&&!rows(output))throw Error('执行结果身份、状态或数据合同不符；请求结果不能确认')
    ids.add(id)
   }
   const completeness=mode==='node'?'complete':!graph?'unverified':graph.requiredNodeIds.some(id=>!ids.has(id))?'partial'
    :graph.conditional&&graph.nodeIds.some(id=>!ids.has(id))?'unverified':'complete'
   const outcome=items.some(item=>item['status']==='FAILED')?'failed':completeness==='complete'?'success':completeness
   const presented=JSON.stringify(result,(key,value:unknown)=>key==='lingma_sys_key'||key==='lingma_sys_params'?undefined:value)
   return {...row,outcome,completeness,result:presented}
  }catch(cause){
   if(cause instanceof LowcodeApiError){
    const message=cause.message.replace(/^\[\d+\]\s*/u,'')
    if([401,403,404].includes(cause.code)||mode==='node'&&[ `节点不存在：${String(nodeId)}`,`节点不存在:${String(nodeId)}`].includes(message)
      ||mode==='workflow'&&message==='流程定义不存在')throw cause
   }
   throw new WorkflowExecutionUnknown(`工作流执行结果未知，禁止重跑：${cause instanceof Error?cause.message:String(cause)}`,{cause})
  }
 }
}
