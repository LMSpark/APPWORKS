/**
 * @module app:views/features/application/smart-bid/authoring/model/approved-price-reader
 * 职责：从命名视图读取原批准版，并将同次读取证明交动作29。
 */
import {reviewApprovedPrice} from '@/services/smart-bid/content/references/approved-price-review'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'

const model='ApprovedPrice',viewName='selectedApprovedPrice'
const keys=['scopeRef','approvalRef','version'] as const
const fields=['approverRef','value','unit','detailRef','rateOnly'] as const
type ReviewInput=Parameters<typeof reviewApprovedPrice>[0]
type ReviewEvidence=Omit<Parameters<typeof reviewApprovedPrice>[1],'approval'>

/** 查询指定业务范围及批准版，禁止默认使用最新批准。 */
export function approvedPriceReadView(primaryKey:string){
 return originalRegistrationView(primaryKey,keys,fields)
}

/** scopeRef 由已核编制范围提供；用途和复算从各自责任域读取。 */
export async function readRegisteredApprovedPrice(
 host:Parameters<typeof readOriginalRegistrationView>[0]&Readonly<{scopeRef:string}>,
 target:Omit<ReviewInput,'scopeRef'>,
 readEvidence:(request:ReviewInput,assertCurrent:()=>void)=>Promise<ReviewEvidence>,
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
 const {approverRef,value,unit,detailRef,rateOnly:originalRateOnly}=row
 if(!identity(approverRef)||typeof value!=='string'||!identity(unit)||(detailRef!==null&&!identity(detailRef))||
  typeof originalRateOnly!=='boolean')throw Error('BID_APPROVED_PRICE_EVIDENCE')
 const evidence=await readEvidence(request,assertOriginal)
 assertOriginal()
 return reviewApprovedPrice(request,{...evidence,approval:{scopeRef:host.scopeRef,approvalRef,version,
  approverRef,value,unit,detailRef,rateOnly:originalRateOnly,assertCurrent:assertOriginal}})
}
