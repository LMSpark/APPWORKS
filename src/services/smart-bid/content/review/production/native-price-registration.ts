/**
 * @module app:services/smart-bid/content/review/production/native-price-registration
 * 职责：动作41按商务原导入及批准明细准备原生计价件登记。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import {hashContentBytes} from '../../revision-snapshot-hash'
import {matchApprovedPriceDetail} from '../../references/commercial/price-sheet-recalculation'

type NativeImport=Readonly<{
 projectId:string;scopeRef:string;pricingVersion:string;importRef:string;resourceVersionId:string
 fileHash:string;assertCurrent:()=>void
}>

/** 企业获准件以原导入、同计价版复算及批准为依据。 */
export async function prepareNativePriceRegistration(source:NativeImport,approval:Parameters<typeof matchApprovedPriceDetail>[0],
 calculation:Parameters<typeof matchApprovedPriceDetail>[1],open:(input:Readonly<{
 projectId:string;resourceVersionId:string
 }>)=>Promise<Readonly<{projectId:string;resourceVersionId:string;bytes:ArrayBuffer;assertCurrent:()=>void}>>){
 const {projectId,scopeRef,pricingVersion,importRef,resourceVersionId,fileHash}=source
 const origin={projectId,scopeRef,pricingVersion,importRef,resourceVersionId,fileHash}
 const assertOrigin=()=>{
  source.assertCurrent()
  if(Object.entries(origin).some(([key,value])=>source[key as keyof typeof origin]!==value)||
   approval.scopeRef!==scopeRef||approval.pricingVersion!==pricingVersion)
   throw Error('BID_NATIVE_PRICE_REGISTRATION_SCOPE')
 }
 assertOrigin()
 if(![projectId,scopeRef,pricingVersion,importRef,resourceVersionId].every(identity)||!/^[a-f0-9]{64}$/u.test(fileHash))
  throw Error('BID_NATIVE_PRICE_REGISTRATION_SCOPE')
 const approved=matchApprovedPriceDetail(approval,calculation)
 if(!approved.matchesApproval)throw Error('BID_NATIVE_PRICE_REGISTRATION_APPROVAL')
 const resource=await open(Object.freeze({projectId,resourceVersionId}))
 const assertCurrent=()=>{
  assertOrigin()
  approved.assertCurrent()
  resource.assertCurrent()
  if(resource.projectId!==projectId||resource.resourceVersionId!==resourceVersionId)
   throw Error('BID_NATIVE_PRICE_REGISTRATION_RESOURCE')
 }
 assertCurrent()
 if(resource.bytes.byteLength===0||await hashContentBytes(resource.bytes)!==fileHash)
  throw Error('BID_NATIVE_PRICE_REGISTRATION_HASH')
 assertCurrent()
 return Object.freeze({record:Object.freeze({...origin,approvalRef:approved.approvalRef,
  approvalVersion:approved.version,detailRef:approved.detailRef}),assertCurrent})
}
