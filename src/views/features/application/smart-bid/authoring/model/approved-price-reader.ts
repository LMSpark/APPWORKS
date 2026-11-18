/**
 * @module app:views/features/application/smart-bid/authoring/model/approved-price-reader
 * 职责：从命名视图读取原批准版，并将同次读取证明交动作29。
 */
import {reviewApprovedPrice} from '@/services/smart-bid/content/references/approved-price-review'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'
import {readRegisteredApprovedPriceDetail} from './price-sheet-reader'

const model='ApprovedPrice',viewName='selectedApprovedPrice'
const keys=['scopeRef','approvalRef','version'] as const
const fields=['approverRef','value','unit','detailRef','pricingVersion','rateOnly'] as const
type ReviewInput=Parameters<typeof reviewApprovedPrice>[0]
type ReviewSource=Parameters<typeof reviewApprovedPrice>[1]
type ReviewEvidence=Omit<ReviewSource,'approval'|'detail'>

/** 查询指定业务范围及批准版，禁止默认使用最新批准。 */
export function approvedPriceReadView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

/** scopeRef 由已核编制范围提供；用途和复算从各自责任域读取。 */
export async function readRegisteredApprovedPrice(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{scopeRef:string}>,
 target:Omit<ReviewInput,'scopeRef'>,
 readEvidence:(request:ReviewInput,approval:NonNullable<ReviewSource['approval']>)=>Promise<ReviewEvidence>,
){
 const {approvalRef,version,purposeRef,rateOnly}=target
 const request=Object.freeze({scopeRef:host.scopeRef,approvalRef,version,purposeRef,rateOnly})
 if(![host.scopeRef,approvalRef,version,purposeRef].every(identity)||typeof rateOnly!=='boolean')
  throw Error('BID_APPROVED_PRICE_SCOPE')
 const original=await readOriginalRegistrationView(host,{model,viewName},{scopeRef:host.scopeRef,approvalRef,version})
 const {row}=original
 if(!row)return reviewApprovedPrice(request,{assertCurrent:original.assertCurrent})
 const assertOriginal=original.captureFields(fields)
 assertOriginal()
 const {approverRef,value,unit,detailRef,pricingVersion,rateOnly:originalRateOnly}=row
 if(!identity(approverRef)||typeof value!=='string'||!identity(unit)||(detailRef!==null&&!identity(detailRef))||
  (detailRef!==null?!identity(pricingVersion):pricingVersion!==null)||
  typeof originalRateOnly!=='boolean')throw Error('BID_APPROVED_PRICE_EVIDENCE')
 const approval=Object.freeze({scopeRef:request.scopeRef,approvalRef,version,
  approverRef,value,unit,detailRef,rateOnly:originalRateOnly,assertCurrent:assertOriginal})
 let evidence:ReviewEvidence|undefined
 try{
  evidence=await readEvidence(request,approval)
 }catch{
  // 准用证据缺失时只保留原批准，不推导本次准用。
  assertOriginal()
 }
 assertOriginal()
 let detailRead:Awaited<ReturnType<typeof readRegisteredApprovedPriceDetail>>|undefined
 if(identity(detailRef)&&identity(pricingVersion)){
  try{
   detailRead=await readRegisteredApprovedPriceDetail(host,{...approval,detailRef,pricingVersion})
  }catch{
   // 原批准仍可读时，仅将复算依据留待核实。
   assertOriginal()
  }
 }
 const assertCurrent=()=>{assertOriginal();evidence?.assertCurrent();detailRead?.assertCurrent()}
 const detail=detailRead?.state==='READ'?detailRead.detail:undefined
 const use=evidence?.use,findings=evidence?.findings
 return reviewApprovedPrice(request,{approval,assertCurrent,...(detail?{detail}:{}),...(use?{use}:{}),...(findings?{findings}:{})})
}
