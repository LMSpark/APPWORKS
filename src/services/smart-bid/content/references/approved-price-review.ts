/**
 * @module app:services/smart-bid/content/references/approved-price-review
 * 职责：动作29分别返回原商务批准、本次用途结论及其版本依据。
 */
import {snapshotReferenceIdentity as identity} from './snapshot-reference-values'

type Proof=Readonly<{assertCurrent:()=>void}>
type Target=Readonly<{scopeRef:string;approvalRef:string;version:string}>
type Price=Target&Proof&Readonly<{approverRef:string;value:string;unit:string;detailRef:string|null;rateOnly:boolean}>
type Detail=Target&Proof&Readonly<{detailRef:string;matchesApproval:boolean}>
type Use=Target&Proof&Readonly<{purposeRef:string;decisionRef:string;state:'USABLE'|'RESTRICTED'}>
type Finding=Target&Proof&Readonly<{findingRef:string;evidenceRef:string;targetRef:string;blocksUse:boolean}>
const targetFields=['scopeRef','approvalRef','version'] as const

/** 原单或标段要求分项核价时，必须查同版复算，保留原批准状态。 */
export function reviewApprovedPrice(request:Target&Readonly<{purposeRef:string;rateOnly:boolean}>,source:Proof&Readonly<{
 approval?:Price;detail?:Detail;use?:Use;findings?:readonly Finding[]
}>){
 const {approval,detail,use}=source
 const findings=[...(source.findings??[])]
 const assertCurrent=()=>{
  source.assertCurrent();approval?.assertCurrent();detail?.assertCurrent();use?.assertCurrent()
  for(const finding of findings)finding.assertCurrent()
 }
 assertCurrent()
 if(![...targetFields.map(field=>request[field]),request.purposeRef].every(identity)||
  [approval,detail,use].some(item=>item&&targetFields.some(field=>item[field]!==request[field]))||
  (use&&(use.purposeRef!==request.purposeRef||!identity(use.decisionRef)||!['USABLE','RESTRICTED'].includes(use.state))))
  throw Error('BID_APPROVED_PRICE_SCOPE')
 if(!approval)return Object.freeze({original:'PENDING_APPROVAL' as const,use:'PENDING' as const,assertCurrent})
 const {approverRef,value,unit,detailRef}=approval
 if(!identity(approverRef)||!identity(unit)||!/^[-+]?\d+(?:\.\d+)?$/u.test(value)||
  (detailRef!==null&&!identity(detailRef))||(detail&&(detail.detailRef!==detailRef||typeof detail.matchesApproval!=='boolean')))
  throw Error('BID_APPROVED_PRICE_EVIDENCE')
 const findingRefs=new Set<string>()
 const blockingFindingRefs:string[]=[]
 for(const finding of findings){
  if(targetFields.some(field=>finding[field]!==request[field])||
   (finding.targetRef!==approval.approvalRef&&finding.targetRef!==detailRef)||
   !identity(finding.findingRef)||!identity(finding.evidenceRef)||findingRefs.has(finding.findingRef)||
   typeof finding.blocksUse!=='boolean')throw Error('BID_APPROVED_PRICE_FINDING')
  findingRefs.add(finding.findingRef)
  if(finding.blocksUse)blockingFindingRefs.push(finding.findingRef)
 }
 const detailStatus=request.rateOnly&&approval.rateOnly&&detailRef===null?'NOT_REQUIRED':
  detail===undefined?'PENDING':detail.matchesApproval?'MATCHED':'DIFFERENCE'
 const detailsSatisfied=detailStatus==='NOT_REQUIRED'||detailStatus==='MATCHED'
 const useState=use?.state==='RESTRICTED'||blockingFindingRefs.length?'RESTRICTED':detailsSatisfied&&use?.state==='USABLE'?'USABLE':'PENDING'
 return Object.freeze({original:'APPROVED' as const,use:useState,scopeRef:request.scopeRef,purposeRef:request.purposeRef,
  approvalRef:approval.approvalRef,version:approval.version,approverRef,value,unit,detailRef,detailStatus,
  useDecisionRef:use?.decisionRef??null,findingRefs:Object.freeze([...findingRefs].sort()),
  blockingFindingRefs:Object.freeze(blockingFindingRefs.sort()),assertCurrent})
}
