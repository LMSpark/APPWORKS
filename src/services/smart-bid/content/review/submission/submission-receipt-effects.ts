/**
 * @module app:services/smart-bid/content/review/submission/submission-receipt-effects
 * 职责：将第53项已配对事件及适用规则判定交给第54项截止对账。
 */
import {snapshotReferenceIdentity as identity} from '../../references/snapshot-reference-values'
import type {pairOriginalChannelReceipt} from './channel-receipt-pairing'
import {reconcileSubmissionDeadline} from '../submission-reconciliation'

type Receipt=ReturnType<typeof pairOriginalChannelReceipt>
type DeadlineInput=Parameters<typeof reconcileSubmissionDeadline>[0]
type Effect=DeadlineInput['effects'][number]
type Decision=Omit<Effect,'knownAt'|'kind'>&Readonly<{
 knownAt:string;ruleRef:string;assertCurrent:()=>void
}>&(Readonly<{kind:'RECEIVED'|'WITHDRAWN'}>|Readonly<{kind:'REPLACED';priorAttemptRef:string}>)
const time=(value:string)=>{
 const instant=Date.parse(value)
 if(!Number.isFinite(instant)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('SUBMISSION_RECONCILIATION_TIME')
 return instant
}

/** 回执配对与效力判定同时具备后入账，补证按实际获知时点重核。 */
export function reconcileSubmissionReceiptEffects(input:Omit<DeadlineInput,'effects'>,source:Readonly<{
 scope:Pick<Receipt,'projectId'|'lotId'|'subjectId'|'channelId'>
 receipts:readonly Receipt[];decisions:readonly Decision[];assertCurrent:()=>void
}>){
 const decisions=[...source.decisions]
 const assertCurrent=()=>{source.assertCurrent();for(const decision of decisions)decision.assertCurrent()}
 assertCurrent()
 const byEvent=new Map(source.receipts.map(receipt=>[receipt.eventRef,receipt]))
 const error='SUBMISSION_RECEIPT_EFFECT_SCOPE'
 const keys=['projectId','lotId','subjectId','channelId'] as const
 if(byEvent.size!==source.receipts.length||keys.some(key=>!identity(source.scope[key])||
  source.receipts.some(receipt=>receipt[key]!==source.scope[key])))throw Error(error)
 const adjudicated=decisions.map(decision=>{
  const receipt=byEvent.get(decision.eventRef)
  const kind=decision.kind==='WITHDRAWN'?'WITHDRAWAL_CONFIRMED':'RECEIVED'
  if(receipt?.state!=='PAIRED'||receipt.kind!==kind||
   (decision.kind==='WITHDRAWN'?receipt.withdrawalTargetRef:receipt.attemptRef)!==decision.attemptRef||
   !identity(decision.ruleRef))throw Error(error)
  const earliest=receipt.sources[0]
  if(!earliest)throw Error(error)
  const eventAt=time(receipt.eventAt)
  if(receipt.sources.some(item=>time(item.knownAt)<eventAt))throw Error('SUBMISSION_RECONCILIATION_TIME')
  const first=receipt.sources.reduce((earlier,item)=>time(item.knownAt)<time(earlier)?item.knownAt:earlier,earliest.knownAt)
  const knownAt=time(first)>time(decision.knownAt)?first:decision.knownAt
  const base={eventRef:decision.eventRef,obligationId:decision.obligationId,attemptRef:decision.attemptRef,
   effectiveAt:decision.effectiveAt,knownAt}
  const effect:Effect=decision.kind==='REPLACED'?{...base,kind:decision.kind,priorAttemptRef:decision.priorAttemptRef}:{...base,kind:decision.kind}
  return {effect,receipt,ruleRef:decision.ruleRef}
 })
 const result=reconcileSubmissionDeadline({...input,effects:adjudicated.map(item=>item.effect)})
 const known=time(result.knownAt),cutoff=time(result.cutoffAt)
 const evidence=adjudicated.filter(({effect})=>time(effect.knownAt)<=known&&time(effect.effectiveAt)<=cutoff)
  .map(({effect,receipt,ruleRef})=>Object.freeze({...effect,ruleRef,receiptEventAt:receipt.eventAt,
   receiptAttemptRef:receipt.attemptRef,
   sources:Object.freeze(receipt.sources.filter(item=>time(item.knownAt)<=known))}))
 assertCurrent()
 return Object.freeze({...result,scope:Object.freeze({...source.scope}),evidence:Object.freeze(evidence),assertCurrent})
}
