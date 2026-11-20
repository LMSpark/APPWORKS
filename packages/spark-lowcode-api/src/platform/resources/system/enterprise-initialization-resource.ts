/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/system/enterprise-initialization-resource
 * 职责：入驻审核通过作为原命令DataView的单次服务命令，适配企业初始化提交并经同DataSet回读视图确认结果。
 * 边界：服务只受理异步初始化任务，受理不等于完成；回读CheckState=1前保持未知，不重发、不放弃后重提、不直接写企业行。
 */
import type {BindCommandSubmitOptions,DataRow,DataView} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {LowcodeClient} from '../../../core/lowcode-client'
import {LowcodeApiError} from '../../../core/lowcode-api-error'

/** list为审核列表视图，readback为按enterpriseId输入参数过滤的同模型回读视图，二者与命令视图须属同一DataSet。 */
type EnterpriseInitializationOptions=Readonly<{
 list:DataView
 readback:DataView
 http:HttpClientBase
 readScope:()=>Readonly<{token:string;headers:Readonly<Record<string,string>>}>
 assertCurrent:()=>void
}>
type Intent={enterpriseId:string;shortName:string;assertRead:()=>void;phase:'prepared'|'dispatched'|'accepted'|'confirmed'}
class EnterpriseInitializationUnknown extends Error{}
const unresolved=(intent:Intent)=>intent.phase==='dispatched'||intent.phase==='accepted'

/** 命令行ID只标识本次本地捕获，不作为后端幂等键或初始化任务ID。 */
export class EnterpriseInitializationResource{
 static readonly resourceId='enterprise:initialization'
 readonly #client:LowcodeClient
 readonly #scope:string
 constructor(private readonly input:EnterpriseInitializationOptions){
  this.#scope=input.readScope().token
  if(!this.#scope.trim())throw Error('企业初始化scope缺失')
  this.#client=new LowcodeClient(input.http)
 }
 /** 绑定pagedata已装配的命令视图；未知结果不提供放弃能力，避免二次初始化。 */
 binding(command:DataView):BindCommandSubmitOptions{
  const {list,readback,readScope,assertCurrent}=this.input,intents=new Map<string,Intent>()
  const guard=()=>{
   assertCurrent()
   const ds=command.dataSet
   if(readScope().token!==this.#scope||command.destroyed||list.destroyed||readback.destroyed||!ds||ds.destroyed
    ||list.dataSet!==ds||readback.dataSet!==ds||command.dataTable?.resourceType!=='command'
    ||command.dataTable.resourceId!==EnterpriseInitializationResource.resourceId||command.primaryKey!=='commandId'
    ||list.tableName!=='Base_Enterprise_Info'||readback.tableName!=='Base_Enterprise_Info'||list===readback
    ||list.primaryKey!=='rowid'||readback.primaryKey!=='rowid')throw Error('ENTERPRISE_INIT_SCOPE: 企业初始化命令资源已失效')
  }
  const source=(enterpriseId:string)=>{
   const row=list.rows.find(candidate=>list.getPkKey(candidate)===enterpriseId)
   if(!row||list.hasEditingChanges()||list.dirtyTracking.hasPendingChanges()||list.hasUnconfirmedSave)throw Error('ENTERPRISE_INIT_SOURCE: 企业不在当前列表或列表有待提交修改')
   const state=list.fieldAccess(row,'CheckState')
   if(state.read!=='visible'||state.write!=='allowed'||list.fieldAccess(row,'ShortName').read!=='visible')throw Error('ENTERPRISE_INIT_PERMISSION: 当前企业审核状态不可写或英文简称不可读')
   if(String(row['CheckState'])!=='0')throw Error('ENTERPRISE_INIT_STATE: 仅待审核企业可以审核通过')
   const shortName=row['ShortName']
   if(typeof shortName!=='string'||!shortName.trim())throw Error('ENTERPRISE_INIT_SOURCE: 企业英文简称为空')
   return {row,shortName:shortName.trim()}
  }
  const capture=(row:Readonly<DataRow>):Intent=>{
   const id=row['commandId'],intent=typeof id==='string'?intents.get(id):undefined
   if(!intent||row['enterpriseId']!==intent.enterpriseId)throw Error('ENTERPRISE_INIT_CAPTURE: 命令与原审核意图不符')
   return intent
  }
  const receipt=(row:Readonly<DataRow>)=>({commandId:row['commandId'],enterpriseId:row['enterpriseId'],outcome:'confirmed'})
  const confirm=async(intent:Intent)=>{
   readback.queryContext={...readback.queryContext,enterpriseId:intent.enterpriseId}
   await readback.refresh();guard()
   if(readback.loadingError)throw new EnterpriseInitializationUnknown('企业初始化回读失败，结果仍未知；不重新发送',{cause:readback.loadingError})
   const row=readback.rows.length===1?readback.rows[0]:undefined
   if(!row||readback.getPkKey(row)!==intent.enterpriseId||readback.fieldAccess(row,'CheckState').read!=='visible')throw new EnterpriseInitializationUnknown('企业初始化回读未得到唯一可读企业行，结果仍未知')
   if(String(row['CheckState'])!=='1')throw new EnterpriseInitializationUnknown('企业初始化中或后台失败，审核状态尚未变为已入驻；结果未知，不重新发送')
   intent.phase='confirmed'
  }
  guard()
  return{resource:{resourceType:'command',resourceId:EnterpriseInitializationResource.resourceId},inputFields:['enterpriseId'],guard,
   createKey:()=>crypto.randomUUID(),allowAbandonUnconfirmed:false,
   onPrepareInput:row=>{
    guard()
    for(const [id,intent]of intents)if((intent.phase==='prepared'||intent.phase==='confirmed')&&!command.rows.some(candidate=>command.getPkKey(candidate)===id))intents.delete(id)
    const id=row['commandId'],enterpriseId=row['enterpriseId']
    if(typeof id!=='string'||!id||intents.has(id)||command.hasUnconfirmedSave||[...intents.values()].some(unresolved))throw Error('ENTERPRISE_INIT_CAPTURE: 原初始化命令未处理或命令身份重复')
    if(typeof enterpriseId!=='string'||!enterpriseId)throw Error('ENTERPRISE_INIT_CAPTURE: 缺少企业身份')
    const {row:sourceRow,shortName}=source(enterpriseId)
    intents.set(id,{enterpriseId,shortName,assertRead:list.captureReadRow(sourceRow,['CheckState','ShortName']),phase:'prepared'})
   },
   submit:async row=>{
    guard();const intent=capture(row)
    if(intent.phase==='confirmed')return receipt(row)
    if(intent.phase!=='prepared')throw new EnterpriseInitializationUnknown('企业初始化结果未知；保留原命令，不重新发送')
    if([...intents.values()].some(other=>other!==intent&&unresolved(other)))throw Error('其它企业初始化仍未确认；本命令未发送，可取消此待处理输入')
    intent.assertRead()
    if(source(intent.enterpriseId).shortName!==intent.shortName)throw Error('ENTERPRISE_INIT_SOURCE: 企业英文简称已变化')
    intent.phase='dispatched'
    try{
     await this.#client.requestResult({path:'/api/Enterprise/initEnt',method:'POST',params:{entShortName:intent.shortName},
      headers:readScope().headers,retry:0,preserveHttpError:true})
    }catch(cause){
     if(cause instanceof LowcodeApiError&&[401,403,404].includes(cause.code)){intent.phase='prepared';throw cause}
     intent.phase='accepted'
     throw new EnterpriseInitializationUnknown(`企业初始化提交结果未知，禁止重发：${cause instanceof Error?cause.message:String(cause)}`,{cause})
    }
    intent.phase='accepted';guard()
    await confirm(intent)
    return receipt(row)
   },
   verify:async row=>{
    guard();const intent=capture(row)
    if(intent.phase==='confirmed')return receipt(row)
    if(intent.phase!=='accepted')throw new EnterpriseInitializationUnknown('企业初始化命令仍在发送，结果未知')
    await confirm(intent)
    return receipt(row)
   },
   isUnconfirmed:failure=>failure instanceof EnterpriseInitializationUnknown,
  }
 }
}
