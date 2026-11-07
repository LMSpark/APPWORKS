/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/data-code/assignment-resource
 * 职责：将已保存业务行的一次正式领码接入声明命令DataView及DataSet保存链。
 * 边界：不创建表、不保存业务行、不查询或复位流水；GetCodeString不能用于核验，派发后无可信回执即保留未知。
 * AI用途：宿主凭本次新增已确认事实准备目标，绑定命令后由原生保存接纳只读code，再单独写回业务行。
 */
import type {BindCommandSubmitOptions,DataRow,DataSet,DataView} from '@spark-appworks/spark-data'
import {isRecord,type HttpClientBase} from '@spark-appworks/spark-utils'
import type {DataSpaceRequestScope} from '../../../data-space/runtime/data-space-runtime-contract.js'

/** 宿主捕获的原业务目标；须持本次正式新增已确认事实及当前写编码权限，不能由空coding推断尚未分配。 */
export type PreparedBusinessCodeAssignment=Readonly<{
 scenarioId:string
 rowId:string
 ruleId:string
 /** 核原新增事实、业务行身份、绑定及编码写权限；不得用新目标替换原捕获。 */
 assertCurrent():void
}>
export type BusinessCodeAssignmentResourceInput=Readonly<{
 http:HttpClientBase
 readScope:()=>DataSpaceRequestScope
 /** 同步核本次已保存的新行及固定规则；无本次新增凭据时拒绝，不把历史空编码当作可重领。 */
 prepare(view:DataView,row:Readonly<DataRow>):PreparedBusinessCodeAssignment
}>
type Intent={view:DataView;id:string;target:string;prepared:PreparedBusinessCodeAssignment;dispatched:boolean}
class CodeAssignmentUnconfirmed extends Error{}
const dataSetOwners=new WeakMap<DataSet,BusinessCodeAssignmentResource>()
function text(value:unknown,label:string):string{if(typeof value!=='string'||!value.trim()||value.trim()!==value)throw Error(`领码${label}无效`);return value}
function fingerprint(scope:DataSpaceRequestScope):string{return JSON.stringify([scope.token,Object.entries(scope.headers).sort(([a],[b])=>a.localeCompare(b))])}

/** 一个实例只绑定一个DataSet，同目标/规则仅保留一个活动意图；命令ID不是后端幂等键。 */
export class BusinessCodeAssignmentResource{
 static readonly resourceId='business-code:assignment'
 readonly #scope:string
 readonly #bound=new WeakSet<DataView>()
 readonly #intents=new Map<string,Intent>()
 readonly #targets=new Map<string,Intent>()
 #dataSet:DataSet|undefined
 constructor(private readonly input:BusinessCodeAssignmentResourceInput){const scope=input.readScope();if(!scope.token.trim()||!scope.headers['X-AppId']?.trim())throw Error('领码缺少执行身份');this.#scope=fingerprint(scope)}
 private guardScope():void{if(fingerprint(this.input.readScope())!==this.#scope)throw Error('领码执行域已变化')}
 /** 仅绑定首次装配声明的本地命令视图；确认回执跨refresh保留，未知不允许放弃或重领。 */
 binding(view:DataView):BindCommandSubmitOptions{
  const ds=view.dataSet
  if(!ds||this.#dataSet&&this.#dataSet!==ds||this.#bound.has(view)||dataSetOwners.has(ds)&&dataSetOwners.get(ds)!==this)throw Error('领码命令须首次绑定同一DataSet')
  this.#dataSet=ds
  const guard=()=>{this.guardScope();const table=view.dataTable;if(ds.destroyed||view.destroyed||ds.getView(view.tableName,view.viewId)!==view||view.primaryKey!=='commandId'||!table||table.modelBinding!==undefined||table.resourceType!=='command'||table.resourceId!==BusinessCodeAssignmentResource.resourceId||['commandId','rowId','ruleId','code'].some(name=>!view.columns.some(column=>column.name===name)))throw Error('领码命令声明或实例已失效')}
  guard();this.#bound.add(view);dataSetOwners.set(ds,this)
  const intentFor=(row:Readonly<DataRow>)=>{guard();const intent=this.#intents.get(text(row['commandId'],'命令ID'));if(intent?.view !== view||this.#targets.get(intent.target)!==intent||row['rowId']!==intent.prepared.rowId||row['ruleId']!==intent.prepared.ruleId)throw Error('领码参数与首轮捕获不符');intent.prepared.assertCurrent();return intent}
  return{resource:{resourceType:'command',resourceId:BusinessCodeAssignmentResource.resourceId},guard,inputFields:['rowId','ruleId'],createKey:()=>crypto.randomUUID(),allowAbandonUnconfirmed:false,retainConfirmedOnRefresh:true,
   onPrepareInput:row=>{
    guard();const prepared=this.input.prepare(view,row),id=text(row['commandId'],'命令ID'),rowId=text(prepared.rowId,'业务行ID'),ruleId=text(prepared.ruleId,'规则ID'),scenarioId=text(prepared.scenarioId,'场景ID')
    prepared.assertCurrent();guard()
    if(row['rowId']!==rowId||row['ruleId']!==ruleId||scenarioId!==ds.scenarioId||this.#intents.has(id))throw Error('领码输入与原业务目标不符')
    const target=JSON.stringify([scenarioId,rowId,ruleId]),previous=this.#targets.get(target)
    if(previous&&(previous.dispatched||!previous.view.destroyed&&(previous.view.dirtyTracking.isPendingCreate(previous.id)||previous.view.hasUnconfirmedSave)))throw Error('原目标已有领码意图，不能另建或重复分配')
    const assert=prepared.assertCurrent.bind(prepared),intent:Intent={view,id,target,prepared:Object.freeze({scenarioId,rowId,ruleId,assertCurrent:assert}),dispatched:false}
    this.#targets.set(target,intent);this.#intents.set(id,intent)
   },
   submit:async row=>{
    const intent=intentFor(row);if(intent.dispatched)throw new CodeAssignmentUnconfirmed('原领码已经派发，禁止重复分配')
    const scope=this.input.readScope(),headers={...scope.headers,'X-FormKey':intent.prepared.scenarioId};intent.dispatched=true
    try{
     const body=await this.input.http.get<unknown>(`/api/Codeing/GetCodeString/${encodeURIComponent(intent.prepared.rowId)}/${encodeURIComponent(intent.prepared.ruleId)}`,{}, {headers,retry:0,cache:false,meta:{rawEnvelope:true}})
     intentFor(row)
     if(!isRecord(body)||body['Code']!==200||typeof body['Result']!=='string'||!body['Result'].trim())throw Error(isRecord(body)&&typeof body['Message']==='string'?body['Message']:'领码回执不是成功信封中的非空编码')
     return{commandId:intent.id,rowId:intent.prepared.rowId,ruleId:intent.prepared.ruleId,code:body['Result'].trim()}
    }catch(error){throw new CodeAssignmentUnconfirmed(`领码结果未确认，不能重复分配：${error instanceof Error?error.message:String(error)}`)}
   },
   verify:row=>{intentFor(row);return Promise.reject(new CodeAssignmentUnconfirmed('服务尚无已确认的原领码查询合同，保留原意图，禁止以再次领码核验'))},
   isUnconfirmed:error=>error instanceof CodeAssignmentUnconfirmed,
  }
 }
}
