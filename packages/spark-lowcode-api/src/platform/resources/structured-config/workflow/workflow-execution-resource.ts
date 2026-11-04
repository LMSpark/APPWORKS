/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/workflow/workflow-execution-resource
 * 职责：数据工作流的单节点/整流测试作为真实服务命令接入原DataSet保存链。
 * 边界：执行可能产生业务副作用；不重试、不伪造幂等或核验协议，不把失败节点当成功。
 */
import {bindDataSetCommandSubmit,type DataSet,type DataRow,type DataView} from '@spark-appworks/spark-data'
import {isRecord,type HttpClientBase} from '@spark-appworks/spark-utils'
import {LowcodeClient} from '../../../../core/lowcode-client'
import {LowcodeApiError} from '../../../../core/lowcode-api-error'

/** 本次执行从正式定义捕获的可达节点与必经结果；条件分支未核定时不能宣称整流完整。 */
export type WorkflowExecutionGraph=Readonly<{workflowId:string;nodeIds:readonly string[];requiredNodeIds:readonly string[];conditional:boolean}>
type WorkflowExecutionResourceInput=Readonly<{
 dataSet:DataSet;http:HttpClientBase;workflowId:string
 graph?:()=>WorkflowExecutionGraph
 /** 解析后的本次命令在派发前核验正式定义；DataSet直接保存同样必须经过。 */
 prepare(input:Readonly<{mode:'node'|'workflow';nodeId:string;input:unknown}>):Promise<void>
 readScope:()=>Readonly<{token:string;headers:Readonly<Record<string,string>>}>
 /** 当前工作区身份和已保存定义前置核验；不在前端授予服务执行权限。 */
 guard():void
}>
class WorkflowExecutionUnknown extends Error{}
function rows(value:unknown):value is Array<Record<string,unknown>> {return Array.isArray(value)&&value.every(isRecord)}
/** 命令行ID只标识本次本地捕获，不作为后端幂等键或执行实例ID。 */
export class WorkflowExecutionResource{
 readonly requests:DataView
 readonly #scope:string
 readonly #client:LowcodeClient
 constructor(private readonly input:WorkflowExecutionResourceInput){
  this.#scope=input.readScope().token
  if(!input.workflowId.trim()||!this.#scope.trim())throw Error('工作流执行目标或scope缺失')
  if(typeof input.prepare!=='function')throw Error('工作流执行缺少正式定义校验')
  this.#client=new LowcodeClient(input.http)
  this.guard()
  const tableName='WorkflowExecution'
  if(input.dataSet.getTable(tableName))throw Error('工作流执行命令视图已存在')
  const table=input.dataSet.addTable(tableName,['commandId','mode','nodeId','input','outcome','completeness','result'].map(name=>({name,type:'string',isPrimaryKey:name==='commandId'})))
  table.resourceType='workflow-execution';table.resourceId=input.workflowId
  this.requests=table.getOrCreateView('default');this.requests.commitMode='staged'
  bindDataSetCommandSubmit(this.requests,{
   resource:{resourceType:'workflow-execution',resourceId:input.workflowId},guard:()=>this.guard(),
   inputFields:['mode','nodeId','input'],createKey:()=>crypto.randomUUID(),
   submit:row=>this.submit(row),
   verify:()=>Promise.reject(new WorkflowExecutionUnknown('服务未提供按本次请求查询执行结果的合同；结果仍未知，禁止重跑')),
   isUnconfirmed:error=>error instanceof WorkflowExecutionUnknown,
  })
 }
 private guard():void{
  if(this.input.dataSet.destroyed||this.input.readScope().token!==this.#scope)throw Error('工作流执行实例或scope已失效')
  this.input.guard()
 }
 private async submit(row:DataRow):Promise<DataRow>{
  this.guard()
  const mode=row['mode'],nodeId=row['nodeId'],text=row['input']
  if(mode!=='node'&&mode!=='workflow')throw Error('请选择单节点或完整工作流测试')
  if(typeof text!=='string')throw Error('执行输入必须为JSON文本')
  const parsed:unknown=JSON.parse(text),workflowId=this.input.workflowId
  if(mode==='node'){
   if(typeof nodeId!=='string'||!nodeId.trim()||!isRecord(parsed)||!Object.values(parsed).every(rows))throw Error('单节点输入须为节点ID到业务行数组的映射')
  }else if(!rows(parsed))throw Error('整流启动参数须为完整业务行数组，不能把各字段拆为单独行')
  await this.input.prepare({mode,nodeId:mode==='node'?String(nodeId):'',input:parsed});this.guard()
  const graph=mode==='workflow'&&this.input.graph?structuredClone(this.input.graph()):undefined
  if(graph&&(graph.workflowId!==workflowId||!graph.nodeIds.length||new Set(graph.nodeIds).size!==graph.nodeIds.length
   ||graph.nodeIds.some(id=>typeof id!=='string'||!id)||graph.requiredNodeIds.some(id=>!graph.nodeIds.includes(id))))throw Error('执行图捕获的目标或节点身份不符')
  if(graph&&mode==='node'&&!graph.nodeIds.includes(String(nodeId)))throw Error('测试节点不属于本次执行图')
  const data=mode==='node'?{workflowId,nodeId,inputParams:parsed}:{workflowId,startParams:parsed}
  try{
   const result=await this.#client.requestResult({path:mode==='node'?'/api/Workflow/runSingleNodeTest':'/api/Workflow/runWorkflowTest',
    method:'POST',data,headers:this.input.readScope().headers,retry:0,preserveHttpError:true})
   this.guard()
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
