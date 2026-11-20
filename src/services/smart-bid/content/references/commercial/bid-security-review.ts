/**
 * @module app:services/smart-bid/content/references/commercial/bid-security-review
 * 职责：动作26按本标担保条款及截至所问时点的凭据核办理进度。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'

type Proof=Readonly<{assertCurrent:()=>void}>
type Scope=Readonly<{scopeRef:string;requirementVersion:string;liablePartyRef:string}>
type Milestone='ISSUED'|'RECEIVED'|'LINKED'|'HANDED_OVER'
type Money=Readonly<{minorUnits:string;currency:string}>
type Requirement=Scope&Proof&Readonly<{clauseRef:string}>&(
 Readonly<{kind:'EXEMPT'}>|
 Readonly<{kind:'CONDITIONAL_EXEMPT';conditionRefs:readonly string[]}>|
 Readonly<{kind:'REQUIRED';methodRef:string;milestones:readonly Milestone[];deadline:number;amount?:Money}>
)
type Receipt=Scope&Proof&Readonly<{receiptRef:string;effectiveAt:number;knownAt:number}>&(
 Readonly<{kind:'EXEMPTION_PROOF';conditionRef:string}>|
 Readonly<{kind:Milestone|'REQUESTED';methodRef:string;amount?:Money}>
)

function validAmount(amount:Money){
 return identity(amount.currency)&&/^\d+$/u.test(amount.minorUnits)
}

/** 仅从同标、同要求版、同承担方的原凭据确认适用阶段。 */
export function reviewBidSecurity(requirement:Requirement,input:Readonly<{asOf:number;receipts:readonly Receipt[]}>){
 const {scopeRef,requirementVersion,liablePartyRef,clauseRef}=requirement
 const receipts=[...input.receipts]
 const assertCurrent=()=>{requirement.assertCurrent();for(const receipt of receipts)receipt.assertCurrent()}
 assertCurrent()
 if(![scopeRef,requirementVersion,liablePartyRef,clauseRef].every(identity)||!Number.isSafeInteger(input.asOf))
  throw Error('BID_SECURITY_SCOPE')
 const receiptRefs=new Set<string>()
 for(const item of receipts){
  if(item.scopeRef!==scopeRef||item.requirementVersion!==requirementVersion||item.liablePartyRef!==liablePartyRef||
   !identity(item.receiptRef)||receiptRefs.has(item.receiptRef)||!Number.isSafeInteger(item.effectiveAt)||
   !Number.isSafeInteger(item.knownAt))throw Error('BID_SECURITY_RECEIPT_SCOPE')
  receiptRefs.add(item.receiptRef)
 }
 const available=receipts.filter(item=>item.effectiveAt<=input.asOf&&item.knownAt<=input.asOf)
 const proofRefs:string[]=[]
 let requested=false
 const required=requirement.kind==='EXEMPT'?[]:requirement.kind==='CONDITIONAL_EXEMPT'?
  requirement.conditionRefs:requirement.milestones
 if(new Set(required).size!==required.length||!required.every(identity)||
  (requirement.kind!=='EXEMPT'&&!required.length)||
  (requirement.kind==='REQUIRED'&&(!identity(requirement.methodRef)||!Number.isSafeInteger(requirement.deadline)||
   (requirement.amount!==undefined&&!validAmount(requirement.amount)))))throw Error('BID_SECURITY_REQUIREMENT')
 const verified=new Set<string>()
 for(const item of available){
  if(requirement.kind==='CONDITIONAL_EXEMPT'&&item.kind==='EXEMPTION_PROOF'&&required.includes(item.conditionRef)){
   verified.add(item.conditionRef)
   proofRefs.push(item.receiptRef)
  }
  if(requirement.kind==='REQUIRED'&&item.kind!=='EXEMPTION_PROOF'&&item.methodRef===requirement.methodRef){
   if(item.kind==='REQUESTED')requested=true
   else if(requirement.milestones.includes(item.kind)&&item.effectiveAt<=requirement.deadline){
    const expected=requirement.amount
    if(expected&&(item.kind==='ISSUED'||item.kind==='RECEIVED')&&
     (!item.amount||!validAmount(item.amount)||item.amount.currency!==expected.currency||
      BigInt(item.amount.minorUnits)<BigInt(expected.minorUnits)))continue
    verified.add(item.kind)
    proofRefs.push(item.receiptRef)
   }
  }
 }
 const pending=Object.freeze(required.filter(item=>!verified.has(item)))
 const state=pending.length?'PENDING':requirement.kind==='REQUIRED'?'VERIFIED':'EXEMPT'
 return Object.freeze({state,scopeRef,requirementVersion,liablePartyRef,clauseRef,requested,pending,
  proofRefs:Object.freeze(proofRefs.sort()),assertCurrent})
}

/** 交付冻结仅在本批要求担保时调用；固定原条款及全部已核凭据引用。 */
export function readBidSecurityFreezeEvidence(scope:Scope,result:ReturnType<typeof reviewBidSecurity>){
 result.assertCurrent()
 if(result.scopeRef!==scope.scopeRef||result.requirementVersion!==scope.requirementVersion||
  result.liablePartyRef!==scope.liablePartyRef)throw Error('BID_SECURITY_FREEZE_SCOPE')
 if(result.state==='PENDING')return Object.freeze({ready:false as const,pending:result.pending,assertCurrent:result.assertCurrent})
 return Object.freeze({ready:true as const,checkedStateRefs:Object.freeze([...new Set([result.clauseRef,...result.proofRefs])]),
  assertCurrent:result.assertCurrent})
}
