/**
 * @module app:services/smart-bid/content/references/commercial/commitment-approval-coverage
 * 职责：动作30逐字段核同范围、同用途的批准依据。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'
import type {reviewApprovedPrice} from './approved-price-review'
import type {reviewPersonAppointment} from './person-appointment-review'

type Field=Readonly<{key:string;kind:'PRICE'|'PERSON'|'OTHER';value:string;unit:string|null}>
type Approval=Field&Readonly<{
 scopeRef:string;purposeRef:string;decisionRefs:readonly string[]
 usable:boolean;sourceVersion?:string;assertCurrent:()=>void
}>&(Readonly<{kind:'PERSON';projectId:string}>|Readonly<{kind:'PRICE'|'OTHER'}>)

/** 动作30保留动作29的原批准和本次用途决定，不重新判定准用。 */
export function priceCommitmentApproval(key:string,review:ReturnType<typeof reviewApprovedPrice>):Approval|undefined{
 review.assertCurrent()
 if(review.original!=='APPROVED')return undefined
 const {scopeRef,purposeRef,value,unit,approvalRef,useDecisionRef,assertCurrent,version}=review
 return Object.freeze({key,kind:'PRICE',scopeRef,purposeRef,value,unit,assertCurrent,sourceVersion:version,
  usable:review.use==='USABLE'&&useDecisionRef!==null,
  decisionRefs:Object.freeze(useDecisionRef?[approvalRef,useDecisionRef]:[approvalRef])})
}

/** 只有已核的人员拟任关系可作为承诺的人选依据。 */
export function personCommitmentApproval(key:string,review:ReturnType<typeof reviewPersonAppointment>):Approval|undefined{
 review.assertCurrent()
 if(review.state!=='VERIFIED')return undefined
 const {projectId,scopeRef,purposeRef,personId,appointmentDecisionRef,allocationDecisionRef,materialVersionRef,assertCurrent}=review
 return Object.freeze({key,kind:'PERSON',projectId,scopeRef,purposeRef,value:personId,unit:null,assertCurrent,
  sourceVersion:materialVersionRef,usable:true,
  decisionRefs:Object.freeze(allocationDecisionRef?[appointmentDecisionRef,allocationDecisionRef]:[appointmentDecisionRef])})
}

/** 金额和人选分别核据。有任一待核字段时整项承诺不进入登记。 */
export function checkCommitmentApprovalCoverage(input:Readonly<{
 projectId:string;scopeRef:string;purposeRef:string;fields:readonly Field[];approvals:readonly Approval[];assertCurrent:()=>void
}>){
 const {projectId,scopeRef,purposeRef,fields}=input
 const approvals=[...input.approvals]
 const assertCurrent=()=>{input.assertCurrent();for(const item of approvals)item.assertCurrent()}
 assertCurrent()
 const expected=new Map(fields.map(item=>[item.key,item]))
 if(!identity(projectId)||!identity(scopeRef)||!identity(purposeRef)||!fields.length||expected.size!==fields.length||
  fields.some(item=>!identity(item.key)||!['PRICE','PERSON','OTHER'].includes(item.kind)))throw Error('BID_COMMITMENT_SCOPE')
 const byKey=new Map<string,Approval>()
 for(const item of approvals){
  const field=expected.get(item.key)
  if(!field||byKey.has(item.key)||item.kind!==field.kind||item.scopeRef!==scopeRef||item.purposeRef!==purposeRef||
   (item.kind==='PERSON'&&item.projectId!==projectId)||typeof item.usable!=='boolean'||!item.decisionRefs.every(identity)||
   (item.sourceVersion!==undefined&&!identity(item.sourceVersion)))throw Error('BID_COMMITMENT_APPROVAL_SCOPE')
  byKey.set(item.key,item)
 }
 const results=Object.freeze(fields.map(field=>{
  const approval=byKey.get(field.key)
  const verified=approval?.usable===true&&approval.decisionRefs.length>0&&
   field.value.trim().length>0&&approval.value===field.value&&approval.unit===field.unit
  return Object.freeze({key:field.key,kind:field.kind,value:field.value,unit:field.unit,
   state:verified?'VERIFIED' as const:'PENDING' as const,
   decisionRefs:Object.freeze(verified?[...new Set(approval.decisionRefs)].sort():[]),
   ...(verified&&approval.sourceVersion!==undefined?{sourceVersion:approval.sourceVersion}:{})})
 }))
 assertCurrent()
 return Object.freeze({projectId,scopeRef,purposeRef,ready:results.every(result=>result.state==='VERIFIED'),fields:results,assertCurrent})
}

/** 从动作30已核结果生成待追加事实，版本分配和提交由正式写入入口负责。 */
export function prepareApprovedCommitmentFacts(
 coverage:ReturnType<typeof checkCommitmentApprovalCoverage>,
 source:Readonly<{
  projectId:string;scopeRef:string;sourceIds:readonly string[];claimId:string|null;assertCurrent:()=>void
 }>,
){
 const assertCurrent=()=>{coverage.assertCurrent();source.assertCurrent()}
 assertCurrent()
 if(!coverage.ready)throw Error('BID_COMMITMENT_FACT_PENDING')
 const {projectId,sourceIds,claimId}=source
 if(projectId!==coverage.projectId||source.scopeRef!==coverage.scopeRef||!sourceIds.length||!sourceIds.every(identity)||
  (claimId!==null&&!identity(claimId)))throw Error('BID_COMMITMENT_FACT_SOURCE')
 const frozenSources=Object.freeze([...new Set(sourceIds)].sort())
 const facts=Object.freeze(coverage.fields.map(field=>Object.freeze({
  projectId,scopeRef:coverage.scopeRef,key:field.key,kind:field.kind,value:field.value,unit:field.unit,
  claimId,sourceIds:frozenSources,decisionRefs:field.decisionRefs,
  dependencyRefs:Object.freeze(field.sourceVersion===undefined?[]:[field.sourceVersion]),
 })))
 return Object.freeze({facts,assertCurrent})
}
