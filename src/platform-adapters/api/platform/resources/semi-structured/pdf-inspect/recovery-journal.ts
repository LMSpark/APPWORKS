/**
 * @module @/platform-adapters/api:platform/resources/semi-structured/pdf-inspect/recovery-journal
 * 职责：在原核验命令存储适配内部保留最小请求恢复定位。
 * 边界：不存业务输入、文件路径或凭据，不派发/重放任务，不充当任务历史。
 */
import {isRecord} from '@spark-appworks/spark-utils'

/** 稳定拥有者分区，不得使用登录令牌代替任一身份。 */
export type PdfInspectionRecoveryOwner=Readonly<{enterpriseId:string;enterpriseShortName:string;actorId:string;applicationId:string;scenarioId:string}>
/** 只保存原请求和同站恢复链接；它不是任务接纳回执。 */
export type PdfInspectionRecoveryPointer=Readonly<{version:1;requestId:string;recoveryUrl:string}>
export type PdfInspectionRecoveryStorage=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>
function identity(value:string):void{if(typeof value!=='string'||!/^[-A-Za-z0-9_]{1,128}$/u.test(value))throw Error('PDF_RECOVERY_ID')}
function url(value:string,requestId:string):void{
 if(!value.startsWith('/')||value.startsWith('//')||value.length>4096)throw Error('PDF_RECOVERY_URL')
 const parsed=new URL(value,'https://pdf-recovery.invalid')
 if(parsed.origin!=='https://pdf-recovery.invalid'||parsed.searchParams.getAll('pdfInspectionRequestId').length!==1
  ||parsed.searchParams.get('pdfInspectionRequestId')!==requestId
  ||[...parsed.searchParams.keys()].some(key=>/token|password|passwd|secret|authorization|filePath|rule_config|^files$/iu.test(key)))throw Error('PDF_RECOVERY_URL')
}
/** 原命令拥有者调用；业务结果须先由原DataView证明，再结算定位。 */
export class PdfInspectionRecoveryJournal{
 private readonly prefix:string
 constructor(private readonly input:Readonly<{storage:PdfInspectionRecoveryStorage;owner:PdfInspectionRecoveryOwner;resolveUrl:(requestId:string)=>string}>){
  const {enterpriseId,enterpriseShortName,actorId,applicationId,scenarioId}=input.owner
  const owner=[enterpriseId,enterpriseShortName,actorId,applicationId,scenarioId]
  if(owner.some(value=>typeof value!=='string'||!value.trim()))throw Error('PDF_RECOVERY_OWNER')
  this.prefix=`${JSON.stringify(['spark:pdf-inspection-recovery:1',owner])}:`
 }
 private key(pointer:PdfInspectionRecoveryPointer):string{return this.prefix+pointer.requestId}
 private text(pointer:PdfInspectionRecoveryPointer):string{
  identity(pointer.requestId);url(pointer.recoveryUrl,pointer.requestId)
  return JSON.stringify({version:1,requestId:pointer.requestId,recoveryUrl:pointer.recoveryUrl})
 }
 /** 写后任何错误仍交还同一捕获；调用方必须接纳原pending行，派发前只读核验。 */
 begin(requestId:string):PdfInspectionRecoveryPointer{
  identity(requestId)
  const pointer=Object.freeze({version:1 as const,requestId,recoveryUrl:this.input.resolveUrl(requestId)}),text=this.text(pointer)
  if(this.input.storage.getItem(this.key(pointer))!==null)throw Error('PDF_RECOVERY_PENDING: 原请求已有恢复定位，禁止覆盖或新派发')
  try{this.input.storage.setItem(this.key(pointer),text);this.assertCurrent(pointer)}catch{/* 原指针可能已写入；不能丢原请求行或再写。 */}
  return pointer
 }
 /** 只读屏障；丢失、损坏或读失败均不允许首次派发，不自动重写。 */
 assertCurrent(pointer:PdfInspectionRecoveryPointer):void{
  if(this.input.storage.getItem(this.key(pointer))!==this.text(pointer))throw Error('PDF_RECOVERY_UNCONFIRMED: 原恢复定位尚未核定')
 }
 /** 仅返回该拥有者的待核定位，拒绝损坏记录，不把空结果解释为任务未执行。 */
 pending():readonly PdfInspectionRecoveryPointer[]{
  const keys=Array.from({length:this.input.storage.length},(_,index)=>this.input.storage.key(index)).filter((key):key is string=>key?.startsWith(this.prefix)===true)
  return keys.map(key=>{
   const raw=this.input.storage.getItem(key)
   if(raw===null)throw Error('PDF_RECOVERY_CHANGED')
   const value:unknown=JSON.parse(raw)
   if(!isRecord(value)||Object.keys(value).length!==3||value['version']!==1||typeof value['requestId']!=='string'||typeof value['recoveryUrl']!=='string')throw Error('PDF_RECOVERY_INVALID')
   const pointer=Object.freeze({version:1 as const,requestId:value['requestId'],recoveryUrl:value['recoveryUrl']})
   if(this.key(pointer)!==key||this.text(pointer)!==raw)throw Error('PDF_RECOVERY_INVALID')
   return pointer
  })
 }
 /** 调用者先核原DataSet接纳回执/Recover证明，或资源明确证明从未派发；清理失败不能重init。 */
 settle(pointer:PdfInspectionRecoveryPointer):void{
  const key=this.key(pointer),current=this.input.storage.getItem(key)
  if(current===null)return
  if(current!==this.text(pointer))throw Error('PDF_RECOVERY_CHANGED: 原定位已变化，禁止清理')
  this.input.storage.removeItem(key)
  if(this.input.storage.getItem(key)!==null)throw Error('PDF_RECOVERY_CLEANUP_UNCONFIRMED')
 }
}
